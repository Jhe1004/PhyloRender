const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const pageUrl = process.argv[2] || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.PhyloRenderAgent?.version);
    const result = await page.evaluate(async () => {
      const content = '(O:0,((A:0,B:0)0.91:0.5,C:0)1.00:0);';
      const rendered = await window.PhyloRenderAgent.loadFigure({
        main_tree: { name: 'supported-root-astral.tre', content },
        options: { layout: { mode: 'phylogram' } },
      });
      const hit = document.querySelector('#tree-svg .clade-hit[data-tip-count="3"]');
      const nodeId = hit?.getAttribute('data-clade-node-id');
      const branch = nodeId
        ? document.querySelector(`#tree-svg .branch[data-clade-node-id="${CSS.escape(nodeId)}"]`)
        : null;
      return {
        display: rendered.report.display_branch_lengths,
        rootIngroupBranchLength: branch
          ? Math.abs(Number(branch.getAttribute('x2')) - Number(branch.getAttribute('x1')))
          : null,
        sourceContentAfterRender: content,
      };
    });

    assert.equal(result.display.applied_to_render, true);
    assert.equal(result.display.auto_root_ingroup_gap_applied, true);
    assert.equal(result.display.display_root_ingroup_length, 1);
    assert.equal(result.display.source_tree_unchanged, true);
    assert.ok(result.rootIngroupBranchLength > 0,
      'supported zero-length ingroup stem must render as a visible horizontal branch');
    assert.equal(result.sourceContentAfterRender, '(O:0,((A:0,B:0)0.91:0.5,C:0)1.00:0);');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
