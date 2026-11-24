'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../cloud-tree.js'),scheduler=require('../core/render-scheduler.js');
const composition=require('../render/cloud-tree.js'),branches=require('../render/cloud-branches.js'),pies=require('../render/cloud-pies.js');
const colorModel=require('../core/cloud-group-colors.js'),contract=require('../figure-contract.js');
const outputGeometry=require('../core/output-geometry.js');
const horizontalLayoutForHeight=(height,natural,reserved,options={})=>({...outputGeometry.calculate({height,naturalPlotWidth:natural-reserved,
  fixedWidth:Math.max(reserved,options.rightContentReserve||0),minimumPlotWidth:160,maximumCanvasWidth:1511,mode:'content'}),maximumWidthMm:400});
const {parseNewick}=require('../core/tree-input.js');
const finish=scheduler.finishRenderSteps;
function element(tag,attributes={},text='') {
  return {tag,attributes:{...attributes},text,children:[],dataset:{},append(...x){this.children.push(...x);},
    replaceChildren(...x){this.children=x;},setAttribute(k,v){this.attributes[k]=String(v);},classList:{toggle(){}},
    querySelectorAll(tag){return this.children.filter(x=>x.tag===tag);},
    getBBox(){return{x:Number(this.attributes.x||0),y:Number(this.attributes.y||0),width:12,height:10};}};
}
function render(strength,jitterModel={},branchWidth=1.2) {
  const species=parseNewick('(O:10,(((A:2,B:2):1,C:3):3,(D:2,E:2):4):4);');
  const gene=parseNewick('(O:10,(((A:2,C:2):1,B:3):3,(D:2,E:2):4):4);'),svg=element('svg');
  const ages=root=>model.importedDatedAges(root).ages;
  const cloud={speciesRoot:species,geneRoots:[gene],datedRootAge:10,datedAges:new Map([[species,ages(species)],[gene,ages(gene)]]),
    cladeColors:new Map(),hiddenPieNodes:new Set(),datingEngine:'bundled-treePL',geneDatingEngine:'bundled-treePL'};
  const before=JSON.stringify({species,gene});
  const renderer=composition.create({planRows:require('../figure-contract.js').planAutomaticRows,svgEl:element,model,colorModel,jitterModel,jitterLimits:contract.cloudJitter,
    branches:branches.create({model,svgEl:element}),pies:pies.create({model,svgEl:element}),backgroundRenderer:{},
    display:{GEOLOGIC_EPOCHS:[]},publishSize(){},horizontalLayoutForHeight,appendTipLabelContent(){},fitTipLabelWidth(){},updateRankNormalizationStatus(){},
    buildCladeBarLayout(){return{items:[],requiredWidth:0};},drawCladeBars(){},finalizeCanvas:require('../render/canvas-finalizer.js').finalize});
  finish(renderer.renderSteps({svg,model:cloud,options:{age:10,jitter:strength,branchWidth,showGene:true,showSpecies:true,showPies:false,
    speciesShape:'triangular',ladderDirection:'file',pieAgeRange:{}},tips:model.tips(species),rowStep:24,
    timeBackground:{visible:false,geologyVisible:false},timeFonts:{axisOffset:20,key:10,periodRow:20},
    unit:'relative',fontFamily:'Arial',cladeSelectionMode:false,labelSource:{},provenance:{dating:{},clades:{}}}));
  assert.equal(JSON.stringify({species,gene}),before);
  return svg;
}
test('production rendering applies cloud jitter to gene edges while keeping the species tree straight',()=>{
  const optional=require('node:fs').existsSync(require('node:path').join(__dirname,'../core/cloud-jitter.js'))
    ?require('../core/cloud-jitter.js'):{};
  const svg=render(100,optional),group=name=>svg.children.find(x=>x.attributes.class===name);
  assert.ok(group('cloud-gene-lines').children.some(x=>x.attributes.d.includes(' C ')),
    'A nonzero cloud jitter must visibly bend gene edges, not be silently ignored');
  assert.ok(group('cloud-species-tree').children.every(x=>!x.attributes.d.includes(' C ')));
});
test('one shared branch-width setting scales both cloud layers without changing their visual hierarchy',()=>{
  const narrow=render(0,require('../core/cloud-jitter.js'),1.2),wide=render(0,require('../core/cloud-jitter.js'),2.4);
  const width=(svg,name)=>Number(svg.children.find(x=>x.attributes.class===name).attributes['stroke-width']);
  assert.equal(width(narrow,'cloud-gene-lines'),1);assert.equal(width(narrow,'cloud-species-tree'),2.2);
  assert.equal(width(wide,'cloud-gene-lines'),2);assert.equal(width(wide,'cloud-species-tree'),4.4);
});
const jitter=require('../core/cloud-jitter.js'),limits=contract.cloudJitter;
function fixture() {
  const root=parseNewick('(O:10,(((A:2,B:2):1,C:3):3,(D:2,E:2):4):4);');
  const ages=model.importedDatedAges(root).ages,rows=model.alignedRows(root,model.tips(root).map(x=>x.label),64,24);
  return {root,ages,rows,xOf:age=>72+(10-age)*100,config:{limits,rowStep:24,minimumY:64,maximumY:206,index:0}};
}
const numbers=path=>path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
test('zero and omitted strengths preserve every legacy path and all non-gene drawing content',()=>{
  const a=render(0,jitter),b=render(undefined,jitter),c=render(100,jitter);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  const withoutGenes=svg=>svg.children.filter(x=>x.attributes.class!=='cloud-gene-lines');
  assert.equal(JSON.stringify(withoutGenes(a)),JSON.stringify(withoutGenes(c)));
  const plain=a.children.find(x=>x.attributes.class==='cloud-gene-lines').children;
  const curved=c.children.find(x=>x.attributes.class==='cloud-gene-lines').children;
  for(let i=0;i<plain.length;i++) {
    const old=numbers(plain[i].attributes.d),next=numbers(curved[i].attributes.d);
    assert.deepEqual(next.slice(0,2),old.slice(0,2));assert.deepEqual(next.slice(-2),old.slice(-2));
    assert.deepEqual({...plain[i].attributes,d:null},{...curved[i].attributes,d:null});
  }
});
test('strength scales deterministic midsection displacement and keeps time linear and all controls bounded',()=>{
  const f=fixture(),snapshot=JSON.stringify(f.root),beforeAges=[...f.ages],beforeRows=[...f.rows];
  const maps=[25,50,100].map(strength=>finish(jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,strength})));
  assert.equal(maps[2].size,10);
  for(const [node,path] of maps[2]) {
    const full=numbers(path),at25=numbers(maps[0].get(node)),at50=numbers(maps[1].get(node));
    const straight=(full[1]+full[7])/2;
    const displacement=v=>(v[1]+3*v[3]+3*v[5]+v[7])/8-straight;
    assert.ok(Math.abs(displacement(full))<=12+1e-10);
    assert.ok(Math.abs(displacement(at25))<=Math.abs(displacement(at50))+1e-10);
    assert.ok(Math.abs(displacement(at50))<=Math.abs(displacement(full))+1e-10);
    assert.ok(Math.abs(full[2]-(full[0]+(full[6]-full[0])/3))<1e-10);
    assert.ok(Math.abs(full[4]-(full[0]+2*(full[6]-full[0])/3))<1e-10);
    for(const y of [full[1],full[3],full[5],full[7]])assert.ok(y>=64&&y<=206);
  }
  assert.deepEqual(finish(jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,strength:100})),maps[2]);
  assert.equal(JSON.stringify(f.root),snapshot);assert.deepEqual([...f.ages],beforeAges);assert.deepEqual([...f.rows],beforeRows);
});
test('duplicate input trees spread separately; IDs and sister rotations do not change the noise seed',()=>{
  const f=fixture(),run=index=>finish(jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,index,strength:100}));
  const before=run(0);assert.notDeepEqual(run(1),before);
  function reverse(node){node.id='changed-'+node.id;node.children.reverse();node.children.forEach(reverse);}
  reverse(f.root);const after=run(0);
  for(const [node,path] of before)assert.equal(after.get(node),path);
});
test('zero-duration edges stay straight and snapshots are isolated from later age and row changes',()=>{
  const f=fixture(),child=f.root.children[0];f.ages.set(child,f.ages.get(f.root));
  const expected=finish(jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,strength:50}));
  assert.equal(expected.has(child),false);
  const steps=jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,strength:50});
  assert.equal(steps.next().done,false);f.ages.clear();f.rows.clear();
  assert.deepEqual(finish(steps),expected);
});
test('invalid strengths and endpoints fail explicitly; cooperative cancellation returns no partial paths',()=>{
  const f=fixture();
  for(const strength of [-1,101,.5,NaN,Infinity,'20',null])
    assert.throws(()=>finish(jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,strength})),e=>e.code==='CLOUD_INVALID_JITTER');
  const steps=jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,strength:100});
  assert.equal(steps.next().done,false);assert.equal(steps.return().value,undefined);
  f.rows.set(f.root,Infinity);
  assert.throws(()=>finish(jitter.branchPathsSteps(f.root,f.ages,f.rows,f.xOf,{...f.config,strength:100})),e=>e.code==='CLOUD_INVALID_JITTER_ENDPOINT');
});
test('jitter is a cloud-only display option and never changes the scientific analysis identity',()=>{
  const analysis=require('../core/analysis-spec.js'),spec={main_tree:{content:'(A:1,B:1);'},gene_trees:{content:'(A:1,B:1);'}};
  assert.equal(contract.defaults('cloud').cloud.jitter,0);
  for(const workspace of ['phylogeny','time','conflict'])assert.equal(contract.defaults(workspace).cloud,undefined);
  assert.equal(analysis.identity(spec,{root_age:10,jitter:0}),analysis.identity(spec,{root_age:10,jitter:100}));
  assert.ok(Object.isFrozen(limits));
});
