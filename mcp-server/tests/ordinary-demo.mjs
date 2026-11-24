import assert from 'node:assert/strict';
import { selectHistoricalConsensus } from './select-historical-consensus.mjs';
import { writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRuntime, PROJECT_ROOT } from '../src/runtime.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  const httpDemo=new URL(runtime.demoPageUrl);httpDemo.searchParams.set('workspace','phylogeny');
  const urls = [httpDemo.href,
    `${pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href}?demo=1&workspace=phylogeny`];
  for (const url of urls) {
    const start = Date.now();
    await page.goto(url);
    await page.evaluate(() => window.PhyloRenderReady);
    const result = await page.evaluate(() => ({
      mode: state.workspaceMode,
      tips: PhyloRenderConflict.tipNodes(state.parsedRoot).length,
      drawnTips: document.querySelectorAll('#tree-svg .tip-label').length,
      supportTips: PhyloRenderConflict.tipNodes(state.nodeDataSources[0].parsedRoot).length,
      source: state.sourceName,
      mainScale: $('support-scale').value,
      supportScale: state.nodeDataSources[0].scale,
    }));
    assert.equal(result.mode, 'phylogeny');
    assert.equal(result.tips, 58);
    assert.equal(result.drawnTips, 58);
    assert.equal(result.supportTips, 58);
    assert.equal(result.source, 'ordinary-compact-main.nwk');
    assert.equal(result.mainScale,'probability');
    assert.equal(result.supportScale,'percent');
    assert.ok(!requests.some(request => /ordinary-compact-(main|support)\.nwk|\/defaults\/Raxml-Chloroplast/.test(request)));
    console.log('PASS compact ordinary demo', url.startsWith('file:') ? 'file' : 'http', JSON.stringify(result), `${Date.now() - start} ms`);
    if (process.argv[2] && url.startsWith('file:')) {
      await writeFile(`${process.argv[2]}/01_普通树58样品.svg`, await page.evaluate(() => serializeRenderedSvg()));
      await page.screenshot({ path: `${process.argv[2]}/02_普通树页面.png` });
      await writeFile(`${process.argv[2]}/03_默认示例验证.json`, JSON.stringify(result, null, 2));
    }
  }
  // The same renderer must still accept all 173 original taxa on import.
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  const full = await readFile(path.join(PROJECT_ROOT, 'defaults/Raxml-Chloroplast.con.tre'), 'utf8');
  await page.evaluate(content => window.PhyloRenderAgent.loadFigure({ main_tree: { name: 'full-regression.nex', content },options:{support:{scale:'probability'}} }), selectHistoricalConsensus(full));
  assert.equal(await page.evaluate(() => PhyloRenderConflict.tipNodes(state.parsedRoot).length), 173);
  assert.deepEqual(errors, []);
  console.log('PASS full 173-taxon MCP/user input is not reduced');
  await page.close();
} finally { await runtime.close(); }
