const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const PhyloRenderOutputGeometry = require('../core/output-geometry.js');
const PhyloRenderContract = { maximumOutputWidthMm: workspace => workspace === 'conflict' ? 800 : 400 };
test('object-based pages separate sample names and background while retaining every typography control', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/data-settings-target="([^"]+)"/g)].map(m => m[1]), ['data', 'tree', 'tips', 'labels', 'background', 'groups', 'export']);
  const cards = [...html.matchAll(/<details[^>]*class="settings-group type-card(?: [^"]+)?" data-settings-page="([^"]+)"[^>]*>([\s\S]*?)<\/details>/g)];
  assert.equal(cards.length, 6);
  for (const [control, page] of [['tip-font-family', 'tips'], ['scale-font-family', 'tree'], ['support-font-family', 'labels'], ['clade-font-family', 'groups']]) {
    assert.equal(cards.find(m => m[2].includes(`id="${control}"`))?.[1], page);
  }
  const typography = html.slice(html.indexOf('<details id="tip-typography-section"'),html.indexOf('<details id="tip-format-section"'));
  assert.match(typography,/id="tip-font-bold"/,'sample-name bold must be available with font, color and size');
  const formatting = html.slice(html.indexOf('<details id="tip-format-section"'),html.indexOf('<details class="settings-group" data-settings-page="labels">',html.indexOf('<details id="tip-format-section"')));
  assert.doesNotMatch(formatting,/id="tip-font-bold"|斜体、粗体/,'scientific-name formatting must not contain weight control');
  assert.doesNotMatch(html, /data-settings-(?:jump|page)="style"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});
test('node annotation adjustment is a shared footer independent of all setting pages', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<section id="node-label-controls" class="auto-layout-panel" aria-label="Node annotation placement"/);
  assert.match(html, /<details class="auto-layout-options">/);
  assert.ok(html.indexOf('id="reset-labels"') < html.indexOf('class="auto-layout-options"'));
  assert.ok(html.indexOf('id="node-label-controls"') > html.lastIndexOf('data-settings-page="export"'));
  assert.match(html, /Optimize Node Label Placement<\/button>/);
  assert.match(html, /id="reset-labels" class="button primary full"/);
  assert.ok(!source.includes('labels.before($("node-label-controls"))'));
});

test('explicit automatic layout clears manual positions but preserves current controls', async () => {
  const values = { 'tip-font-size': '25', 'support-size': '20', 'tip-spacing': '32', 'tip-font-family': 'serif' };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  let click, renders = 0;
  const state = { manualLabels: new Map([['node-1', { dx: 10, dy: 20 }]]) };
  const context = vm.createContext({
    state, $: id => id === 'reset-labels' ? { addEventListener: (_, fn) => { click = fn; } } : controls[id],
    runTreeLoad: async (_, task) => task({}),
    finishInteractiveTreeLoad: async () => {
      renders++;
      assert.equal(state.manualLabels.size, 0);
      assert.deepEqual(Object.fromEntries(Object.entries(controls).map(([id, control]) => [id, control.value])), values);
    },
  });
  vm.runInContext(source.slice(source.indexOf('$("reset-labels").addEventListener'), source.indexOf('$("reset-typography").addEventListener')), context);
  await click();
  assert.equal(renders, 1);
});
function fixture(overrides = {}) {
  const elements = new Map(), timers = new Map();
  let sequence = 0, renders = 0, applied = [];
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', dataset: {}, events: {}, textContent: '',
      addEventListener(name, fn) { this.events[name] = fn; },
      blur() { this.events.change?.({ target: this }); },
    });
    return elements.get(id);
  };
  const config = { rangeId: 'width', numberId: 'number', outputId: 'output', decreaseId: 'minus', increaseId: 'plus', min: 0, max: 100, step: 1, defaultValue: 10, decimals: 0, ...overrides };
  $(config.rangeId).value = '10';
  const context = vm.createContext({
    $, state: { root: {}, tipSpacingEm: null }, NUMERIC_SETTING_CONTROLS: [config],
    PhyloRenderImportState: require('../ui/import-state.js'),
    PhyloRenderContract: require('../figure-contract.js'), figureUnits: require('../figure-units.js'),
    setTimeout: fn => { timers.set(++sequence, fn); return sequence; }, clearTimeout: id => timers.delete(id),
    renderTreeCooperatively: async (_progress, options) => { assert.equal(options.reuseLabelLayout, true); renders++; applied.push($(config.rangeId).value); },
    ensureFigureFontsReady: async () => {}, showMessage: () => {},
    runTreeLoad: async () => { renders++; applied.push($(config.rangeId).value); return true; },
    finishInteractiveTreeLoad: () => {},
    updateAutomaticTipSpacingUi: () => {},
  });
  vm.runInContext(source.slice(source.indexOf('let lastRenderedFigureFontKey = null;'), source.indexOf('async function runTreeLoad(')), context);
  vm.runInContext(source.slice(source.indexOf('function numericStepPrecision('), source.indexOf('function bindNumericControls(')), context);
  vm.runInContext(source.slice(source.indexOf('function syncCladeFontSize('), source.indexOf('function applyTypographySettings(')), context);
  context.bindNumericControl(config);
  const emit = (id, event, value, key) => {
    const target = $(id);
    if (value !== undefined) target.value = String(value);
    return target.events[event]?.({ target, key, preventDefault() {} });
  };
  return { $, config, context, emit, timers, renders: () => renders, applied: () => applied };
}

