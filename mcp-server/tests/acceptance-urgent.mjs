import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRuntime} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';
const output=process.env.PHYLORENDER_TEST_OUTPUT;
if(output)await mkdir(output,{recursive:true});
const runtime=await createRuntime(),records=[],errors=[];
const old='(Old_O:2,(Old_A:1,Old_B:1):1);',replacement='(New_O:2,(New_A:1,New_B:1):1);';
const dated='(O:70,((A:20,B:20):20,(C:30,D:30):10):30);';
const spec=workspace=>({workspace,main_tree:{name:'Keep_original.tree',content:['time','cloud'].includes(workspace)?dated:old},
  options:{typography:{tips:{size_pt:20}},...(workspace==='time'?{time:{source_unit:'mya'}}:{}),
    ...(workspace==='cloud'?{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false}}:{}),
    ...(workspace==='conflict'?{conflict:{primary_title:'Keep title',secondary_title:'Keep second title'}}:{})},
  ...(workspace==='conflict'?{comparison_tree:{name:'Keep_second.tree',content:old}}:{})});
async function pageFor(workspace='phylogeny') {
  const page=await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>PhyloRenderAgent.ready());await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),spec(workspace));
  await settleFigure(page);return page;
}
async function capture(page) {
  return page.evaluate(async()=>({config:await PhyloRenderAgent.exportConfiguration(),mode:state.workspaceMode,
    svg:$('tree-svg').outerHTML,raw:state.workspaceMode==='cloud'?state.cloud.speciesText:state.workspaceMode==='conflict'?state.conflict.nuclearText:$('newick-input').value}));
}
async function unchanged(page,before) {
  const screen=await page.locator('#tree-svg').evaluate(el=>el.outerHTML);
  assert.equal(screen,before.svg,'the screen must be restored before requesting another redraw/export');
  const after=await capture(page);assert.deepEqual(after,before);
  assert.equal(await page.evaluate(()=>PhyloRenderInputTasks.activeCount),0);
}
async function check(name,body) {const started=Date.now();const result=await body();records.push({name,passed:true,ms:Date.now()-started,...result});}
try {
  await check('E01-actual-file-rejection-and-quoted-control',async()=>{
    const page=await pageFor(),before=await capture(page);
    try {
      await page.locator('#tree-file').setInputFiles({name:'ambiguous.tree',mimeType:'text/plain',buffer:Buffer.from('(Homo sapiens:1,Pan troglodytes:1);')});
      await page.waitForFunction(()=>$('tree-loading').dataset.state==='error'&&!activeTreeLoad);
      assert.match(await page.locator('#message').textContent(),/引号/);await unchanged(page,before);
      await page.locator('#tree-loading-close').click();
      const quoted="('Homo sapiens':1,'Pan troglodytes':1);";
      await page.locator('#tree-file').setInputFiles({name:'quoted.tree',mimeType:'text/plain',buffer:Buffer.from(quoted)});
      await page.waitForFunction(()=>state.sourceName==='quoted.tree'&&!activeTreeLoad&&$('tree-loading').hidden);await settleFigure(page);
      assert.deepEqual(await page.evaluate(()=>descendantTipLabels(state.parsedRoot)),['Homo sapiens','Pan troglodytes']);
      const inspected=await runtime.renderer.inspect({content:quoted,name:'quoted.tree'});assert.equal(inspected.tips,2);
      const error=await runtime.renderer.inspect({content:'(Homo sapiens:1,B:1);',name:'bad.tree'}).then(()=>null,e=>e);
      assert(error);assert.match(error.message,/引号/);
      if(output){await writeFile(`${output}/quoted-control.svg`,await page.evaluate(()=>serializeRenderedSvg()));await page.screenshot({path:`${output}/quoted-control.png`});}
      return {ambiguous_input_rejected:true,old_figure_preserved:true,quoted_identity_exact:true,mcp_checked:true};
    }finally{await page.close();}
  });
  await check('E02-actual-Nexus-file-and-MCP',async()=>{
    const raw='#NEXUS\n[translate 1 Wrong_A,2 Wrong_B;]\nbegin trees;translate 1 Correct_A,2 Correct_B;tree t=(1:1,2:1);end;';
    const page=await pageFor();
    try {
      await page.locator('#tree-file').setInputFiles({name:'comments.nex',mimeType:'text/plain',buffer:Buffer.from(raw)});
      await page.waitForFunction(()=>state.sourceName==='comments.nex'&&!activeTreeLoad&&$('tree-loading').hidden);await settleFigure(page);
      assert.deepEqual(await page.evaluate(raw=>PhyloRenderSampleIdentity.descendantTipNodes(PhyloRenderInput.parseNewick(raw)).map(n=>n.label),raw),['Correct_A','Correct_B']);
      assert.deepEqual(await page.evaluate(()=>PhyloRenderSampleIdentity.descendantTipNodes(state.parsedRoot).map(n=>n.label)),['Correct_A','Correct_B']);
      const rendered=await runtime.renderer.render({workspace:'phylogeny',main_tree:{name:'comments.nex',content:raw}});
      assert(rendered.svg.includes('Correct'));assert(!rendered.svg.includes('Wrong'));
      if(output){await writeFile(`${output}/Nexus-correct-mapping.svg`,await page.evaluate(()=>serializeRenderedSvg()));await page.screenshot({path:`${output}/Nexus-correct-mapping.png`});}
      return {comment_cannot_change_identity:true,gui_and_mcp_correct:true};
    }finally{await page.close();}
  });
  for(const [name,workspace,mutate] of [
    ['bad-clade','phylogeny',s=>{s.main_tree={name:'Bad_replacement.tree',content:replacement};s.clades=[{mrca_of:['Absent'],name:'Test',color:'#123456'}];}],
    ['bad-support','phylogeny',s=>{s.main_tree={name:'Bad_replacement.tree',content:replacement};s.support_trees=[{name:'wrong.tree',content:'(Q:1,R:1)99;'}];}],
    ['bad-species','cloud',s=>{s.main_tree={name:'bad.tree',content:'(A:1,B:2);'};}],
    ['bad-secondary','conflict',s=>{s.main_tree={name:'Bad_replacement.tree',content:replacement};s.comparison_tree={name:'bad.tree',content:'(A:1,A:1);'};}],
    ['bad-HPD','time',s=>{s.main_tree={name:'bad.tree',content:'(X:70,Y:70)[&95%HPD={80,60}];'};}],
    ['cross-workspace','phylogeny',s=>{s.workspace='conflict';s.main_tree={name:'Bad_replacement.tree',content:replacement};s.comparison_tree={name:'bad.tree',content:'(A:1,A:1);'};}],
  ])await check(`E03-GUI-${name}`,async()=>{
    const page=await pageFor(workspace);
    try {
      await page.locator('[data-settings-target="export"]').click();const before=await capture(page),bad=spec(workspace);mutate(bad);
      await page.locator('#import-figure-config').setInputFiles({name:'bad-config.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
      await page.waitForFunction(()=>$('tree-loading').dataset.state==='error'&&!activeTreeLoad);
      await unchanged(page,before);assert(await page.locator('#message').isVisible());assert(await page.locator('#tree-loading').isVisible());
      await page.locator('#tree-loading-close').click();assert(await page.locator('#message').isVisible());
      if(output&&name==='bad-clade'){await writeFile(`${output}/rollback-keeps-original.svg`,await page.evaluate(()=>serializeRenderedSvg()));await page.screenshot({path:`${output}/rollback-keeps-original.png`});}
      // Retry through the same configuration-file UI, not a fresh page.
      await page.locator('#import-figure-config').setInputFiles({name:'valid-config.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(spec(workspace)))});
      await page.waitForFunction(()=>$('message').textContent.includes('绘图配置已载入')&&!activeTreeLoad&&$('tree-loading').hidden);await settleFigure(page);
      assert.equal((await capture(page)).raw,before.raw);
      return {old_screen_model_export_preserved:true,error_visible:true,retry_works:true};
    }finally{await page.close();}
  });
  for(const workspace of ['phylogeny','time','cloud','conflict'])await check(`E04-invalid-JSON-${workspace}`,async()=>{
    const page=await pageFor(workspace);
    try{
      await page.locator('[data-settings-target="export"]').click();const before=await capture(page);
      await page.locator('#import-figure-config').setInputFiles({name:'bad-json.json',mimeType:'application/json',buffer:Buffer.from('{broken-json}')});
      await page.waitForFunction(()=>$('message').classList.contains('error'));
      assert(await page.locator('#message').isVisible());assert.equal(await page.locator('#message').getAttribute('role'),'alert');await unchanged(page,before);
      if(output&&workspace==='cloud')await page.screenshot({path:`${output}/visible-error-export-tab.png`});
      return {error_visible_in_current_tab:true,configuration_preserved:true};
    }finally{await page.close();}
  });
  for(const kind of ['cancel','deadline'])await check(`E03-${kind}-and-busy`,async()=>{
    const page=await pageFor(),before=await capture(page);
    try {
      const result=await page.evaluate(async({kind,replacement})=>{
        const originalParse=parseNewickAsync,originalTimer=setTimeout;
        // Force a deterministic long preparation window; the real parser and
        // the real cancellation/timeout path still execute with their signal.
        parseNewickAsync=async(...args)=>{await new Promise(r=>originalTimer(r,100));checkScienceCancellation();return originalParse(...args);};
        if(kind==='deadline')globalThis.setTimeout=(fn,ms,...args)=>originalTimer(fn,ms===600000?20:ms,...args);
        try {
          const pending=PhyloRenderAgent.loadFigure({workspace:'conflict',main_tree:{content:replacement},comparison_tree:{content:replacement}}).then(()=>null,e=>({message:e.message,code:e.code}));
          await new Promise(r=>originalTimer(r,10));
          const busy=await PhyloRenderAgent.loadFigure({workspace:'phylogeny',main_tree:{content:'(X:1,Y:1);'}}).then(()=>null,e=>e.code);
          const exportBusy=await PhyloRenderAgent.exportConfiguration().then(()=>null,e=>e.code);
          if(kind==='cancel')$('tree-loading-cancel').click();
          return {rejection:await pending,busy,exportBusy,workers:PhyloRenderInputTasks.activeCount};
        }finally{parseNewickAsync=originalParse;globalThis.setTimeout=originalTimer;}
      },{kind,replacement});
      assert(result.rejection);assert.equal(result.busy,'FIGURE_BUSY');assert.equal(result.exportBusy,'FIGURE_BUSY');assert.equal(result.workers,0);
      if(kind==='deadline')assert.equal(result.rejection.code,'DEADLINE_EXCEEDED');await unchanged(page,before);
      return {...result,entire_config_restored:true};
    }finally{await page.close();}
  });
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({cases:records.length,records,errors}));
}finally{
  await runtime.close();if(output)await writeFile(`${output}/results.json`,JSON.stringify({records,errors},null,2)+'\n');
}
