const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../cloud-tree.js');

let id = 0;
test('cloud pie time range validates bounds, includes edges and never converts ages', () => {
  assert.deepEqual(cloud.pieAgeRange('', ' '), { minimum: null, maximum: null });
  assert.deepEqual(cloud.pieAgeRange('2.5', 7), { minimum: 2.5, maximum: 7 });
  const range = cloud.pieAgeRange(2.5, 7);
  for (const age of [2.5, 3, 7, 7 + 1e-11]) assert.equal(cloud.pieAgeWithinRange(age, range), true);
  for (const age of [0, 2.4, 7.1, NaN, Infinity, -1]) assert.equal(cloud.pieAgeWithinRange(age, range), false);
  assert.equal(cloud.pieAgeWithinRange(0, cloud.pieAgeRange()), true);
  assert.equal(cloud.pieAgeWithinRange(10, cloud.pieAgeRange(3)), true);
  assert.equal(cloud.pieAgeWithinRange(1, cloud.pieAgeRange(null, 3)), true);
  assert.equal(cloud.pieAgeWithinRange(3, cloud.pieAgeRange(3, 3)), true);
  assert.throws(() => cloud.pieAgeRange(4, 2), /exceed|minimum|younger/i);
  for (const value of [-1, NaN, Infinity, 'wrong']) assert.throws(() => cloud.pieAgeRange(value), /finite|non-negative|age/i);
});
const tip = (label, length = 1) => ({ id: ++id, label, length, children: [] });
const node = (...children) => ({ id: ++id, label: '', length: 1, children });

test('pie candidate search exposes cancellation boundaries without changing inputs', () => {
  const items = Array.from({length: 100}, (_, id) => ({node: {id}, x: 100 + id * 17, y: 100, age: 10}));
  const before = JSON.stringify(items);
  const steps = cloud.layoutPiePlacementSteps(items, [], 25, [], 10);
  for (let i = 0; i < 200; i++) assert.equal(steps.next().done, false);
  steps.return();
  assert.equal(JSON.stringify(items), before);
});

test('cooperative pie search keeps the frozen synchronous positions and radii exactly', () => {
  const nodes = Array.from({length: 6}, (_, id) => ({id}));
  const items = nodes.map((node, i) => ({node, x: 100 + i * 17, y: 100 + i % 2 * 12, age: 10 - i * 1.5}));
  const branches = [{x1:75,y1:80,x2:210,y2:125},{x1:175,y1:70,x2:175,y2:180}];
  const boxes = [{x:185,y:110,width:50,height:12}];
  const expected = [[0,{x:100,y:116,radius:25,anchorX:100,anchorY:100}],
    [1,{x:117,y:64,radius:23.3125,anchorX:117,anchorY:112}],
    [2,{x:134,y:148,radius:19,anchorX:134,anchorY:100}],
    [3,{x:151,y:88,radius:16,anchorX:151,anchorY:112}],
    [4,{x:190.62741699796953,y:77.37258300203048,radius:16,anchorX:168,anchorY:100}],
    [5,{x:218.94112549695427,y:145.94112549695427,radius:16.5625,anchorX:185,anchorY:112}]];
  const steps = cloud.layoutPiePlacementSteps(items, branches, 25, boxes, 10);
  let result, yields = 0;
  while (!(result = steps.next()).done) yields++;
  assert.ok(yields > 1000);
  assert.deepEqual([...result.value].map(([node,p]) => [node.id,p]), expected);
  assert.deepEqual([...cloud.layoutPiePlacements(items,branches,25,boxes,10)].map(([node,p])=>[node.id,p]), expected);
});

