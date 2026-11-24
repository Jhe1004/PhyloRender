import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createRuntime } from '../src/runtime.mjs';
import { settleFigure } from './settle-figure.mjs';

const require = createRequire(import.meta.url);
const demo = require('../../defaults/dating-synthetic.js');
const tree = '(O:3,((A_alpha:1,B_beta:1)90:1,(C_gamma:1,D_delta:1)80:1)85:1);';
const file = (name, content) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
const runtime = await createRuntime();
const evidence = process.argv[2];
const audits = [];
try {
  if (evidence) await mkdir(evidence, { recursive: true });
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => PhyloRenderAgent.ready());
  const snapshot = async () => {
    await settleFigure(page);
    return page.evaluate(async () => {
    await flushSettingsRender();
    const doc = new DOMParser().parseFromString(await serializeRenderedSvg(), 'image/svg+xml');
    doc.querySelectorAll('metadata').forEach(node => node.remove());
    return new XMLSerializer().serializeToString(doc.documentElement);
    });
  };
  const navigate = async (mode, expected) => {
    const before = await snapshot();
    const visible = await page.locator('.settings-nav button:visible').evaluateAll(buttons => buttons.map(button => button.dataset.settingsTarget));
    assert.deepEqual(visible, expected, `${mode} visible tabs`);
    for (const tab of expected) {
      await page.locator(`[data-settings-target="${tab}"]`).click();
      assert.equal(await page.locator('.controls').getAttribute('data-active-page'), tab);
      const sections = await page.locator('.controls > [data-settings-page]:visible').evaluateAll(elements => elements.map(element => element.dataset.settingsPage));
      assert.ok(sections.length > 0, `${mode}/${tab} must not be empty`);
      assert.ok(sections.every(section => section === tab), `${mode}/${tab} must not leak other settings`);
      assert.equal(await snapshot(), before, `${mode}/${tab} navigation preserves SVG`);
    }
    await page.locator('[data-settings-target="tips"]').click();
    const placement = await page.evaluate(() => Object.fromEntries([
      'tip-font-family', 'tip-font-size', 'tip-font-color', 'tip-follow-clade',
      'tip-italic-mode', 'tip-normalize-ranks', 'tip-font-bold', 'tip-label-map-file',
    ].map(id => [id, document.getElementById(id)?.closest('[data-settings-page]')?.dataset.settingsPage])));
    for (const [id, location] of Object.entries(placement)) assert.equal(location, 'tips', id);
    await page.locator('#tip-typography-section > summary').click();
    assert.equal(await page.locator('#tip-font-family').isVisible(), true);
    await page.locator('#tip-format-section > summary').click();
    assert.equal(await page.locator('#tip-italic-mode').isVisible(), true);
    const treePlacement = await page.evaluate(() => Object.fromEntries(['tip-spacing', 'automatic-tip-spacing-panel']
      .map(id => [id, document.getElementById(id)?.closest('[data-settings-page]')?.dataset.settingsPage])));
    assert.deepEqual(treePlacement, { 'tip-spacing': 'tree', 'automatic-tip-spacing-panel': 'tree' });
    await page.locator('[data-settings-target="tree"]').click();
    await page.locator('#tip-layout-settings > summary').click();
    assert.equal(await page.locator('#tip-spacing').isVisible(), false);
    assert.equal(await page.locator('#tip-spacing-number').isVisible(), true);
    await page.locator('[data-settings-target="tips"]').click();
    await page.locator('#tip-typography-section > summary').click();
    audits.push({ mode, visible, placement, svgPreserved: true });
    if (evidence) await page.screenshot({ path: `${evidence}/${mode}-sample-settings.png` });
  };
  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), { workspace: 'phylogeny', main_tree: { name: 'ordinary.tre', content: tree } });
  await navigate('phylogeny', ['data', 'tree', 'tips', 'labels', 'groups', 'export']);
  await page.locator('[data-settings-target="data"]').click();
  await page.locator('.tree-source-section > summary').click();
  assert.equal(await page.locator('#tree-source-title').textContent(), 'Primary Tree');
  assert.equal(await page.locator('#dating-import-step-1 .dating-import-step-heading').isVisible(), false);
  assert.equal(await page.locator('#time-input-section').isVisible(), false);
  await page.locator('[data-settings-target="tips"]').click();
  await page.locator('#tip-typography-section > summary').click();
  // The same live input/event handler still changes the figure after reparenting.
  const originalSize = await page.locator('#tip-font-size-number').inputValue();
  await page.locator('#tip-font-size-number').fill(String(units.ptToDrawing(16.5)));
  await page.evaluate(() => flushSettingsRender());
  equalU((await page.evaluate(() => PhyloRenderAgent.exportConfiguration())).options.typography.tips.size_u, units.ptToDrawing(16.5));
  await page.locator('#tip-font-size-number').fill(originalSize);

  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), { workspace: 'time', main_tree: { name: demo.name, content: demo.content }, options: { time: { source_unit: 'mya' } } });
  await navigate('time', ['data', 'tree', 'tips', 'labels', 'background', 'groups', 'export']);
  await page.locator('[data-settings-target="data"]').click();
  const datingImportPanel = page.locator('.tree-source-section');
  if (await datingImportPanel.getAttribute('open') === null) await datingImportPanel.locator('> summary').click();
  assert.equal(await page.locator('#tree-source-title').textContent(), 'Import Time Tree');
  assert.equal(await page.locator('#tree-source-subtitle').textContent(), 'Two-step import: tree file & time-scale calibration');
  assert.equal(await page.locator('#dating-import-step-1 .dating-import-step-heading').isVisible(), true);
  assert.equal(await page.locator('#time-input-section').isVisible(), true);
  assert.equal(await page.locator('#time-input-section').evaluate(element => element.closest('details.tree-source-section') !== null), true);
  assert.deepEqual(await page.locator('.tree-source-section .dating-import-step-heading strong').allTextContents(), ['Step 1 — Import Chronogram', 'Step 2 — Confirm Time Unit & Age Source']);
  await page.locator('#tree-file').setInputFiles(file(demo.name, demo.content));
  await page.locator('#tree-loading').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.tree-source-section').getAttribute('open') !== null, true, 'successful Dating import keeps the two-step panel open');
  assert.equal(await page.locator('#time-input-section').isVisible(), true, 'step 2 remains directly available after Dating import');
  const datedLocations = await page.evaluate(() => Object.fromEntries(['time-source-unit', 'time-age-source', 'time-show-ages', 'time-show-hpd', 'time-geology', 'time-period-size'].map(id => [id, document.getElementById(id)?.closest('[data-settings-page]')?.dataset.settingsPage])));
  assert.deepEqual(datedLocations, { 'time-source-unit': 'data', 'time-age-source': 'data', 'time-show-ages': 'labels', 'time-show-hpd': 'labels', 'time-geology': 'background', 'time-period-size': 'background' });
  if (evidence) await page.screenshot({ path: `${evidence}/time-import-two-step.png` });
  await page.locator('[data-settings-target="background"]').click();
  await page.locator('#time-background-section > summary').click();
  assert.equal(await page.locator('#time-period-size-number').isVisible(), true);
  if (evidence) {
    await page.screenshot({ path: `${evidence}/time-background-settings.png` });
    await writeFile(`${evidence}/DatingNavigation.svg`, await page.evaluate(() => serializeRenderedSvg()));
  }
  // Narrow workbench: the tab grid must remain inside the panel.
  await page.evaluate(() => document.getElementById('phylorender-layout').style.setProperty('--controls-width', '320px'));
  const tabsFit = await page.locator('.settings-nav').evaluate(nav => {
    const box = nav.getBoundingClientRect();
    return [...nav.querySelectorAll('button')].filter(button => getComputedStyle(button).display !== 'none').every(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= box.left - 1 && bounds.right <= box.right + 1 && button.scrollWidth <= button.clientWidth + 1;
    });
  });
  assert.ok(tabsFit, 'all seven tabs fit the narrow workbench');
  await page.evaluate(() => document.getElementById('phylorender-layout').style.removeProperty('--controls-width'));

  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), { workspace: 'conflict', main_tree: { name: 'primary.tre', content: tree }, comparison_tree: { name: 'secondary.tre', content: '(O:3,((A_alpha:1,C_gamma:1)90:1,(B_beta:1,D_delta:1)80:1)85:1);' } });
  await navigate('conflict', ['data', 'tree', 'tips', 'labels', 'export']);
  assert.deepEqual(await page.evaluate(() => currentTipOriginalLabels().sort()), ['A_alpha', 'B_beta', 'C_gamma', 'D_delta', 'O']);
  await page.locator('.tip-rename-section > summary').click();
  await page.locator('#tip-rename-select').selectOption('A_alpha');
  const originalTrees = await page.evaluate(() => JSON.stringify([state.conflict.nuclearRoot, state.conflict.plastidRoot]));
  await page.locator('#tip-rename-edit').click();
  await page.locator('#tip-rename-input').fill('Alpha renamed');
  await page.locator('#tip-rename-form button[type="submit"]').click();
  await settleFigure(page);
  assert.equal(await page.locator('.conflict-tip-label').filter({ hasText: 'Alpha renamed' }).count(), 2);
  assert.equal(await page.evaluate(() => JSON.stringify([state.conflict.nuclearRoot, state.conflict.plastidRoot])), originalTrees, 'rename preserves both source trees');
  await page.locator('#tip-label-map-clear').click();
  await settleFigure(page);

  await page.evaluate(() => switchWorkspaceMode('cloud', { loadExample: false }));
  await page.locator('[data-settings-target="tree"]').click();
  await page.locator('#cloud-background-section > summary').click();
  await page.locator('#cloud-show-gene').uncheck();
  await page.locator('[data-settings-target="data"]').click();
  await page.locator('#cloud-input-section > summary').click();
  await page.locator('#cloud-species-method').selectOption('coalescent');
  await page.locator('#cloud-species-file').setInputFiles(file('species.tre', tree));
  await page.locator('#tree-loading').waitFor({ state: 'hidden' });
  await page.locator('#cloud-phyparts-file').setInputFiles(file('statistics.tsv', 'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA_alpha;B_beta\nN2\t5\t2\t1\t2\tC_gamma;D_delta\nN3\t4\t3\t1\t2\tA_alpha;B_beta;C_gamma;D_delta\n'));
  await page.waitForFunction(() => document.querySelectorAll('.cloud-pie').length === 3);
  await navigate('cloud', ['data', 'tree', 'tips', 'labels', 'background', 'groups', 'export']);
  const cloudLocations = await page.evaluate(() => Object.fromEntries(['cloud-root-age', 'cloud-show-gene', 'cloud-opacity', 'cloud-show-species', 'cloud-species-shape', 'cloud-show-pies', 'cloud-pie-mode'].map(id => [id, document.getElementById(id)?.closest('[data-settings-page]')?.dataset.settingsPage])));
  assert.deepEqual(cloudLocations, { 'cloud-root-age': 'data', 'cloud-show-gene': 'tree', 'cloud-opacity': 'tree', 'cloud-show-species': 'tree', 'cloud-species-shape': 'tree', 'cloud-show-pies': 'labels', 'cloud-pie-mode': 'labels' });
  await page.locator('[data-settings-target="tree"]').click();
  await page.locator('#cloud-background-section > summary').click();
  assert.equal(await page.locator('#cloud-opacity').isVisible(), false);
  assert.equal(await page.locator('#cloud-opacity-number').isVisible(), true);
  await page.locator('[data-settings-target="background"]').click();
  await page.locator('#time-background-section > summary').click();
  assert.equal(await page.locator('#time-axis-size-number').isVisible(), true);
  assert.equal(await page.locator('#cloud-show-time-axis').isVisible(), true);
  assert.equal(await page.locator('#cloud-opacity').isVisible(), false);
  if (evidence) {
    await page.screenshot({ path: `${evidence}/cloud-background-settings.png` });
    await writeFile(`${evidence}/navigation-audit.json`, JSON.stringify({ audits, datedLocations, cloudLocations, tabsFit, errors }, null, 2));
  }
  assert.deepEqual(errors, []);
  console.log('PASS all four workbench modes, Dating import disclosure, sample/background routing, unchanged SVG on navigation, live input handlers and narrow-panel tabs');
} finally { await runtime.close(); }
