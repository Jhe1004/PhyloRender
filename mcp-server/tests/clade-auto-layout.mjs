import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime,MCP_ROOT} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';
const evidence=process.argv[2],baseline=process.env.PHYLORENDER_CLADE_BASELINE;
const store=await mkdtemp(path.join(os.tmpdir(),'phylorender-clade-auto-'));
const client=new Client({name:'clade-auto-layout',version:'1.0'});let runtime;
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],env:{...process.env,PHYLORENDER_OUTPUT_ROOT:store},stderr:'pipe'});
transport.stderr?.on('data',()=>{});let page;
const out='O_out_with_a_very_long_sample_identifier_1234567890123456789';
const tree=`(${out}:100,(((A_alpha:10,B_beta:10):10,(C_gamma:10,D_delta:10):10):30,(E_eta:30,F_zeta:30):20):50);`;
const clades=[{mrca_of:['A_alpha'],name:'Staphisagria',color:'#0072B2'},
 {mrca_of:['B_beta'],name:'Gymnaconitum',name_segments:[{text:'Gymna',italic:true},{text:'conitum',bold:true}],color:'#D55E00'},
 {mrca_of:['C_gamma','D_delta'],name:'Aconitum',color:'#009E73'},
 {mrca_of:['E_eta','F_zeta'],name:'Delphinium',color:'#CC79A7'}];
const table='Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tC_gamma;D_delta\n';
const makeSpec=workspace=>({workspace,main_tree:{name:'groups.nwk',content:tree},clades,
 ...(workspace==='cloud'?{phyparts_table:{name:'counts.tsv',content:table}}:{}),
 options:{...(workspace==='phylogeny'?{support:{scale:'percent'}}:{}),
 ...(workspace==='time'?{time:{source_unit:'mya',age_source:'branch_lengths'}}:{}),
 ...(workspace==='cloud'?{cloud:{species_method:'dated',dated_unit:'mya',dated_age_source:'branch_lengths',show_gene:false}}:{})}});
