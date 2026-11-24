import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';
const runtime=await createRuntime(),output=process.argv[2];
try{
 const page=await runtime.renderer.browser.newPage({viewport:{width:1600,height:1000}}),requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 for(const mode of ['cloud','phylogeny','time','conflict']){
  const url=new URL(runtime.pageUrl);url.searchParams.set('workspace',mode);
  await page.goto(url.toString());await page.evaluate(()=>PhyloRenderAgent.ready());
  for(const target of [mode,...['cloud','phylogeny','time','conflict'].filter(m=>m!==mode)]){
   await page.locator(`[data-workspace-mode="${target}"]`).click();
   await page.waitForFunction(mode=>state.workspaceMode===mode,target);
   const stateAudit=await page.evaluate(()=>({ordinary:!!state.root,parsed:!!state.parsedRoot,cloud:!!state.cloud.speciesRoot,genes:state.cloud.geneRoots.length,
    conflict:!!(state.conflict.nuclearRoot||state.conflict.plastidRoot),tips:$('tip-count').textContent,han:[...$('tree-svg').querySelectorAll('text')].some(e=>/[\u3400-\u9fff]/.test(e.textContent)),
    demo:!!(globalThis.PhyloRenderLocalCloudExample||globalThis.PhyloRenderDatingExample||globalThis.PhyloRenderOrdinaryExample)}));
   assert.deepEqual(stateAudit,{ordinary:false,parsed:false,cloud:false,genes:0,conflict:false,tips:'0',han:false,demo:false});
  }
 }
 assert.ok(!requests.some(url=>/\/defaults\/|\/api\/(?:cloud-date|cloud-phyparts|taxon-names)/.test(url)),'normal startup does not even download demonstration trees or start calculations');
 assert.deepEqual(errors,[]);
 if(output){await mkdir(output,{recursive:true});await page.locator('[data-workspace-mode="cloud"]').click();await page.screenshot({path:`output/empty-startup.png`.replace('output/',output+'/')});await writeFile(`${output}/empty-startup-audit.json`,JSON.stringify({pass:true,modes:4,modeSwitchChecks:16,noDemoDownloads:true,noComputations:true,errors},null,2));}
 console.log('PASS empty startup for all four URL modes and all tab switches, zero demo downloads/calculations, English placeholders and no script errors');
}finally{await runtime.close();}
