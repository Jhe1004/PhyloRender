const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../core/phyparts-engine.js');
const names=['O','A','B','C','D','E'];
const species='(T00000,((T00001,T00002),(T00003,(T00004,T00005))));';
function target(genes){
  const result=engine.analyze({species,genes,names});
  const [header,...lines]=result.table.trim().split('\n').map(s=>s.split('\t'));
  return lines.map(values=>Object.fromEntries(header.map((h,i)=>[h,values[i]])))
    .find(row=>row.descendant_samples==='A;B');
}
const partialD='(T00000,(((T00001,T00003),T00002),T00004));';
const partialE='(T00000,(((T00001,T00003),T00002),T00005));';
const complete='(T00000,(((T00001,T00003),T00002),(T00004,T00005)));';
test('the same observed alternative is not split by different missing outside samples',()=>{
  for(const genes of [[partialD,partialE],[partialD,partialE,complete],
    [complete,partialE,partialD],[partialE,complete,partialD]]){
    const row=target(genes);
    assert.equal(Number(row.dominant_conflict_N),genes.length);
    assert.equal(Number(row.other_conflict_N),0);
    assert.equal(Number(row.conflict_total_N),genes.length);
  }
});
test('an ambiguous partial split can support both candidates without joining incompatible alternatives',()=>{
  const a='(T00000,(((T00001,T00004),T00003),(T00002,T00005)));';
  const b='(T00000,(((T00001,T00005),T00003),(T00002,T00004)));';
  const ambiguous='(T00000,((T00001,T00003),T00002));';
  const row=target([a,b,ambiguous]);
  assert.equal(Number(row.conflict_total_N),3);
  assert.equal(Number(row.dominant_conflict_N),2);
  assert.equal(Number(row.other_conflict_N),1);
});
test('one gene is counted once per candidate even when it has multiple conflicting edges',()=>{
  const gene='(T00000,(((T00001,T00003),T00004),(T00002,T00005)));';
  const row=target([gene,partialD]);
  assert.equal(Number(row.dominant_conflict_N),2);
  assert.equal(Number(row.other_conflict_N),0);
});
test('fully sampled incompatible alternatives stay distinct',()=>{
  const other='(T00000,(((T00001,T00004),T00002),(T00003,T00005)));';
  const row=target([complete,other]);
  assert.equal(Number(row.dominant_conflict_N),1);
  assert.equal(Number(row.other_conflict_N),1);
});

test('partial candidate grouping is invariant to tree order and display mode',()=>{
  const genes=[partialD,partialE,complete];
  for(const mode of ['two','four'])for(const batch of [genes,[...genes].reverse()]){
    assert.equal(engine.analyze({species,genes:batch,names,mode}).table,
      engine.analyze({species,genes,names}).table);
  }
});
test('cancellation during candidate counting returns no partial table',()=>{
  const manyNames=Array.from({length:15},(_,i)=>String(i));
  const tip=i=>'T'+String(i).padStart(5,'0');
  const reference=`(${tip(0)},((${tip(1)},${tip(2)}),(${manyNames.slice(3).map((_,i)=>tip(i+3)).join(',')})));`;
  const genes=[];
  for(let m=1;m<1200;m++){
    const outside=manyNames.slice(4).map((_,i)=>i+4).filter(i=>m&(1<<(i-4)));
    genes.push(`(${tip(0)},((${tip(1)},${tip(3)}),${tip(2)}${outside.map(i=>','+tip(i)).join('')}));`);
  }
  let parsed=false,cancelChecks=0;
  assert.throws(()=>engine.analyze({species:reference,genes,names:manyNames},{
    onProgress:({current,total})=>{if(current===total)parsed=true;},
    shouldCancel:()=>parsed&&++cancelChecks>=3,
  }),{code:'CANCELLED'});
  assert.ok(cancelChecks>=3);
});
