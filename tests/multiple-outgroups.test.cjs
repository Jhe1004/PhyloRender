const test = require('node:test'), assert = require('node:assert/strict');
const input = require('../core/tree-input.js'), cloud = require('../cloud-tree.js');
const prep = require('../core/gene-preparation.js');
const species = '((O1:1,O2:1):2,((A:1,B:1):1,C:2):1);';
const options = {speciesRoot:input.parseNewick(species), filename:'genes.trees',
  rootPolicy:'outgroup', outgroups:['O1','O2'], canCloud:true, scale:'percent'};

test('explicit multiple outgroups retain all samples and audit partial or incompatible genes', () => {
  const before = structuredClone(options.speciesRoot);
  const result = prep.prepare({...options, text:[
    '((O1:1,O2:1)90:1,((A:1,B:1)80:1,C:2)70:1);',
    '(O1:3,(A:1,C:1)80:2);',
    '((O1:1,A:1)90:1,(O2:1,(B:1,C:1)80:1)70:1);',
    '((A:1,B:1):1,C:2);',
  ].join('\n')});
  assert.equal(result.audit.total,4);
  assert.equal(result.payload.genes.length,2);
  assert.equal(result.accepted.length,1);
  assert.equal(result.audit.mismatch,1);
  assert.equal(result.audit.stats.unrootable,2);
  assert.deepEqual(result.audit.trees[0].outgroups,['O1','O2']);
  assert.deepEqual(result.audit.trees[1].outgroups,['O1']);
  assert.match(result.audit.trees[2].reason,/monophyletic bipartition/i);
  assert.match(result.audit.trees[3].reason,/Outgroup.*absent/i);
  assert.deepEqual(options.speciesRoot,before);
  assert.deepEqual(cloud.sampleProfile(result.accepted[0]).names.sort(),['A','B','C','O1','O2']);
});

test('multiple outgroups require an explicit root-side selection and never reroot the species', () => {
  assert.throws(()=>prep.prepare({...options,outgroups:[],text:species}),/single-taxon outgroup|explicitly select/i);
  for (const outgroups of [['O1','A'],['O1','unknown'],['O1','O1'],['O1']])
    assert.throws(()=>prep.prepare({...options,outgroups,text:species}),{code:'PHYPARTS_OUTGROUP_INVALID'});
  assert.throws(()=>prep.prepare({...options,rootPolicy:'input',text:species}),{code:'PHYPARTS_OUTGROUP_INVALID'});
});

test('edge rerooting of a multi-outgroup gene preserves lengths, splits and support', () => {
  const text='(A:1,B:1,(C:2,(O1:1,O2:1)91:1)82:1);';
  const raw=input.parseNewick(text);
  const result=prep.prepare({...options,text});
  const rooted=result.accepted[0];
  assert.equal(rooted.children.length,2);
  assert.ok(require('../tree-rooting.js').findMatchingRootChild(rooted,
    cloud.tips(rooted).filter(t=>options.outgroups.includes(t.label)).map(t=>t.id)));
  const edgeSummary = root => {
    const graph=input.buildGraph(root), rooting=require('../tree-rooting.js');
    const names=new Map(cloud.tips(root).map(n=>[n.id,n.label]));
    // The rooting API stores incoming-edge support separately from node labels.
    const incoming=new Map();
    (function visit(n){incoming.set(n.id,n);n.children.forEach(visit);})(root);
    for(const edge of graph.edges){const node=incoming.get(edge.b);if(Object.hasOwn(node,'support'))edge.support=node.support;}
    const lengths={};
    for(const edge of graph.edges){
      const a=rooting.componentTipIds(graph,edge.a,edge.b).map(id=>names.get(id)).sort();
      const b=rooting.componentTipIds(graph,edge.b,edge.a).map(id=>names.get(id)).sort();
      const key=[a.join(','),b.join(',')].sort().join('|');
      lengths[key]??={length:0,support:[]}; lengths[key].length+=edge.length;
      if(edge.support!==null)lengths[key].support.push(String(edge.support));
    }
    return lengths;
  };
  assert.deepEqual(edgeSummary(rooted),edgeSummary(raw));
  const analysis=require('../core/analysis-spec.js'), spec={main_tree:{content:species},gene_trees:{content:text}};
  assert.notEqual(analysis.identity(spec,{phyparts_outgroups:['O1','O2']}),analysis.identity(spec,{phyparts_outgroups:['A','B']}));
});
