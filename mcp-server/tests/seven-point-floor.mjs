import os from 'node:os';
import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
import assert from 'node:assert/strict';
import {createRuntime} from '../src/runtime.mjs';
import {MCP_PUBLICATION_DEFAULT_OPTIONS} from '../src/schemas.mjs';
import {loadFullOrdinaryFixture} from './full-ordinary-fixture.mjs';

equalU(MCP_PUBLICATION_DEFAULT_OPTIONS.typography.nodes.minimum_size_u,units.ptToDrawing(7));
const runtime=await createRuntime();
try {
  const page=await runtime.renderer.browser.newPage({viewport:{width:1200,height:900}});
  await loadFullOrdinaryFixture(page, runtime);
  const result=await page.evaluate(async()=>{
    await window.PhyloRenderEnsureFonts();await renderTree({fontReady:true});
    const labels=[...document.querySelectorAll('.supports [data-label-id]')].map(e=>({
      id:e.dataset.labelId,text:e.textContent,pt:+e.getAttribute('font-size')*.75,length:+e.dataset.leaderPlanLength}));
    const lines=[...document.querySelectorAll('.node-label-arrow')].map(e=>({labelId:e.dataset.leaderId,
      x1:+e.getAttribute('x1'),y1:+e.getAttribute('y1'),x2:+e.getAttribute('x2'),y2:+e.getAttribute('y2')}));
    return {floor:Number($('support-min-size').value)*.75,display:$('support-min-size-number').value,
      preferred:nodeLabelFontSettings().preferred*.75,labels,collisions:+$('collision-count').textContent,
      crossings:leaderCrossingPairs(lines)};
  });
  assert.ok(Math.abs(result.floor-7)<1e-6);
  assert.ok(Math.abs(Number(result.display)-units.ptToDrawing(7))<.011);
  assert.equal(result.preferred,13.5);
  assert.ok(result.labels.every(l=>l.pt>=7-1e-6),'never violate the user floor');
  assert.equal(result.collisions,0);assert.equal(result.crossings.length,0);
  assert.ok(result.labels.filter(l=>l.pt>7.25).length>result.labels.length*.5,'the floor is not a target font size');
  const compactPreferred=result.labels.find(l=>l.length<20 && l.pt===result.preferred);
  assert.ok(compactPreferred,
    'a compact slot must retain the preferred readable size instead of shrinking toward the floor');
  console.log(JSON.stringify({floor:result.floor,preferred:result.preferred,
    labels:result.labels.length,atFloor:result.labels.filter(label=>label.pt<=7.001).length,
    compactPreferred,collisions:result.collisions,crossings:result.crossings.length}));
  await page.evaluate(()=>{
    const target=document.querySelector('[data-label-id="e15"]'),copy=target.ownerSVGElement.cloneNode(true);
    copy.setAttribute('viewBox',`${+target.dataset.nodeX-160} ${+target.dataset.nodeY-100} 470 290`);
    copy.setAttribute('width','1175');copy.setAttribute('height','725');
    document.body.replaceChildren(copy);document.body.style.margin='0';
  });
  await page.screenshot({path:os.tmpdir() + '/phylorender-seven-point-floor.png',clip:{x:0,y:0,width:1175,height:725}});
} finally {await runtime.close();}
