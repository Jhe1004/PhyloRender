import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime,MCP_ROOT} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const evidence=process.argv[2],store=await mkdtemp(path.join(os.tmpdir(),'phylorender-partial-candidates-'));
const runtime=await createRuntime(),client=new Client({name:'partial-candidates-test',version:'1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],
  env:{...process.env,PHYLORENDER_OUTPUT_ROOT:store},stderr:'pipe'});
const species='(O:3,((A:1,B:1):1,(C:1,(D:0.5,E:0.5):0.5):1):1);';
const genes=['(O:1,(((A:1,C:1):1,B:1):1,D:1):1);',
  '(O:1,(((A:1,C:1):1,B:1):1,E:1):1);',
  '(O:1,(((A:1,C:1):1,B:1):1,(D:1,E:1):1):1);',
  '(O:1,(((A:1,D:1):1,B:1):1,(C:1,E:1):1):1);'].join('\n');
const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
try{
  await client.connect(transport);
  const page=await runtime.renderer.browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
  // A stale automatic demo must fail before changing the document or controls.
  const emptyState=()=>page.evaluate(()=>JSON.stringify({mode:state.workspaceMode,root:state.root,cloud:state.cloud,
    controls:[...document.querySelectorAll('input,select,textarea')].map(el=>[el.id,el.value,el.checked])}));
  const empty=await emptyState();
  await assert.rejects(page.evaluate(async()=>{
    const old=globalThis.PhyloRenderLocalCloudExample;
    try{globalThis.PhyloRenderLocalCloudExample={phyPartsMeta:{algorithm:'phylorender-conflict-statistics-v1'}};
      await loadDefaultCloudWorkspace();}finally{globalThis.PhyloRenderLocalCloudExample=old;}
  }),/outdated|版本已过期/i);
  assert.equal(await emptyState(),empty);
  await page.evaluate(()=>{
    const original=PhyloRenderInputTasks;globalThis.testScienceCalls=[];
    globalThis.PhyloRenderInputTasks={...original,run:(operation,...args)=>{
      testScienceCalls.push(operation);return original.run(operation,...args);
    }};
  });
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.evaluate(()=>{$('cloud-species-method').value='dated';$('cloud-dated-unit').value='mya';
    $('cloud-dated-age-source').value='branch_lengths';$('cloud-genes-method').value='ml';$('cloud-phyparts-scale').value='percent';});
  await page.locator('#cloud-species-file').setInputFiles(file('species.nwk',species));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:120000});
  await page.locator('#cloud-genes-file').setInputFiles(file('genes.trees',genes));
  await page.waitForFunction(()=>!activeTreeLoad,null,{timeout:180000});await settleFigure(page);
  assert.notEqual(await page.locator('#tree-loading').getAttribute('data-state'),'error',await page.locator('#tree-loading-detail').textContent());
  const counts=await page.evaluate(()=>({meta:state.cloud.phyPartsMeta,audit:state.cloud.geneAudit,
    row:[...state.cloud.phyPartsTable.rows.values()].find(r=>r.names.join(';')==='A;B')}));
  assert.equal(counts.meta.algorithm,'phylorender-conflict-statistics-v2');
  assert.equal(counts.meta.geneCount,4);assert.equal(counts.audit.accepted,2);
  assert.equal(counts.row.concordant,0);assert.equal(counts.row.dominant,3);
  assert.equal(counts.row.other,1);assert.equal(counts.row.conflict,4);assert.equal(counts.row.noSignal,0);
  const fingerprint=()=>page.evaluate(()=>JSON.stringify({species:state.cloud.speciesRoot,genes:state.cloud.geneRoots,
    ages:[...state.cloud.datedAges].map(([r,a])=>[r,[...a]]),table:state.cloud.phyPartsText,calls:testScienceCalls}));
  const before=await fingerprint();assert.equal(await page.locator('#cloud-pie-mode').inputValue(),'two');
  await page.locator('[data-settings-target="labels"]').click();
  await page.locator('#cloud-pie-settings-section').evaluate(el=>el.open=true);
  await page.locator('#cloud-pie-mode').selectOption('four');await settleFigure(page);
  assert.equal(await fingerprint(),before,'display switch must preserve science and not start a Worker');
  await page.waitForFunction(()=>PhyloRenderNativeClient.activeCount===0);
  await page.evaluate(async()=>{await refreshTaxonNameRecognition({force:true,deferRender:true});await ensureFigureFontsReady();await renderTree();});
  await settleFigure(page);
  const spec=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration()),web=await page.evaluate(()=>serializeRenderedSvg());
  const canonical=source=>page.evaluate(text=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');
    if(doc.querySelector('parsererror'))throw Error('SVG_PARSE_FAILED');
    doc.querySelectorAll('metadata#phylorender-build').forEach(n=>n.remove());
    const walk=n=>n.nodeType===1?{tag:n.tagName,attributes:[...n.attributes].map(a=>[a.name,a.value]).sort(),children:[...n.childNodes].map(walk)}:{type:n.nodeType,text:n.textContent};
    return JSON.stringify(walk(doc.documentElement));
  },source);
  const created=await client.callTool({name:'create_figure',arguments:spec},undefined,{timeout:240000});
  assert.ok(!created.isError,JSON.stringify(created.content));
  const link=created.content.find(c=>c.type==='resource_link'&&c.name==='figure.svg');assert.ok(link);
  const remote=(await client.readResource({uri:link.uri})).contents[0].text;
  assert.equal(await canonical(web),await canonical(remote),'all SVG science, text, font, layers and geometry must match');
  if(evidence){
    await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,'web.svg'),web);await writeFile(path.join(evidence,'mcp.svg'),remote);
    const rendered=await runtime.renderer.render(spec,{formats:['svg','png']});
    assert.equal(await canonical(rendered.svg),await canonical(web));await writeFile(path.join(evidence,'mcp.png'),rendered.png);
    await writeFile(path.join(evidence,'receipt.json'),JSON.stringify({counts,report:rendered.report,svg_equal:true},null,2));
  }
  assert.deepEqual(errors,[]);console.log('CLOUD_PARTIAL_CANDIDATES_PASSED: exact counts, stale cache rejection, GUI/MCP SVG parity, style-only Worker invariants');
}finally{await client.close();await transport.close();await runtime.close();await rm(store,{recursive:true,force:true});}
