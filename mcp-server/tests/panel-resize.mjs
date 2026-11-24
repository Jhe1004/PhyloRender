import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRuntime} from '../src/runtime.mjs';
const output=process.argv[2],runtime=await createRuntime();
try{
  const page=await runtime.renderer.browser.newPage({viewport:{width:1600,height:1050}});
  const errors=[],requests=[],reports=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/api\/cloud-(date|phyparts)/.test(r.url()))requests.push(r.url());});
  await page.goto(runtime.demoPageUrl);await page.evaluate(()=>window.PhyloRenderReady);
  await page.getByRole('button',{name:'分组',exact:true}).click();
  await page.evaluate(()=>setZoom(state.zoom));
  const snapshot=async()=>{
    const result=await page.evaluate(async()=>({svg:await serializeRenderedSvg(),
      root:JSON.stringify(state.cloud.speciesRoot),stats:state.cloud.phyPartsTable&&JSON.stringify([...state.cloud.phyPartsTable.rows])}));
    return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,typeof v==='string'?createHash('sha256').update(v).digest('hex'):v]));
  };
  const before=await snapshot();
  const widthFit=async()=>{
    await page.waitForFunction(()=>state.viewportFitMode==='width'&&
      Math.abs(state.currentSvgSize.width*state.zoom-($('tree-viewport').clientWidth-48))<1);
    assert.equal(await page.locator('#zoom-width').getAttribute('aria-pressed'),'true');
  };
  const width=()=>page.locator('#settings-controls').evaluate(e=>e.getBoundingClientRect().width);
  const divider=page.locator('#panel-divider');
  const restoreButton=page.getByRole('button',{name:'展开制图工作台',exact:true});
  const dragTo=async target=>{
    const box=await divider.boundingBox();const start=await width();
    await page.mouse.move(box.x+box.width/2,box.y+120);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+target-start,box.y+120,{steps:8});await page.mouse.up();
  };
  assert.equal(await width(),320);
  assert.equal(await restoreButton.isVisible(),false);
  await dragTo(540);assert.equal(await width(),540);await widthFit();
  assert.equal(await divider.getAttribute('aria-valuenow'),'540');
  if(output)await page.screenshot({path:path.join(output,'01_左面板加宽.png')});
  await dragTo(250);assert.equal(await width(),280);
  if(output)await page.screenshot({path:path.join(output,'02_右侧画布加宽.png')});
  await dragTo(220);assert.equal(await width(),0);
  assert.equal(await divider.getAttribute('aria-valuenow'),'0');
  assert.equal(await page.locator('#settings-controls').evaluate(e=>e.inert),true);
  assert.equal(await page.locator('#settings-controls').isVisible(),false);
  assert.equal(await restoreButton.isVisible(),true);
  assert.equal((await divider.boundingBox()).width,22);
  await widthFit();
  assert.deepEqual(await snapshot(),before,'collapsing must not modify the figure');
  if(output)await page.screenshot({path:path.join(output,'06_工作台收起.png')});
  await page.reload();await page.evaluate(()=>window.PhyloRenderReady);assert.equal(await width(),0);
  await page.evaluate(()=>setZoom(1));
  assert.equal(await restoreButton.isVisible(),true);
  await restoreButton.click();assert.equal(await width(),280);await widthFit();
  assert.equal(await restoreButton.isVisible(),false);
  await divider.press('Enter');assert.equal(await width(),0);
  await restoreButton.focus();await restoreButton.press('Space');assert.equal(await width(),280);
  assert.equal(await divider.evaluate(e=>document.activeElement===e),true);
  await divider.press('Enter');assert.equal(await width(),0);
  await page.setViewportSize({width:600,height:950});
  await page.waitForFunction(()=>!document.getElementById('settings-controls').inert);
  assert.equal(await page.locator('#settings-controls').isVisible(),true);
  assert.equal(await restoreButton.isVisible(),false);
  await page.setViewportSize({width:1600,height:1050});
  await page.waitForFunction(()=>document.getElementById('settings-controls').inert);
  assert.equal(await width(),0);
  await dragTo(30);assert.equal(await width(),0,'small movements cannot accidentally reopen');
  await dragTo(60);assert.ok(await width()>=280);
  assert.equal(await page.locator('#settings-controls').evaluate(e=>e.inert),false);
  await divider.press('Enter');assert.equal(await width(),0);
  await divider.press('ArrowRight');assert.ok(await width()>=280);
  await divider.press('Home');await divider.press('ArrowLeft');assert.equal(await width(),0);
  await divider.dblclick({position:{x:4,y:100}});assert.equal(await width(),320);
  const collapseBox=await divider.boundingBox();
  await page.mouse.move(collapseBox.x+4,collapseBox.y+100);await page.mouse.down();
  await page.mouse.move(collapseBox.x-120,collapseBox.y+100,{steps:8});assert.equal(await width(),0);
  await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await width(),320);
  await dragTo(1500);assert.equal(await width(),1200);
  const workspace=await page.locator('#tree-workspace').boundingBox();assert.ok(workspace.width>=240);
  await divider.press('Home');assert.equal(await width(),280);
  await divider.press('ArrowRight');assert.equal(await width(),290);
  await divider.press('Shift+ArrowRight');assert.equal(await width(),330);
  await widthFit();
  assert.deepEqual(await snapshot(),before,'dragging/keyboard resize must not change SVG, topology or statistics');
  await page.reload();await page.evaluate(()=>window.PhyloRenderReady);assert.equal(await width(),330);
  await page.evaluate(()=>setZoom(state.zoom));
  await divider.dblclick({position:{x:4,y:100}});assert.equal(await width(),320);
  const box=await divider.boundingBox();
  await page.mouse.move(box.x+4,box.y+100);await page.mouse.down();
  await page.mouse.move(box.x+200,box.y+100);await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await width(),320);
  assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('panel-resizing')),false);
  await dragTo(700);await page.setViewportSize({width:800,height:950});
  await page.waitForFunction(()=>document.getElementById('settings-controls').getBoundingClientRect().width===552);
  assert.equal(await width(),552); // 800 - 240 canvas - 8 divider.
  await page.setViewportSize({width:1600,height:1050});
  await page.waitForFunction(()=>document.getElementById('settings-controls').getBoundingClientRect().width===700);
  assert.equal(await width(),700);
  await page.setViewportSize({width:600,height:950});assert.equal(await divider.isVisible(),false);
  const mobile=await page.locator('#settings-controls').boundingBox();assert.equal(mobile.width,600);
  await page.setViewportSize({width:1600,height:1050});
  await page.waitForFunction(()=>document.getElementById('settings-controls').getBoundingClientRect().width===700);
  assert.equal(await width(),700);
  const current=await snapshot();
  for(const mode of ['time','conflict','phylogeny','cloud']){
    await page.evaluate(mode=>switchWorkspaceMode(mode),mode);assert.equal(await width(),700);
    // Switching mode can start an asynchronous scientific-name refresh. Finish
    // it before comparing divider effects, rather than attributing that redraw
    // to the screen-only panel movement.
    await page.evaluate(async()=>{
      await refreshTaxonNameRecognition({force:true,deferRender:true});
      await ensureFigureFontsReady();await renderTree({fontReady:true});
      setZoom(state.zoom);
    });
    const modeBefore=await snapshot();
    await divider.press('ArrowLeft');assert.equal(await width(),690);await widthFit();
    await divider.press('ArrowRight');assert.equal(await width(),700);
    await divider.press('Enter');assert.equal(await width(),0);
    assert.equal(await restoreButton.isVisible(),true);
    await restoreButton.click();assert.equal(await width(),700);await widthFit();
    assert.deepEqual(await snapshot(),modeBefore,`${mode}: panel resizing cannot change SVG, tree or statistics`);
    reports.push({mode,width:await width()});
  }
  const restored=await snapshot();assert.equal(restored.root,current.root);assert.equal(restored.stats,current.stats);
  if(output){
    const svg=await page.evaluate(()=>serializeRenderedSvg());
    await writeFile(path.join(output,'04_真实云树_拖动后导出.svg'),svg);
    const size=await page.evaluate(()=>state.currentSvgSize);
    const preview=await runtime.renderer.browser.newPage({viewport:{width:Math.ceil(size.width),height:Math.ceil(size.height)}});
    await preview.setContent(`<body style="margin:0">${svg}</body>`);await preview.evaluate(()=>document.fonts.ready);
    await preview.screenshot({path:path.join(output,'05_真实SVG验证.png')});await preview.close();
  }
  if(output)await writeFile(path.join(output,'03_分隔线验证.json'),JSON.stringify({passed:true,reports,errors,requests,
    svgByteIdentical:true,automaticWidthFit:true,minimumExpandedControls:280,collapsedControls:0,
    collapseOvershoot:48,collapsedStripWidth:22,clickRestore:true,keyboardRestore:true,
    minimumCanvas:240,persistent:true},null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS shared draggable divider, collapse/restore, pointer/keyboard/reset/cancel, persistence, responsive bounds, automatic width fit, unchanged SVG/tree/statistics');
}finally{await runtime.close();}
