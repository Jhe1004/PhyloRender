const test=require('node:test'),assert=require('node:assert/strict');
const input=require('../core/tree-input.js'),time=require('../core/time-model.js'),cloud=require('../cloud-tree.js');
const getAge=(node,key)=>input.numericFieldsFromNode(node).get(key)?.value??null;

test('recognized invalid age annotations cannot disappear into branch-length fallback',()=>{
 for(const fields of ['height=NaN','height=Infinity','height=bad','height={1,2}','height=1,height_mean=NaN','height=1,height_median=-1'])for(const ageSource of ['auto','branch_lengths']){
  const root=input.parseNewick(`(A:1,B:1)[&${fields}];`);
  assert.throws(()=>cloud.importedDatedAges(root,{getAge,ageSource}),error=>error.code==='TIME_INVALID_AGE',fields);
  assert.equal(time.profile(structuredClone(root),{getAge,ageSource}).valid,false,fields);
 }
});

test('duplicate conflicting raw ages reject while identical duplicates remain usable',()=>{
 const bad=input.parseNewick('(A:1,B:1)[&height=1,height=2];');
 assert.throws(()=>cloud.importedDatedAges(bad,{getAge}),{code:'TIME_AGE_CONFLICT'});
 const good=input.parseNewick('(A:1,B:1)[&height=1,height=1,height_mean=1.2];');
 const before=structuredClone(good);
 assert.equal(cloud.importedDatedAges(good,{getAge}).rootAge,1);
 assert.deepEqual(good,before);
});

test('cloud chronograms reject malformed or conflicting raw HPD even when intervals are not displayed',()=>{
 for(const fields of ['height_95%_HPD={2,1}','height_95%_HPD={0,1,2}','height_95%_HPD=NaN','height_95%_HPD={0,2},height_hpd={0,3}']){
  const root=input.parseNewick(`(A:1,B:1)[&height=1,${fields}];`);
  assert.throws(()=>cloud.importedDatedAges(root,{getAge}),error=>['TIME_INVALID_HPD','TIME_HPD_CONFLICT'].includes(error.code),fields);
 }
 const root=input.parseNewick('(A:1,B:1)[&height=1,height_95%_HPD = {0, 2}];');
 assert.equal(cloud.importedDatedAges(root,{getAge}).rootAge,1);
 assert.deepEqual(time.annotationHpd(root),[0,2]);
});

test('terminal ages beyond the Float64 error budget reject, including with omitted callbacks',()=>{
 for(const rootAge of [1,100000000])for(const value of [1e-12,0.001,1])for(const key of ['height','height_mean','height_median'])for(const ageSource of ['auto','branch_lengths']){
  const root=input.parseNewick(`(A[&${key}=${value}]:${rootAge},B:${rootAge})[&height=${rootAge}];`);
  const before=structuredClone(root);
  // 2026-11-11: the user authorized a bounded floating-point exception.
  // Retain every original case, asserting acceptance only inside that budget.
  if(value>rootAge*(64*Number.EPSILON)){
   assert.throws(()=>cloud.importedDatedAges(root,{getAge,ageSource}),/non-zero|contemporaneous/i);
   assert.throws(()=>cloud.importedDatedAges(root,{ageSource:'branch_lengths'}),/non-zero|contemporaneous/i);
  }else{
   assert.equal(cloud.importedDatedAges(root,{getAge,ageSource}).terminalAgeValidation.accepted_tip_count,1);
   assert.equal(cloud.importedDatedAges(root,{ageSource:'branch_lengths'}).ages.get(root.children[0]),0);
  }
  assert.deepEqual(root,before);
 }
 const zero=input.parseNewick('(A[&height=0]:100000000,B[&height_mean=0]:100000000)[&height=100000000];');
 assert.equal(cloud.importedDatedAges(zero,{getAge}).ages.get(zero.children[0]),0);
});

test('selected explicit parent/child ages cannot invert within a scale-dependent tolerance',()=>{
 for(const [parent,child]of [[10,10.000000001],[100000000,100000001]])for(const key of ['height','height_mean','height_median']){
  const root=input.parseNewick(`((A:5,B:5)[&${key}=${child}]:5,C:10)[&${key}=${parent}];`);
  assert.throws(()=>cloud.importedDatedAges(root,{getAge,ageSource:key}),/inversion/i);
 }
 const good=input.parseNewick('((A:5,B:5)[&height=9.9999999999]:5,C:10)[&height=10];'),before=structuredClone(good);
 assert.equal(cloud.importedDatedAges(good,{getAge}).ages.get(good.children[0]),9.9999999999);
 assert.deepEqual(good,before);
});
