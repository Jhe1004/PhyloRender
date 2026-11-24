const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Conflict = require('../conflict-tree.js');
const example = require('../defaults/dating-workspace.js');
const synthetic = require('../defaults/dating-synthetic.js');
const input = require('../core/tree-input.js');
const cloud = require('../cloud-tree.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'core/tree-input.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function extractLeadingRootingDirective('), source.indexOf('const NUMERIC_TOKEN_SOURCE')), context);

test('real Dating demo retains a complete 27-tip clade, explicit ages, HPD and byte provenance', () => {
  const tree = context.parseNewick(example.content);
  assert.equal(Conflict.tipNodes(tree).length, 27);
  assert.equal(example.originalTipCount, 99);
  assert.deepEqual(Conflict.tipNodes(tree).map(tip => tip.label), example.retainedLabels);
  assert.equal(example.sha256, crypto.createHash('sha256').update(example.content).digest('hex'));
  assert.equal(example.sourceUnit, 'mya');
  assert.equal(example.ageSource, 'height');
  assert.match(example.content, /height_95%_HPD/);
  assert.match(tree.comments.join(' '), /height=74\.8289502975337/);
});

test('Dating default loads offline and does not enter the agent input path', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('defaults/dating-synthetic.js') < html.indexOf('src="app.js'));
  assert.doesNotMatch(html, /data-demo-src="defaults\/dating-workspace\.js/);
  const loader = source.slice(source.indexOf('async function loadDefaultDatingWorkspace()'), source.indexOf('async function loadDefaultWorkspace()'));
  assert.match(loader, /defaultRooting: false/);
  assert.doesNotMatch(loader, /fetch\(|dateCloudTrees|pruneToKeys|reroot/);
  assert.match(source, /get\("workspace"\) === "time"/);
  assert.match(source, /get\("phylorender-agent"\) !== "1"/);
});

test('original research demo preserves roundoff metadata and imports; default stays explicitly synthetic', () => {
  const original = input.parseNewick(example.content);
  const before = structuredClone(original);
  const imported = cloud.importedDatedAges(original);
  assert.equal(imported.terminalAgeValidation.accepted_tip_count, 27);
  assert.deepEqual(original, before);
  const tree = input.parseNewick(synthetic.content);
  assert.equal(synthetic.synthetic, true);
  assert.equal(Conflict.tipNodes(tree).length, 27);
  assert.equal(synthetic.sha256, crypto.createHash('sha256').update(synthetic.content).digest('hex'));
  const getAge = (node, key) => input.validateTimeAnnotations(node).ages.get(key) ?? null;
  const result = cloud.importedDatedAges(tree, {getAge});
  assert.equal(result.rootAge, 78);
  assert.ok(Conflict.tipNodes(tree).every(node => result.ages.get(node) === 0));
  assert.match(synthetic.generation, /not estimated/);
  assert.doesNotMatch(synthetic.content, /Flacourtia|StarBEAST/);
});
