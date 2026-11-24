import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const requests = [], errors = [];
  page.on('request', r => { if (/\/api\/cloud-(date|phyparts)/.test(r.url())) requests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  const upload = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  // Portable fallback; local real-data snapshot is used when it is present.
  if (!await page.evaluate(() => Boolean(state.cloud.speciesRoot))) {
    await page.evaluate(() => { $('cloud-show-gene').checked = false; });
    await page.locator('#cloud-input-section > summary').click();
    await page.locator('#cloud-species-method').selectOption('dated');
    await page.locator('#cloud-species-file').setInputFiles(upload('time-tree.nwk', '(O:10,((Alpha_a:2,Beta_b:2):3,Gamma_c:5):5);'));
    await page.locator('#tree-loading').waitFor({ state: 'hidden' });
  }
  // Group-editor regression starts from a blank canvas, independently of the
  // illustrative groups now seeded only for the built-in cloud example.
  await page.evaluate(async () => { clearCloudClades(); await renderCloudTree(); });
  const fingerprint = () => page.evaluate(() => {
    const cloud = state.cloud;
    return JSON.stringify({ roots: [cloud.speciesRoot, ...cloud.geneRoots],
      ages: [...cloud.datedAges].map(([root, ages]) => [root.id, [...ages].map(([node, age]) => [node.id, age])]),
      stats: cloud.phyPartsTable && [...cloud.phyPartsTable.rows], hidden: [...cloud.hiddenPieNodes] });
  });
  const before = await fingerprint();
  const pick = await page.evaluate(() => {
    const candidates = [...PhyloRenderCloud.nodeClades(state.cloud.speciesRoot)]
      .map(([node, clade]) => ({ id: node.id, n: clade.names.length, tips: PhyloRenderCloud.tips(node).map(t => t.id) }))
      .filter(c => c.n >= 2 && c.n <= 10).sort((a,b) => b.n-a.n);
    const group = candidates[0];
    const outside = PhyloRenderCloud.tips(state.cloud.speciesRoot).find(t => !group.tips.includes(t.id));
    return { group, singleton: outside.id };
  });
  const groupsButton = page.getByRole('button', { name: '分组', exact: true });
  await groupsButton.click();
  const section = page.locator('#toggle-clade-select').locator('xpath=ancestor::details');
  assert.equal(await section.getAttribute('open'), null);
  await section.locator('summary').click();
  await page.locator('#toggle-clade-select').click();
  async function saveGroup(nodeId, name, singleton = false) {
    const target = singleton ? `.cloud-tip-label[data-tip-node-id="${nodeId}"]`
      : `.cloud-species-hits .clade-hit[data-clade-node-id="${nodeId}"]`;
    // Scroll to the actual SVG element and dispatch the same click event. This
    // avoids a separate pie overlay obscuring a branch in a zoomed-out test.
    await page.locator(target).dispatchEvent('click');
    await page.locator('#clade-name-dialog').waitFor({ state: 'visible' });
    await page.locator('#clade-name-input').fill(name);
    await page.locator('#save-clade-name').click();
    await page.locator('#clade-name-dialog').waitFor({ state: 'hidden' });
  }
  await saveGroup(pick.group.id, 'Cloud clade');
  await saveGroup(pick.singleton, 'Single sample', true);
  assert.equal(await page.locator('.cloud-clade-bars .clade-bar[data-bar-part="body"]').count(), 2);
  assert.equal(await page.evaluate(() => state.cladeColors.size), 0, 'cloud groups must not leak into normal-tree state');
  const color = page.locator(`[data-clade-color-node-id="${pick.group.id}"]`);
  await color.evaluate(input => { input.value = '#0072b2'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(id => document.querySelector(`.cloud-species-tree [data-clade-node-id="${id}"]`).getAttribute('stroke') === '#0072b2', pick.group.id);
  const report = await page.evaluate(({ group, singleton }) => ({
    gap: cladeBarGapReport(),
    colored: group.tips.every(id => document.querySelector(`.cloud-tip-label[data-tip-node-id="${id}"]`).style.fill === 'rgb(0, 114, 178)'),
    singleton: state.cloud.cladeColors.has(singleton),
    genesNeutral: [...document.querySelectorAll('.cloud-gene-lines path')].every(p => !p.hasAttribute('stroke')),
    pies: document.querySelectorAll('.cloud-pie').length,
    size: state.currentSvgSize,
  }), pick);
  assert.ok(report.colored); assert.ok(report.singleton); assert.ok(report.genesNeutral); assert.ok(report.gap.valid);
  assert.equal(await fingerprint(), before, 'grouping cannot modify trees, dates or PhyParts');
  await saveGroup(pick.group.tips[0], 'Nested sample', true);
  assert.equal(await page.evaluate(() => state.cloud.cladeColors.size), 3);
  assert.ok(await page.evaluate(() => cladeBarGapReport().valid));
  if (report.pies) {
    // Real pointer click on a pie opens grouping rather than its visibility
    // menu while selection mode is active; cancel changes neither statistic.
    await page.locator('.cloud-pie').first().click();
    assert.equal(await page.locator('#clade-name-dialog').isVisible(), true);
    assert.equal(await page.locator('#cloud-pie-menu').isVisible(), false);
    await page.locator('#cancel-clade-name').click();
    assert.equal(await fingerprint(), before);
  }
  // Name styling, orientation, and nested overrides share the ordinary editor.
  await page.locator(`.clade-edit[data-clade-node-id="${pick.group.id}"]`).click();
  await page.locator('#clade-name-input').fill('Renamed cloud clade');
  await page.locator('#clade-orientation-vertical').check();
  await page.locator('#save-clade-name').click();
  assert.equal(await page.locator(`.clade-bar-label[data-clade-node-id="${pick.group.id}"]`).getAttribute('data-name-orientation'), 'vertical');
  await page.locator('#toggle-clade-select').click();
  // Outside selection mode, the same pie retains its explicit hide/show menu.
  if (report.pies) {
    await page.locator('.cloud-pie').first().dispatchEvent('click');
    assert.equal(await page.locator('#cloud-pie-menu').isVisible(), true);
    await page.keyboard.press('Escape');
  }
  const svg = await page.evaluate(() => serializeRenderedSvg());
  assert.match(svg, /cloud-clade-provenance/); assert.match(svg, /Renamed cloud clade/);
  assert.doesNotMatch(svg, /class="clade-hit|class="clade-node-hit|cloud-species-hits/);
  if (process.argv[2]) {
    await writeFile(`${process.argv[2]}/01_真实云树分组.svg`, svg);
    await page.screenshot({ path: `${process.argv[2]}/02_分组页面.png` });
    const preview = await runtime.renderer.browser.newPage({ viewport: { width: Math.ceil(report.size.width), height: Math.ceil(report.size.height) } });
    await preview.setContent(`<body style="margin:0">${svg}</body>`);
    await preview.evaluate(() => document.fonts.ready);
    await preview.screenshot({ path: `${process.argv[2]}/03_导出SVG预览.png` });
    await preview.close();
  }
  await page.locator('[data-workspace-mode="time"]').click();
  assert.equal(await page.evaluate(() => state.cladeColors.size), 0);
  await page.locator('[data-workspace-mode="cloud"]').click();
  assert.equal(await page.evaluate(() => state.cloud.cladeColors.size), 3);
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await page.locator('#cloud-branch-order-section > summary').click();
  await page.locator('#cloud-ladder-direction').selectOption('large-top');
  assert.ok(await page.evaluate(() => cladeBarGapReport().valid));
  assert.equal(await fingerprint(), before);
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await page.locator('#cloud-background-section > summary').click();
  await page.locator('#cloud-show-gene').uncheck();
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await page.locator('summary').filter({ hasText: '物种树显示与形状' }).click();
  await page.locator('#cloud-species-shape').selectOption('rectangular');
  assert.ok(await page.evaluate(() => cladeBarGapReport().valid));
  assert.equal(await page.locator('.cloud-clade-bars .clade-bar[data-bar-part="body"]').count(), 3);
  assert.equal(await fingerprint(), before);
  // Root menus cannot accidentally reroot this dated reference.
  await page.locator(`.cloud-species-hits [data-clade-node-id="${pick.group.id}"]`).first().dispatchEvent('contextmenu');
  assert.equal(await page.locator('#branch-context-reroot').isVisible(), false);
  await page.keyboard.press('Escape');
  await groupsButton.click();
  await section.locator('summary').click();
  await page.locator(`.clade-remove[data-clade-node-id="${pick.singleton}"]`).click();
  assert.equal(await page.evaluate(() => state.cloud.cladeColors.size), 2);
  await page.locator('#clear-clade-colors').click();
  assert.equal(await page.locator('.cloud-clade-bars .clade-bar').count(), 0);
  assert.equal(await fingerprint(), before);
  // Uploading a different reference drops stale node IDs instead of grouping
  // unrelated samples that happen to reuse n1/n2 IDs.
  await page.locator('#toggle-clade-select').click();
  await saveGroup(pick.singleton, 'Old reference', true);
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.locator('#cloud-input-section > summary').click();
  await page.locator('#cloud-species-method').selectOption('dated');
  await page.locator('#cloud-species-file').setInputFiles(upload('new-reference.nwk', '(Outgroup:10,(Alpha_a:5,Beta_b:5):5);'));
  await page.locator('#tree-loading').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => state.cloud.cladeColors.size), 0);
  assert.equal(await page.locator('.cloud-clade-bars .clade-bar').count(), 0);
  assert.deepEqual(requests, [], 'group controls must never re-run dating or PhyParts');
  assert.deepEqual(errors, []);
  if (process.argv[2]) await writeFile(`${process.argv[2]}/04_分组验收.json`, JSON.stringify({ report, requests, errors }, null, 2));
  console.log('PASS cloud branch/singleton/nested groups, colors, names/orientation, gap, clean SVG, mode isolation, ordering, rectangular tree, new-reference reset and immutable dates/statistics');
} finally { await runtime.close(); }
