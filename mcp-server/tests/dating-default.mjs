import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';
const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${runtime.demoPageUrl}?workspace=time`);
  await page.evaluate(() => window.PhyloRenderReady);
  const audit = await page.evaluate(async () => {
    const figure = await window.PhyloRenderAgent.currentFigure();
    return { mode: state.workspaceMode, tips: document.querySelectorAll('.tip-label').length,
      hpd: document.querySelectorAll('.time-hpd').length,
      rootAge: buildTimeTreeProfile(structuredClone(state.root)).rootAge,
      parsedSourceUnchanged: document.querySelector('#newick-input').value === PhyloRenderDatingExample.content,
      hanText: [...document.querySelectorAll('#tree-svg text')].filter(el => /\p{Script=Han}/u.test(el.textContent)).map(el => el.textContent),
      unit: document.querySelector('#time-source-unit').value,
      outgroup: state.root.outgroupChildId ?? null,
      svg: await serializeRenderedSvg(), time: figure.report.time };
  });
  assert.equal(audit.mode, 'time');
  assert.equal(audit.tips, 27);
  assert.ok(audit.hpd >= 25);
  assert.ok(Math.abs(audit.rootAge - 74.8289502975337) < 1e-8);
  assert.equal(audit.parsedSourceUnchanged, true);
  assert.equal(audit.unit, 'mya');
  assert.equal(audit.outgroup, null);
  assert.deepEqual(audit.hanText, [], 'exported figure text must not contain Chinese');
  assert.deepEqual(errors, []);
  if (process.argv[2]) {
    await mkdir(process.argv[2], { recursive: true });
    await writeFile(`${process.argv[2]}/03_DefaultDating.svg`, audit.svg);
    await page.screenshot({ path: `${process.argv[2]}/04_DefaultDating.png` });
    await page.locator('#tree-svg').screenshot({ path: `${process.argv[2]}/08_EnglishFigure.png` });
    await writeFile(`${process.argv[2]}/05_DatingAudit.json`, JSON.stringify({ ...audit, svg: undefined }, null, 2));
  }
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  assert.equal(await page.evaluate(() => Boolean(state.root)), false);
  console.log('PASS default Dating: complete 27-tip clade, original crown age/HPD, Ma units, independent agent startup');
} finally { await runtime.close(); }
