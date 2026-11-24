const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('cloud branches, pie presentation and composition have independent public modules', () => {
  for (const file of ['render/cloud-branches.js','render/cloud-pies.js','render/cloud-tree.js'])
    assert.ok(fs.existsSync(path.resolve(__dirname,'..',file)), 'Missing module '+file);
});
const branches = require('../render/cloud-branches.js');
const pies = require('../render/cloud-pies.js');
const renderer = require('../render/cloud-tree.js');
const model = require('../cloud-tree.js');
const scheduler = require('../core/render-scheduler.js');
const outputGeometry = require('../core/output-geometry.js');
function horizontalLayoutForHeight(height, naturalBaseWidth, reservedWidth, options = {}) {
  const fixedWidth = Math.max(reservedWidth, Number(options.rightContentReserve) || 0);
  return {...outputGeometry.calculate({height,naturalPlotWidth:naturalBaseWidth-reservedWidth,fixedWidth,
    minimumPlotWidth:options.minimumTreeSpan||160,maximumCanvasWidth:1511,mode:'content'}),
    maximumWidthMm:400,rightReserve:fixedWidth,naturalBaseWidth};
}
function svgEl(tag, attributes = {}, text = '') {
  return {tag, attributes:{...attributes}, text, children:[], dataset:{},
    append(...children) {this.children.push(...children);},
    replaceChildren(...children) {this.children=[...children];},
    classList:{toggle() {}},
    setAttribute(name,value) {this.attributes[name]=String(value);},
    querySelectorAll(tag){return this.children.filter(x=>x.tag===tag);},
    getBBox(){return{x:Number(this.attributes.x||0),y:Number(this.attributes.y||0),width:12,height:10};},
    get lastElementChild() {return this.children.at(-1);},
  };
}
test('all cloud rendering factories refuse missing ports and expose frozen APIs', () => {
  assert.throws(()=>branches.create(),/Missing cloud branch/);
  assert.throws(()=>pies.create(),/Missing cloud pie/);
  assert.throws(()=>renderer.create(),/Missing cloud render/);
  assert.ok(Object.isFrozen(branches.create({svgEl,model})));
  assert.ok(Object.isFrozen(pies.create({svgEl,model})));
});
function compositionPorts(overrides = {}) {
  return {svgEl, model, colorModel:require('../core/cloud-group-colors.js'), branches:branches.create({svgEl,model}), pies:pies.create({svgEl,model}),
    jitterModel:require('../core/cloud-jitter.js'),jitterLimits:require('../figure-contract.js').cloudJitter,
    backgroundRenderer:{}, display:{GEOLOGIC_EPOCHS:[]}, publishSize() {}, horizontalLayoutForHeight,
    appendTipLabelContent() {},fitTipLabelWidth(){}, updateRankNormalizationStatus() {},
    buildCladeBarLayout() {}, drawCladeBars() {}, finalizeCanvas:require('../render/canvas-finalizer.js').finalize,
    planRows:require('../figure-contract.js').planAutomaticRows,...overrides};
}
function compositionConfig(svg, cloud, options = null, tips = []) {
  return {svg,model:cloud,options,tips,rowStep:25,timeBackground:{visible:false,geologyVisible:false},
    timeFonts:{axisOffset:20,key:10,periodRow:20,epochRow:20},unit:'relative',fontFamily:'Arial',
    cladeSelectionMode:false,labelSource:{},provenance:{dating:{},clades:{}}};
}
test('composition instances render empty documents independently through explicit ports', () => {
  const a=svgEl('svg'),b=svgEl('svg'),sizesA=[],sizesB=[],cloud={speciesRoot:null};
  const left=renderer.create(compositionPorts({publishSize:size=>sizesA.push(size)}));
  const right=renderer.create(compositionPorts({publishSize:size=>sizesB.push(size)}));
  assert.ok(Object.isFrozen(left));
  const empty=scheduler.finishRenderSteps(left.renderSteps(compositionConfig(a,cloud)));
  assert.deepEqual({tips:empty.tips,matchedCount:empty.matchedCount,rangeCounts:empty.rangeCounts,labels:empty.labels},
    {tips:0,matchedCount:0,rangeCounts:null,labels:null});
  assert.equal(empty.layout.maximumWidthMm,400);
  assert.equal(a.children.length,2); assert.equal(b.children.length,0); assert.equal(sizesB.length,0);
  scheduler.finishRenderSteps(right.renderSteps(compositionConfig(b,cloud)));
  const content=element=>({tag:element.tag,attributes:element.attributes,text:element.text});
  assert.deepEqual(a.children.map(content),b.children.map(content)); assert.deepEqual(sizesA,sizesB);
  assert.deepEqual(cloud,{speciesRoot:null});
});
test('composition refuses untrusted gene ages before committing the gene layer', () => {
  const a={id:'a',label:'A',children:[]},b={id:'b',label:'B',children:[]};
  const root={id:'r',children:[a,b]},gene=structuredClone(root),ages=new Map([[root,10],[a,0],[b,0]]);
  const cloud={speciesRoot:root,geneRoots:[gene],datedRootAge:10,datedAges:new Map([[root,ages],[gene,new Map()]]),
    hiddenPieNodes:new Set(),cladeColors:new Map(),geneDatingEngine:'untrusted',datingEngine:'relative-display'};
  const before=structuredClone(cloud),svg=svgEl('svg');
  const explicitBranches={...branches.create({svgEl,model}),*alignedRowSteps() {return new Map([[root,20],[a,10],[b,30]]);}};
  const steps=renderer.create(compositionPorts({branches:explicitBranches})).renderSteps(
    compositionConfig(svg,cloud,{age:10,showGene:true,speciesShape:'triangular',pieAgeRange:{}},[a,b]));
  assert.throws(()=>scheduler.finishRenderSteps(steps),/treePL/i);
  assert.ok(!svg.children.some(child=>child.attributes.class==='cloud-gene-lines'));
  assert.deepEqual(cloud,before);
});
test('aligned-row caches belong to one branch factory and never leak to another document renderer', () => {
  const root={id:'r'},ages=new Map([[root,10]]); let searches=0;
  const custom={*optimizeAlignedRowsSteps() {searches++;yield {};return new Map([[root,5]]);}};
  const left=branches.create({svgEl,model:custom}),right=branches.create({svgEl,model:custom});
  const finish=engine=>scheduler.finishRenderSteps(engine.alignedRowSteps(root,['A'],ages,10,0,20));
  assert.deepEqual(finish(left),finish(left)); assert.equal(searches,1);
  assert.deepEqual(finish(right),finish(left)); assert.equal(searches,2);
});
test('branch rendering consumes only explicit colors, ages and coordinates, without mutating nodes', () => {
  const a={id:'a',label:'A',length:1,children:[]},b={id:'b',label:'B',length:1,children:[]};
  const root={id:'r',label:'',children:[a,b]}, saved=structuredClone(root);
  const ages=new Map([[root,10],[a,0],[b,0]]), ys=new Map([[root,20],[a,10],[b,30]]);
  const engine=branches.create({svgEl,model}), colors=engine.cladeColorMap(root,new Map([['r','#123']]));
  const group=svgEl('g'), segments=[];
  engine.appendTriangularBranches(root,ages,ys,group,age=>10-age,segments,colors);
  assert.equal(group.children.length,2); assert.equal(segments.length,2);
  assert.equal(group.children[0].attributes.stroke,'#123');
  assert.deepEqual(root,saved); assert.deepEqual([...ages.values()],[10,0,0]);
  const other=engine.cladeColorMap(root,new Map());
  assert.equal(other.size,0); assert.equal(colors.get(a),'#123');
});
test('pie glyphs keep original four counts, mode fractions and a tiny solid hidden marker', () => {
  const engine=pies.create({svgEl,model}), row={id:'Node1',concordant:4,dominant:2,other:1,noSignal:3,conflict:3,informative:7,total:10};
  const saved=structuredClone(row), group=svgEl('g');
  engine.cloudPie(group,{x:20,y:30,radius:8,anchorX:20,anchorY:30},row,'four',12);
  assert.equal(group.children[0].attributes['data-pie-radius'],'8.00');
  const sliceFills=group.children[0].children.filter(el=>el.tag==='path'||(el.tag==='circle'&&el.attributes.fill!=='none')).map(el=>el.attributes.fill);
  const outerRing=group.children[0].children.find(el=>el.tag==='circle'&&el.attributes.fill==='none');
  assert.equal(outerRing?.attributes['stroke-width'],1.1);
  assert.deepEqual(sliceFills,['#4477ad','#e69f00','#d94d43','#aeb5bc']);
  assert.ok(!sliceFills.includes('#17833b'));
  assert.deepEqual(row,saved);
  engine.appendHiddenNode(group,{row,x:20,y:30});
  const marker=group.lastElementChild.children.at(-1);
  assert.equal(marker.attributes.r,1.5); assert.equal(marker.attributes.stroke,'none');
  assert.equal(marker.attributes.fill,'#202a30');
  assert.deepEqual(row,saved);
});
test('pie legend scale enlarges the whole collision box and every legend glyph together', () => {
  const engine=pies.create({svgEl,model}),svg=svgEl('svg');
  engine.appendLegend(svg,'four',{x:80,y:100,width:390,height:315},'Arial',1.5);
  const legend=svg.lastElementChild;
  assert.equal(legend.attributes.transform,'translate(80 100) scale(1.5)');
  assert.equal(legend.attributes['data-pie-legend-scale'],1.5);
  assert.equal(legend.attributes['data-layout-width'],390);
  assert.equal(legend.children[0].attributes.x,130);
  const legendSliceFills=legend.children.filter(el=>el.tag==='path'||(el.tag==='circle'&&el.attributes.fill!=='none')).map(el=>el.attributes.fill);
  assert.ok(legendSliceFills.includes('#e69f00'));
  assert.ok(!legendSliceFills.includes('#17833b'));
});
test('hidden and time-filtered pies still reserve all placements but do not alter statistics', () => {
  const nodes=[{id:'n1'},{id:'n2'},{id:'n3'}];
  const rows=nodes.map((n,i)=>({id:'Node'+i,concordant:1,dominant:1,other:0,noSignal:0,conflict:1,informative:2,total:2}));
  let reserved=0;
  const custom={...model,matchPhyParts:()=>({matched:new Map(nodes.map((n,i)=>[n,rows[i]]))}),
    *layoutPiePlacementSteps(items) {reserved=items.length;yield {phase:'pie-candidate'};
      return new Map(items.map(item=>[item.node,{...item,radius:8,anchorX:item.x,anchorY:item.y}]));}};
  const hidden=new Set(['Node1']), ages=new Map(nodes.map((n,i)=>[n,3-i]));
  const config={svg:svgEl('svg'),species:{},table:{},speciesAges:ages,speciesY:new Map(nodes.map((n,i)=>[n,i*20])),
    xOf:age=>age*20,branches:[],options:{mode:'four',radius:12,pieAgeRange:{minimum:2,maximum:null}},
    labelBoxes:[],hiddenNodes:hidden,rootAge:10};
  const result=scheduler.finishRenderSteps(pies.create({svgEl,model:custom}).renderLayerSteps(config));
  assert.equal(reserved,3); assert.equal(result.matchedCount,1);
  assert.deepEqual(result.rangeCounts,{visible:1,total:3,filtered:1,manual:1});
  assert.deepEqual([...hidden],['Node1']); assert.deepEqual([...ages.values()],[3,2,1]);
  assert.deepEqual(rows.map(row=>row.total),[2,2,2]);
});
test('cancellation closes pie search before any pie layer is committed', async () => {
  const node={id:'n'}, row={id:'Node1',concordant:1,dominant:1,other:0,noSignal:0,conflict:1,informative:2,total:2};
  let closed=false;
  const custom={...model,matchPhyParts:()=>({matched:new Map([[node,row]])}),
    *layoutPiePlacementSteps() {try {yield {};yield {};} finally {closed=true;}}};
  const svg=svgEl('svg'),hidden=new Set(), ages=new Map([[node,3]]),controller=new AbortController();
  const steps=pies.create({svgEl,model:custom}).renderLayerSteps({svg,species:{},table:{},speciesAges:ages,
    speciesY:new Map([[node,20]]),xOf:x=>x,branches:[],options:{mode:'four',radius:12,pieAgeRange:{minimum:null,maximum:null}},labelBoxes:[],hiddenNodes:hidden,rootAge:10});
  let clock=0;
  await assert.rejects(scheduler.run(steps,{signal:controller.signal,now:()=>clock+=30,pause:async()=>{},onProgress:()=>controller.abort()}),/abort/i);
  assert.equal(closed,true); assert.equal(svg.children.length,0);
  assert.equal(hidden.size,0); assert.equal(ages.get(node),3); assert.equal(steps.next().done,true);
});