try{
 await client.connect(transport);const remotes=new Map();
 for(const workspace of ['phylogeny','time','cloud']){
  const result=await client.callTool({name:'create_figure',arguments:makeSpec(workspace)},undefined,{timeout:240000});assert.ok(!result.isError,JSON.stringify(result.content));
  const link=result.content.find(c=>c.type==='resource_link'&&c.name==='figure.svg');assert.ok(link);
  remotes.set(workspace,(await client.readResource({uri:link.uri})).contents[0].text);
 }
 await client.close();await transport.close();console.log('CLADE_AUTO_PROTOCOL_PASSED');
 runtime=await createRuntime();page=await runtime.renderer.browser.newPage();const errors=[];let workers=0;const computations=[];
 page.on('worker',()=>workers++);page.on('request',r=>{if(r.method()==='POST'&&/\/api\/cloud-(date|phyparts)/.test(r.url()))computations.push(r.url());});
 page.on('pageerror',e=>errors.push(e.message));await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
 const canonical=(svg)=>page.evaluate(text=>{
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('SVG_PARSE_FAILED');
  doc.querySelectorAll('metadata#phylorender-build').forEach(n=>n.remove());
  const walk=n=>n.nodeType===1?{tag:n.tagName,attributes:[...n.attributes].map(a=>[a.name,a.value]).sort(),children:[...n.childNodes].map(walk)}:{type:n.nodeType,text:n.textContent};return JSON.stringify(walk(doc.documentElement));
 },svg);
 const pixelHash=png=>page.evaluate(async bytes=>{
  const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
  const rgba=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
  const digest=await crypto.subtle.digest('SHA-256',rgba);bitmap.close();
  return {width:canvas.width,height:canvas.height,rgba_sha256:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
 },[...png]);
 const audit=()=>page.evaluate(async()=>{
  const relative=n=>{const r=n.getBoundingClientRect(),s=document.querySelector('#tree-svg').getBoundingClientRect();return {x:r.x-s.x,y:r.y-s.y,width:r.width,height:r.height};};
  return {groups:[...document.querySelectorAll('.clade-bar-label')].map(n=>({name:n.textContent,orientation:n.dataset.nameOrientation,box:relative(n)})),
   samples:[...document.querySelectorAll('.tip-label,.cloud-tip-label')].map(relative),gap:cladeBarGapReport(),
   configuration:await PhyloRenderAgent.exportConfiguration()};
 });
 const overlaps=(a,b)=>a.x<b.x+b.width-.2&&a.x+a.width>b.x+.2&&a.y<b.y+b.height-.2&&a.y+a.height>b.y+.2;
 const receipts=[];if(evidence)await mkdir(evidence,{recursive:true});
 for(const workspace of ['phylogeny','time','cloud']){
  const spec=makeSpec(workspace);await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec);let a=await audit();
  assert.equal(a.groups.length,4);assert.ok(a.gap.valid);
  assert.ok(a.configuration.clades.every(c=>c.label_orientation==='auto'));
  if(workspace!=='phylogeny')assert.ok(a.groups.every(g=>g.orientation==='vertical'));
  else {
   // Keep the original long-outgroup fixture above. Its median cap now removes
   // the former whitespace, so safe automatic rotation may choose all vertical.
   // Supply actual whitespace in a second case, without changing raw identities.
   const whitespace={...spec,tip_label_overrides:Object.fromEntries(['B_beta','C_gamma','D_delta','E_eta','F_zeta']
    .map(name=>[name,name+' specimen identifier 1234567890123456789']))};
   await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),whitespace);
   const probe=await audit();assert.equal(probe.groups.length,4);assert.ok(probe.gap.valid);
   assert.ok(probe.groups.some(g=>g.orientation==='horizontal'),'nearby ordinary labels should reuse actual whitespace');
   for(const [i,group] of probe.groups.entries()) {
    assert.ok(probe.samples.every(box=>!overlaps(group.box,box)),'whitespace titles must not cover samples');
    assert.ok(probe.groups.slice(0,i).every(other=>!overlaps(group.box,other.box)),'whitespace titles must not overlap each other');
   }
   await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec);a=await audit();
  }
  for(let i=0;i<a.groups.length;i++){
   assert.ok(a.samples.every(b=>!overlaps(a.groups[i].box,b)),`${workspace}: group covers sample ${a.groups[i].name}`);
   for(let j=0;j<i;j++)assert.ok(!overlaps(a.groups[i].box,a.groups[j].box),`${workspace}: overlapping group titles`);
  }
  const scientificBefore=await page.evaluate(()=>JSON.stringify({root:state.parsedRoot,cloudRoot:state.cloud.speciesRoot,ages:[...state.cloud.datedAges].map(([root,ages])=>[root.id,[...ages].map(([node,age])=>[node.id,age])]),counts:state.cloud.phyPartsText}));
  const workBefore={workers,requests:computations.length};
  for(const orientation of ['horizontal','vertical','auto']){
   await page.evaluate(()=>openCladeNameDialog([...activeCladeState().cladeNames].find(([id,name])=>name==='Staphisagria')[0]));
   await page.locator(`#clade-orientation-${orientation}`).check();await page.locator('#save-clade-name').click();await settleFigure(page);
   const currentConfig=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
   assert.equal(currentConfig.clades.find(c=>c.name==='Staphisagria').label_orientation,orientation);
   assert.equal(await page.evaluate(()=>JSON.stringify({root:state.parsedRoot,cloudRoot:state.cloud.speciesRoot,ages:[...state.cloud.datedAges].map(([root,ages])=>[root.id,[...ages].map(([node,age])=>[node.id,age])]),counts:state.cloud.phyPartsText})),scientificBefore);
  }
  assert.deepEqual({workers,requests:computations.length},workBefore,'orientation controls must not start input/science workers or native analysis');
  const web=await page.evaluate(()=>serializeRenderedSvg());assert.equal(await canonical(web),await canonical(remotes.get(workspace)));
  await page.evaluate(async()=>{const figure=await PhyloRenderAgent.exportConfiguration();await PhyloRenderAgent.loadFigure(figure);});
  assert.equal(await canonical(web),await canonical(await page.evaluate(()=>serializeRenderedSvg())),'automatic orientation survives roundtrip');
  await assert.rejects(page.evaluate(s=>PhyloRenderAgent.loadFigure(s),{...spec,main_tree:{name:'invalid.nwk',content:tree.replace('A_alpha:10','A_alpha:-10')}}));
  assert.equal(await canonical(web),await canonical(await page.evaluate(()=>serializeRenderedSvg())),'failed import retains automatic layout and previous SVG');
  assert.ok((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).clades.every(c=>c.label_orientation==='auto'));
  if(evidence){const render=await runtime.renderer.render(spec,{formats:['svg','png']});assert.equal(await canonical(render.svg),await canonical(web));await writeFile(path.join(evidence,`${workspace}.svg`),web);await writeFile(path.join(evidence,`${workspace}.png`),render.png);}
  if(baseline){
   for(const orientation of ['horizontal','vertical']){
    const manual={...spec,clades:clades.map(c=>({...c,label_orientation:orientation}))};await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),manual);const current=await page.evaluate(()=>serializeRenderedSvg());
    const oldPage=await runtime.renderer.browser.newPage(),oldSource=await readFile(baseline,'utf8');
    await oldPage.route('**/app.js*',route=>route.fulfill({contentType:'application/javascript',body:oldSource}));
    await oldPage.goto(runtime.renderer.agentPageUrl);await oldPage.evaluate(()=>PhyloRenderAgent.ready());await oldPage.evaluate(s=>PhyloRenderAgent.loadFigure(s),manual);
    const old=await oldPage.evaluate(()=>serializeRenderedSvg());assert.equal(await canonical(old),await canonical(current),'manual SVG must match the pre-extraction baseline exactly');
    // Compare actual export pixels through the production software rasterizer,
    // independent of editor zoom, hover state and GPU screenshot compositing.
    const raster=(host,svg)=>host.evaluate(async text=>Array.from(new Uint8Array(await (await svgTextToPngBlob(text,1)).arrayBuffer())),svg);
    const oldPng=Buffer.from(await raster(oldPage,old)),currentPng=Buffer.from(await raster(page,current));
    if(evidence){await writeFile(path.join(evidence,`${workspace}-${orientation}-baseline.png`),oldPng);await writeFile(path.join(evidence,`${workspace}-${orientation}-current.png`),currentPng);}
    assert.deepEqual(await pixelHash(currentPng),await pixelHash(oldPng),`${workspace}/${orientation}: exported layout pixels must match the old implementation`);
    assert.deepEqual(currentPng,oldPng,`${workspace}/${orientation}: production PNG export must also be byte-identical`);
    await oldPage.close();
   }
  }
  receipts.push({workspace,groups:a.groups,gap:a.gap,roundtrip:true,gui_mcp_equal:true,orientation_controls_science_unchanged:true,manual_svg_png_baseline_equal:!!baseline});
 }
 assert.deepEqual(errors,[]);if(evidence)await writeFile(path.join(evidence,'receipt.json'),JSON.stringify(receipts,null,2));
}finally{
 await page?.close();await client.close();await transport.close();
 if(runtime){for(const context of runtime.renderer.browser.contexts())await context.close();await runtime.close();}
 await rm(store,{recursive:true,force:true});
}
console.log('CLADE_AUTO_LAYOUT_PASSED: rotated aligned groups, staggered titles, nearby whitespace, no sample/title overlaps, configuration roundtrip and exact GUI/MCP SVG');
