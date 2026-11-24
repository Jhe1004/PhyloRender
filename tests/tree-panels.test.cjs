const test=require('node:test'),assert=require('node:assert/strict');
const panels=require('../core/tree-panels.js');
const nameFormat=require('../core/name-format.js');

const leaf=(label,id=label)=>({id,label,length:1,children:[]});
const clade=(id,count,prefix)=>({id,label:'',length:1,children:Array.from({length:count},(_,i)=>leaf(`${prefix}${i+1}`))});
const count=node=>node.children.length?node.children.reduce((sum,child)=>sum+count(child),0):1;
const labels=node=>node.children.length?node.children.flatMap(labels):[node.label];
const clone=value=>structuredClone(value);
const ladderize=()=>{};

test('long trees split once and panel 2 is one complete monophyletic clade',()=>{
  const root={id:'root',label:'',length:0,outgroupChildId:'upper',children:[
    {id:'upper',label:'',length:1,children:[leaf('OUT'),clade('upper-rest',44,'U')]},
    clade('lower',105,'L'),
    clade('middle',22,'M'),
  ]};
  const result=panels.plan(root,{clone,tipCount:count,descendantTipLabels:labels,ladderize,maximumTips:76});
  assert.equal(result.length,2);
  assert.equal(count(result[1].root),105);
  assert.deepEqual(labels(result[1].root),labels(root.children[1]));
  assert.equal(result[0].root.children.some(child=>child.panelContinuation===2),true);
  assert.equal(result[0].root.children.find(child=>child.panelContinuation===2).panelGapBeforeRows,.75);
  assert.equal(panels.gapRows(result[0].root),.75);
  assert.equal(result[1].root.panelIncomingFrom,1);
  assert.match(labels(result[0].root).join('\n'),/see Panel 2/);
  assert.equal(labels(result[0].root).includes('OUT'),true,'protected outgroup stays in overview');
});

test('a near-whole ingroup is not allowed to leave an empty overview',()=>{
  const root={id:'root',label:'',length:0,outgroupChildId:'out',children:[
    leaf('OUT','out'),clade('almost-all',230,'A'),
  ]};
  const result=panels.plan(root,{clone,tipCount:count,descendantTipLabels:labels,ladderize,maximumTips:76});
  assert.equal(result.length,1);
  assert.equal(count(result[0].root),231);
});

test('short trees stay as one complete tree',()=>{
  const root={id:'root',label:'',length:0,children:[clade('small',20,'S')]};
  const result=panels.plan(root,{clone,tipCount:count,descendantTipLabels:labels,ladderize,maximumTips:76});
  assert.equal(result.length,1);
  assert.equal(count(result[0].root),20);
});

test('panel continuation placeholder stays upright and is never misparsed as a Latin binomial',()=>{
  const root={id:'root',label:'',length:0,outgroupChildId:'upper',children:[
    {id:'upper',label:'',length:1,children:[leaf('OUT'),clade('upper-rest',44,'U')]},
    clade('lower',111,'L'),
    clade('middle',20,'M'),
  ]};
  const result=panels.plan(root,{clone,tipCount:count,descendantTipLabels:labels,ladderize,maximumTips:76});
  const continuation=result[0].root.children.find(child=>child.panelContinuation===2);
  assert.equal(continuation.label,'↪ Continued clade (111 tips) — see Panel 2');
  const segments=nameFormat.scientificNameSegmentsFromAnalysis(continuation.label);
  assert.deepEqual(segments,[{text:continuation.label,italic:false}]);
  const realTaxon=nameFormat.scientificNameSegmentsFromAnalysis('Acer pictum subsp. mono SRR21412921');
  assert.deepEqual(realTaxon.filter(s=>s.italic).map(s=>s.text),['Acer','pictum','mono']);
});
