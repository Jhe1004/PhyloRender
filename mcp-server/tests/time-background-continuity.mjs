import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime,MCP_ROOT} from '../src/runtime.mjs';
const evidence=process.argv[2],baseline=process.env.PHYLORENDER_GAP_BASELINE;
const store=await mkdtemp(path.join(os.tmpdir(),'phylorender-geology-gap-'));
const runtime=await createRuntime(),client=new Client({name:'geology-continuity',version:'1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],env:{...process.env,PHYLORENDER_OUTPUT_ROOT:store},stderr:'pipe'});
transport.stderr?.on('data',()=>{});
let page;
const tree='(O:85,((A_alpha:30,B_beta:30):25,(C_gamma:10,D_delta:10):45):30);';
const table='Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA_alpha;B_beta\nN2\t5\t2\t1\t2\tC_gamma;D_delta\nN3\t4\t3\t1\t2\tA_alpha;B_beta;C_gamma;D_delta\n';
try{
 await client.connect(transport);
 page=await runtime.renderer.browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
 const canonical=(svg,omitFillHeight=false)=>page.evaluate(({svg,omitFillHeight})=>{
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('SVG_PARSE_FAILED');
  doc.querySelectorAll('metadata#phylorender-build').forEach(n=>n.remove());
  if(omitFillHeight)doc.querySelectorAll('rect.time-background').forEach(n=>n.removeAttribute('height'));
  const walk=n=>n.nodeType===1?{tag:n.tagName,attributes:[...n.attributes].map(a=>[a.name,a.value]).sort(),children:[...n.childNodes].map(walk)}:{type:n.nodeType,text:n.textContent};
  return JSON.stringify(walk(doc.documentElement));
 },{svg,omitFillHeight});
 const receipts=[];
 for(const workspace of ['time','cloud']){
  const spec={workspace,main_tree:{name:'dated.nwk',content:tree},options:{time:{geology:'standard',...(workspace==='time'?{source_unit:'mya'}:{})}},
   ...(workspace==='cloud'?{phyparts_table:{name:'counts.tsv',content:table}}:{})};
  if(workspace==='cloud')spec.options.cloud={species_method:'dated',dated_unit:'mya',dated_age_source:'branch_lengths',show_gene:false,show_time_axis:true,pie_mode:'four'};
  await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec);
  const geometry=await page.evaluate(()=>{
   const row=document.querySelector('.time-geo-frame[data-row="period-bottom"]');
   return {rowY:Number(row.getAttribute('y')),fills:[...document.querySelectorAll('rect.time-background')].map(n=>({y:Number(n.getAttribute('y')),height:Number(n.getAttribute('height'))}))};
  });
  assert.ok(geometry.fills.length>0);
  assert.ok(geometry.fills.every(r=>Math.abs(r.y+r.height-geometry.rowY)<1e-8),'all period fills meet the bottom row exactly');
  const web=await page.evaluate(()=>serializeRenderedSvg());
  const result=await client.callTool({name:'create_figure',arguments:spec},undefined,{timeout:240000});assert.ok(!result.isError,JSON.stringify(result.content));
  const link=result.content.find(c=>c.type==='resource_link'&&c.name==='figure.svg');assert.ok(link);
  const remote=(await client.readResource({uri:link.uri})).contents[0].text;
  assert.equal(await canonical(web),await canonical(remote),'GUI and MCP SVG differ');
  if(baseline){
   if(evidence)await mkdir(evidence,{recursive:true});
   const oldPage=await runtime.renderer.browser.newPage();
   const oldSource=await readFile(baseline,'utf8');
   await oldPage.route('**/render/time-background.js*',route=>route.fulfill({contentType:'application/javascript',body:oldSource}));
   await oldPage.goto(runtime.renderer.agentPageUrl);await oldPage.evaluate(()=>PhyloRenderAgent.ready());
   await oldPage.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec);
   const old=await oldPage.evaluate(()=>serializeRenderedSvg());
   assert.equal(await canonical(old,true),await canonical(web,true),'only the declared background fill heights may change from baseline');
   if(evidence)await writeFile(path.join(evidence,`${workspace}-before.svg`),old);
   await oldPage.close();
  }
  if(evidence){
   await mkdir(evidence,{recursive:true});const rendered=await runtime.renderer.render(spec,{formats:['svg','png']});
   assert.equal(await canonical(web),await canonical(rendered.svg));
   await writeFile(path.join(evidence,`${workspace}-web.svg`),web);await writeFile(path.join(evidence,`${workspace}-mcp.svg`),remote);await writeFile(path.join(evidence,`${workspace}.png`),rendered.png);
  }
  receipts.push({workspace,geometry,gui_mcp_equal:true,baseline_only_fill_height_changed:!!baseline});
 }
 assert.deepEqual(errors,[]);if(evidence)await writeFile(path.join(evidence,'receipt.json'),JSON.stringify(receipts,null,2));
}finally{
 console.log('CONTINUITY_CLEANUP: page');await page?.close();
 console.log('CONTINUITY_CLEANUP: client');await client.close();await transport.close();
 console.log('CONTINUITY_CLEANUP: runtime');await runtime.close();
 await rm(store,{recursive:true,force:true});console.log('CONTINUITY_CLEANUP_PASSED');
}

console.log('TIME_BACKGROUND_CONTINUITY_PASSED: Dating/cloud, zero vertical gap, exact GUI/MCP SVG and unchanged baseline geometry');
