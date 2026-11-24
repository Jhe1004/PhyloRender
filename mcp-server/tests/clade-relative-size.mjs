import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRuntime} from '../src/runtime.mjs';
const runtime=await createRuntime(),evidence=process.argv[2];
const page=await runtime.renderer.browser.newPage();
let workers=0,scienceRequests=0;
page.on('worker',()=>workers++);
page.on('request',request=>{if(/\/api\/(?:date|jobs|phyparts)/.test(request.url())&&request.method()==='POST')scienceRequests++;});
const ordinary='(O:4,((A:1,B:1)75:1,C:2)80:2);';
const dated='(O:4,((A:1,B:1):1,C:2):2);';
const group={mrca_of:['A','B'],name:'Example group'};
const configuration=(workspace,typography={})=>({workspace,main_tree:{content:workspace==='phylogeny'?ordinary:dated},
 clades:[group],...(workspace==='cloud'?{gene_trees:{content:ordinary}}:{}),
 options:{typography:{tips:{italic_mode:'none'},...typography},
 ...(workspace==='phylogeny'?{support:{scale:'percent'}}:{}),
 ...(workspace==='time'?{time:{source_unit:'mya',age_source:'branch_lengths'}}:{}),
 ...(workspace==='cloud'?{cloud:{species_method:'other',show_gene:false,phyparts_scale:'percent'}}:{})}});