test('cooperative cloud optimization preserves the frozen 78-stage geometry exactly', () => {
  let serial = 0;
  const t = label => ({ id: ++serial, label, length: 1, children: [] });
  const n = (...children) => ({ id: ++serial, label: '', length: 1, children });
  const root = n(n(n(t('F'), n(t('C'), t('E'))), n(t('B'), n(t('G'), t('H')))), n(t('A'), t('D')));
  const before = JSON.stringify(root), ages = cloud.relativeAges(root, 10).ages, ageBefore = [...ages];
  const expected = [[1,184],[2,112],[3,160],[4,136],[5,164.8],[6,88],[7,208],[8,232],[9,220],[10,154],[11,159.4],[12,64],[13,136],[14,100],[15,129.7]];
  const steps = cloud.optimizeAlignedRowsSteps(root, [...'ABCDEFGH'], ages, 10);
  let next, yields = 0;
  while (!(next = steps.next()).done) yields++;
  assert.ok(yields > 100, 'candidate work exposes interruption boundaries');
  assert.deepEqual([...next.value].map(([item, y]) => [item.id, y]), expected);
  assert.deepEqual([...cloud.optimizeAlignedRows(root, [...'ABCDEFGH'], ages, 10)].map(([item, y]) => [item.id, y]), expected);
  const cancelled = cloud.optimizeAlignedRowsSteps(root, [...'ABCDEFGH'], ages, 10);
  cancelled.next(); cancelled.next(); cancelled.return();
  assert.equal(JSON.stringify(root), before);
  assert.deepEqual([...ages], ageBefore);
});

test('cloud row cache invalidates each geometry input and never commits a cancelled search', () => {
  let searches = 0;
  const engine = require('../render/cloud-branches.js').create({svgEl:()=>{},model:{ *optimizeAlignedRowsSteps() {
    searches++; yield; return new Map([['finished', searches]]);
  } } });
  const root = {id: 1}, child = {id: 2}, ages = new Map([[root, 10], [child, 0]]);
  const run = (order = ['A','B'], age = 10, top = 64, step = 24, tree = root) => {
    const iterator = engine.alignedRowSteps(tree, order, ages, age, top, step);
    let result; do { result = iterator.next(); } while (!result.done); return result.value;
  };
  const first = run(); assert.equal(run(), first); assert.equal(searches, 1);
  run(['B','A']); run(['A','B'], 11); run(['A','B'], 10, 65); run(['A','B'], 10, 64, 25);
  ages.set(child, 1); run(); run(['A','B'], 10, 64, 24, {});
  assert.equal(searches, 7);
  const fresh = {};
  const cancelled = engine.alignedRowSteps(fresh, ['A','B'], ages, 10, 64, 24);
  cancelled.next(); cancelled.return(); run(['A','B'], 10, 64, 24, fresh);
  assert.equal(searches, 9, 'abandoned rows are not available as a complete cache result');
});

test('cloud ladderization is recursive, stable and reversible without mutating biological nodes', () => {
  const species = node(node(node(tip('A'), tip('B')), tip('C')), tip('O'), node(tip('D'), tip('E')));
  const before = JSON.stringify(species);
  const originalTips = cloud.tips(species);
  const names = direction => cloud.orderedTips(species, direction).map(tip => tip.label);
  assert.deepEqual(names('file'), ['A', 'B', 'C', 'O', 'D', 'E']);
  assert.deepEqual(names('small-top'), ['O', 'D', 'E', 'C', 'A', 'B']);
  assert.deepEqual(names('large-top'), ['A', 'B', 'C', 'D', 'E', 'O']);
  assert.equal(JSON.stringify(species), before);
  assert.deepEqual(cloud.orderedTips(species, 'file'), originalTips);
  cloud.orderedTips(species, 'small-top').forEach(tip => assert.ok(originalTips.includes(tip)));
  assert.throws(() => cloud.orderedTips(species, 'unknown'), /ladderiz/i);
});

test('all discordant cloud layers follow each species ladder order with unchanged ages and clades', () => {
  const species = node(node(tip('A'), tip('B')), tip('C'));
  const gene = node(node(tip('B'), tip('C')), tip('A'));
  const speciesBefore = JSON.stringify(species), geneBefore = JSON.stringify(gene);
  const ages = cloud.relativeAges(gene, 10).ages;
  const agesBefore = [...ages];
  for (const direction of ['file', 'small-top', 'large-top']) {
    const order = cloud.orderedTips(species, direction).map(tip => tip.label);
    const ys = cloud.optimizeAlignedRows(gene, order, ages, 10);
    cloud.tips(gene).forEach(tip => assert.equal(ys.get(tip), 64 + order.indexOf(tip.label) * 24));
  }
  assert.deepEqual([...ages], agesBefore);
  assert.equal(JSON.stringify(species), speciesBefore);
  assert.equal(JSON.stringify(gene), geneBefore);
});

