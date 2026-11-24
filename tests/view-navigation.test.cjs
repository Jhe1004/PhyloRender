const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const code = source.slice(source.indexOf('function setZoom('), source.indexOf('function unicodeRangeIncludesAny('));
function setup() {
  const viewport = { clientWidth: 1000, clientHeight: 700, scrollLeft: 300, scrollTop: 900 };
  const elements = { 'tree-viewport': viewport, 'tree-search-input': { value: '' }, 'tree-search-status': {}, 'view-back': {disabled:true} };
  let labels = [];
  elements['tree-svg'] = { querySelectorAll: () => labels };
  const context = vm.createContext({ state: { zoom: 1, currentSvgSize: { width: 2000, height: 20000 } },
    findNodeById: root => root, closeBranchContextMenu() {},
    activeCladeRoot: () => context.state.root,
    $: id => elements[id], updateStageSize() {}, getComputedStyle: () => ({fontSize:'18px'}) });
  vm.runInContext(code, context);
  return { context, viewport, elements, setLabels: value => { labels = value; } };
}
test('large tree really fits below old 25 percent minimum', () => {
  const {context, viewport} = setup();
  context.fitZoom();
  assert.equal(context.state.viewportFitMode, 'window');
  assert.equal(context.state.zoom, 652 / 20000);
  assert.equal(viewport.scrollTop, 0);
  assert.equal(viewport.scrollLeft, 0);
});
test('zoom preserves the point at the viewport center and pointer', () => {
  const {context, viewport} = setup();
  context.setZoom(2);
  assert.equal(context.state.viewportFitMode, 'manual');
  assert.equal(viewport.scrollLeft, (300 + 500 - 24) * 2 + 24 - 500);
  assert.equal(viewport.scrollTop, (900 + 350 - 24) * 2 + 24 - 350);
  context.setZoom(1);
  assert.equal(viewport.scrollLeft, 300);
  assert.equal(viewport.scrollTop, 900);
  context.setZoom(2, { x:100, y:100 });
  assert.equal(viewport.scrollLeft, 676);
  context.setZoom(NaN);
  assert.equal(context.state.zoom, 2);
});
test('fit width accounts for a newly appearing vertical scrollbar', () => {
  const {context,viewport} = setup();
  context.updateStageSize = () => { viewport.clientWidth = 985; };
  context.fitTreeWidth();
  assert.equal(context.state.viewportFitMode, 'width');
  assert.equal(context.state.zoom * context.state.currentSvgSize.width, 937);
  assert.equal(viewport.scrollLeft, 0);
});
test('search handles original and displayed names, cycling, empty and missing values', () => {
  const {context, elements, setLabels} = setup();
  setLabels(['Clematis a', 'Clematis b'].map((textContent,i) => ({textContent,
    getAttribute: () => `Original_${i}`, getBBox: () => ({x:600,y:800+i*50,width:120,height:20}) })));
  elements['tree-search-input'].value = 'clematis';
  context.locateTreeTip(true);
  assert.match(elements['tree-search-status'].textContent, /^1\/2/);
  context.locateTreeTip(true);
  assert.match(elements['tree-search-status'].textContent, /^2\/2/);
  context.locateTreeTip(true);
  assert.match(elements['tree-search-status'].textContent, /^1\/2/);
  elements['tree-search-input'].value = 'original 1';
  context.locateTreeTip(true);
  assert.match(elements['tree-search-status'].textContent, /1\/1 · Clematis b/);
  elements['tree-search-input'].value = 'missing';
  context.locateTreeTip();
  assert.equal(elements['tree-search-status'].textContent, 'No matching taxon');
});
test('navigation never invokes layout, edits SVG labels, or changes font controls', () => {
  assert.doesNotMatch(code, /renderTree|requestSettingsRender|setAttribute|innerHTML|\.value\s*=/);
});
test('issue navigation cycles exact reported labels and preserves return view', () => {
  const {context,elements,setLabels,viewport} = setup();
  elements['collision-count']={textContent:'2'};
  elements['issue-location-status']={};
  context.countResidualCollisions={issues:[0,1].map(i=>({id:String(i),x:300,y:2000+i*500,reason:'数字与树枝遮挡',node:{x:400,y:2000+i*500}}))};
  context.updateLabelWarnings={issues:[]};
  context.document={querySelector:()=>null,createElement:()=>({style:{},remove(){}}),body:{append(){}}};
  context.setTimeout=()=>0;
  setLabels([0,1].map(i=>({dataset:{labelId:String(i)},textContent:`1.0/${80+i}`,getBBox:()=>({x:300,y:2000+i*500,width:100,height:20}),getBoundingClientRect:()=>({left:300,top:300,width:100,height:20})})));
  const originalTop=viewport.scrollTop;
  context.locateLayoutIssue('collision');
  assert.match(elements['issue-location-status'].textContent,/^1\/2/);
  assert.notEqual(viewport.scrollTop,originalTop);
  context.locateLayoutIssue('collision');
  assert.match(elements['issue-location-status'].textContent,/^2\/2/);
  context.locateLayoutIssue('collision');
  assert.match(elements['issue-location-status'].textContent,/^1\/2/);
  context.locateLayoutIssue('warning');
  assert.equal(elements['issue-location-status'].textContent,'No layout issues of this type');
});
test('view history restores zoom and scroll and discards old-tree entries', () => {
  const {context, viewport,elements} = setup();
  context.rememberTreeView();
  context.setZoom(2);
  context.restoreTreeView();
  assert.equal(context.state.zoom, 1);
  assert.equal(viewport.scrollLeft, 300);
  assert.equal(viewport.scrollTop, 900);
  assert.equal(elements['view-back'].disabled, true);
  context.rememberTreeView();
  context.state.root = {};
  context.setZoom(2);
  context.restoreTreeView();
  assert.equal(context.state.zoom, 2);
});
test('branch focus includes descendant labels without changing topology or geometry', () => {
  const {context, viewport, setLabels} = setup();
  context.state.root = {id:'root',x:500,y:500,children:[{id:'tip',x:800,y:600,children:[]}]};
  setLabels([{getAttribute:()=> 'tip', getBBox:()=>({x:810,y:590,width:200,height:20})}]);
  const before = JSON.stringify(context.state.root);
  context.focusSelectedBranch();
  assert.equal(JSON.stringify(context.state.root),before);
  assert.equal(context.state.zoom,928/510);
  assert.ok(viewport.scrollLeft>0);
});
