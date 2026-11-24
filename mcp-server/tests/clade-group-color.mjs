import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';
import { figureOptionsSchema } from '../src/schemas.mjs';

const legacy = { color: '#ff00ff', follow_clade_color: false, size_pt: 12, bold: false, italic: true };
assert.deepEqual(figureOptionsSchema.parse({ typography: { clades: legacy } }).typography.clades, legacy);
const runtime = await createRuntime();
const results = {};
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/api\/cloud-(date|phyparts)/.test(r.url())) requests.push(r.url()); });
  const assertColors = async () => {
    const rows = await page.locator('.clade-bar-label').evaluateAll(labels => labels.map(label => ({
      id: label.dataset.cladeNodeId, fill: getComputedStyle(label).fill,
      bar: getComputedStyle(document.querySelector(`.clade-bar[data-bar-part="body"][data-clade-node-id="${label.dataset.cladeNodeId}"]`)).stroke,
      segments: [...label.children].map(s => ({ fill: getComputedStyle(s).fill, explicit: s.hasAttribute('fill') })),
    })));
    assert.ok(rows.length >= 2);
    for (const row of rows) {
      assert.equal(row.fill, row.bar);
      for (const segment of row.segments) if (!segment.explicit) assert.equal(segment.fill, row.bar);
    }
    assert.ok(new Set(rows.map(row => row.fill)).size >= 2);
    assert.equal(await page.locator('#clade-font-color, #clade-follow-clade').count(), 0);
    return rows;
  };
  const exportPreview = async name => {
    if (!process.argv[2]) return;
    const svg = await page.evaluate(() => serializeRenderedSvg());
    await writeFile(`${process.argv[2]}/${name}.svg`, svg);
    const size = await page.evaluate(() => state.currentSvgSize);
    const preview = await runtime.renderer.browser.newPage({ viewport: { width: Math.ceil(size.width), height: Math.ceil(size.height) } });
    await preview.setContent(`<body style="margin:0">${svg}</body>`);
    await preview.evaluate(() => document.fonts.ready);
    const fills = await preview.locator('.clade-bar-label').evaluateAll(labels => labels.map(l => ({ fill: getComputedStyle(l).fill,
      stroke: getComputedStyle(document.querySelector(`.clade-bar[data-bar-part="body"][data-clade-node-id="${l.dataset.cladeNodeId}"]`)).stroke })));
    fills.forEach(row => assert.equal(row.fill, row.stroke));
    await preview.screenshot({ path: `${process.argv[2]}/${name}.png` });
    await preview.close();
  };
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  if (await page.evaluate(() => Boolean(state.cloud.speciesRoot) && state.cloud.cladeColors.size >= 2)) {
    results.defaultCloud = await assertColors();
    await exportPreview('05_默认云树分组颜色');
    if (process.argv[2]) {
      await page.getByRole('button', { name: '分组', exact: true }).click();
      await page.locator('#clade-font-family').evaluate(el => { el.closest('details').open = true; });
      await page.screenshot({path:`${process.argv[2]}/06_分组名称设置界面.png`});
      await page.getByRole('button', { name: '导入', exact: true }).click();
    }
  }
  // Deterministic portable cloud fixture: already dated, no external dating or statistics computation.
  await page.evaluate(() => { $('cloud-show-gene').checked = false; });
  await page.locator('#cloud-input-section > summary').click();
  await page.locator('#cloud-species-method').selectOption('dated');
  await page.locator('#cloud-species-file').setInputFiles({ name: 'dated.nwk', mimeType: 'text/plain',
    buffer: Buffer.from('(O:10,((Alpha_a:2,Beta_b:2):3,(Gamma_c:2,Delta_d:2):3):5);') });
  await page.locator('#tree-loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => state.cloud.speciesName === 'dated.nwk' && document.querySelectorAll('.cloud-tip-label').length === 5);
  const cloudFingerprint = () => page.evaluate(() => JSON.stringify({ root: state.cloud.speciesRoot,
    ages: [...state.cloud.datedAges].map(([r,a]) => [r.id,[...a].map(([n,v]) => [n.id,v])]),
    statistics: state.cloud.phyPartsTable && [...state.cloud.phyPartsTable.rows] }));
  const before = await cloudFingerprint();
  await page.evaluate(async () => {
    clearCloudClades();
    for (const [labels, name, color] of [[['Alpha_a','Beta_b'],'Group A','#0072b2'],[['Gamma_c','Delta_d'],'Group B','#d55e00']]) {
      const nodes = [];
      const visit = n => { nodes.push(n); n.children.forEach(visit); };
      visit(state.cloud.speciesRoot);
      const node = nodes.find(n => descendantTipLabels(n).sort().join(',') === labels.map(l => l.replaceAll('_',' ')).sort().join(','));
      state.cloud.cladeColors.set(node.id,color); state.cloud.cladeNames.set(node.id,name);
    }
    await renderCloudTree();
  });
  results.cloud = await assertColors();
  const changeGroupColor = async () => {
    await page.evaluate(() => {
      const picker = document.querySelector('#clade-selection-list input[type="color"]');
      if (!picker) throw new Error('Missing individual group color control');
      picker.value = '#009e73'; picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.clade-bar-label')).fill === 'rgb(0, 158, 115)');
    await assertColors();
  };
  await changeGroupColor();
  const previewColor = await page.evaluate(() => {
    openCladeNameDialog([...activeCladeState().cladeColors.keys()][0]);
    const color = getComputedStyle($('clade-segment-preview')).color;
    closeCladeNameDialog();
    return color;
  });
  assert.equal(previewColor,'rgb(0, 158, 115)');
  assert.equal(await cloudFingerprint(), before);
  await exportPreview('01_云树分组颜色');
  assert.deepEqual(requests, []);
  const spec = { main_tree: { name: 'groups.nwk', content: '((Alpha_a:1,Beta_b:1):1,(Gamma_c:1,Delta_d:1):1);' },
    rooting: { outgroup: null }, clades: [
      { mrca_of: ['Alpha_a','Beta_b'], name: 'Group A', color: '#0072b2' },
      { mrca_of: ['Gamma_c','Delta_d'], name: 'Group B', color: '#d55e00' } ],
    options: { typography: { clades: legacy } } };
  const rendered = await runtime.renderer.render(spec);
  assert.equal(rendered.normalizedSpec.options.typography.clades.follow_clade_color, true);
  assert.equal(rendered.normalizedSpec.options.typography.clades.color, undefined);
  assert.ok(rendered.report.warnings.some(w => w.includes('typography.clades.color')));
  assert.equal(rendered.report.topology_unchanged, true);
  assert.equal(rendered.report.safe_for_export, true);
  results.mcp = rendered.normalizedSpec.options.typography.clades;
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  for (const [mode, output] of [['phylogeny','02_普通树分组颜色'],['time','03_Dating树分组颜色']]) {
    await page.evaluate(async ({mode,spec}) => { await switchWorkspaceMode(mode); await window.PhyloRenderAgent.loadFigure(spec); },
      {mode,spec:{...spec,options:{...spec.options,time:{source_unit:'mya',display_unit:'mya'}}}});
    assert.equal(await page.evaluate(() => state.workspaceMode),mode);
    results[mode] = await assertColors();
    assert.equal(await page.locator('#clade-font-size').inputValue(),'16');
    assert.equal(await page.locator('#clade-font-italic').isChecked(),true);
    assert.equal(await page.locator('#clade-font-bold').isChecked(),false);
    const original = await page.evaluate(() => JSON.stringify(state.root));
    await changeGroupColor();
    assert.equal(await page.evaluate(() => JSON.stringify(state.root)),original);
    await page.evaluate(async () => { resetTypography(); await renderTree(); });
    await assertColors();
    await exportPreview(output);
  }
  // Explicit per-group rich text color is not a global override and remains supported.
  const rich = await runtime.renderer.render({...spec,clades:[{...spec.clades[0],name_segments:[{text:'Group ',color:'#6f4e9c'},{text:'A'}]},spec.clades[1]]});
  assert.match(rich.svg, /#6f4e9c|rgb\(111, 78, 156\)/);
  assert.deepEqual(errors, []);
  if (process.argv[2]) await writeFile(`${process.argv[2]}/04_验证报告.json`,JSON.stringify({results,errors,requests},null,2));
  console.log('PASS individual group colors in ordinary/Dating/cloud GUI and exported SVG; per-group recoloring, global typography/reset, legacy MCP warning/normalization, rich text preservation, immutable data');
} finally { await runtime.close(); }
