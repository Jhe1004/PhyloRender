const test=require('node:test'),assert=require('node:assert/strict');
const scale=require('../core/support-scale.js'),input=require('../core/tree-input.js');
const profile=(text,options)=>scale.collect(input.parseNewick(text),options);

test('support-scale evidence is pure, composable and ignores non-branch root support',()=>{
 const tree=input.parseNewick('(O,(A,B)1)999;'),before=structuredClone(tree);
 const unit=scale.collect(tree),percent=profile('(O,(A,B)95);');
 assert.throws(()=>scale.resolve(unit),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.equal(scale.resolve(scale.merge(unit,percent)),'percent');
 assert.deepEqual(tree,before);
 assert.equal(scale.resolve(profile('(O,A,B)999;')),'probability','root-only numbers are not branch support evidence');
 assert.equal(scale.resolve(unit,'percent'),'percent');
 assert.equal(scale.resolve(unit,'probability'),'probability');
});

test('ambiguous/mixed units and out-of-range values fail before scientific serialization',()=>{
 assert.throws(()=>scale.resolve(scale.merge(profile('(O,(A,B).95);'),profile('(O,(A,B)95);'))),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.throws(()=>profile('(O,(A,B)101);'),{code:'SUPPORT_VALUE_INVALID'});
 assert.throws(()=>profile('(O,(A,B)-1);'),{code:'SUPPORT_VALUE_INVALID'});
 assert.throws(()=>scale.resolve(scale.empty(),'guessed'),{code:'SUPPORT_SCALE_INVALID'});
 assert.equal(scale.resolve(profile('(O,(A,B)95/.95);',{field:'first'})),'percent');
 assert.throws(()=>scale.resolve(profile('(O,(A,B)95/.95);',{field:'last'})),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.equal(scale.resolve(profile('(O,(A,B)95/.95);',{field:'last'}),'probability'),'probability');
});

test('all nonzero support values confined to 0–1 require an explicit unit',()=>{
 for(const values of [[.5],[.25,.5,.9],[.5,1],[0,.00001]]) {
  const evidence=scale.fromValues(values),before=structuredClone(evidence);
  assert.throws(()=>scale.resolve(evidence),{code:'SUPPORT_SCALE_AMBIGUOUS'});
  assert.equal(scale.resolve(evidence,'probability'),'probability');
  assert.equal(scale.resolve(evidence,'percent'),'percent');
  assert.deepEqual(evidence,before);
 }
 assert.equal(scale.resolve(scale.fromValues([0,0])),'probability','zero is identical in either unit');
});
