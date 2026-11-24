import assert from 'node:assert/strict';
import contract from '../../figure-contract.js';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime,MCP_ROOT} from '../src/runtime.mjs';
const evidence=process.argv[2],baseline=process.env.PHYLORENDER_TIP_WIDTH_BASELINE;
const directory=await mkdtemp(path.join(os.tmpdir(),'phylorender-tip-width-'));
const long='Aconitum_sachalinense_subsp_yezoense_2024ZS007632_SPECIMEN_1234567890_1';
const names=[long,'Delphinium_caeruleum_2023080906_1','A_alpha','B_beta','O_out'];
const tree=n=>`(${n[4]}:4,((${n[0]}:1,${n[1]}:1):1,(${n[2]}:1,${n[3]}:1):1):2);`;
const spec=(workspace,n=names)=>({workspace,main_tree:{name:'tips.nwk',content:tree(n)},
 ...(workspace==='conflict'?{comparison_tree:{name:'comparison.nwk',content:tree(n)}}:{}),
 ...(workspace==='cloud'?{phyparts_table:{name:'counts.tsv',content:`Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\t${n[0]};${n[1]}\n`}}:{}),
 ...(workspace!=='conflict'?{clades:[{name:'Test group',color:'#009E73',mrca_of:[n[0],n[1]]}]}:{}),
 options:{...(workspace==='phylogeny'?{support:{scale:'percent'}}:{}),
 ...(workspace==='time'?{time:{source_unit:'mya',age_source:'branch_lengths'}}:{}),
 ...(workspace==='cloud'?{cloud:{species_method:'dated',dated_unit:'mya',dated_age_source:'branch_lengths',show_gene:false}}:{})}});
