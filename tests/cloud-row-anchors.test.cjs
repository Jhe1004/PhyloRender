'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../cloud-tree.js');
const branches = require('../render/cloud-branches.js');
const composition = require('../render/cloud-tree.js');
const pies = require('../render/cloud-pies.js');
const scheduler = require('../core/render-scheduler.js');
const {parseNewick} = require('../core/tree-input.js');
const finish = scheduler.finishRenderSteps;
const outputGeometry = require('../core/output-geometry.js');
const horizontalLayoutForHeight=(height,natural,reserved,options={})=>({...outputGeometry.calculate({height,naturalPlotWidth:natural-reserved,
  fixedWidth:Math.max(reserved,options.rightContentReserve||0),minimumPlotWidth:160,maximumCanvasWidth:1511,mode:'content'}),maximumWidthMm:400});
const parse = text => parseNewick(text, {validateInput: false});
function fixture() {
  const species = parse('(O:10,((A:2,B:2):4,(C:3,D:3):3):4);');
  const gene = parse('(O:10,((A:2,B:2):4,(C:3,D:3):3):4);');
  const ages = root => new Map([...model.nodeClades(root)].map(([node, clade]) =>
    [node, clade.names.length === 5 ? 10 : clade.names.length === 4 ? 6 : clade.names.includes('A') ? 2 : 3])
    .concat(model.tips(root).map(node => [node, 0])));
  return {species, gene, speciesAges: ages(species), geneAges: ages(gene), order: ['O', 'A', 'B', 'C', 'D']};
}
function element(tag, attributes = {}, text = '') {
  return {tag, attributes: {...attributes}, text, children: [], dataset: {},
    append(...children) {this.children.push(...children);}, replaceChildren(...children) {this.children = children;},
    setAttribute(name, value) {this.attributes[name] = String(value);}, classList: {toggle() {}},
    querySelectorAll(name) {return this.children.filter(child => child.tag === name);},
    getBBox() {return {x: Number(this.attributes.x || 0), y: Number(this.attributes.y || 0), width: 12, height: 10};}};
}
test('shared internal row anchors are hard constraints, not suggestions', () => {
  const {gene, geneAges, order} = fixture();
  const node = [...model.nodeClades(gene)].find(([, clade]) => clade.key === 'A\u001fB')[0];
  const anchors = new Map([[node, 97.5], [gene, 119]]);
  const saved = structuredClone(gene), ages = [...geneAges.values()];
  const rows = finish(model.optimizeAlignedRowsSteps(gene, order, geneAges, 10, 64, 20, anchors));
  assert.equal(rows.get(node), 97.5);
  assert.equal(rows.get(gene), 119);
  model.tips(gene).forEach(tip => assert.equal(rows.get(tip), 64 + order.indexOf(tip.label) * 20));
  assert.deepEqual(gene, saved); assert.deepEqual([...geneAges.values()], ages);
  assert.deepEqual([...anchors.values()], [97.5, 119]);
});
test('shared-row matching uses complete descendants, never size or display name', () => {
  const {species, gene, order} = fixture();
  const speciesRows = model.alignedRows(species, order, 64, 20);
  const reference = finish(model.cladeRowReferenceSteps(species, speciesRows));
  const anchored = finish(model.sharedRowAnchorsSteps(gene, reference));
  assert.equal(anchored.size, 4);
  const different = parse('(O:10,((A:2,C:2):4,(B:3,D:3):3):4);');
  const shared = finish(model.sharedRowAnchorsSteps(different, reference));
  assert.equal(shared.size, 2, 'Only total/root and A B C D clades match');
  for (const [node] of shared) assert.ok(model.nodeClades(different).get(node).names.length >= 4);
  const quoted = parse("('O':10,(('A alpha':2,B:2):4,(C:3,D:3):3):4);");
  assert.equal(finish(model.sharedRowAnchorsSteps(quoted, reference)).size, 1, 'Only C D matches, no scientific rename');
});
test('portable asymmetric trees reproduce independent drift and keep every shared node anchored', () => {
  const species = parse('(O:10,(A:6,((B:0.44,(C:0.24,D:0.24):0.2):2.07,((E:0.33,F:0.33):0.11,(G:0.33,H:0.33):0.11):2.07):3.49):4);');
  const gene = parse('(O:10,((A:3.59,((B:0.4,C:0.4):0.04,D:0.44):3.15):2.41,((E:0.33,F:0.33):0.11,(G:0.33,H:0.33):0.11):5.56):4);');
  const speciesAges = model.importedDatedAges(species).ages, geneAges = model.importedDatedAges(gene).ages;
  const speciesClades = model.nodeClades(species), geneClades = model.nodeClades(gene);
  const sharedAges = new Map([...speciesClades].map(([node, clade]) => [clade.key, speciesAges.get(node)]));
  for (const [node, clade] of geneClades) if (sharedAges.has(clade.key))
    assert.ok(Math.abs(geneAges.get(node) - sharedAges.get(clade.key)) < 1e-8, 'Shared times already agree; drift is display-only');
  const order = model.orderedTips(species, 'small-top').map(tip => tip.label);
  const speciesRows = model.optimizeAlignedRows(species, order, speciesAges, 10);
  const independent = model.optimizeAlignedRows(gene, order, geneAges, 10);
  const reference = finish(model.cladeRowReferenceSteps(species, speciesRows));
  const anchors = finish(model.sharedRowAnchorsSteps(gene, reference));
  assert.equal(Math.max(...[...anchors].map(([node, row]) => Math.abs(independent.get(node) - row))), 36,
    'A small self-contained fixture must reproduce the old failure, without a local demo cache');
  const snapshot = JSON.stringify({species, gene, speciesAges: [...speciesAges.values()], geneAges: [...geneAges.values()]});
  for (const direction of ['file', 'small-top', 'large-top']) for (const shape of ['triangular', 'rectangular']) {
    const names = model.orderedTips(species, direction).map(tip => tip.label);
    const rows = shape === 'rectangular' ? model.alignedRows(species, names)
      : model.optimizeAlignedRows(species, names, speciesAges, 10);
    const fixed = finish(model.sharedRowAnchorsSteps(gene, finish(model.cladeRowReferenceSteps(species, rows))));
    const actual = model.optimizeAlignedRows(gene, names, geneAges, 10, 64, 24, fixed);
    for (const [node, row] of fixed) assert.equal(actual.get(node), row);
  }
  assert.equal(JSON.stringify({species, gene, speciesAges: [...speciesAges.values()], geneAges: [...geneAges.values()]}), snapshot);
});
test('invalid anchors reject rather than moving leaves, ignoring identities or clamping', () => {
  const {gene, geneAges, order} = fixture();
  const node = [...model.nodeClades(gene)].find(([, clade]) => clade.key === 'A\u001fB')[0];
  const bad = [new Map([[{}, 90]]), new Map([[model.tips(gene)[0], 64]]),
    new Map([[node, NaN]]), new Map([[node, Infinity]]), new Map([[node, 500]])];
  for (const anchors of bad) assert.throws(() => finish(model.optimizeAlignedRowsSteps(gene, order, geneAges, 10, 64, 20, anchors)),
    error => error.code === 'CLOUD_INVALID_ROW_ANCHOR');
});
test('row cache includes anchor values, snapshots maps and refuses unknown-node cache aliases', () => {
  const {gene, geneAges, order} = fixture(); let searches = 0;
  const custom = {...model, *optimizeAlignedRowsSteps(...args) {searches++; return yield* model.optimizeAlignedRowsSteps(...args);}};
  const engine = branches.create({model: custom, svgEl: element});
  const node = [...model.nodeClades(gene)].find(([, clade]) => clade.key === 'A\u001fB')[0];
  const anchors = new Map([[node, 90]]);
  const run = value => finish(engine.alignedRowSteps(gene, order, geneAges, 10, 64, 20, value));
  assert.equal(run(anchors).get(node), 90); run(new Map(anchors)); assert.equal(searches, 1);
  anchors.set(node, 98); assert.equal(run(anchors).get(node), 98); assert.equal(searches, 2);
  const steps = engine.alignedRowSteps(gene, order, geneAges, 10, 64, 20, new Map([[node, 99]]));
  steps.next(); assert.equal(finish(steps).get(node), 99);
  const caller = new Map([[node, 100]]), pending = engine.alignedRowSteps(gene, order, geneAges, 10, 64, 20, caller);
  pending.next(); caller.set(node, 101); assert.equal(finish(pending).get(node), 100);
  assert.throws(() => run(new Map([[{id: node.id, children: node.children}, 98]])), error => error.code === 'CLOUD_INVALID_ROW_ANCHOR');
});
test('cancelled anchored row search never publishes a partial cache', () => {
  const {gene, geneAges, order} = fixture(); let searches = 0, closed = 0;
  const custom = {...model, *optimizeAlignedRowsSteps(...args) {
    searches++; try {return yield* model.optimizeAlignedRowsSteps(...args);} finally {closed++;}
  }};
  const engine = branches.create({model: custom, svgEl: element}), anchors = new Map([[gene, 119]]);
  const run = () => engine.alignedRowSteps(gene, order, geneAges, 10, 64, 20, anchors);
  const interrupted = run(); assert.equal(interrupted.next().done, false); interrupted.return();
  finish(run()); finish(run()); assert.equal(searches, 2); assert.equal(closed, 2);
});
test('clade anchor collection yields and cancellation leaves source coordinates intact', () => {
  const {species, gene, order} = fixture(); const rows = model.alignedRows(species, order, 64, 20), before = [...rows];
  const reference = model.cladeRowReferenceSteps(species, rows);
  assert.equal(reference.next().done, false); reference.return(); assert.deepEqual([...rows], before);
  const matching = model.sharedRowAnchorsSteps(gene, finish(model.cladeRowReferenceSteps(species, rows)));
  assert.equal(matching.next().done, false); matching.return(); assert.deepEqual([...rows], before);
});
test('composition anchors gene rows to final species rows for every ladder order and species shape', () => {
  for (const direction of ['file', 'small-top', 'large-top']) for (const speciesShape of ['triangular', 'rectangular']) {
    const {species, gene, speciesAges, geneAges} = fixture(), svg = element('svg');
    const cloud = {speciesRoot: species, geneRoots: [gene], datedRootAge: 10,
      datedAges: new Map([[species, speciesAges], [gene, geneAges]]), cladeColors: new Map(), hiddenPieNodes: new Set(),
      datingEngine: 'bundled-treePL', geneDatingEngine: 'bundled-treePL'};
    let received = null, geneRows = null, actualSpeciesRows = null;
    const branch = branches.create({model, svgEl: element});
    const observed = {...branch, *alignedRowSteps(root, ...args) {
      const rows = yield* branch.alignedRowSteps(root, ...args);
      if (root === gene) {received = args[5]; geneRows = rows;} else actualSpeciesRows = rows;
      return rows;
    }};
    const renderer = composition.create({planRows:require('../figure-contract.js').planAutomaticRows,svgEl: element, model, colorModel:require('../core/cloud-group-colors.js'), branches: observed, pies: pies.create({model, svgEl: element}), backgroundRenderer: {},
      jitterModel:require('../core/cloud-jitter.js'),jitterLimits:require('../figure-contract.js').cloudJitter,
      finalizeCanvas:require('../render/canvas-finalizer.js').finalize,
      display: {GEOLOGIC_EPOCHS: []}, publishSize() {}, horizontalLayoutForHeight, appendTipLabelContent() {},fitTipLabelWidth(){}, updateRankNormalizationStatus() {},
      buildCladeBarLayout() {return {items: [], requiredWidth: 0};}, drawCladeBars() {}});
    const tips = model.orderedTips(species, direction), names = tips.map(tip => tip.label);
    finish(renderer.renderSteps({svg, model: cloud, options: {age: 10, showGene: true, showSpecies: false, showPies: false,
      speciesShape, ladderDirection: direction, pieAgeRange: {}}, tips, rowStep: 24, timeBackground: {visible: false, geologyVisible: false},
      timeFonts: {axisOffset: 20, key: 10, periodRow: 20}, unit: 'relative', fontFamily: 'Arial',
      cladeSelectionMode: false, labelSource: {}, provenance: {dating: {}, clades: {}}}));
    assert.ok(received instanceof Map, 'Production composition must pass anchors to gene layout');
    assert.equal(received.size, 4);
    const reference = finish(model.cladeRowReferenceSteps(species, speciesShape === 'rectangular'
      ? model.alignedRows(species, names, 64, 24) : actualSpeciesRows));
    for (const [node, clade] of model.nodeClades(gene)) assert.equal(geneRows.get(node), reference.get(clade.key));
  }
});
