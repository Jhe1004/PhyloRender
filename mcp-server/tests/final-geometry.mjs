import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRuntime} from '../src/runtime.mjs';
import {loadFullOrdinaryFixture} from './full-ordinary-fixture.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({deviceScaleFactor:2});
  await loadFullOrdinaryFixture(page, runtime);
  // The saved failure coordinates were recorded with the pre-110 tip geometry.
  // Freeze that independent input so this remains a node-label refinement test.
  await page.evaluate(async () => { await window.PhyloRenderEnsureFonts();
    $('tip-font-size').value='17';$('tip-spacing').value='18';state.tipSpacingEm=18/17;state.automaticTipSpacing=false;
    $('support-min-size').value='16';await renderTree({fontReady:true}); });
  const fixture = JSON.parse(await readFile(new URL('./fixtures/remote-clematis-labels.json',import.meta.url),'utf8'));
  const result = await page.evaluate(fixture => {
    for (const rect of state.labelPlacements) {
      const id = rect.id ?? rect.labelId, saved = fixture.find(r => r.id === id);
      if (!saved) continue;
      const el = document.querySelector(`[data-label-id="${id}"]`);
      el.setAttribute('x',saved.x); el.setAttribute('y',saved.y); el.setAttribute('font-size',saved.font);
      const b = el.getBBox(); Object.assign(rect,{x:b.x,y:b.y,width:b.width,height:b.height});
    }
    const points = [...document.querySelectorAll('.nodes circle')].map(e => ({x:+e.getAttribute('cx'),y:+e.getAttribute('cy')}));
    const group = document.querySelector('.supports');
    const before = document.querySelector('[data-label-id="e278"]').getAttribute('y');
    const lines = refineReadableNodeLabels(state.labelPlacements,group,document.querySelector('.leaders'),
      document.querySelector('.tips'),state.branchSegments,points,'support',true);
    const target = document.querySelector('[data-label-id="e278"]');
    return {before:+before,after:+target.getAttribute('y'),length:+target.dataset.leaderPlanLength,
      crossings:+target.dataset.leaderPlanCrossings,moves:+group.dataset.compactMoves,
      collisions:countResidualCollisions(state.labelPlacements,state.branchSegments,
        [...document.querySelector('.tips').children].map(e=>e.getBBox()),lines),
      floor:Math.min(...state.labelPlacements.map(r=>+document.querySelector(`[data-label-id="${r.id??r.labelId}"]`).getAttribute('font-size'))),
      requiredFloor:+$('support-min-size').value};
  },fixture);
  assert.ok(result.before > 3000, 'replay the actual remote-label failure');
  assert.ok(result.after < 2960 && result.length < 25, 'recover the nearby slot');
  assert.equal(result.crossings,0);
  assert.equal(result.collisions,0);
  assert.ok(result.floor >= result.requiredFloor);
  console.log(JSON.stringify(result));
} finally { await runtime.close(); }