test('cloud trees require identical unique raw tip names, not merely the same count', () => {
  const species = node(tip('A'), tip('B'), tip('C'));
  assert.equal(cloud.compareSamples(species, node(tip('C'), tip('A'), tip('B'))).accepted, true);
  const different = cloud.compareSamples(species, node(tip('A'), tip('B'), tip('D')));
  assert.equal(different.accepted, false);
  assert.deepEqual(different.missing, ['C']);
  assert.deepEqual(different.extra, ['D']);
  assert.equal(cloud.compareSamples(species, node(tip('A'), tip('A'), tip('C'))).accepted, false);
});

test('relative display age pins root and tips without claiming absolute dating', () => {
  const species = node(tip('A', 3), node(tip('B', 1), tip('C', 2)));
  const result = cloud.relativeAges(species, 10);
  assert.equal(result.ages.get(species), 10);
  cloud.tips(species).forEach(item => assert.equal(result.ages.get(item), 0));
  assert.ok(result.ages.get(species.children[1]) > 0);
  assert.match(result.method, /display/);
  assert.throws(() => cloud.relativeAges(node(tip('A', -1), tip('B')), 10), /negative.*branch length/i);
});

test('cloud ML gate rejects raw ASTRAL but permits ASTRAL topology with verified ML lengths', () => {
  const ml = node(tip('A', .01), tip('B', .02), tip('C', .03));
  assert.throws(() => cloud.validateMlInput(ml), /confirm|method|source/i);
  assert.deepEqual(cloud.validateMlInput(ml, { method: 'ml', filename: 'iqtree.treefile' }),
    { terminalCount: 3, zeroTerminalCount: 0 });
  assert.throws(() => cloud.validateMlInput(ml, { method: 'coalescent' }), /maximum[- ]likelihood|ML/i);
  assert.throws(() => cloud.validateMlInput(ml, { method: 'ml', filename: 'ASTRAL_species.tree' }), /ASTRAL/);
  assert.deepEqual(cloud.validateMlInput(ml, { method: 'ml', filename: 'ASTRAL固定拓扑_超级矩阵ML枝长.tree', rawText: '[&pp1=0.9]' }),
    { terminalCount: 3, zeroTerminalCount: 0 });
  assert.throws(() => cloud.validateMlInput(ml, { method: 'coalescent', filename: 'ASTRAL固定拓扑_超级矩阵ML枝长.tree' }), /maximum[- ]likelihood|ML/i);
  assert.throws(() => cloud.validateMlInput(ml, { method: 'ml', rawText: '[&height=12,height_95%_HPD={10,14}]' }), /time-calibrated|dated|chronogram/i);
  assert.throws(() => cloud.validateMlInput(ml, { method: 'ml', rawText: '[&pp1=0.9]' }), /ASTRAL/);
});

test('cloud ML gate blocks zero or missing terminal lengths even if mislabeled as ML', () => {
  const astral = node(tip('A', 0), tip('B', 0), tip('C', 0));
  assert.throws(() => cloud.validateMlInput(astral, { method: 'ml', filename: 'renamed.tree' }), /3\/3 terminal/i);
  const partial = node(tip('A', .01), tip('B', null), tip('C', .03));
  assert.throws(() => cloud.validateMlInput(partial, { method: 'ml' }), { code: 'TREE_MISSING_BRANCH_LENGTH' });
  const largelyZero = node(tip('A', 0), tip('B', 0), tip('C', 0), tip('D', 0), tip('E', .01));
  assert.throws(() => cloud.validateMlInput(largelyZero, { method: 'ml' }), /4\/5 terminal/i);
});

