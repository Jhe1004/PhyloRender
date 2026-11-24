import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
// Focused regression: actual GUI upload -> exported configuration -> real MCP
// protocol. Only build metadata is excluded from the SVG comparison.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime, MCP_ROOT} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const output = process.env.PHYLORENDER_TEST_OUTPUT;
if (output) await mkdir(output, {recursive:true});
const store = await mkdtemp(path.join(os.tmpdir(), 'phylorender-row-parity-'));
const runtime = await createRuntime();
const client = new Client({name:'cloud-row-parity', version:'1.0.0'});
const transport = new StdioClientTransport({command:process.execPath,
  args:[path.join(MCP_ROOT,'src/stdio.mjs')], env:{...process.env,PHYLORENDER_OUTPUT_ROOT:store},stderr:'pipe'});
const species = '(O:10,(A:6,((B:0.44,(C:0.24,D:0.24):0.2):2.07,((E:0.33,F:0.33):0.11,(G:0.33,H:0.33):0.11):2.07):3.49):4);';
const gene = '(O:10,((A:3.59,((B:0.4,C:0.4):0.04,D:0.44):3.15):2.41,((E:0.33,F:0.33):0.11,(G:0.33,H:0.33):0.11):5.56):4);';
const upload = (name, content) => ({name,mimeType:'text/plain',buffer:Buffer.from(content)});
const results=[], errors=[], analysisRequests=[];
const sha = text => createHash('sha256').update(text).digest('hex');
try {
  await client.connect(transport);
  const page = await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {if (request.method()==='POST' && /\/api\/cloud-(date|phyparts)\/jobs$/.test(request.url())) analysisRequests.push(request.url());});
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => PhyloRenderAgent.ready());
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.evaluate(() => {
    $('cloud-show-gene').checked=true; $('cloud-species-method').value='dated';
    $('cloud-dated-unit').value='mya'; $('cloud-genes-method').value='ml';
  });
  await page.locator('#cloud-species-file').setInputFiles(upload('species-dated.tree', species));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:240000});
  await page.locator('#cloud-genes-file').setInputFiles(upload('all-genes.trees', species+'\n'+gene));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:240000});
  await page.waitForFunction(() => state.cloud.geneRoots.length===2 && state.cloud.phyPartsTable && !activeTreeLoad,null,{timeout:240000});
  const requestsBefore = analysisRequests.length;
  const fingerprint = () => page.evaluate(() => {
    const c=state.cloud;
    return JSON.stringify({trees:[c.speciesRoot,...c.geneRoots].map(root=>[root,[...c.datedAges.get(root)].map(([n,age])=>[n.id,age])]),statistics:[...c.phyPartsTable.rows]});
  });
  const scientific = await fingerprint();
  const canonical = text => page.evaluate(source => {
    const doc=new DOMParser().parseFromString(source,'image/svg+xml');
    assertSvg(doc);
    function assertSvg(d){if(d.querySelector('parsererror'))throw new Error('SVG_PARSE_FAILED');}
    doc.querySelectorAll('metadata').forEach(node=>node.remove());
    const visit=node=>node.nodeType===1?{tag:node.tagName,
      attributes:Object.fromEntries([...node.attributes].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value])),
      children:[...node.childNodes].map(visit)}:{type:node.nodeType,text:node.textContent};
    return JSON.stringify(visit(doc.documentElement));
  },text);
  // The GUI intentionally forces triangular species branches during a gene
  // overlay. Exercise actual distinct controls instead of labelling a disabled
  // rectangular setting as if that geometry were visible.
  for (const direction of ['file','small-top','large-top']) for (const sizePx of [16,24]) {
    const name=direction+'-'+(sizePx*.75)+'pt';
    await page.evaluate(async ({direction,sizePx})=>{
      $('cloud-ladder-direction').value=direction;
      syncNumericControl(NUMERIC_SETTING_CONTROLS.find(item=>item.rangeId==='tip-font-size'),sizePx,{render:false});
      await renderCloudTree(); await ensureFigureFontsReady();
    },{direction,sizePx});
    await settleFigure(page);
    const audit=await page.evaluate(()=>{
      const c=state.cloud, svg=$('tree-svg'), reference=new Map();
      for(const [node,clade] of PhyloRenderCloud.nodeClades(c.speciesRoot)) {
        const hit=svg.querySelector(`.clade-node-hit[data-clade-node-id="${node.id}"]`);
        if(!hit)throw new Error('SPECIES_NODE_HIT_MISSING');
        reference.set(clade.key,Number(hit.getAttribute('cy')));
      }
      const paths=[...svg.querySelectorAll('.cloud-gene-lines>path')];let index=0,comparisons=0,maximum=0;
      for(const root of c.geneRoots){const clades=PhyloRenderCloud.nodeClades(root);
        (function visit(node){for(const child of node.children){
          const xy=paths[index++].getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
          for(const [endpoint,y]of [[node,xy[1]],[child,xy[3]]]){
            const key=clades.get(endpoint)?.key;if(key&&reference.has(key)){comparisons++;maximum=Math.max(maximum,Math.abs(y-reference.get(key)));}
          }visit(child);
        }})(root);
      }
      return{comparisons,maximum,paths:paths.length,consumed:index,workers:PhyloRenderInputTasks.activeCount,native:PhyloRenderNativeClient.activeCount};
    });
    assert.ok(audit.comparisons>0);assert.equal(audit.maximum,0);assert.equal(audit.paths,audit.consumed);
    assert.equal(audit.workers,0);assert.equal(audit.native,0);
    const spec=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    equalU(spec.options.typography.tips.size_u,units.designToDrawing(sizePx),'The exported configuration must contain the actual distinct font size');
    const web=await page.evaluate(()=>serializeRenderedSvg());
    const created=await client.callTool({name:'create_figure',arguments:spec},undefined,{timeout:240000});
    assert.ok(!created.isError,JSON.stringify(created.content));
    const link=created.content.find(item=>item.type==='resource_link'&&item.name==='figure.svg');assert.ok(link);
    const remote=(await client.readResource({uri:link.uri})).contents[0].text;
    const a=await canonical(web),b=await canonical(remote);
    if(output){await writeFile(path.join(output,name+'-web.svg'),web);await writeFile(path.join(output,name+'-mcp.svg'),remote);}
    if(a!==b&&output){let i=0;while(a[i]===b[i]&&i<Math.min(a.length,b.length))i++;await writeFile(path.join(output,name+'-difference.json'),JSON.stringify({index:i,web:a.slice(i,i+1000),mcp:b.slice(i,i+1000)},null,2));}
    assert.equal(sha(a),sha(b),name+': complete SVG, including all data attributes, must match');
    assert.equal(created.structuredContent.report.topology_unchanged,true);
    assert.equal(await fingerprint(),scientific);
    results.push({name,...audit,exact_svg:true,canonical_sha256:sha(a)});
  }
  assert.equal(analysisRequests.length,requestsBefore,'Display changes must not start a new GUI science job');
  assert.deepEqual(errors,[]);
  if(output)await writeFile(path.join(output,'results.json'),JSON.stringify({passed:true,ignored:['SVG metadata only'],results,scientific_state_unchanged:true,no_new_gui_analysis:true,errors},null,2));
  console.log('CLOUD_ROW_WEB_MCP_PARITY_PASSED');
} finally {await client.close().catch(()=>{});await runtime.close();await rm(store,{recursive:true,force:true});}
