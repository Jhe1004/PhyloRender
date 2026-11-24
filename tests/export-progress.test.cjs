const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fixture() {
  const elements = new Map();
  const make = () => ({
    textContent: '', hidden: false, disabled: false, dataset: {}, children: [], attributes: {}, events: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, fn) { this.events[name] = fn; },
    removeEventListener(name) { delete this.events[name]; },
    showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
  });
  const get = id => { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); };
  const window = make();
  const context = vm.createContext({
    $, state: { root: {} }, document: { createElement: make }, window,
    performance, setTimeout, clearTimeout, setInterval, clearInterval, DOMException,
    requestAnimationFrame: fn => setTimeout(fn, 0), showMessage: () => {},
  });
  function $(id) { return get(id); }
  vm.runInContext(source.slice(source.indexOf('let activeExport = null;'), source.indexOf('async function exportA4PrintBundle()')), context);
  return { context, get, window, run: context.runExport };
}

test('real step progress, completion and controls restored', async () => {
  const { get, window, run } = fixture();
  get('export-a4').disabled = true;
  const result = await run('SVG', ['字体', '下载'], async job => {
    assert.equal(get('export-progress-dialog').open, true);
    assert.equal(get('export-svg').disabled, true);
    await job.step(1, '完成字体，准备下载');
    assert.equal(get('export-progress-bar').value, 1);
    assert.equal(get('export-progress-stage').textContent, 'Step 2 / 2');
    assert.equal(get('export-progress-steps').children[0].className, 'done');
    return '文件已生成';
  });
  assert.equal(result.status, 'success');
  assert.equal(get('export-progress-bar').value, 2);
  assert.equal(get('export-progress-dialog').attributes['aria-busy'], 'false');
  assert.equal(get('export-progress-close').hidden, false);
  assert.equal(get('export-svg').disabled, false);
  assert.equal(get('export-a4').disabled, true);
  assert.equal(window.events.beforeunload, undefined);
});

test('duplicate export cannot start a second task', async () => {
  const { run } = fixture();
  await run('PNG', ['生成'], async () => {
    assert.equal((await run('SVG', ['生成'], () => assert.fail('second task started'))).status, 'busy');
  });
});

