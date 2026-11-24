// Print an apply_patch patch to embed an unchanged local dated-tree example.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Conflict = require('../conflict-tree.js');
const file = process.argv[2];
if (!file) throw new Error('Usage: node tools/build-dating-demo.cjs INPUT.tree');
const sourceContent = fs.readFileSync(file, 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function extractLeadingRootingDirective('), app.indexOf('const NUMERIC_TOKEN_SOURCE')), context);
const full = context.parseNewick(sourceContent);
const candidates = [];
function count(node) {
  const n = node.children.length ? node.children.reduce((sum, child) => sum + count(child), 0) : 1;
  if (n >= 12 && n <= 32) candidates.push({ node, n });
  return n;
}
const originalTipCount = count(full);
const selected = candidates.sort((a, b) => b.n - a.n)[0];
if (!selected) throw new Error('No suitable complete clade for a lightweight Dating demo');
function serialize(node) {
  const children = node.children.length ? `(${node.children.map(serialize).join(',')})` : '';
  const label = node.label ? `'${node.label.replaceAll("'", "''")}'` : '';
  const comments = (node.comments || []).map(comment => `[${comment}]`).join('');
  const length = node.length == null ? '' : `:${node.length}`;
  return children + label + comments + length;
}
const content = `[&R] ${serialize(selected.node)};\n`;
const example = {
  name: 'StarBEAST3_MCC_complete_clade_demo.tree',
  description: `Salicaceae StarBEAST3 MCC · complete subclade (${selected.n} taxa)`,
  originalTipCount, tipCount: selected.n, sourceUnit: 'mya', ageSource: 'height',
  sourceSha256: crypto.createHash('sha256').update(sourceContent).digest('hex'),
  retainedLabels: Conflict.tipNodes(selected.node).map(tip => tip.label),
  sha256: crypto.createHash('sha256').update(content).digest('hex'),
  content,
};
const code = `// Complete clade extracted from a formal MCC for lightweight demonstration.\n// Original source is unchanged; retained topology, ages, HPD and lengths are preserved.\n(function (scope) {\n  const example = ${JSON.stringify(example, null, 2)};\n  scope.PhyloRenderDatingExample = Object.freeze(example);\n  if (typeof module !== 'undefined' && module.exports) module.exports = example;\n})(globalThis);\n`;
const target = path.resolve(__dirname, '../defaults/dating-workspace.js');
const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').trimEnd().split('\n').map(line => '-' + line).join('\n') : null;
process.stdout.write(`*** Begin Patch\n${old ? `*** Update File: ${target}\n@@\n${old}\n` : `*** Add File: ${target}\n`}${code.trimEnd().split('\n').map(line => '+' + line).join('\n')}\n*** End Patch\n`);
