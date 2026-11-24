import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createRuntime } from '../src/runtime.mjs';
import { figureSpecSchema } from '../src/schemas.mjs';
const require = createRequire(import.meta.url);
const demo = require('../../defaults/dating-synthetic.js');
const types = ['period', 'epoch', 'axis', 'unit'];
const selectors = ['.time-period-block + text', '.time-epoch-label', '.time-axis-label', '.time-axis-unit'];
const spec = { workspace: 'time', main_tree: { name: 'dated.tree', content: '((A_alpha:30,B_beta:30)[&height=30,height_95%_HPD={25,35}]:55,(C_gamma:10,D_delta:10)[&height=10]:75)[&height=85];' }, options: { time: { source_unit: 'mya' } } };
const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => PhyloRenderAgent.ready());
  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), spec);
  const inspect = () => page.evaluate(selectors => ({
    sizes: selectors.map(selector => parseFloat(getComputedStyle(document.querySelector(`#tree-svg ${selector}`)).fontSize)),
    compact: [...document.querySelectorAll('#tree-svg .time-geo-label.compact')].map(el => ({ size: parseFloat(getComputedStyle(el).fontSize), epoch: el.classList.contains('time-epoch-label'), shrunk: el.dataset.labelShrunk === 'true' })),
    geologicBlocks: [...document.querySelectorAll('#tree-svg .time-geo-block')].map(el => ({
      fullName: el.dataset.fullName, placement: el.dataset.labelPlacement,
      hasInsideLabel: el.nextElementSibling?.classList.contains('time-geo-label')
        && el.nextElementSibling?.dataset.fullName === el.dataset.fullName,
    })),
    geologicLabels: [...document.querySelectorAll('#tree-svg .time-geo-label')].map(el => ({
      label: el.textContent.trim(), fullName: el.dataset.fullName, compact: el.classList.contains('compact'), external: el.classList.contains('external-label'),
    })),
    abbreviationKey: [...document.querySelectorAll('#tree-svg .time-geology-key text')].map(el => el.textContent.trim()),
    figureKeys: document.querySelectorAll('#tree-svg .time-figure-key').length,
    calloutLeaders: [...document.querySelectorAll('#tree-svg .time-geo-callout-leader')].map(el => el.dataset.fullName),
    calloutArrows: [...document.querySelectorAll('#tree-svg path.time-geo-callout-leader')].map(el => el.getAttribute('d')),
    ages: descendantInternalNodes(state.root).map(node => [node.tipNames, node.timeAge, node.timeHpd]),
    han: [...document.querySelectorAll('#tree-svg text')].filter(el => /\p{Script=Han}/u.test(el.textContent)).map(el => el.textContent),
    blockFit: [...document.querySelectorAll('#tree-svg .time-geo-label')].map(el => {
      const box = el.getBBox(), block = el.previousElementSibling.getBBox();
      const external = el.classList.contains('external-label');
      return { fullName: el.dataset.fullName, x: box.x, y: box.y, width: box.width, height: box.height,
        fits: external || (box.x >= block.x && box.x + box.width <= block.x + block.width && box.y >= block.y && box.y + box.height <= block.y + block.height), external };
    }),
    border: {
      blockStrokes: [...new Set([...document.querySelectorAll('#tree-svg .time-geo-block')].map(el => getComputedStyle(el).stroke))],
      frames: [...document.querySelectorAll('#tree-svg .time-geo-frame')].map(el => ({
        row: el.dataset.row, stroke: getComputedStyle(el).stroke,
        opacity: getComputedStyle(el).strokeOpacity, width: getComputedStyle(el).strokeWidth,
      })),
      dividers: [...document.querySelectorAll('#tree-svg .time-geo-divider')].map(el => ({
        row: el.dataset.row, x: Number(el.getAttribute('x1')).toFixed(6),
      })),
    },
  }), selectors);
  const assertBlockLabels = audit => {
    for (const block of audit.geologicBlocks) {
      if (block.placement === 'omitted') assert.equal(block.hasInsideLabel, false,
        `${block.fullName} must not force text across a microscopic block`);
      else assert.equal(block.hasInsideLabel, true, `${block.fullName} needs an inside label`);
    }
    const rows = new Map();
    for (const label of audit.blockFit) {
      const key = label.y.toFixed(3);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(label);
    }
    for (const labels of rows.values()) {
      labels.sort((a,b)=>a.x-b.x);
      for (let index=1;index<labels.length;index++) assert.ok(labels[index-1].x+labels[index-1].width<=labels[index].x,
        `${labels[index-1].fullName} and ${labels[index].fullName} must not overlap`);
    }
    assert.equal(audit.abbreviationKey.includes('Holocene'), false, 'omitted Holocene needs no detached key entry');
    assert.deepEqual(audit.calloutLeaders, [], 'omitted Holocene must not create an external arrow');
    assert.deepEqual(audit.geologicLabels.filter(item => item.external), [], 'all visible labels stay inside their blocks');
    assert.equal(audit.calloutArrows.length, 0, 'omitted Holocene must not create a vector arrow');
    assert.equal(audit.abbreviationKey.some(text => /^H\s*=/.test(text)), false, 'omitted Holocene must not add an H key');
    assert.deepEqual(audit.abbreviationKey, [], 'abbreviation full names belong in the figure caption, not on the canvas');
    assert.equal(audit.figureKeys, 0, 'time provenance belongs in the figure caption, not on the canvas');
    assert.deepEqual(audit.border.blockStrokes, ['none'], 'colored cells must not each draw a translucent border');
    assert.equal(audit.border.frames.length, 3, 'the three geological rows need one frame each');
    assert.ok(audit.border.frames.every(frame => frame.opacity === '1' && frame.width === '1px'),
      'row frames must be opaque one-pixel vector strokes');
    const dividerKeys = audit.border.dividers.map(item => `${item.row}|${item.x}`);
    assert.equal(new Set(dividerKeys).size, dividerKeys.length, 'shared boundaries must be drawn once');
  };
  const before = await inspect();
  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), {
    ...spec, main_tree: { name: 'early-cretaceous-header.tree', content: '((A_alpha:30,B_beta:30)[&height=30,height_95%_HPD={25,35}]:106.3,(C_gamma:10,D_delta:10)[&height=10]:126.3)[&height=136.3];' },
  });
  const realHeader = await inspect();
  assert.ok(realHeader.geologicBlocks.some(item => item.fullName === 'Early Cretaceous' && item.placement === 'inside'),
    'the real 150 Mya header must include the 143.1–100.5 Mya Early Cretaceous block');
  assert.ok(realHeader.geologicLabels.some(item => item.fullName === 'Early Cretaceous' && ['Early Cretaceous','Early K'].includes(item.label)),
    'the Early Cretaceous block must carry a visible full name or safe abbreviation');
  assertBlockLabels(realHeader);
  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), spec);
  const requested = [13.5, 11.25, 12, 10.5];
  for (const [index, type] of types.entries()) {
    await page.evaluate(async ({ type, size }) => {
      const input = document.querySelector(`#time-${type}-size`);
      input.value = String(size);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flushSettingsRender();
    }, { type, size: requested[index] });
    const audit = await inspect();
    for (let i = 0; i < types.length; i++) assert.ok(Math.abs(audit.sizes[i] - (i <= index ? requested[i] * 4 / 3 : before.sizes[i])) < .01, `${type} must not change ${types[i]}`);
    assert.deepEqual(audit.ages, before.ages, 'font changes must preserve source ages and HPD');
    assert.deepEqual(audit.han, []);
    assertBlockLabels(audit);
    assert.ok(audit.geologicLabels.every(item => item.label), 'geological labels cannot be blank');
    assert.equal(audit.geologicBlocks.filter(item => item.fullName === 'Holocene').every(item => item.placement === 'omitted'), true,
      'microscopic Holocene labels must be omitted');
    assert.ok(audit.blockFit.every(item => item.fits && !item.external),
      'all visible labels fit completely inside their original blocks');
    for (const item of audit.compact) {
      const targetSize = audit.sizes[item.epoch ? 1 : 0];
      if (item.shrunk) assert.ok(item.size >= 4 && item.size <= targetSize, 'shrunk narrow-cell abbreviations reduce size only enough to fit');
      else assert.ok(Math.abs(item.size - targetSize) < .01, 'abbreviations that fit naturally retain requested size');
    }
  }
  const configuration = await page.evaluate(() => PhyloRenderAgent.exportConfiguration());
  figureSpecSchema.parse(configuration);
  for (const [index, type] of types.entries()) equalU(configuration.options.time[`${type}_size_u`], units.ptToDrawing(requested[index]));
  // Fresh browser/MCP rendering uses the same settings contract and exact SVG graphics.
  const web = await page.evaluate(async configuration => (await PhyloRenderAgent.loadFigure(configuration)).svg, configuration);
  const mcp = await runtime.renderer.render(configuration);
  const canonical = source => page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    doc.querySelectorAll('metadata').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => [...el.attributes].filter(attr => attr.name.startsWith('data-')).forEach(attr => el.removeAttribute(attr.name)));
    return new XMLSerializer().serializeToString(doc.documentElement);
  }, source);
  assert.equal(await canonical(web), await canonical(mcp.svg), 'web and MCP SVG must agree');
  assert.equal(mcp.report.topology_unchanged, true);
  for (const type of types) for (const value of [2, 25]) assert.equal(figureSpecSchema.safeParse({ ...spec, options: { time: { [`${type}_size_pt`]: value } } }).success, false);
  // Exercise the largest font settings too, including narrow epoch blocks.
  await page.evaluate(input => PhyloRenderAgent.loadFigure(input), { ...spec, options: { time: { source_unit: 'mya', ...Object.fromEntries(types.map(type => [`${type}_size_pt`, 24])) } } });
  const maximum = await inspect();
  assert.ok(maximum.sizes.every(size => Math.abs(size - 32) < .01));
  assert.deepEqual(maximum.han, []);
  assertBlockLabels(maximum);
  assert.ok(maximum.geologicLabels.every(item => item.label));
  assert.equal(maximum.geologicBlocks.filter(item => item.fullName === 'Holocene').every(item => item.placement === 'omitted'), true);
  assert.ok(maximum.blockFit.every(item => item.fits && !item.external));
  assert.deepEqual(errors, []);
  if (process.argv[2]) {
    await mkdir(process.argv[2], { recursive: true });
    const actual = await runtime.renderer.render({ ...spec, main_tree: { name: demo.name, content: demo.content }, options: { time: { source_unit: 'mya', period_size_pt: 12, epoch_size_pt: 10, legend_size_pt: 9, axis_size_pt: 11, unit_size_pt: 10, key_size_pt: 9 } } });
    await writeFile(`${process.argv[2]}/03_TimeTypography.svg`, actual.svg);
    await writeFile(`${process.argv[2]}/04_TimeTypography.png`, actual.preview);
    await writeFile(`${process.argv[2]}/05_TimeTypographyAudit.json`, JSON.stringify({ before, requested, maximum, normalized: mcp.normalizedSpec.options.time, actualReport: actual.report, parity: true }, null, 2));
  }
  console.log('PASS visible time typography controls, caption-only abbreviation definitions, age/HPD preservation and web/MCP parity');
} finally { await runtime.close(); }
