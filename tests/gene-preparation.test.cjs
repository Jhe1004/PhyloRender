const test=require('node:test'),assert=require('node:assert/strict');
const input=require('../core/tree-input.js'),prep=require('../core/gene-preparation.js');
const args={speciesRoot:input.parseNewick('(O:3,((A:1,B:1)1:1,C:2)1:1);'),filename:'fixture.trees',rootPolicy:'outgroup',canCloud:true,field:'last',scale:'auto'};
test('worker preparation preserves the complete denominator including partial sampling',()=>{
 const result=prep.prepare({...args,scale:'probability',text:'(O:3,((A:1,B:1)1:1,C:2)1:1);\n(O:3,(A:1,C:1)1:2);\n((A:1,B:1):1,C:2);'});
 assert.equal(result.audit.total,3);assert.equal(result.payload.genes.length,2);assert.equal(result.accepted.length,1);
 assert.equal(result.audit.stats.unrootable,1);assert.equal(result.audit.mismatch,1);assert.equal(result.payload.mode,'four');
});
test('shared annotations and cross-tree support ambiguity survive the worker boundary',()=>{
 assert.throws(()=>prep.prepare({...args,text:'(O,(A,B)[&posterior=.95]);\n(O,(A,B)95);',canCloud:false}),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.throws(()=>prep.prepare({...args,text:'(O,(A,B)[&posterior=.95]);',canCloud:false}),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 const r=prep.prepare({...args,text:'(O,(A,B)[&posterior=.95]);',scale:'probability',canCloud:false});assert.match(r.payload.genes[0],/0\.95/);
});
test('large overlays are refused explicitly, statistics are never sampled',()=>{
 const text=Array(5001).fill('(O:3,((A:1,B:1)1:1,C:2)1:1);').join('\n');
 const r=prep.prepare({...args,text,scale:'probability'});assert.equal(r.payload.genes.length,5001);assert.equal(r.audit.accepted,5001);
 assert.equal(r.accepted.length,0);assert.match(r.cloudLimitError,/never.*sampl/i);
});
test('oversize render trees fail without truncation',()=>{
 assert.throws(()=>prep.assertRenderable(input.parseNewick('('+Array.from({length:1501},(_,i)=>`T${i}:1`).join(',')+');')),{code:'RENDER_COMPLEXITY_LIMIT'});
});
test('agent capability limits reflect the shared parser and render safety bounds',()=>{
 const contract=require('../figure-contract.js');
 assert.equal(contract.capabilities.performance_limits.interactive_tree_tips,prep.MAX_RENDER_TIPS);
 assert.equal(contract.capabilities.performance_limits.overlay_nodes,prep.MAX_OVERLAY_NODES);
 assert.throws(()=>input.extractTreeSource('x'.repeat(contract.capabilities.scientific_limits.parser.max_characters+1)),{code:'TREE_INPUT_LIMIT'});
});
test('an outgroup adjacent to a trifurcating root still requires edge rooting',()=>{
 const cloud=require('../cloud-tree.js');
 const speciesRoot=input.parseNewick('(O:1,((A:1,B:1):1,(C:1,D:1):1):1);');
 const text='(O:1,(A:1,B:1)90:1,(C:1,D:1)80:1);';
 const raw=input.parseNewick(text),rawBefore=structuredClone(raw);
 const result=prep.prepare({speciesRoot,text,filename:'ML.tre',rootPolicy:'outgroup',canCloud:true});
 assert.equal(result.accepted.length,1);assert.equal(result.accepted[0].children.length,2);
 assert.equal(cloud.inferredOutgroup(result.accepted[0]),'O');
 assert.doesNotThrow(()=>cloud.treePLInput(result.accepted[0],result.names));
 const leaves=root=>cloud.tips(root).map(n=>n.label).sort();assert.deepEqual(leaves(result.accepted[0]),leaves(raw));
 const distances=root=>{
  const adjacency=new Map(),tipNodes=[];
  function visit(node,parent){if(!adjacency.has(node))adjacency.set(node,[]);if(parent){const length=Number(node.length);adjacency.get(parent).push([node,length]);adjacency.get(node).push([parent,length]);}if(!node.children.length)tipNodes.push(node);node.children.forEach(child=>visit(child,node));}visit(root,null);
  const result={};for(const start of tipNodes){function walk(node,previous,distance){if(!node.children.length&&node!==start)result[[start.label,node.label].sort().join('|')]=distance;for(const[next,length]of adjacency.get(node))if(next!==previous)walk(next,node,distance+length);}walk(start,null,0);}return result;
 };
 assert.deepEqual(distances(result.accepted[0]),distances(raw));
 const sum=root=>(root.children||[]).reduce((n,c)=>n+Number(c.length)+sum(c),0);
 assert.equal(sum(result.accepted[0]),sum(raw));assert.deepEqual(raw,rawBefore);
 const engine=require('../core/phyparts-engine.js');const stats=cloud.parsePhyPartsTable(engine.analyze(result.payload).table);
 assert.ok([...stats.rows.values()].every(row=>row.concordant===1),JSON.stringify([...stats.rows.values()]));
});
