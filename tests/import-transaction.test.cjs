const test=require('node:test'),assert=require('node:assert/strict');
const snapshots=require('../ui/import-state.js'),validation=require('../core/figure-input-validation.js');
test('E03: import snapshots restore model, controls, options, cards, names and extra ports together',async()=>{
  let model={name:'old',map:new Map([['A',1]])},extra=new Map([['old',2]]);
  const control={tagName:'SELECT',value:'old',checked:false,disabled:false,innerHTML:'old options'};
  const detail={open:true},label={textContent:'old file'},calls=[];
  const operation=snapshots.create({captureModel:()=>structuredClone(model),restoreModel:v=>{model=structuredClone(v);},
    readControls:()=>[control],readDetails:()=>[detail],readLabels:()=>[label],captureExtra:()=>structuredClone(extra),restoreExtra:v=>{extra=structuredClone(v);},
    sync:()=>calls.push('sync'),redraw:async()=>{calls.push('redraw');assert.equal(control.value,'old');}});
  const before=operation.capture();model.name='new';model.map.set('X',3);extra.clear();
  Object.assign(control,{value:'new',checked:true,disabled:true,innerHTML:'new options'});detail.open=false;label.textContent='new';
  await operation.restore(before);
  assert.deepEqual(model,{name:'old',map:new Map([['A',1]])});assert.deepEqual(extra,new Map([['old',2]]));
  assert.equal(control.innerHTML,'old options');assert.equal(control.checked,false);assert.equal(control.disabled,false);
  assert.equal(detail.open,true);assert.equal(label.textContent,'old file');assert.deepEqual(calls,['sync','redraw']);
  model.name='mutated';assert.equal(before.model.name,'old');await operation.restore(before);assert.equal(model.name,'old');
});
test('E03: redraw failures propagate rather than claiming a complete rollback',async()=>{
  const operation=snapshots.create({captureModel:()=>({}),restoreModel:()=>{},readControls:()=>[],readDetails:()=>[],readLabels:()=>[],captureExtra:()=>null,restoreExtra:()=>{},sync:()=>{},redraw:async()=>{throw Error('redraw failed');}});
  await assert.rejects(operation.restore(operation.capture()),/redraw failed/);
});
test('E03: figure structure validates without mutation and rejects cross-workspace fields',()=>{
  const ports={workspaces:['phylogeny','time','cloud','conflict'],optionPaths:new Set(['typography.tips.size_pt']),currentWorkspace:'phylogeny'};
  const spec={workspace:'time',main_tree:'(A:1,B:1);',options:{typography:{tips:{size_pt:15}}}},before=JSON.stringify(spec);
  assert.equal(validation.validate(spec,ports),'time');assert.equal(JSON.stringify(spec),before);
  for(const bad of [null,[],{workspace:'unknown'},{options:{bad:1}},{comparison_tree:'x'},{gene_trees:'x'},
    {workspace:'cloud',rooting:{outgroup:['A']}}])assert.throws(()=>validation.validate(bad,ports));
});
