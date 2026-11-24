import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRuntime} from '../src/runtime.mjs';
const evidence=process.argv[2]||path.resolve('mcp-server/var/automatic-row-layout');
const baseline=process.env.PHYLORENDER_ROW_BASELINE;
await mkdir(evidence,{recursive:true});
const runtime=await createRuntime(),page=await runtime.renderer.browser.newPage(),errors=[];
let workers=0,sciencePosts=0;page.on('worker',()=>workers++);page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(?:jobs|date|phyparts)/.test(r.url()))sciencePosts++;});
page.on('pageerror',e=>errors.push(e.message));
const tree=count=>`(O:100,(${Array.from({length:count-1},(_,i)=>`Example_species_${String(i+1).padStart(3,'0')}:80`).join(',')}):20)[&height_95%_HPD={90,110}];`;
const spec=(workspace,count,options={})=>({workspace,main_tree:{name:'rows.nex',content:tree(count)},
 ...(workspace==='conflict'?{comparison_tree:{name:'rows-other.nex',content:tree(count)}}:{}),
 ...(workspace==='phylogeny'||workspace==='conflict'?{rooting:{outgroup:['O']}}:{}),
 options:{layout:{automatic_tip_spacing:true},...(workspace==='time'?{time:{source_unit:'mya'}}:{}),
 ...(workspace==='cloud'?{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false}}:{}),...options}});