const client=new Client({name:'tip-width-cap',version:'1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],env:{...process.env,PHYLORENDER_OUTPUT_ROOT:directory},stderr:'pipe'});
transport.stderr?.on('data',()=>{});let runtime,page;
try {
 await client.connect(transport);const remotes=new Map();
 for(const workspace of ['phylogeny','time','cloud','conflict']) {
  const r=await client.callTool({name:'create_figure',arguments:spec(workspace)},undefined,{timeout:240000});assert.ok(!r.isError,JSON.stringify(r.content));
  const uri=r.content.find(c=>c.type==='resource_link'&&c.name==='figure.svg').uri;
  remotes.set(workspace,(await client.readResource({uri})).contents[0].text);
 }
 await client.close();await transport.close();
 runtime=await createRuntime();page=await runtime.renderer.browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
 const canonical=svg=>page.evaluate(text=>{const d=new DOMParser().parseFromString(text,'image/svg+xml');d.querySelectorAll('metadata#phylorender-build').forEach(n=>n.remove());
  const walk=n=>n.nodeType===1?{tag:n.tagName,attrs:[...n.attributes].map(a=>[a.name,a.value]).sort(),children:[...n.childNodes].map(walk)}:{type:n.nodeType,text:n.textContent};return JSON.stringify(walk(d.documentElement));},svg);
 const records=[];if(evidence)await mkdir(evidence,{recursive:true});
 for(const workspace of ['phylogeny','time','cloud','conflict']) {
  await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec(workspace));
  const audit=await page.evaluate(()=>PhyloRenderCanvasFinalizer.runAtCanonicalScale(document.querySelector('#tree-svg'),()=>{
   const svg=document.querySelector('#tree-svg'),width=svg.viewBox.baseVal.width;
   const labels=[...svg.querySelectorAll('.tip-label,.cloud-tip-label,.conflict-tip-label')];
   return {width,labels:labels.map(n=>{
    const box=n.getBBox(),adjusted=n.getAttribute('textLength'),adjust=n.getAttribute('lengthAdjust');
    const text=n.textContent,runs=n.innerHTML,x=n.getAttribute('x'),y=n.getAttribute('y'),anchor=n.getAttribute('text-anchor');
    if(adjusted!==null){n.removeAttribute('textLength');n.removeAttribute('lengthAdjust');}
    const natural=n.getBBox();if(adjusted!==null){n.setAttribute('textLength',adjusted);n.setAttribute('lengthAdjust',adjust);}
    return {text,runs,x,y,anchor,width:box.width,height:box.height,naturalWidth:natural.width,naturalHeight:natural.height,adjusted,
     scale:n.getAttribute('data-tip-horizontal-scale'),original:n.getAttribute('data-original-tip-label')};
   })};
  }));
  assert.ok(audit.labels.some(n=>n.adjusted!==null));
  const maximumWidth=contract.maximumTipLabelWidth(audit.labels.map(n=>n.naturalWidth));
  if(evidence)await writeFile(path.join(evidence,`${workspace}-width-audit.json`),JSON.stringify({maximumWidth,...audit},null,2));
  for(const n of audit.labels) {
   assert.ok(n.width<=maximumWidth+.01,`${workspace}: ${n.text} width ${n.width}`);
   assert.equal(n.height,n.naturalHeight,'horizontal compression must preserve exact glyph height');
   if(n.naturalWidth>maximumWidth){assert.ok(Math.abs(n.width-maximumWidth)<.01,`${workspace}: ${n.text}; fitted=${n.width}, natural=${n.naturalWidth}, cap=${maximumWidth}`);assert.ok(Number(n.scale)<1);}
   else {assert.equal(n.adjusted,null);assert.equal(n.width,n.naturalWidth);}
   assert.ok(n.original);assert.ok(n.text.includes('2023080906_1')||!n.original.includes('2023080906_1'),'specimen underscores retained');
  }
  if(workspace==='time') {
   const reserves=await page.evaluate(()=>PhyloRenderCanvasFinalizer.runAtCanonicalScale(document.querySelector('#tree-svg'),()=>{
    const copy=structuredClone(state.root),rename=n=>{n.id='probe-'+n.id;n.children.forEach(rename);};rename(copy);
    const expected=Math.max(...[...document.querySelectorAll('#tree-svg .tip-label')].map(n=>{
     const b=n.getBBox();return b.x-Number(n.getAttribute('x'))+b.width;
    }));
    return Array.from({length:20},(_,i)=>({actual:estimateRightContentReserve(copy,30,0,{tipOffset:0,padding:i/20}),expected:Math.ceil(expected+i/20)}));
   }));
   assert.ok(reserves.every(r=>r.actual===r.expected),'preflight reserve must use actual fitted SVG glyphs, including italic bearings');
  }
  const web=await page.evaluate(()=>serializeRenderedSvg());assert.equal(await canonical(web),await canonical(remotes.get(workspace)));
  const config=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),config);
  assert.equal(await canonical(web),await canonical(await page.evaluate(()=>serializeRenderedSvg())),'roundtrip must preserve width fitting');
  await assert.rejects(page.evaluate(s=>PhyloRenderAgent.loadFigure(s),{...spec(workspace),main_tree:{name:'bad.nwk',content:tree(names).replace(`${long}:1`,`${long}:-1`)}}));
  assert.equal(await canonical(web),await canonical(await page.evaluate(()=>serializeRenderedSvg())),'failed import retains previous SVG');
  if(evidence){await writeFile(path.join(evidence,`${workspace}.svg`),web);const rendered=await runtime.renderer.render(spec(workspace),{formats:['svg','png']});await writeFile(path.join(evidence,`${workspace}.png`),rendered.png);}
  // Preserve the former short-baseline input. Some of its varied short names
  // now exceed their own median limit, so test the new contract rather than
  // demanding equality with an old fixed-canvas rule.
  const previousShort=['A_alpha','B_beta','C_gamma','D_delta','O_out'];
  await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec(workspace,previousShort));
  const previous=await page.evaluate(()=>PhyloRenderCanvasFinalizer.runAtCanonicalScale(document.querySelector('#tree-svg'),()=>
   [...document.querySelectorAll('.tip-label,.cloud-tip-label,.conflict-tip-label')].map(n=>({
    original:n.dataset.originalTipLabel,width:n.getBBox().width,natural:Number(n.dataset.tipNaturalWidth)||n.getBBox().width,fitted:n.hasAttribute('textLength')}))));
  const previousLimit=contract.maximumTipLabelWidth(previous.map(n=>n.natural));
  assert.ok(previous.every(n=>previousShort.includes(n.original)&&n.width<=previousLimit+.01&&n.fitted===(n.natural>previousLimit)));
  if(baseline) {
   const short=spec(workspace,['A_alpha','B_alpha','C_alpha','D_alpha','O_alpha']);await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),short);const current=await page.evaluate(()=>serializeRenderedSvg());
   const oldPage=await runtime.renderer.browser.newPage();
   for(const file of ['app.js','figure-contract.js','render/tip-width.js','render/time-tree.js','render/cloud-tree.js','render/conflict-tree.js']) {
    const text=await readFile(path.join(baseline,file),'utf8');await oldPage.route(`**/${file}*`,route=>route.fulfill({contentType:'application/javascript',body:text}));
   }
   await oldPage.goto(runtime.renderer.agentPageUrl);await oldPage.evaluate(()=>PhyloRenderAgent.ready());await oldPage.evaluate(s=>PhyloRenderAgent.loadFigure(s),short);
   const old=await oldPage.evaluate(()=>serializeRenderedSvg());assert.equal(await canonical(current),await canonical(old),'short-name SVG must remain exactly unchanged');
   const png=(host,svg)=>host.evaluate(async text=>Array.from(new Uint8Array(await (await svgTextToPngBlob(text,1)).arrayBuffer())),svg);
   const a=Buffer.from(await png(page,current)),b=Buffer.from(await png(oldPage,old));assert.deepEqual(a,b,'short-name production PNG must remain byte-identical');
   if(evidence){await writeFile(path.join(evidence,`${workspace}-short-before.png`),b);await writeFile(path.join(evidence,`${workspace}-short-after.png`),a);}
   await oldPage.close();
  }
  records.push({workspace,width:audit.width,labels:audit.labels,web_mcp_exact:true,roundtrip:true,rollback:true,short_baseline_exact:!!baseline});console.log('TIP_WIDTH_CASE_PASSED: '+workspace);
 }
 assert.deepEqual(errors,[]);if(evidence)await writeFile(path.join(evidence,'receipt.json'),JSON.stringify(records,null,2));
} finally {
 await page?.close();await client.close();await transport.close();if(runtime){for(const c of runtime.renderer.browser.contexts())await c.close();await runtime.close();}
 await rm(directory,{recursive:true,force:true});
}
console.log('TIP_WIDTH_CAP_PASSED');
