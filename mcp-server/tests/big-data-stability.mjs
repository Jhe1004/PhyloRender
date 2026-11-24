import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';

const output=process.env.PHYLORENDER_TEST_OUTPUT;
const runtime=await createRuntime(),results={};
const ps=promisify(execFile);
let resourceBusy=false,peakRssKiB=0,resourceSamples=0,resourceError=null;
const sampleResources=async()=>{
  if(resourceBusy)return;resourceBusy=true;
  try{
    const {stdout}=await ps('ps',['-axo','pid=,ppid=,rss=']);
    const rows=stdout.trim().split('\n').map(row=>row.trim().split(/\s+/).map(Number));
    const owned=new Set([process.pid]);let changed=true;
    while(changed){changed=false;for(const [pid,parent] of rows)if(owned.has(parent)&&!owned.has(pid)){owned.add(pid);changed=true;}}
    peakRssKiB=Math.max(peakRssKiB,rows.reduce((sum,[pid,,rss])=>sum+(owned.has(pid)?rss:0),0));resourceSamples++;
  }catch(error){resourceError=error.message;}finally{resourceBusy=false;}
};
const resourceTimer=setInterval(sampleResources,500);
const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
const balanced=names=>names.length===1?`${names[0]}:1`:`(${balanced(names.slice(0,Math.floor(names.length/2)))},${balanced(names.slice(Math.floor(names.length/2)))})${''}:1`;
try{
  const page=await runtime.renderer.browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderReady);
  const heartbeat=()=>page.evaluate(()=>{
    clearInterval(window.heartbeatTimer);window.beats=0;window.maxGap=0;let last=performance.now();
    window.heartbeatTimer=setInterval(()=>{window.beats++;window.maxGap=Math.max(window.maxGap,performance.now()-last);last=performance.now();},25);
  });
  const status=()=>page.evaluate(()=>({beats:window.beats,maxGap:window.maxGap,workers:PhyloRenderInputTasks.activeCount,
    native:PhyloRenderNativeClient.activeCount,active:activeTreeLoad}));
  // Stress the actual pie-search generator independently of gene eligibility:
  // this is a cancellation test, not a claim that a 1,500-tip cloud completed.
  await heartbeat();
  results.large_pie_search_cancel = await page.evaluate(async()=>{
    const items=Array.from({length:1498},(_,id)=>({node:{id},x:100+id%100*9,y:100+Math.floor(id/100)*9,age:10}));
    const branches=Array.from({length:3000},(_,id)=>({x1:80+id%120*8,y1:80+Math.floor(id/120)*8,
      x2:150+id%120*8,y2:120+Math.floor(id/120)*8}));
    const before=JSON.stringify(items),steps=PhyloRenderCloud.layoutPiePlacementSteps(items,branches,25,[],10);
    let cancel=false,completed=false,candidates=0,last=performance.now();
    const timer=setTimeout(()=>{cancel=true;},120);
    try {
      while(!cancel){const next=steps.next();if(next.done){completed=true;break;}candidates++;
        if(performance.now()-last>=24){await new Promise(resolve=>setTimeout(resolve,8));last=performance.now();}}
    } finally {clearTimeout(timer);steps.return();}
    return {pies:items.length,branches:branches.length,candidates,cancelled:cancel&&!completed,
      input_preserved:before===JSON.stringify(items),beats:window.beats,maxGap:window.maxGap};
  });
  assert.equal(results.large_pie_search_cancel.cancelled,true);
  assert.equal(results.large_pie_search_cancel.input_preserved,true);
  assert.ok(results.large_pie_search_cancel.beats>1);
  assert.ok(results.large_pie_search_cancel.maxGap<2000);
  await page.locator('[data-workspace-mode="phylogeny"]').click();
  const big=`${balanced(Array.from({length:1500},(_,i)=>`Taxon_${String(i).padStart(4,'0')}`))};`;
  await heartbeat();const started=Date.now();
  await page.locator('#tree-file').setInputFiles(file('balanced_1500.nwk',big));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:180000});
  results.large_tree={...await status(),elapsed_ms:Date.now()-started,tips:await page.locator('#tree-svg .tip-label').count()};
  assert.equal(results.large_tree.tips,1500);assert.ok(results.large_tree.beats>1);assert.equal(results.large_tree.workers,0);
  console.log('1500-tip import responsive:',JSON.stringify(results.large_tree));
  await heartbeat();const redrawStarted=Date.now();
  await page.evaluate(async()=>{
    if(!await renderTree())throw Error('Legacy interactive redraw did not complete');
  });
  results.large_interactive_redraw={...await status(),elapsed_ms:Date.now()-redrawStarted,
    tips:await page.locator('#tree-svg .tip-label').count()};
  assert.equal(results.large_interactive_redraw.tips,1500);
  assert.ok(results.large_interactive_redraw.beats>1);
  assert.ok(results.large_interactive_redraw.maxGap<2000);
  assert.equal(results.large_interactive_redraw.active,false);
  assert.equal(results.large_interactive_redraw.workers,0);assert.equal(results.large_interactive_redraw.native,0);
  const retained=await page.evaluate(()=>JSON.stringify(state.parsedRoot));
  await page.locator('#tree-file').setInputFiles(file('oversize_1501.nwk',`(${Array.from({length:1501},(_,i)=>`T${i}:1`).join(',')});`));
  await page.waitForFunction(()=>!activeTreeLoad&&$('tree-loading').dataset.state==='error');
  assert.match(await page.locator('#tree-loading-detail').textContent(),/安全上限/);
  assert.equal(await page.evaluate(()=>JSON.stringify(state.parsedRoot)),retained);
  results.oversize_rejected_without_truncation=true;
  await page.locator('#tree-loading-close').click();
  // A large dated tree has many age labels: cancel during cooperative layout,
  // not just during parsing, and verify a fresh time workspace stays empty.
  const timePage=await runtime.renderer.browser.newPage({viewport:{width:1500,height:1000}});
  timePage.on('pageerror',error=>errors.push(error.message));
  await timePage.goto(runtime.renderer.agentPageUrl);await timePage.evaluate(()=>PhyloRenderReady);
  await timePage.locator('[data-workspace-mode="time"]').click();
  await timePage.evaluate(()=>{
    window.beats=0;window.maxGap=0;let last=performance.now();
    window.heartbeatTimer=setInterval(()=>{window.beats++;window.maxGap=Math.max(window.maxGap,performance.now()-last);last=performance.now();},25);
  });
  const chronogram=names=>{
    if(names.length===1)return {text:names[0],height:0};
    const left=chronogram(names.slice(0,Math.floor(names.length/2))),right=chronogram(names.slice(Math.floor(names.length/2))),height=Math.max(left.height,right.height)+1;
    return {text:`(${left.text}:${height-left.height},${right.text}:${height-right.height})`,height};
  };
  await timePage.locator('#tree-file').setInputFiles(file('large_dated_1500.nwk',chronogram(Array.from({length:1500},(_,i)=>`Taxon_${i}`)).text+';'));
  await timePage.waitForFunction(()=>activeTreeLoad&&$('tree-loading-bar').value>=3,null,{timeout:30000});
  await timePage.locator('#tree-loading-cancel').click();
  await timePage.waitForFunction(()=>!activeTreeLoad,null,{timeout:15000});
  results.large_dated_layout_cancel=await timePage.evaluate(()=>({beats:window.beats,maxGap:window.maxGap,
    workers:PhyloRenderInputTasks.activeCount,native:PhyloRenderNativeClient.activeCount,model_empty:state.parsedRoot===null}));
  assert.ok(results.large_dated_layout_cancel.beats>1);assert.ok(results.large_dated_layout_cancel.maxGap<2000);
  assert.equal(results.large_dated_layout_cancel.model_empty,true);assert.equal(results.large_dated_layout_cancel.workers,0);
  assert.equal(results.large_dated_layout_cancel.native,0);
  await timePage.close();
  const conflictPage=await runtime.renderer.browser.newPage({viewport:{width:1500,height:1000}});
  conflictPage.on('pageerror',error=>errors.push(error.message));
  await conflictPage.goto(runtime.renderer.agentPageUrl);await conflictPage.evaluate(()=>PhyloRenderReady);
  await conflictPage.locator('[data-workspace-mode="conflict"]').click();
  const supportedBig=big.replace(/\):/g,')90:');
  await conflictPage.locator('#conflict-nuclear-file').setInputFiles(file('large_primary_1500.nwk',supportedBig));
  await conflictPage.locator('#tree-loading').waitFor({state:'hidden',timeout:30000});
  const primaryBefore=await conflictPage.evaluate(()=>JSON.stringify(state.conflict.nuclearRoot));
  await conflictPage.evaluate(()=>{
    window.beats=0;window.maxGap=0;let last=performance.now();
    window.heartbeatTimer=setInterval(()=>{window.beats++;window.maxGap=Math.max(window.maxGap,performance.now()-last);last=performance.now();},25);
  });
  await conflictPage.locator('#conflict-plastid-file').setInputFiles(file('large_comparison_1500.nwk',supportedBig));
  await conflictPage.waitForFunction(()=>activeTreeLoad&&$('tree-loading-bar').value>=6&&
    $('tree-loading-detail').textContent.includes('正在排列节点标注'),null,{timeout:30000});
  await conflictPage.locator('#tree-loading-cancel').click();
  await conflictPage.waitForFunction(()=>!activeTreeLoad,null,{timeout:15000});
  results.large_conflict_layout_cancel=await conflictPage.evaluate(()=>({beats:window.beats,maxGap:window.maxGap,
    workers:PhyloRenderInputTasks.activeCount,native:PhyloRenderNativeClient.activeCount,
    comparison_empty:state.conflict.plastidRoot===null,primary:JSON.stringify(state.conflict.nuclearRoot)}));
  assert.equal(results.large_conflict_layout_cancel.primary,primaryBefore);
  delete results.large_conflict_layout_cancel.primary;
  results.large_conflict_layout_cancel.primary_preserved=true;
  assert.equal(results.large_conflict_layout_cancel.comparison_empty,true);
  assert.equal(results.large_conflict_layout_cancel.workers,0);assert.equal(results.large_conflict_layout_cancel.native,0);
  assert.ok(results.large_conflict_layout_cancel.beats>1);assert.ok(results.large_conflict_layout_cancel.maxGap<2000);
  await conflictPage.close();
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.waitForFunction(()=>!activeTreeLoad);
  await page.evaluate(()=>{$('cloud-species-method').value='coalescent';$('cloud-show-gene').checked=false;});
  const real=process.env.PHYLORENDER_STRESS_FIXTURES;
  const species=real?await readFile(path.join(real,'01_真实ML物种树_99样品.tree'),'utf8'):'(O:3,((A:1,B:1):1,C:2):1);';
  const genes=real?await readFile(path.join(real,'03_全部13797基因树_压力测试.trees'),'utf8'):Array(13797).fill('(O:3,((A:1,B:1)1:1,C:2)1:1);').join('\n');
  await page.locator('#cloud-species-file').setInputFiles(file('species.tree',species));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:120000});
  const speciesBefore=await page.evaluate(()=>JSON.stringify(state.cloud.speciesRoot));
  // Force enough legitimate work to catch cancellation inside the Worker.
  const cancelInput=Array(10000).fill(species).join('\n');
  await heartbeat();
  const stressPath=real?path.join(real,'03_全部13797基因树_压力测试.trees'):null;
  await page.locator('#cloud-genes-file').setInputFiles(stressPath||file('cancel_10000.trees',cancelInput));
  await page.locator('#tree-loading-cancel').waitFor({state:'visible'});
  await page.locator('#tree-loading-cancel').click();
  await page.waitForFunction(()=>!activeTreeLoad,null,{timeout:15000});
  assert.equal(await page.evaluate(()=>JSON.stringify(state.cloud.speciesRoot)),speciesBefore);
  assert.match(await page.locator('#tree-loading-detail').textContent(),/取消/);
  assert.equal((await status()).workers,0);assert.equal((await status()).native,0);
  results.worker_cancel={...await status(),previous_model_preserved:true};
  console.log('Worker cancellation restored original model:',JSON.stringify(results.worker_cancel));
  await page.locator('#tree-loading-close').click();
  await heartbeat();const start=Date.now();
  if(!real)await page.evaluate(()=>{$('cloud-phyparts-scale').value='probability';}); // Explicit units of the unchanged synthetic 0/1 fixture.
  await page.locator('#cloud-genes-file').setInputFiles(stressPath||file('complete_13797.trees',genes));
  await page.waitForFunction(()=>!activeTreeLoad,null,{timeout:360000});
  assert.notEqual(await page.locator('#tree-loading').getAttribute('data-state'),'error',await page.locator('#tree-loading-detail').textContent());
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:360000});
  let outcome=await page.evaluate(()=>({audit:state.cloud.geneAudit,meta:state.cloud.phyPartsMeta,
    full:state.cloud.phyPartsTable.detailed,table:state.cloud.phyPartsText,
    rows:[...state.cloud.phyPartsTable.rows.values()],pies:document.querySelectorAll('.cloud-pie').length}));
  assert.equal(outcome.audit.total,13797);assert.equal(outcome.meta.geneCount,outcome.audit.stats.accepted);
  assert.equal(outcome.meta.mode,'four');assert.equal(outcome.full,true);
  for(const row of outcome.rows){assert.equal(row.total,outcome.meta.geneCount);assert.equal(row.concordant+row.conflict+row.noSignal,row.total);}
  results.gene_collection={source_kind:real?'real':'synthetic',bytes:Buffer.byteLength(genes),sha256:createHash('sha256').update(genes).digest('hex'),
    total:outcome.audit.total,statistics:outcome.audit.stats,invalid:outcome.audit.invalid,
    cloud_eligible:outcome.audit.accepted,pies:outcome.pies,engine:outcome.meta.engine,
    elapsed_ms:Date.now()-start,...await status()};
  assert.ok(results.gene_collection.beats>3);assert.equal(results.gene_collection.workers,0);assert.equal(results.gene_collection.native,0);
  assert.ok(results.gene_collection.maxGap<2000,'large preparation must not freeze the UI for multiple seconds');
  if(real){
    const statisticTable=outcome.table;
    await page.evaluate(()=>{$('cloud-species-method').value='ml';$('cloud-root-age').value='70';$('cloud-show-gene').checked=true;$('cloud-genes-method').value='ml';});
    await page.locator('#cloud-species-file').setInputFiles(file('real_ml_species.tree',species));
    await page.locator('#tree-loading').waitFor({state:'hidden',timeout:120000});
    await heartbeat();const cloudStart=Date.now();
    await page.locator('#cloud-genes-file').setInputFiles(stressPath);
    await page.locator('#tree-loading').waitFor({state:'hidden',timeout:360000});
    outcome=await page.evaluate(()=>({audit:state.cloud.geneAudit,meta:state.cloud.phyPartsMeta,table:state.cloud.phyPartsText,
      cloud_trees:state.cloud.geneRoots.length,dating_error:state.cloud.datingError,dated_root_age:state.cloud.datedRootAge,
      species_engine:state.cloud.datingEngine,gene_engine:state.cloud.geneDatingEngine}));
    assert.equal(outcome.table,statisticTable,'drawing the complete eligible cloud subset must not change PhyParts counts');
    assert.ok(outcome.cloud_trees>0);assert.equal(outcome.cloud_trees,outcome.audit.accepted);assert.ok(!outcome.dating_error);
    assert.equal(outcome.dated_root_age,70);assert.equal(outcome.species_engine,'bundled-treePL');
    results.full_cloud={...await status(),elapsed_ms:Date.now()-cloudStart,raw_trees:outcome.audit.total,cloud_trees:outcome.cloud_trees,
      statistics_unchanged:true,dating_error:outcome.dating_error||null,species_engine:outcome.species_engine,gene_engine:outcome.gene_engine,root_age:70};
    assert.ok(results.full_cloud.maxGap<2000);assert.equal(results.full_cloud.workers,0);assert.equal(results.full_cloud.native,0);
    const modelBefore=await page.evaluate(()=>JSON.stringify(state.cloud.geneRoots));
    const spacingBefore=await page.locator('#tip-spacing').inputValue();
    await heartbeat();
    await page.evaluate(()=>{
      window.cloudLayoutReached=false;
      void runTreeLoad('Cloud layout cancellation test',async progress=>{
        await progress.stage(3,'Cloud layout test');
        const spacing=terminalSpacing()+1;
        state.automaticTipSpacing=false;
        state.tipSpacingEm=spacing/Number($('tip-font-size').value);
        $('tip-spacing').value=String(spacing);
        await renderTreeCooperatively(update=>{window.cloudLayoutReached=true;progress.report(3,`Cloud layout ${update.current}/${update.total}`);});
      });
    });
    await page.waitForFunction(()=>activeTreeLoad&&window.cloudLayoutReached,null,{timeout:30000});
    await page.locator('#tree-loading-cancel').click();
    await page.waitForFunction(()=>!activeTreeLoad,null,{timeout:120000});
    assert.equal(await page.evaluate(()=>JSON.stringify(state.cloud.geneRoots)),modelBefore);
    assert.equal(await page.locator('#tip-spacing').inputValue(),spacingBefore);
    assert.equal(await page.locator('#tree-loading').getAttribute('data-state'),'error');
    assert.match(await page.locator('#tree-loading-detail').textContent(),/取消/);
    assert.equal(await page.evaluate(()=>state.cloud.phyPartsText),statisticTable);
    results.cloud_layout_cancel={...await status(),model_preserved:true,controls_preserved:true};
    assert.ok(results.cloud_layout_cancel.maxGap<2000);assert.equal(results.cloud_layout_cancel.workers,0);assert.equal(results.cloud_layout_cancel.native,0);
    await page.locator('#tree-loading-close').click();
  }
  if(output){await mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'big-data-ui.png')});
    await writeFile(path.join(output,'gene-audit.json'),JSON.stringify(outcome.audit,null,2));
    await writeFile(path.join(output,'phyparts-counts.tsv'),outcome.table);
    await writeFile(path.join(output,'big-data-cloud.svg'),await page.evaluate(()=>serializeRenderedSvg()));
    const downloadPromise=page.waitForEvent('download');
    await page.evaluate(()=>exportPng());
    await (await downloadPromise).saveAs(path.join(output,'big-data-cloud.png'));
  }
  await sampleResources();
  results.resources={sample_interval_ms:500,samples:resourceSamples,sampled_peak_subtree_rss_mib:peakRssKiB/1024,
    scope:'test runner plus its browser, local server and native descendants; includes fixture-buffer overhead; RSS can double-count shared pages',error:resourceError};
  assert.deepEqual(errors,[]);results.errors=errors;
  console.log(JSON.stringify(results,null,2));
  if(output)await writeFile(path.join(output,'big-data-stability.json'),JSON.stringify(results,null,2));
}finally{clearInterval(resourceTimer);await runtime.close();}
