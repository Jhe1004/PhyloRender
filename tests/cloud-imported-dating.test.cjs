const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../cloud-tree.js');
const tip = (label, length) => ({ label, length, children: [] });
const node = (length, ...children) => ({ length, children });
const fixture = () => node(null, tip('O', 73.5), node(29.5,
  node(32, tip('A', 12), tip('B', 12)), node(23, tip('C', 21), tip('D', 21))));
const getAge = (node, key) => node[key] ?? null;

test('imported treePL or MCMCtree time branches retain their original age scale and nodes', () => {
  const root = fixture(), before = JSON.stringify(root);
  const result = cloud.importedDatedAges(root);
  assert.equal(result.rootAge, 73.5);
  assert.equal(result.ageSource, 'branch_lengths');
  assert.equal(result.ages.get(root.children[1]), 44);
  assert.equal(result.ages.get(root.children[1].children[0]), 12);
  assert.equal(JSON.stringify(root), before);
});

test('BEAST complete height fields are used without fitting or mixing summaries', () => {
  const root = fixture(), internal = [...cloud.nodeClades(root).keys()];
  const branchAges = cloud.importedDatedAges(root).ages;
  internal.forEach(node => { node.height = branchAges.get(node); node.height_mean = node.height + 1; node.length = null; });
  const before = JSON.stringify(root);
  assert.equal(cloud.importedDatedAges(root, { getAge }).rootAge, 73.5);
  assert.equal(cloud.importedDatedAges(root, { getAge, ageSource: 'height_mean' }).rootAge, 74.5);
  assert.equal(JSON.stringify(root), before);
});

test('partial height metadata falls back to full time lengths without mixing ages', () => {
  const root = fixture(); root.height = 99;
  const result = cloud.importedDatedAges(root, { getAge });
  assert.equal(result.rootAge, 73.5); assert.ok(result.warnings.length);
  assert.throws(() => cloud.importedDatedAges(root, { getAge, ageSource: 'height' }), /missing on some internal nodes/i);
});

test('posterior intervals and support labels are not treated as node ages', () => {
  const root = fixture(); root.label = '100'; root.hpd = [50, 90];
  assert.equal(cloud.importedDatedAges(root, { getAge }).rootAge, 73.5);
});

test('dated input rejects non-ultrametric, missing, negative or identity-invalid data', () => {
  let root = fixture(); root.children[0].length = 90;
  assert.throws(() => cloud.importedDatedAges(root), /ultrametric/i);
  root = fixture(); root.children[0].length = null;
  assert.throws(() => cloud.importedDatedAges(root), /missing|invalid/i);
  root = fixture(); root.children[0].length = -1;
  assert.throws(() => cloud.importedDatedAges(root), /negative/i);
  root = fixture(); root.children[0].label = 'A';
  assert.throws(() => cloud.importedDatedAges(root), /unique|duplicate/i);
  root = fixture(); root.rootingDirective = 'unrooted';
  assert.throws(() => cloud.importedDatedAges(root), /unrooted/i);
});

test('BEAST inverted ages and serial-sampling tips cannot be silently repaired', () => {
  const root = fixture();
  const ages = cloud.importedDatedAges(root).ages;
  [...cloud.nodeClades(root).keys()].forEach(node => node.height = ages.get(node));
  root.children[1].height = 80;
  assert.throws(() => cloud.importedDatedAges(root, { getAge }), /inversion/i);
  root.children[1].height = 44; root.children[0].height = 1;
  assert.throws(() => cloud.importedDatedAges(root, { getAge }), /contemporaneous|non-zero/i);
});

test('rounding noise is tolerated but meaningful path differences are rejected', () => {
  const root = fixture(); root.children[0].length += 0.00001;
  assert.ok(Math.abs(cloud.importedDatedAges(root).rootAge - 73.5) < 0.00001);
  root.children[0].length += 0.01;
  assert.throws(() => cloud.importedDatedAges(root), /ultrametric/i);
});

test('genes inherit imported root, ingroup crown and all identical internal clades', () => {
  const root = fixture(), ages = cloud.importedDatedAges(root).ages, gene = fixture();
  const constraints = cloud.sharedAgeCalibrations(root, ages, gene, cloud.sampleProfile(root).names);
  assert.deepEqual(constraints.map(item => item.age).sort((a, b) => a - b), [12, 21, 44]);
  assert.equal(ages.get(root), 73.5);
});