test('cancel waits for restoration, skips download and allows retry', async () => {
  const { run, get } = fixture();
  let restored = false;
  const result = await run('上下两图', ['排版', '恢复', '下载'], async job => {
    get('export-progress-cancel').onclick();
    try { await job.step(0, '继续排版'); }
    finally { await job.step(1, '恢复画布', 1, true); restored = true; }
    assert.fail('cancelled task reached download');
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(restored, true);
  assert.equal(get('export-progress-dialog').dataset.state, 'cancelled');
  assert.equal((await run('SVG', ['下载'], async () => {})).status, 'success');
});

test('error shows readable reason and unlocks UI', async () => {
  const { run, get } = fixture();
  assert.equal((await run('PNG', ['编码'], async () => { throw new Error('PNG encoding failed'); })).status, 'error');
  assert.match(get('export-progress-detail').textContent, /PNG encoding failed/);
  assert.equal(get('export-svg').disabled, false);
  assert.equal(get('export-progress-cancel').hidden, true);
});

test('no tree returns immediately without opening progress', async () => {
  const { context, run, get } = fixture();
  context.state.root = null;
  assert.equal((await run('SVG', ['下载'], () => assert.fail())).status, 'empty');
  assert.notEqual(get('export-progress-dialog').open, true);
});

test('UI export reuses ready layout but not stale fonts; MCP awaits cooperative rendering', async () => {
  let renders = 0;
  let rendered = false;
  const context = vm.createContext({
    state: { workspaceMode: 'phylogeny' },
    activeTreeLoad: false, currentLoadController: {}, flushSettingsRender: async () => true,
    lastRenderedFigureFontKey: 'ready', ensureFigureFontsReady: async () => 'ready',
    renderTree: () => assert.fail('export must not use the synchronous renderer'),
    renderTreeCooperatively: async () => {
      renders++; rendered = false;
      await new Promise(resolve => setTimeout(resolve, 0));
      rendered = true;
    },
    serializeRenderedSvg: async () => {
      if (renders) assert.equal(rendered, true, 'serialization started before asynchronous rendering completed');
      return '<svg/>';
    },
  });
  vm.runInContext(source.slice(source.indexOf('async function serializedSvg('), source.indexOf('function a4PrintRootPlans(')), context);
  assert.equal(await context.serializedSvg({ reuseLayout: true }), '<svg/>');
  assert.equal(renders, 0);
  context.lastRenderedFigureFontKey = 'old';
  await context.serializedSvg({ reuseLayout: true });
  assert.equal(renders, 1);
  await context.serializedSvg();
  assert.equal(renders, 2);
  context.activeTreeLoad = true;
  await assert.rejects(context.serializedSvg(), { code: 'FIGURE_BUSY' });
  await assert.rejects(context.serializedSvg({owner:{}}), { code: 'FIGURE_BUSY' });
  assert.equal(renders, 2);
  context.activeTreeLoad = false;
  context.flushSettingsRender = async () => false;
  await assert.rejects(context.serializedSvg(), { code: 'FIGURE_NOT_READY' });
  assert.equal(renders, 2);
});

test('low-level SVG serialization guards active work and awaits stale-font reflow', async () => {
  const context = vm.createContext({
    activeTreeLoad: true, currentLoadController: {}, checkScienceCancellation: () => {}, state: { workspaceMode: 'phylogeny' },
    maximumOutputCanvasWidth: () => 1511, maximumOutputWidthMm: () => 400,
    ensureFigureFontsReady: async () => 'ready', lastRenderedFigureFontKey: 'old',
    renderTree: () => assert.fail('stale font reflow must not be synchronous'),
    renderTreeCooperatively: async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      context.ready = true;
    },
    ready: false,
    $: () => ({ cloneNode() {
      assert.equal(context.ready, true, 'SVG cloned before font reflow completed');
      throw new Error('clone checkpoint');
    } }),
  });
  vm.runInContext(source.slice(source.indexOf('async function serializeRenderedSvg('), source.indexOf('async function serializedSvg(')), context);
  await assert.rejects(context.serializeRenderedSvg(), { code: 'FIGURE_BUSY' });
  context.activeTreeLoad = false;
  await assert.rejects(context.serializeRenderedSvg(), /clone checkpoint/);
});

test('two-panel cancellation restores root and every temporary layout control', async () => {
  const root = { id: 'original' };
  const state = { root, workspaceMode: 'phylogeny', tipSpacingEm: 1.1,
    automaticTipSpacing: false, printTimeAxisMaximum: 42 };
  const controls = new Map();
  const $ = id => {
    if (!controls.has(id)) controls.set(id, { value: '17' });
    return controls.get(id);
  };
  const renders = [];
  const context = vm.createContext({
    state, $, structuredClone, ensureFigureFontsReady: async () => {},
    a4PrintRootPlans: () => [1, 2].map(pageNumber => ({ pageNumber, root: { id: `page-${pageNumber}` } })),
    renderTreeCooperatively: async () => renders.push(state.root.id), measureRenderedPrintFonts: () => ({}),
    appendTreePanelIncomingGuide: () => 0,
    serializeRenderedSvg: async () => '<svg/>', wrapRenderedSvgAsA4: () => ({}),
    refreshNumericControls: () => {}, updateAspectControlVisibility: () => {},
  });
  vm.runInContext(source.slice(source.indexOf('async function buildA4PrintPages('), source.indexOf('async function svgTextToPngBlob(')), context);
  await assert.rejects(context.buildA4PrintPages({ onProgress: async event => {
    if (event.phase === 'page' && event.page === 2) throw new DOMException('cancelled', 'AbortError');
  } }), { name: 'AbortError' });
  assert.equal(state.root, root);
  assert.equal(state.tipSpacingEm, 1.1);
  assert.equal(state.automaticTipSpacing, false);
  assert.equal(state.printTimeAxisMaximum, 42);
  assert.equal(context.activePanelCladeContext, null);
  assert.equal(renders.at(-1), 'original');
  for (const control of controls.values()) assert.equal(control.value, '17');
});

test('PNG encoding failure is awaited, reported, and object URL released', async () => {
  const { context, run, get } = fixture();
  let revoked = 0, downloaded = false;
  Object.assign(context, {
    Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ },
    serializedSvg: async () => '<svg/>',
    Image: class { async decode() {} },
    PhyloRenderPngRaster: require('../render/png-raster.js'),
    PhyloRenderContract: require('../figure-contract.js'),
    figureUnits: require('../figure-units.js'),
    physicalOutputReport: () => ({effective_dpi:300}),
    boundedBrowserPngScale: () => 2,
    downloadBlob: () => { downloaded = true; },
  });
  context.state.currentSvgSize = { width: 100, height: 100 };
  const createElement = context.document.createElement;
  context.document.createElement = name => name === 'canvas' ? {
    getContext: () => ({ scale() {}, fillRect() {}, drawImage() {} }),
    toBlob: fn => setTimeout(() => fn(null), 0),
  } : createElement(name);
  vm.runInContext(source.slice(source.indexOf('function pngRasterPorts('), source.indexOf('async function svgTextToPngBlob(')), context);
  vm.runInContext(source.slice(source.indexOf('async function exportPng('), source.indexOf('function numericStepPrecision(')), context);
  assert.equal((await context.exportPng()).status, 'error');
  assert.match(get('export-progress-detail').textContent, /PNG encoding failed/);
  assert.equal(revoked, 1);
  assert.equal(downloaded, false);
  assert.equal((await run('SVG', ['下载'], async () => {})).status, 'success');
});
