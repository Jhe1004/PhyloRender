import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';
import { settleFigure } from './settle-figure.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const analysisRequests = [], errors = [];
  page.on('request', r => { if (/\/api\/cloud-(date|phyparts)/.test(r.url())) analysisRequests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  await page.getByRole('button', { name: '树形', exact: true }).click();
  assert.equal(await page.locator('#cloud-branch-order-section').getAttribute('open'), null);
  await page.locator('#cloud-branch-order-section > summary').click();
  const fingerprint = () => page.evaluate(() => {
    const c = state.cloud;
    const rootData = root => [...PhyloRenderCloud.nodeClades(root)].map(([node, clade]) =>
      [node.id, clade.key, node.length, node.children.map(child => child.id), c.datedAges.get(root).get(node)]);
    return JSON.stringify({ roots: [c.speciesRoot, ...c.geneRoots].map(rootData),
      tips: [c.speciesRoot, ...c.geneRoots].map(root => PhyloRenderCloud.tips(root).map(tip => [tip.id, tip.label, tip.length])),
      statistics: [...c.phyPartsTable.rows], hidden: [...c.hiddenPieNodes] });
  });
  async function audit(direction) {
    await settleFigure(page);
    await page.locator('#cloud-ladder-direction').selectOption(direction);
    await settleFigure(page);
    const result = await page.evaluate(() => {
      const svg = document.querySelector('#tree-svg');
      const tips = [...svg.querySelectorAll('.cloud-tip-label')];
      const positions = new Map(tips.map(tip => [tip.dataset.originalTipLabel, Number(tip.getAttribute('y'))]));
      const edges = [...svg.querySelectorAll('[data-cloud-tip]')];
      const c = state.cloud;
      const reference = new Map([...PhyloRenderCloud.nodeClades(c.speciesRoot)].map(([node, clade]) => {
        const hit = svg.querySelector(`.clade-node-hit[data-clade-node-id="${node.id}"]`);
        return [clade.key, Number(hit?.getAttribute('cy'))];
      }));
      const geneEdges = [...svg.querySelectorAll('.cloud-gene-lines > path')];
      let pathIndex = 0, sharedInternalComparisons = 0, maximumInternalDifference = 0;
      for (const gene of c.geneRoots) {
        const clades = PhyloRenderCloud.nodeClades(gene);
        (function visit(node) {
          for (const child of node.children) {
            const coordinates = geneEdges[pathIndex++].getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
            for (const [endpoint, y] of [[node, coordinates[1]], [child, coordinates[3]]]) {
              const key = clades.get(endpoint)?.key;
              if (key && reference.has(key)) {
                sharedInternalComparisons++;
                maximumInternalDifference = Math.max(maximumInternalDifference, Math.abs(y - reference.get(key)));
              }
            }
            visit(child);
          }
        })(gene);
      }
      return { direction: svg.dataset.cloudLadderDirection, order: tips.map(tip => tip.dataset.originalTipLabel),
        expected: PhyloRenderCloud.orderedTips(state.cloud.speciesRoot,
          document.querySelector('#cloud-ladder-direction').value).map(tip => tip.label.trim()),
        allAligned: edges.every(edge => Math.abs(Number(edge.dataset.cloudTipY) - positions.get(edge.dataset.cloudTip)) < .001),
        sharedInternalComparisons, maximumInternalDifference,
        tips: tips.length, edges: edges.length, genes: state.cloud.geneRoots.length,
        pies: svg.querySelectorAll('.cloud-pie').length, hidden: svg.querySelectorAll('.cloud-hidden-pie-node').length };
    });
    assert.equal(result.direction, direction); assert.deepEqual(result.order, result.expected);
    assert.ok(result.allAligned); assert.equal(result.edges, result.tips * (result.genes + 1));
    if (result.genes) {assert.ok(result.sharedInternalComparisons > 0); assert.equal(result.maximumInternalDifference, 0);}
    return result;
  }
  const reports = [];
  // Local real-data demo: exercises the dated species + 35 actual gene layers.
  if (await page.evaluate(() => Boolean(state.cloud.speciesRoot))) {
    const before = await fingerprint();
    for (const direction of ['file', 'small-top', 'large-top', 'file']) {
      const result = await audit(direction); reports.push(result);
      assert.equal(await fingerprint(), before, 'order changes cannot edit input nodes, dates or statistics');
    }
    assert.notDeepEqual(reports[0].order, reports[1].order);
    assert.deepEqual(reports[0].order, reports[3].order);
    if (process.argv[2]) {
      await audit('small-top');
      const svg = await page.evaluate(() => serializeRenderedSvg());
      await writeFile(`${process.argv[2]}/02_真实云树_小姊妹群在上.svg`, svg);
      await page.screenshot({ path: `${process.argv[2]}/03_网页阶梯化预览.png` });
      const size = await page.evaluate(() => state.currentSvgSize);
      const preview = await runtime.renderer.browser.newPage({ viewport: {
        width: Math.ceil(size.width), height: Math.ceil(size.height) } });
      await preview.setContent(`<body style="margin:0">${svg}</body>`);
      await preview.evaluate(() => document.fonts.ready);
      await preview.screenshot({ path: `${process.argv[2]}/05_导出SVG预览.png` });
      await preview.close();
    }
  }
  // Portable fixture: no treePL or PhyParts required; manual statistics remain unchanged.
  await page.locator('#cloud-branch-order-section > summary').click();
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await page.locator('#cloud-background-section > summary').click();
  await page.locator('#cloud-show-gene').uncheck();
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.locator('#cloud-input-section > summary').click();
  await page.locator('#cloud-species-method').selectOption('coalescent');
  const upload = (name, content) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
  await page.locator('#cloud-species-file').setInputFiles(upload('species.tre', '(((A:1,B:1):1,C:2):1,O:3);'));
  await page.locator('#tree-loading').waitFor({ state: 'hidden' });
  await page.locator('#cloud-phyparts-file').setInputFiles(upload('stats.tsv',
    'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA;B\nN2\t4\t3\t1\t2\tA;B;C\n'));
  await page.locator('.cloud-pie[data-phyparts-node="N1"]').click();
  await page.locator('#cloud-pie-menu-hide').click();
  await settleFigure(page);
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await page.locator('#cloud-branch-order-section > summary').click();
  const before = await fingerprint();
  for (const direction of ['file', 'small-top', 'large-top', 'file']) {
    const result = await audit(direction); reports.push(result);
    assert.equal(result.pies, 1); assert.equal(result.hidden, 1);
    assert.equal(await fingerprint(), before);
  }
  await page.locator('summary').filter({ hasText: '物种树显示与形状' }).click();
  await page.locator('#cloud-species-shape').selectOption('rectangular');
  const rectangular = await audit('small-top');
  assert.deepEqual(rectangular.order, ['O', 'C', 'A', 'B']);
  assert.deepEqual(analysisRequests, [], 'ordering must never start dating or statistics');
  assert.deepEqual(errors, []);
  if (process.argv[2]) await writeFile(`${process.argv[2]}/04_阶梯化验收.json`, JSON.stringify({ reports, rectangular, analysisRequests, errors }, null, 2));
  console.log('PASS cloud ladderization, shared terminal alignment, immutable dates/statistics, restore file order, hidden pies and rectangular display');
} finally { await runtime.close(); }
