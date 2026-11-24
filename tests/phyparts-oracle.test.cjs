const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../core/phyparts-engine.js');

// Exhaustive reference on abstract trees. It uses ordinary string sets, no
// production parser, safe-ID conversion, bit masks or conflict-statistics code.
function binaryTrees(leaves){
  if(leaves.length===1)return [leaves[0]];
  const result=[];
  for(let mask=1;mask<(1<<leaves.length)-1;mask++){
    if(!(mask&1))continue; // The first leaf fixes sister symmetry.
    const left=leaves.filter((_,i)=>mask&(1<<i)),right=leaves.filter((_,i)=>!(mask&(1<<i)));
    for(const a of binaryTrees(left))for(const b of binaryTrees(right))result.push([a,b]);
  }
  return result;
}
const leaves=tree=>Array.isArray(tree)?tree.flatMap(leaves):[tree];
function clades(tree,isRoot=true){
  if(!Array.isArray(tree))return [];
  return [...(isRoot?[]:[new Set(leaves(tree))]),...tree.flatMap(child=>clades(child,false))];
}
const subset=(a,b)=>[...a].every(x=>b.has(x));
const identical=(a,b)=>a.size===b.size&&subset(a,b);
const conflict=(a,b)=>[...a].some(x=>b.has(x))&&!subset(a,b)&&!subset(b,a);
const serialize=tree=>Array.isArray(tree)?'('+tree.map(serialize).join(',')+')':'T'+String(tree).padStart(5,'0');
function rows(table){
 const [header,...lines]=table.trim().split('\n').map(line=>line.split('\t'));
 return lines.map(line=>Object.fromEntries(header.map((key,i)=>[key,line[i]])));
}

test('exhaustive 4-ingroup reference: every rooted binary topology pair and unresolved gene',()=>{
 const ingroups=binaryTrees([1,2,3,4]);assert.equal(ingroups.length,15);
 const species=ingroups.map(t=>[0,t]), genes=[...species,[0,1,2,3,4]];
 let checks=0;
 for(const reference of species)for(const gene of genes){
  const expected=clades(reference),observed=clades(gene);
  const result=engine.analyze({species:serialize(reference)+';',genes:[serialize(gene)+';'],names:['0','1','2','3','4'],threshold:0});
  for(const row of rows(result.table)){
   const target=expected.find(c=>[...c].sort().join(';')===row.descendant_samples);
   assert.ok(target);
   const concordant=observed.some(c=>identical(target,c))?1:0;
   const discordant=!concordant&&observed.some(c=>conflict(target,c))?1:0;
   assert.equal(Number(row.concordant_N),concordant);
   assert.equal(Number(row.conflict_total_N),discordant);
   assert.equal(Number(row.no_signal_N),1-concordant-discordant);
   assert.equal(Number(row.dominant_conflict_N),discordant);
   assert.equal(Number(row.other_conflict_N),0);checks++;
  }
 }
 assert.equal(checks,720);
});

test('complete-taxon four-category counts are invariant to gene order and sister rotations',()=>{
 const trees=binaryTrees([1,2,3,4]).map(t=>serialize([0,t])+';');
 const reverse=tree=>Array.isArray(tree)?[...tree].reverse().map(reverse):tree;
 const analyze=(species,genes)=>engine.analyze({species,genes,names:['0','1','2','3','4']}).table;
 const a=analyze(serialize([0,[[1,2],[3,4]]])+';',trees);
 const b=analyze(serialize(reverse([0,[[1,2],[3,4]]]))+';',[...trees].reverse());
 const keyed=table=>Object.fromEntries(rows(table).map(({Node_ID,...row})=>[row.descendant_samples,row]));
 assert.deepEqual(keyed(a),keyed(b));
});

test('partial multi-gene alternatives match an explicit set-and-gene-union oracle',()=>{
 const names=['0','1','2','3','4','5'],reference=[0,[[1,2],[3,[4,5]]]],target=new Set([1,2]);
 const forest=[];
 for(const sampled of [[1,2,3],[1,2,3,4],[1,2,3,5],[1,2,3,4,5]])
  for(const tree of binaryTrees(sampled))forest.push([0,tree]);
 for(let offset=0;offset<forest.length;offset++){
  const genes=[0,1,2,3,4].map(i=>forest[(offset+i*7)%forest.length]);
  const constraints=[];
  genes.forEach((gene,index)=>{
   const scope=new Set(leaves(gene)),observed=clades(gene);
   if(observed.some(c=>identical(c,target)))return;
   for(const inside of observed.filter(c=>conflict(c,target)))
    constraints.push({inside,outside:new Set([...scope].filter(x=>!inside.has(x))),gene:index});
  });
  const candidates=new Map();
  for(const h of constraints){
   const key=[...h.inside].sort().join(',');
   if(!candidates.has(key))candidates.set(key,{inside:h.inside,outside:new Set()});
   for(const tip of h.outside)candidates.get(key).outside.add(tip);
  }
  let expected=0;
  for(const candidate of candidates.values()){
   const support=new Set(constraints.filter(h=>subset(h.inside,candidate.inside)&&subset(h.outside,candidate.outside)).map(h=>h.gene));
   expected=Math.max(expected,support.size);
  }
  const row=rows(engine.analyze({species:serialize(reference)+';',genes:genes.map(g=>serialize(g)+';'),names}).table)
   .find(r=>r.descendant_samples==='1;2');
  assert.equal(Number(row.dominant_conflict_N),expected,`forest offset ${offset}`);
  assert.equal(Number(row.other_conflict_N),Number(row.conflict_total_N)-expected);
 }
});