test('100 drag input events coalesce into one cheap refresh, never optimization', async () => {
  const f = fixture();
  for (let n = 0; n < 100; n++) f.emit('width', 'input', n);
  assert.equal(f.$('number').value, '99');
  assert.equal(f.renders(), 0);
  assert.equal(f.timers.size, 1);
  await f.context.flushSettingsRender();
  assert.deepEqual(f.applied(), ['99']);
});

test('tip font input preserves absolute spacing even when range already has new value', () => {
  const f = fixture({ rangeId: 'tip-font-size', min: 8, max: 30 });
  const spacingConfig = { rangeId: 'tip-spacing', numberId: 'spacing-number', outputId: 'spacing-output', min: 7, max: 160, step: .1, decimals: 2 };
  // The fixture configuration array is exposed for the same production sync path.
  f.context.NUMERIC_SETTING_CONTROLS.push(spacingConfig);
  f.context.NUMERIC_SETTING_CONTROLS.push({rangeId:'clade-font-size',min:8,max:35,step:1,decimals:2});
  f.$('clade-font-auto').checked=true;
  f.$('tip-spacing').value = '18';
  f.context.state.tipSpacingEm = 18 / 17;
  f.context.terminalSpacing = () => f.context.state.tipSpacingEm * Number(f.$('tip-font-size').value);
  for (const size of [8, 30, 11.4, 22.08, 17]) {
    f.emit('tip-font-size', 'input', size);
    assert.ok(Math.abs(f.context.terminalSpacing() - 18) < 1e-8);
    assert.equal(Number(f.$('tip-spacing').value), 18);
    const units=require('../figure-units.js');
    assert(Math.abs(units.designToDrawing(Number(f.$('clade-font-size').value))-units.designToDrawing(Number(f.$('tip-font-size').value))-3)<1e-8);
  }
});

test('print width preserves relative branch and font geometry', () => {
  const controls = { 'figure-width': { value: '180' }, 'output-aspect-ratio': { value: 'auto' }, 'custom-aspect-ratio': { value: '1.5' }, 'tip-font-size': { value: '17' }, 'tip-font-family': { value: 'serif' }, 'tip-font-bold': { checked: false } };
  const state = { root: {}, workspaceMode: 'phylogeny', cloud: {}, conflict: {} };
  const ctx = vm.createContext({ state, PhyloRenderOutputGeometry,
    PhyloRenderContract: { maximumOutputWidthMm: () => 3000 }, MINIMUM_TREE_SPAN: 160,
    $: id => controls[id], figureUnits: require('../figure-units.js'),
    outputAspectRatioValue: () => null,
    document: { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: Number(controls['tip-font-size'].value) * 10 }) }) }) },
    descendantTipNodes: () => [{ label: 'test' }], displayTipLabel: v => v,
  });
  vm.runInContext(source.slice(source.indexOf('function horizontalLayoutForHeight('), source.indexOf('function boundedBrowserPngScale(')), ctx);
  const original = ctx.horizontalLayoutForHeight(320, 820, 310);
  controls['tip-font-size'].value = '30';
  assert.equal(ctx.horizontalLayoutForHeight(320, 820, 310, { reuseGeometry: true }).plotWidth, original.plotWidth);
  controls['figure-width'].value = '250';
  assert.equal(ctx.horizontalLayoutForHeight(320, 820, 310, { reuseGeometry: true }).plotWidth, original.plotWidth);
});

