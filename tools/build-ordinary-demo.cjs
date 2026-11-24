// Print an apply_patch patch; never overwrite the full regression fixtures.
// Regenerate with: node tools/build-ordinary-demo.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Conflict = require('../conflict-tree.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function extractLeadingRootingDirective('), source.indexOf('const NUMERIC_TOKEN_SOURCE')), context);
context.descendantTipLabels = node => Conflict.tipNodes(node).map(tip => tip.label);
vm.runInContext(source.slice(source.indexOf('function normalizeTipKey('), source.indexOf('function resolvedTipKey(')), context);
const mainSource = fs.readFileSync(path.join(root, 'defaults/Raxml-Chloroplast.con.tre'), 'utf8');
const supportSource = fs.readFileSync(path.join(root, 'defaults/RAxML_bipartitions.Raxml-Chloroplast'), 'utf8');
const main = context.parseNewick(mainSource, { treeIndex: 0 }); // Explicit historical consensus selection.
const support = context.parseNewick(supportSource);
const tips = Conflict.tipNodes(main);
const target = Math.round(tips.length / 3);
// Sample across the entire input traversal, rather than taking its first third.
const selected = Array.from({ length: target }, (_, i) => tips[Math.round(i * (tips.length - 1) / (target - 1))].label);
const outgroup = tips.find(tip => Conflict.normalizeTipKey(tip.label) === 'euptelea pleiosperma');
if (outgroup && !selected.includes(outgroup.label)) {
  const position = tips.indexOf(outgroup);
  const nearest = selected.map((label, index) => ({ index, distance: Math.abs(tips.findIndex(tip => tip.label === label) - position) }))
    .sort((a, b) => a.distance - b.distance)[0];
  selected[nearest.index] = outgroup.label;
}
const keys = new Set(selected.map(Conflict.normalizeTipKey));
// Use the editor's existing punctuation/outgroup-prefix alignment. Preserve
// each source's original names; their 14 historical spelling variants remain.
const alignment = context.buildTipKeyAlignment(support, main);
const mainKeys = new Set(selected.map(context.normalizeTipKey));
const supportLabels = Conflict.tipNodes(support).filter(tip =>
  mainKeys.has(alignment.keyMap.get(context.normalizeTipKey(tip.label)))).map(tip => tip.label);
if (supportLabels.length !== target) throw new Error('Compact support taxa do not match the main demo');
const supportKeys = new Set(supportLabels.map(Conflict.normalizeTipKey));
function serialize(node) {
  const children = node.children.length ? `(${node.children.map(serialize).join(',')})` : '';
  const label = node.label ? `'${node.label.replaceAll("'", "''")}'` : '';
  const comments = (node.comments || []).map(comment => `[${comment}]`).join('');
  const length = node.length === null || node.length === undefined ? '' : `:${node.length}`;
  return `${children}${label}${comments}${length}`;
}
const example = {
  originalTipCount: tips.length, tipCount: target,
  mainTree: `${serialize(Conflict.pruneToKeys(main, keys))};`,
  supportTree: `${serialize(Conflict.pruneToKeys(support, supportKeys))};`,
  retainedLabels: selected,
};
const files = {
  'defaults/ordinary-workspace.js': `// Derived demonstration only. Full 173-tip fixtures remain unchanged.\n(function (scope) {\n  const example = ${JSON.stringify(example, null, 2)};\n  scope.PhyloRenderOrdinaryExample = Object.freeze(example);\n  if (typeof module !== 'undefined' && module.exports) module.exports = example;\n})(globalThis);\n`,
  'defaults/ordinary-compact-main.nwk': `${example.mainTree}\n`,
  'defaults/ordinary-compact-support.nwk': `${example.supportTree}\n`,
};
let patch = '*** Begin Patch\n';
for (const [name, content] of Object.entries(files)) {
  patch += `*** Add File: ${path.join(root, name)}\n${content.trimEnd().split('\n').map(line => `+${line}`).join('\n')}\n`;
}
process.stdout.write(`${patch}*** End Patch\n`);
