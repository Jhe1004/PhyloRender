const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function fixture() {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, value: 0, textContent: '', dataset: {}, attributes: [], style: {transform:'scale(1)'},
      removeAttribute(name) { this.attributes = this.attributes.filter(a => a.name !== name); },
      removeAttributeNode(attribute) { this.attributes = this.attributes.filter(a => a !== attribute); },
      setAttributeNodeNS(attribute) { this.attributes.push(attribute); }, focus() {} });
    return elements.get(id);
  };
  const backgrounds = [{ inert: false }, { inert: true }];
  const events = new Map();
  const calls = [];
  let time = 0;
  const context = vm.createContext({
    structuredClone, console, AbortController,
    PhyloRenderDocumentState: require('../core/document-state.js'),
    PhyloRenderImportState: require('../ui/import-state.js'),
    PhyloRenderCanvasFinalizer: require('../render/canvas-finalizer.js'),
    figureUnits: require('../figure-units.js'),
    PhyloRenderRenderScheduler: {...require('../core/render-scheduler.js'),
      run: (steps,options)=>require('../core/render-scheduler.js').run(steps,{...options,now:()=>time+=30})},
    parseNewickAsync: async text => text,
    readTreeFile: async file => file.text(),
    $, document: { activeElement: null, querySelectorAll: () => backgrounds },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    performance: { now: () => time += 30 }, setTimeout, setInterval, clearTimeout, clearInterval,
    exportPaint: async () => { await new Promise(resolve => setTimeout(resolve, 0)); },
    showMessage: message => calls.push(['message', message]),
    state: require('../core/document-state.js').createDocument(),
    renderTree: () => {}, renderTipLabelMappingControls: () => {},
    updateWorkspaceModeUi: () => {},
    refreshTaxonNameRecognition: async options => calls.push(['names', options.deferRender]),
    ensureFigureFontsReady: async () => calls.push(['fonts']),
    figureFontLoadKey: () => 'font-ready', renderNodeDataLists: () => calls.push(['lists']),
    renderPhylogenyTreeSteps: function* () {
      calls.push(['render']);
      yield { phase: 'labels', current: 1, total: 2 }; yield;
      yield { phase: 'compact', current: 2, total: 2 };
      return 'same-output';
    },
    renderTimeTreeSteps: function* () { calls.push(['time']); yield; return 'time-output'; },
  });
  vm.runInContext(section('let lastRenderedFigureFontKey = null;', 'function renderTree(options'), context);
  context.rememberNodeLabelLayout = () => {};
  return { context, $, calls, backgrounds, events };
}

test('boot indicator is in initial HTML before any application scripts', () => {
  const markup = html.match(/<section id="tree-loading"[^>]*>/)[0];
  assert.doesNotMatch(markup, /\bhidden\b/);
  assert.ok(html.indexOf(markup) < html.indexOf('<script'));
  assert.match(html, /id="tree-loading-bar" max="8"/);
});

test('loading paints first, prevents overlap, restores existing inert states', async () => {
  const { context, $, events, backgrounds } = fixture();
  const result = await context.runTreeLoad('测试加载', async progress => {
    assert.equal($('tree-loading').hidden, false);
    assert.deepEqual(backgrounds.map(x => x.inert), [true, true]);
    assert.ok(events.has('beforeunload'));
    assert.equal(await context.runTreeLoad('duplicate', () => assert.fail()), false);
    await progress.stage(5, '真实计算阶段');
    progress.report(4, '重试检查');
    assert.equal($('tree-loading-bar').value, 5);
  });
  assert.equal(result, true);
  assert.equal($('tree-loading').hidden, true);
  assert.equal($('tree-loading-bar').value, 8);
  assert.deepEqual(backgrounds.map(x => x.inert), [false, true]);
  assert.equal(events.size, 0);
});

test('loading errors are visible, release controls, and permit retry', async () => {
  const { context, $, events, backgrounds } = fixture();
  assert.equal(await context.runTreeLoad('失败', async () => { throw Error('无效树'); }), false);
  assert.equal($('tree-loading').hidden, false);
  assert.equal($('tree-loading').dataset.state, 'error');
  assert.match($('tree-loading-detail').textContent, /无效树/);
  assert.equal($('tree-loading-close').hidden, false);
  assert.equal(events.size, 0);
  assert.deepEqual(backgrounds.map(x => x.inert), [false, true]);
  assert.equal(await context.runTreeLoad('重试', async () => {}), true);
});