test('vertical and horizontal stretch are independent, non-compounding, and survive explicit relayout', () => {
  const controls = { 'figure-width': { value: '0' }, 'output-aspect-ratio': { value: 'auto' }, 'custom-aspect-ratio': { value: '1.5' }, 'tree-horizontal-scale': { value: '50' } };
  const state = { root: {}, workspaceMode: 'phylogeny', cloud: {}, conflict: {}, manualTreeAxes: false };
  const ctx = vm.createContext({ state, PhyloRenderOutputGeometry,
    PhyloRenderContract: { maximumOutputWidthMm: () => 3000 }, MINIMUM_TREE_SPAN: 160,
    figureUnits: require('../figure-units.js'),
    $: id => controls[id], outputAspectRatioValue: () => null });
  vm.runInContext(source.slice(source.indexOf('function automaticTargetAspectRatio('), source.indexOf('function boundedBrowserPngScale(')), ctx);
  const base = ctx.horizontalLayoutForHeight(3200, 906, 310);
  assert.ok(base.plotWidth > 0, 'the fixed frame still has a genuine tree span');
  state.manualTreeAxes = true;
  assert.equal(ctx.horizontalLayoutForHeight(6400, 906, 310, { reuseGeometry: true }).plotWidth, base.plotWidth);
  controls['tree-horizontal-scale'].value = '75';
  for (let i = 0; i < 3; i++) assert.equal(ctx.horizontalLayoutForHeight(6400, 906, 310, { reuseGeometry: true }).plotWidth, base.plotWidth * 1.5);
  assert.equal(ctx.horizontalLayoutForHeight(6400, 906, 310).plotWidth, base.plotWidth * 1.5);
  state.root = {};
  assert.equal(ctx.horizontalLayoutForHeight(6400, 906, 310).plotWidth, base.plotWidth * 1.5, 'the same geometry uses the same drawing width after import');
});

test('automatic and manual layouts obey the physical-width ceiling by compressing tree span', () => {
  const controls = { 'figure-width': { value: '0' }, 'output-aspect-ratio': { value: 'auto' },
    'custom-aspect-ratio': { value: '1.5' }, 'tree-horizontal-scale': { value: '400' } };
  const state = { root: {}, workspaceMode: 'phylogeny', cloud: {}, conflict: {}, manualTreeAxes: false };
  const ctx = vm.createContext({ state, PhyloRenderOutputGeometry, PhyloRenderContract, MINIMUM_TREE_SPAN: 160,
    figureUnits: require('../figure-units.js'),
    $: id => controls[id], outputAspectRatioValue: () => null });
  vm.runInContext(source.slice(source.indexOf('function automaticTargetAspectRatio('), source.indexOf('function boundedBrowserPngScale(')), ctx);
  const automatic = ctx.horizontalLayoutForHeight(12000, 940, 176, { rightContentReserve: 620 });
  assert.equal(automatic.canvasWidth, 1511);
  assert.equal(automatic.plotWidth, 891);
  assert.equal(automatic.widthLimited, true);
  controls['figure-width'].value = '900';
  const manual = ctx.horizontalLayoutForHeight(12000, 940, 176, { rightContentReserve: 620 });
  assert.equal(manual.canvasWidth, 1511);
  assert.ok(manual.plotWidth >= 160);
  assert.throws(() => ctx.horizontalLayoutForHeight(12000, 940, 176, { rightContentReserve: 1400 }),
    error => error.code === 'FIGURE_WIDTH_CONTENT_LIMIT');
});

test('release and repeated stepper clicks coalesce, applying the final value once', async () => {
  const f = fixture();
  f.emit('width', 'input', 20);
  f.emit('width', 'change', 20);
  f.emit('plus', 'click'); f.emit('plus', 'click'); f.emit('minus', 'click');
  assert.equal(f.timers.size, 1);
  assert.equal(await f.context.flushSettingsRender(), true);
  assert.deepEqual(f.applied(), ['21']);
  assert.equal(f.timers.size, 0);
  await f.context.flushSettingsRender();
  assert.equal(f.renders(), 1);
});

