import assert from 'node:assert/strict';
import { createRuntime } from '../src/runtime.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage();
  await page.goto(`${runtime.demoPageUrl}?workspace=phylogeny`);
  await page.evaluate(() => window.PhyloRenderReady);
  const results = await page.evaluate(async () => {
    const cases = [
      ['present', '((Euptelea_pleiosperma:1,A:2):1,B:4);', true, 'Euptelea_pleiosperma'],
      ['absent', '((C:1,A:2):1,B:4);', true, null],
      ['duplicate', '((Euptelea_pleiosperma:1,Euptelea_pleiosperma:2):1,B:4);', true, null],
      ['explicit override pending', '((Euptelea_pleiosperma:1,A:2):1,B:4);', false, null],
      ['time tree', '(Euptelea_pleiosperma:4,(A:2,B:2):2);', true, null],
    ];
    const results = [];
    for (const [name, content, defaultRooting, expected] of cases) {
      $('newick-input').value = content;
      parseAndDraw({ defaultRooting, deferRender: true });
      const actual = state.root.children.find(n => n.id === state.root.outgroupChildId)?.label || null;
      const rootId = state.root.id;
      await renderTree();
      results.push({ name, expected, actual, stable: state.root.id === rootId,
        sourcePreserved: $('newick-input').value === content });
    }
    return results;
  });
  for (const row of results) {
    assert.equal(row.actual, row.expected, row.name);
    assert.ok(row.stable && row.sourcePreserved, row.name);
  }
  const result = await runtime.renderer.render({
    main_tree: { name: 'test.tre', content: '((Euptelea_pleiosperma:1,A:2):1,B:4);' },
    rooting: { outgroup: ['B'] },
  });
  assert.deepEqual(result.normalizedSpec.rooting.outgroup, ['B']);
  const automatic = await runtime.renderer.render({
    main_tree: { name: 'test.tre', content: '((Euptelea_pleiosperma:1,A:2):1,B:4);' },
  });
  assert.deepEqual(automatic.normalizedSpec.rooting.outgroup, ['Euptelea pleiosperma']);
  console.log('Default rooting cases passed:', results);
} finally {
  await runtime.close();
}
