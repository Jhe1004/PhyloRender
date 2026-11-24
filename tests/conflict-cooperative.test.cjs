const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(process.env.PHYLORENDER_COOPERATIVE_TEST_SOURCE || path.join(__dirname,'../app.js'),'utf8');
// Frozen stage-84 algorithm used only by the regression oracle, not production.
const source=fs.readFileSync(path.join(__dirname,'fixtures/conflict-support-stage84.txt'),'utf8');
const setup=()=>{
  const context=vm.createContext({finishRenderSteps:steps=>{let result;do{result=steps.next();}while(!result.done);return result.value;},
    nodeLabelFontSettings:()=>({preferred:18,minimum:12}),readableFontSizes:()=>[18,12],
    $:id=>({value:5,checked:true}),MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE:10,
    conflictSupportTextMetrics:()=>({width:10,height:10}),conflictRectNodeCollisions:()=>0,
    conflictSupportCandidates:(entry,text,font)=>[0,1,2].map(i=>({rect:{x:entry.position.x+i*10,y:entry.position.y,width:10,height:10,edgeDistance:i},layoutNode:{id:entry.node.id},sidePenalty:i})),
    rectsOverlap:()=>false,segmentIntersectsRect:()=>false,leaderRouteForPlacement:()=>({points:null,length:0}),
    nodeLabelPlacementCost:(font,preferred,minimum,plan,options)=>options.sidePenalty+(font===18?0:1)});
  vm.runInContext(source,context);return context;
};
test('conflict support candidates yield and retain synchronous scoring, order and input nodes',()=>{
  const context=setup(),entries=Array.from({length:100},(_,id)=>({node:{id},position:{x:100,y:id*20},side:'left',annotation:{text:'90'}}));
  const bounds={branches:[],tipRects:[],nodePoints:[],leftBounds:{},rightBounds:{}};
  const before=JSON.stringify(entries),steps=context.layoutConflictSupportSteps(entries,bounds);
  let result,yields=0;while(!(result=steps.next()).done)yields++;
  assert.equal(yields,700);
  assert.deepEqual(JSON.parse(JSON.stringify(result.value)),JSON.parse(JSON.stringify(context.layoutConflictSupports(entries,bounds))));
  assert.deepEqual([...result.value.placed].map(item=>[item.node.id,item.fontSize,item.score]),entries.map(e=>[e.node.id,18,0]));
  const cancelled=context.layoutConflictSupportSteps(entries,bounds);cancelled.next();cancelled.next();cancelled.return();
  assert.equal(JSON.stringify(entries),before);
  const api=require('../render/conflict-support.js').create({svgEl:()=>{},appendNodeLabelArrow:()=>{},
    measureText:()=>({width:10,height:10,ascent:8,descent:2}),geometry:{
      ...require('../core/label-geometry.js'),MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE:10,
      readableFontSizes:()=>[18,12],rectsOverlap:()=>false,segmentIntersectsRect:()=>false,
      candidatePlacements:node=>[0,1,2].map(i=>({x:node.x+i*10,y:node.y,edgeDistance:i})),
      leaderRouteForPlacement:()=>({points:null,length:0}),
      nodeLabelPlacementCost:(font,preferred,minimum,plan,options)=>options.distance+(font===18?0:1),
    }});
  const moduleSteps=api.layoutSteps(entries,{...bounds,leftBounds:{left:0,right:1000,top:0,bottom:3000}},
    {fonts:{preferred:18,minimum:12},nodeRadius:5,leaderLines:true,font:{},canvasSize:{width:1000,height:3000}});
  let actual,count=0;while(!(actual=moduleSteps.next()).done)count++;
  assert.equal(count,yields);
  assert.equal(actual.value.evaluatedCandidateCount,result.value.evaluatedCandidateCount);
  assert.deepEqual(actual.value.placed.map(item=>[item.node.id,item.fontSize,item.score]),
    [...result.value.placed].map(item=>[item.node.id,item.fontSize,item.score]));
});
test('conflict import, agent rendering and interactive redraw use the cooperative renderer',()=>{
  assert.match(app,/workspaceMode === "conflict" \? renderConflictTreeSteps/);
  const render=app.slice(app.indexOf('function* renderConflictTreeSteps'),app.indexOf('function renderPhylogenyTree'));
  assert.match(render,/yield\* conflictRenderer\(\)\.renderSteps/);
  const moduleRender=fs.readFileSync(path.join(__dirname,'../render/conflict-tree.js'),'utf8');
  assert.match(moduleRender,/yield\* support\.layoutSteps/);
  const start=app.indexOf('async function importConflictTree');
  const importer=app.slice(start,app.indexOf('\nfunction ',start));
  assert.match(importer,/deferRender: true[\s\S]*await renderTreeCooperatively/);
  const interactive = app.slice(app.indexOf('function renderTree(options'), app.indexOf('function conflictTreesReady('));
  assert.match(interactive,/return runTreeLoad/);
  assert.match(interactive,/await renderTreeCooperatively/);
  assert.doesNotMatch(interactive,/renderConflictTree\(/);
  const bridge=fs.readFileSync(path.join(__dirname,'../agent-bridge.js'),'utf8');
  assert.match(bridge,/prepareConflictWorkspace\(\{ announce: false, deferRender: true \}\);\s+await renderTreeCooperatively/);
});
