import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRuntime} from '../src/runtime.mjs';
const output=process.argv[2],runtime=await createRuntime();
const file=(name,content)=>({name,mimeType:'text/plain',buffer:Buffer.from(content)});
const tree='(((A:1,B:1)95:1,C:2)90:1,D:3);';
try{
  const page=await runtime.renderer.browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[],reports=[];
  page.on('pageerror',error=>errors.push(error.message));
  const widthFit=async()=>{
    await page.waitForFunction(()=>state.viewportFitMode==='width'&&
      Math.abs(state.currentSvgSize.width*state.zoom-($('tree-viewport').clientWidth-48))<1);
    assert.equal(await page.locator('#zoom-width').getAttribute('aria-pressed'),'true');
    const metrics=await page.evaluate(()=>({mode:state.workspaceMode,zoom:state.zoom,
      svgWidth:state.currentSvgSize.width,availableWidth:$('tree-viewport').clientWidth-48,
      horizontalOverflow:$('tree-viewport').scrollWidth-$('tree-viewport').clientWidth}));
    assert.ok(metrics.horizontalOverflow<=1);return metrics;
  };
  const hash=async()=>createHash('sha256').update(await page.evaluate(()=>serializeRenderedSvg())).digest('hex');
  await page.goto(runtime.demoPageUrl);await page.evaluate(()=>window.PhyloRenderReady);
  reports.push(await widthFit());
  const original=await hash();
  if(output){
    await page.screenshot({path:path.join(output,'01_DefaultCloudFitWidth.png')});
    const svg=await page.evaluate(()=>serializeRenderedSvg());
    await writeFile(path.join(output,'02_DefaultCloud.svg'),svg);
    const size=await page.evaluate(()=>state.currentSvgSize);
    const preview=await runtime.renderer.browser.newPage({viewport:{width:Math.ceil(size.width),height:Math.ceil(size.height)}});
    await preview.setContent(`<body style="margin:0">${svg}</body>`);await preview.evaluate(()=>document.fonts.ready);
    await preview.screenshot({path:path.join(output,'03_ExportPreview.png')});await preview.close();
  }
  await page.setViewportSize({width:1200,height:1000});await widthFit();
  const beforeCollapse=await page.evaluate(()=>state.zoom);
  await page.locator('#panel-divider').press('Enter');await widthFit();
  assert.ok(await page.evaluate(()=>state.zoom)>beforeCollapse);
  if(output)await page.screenshot({path:path.join(output,'04_CollapsedFitWidth.png')});
  await page.getByRole('button',{name:'展开制图工作台',exact:true}).click();await widthFit();
  await page.locator('#zoom-in').click();
  const manual=await page.evaluate(()=>state.zoom);
  assert.equal(await page.evaluate(()=>state.viewportFitMode),'manual');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>state.zoom),manual,'manual zoom remains usable before resizing');
  await page.setViewportSize({width:1100,height:900});
  await widthFit();
  await page.locator('#zoom-in').click();
  await page.locator('#panel-divider').press('Enter');await widthFit();
  await page.locator('#zoom-in').click();
  await page.getByRole('button',{name:'展开制图工作台',exact:true}).click();await widthFit();
  await page.locator('#zoom-fit').click();
  assert.equal(await page.evaluate(()=>state.viewportFitMode),'window');
  assert.equal(await page.locator('#zoom-fit').getAttribute('aria-pressed'),'true');
  await page.locator('#zoom-reset').click();assert.equal(await page.evaluate(()=>state.zoom),1);
  await page.locator('#zoom-width').click();await widthFit();
  assert.equal(await hash(),original,'view operations must preserve exported SVG');
  const empty=await runtime.renderer.browser.newPage();
  await empty.goto(runtime.renderer.agentPageUrl);await empty.evaluate(()=>window.PhyloRenderReady);
  await empty.locator('#zoom-reset').click();
  await empty.evaluate(()=>switchWorkspaceMode('time'));
  assert.equal(await empty.evaluate(()=>state.viewportFitMode),'width');
  assert.equal(await empty.locator('#zoom-width').getAttribute('aria-pressed'),'true');
  await empty.close();
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>window.PhyloRenderReady);
  for(const mode of ['phylogeny','time']){
    await page.evaluate(mode=>switchWorkspaceMode(mode),mode);
    await page.evaluate(content=>window.PhyloRenderAgent.loadFigure({main_tree:{name:'fixture.nwk',content},
      rooting:{outgroup:null},options:{time:{source_unit:'mya',display_unit:'mya'}}}),tree);
    reports.push(await widthFit());
    await page.locator('#zoom-in').click();
  }
  await page.evaluate(()=>switchWorkspaceMode('conflict'));await widthFit();
  await page.locator('#zoom-in').click();
  await page.locator('#conflict-nuclear-file').setInputFiles(file('primary.nwk',tree));
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  await page.locator('#conflict-plastid-file').setInputFiles(file('comparison.nwk',tree));
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  reports.push(await widthFit());
  await page.evaluate(()=>switchWorkspaceMode('cloud'));await widthFit();
  await page.locator('#zoom-in').click();
  await page.evaluate(()=>{$('cloud-show-gene').checked=false;$('cloud-species-method').value='coalescent';});
  await page.locator('#cloud-species-file').setInputFiles(file('species.nwk',tree));
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  reports.push(await widthFit());
  for(const mode of ['time','phylogeny','conflict','cloud']){
    await page.locator('#zoom-reset').click();
    await page.evaluate(mode=>switchWorkspaceMode(mode),mode);
    await page.evaluate(async()=>{await refreshTaxonNameRecognition({force:true,deferRender:true});
      await ensureFigureFontsReady();await renderTree({fontReady:true});});
    await widthFit();const before=await hash();
    await page.locator('#zoom-in').click();
    await page.setViewportSize({width:mode==='time'||mode==='conflict'?1250:1350,height:900});await widthFit();
    await page.locator('#zoom-fit').click();
    await page.setViewportSize({width:mode==='time'||mode==='conflict'?1300:1400,height:950});await widthFit();
    await page.locator('#zoom-reset').click();
    await page.locator('#panel-divider').press('ArrowRight');await widthFit();
    await page.locator('#zoom-in').click();
    await page.locator('#zoom-width').click();await widthFit();assert.equal(await hash(),before);
  }
  assert.deepEqual(errors,[]);
  if(output)await writeFile(path.join(output,'05_Validation.json'),JSON.stringify({passed:true,reports,errors,
    manualZoomAvailable:true,alwaysFitOnWindowResize:true,alwaysFitOnPanelResize:true,svgUnchanged:true},null,2));
  console.log('PASS default width fitting, imports, mode switches, panel resizing, manual zoom, and unchanged SVG.');
}finally{await runtime.close();}
