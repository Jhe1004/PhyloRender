import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage();
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  const spec = {
    main_tree: { content: '(((Clematis_montana:1,Clematis_alpina:1.2)0.83:.5,Carex_gamma:1)0.91:.4,Oreithales_integrifolia:2);' },
    rooting: { outgroup: null },
    options:{support:{scale:'probability'}},
  };
  const result = await page.evaluate(spec => window.PhyloRenderAgent.loadFigure(spec), spec);
  assert.equal(result.normalized_spec.options.typography.tips.family, 'Arial, "Noto Sans SC Variable", sans-serif');
  assert.equal(result.normalized_spec.options.typography.nodes.family, 'Arial, "Noto Sans SC Variable", sans-serif');
  assert.deepEqual(result.report.font_portability.system_font_families, ['Arial']);
  assert.equal(result.report.font_portability.all_fonts_embedded, false);
  assert.match(result.svg, /data-system-fonts="Arial"/);
  assert.match(result.svg, /data-all-fonts-embedded="false"/);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  async function platformFonts(session, selector) {
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert.ok(nodeId, selector);
    return (await session.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.filter(font => font.glyphCount > 0);
  }
  const fontAudit = [];
  for (const selector of ['.tip-label', '.support-label']) {
    const fonts = await platformFonts(cdp, selector);
    assert.ok(fonts.length);
    assert.ok(fonts.every(font => /^Arial$/i.test(font.familyName)), JSON.stringify(fonts));
    assert.ok(fonts.every(font => !font.isCustomFont));
    fontAudit.push({ selector, fonts });
  }
  // Inspect the standalone native SVG too, not just its CSS family declaration.
  const preview = await runtime.renderer.browser.newPage();
  await preview.setContent(`<body style="margin:0">${result.svg}</body>`);
  await preview.evaluate(() => document.fonts.ready);
  const previewCdp = await preview.context().newCDPSession(preview);
  await previewCdp.send('DOM.enable'); await previewCdp.send('CSS.enable');
  const standaloneFonts = await platformFonts(previewCdp, '.support-label');
  assert.ok(standaloneFonts.length && standaloneFonts.every(font => font.familyName === 'Arial'));
  if (process.argv[2]) {
    await writeFile(`${process.argv[2]}/02_真实Arial验证.svg`, result.svg);
    await preview.locator('svg').screenshot({ path: `${process.argv[2]}/03_真实Arial导出预览.png` });
  }
  await preview.close();
  // The real frozen cloud example must also use actual Arial on the Mac.
  const cloud = await runtime.renderer.browser.newPage();
  await cloud.goto(runtime.demoPageUrl); await cloud.evaluate(() => window.PhyloRenderReady);
  let cloudFonts = null;
  if (await cloud.locator('.cloud-tip-label').count()) {
    const cloudCdp = await cloud.context().newCDPSession(cloud);
    await cloudCdp.send('DOM.enable'); await cloudCdp.send('CSS.enable');
    cloudFonts = await platformFonts(cloudCdp, '.cloud-tip-label');
    assert.ok(cloudFonts.length && cloudFonts.every(font => font.familyName === 'Arial'));
    if (process.argv[2]) {
      const svg = await cloud.evaluate(() => serializeRenderedSvg());
      await writeFile(`${process.argv[2]}/04_真实99样品云树_Arial.svg`, svg);
      const size = await cloud.evaluate(() => state.currentSvgSize);
      const cloudPreview = await runtime.renderer.browser.newPage({ viewport: {
        width: Math.ceil(size.width), height: Math.ceil(size.height) } });
      await cloudPreview.setContent(`<body style="margin:0">${svg}</body>`);
      await cloudPreview.evaluate(() => document.fonts.ready);
      await cloudPreview.screenshot({ path: `${process.argv[2]}/05_真实云树SVG预览.png` });
      await cloudPreview.close();
    }
  }
  // Force the Arial probe to fail, then inspect actual cloud labels AND key.
  await cloud.evaluate(async () => {
    systemFontAvailabilityCache.set('Arial', Promise.resolve(false));
    await ensureFigureFontsReady(); await renderTree({ fontReady: true });
  });
  if (await cloud.locator('.cloud-tip-label').count()) {
    const fallbackCdp = await cloud.context().newCDPSession(cloud);
    await fallbackCdp.send('DOM.enable'); await fallbackCdp.send('CSS.enable');
    for (const selector of ['.cloud-tip-label', '#cloud-pie-legend-layer text']) {
      const fonts = await platformFonts(fallbackCdp, selector);
      assert.ok(fonts.length && fonts.every(font => font.familyName === 'Arimo'), JSON.stringify(fonts));
    }
    assert.equal(await cloud.locator('#figure-font-notice').isVisible(), true);
    const fallbackSvg = await cloud.evaluate(() => serializeRenderedSvg());
    assert.match(fallbackSvg, /data-font-fallback="Arial-to-Arimo"/);
    assert.match(fallbackSvg, /data-system-fonts=""/);
    assert.match(fallbackSvg, /font-family:\s*["']PhyloRender Arimo["']/);
    if (process.argv[2]) {
      await writeFile(`${process.argv[2]}/06_Arial缺失_明确Arimo云树.svg`, fallbackSvg);
      const fallbackPreview = await runtime.renderer.browser.newPage({ viewport: { width: 1500, height: 2200 } });
      await fallbackPreview.setContent(`<body style="margin:0">${fallbackSvg}</body>`);
      await fallbackPreview.evaluate(() => document.fonts.ready);
      await fallbackPreview.locator('svg').screenshot({ path: `${process.argv[2]}/07_Arimo云树原生SVG预览.png` });
      const embeddedCdp = await fallbackPreview.context().newCDPSession(fallbackPreview);
      await embeddedCdp.send('DOM.enable'); await embeddedCdp.send('CSS.enable');
      const fonts = await platformFonts(embeddedCdp, '.cloud-tip-label');
      assert.ok(fonts.length && fonts.every(font => font.familyName === 'Arimo' && font.isCustomFont));
      await fallbackPreview.close();
    }
  }
  await cloud.close();
  const missing = await page.evaluate(async () => {
    systemFontAvailabilityCache.set('Arial', Promise.resolve(false));
    const svg = await serializeRenderedSvg();
    return { svg, actual: document.getElementById('support-font-family').value,
      notice: document.getElementById('figure-font-notice').textContent };
  });
  assert.match(missing.svg, /data-font-fallback="Arial-to-Arimo"/);
  assert.match(missing.svg, /data-all-fonts-embedded="true"/);
  assert.match(missing.actual, /PhyloRender Arimo/);
  assert.match(missing.notice, /已明确改用 Arimo/);
  const fallbackFonts = await platformFonts(cdp, '.support-label');
  assert.ok(fallbackFonts.length && fallbackFonts.every(font => font.familyName === 'Arimo'));
  const fallbackResult = await page.evaluate(spec => window.PhyloRenderAgent.loadFigure(spec), spec);
  assert.match(fallbackResult.normalized_spec.options.typography.nodes.family, /PhyloRender Arimo/);
  assert.deepEqual(fallbackResult.report.font_portability.fallback,
    { requested: 'Arial', actual: 'Arimo', reason: 'Arial unavailable' });
  assert.ok(fallbackResult.report.warnings.some(message => /明确改用 Arimo/.test(message)));
  // Fixed Dating-axis text must follow the same fallback as editable labels.
  const dated = await runtime.renderer.browser.newPage();
  await dated.goto(runtime.renderer.agentPageUrl);
  await dated.evaluate(() => window.PhyloRenderReady);
  await dated.evaluate(async () => {
    systemFontAvailabilityCache.set('Arial', Promise.resolve(false));
    await switchWorkspaceMode('time');
    await window.PhyloRenderAgent.loadFigure({ main_tree: {
      content: '((A:1,B:1)[&height=1]:1,(C:1,D:1)[&height=1]:1)[&height=2];' },
      rooting: { outgroup: null } });
  });
  const datedCdp = await dated.context().newCDPSession(dated);
  await datedCdp.send('DOM.enable'); await datedCdp.send('CSS.enable');
  const datedFonts = await platformFonts(datedCdp, '.time-axis-label');
  assert.ok(datedFonts.length && datedFonts.every(font => font.familyName === 'Arimo'));
  await dated.close();
  // Conflict labels and their canvas measurements use the resolved font too.
  const conflict = await runtime.renderer.browser.newPage();
  await conflict.goto(runtime.renderer.agentPageUrl);
  await conflict.evaluate(() => window.PhyloRenderReady);
  await conflict.evaluate(async () => {
    systemFontAvailabilityCache.set('Arial', Promise.resolve(false));
    await switchWorkspaceMode('conflict');
    await ensureFigureFontsReady();
  });
  const treeFile = (name, content) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
  await conflict.locator('#conflict-nuclear-file').setInputFiles(treeFile('primary.tre', '((Clematis_montana:1,Clematis_alpina:1)95:1,Carex_gamma:2);'));
  await conflict.locator('#tree-loading').waitFor({ state: 'hidden' });
  await conflict.locator('#conflict-plastid-file').setInputFiles(treeFile('comparison.tre', '((Clematis_montana:1,Carex_gamma:1)90:1,Clematis_alpina:2);'));
  await conflict.waitForFunction(() => document.querySelectorAll('.conflict-tip-label').length === 6);
  await conflict.evaluate(async () => { await ensureFigureFontsReady(); await renderTree({ fontReady: true }); });
  const conflictCdp = await conflict.context().newCDPSession(conflict);
  await conflictCdp.send('DOM.enable'); await conflictCdp.send('CSS.enable');
  const conflictFonts = await platformFonts(conflictCdp, '.conflict-tip-label');
  assert.ok(conflictFonts.length && conflictFonts.every(font => font.familyName === 'Arimo'));
  await conflict.close();
  // An explicitly chosen alternative stays distinct and remains available.
  await page.evaluate(async () => {
    const family = '"PhyloRender Arimo", "Noto Sans SC Variable", sans-serif';
    for (const type of ['tip', 'support', 'clade', 'scale']) document.getElementById(`${type}-font-family`).value = family;
    await ensureFigureFontsReady(); await renderTree({ fontReady: true });
  });
  const alternative = await platformFonts(cdp, '.support-label');
  assert.ok(alternative.length && alternative.every(font => font.familyName === 'Arimo'));
  const audit = { fontAudit, standaloneFonts, cloudFonts, fallbackFonts, datedFonts, conflictFonts,
    fallback: { actual: missing.actual, notice: missing.notice }, alternative };
  if (process.argv[2]) await writeFile(`${process.argv[2]}/01_字体实际渲染验收.json`, JSON.stringify(audit, null, 2));
  console.log('PASS actual Arial, italic names, standalone SVG, missing Arial explicit Arimo fallback, reflow, cloud key, MCP metadata and distinct alternatives', JSON.stringify(audit));
} finally { await runtime.close(); }
