const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const bridge = fs.readFileSync(path.join(__dirname, '..', 'agent-bridge.js'), 'utf8');

test('legacy redraw entry owns an asynchronous, cancellable render in every workspace', async () => {
  for (const workspaceMode of ['phylogeny', 'time', 'cloud', 'conflict']) {
    let rendered = false, owned = false;
    const context = vm.createContext({
      activeTreeLoad: false, state: { workspaceMode },
      runTreeLoad: async (_title, task) => {
        owned = true;
        await task({ stage: async () => {}, report() {} });
        return true;
      },
      ensureFigureFontsReady: async () => {},
      renderTreeCooperatively: async (_progress, options) => {
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(options.reuseLabelLayout, false);
        rendered = true;
      },
      updateConflictWorkspaceStatus() {},
      requestConflictRender: () => assert.fail('default routing must share owned cooperative rendering'),
      renderCloudTree: () => assert.fail('synchronous cloud render'),
      renderConflictTree: () => assert.fail('synchronous conflict render'),
      renderTimeTree: () => assert.fail('synchronous Dating render'),
      renderPhylogenyTree: () => assert.fail('synchronous ordinary render'),
    });
    vm.runInContext(source.slice(source.indexOf('function renderTree(options'), source.indexOf('function conflictTreesReady(')), context);
    assert.equal(await context.renderTree(), true);
    assert.equal(owned, true);
    assert.equal(rendered, true);
    context.activeTreeLoad = true;
    assert.equal(context.renderTree(), undefined, 'late callbacks cannot overlap an owned load');
  }
});

test('cloud compatibility entry delegates without synchronously exhausting candidate search', async () => {
  let calls = 0;
  const context = vm.createContext({ activeTreeLoad: false, state: { cloud: { speciesRoot: {} } },
    renderTree: async () => { calls++; return 'interactive'; },
    renderTreeCooperatively: async () => { calls++; return 'owned'; },
    finishRenderSteps: () => assert.fail('cloud search must yield'),
    renderCloudTreeSteps: () => assert.fail('must use cooperative runner'),
  });
  vm.runInContext(source.slice(source.indexOf('function renderCloudTree()'), source.indexOf('function* renderCloudTreeSteps()')), context);
  assert.equal(await context.renderCloudTree(), 'interactive');
  context.activeTreeLoad = true;
  assert.equal(await context.renderCloudTree(), 'owned');
  assert.equal(calls, 2);
  context.activeTreeLoad = false;
  context.state.cloud.speciesRoot = null;
  assert.equal(await context.renderCloudTree(), 'owned', 'empty placeholder cannot block the next import');
});

test('MCP reports and two-panel rendering/restoration wait for cooperative rendering', () => {
  assert.doesNotMatch(bridge, /\brenderTree\(/);
  const pages = source.slice(source.indexOf('async function buildA4PrintPages('), source.indexOf('async function svgTextToPngBlob('));
  assert.doesNotMatch(pages, /\brenderTree\(/);
  assert.match(pages, /await renderTreeCooperatively/);
  const imports = source.slice(source.indexOf('globalThis.PhyloRenderImportCloudSpecies ='), source.indexOf('$("cloud-phyparts-recalculate").addEventListener'));
  assert.doesNotMatch(imports, /(?<!await )renderCloudTree\(\)/);
});

test('failed species import keeps the transaction error and does not launch a second redraw', async () => {
  const cloud = { speciesRoot: { label: 'retained' }, speciesName: 'last-valid.tree' };
  let redraws = 0, loads = 0;
  const context = vm.createContext({
    state: { cloud, workspaceMode: 'cloud' }, structuredClone,
    document: { querySelectorAll: () => [] },
    $: id => id === 'cloud-species-method' ? { value: 'dated' }
      : { textContent: 'invalid dated input' },
    runTreeLoad: async () => { loads++; return false; },
    renderCloudTree: async () => { redraws++; },
    renderTipLabelMappingControls() {}, updateCloudStatus() {},
  });
  const start = source.indexOf('globalThis.PhyloRenderImportCloudSpecies =');
  const end = source.indexOf('$("cloud-species-file").addEventListener', start);
  vm.runInContext(source.slice(start, end), context);
  await assert.rejects(context.PhyloRenderImportCloudSpecies({ name: 'invalid.tree' }),
    /invalid dated input/);
  assert.equal(loads, 1);
  assert.equal(redraws, 0, 'a second successful redraw would erase the failed-import dialog');
  assert.equal(context.state.cloud, cloud, 'the owned transaction alone restores its model');
});
