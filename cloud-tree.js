(function exposeCloudTree(root, factory) {
  const dependencies = typeof module === "object" && module.exports
    ? {treeOrder: require("./core/tree-order.js"), sampleIdentity: require("./core/sample-identity.js"), supportScale: require("./core/support-scale.js"), input: require("./core/tree-input.js"), geneRooting: require("./core/gene-rooting.js"), rooting: require("./tree-rooting.js")}
    : {treeOrder: root.PhyloRenderTreeOrder, sampleIdentity: root.PhyloRenderSampleIdentity, supportScale: root.PhyloRenderSupportScale, input: root.PhyloRenderInput, geneRooting: root.PhyloRenderGeneRooting, rooting: root.PhyloRenderRooting};
  const api = factory(dependencies);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhyloRenderCloud = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCloudTree(dependencies) {
  "use strict";

  const {treeOrder, sampleIdentity, supportScale, input} = dependencies;
  if (!treeOrder || !sampleIdentity || !supportScale || !input) throw new Error("Missing shared tree/sample/support/input policy");

  const tips = treeOrder.tipNodes;
  const geneRooting = dependencies.geneRooting.create({identity: sampleIdentity, input, rooting: dependencies.rooting});

  function sampleProfile(root) {
    const profile = sampleIdentity.tipProfile(root, "exact");
    const duplicates = profile.duplicates.map(item => item.key || "(empty label)");
    if (profile.entries.some(item => !item.key) && !duplicates.includes("(empty label)")) duplicates.push("(empty label)");
    return {names: profile.names, set: profile.set, duplicates};
  }

  // View-only ladderization: sort sibling traversal, never mutate the input
  // children or clone nodes (dating maps and PhyParts matches use those nodes).
  function orderedTips(root, direction = "file") {
    return treeOrder.orderedTips(root, direction);
  }

  function compareSamples(speciesRoot, geneRoot) {
    const species = sampleProfile(speciesRoot);
    const gene = sampleProfile(geneRoot);
    const missing = species.names.filter(name => !gene.set.has(name));
    const extra = gene.names.filter(name => !species.set.has(name));
    return {
      accepted: !species.duplicates.length && !gene.duplicates.length && !missing.length && !extra.length,
      speciesCount: species.names.length,
      geneCount: gene.names.length,
      speciesDuplicates: species.duplicates,
      geneDuplicates: gene.duplicates,
      missing,
      extra,
    };
  }

  const inferredOutgroup = geneRooting.inferredOutgroup;

  // Eligibility and gene-only rooting share one pure policy in both entry points.
  function phyPartsEligibility(speciesRoot, geneRoot, options = {}) {
    return geneRooting.eligibility(speciesRoot, geneRoot, options,
      compareSamples(speciesRoot, geneRoot));
  }

  function splitGeneTrees(text) {
    const result = [];
    let start = 0, quoted = false, comments = 0;
    const source = String(text).replace(/^\uFEFF/, "").replace(/^\s*#[^\n]*$/gm, "");
    if (/^\s*#nexus\b/i.test(text)) throw new Error("Gene-tree collections must be semicolon-delimited Newick trees; export NEXUS multi-tree files to Newick first so TRANSLATE mappings are preserved");
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === "'" && !comments) {
        if (quoted && source[i + 1] === "'") { i++; continue; }
        quoted = !quoted;
      }
      if (!quoted) {
        if (char === "[") comments++;
        if (char === "]") comments--;
        if (char === ";" && !comments) {
          const tree = source.slice(start, i + 1).trim();
          if (tree) result.push(tree);
          start = i + 1;
        }
      }
    }
    if (source.slice(start).trim()) result.push(source.slice(start).trim());
    return result;
  }

  function phyPartsInput(root, names, { field = "last", scale = "auto", getSupport = node => node.support ?? node.label } = {}) {
    const resolvedScale = phyPartsSupportScale([root], {field,scale,getSupport});
    const ids = new Map(names.map((name, index) => [name, `T${String(index).padStart(5, "0")}`]));
    function write(node) {
      if (!(node.children || []).length) {
        const id = ids.get(String(node.label || "").trim());
        if (!id) throw new Error("Concordance input tree contains a taxon absent from the species tree");
        return id;
      }
      let value = String(getSupport(node) ?? "").trim();
      const fields = value.split("/");
      value = fields[field === "first" ? 0 : fields.length - 1];
      let support = Number(value);
      if (!value || !Number.isFinite(support)) support = null;
      if (support !== null) {
        if (resolvedScale === "percent") support /= 100;
        if (support < 0 || support > 1) throw new Error(`Branch support value ${value} falls outside the selected scale`);
      }
      const label = support === null ? "" : supportScale.decimal(support);
      return `(${node.children.map(write).join(",")})${label}`;
    }
    return `${write(root)};`;
  }

  function phyPartsSupportScale(roots, { field = "last", scale = "auto", getSupport = node => node.support ?? node.label } = {}) {
    const evidence = scale === "auto" ? roots.reduce((result, tree) =>
      supportScale.merge(result, supportScale.collect(tree, {field,getSupport})), supportScale.empty()) : supportScale.empty();
    return supportScale.resolve(evidence, scale);
  }

  // Newick stores topology and lengths, not a trustworthy inference method.
  // Require an explicit method declaration, then reject recognizable
  // non-ML provenance and non-informative terminal lengths independently.
  function validateMlInput(root, { method = "", filename = "", rawText = "" } = {}) {
    const name = String(filename);
    const text = String(rawText);
    const coalescentName = /(?:^|[^a-z])(?:astral|aster)(?:$|[^a-z])/i.test(name);
    const datedOrBayesianName = /(?:^|[^a-z])(?:starbeast|beast|mrbayes|treepl|mcmctree|r8s)(?:$|[^a-z])/i.test(name);
    // ASTRAL may supply only the fixed topology while IQ-TREE subsequently
    // re-estimates every edge in substitutions/site. The name must explicitly
    // distinguish that derivative from a raw coalescent-length ASTRAL tree.
    const fixedTopologyMlLengths = coalescentName && /(?:ML[_\s-]*(?:branch(?:es)?|lengths?)|ML\u679d\u957f|\u6700\u5927\u4f3c\u7136\u679d\u957f)/i.test(name);
    const timeAnnotation = /\[\s*&[^\]]*(?:height(?:_|=)|_?95%_?HPD|posterior\s*=)/i.test(text);
    const coalescentSupportAnnotation = /\[\s*&[^\]]*pp[123]\s*=/i.test(text);
    if (datedOrBayesianName || timeAnnotation) throw new Error("Detected Bayesian/chronogram provenance or node-age annotations; ML branch-length mode accepts only substitutions-per-site ML trees (select a time-calibrated species tree mode instead)");
    if ((coalescentName || coalescentSupportAnnotation) && !fixedTopologyMlLengths) {
      throw new Error("Detected ASTRAL/ASTER coalescent species-tree provenance; re-estimate substitutions-per-site ML branch lengths on this fixed topology rather than using coalescent units directly");
    }
    if (method !== "ml") {
      throw new Error(method ? "Selected tree is not declared as a maximum-likelihood tree; cloudogram alignment aborted" : "Confirm that branch lengths are ML substitutions per site; raw Newick syntax alone cannot prove branch-length units");
    }
    const leaves = tips(root);
    if (leaves.length < 2) throw new Error("Tree must contain at least two terminal tips");
    (function checkEdges(node, isRoot = false) {
      if (!isRoot && (node.length === null || node.length === undefined || node.length === "" ||
          !Number.isFinite(Number(node.length)) || Number(node.length) < 0))
        throw Object.assign(new Error(`Missing or invalid ML branch length at ${node.label || "internal node"}; missing lengths are never silently replaced with zero`), { code: "TREE_MISSING_BRANCH_LENGTH" });
      (node.children || []).forEach(child => checkEdges(child));
    })(root, true);
    const missing = leaves.filter(leaf => leaf.length === null || leaf.length === undefined || leaf.length === "").length;
    const invalid = leaves.filter(leaf => leaf.length !== null && leaf.length !== undefined && leaf.length !== "" && (!Number.isFinite(Number(leaf.length)) || Number(leaf.length) < 0)).length;
    const zero = leaves.filter(leaf => leaf.length !== null && leaf.length !== undefined && Number(leaf.length) === 0).length;
    if (missing || invalid) throw new Error(`Incomplete or invalid terminal branch lengths (${missing} missing, ${invalid} invalid); supply a tree retaining ML substitutions-per-site lengths`);
    if (zero === leaves.length || (leaves.length >= 5 && zero / leaves.length >= .8)) {
      throw new Error(`${zero}/${leaves.length} terminal branches have length 0, typical of ASTRAL coalescent-unit trees lacking terminal branch lengths; supply ML substitutions-per-site branch lengths instead`);
    }
    return { terminalCount: leaves.length, zeroTerminalCount: zero };
  }

  // Every overlaid tree uses the species-tree tip rows. This midpoint layout
  // is the deterministic starting point for the local crossing minimizer.
  function alignedRows(root, orderedTipNames, top = 64, step = 24) {
    const reference = new Map(orderedTipNames.map((name, index) => [name, top + index * step]));
    if (reference.size !== orderedTipNames.length) throw new Error("Species-tree tip labels must be unique");
    const profile = sampleProfile(root);
    if (profile.duplicates.length || profile.names.length !== reference.size ||
        profile.names.some(name => !reference.has(name))) throw new Error("Overlaid gene tree does not match the species-tree taxon set");
    const positions = new Map();
    function visit(node) {
      const y = (node.children || []).length
        ? node.children.reduce((sum, child) => sum + visit(child), 0) / node.children.length
        : reference.get(String(node.label || "").trim());
      positions.set(node, y);
      return y;
    }
    visit(root);
    return positions;
  }

  function optimizeAlignedRows(root, orderedTipNames, ages, rootAge, top = 64, step = 24, anchors = null) {
    const steps = optimizeAlignedRowsSteps(root, orderedTipNames, ages, rootAge, top, step, anchors);
    let next;
    do { next = steps.next(); } while (!next.done);
    return next.value;
  }

  function* optimizeAlignedRowsSteps(root, orderedTipNames, ages, rootAge, top = 64, step = 24, anchors = null) {
    const ys = alignedRows(root, orderedTipNames, top, step);
    const fixedRows = anchors === null ? new Map() : new Map(anchors);
    const invalidAnchor = () => Object.assign(new Error("Invalid row anchor for shared clade; rendering aborted"), {code: "CLOUD_INVALID_ROW_ANCHOR"});
    for (const [node, row] of fixedRows) {
      if (!ys.has(node) || !node.children?.length || !Number.isFinite(row)) throw invalidAnchor();
    }
    const nodes = [], edges = [];
    (function collect(node) {
      if (!node.children.length) return [ys.get(node), ys.get(node)];
      const spans = node.children.map(child => { edges.push([node, child]); return collect(child); });
      const low = Math.min(...spans.map(span => span[0])), high = Math.max(...spans.map(span => span[1]));
      if (fixedRows.has(node)) {
        const row = fixedRows.get(node);
        if (row < low || row > high) throw invalidAnchor();
        ys.set(node, row);
      }
      nodes.push(node);
      return [low, high];
    })(root);
    const xOf = node => 72 + (rootAge - ages.get(node)) / rootAge * 1000;
    // A time-calibrated edge is one straight segment. A horizontal tail after
    // the diagonal would conceal which part of the edge its time represents.
    const edgeSegment = (parent, child) => [xOf(parent), ys.get(parent), xOf(child), ys.get(child)];
    const strictCross = (a, b) => {
      const ax = a[2] - a[0], ay = a[3] - a[1];
      const bx = b[2] - b[0], by = b[3] - b[1];
      const den = ax * by - ay * bx;
      if (Math.abs(den) < 1e-7) return false;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = (dx * by - dy * bx) / den;
      const u = (dx * ay - dy * ax) / den;
      return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4;
    };
    const pointDistance = (point, segment) => {
      const dx = segment[2] - segment[0], dy = segment[3] - segment[1];
      const denominator = dx * dx + dy * dy;
      const t = denominator ? Math.max(0, Math.min(1,
        ((point[0] - segment[0]) * dx + (point[1] - segment[1]) * dy) / denominator)) : 0;
      return Math.hypot(point[0] - segment[0] - t * dx, point[1] - segment[1] - t * dy);
    };
    const passes = 2;
    for (let pass = 0; pass < passes; pass++) {
      for (const node of nodes) {
        if (fixedRows.has(node)) continue;
        const childRows = node.children.map(child => ys.get(child));
        const low = Math.min(...childRows), high = Math.max(...childRows);
        if (high - low < 3) continue;
        const incident = edges.filter(([parent, child]) => parent === node || child === node);
        const other = edges.filter(([parent, child]) => parent !== node && child !== node)
          .map(([parent, child]) => edgeSegment(parent, child));
        const nearbyNodes = nodes.filter(otherNode => otherNode !== node && !incident.some(([parent, child]) =>
          otherNode === parent || otherNode === child));
        const baseline = childRows.reduce((sum, row) => sum + row, 0) / childRows.length;
        const initial = ys.get(node);
        // A long singleton branch may need its junction much closer to one
        // child than the 20–80% middle band; search almost the full span.
        const candidates = [initial, baseline,
          ...[.02, .05, .1, .15, .2, .3, .4, .5, .6, .7, .8, .85, .9, .95, .98]
            .map(fraction => low + (high - low) * fraction)];
        let best = initial, bestScore = Infinity;
        for (const candidate of candidates) {
          yield;
          ys.set(node, candidate);
          const changed = incident.map(([parent, child]) => edgeSegment(parent, child));
          let crossings = 0;
          for (const segment of changed) for (const fixed of other) if (strictCross(segment, fixed)) crossings++;
          let closePasses = 0;
          for (const fixed of other) {
            const distance = pointDistance([xOf(node), candidate], fixed);
            if (distance < 6) closePasses += (6 - distance) / 6;
          }
          for (const otherNode of nearbyNodes) {
            const point = [xOf(otherNode), ys.get(otherNode)];
            for (const segment of changed) {
              const distance = pointDistance(point, segment);
              if (distance < 6) closePasses += (6 - distance) / 6;
            }
          }
          // Compare these priorities lexicographically: never introduce an
          // actual crossing merely to gain clearance or visual centering.
          const score = crossings * 1e6 + closePasses * 10 + Math.abs(candidate - baseline) / step;
          if (score < bestScore - 1e-8) { bestScore = score; best = candidate; }
        }
        ys.set(node, best);
      }
    }
    return ys;
  }

  function effectiveGeneOpacity(opacity, geneTreeCount) {
    const base = Number.isFinite(Number(opacity)) ? Math.max(0.01, Math.min(1, Number(opacity))) : 0.18;
    const count = Number.isFinite(Number(geneTreeCount)) && Number(geneTreeCount) > 0 ? Number(geneTreeCount) : 1;
    const scale = Math.max(0.38, Math.min(2.4, Math.pow(80 / count, 0.48)));
    return Number(Math.max(0.02, Math.min(0.85, base * scale)).toFixed(6));
  }

  // Size is a display preference based only on relative node age, never on
  // descendant counts or the pie's conflict proportions. Unit changes cancel
  // in age/rootAge. Missing ages use uniform sizes rather than inventing dates.
  function pieTargetRadius(age, rootAge, requestedRadius) {
    const minimum = 8;
    const requested = Number(requestedRadius);
    const maximum = Number.isFinite(requested) ? Math.max(minimum, requested) : minimum;
    if (!Number.isFinite(age) || age < 0 || !Number.isFinite(rootAge) || rootAge <= 0) return maximum;
    const relativeAge = Math.max(0, Math.min(1, age / rootAge));
    // Scale the youngest target too, so increasing the slider enlarges the
    // whole plot rather than only its ancient nodes. Retain the readable floor.
    const youngest = Math.max(minimum, maximum * 0.55);
    return youngest + (maximum - youngest) * relativeAge;
  }

  // Never turn a node's statistics into an unreadable dot. If its true node
  // lacks room, keep an 8 px minimum radius and move the pie a short distance
  // with a leader back to that node; the biological node itself never moves.
  function layoutPiePlacements(items, branches, requestedRadius, labelBoxes = [], rootAge = null) {
    const steps = layoutPiePlacementSteps(items, branches, requestedRadius, labelBoxes, rootAge);
    let result;
    do { result = steps.next(); } while (!result.done);
    return result.value;
  }

  function* layoutPiePlacementSteps(items, branches, requestedRadius, labelBoxes = [], rootAge = null) {
    const minRadius = 8;
    const pieGap = 2, branchGap = 2, labelGap = 3;
    const targets = new Map(items.map(item => [item.node, pieTargetRadius(item.age, rootAge, requestedRadius)]));
    const distanceToSegment = (x, y, edge) => {
      const dx = edge.x2 - edge.x1, dy = edge.y2 - edge.y1;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1,
        ((x - edge.x1) * dx + (y - edge.y1) * dy) / lengthSquared)) : 0;
      return Math.hypot(x - edge.x1 - t * dx, y - edge.y1 - t * dy);
    };
    const distanceToBox = (x, y, box) => Math.hypot(
      Math.max(box.x - x, 0, x - box.x - box.width),
      Math.max(box.y - y, 0, y - box.y - box.height),
    );
    const placements = new Map();
    // Place older, larger target pies first. Neither descendant counts nor
    // conflict fractions affect size or priority.
    const priority = [...items].sort((a, b) => targets.get(b.node) - targets.get(a.node));
    for (const item of priority) {
      yield;
      const target = targets.get(item.node);
      const nearbyBranches = branches.filter(branch => branch.parent !== item.node && branch.child !== item.node &&
        distanceToSegment(item.x, item.y, branch) <= target + 136);
      const nearbyLabels = labelBoxes.filter(box => distanceToBox(item.x, item.y, box) <= target + 136);
      const radii = [target];
      for (let radius = Math.floor(target); radius > minRadius; radius--) radii.push(radius);
      if (radii.at(-1) !== minRadius) radii.push(minRadius);
      let best = null, bestScore = Infinity;
      const evaluate = (radius, dx, dy) => {
        const x = item.x + dx, y = item.y + dy;
        if (x - radius < 4 || y - radius < 4) return;
        if (nearbyLabels.some(box => distanceToBox(x, y, box) < radius + labelGap)) return;
        for (const other of placements.values()) {
          if (Math.hypot(x - other.x, y - other.y) < radius + other.radius + pieGap) return;
        }
        let branchPenalty = 0;
        for (const branch of nearbyBranches) {
          const intrusion = radius + branchGap - distanceToSegment(x, y, branch);
          if (intrusion > 0) branchPenalty += 16 * intrusion * intrusion;
        }
        const score = 24 * (target - radius) ** 2 + 0.35 * (dx * dx + dy * dy) +
          (dx || dy ? 6 : 0) + branchPenalty;
        if (score < bestScore - 1e-8 || (Math.abs(score - bestScore) <= 1e-8 && radius > best.radius)) {
          bestScore = score; best = { x, y, radius, anchorX: item.x, anchorY: item.y };
        }
      };
      // The anchored candidate wins whenever it is clear. Search small local
      // offsets before considering a smaller pie, including the free space to
      // the left of a rectangular tree's many short terminal branches.
      for (const radius of radii) {
        evaluate(radius, 0, 0);
        yield;
        for (const distance of [8, 16, 24, 32, 48, 64]) {
          for (const [ux, uy] of [[-1, 0], [0, -1], [0, 1], [1, 0],
            [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const diagonal = ux && uy ? Math.SQRT1_2 : 1;
            evaluate(radius, ux * distance * diagonal, uy * distance * diagonal);
            yield;
          }
        }
      }
      // Exceptionally dense nodes may require a slightly longer callout;
      // retain the legible minimum rather than silently drawing a dot.
      if (!best) for (const distance of [80, 96, 128]) {
        for (const [ux, uy] of [[-1, 0], [0, -1], [0, 1], [1, 0],
          [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const diagonal = ux && uy ? Math.SQRT1_2 : 1;
          evaluate(minRadius, ux * distance * diagonal, uy * distance * diagonal);
          yield;
        }
      }
      placements.set(item.node, best || { x: item.x, y: item.y, radius: minRadius,
        anchorX: item.x, anchorY: item.y });
    }
    return placements;
  }

  function layoutPieRadii(items, branches, requestedRadius, labelBoxes = [], rootAge = null) {
    const placements = layoutPiePlacements(items, branches, requestedRadius, labelBoxes, rootAge);
    return new Map([...placements].map(([node, placement]) => [node, placement.radius]));
  }

  function relativeAges(root, crownAge = 10) {
    if (!Number.isFinite(crownAge) || crownAge <= 0) throw new Error("Display root age must be a positive number");
    let edges = 0, positive = 0, missing = 0;
    (function inspect(node, isRoot) {
      if (!isRoot) {
        edges++;
        if (node.length === null || node.length === undefined || node.length === "") missing++;
        else {
          const length = Number(node.length);
          if (!Number.isFinite(length) || length < 0) throw new Error("Tree contains invalid or negative branch lengths and cannot be aligned on a relative time axis");
          if (length > 0) positive++;
        }
      }
      (node.children || []).forEach(child => inspect(child, false));
    })(root, true);
    if (!edges) throw new Error("At least two terminal tips are required to render a cloudogram");
    if (positive && missing) throw new Error("Some branch lengths are missing; supply complete branch lengths before computing uniform display ages");
    const equalSteps = !positive;
    const heights = new Map();
    function height(node) {
      if (!(node.children || []).length) { heights.set(node, 0); return 0; }
      const result = Math.max(...node.children.map(child =>
        height(child) + (equalSteps ? 1 : Number(child.length))));
      heights.set(node, result);
      return result;
    }
    const rootHeight = height(root);
    if (!(rootHeight > 0)) throw new Error("Unable to compute a positive root height from the tree");
    const ages = new Map([...heights].map(([node, value]) => [node, crownAge * value / rootHeight]));
    return { ages, rootAge: crownAge, originalRootHeight: rootHeight, equalSteps,
      method: equalSteps ? "topological-step-display" : "longest-descendant-path-display" };
  }

  function treePLInput(root, orderedTipNames) {
    const names = orderedTipNames || sampleProfile(root).names;
    const nameToId = new Map(names.map((name, index) => [name, `T${String(index + 1).padStart(5, "0")}`]));
    if (nameToId.size !== names.length || (root.children || []).length !== 2) throw new Error("treePL requires unique tip labels and a bifurcating root");
    function firstTip(node) { return (node.children || []).length ? firstTip(node.children[0]) : node; }
    function write(node, isRoot) {
      const children = node.children || [];
      const part = children.length
        ? `(${children.map(child => write(child, false)).join(",")})`
        : nameToId.get(String(node.label || "").trim());
      if (!part) throw new Error("treePL input tree contains a taxon absent from the species tree");
      if (isRoot) return `${part};`;
      if (node.length === null || node.length === undefined || node.length === "")
        throw Object.assign(new Error("Missing branch length in treePL input tree; missing lengths are never silently padded with zero"), { code: "TREE_MISSING_BRANCH_LENGTH" });
      const length = Number(node.length);
      if (!Number.isFinite(length) || length < 0) throw new Error("Invalid branch length in treePL input tree");
      return `${part}:${length}`;
    }
    return { newick: write(root, true), rootTips: root.children.map(child => nameToId.get(firstTip(child).label.trim())), names };
  }

  // Imported chronograms are a reference, not an input to species-tree treePL.
  // Choose one age source for the whole tree; never mix posterior mean/median
  // heights or silently rescale a dated tree to the arbitrary default root age.
  function importedDatedAges(root, { ageSource = "auto", getAge = () => null } = {}) {
    const profile = sampleProfile(root);
    if (profile.names.length < 2 || profile.duplicates.length) throw new Error("Time-calibrated species tree must contain at least two unique, non-empty tip labels");
    if (root.rootingDirective === "unrooted") throw new Error("Tree file is explicitly marked unrooted ([&U]); upload a rooted, time-calibrated chronogram");
    if (!["auto", "branch_lengths", "height", "height_mean", "height_median"].includes(ageSource)) throw new Error("Unknown node-age attribute");
    const nodes = [], internal = [];
    const rawTipAges = new Map();
    (function visit(node) {
      nodes.push(node);
      const annotations = input.validateTimeAnnotations(node);
      if (!(node.children || []).length) rawTipAges.set(node, annotations.ages);
      if ((node.children || []).length) { internal.push(node); node.children.forEach(visit); }
    })(root);
    const read = (node, key) => {
      const value = getAge(node, key);
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) throw Object.assign(new Error(`Time-calibrated tree contains an invalid ${key} age`),{code:"TIME_INVALID_AGE",field:key});
      return number;
    };
    const keys = ["height", "height_mean", "height_median"];
    nodes.forEach(node => keys.forEach(key => read(node,key)));
    const complete = key => internal.every(node => read(node, key) !== null);
    const source = ageSource === "auto" ? keys.find(complete) || "branch_lengths" : ageSource;
    if (source !== "branch_lengths" && !complete(source)) throw new Error(`Attribute "${source}" is missing on some internal nodes; select ultrametric branch lengths or another complete age attribute`);
    const ages = new Map(), warnings = [];
    if (source === "branch_lengths") {
      function height(node) {
        if (!(node.children || []).length) { ages.set(node, 0); return { min: 0, max: 0 }; }
        const paths = node.children.map(child => {
          if (child.length === null || child.length === undefined || child.length === "" ||
              !Number.isFinite(Number(child.length)) || Number(child.length) < 0)
            throw new Error("Time-calibrated tree has missing, invalid, or negative branch lengths; substitution lengths or topological steps cannot substitute for divergence times");
          const value = height(child), length = Number(child.length);
          return { min: value.min + length, max: value.max + length };
        });
        const min = Math.min(...paths.map(item => item.min)), max = Math.max(...paths.map(item => item.max));
        if (max - min > Math.max(1e-8, max * 1e-5))
          throw new Error("Tree is not an ultrametric chronogram with contemporaneous tips; provide complete node-age annotations or verify ultrametric branch lengths");
        // Midpoint only absorbs output-rounding noise; no fitted/scaled ages.
        ages.set(node, (min + max) / 2);
        return { min, max };
      }
      height(root);
      if (internal.some(node => keys.some(key => read(node, key) !== null)))
        warnings.push("Derived all node ages uniformly from ultrametric branch lengths; partial node-age annotations were not mixed in");
    } else {
      nodes.forEach(node => ages.set(node, (node.children || []).length ? read(node, source) : read(node, source) ?? 0));
    }
    const rootAge = ages.get(root);
    if (!Number.isFinite(rootAge) || rootAge <= 0) throw new Error("Time-calibrated species tree must have a positive root age");
    // A small Float64 error budget scales with the input unit, without an
    // absolute age cutoff. Only derived display ages use zero; raw annotations,
    // lengths and HPD remain untouched, with every accepted residue reported.
    const toleranceRaw = Math.max(Number.MIN_VALUE, rootAge * (64 * Number.EPSILON));
    const acceptedTips = [];
    for (const node of tips(root)) {
      const observed = [...rawTipAges.get(node).values(), ...keys.map(key => read(node, key) ?? 0)];
      const maximum = Math.max(0, ...observed);
      if (maximum > toleranceRaw)
        throw Object.assign(new Error("Heterochronous (non-contemporaneous) tip ages are not supported; non-zero terminal ages are never silently clamped to present"), {code:"TIME_NONCONTEMPORANEOUS_TIPS"});
      if (maximum > 0) {
        acceptedTips.push({sample: node.label, maximum_age_raw: maximum});
        ages.set(node, 0);
      }
    }
    const terminalAgeValidation = acceptedTips.length ? {
      policy: "float64-root-relative-roundoff-v1", relative_tolerance: 64 * Number.EPSILON,
      tolerance_raw: toleranceRaw, accepted_tip_count: acceptedTips.length, accepted_tips: acceptedTips,
      source_tree_unchanged: true, display_terminal_age: 0,
    } : null;
    if (terminalAgeValidation) warnings.push(`Accepted ${acceptedTips.length} terminal-age floating-point residues within ${toleranceRaw} input time units; display ages use present (0). Original input is unchanged.`);
    nodes.forEach(node => {
      if ((node.children || []).some(child => ages.get(child) > ages.get(node)))
        throw Object.assign(new Error("Age inversion detected: a child node is older than its parent; select another age summary or verify the chronogram"), {code:"TIME_AGE_INVERSION"});
    });
    return { ages, rootAge, ageSource: source, warnings, terminalCount: profile.names.length,
      ...(terminalAgeValidation ? {terminalAgeValidation} : {}) };
  }

  function agesFromDatedTree(originalRoot, datedRoot, orderedTipNames, targetRootAge) {
    const idToName = new Map(orderedTipNames.map((name, index) => [`T${String(index + 1).padStart(5, "0")}`, name]));
    const originalProfile = sampleProfile(originalRoot);
    const datedTips = tips(datedRoot);
    if (datedTips.length !== originalProfile.names.length || datedTips.some(tip => !idToName.has(tip.label))) {
      throw new Error("treePL output taxon set does not match input");
    }
    const datedAgesByClade = new Map();
    function datedHeight(node) {
      if (!(node.children || []).length) return { names: [idToName.get(node.label)], height: 0, minHeight: 0 };
      const children = node.children.map(child => {
        const value = datedHeight(child), length = Number(child.length);
        if (!Number.isFinite(length) || length < 0) throw new Error("treePL output contains invalid time branch lengths");
        return { ...value, height: value.height + length, minHeight: value.minHeight + length };
      });
      const names = children.flatMap(child => child.names);
      const height = Math.max(...children.map(child => child.height));
      const minHeight = Math.min(...children.map(child => child.minHeight));
      if (height - minHeight > Math.max(0.001, targetRootAge * 0.001)) throw new Error("treePL output is not an ultrametric tree with contemporaneous tips");
      datedAgesByClade.set(cladeKey(names), height);
      return { names, height, minHeight };
    }
    const result = datedHeight(datedRoot);
    if (Math.abs(result.height - targetRootAge) > Math.max(0.01, targetRootAge * .01)) throw new Error("treePL output root age does not match the specified calibration");
    const ages = new Map();
    function assign(node) {
      if (!(node.children || []).length) { ages.set(node, 0); return [node.label.trim()]; }
      const names = node.children.flatMap(assign);
      const age = datedAgesByClade.get(cladeKey(names));
      if (age === undefined) throw new Error("treePL output topology does not match input");
      ages.set(node, age);
      return names;
    }
    assign(originalRoot);
    if (ages.size !== datedTips.length + datedAgesByClade.size) throw new Error("treePL output node count does not match input");
    return ages;
  }

  function cladeKey(names) { return [...names].sort().join("\u001f"); }

  // Display-only matching. Yield per internal node so large anchor collections
  // use the same cancellation/budget boundaries as the rest of cloud layout.
  function* mapCladeRowsSteps(root, collect) {
    const result = new Map();
    function* visit(node) {
      if (!node.children.length) return [String(node.label || "").trim()];
      const names = [];
      for (const child of node.children) names.push(...(yield* visit(child)));
      yield;
      collect(result, node, cladeKey(names));
      return names;
    }
    yield* visit(root);
    return result;
  }

  function* cladeRowReferenceSteps(root, rows) {
    return yield* mapCladeRowsSteps(root, (result, node, key) => {
      const row = rows.get(node);
      if (!Number.isFinite(row)) throw Object.assign(new Error("Invalid species-tree node display row"), {code: "CLOUD_INVALID_ROW_ANCHOR"});
      result.set(key, row);
    });
  }

  function* sharedRowAnchorsSteps(root, reference) {
    return yield* mapCladeRowsSteps(root, (result, node, key) => {
      if (reference.has(key)) result.set(node, reference.get(key));
    });
  }

  function nodeClades(root) {
    const clades = new Map();
    function visit(node) {
      if (!(node.children || []).length) return [String(node.label || "").trim()];
      const names = node.children.flatMap(visit);
      clades.set(node, { names, key: cladeKey(names) });
      return names;
    }
    visit(root);
    return clades;
  }

  // Only an identical descendant set identifies the same biological clade.
  // Pick one terminal from each child so treePL's two-tip MRCA is that node.
  function sharedAgeCalibrations(speciesRoot, speciesAges, geneRoot, orderedTipNames) {
    if (!(speciesAges instanceof Map) || !speciesAges.has(speciesRoot)) throw new Error("Species-tree ages have not yet been initialized");
    if (!compareSamples(speciesRoot, geneRoot).accepted) throw new Error("Gene tree and species tree differ in taxon composition and cannot share clade ages");
    const nameToId = new Map(orderedTipNames.map((name, index) => [name, `T${String(index + 1).padStart(5, "0")}`]));
    const reference = new Map([...nodeClades(speciesRoot)].map(([node, item]) => [item.key, speciesAges.get(node)]));
    const calibrations = [];
    for (const [node, item] of nodeClades(geneRoot)) {
      if (node === geneRoot || !reference.has(item.key)) continue; // root is already fixed separately
      const age = reference.get(item.key);
      if (!Number.isFinite(age) || age <= 0) throw new Error("Invalid shared-clade age on the species tree");
      if ((node.children || []).length < 2) throw new Error("Shared clade lacks two child branches required for MRCA calibration");
      function firstTip(child) { return (child.children || []).length ? firstTip(child.children[0]) : String(child.label || "").trim(); }
      const tips = [nameToId.get(firstTip(node.children[0])), nameToId.get(firstTip(node.children[1]))];
      if (!tips[0] || !tips[1] || tips[0] === tips[1]) throw new Error("Invalid calibration tip pair for shared clade");
      calibrations.push({ tips, age, key: item.key });
    }
    return calibrations;
  }

  function verifySharedAges(geneRoot, geneAges, calibrations, rootAge) {
    const byClade = new Map([...nodeClades(geneRoot)].map(([node, item]) => [item.key, geneAges.get(node)]));
    const tolerance = Math.max(0.0001, rootAge * 0.0001);
    for (const { key, age } of calibrations) {
      const actual = byClade.get(key);
      if (!Number.isFinite(actual) || Math.abs(actual - age) > tolerance) {
        throw new Error(`treePL failed to satisfy shared-clade age constraint: expected ${age}, got ${actual}`);
      }
    }
  }

  function parsePhyPartsTable(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("Concordance table contains no plottable node rows");
    const header = lines.shift().split("\t");
    const at = name => header.indexOf(name);
    for (const column of ["concordant_N", "no_signal_N", "descendant_samples"]) {
      if (at(column) < 0) throw new Error(`Concordance table is missing required column "${column}"`);
    }
    const detailed = at("dominant_conflict_N") >= 0 && at("other_conflict_N") >= 0;
    if (!detailed && at("conflict_total_N") < 0) throw new Error("Concordance table is missing conflict count columns");
    const rows = new Map();
    let commonTotal = null;
    for (const [index, line] of lines.entries()) {
      const cells = line.split("\t");
      if (at("plot_eligible") >= 0 && /^(?:false|0|no)$/i.test(cells[at("plot_eligible")])) continue;
      const count = name => {
        const raw = cells[at(name)];
        const value = Number(raw);
        if (raw === undefined || !raw.trim() || !Number.isSafeInteger(value) || value < 0)
          throw Object.assign(new Error(`Column "${name}" at row ${index + 2} must be a non-negative integer count`), { code: "PHYPARTS_INVALID_COUNT", row: index + 2, field: name });
        return value;
      };
      const concordant = count("concordant_N");
      const dominant = detailed ? count("dominant_conflict_N") : null;
      const other = detailed ? count("other_conflict_N") : null;
      const conflict = detailed ? dominant + other : count("conflict_total_N");
      if (detailed && at("conflict_total_N") >= 0 && count("conflict_total_N") !== conflict)
        throw Object.assign(new Error(`Total conflict count does not equal dominant + other conflict at row ${index + 2}`), { code: "PHYPARTS_COUNT_MISMATCH", row: index + 2 });
      const noSignal = count("no_signal_N");
      const informative = concordant + conflict;
      if (at("informative_N") >= 0 && Math.abs(count("informative_N") - informative) > 1e-6) {
        throw new Error(`Informative gene count does not equal concordant + conflict at row ${index + 2}`);
      }
      const names = String(cells[at("descendant_samples")] || "").split(";").map(name => name.trim()).filter(Boolean);
      if (names.length < 2 || new Set(names).size !== names.length) throw new Error(`Invalid descendant taxon list at row ${index + 2}`);
      const key = cladeKey(names);
      if (rows.has(key)) throw new Error(`Duplicate clade taxon set in concordance table at row ${index + 2}`);
      const total = informative + noSignal;
      if (commonTotal !== null && commonTotal !== total)
        throw Object.assign(new Error(`Total gene-tree denominator at row ${index + 2} differs from other nodes; verify uninformative tree counts`), { code: "PHYPARTS_COUNT_MISMATCH", row: index + 2 });
      commonTotal = total;
      rows.set(key, { id: cells[at("Node_ID")] || cells[at("PhyParts_Node")] || `row${index + 2}`,
        names, concordant, dominant, other, conflict, noSignal, informative, total });
    }
    if (!rows.size) throw new Error("Concordance table contains no eligible nodes for plotting");
    return { rows, detailed, sourceTotal: Number.isFinite(commonTotal) ? commonTotal : null };
  }

  function matchPhyParts(root, table) {
    const clades = nodeClades(root);
    const matched = new Map();
    const used = new Set();
    clades.forEach((clade, node) => {
      if (node === root) return;
      const row = table.rows.get(clade.key);
      if (row) { matched.set(node, row); used.add(clade.key); }
    });
    return { matched, unmatched: [...table.rows].filter(([key]) => !used.has(key)).map(([, row]) => row.id) };
  }

  function pieFractions(row, mode = "two") {
    if (mode === "four") {
      if (row.dominant === null || row.other === null) throw new Error("Four-slice concordance pies require a complete four-category concordance table");
      if (!row.total) return [];
      return [row.concordant, row.dominant, row.other, row.noSignal].map(value => value / row.total);
    }
    if (!row.informative) return [];
    return [row.concordant / row.informative, row.conflict / row.informative];
  }

  function pieAgeRange(minimum = null, maximum = null) {
    const parse = value => {
      if (value === null || value === undefined || String(value).trim() === "") return null;
      const age = Number(value);
      if (!Number.isFinite(age) || age < 0) throw new Error("Age bounds must be finite numbers >= 0");
      return age;
    };
    const range = { minimum: parse(minimum), maximum: parse(maximum) };
    if (range.minimum !== null && range.maximum !== null && range.minimum > range.maximum)
      throw new Error("Minimum age cannot exceed maximum age");
    return range;
  }

  function pieAgeWithinRange(age, range = { minimum: null, maximum: null }) {
    if (!Number.isFinite(age) || age < 0) return false;
    const tolerance = Math.max(1, Math.abs(age)) * 1e-10;
    return (range.minimum === null || age + tolerance >= range.minimum)
      && (range.maximum === null || age - tolerance <= range.maximum);
  }

  // Keep the key near the upper tree whenever there is a real opening. The
  // species tree, its pies and tip names are hard obstacles; faint gene-tree
  // lines may pass behind the key because avoiding every overlay is impossible.
  function placePieLegend({ width, height, legendWidth, legendHeight, branches = [], pies = [], labelBoxes = [],
    position = "auto" }) {
    const clearance = 9;
    const segmentTouchesRect = (segment, rect) => {
      const x1 = segment.x1, y1 = segment.y1;
      const dx = segment.x2 - x1, dy = segment.y2 - y1;
      let enter = 0, leave = 1;
      for (const [p, q] of [
        [-dx, x1 - rect.x], [dx, rect.x + rect.width - x1],
        [-dy, y1 - rect.y], [dy, rect.y + rect.height - y1],
      ]) {
        if (!p) { if (q < 0) return false; continue; }
        const at = q / p;
        if (p < 0) enter = Math.max(enter, at);
        else leave = Math.min(leave, at);
        if (enter > leave) return false;
      }
      return true;
    };
    const clear = (x, y) => {
      const rect = { x: x - clearance, y: y - clearance,
        width: legendWidth + 2 * clearance, height: legendHeight + 2 * clearance };
      if (branches.some(branch => segmentTouchesRect(branch, rect))) return false;
      if (pies.some(pie => {
        const px = Math.max(rect.x, Math.min(pie.x, rect.x + rect.width));
        const py = Math.max(rect.y, Math.min(pie.y, rect.y + rect.height));
        return Math.hypot(pie.x - px, pie.y - py) < pie.r + clearance;
      })) return false;
      return !labelBoxes.some(box => rect.x < box.x + box.width && rect.x + rect.width > box.x &&
        rect.y < box.y + box.height && rect.y + rect.height > box.y);
    };
    const maxX = Math.max(80, Math.min(width - legendWidth - 24, 1080 - legendWidth - 18));
    const maxY = height - legendHeight - 28;
    const upperY = Math.min(maxY, Math.max(640, height * .45));
    if (position !== "auto") {
      const ratios = { "upper-left": .12, "middle-left": .43, "lower-left": .68 };
      if (!(position in ratios)) throw new Error("Invalid concordance pie legend position");
      const targetY = Math.max(48, Math.min(maxY, height * ratios[position]));
      const candidates = [];
      for (let y = 48; y <= maxY; y += 12) {
        for (let x = 80; x <= maxX; x += 12) {
          if (clear(x, y)) candidates.push({ x, y, score: Math.abs(y - targetY) + (x - 80) * .12 });
        }
      }
      if (candidates.length) {
        candidates.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
        return { x: candidates[0].x, y: candidates[0].y, width: legendWidth, height: legendHeight };
      }
    }
    for (const limit of [upperY, maxY]) {
      for (let y = 48; y <= limit; y += 12) {
        for (let x = 80; x <= maxX; x += 12) {
          if (clear(x, y)) return { x, y, width: legendWidth, height: legendHeight };
        }
      }
    }
    // Even on an exceptionally dense tree, the reserved strip after the last
    // terminal row is safe and preferable to covering a black species branch.
    return { x: 80, y: maxY, width: legendWidth, height: legendHeight };
  }

  return { tips, orderedTips, sampleProfile, compareSamples, geneRooting, inferredOutgroup, phyPartsEligibility, splitGeneTrees, phyPartsInput, phyPartsSupportScale, validateMlInput, alignedRows, optimizeAlignedRows, optimizeAlignedRowsSteps, cladeRowReferenceSteps, sharedRowAnchorsSteps, effectiveGeneOpacity, pieTargetRadius, layoutPiePlacements, layoutPiePlacementSteps, layoutPieRadii, relativeAges,
    treePLInput, importedDatedAges, agesFromDatedTree, sharedAgeCalibrations, verifySharedAges,
    cladeKey, nodeClades, parsePhyPartsTable, matchPhyParts, pieFractions, pieAgeRange, pieAgeWithinRange, placePieLegend };
});
