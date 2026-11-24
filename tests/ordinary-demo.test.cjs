const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Conflict = require('../conflict-tree.js');
const example = require('../defaults/ordinary-workspace.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'core/tree-input.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const context = vm.createContext({PhyloRenderSampleIdentity:require('../core/sample-identity.js')});
vm.runInContext(source.slice(source.indexOf('function extractLeadingRootingDirective('), source.indexOf('const NUMERIC_TOKEN_SOURCE')), context);
context.descendantTipLabels = node => Conflict.tipNodes(node).map(tip => tip.label);
vm.runInContext(source.slice(source.indexOf('function normalizeTipKey('), source.indexOf('function resolvedTipKey(')), context);
const parse = text => context.parseNewick(text);

test('ordinary demonstration has 58 matched taxa, retains outgroup and full fixtures', () => {
  // Historical fixture contains two consensus trees. Explicitly choose index 0;
  // user imports without an explicit selection must reject this ambiguity.
  const fullMain = context.parseNewick(fs.readFileSync(path.join(root, 'defaults/Raxml-Chloroplast.con.tre'), 'utf8'), { treeIndex: 0 });
  const fullSupport = parse(fs.readFileSync(path.join(root, 'defaults/RAxML_bipartitions.Raxml-Chloroplast'), 'utf8'));
  assert.equal(Conflict.tipNodes(fullMain).length, 173);
  assert.equal(Conflict.tipNodes(fullSupport).length, 173);
  const main = parse(example.mainTree), support = parse(example.supportTree);
  const comparison = Conflict.compareSampleSets(main, support);
  assert.equal(example.tipCount, Math.round(example.originalTipCount / 3));
  assert.equal(comparison.nuclearCount, 58);
  assert.equal(comparison.plastidCount, 58);
  assert.equal(context.buildTipKeyAlignment(support, main).keyMap.size, 58);
  assert.equal(new Set(example.retainedLabels).size, 58);
  assert.ok(Conflict.tipNodes(main).some(tip => Conflict.normalizeTipKey(tip.label) === 'euptelea pleiosperma'));
  for (const [name, text] of [['main', example.mainTree], ['support', example.supportTree]]) {
    assert.equal(fs.readFileSync(path.join(root, `defaults/ordinary-compact-${name}.nwk`), 'utf8').trim(), text);
  }
  // Collapsed unary paths retain their summed lengths; surviving nodes retain
  // the original support labels/comments. Compare against the shared pruner.
  const keys = new Set(example.retainedLabels.map(Conflict.normalizeTipKey));
  function fingerprint(node) {
    return { label: node.label, length: node.length, comments: node.comments, children: node.children.map(fingerprint) };
  }
  assert.deepEqual(JSON.stringify(fingerprint(main)), JSON.stringify(fingerprint(Conflict.pruneToKeys(fullMain, keys))));
  const supportKeys = new Set(Conflict.tipNodes(support).map(tip => Conflict.normalizeTipKey(tip.label)));
  assert.deepEqual(JSON.stringify(fingerprint(support)), JSON.stringify(fingerprint(Conflict.pruneToKeys(fullSupport, supportKeys))));
});

test('compact demo is embedded before app and limited to the interactive default loader', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('defaults/ordinary-workspace.js') < html.indexOf('src="app.js'));
  const loader = source.slice(source.indexOf('async function loadDefaultWorkspace()'), source.indexOf('// Demonstration only:'));
  assert.match(loader, /DEFAULT_MAIN_TREE.content \|\| loadTextResource/);
  assert.doesNotMatch(loader, /DEMO_TREE|pruneToKeys/);
  const imports = source.slice(source.indexOf('function parseAndDraw('), source.indexOf('function parseAndDraw(') + 6000);
  assert.doesNotMatch(imports, /ordinary-compact|retainedLabels|pruneToKeys/);
});
