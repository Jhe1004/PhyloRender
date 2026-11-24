const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../core/tree-input.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
test('all workspaces start with width fitting and imports reset the default view',()=>{
  const initial = require('../core/document-state.js').createDocument();
  assert.equal(initial.zoom, 1);
  assert.equal(initial.viewportFitMode, 'width');
  assert.match(source,/state\.workspaceMode = mode;\s*resetDefaultTreeView\(\)/);
  assert.match(source,/const parsed = parsedRoot \|\| parseNewick\(\$\("newick-input"\)\.value\);[\s\S]{0,450}resetDefaultTreeView\(\)/);
  assert.match(source,/const parsed = await parseNewickAsync\(text\);\s*resetDefaultTreeView\(\)/);
  assert.match(source,/renderCloudTree\(\);\s*fitTreeWidth\(\);/);
  assert.match(source,/viewportObserver\.observe\(\$\("tree-viewport"\)\)/);
});
test('automatic width fitting changes only screen geometry and respects manual zoom',()=>{
  const state={zoom:1,viewportFitMode:'width',currentSvgSize:{width:2000,height:20000}};
  const viewport={clientWidth:985,clientHeight:700,scrollLeft:300,scrollTop:600};
  const attrs={};
  const elements={'tree-viewport':viewport,'tree-stage':{style:{}},'tree-svg':{style:{}},'zoom-value':{},
    'zoom-width':{setAttribute:(k,v)=>attrs.width=v},'zoom-fit':{setAttribute:(k,v)=>attrs.window=v}};
  const ctx=vm.createContext({state,$:id=>elements[id]});
  vm.runInContext(source.slice(source.indexOf('function updateStageSize('),source.indexOf('function setZoom(')),ctx);
  ctx.updateStageSize();
  assert.equal(state.zoom,937/2000);assert.equal(viewport.scrollLeft,0);
  assert.equal(attrs.width,'true');assert.equal(attrs.window,'false');
  viewport.clientWidth=1200;ctx.updateStageSize();assert.equal(state.zoom,1152/2000);
  state.viewportFitMode='manual';state.zoom=1.25;viewport.clientWidth=800;
  ctx.updateStageSize();assert.equal(state.zoom,1.25);assert.equal(attrs.width,'false');
  state.viewportFitMode='window';ctx.updateStageSize();assert.equal(state.zoom,652/20000);
  ctx.resetDefaultTreeView();assert.equal(state.viewportFitMode,'width');assert.equal(viewport.scrollTop,0);
  assert.deepEqual(state.currentSvgSize,{width:2000,height:20000});
});
test('window and panel resize explicitly restore width fitting after manual or window fit',()=>{
  const handlers=new Map();let fits=0;
  const state={viewportFitMode:'manual'};
  const noop=()=>{};
  const ctx=vm.createContext({state,window:{addEventListener:(name,callback)=>handlers.set(name,callback)},
    closeConflictBranchMenu:noop,closeBranchHoverTip:noop,closeBranchContextMenu:noop,
    closeCloudPieMenu:noop,hideHelpTooltip:noop,
    fitTreeWidth:()=>{fits++;state.viewportFitMode='width';}});
  const start=source.indexOf('  window.addEventListener("resize", () => {\n    closeConflictBranchMenu();');
  const end=source.indexOf('  $("tree-viewport").addEventListener("scroll"',start);
  assert.ok(start>=0&&end>start);
  vm.runInContext(source.slice(start,end),ctx);
  for(const event of ['resize','phylorender-panel-resize']){
    for(const mode of ['manual','window','width']){
      state.viewportFitMode=mode;handlers.get(event)();assert.equal(state.viewportFitMode,'width');
    }
  }
  assert.equal(fits,6);
});