test('species and discordant gene trees share exact terminal rows without rewriting topology', () => {
  const species = node(node(tip('A'), tip('B')), tip('C'));
  const gene = node(node(tip('A'), tip('C')), tip('B'));
  const order = cloud.tips(species).map(item => item.label);
  const speciesRows = cloud.alignedRows(species, order);
  const geneRows = cloud.alignedRows(gene, order);
  for (const label of order) {
    const speciesTip = cloud.tips(species).find(item => item.label === label);
    const geneTip = cloud.tips(gene).find(item => item.label === label);
    assert.equal(speciesRows.get(speciesTip), geneRows.get(geneTip));
  }
  assert.equal(geneRows.get(gene.children[0]), (speciesRows.get(species.children[0].children[0]) + speciesRows.get(species.children[1])) / 2);
  assert.deepEqual(cloud.tips(gene).map(item => item.label), ['A', 'C', 'B']);
  assert.throws(() => cloud.alignedRows(node(tip('A'), tip('D')), order), /mismatch|differ|absent|match/i);
});

test('treePL payload strips support labels, uses safe IDs, and maps dated nodes by clade', () => {
  const species = node(node(tip('A sample', .1), tip('B_sample', .2)), node(tip('C', .2), tip('D', .1)));
  species.children[0].label = '99/1.0';
  const names = cloud.tips(species).map(item => item.label);
  const input = cloud.treePLInput(species, names);
  assert.equal(input.newick, '((T00001:0.1,T00002:0.2):1,(T00003:0.2,T00004:0.1):1);');
  assert.deepEqual(input.rootTips, ['T00001', 'T00003']);
  const dated = node(node(tip('T00002', 3), tip('T00001', 3)), node(tip('T00004', 4), tip('T00003', 4)));
  dated.children[0].length = 7;
  dated.children[1].length = 6;
  const ages = cloud.agesFromDatedTree(species, dated, names, 10);
  assert.equal(ages.get(species), 10);
  assert.equal(ages.get(species.children[0]), 3);
  assert.equal(ages.get(species.children[1]), 4);
  cloud.tips(species).forEach(item => assert.equal(ages.get(item), 0));
  const wrong = node(node(tip('T00001', 3), tip('T00003', 3)), node(tip('T00002', 4), tip('T00004', 4)));
  wrong.children[0].length = 7; wrong.children[1].length = 6;
  assert.throws(() => cloud.agesFromDatedTree(species, wrong, names, 10), /topology|clade/i);
});

test('shared age constraints include the ingroup crown but never a conflicting clade', () => {
  const ingroup = node(node(tip('B'), tip('C')), tip('D'));
  const species = node(tip('A'), ingroup);
  const speciesAges = new Map([[species, 10], [ingroup, 7], [ingroup.children[0], 3]]);
  const sameIngroup = node(node(tip('C'), tip('D')), tip('B'));
  const gene = node(tip('A'), sameIngroup);
  const names = ['A', 'B', 'C', 'D'];
  const calibrations = cloud.sharedAgeCalibrations(species, speciesAges, gene, names);
  assert.equal(calibrations.length, 1);
  assert.equal(calibrations[0].age, 7);
  assert.deepEqual(calibrations[0].tips, ['T00003', 'T00002']);
  const geneAges = new Map([[gene, 10], [sameIngroup, 7], [sameIngroup.children[0], 4]]);
  cloud.verifySharedAges(gene, geneAges, calibrations, 10);
  geneAges.set(sameIngroup, 6.9);
  assert.throws(() => cloud.verifySharedAges(gene, geneAges, calibrations, 10), /shared.*clade|constraint|calibration/i);
});

