import assert from 'node:assert/strict';
import {createRuntime} from '../src/runtime.mjs';
import originalDemo from '../../defaults/dating-workspace.js';
const runtime=await createRuntime();
try{
 const page=await runtime.renderer.browser.newPage();
 await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderReady);
 const valid='(O:3,((A:1,B:1)[&height=1,height_95%_HPD = {0.5, 2}]:1,C:2)[&height=2]:1)[&height=3];';
 const load=spec=>page.evaluate(spec=>PhyloRenderAgent.loadFigure(spec),spec);
 const capture=()=>page.evaluate(async()=>({svg:await serializeRenderedSvg(),config:await PhyloRenderAgent.exportConfiguration(),
  parsed:JSON.stringify(state.parsedRoot),cloud:JSON.stringify(state.cloud.speciesRoot)}));
 for(const workspace of ['time','cloud']){
  const spec=content=>({workspace,main_tree:{name:'raw-chronogram.tre',content},options:workspace==='time'
   ?{time:{source_unit:'mya',display_unit:'mya'}}:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false}}});
  await load(spec(valid));
  if(workspace==='time')assert.equal(await page.locator('.time-hpd').count(),1);
  const before=await capture();
  for(const fields of ['height=NaN','height=3,height=4','height=3,height_mean=bad','height=3,height_95%_HPD = {4, 2}','height=3,height_95%_HPD={1,2,3}']){
   const invalid=valid.replace('[&height=3]',`[&${fields}]`);
   await assert.rejects(load(spec(invalid)),/年龄|HPD|冲突/);
   assert.deepEqual(await capture(),before,`${workspace}: failed import must preserve SVG, source and configuration`);
  }
  for(const invalid of [
   valid.replace('O:3','O[&height=1e-12]:3'),
   valid.replace('[&height=2]','[&height=3.0000000001]')
  ]){
   await assert.rejects(load(spec(invalid)),/非零末端年龄|年龄倒置/);
   assert.deepEqual(await capture(),before,`${workspace}: exact age rejection must preserve the accepted document`);
  }
  // Actual file-upload path uses the same raw validator and retains the accepted source.
  if(workspace==='cloud'){
   await page.locator('#cloud-species-file').setInputFiles({name:'bad-hpd.tre',mimeType:'text/plain',buffer:Buffer.from(valid.replace('{0.5, 2}','{2, 0.5}'))});
   await page.locator('#tree-loading-close').waitFor({state:'visible'});
   assert.equal(await page.locator('#tree-loading').getAttribute('data-state'),'error');
   assert.deepEqual(await capture(),before);
   await page.locator('#tree-loading-close').click();
  }
  // Previously rejected BEAST residues now pass; scientific source stays intact.
  for(const content of [valid.replace('O:3','O[&height=1.4210854715202004e-14]:3'),originalDemo.content]){
   const result=await load(spec(content));
   const audit=workspace==='time'?result.report.time.terminal_age_validation:result.report.cloud.imported_dating.terminalAgeValidation;
   assert.ok(audit.accepted_tip_count>0);assert.equal(audit.source_tree_unchanged,true);
   assert.equal((await capture()).config.main_tree.content,content);
   const tips=await page.evaluate(()=>{
    const root=state.workspaceMode==='time'?state.parsedRoot:state.cloud.speciesRoot;
    return PhyloRenderSampleIdentity.descendantTipNodes(root).map(n=>({name:n.label,comments:n.comments}));
   });
   assert.ok(tips.some(n=>n.comments.some(c=>/height[^,]*[eE]-14/.test(c))));
  }
 }
 console.log('RAW_TIME_ANNOTATIONS_PASSED: raw age/HPD validation, bounded Float64 tip residues, real serial-tip/inversion rejection, time/cloud atomicity and GUI upload');
}finally{await runtime.close();}
