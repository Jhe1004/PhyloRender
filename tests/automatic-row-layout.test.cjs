const test=require('node:test'),assert=require('node:assert/strict');
const contract=require('../figure-contract.js');
const spec={workspace:'phylogeny',automatic:true,aspectMode:'auto',fontSize:20,width:1511,
 count:41,intervals:40,baseSpacing:20.74,naturalHeight:909.6};
const plan=patch=>contract.planAutomaticRows({...spec,...patch});
test('41-tip single trees fill a portrait target by increasing real row distance',()=>{
 const r=plan();assert.equal(r.height,1511*1.25);assert.equal(r.spacing,spec.baseSpacing+(r.height-spec.naturalHeight)/40);
 assert.equal(r.expanded,true);assert.equal(r.targetHeightToWidth,1.25);
 for(const workspace of ['time','cloud']){
  const result=plan({workspace,fontSize:24,baseSpacing:24.7,naturalHeight:1290});
  assert.equal(result.height,1511*1.25);assert.ok(result.spacing>24.7);
 }
});
test('expanded viewports stay on the browser subpixel grid before glyph fitting',()=>{
 const r=plan({workspace:'cloud',count:5,intervals:4,fontSize:24,baseSpacing:29.7234375,naturalHeight:650});
 assert.equal(r.height*64,Math.floor(r.height*64),'a fractional CSS viewport must not rescale glyph measurements');
 assert.ok(r.spacing<=72);assert.ok(r.spacing>71.99);
 assert.ok(Math.abs(r.height-(650+4*(r.spacing-29.7234375)))<1e-10);
});
test('dense and already-tall trees remain compact and unchanged',()=>{
 for(const count of [120,176,1500]){
  const r=plan({count,intervals:count-1,naturalHeight:80+(count-1)*20.74});
  assert.equal(r.spacing,20.74);assert.equal(r.expanded,false);
 }
 assert.equal(plan({naturalHeight:2400}).height,2400);
 assert.equal(plan({naturalHeight:2400}).spacing,spec.baseSpacing);
});
test('manual spacing, explicit proportions and landscape comparisons bypass portrait expansion',()=>{
 for(const patch of [{automatic:false},{aspectMode:'content'},{aspectMode:'custom'},{aspectMode:'4:3'},{workspace:'conflict'}]){
  const r=plan(patch);assert.equal(r.spacing,spec.baseSpacing);assert.equal(r.height,spec.naturalHeight);
 }
});
test('sparse expansion is bounded and fades continuously instead of stepping at a sample cutoff',()=>{
 const sparse=plan({count:6,intervals:5,naturalHeight:320});
 assert.ok(sparse.spacing<=60&&sparse.spacing>60-1/64/5);
 assert.equal(sparse.height,320+5*(sparse.spacing-spec.baseSpacing));
 assert.ok(sparse.height<spec.width*1.25);
 let prior=Infinity;
 for(let count=80;count<=120;count++){
  const r=plan({count,intervals:count-1,naturalHeight:500,fontSize:12,baseSpacing:10});
  assert.ok(r.spacing<=prior+1e-12);assert.ok(r.spacing>=10);assert.ok(r.spacing<=36);
  prior=r.spacing;
 }
 assert.equal(plan({count:1,intervals:0,naturalHeight:320}).spacing,spec.baseSpacing);
});
test('spacing is repeatable, honors glyph minima and preserves explicit input objects',()=>{
 const saved=structuredClone(spec),a=plan(),b=plan();assert.deepEqual(a,b);assert.deepEqual(spec,saved);
 const large=plan({baseSpacing:80,fontSize:30,naturalHeight:500});assert.equal(large.spacing,80);
 assert.equal(contract.capabilities.automatic_row_layout.targetHeightToWidth,1.25);
});
test('a failed or restored document reads its restored spacing rather than another tree layout',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
 const root={children:[]},other={children:[]};
 const controls={'tip-font-size':{value:'20'},'tip-spacing':{value:'45'}};
 const state={automaticTipSpacing:true,workspaceMode:'phylogeny',root,currentLayoutInfo:{tipSpacingRoot:other,tipSpacing:43,baseTipSpacing:21}};
 const ctx=vm.createContext({state,$:id=>controls[id],descendantTipNodes:()=>[{label:'A'},{label:'B'}],maximumTipInkHeight:()=>20,automaticTipGap:()=>1});
 vm.runInContext(source.match(/function terminalSpacing\([\s\S]*?\n\}/)[0],ctx);
 assert.equal(ctx.terminalSpacing(),45);assert.equal(ctx.terminalSpacing({fresh:true}),21);
 state.currentLayoutInfo.tipSpacingRoot=root;assert.equal(ctx.terminalSpacing(),43);
});