const load=(p,s)=>p.evaluate(s=>PhyloRenderAgent.loadFigure(s),s);
const canonical=(p,s)=>p.evaluate(s=>{const doc=new DOMParser().parseFromString(s,'image/svg+xml');doc.querySelector('metadata#phylorender-build')?.remove();return new XMLSerializer().serializeToString(doc);},s);
const initialize=async p=>{await p.goto(runtime.renderer.agentPageUrl);await p.evaluate(()=>PhyloRenderReady);};
const receipts=[];
let oldPage;
try{
 await initialize(page);
 if(baseline){
  oldPage=await runtime.renderer.browser.newPage();
  for(const file of ['app.js','figure-contract.js','core/figure-report.js','render/time-tree.js','render/cloud-tree.js']){
   const body=await readFile(path.join(baseline,file),'utf8');
   await oldPage.route('**/'+file+'*',route=>route.fulfill({contentType:'application/javascript',body}));
  }
  await initialize(oldPage);
 }
 for(const workspace of ['phylogeny','time','cloud','conflict']){
  const s=spec(workspace,41),web=await load(page,s);
  const measurements=await page.evaluate(()=>{
   const labels=[...document.querySelectorAll('#tree-svg .tip-label,#tree-svg .cloud-tip-label,#tree-svg .conflict-tip-label')];
   const rows=[...new Set(labels.map(n=>Number(n.getAttribute('y'))))].sort((a,b)=>a-b);
   return {rows,step:terminalSpacing(),font:Number(document.getElementById('tip-font-size').value),
    raw:state.workspaceMode==='cloud'?state.cloud.speciesText:state.workspaceMode==='conflict'?state.conflict.nuclearText:document.getElementById('newick-input').value};
  });
  const ratio=web.report.output.drawing_height/web.report.output.drawing_width;
  if(workspace==='conflict')assert.ok(ratio<1,'comparison must remain landscape for this sample size');
  else{assert.ok(Math.abs(ratio-1.25)<.015,`${workspace}: H/W=${ratio}`);assert.equal(web.report.output.automatic_row_layout.expanded,true);}
  assert.equal(measurements.raw,s.main_tree.content);assert.equal(measurements.rows.length,41);
  assert.equal(measurements.font,workspace==='time'||workspace==='cloud'?24:20);
  const config=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  assert.equal(config.options.layout.automatic_tip_spacing,true);
  const remote=await runtime.renderer.render(config,{formats:['svg','png']});
  assert.equal(await canonical(page,remote.svg),await canonical(page,web.svg),`${workspace}: full GUI/MCP SVG equality`);
  await writeFile(path.join(evidence,workspace+'.svg'),remote.svg);await writeFile(path.join(evidence,workspace+'.png'),remote.png);
  const again=await load(page,config);assert.equal(await canonical(page,again.svg),await canonical(page,web.svg),`${workspace}: automatic spacing round trip`);
  receipts.push({workspace,count:41,height_to_width:ratio,tip_spacing:measurements.step,tip_font:measurements.font,gui_mcp_equal:true});
  console.log('AUTOMATIC_ROW_LAYOUT_PASSED',workspace,ratio);
  if(oldPage){
   if(workspace!=='conflict'){
    const dense=spec(workspace,176),old=await load(oldPage,dense),current=await load(page,dense);
    assert.equal(await canonical(page,current.svg),await canonical(page,old.svg),`${workspace}: dense SVG unchanged`);
   }else{
    const old=await load(oldPage,s);assert.equal(await canonical(page,old.svg),await canonical(page,web.svg),'comparison geometry unchanged');
   }
   const manual=spec(workspace,41,{...s.options,layout:{automatic_tip_spacing:false,tip_spacing_em:1.5}});
   const old=await load(oldPage,manual),current=await load(page,manual);
   assert.equal(await canonical(page,current.svg),await canonical(page,old.svg),`${workspace}: manual SVG unchanged`);
   const fixed=spec(workspace,41,{...s.options,output:{aspect_ratio:'4:3'}});
   const oldRatio=await load(oldPage,fixed),newRatio=await load(page,fixed);
   assert.equal(await canonical(page,newRatio.svg),await canonical(page,oldRatio.svg),`${workspace}: explicit proportion unchanged`);
  }
 }
 // Sparse trees gain real row distance but stop at the comfort cap.
 const sparse=await load(page,spec('phylogeny',6));
 assert.equal(sparse.report.output.automatic_row_layout.limit,60);
 assert.ok(sparse.report.output.tip_spacing_em<=3+1e-8);
 // Actual automatic-spacing controls only redraw, without scientific work.
 await load(page,spec('cloud',41));
 const science=()=>page.evaluate(()=>JSON.stringify([state.cloud.speciesText,state.cloud.speciesRoot,[...state.cloud.datedAges.get(state.cloud.speciesRoot)]]));
 const sourceBefore=await science(),starts={workers,sciencePosts};
 await page.locator('[data-settings-target="tree"]').click();
 await page.locator('#automatic-tip-spacing').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 await page.locator('#automatic-tip-spacing').uncheck();await page.evaluate(()=>flushSettingsRender());
 await page.locator('#automatic-tip-spacing').check();await page.evaluate(()=>flushSettingsRender());
 assert.deepEqual({workers,sciencePosts},starts);assert.equal(await science(),sourceBefore);
 // Invalid imports must restore the accepted row geometry and config.
 await load(page,spec('time',41));
 const before=await page.evaluate(async()=>({figure:(await PhyloRenderAgent.currentFigure()).svg,config:await PhyloRenderAgent.exportConfiguration()}));
 await assert.rejects(load(page,{...spec('time',176),main_tree:{content:'(A[&height=1]:2,B:2)[&height=2];'}}),/非零末端/);
 const after=await page.evaluate(async()=>({figure:(await PhyloRenderAgent.currentFigure()).svg,config:await PhyloRenderAgent.exportConfiguration()}));
 assert.equal(await canonical(page,before.figure),await canonical(page,after.figure));assert.deepEqual(after.config,before.config);
 assert.deepEqual(errors,[]);await writeFile(path.join(evidence,'receipt.json'),JSON.stringify(receipts,null,2));
}finally{await oldPage?.close();await page.close();await runtime.close();}
console.log('AUTOMATIC_ROW_LAYOUT_SUITE_PASSED');
