import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';

const runtime = await createRuntime();
const output = process.argv[2];
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const demoUrl = new URL(runtime.demoPageUrl); demoUrl.searchParams.set('workspace', 'phylogeny');
  await page.goto(demoUrl.toString());
  await page.evaluate(() => window.PhyloRenderReady);
  const initial = await page.evaluate(() => ({
    source: state.sourceName, raw: $('newick-input').value,
    tips: PhyloRenderConflict.tipNodes(state.root).length,
    fakeLabel: Boolean(document.querySelector('[data-label-id="e1"]')),
    fakeLeader: Boolean(document.querySelector('[data-leader-id="e1"]')),
  }));
  assert.equal(initial.tips, 58);
  assert.equal(initial.fakeLabel, false);
  assert.equal(initial.fakeLeader, false);
  if (output) {
    await writeFile(`${output}/03_默认树_无虚假节点标注.svg`, await page.evaluate(() => serializeRenderedSvg()));
    await page.screenshot({ path: `${output}/08_默认普通树_修正后.png` });
  }
  const bad = '((A:1):2,B:3);';
  await page.locator('#tree-file').setInputFiles({ name: 'bad-unary.nwk', mimeType: 'text/plain', buffer: Buffer.from(bad) });
  await page.waitForFunction(() => $('tree-loading').dataset.state === 'error');
  assert.match(await page.locator('#tree-loading-detail').textContent(), /TREE_SINGLE_CHILD_NODE.*相关样品：A/);
  assert.equal(await page.locator('#tree-loading').isVisible(), true);
  const after = await page.evaluate(() => ({ source: state.sourceName, raw: $('newick-input').value,
    tips: PhyloRenderConflict.tipNodes(state.root).length }));
  assert.equal(after.source, initial.source);
  assert.equal(after.raw, initial.raw);
  assert.equal(after.tips, initial.tips);
  if (output) await page.screenshot({ path: `${output}/04_不合格输入_停止导入提示.png` });
  await page.locator('#tree-loading-close').click();
  await assert.rejects(runtime.renderer.inspect({ name: 'bad-unary.nwk', content: bad }), /TREE_SINGLE_CHILD_NODE/);
  await assert.rejects(runtime.renderer.render({ main_tree: { name: 'bad-unary.nwk', content: bad } }), /TREE_SINGLE_CHILD_NODE/);
  const ordinary = await runtime.renderer.inspect({ name: 'valid.nwk', content: '(A:0,B:0,C:0);' });
  assert.equal(ordinary.tips, 3);
  const low = await page.evaluate(async () => {
    await window.PhyloRenderAgent.loadFigure({ main_tree: { name: 'low.nwk', content: '(O:3,((A:1,B:1)0.2:1,C:2):1);' },
      rooting: { outgroup: null }, options: { support: { scale:'probability',low_support_threshold: 50 } } });
    return [...document.querySelectorAll('.support-label')].map(label => label.textContent);
  });
  assert.ok(low.includes('–'), 'real support below threshold must still be displayed');
  // A bad gene in a batch must not silently reduce the PhyParts denominator.
  const batch = await page.evaluate(async () => {
    state.cloud.speciesRoot = parseNewick('(O,((A,B),C));');
    state.cloud.phyPartsBusy = false;
    $('cloud-phyparts-root-policy').value = 'outgroup';
    try {
      await importCloudGenes(new File(['(O,((A,B),C));\n(O,(((A),B),C));'], 'bad-batch.trees'));
      return { stopped: false };
    } catch (error) { return { stopped: true, message: error.message, busy: state.cloud.phyPartsBusy }; }
  });
  assert.equal(batch.stopped, true);
  assert.equal(batch.busy, false);
  assert.match(batch.message, /第 2 棵基因树.*TREE_SINGLE_CHILD_NODE.*部分基因树/);
  assert.deepEqual(errors, []);
  const report = { guiErrorVisible: true, previousFigurePreserved: true, mcpInspectRejected: true,
    mcpRenderRejected: true, validRootAccepted: true, defaultFakeLabelRemoved: true,
    lowSupportPreserved: true, geneBatchStopped: true };
  if (output) await writeFile(`${output}/05_防呆验证.json`, JSON.stringify(report, null, 2));
  console.log('PASS shared tree validation and missing-support safeguards', JSON.stringify(report));
  await page.close();
} finally { await runtime.close(); }
