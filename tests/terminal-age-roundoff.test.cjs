const test=require('node:test'),assert=require('node:assert/strict');
const input=require('../core/tree-input.js'),cloud=require('../cloud-tree.js'),time=require('../core/time-model.js'),identity=require('../core/sample-identity.js');
const getAge=(node,key)=>input.numericFieldsFromNode(node).get(key)?.value??null;
const tolerance=age=>64*Number.EPSILON*age;
function fixture(rootAge,residue,key='height'){
 return input.parseNewick(`(A[&${key}=${residue},height_95%_HPD={0,${residue*2}}]:${rootAge},B[&height=0]:${rootAge})[&height=${rootAge},height_median=${rootAge},height_mean=${rootAge},height_95%_HPD={${rootAge/2},${rootAge*2}}];`);
}
test('roundoff-sized terminal metadata passes both shared paths without changing scientific inputs',()=>{
 for(const rootAge of [1e-8,97.53031957891912,1e8])for(const key of ['height','height_mean','height_median'])for(const ageSource of ['auto','height','height_median','branch_lengths']){
  const residue=tolerance(rootAge)/2,tree=fixture(rootAge,residue,key),before=structuredClone(tree);
  const result=cloud.importedDatedAges(tree,{getAge,ageSource});
  assert.equal(result.rootAge,rootAge);assert.equal(result.ages.get(tree.children[0]),0);
  assert.deepEqual(tree,before);
  assert.equal(result.terminalAgeValidation.tolerance_raw,tolerance(rootAge));
  assert.equal(result.terminalAgeValidation.accepted_tip_count,1);
  assert.deepEqual(result.terminalAgeValidation.accepted_tips,[{sample:'A',maximum_age_raw:residue}]);
  assert.equal(result.terminalAgeValidation.source_tree_unchanged,true);
  assert.ok(result.warnings.length);
  const copy=structuredClone(tree),profile=time.assertValid(time.profile(copy,{getAge,ageSource}));
  assert.deepEqual(profile.terminalAgeValidation,result.terminalAgeValidation);
  assert.equal(copy.children[0].timeAge,0);assert.equal(profile.hpdCount,1);
  assert.deepEqual(copy.children[0].comments,tree.children[0].comments);
 }
});
test('raw tiny tip annotations are checked even when the callback omits them',()=>{
 const tree=fixture(100,1.4210854715202004e-14),before=structuredClone(tree);
 const result=cloud.importedDatedAges(tree);
 assert.equal(result.terminalAgeValidation.accepted_tip_count,1);assert.deepEqual(tree,before);
 assert.throws(()=>cloud.importedDatedAges(fixture(100,0.001)),{code:'TIME_NONCONTEMPORANEOUS_TIPS'});
});
test('the precise boundary is inclusive, above-boundary ages and invalid values remain rejected',()=>{
 for(const rootAge of [1e-8,100,1e8]){
  cloud.importedDatedAges(fixture(rootAge,tolerance(rootAge)),{getAge});
  for(const value of [tolerance(rootAge)*(1+1e-8),rootAge*1e-8]){
   const tree=fixture(rootAge,value),before=structuredClone(tree);
   assert.throws(()=>cloud.importedDatedAges(tree,{getAge}),{code:'TIME_NONCONTEMPORANEOUS_TIPS'});
   assert.deepEqual(tree,before);
  }
 }
 for(const bad of ['-1e-14','NaN','Infinity','bad']){
  const tree=input.parseNewick(`(A[&height=${bad}]:100,B:100)[&height=100];`);
  assert.throws(()=>cloud.importedDatedAges(tree,{getAge}),{code:'TIME_INVALID_AGE'});
 }
});
test('the tolerance scales with input units and exact-zero input keeps its previous report',()=>{
 const residual=1.4210854715202004e-14,counts=[];
 for(const factor of [1e-6,1,1e6]){
  const tree=fixture(97.53031957891912*factor,residual*factor);
  const result=cloud.importedDatedAges(tree,{getAge});counts.push(result.terminalAgeValidation.accepted_tip_count);
 }
 assert.deepEqual(counts,[1,1,1]);
 const zero=fixture(100,0),before=structuredClone(zero),result=cloud.importedDatedAges(zero,{getAge});
 assert.equal(result.terminalAgeValidation,undefined);assert.deepEqual(result.warnings,[]);assert.deepEqual(zero,before);
 assert.equal(identity.descendantTipNodes(zero).length,2);
});
