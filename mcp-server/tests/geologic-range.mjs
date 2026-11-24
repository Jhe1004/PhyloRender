import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime,MCP_ROOT} from '../src/runtime.mjs';
const evidence=process.argv[2],baseline=process.env.PHYLORENDER_GEOLOGIC_BASELINE;
const cases=[150,250,500,1000,2500,4500,5000];
const tree=r=>`(O_out:${r},((A_alpha:${r/4},B_beta:${r/4})[&height_95%_HPD={${r/8},${r/3}}]:${r/4},(C_gamma:${r/4},D_delta:${r/4}):${r/4}):${r/2});`;
const spec=(workspace,r,geology='standard')=>({workspace,main_tree:{name:'synthetic-geologic-range.nwk',content:tree(r)},
 ...(workspace==='conflict'?{comparison_tree:{name:'comparison.nwk',content:tree(r)}}:{}),
 ...(workspace==='cloud'?{phyparts_table:{content:'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA_alpha;B_beta\n'}}:{}),
 options:{...(workspace==='phylogeny'?{support:{scale:'percent'}}:{}),
 ...(workspace==='time'?{time:{source_unit:'mya',age_source:'branch_lengths',geology}}:{}),
 ...(workspace==='cloud'?{time:{geology},cloud:{species_method:'dated',dated_unit:'mya',dated_age_source:'branch_lengths',show_gene:false,show_time_axis:true}}:{})}});