test('typing preserves intermediate decimal text and Enter commits once', async () => {
  const f = fixture({ step: 0.1, decimals: 1 });
  f.emit('number', 'input', '1.');
  assert.equal(f.$('number').value, '1.');
  f.emit('number', 'input', '1.7');
  assert.equal(f.timers.size, 1);
  f.emit('number', 'keydown', undefined, 'Enter');
  await f.context.flushSettingsRender();
  assert.deepEqual(f.applied(), ['1.7']);
});

test('PNG resolution does not trigger a layout', async () => {
  const f = fixture({ render: false });
  f.emit('width', 'input', 2); f.emit('width', 'change', 2);
  f.emit('plus', 'click');
  await f.context.flushSettingsRender();
  assert.equal(f.renders(), 0);
});

test('starting another drag cancels the pending earlier commit', async () => {
  const f = fixture();
  f.emit('width', 'change', 20);
  f.emit('width', 'pointerdown');
  f.emit('width', 'input', 25);
  assert.equal(f.timers.size, 1);
  f.emit('width', 'change', 30);
  await f.context.flushSettingsRender();
  assert.deepEqual(f.applied(), ['30']);
});

test('export flush waits for a single active redraw; failure blocks export', async () => {
  const f = fixture();
  let release;
  f.context.ensureFigureFontsReady = () => new Promise((resolve, reject) => { release = reject; });
  f.emit('width', 'change', 30);
  const first = f.context.flushSettingsRender();
  const second = f.context.flushSettingsRender();
  release(Error('font failure'));
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
});

test('retained positions follow the same node and scale fonts without a search', () => {
  const { context } = fixture();
  const saved = { dx: -20, dy: 10, font: 10, preferred: 20 };
  const result = context.retainedLabelPlacement(saved, null, { x: 100, y: 200 }, 30, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { x: 70, y: 215, font: 15 });
  assert.equal(context.retainedLabelPlacement(saved, null, { x: 100, y: 200 }, 10, 7).font, 7);
});

test('retained rendering has no optimizer or candidate search', () => {
  const retained = source.slice(source.indexOf('function drawRetainedNodeLabels('), source.indexOf('function markSettingsDirty('));
  assert.doesNotMatch(retained, /refineReadable|candidatePlacements|scorePlacement/);
  assert.match(retained, /leaderRouteForPlacement/); // Same edge attachment, no label-position search.
  assert.match(retained, /countResidualCollisions/); // Conflicts are reported, not repaired.
});

test('label anchors stretch with the tree, preserve font size, and round trip without drift', () => {
  const f = fixture();
  const saved = {dx:-150,dy:10,font:18,preferred:18,anchor:1,anchorDx:-110,centerDy:15,plotWidth:200,spacing:18};
  for (const factor of [1,1.5,2,1]) {
    const p=f.context.retainedLabelPlacement(saved,null,{x:200*factor,y:0},18,9,{plotWidth:200*factor,spacing:18});
    const right=p.x, left=p.x-40;
    assert.equal(right,90*factor);
    assert.ok(right<100*factor,'label stays left of the other vertical branch');
    assert.equal(p.font,18);
    if(factor===1) assert.equal(left,50);
  }
  const vertical=f.context.retainedLabelPlacement(saved,null,{x:200,y:0},18,9,{plotWidth:200,spacing:36});
  assert.equal(vertical.y,30);
  assert.equal(vertical.x,90);
  const manual={...saved,fontReduction:0};
  assert.equal(f.context.retainedLabelPlacement(saved,manual,{x:300,y:0},18,9,{plotWidth:300,spacing:18}).x,135);
});

test('spacing preview preserves the relative spacing state without rendering', () => {
  const f = fixture({ rangeId: 'tip-spacing', displayFactor: () => 1 / 20, decimals: 2 });
  f.context.state.tipSpacingEm = 1.1;
  f.$('tip-font-size').value = '20';
  f.emit('tip-spacing', 'input', 30);
  assert.equal(f.context.state.tipSpacingEm, 1.5);
  assert.equal(f.$('number').value, '1.5');
  assert.equal(f.renders(), 0);
});

test('special support sliders defer input and commit on change', () => {
  for (const id of ['support-decimals-range', 'support-threshold']) {
    assert.match(source, new RegExp(`\\$\\("${id}"\\)\\.addEventListener\\("input",[^\\n]+deferRender: true`));
    assert.match(source, new RegExp(`\\$\\("${id}"\\)\\.addEventListener\\("change"`));
  }
});
