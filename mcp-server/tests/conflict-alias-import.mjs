import assert from 'node:assert/strict';
import {createRuntime} from '../src/runtime.mjs';
const runtime=await createRuntime();
try{
 const page=await runtime.renderer.browser.newPage();await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderReady);
 const labels=['A','B','C','D'].map(name=>name+'_'+'raw_identity_'.repeat(40));
 const tree=`((${labels[0]}:1,${labels[1]}:1):1,(${labels[2]}:1,${labels[3]}:1):1);`;
 const sampleGroups=[{name:'Blue lineage',color:'#0072b2',samples:[labels[0],labels[1]]},
  {name:'Green lineage',color:'#009e73',samples:[labels[2]]}];
 const spec={workspace:'conflict',main_tree:{content:tree},comparison_tree:{content:tree},sample_groups:sampleGroups,
  tip_label_overrides:Object.fromEntries(labels.map((name,index)=>[name,'Sample '+(index+1)]))};
 const load=spec=>page.evaluate(spec=>PhyloRenderAgent.loadFigure(spec),spec);
 const result=await load(spec);assert.equal(result.report.topology_unchanged,true);
 assert.deepEqual(await page.locator('.conflict-connector[data-group]').evaluateAll(nodes=>nodes.map(node=>node.dataset.group).sort()),
  ['Blue lineage','Blue lineage','Green lineage']);
 assert.deepEqual(result.normalized_spec.sample_groups,sampleGroups);
 assert.equal(result.report.conflict.group_coloring.assigned_primary_samples,3);
 assert.deepEqual(await page.evaluate(()=>PhyloRenderSampleIdentity.descendantTipNodes(state.conflict.nuclearRoot).map(t=>t.label).sort()),labels.slice().sort());
 const saved=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());assert.deepEqual(saved.tip_label_overrides,spec.tip_label_overrides);
 assert.deepEqual(saved.sample_groups,sampleGroups);
 for (const [sample,code] of [['Sample 1','CONFLICT_GROUP_SAMPLE_UNKNOWN'],
  [labels[0].toLowerCase(),'CONFLICT_GROUP_SAMPLE_DUPLICATE']]) {
  const invalid={...spec,sample_groups:[...sampleGroups,{name:'Other',color:'#d55e00',samples:[sample]}]};
  const rejected=await page.evaluate(async value=>{
   try { await PhyloRenderAgent.loadFigure(value);return null; }
   catch (error) { return {code:error.code,field:error.field}; }
  },invalid);
  assert.deepEqual(rejected,{code,field:'sample_groups'});
  assert.equal(await page.evaluate(()=>serializeRenderedSvg()),result.svg);
  assert.deepEqual(await page.evaluate(()=>PhyloRenderAgent.exportConfiguration()),saved);
 }
 const svg=result.svg;assert.match(svg,/Sample 1/);assert.ok(await page.locator('.conflict-tip-label').evaluateAll(nodes=>nodes.every(node=>node.textContent.startsWith('Sample '))));
 // Equal overlong names are no longer forcibly fitted to a canvas fraction.
 // Preserve the original fixture: it exceeds the figure ceiling and must roll back.
 await assert.rejects(load({...spec,tip_label_overrides:{}}),/图幅|名称/);
 assert.equal(await page.evaluate(()=>serializeRenderedSvg()),svg);
 assert.deepEqual(await page.evaluate(()=>PhyloRenderAgent.exportConfiguration()),saved);
 // A single outlier display name fits to the shared natural-width median;
 // aliases still preserve every raw scientific identity and complete string.
 const outlier='Sample unusually long complete specimen name 2023080906_1';
 await load({...spec,tip_label_overrides:{...spec.tip_label_overrides,[labels[0]]:outlier}});
 const fitted=await page.locator('.conflict-tip-label').evaluateAll(nodes=>nodes.map(n=>({
  original:n.dataset.originalTipLabel,width:n.getBBox().width,limit:Number(n.dataset.tipWidthLimit),
  fitted:n.getAttribute('lengthAdjust')})));
 assert.equal(fitted.length,8);assert.ok(fitted.every(n=>labels.includes(n.original)));
 assert.equal(fitted.filter(n=>n.fitted==='spacingAndGlyphs').length,2);
 assert.ok(fitted.filter(n=>n.fitted).every(n=>Math.abs(n.width-n.limit)<.01));
 assert.equal(await page.locator('.conflict-tip-label').evaluateAll((nodes,name)=>nodes.filter(n=>n.textContent===name).length,outlier),2);
 assert.deepEqual(await page.evaluate(()=>PhyloRenderSampleIdentity.descendantTipNodes(state.conflict.nuclearRoot).map(t=>t.label).sort()),labels.slice().sort());
 await load(saved);assert.equal(await page.evaluate(()=>serializeRenderedSvg()),svg);
 // Group legends have no sample-name compression. Four valid 120-character
 // group names still exceed the canvas and exercise the original late rollback.
 const wideGroups=['A','B','C','D'].map((sample,index)=>({name:String(index)+'W'.repeat(119),color:'#0072B2',samples:[sample]}));
 const shortTree={content:'((A:1,B:1):1,(C:1,D:1):1);'};
 await assert.rejects(load({...spec,main_tree:shortTree,comparison_tree:shortTree,tip_label_overrides:{},sample_groups:wideGroups}),/图幅|名称/);
 assert.equal(await page.evaluate(()=>serializeRenderedSvg()),svg);
 assert.deepEqual(await page.evaluate(()=>PhyloRenderAgent.exportConfiguration()),saved);
 const supported={workspace:'conflict',main_tree:{content:'((A:1,B:1)89:1,(C:1,D:1)76:1,E:1);'},
  comparison_tree:{content:'((A:1,C:1):1,(B:1,D:1):1,E:1);'},rooting:{outgroup:['A']},
  options:{conflict:{primary_support_scale:'percent'}}};
 const rooted=await load(supported);
 assert.equal(rooted.report.topology_unchanged,true);
 const supportLabels=()=>page.locator('.conflict-support-labels text').allTextContents();
 assert.deepEqual((await supportLabels()).sort(),['76.0','89.0']);
 const rootedSaved=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
 await load(rootedSaved);
 assert.deepEqual((await supportLabels()).sort(),['76.0','89.0']);
 console.log('CONFLICT_ALIAS_IMPORT_PASSED: final configuration is applied before layout, raw identities, fitted long names and late width-limit rollback remain intact');
}finally{await runtime.close();}
