import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createRuntime } from '../src/runtime.mjs';
import units from '../../figure-units.js';

const require = createRequire(import.meta.url);
const demo = require('../../defaults/dating-synthetic.js');
const runtime = await createRuntime();
const evidence = process.argv[2];
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], audit = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => PhyloRenderAgent.ready());
  const figure = { workspace: 'time', main_tree: { name: demo.name, content: demo.content }, options: { time: { source_unit: 'mya' } } };
  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), figure);
  assert.equal(await page.locator('.compact-point-stepper').count(), 11);
  assert.equal(await page.locator('.compact-point-control').count(), 7);
  const biologicalBefore = await page.evaluate(() => JSON.stringify(descendantInternalNodes(state.root).map(node => [node.tipNames, node.timeAge, node.timeHpd, node.length, node.support])));
  const ids = ['branch-width', 'tip-font-size', 'clade-font-size', 'scale-font-size', 'support-size', 'support-min-size', 'node-radius', ...['period', 'epoch', 'axis', 'unit'].map(type => `time-${type}-size`)];
  for (const id of ['support-size-number', 'support-min-size-number', 'node-radius-number']) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `${id} is shared by Dating figures`);
  }
  assert.equal(await page.locator('#time-legend-size').isVisible(), false, 'obsolete abbreviation-key control stays hidden');
  assert.equal(await page.locator('#time-key-size').isVisible(), false, 'obsolete figure-footer control stays hidden');
  for (const id of ids) {
    const legacy = !id.startsWith('time-');
    const numberId = `${id}-number`, buttonId = legacy ? id : numberId;
    const data = await page.evaluate(numberId => {
      const input = document.getElementById(numberId);
      return { page: input.closest('[data-settings-page]').dataset.settingsPage, before: Number(input.value), min: Number(input.min), max: Number(input.max), step: Number(input.step) };
    }, numberId);
    await page.locator(`[data-settings-target="${data.page}"]`).click();
    await page.evaluate(numberId => { for (let parent = document.getElementById(numberId).parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; }, numberId);
    const input = page.locator(`#${numberId}`);
    assert.equal(await input.isVisible(), true);
    const order = await input.locator('..').evaluate(stepper => [...stepper.children].filter(child => getComputedStyle(child).display !== 'none').map(child => child.tagName));
    assert.deepEqual(order, ['BUTTON', 'INPUT', 'BUTTON'], id);
    if (legacy) {
      assert.equal(await page.locator(`#${id}`).isVisible(), false, 'no visible legacy slider');
      assert.equal(await page.locator(`#${id}-value`).isVisible(), false, 'no duplicate size readout');
      assert.equal(await input.locator('xpath=ancestor::*[contains(@class,"numeric-card")][1]').locator('.numeric-scale').isVisible(), false);
    }
    await page.locator(`#${buttonId}-increase`).click();
    assert.ok(Math.abs(Number(await input.inputValue()) - data.before - data.step) < .011, `${id} plus`);
    await page.locator(`#${buttonId}-decrease`).click();
    assert.ok(Math.abs(Number(await input.inputValue()) - data.before) < .011, `${id} minus`);
    // Exercise arbitrary decimal input and both hard bounds using the same GUI.
    const requested = Number((data.min + (data.max - data.min) * .43).toFixed(3));
    await input.fill(String(requested)); await input.press('Tab');
    assert.ok(Math.abs(Number(await input.inputValue()) - requested) < .011, `${id} direct decimal input`);
    await input.fill(String(data.max)); await input.press('Tab');
    await page.locator(`#${buttonId}-increase`).click();
    assert.ok(Number(await input.inputValue()) <= data.max + .011, `${id} maximum`);
    await input.fill(String(data.min)); await input.press('Tab');
    await page.locator(`#${buttonId}-decrease`).click();
    assert.ok(Number(await input.inputValue()) >= data.min - .011, `${id} minimum`);
    await input.fill(String(data.before)); await input.press('Tab');
    audit.push({ id, ...data, order, decimalInput: true, bounds: true });
  }
  // The optional mixed-style group-name dialog uses the same drawing units.
  await page.evaluate(() => openCladeNameDialog(descendantInternalNodes(state.root)[1].id));
  await page.locator('.clade-segment-editor > summary').click();
  const segmentInput = page.locator('#clade-segment-1-size');
  assert.equal(await segmentInput.isVisible(), true);
  const inheritedSize = await page.evaluate(() => figureUnits.designToDrawing(Number($('clade-font-size').value)));
  assert.equal(await segmentInput.inputValue(), '');
  await page.locator('#clade-segment-1-size-increase').click();
  assert.ok(Math.abs(Number(await segmentInput.inputValue()) - inheritedSize - .25) < 1e-8);
  await page.locator('#clade-segment-1-size-decrease').click();
  assert.ok(Math.abs(Number(await segmentInput.inputValue()) - inheritedSize) < 1e-8);
  await segmentInput.fill('11.5');
  assert.ok(Math.abs(await page.evaluate(() => state.pendingCladeNameSegments[0].size) - units.drawingToDesign(11.5)) < 1e-8);
  await segmentInput.fill('');
  assert.equal(await page.evaluate(() => 'size' in state.pendingCladeNameSegments[0]), false, 'empty size retains inheritance');
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/05_SegmentSize.png` });
  }
  await page.locator('#cancel-clade-name').click();
  await page.evaluate(() => flushSettingsRender());
  const biologicalAfter = await page.evaluate(() => JSON.stringify(descendantInternalNodes(state.root).map(node => [node.tipNames, node.timeAge, node.timeHpd, node.length, node.support])));
  assert.equal(biologicalAfter, biologicalBefore);
  assert.deepEqual(errors, []);
  // A fresh reload remains the same full-fidelity figure through the MCP renderer.
  const configuration = await page.evaluate(() => PhyloRenderAgent.exportConfiguration());
  const web = await page.evaluate(async input => (await PhyloRenderAgent.loadFigure(input)).svg, configuration);
  const mcp = await runtime.renderer.render(configuration);
  const canonical = source => page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    doc.querySelectorAll('metadata').forEach(node => node.remove());
    doc.querySelectorAll('*').forEach(node => [...node.attributes].filter(attribute => attribute.name.startsWith('data-')).forEach(attribute => node.removeAttribute(attribute.name)));
    return new XMLSerializer().serializeToString(doc.documentElement);
  }, source);
  assert.equal(await canonical(web), await canonical(mcp.svg));
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.locator('[data-settings-target="tips"]').click();
    await page.locator('#tip-typography-section > summary').click();
    await page.screenshot({ path: `${evidence}/01_CompactSampleSize.png` });
    await page.locator('[data-settings-target="background"]').click();
    await page.locator('#time-background-section > summary').click();
    await page.screenshot({ path: `${evidence}/02_CompactTimeSizes.png` });
    await writeFile(`${evidence}/03_Dating.svg`, mcp.svg);
    await writeFile(`${evidence}/04_ControlAudit.json`, JSON.stringify({ audit, groupSegmentEditor: true, errors, webMcpParity: true, biologicalDataUnchanged: true }, null, 2));
  }
  console.log('PASS 11 Dating drawing-unit controls plus dynamic group-name segments, unchanged ages/HPD/branches and exact web/MCP SVG parity');
} finally { await runtime.close(); }