test('cloud gene-tree layer applies effectiveGeneOpacity and crisp neutral stroke', () => {
  const {parseNewick}=require('../core/tree-input.js');
  const species=parseNewick('(O:10,((A:2,B:2):4,C:6):4);');
  const genes=Array.from({length:17},()=>parseNewick('(O:10,((A:2,B:2):4,C:6):4);'));
  const agesMap=new Map([[species,model.importedDatedAges(species).ages],
    ...genes.map(gene=>[gene,model.importedDatedAges(gene).ages])]);
  const cloud={speciesRoot:species,geneRoots:genes,datedRootAge:10,datedAges:agesMap,
    cladeColors:new Map(),hiddenPieNodes:new Set(),datingEngine:'bundled-treePL',geneDatingEngine:'bundled-treePL'};
  const svg=svgEl('svg');
  scheduler.finishRenderSteps(renderer.create(compositionPorts({buildCladeBarLayout:()=>({items:[],requiredWidth:0})})).renderSteps({
    svg,model:cloud,options:{age:10,opacity:0.18,jitter:0,branchWidth:1.2,showGene:true,showSpecies:true,
      showPies:false,speciesShape:'triangular',ladderDirection:'file',pieAgeRange:{}},
    tips:model.tips(species),rowStep:25,timeBackground:{visible:false,geologyVisible:false},
    timeFonts:{axisOffset:20,key:10,periodRow:20,epochRow:20},unit:'relative',fontFamily:'Arial',
    cladeSelectionMode:false,labelSource:{},provenance:{dating:{},clades:{}}}));
  const geneGroup=svg.children.find(child=>child.attributes.class==='cloud-gene-lines');
  assert.equal(geneGroup.attributes.stroke,'#52606d');
  assert.equal(geneGroup.attributes['stroke-width'],1);
  assert.equal(geneGroup.attributes['stroke-opacity'],model.effectiveGeneOpacity(0.18,17));
  assert.equal(geneGroup.attributes['data-configured-opacity'],0.18);
});
