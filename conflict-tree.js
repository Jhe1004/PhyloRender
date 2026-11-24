(function attachConflictTree(globalScope) {
  "use strict";

  const treeOrder = typeof module !== "undefined" && module.exports
    ? require("./core/tree-order.js") : globalScope.PhyloRenderTreeOrder;
  const sampleIdentity = typeof module !== "undefined" && module.exports
    ? require("./core/sample-identity.js") : globalScope.PhyloRenderSampleIdentity;
  if (!treeOrder || !sampleIdentity) throw new Error("Missing shared tree/sample policy");

  function normalizeTipKey(label) {
    return sampleIdentity.tipIdentityKey(label, "conflict");
  }

  function cloneTree(node) {
    if (!node) return null;
    return {
      ...node,
      comments: Array.isArray(node.comments) ? [...node.comments] : node.comments,
      children: (node.children || []).map(cloneTree),
    };
  }

  const tipNodes = treeOrder.tipNodes;

  function tipEntries(root) {
    return sampleIdentity.tipProfile(root, "conflict").entries;
  }

  function groupError(code, message) {
    return Object.assign(new Error(message), { code, field: "sample_groups", retryable: false });
  }

  function assignSampleGroups(root, groups) {
    const { set, duplicates } = sampleIdentity.tipProfile(root, "conflict");
    if (duplicates.length) throw groupError("TIP_MAPPING_AMBIGUOUS", "Primary-tree tip labels collide after normalization; taxon groups cannot be assigned");
    const assignments = new Map();
    const groupColors = new Map();
    for (const group of groups) {
      const name = String(group.name ?? "").trim();
      const color = String(group.color ?? "").toLowerCase();
      if (!name || !/^#[0-9a-f]{6}$/.test(color) || !Array.isArray(group.samples) || !group.samples.length) {
        throw groupError("CONFLICT_GROUP_INVALID", "Each tanglegram group requires a name, a #RRGGBB hex color, and at least one taxon");
      }
      if (groupColors.has(name) && groupColors.get(name) !== color) {
        throw groupError("CONFLICT_GROUP_COLOR_MISMATCH", `Conflicting colors assigned to group "${name}"; use a single color per group`);
      }
      groupColors.set(name, color);
      for (const sample of group.samples) {
        const key = normalizeTipKey(sample);
        if (!set.has(key)) throw groupError("CONFLICT_GROUP_SAMPLE_UNKNOWN", `Grouped taxon is absent from the primary tree: ${sample}`);
        if (assignments.has(key)) throw groupError("CONFLICT_GROUP_SAMPLE_DUPLICATE", `Taxon assigned to multiple groups: ${sample}`);
        assignments.set(key, { name, color });
      }
    }
    return assignments;
  }

  function rootOutgroupLabels(root) {
    const outgroup = root.outgroupChildId && root.children.find(child => child.id === root.outgroupChildId);
    return outgroup ? tipNodes(outgroup).map(tip => tip.label) : null;
  }

  function compareSampleSets(nuclearRoot, plastidRoot) {
    const nuclear = sampleIdentity.tipProfile(nuclearRoot, "conflict");
    const plastid = sampleIdentity.tipProfile(plastidRoot, "conflict");
    const nuclearEntries = nuclear.entries, plastidEntries = plastid.entries;
    const nuclearByKey = new Map(nuclearEntries.map(entry => [entry.key, entry]));
    const plastidByKey = new Map(plastidEntries.map(entry => [entry.key, entry]));
    const sharedKeys = [...nuclearByKey.keys()].filter(key => plastidByKey.has(key));
    const nuclearOnlyKeys = [...nuclearByKey.keys()].filter(key => !plastidByKey.has(key));
    const plastidOnlyKeys = [...plastidByKey.keys()].filter(key => !nuclearByKey.has(key));
    return {
      nuclearCount: nuclearEntries.length,
      plastidCount: plastidEntries.length,
      sharedCount: sharedKeys.length,
      sharedKeys,
      nuclearOnlyKeys,
      plastidOnlyKeys,
      nuclearOnly: nuclearOnlyKeys.map(key => nuclearByKey.get(key).label),
      plastidOnly: plastidOnlyKeys.map(key => plastidByKey.get(key).label),
      nuclearDuplicates: nuclear.duplicates.filter(item => item.key),
      plastidDuplicates: plastid.duplicates.filter(item => item.key),
      nuclearByKey,
      plastidByKey,
    };
  }

  function equalCountNameMismatchError(comparison) {
    const mainOnly = [...comparison.nuclearOnly];
    const comparisonOnly = [...comparison.plastidOnly];
    const quoted = labels => labels.map(label => `"${label}"`).join(", ");
    const error = new Error(
      `Both trees contain ${comparison.nuclearCount} taxa, but ${mainOnly.length} label(s) fail to pair one-to-one. `
      + `Unique to primary tree (${mainOnly.length}): ${quoted(mainOnly)}; `
      + `unique to comparison tree (${comparisonOnly.length}): ${quoted(comparisonOnly)}. `
      + "Reconcile tip labels before re-importing; PhyloRender never guesses taxon pairings.",
    );
    error.code = "CONFLICT_EQUAL_COUNT_NAME_MISMATCH";
    error.mainOnly = mainOnly;
    error.comparisonOnly = comparisonOnly;
    return error;
  }

  function samplePolicyConfirmationError(comparison) {
    const mainOnly = [...comparison.nuclearOnly];
    const comparisonOnly = [...comparison.plastidOnly];
    const quoted = labels => labels.length ? labels.map(label => `"${label}"`).join(", ") : "none";
    const smallerIsMain = comparison.nuclearCount < comparison.plastidCount;
    const smallerIsComparison = comparison.plastidCount < comparison.nuclearCount;
    const smallerIsSubset = comparison.sharedCount === Math.min(comparison.nuclearCount, comparison.plastidCount);
    const proposed = smallerIsSubset
      ? `You may prune to the ${comparison.sharedCount} shared taxa matching the smaller ${smallerIsMain ? "primary" : smallerIsComparison ? "comparison" : ""} tree. `
      : `Each tree contains unshared taxa; explicitly choose either the ${comparison.sharedCount} shared taxa (intersection) or all taxa from both trees (union). `;
    const error = new Error(
      `Taxon sets differ: primary tree has ${comparison.nuclearCount}, comparison tree has ${comparison.plastidCount}, shared ${comparison.sharedCount}. `
      + `Unique to primary tree (${mainOnly.length}): ${quoted(mainOnly)}; `
      + `unique to comparison tree (${comparisonOnly.length}): ${quoted(comparisonOnly)}. `
      + `${proposed}Unmatched taxa are never pruned or retained without explicit confirmation.`,
    );
    error.code = "CONFLICT_SAMPLE_POLICY_CONFIRMATION_REQUIRED";
    error.mainOnly = mainOnly;
    error.comparisonOnly = comparisonOnly;
    error.comparison = comparison;
    return error;
  }

  function rerootByOutgroup(root, outgroup, sideLabel, { buildGraph, rooting }) {
    if (!Array.isArray(outgroup) || !outgroup.length) return root;
    const byKey = new Map(tipEntries(root).map(entry => [entry.key, entry.node]));
    const requestedTips = outgroup.map(name => {
      const node = byKey.get(normalizeTipKey(name));
      if (!node) throw new Error(`${sideLabel} does not contain the focal-tree outgroup taxon: ${name}`);
      return node;
    });
    const requestedIds = requestedTips.map(tip => tip.id);
    const existing = rooting.findMatchingRootChild(root, requestedIds);
    if (existing) {
      root.outgroupChildId = existing.childId;
      root.ingroupChildId = existing.otherChildId;
      root.preserveChildOrder = true;
      return root;
    }
    try {
      const graph = buildGraph(root);
      const match = rooting.findSeparatingEdge(graph, requestedIds);
      return rooting.rerootOnEdge(graph, match.edge.id, match.selectedEndpointId);
    } catch (error) {
      throw new Error(`${sideLabel} cannot be rooted on a monophyletic bipartition matching the focal-tree outgroup: ${error.message}`);
    }
  }

  function rerootPairByOutgroup(nuclearRoot, plastidRoot, outgroup, dependencies) {
    return {
      nuclearRoot: rerootByOutgroup(nuclearRoot, outgroup, "Primary tree", dependencies),
      plastidRoot: rerootByOutgroup(plastidRoot, outgroup, "Comparison tree", dependencies),
    };
  }

  function combineLengths(parentLength, childLength) {
    const parent = Number(parentLength);
    const child = Number(childLength);
    if (Number.isFinite(parent) && Number.isFinite(child)) return parent + child;
    if (Number.isFinite(child)) return child;
    if (Number.isFinite(parent)) return parent;
    return childLength ?? parentLength ?? null;
  }

  function pruneToKeys(root, allowedKeys) {
    const allowed = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys || []);
    function prune(node, isRoot = false) {
      if (!(node.children || []).length) {
        return allowed.has(normalizeTipKey(node.label)) ? cloneTree(node) : null;
      }
      const children = node.children.map(child => prune(child)).filter(Boolean);
      if (!children.length) return null;
      if (children.length === 1) {
        const child = children[0];
        if (!isRoot) child.length = combineLengths(node.length, child.length);
        return child;
      }
      return { ...cloneTree(node), children };
    }
    return prune(root, true);
  }

  function tipOrder(root) {
    return tipEntries(root).map(entry => entry.key);
  }

  function rankMap(order) {
    return new Map(order.map((key, index) => [key, index]));
  }

  function matchedRanks(node, ranks) {
    const values = [];
    (function visit(current) {
      if (!(current.children || []).length) {
        const rank = ranks.get(normalizeTipKey(current.label));
        if (Number.isFinite(rank)) values.push(rank);
        return;
      }
      current.children.forEach(visit);
    }(node));
    return values;
  }

  function median(values) {
    if (!values.length) return Number.POSITIVE_INFINITY;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function orientByTargetRanks(root, targetRanks) {
    const ranks = targetRanks instanceof Map ? targetRanks : rankMap(targetRanks || []);
    const oriented = cloneTree(root);
    (function orient(node) {
      if (!(node.children || []).length) return;
      node.children.forEach(orient);
      node.children = node.children
        .map((child, originalIndex) => ({
          child,
          originalIndex,
          score: median(matchedRanks(child, ranks)),
        }))
        .sort((a, b) => a.score - b.score || a.originalIndex - b.originalIndex)
        .map(item => item.child);
    }(oriented));
    return oriented;
  }

  function crossingCount(leftOrder, rightOrder) {
    const rightRanks = rankMap(rightOrder);
    const sequence = leftOrder.filter(key => rightRanks.has(key)).map(key => rightRanks.get(key));
    let crossings = 0;
    for (let i = 0; i < sequence.length; i += 1) {
      for (let j = i + 1; j < sequence.length; j += 1) {
        if (sequence[i] > sequence[j]) crossings += 1;
      }
    }
    return crossings;
  }

  function ladderizePrimary(root, direction = "file") {
    const result = cloneTree(root);
    return treeOrder.ladderize(result, direction);
  }

  function swapPrimaryChildren(root, nodeId) {
    const result = cloneTree(root);
    let swapped = false;
    (function visit(node) {
      if (String(node.id) === String(nodeId)) {
        if ((node.children || []).length < 2) throw new Error("Selected node does not have at least two swappable sister branches");
        node.children.reverse();
        swapped = true;
        return;
      }
      (node.children || []).forEach(visit);
    }(result));
    if (!swapped) throw new Error("Selected branch could not be found in the primary tree");
    return result;
  }

  function connectorEndpoint(tipX, labelWidth, side, labelGap = 9, lineGap = 2.5) {
    const width = Math.max(0, Number(labelWidth) || 0);
    if (side === "left") return tipX + labelGap + width + lineGap;
    if (side === "right") return tipX - labelGap - width - lineGap;
    throw new Error('Connector endpoint side must be "left" or "right"');
  }

  function connectorPath(startX, startY, endX, endY, laneLeft, laneRight) {
    const values = [startX, startY, endX, endY, laneLeft, laneRight].map(Number);
    if (values.some(value => !Number.isFinite(value))) throw new Error("Connector coordinates must be finite numbers");
    const [x1, y1, x2, y2, left, right] = values;
    if (x1 > left || left >= right || right > x2) {
      throw new Error("Connector routing corridor must lie strictly between the left and right tip-label columns");
    }
    // Remain level until every label has ended; all vertical movement stays
    // inside the shared empty corridor, then the curve exits level again.
    const bend = (right - left) * 0.36;
    return `M ${x1} ${y1} L ${left} ${y1} C ${left + bend} ${y1}, ${right - bend} ${y2}, ${right} ${y2} L ${x2} ${y2}`;
  }

  function supportComponents(value) {
    if (value === null || value === undefined) return [];
    return String(value).split("/").map(part => part.trim()).filter(Boolean);
  }

  function selectSupportComponent(value, selection = "all") {
    const components = supportComponents(value);
    if (components.length <= 1 || selection === "all") return components.join("/");
    const match = String(selection).match(/^field:(\d+)$/);
    if (!match) return components.join("/");
    const index = Number(match[1]);
    return components[index] ?? components[0];
  }

  const GROUP_PALETTE = [
    "#176b8a", "#b35435", "#66813c", "#8a5790", "#bb8530", "#397f78",
    "#ad5874", "#5c6da2", "#806b43", "#487b51", "#9a6248", "#6d6794",
  ];

  function parseGroupTable(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    const source = String(text ?? "").replace(/^\uFEFF/, "");
    const delimiter = source.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '"') {
        if (quoted && source[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(field.trim()); field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        row.push(field.trim()); field = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && source[i + 1] === "\n") i += 1;
      } else field += char;
    }
    if (quoted) throw new Error("Unclosed double quote in taxon-group table");
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    if (!rows.length) throw new Error("Taxon-group table is empty");
    const header = rows[0].map(value => value.toLowerCase().replace(/[\s_-]/g, ""));
    const sampleIndex = header.findIndex(value => ["sample", "taxon", "tip", "label", "\u6837\u54c1", "\u6837\u672c", "\u540d\u79f0", "\u672b\u7aef"].includes(value));
    const groupIndex = header.findIndex(value => ["group", "clade", "\u5206\u7ec4", "\u7c7b\u7fa4"].includes(value));
    const colorIndex = header.findIndex(value => ["color", "colour", "\u989c\u8272"].includes(value));
    const hasHeader = sampleIndex >= 0 && groupIndex >= 0;
    if (!hasHeader && (sampleIndex >= 0 || groupIndex >= 0)) {
      throw new Error("Taxon-group header must include both sample and group columns");
    }
    const assignments = new Map();
    const colorsByGroup = new Map();
    for (const [offset, cells] of rows.slice(hasHeader ? 1 : 0).entries()) {
      const sample = cells[hasHeader ? sampleIndex : 0]?.trim();
      const group = cells[hasHeader ? groupIndex : 1]?.trim();
      const color = cells[hasHeader ? colorIndex : 2]?.trim() || "";
      const line = offset + (hasHeader ? 2 : 1);
      if (!sample || !group) throw new Error(`Missing taxon or group name at row ${line} of taxon-group table`);
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Color at row ${line} of taxon-group table must use #RRGGBB hex format`);
      const key = normalizeTipKey(sample);
      if (assignments.has(key)) throw new Error(`Duplicate taxon "${sample}" in taxon-group table`);
      if (color && colorsByGroup.has(group) && colorsByGroup.get(group) !== color.toLowerCase()) {
        throw new Error(`Conflicting colors assigned to group "${group}"; use a single color per group`);
      }
      if (color) colorsByGroup.set(group, color.toLowerCase());
      assignments.set(key, { name: group, color: color.toLowerCase() });
    }
    if (!assignments.size) throw new Error("Taxon-group table contains no valid assignments");
    return assignments;
  }

  function groupAnnotation(node) {
    for (const comment of node.comments || (node.comment ? [node.comment] : [])) {
      const name = String(comment).match(/(?:^|[,;:&])\s*(?:group|clade)\s*=\s*(?:["']([^"']+)["']|([^,;:&]+))/i);
      if (!name) continue;
      const color = String(comment).match(/(?:^|[,;:&])\s*(?:color|colour)\s*=\s*(#[0-9a-f]{6})(?=$|[,;:&])/i);
      return { name: (name[1] || name[2]).trim(), color: color?.[1]?.toLowerCase() || "" };
    }
    return null;
  }

  function annotatedGroups(root) {
    const assignments = new Map();
    (function visit(node, inherited) {
      const current = groupAnnotation(node) || inherited;
      if (!(node.children || []).length) {
        if (current) assignments.set(normalizeTipKey(node.label), current);
        return;
      }
      node.children.forEach(child => visit(child, current));
    }(root, null));
    return assignments;
  }

  function inferMajorClades(root, maximumGroups = 8) {
    const counts = new Map();
    (function count(node) {
      const size = (node.children || []).length
        ? node.children.reduce((sum, child) => sum + count(child), 0) : 1;
      counts.set(node, size);
      return size;
    }(root));
    const total = counts.get(root);
    if (total <= 1) return [root];
    const groups = root.children?.length > 1 ? [...root.children] : [root];
    const minimumChildSize = Math.max(2, Math.floor(total * .025));
    const target = Math.min(maximumGroups, Math.max(2, Math.round(Math.sqrt(total / 2))));
    while (groups.length < target) {
      const candidates = groups.map((node, index) => {
        const children = node.children || [];
        const minimum = children.length > 1 ? Math.min(...children.map(child => counts.get(child))) : 0;
        return { node, index, children, minimum, size: counts.get(node) };
      }).filter(item => item.minimum >= minimumChildSize
        && groups.length + item.children.length - 1 <= target);
      if (!candidates.length) break;
      candidates.sort((a, b) => b.minimum - a.minimum || b.size - a.size || a.index - b.index);
      const chosen = candidates[0];
      groups.splice(chosen.index, 1, ...chosen.children);
    }
    return groups;
  }

  function buildGroupColors(nuclearRoot, plastidRoot, explicitAssignments = null, referenceNuclearRoot = nuclearRoot) {
    const nuclearTips = tipEntries(nuclearRoot);
    const referenceTips = tipEntries(referenceNuclearRoot);
    const nuclearKeys = new Set(nuclearTips.map(item => item.key));
    const referenceKeys = new Set(referenceTips.map(item => item.key));
    let assignments = explicitAssignments instanceof Map ? explicitAssignments : null;
    let source = "table";
    if (!assignments) {
      assignments = annotatedGroups(referenceNuclearRoot);
      source = assignments.size ? "annotations" : "automatic";
    }
    if (source === "automatic") {
      assignments = new Map();
      inferMajorClades(referenceNuclearRoot).forEach((clade, index) => {
        tipEntries(clade).forEach(item => assignments.set(item.key, { name: `Primary-tree clade ${index + 1}`, color: "" }));
      });
    }
    const groups = [];
    const groupByName = new Map();
    const tipGroup = new Map();
    const preferredColors = new Map();
    assignments.forEach(assignment => {
      if (assignment.color && !preferredColors.has(assignment.name)) {
        preferredColors.set(assignment.name, assignment.color);
      }
    });
    referenceTips.forEach(({ key }) => {
      const assignment = assignments.get(key);
      if (!assignment) return;
      const name = String(assignment.name ?? "").trim();
      if (!name) return;
      let group = groupByName.get(name);
      if (!group) {
        group = { id: `group-${groups.length + 1}`, name,
          color: preferredColors.get(name) || GROUP_PALETTE[groups.length % GROUP_PALETTE.length], count: 0 };
        groupByName.set(name, group);
        groups.push(group);
      }
    });
    nuclearTips.forEach(({ key }) => {
      const assignment = assignments.get(key);
      if (!assignment) return;
      const group = groupByName.get(String(assignment.name ?? "").trim());
      if (!group) return;
      group.count += 1;
      tipGroup.set(key, group);
    });
    function nodeGroups(root) {
      const result = new Map();
      (function visit(node) {
        if (!(node.children || []).length) {
          const group = tipGroup.get(normalizeTipKey(node.label)) || null;
          result.set(node, group);
          return group;
        }
        const children = node.children.map(visit);
        const group = children[0] && children.every(item => item?.id === children[0].id) ? children[0] : null;
        result.set(node, group);
        return group;
      }(root));
      return result;
    }
    return {
      source, groups: groups.filter(group => group.count > 0), tipGroup,
      nuclearNodeGroup: nodeGroups(nuclearRoot),
      plastidNodeGroup: nodeGroups(plastidRoot),
      unassignedNuclear: nuclearKeys.size - tipGroup.size,
      unknownSamples: [...assignments.keys()].filter(key => !referenceKeys.has(key)),
    };
  }

  function exportSampleGroups(root, assignments) {
    if (!assignments?.size) return [];
    const colors = buildGroupColors(root, root, assignments);
    const groups = new Map(colors.groups.map(({ id, name, color }) => [id, { name, color, samples: [] }]));
    for (const { key, node } of tipEntries(root)) {
      const group = colors.tipGroup.get(key);
      if (group) groups.get(group.id).samples.push(node.label);
    }
    return [...groups.values()];
  }

  function groupColoringReport(prepared, assignments) {
    const colors = prepared.groupColors;
    if (assignments) {
      const expected = tipEntries(prepared.nuclearRoot).filter(({ key }) => assignments.has(key));
      if (colors.unknownSamples.length || expected.some(({ key }) => !colors.tipGroup.has(key)) ||
          expected.length !== colors.tipGroup.size) {
        throw groupError("CONFLICT_GROUP_NOT_APPLIED", "Some tanglegram taxon-group assignments did not match visible primary-tree tips");
      }
    }
    return { source: colors.source, assigned_primary_samples: colors.tipGroup.size,
      requested_primary_samples: assignments?.size ?? null,
      groups: colors.groups.map(({ name, color, count }) => ({ name, color, count })) };
  }

  function cladeSignatureSet(root) {
    const signatures = new Set();
    (function visit(node) {
      if (!(node.children || []).length) return [normalizeTipKey(node.label)];
      const tips = node.children.flatMap(visit).sort();
      signatures.add(tips.join("|"));
      return tips;
    }(root));
    return signatures;
  }

  function optimizeTanglegram(nuclearRoot, plastidRoot) {
    // The left tree is the user's reference order. Never rotate it to make the
    // right tree look better: only the right tree may follow the left.
    const left = cloneTree(nuclearRoot);
    const right = cloneTree(plastidRoot);
    const baseline = crossingCount(tipOrder(left), tipOrder(right));
    const candidate = orientByTargetRanks(right, rankMap(tipOrder(left)));
    const candidateCrossings = crossingCount(tipOrder(left), tipOrder(candidate));
    return {
      nuclearRoot: left,
      plastidRoot: candidateCrossings <= baseline ? candidate : right,
      crossingsBefore: baseline,
      crossingsAfter: Math.min(baseline, candidateCrossings),
    };
  }

  function prepareConflictTrees(nuclearRoot, plastidRoot, policy = "") {
    const comparison = compareSampleSets(nuclearRoot, plastidRoot);
    if (comparison.nuclearDuplicates.length || comparison.plastidDuplicates.length) {
      throw new Error("Duplicate normalized tip labels detected; disambiguate duplicate taxa before comparing trees");
    }
    if (!policy && comparison.nuclearCount === comparison.plastidCount
      && comparison.sharedCount !== comparison.nuclearCount) {
      throw equalCountNameMismatchError(comparison);
    }
    if (!comparison.sharedCount) throw new Error("No shared taxa matched between the two trees; check tip naming conventions");
    const differs = comparison.nuclearOnly.length || comparison.plastidOnly.length;
    if (differs && comparison.nuclearCount !== comparison.plastidCount
      && !["intersection", "union"].includes(policy)) {
      throw samplePolicyConfirmationError(comparison);
    }
    if (policy && !["intersection", "union"].includes(policy)) throw new Error("Unknown tanglegram taxon-set policy");
    const shared = new Set(comparison.sharedKeys);
    const retainAll = policy === "union";
    const nuclearPrepared = retainAll ? cloneTree(nuclearRoot) : pruneToKeys(nuclearRoot, shared);
    const plastidPrepared = retainAll ? cloneTree(plastidRoot) : pruneToKeys(plastidRoot, shared);
    const optimized = optimizeTanglegram(nuclearPrepared, plastidPrepared);
    return { comparison, policy, ...optimized };
  }

  const api = {
    normalizeTipKey,
    cloneTree,
    tipNodes,
    tipEntries,
    assignSampleGroups,
    exportSampleGroups,
    groupColoringReport,
    rootOutgroupLabels,
    compareSampleSets,
    equalCountNameMismatchError,
    samplePolicyConfirmationError,
    rerootByOutgroup,
    rerootPairByOutgroup,
    pruneToKeys,
    tipOrder,
    rankMap,
    orientByTargetRanks,
    crossingCount,
    connectorEndpoint,
    connectorPath,
    supportComponents,
    selectSupportComponent,
    parseGroupTable,
    annotatedGroups,
    inferMajorClades,
    buildGroupColors,
    cladeSignatureSet,
    ladderizePrimary,
    swapPrimaryChildren,
    optimizeTanglegram,
    prepareConflictTrees,
  };

  globalScope.PhyloRenderConflict = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
