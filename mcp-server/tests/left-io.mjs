import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createRuntime} from '../src/runtime.mjs';
const require=createRequire(import.meta.url),datedDemo=require('../../defaults/dating-synthetic.js');
const tree='(Outgroup:3,((Salix_alba:1,Salix_purpurea:1)95:1,(Populus_alba:1,Populus_nigra:1)85:1)90:1);';
const comparison='(Outgroup:3,((Salix_alba:1,Populus_alba:1)95:1,(Salix_purpurea:1,Populus_nigra:1)85:1)90:1);';
const dated='(Outgroup:70,((Salix_alba:30,Salix_purpurea:30):25,(Populus_alba:10,Populus_nigra:10):45):15);';
const input=(name,content)=>({name,mimeType:'text/plain',buffer:Buffer.from(content)});
const runtime=await createRuntime(),output=process.argv[2],audits=[];
try{
 if(output)await mkdir(output,{recursive:true});
 const page=await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(runtime.pageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
 const select=async mode=>{
   await page.locator(`[data-workspace-mode="${mode}"]`).click();
   await page.waitForFunction(()=>!activeTreeLoad);
   await page.getByRole('button',{name:'导入',exact:true}).click();
   assert.equal(await page.locator('.topbar input,.topbar label,.topbar #export-svg,.topbar #export-png,.topbar #export-a4').count(),0);
 };
 const opened=async selector=>{if(await page.locator(selector).getAttribute('open')===null)await page.locator(`${selector} > summary`).click();};
 const uploaded=async(id,name,content)=>{
   await page.waitForFunction(()=>!activeTreeLoad);
   await page.locator(id).setInputFiles(input(name,content));
   await page.locator('#tree-loading').waitFor({state:'hidden',timeout:180000});
   assert.equal(await page.locator('#tree-loading-close').isVisible(),false);
   assert.equal(await page.locator('#tree-loading').getAttribute('data-state'),'running', 'upload must complete, not return to a previous error');
 };
 const validate=async(mode,tips)=>{
   await page.waitForFunction(()=>!activeTreeLoad);
   assert.equal(Number(await page.locator('#tip-count').textContent()),tips,'required input must be committed before export');
   await page.getByRole('button',{name:'导出',exact:true}).click();
   const before=await page.evaluate(()=>serializeRenderedSvg());
   for(const id of ['export-svg','export-png','export-a4']){
     assert.equal(await page.locator(`#${id}`).isVisible(),true);
     assert.equal(await page.locator(`#${id}`).evaluate(e=>e.closest('[data-settings-page]')?.dataset.settingsPage),'export');
   }
   assert.equal(await page.locator('#export-a4').isEnabled(),!['cloud','conflict'].includes(mode));
   for(const format of ['svg','png']){
     const pending=page.waitForEvent('download',{timeout:180000});
     await page.locator(`#export-${format}`).click();
     const download=await pending,bytes=await readFile(await download.path());
     if(format==='svg'){
       const text=bytes.toString('utf8');assert.match(text,/<svg/);
       assert.doesNotMatch(text,/导入图片|制图工作台/);
     }else assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
     if(output)await download.saveAs(`${output}/${mode}.${format}`);
     await page.locator('#export-progress-close').waitFor({state:'visible'});
     await page.locator('#export-progress-close').click();
   }
   assert.equal(await page.evaluate(()=>serializeRenderedSvg()),before,'moving export entry must not change the figure');
   assert.equal(Number(await page.locator('#tip-count').textContent()),tips);
   if(output)await page.screenshot({path:`${output}/${mode}-export-workbench.png`});
   audits.push({mode,tips,headerIO:false,exportTab:true,svgDownload:true,pngDownload:true,svgPreserved:true});
 };
 await select('phylogeny');await opened('.tree-source-section');
 assert.equal(await page.locator('#tree-file').evaluate(e=>e.closest('[data-settings-page]')?.dataset.settingsPage),'data');
 await uploaded('#tree-file','ordinary.nwk',tree);await validate('phylogeny',5);
 await select('time');await opened('.tree-source-section');
 await uploaded('#tree-file','synthetic_dated_demo.tree',datedDemo.content);
 await validate('time',27);
 await select('conflict');await opened('#conflict-input-section');
 await uploaded('#conflict-nuclear-file','primary.nwk',tree);await uploaded('#conflict-plastid-file','secondary.nwk',comparison);
 await validate('conflict',5);
 await select('cloud');
 await page.locator('[data-settings-target="tree"]').click();await opened('#cloud-background-section');
 await page.locator('#cloud-show-gene').uncheck();
 await page.getByRole('button',{name:'导入',exact:true}).click();await opened('#cloud-input-section');
 await page.locator('#cloud-species-method').selectOption('dated');await page.locator('#cloud-dated-unit').selectOption('mya');
 await uploaded('#cloud-species-file','dated_species.nwk',dated);await validate('cloud',5);
 assert.deepEqual(errors,[]);
 if(output)await writeFile(`${output}/left-io-audit.json`,JSON.stringify({passed:true,audits,errors},null,2));
 console.log('PASS all four modes: left-only import/export, real file-input handlers, SVG/PNG downloads, two-panel gating, immutable SVG, explicit synthetic 27-tip dated input and zero script errors');
}finally{await runtime.close();}
