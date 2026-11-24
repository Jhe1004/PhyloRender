import os from 'node:os';
import assert from 'node:assert/strict';
import {createRuntime} from '../src/runtime.mjs';
import {loadFullOrdinaryFixture} from './full-ordinary-fixture.mjs';

const runtime=await createRuntime();
try {
  const page=await runtime.renderer.browser.newPage({viewport:{width:1200,height:1000}});
  await loadFullOrdinaryFixture(page, runtime);
  const comparison=await page.evaluate(async()=>{
    await window.PhyloRenderEnsureFonts();
    // This comparison calibrates one historical geometry, not current defaults.
    $('tip-font-size').value='17';$('tip-spacing').value='18';state.tipSpacingEm=18/17;state.automaticTipSpacing=false;
    const updatedLeader=leaderVisualCost, updatedFont=nodeLabelFontCost;
    const updatedFineSlots=fineLabelSlotCandidates;
    const updatedFloor=$('support-min-size').value;
    const inspect=()=>{
      const labels=[...document.querySelectorAll('.supports [data-label-id]')].map(e=>({
        id:e.dataset.labelId,length:+e.dataset.leaderPlanLength,font:+e.getAttribute('font-size')}));
      const segments=[...document.querySelectorAll('.node-label-arrow')].map(e=>({labelId:e.dataset.leaderId,
        x1:+e.getAttribute('x1'),y1:+e.getAttribute('y1'),x2:+e.getAttribute('x2'),y2:+e.getAttribute('y2')}));
      return {labels,totalLength:labels.reduce((s,l)=>s+l.length,0),long:labels.filter(l=>l.length>40),
        max:Math.max(...labels.map(l=>l.length)),collisions:+$('collision-count').textContent,
        crossings:leaderCrossingPairs(segments),floor:nodeLabelFontSettings().minimum};
    };
    try {
      fineLabelSlotCandidates=()=>[];
      $('support-min-size').value='16'; // Historical 12-pt-floor baseline.
      leaderVisualCost=plan=>{const u=Math.max(0,plan.length)/MIN_NODE_ARROW_LENGTH;return plan.crossings*1000+10*u+10*u*u+100*Math.max(0,u-2)**2;};
      nodeLabelFontCost=(font,preferred,minimum)=>{if(!Number.isFinite(font)||font<minimum-1e-7)return Infinity;const u=Math.max(0,1-font/preferred)/.05;return 10*u+10*u*u;};
      await renderTree({fontReady:true});
      const before=inspect();
      leaderVisualCost=updatedLeader;nodeLabelFontCost=updatedFont;
      fineLabelSlotCandidates=updatedFineSlots;
      $('support-min-size').value=updatedFloor;
      await renderTree({fontReady:true});
      return {before,after:inspect()};
    } finally {leaderVisualCost=updatedLeader;nodeLabelFontCost=updatedFont;fineLabelSlotCandidates=updatedFineSlots;$('support-min-size').value=updatedFloor;}
  });
  assert.equal(comparison.after.collisions,0);
  assert.equal(comparison.after.crossings.length,0);
  assert.ok(comparison.after.labels.every(l=>l.font>=comparison.after.floor));
  console.log(JSON.stringify({before:comparison.before.long,after:comparison.after.long}));
  assert.ok(comparison.after.totalLength<comparison.before.totalLength,
    'stronger long-leader penalty must actually shorten leaders on the calibration tree');
  assert.ok(comparison.after.long.length<=comparison.before.long.length);
  const changes=comparison.after.labels.map(l=>({...l,before:comparison.before.labels.find(b=>b.id===l.id).length}))
    .filter(l=>l.length<l.before-.1).sort((a,b)=>(b.before-b.length)-(a.before-a.length));
  console.log(JSON.stringify({changes,beforeTotal:comparison.before.totalLength,afterTotal:comparison.after.totalLength,
    beforeLong:comparison.before.long.length,afterLong:comparison.after.long.length,
    collisions:comparison.after.collisions,crossings:comparison.after.crossings,floor:comparison.after.floor}));
  const oldTarget=comparison.before.labels.reduce((longest,label)=>label.length>longest.length?label:longest);
  const newTarget=comparison.after.labels.find(label=>label.id===oldTarget.id);
  assert.ok(oldTarget.length>60 && newTarget.length<oldTarget.length*.6,
    'the longest historical leader must be shortened substantially');
  console.log(JSON.stringify({longestHistoricalLeader:{before:oldTarget,after:newTarget}}));
  await page.evaluate(id=>{
    const target=document.querySelector(`[data-label-id="${id}"]`),copy=target.ownerSVGElement.cloneNode(true);
    copy.setAttribute('viewBox',`${+target.dataset.nodeX-160} ${+target.dataset.nodeY-100} 470 290`);
    copy.setAttribute('width','1175');copy.setAttribute('height','725');
    document.body.replaceChildren(copy);document.body.style.margin='0';
  },oldTarget.id);
  await page.screenshot({path:os.tmpdir() + '/phylorender-leader-cost-calibration.png',clip:{x:0,y:0,width:1175,height:725}});
} finally {await runtime.close();}
