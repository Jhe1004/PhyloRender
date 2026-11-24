const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
test('automatic tip gap shrinks smoothly with sample count, not arbitrary branch topology',()=>{
  const context=vm.createContext({});
  vm.runInContext(source.match(/function automaticTipGap\([\s\S]*?\n\}/)[0],context);
  context.PhyloRenderContract=require('../figure-contract.js');
  assert.ok(Math.abs(context.automaticTipGap(5,24)-7.2)<1e-10);
  assert.ok(context.automaticTipGap(20,24)<7.2);
  assert.equal(context.automaticTipGap(48,24),1);
  assert.equal(context.automaticTipGap(1000,24),1);
  let previous=Infinity;
  for(let n=0;n<=150;n++){const gap=context.automaticTipGap(n,24);assert.ok(gap<=previous);assert.ok(gap>=1);previous=gap;}
});
test('automatic spacing includes actual label ink in every workspace and preserves manual layout',()=>{
  const controls={'tip-font-size':{value:'24'},'tip-spacing':{value:'42'}};
  const state={automaticTipSpacing:true,workspaceMode:'cloud',cloud:{speciesRoot:{children:[]}},tipSpacingEm:1};
  const context=vm.createContext({state,$:id=>controls[id],descendantTipNodes:()=>Array(99).fill({label:'x'}),
    maximumTipInkHeight:()=>23,automaticTipGap:()=>1});
  vm.runInContext(source.match(/function terminalSpacing\([\s\S]*?\n\}/)[0],context);
  assert.equal(context.terminalSpacing(),24);
  state.workspaceMode='time';assert.equal(context.terminalSpacing(),24);
  state.workspaceMode='phylogeny';state.tipSpacingEm=2;assert.equal(context.terminalSpacing(),24);
  state.automaticTipSpacing=false;assert.equal(context.terminalSpacing(),48);
  state.workspaceMode='cloud';state.automaticTipSpacing=false;state.tipSpacingEm=null;assert.equal(context.terminalSpacing(),42);
  assert.match(source,/const rowStep = terminalSpacing\(\{fresh:true\}\)/);
  assert.match(source,/state\.tipLayoutByMode\.set\(state\.workspaceMode/);
});
