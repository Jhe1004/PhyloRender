import units from "../../figure-units.js";
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createRuntime } from '../src/runtime.mjs';
import { figureSpecSchema } from '../src/schemas.mjs';
const require = createRequire(import.meta.url);
const demo = require('../../defaults/dating-synthetic.js');
const tree = '(O:85,((A_alpha:30,B_beta:30):25,(C_gamma:10,D_delta:10):45):30);';
const earlyCretaceousTree = '(O:136.3,((A_alpha:30,B_beta:30):25,(C_gamma:10,D_delta:10):45):81.3);';
const table = 'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA_alpha;B_beta\nN2\t5\t2\t1\t2\tC_gamma;D_delta\nN3\t4\t3\t1\t2\tA_alpha;B_beta;C_gamma;D_delta\n';
const base = { workspace: 'cloud', main_tree: { name: 'dated_reference.tree', content: tree },
  phyparts_table: { name: 'explicit_test_counts.tsv', content: table },
  options: { cloud: { species_method: 'dated', dated_unit: 'mya', show_gene: false, show_time_axis: true, pie_mode: 'four' }, time: { geology: 'standard' } } };
const runtime = await createRuntime();
const evidence = process.argv[2];
function assertGeologicLabels(audit) {
  assert.ok(audit.geologicLabels.every(item => item.label), 'cloud geological labels cannot be blank');
  assert.ok(audit.labelGeometry.every(item => item.fits),
    'every visible cloud geological label stays inside its own cell');
  for (const block of audit.geologicBlocks) {
    if (block.placement === 'omitted') assert.equal(block.hasInsideLabel, false,
      `${block.fullName} must not force text across a microscopic cloud block`);
    else assert.equal(block.hasInsideLabel, true, `${block.fullName} needs an inside label`);
  }
  const rows = new Map();
  for (const label of audit.labelGeometry) {
    const key = label.y.toFixed(3);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(label);
  }
  for (const labels of rows.values()) {
    labels.sort((a,b)=>a.x-b.x);
    for (let index=1;index<labels.length;index++) assert.ok(labels[index-1].x+labels[index-1].width<=labels[index].x,
      `${labels[index-1].fullName} and ${labels[index].fullName} must not overlap in the cloud header`);
  }
  assert.equal(audit.abbreviationKey.includes('Holocene'), false, 'omitted cloud Holocene needs no detached key entry');
  assert.deepEqual(audit.calloutLeaders, [], 'omitted cloud Holocene must not create an external arrow');
  assert.deepEqual(audit.geologicLabels.filter(item => item.external), [], 'all visible cloud labels stay inside their blocks');
  assert.equal(audit.calloutArrows.length, 0, 'omitted cloud Holocene must not create a vector arrow');
  assert.equal(audit.abbreviationKey.some(text => /^H\s*=/.test(text)), false, 'omitted cloud Holocene must not add an H key');
  assert.deepEqual(audit.abbreviationKey, [], 'cloud abbreviation full names belong in the figure caption, not on the canvas');
  assert.deepEqual(audit.border.blockStrokes, ['none'], 'cloud colored cells must not each draw a translucent border');
  assert.equal(audit.border.frames.length, 3, 'cloud geological header needs one frame per row');
  assert.ok(audit.border.frames.every(frame => frame.opacity === '1' && frame.width === '1px'),
    'cloud row frames must be opaque one-pixel vector strokes');
  const dividerKeys = audit.border.dividers.map(item => `${item.row}|${item.x}`);
  assert.equal(new Set(dividerKeys).size, dividerKeys.length, 'cloud shared boundaries must be drawn once');
}
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], computationRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/cloud-(?:date(?:\/jobs)?|phyparts)(?:$|\?)/.test(request.url())) computationRequests.push(request.url()); });
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => PhyloRenderAgent.ready());
  const load = spec => page.evaluate(spec => PhyloRenderAgent.loadFigure(spec), spec);
  const biology = () => page.evaluate(() => JSON.stringify({ tree: state.cloud.speciesRoot,
    ages: [...state.cloud.datedAges.get(state.cloud.speciesRoot)], counts: state.cloud.phyPartsTable }));
  const audit = () => page.evaluate(() => ({
    axes: document.querySelectorAll('.time-axis').length,
    geology: document.querySelectorAll('.time-geology').length,
    labels: [...document.querySelectorAll('.time-axis-unit')].map(el => el.textContent),
    periods: [...document.querySelectorAll('.time-period-block')].map(el => [el.getAttribute('x'),el.getAttribute('width')]),
    axisRange: ['x1','x2'].map(attribute=>Number(document.querySelector('.time-axis-top .time-axis-line')?.getAttribute(attribute))),
    canvasWidth: state.currentSvgSize.width,
    geologicBlocks: [...document.querySelectorAll('.time-geo-block')].map(el => ({
      fullName: el.dataset.fullName, placement: el.dataset.labelPlacement,
      hasInsideLabel: el.nextElementSibling?.classList.contains('time-geo-label')
        && el.nextElementSibling?.dataset.fullName === el.dataset.fullName,
    })),
    geologicLabels: [...document.querySelectorAll('.time-geo-label')].map(el => ({
      label: el.textContent.trim(), fullName: el.dataset.fullName, compact: el.classList.contains('compact'), external: el.classList.contains('external-label'),
    })),
    abbreviationKey: [...document.querySelectorAll('.time-geology-key text')].map(el => el.textContent.trim()),
    figureKeys: document.querySelectorAll('.time-figure-key').length,
    calloutLeaders: [...document.querySelectorAll('.time-geo-callout-leader')].map(el => el.dataset.fullName),
    calloutArrows: [...document.querySelectorAll('path.time-geo-callout-leader')].map(el => el.getAttribute('d')),
    pies: document.querySelectorAll('.cloud-pie').length,
    hidden: JSON.parse(document.getElementById('tree-svg').dataset.cloudTimeBackground),
    han: [...document.querySelectorAll('#tree-svg text')].filter(el => /[\u3400-\u9fff]/.test(el.textContent)).map(el => el.textContent),
    fonts: [...document.querySelectorAll('.time-axis-label')].map(el => parseFloat(getComputedStyle(el).fontSize)),
    bottom: document.querySelector('.time-axis-bottom .time-axis-line')?.getAttribute('y1'),
    tipYs: [...document.querySelectorAll('.cloud-tip-label')].map(el => Number(el.getAttribute('y'))),
    labelGeometry: [...document.querySelectorAll('.time-geo-label')].map(el => {
      const box = el.getBBox(), block = el.previousElementSibling.getBBox();
      return { fullName: el.dataset.fullName, x: box.x, y: box.y, width: box.width, height: box.height,
        fits: box.x >= block.x && box.x + box.width <= block.x + block.width
          && box.y >= block.y && box.y + box.height <= block.y + block.height };
    }),
    border: {
      blockStrokes: [...new Set([...document.querySelectorAll('.time-geo-block')].map(el => getComputedStyle(el).stroke))],
      frames: [...document.querySelectorAll('.time-geo-frame')].map(el => ({
        row: el.dataset.row, opacity: getComputedStyle(el).strokeOpacity, width: getComputedStyle(el).strokeWidth,
      })),
      dividers: [...document.querySelectorAll('.time-geo-divider')].map(el => ({
        row: el.dataset.row, x: Number(el.getAttribute('x1')).toFixed(6),
      })),
    },
  }));
  await load(base);
  const before = await biology(), first = await audit();
  assert.equal(first.axes, 2); assert.equal(first.geology, 1); assert.equal(first.pies, 3);
  assert.equal(first.figureKeys, 0, 'cloud time provenance belongs in the figure caption, not on the canvas');
  assertGeologicLabels(first);
  assert.deepEqual(first.han, []); assert.ok(Number(first.bottom) > Math.max(...first.tipYs));
  await page.locator('[data-settings-target="background"]').click();
  await page.locator('#time-background-section > summary').click();
  assert.equal(await page.locator('#cloud-show-time-axis').isVisible(), true);
  assert.equal(await page.locator('#cloud-opacity').isVisible(), false);
  assert.equal(await page.locator('#time-geology').isDisabled(), false);
  await page.locator('#time-axis-size-number').fill(String(units.ptToDrawing(16)));
  await page.locator('#time-axis-size-number').dispatchEvent('change');
  await page.evaluate(() => flushSettingsRender());
  assert.ok((await audit()).fonts.every(size => Math.abs(size - 16 * 4 / 3) < .01));
  assert.equal(await biology(), before, 'background never changes ages, topology or counts');
  await page.locator('#time-geology').selectOption('none');
  await page.evaluate(() => flushSettingsRender());
  assert.equal((await audit()).geology, 0); assert.equal((await audit()).axes, 2);
  await page.locator('#cloud-show-time-axis').uncheck();
  await page.evaluate(() => flushSettingsRender());
  assert.equal((await audit()).axes, 0); assert.equal(await biology(), before);
  const unitAudits = [];
  for (const [unit, scale] of [['mya',1],['kyr',1000],['years',1e6]]) {
    await load({ ...base, main_tree: { ...base.main_tree, content: tree.replace(/:(\d+)/g, (_,value) => `:${Number(value)*scale}`) },
      options: { ...base.options, cloud: { ...base.options.cloud, dated_unit: unit } } });
    const current = await audit();
    assertGeologicLabels(current);
    assert.equal(current.canvasWidth,units.designWidth,'unit text stays inside the same fixed-width frame');
    assert.equal(current.periods.length,first.periods.length);
    const relative=figure=>figure.periods.map(([x,width])=>[(Number(x)-figure.axisRange[0])/(figure.axisRange[1]-figure.axisRange[0]),Number(width)/(figure.axisRange[1]-figure.axisRange[0])]);
    const expected=relative(first);
    relative(current).forEach((block,index)=>block.forEach((value,coordinate)=>assert.ok(Math.abs(value-expected[index][coordinate])<1e-12,
      `${unit}: geological boundaries preserve their exact relative time coordinates; unit-name widths may change the reserved text lane`)));
    assert.equal(current.geology, 1); unitAudits.push({ unit, labels: current.labels });
  }
  for (const unit of ['relative','unconfirmed']) {
    await load({ ...base, options: { cloud: { ...base.options.cloud, dated_unit: unit }, time: { geology: 'standard' } } });
    assert.equal((await audit()).geology, 1, 'standard palette is available without confirming units');
    assert.equal((await audit()).hidden.illustrativePalette, true, 'palette cannot override cloud unit provenance');
    assert.equal((await audit()).axes, 2);
    assert.equal(await page.locator('#time-geology').isDisabled(), false);
  }
  await load({ ...base, options: { cloud: { species_method: 'coalescent', show_gene: false, show_time_axis: true }, time: { geology: 'standard' } } });
  assert.equal((await audit()).geology, 1); assert.match((await audit()).labels[0], /Relative time/);
  await load(base);
  const configuration = await page.evaluate(() => PhyloRenderAgent.exportConfiguration());
  figureSpecSchema.parse(configuration);
  assert.equal(configuration.options.cloud.show_time_axis, true);
  const web = (await load(configuration)).svg, mcp = await runtime.renderer.render(configuration);
  const canonical = svg => page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    doc.querySelectorAll('metadata').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => [...el.attributes].filter(a => a.name.startsWith('data-')).forEach(a => el.removeAttribute(a.name)));
    return new XMLSerializer().serializeToString(doc.documentElement);
  }, svg);
  assert.equal(await canonical(web), await canonical(mcp.svg), 'web/MCP share exactly the same background renderer');
  assert.equal(mcp.report.topology_unchanged, true);
  assert.deepEqual(computationRequests, [], 'background edits never run treePL or PhyParts');
  await load({ ...base, options: { ...base.options, time: { geology: 'standard',
    ...Object.fromEntries(['period','epoch','legend','axis','unit','key'].map(type => [`${type}_size_pt`,24])) } } });
  const legendSafe = await page.evaluate(() => {
    const legend = document.querySelector('.cloud-pie-legend').getBBox();
    const group = document.querySelector('.cloud-pie-legend');
    const y = Number(group.dataset.layoutY);
    const rect = { x: legend.x + Number(group.dataset.layoutX), y: legend.y + y, width:legend.width,height:legend.height };
    return [...document.querySelectorAll('.time-axis,.time-geology-key')].every(el => {
      const box = el.getBBox();
      return !(rect.x < box.x + box.width && rect.x + rect.width > box.x && rect.y < box.y + box.height && rect.y + rect.height > box.y);
    });
  });
  assert.equal(legendSafe, true, 'large fonts on a small tree cannot make the pie key cover the time axes');
  await load({ ...base, main_tree: { name: 'early-cretaceous-header.tree', content: earlyCretaceousTree } });
  const earlyCretaceousAudit = await audit();
  assertGeologicLabels(earlyCretaceousAudit);
  assert.ok(earlyCretaceousAudit.geologicBlocks.some(item => item.fullName === 'Early Cretaceous' && item.placement === 'inside'),
    'the shared cloud header must include the 143.1–100.5 Mya Early Cretaceous block');
  assert.ok(earlyCretaceousAudit.geologicLabels.some(item => item.fullName === 'Early Cretaceous' && ['Early Cretaceous','Early K'].includes(item.label)),
    'the shared cloud header must visibly identify Early Cretaceous');
  // Explicit synthetic chronogram; the original StarBEAST file is preserved and rejected for positive tip ages.
  await load({ workspace: 'cloud', main_tree: { name: demo.name, content: demo.content },
    options: { cloud: { species_method: 'dated', dated_unit: 'mya', show_gene: false, show_time_axis: true }, time: { geology: 'standard' } } });
  const realAudit = await audit();
  assert.equal(realAudit.geology, 1); assert.deepEqual(realAudit.han, []); assertGeologicLabels(realAudit);
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.locator('[data-settings-target="background"]').click();
    await page.locator('#time-background-section > summary').click();
    await page.screenshot({ path: `${evidence}/cloud-background-settings.png` });
    const real = await page.evaluate(() => serializeRenderedSvg());
    await writeFile(`${evidence}/synthetic-dated-cloud-background.svg`, real);
    const preview = await runtime.renderer.browser.newPage({ viewport: { width: 1660, height: 1100 } });
    await preview.setContent(`<body style="margin:0">${real}</body>`);
    await preview.evaluate(() => document.fonts.ready);
    await preview.locator('svg').screenshot({ path: `${evidence}/synthetic-dated-cloud-background.png` });
    await preview.close();
    await writeFile(`${evidence}/audit.json`, JSON.stringify({ first, unitAudits, parity: true, computationRequests, errors, realTree: demo.name }, null, 2));
  }
  // Explicit synthetic gene-cloud fixture; a clean clone has no private demo.
  // These artificial lengths exercise the ML rendering path, not ML inference.
  await load({workspace:'cloud',main_tree:{name:'synthetic-reference.tree',content:tree},
    gene_trees:{name:'synthetic-genes.trees',content:tree+'\n'+tree},
    options:{cloud:{species_method:'dated',dated_unit:'mya',genes_method:'ml',
      phyparts_scale:'percent',show_gene:true,show_time_axis:false},time:{geology:'standard'}}});
  assert.equal(await page.evaluate(() => state.cloud.geneRoots.length),2);
  const computationsBeforeBackground = computationRequests.length;
  const cloudBefore = await page.evaluate(() => JSON.stringify({
    species: state.cloud.speciesRoot, genes: state.cloud.geneRoots,
    ages: [...state.cloud.datedAges].map(([root,ages]) => [root.id,[...ages].map(([node,age]) => [node.id,age])]),
    statistics: state.cloud.phyPartsTable,
  }));
  await page.locator('[data-settings-target="background"]').click();
  await page.locator('#time-background-section > summary').click();
  await page.locator('#cloud-show-time-axis').check();
  await page.evaluate(() => flushSettingsRender());
  const aligned = await page.evaluate(() => {
    const tips = new Map([...document.querySelectorAll('.cloud-tip-label')].map(el => [el.textContent, Number(el.getAttribute('y'))]));
    const yByRawName = new Map(PhyloRenderCloud.orderedTips(state.cloud.speciesRoot, document.getElementById('cloud-ladder-direction').value)
      .map((node,index) => [node.label.trim(), [...tips.values()][index]]));
    const geneTips = [...document.querySelectorAll('.cloud-gene-lines [data-cloud-tip]')];
    return { total: geneTips.length, valid: geneTips.every(el => Number(el.dataset.cloudTipY) === yByRawName.get(el.dataset.cloudTip)),
      biology: JSON.stringify({ species: state.cloud.speciesRoot, genes: state.cloud.geneRoots,
        ages: [...state.cloud.datedAges].map(([root,ages]) => [root.id,[...ages].map(([node,age]) => [node.id,age])]), statistics: state.cloud.phyPartsTable }) };
  });
  assert.ok(aligned.total > 0); assert.equal(aligned.valid, true);
  assert.equal(aligned.biology, cloudBefore);
  assert.equal(computationRequests.length, computationsBeforeBackground,
    'background toggles cannot restart dating or statistics for actual gene layers');
  assert.equal((await audit()).axes, 2); assert.equal((await audit()).geology, 1);
  if (evidence) await page.screenshot({ path: `${evidence}/synthetic-gene-cloud.png` });
  assert.deepEqual(errors, []);
  console.log('PASS cloud Tree/Background routing, shared Dating axes/geology, three confirmed units, relative/unconfirmed safety, unchanged biology, no recalculation, web/MCP parity, synthetic dated-tree SVG and actual gene-cloud tip alignment');
} finally { await runtime.close(); }