test('all exact shared non-root clades inherit the species-tree ages', () => {
  const left = node(tip('A'), tip('B'));
  const right = node(tip('C'), tip('D'));
  const species = node(left, right);
  const gene = node(node(tip('B'), tip('A')), node(tip('D'), tip('C')));
  const ages = new Map([[species, 10], [left, 4], [right, 6]]);
  const calibrations = cloud.sharedAgeCalibrations(species, ages, gene, ['A', 'B', 'C', 'D']);
  assert.deepEqual(calibrations.map(item => item.age), [4, 6]);
  assert.throws(() => cloud.sharedAgeCalibrations(species, ages,
    node(node(tip('A'), tip('X')), node(tip('C'), tip('D'))), ['A', 'B', 'C', 'D']), /mismatch|differ|absent|match/i);
});

test('triangular branch optimizer keeps every terminal fixed and internal nodes between children', () => {
  const root = node(node(tip('A'), tip('C')), node(tip('B'), tip('D')));
  const ages = new Map();
  ages.set(root, 10);
  root.children.forEach(child => ages.set(child, 4));
  cloud.tips(root).forEach(item => ages.set(item, 0));
  const rows = cloud.optimizeAlignedRows(root, ['A', 'B', 'C', 'D'], ages, 10);
  assert.deepEqual(cloud.tips(root).map(item => rows.get(item)), [64, 112, 88, 136]);
  [root, ...root.children].forEach(item => {
    const children = item.children.map(child => rows.get(child));
    assert.ok(rows.get(item) >= Math.min(...children) && rows.get(item) <= Math.max(...children));
  });
  assert.deepEqual(cloud.tips(root).map(item => item.label), ['A', 'C', 'B', 'D']);
});

test('a discordant tree can move internal junctions off the midpoint without moving tips', () => {
  const ce = node(tip('C'), tip('E'));
  const gh = node(tip('G'), tip('H'));
  const fce = node(tip('F'), ce);
  const bgh = node(tip('B'), gh);
  const deep = node(fce, bgh);
  const ad = node(tip('A'), tip('D'));
  const root = node(deep, ad);
  const ages = new Map([[root, 10.295], [deep, 7.181], [fce, 5.742], [bgh, 4.908],
    [ce, 1.364], [gh, 3.183], [ad, 3.875]]);
  cloud.tips(root).forEach(item => ages.set(item, 0));
  const order = 'ABCDEFGH'.split('');
  const midpoint = cloud.alignedRows(root, order);
  const adjusted = cloud.optimizeAlignedRows(root, order, ages, 10.295);
  assert.ok(Math.abs(adjusted.get(fce) - midpoint.get(fce)) > 1);
  cloud.tips(root).forEach(item => assert.equal(adjusted.get(item), midpoint.get(item)));
  for (const item of [root, deep, fce, bgh, ce, gh, ad]) {
    const childRows = item.children.map(child => adjusted.get(child));
    assert.ok(adjusted.get(item) >= Math.min(...childRows) && adjusted.get(item) <= Math.max(...childRows));
  }
});

test('isolated pies reach the larger default and adjacent pies move instead of becoming dots', () => {
  const a = { id: 'A' }, b = { id: 'B' };
  const isolated = cloud.layoutPiePlacements([{ node: a, x: 100, y: 100 }], [], 32);
  assert.equal(isolated.get(a).radius, 32);
  assert.equal(isolated.get(a).x, 100);
  const close = cloud.layoutPiePlacements([{ node: a, x: 100, y: 100 }, { node: b, x: 113, y: 100 }], [], 32);
  const pa = close.get(a), pb = close.get(b);
  assert.ok(pa.radius >= 8 && pb.radius >= 8);
  assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= pa.radius + pb.radius + 2);
  assert.equal(pb.anchorX, 113);
  assert.ok(pa.x !== 100 || pb.x !== 113 || pa.y !== 100 || pb.y !== 100);
  assert.equal(cloud.layoutPiePlacements([{ node: a, x: 100, y: 100 }], [], 3).get(a).radius, 8,
    'even a stale slider value cannot turn a pie back into a dot');
});

