/*
 * Independent PhyloRender gene-tree conflict statistics.
 *
 * This is a clean implementation of the published rooted-clade comparison
 * method.  It contains no PhyParts source code and does not require Java.
 * Inputs are the safe T00000 Newick dialect produced by gene-preparation.js.
 */
(function exposePhyPartsEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhyloRenderPhyParts=api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPhyPartsEngine() {
  'use strict';

  const ENGINE = 'PhyloRender-conflict-statistics';
  const ALGORITHM = 'phylorender-conflict-statistics-v2';
  const TOKEN = /T\d{5}|[(),;]|(?:\d+(?:\.\d*)?|\.\d+)/g;
  const SAFE_TREE = /^[T0-9(),.;]+$/;

  function fail(message, code = 'PHYPARTS_INPUT_INVALID') {
    throw Object.assign(new Error(message), { code });
  }

  function parseTree(text) {
    if (typeof text !== 'string' || text.length < 8 || text.length > 200000 || !SAFE_TREE.test(text))
      fail('Serialized concordance tree must use safe internal taxon indices');
    const tokens = text.match(TOKEN) || [];
    if (tokens.join('') !== text.trim()) fail('Serialized concordance tree contains unsupported tokens');
    let cursor = 0;
    function subtree() {
      const token = tokens[cursor++];
      if (!token) fail('Unexpected end of serialized concordance tree');
      if (token.startsWith('T')) return { tip: Number(token.slice(1)), children: [], support: null, mask: 0n };
      if (token !== '(') fail('Malformed serialized concordance tree');
      const children = [subtree()];
      while (tokens[cursor] === ',') { cursor++; children.push(subtree()); }
      if (tokens[cursor++] !== ')') fail('Unbalanced parentheses in serialized concordance tree');
      const value = tokens[cursor];
      let support = null;
      if (value && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
        support = Number(value); cursor++;
        if (!Number.isFinite(support) || support < 0 || support > 1) fail('Branch support values must be normalized to [0, 1]');
      }
      return { tip: null, children, support, mask: 0n };
    }
    const tree = subtree();
    if (tokens[cursor++] !== ';' || cursor !== tokens.length) fail('Incomplete trailing semicolon in serialized concordance tree');
    return tree;
  }

  function bitCount(value) {
    let count = 0;
    while (value) { value &= value - 1n; count++; }
    return count;
  }

  function indexTree(tree, taxonCount, requireComplete) {
    const seen = new Set();
    const internals = [];
    function visit(node, isRoot = false) {
      if (!node.children.length) {
        if (!Number.isInteger(node.tip) || node.tip < 0 || node.tip >= taxonCount)
          fail('Concordance tree contains a taxon index absent from the species tree');
        if (seen.has(node.tip)) fail('Concordance tree contains duplicate taxa');
        seen.add(node.tip); node.mask = 1n << BigInt(node.tip); return node.mask;
      }
      if (!isRoot) internals.push(node);
      let mask = 0n;
      for (const child of node.children) mask |= visit(child);
      node.mask = mask;
      return mask;
    }
    const mask = visit(tree, true);
    if (seen.size < 3) fail('Concordance tree contains fewer than 3 taxa');
    if (requireComplete && seen.size !== taxonCount) fail('Species tree does not match the taxon index table');
    return { mask, internals, count: seen.size };
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') fail('Missing concordance analysis parameters');
    const { species, genes, names } = payload;
    const threshold = payload.threshold ?? 0;
    const mode = payload.mode ?? 'four';
    if (!Array.isArray(names) || names.length < 3 || names.length > 1000
      || names.some(name => typeof name !== 'string' || !name.trim() || name.length > 1000 || /[\t\n\r;]/.test(name))
      || new Set(names).size !== names.length) fail('Species-tree tip labels are missing, duplicated, or contain delimiter characters');
    if (!Array.isArray(genes) || genes.length < 1 || genes.length > 20000)
      fail('Between 1 and 20,000 comparable gene trees are supported per run');
    if (genes.some(tree => typeof tree !== 'string') || genes.reduce((sum, tree) => sum + tree.length, 0) > 120000000)
      fail('Serialized gene-tree text exceeds the 120 MB safety limit; partial statistics were not used');
    if (typeof species !== 'string') fail('Missing species tree');
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold >= 1)
      fail('Branch support threshold must be >= 0 (no filter) and < 1');
    if (!['two', 'four'].includes(mode)) fail('Pie display mode must be "two" or "four"');
    return { species, genes, names, threshold, mode };
  }

  function compatibleMasks(left, right) {
    const overlap = left & right;
    return overlap === 0n || overlap === left || overlap === right;
  }

  function addAlternative(target, constraint, geneIndex) {
    const key = `${constraint.scope.toString(16)}:${constraint.clade.toString(16)}`;
    const group = target.alternativeMap.get(key);
    if (group) group.genes.add(geneIndex);
    else {
      const created = { key, constraint, genes: new Set([geneIndex]) };
      target.alternativeMap.set(key, created);
      target.alternatives.push(created);
    }
  }

  function groupCount(group) { return group.fullCount || group.genes.size; }

  function dominantAlternative(groups, shouldCancel) {
    if (!groups.length) return 0;
    // With one common taxon scope, containment is possible only for an exact
    // clade match; exact matches were already merged by addAlternative.  This
    // avoids quadratic bin scans for large complete-taxon tree collections.
    if (groups.every(group => group.constraint.scope === groups[0].constraint.scope)) {
      let maximum = 0;
      for (const group of groups) maximum = Math.max(maximum, groupCount(group));
      return maximum;
    }
    // An observed ingroup defines a candidate; pool only its observed outside
    // exclusions. Missing samples do not split the same phylogenetic statement.
    const candidates = new Map(), scopes = new Map();
    for (const group of groups) {
      const { clade, scope } = group.constraint;
      candidates.set(clade, (candidates.get(clade) || 0n) | scope);
      if (!scopes.has(scope)) scopes.set(scope, new Map());
      scopes.get(scope).set(clade, groupCount(group));
    }
    let maximum = 0, comparisons = 0;
    for (const [clade, candidateScope] of candidates) {
      let count = 0;
      for (const [scope, observed] of scopes) {
        if (++comparisons % 4096 === 0 && shouldCancel()) fail('Concordance analysis cancelled', 'CANCELLED');
        // Both the observed ingroup and its outside must be contained in the
        // candidate. A partial split may support several incompatible candidates.
        if ((scope & candidateScope) !== scope) continue;
        // A gene has exactly one scope and one matching projected clade, so it
        // contributes once per candidate even if other edges also conflict.
        count += observed.get(clade & scope) || 0;
      }
      maximum = Math.max(maximum, count);
    }
    return maximum;
  }

  function analyze(rawPayload, { onProgress = () => {}, shouldCancel = () => false } = {}) {
    const started = Date.now();
    const payload = validatePayload(rawPayload);
    const speciesTree = parseTree(payload.species);
    const species = indexTree(speciesTree, payload.names.length, true);
    const targets = species.internals.map((node, index) => ({
      index, mask: node.mask, size: bitCount(node.mask), samples: [],
      concordant: 0, conflict: 0, alternatives: [], alternativeMap: new Map(),
    }));
    for (const target of targets) {
      for (let index = 0; index < payload.names.length; index++)
        if (target.mask & (1n << BigInt(index))) target.samples.push(payload.names[index]);
      target.samples.sort();
    }
    // Complete-taxon gene clades are counted once globally.  Materializing
    // them separately for every species node can require millions of objects;
    // filtering this compact map per target gives exactly the same bins.
    const completeClades = new Map();

    for (let geneIndex = 0; geneIndex < payload.genes.length; geneIndex++) {
      if (shouldCancel()) fail('Concordance analysis cancelled', 'CANCELLED');
      const geneTree = parseTree(payload.genes[geneIndex]);
      const gene = indexTree(geneTree, payload.names.length, false);
      const clades = [];
      const cladeKeys = new Set();
      for (const node of gene.internals) {
        if (bitCount(node.mask) < 2 || bitCount(gene.mask ^ node.mask) < 1) continue;
        if (payload.threshold > 0 && !(node.support !== null && node.support > payload.threshold)) continue;
        const key = node.mask.toString(16);
        if (!cladeKeys.has(key)) { cladeKeys.add(key); clades.push(node.mask); }
      }
      const complete = gene.mask === species.mask;
      if (complete) for (const clade of clades) {
        const key = clade.toString(16), prior = completeClades.get(key);
        if (prior) prior.fullCount++;
        else completeClades.set(key, { key: `${species.mask.toString(16)}:${key}`,
          constraint: { clade, scope: species.mask }, fullCount: 1, genes: null });
      }

      const restricted = targets.map(target => target.mask & gene.mask);
      const owners = new Map();
      for (let index = 0; index < targets.length; index++) {
        const mask = restricted[index];
        if (bitCount(mask) < 2 || bitCount(gene.mask ^ mask) < 1) continue;
        const key = mask.toString(16), previous = owners.get(key);
        if (previous === undefined || targets[index].size < targets[previous].size) owners.set(key, index);
      }

      for (let index = 0; index < targets.length; index++) {
        const target = targets[index], mask = restricted[index];
        const key = mask.toString(16);
        if (bitCount(mask) < 2 || bitCount(gene.mask ^ mask) < 1) continue;
        // Missing taxa can collapse several nested species branches into one
        // observable clade.  A matching gene clade belongs to the most
        // specific original branch only; an incompatible gene split is still
        // evidence against every informative species branch it crosses.
        if (cladeKeys.has(key)) {
          if (owners.get(key) === index) target.concordant++;
          continue;
        }
        const conflicts = clades.filter(clade => !compatibleMasks(mask, clade));
        if (!conflicts.length) continue;
        target.conflict++;
        if (!complete) for (const clade of conflicts)
          addAlternative(target, { clade, scope: gene.mask }, geneIndex);
      }
      if (geneIndex % 64 === 0 || geneIndex + 1 === payload.genes.length)
        onProgress({ current: geneIndex + 1, total: payload.genes.length });
    }

    const header = 'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tconflict_total_N\tno_signal_N\tinformative_N\tdescendant_samples';
    const lines = targets.map(target => {
      if (shouldCancel()) fail('Concordance analysis cancelled', 'CANCELLED');
      const groups = [...target.alternatives];
      for (const group of completeClades.values())
        if (!compatibleMasks(target.mask, group.constraint.clade)) groups.push(group);
      const dominant = dominantAlternative(groups, shouldCancel);
      if (dominant > target.conflict || target.concordant + target.conflict > payload.genes.length)
        fail('Concordance counts violate total gene-tree denominator invariants', 'PHYPARTS_RESULT_INVALID');
      const noSignal = payload.genes.length - target.concordant - target.conflict;
      return [`Node${target.index}`, target.concordant, dominant, target.conflict - dominant,
        target.conflict, noSignal, target.concordant + target.conflict, target.samples.join(';')].join('\t');
    });
    return {
      engine: ENGINE, algorithm: ALGORITHM, table: [header, ...lines, ''].join('\n'),
      geneCount: payload.genes.length, threshold: payload.threshold, mode: 'four',
      requestedDisplayMode: payload.mode, elapsedSeconds: Math.round((Date.now() - started) / 100) / 10,
    };
  }

  return Object.freeze({ ENGINE, ALGORITHM, analyze, parseTree, validatePayload, compatibleMasks });
});
