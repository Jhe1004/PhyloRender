import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const output=process.argv[2];
if(output)await mkdir(output,{recursive:true});
const runtime=await createRuntime();
const tree='(((A:1,B:1)95:1,(C:1,D:1)90:1)88:1,(E:2,F:2)85:1);';
try{
  const page=await runtime.renderer.browser.newPage({viewport:{width:1500,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>window.PhyloRenderAgent.ready());
  await page.evaluate(content=>window.PhyloRenderAgent.loadFigure({workspace:'phylogeny',main_tree:{name:'stretch.nwk',content}}),tree);
  await settleFigure(page);
  await page.locator('[data-settings-target="tree"]').click();
  await page.locator('#tip-layout-settings').evaluate(element=>{element.open=true;});
  assert.equal(await page.locator('#tip-spacing').isVisible(),false);
  assert.equal(await page.locator('#tip-spacing-number').isVisible(),true);
  assert.equal(await page.locator('#tree-horizontal-scale').isVisible(),false);
  assert.equal(await page.locator('#tree-horizontal-scale-number').isVisible(),true);
  assert.equal(await page.locator('#tip-spacing-value').textContent(),'100 %');
  assert.equal(await page.locator('#tree-horizontal-scale-value').textContent(),'100 %');
  const geometry=()=>page.evaluate(()=>({
    tips:[...document.querySelectorAll('#tree-svg .tip-label')].map(element=>({name:element.textContent,x:Number(element.getAttribute('x')),y:Number(element.getAttribute('y')),size:getComputedStyle(element).fontSize})),
    plotWidth:state.currentLayoutInfo.plotWidth,
    support:[...document.querySelectorAll('#tree-svg .support-label')].map(element=>element.textContent),
    source:state.sourceText,
  }));
  const baseline=await geometry();
  await page.locator('#tip-spacing-number').fill('200');await page.locator('#tip-spacing-number').blur();await settleFigure(page);
  const vertical=await geometry();
  const span=rows=>Math.max(...rows.map(row=>row.y))-Math.min(...rows.map(row=>row.y));
  assert.ok(Math.abs(span(vertical.tips)/span(baseline.tips)-2)<1e-9,'200% vertical stretch must double the terminal span');
  assert.deepEqual(vertical.tips.map(row=>row.x),baseline.tips.map(row=>row.x),'vertical stretch must not move horizontal coordinates');
  assert.deepEqual(vertical.tips.map(row=>row.name),baseline.tips.map(row=>row.name),'vertical stretch must preserve terminal order and identity');
  assert.deepEqual(vertical.tips.map(row=>row.size),baseline.tips.map(row=>row.size),'vertical stretch must not change type size');
  assert.deepEqual(vertical.support,baseline.support,'vertical stretch must preserve support values');
  assert.equal(vertical.source,baseline.source,'vertical stretch must not modify source tree text');
  assert.equal(vertical.plotWidth,baseline.plotWidth,'vertical stretch must not alter branch width');
  await page.locator('#tree-horizontal-scale-number').fill('150');await page.locator('#tree-horizontal-scale-number').blur();await settleFigure(page);
  const horizontal=await geometry();
  assert.ok(Math.abs(horizontal.plotWidth/vertical.plotWidth-1.5)<1e-9,'150% horizontal stretch must multiply only the plot width');
  assert.ok(Math.abs(span(horizontal.tips)-span(vertical.tips))<1e-9,'horizontal stretch must not alter the terminal span');
  assert.deepEqual(horizontal.tips.map(row=>row.name),baseline.tips.map(row=>row.name));
  await page.locator('[data-settings-target="tips"]').click();
  assert.equal(await page.locator('#tip-spacing-number').isVisible(),false,'vertical tree geometry no longer belongs to the sample-name page');
  await page.evaluate(()=>switchWorkspaceMode('time'));await page.locator('[data-settings-target="tree"]').click();
  await page.locator('#tip-layout-settings').evaluate(element=>{element.open=true;});
  assert.equal(await page.locator('#tip-spacing-number').isVisible(),true,'Dating tree retains vertical stretch on the tree page');
  assert.equal(await page.locator('#tree-horizontal-scale-number').isVisible(),true,'Dating tree retains horizontal stretch on the tree page');
  await page.evaluate(()=>switchWorkspaceMode('cloud'));await page.locator('[data-settings-target="tree"]').click();
  await page.locator('#tip-layout-settings').evaluate(element=>{element.open=true;});
  assert.equal(await page.locator('#tip-spacing-number').isVisible(),true,'cloud tree retains its vertical stretch on the tree page');
  assert.equal(await page.locator('#tree-horizontal-scale-number').isVisible(),false,'cloud time-axis width remains controlled by its existing background/output path');
  await page.evaluate(()=>switchWorkspaceMode('conflict'));await page.locator('[data-settings-target="tree"]').click();
  await page.locator('#tip-layout-settings').evaluate(element=>{element.open=true;});
  assert.equal(await page.locator('#tip-spacing-number').isVisible(),true,'conflict view retains its vertical stretch on the tree page');
  assert.equal(await page.locator('#tree-horizontal-scale-number').isVisible(),false,'conflict view keeps its independent horizontal comparison geometry');
  assert.deepEqual(errors,[]);
  const result={passed:true,ordinary:{baseline,vertical,horizontal,vertical_span_ratio:span(vertical.tips)/span(baseline.tips),horizontal_width_ratio:horizontal.plotWidth/vertical.plotWidth},
    visibility:{phylogeny:['vertical','horizontal'],time:['vertical','horizontal'],cloud:['vertical'],conflict:['vertical']},errors};
  if(output){
    await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));
    await page.locator('[data-workspace-mode="phylogeny"]').click();await page.locator('[data-settings-target="tree"]').click();
    await page.locator('#tip-layout-settings').evaluate(element=>{element.open=true;});
    await page.screenshot({path:path.join(output,'tree-stretch-workbench.png'),fullPage:true});
    await writeFile(path.join(output,'tree-stretch.svg'),await page.evaluate(()=>serializeRenderedSvg()));
  }
  console.log('PASS paired tree stretch controls, independent geometry and scientific-state preservation');
}finally{await runtime.close();}