test('pie targets increase smoothly with node age, not descendant count', () => {
  const small = node(tip('A'), tip('B'));
  const medium = node(tip('C'), tip('D'), tip('E'), tip('F'));
  const deep = node(...Array.from({ length: 16 }, (_, index) => tip(`D${index}`)));
  assert.equal(cloud.pieTargetRadius(0, 10, 20), 11);
  assert.equal(cloud.pieTargetRadius(5, 10, 20), 15.5);
  assert.equal(cloud.pieTargetRadius(10, 10, 20), 20);
  assert.equal(cloud.pieTargetRadius(12, 10, 20), 20);
  assert.equal(cloud.pieTargetRadius(5e6, 10e6, 20), 15.5, 'time units cancel');
  assert.equal(cloud.pieTargetRadius(1, 10, 3), 8, 'the readable floor still holds');
  assert.equal(cloud.pieTargetRadius(1, 10, Infinity), 8, 'invalid maximum cannot create an unbounded placement search');
  assert.equal(cloud.pieTargetRadius(5, 10, 8), 8, 'minimum slider setting produces uniformly readable pies');
  for (const age of [0,1,5,10]) {
    assert.ok(Math.abs(cloud.pieTargetRadius(age,10,32)/cloud.pieTargetRadius(age,10,20)-32/20)<1e-12,
      'the new default enlarges recent and ancient targets equally');
  }
  for (const age of [null, undefined, NaN, -1]) assert.equal(cloud.pieTargetRadius(age, 10, 20), 20);
  for (const age of [null, undefined, NaN, 0, -1]) assert.equal(cloud.pieTargetRadius(1, age, 20), 20);
  const equalAges = cloud.layoutPiePlacements([
    { node: small, age: 5, x: 100, y: 100 }, { node: medium, age: 5, x: 300, y: 100 },
    { node: deep, age: 5, x: 500, y: 100 },
  ], [], 20, [], 10);
  for (const current of [small, medium, deep]) assert.equal(equalAges.get(current).radius, 15.5);
  const placements = cloud.layoutPiePlacements([
    { node: small, age: 9, x: 100, y: 100 }, { node: deep, age: 1, x: 130, y: 100 },
  ], [], 20, [], 10);
  assert.ok(placements.get(small).radius > placements.get(deep).radius, 'an older two-tip clade can be larger than a younger many-tip clade');
  assert.ok(Math.hypot(placements.get(small).x - placements.get(deep).x,
    placements.get(small).y - placements.get(deep).y) >=
    placements.get(small).radius + placements.get(deep).radius + 2);
});

test('effectiveGeneOpacity adapts smoothly to gene-tree count and increases strictly with user opacity', () => {
  const sparse = cloud.effectiveGeneOpacity(0.18, 17);
  const medium = cloud.effectiveGeneOpacity(0.18, 86);
  const dense = cloud.effectiveGeneOpacity(0.18, 980);
  assert.ok(sparse > 0.35 && sparse <= 0.85, `sparse N=17 opacity (${sparse}) stays clearly visible`);
  assert.ok(Math.abs(medium - 0.174) < 0.01, `medium N=86 stays close to baseline 0.18 (got ${medium})`);
  assert.ok(dense < 0.09 && dense >= 0.04, `dense N=980 dampens to avoid muddiness (got ${dense})`);
  assert.ok(sparse > medium && medium > dense);
  assert.ok(cloud.effectiveGeneOpacity(0.30, 86) > medium);
  assert.ok(medium > cloud.effectiveGeneOpacity(0.08, 86));
  assert.ok(Number.isFinite(cloud.effectiveGeneOpacity(NaN, -5)));
});

test('pie placement prioritizes short callout displacement over shrinking near a single branch', () => {
  const a = { id: 'A' }, b = { id: 'B' };
  const branch = { parent: b, child: { id: 'C' }, x1: 60, y1: 110, x2: 140, y2: 110 };
  const placed = cloud.layoutPiePlacements([{ node: a, x: 100, y: 100 }], [branch], 22).get(a);
  assert.ok(placed.radius >= 20, `expected short callout displacement to retain large pie (got r=${placed.radius})`);
  assert.ok(placed.y !== 100 || placed.x !== 100);
});

