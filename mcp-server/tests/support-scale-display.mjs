import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRuntime} from '../src/runtime.mjs';

await test('support drawing uses source/column units and display precision; cutoffs stay raw',async t=>{
 const runtime=await createRuntime();
 const page=await runtime.renderer.browser.newPage();
 try{
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderReady);
  const spec=(text,support={})=>({workspace:'phylogeny',main_tree:{content:text},rooting:{outgroup:null},options:{support}});
  const load=configuration=>page.evaluate(configuration=>PhyloRenderAgent.loadFigure(configuration),configuration);
  const branch=()=>page.evaluate(()=>{
   const find=node=>{if(PhyloRenderSampleIdentity.descendantTipNodes(node).map(t=>t.label).sort().join(',')==='A,B')return node;for(const child of node.children){const found=find(child);if(found)return found;}};
   const node=find(state.root),line=document.querySelector(`.branch[data-clade-node-id="${CSS.escape(node.id)}"]`);
   const label=document.querySelector(`.support-label[data-label-id="${CSS.escape(node.incomingEdgeId||node.id)}"]`);
   return {full:line?.classList.contains('full-support-branch')||false,text:label?.textContent||null};
  });
  await t.test('a one-percent value in a percent source is low, not full support',async()=>{
   await load(spec('(O:3,(((A:1,B:1)1:1,C:2)95:1,D:3)90:1);'));
   assert.deepEqual(await branch(),{full:false,text:'–'});
  });
  await t.test('ambiguous all-one input fails atomically until its units are explicit',async()=>{
   const before=await page.evaluate(async()=>({source:JSON.stringify(state.parsedRoot),svg:serializeRenderedSvg(),config:await PhyloRenderAgent.exportConfiguration()}));
   const rejected=await page.evaluate(async config=>{try{await PhyloRenderAgent.loadFigure(config);return null;}catch(error){return {code:error.code,message:error.message};}},spec('(O:3,(((A:1,B:1)1:1,C:2)1:1,D:3)1:1);'));
   assert.equal(rejected?.code,'SUPPORT_SCALE_AMBIGUOUS');
   assert.match(rejected?.message||'',/Ambiguous or mixed branch support scale/i);
   const after=await page.evaluate(async()=>({source:JSON.stringify(state.parsedRoot),svg:serializeRenderedSvg(),config:await PhyloRenderAgent.exportConfiguration()}));
   assert.deepEqual(after,before);
  });
  await t.test('fractional-only input is ambiguous in the actual GUI and MCP',async()=>{
   const before=await page.evaluate(async()=>({raw:JSON.stringify(state.parsedRoot),svg:serializeRenderedSvg(),config:await PhyloRenderAgent.exportConfiguration()}));
   const ambiguous=spec('(O:3,(((A:1,B:1)0.5:1,C:2)0.9:1,D:3)0.95:1);');
   const rejected=await page.evaluate(async config=>{
    try{await PhyloRenderAgent.loadFigure(config);return null;}catch(error){return {code:error.code};}
   },ambiguous);
   assert.deepEqual(rejected,{code:'SUPPORT_SCALE_AMBIGUOUS'});
   const after=await page.evaluate(async()=>({raw:JSON.stringify(state.parsedRoot),svg:serializeRenderedSvg(),config:await PhyloRenderAgent.exportConfiguration()}));
   assert.deepEqual(after,before);
   await assert.rejects(runtime.renderer.render(ambiguous,{formats:['svg']}),{code:'SUPPORT_SCALE_AMBIGUOUS'});
  });
  await t.test('explicit percent and probability declarations remain distinct and round-trip',async()=>{
   const text='(O:3,(((A:1,B:1)1:1,C:2)1:1,D:3)1:1);';
   await load(spec(text,{scale:'percent'}));assert.equal((await branch()).full,false);
   assert.equal(await page.evaluate(async()=>(await PhyloRenderAgent.exportConfiguration()).options.support.scale),'percent');
   await load(spec(text,{scale:'probability'}));assert.equal((await branch()).full,true);
  });
  await t.test('rounded endpoints are full support; original precision retains near-one labels',async()=>{
   await load(spec('(O:3,(((A:1,B:1)0.999999999999:1,C:2)0.95:1,D:3)0.9:1);',{scale:'probability'}));
   assert.deepEqual(await branch(),{full:true,text:null});
   await load(spec('(O:3,(((A:1,B:1)0.999999999999:1,C:2)0.95:1,D:3)0.9:1);',{scale:'probability',decimals:'original'}));
   assert.deepEqual(await branch(),{full:false,text:'0.999999999999'});
  });
  await t.test('rounded classification reaches every full-support style and the exported MCP SVG',async()=>{
   const tree='(O:4,(((A:1,B:1)99.99:1,C:2)75:1,D:3)80:1);';
   const auxiliary='(O:4,(((A:1,B:1)0.9999:1,C:2)0.75:1,D:3)0.8:1);';
   const conflict=(primary,secondary,fields={})=>({workspace:'conflict',main_tree:{content:primary},comparison_tree:{content:secondary},
    options:{conflict:{primary_support_scale:'percent',secondary_support_scale:'probability',...fields}}});
   const compound=tree.replace('99.99','99.99/0.9999').replace('75:','75/0.75:').replace('80:','80/0.8:');
   const mixed=compound.replace('99.99/0.9999','99.99/0.94');
   const cases=[
    {name:'percent',config:spec(tree,{scale:'percent'}),full:1},
    {name:'probability',config:spec(auxiliary,{scale:'probability'}),full:1},
    {name:'compound',config:spec(compound,{scale:'percent/probability'}),full:1},
    {name:'auxiliary',config:{...spec(tree,{scale:'percent'}),support_trees:[{content:auxiliary,scale:'probability'}]},full:1},
    {name:'mixed-partial',config:spec(mixed,{scale:'percent/probability'}),full:0},
    {name:'missing-source',config:{...spec(tree,{scale:'percent'}),support_trees:[{content:auxiliary.replace('(A:1,B:1)','(A:1,C:1)').replace(',C:2',',B:2'),scale:'probability'}]},full:0},
    {name:'two-tree',config:conflict(tree,auxiliary),full:2},
    {name:'selected-compound-field',config:conflict(mixed,auxiliary,{primary_support_field:'field:0'}),full:2},
    {name:'selected-partial-field',config:conflict(mixed,auxiliary,{primary_support_scale:'probability',primary_support_field:'field:1'}),full:1},
   ];
   const exported=await runtime.renderer.browser.newPage(),evidence=process.argv[2];
   if(evidence)await mkdir(evidence,{recursive:true});
   const styles=['branch','circle','number','hide','star'],results=[];
   const summary=target=>target.evaluate(()=>({
    fullBranches:document.querySelectorAll('svg .full-support-branch').length,
    fullMarkers:document.querySelectorAll('svg .full-support-marker').length,
    partialMarkers:document.querySelectorAll('svg .partial-support-marker').length,
    texts:[...document.querySelectorAll('svg .support-label')].map(n=>n.textContent).sort(),
   }));
   try{
    for(const item of cases)for(const style of styles){
     // These single-letter synthetic names do not need the independent native
     // name recognizer. Keep that external cache/lifecycle out of this support
     // fixture while retaining an exact comparison of every SVG attribute.
     const configuration={...item.config,options:{...item.config.options,
      typography:{tips:{italic_mode:'none'}},
      support:{...item.config.options?.support,decimals:1,full_support_marker:style}}};
     const loaded=await load(configuration),screen=await summary(page);
     assert.equal(screen.fullBranches,style==='branch'?item.full:0,`${item.name}/${style}: branches`);
     assert.equal(screen.fullMarkers,style==='circle'?item.full:0,`${item.name}/${style}: circles`);
     if(item.full&&style==='branch')assert(!screen.texts.some(text=>text==='100.0'||text==='1.0'||text==='100.0/1.0'));
     if(style==='star')assert.equal(screen.texts.filter(text=>text==='*').length,item.full);
     const configurationOut=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
     const raw=await page.evaluate(()=>JSON.stringify([state.originalText,state.parsedRoot,state.nodeDataSources.map(s=>s.parsedRoot),state.conflict?.nuclearRoot,state.conflict?.plastidRoot]));
     const current=await page.evaluate(()=>PhyloRenderAgent.currentFigure());
     const remote=await runtime.renderer.render(configurationOut,{formats:['svg']});
     await exported.setContent(remote.svg);await exported.evaluate(()=>document.fonts.ready);
     assert.deepEqual(await summary(exported),screen,`${item.name}/${style}: exported markers and labels`);
     const canonical=svg=>svg.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/g,'');
     const actual=canonical(remote.svg),expected=canonical(current.svg);
     if(actual!==expected&&evidence){
      await writeFile(`${evidence}/${item.name}-${style}-mcp-difference.svg`,remote.svg);
      await writeFile(`${evidence}/${item.name}-${style}-gui-difference.svg`,current.svg);
     }
     let difference=0;while(difference<actual.length&&actual[difference]===expected[difference])difference++;
     assert.equal(actual===expected,true,`${item.name}/${style}: exact GUI/MCP SVG differs at ${difference}: ${actual.slice(difference,difference+90)} vs ${expected.slice(difference,difference+90)}`);
     assert.equal(remote.report.topology_unchanged,true);assert.equal(loaded.report.topology_unchanged,true);
     assert.equal(await page.evaluate(()=>JSON.stringify([state.originalText,state.parsedRoot,state.nodeDataSources.map(s=>s.parsedRoot),state.conflict?.nuclearRoot,state.conflict?.plastidRoot])),raw);
     if(evidence&&style==='branch'&&['percent','two-tree'].includes(item.name)){
      await writeFile(`${evidence}/${item.name}.svg`,remote.svg);
      await exported.locator('svg').screenshot({path:`${evidence}/${item.name}.png`});
     }
     results.push({name:item.name,style,full:item.full,exact_svg:true,unchanged_inputs:true});
     console.log(`ROUNDED_SUPPORT_CASE_PASSED: ${item.name}/${style}`);
    }
    if(evidence)await writeFile(`${evidence}/rounded-style-results.json`,JSON.stringify(results,null,2));
   }finally{await exported.close();}
  });
  await t.test('real precision controls reclassify reversibly without editing scientific inputs',async()=>{
   const tree='(O:4,(((A:1,B:1)99.99:1,C:2)75:1,D:3)80:1);';
   await load(spec(tree,{scale:'percent',decimals:1}));
   const original=await page.evaluate(()=>JSON.stringify([state.originalText,state.parsedRoot,[...state.mainSupportValues]]));
   assert.deepEqual(await branch(),{full:true,text:null});
   await page.locator('[data-settings-target="labels"]').click();
   await page.locator('#support-decimals-number').evaluate(element=>{for(let p=element.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
   await page.locator('#support-decimals-number').fill('2');
   await page.locator('#support-decimals-number').press('Tab');
   await page.evaluate(()=>flushSettingsRender());
   assert.deepEqual(await branch(),{full:false,text:'99.99'});
   assert.equal((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).options.support.decimals,2);
   await page.locator('#support-decimals-auto').click();await page.evaluate(()=>flushSettingsRender());
   assert.deepEqual(await branch(),{full:false,text:'99.99'});
   assert.equal((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).options.support.decimals,'original');
   await page.locator('#support-decimals-number').fill('1');
   await page.locator('#support-decimals-number').press('Tab');
   await page.evaluate(()=>flushSettingsRender());
   assert.deepEqual(await branch(),{full:true,text:null});
   assert.equal(await page.evaluate(()=>JSON.stringify([state.originalText,state.parsedRoot,[...state.mainSupportValues]])),original);
  });
  await t.test('compound columns retain separately declared source-wide units',async()=>{
   await load(spec('(O:3,(((A:1,B:1)1/1:1,C:2)0.95/95:1,D:3)0.9/90:1);',{scale:'probability/percent'}));
   assert.deepEqual(await branch(),{full:false,text:'1.00/–'});
  });
  await t.test('auxiliary sources declare units independently and GUI changes preserve source data',async()=>{
   const primary='(O:3,(((A:1,B:1)95:1,C:2)80:1,D:3)90:1);';
   const auxiliary='(O:3,(((A:1,B:1)1:1,C:2)1:1,D:3)1:1);';
   await load({...spec(primary),support_trees:[{name:'auxiliary.tre',content:auxiliary,scale:'percent'}]});
   assert.equal((await branch()).text,'95/–');
   const sourceBefore=await page.evaluate(()=>JSON.stringify(state.nodeDataSources[0].parsedRoot));
   await page.locator('[data-settings-target="data"]').click();
   await page.locator('#support-data-list select[aria-label^="Support scale for "]').evaluate(element=>{for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});
   await page.locator('#support-data-list select[aria-label^="Support scale for "]').selectOption('probability');
   await page.evaluate(()=>flushSettingsRender());
   assert.equal((await branch()).text,'95/1.00');
   assert.equal(await page.evaluate(()=>JSON.stringify(state.nodeDataSources[0].parsedRoot)),sourceBefore);
   const configuration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
   assert.equal(configuration.support_trees[0].scale,'probability');
   await load(spec(primary));
   await page.locator('#support-new-source-scale').evaluate(element=>{element.closest('details').open=true;});
   await page.locator('#support-new-source-scale').selectOption('probability');
   await page.locator('#support-data-files').setInputFiles({name:'new-auxiliary.tre',mimeType:'text/plain',buffer:Buffer.from(auxiliary)});
   await page.waitForFunction(()=>!activeTreeLoad);
   assert.equal((await branch()).text,'95/1.00');
  });
  await t.test('conflict sides keep independent units when the primary and comparison trees swap',async()=>{
   const tree='(O:3,(((A:1,B:1)1:1,C:2)1:1,D:3)1:1);';
   await load({workspace:'conflict',main_tree:{content:tree},comparison_tree:{content:tree},
    options:{conflict:{primary_support_scale:'percent',secondary_support_scale:'probability'}}});
   const counts=await page.evaluate(()=>{
    const full=[...document.querySelectorAll('.conflict-branch.full-support-branch')];
    return {left:full.filter(line=>Number(line.getAttribute('x2'))>Number(line.getAttribute('x1'))).length,
     right:full.filter(line=>Number(line.getAttribute('x2'))<Number(line.getAttribute('x1'))).length};
   });
   assert.deepEqual(counts,{left:0,right:3});
   await page.locator('#conflict-swap-trees').evaluate(element=>{element.closest('details').open=true;});
   await page.locator('#conflict-swap-trees').click();await page.waitForFunction(()=>!activeTreeLoad);
   const configuration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
   assert.equal(configuration.options.conflict.primary_support_scale,'probability');
   assert.equal(configuration.options.conflict.secondary_support_scale,'percent');
  });
  await t.test('the real cloud Worker and MCP retain a 1-percent gene below a 50-percent cutoff as no signal',async()=>{
   const configuration={workspace:'cloud',main_tree:{content:'(O,((A,B),C));'},gene_trees:{content:'(O,(A,B)1);\n(O,((A,B)95,C)95);'},
    options:{cloud:{species_method:'other',show_gene:false,phyparts_threshold:50}}};
   const result=await load(configuration),remote=await runtime.renderer.render(configuration,{formats:['svg']});
   for(const report of [result.report,remote.report]){
    const node=report.cloud.pie_nodes.find(node=>[...node.counts.names].sort().join(',')==='A,B');
    assert.equal(node.counts.concordant,1);assert.equal(node.counts.noSignal,1);assert.equal(node.counts.total,2);
   }
  });
  await t.test('explicit mixed-column units disambiguate an all-one source without altering its numbers',async()=>{
   await load(spec('(O:3,(((A:1,B:1)1/1:1,C:2)1/1:1,D:3)1/1:1);',{scale:'probability/percent'}));
   assert.deepEqual(await branch(),{full:false,text:'1.00/–'});
   const configuration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
   assert.equal(configuration.options.support.scale,'probability/percent');
  });
  await t.test('conflict and actual gene Worker reject ambiguous fractions and restore the previous workspace',async()=>{
   const raw='(O:3,((A:1,B:1)0.5:1,C:2)0.9:1);';
   const configurations=[
    {workspace:'conflict',main_tree:{content:raw},comparison_tree:{content:raw}},
    {workspace:'cloud',main_tree:{content:'(O,((A,B),C));'},gene_trees:{content:raw},
      options:{cloud:{species_method:'other',show_gene:false,phyparts_scale:'auto'}}}
   ];
   const before=await page.evaluate(async()=>({mode:state.workspaceMode,svg:serializeRenderedSvg(),config:await PhyloRenderAgent.exportConfiguration()}));
   for(const config of configurations){
    const result=await page.evaluate(async config=>{try{await PhyloRenderAgent.loadFigure(config);return null;}catch(error){return error.code;}},config);
    assert.equal(result,'SUPPORT_SCALE_AMBIGUOUS');
    const after=await page.evaluate(async()=>({mode:state.workspaceMode,svg:serializeRenderedSvg(),config:await PhyloRenderAgent.exportConfiguration()}));
    assert.deepEqual(after,before);
    await assert.rejects(runtime.renderer.render(config,{formats:['svg']}),{code:'SUPPORT_SCALE_AMBIGUOUS'});
   }
  });
 }finally{await page.close();await runtime.close();}
});
