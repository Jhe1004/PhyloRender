/*
 * Independent PhyloRender penalized-likelihood ultrametric display aligner.
 *
 * Implements the rate-smoothed Poisson penalized-likelihood formulation of
 * Sanderson (2002) and Smith & O'Meara (2012) under fixed shared-clade ages
 * strictly for cloudogram visual display alignment. Contains no upstream C++
 * treePL code and requires no native binaries, ADOL-C, NLopt, or OpenMP.
 */
(function exposePlAligner(root, factory) {
  const api = factory(root.PhyloRenderLBFGS || null);
  root.PhyloRenderPLAligner=api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlAlignerModule(defaultLbfgs) {
  'use strict';

  const ENGINE = 'PhyloRender-pl-aligner';
  const ALGORITHM = 'phylorender-pl-display-alignment-v1';
  const NUMSITES = 100000000;
  const SMOOTH = 100;
  const SEED = 1;
  const SAFE_CHARS = /^[A-Za-z0-9_.:,()eE+-]+;$/;
  const TOKEN_RE = /T\d{5}|[(),:;]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;

  function fail(message, code = 'PL_ALIGN_INVALID') {
    throw Object.assign(new Error(message), { code });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function parseSafeNewick(text, treeIndex) {
    if (typeof text !== 'string' || text.length < 10 || text.length > 200000 || !SAFE_CHARS.test(text))
      fail(`Tree #${treeIndex} contains unsupported characters or invalid size for penalized-likelihood alignment`);
    const tokens = text.match(TOKEN_RE) || [];
    if (tokens.join('') !== text) fail(`Tree #${treeIndex} contains malformed Newick tokens`);
    let cursor = 0;
    const nodes = [], seenTips = new Set();

    function readSubtree(parentIdx) {
      const idx = nodes.length;
      const node = { idx, parent: parentIdx, children: [], tip: null, bl: 0, tips: new Set() };
      nodes.push(node);
      const tok = tokens[cursor++];
      if (!tok) fail(`Tree #${treeIndex} ended unexpectedly`);
      if (tok === '(') {
        node.children.push(readSubtree(idx));
        while (tokens[cursor] === ',') { cursor++; node.children.push(readSubtree(idx)); }
        if (tokens[cursor++] !== ')') fail(`Tree #${treeIndex} has unbalanced parentheses`);
        if (tokens[cursor] && /^T\d{5}$/.test(tokens[cursor])) cursor++;
      } else if (/^T\d{5}$/.test(tok)) {
        if (seenTips.has(tok)) fail(`Tree #${treeIndex} has duplicate taxon token ${tok}`);
        seenTips.add(tok); node.tip = tok; node.tips.add(tok);
      } else fail(`Tree #${treeIndex} has unexpected token "${tok}"`);

      if (tokens[cursor] === ':') {
        cursor++;
        const rawLen = Number(tokens[cursor++]);
        if (!Number.isFinite(rawLen) || rawLen < 0) fail(`Tree #${treeIndex} has an invalid branch length`);
        node.bl = rawLen;
      } else if (parentIdx !== -1) fail(`Tree #${treeIndex} is missing a non-root branch length`);

      for (const chIdx of node.children) for (const t of nodes[chIdx].tips) node.tips.add(t);
      return idx;
    }

    readSubtree(-1);
    if (tokens[cursor++] !== ';' || cursor !== tokens.length) fail(`Tree #${treeIndex} has trailing tokens after semicolon`);
    if (seenTips.size < 2) fail(`Tree #${treeIndex} has fewer than 2 taxa`);
    return { nodes, tipSet: seenTips };
  }

  function findMrca(nodes, tipA, tipB) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const nd = nodes[i];
      if (nd.tips.has(tipA) && nd.tips.has(tipB)
        && nd.children.every(chIdx => !(nodes[chIdx].tips.has(tipA) && nodes[chIdx].tips.has(tipB)))) return nd.idx;
    }
    return -1;
  }

  function create({ lbfgs } = {}) {
    const solver = lbfgs || defaultLbfgs;
    if (!solver || typeof solver.minimize !== 'function') throw new TypeError('Missing PhyloRenderLBFGS minimizer port');

    function alignSingleTree(item, rootAge, treeIndex = 1) {
      if (!item || typeof item !== 'object') fail(`Malformed payload for tree #${treeIndex}`);
      const { nodes, tipSet } = parseSafeNewick(item.newick, treeIndex);
      const rootTips = item.rootTips;
      if (!Array.isArray(rootTips) || rootTips.length !== 2 || rootTips[0] === rootTips[1]
        || !tipSet.has(rootTips[0]) || !tipSet.has(rootTips[1]) || findMrca(nodes, rootTips[0], rootTips[1]) !== 0)
        fail(`Tree #${treeIndex} has invalid root-calibration taxa`);
      const calibrations = item.calibrations || [];
      if (!Array.isArray(calibrations) || calibrations.length > tipSet.size - 2)
        fail(`Tree #${treeIndex} has an invalid number of shared-clade calibrations`);

      const n = nodes.length, fixedAge = new Float64Array(n).fill(-1);
      fixedAge[0] = rootAge;
      for (let i = 0; i < n; i++) if (nodes[i].tip !== null) fixedAge[i] = 0;

      const seenPairs = new Set();
      for (let c = 0; c < calibrations.length; c++) {
        const cal = calibrations[c], tips = cal?.tips, age = cal?.age;
        if (!cal || typeof cal !== 'object' || !Array.isArray(tips) || tips.length !== 2
          || typeof tips[0] !== 'string' || typeof tips[1] !== 'string' || tips[0] === tips[1]
          || !tipSet.has(tips[0]) || !tipSet.has(tips[1])
          || typeof age !== 'number' || !Number.isFinite(age) || age <= 0 || age >= rootAge)
          fail(`Tree #${treeIndex} has an invalid shared-clade calibration #${c + 1}`);
        const pairKey = tips[0] < tips[1] ? `${tips[0]}\0${tips[1]}` : `${tips[1]}\0${tips[0]}`;
        if (seenPairs.has(pairKey)) fail(`Tree #${treeIndex} has duplicate calibration pair #${c + 1}`);
        seenPairs.add(pairKey);
        const mrca = findMrca(nodes, tips[0], tips[1]);
        if (mrca <= 0 || nodes[mrca].tip !== null) fail(`Tree #${treeIndex} calibration #${c + 1} does not map to an internal clade`);
        if (fixedAge[mrca] !== -1 && Math.abs(fixedAge[mrca] - age) > 1e-12)
          fail(`Tree #${treeIndex} has conflicting ages assigned to the same clade`);
        fixedAge[mrca] = age;
      }

      const lowerBound = new Float64Array(n), stepsBelow = new Int32Array(n);
      for (let i = n - 1; i >= 0; i--) {
        const nd = nodes[i];
        if (!nd.children.length) continue;
        let lb = 0, maxSteps = 0;
        for (const chIdx of nd.children) {
          const chBound = fixedAge[chIdx] >= 0 ? fixedAge[chIdx] : lowerBound[chIdx];
          if (chBound > lb) lb = chBound;
          const st = (fixedAge[chIdx] >= 0 ? 0 : stepsBelow[chIdx]) + 1;
          if (st > maxSteps) maxSteps = st;
        }
        if (fixedAge[i] >= 0 && fixedAge[i] <= lb) fail(`Tree #${treeIndex} has inverted fixed clade ages`);
        lowerBound[i] = lb; stepsBelow[i] = maxSteps;
      }

      const edgeNodes = [], freeNodes = [], freeParamIdx = new Int32Array(n).fill(-1);
      for (let i = 1; i < n; i++) {
        edgeNodes.push(i);
        if (fixedAge[i] < 0) { freeParamIdx[i] = freeNodes.length; freeNodes.push(i); }
      }
      const eCount = edgeNodes.length, fCount = freeNodes.length;
      const charDur = new Float64Array(n), dates = new Float64Array(n);
      for (let i = 1; i < n; i++) charDur[i] = Math.round(Math.max(nodes[i].bl, 1 / NUMSITES) * NUMSITES);
      for (let i = 0; i < n; i++) if (fixedAge[i] >= 0) dates[i] = fixedAge[i];
      for (let k = 0; k < fCount; k++) {
        const u = freeNodes[k], pAge = dates[nodes[u].parent], lb = lowerBound[u];
        dates[u] = lb + (stepsBelow[u] / (stepsBelow[u] + 1)) * (pAge - lb);
      }

      let sumChar = 0, sumDur = 0;
      for (let e = 0; e < eCount; e++) {
        const i = edgeNodes[e];
        sumChar += charDur[i]; sumDur += Math.max(dates[nodes[i].parent] - dates[i], 1e-12);
      }
      const baseRate = Math.max(sumChar / Math.max(sumDur, 1e-12), 1e-6);
      const deltaScale = Math.min(1, Math.sqrt(sumChar) / (Math.sqrt(SMOOTH) * baseRate * Math.sqrt(eCount)));
      const x0 = new Float64Array(1 + eCount + fCount);
      x0[0] = Math.log(baseRate);
      for (let k = 0; k < fCount; k++) {
        const u = freeNodes[k], s = clamp((dates[u] - lowerBound[u]) / (dates[nodes[u].parent] - lowerBound[u]), 1e-6, 1 - 1e-6);
        x0[1 + eCount + k] = Math.log(s / (1 - s));
      }

      const rates = new Float64Array(n), sigmas = new Float64Array(fCount), gRate = new Float64Array(n), gDate = new Float64Array(n);
      const rootChildren = nodes[0].children.slice(), kRoot = rootChildren.length;

      function evaluate(params, grad) {
        gRate.fill(0); gDate.fill(0);
        const gLog = params[0];
        for (let e = 0; e < eCount; e++) rates[edgeNodes[e]] = Math.exp(clamp(gLog + deltaScale * params[1 + e], -45, 45));
        for (let k = 0; k < fCount; k++) {
          const u = freeNodes[k], s = 1 / (1 + Math.exp(-clamp(params[1 + eCount + k], -32, 32)));
          sigmas[k] = s; dates[u] = lowerBound[u] + s * (dates[nodes[u].parent] - lowerBound[u]);
        }
        let obj = 0;
        for (let e = 0; e < eCount; e++) {
          const i = edgeNodes[e], p = nodes[i].parent, d = Math.max(dates[p] - dates[i], Number.MIN_VALUE);
          const r = rates[i], c = charDur[i], x = r * d, common = 1 - c / x;
          obj += x - (c > 0 ? c * Math.log(x) : 0);
          gRate[i] += d * common;
          if (freeParamIdx[p] >= 0) gDate[p] += r * common;
          if (freeParamIdx[i] >= 0) gDate[i] -= r * common;
          if (p !== 0) {
            const diff = r - rates[p], penGrad = 2 * SMOOTH * diff;
            obj += SMOOTH * diff * diff; gRate[i] += penGrad; gRate[p] -= penGrad;
          }
        }
        let rMean = 0;
        for (let j = 0; j < kRoot; j++) rMean += rates[rootChildren[j]];
        rMean /= kRoot;
        for (let j = 0; j < kRoot; j++) {
          const rc = rootChildren[j], diff = rates[rc] - rMean;
          obj += (SMOOTH / kRoot) * diff * diff; gRate[rc] += (2 * SMOOTH / kRoot) * diff;
        }
        const invScale = 1 / NUMSITES;
        let gradGlobal = 0;
        for (let e = 0; e < eCount; e++) {
          const gr = gRate[edgeNodes[e]] * rates[edgeNodes[e]] * invScale;
          gradGlobal += gr; grad[1 + e] = gr * deltaScale;
        }
        grad[0] = gradGlobal;
        for (let k = fCount - 1; k >= 0; k--) {
          const u = freeNodes[k], p = nodes[u].parent, s = sigmas[k];
          grad[1 + eCount + k] = gDate[u] * (dates[p] - lowerBound[u]) * s * (1 - s) * invScale;
          if (freeParamIdx[p] >= 0) gDate[p] += gDate[u] * s;
        }
        return obj * invScale;
      }

      const sol = solver.minimize(evaluate, x0);
      evaluate(sol.x, new Float64Array(x0.length));

      function serialize(idx) {
        const nd = nodes[idx];
        const body = nd.children.length ? `(${nd.children.map(chIdx => serialize(chIdx)).join(',')})` : nd.tip;
        if (idx === 0) return `${body};`;
        return `${body}:${Number(Math.max(0, dates[nd.parent] - dates[idx]).toPrecision(12))}`;
      }
      return serialize(0);
    }

    function alignBatch(payload, { onProgress = () => {}, shouldCancel = () => false } = {}) {
      if (!payload || typeof payload !== 'object') fail('Missing cloudogram display-alignment parameters');
      if ((payload.analysis_kind ?? 'display_alignment') !== 'display_alignment')
        fail('This engine supports display_alignment only; it cannot perform de novo divergence-time inference');
      const age = payload.age;
      if (typeof age !== 'number' || !Number.isFinite(age) || age <= 0 || age > 1000000)
        fail('Fixed root age must be > 0 and <= 1,000,000');
      const trees = payload.trees;
      if (!Array.isArray(trees) || trees.length < 1 || trees.length > 100)
        fail('Between 1 and 100 trees are supported per batch');

      const datedTrees = [], constraints = [];
      for (let i = 0; i < trees.length; i++) {
        if (shouldCancel()) fail('Penalized-likelihood display alignment cancelled', 'CANCELLED');
        onProgress({ current: i + 1, total: trees.length, message: `Running penalized-likelihood display alignment: tree ${i + 1} / ${trees.length}` });
        datedTrees.push(alignSingleTree(trees[i], age, i + 1));
        constraints.push({ root_age: age, root_tips: trees[i].rootTips, shared_clades: trees[i].calibrations || [] });
      }
      return {
        engine: ENGINE, algorithm: ALGORITHM, ageUnit: 'arbitrary-calibrated-unit',
        analysis_kind: 'display_alignment', independently_estimated_gene_times: false,
        numsites: NUMSITES, numsites_is_synthetic: true, smooth: SMOOTH, seed: SEED, binary_sha256: null,
        constraints, datedTrees,
        warnings: [
          'Fixed shared-clade ages align displays; they do not estimate gene coalescence times.',
          'Synthetic numsites and fixed smoothing are display parameters, not sequence-derived inference.',
        ],
      };
    }

    return Object.freeze({ ENGINE, ALGORITHM, NUMSITES, SMOOTH, SEED, alignBatch, alignSingleTree });
  }

  const defaultInstance = defaultLbfgs ? create({ lbfgs: defaultLbfgs }) : null;
  return Object.freeze({
    ENGINE, ALGORITHM, NUMSITES, SMOOTH, SEED, create, parseSafeNewick,
    alignBatch: (...args) => (defaultInstance || create()).alignBatch(...args),
    alignSingleTree: (...args) => (defaultInstance || create()).alignSingleTree(...args),
  });
});