test('pie placement ignores its own branches but avoids unrelated branches and tip names', () => {
  const a = { id: 'A' }, b = { id: 'B' };
  const item = [{ node: a, x: 100, y: 100 }];
  const branch = { parent: b, child: { id: 'C' }, x1: 75, y1: 110, x2: 125, y2: 110 };
  const avoidBranch = cloud.layoutPiePlacements(item, [branch], 32).get(a);
  assert.ok(avoidBranch.radius >= 8);
  assert.ok(avoidBranch.y !== 100 || avoidBranch.radius <= 8);
  const ownBranch = cloud.layoutPiePlacements(item, [{ ...branch, parent: a }], 32).get(a);
  assert.equal(ownBranch.radius, 32);
  assert.equal(ownBranch.x, 100);
  const box = { x: 120, y: 92, width: 100, height: 18 };
  const avoidLabel = cloud.layoutPiePlacements(item, [], 32, [box]).get(a);
  const dx = Math.max(box.x - avoidLabel.x, 0, avoidLabel.x - box.x - box.width);
  const dy = Math.max(box.y - avoidLabel.y, 0, avoidLabel.y - box.y - box.height);
  assert.ok(Math.hypot(dx, dy) >= avoidLabel.radius + 3);
});

test('cloud pie key finds an upper opening without covering species branches or pies', () => {
  const branches = [
    { x1: 60, y1: 145, x2: 500, y2: 145 },
    { x1: 410, y1: 220, x2: 410, y2: 530 },
  ];
  const pies = [{ x: 120, y: 360, r: 22 }];
  const position = cloud.placePieLegend({ width: 1660, height: 2700,
    legendWidth: 260, legendHeight: 210, branches, pies });
  assert.ok(position.y < 700, 'the key should remain beside the upper tree');
  assert.ok(position.x - 9 > 500 || position.y - 9 > 145 ||
    position.y + position.height + 9 < 145, 'the key must clear the upper black branch');
  assert.ok(Math.hypot(
    Math.max(position.x, Math.min(pies[0].x, position.x + position.width)) - pies[0].x,
    Math.max(position.y, Math.min(pies[0].y, position.y + position.height)) - pies[0].y,
  ) > pies[0].r);
  assert.ok(position.x + position.width < 1080, 'the key stays left of tip names');
});

test('cloud pie key can target a clear lower-left opening', () => {
  const position = cloud.placePieLegend({ width: 1660, height: 2700,
    legendWidth: 260, legendHeight: 210, position: 'lower-left' });
  assert.ok(position.y >= 1700 && position.y <= 1950, 'the key should sit near the lower-left target');
  assert.equal(position.x, 80);
});

test('PhyParts rows map by exact descendant samples and use distinct denominators', () => {
  const species = node(node(tip('A'), tip('B')), tip('C'));
  const table = cloud.parsePhyPartsTable('Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tinformative_N\tdescendant_samples\nN1\t2\t1\t1\t6\t4\tB;A\n');
  const match = cloud.matchPhyParts(species, table);
  assert.equal(match.matched.size, 1);
  assert.deepEqual(cloud.pieFractions([...match.matched.values()][0], 'two'), [.5, .5]);
  assert.deepEqual(cloud.pieFractions([...match.matched.values()][0], 'four'), [.2, .1, .1, .6]);
  assert.equal(table.sourceTotal, 10);
});

test('four-part mode requires detailed counts; malformed count totals fail visibly', () => {
  const table = cloud.parsePhyPartsTable('Node_ID\tconcordant_N\tconflict_total_N\tno_signal_N\tdescendant_samples\nN1\t2\t3\t5\tA;B\n');
  const row = [...table.rows.values()][0];
  assert.deepEqual(cloud.pieFractions(row, 'two'), [.4, .6]);
  assert.throws(() => cloud.pieFractions(row, 'four'), /detailed|4-category|four|dominant/i);
  assert.throws(() => cloud.parsePhyPartsTable('concordant_N\tconflict_total_N\tno_signal_N\tinformative_N\tdescendant_samples\n2\t3\t5\t4\tA;B\n'), /inconsistent|mismatch|equal|sum/i);
});
