const test=require('node:test'),assert=require('node:assert/strict');
const input=require('../core/tree-input.js'),prep=require('../core/gene-preparation.js'),cloud=require('../cloud-tree.js'),engine=require('../core/phyparts-engine.js');
const species=input.parseNewick('(O,((A,B),C));');
const first='(O,(A,B)1);',second='(O,((A,B)95,C)95);';
const options={speciesRoot:species,filename:'support-scale-fixture.trees',rootPolicy:'outgroup',canCloud:false,threshold:.5};

test('worker resolves a batch support scale before serializing any gene',()=>{
 const result=prep.prepare({...options,text:first+'\n'+second});
 assert.equal(result.scale,'percent');
 assert.equal(result.payload.genes[0],'(T00000,(T00001,T00002)0.01);');
 const table=engine.analyze(result.payload).table;
 const lines=table.trim().split('\n').map(row=>row.split('\t'));
 const row=lines.find(row=>row.at(-1)==='A;B');
 assert.equal(row[1],'1','one-percent support must fail a 50-percent cutoff');
 assert.equal(row[5],'1');
 const direct=prep.payload(species,[input.parseNewick(first),input.parseNewick(second)],['O','A','B','C'],{threshold:.5});
 assert.deepEqual(result.payload,direct.payload,'worker and existing-tree preparation use the same batch units');
});

test('batch unit resolution is invariant to gene-file order',()=>{
 const a=prep.prepare({...options,text:first+'\n'+second});
 const b=prep.prepare({...options,text:second+'\n'+first});
 assert.deepEqual(a.payload.genes,[...b.payload.genes].reverse());
});

test('all-unit support values are ambiguous until an input scale is explicit',()=>{
 assert.throws(()=>prep.prepare({...options,text:first}),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.throws(()=>cloud.phyPartsSupportScale([input.parseNewick(first)]),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.equal(prep.prepare({...options,text:first,scale:'probability'}).payload.genes[0],'(T00000,(T00001,T00002)1);');
 assert.equal(prep.prepare({...options,text:first,scale:'percent'}).payload.genes[0],'(T00000,(T00001,T00002)0.01);');
});

test('scientific serialization preserves support values on both sides of a cutoff',()=>{
 const text='(O,((A,B)0.500000000004,C));\n(O,((A,B)0.499999999996,C));';
 const result=prep.prepare({...options,text,scale:'probability'});
 assert.match(result.payload.genes[0],/0\.500000000004/);
 assert.match(result.payload.genes[1],/0\.499999999996/);
 const row=engine.analyze(result.payload).table.trim().split('\n').map(line=>line.split('\t')).find(row=>row.at(-1)==='A;B');
 assert.equal(row[1],'1');assert.equal(row[5],'1');
 const tiny=cloud.phyPartsInput(input.parseNewick('(O,(A,B)1e-30);'),['O','A','B'],{scale:'probability'});
 assert.ok(tiny.includes('0.'+'0'.repeat(29)+'1'));
 assert.doesNotThrow(()=>engine.analyze({species:'(T00000,(T00001,T00002));',genes:[tiny],names:['O','A','B'],threshold:0}));
});
