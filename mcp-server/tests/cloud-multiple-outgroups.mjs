import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime,MCP_ROOT} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const evidence=process.argv[2],store=await mkdtemp(path.join(os.tmpdir(),'phylorender-multi-outgroups-'));
const runtime=await createRuntime(),client=new Client({name:'multi-outgroups-test',version:'1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],
  env:{...process.env,PHYLORENDER_OUTPUT_ROOT:store},stderr:'pipe'});
const species='((O1:1,O2:1):2,((A:1,B:1):1,C:2):1);';
const genes='(A:1,B:1,(C:2,(O1:1,O2:1)91:1)82:1);\n(O1:3,(A:1,C:1)80:2);\n((O1:1,A:1)90:1,(O2:1,(B:1,C:1)80:1)70:1);';
const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
try{
  await client.connect(transport);
  const page=await runtime.renderer.browser.newPage({viewport:{width:1800,height:1100}}),errors=[],dates=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/cloud-date/jobs'))dates.push(r.postDataJSON());});
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>PhyloRenderAgent.ready());
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.evaluate(()=>{$('cloud-species-method').value='dated';$('cloud-dated-unit').value='mya';
    $('cloud-dated-age-source').value='branch_lengths';$('cloud-genes-method').value='ml';$('cloud-phyparts-scale').value='percent';});
  await page.locator('#cloud-species-file').setInputFiles(file('species.tree',species));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:180000});
  const before=await page.evaluate(()=>JSON.stringify({root:state.cloud.speciesRoot,ages:[...state.cloud.datedAges.get(state.cloud.speciesRoot)]}));
  await page.getByRole('button',{name:'导入',exact:true}).click();
  await page.evaluate(()=>{let el=$('cloud-phyparts-outgroups');while(el){if(el.tagName==='DETAILS')el.open=true;el=el.parentElement;}});
  await page.locator('#cloud-phyparts-outgroups').fill('O1\nO2');
  await page.locator('#cloud-phyparts-outgroups').dispatchEvent('change');
  await settleFigure(page);
  await page.locator('#cloud-genes-file').setInputFiles(file('genes.trees',genes));
  await page.waitForFunction(()=>!activeTreeLoad,null,{timeout:180000});
  await settleFigure(page);
  const stateReport=await page.evaluate(()=>({age:state.cloud.datedRootAge,genes:state.cloud.geneRoots.length,
    audit:state.cloud.geneAudit,stats:state.cloud.phyPartsMeta,root:JSON.stringify({root:state.cloud.speciesRoot,ages:[...state.cloud.datedAges.get(state.cloud.speciesRoot)]})}));
  assert.equal(stateReport.root,before);assert.equal(stateReport.age,3);assert.equal(stateReport.genes,1);
  assert.equal(stateReport.audit.total,3);assert.equal(stateReport.audit.stats.accepted,2);
  assert.equal(stateReport.audit.stats.unrootable,1);assert.equal(stateReport.stats.mode,'four');
  assert.equal(dates.length,1);assert.equal(dates[0].trees.length,1,'species tree must never be dated again');
  await page.waitForFunction(()=>PhyloRenderNativeClient.activeCount===0);
  await page.evaluate(async()=>{await refreshTaxonNameRecognition({force:true,deferRender:true});await ensureFigureFontsReady();await renderTree();});
  await settleFigure(page);
  const spec=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  assert.deepEqual(spec.options.cloud.phyparts_outgroups,['O1','O2']);
  const web=await page.evaluate(()=>serializeRenderedSvg());
  const canonical=source=>page.evaluate(text=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');
    assertParse(doc);function assertParse(d){if(d.querySelector('parsererror'))throw Error('SVG_PARSE_FAILED');}
    doc.querySelectorAll('metadata#phylorender-build').forEach(n=>n.remove());
    const walk=n=>n.nodeType===1?{tag:n.tagName,attributes:[...n.attributes].map(a=>[a.name,a.value]).sort(),children:[...n.childNodes].map(walk)}:{type:n.nodeType,text:n.textContent};
    return JSON.stringify(walk(doc.documentElement));
  },source);
  const created=await client.callTool({name:'create_figure',arguments:spec},undefined,{timeout:240000});
  assert.ok(!created.isError,JSON.stringify(created.content));
  const link=created.content.find(c=>c.type==='resource_link'&&c.name==='figure.svg');assert.ok(link);
  const remote=(await client.readResource({uri:link.uri})).contents[0].text;
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,'web.svg'),web);await writeFile(path.join(evidence,'mcp.svg'),remote);}
  assert.equal(await canonical(web),await canonical(remote),'GUI and MCP must retain identical scientific metadata and geometry');
  const retained=await page.evaluate(()=>JSON.stringify(PhyloRenderAgent.exportConfiguration()));
  await assert.rejects(page.evaluate(input=>PhyloRenderAgent.loadFigure(input),{...spec,options:{...spec.options,
    cloud:{...spec.options.cloud,phyparts_outgroups:['O1','A']}}}),/现有二分根/);
  assert.equal(await page.evaluate(()=>JSON.stringify(PhyloRenderAgent.exportConfiguration())),retained,'failed selection restores every model and control');
  assert.equal(await canonical(await page.evaluate(()=>serializeRenderedSvg())),await canonical(web));
  if(evidence){
    const rendered=await runtime.renderer.render(spec,{formats:['svg','png']});
    assert.equal(await canonical(rendered.svg),await canonical(web));
    await writeFile(path.join(evidence,'mcp.png'),rendered.png);
    await writeFile(path.join(evidence,'report.json'),JSON.stringify({stateReport,report:rendered.report},null,2));
  }
  assert.deepEqual(errors,[]);console.log('CLOUD_MULTIPLE_OUTGROUPS_PASSED: GUI, MCP, native alignment, full statistics and rollback');
}finally{await client.close();await transport.close();await runtime.close();await rm(store,{recursive:true,force:true});}
