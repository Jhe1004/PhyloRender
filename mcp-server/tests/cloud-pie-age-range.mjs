import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';

const tree = '(O:3,((A:1,B:1):1,(C:1,D:1):1):1);';
const table = 'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\n' +
  'N1\t6\t2\t1\t1\tA;B\nN2\t5\t2\t1\t2\tC;D\nN3\t4\t3\t1\t2\tA;B;C;D\n';
const file = (name, content) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
const runtime = await createRuntime();
const trace = message => { if (process.env.PHYLORENDER_TRACE_RANGE) console.log(message); };
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1100 } });
  page.setDefaultTimeout(20000);
  const errors = [], analysisRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  trace('page ready');
  const real = await page.evaluate(() => ({ tips: document.querySelectorAll('.cloud-tip-label').length,
    pies: document.querySelectorAll('.cloud-pie').length, age: state.cloud.datedRootAge }));
  // Validate a real frozen cloud dataset without recomputing its dates/stats.
  if (real.tips > 20 && process.argv[2]) {
    await page.evaluate(() => {
      document.getElementById('cloud-pie-age-minimum').value = String(state.cloud.datedRootAge * .4);
      commitCloudPieAgeRangeInputs();
    });
    const summary = await page.evaluate(() => ({ tips: document.querySelectorAll('.cloud-tip-label').length,
      pies: document.querySelectorAll('.cloud-pie').length,
      filtered: document.querySelectorAll('[data-hidden-reason="time-range"]').length,
      status: document.getElementById('cloud-pie-age-range-status').textContent }));
    assert.equal(summary.tips, real.tips); assert.ok(summary.pies < real.pies && summary.pies > 0);
    assert.ok(summary.filtered > 0);
    const svg = await page.evaluate(() => serializeRenderedSvg());
    await writeFile(`${process.argv[2]}/01_真实云树_较古老节点饼图.svg`, svg);
    await writeFile(`${process.argv[2]}/02_真实云树_筛选报告.json`, JSON.stringify({ before: real, after: summary }, null, 2));
    const preview = await runtime.renderer.browser.newPage();
    await preview.setContent(`<body style="margin:0">${svg}</body>`);
    await preview.evaluate(() => document.fonts.ready);
    await preview.locator('svg').screenshot({ path: `${process.argv[2]}/03_原生SVG预览.png` });
    await preview.close();
    await page.getByRole('button', { name: '标注', exact: true }).click();
    assert.equal(await page.locator('#cloud-pie-age-range-section').getAttribute('open'), null);
    await page.locator('#cloud-pie-age-range-section > summary').click();
    await page.screenshot({ path: `${process.argv[2]}/04_时间范围设置界面.png` });
  }
  // Deterministic fixture: no treePL or PhyParts requests are needed.
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await page.locator('#cloud-background-section > summary').click();
  await page.locator('#cloud-show-gene').uncheck();
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.locator('#cloud-input-section > summary').click();
  await page.locator('#cloud-species-method').selectOption('coalescent');
  await page.locator('#cloud-species-file').setInputFiles(file('species.tre', tree));
  await page.locator('#tree-loading').waitFor({ state: 'hidden', timeout: 120000 });
  await page.locator('#cloud-phyparts-file').setInputFiles(file('statistics.tsv', table));
  await page.waitForFunction(() => document.querySelectorAll('.cloud-pie').length === 3);
  trace('fixture ready');
  page.on('request', request => {
    if (/\/api\/cloud-(date|phyparts)(?:[/?]|$)/.test(request.url())) analysisRequests.push(request.url());
  });
  const baseline = await page.evaluate(() => ({
    species: JSON.stringify(state.cloud.speciesRoot),
    statistics: JSON.stringify([...state.cloud.phyPartsTable.rows]),
    dates: JSON.stringify([...state.cloud.datedAges.get(state.cloud.speciesRoot)]),
    branches: document.querySelector('.cloud-species-tree').outerHTML,
    rows: [...document.querySelectorAll('.cloud-tip-label')].map(label => label.outerHTML),
    pies: Object.fromEntries([...document.querySelectorAll('.cloud-pie')].map(pie => [pie.dataset.phypartsNode, pie.outerHTML])),
    young: [...PhyloRenderCloud.matchPhyParts(state.cloud.speciesRoot, state.cloud.phyPartsTable).matched]
      .filter(([, row]) => row.id === 'N1').map(([node]) => state.cloud.datedAges.get(state.cloud.speciesRoot).get(node))[0],
  }));
  await page.getByRole('button', { name: '标注', exact: true }).click();
  if (await page.locator('#cloud-pie-age-range-section').getAttribute('open') === null)
    await page.locator('#cloud-pie-age-range-section > summary').click();
  const setRange = async (minimum, maximum) => {
    await page.locator('#cloud-pie-age-minimum').fill(minimum);
    await page.locator('#cloud-pie-age-maximum').fill(maximum);
    await page.locator('#cloud-pie-age-maximum').press('Tab');
  };
  const ids = () => page.locator('.cloud-pie').evaluateAll(pies => pies.map(pie => pie.dataset.phypartsNode).sort());
  await setRange('5', ''); assert.deepEqual(await ids(), ['N3']);
  assert.equal(await page.locator('[data-hidden-reason="time-range"]').count(), 2);
  const point = await page.locator('.cloud-hidden-pie-marker').first().evaluate(marker => ({
    r: marker.getAttribute('r'), stroke: marker.getAttribute('stroke') }));
  assert.deepEqual(point, { r: '1.5', stroke: 'none' });
  await page.evaluate(() => openCloudPieMenu('N1', 700, 250));
  assert.equal(await page.locator('#cloud-pie-menu-show').isDisabled(), true);
  assert.match(await page.locator('#cloud-pie-menu-range-hint').textContent(), /超出当前/);
  await page.keyboard.press('Escape');
  await setRange('', String(baseline.young)); assert.deepEqual(await ids(), ['N1', 'N2']);
  await setRange(String(baseline.young), String(baseline.young)); assert.deepEqual(await ids(), ['N1', 'N2']);
  await page.locator('#cloud-pie-age-range-reset').click();
  await page.evaluate(() => setCloudPieVisibility('N1', false));
  await setRange('5', ''); assert.deepEqual(await ids(), ['N3']);
  await page.locator('#cloud-pie-age-range-reset').click();
  assert.deepEqual(await ids(), ['N2', 'N3'], 'reset time filtering must not undo manual hiding');
  await page.evaluate(() => {
    document.getElementById('cloud-pie-age-minimum').value = '9';
    document.getElementById('cloud-pie-age-maximum').value = '3';
    commitCloudPieAgeRangeInputs();
  });
  assert.match(await page.locator('#cloud-pie-age-range-status').textContent(), /最年轻时间不能大于/);
  assert.deepEqual(await ids(), ['N2', 'N3'], 'invalid bounds preserve the last valid view');
  await page.locator('#cloud-pie-age-range-reset').click();
  await setRange('20', ''); assert.deepEqual(await ids(), []);
  assert.equal(await page.locator('#cloud-pie-legend-layer').count(), 0);
  await page.locator('#cloud-pie-age-range-reset').click();
  await page.locator('#cloud-pie-settings-section > summary').click();
  await page.locator('#cloud-pie-mode').selectOption('four');
  await setRange('5', ''); assert.deepEqual(await ids(), ['N3']);
  await page.locator('#cloud-pie-mode').selectOption('two');
  trace('ranges and manual hiding verified');
  const after = await page.evaluate(() => ({
    species: JSON.stringify(state.cloud.speciesRoot), statistics: JSON.stringify([...state.cloud.phyPartsTable.rows]),
    dates: JSON.stringify([...state.cloud.datedAges.get(state.cloud.speciesRoot)]),
    branches: document.querySelector('.cloud-species-tree').outerHTML,
    rows: [...document.querySelectorAll('.cloud-tip-label')].map(label => label.outerHTML),
    pie: document.querySelector('.cloud-pie[data-phyparts-node="N3"]').outerHTML,
  }));
  for (const key of ['species', 'statistics', 'dates', 'branches', 'rows']) assert.deepEqual(after[key], baseline[key], key);
  assert.equal(after.pie, baseline.pies.N3, 'remaining pies must not move or resize');
  const exported = await page.evaluate(async () => {
    const svg = new DOMParser().parseFromString(await serializeRenderedSvg(), 'image/svg+xml');
    return { ids: [...svg.querySelectorAll('.cloud-pie')].map(pie => pie.getAttribute('data-phyparts-node')),
      editors: svg.querySelectorAll('.cloud-editor-only').length,
      range: JSON.parse(svg.documentElement.getAttribute('data-cloud-pie-age-range')),
      filtered: JSON.parse(svg.documentElement.getAttribute('data-cloud-time-filtered-pie-nodes')) };
  });
  assert.deepEqual(exported.ids, ['N3']); assert.equal(exported.editors, 0);
  assert.deepEqual(exported.range, { minimum: 5, maximum: null, unit: 'relative-display', fossilCalibrated: false });
  assert.deepEqual(exported.filtered, ['N1', 'N2']);
  trace('export verified');
  await page.getByRole('button', { name: '树形', exact: true }).click();
  if (await page.locator('#cloud-branch-order-section').getAttribute('open') === null)
    await page.locator('#cloud-branch-order-section > summary').click();
  await page.locator('#cloud-ladder-direction').selectOption('large-top');
  assert.deepEqual(await ids(), ['N3'], 'ladderization preserves the age selection');
  await page.locator('summary').filter({ hasText: '物种树显示与形状' }).click();
  await page.locator('#cloud-species-shape').selectOption('rectangular');
  trace('rectangular shape selected');
  assert.deepEqual(await ids(), ['N3'], 'rectangular species trees use the same age range');
  await page.getByRole('button', { name: '标注', exact: true }).click();
  await page.locator('#cloud-pie-settings-section > summary').click();
  await page.locator('#cloud-show-pies').uncheck();
  assert.deepEqual(await ids(), []);
  await page.locator('#cloud-show-pies').check();
  trace('layer toggles verified');
  assert.deepEqual(await ids(), ['N3'], 'layer toggles retain the selected range');
  assert.deepEqual(await page.evaluate(() => state.timeAgeRange), { minimumRaw: null, maximumRaw: null, explicit: false });
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.locator('#cloud-species-file').setInputFiles(file('new-species.tre', tree));
  await page.locator('#tree-loading').waitFor({ state: 'hidden', timeout: 120000 });
  assert.deepEqual(await page.evaluate(() => state.cloud.pieAgeRange), { minimum: null, maximum: null });
  assert.deepEqual(analysisRequests, []); assert.deepEqual(errors, []);
  console.log('PASS cloud pie time window, inclusive bounds, invalid input, manual-hide independence, fixed geometry/dates/statistics, four-part mode, clean SVG and new-input reset');
} finally { await runtime.close(); }
