'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const model=require('../cloud-tree.js'),scheduler=require('../core/render-scheduler.js');
const branches=require('../render/cloud-branches.js'),composition=require('../render/cloud-tree.js'),pies=require('../render/cloud-pies.js');
const {parseNewick}=require('../core/tree-input.js');
const colorModel=fs.existsSync(require('node:path').join(__dirname,'../core/cloud-group-colors.js'))?require('../core/cloud-group-colors.js'):null;
const outputGeometry=require('../core/output-geometry.js');
const horizontalLayoutForHeight=(height,natural,reserved,options={})=>({...outputGeometry.calculate({height,naturalPlotWidth:natural-reserved,
  fixedWidth:Math.max(reserved,options.rightContentReserve||0),minimumPlotWidth:160,maximumCanvasWidth:1511,mode:'content'}),maximumWidthMm:400});
const finish=scheduler.finishRenderSteps,parse=text=>parseNewick(text,{validateInput:false});
const node=(root,names)=>[...model.nodeClades(root)].find(([,c])=>c.key===model.cladeKey(names))[0];
const leaf=(root,name)=>model.tips(root).find(tip=>tip.label===name);
function element(tag,attributes={},text='') {
  return {tag,attributes:{...attributes},text,children:[],dataset:{},append(...x){this.children.push(...x);},
    replaceChildren(...x){this.children=x;},setAttribute(k,v){this.attributes[k]=String(v);},classList:{toggle(){}},
    querySelectorAll(tag){return this.children.filter(x=>x.tag===tag);},
    getBBox(){return{x:Number(this.attributes.x||0),y:Number(this.attributes.y||0),width:12,height:10};}};
}
function fixture() {
  const species=parse('(O:10,(((A:2,B:2):1,C:3):3,(D:2,E:2):4):4);');
  const gene=parse('(O:10,(((A:2,C:2):1,B:3):3,(D:2,E:2):4):4);');
  const selected=new Map([[node(species,['A','B','C']).id,'#0072b2'],[node(species,['D','E']).id,'#d55e00']]);
  return {species,gene,selected};
}
test('production cloud composition inherits species group colors without changing geometry or science',()=>{
  const {species,gene,selected}=fixture(),saved=JSON.stringify({species,gene}),svg=element('svg');
  const ages=root=>model.importedDatedAges(root).ages;
  const cloud={speciesRoot:species,geneRoots:[gene],datedRootAge:10,datedAges:new Map([[species,ages(species)],[gene,ages(gene)]]),
    cladeColors:selected,hiddenPieNodes:new Set(),datingEngine:'bundled-treePL',geneDatingEngine:'bundled-treePL'};
  const renderer=composition.create({planRows:require('../figure-contract.js').planAutomaticRows,svgEl:element,model,colorModel,branches:branches.create({model,svgEl:element}),
    jitterModel:require('../core/cloud-jitter.js'),jitterLimits:require('../figure-contract.js').cloudJitter,
    finalizeCanvas:require('../render/canvas-finalizer.js').finalize,
    pies:pies.create({model,svgEl:element}),backgroundRenderer:{},display:{GEOLOGIC_EPOCHS:[]},publishSize(){},horizontalLayoutForHeight,
    appendTipLabelContent(){},fitTipLabelWidth(){},updateRankNormalizationStatus(){},buildCladeBarLayout(){return{items:[],requiredWidth:0};},drawCladeBars(){}});
  finish(renderer.renderSteps({svg,model:cloud,options:{age:10,showGene:true,showSpecies:false,showPies:false,speciesShape:'triangular',ladderDirection:'file',pieAgeRange:{}},
    tips:model.tips(species),rowStep:24,timeBackground:{visible:false,geologyVisible:false},timeFonts:{axisOffset:20,key:10,periodRow:20},
    unit:'relative',fontFamily:'Arial',cladeSelectionMode:false,labelSource:{},provenance:{dating:{},clades:{}}}));
  const paths=svg.children.find(x=>x.attributes.class==='cloud-gene-lines').children;
  assert.ok(paths.some(x=>x.attributes.stroke==='#0072b2'),'Contained gene branches must inherit blue, not remain neutral');
  assert.ok(paths.some(x=>x.attributes.stroke==='#d55e00'));
  assert.ok(paths.some(x=>x.attributes.stroke===undefined),'Ungrouped and cross-group branches stay neutral');
  assert.ok(paths.every(x=>x.attributes['data-clade-node-id']===undefined),'Gene IDs must not become species editor targets');
  assert.equal(JSON.stringify({species,gene}),saved);
});
test('color membership uses exact raw descendants and their species MRCA, not identical topology',()=>{
  const {species,gene,selected}=fixture(),engine=branches.create({model,svgEl:element});
  const ref=finish(colorModel.referenceSteps(species,engine.cladeColorMap(species,selected)));
  const colors=finish(colorModel.branchColorsSteps(gene,ref));
  assert.equal(colors.get(node(gene,['A','C'])),'#0072b2','Gene-exclusive A C clade is contained in main group A B C');
  assert.equal(colors.get(leaf(gene,'D')),'#d55e00');assert.equal(colors.has(gene),false);
  assert.equal(colors.has(node(gene,['A','B','C','D','E'])),false);
});
test('nested groups select the most specific containing group; equal color strings do not merge groups',()=>{
  const {species,gene,selected}=fixture(),engine=branches.create({model,svgEl:element});
  selected.set(node(species,['A','B']).id,'#cc79a7');selected.set(leaf(species,'D').id,'#009e73');
  let ref=finish(colorModel.referenceSteps(species,engine.cladeColorMap(species,selected)));
  let colors=finish(colorModel.branchColorsSteps(gene,ref));
  assert.equal(colors.get(leaf(gene,'A')),'#cc79a7');assert.equal(colors.get(node(gene,['A','C'])),'#0072b2');
  assert.equal(colors.get(leaf(gene,'D')),'#009e73');assert.equal(colors.get(node(gene,['D','E'])),'#d55e00');
  selected.set(node(species,['D','E']).id,'#0072b2');
  ref=finish(colorModel.referenceSteps(species,engine.cladeColorMap(species,selected)));
  colors=finish(colorModel.branchColorsSteps(gene,ref));
  assert.equal(colors.has(node(gene,['A','B','C','D','E'])),false);
});
test('group reference snapshots colors and never matches display names or cross-tree numeric IDs',()=>{
  const {species,gene,selected}=fixture(),engine=branches.create({model,svgEl:element});
  const effective=engine.cladeColorMap(species,selected),snapshot=JSON.stringify({species,gene});
  const steps=colorModel.referenceSteps(species,effective);assert.equal(steps.next().done,false);
  effective.clear();const ref=finish(steps),colors=finish(colorModel.branchColorsSteps(gene,ref));
  assert.equal(colors.get(leaf(gene,'A')),'#0072b2');assert.equal(JSON.stringify({species,gene}),snapshot);
  const wrong=parse('(O:1,(Display_A:1,B:1));');
  assert.throws(()=>finish(colorModel.branchColorsSteps(wrong,ref)),e=>e.code==='CLOUD_GROUP_UNKNOWN_SAMPLE');
});
test('ungrouped input returns no colors, and cooperative cancellation publishes no partial map',()=>{
  const {species,gene}=fixture(),snapshot=JSON.stringify({species,gene});
  const ref=finish(colorModel.referenceSteps(species,new Map()));
  assert.equal(finish(colorModel.branchColorsSteps(gene,ref)).size,0);
  for(const steps of [colorModel.referenceSteps(species,new Map()),colorModel.branchColorsSteps(gene,ref)]){
    assert.equal(steps.next().done,false);assert.equal(steps.return().value,undefined);
  }
  assert.equal(JSON.stringify({species,gene}),snapshot);
});
