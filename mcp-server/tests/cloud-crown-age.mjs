import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';
const species='(O:0.2,((A:0.1,B:0.12)90:0.1,(C:0.09,D:0.13)80:0.11)85:0.08);';
const genes=species+'\n(O:0.21,((A:0.12,C:0.15)75:0.1,(B:0.1,D:0.13)80:0.12)85:0.07);';
const dated='(O:73.5,((A:12,B:12):32,(C:21,D:21):23):29.5);';
const runtime=await createRuntime(), output=process.argv[2];
try {
 const page=await runtime.renderer.browser.newPage({viewport:{width:1600,height:1000}}),requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/api/cloud-date/jobs')&&r.method()==='POST')requests.push(r.postDataJSON());});
 await page.goto(runtime.renderer.agentPageUrl); await page.evaluate(()=>PhyloRenderAgent.ready());
 await page.locator('[data-workspace-mode="cloud"]').click();
 await page.locator('[data-settings-target="data"]').click();
 await page.locator('#cloud-input-section').evaluate(el=>el.open=true);
 await page.locator('#cloud-species-method').selectOption('ml');
 assert.equal(await page.locator('#cloud-root-age').inputValue(),'');
 assert.equal(await page.locator('#cloud-root-age').isVisible(),true);
 const reject=()=>page.evaluate(async content=>{try{await PhyloRenderImportCloudSpecies(new File([content],'ML.treefile'));return '';}catch(e){return e.message;}},species);
 assert.match(await reject(),/冠群/); assert.equal(requests.length,0);
 await page.locator('#cloud-root-age').fill('-1');assert.match(await reject(),/大于零/);assert.equal(requests.length,0);
 await page.locator('#cloud-root-age').fill('70');await page.locator('#cloud-root-age-unit').selectOption('mya');
 if(output){await mkdir(output,{recursive:true});await page.screenshot({path:`${output}/ml-crown-age-input.png`});}
 await page.evaluate(async content=>PhyloRenderImportCloudSpecies(new File([content],'ML.treefile')),species);
 assert.equal(requests.length,1,'species tree is genuinely dated first');
 assert.equal(await page.evaluate(()=>state.cloud.datedRootAge),70);
 await page.evaluate(()=>{$('cloud-genes-method').value='ml';});
 await page.locator('#cloud-genes-file').setInputFiles({name:'genes.trees',mimeType:'text/plain',buffer:Buffer.from(genes)});
 await page.waitForFunction(()=>state.cloud.geneRoots.length===2&&!activeTreeLoad&&!state.cloud.phyPartsBusy,null,{timeout:180000});
 assert.equal(requests.length,2,'gene trees are dated after the species reference');
 await page.evaluate(async ()=>{$('cloud-show-time-axis').checked=true;$('time-geology').value='standard';await renderCloudTree();});
 const audit=await page.evaluate(async()=>{
  const c=state.cloud,names=PhyloRenderCloud.sampleProfile(c.speciesRoot).names;
  c.geneRoots.forEach(root=>PhyloRenderCloud.verifySharedAges(root,c.datedAges.get(root),
    PhyloRenderCloud.sharedAgeCalibrations(c.speciesRoot,c.datedAges.get(c.speciesRoot),root,names),70));
  return {root:c.datedRootAge,geneRoots:c.geneRoots.map(root=>c.datedAges.get(root).get(root)),
    unit:cloudTimeUnit(),engine:c.datingEngine,configuration:await PhyloRenderAgent.exportConfiguration(),
    provenance:JSON.parse($('cloud-dating-provenance').textContent)};
 });
 assert.equal(audit.unit,'mya');assert.deepEqual(audit.geneRoots,[70,70]);assert.equal(audit.provenance.fossilCalibrated,false);
 assert.equal(audit.configuration.options.cloud.root_age,70);assert.equal(audit.configuration.options.cloud.root_age_unit,'mya');
 const mcp=await runtime.renderer.render(audit.configuration);
 assert.equal(mcp.report.cloud.dating_engine,'bundled-treePL');assert.equal(mcp.report.cloud.time_background.sourceYears,1e6);
 assert.equal(mcp.report.cloud.time_background.geologyVisible,true);
 if(output){
  await writeFile(`${output}/ml-70mya-cloud.svg`,mcp.svg);
  const preview=await runtime.renderer.browser.newPage({viewport:{width:1660,height:1100}});
  await preview.setContent(`<body style="margin:0">${mcp.svg}</body>`);await preview.evaluate(()=>document.fonts.ready);
  await preview.locator('svg').screenshot({path:`${output}/ml-70mya-cloud.png`});await preview.close();
 }
 await page.locator('#cloud-species-method').selectOption('dated');
 await page.locator('#cloud-dated-unit').selectOption('mya');
 const before=requests.length;
 await page.evaluate(async content=>PhyloRenderImportCloudSpecies(new File([content],'dated.tree')),dated);
 assert.equal(requests.length,before,'already dated species tree still skips treePL');
 assert.equal(await page.evaluate(()=>state.cloud.datedRootAge),73.5);
 assert.equal(await page.locator('#cloud-root-age').isDisabled(),true);
 assert.deepEqual(errors,[]);
 if(output)await writeFile(`${output}/crown-age-audit.json`,JSON.stringify({rootAge:audit.root,geneRoots:audit.geneRoots,unit:audit.unit,requests,provenance:audit.provenance,errors},null,2));
 console.log('PASS explicit ML crown age, invalid-input blocking before computation, real species-first/gene-second treePL, shared-clade calibration, units/configuration, MCP rendering and dated-input bypass');
}finally{await runtime.close();}
