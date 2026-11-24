import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';
import { settleFigure } from './settle-figure.mjs';

const plain = '(O:73.5,((A:12,B:12):32,(C:21,D:21):23):29.5);';
const beast = '#NEXUS\nBegin trees;\nTranslate 1 O,2 A,3 B,4 C,5 D;\nTree MCC = [&R] (1[&height=0]:73.5,((2:12,3:12)[&height=12,height_mean=13,height_median=11]:32,(4:21,5:21)[&height=21,height_mean=22,height_median=20]:23)[&height=44,height_mean=45,height_median=43]:29.5)[&height=73.5,height_mean=74.5,height_median=72.5];\nEnd;';
const mcmctree = '#NEXUS\nBEGIN TREES;\nUTREE 1 = (O:73.5,((A:12,B:12)[&95%HPD={9,15}]:32,(C:21,D:21)[&95%HPD={18,25}]:23)[&95%HPD={38,49}]:29.5)[&95%HPD={68,80}];\nEND;';
const genes = '(O:0.2,((A:0.1,B:0.12)90:0.1,(C:0.09,D:0.13)80:0.11)85:0.08);\n' +
  '(O:0.21,((A:0.12,C:0.15)75:0.1,(B:0.1,D:0.13)80:0.12)85:0.07);';
const file = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
const runtime = await createRuntime();
const output = process.argv[2];
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1100 } });
  page.setDefaultTimeout(30000);
  const errors = [], dateRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().endsWith('/api/cloud-date/jobs') && request.method() === 'POST') dateRequests.push(request.postDataJSON());
  });
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.locator('#cloud-input-section > summary').click();
  await page.locator('#cloud-species-method').selectOption('dated');
  assert.equal(await page.locator('#cloud-dated-options').isVisible(), true);
  assert.equal(await page.locator('#cloud-root-age').isDisabled(), true);
  await page.locator('#cloud-dated-unit').selectOption('mya');
  const upload = async (name, text) => {
    await settleFigure(page);
    await page.locator('#cloud-species-file').setInputFiles(file(name, text));
    await page.locator('#tree-loading').waitFor({ state: 'hidden', timeout: 120000 });
    await settleFigure(page);
    assert.equal(await page.evaluate(() => state.cloud.speciesName), name);
    assert.equal(dateRequests.length, 0, 'an imported species tree must never be sent to treePL');
  };
  for (const [name, text, source] of [['treePL_dated.tree', plain, 'branch_lengths'],
    ['MCMCtree_FigTree.tre', mcmctree, 'branch_lengths'], ['BEAST1_MCC.tree', beast, 'height'],
    ['BEAST2_MCC.tree', beast.replace('Tree MCC', 'tree STATE_0'), 'height']]) {
    await upload(name, text);
    const profile = await page.evaluate(() => ({ age: state.cloud.datedRootAge,
      source: state.cloud.importedDating.ageSource,
      ages: [...state.cloud.datedAges.get(state.cloud.speciesRoot).values()].sort((a, b) => a - b),
      root: JSON.stringify(state.cloud.speciesRoot), unit: state.cloud.importedDating.unit }));
    assert.equal(profile.age, 73.5); assert.equal(profile.source, source); assert.equal(profile.unit, 'mya');
    assert.deepEqual(profile.ages, [0, 0, 0, 0, 0, 12, 21, 44, 73.5]);
  }
  // Rejected dated inputs must not silently enter either dating pathway.
  // The audited import contract is transactional: retain the last valid tree.
  const retained = await page.evaluate(() => ({ root: JSON.stringify(state.cloud.speciesRoot),
    name: state.cloud.speciesName, raw: state.cloud.speciesText, age: state.cloud.datedRootAge }));
  for (const [name, text] of [['non_ultrametric.tree', '(O:90,(A:1,B:1):2);'],
    ['posterior_chain.trees', '#NEXUS\nBegin trees; Tree one = (A:1,B:1); Tree two = (A:2,B:2); End;'],
    ['serial_MCC.tree', '(O[&height=2]:1,(A:1,B:1)[&height=1]:1)[&height=3];']]) {
    await settleFigure(page);
    await page.locator('#cloud-species-file').setInputFiles(file(name, text));
    await page.locator('#tree-loading-close').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#tree-loading').getAttribute('data-state'), 'error');
    assert.deepEqual(await page.evaluate(() => ({ root: JSON.stringify(state.cloud.speciesRoot),
      name: state.cloud.speciesName, raw: state.cloud.speciesText, age: state.cloud.datedRootAge })), retained);
    assert.equal(dateRequests.length, 0);
    await page.locator('#tree-loading-close').click();
  }
  // The user's previously supplied real StarBEAST3 CA MCC tree is optional.
  if (process.argv[3]) {
    const text = await readFile(process.argv[3], 'utf8');
    await upload('real_StarBEAST3_MCC.tree', text);
    assert.equal(await page.evaluate(() => PhyloRenderCloud.tips(state.cloud.speciesRoot).length), 99);
    const real = await page.evaluate(() => ({ age: state.cloud.datedRootAge,
      source: state.cloud.importedDating.ageSource, tips: document.querySelectorAll('.cloud-tip-label').length }));
    if (output) {
      await mkdir(output, { recursive: true });
      await writeFile(`${output}/01_真实StarBEAST3物种树.svg`, await page.evaluate(() => serializeRenderedSvg()));
      await writeFile(`${output}/02_真实树报告.json`, JSON.stringify(real, null, 2));
    }
  }
  await upload('dated_reference.tree', plain);
  const before = await page.evaluate(() => ({ root: JSON.stringify(state.cloud.speciesRoot),
    ages: [...state.cloud.datedAges.get(state.cloud.speciesRoot).values()] }));
  // Actual execution, including the built-in JavaScript conflict engine and bundled treePL.
  await page.locator('#cloud-genes-method').selectOption('ml');
  await settleFigure(page);
  await page.locator('#cloud-genes-file').setInputFiles(file('ML_genes.treefile', genes));
  await page.waitForFunction(() => {
    const dialog = document.getElementById('tree-loading');
    return dialog.hidden || dialog.dataset.state === 'error';
  }, null, { timeout: 180000 });
  assert.equal(await page.locator('#tree-loading').isVisible(), false,
    await page.locator('#tree-loading').innerText());
  const after = await page.evaluate(() => ({ root: JSON.stringify(state.cloud.speciesRoot),
    ages: [...state.cloud.datedAges.get(state.cloud.speciesRoot).values()],
    count: state.cloud.geneRoots.length, engine: state.cloud.datingEngine,
    geneEngine: state.cloud.geneDatingEngine, analysis: state.cloud.phyPartsMeta?.engine,
    message: document.getElementById('message').textContent }));
  assert.equal(after.count, 2, JSON.stringify(after));
  assert.equal(after.engine, 'imported-dated'); assert.equal(after.geneEngine, 'bundled-treePL');
  assert.equal(after.analysis, 'PhyloRender-conflict-statistics');
  assert.equal(after.root, before.root); assert.deepEqual(after.ages, before.ages);
  assert.equal(dateRequests.length, 1, 'only the gene batch is dated');
  assert.equal(dateRequests[0].trees.length, 2); assert.equal(dateRequests[0].age, 73.5);
  assert.deepEqual(dateRequests[0].trees[0].calibrations.map(item => item.age).sort((a,b) => a-b), [12,21,44]);
  assert.deepEqual(dateRequests[0].trees[1].calibrations.map(item => item.age), [44]);
  await page.evaluate(() => state.cloud.geneRoots.forEach(root =>
    PhyloRenderCloud.verifySharedAges(root, state.cloud.datedAges.get(root),
      PhyloRenderCloud.sharedAgeCalibrations(state.cloud.speciesRoot,
        state.cloud.datedAges.get(state.cloud.speciesRoot), root,
        PhyloRenderCloud.sampleProfile(state.cloud.speciesRoot).names), state.cloud.datedRootAge)));
  // A disabled control cannot secretly redraft or rescale imported dates.
  await page.evaluate(() => {
    const input = document.getElementById('cloud-root-age'); input.value = '10';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.locator('#cloud-root-age').inputValue(), '73.5');
  assert.equal(dateRequests.length, 1);
  const svg = await page.evaluate(() => serializeRenderedSvg());
  assert.match(svg, /cloud-imported-dated/); assert.match(svg, /cloud-dating-provenance/);
  const meta = await page.evaluate(() => JSON.parse(document.getElementById('cloud-dating-provenance').textContent));
  assert.equal(meta.species.mode, 'imported-dated'); assert.equal(meta.species.unit, 'mya');
  assert.equal(meta.genes.engine, 'bundled-treePL'); assert.equal(meta.fossilCalibrated, null);
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(`${output}/03_已有定年与真实基因treePL云树.svg`, svg);
    await writeFile(`${output}/04_执行报告.json`, JSON.stringify({ after, dateRequests, meta }, null, 2));
    const preview = await runtime.renderer.browser.newPage();
    await preview.setContent(`<body style="margin:0">${svg}</body>`);
    await preview.evaluate(() => document.fonts.ready);
    await preview.locator('svg').screenshot({ path: `${output}/05_云树SVG预览.png` });
    await preview.close();
  }
  assert.deepEqual(errors, []);
  // Very large year units remain intact; only internal solver coordinates are
  // normalized, and all gene dates are converted back to the input units.
  const large = plain.replace(/\d+(?:\.\d+)?/g, value => String(Number(value) * 1e6));
  await page.locator('#cloud-dated-unit').selectOption('years');
  await settleFigure(page);
  await page.locator('#cloud-species-file').setInputFiles(file('dated_years.tree', large));
  await page.locator('#tree-loading').waitFor({ state: 'hidden', timeout: 120000 });
  await settleFigure(page);
  assert.equal(dateRequests.length, 1);
  assert.equal(await page.evaluate(() => state.cloud.datedRootAge), 73500000);
  await page.locator('#cloud-genes-file').setInputFiles(file('ML_genes.treefile', genes));
  await page.locator('#tree-loading').waitFor({ state: 'hidden', timeout: 180000 });
  assert.equal(await page.evaluate(() => state.cloud.geneRoots.length), 2);
  assert.equal(dateRequests.length, 2); assert.equal(dateRequests[1].age, 10);
  const scale = 10 / 73500000;
  assert.deepEqual(dateRequests[1].trees[0].calibrations.map(item => item.age).sort((a,b) => a-b), [12e6,21e6,44e6].map(age => age * scale));
  await page.evaluate(() => {
    const cloud = state.cloud;
    if (cloud.datedAges.get(cloud.speciesRoot).get(cloud.speciesRoot) !== 73500000) throw new Error('reference was scaled');
    cloud.geneRoots.forEach(root => PhyloRenderCloud.verifySharedAges(root, cloud.datedAges.get(root),
      PhyloRenderCloud.sharedAgeCalibrations(cloud.speciesRoot, cloud.datedAges.get(cloud.speciesRoot), root,
        PhyloRenderCloud.sampleProfile(cloud.speciesRoot).names), cloud.datedRootAge));
  });
  // Changing input type clears imported provenance instead of reusing it.
  await page.locator('#cloud-species-method').selectOption('ml');
  assert.equal(await page.evaluate(() => state.cloud.importedDating), null);
  assert.equal(await page.locator('#cloud-root-age').isDisabled(), false);
  assert.equal(await page.locator('#cloud-root-age').inputValue(), '', 'new ML input must explicitly supply its root age');
  console.log('cloud imported dating: formats, invalid inputs, real treePL and built-in JavaScript conflict statistics, reference preservation, inherited calibrations, year-scale restoration, metadata and reset passed');
} finally { await runtime.close(); }
