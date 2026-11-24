const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const geometry=require('../core/label-geometry.js'),treeGeometry=require('../core/tree-geometry.js');
const conflict=require('../conflict-tree.js');
const outputGeometry=require('../core/output-geometry.js');
const horizontalLayoutForHeight=(height,natural,reserved,options={})=>outputGeometry.calculate({height,
  naturalPlotWidth:natural-reserved,fixedWidth:Math.max(reserved,options.rightContentReserve||0),
  minimumPlotWidth:options.minimumTreeSpan||160,maximumCanvasWidth:3023,mode:'content'});
function modules(){return {
  branches:require('../render/conflict-branches.js'),support:require('../render/conflict-support.js'),
  renderer:require('../render/conflict-tree.js')};}
function element(tag,attrs={},text='') {
  return {tag,attrs:{...attrs},text,children:[],style:{},dataset:{},classList:{toggle(){}},
    append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},
    setAttribute(key,value){this.attrs[key]=String(value);},querySelectorAll(){return [];},
    insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child);},
    getBBox(){const size=17,width=this.text.length*8;return {x:Number(this.attrs.x)-(this.attrs['text-anchor']==='end'?width:0),y:Number(this.attrs.y)-size,width,height:size};}};
}
const svgEl=element;
const font={bold:true,italic:false,family:'Arial'};
const config={fonts:{preferred:18,minimum:12},font,nodeRadius:5,leaderLines:true,canvasSize:{width:1600,height:600}};
const measureText=(_text,size)=>({width:24,ascent:size*.78,descent:size*.22,height:size});
const drain=steps=>{let result,yields=0;while(!(result=steps.next()).done)yields++;return {value:result.value,yields};};
const ports=()=>({svgEl,measureText,appendNodeLabelArrow(){},geometry});
test('three conflict factories require explicit ports and export frozen independent interfaces',()=>{
  const m=modules();
  assert.throws(()=>m.branches.create(),/svgEl/);
  assert.throws(()=>m.support.create(),/svgEl/);
  assert.throws(()=>m.renderer.create(),/svgEl/);
  const a=m.support.create(ports()),b=m.support.create(ports());
  assert.notEqual(a,b);assert.equal(Object.isFrozen(a),true);
  assert.deepEqual(Object.keys(a).sort(),['appendLayer','entries','layoutSteps']);
});
test('branch glyphs use supplied classifications and groups without modifying scientific nodes',()=>{
  const root={id:'r',length:2,children:[{id:'n',length:1,support:'100',children:[{id:'a',label:'A',length:1,children:[]},{id:'b',label:'B',length:1,children:[]}]},{id:'c',label:'C',length:2,children:[]}]};
  const before=structuredClone(root),positions=treeGeometry.conflictTreeLayout(root,{rootX:100,tipX:300,top:80,rowGap:30}).positions;
  const group=element('g'),annotations={left:new Map([[root.children[0],{full:true}]])};
  const nodeGroups=new Map([[root.children[0],{name:'G',color:'#0072b2'}]]);
  const segments=modules().branches.create({svgEl}).appendBranches(group,root,positions,[],'left',nodeGroups,{annotations,fullStyle:'branch'});
  assert.equal(segments.length,6);assert.equal(group.children.length,6);
  assert.ok(group.children.some(e=>e.attrs['data-support-state']==='full'&&e.attrs['data-group']==='G'));
  assert.deepEqual(root,before);assert.equal(annotations.left.size,1);assert.equal(nodeGroups.size,1);
});
test('support entries omit roots and terminal labels and preserve raw and selected support fields',()=>{
  const leaf={id:'a',children:[]},inner={id:'n',children:[leaf]},root={id:'r',children:[inner]};
  const annotation={value:'98',rawValue:'1.0/98',text:'98',markerKind:'partial'};
  const entries=modules().support.create(ports()).entries(root,new Map([[inner,{x:100,y:80}]]),'left',new Map([[inner,annotation],[root,annotation],[leaf,annotation]]));
  assert.equal(entries.length,1);assert.equal(entries[0].annotation,annotation);assert.equal(entries[0].node,inner);
});
test('support placement yields, obeys the supplied font floor and is deterministic without mutating input',()=>{
  const entries=[{node:{id:1},position:{x:200,y:120},side:'left',annotation:{text:'90'}}];
  const bounds={branches:[],tipRects:[],nodePoints:[],leftBounds:{left:8,right:400,top:45,bottom:500},rightBounds:{left:800,right:1500,top:45,bottom:500}};
  const before=structuredClone(entries),api=modules().support.create(ports());
  const result=drain(api.layoutSteps(entries,bounds,config));
  assert.ok(result.yields>10);assert.equal(result.value.placed.length,1);
  assert.ok(result.value.placed.every(e=>e.fontSize>=12));
  assert.deepEqual(result.value,drain(api.layoutSteps(entries,bounds,config)).value);assert.deepEqual(entries,before);
  const cancelled=api.layoutSteps(entries,bounds,config);cancelled.next();cancelled.next();cancelled.return();
  assert.deepEqual(entries,before);
});
test('support layout receives canvas and font settings explicitly on every resumed candidate',()=>{
  const calls=[],fake={...geometry,candidatePlacements:(node,w,h,max,branches,size)=>{calls.push(size);return [{x:node.x-40,y:node.y-30,edgeDistance:10}];}};
  const api=modules().support.create({...ports(),geometry:fake,measureText:(text,size,settings)=>{assert.equal(settings,font);return measureText(text,size);}});
  const entries=[{node:{id:1},position:{x:200,y:120},side:'left',annotation:{text:'90'}}];
  drain(api.layoutSteps(entries,{branches:[],tipRects:[],nodePoints:[],leftBounds:{left:0,right:400,top:0,bottom:500},rightBounds:{}},config));
  assert.ok(calls.length>0);assert.ok(calls.every(size=>size===config.canvasSize));
});
test('support layers retain full/partial markers, raw support provenance and configured radius',()=>{
  const svg=element('svg'),entry={node:{id:'n'},position:{x:40,y:80},side:'right',annotation:{value:'99',rawValue:'0.99/100',markerKind:'partial'}};
  modules().support.create(ports()).appendLayer(svg,[entry],{placed:[]},{...config,nodeRadius:7});
  const circle=svg.children[1].children[0];assert.equal(circle.attrs.r,7);
  assert.equal(circle.attrs['data-support-raw'],'0.99/100');assert.equal(circle.attrs['data-tree-side'],'right');
});
test('whole conflict rendering returns diagnostics without committing them into prepared scientific models',()=>{
  const m=modules(),branches=m.branches.create({svgEl}),support=m.support.create(ports());
  const left={id:'r',children:[{id:'a',label:'A',length:1,children:[]},{id:'b',label:'B',length:1,children:[]}]};
  const right={id:'s',children:[{id:'c',label:'B',length:1,children:[]},{id:'d',label:'A',length:1,children:[]}]};
  const prepared=conflict.prepareConflictTrees(left,right),before=structuredClone(prepared),sizes=[];
  const api=m.renderer.create({svgEl,model:conflict,treeGeometry,branches,support,publishSize:size=>sizes.push(size),
    horizontalLayoutForHeight,finalizeCanvas:require('../render/canvas-finalizer.js').finalize,
    widthPolicy:require("../figure-contract.js"),measureTip:label=>({width:label.length*8}),appendTipLabelContent:(label,text)=>{label.text=text;},fitTipLabelWidth(){},displayTipLabel:label=>label,applyTypography(){},commitFontSettings(){}});
  const svg=element('svg'),options={...config,tipSize:17,supportSize:18,fullStyle:'number',fontFamily:'Arial',
    primaryTitle:'Primary tree',secondaryTitle:'Comparison tree',annotations:{left:new Map(),right:new Map()}};
  const result=drain(api.renderSteps({svg,prepared,originalPrimary:left,groupAssignments:null,options,labelSource:{}}));
  assert.equal(result.value.supportEntries.length,0);assert.equal(sizes.length,1);assert.deepEqual(prepared,before);
  assert.equal(svg.children[0].attrs.class,'conflict-connectors');
  assert.equal(svg.children[0].children.length,2);
  assert.equal(svg.children.find(e=>e.attrs.class==='conflict-tree-title'&&e.attrs['text-anchor']==='end').text,'Comparison tree');
});
test('cancelled whole renderer cannot return partial diagnostics or mutate prepared roots',()=>{
  const m=modules(),closed=[];function* layoutSteps(){try{yield {phase:'labels'};yield;return {placed:[]};}finally{closed.push(true);}}
  const left={id:'r',children:[{id:'a',label:'A',children:[]},{id:'b',label:'B',children:[]}]};
  const prepared=conflict.prepareConflictTrees(left,left),before=structuredClone(prepared);
  const api=m.renderer.create({svgEl,model:conflict,treeGeometry,branches:m.branches.create({svgEl}),
    support:{entries:()=>[],layoutSteps,appendLayer(){}},publishSize(){},horizontalLayoutForHeight,finalizeCanvas:require('../render/canvas-finalizer.js').finalize,widthPolicy:require("../figure-contract.js"),measureTip:()=>({width:8}),
    appendTipLabelContent:(label,text)=>{label.text=text;},fitTipLabelWidth(){},displayTipLabel:x=>x,applyTypography(){},commitFontSettings(){}});
  const steps=api.renderSteps({svg:element('svg'),prepared,originalPrimary:left,groupAssignments:null,labelSource:{},
    options:{...config,tipSize:17,supportSize:18,fontFamily:'Arial',primaryTitle:'P',secondaryTitle:'S',annotations:{left:new Map(),right:new Map()}}});
  assert.equal(steps.next().done,false);assert.equal(steps.return().value,undefined);
  assert.deepEqual(closed,[true]);assert.deepEqual(prepared,before);
});
test('new modules never read application state, controls, native engines or another workspace',()=>{
  for(const name of ['conflict-branches','conflict-support','conflict-tree']) {
    const source=fs.readFileSync(path.join(__dirname,'../render',name+'.js'),'utf8');
    assert.doesNotMatch(source,/\b(?:state|document|window)\s*(?:\.|\[)|\$\s*\(|fetch\s*\(|PhyloRenderNativeClient|state\.cloud/);
  }
});
