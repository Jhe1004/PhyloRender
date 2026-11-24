const test=require("node:test"),assert=require("node:assert/strict");
const model=require("../core/time-model.js");
const leaf=(label,length,age=0)=>({label,length,height:age,children:[]});
const fixture=()=>({label:"",children:[{label:"",length:10,height:10,children:[leaf("A",5,5),leaf("B",10)]},leaf("C",20)],height:20});
const opts={getAge:(n,k)=>n[k]??null};
test("F02: nonzero fossil tips are explicitly rejected instead of reset",()=>{
 const p=model.profile(fixture(),opts);
 assert.equal(p.valid,false);assert.match(p.validation_errors[0].message,/non-zero|contemporaneous/i);
 assert.throws(()=>model.assertValid(p));
});
test("F04: parent/child inversion fails the shared scientific gate",()=>{
 const t=fixture();t.children[0].children[0].height=0;t.height=5;
 assert.equal(model.profile(t,opts).valid,false);
});
test("F04: one complete age field for the entire tree, never mix summaries",()=>{
 const t=fixture();t.children[0].children[0].height=0;t.children[0].children[0].length=10;
 delete t.height;delete t.children[0].height;t.height_mean=20;t.children[0].height_median=10;
 const p=model.assertValid(model.profile(t,opts));
 assert.equal(p.ageSource,"branch_lengths");assert.equal(p.mixedExplicitSources,false);
 assert.equal(t.timeAge,20);assert.equal(t.children[0].timeAge,10);
});
