import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createRuntime, MCP_ROOT} from '../src/runtime.mjs';
import {figureSpecSchema} from '../src/schemas.mjs';

const outputRoot = await mkdtemp(path.join(os.tmpdir(),'phylorender-parity-'));
const evidence = process.env.PHYLORENDER_TEST_OUTPUT;
if(evidence) await mkdir(evidence,{recursive:true});
const runtime = await createRuntime();
const client = new Client({name:'web-mcp-parity',version:'1.0.0'});
const transport = new StdioClientTransport({command:process.execPath,args:[path.join(MCP_ROOT,'src/stdio.mjs')],
  env:{...process.env,PHYLORENDER_OUTPUT_ROOT:outputRoot},stderr:'pipe'});
const tree='(O:0.23,((A:0.1,B:0.12)90:0.11,(C:0.09,D:0.13)80:0.08)85:0.1);';
const dated='(O:73.5,((A:12,B:12)[&height=12,height_95%_HPD={9,15}]:32,(C:21,D:21)[&height=21,height_95%_HPD={18,25}]:23)[&height=44]:29.5)[&height=73.5];';
const secondary='(O:0.2,((A:0.09,C:0.13)96/98:0.1,(B:0.12,D:0.14)70/85:0.12)90/99:0.07);';
const genes=tree+'\n'+secondary+'\n(O:0.2,((A:0.1,B:0.12)90:0.1,C:0.15)80:0.08);';
const file=(name,content)=>({name,mimeType:'text/plain',buffer:Buffer.from(content)});
const results=[];
try {
  await client.connect(transport);
  const page=await runtime.renderer.browser.newPage({viewport:{width:1800,height:1200}});
  const errors=[],dateRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/api/cloud-date/jobs'))dateRequests.push(r.postDataJSON());});
  // Skip only the demonstration loader. Exercise the normal GUI controls.
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>window.PhyloRenderAgent.ready());
  assert.equal(await page.evaluate(()=>Number(document.querySelector('#png-resolution-scale').value)*96),300,'fresh GUI and MCP share the 300 DPI default');
  const mcp=async spec=>{
    const created=await client.callTool({name:'create_figure',arguments:spec},undefined,{timeout:240000});
    assert.ok(!created.isError,JSON.stringify(created.content));
    const value=created.structuredContent;
    const link=created.content.find(item=>item.type==='resource_link'&&item.name==='figure.svg');
    assert.ok(link,'MCP returns original SVG resource');
    const svg=(await client.readResource({uri:link.uri})).contents[0].text;
    assert.ok(!JSON.stringify(value.spec.requested).includes(spec.main_tree.content),'raw inputs remain private');
    assert.equal(value.report.topology_unchanged,true);
    return {svg,report:value.report,id:value.figure_id};
  };
  const compare=async name=>{
    console.log(`Checking ${name}`);
    // Explicit UI edits can now schedule a cancellable conflict transaction.
    // Export only a completed render, never a halfway font/glyph subset.
    await page.waitForFunction(()=>!activeTreeLoad);
    await page.evaluate(async()=>{await flushSettingsRender();await ensureFigureFontsReady();await renderTree();});
    await page.waitForFunction(()=>!activeTreeLoad);
    assert.deepEqual(await page.evaluate(()=>({workers:PhyloRenderInputTasks.activeCount,native:PhyloRenderNativeClient.activeCount})),{workers:0,native:0});
    const configuration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    if(name==='cloud-imported'){
      assert.ok(configuration.gene_trees, 'computed statistics retain their original gene inputs');
      assert.equal(configuration.phyparts_table, undefined, 'computed provenance must not become an unqualified manual table');
    }
    figureSpecSchema.parse(configuration);
    if(evidence)await writeFile(path.join(evidence,`${name}-configuration.json`),JSON.stringify(configuration,null,2));
    const web=await page.evaluate(()=>serializeRenderedSvg());
    const remote=await mcp(configuration);
    // Preserve scientific metadata as well as all graphical elements and fonts.
    const canonical=source=>page.evaluate(text=>{
      const doc=new DOMParser().parseFromString(text,'image/svg+xml');
      doc.querySelector('metadata#phylorender-build')?.remove();
      const visit=node=>node.nodeType===1 ? {
        tag:node.tagName,
        attributes:Object.fromEntries([...node.attributes]
          .sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value])),
        children:[...node.childNodes].map(visit),
      } : {type:node.nodeType,text:node.textContent};
      return JSON.stringify(visit(doc.documentElement));
    },source);
    if(evidence) {await writeFile(path.join(evidence,`${name}-web.svg`),web);await writeFile(path.join(evidence,`${name}-mcp.svg`),remote.svg);}
    const left=await canonical(remote.svg),right=await canonical(web);
    const sha=text=>createHash('sha256').update(text).digest('hex');
    if(left!==right) {
      let index=0;while(index<Math.min(left.length,right.length)&&left[index]===right[index])index++;
      console.log(JSON.stringify({first_difference:index,mcp:left.slice(index,index+400),web:right.slice(index,index+400)}));
    }
    assert.equal(sha(left),sha(right),`${name}: all SVG geometry, text, fonts and layers match`);
    // Browser import uses exactly the same configuration, including visibility.
    await page.evaluate(()=>showMessage('Testing specification import'));
    await page.locator('#import-figure-config').setInputFiles(file(`${name}.json`,JSON.stringify(configuration)));
    await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Figure specification loaded'),null,{timeout:240000});
    assert.equal(sha(await canonical(await page.evaluate(()=>serializeRenderedSvg()))),sha(right),`${name}: web configuration round trip`);
    const result={name,workspace:configuration.workspace,svg_sha256:createHash('sha256').update(remote.svg).digest('hex'),report:remote.report};
    results.push(result);
    if(evidence) {await writeFile(path.join(evidence,`${name}.svg`),remote.svg);await writeFile(path.join(evidence,`${name}.json`),JSON.stringify(result,null,2));}
    return remote;
  };
  // Exercise GUI imports first. Do not load the web figure through the agent bridge.
  await page.locator('[data-workspace-mode="phylogeny"]').click();
  await page.waitForFunction(()=>!activeTreeLoad);
  await page.locator('#tree-file').setInputFiles(file('primary.tre',tree));
  await page.waitForFunction(()=>state.sourceName==='primary.tre'&&!activeTreeLoad);
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  await page.evaluate(async ()=>{const n=mrcaForTesting();function mrcaForTesting(){return state.root.children.find(c=>c.children.length)?.children.find(c=>c.children.length);} if(n){state.cladeColors.set(n.id,'#0072b2');state.cladeNames.set(n.id,'Group A');} await renderTree();});
  await compare('ordinary');
  await page.locator('[data-workspace-mode="time"]').click();
  await page.waitForFunction(()=>!activeTreeLoad);
  await page.locator('#tree-file').setInputFiles(file('dated.tree',dated));
  await page.waitForFunction(()=>state.sourceName==='dated.tree'&&!activeTreeLoad);
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  await page.evaluate(async ()=>{$('time-source-unit').value='mya';state.timeAgeRange={minimumRaw:20,maximumRaw:80};updateTimeAgeRangeControls();await renderTree();});
  const time=await compare('dating');
  assert.equal(time.report.tree_type,'time');
  assert.equal(time.report.time.root_age_raw,73.5);
  assert.ok(time.svg.includes('time-hpd'));
  await page.locator('[data-workspace-mode="conflict"]').click();
  await page.waitForFunction(()=>!activeTreeLoad);
  const conflictLabels={A:'Example_alpha_2023080906_1',B:'Example_alpha_2023080907-1',C:'Example_beta_SRR123',D:'Example_beta_SRR124'};
  const withConflictLabels=text=>text.replace(/[A-D](?=:)/g,label=>conflictLabels[label]);
  await page.locator('#conflict-nuclear-file').setInputFiles(file('primary.tre',withConflictLabels(tree)));
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  await page.locator('#conflict-plastid-file').setInputFiles(file('secondary.tre',withConflictLabels(secondary)));
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  await page.evaluate(()=>{state.conflict.supportFieldSelections.plastid='field:1';$('conflict-primary-ladder').value='file';state.conflict.primaryDisplayRoot.children.find(n=>n.children.length).children.reverse();prepareConflictWorkspace({announce:false});});
  await page.waitForFunction(()=>!activeTreeLoad);
  await page.locator('#conflict-group-file').setInputFiles(file('groups.csv',
    'sample,group,color\n'+conflictLabels.A+',Group A,#0072b2\n'+conflictLabels.B+',Group A,#0072b2\n'+conflictLabels.C+',Group B,#009e73'));
  await page.waitForFunction(()=>state.conflict.groupFileName==='groups.csv');
  const conflict=await compare('conflict');
  assert.equal(conflict.report.tree_type,'conflict');
  assert.equal(conflict.report.conflict.group_coloring.assigned_primary_samples,3);
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.waitForFunction(()=>!activeTreeLoad);
  await page.evaluate(()=>{$('cloud-show-gene').checked=true;$('cloud-species-method').value='dated';$('cloud-dated-unit').value='mya';$('cloud-genes-method').value='ml';});
  const before=dateRequests.length;
  await page.locator('#cloud-species-file').setInputFiles(file('dated.tree',dated));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:240000});
  assert.equal(dateRequests.length,before,'imported species tree skips treePL');
  await page.locator('#cloud-genes-file').setInputFiles(file('all_genes.trees',genes));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:240000});
  await page.waitForFunction(()=>state.cloud.phyPartsTable && !state.cloud.phyPartsBusy && state.cloud.geneRoots.length===2,null,{timeout:240000});
  await page.evaluate(async ()=>{$('cloud-pie-mode').value='four';state.cloud.pieAgeRange={minimum:20,maximum:80};const node=state.cloud.speciesRoot.children.find(n=>n.children.length).children[0];state.cloud.cladeColors.set(node.id,'#009e73');state.cloud.cladeNames.set(node.id,'Example');const matched=PhyloRenderCloud.matchPhyParts(state.cloud.speciesRoot,state.cloud.phyPartsTable).matched;state.cloud.hiddenPieNodes.add(matched.get(node).id);await renderCloudTree();});
  const cloud=await compare('cloud-imported');
  assert.equal(cloud.report.cloud.dating_engine,'imported-dated');
  assert.equal(cloud.report.cloud.overlay_genes,2);
  assert.equal(cloud.report.cloud.gene_audit.total,3);
  assert.equal(cloud.report.cloud.gene_dating_engine,'PhyloRender-pl-aligner');
  assert.equal(cloud.report.cloud.treepl_seed,1);
  assert.ok(cloud.svg.includes('Uninformative'));
  // Without a supplied node table, the MCP computes the built-in four-category statistics.
  const fresh=await mcp({workspace:'cloud',main_tree:{name:'species_ML.tre',content:tree},gene_trees:{name:'all_genes.trees',content:genes},options:{cloud:{species_method:'ml',genes_method:'ml',root_age:10,root_age_unit:'relative',pie_mode:'four'}}});
  assert.equal(fresh.report.cloud.dating_engine,'PhyloRender-pl-aligner');
  assert.equal(fresh.report.cloud.overlay_genes,2);
  assert.equal(fresh.report.cloud.phyparts.geneCount,3);
  assert.ok(fresh.report.cloud.phyparts);
  assert.equal(fresh.report.cloud.treepl_seed,1);
  const inspected=await client.callTool({name:'inspect_figure',arguments:{figure_id:fresh.id}});
  assert.equal(inspected.structuredContent.state.workspace,'cloud');
  const edited=await client.callTool({name:'edit_figure',arguments:{figure_id:fresh.id,base_revision:1,
    operations:[{op:'set_options',options:{cloud:{pie_radius:30,pie_age_minimum:2,hidden_pies:[['A','B']]}}}]}},undefined,{timeout:240000});
  assert.ok(!edited.isError,JSON.stringify(edited.content));
  assert.equal(edited.structuredContent.report.cloud.phyparts.geneCount,3);
  const capabilities=JSON.parse((await client.readResource({uri:'phylorender://capabilities'})).contents[0].text);
  assert.equal(capabilities.cloud.complete_phyparts,true);
  const stats=await mcp({workspace:'cloud',main_tree:{name:'ASTRAL_topology.tre',content:tree},gene_trees:{content:genes},
    options:{cloud:{species_method:'coalescent',genes_method:'coalescent',show_gene:false,species_shape:'rectangular',pie_mode:'four'}}});
  assert.equal(stats.report.cloud.dating_engine,'relative-display');
  assert.equal(stats.report.cloud.overlay_genes,0);
  assert.equal(stats.report.cloud.phyparts.geneCount,3);
  assert.ok(stats.svg.includes('cloud-species-tree'));
  const exported=await client.callTool({name:'export_figure',arguments:{figure_id:stats.id}});
  assert.deepEqual(exported.structuredContent.formats,['svg']);
  assert.deepEqual(exported.structuredContent.unsupported_formats,[]);
  const rejected=await client.callTool({name:'create_figure',arguments:{workspace:'cloud',main_tree:{name:'ASTRAL.tre',content:tree},
    options:{cloud:{species_method:'coalescent',show_gene:true}},gene_trees:{content:genes}}},undefined,{timeout:240000});
  assert.equal(rejected.isError,true,'non-ML cloud overlay stops with an explicit error');
  results.push({name:'cloud-fresh',report:fresh.report});
  if(evidence)await writeFile(path.join(evidence,'cloud-fresh.svg'),fresh.svg);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,cases:results.map(r=>r.name)},null,2));
  if(evidence)await writeFile(path.join(evidence,'summary.json'),JSON.stringify({passed:true,cases:results},null,2));
} finally {await client.close().catch(()=>{});await runtime.close();await rm(outputRoot,{recursive:true,force:true});}
