import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
// Actual GUI imports and slider changes, configuration transactions, and real
// MCP protocol. No SVG attribute is ignored except build metadata.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime,MCP_ROOT} from '../src/runtime.mjs';
import {figureSpecSchema} from '../src/schemas.mjs';
import {settleFigure} from './settle-figure.mjs';
const output=process.env.PHYLORENDER_TEST_OUTPUT;
if(output)await mkdir(output,{recursive:true});
const store=await mkdtemp(path.join(os.tmpdir(),'phylorender-jitter-'));
const runtime=await createRuntime(),client=new Client({name:'cloud-jitter',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],
  env:{...process.env,PHYLORENDER_OUTPUT_ROOT:store},stderr:'pipe'});
const species='(O:10,(A:6,((B:0.44,(C:0.24,D:0.24):0.2):2.07,((E:0.33,F:0.33):0.11,(G:0.33,H:0.33):0.11):2.07):3.49):4);';
const gene='(O:10,((A:3.59,((B:0.4,C:0.4):0.04,D:0.44):3.15):2.41,((E:0.33,F:0.33):0.11,(G:0.33,H:0.33):0.11):5.56):4);';
const upload=(name,content)=>({name,mimeType:'text/plain',buffer:Buffer.from(content)});
const hash=text=>createHash('sha256').update(text).digest('hex');
const results=[],errors=[],analysis=[];
try {
  await client.connect(transport);
  const page=await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&/\/api\/cloud-(date|phyparts)\/jobs$/.test(r.url()))analysis.push(r.url());});
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.evaluate(()=>{$('cloud-species-method').value='dated';$('cloud-dated-unit').value='mya';$('cloud-genes-method').value='ml';});
  await page.locator('#cloud-species-file').setInputFiles(upload('species.tree',species));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:240000});
  await page.locator('#cloud-genes-file').setInputFiles(upload('genes.trees',species+'\n'+gene));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:240000});
  await page.waitForFunction(()=>state.cloud.geneRoots.length===2&&!activeTreeLoad,null,{timeout:240000});
  const groupId=await page.evaluate(()=>[...PhyloRenderCloud.nodeClades(state.cloud.speciesRoot)]
    .find(([,clade])=>clade.key===PhyloRenderCloud.cladeKey(['E','F','G','H']))[0].id);
  await page.evaluate(id=>openCladeNameDialog(id),groupId);
  await page.locator('#clade-name-input').fill('Group 1');await page.locator('#save-clade-name').click();await settleFigure(page);
  await page.locator(`[data-clade-color-node-id="${groupId}"]`).evaluate(e=>{e.value='#0072b2';e.dispatchEvent(new Event('change',{bubbles:true}));});await settleFigure(page);
  await page.evaluate(async()=>{
    $('cloud-show-time-axis').checked=true;await renderCloudTree();
  });await settleFigure(page);
  // Actual file uploads do not populate the bridge's private configuration
  // cache. One initial configuration load is legitimate scientific work;
  // warm it explicitly before testing that subsequent display edits are free.
  const initialConfiguration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),initialConfiguration);await settleFigure(page);
  const requests=analysis.length;
  const science=()=>page.evaluate(()=>{
    const c=state.cloud;
    return JSON.stringify({trees:[c.speciesRoot,...c.geneRoots],ages:[...c.datedAges].map(([r,a])=>[r.id,[...a].map(([n,v])=>[n.id,v])]),counts:[...c.phyPartsTable.rows]});
  });
  const originalScience=await science();
  const canonical=(source,withoutCloud=false)=>page.evaluate(({source,withoutCloud})=>{
    const doc=new DOMParser().parseFromString(source,'image/svg+xml');
    if(doc.querySelector('parsererror'))throw Error('Bad SVG');
    doc.querySelectorAll('metadata').forEach(n=>n.remove());
    if(withoutCloud)doc.querySelector('.cloud-gene-lines')?.remove();
    const visit=n=>n.nodeType===1?{tag:n.tagName,attrs:Object.fromEntries([...n.attributes].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value])),children:[...n.childNodes].map(visit)}:{type:n.nodeType,text:n.textContent};
    return JSON.stringify(visit(doc.documentElement));
  },{source,withoutCloud});
  const change=async strength=>{
    const before=analysis.length;
    await page.locator('#cloud-jitter').evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('change',{bubbles:true}));},strength);
    await settleFigure(page);assert.equal(await page.locator('#cloud-jitter-value').textContent(),strength+'%');
    assert.equal(analysis.length,before,'A jitter slider change must never start a scientific job');
  };
  await page.locator('[data-settings-target="tree"]').click();
  await page.locator('#cloud-background-section').evaluate(e=>{e.open=true;});
  assert.equal(await page.locator('#cloud-jitter').isVisible(),false);
  assert.equal(await page.locator('#cloud-jitter-number').isVisible(),true);
  for(const direction of ['file','small-top','large-top'])for(const sizePx of [16,24]) {
    await page.evaluate(async({direction,sizePx})=>{
      $('cloud-ladder-direction').value=direction;
      syncNumericControl(NUMERIC_SETTING_CONTROLS.find(x=>x.rangeId==='tip-font-size'),sizePx,{render:false});
      $('cloud-jitter').value='0';await renderCloudTree();await ensureFigureFontsReady();
    },{direction,sizePx});await settleFigure(page);
    const baseline=await page.evaluate(()=>serializeRenderedSvg());
    const baselineRest=await canonical(baseline,true);
    const oldPaths=await page.locator('.cloud-gene-lines>path').evaluateAll(nodes=>nodes.map(n=>({d:n.getAttribute('d'),stroke:n.getAttribute('stroke')})));
    let previous=null;
    for(const strength of [0,25,50,100]) {
      await change(strength);
      const audit=await page.evaluate(({oldPaths,previous,strength})=>{
        const svg=$('tree-svg'),c=state.cloud,paths=[...svg.querySelectorAll('.cloud-gene-lines>path')];
        const values=s=>s.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
        const reference=new Map();
        for(const [n,clade]of PhyloRenderCloud.nodeClades(c.speciesRoot))reference.set(clade.key,Number(svg.querySelector(`.clade-node-hit[data-clade-node-id="${n.id}"]`).getAttribute('cy')));
        let index=0,curved=0,comparisons=0,maximumDifference=0;
        const displacements=[];
        for(const root of c.geneRoots){const clades=PhyloRenderCloud.nodeClades(root);
          (function visit(n){for(const child of n.children){
            const edge=paths[index],xy=values(edge.getAttribute('d')),old=values(oldPaths[index].d);
            if(JSON.stringify(xy.slice(0,2))!==JSON.stringify(old.slice(0,2))||JSON.stringify(xy.slice(-2))!==JSON.stringify(old.slice(-2)))throw Error('ENDPOINT_MOVED');
            if(edge.getAttribute('stroke')!==oldPaths[index].stroke)throw Error('COLOR_CHANGED');
            const isCurve=xy.length===8;if(isCurve)curved++;
            const delta=isCurve?Math.abs((xy[1]+3*xy[3]+3*xy[5]+xy[7])/8-(xy[1]+xy[7])/2):0;
            if(previous&&delta+1e-9<previous[index])throw Error('NON_MONOTONIC_JITTER');
            if(isCurve&&(Math.abs(xy[2]-(xy[0]+(xy[6]-xy[0])/3))>1e-9||Math.abs(xy[4]-(xy[0]+2*(xy[6]-xy[0])/3))>1e-9))throw Error('TIME_OFFSET');
            for(const [endpoint,y]of [[n,xy[1]],[child,xy.at(-1)]]){const key=clades.get(endpoint)?.key;
              if(reference.has(key)){comparisons++;maximumDifference=Math.max(maximumDifference,Math.abs(y-reference.get(key)));}}
            displacements.push(delta);index++;visit(child);
          }})(root);
        }
        return{strength,paths:paths.length,curved,comparisons,maximumDifference,displacements,workers:PhyloRenderInputTasks.activeCount,native:PhyloRenderNativeClient.activeCount};
      },{oldPaths,previous,strength});
      assert.equal(audit.maximumDifference,0);assert.equal(audit.workers,0);assert.equal(audit.native,0);
      if(strength)assert.ok(audit.curved>0);else assert.equal(audit.curved,0);
      previous=audit.displacements;
      const spec=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
      equalU(spec.options.cloud.jitter,strength);equalU(spec.options.typography.tips.size_u,units.designToDrawing(sizePx));
      const web=await page.evaluate(()=>serializeRenderedSvg());assert.equal(await canonical(web,true),baselineRest);
      const created=await client.callTool({name:'create_figure',arguments:spec},undefined,{timeout:240000});
      assert.ok(!created.isError,JSON.stringify(created.content));
      const link=created.content.find(x=>x.type==='resource_link'&&x.name==='figure.svg');
      const remote=(await client.readResource({uri:link.uri})).contents[0].text;
      const name=direction+'-'+sizePx*.75+'pt-'+strength;
      if(output){await writeFile(path.join(output,name+'-web.svg'),web);await writeFile(path.join(output,name+'-mcp.svg'),remote);}
      const left=await canonical(web),right=await canonical(remote);
      if(left!==right&&output){let i=0;while(i<Math.min(left.length,right.length)&&left[i]===right[i])i++;
        await writeFile(path.join(output,name+'-difference.json'),JSON.stringify({index:i,web:left.slice(i,i+800),mcp:right.slice(i,i+800)},null,2));}
      assert.equal(hash(left),hash(right),name+': complete SVG mismatch');
      assert.equal(created.structuredContent.report.topology_unchanged,true);
      assert.equal(await science(),originalScience);
      results.push({name,...audit,displacements:undefined,exact_svg:true,canonical_sha256:hash(await canonical(web))});
      // Configuration reload uses the same parameter and must reproduce it.
      await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec);await settleFigure(page);
      assert.equal(await canonical(await page.evaluate(()=>serializeRenderedSvg())),await canonical(web));
    }
    await change(0);assert.equal(await canonical(await page.evaluate(()=>serializeRenderedSvg())),await canonical(baseline));
  }
  const valid=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration()),savedSvg=await page.evaluate(()=>serializeRenderedSvg());
  for(const value of [-1,101,.5,'50',null]){
    const invalid=structuredClone(valid);invalid.options.cloud.jitter=value;
    assert.equal(figureSpecSchema.safeParse(invalid).success,false);
    const failed=await page.evaluate(s=>PhyloRenderAgent.loadFigure(s).then(()=>false,()=>true),invalid);
    assert.equal(failed,true);assert.equal(await canonical(await page.evaluate(()=>serializeRenderedSvg())),await canonical(savedSvg));
    assert.equal((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).options.cloud.jitter,0);
  }
  await change(100);await page.evaluate(async()=>{$('cloud-show-species').checked=false;await renderCloudTree();});await settleFigure(page);
  assert.ok(await page.locator('.cloud-gene-lines>path[d*=" C "]').count()>0);
  await page.evaluate(async()=>{$('cloud-show-gene').checked=false;$('cloud-show-species').checked=true;await renderCloudTree();});await settleFigure(page);
  assert.equal(await page.locator('.cloud-gene-lines').count(),0);
  assert.equal(await science(),originalScience);assert.equal(analysis.length,requests);assert.deepEqual(errors,[]);
  if(output)await writeFile(path.join(output,'results.json'),JSON.stringify({passed:true,results,ignored:['SVG metadata only'],
    monotonic:true,endpoints_exact:true,zero_restores_exact_svg:true,configuration_roundtrip:true,invalid_transaction_preserved:true,
    gene_only:true,hidden_cloud:true,scientific_state_unchanged:true,no_new_gui_analysis:true,errors},null,2));
  console.log('CLOUD_JITTER_WEB_MCP_PARITY_PASSED');
}finally{await client.close().catch(()=>{});await runtime.close();await rm(store,{recursive:true,force:true});}