const directory=await mkdtemp(path.join(os.tmpdir(),'phylorender-geologic-range-'));
const client=new Client({name:'geologic-range',version:'1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],env:{...process.env,PHYLORENDER_OUTPUT_ROOT:directory},stderr:'pipe'});
transport.stderr?.on('data',()=>{});let runtime,page;
const remotes=new Map(),records=[];
try {
 if(evidence)await mkdir(evidence,{recursive:true});await client.connect(transport);
 for(const workspace of ['time','cloud'])for(const age of cases) {
  const result=await client.callTool({name:'create_figure',arguments:spec(workspace,age)},undefined,{timeout:240000});
  assert.ok(!result.isError,JSON.stringify(result.content));
  assert.equal(result.structuredContent.report.geological_timescale.version,'2026/06');
  const uri=result.content.find(c=>c.type==='resource_link'&&c.name==='figure.svg').uri;
  remotes.set(`${workspace}-${age}`,(await client.readResource({uri})).contents[0].text);
 }
 await client.close();await transport.close();
 runtime=await createRuntime();page=await runtime.renderer.browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
 const canonical=svg=>page.evaluate(text=>{
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');doc.querySelectorAll('metadata#phylorender-build').forEach(n=>n.remove());
  const walk=n=>n.nodeType===1?{tag:n.tagName,attrs:[...n.attributes].map(a=>[a.name,a.value]).sort(),children:[...n.childNodes].map(walk)}:{type:n.nodeType,text:n.textContent};
  return JSON.stringify(walk(doc.documentElement));
 },svg);
 for(const workspace of ['time','cloud'])for(const age of cases) {
  const input=spec(workspace,age),result=await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),input);
  assert.equal(result.report.topology_unchanged,true);assert.equal(result.report.geological_timescale.maximumMa,4567);
  const audit=await page.evaluate(()=>{
   const svg=document.querySelector('#tree-svg');
   const box=n=>{const b=n.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};};
   const blocks=[...svg.querySelectorAll('.time-geo-block')].map(n=>({...box(n),name:n.dataset.fullName,rank:n.dataset.geologicRank,y:Number(n.getAttribute('y'))}));
   return {blocks,fills:[...svg.querySelectorAll('.time-background')].map(box),
    rows:[...svg.querySelectorAll('.time-geo-frame')].map(box),
    labels:[...svg.querySelectorAll('.time-geo-label')].map(n=>({...box(n),name:n.dataset.fullName})),
    outside:blocks.filter(n=>n.rank==='unmapped'),
    sourceVersion:svg.querySelector('.time-geology').dataset.timescaleVersion,
    hpd:[...svg.querySelectorAll('.time-hpd')].map(n=>n.outerHTML),
   };
  });
  assert.equal(audit.sourceVersion,'2026/06');assert.equal(audit.rows.length,3);
  const left=audit.rows[0].x,right=left+audit.rows[0].width;
  for(const row of audit.rows)assert.ok(Math.abs(row.x-left)<.01&&Math.abs(row.x+row.width-right)<.01);
  const groups=[audit.fills,...[...new Set(audit.blocks.map(n=>n.y))].map(y=>audit.blocks.filter(n=>n.y===y))];
  for(const row of groups) {
   let edge=left;for(const b of row.slice().sort((a,b)=>a.x-b.x)){assert.ok(Math.abs(b.x-edge)<.02,`${workspace}/${age}: missing background coverage`);edge=b.x+b.width;}
   assert.ok(Math.abs(edge-right)<.02);
  }
  for(const label of audit.labels) {
   const block=audit.blocks.find(b=>b.name===label.name&&label.y>=b.y-.1&&label.y+label.height<=b.y+b.height+.1);
   assert.ok(block,`${label.name}: no owning cell`);
   assert.ok(label.x>=block.x-.1&&label.x+label.width<=block.x+block.width+.1,`${label.name}: crosses cell boundary`);
  }
  if(age===150)assert.ok(audit.blocks.some(n=>n.name==='Jurassic'));
  if(age===250)assert.ok(audit.blocks.some(n=>n.name==='Triassic'));
  if(age===5000)assert.ok(audit.outside.length>0);
  const web=await page.evaluate(()=>serializeRenderedSvg());assert.equal(await canonical(web),await canonical(remotes.get(`${workspace}-${age}`)));
  const config=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());assert.equal(config.main_tree.content,input.main_tree.content);
  await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),config);assert.equal(await canonical(web),await canonical(await page.evaluate(()=>serializeRenderedSvg())));
  if(evidence){await writeFile(path.join(evidence,`${workspace}-${age}.svg`),web);if([150,250,5000].includes(age)){
   const rendered=await runtime.renderer.render(input,{formats:['svg','png']});await writeFile(path.join(evidence,`${workspace}-${age}.png`),rendered.png);
  }}
  records.push({workspace,age,source_version:audit.sourceVersion,full_coverage:true,labels_inside_cells:true,web_mcp_exact:true,source_text_preserved:true,roundtrip:true});
  console.log(`GEOLOGIC_RANGE_PASSED ${workspace} ${age} Ma`);
 }
 if(baseline) {
  // Compare the extracted border painter against its frozen predecessor using
  // the same intervals: every SVG attribute and production PNG byte must match.
  const oldBackground=await readFile(path.join(baseline,'render/time-background.js'),'utf8');
  await page.addScriptTag({content:oldBackground.replace('root.PhyloRenderTimeBackground=api','root.BaselineTimeBackground=api')});
  const grids=await page.evaluate(()=>{
   const old=BaselineTimeBackground.create({svgEl,timeTextWidth:()=>0,niceTickStep:()=>1,display:timeDisplay});
   const fresh=PhyloRenderTimeBackground.create({svgEl,timeTextWidth:()=>0,niceTickStep:()=>1,display:timeDisplay,grid:PhyloRenderGeologicGrid});
   const blocks=[{x1:0,x2:80,interval:{younger:200}},{x1:80,x2:200,interval:{younger:143.1}},{x1:200,x2:600,interval:{younger:0}}];
   return [old,fresh].map(painter=>{const svg=svgEl('svg',{xmlns:'http://www.w3.org/2000/svg',width:600,height:60,viewBox:'0 0 600 60'});
    svg.append(svgEl('style',{},'.time-geo-frame{fill:none;stroke:#000;stroke-width:1}.time-geo-divider{stroke:#000;stroke-width:1}'));
    painter.appendGeologicGrid(svg,blocks,10,40,'test');return new XMLSerializer().serializeToString(svg);});
  });
  assert.equal(grids[0],grids[1]);
  const png=async (host,svg)=>Buffer.from(await host.evaluate(async text=>Array.from(new Uint8Array(await (await svgTextToPngBlob(text,1)).arrayBuffer())),svg));
  assert.deepEqual(await png(page,grids[0]),await png(page,grids[1]));
  for(const workspace of ['phylogeny','time','cloud','conflict']) {
   const input=spec(workspace,72,'none');await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),input);const current=await page.evaluate(()=>serializeRenderedSvg());
   const oldPage=await runtime.renderer.browser.newPage();
   for(const file of ['app.js','agent-bridge.js','core/time-display.js','render/time-background.js']){
    const body=await readFile(path.join(baseline,file),'utf8');await oldPage.route(`**/${file}*`,route=>route.fulfill({contentType:'application/javascript',body}));
   }
   await oldPage.goto(runtime.renderer.agentPageUrl);await oldPage.evaluate(()=>PhyloRenderAgent.ready());await oldPage.evaluate(s=>PhyloRenderAgent.loadFigure(s),input);
   const previous=await oldPage.evaluate(()=>serializeRenderedSvg());assert.equal(await canonical(current),await canonical(previous),`${workspace}: no-background SVG changed`);
   assert.deepEqual(await png(page,current),await png(oldPage,previous),`${workspace}: no-background PNG changed`);await oldPage.close();
   console.log('GEOLOGIC_BASELINE_EXACT '+workspace);
  }
 }
 assert.deepEqual(errors,[]);if(evidence)await writeFile(path.join(evidence,'receipt.json'),JSON.stringify(records,null,2));
}finally{await page?.close();await client.close();await transport.close();if(runtime){for(const context of runtime.renderer.browser.contexts())await context.close();await runtime.close();}await rm(directory,{recursive:true,force:true});}
console.log('GEOLOGIC_RANGE_MATRIX_PASSED');
