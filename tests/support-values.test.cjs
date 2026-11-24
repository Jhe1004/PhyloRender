const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../core/support-values.js').create(require('../core/support-scale.js'));

test('source-wide columns keep percentage ones distinct from full probabilities',()=>{
 assert.throws(()=>model.profile(['1/1','0.95/95','0.9/90']),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 const columns=model.profile(['1/1','0.95/95','0.9/90'],'probability/percent');
 assert.deepEqual(columns,['probability','percent']);
 assert.equal(model.full('1/1',columns),false);
 assert.equal(model.format('1/1',50,1,columns),'1.0/–');
 assert.equal(model.full('1/100',columns),true);
 assert.equal(model.full('0.999999999999/100',columns),false);
 assert.throws(()=>model.profile(['1','0']),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.deepEqual(model.profile(['1'],'percent'),['percent']);
 assert.equal(model.format('1',50,1,['percent']),'–');
 assert.deepEqual(model.profile(['1/1','1/1'],'probability/percent'),['probability','percent']);
 assert.throws(()=>model.profile(['1/1'],'probability/percent/percent'),{code:'SUPPORT_SCALE_INVALID'});
});

test('raw thresholds and original-precision full support keep exact source values',()=>{
 assert.equal(model.below('0.29',29,['probability']),false);
 assert.equal(model.below('29',29,['percent']),false);
 assert.equal(model.below('0.289999999999',29,['probability']),true);
 assert.equal(model.below('28.999999999999',29,['percent']),true);
 assert.equal(model.full('0.999999999999',['probability']),false);
 assert.equal(model.full('99.999999999999',['percent']),false);
 assert.equal(model.format('0.499999999999',50,0,['probability']),'–');
 assert.equal(model.format('0.500000000001',50,0,['probability']),'1');
 assert.throws(()=>model.profile(['95'],'probability'),{code:'SUPPORT_VALUE_INVALID'});
});

test('full-support drawing uses the same rounded components as visible numbers',()=>{
 for(const [value,scales,digits,expected] of [
  ['99.99',['percent'],1,true],['99.99',['percent'],2,false],
  ['99.949',['percent'],1,false],['99.951',['percent'],1,true],
  ['0.9999',['probability'],1,true],['0.9999',['probability'],3,true],
  ['0.9999',['probability'],4,false],['0.94',['probability'],1,false],
  ['0.96',['probability'],1,true],['99.99',['percent'],null,false],
  ['0.9999',['probability'],null,false],['100',['percent'],null,true],
  ['99.99/0.9999',['percent','probability'],1,true],
  ['99.99/0.94',['percent','probability'],1,false],
  ['1/1',['probability','percent'],1,false],
  ['99.99/',['percent','probability'],1,false],
  ['0',['percent'],1,false],['0',['probability'],1,false],
 ]) {
  assert.equal(model.full(value,scales,digits),expected,`${value} at ${digits} digits`);
  if(expected)assert.deepEqual(model.format(value,0,digits,scales).split('/').map(Number),
   scales.map(scale=>scale==='percent'?100:1));
 }
 assert.throws(()=>model.full('100.001',['percent'],1),{code:'SUPPORT_VALUE_INVALID'});
 assert.throws(()=>model.full('1.00001',['probability'],1),{code:'SUPPORT_VALUE_INVALID'});
 assert.equal(model.below('49.99',50,['percent']),true);
 assert.equal(model.format('49.99',50,1,['percent']),'–');
});

test('auto decimal mode formats percentages as integers and probabilities to 2 decimals while preserving full-support rounding',()=>{
 const contract=require('../figure-contract.js');
 assert.equal(contract.defaults('phylogeny').support.decimals,'auto');
 assert.equal(contract.defaults('conflict').support.decimals,'auto');
 // Pure percentage column: no .0 suffix on integers, rounds decimals to nearest integer
 assert.equal(model.format('95',50,'auto',['percent']),'95');
 assert.equal(model.format('98.2',50,'auto',['percent']),'98');
 assert.equal(model.full('99.6',['percent'],'auto'),true);
 assert.equal(model.full('99.4',['percent'],'auto'),false);
 assert.equal(model.format('99.4',50,'auto',['percent']),'99');
 // Pure probability column: standard 2 decimal places (distinguishes 0.95 and 0.99 from full 1.00)
 assert.equal(model.format('0.94',50,'auto',['probability']),'0.94');
 assert.equal(model.format('0.9',50,'auto',['probability']),'0.90');
 assert.equal(model.full('0.95',['probability'],'auto'),false);
 assert.equal(model.full('0.994',['probability'],'auto'),false);
 assert.equal(model.full('0.996',['probability'],'auto'),true);
 // Compound mixed columns (percent + probability): each column uses its own unit convention!
 assert.equal(model.format('98/0.94',50,'auto',['percent','probability']),'98/0.94');
 assert.equal(model.format('100/0.4',50,'auto',['percent','probability']),'100/–');
 assert.equal(model.format('98/1',50,'auto',['percent','probability']),'98/1.00');
 assert.equal(model.full('99.8/0.999',['percent','probability'],'auto'),true);
 assert.equal(model.full('100/0.95',['percent','probability'],'auto'),false);
 // Explicit "original" string preserves raw source tokens without rounding
 assert.equal(model.format('99.99/0.9999',50,'original',['percent','probability']),'99.99/0.9999');
 assert.equal(model.full('99.99/0.9999',['percent','probability'],'original'),false);
});
