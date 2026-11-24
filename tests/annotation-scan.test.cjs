const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const input=require('../core/tree-input.js');

test('plain long annotation words do not trigger quadratic key retries',()=>{
 const context=vm.createContext({comment:'x'.repeat(200000)});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../core/tree-input.js'),'utf8'),context);
 assert.doesNotThrow(()=>vm.runInContext('PhyloRenderInput.parseAnnotationEntries(comment)',context,{timeout:1000}));
});

test('annotation scanner retains recognized fields after plain text and invalid key prefixes',()=>{
 const result=input.parseAnnotationEntries('plain text !height=2; &height_mean = 2.5, height_95%_HPD={1,3}:posterior=.9');
 assert.deepEqual(result,[{key:'height',rawValue:'2'},{key:'height_mean',rawValue:' 2.5'},{key:'height_95pct_hpd',rawValue:'{1,3}'},{key:'posterior',rawValue:'.9'}]);
 const time=require('../core/time-model.js');
 const node={comments:['plain words !height_95%_HPD={bad,3}'],children:[]};
 assert.throws(()=>time.annotationHpd(node),{code:'TIME_INVALID_HPD'});
});

test('whitespace before quoted or bracketed annotation values preserves complete HPD intervals',()=>{
 const time=require('../core/time-model.js');
 assert.deepEqual(input.parseAnnotationEntries('height_95%_HPD = {1, 3}, height = 2'),[
  {key:'height_95pct_hpd',rawValue:' {1, 3}'},{key:'height',rawValue:' 2'}]);
 assert.deepEqual(time.annotationHpd({comments:['height_95%_HPD = {1, 3}']}),[1,3]);
 assert.throws(()=>time.annotationHpd({comments:['height_95%_HPD = {3, 1}']}),{code:'TIME_INVALID_HPD'});
});
