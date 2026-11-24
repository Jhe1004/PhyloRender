import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectHistoricalConsensus } from './select-historical-consensus.mjs';

// Large-tree layout regressions must not depend on the size of the UI demo.
export async function loadFullOrdinaryFixture(page, runtime) {
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  const [main, support] = await Promise.all([
    readFile(new URL('../../defaults/Raxml-Chloroplast.con.tre', import.meta.url), 'utf8'),
    readFile(new URL('../../defaults/RAxML_bipartitions.Raxml-Chloroplast', import.meta.url), 'utf8'),
  ]);
  const loaded = await page.evaluate(({ main, support }) => runTreeLoad('完整回归测试树', async progress => {
    state.sourceName = 'Raxml-Chloroplast.con.tre';
    $('newick-input').value = main;
    $('support-scale').value = 'probability';
    parseAndDraw({ deferRender: true, throwOnError: true });
    state.nodeDataSources.push(createNodeDataSource(support, 'RAxML_bipartitions.Raxml-Chloroplast', 'support', null, 'percent'));
    await finishInteractiveTreeLoad(progress);
  }), { main: selectHistoricalConsensus(main), support });
  assert.equal(loaded, true);
  assert.equal(await page.evaluate(() => PhyloRenderConflict.tipNodes(state.parsedRoot).length), 173);
}
