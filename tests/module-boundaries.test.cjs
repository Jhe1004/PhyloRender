const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../core/sample-identity.js');
const documents = require('../core/document-state.js');
const scheduler = require('../core/render-scheduler.js');

test('display edits never become sample matching keys', () => {
  const root = {label:'', children:[{label:'A_one',children:[]},{label:'B_two',children:[]}]};
  const before = structuredClone(root);
  const renamed = identity.validateTipLabelOverrides({'A one':'Display only'}, ['A_one','B_two']);
  assert.equal(renamed.get('A_one'), 'Display only');
  assert.deepEqual(root, before);
  assert.equal(identity.normalizeTipKey('A_one'), 'a_one');
  assert.throws(() => identity.validateTipLabelOverrides({'missing':'X'}, ['A_one']), /absent|not found|not in/i);
  assert.throws(() => identity.buildTipKeyAlignment(
    {children:[{label:'A-a',children:[]},{label:'A a',children:[]}]}, root), /collide|duplicate/i);
});

test('documents own fresh collections and restore only complete model snapshots', () => {
  const a = documents.createDocument({sourceName:'a.tree'});
  const b = documents.createDocument({sourceName:'b.tree'});
  a.cloud.hiddenPieNodes.add('n1');
  a.tipLabelOverrides.set('raw','display');
  assert.equal(b.cloud.hiddenPieNodes.size, 0);
  assert.equal(b.tipLabelOverrides.size, 0);
  assert.equal(Object.isSealed(a), true);
  assert.throws(() => Object.defineProperty(a, 'accidentalPluginField', {value:1}));
  const snapshot = documents.capture(a);
  a.cloud.hiddenPieNodes.add('n2');
  a.tipLabelOverrides.set('raw','changed');
  documents.restore(a, snapshot);
  assert.deepEqual([...a.cloud.hiddenPieNodes], ['n1']);
  assert.equal(a.tipLabelOverrides.get('raw'), 'display');
  a.cloud.hiddenPieNodes.add('n3');
  assert.deepEqual([...snapshot.cloud.hiddenPieNodes], ['n1'], 'restoring cannot consume or mutate the snapshot');
  assert.equal(snapshot.labelPlacements, undefined, 'DOM-derived placements are not persistent document data');
  assert.throws(() => documents.restore(a, {sourceName:'incomplete'}), {code:'DOCUMENT_SNAPSHOT_INVALID'});
  assert.equal(a.sourceName, 'a.tree', 'an invalid snapshot cannot partially commit state');
});

test('cooperative runner preserves generator order and closes it on cancellation', async () => {
  const controller = new AbortController();
  let closed = false, t = 0, pauses = 0;
  function* steps() { try { yield {phase:'one'}; yield {phase:'two'}; return 42; } finally {closed=true;} }
  const value = await scheduler.run(steps(), {now:()=>t+=25, pause:async()=>{pauses++;}, signal:controller.signal});
  assert.equal(value,42); assert.equal(closed,true); assert.equal(pauses,2);
  closed=false;
  await assert.rejects(scheduler.run(steps(), {now:()=>t+=25, pause:async()=>controller.abort(), signal:controller.signal}), /abort/i);
  assert.equal(closed,true);
});

test('node label layout requires explicit ports and does not create an application singleton', () => {
  const layout = require('../render/node-label-layout.js');
  const geometry = require('../core/label-geometry.js');
  assert.throws(() => layout.create(), /geometry port/);
  assert.throws(() => layout.create({geometry}), /readContext port/);
  const ports = {geometry};
  for (const name of ['readContext','readOptions','svgEl','nodeLabelInkRect','appendNodeLabelArrow','enableLabelDrag','formatSupportValue',
    'nodeLabelFontSettings','countResidualCollisions','updateLabelWarnings','publishPlacements','publishCollisions','mapRenderSteps']) ports[name]=()=>{};
  const a = layout.create(ports), b = layout.create({...ports});
  assert.notEqual(a,b);
  assert.equal(Object.isFrozen(a),true);
  assert.deepEqual(Object.keys(a).sort(),['layoutSupportLabelSteps','refineReadableNodeLabelSteps']);
});

test('label refinement obtains its own document slice before resuming after a yield', () => {
  const geometry = require('../core/label-geometry.js');
  const layout = require('../render/node-label-layout.js');
  const rect = {id:'n1',node:{x:100,y:100},x:110,y:110,width:20,height:10,fontSize:12};
  const element = {dataset:{labelId:'n1'},getAttribute:()=>12,setAttribute:()=>{}};
  const ports = {geometry,readContext:()=>({manualLabels:new Map(),currentSvgSize:{width:900,height:500},branchSegments:[]}),
    readOptions:()=>({leaderLines:true,nodeRadius:5}),nodeLabelInkRect:(_element,value)=>value,
    nodeLabelFontSettings:()=>({preferred:12,minimum:9})};
  for (const name of ['svgEl','appendNodeLabelArrow','enableLabelDrag','formatSupportValue',
    'countResidualCollisions','updateLabelWarnings','publishPlacements','publishCollisions','mapRenderSteps']) ports[name]=()=>{};
  const steps = layout.create(ports).refineReadableNodeLabelSteps([rect],{querySelectorAll:()=>[element]},null,{children:[]},[],[], 'time', true);
  assert.equal(steps.next().value.phase, 'repair');
  assert.doesNotThrow(()=>steps.next());
  steps.return();
});
