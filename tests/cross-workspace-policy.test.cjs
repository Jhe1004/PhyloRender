const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const identity = require('../core/sample-identity.js');
const order = require('../core/tree-order.js');
const canvas = require('../render/canvas-finalizer.js');
const reports = require('../core/figure-report.js');

const leaf = label => ({label, children: []});
const tree = () => ({children: [
  {children: [leaf('Z'), leaf('Y')]},
  {children: [leaf('B'), leaf('A')]},
]});

test('parallel double trees use visible rows rather than the sum of both tip counts', () => {
  const left = {children: Array.from({length: 20}, (_, index) => leaf(`L${index}`))};
  const right = {children: Array.from({length: 20}, (_, index) => leaf(`R${index}`))};
  const profile = order.visibleTipRows([left, right], {parallel: true});
  assert.equal(profile.rowCount, 20);
  assert.equal(profile.tips.length, 40);
  assert.deepEqual(profile.counts, [20, 20]);
});

test('all workspaces use one deterministic ladderization tie rule', () => {
  const key = label => identity.tipIdentityKey(label, 'exact').toLowerCase();
  const inPlace = tree();
  order.ladderize(inPlace, 'small-top', {tipKey: key});
  const view = order.orderedTips(tree(), 'small-top', {tipKey: key});
  assert.deepEqual(order.tipNodes(inPlace).map(node => node.label), ['A', 'B', 'Y', 'Z']);
  assert.deepEqual(view.map(node => node.label), ['A', 'B', 'Y', 'Z']);
});

test('sample identity policies are explicit and never use display labels', () => {
  assert.equal(identity.tipIdentityKey('A_one', 'exact'), 'A_one');
  assert.equal(identity.tipIdentityKey('A_one', 'conflict'), 'a one');
  assert.equal(identity.tipIdentityKey('A-one', 'auxiliary'), 'a_one');
  assert.throws(() => identity.tipIdentityKey('A', 'unknown'), /Unknown.*identity|policy/i);
  const profile = identity.tipProfile({children: [leaf('A_one'), leaf('A one')]}, 'conflict');
  assert.deepEqual(profile.duplicates, [{key: 'a one', labels: ['A_one', 'A one']}]);
});

test('canvas finalization expands measured content and enforces the active workspace ceiling', () => {
  const attributes = {};
  const svg = {setAttribute(name, value) { attributes[name] = String(value); }};
  const result = canvas.finalize({svg, width: 500, height: 300,
    bounds: {x: 0, y: 0, width: 540, height: 320}, rightPadding: 10, bottomPadding: 8,
    maximumWidth: 600, maximumWidthMm: 400, contentDescription: 'labels'});
  assert.deepEqual(result, {width: 550, height: 328, changed: true});
  assert.equal(attributes.viewBox, '0 0 550 328');
  assert.throws(() => canvas.finalize({svg, width: 500, height: 300,
    bounds: {x: 0, y: 0, width: 610, height: 300}, maximumWidth: 600,
    maximumWidthMm: 400, contentDescription: 'labels'}), error => error.code === 'FIGURE_WIDTH_CONTENT_LIMIT');
});

test('canvas finalization preserves an existing fractional size when content already fits', () => {
  const attributes = {};
  const svg = {setAttribute(name, value) { attributes[name] = String(value); }};
  const result = canvas.finalize({svg, width: 1128, height: 418.815625,
    bounds: {x: 0, y: 0, width: 1100, height: 410}, maximumWidth: 1200});
  assert.deepEqual(result, {width: 1128, height: 418.815625, changed: false});
  assert.equal(attributes.viewBox, '0 0 1128 418.815625');
});

test('ordinary and advanced reports share one output and font-portability builder', () => {
  const output = reports.output({physical: {width_mm: 120}, canvas: {width: 900, height: 600},
    aspectMode: 'auto', requestedAspectRatio: null, layout: {autoExpanded: true, horizontalExpansion: 1.4},
    requestedPngScale: 2, actualPngScale: 1.5, requestedDpi: 300});
  assert.deepEqual(output, {width_mm: 120, requested_dpi: 300, aspect_mode: 'auto',
    requested_aspect_ratio: null, actual_aspect_ratio: 1.5, auto_expanded: true,
    horizontal_expansion: 1.4, requested_png_scale: 2, actual_png_scale: 1.5});
  assert.deepEqual(reports.fontPortability({families: [], fontsReady: true, embedsFonts: true}), {
    bundled_fonts_ready: true, svg_export_embeds_fonts: true, system_font_families: [],
    system_fonts_ready: true, all_fonts_embedded: true, fallback: null,
  });
});

test('input Worker loads shared ordering and identity policies before dependent tree modules', () => {
  const worker = fs.readFileSync(require.resolve('../core/input-worker.js'), 'utf8');
  const imports = worker.match(/importScripts\(([^;]+)\)/)?.[1] || '';
  assert.ok(imports.indexOf("'tree-order.js'") < imports.indexOf("'../cloud-tree.js'"));
  assert.ok(imports.indexOf("'sample-identity.js'") < imports.indexOf("'../cloud-tree.js'"));
  assert.ok(imports.indexOf("'tree-order.js'") < imports.indexOf("'../tree-rooting.js'"));
});


test('canvas ceiling limits optional right padding while preserving every measured glyph', () => {
  const svg = {setAttribute() {}};
  const input = {svg, width: 1511, height: 250, maximumWidth: 1511,
    bounds: {x: 7.998797416687012, y: 16, width: 1453.007080078125, height: 218.6}, rightPadding: 50};
  assert.equal(canvas.finalize(input).width, 1511);
  assert.throws(() => canvas.finalize({...input,
    bounds: {x: 0, y: 0, width: 1511.001, height: 200}}), error => error.code === 'FIGURE_WIDTH_CONTENT_LIMIT');
  assert.throws(() => canvas.finalize({...input, width: 1512}), error => error.code === 'FIGURE_WIDTH_CONTENT_LIMIT');
});
