import os from 'node:os';
import assert from 'node:assert/strict';
import {createRuntime} from '../src/runtime.mjs';
import {loadFullOrdinaryFixture} from './full-ordinary-fixture.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({viewport:{width:1200,height:1000}});
  await loadFullOrdinaryFixture(page, runtime);
  // Preserve the original tip geometry and 12-pt-floor regression; stage 110
  // default readability and the new 7-pt floor each have separate tests.
  await page.evaluate(async () => {await window.PhyloRenderEnsureFonts();
    $('tip-font-size').value='17';$('tip-spacing').value='18';state.tipSpacingEm=18/17;state.automaticTipSpacing=false;
    $('support-min-size').value='16';await renderTree({fontReady:true});});
  const result = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.supports [data-label-id]')].map(e => ({
      id:e.dataset.labelId, text:e.textContent, font:+e.getAttribute('font-size'),
      length:+e.dataset.leaderPlanLength, crossings:+e.dataset.leaderPlanCrossings,
      ink:JSON.parse(e.dataset.layoutInkBox),
    }));
    const segments=[...document.querySelectorAll('.node-label-arrow')].map(e=>({labelId:e.dataset.leaderId,
      x1:+e.getAttribute('x1'),y1:+e.getAttribute('y1'),x2:+e.getAttribute('x2'),y2:+e.getAttribute('y2'),
      bridged:e.dataset.crossingsBridged==='true',halo:Boolean(document.querySelector(`[data-leader-halo-id="${CSS.escape(e.dataset.leaderId)}"]`))}));
    return {labels, crossings:leaderCrossingPairs(segments), floor:nodeLabelFontSettings().minimum, preferred:nodeLabelFontSettings().preferred,
      maximumLeaderLength:PhyloRenderLabelGeometry.MAX_PHYLOGENY_LABEL_LEADER_LENGTH,
      collisions:+$('collision-count').textContent,segments};
  });
  assert.ok(result.labels.every(r => r.font >= result.floor && r.font <= result.preferred));
  assert.equal(result.collisions,0);
  assert.ok(result.crossings.length <= 1,
    'at the historical 12-pt floor, at most one soft leader/leader crossing may remain');
  const targets = ['e306','e309'].map(id=>result.labels.find(r=>r.id===id));
  assert.ok(targets.every(Boolean));
  assert.ok(targets.every(target=>target.length <= result.maximumLeaderLength),
    'the 400 mm canvas keeps both Anemone leaders inside the shared readable-length ceiling');
  targets.filter(target=>target.crossings>0).forEach(target=>{
    const segment=result.segments.find(item=>item.labelId===target.id);
    assert.ok(segment?.bridged && segment?.halo,
      'a branch crossing caused by the compressed tree span must remain visibly bridged');
  });
  assert.ok(result.labels.filter(r=>r.font===result.preferred).length >= result.labels.length*.8,
    'do not shrink the whole tree just to obtain compact labels');
  console.log(JSON.stringify({targets,crossings:result.crossings,collisions:result.collisions,floor:result.floor,
    preferredSizeLabels:result.labels.filter(r=>r.font===result.preferred).length,total:result.labels.length}));
  await page.evaluate(() => {
    const target=document.querySelector('[data-label-id="e306"]');
    const root=target.ownerSVGElement;
    const copy=root.cloneNode(true);
    copy.setAttribute('viewBox',`${+target.dataset.nodeX-160} ${+target.dataset.nodeY-100} 470 290`);
    copy.setAttribute('width','1175');copy.setAttribute('height','725');
    document.body.replaceChildren(copy);document.body.style.margin='0';
  });
  await page.screenshot({path:os.tmpdir() + '/phylorender-font-leader-balance.png',clip:{x:0,y:0,width:1175,height:725}});
} finally {await runtime.close();}
