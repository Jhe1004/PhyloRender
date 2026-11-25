const test = require('node:test'), assert = require('node:assert/strict');
const analysis = require('../core/analysis-spec.js');
test('analysis key ignores presentation but captures every scientific input', () => {
  const spec = {main_tree:{content:'(A,B);'},gene_trees:{content:'(A,B);'}};
  const cloud = {species_method:'ml',root_age:70,phyparts_threshold:0};
  const key = analysis.identity(spec,cloud);
  assert.equal(JSON.parse(key).version,6,'built-in penalized-likelihood display alignment must not reuse older cache entries');
  assert.equal(analysis.identity(spec,{...cloud,pie_mode:'four',pie_radius:99,show_gene:false}),key);
  for (const field of analysis.fields)
    assert.notEqual(analysis.identity(spec,{...cloud,[field]:'changed'}),key,field);
  assert.notEqual(analysis.identity({...spec,gene_trees:{content:'(A,C);'}},cloud),key);
});