try{
 if(evidence)await mkdir(evidence,{recursive:true});
 await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderReady);
 const load=spec=>page.evaluate(spec=>PhyloRenderAgent.loadFigure(spec),spec);
 const current=()=>page.evaluate(async()=>{const figure=await PhyloRenderAgent.currentFigure();return {figure,
  tip:PhyloRenderUnits.designToDrawing(Number(document.getElementById('tip-font-size').value)),
  group:PhyloRenderUnits.designToDrawing(Number(document.getElementById('clade-font-size').value)),
  auto:document.getElementById('clade-font-auto')?.checked};});
 for(const workspace of ['phylogeny','time','cloud']){
  await load(configuration(workspace));let state=await current();
  assert(Math.abs(state.group-state.tip-3)<1e-8,`${workspace}: default group=${state.group}, tip=${state.tip}`);
  assert.equal(state.auto,true);
  await load(configuration(workspace,{tips:{italic_mode:'none',size_u:17}}));state=await current();
  assert(Math.abs(state.group-20)<1e-8,`${workspace}: explicit tip size must update automatic group size`);
  const config=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  assert.equal(config.options.typography.clades.follow_tip_size,true);
  const remote=await runtime.renderer.render(config,{formats:['svg']});
  const canonical=s=>s.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/g,'');
  assert.equal(canonical(remote.svg)===canonical(state.figure.svg),true,`${workspace}: exact GUI/MCP SVG`);
  assert.equal(remote.normalizedSpec.options.typography.clades.follow_tip_size,true);
  assert(Math.abs(remote.normalizedSpec.options.typography.clades.size_u-20)<1e-7);
  if(evidence){await writeFile(`${evidence}/${workspace}.svg`,remote.svg);await page.locator('#tree-svg').screenshot({path:`${evidence}/${workspace}.png`});}
  const starts={workers,scienceRequests};
  const science=await page.evaluate(()=>JSON.stringify([state.parsedRoot,[...state.cloud.datedAges],state.cloud.phyPartsMeta]));
  await page.locator('[data-settings-target="tips"]').click();
  await page.locator('#tip-font-size-number').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await page.locator('#tip-font-size-number').fill('18');await page.locator('#tip-font-size-number').press('Tab');
  await page.evaluate(()=>flushSettingsRender());state=await current();
  assert(Math.abs(state.group-21)<1e-7);
  assert.deepEqual({workers,scienceRequests},starts,`${workspace}: typography must not restart science`);
  assert.equal(await page.evaluate(()=>JSON.stringify([state.parsedRoot,[...state.cloud.datedAges],state.cloud.phyPartsMeta])),science);
  await load(configuration(workspace,{clades:{size_u:11}}));state=await current();
  assert.equal(state.auto,false);assert(Math.abs(state.group-11)<1e-7);
  const fixed=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  assert.equal(fixed.options.typography.clades.follow_tip_size,false);
  await load(fixed);assert(Math.abs((await current()).group-11)<1e-7);
  console.log(`CLADE_RELATIVE_SIZE_PASSED: ${workspace}`);
 }
 const rich=configuration('phylogeny',{tips:{size_u:17,italic_mode:'none'}});
 rich.clades=[{...group,name_segments:[{text:'Example ',size_u:12},{text:'group'}]}];
 const richOutput=await runtime.renderer.render(rich,{formats:['svg']});
 assert.equal(richOutput.normalizedSpec.clades[0].name_segments[0].size_u,12);
 assert.equal(richOutput.normalizedSpec.options.typography.clades.follow_tip_size,true);
 await load(configuration('phylogeny'));
 const raw=await page.evaluate(()=>JSON.stringify([state.originalText,state.parsedRoot,[...state.mainSupportValues]]));
 await page.locator('[data-settings-target="tips"]').click();
 await page.locator('#tip-font-size-number').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 await page.locator('#tip-font-size-number').fill('17');await page.locator('#tip-font-size-number').press('Tab');
 await page.evaluate(()=>flushSettingsRender());assert(Math.abs((await current()).group-20)<1e-7);
 await page.locator('[data-settings-target="groups"]').click();
 await page.locator('#clade-font-size-number').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 await page.locator('#clade-font-size-number').fill('12');await page.locator('#clade-font-size-number').press('Tab');
 await page.evaluate(()=>flushSettingsRender());let state=await current();assert.equal(state.auto,false);assert(Math.abs(state.group-12)<1e-7);
 const fixedBefore=await page.evaluate(async()=>({config:await PhyloRenderAgent.exportConfiguration(),svg:serializeRenderedSvg()}));
 const invalid=configuration('phylogeny',{clades:{follow_tip_size:true}});
 invalid.support_trees=[{content:ordinary.replace('75','0.75').replace('80','0.8'),scale:'auto'}];
 await assert.rejects(load(invalid),/量纲|单位|Ambiguous or mixed branch support scale|SUPPORT_SCALE_AMBIGUOUS/);
 const fixedAfter=await page.evaluate(async()=>({config:await PhyloRenderAgent.exportConfiguration(),svg:serializeRenderedSvg()}));
 assert.deepEqual(fixedAfter,fixedBefore,'late auxiliary-source failure must restore manual group font and the full figure');
 await page.locator('#tree-loading-close').click();
 await page.locator('#clade-font-auto').check();await page.evaluate(()=>flushSettingsRender());
 state=await current();assert.equal(state.auto,true);assert(Math.abs(state.group-state.tip-3)<1e-8);
 await page.evaluate(()=>switchWorkspaceMode('time',{loadExample:false,deferRender:true}));
 // The earlier time case deliberately selected a fixed 11 u. Switching modes
 // must restore that choice, rather than inherit phylogeny's automatic mode.
 assert.equal(await page.locator('#clade-font-auto').isChecked(),false);
 assert(Math.abs((await current()).group-11)<1e-7);
 await page.locator('[data-settings-target="groups"]').click();
 await page.locator('#clade-font-auto').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 await page.locator('#clade-font-auto').check();await page.evaluate(()=>flushSettingsRender());
 assert(Math.abs((await current()).group-(await current()).tip-3)<1e-8);
 await page.evaluate(()=>switchWorkspaceMode('phylogeny',{loadExample:false,deferRender:true}));
 assert(Math.abs((await current()).group-(await current()).tip-3)<1e-8);
 assert.equal(await page.evaluate(()=>JSON.stringify([state.originalText,state.parsedRoot,[...state.mainSupportValues]])),raw);
 const before=await page.evaluate(async()=>({config:await PhyloRenderAgent.exportConfiguration(),svg:serializeRenderedSvg()}));
 await assert.rejects(load({workspace:'time',main_tree:{content:'(A:1,B:2);'},options:{time:{source_unit:'mya',age_source:'branch_lengths'}}}));
 const after=await page.evaluate(async()=>({config:await PhyloRenderAgent.exportConfiguration(),svg:serializeRenderedSvg()}));assert.deepEqual(after,before);
 console.log('PASS automatic group sizes, explicit overrides, exact GUI/MCP SVG, real controls, unchanged science and failure rollback');
}finally{await page.close();await runtime.close();}