test('cooperative runner yields to event loop, preserves return and progress through empty checkpoints', async () => {
  const { context, calls } = fixture();
  let heartbeat = false;
  setTimeout(() => { heartbeat = true; }, 0);
  const reports = [];
  assert.equal(await context.renderTreeCooperatively(update => reports.push(update.phase)), 'same-output');
  assert.equal(heartbeat, true);
  assert.deepEqual(reports, ['labels', 'labels', 'compact']);
  assert.equal(context.finishRenderSteps(context.renderPhylogenyTreeSteps()), 'same-output');
  assert.equal(calls.filter(x => x[0] === 'render').length, 2);
  context.state.workspaceMode = 'time';
  assert.equal(await context.renderTreeCooperatively(), 'time-output');
});

test('name recognition and fonts finish before exactly one interactive render', async () => {
  const { context, calls } = fixture();
  await context.runTreeLoad('load', progress => context.finishInteractiveTreeLoad(progress));
  assert.deepEqual(calls, [['names', true], ['fonts'], ['render'], ['lists']]);
});

test('default tree and support source are assembled before final rendering', async () => {
  const { context, calls } = fixture();
  Object.assign(context, {
    DEFAULT_MAIN_TREE: { url: 'main', name: 'main' }, DEFAULT_SUPPORT_TREE: { url: 'support', name: 'support' },
    loadTextResource: async url => url, DEMO_TREE: '(A,B);',
    parseAndDraw: options => { assert.equal(options.deferRender, true); assert.equal(options.throwOnError, true); context.state.nodeDataSources = []; },
    createNodeDataSource: text => ({ text }),
    finishInteractiveTreeLoad: async () => {
      assert.equal(context.state.nodeDataSources[0].text, 'support'); calls.push(['final-render']);
    },
  });
  vm.runInContext(section('async function loadDefaultWorkspace()', 'function bindControls()'), context);
  assert.equal(await context.loadDefaultWorkspace(), true);
  assert.equal(calls.filter(x => x[0] === 'final-render').length, 1);
});

test('data imports batch files and render once', async () => {
  const { context, calls } = fixture();
  context.state.root = {};
  context.state.nodeDataSources = [];
  context.state.manualLabels = new Map();
  context.createNodeDataSource = (text, name) => ({ text, name, values: new Map([['fixture','95']]), scale:'percent' });
  context.mainSupportScales = values => require('../core/support-values.js').create(require('../core/support-scale.js')).profile(values.values(),'percent');
  context.finishInteractiveTreeLoad = async () => calls.push(['final-render']);
  vm.runInContext(section('async function importNodeDataFiles(', 'function findNodeById('), context);
  await context.importNodeDataFiles([{ name: 'a', text: async () => '(A,B);' }, { name: 'b', text: async () => '(A,B);' }], 'support');
  assert.equal(context.state.nodeDataSources.length, 2);
  assert.equal(calls.filter(x => x[0] === 'final-render').length, 1);
});

test('cooperative failures close the generator and do not claim success', async () => {
  const { context } = fixture();
  let closed = false;
  context.renderPhylogenyTreeSteps = function* () { try { yield; throw Error('renderer failed'); } finally { closed = true; } };
  await assert.rejects(context.renderTreeCooperatively(), /renderer failed/);
  assert.equal(closed, true);
});
test('cooperative redraw clears only owned old-mode diagnostics, preserving unrelated SVG attributes', async () => {
  const {context,$}=fixture();
  $('tree-svg').attributes=['data-cloud-layers','data-conflict-support-candidates','data-root-x','data-phylorender-renderer','data-custom-extension','viewBox'].map(name=>({name}));
  await context.renderTreeCooperatively();
  assert.deepEqual($('tree-svg').attributes.map(a=>a.name),['data-custom-extension','viewBox']);
});

test('all rejected support files preserve manual labels and show failure', async () => {
  const { context, $ } = fixture();
  context.state.root = {};
  context.state.nodeDataSources = [];
  context.state.manualLabels = new Map([['existing', { dx: 10 }]]);
  context.createNodeDataSource = () => { throw Error('无法匹配主树'); };
  vm.runInContext(section('async function importNodeDataFiles(', 'function findNodeById('), context);
  assert.equal(await context.importNodeDataFiles([{ name: 'invalid', text: async () => 'x' }], 'support'), false);
  assert.equal(context.state.manualLabels.size, 1);
  assert.equal(context.state.nodeDataSources.length, 0);
  assert.equal($('tree-loading').dataset.state, 'error');
});
