import assert from 'node:assert/strict';
import { createRuntime } from '../src/runtime.mjs';
import { writeFile } from 'node:fs/promises';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage();
  const requests = [], errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  assert.equal(await page.evaluate(() => state.workspaceMode), 'cloud');
  for (const id of ['ladder-direction', 'cloud-ladder-direction', 'conflict-primary-ladder']) {
    assert.equal(await page.locator(`#${id}`).inputValue(), 'small-top');
  }
  const initialCloud = await page.evaluate(() => state.cloud.speciesRoot && ({
    actual: [...document.querySelectorAll('.cloud-tip-label')].map(tip => tip.dataset.originalTipLabel),
    expected: PhyloRenderCloud.orderedTips(state.cloud.speciesRoot, 'small-top').map(tip => tip.label.trim()),
    direction: document.querySelector('#tree-svg').dataset.cloudLadderDirection,
  }));
  if (initialCloud) {
    assert.equal(initialCloud.direction, 'small-top');
    assert.deepEqual(initialCloud.actual, initialCloud.expected);
    const groups = await page.evaluate(() => ({
      names: [...state.cloud.cladeNames.values()],
      bars: document.querySelectorAll('.cloud-clade-bars .clade-bar[data-bar-part="body"]').length,
      gap: cladeBarGapReport(),
      genesColored: document.querySelectorAll('.cloud-gene-lines path[stroke]').length,
      genesNeutral: document.querySelectorAll('.cloud-gene-lines path:not([stroke])').length,
      ordinaryGroups: state.cladeColors.size,
    }));
    assert.ok(groups.names.length >= 2);
    assert.ok(groups.names.every(name => /^Group \d+$/.test(name)));
    assert.equal(groups.bars, groups.names.length);
    assert.ok(groups.gap.valid); assert.ok(groups.genesColored>0); assert.ok(groups.genesNeutral>0);
    assert.equal(groups.ordinaryGroups, 0);
    if (process.argv[2]) {
      await page.getByRole('button', { name: 'Clades', exact: true }).click();
      const svg = await page.evaluate(() => serializeRenderedSvg());
      await writeFile(`${process.argv[2]}/01_默认云树示例分组.svg`, svg);
      await page.screenshot({ path: `${process.argv[2]}/02_默认云树页面.png` });
      const size = await page.evaluate(() => state.currentSvgSize);
      const preview = await runtime.renderer.browser.newPage({ viewport: { width: Math.ceil(size.width), height: Math.ceil(size.height) } });
      await preview.setContent(`<body style="margin:0">${svg}</body>`);
      await preview.evaluate(() => document.fonts.ready);
      await preview.screenshot({ path: `${process.argv[2]}/03_默认云树SVG预览.png` });
      await preview.close();
      await writeFile(`${process.argv[2]}/04_示例分组验证.json`, JSON.stringify(groups, null, 2));
    }
  }
  assert.equal(await page.locator('[data-workspace-mode="cloud"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => Boolean(state.root)), false);
  assert.ok(!requests.some(url => /Raxml-Chloroplast|\/api\/cloud-(date|phyparts)/.test(url)));
  await page.locator('[data-workspace-mode="time"]').click();
  await page.waitForFunction(() => state.workspaceMode === 'time' && state.root && document.querySelectorAll('.tip-label').length === 27);
  await page.locator('#tree-loading').waitFor({ state: 'hidden', timeout: 300000 });
  assert.equal(await page.locator('.cloud-gene-lines').count(), 0);
  assert.equal(await page.locator('.tip-label').count(), 27);
  await page.locator('[data-workspace-mode="cloud"]').click();
  // A clone without private local demo data must still open the cloud workspace.
  await page.route('**/defaults/cloud-workspace.local.js*', route => route.fulfill({
    status: 404, contentType: 'text/plain', body: 'Private local snapshot intentionally absent' }));
  await page.reload();
  await page.evaluate(() => window.PhyloRenderReady);
  assert.equal(await page.evaluate(() => state.workspaceMode), 'cloud');
  assert.equal(await page.evaluate(() => state.cloud.cladeColors.size), 0);
  assert.match(await page.locator('#tree-svg').textContent(), /Import a species tree and all gene trees/);
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  assert.equal(await page.evaluate(() => state.workspaceMode), 'phylogeny');
  assert.equal(await page.evaluate(() => Boolean(state.root || state.cloud.speciesRoot)), false);
  const fixture = '(((A:1,B:1):1,C:2):1,D:3);';
  const orders = [];
  for (const mode of ['phylogeny', 'time']) {
    await page.evaluate(mode => switchWorkspaceMode(mode), mode);
    await page.evaluate(content => window.PhyloRenderAgent.loadFigure({
      main_tree: { name: 'default-order.nwk', content }, rooting: { outgroup: null },
      options: state.workspaceMode === 'time' ? { time: { source_unit: 'mya', display_unit: 'mya' } } : {},
    }), fixture);
    const result = await page.evaluate(() => ({
      mode: state.workspaceMode,
      actual: [...document.querySelectorAll('#tree-svg .tip-label')].map(tip => tip.dataset.originalTipLabel),
      source: PhyloRenderCloud.tips(state.parsedRoot).map(tip => tip.label),
      ages: state.workspaceMode === 'time' ? buildTimeTreeProfile(structuredClone(state.root)).rootAge : null,
    }));
    assert.equal(result.mode, mode);
    assert.deepEqual(result.actual, ['D', 'C', 'A', 'B']);
    assert.deepEqual(result.source, ['A', 'B', 'C', 'D']);
    if (mode === 'time') assert.equal(result.ages, 3);
    orders.push(result);
  }
  assert.deepEqual(errors, []);
  console.log('PASS small-top defaults for all controls, real cloud initial order, ordinary/Dating rendering, no-demo fallback, independent MCP startup', JSON.stringify(orders));
} finally { await runtime.close(); }
