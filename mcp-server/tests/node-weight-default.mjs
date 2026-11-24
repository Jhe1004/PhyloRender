import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRuntime } from "../src/runtime.mjs";

const tree = { name: "node-weight-default.tre", content: "((Alpha:1,Beta:1)83:1,Gamma:2);" };
const runtime = await createRuntime();
try {
  const regular = await runtime.renderer.render({ main_tree: tree });
  assert.match(regular.svg, /--support-font-weight:\s*400/);
  assert.doesNotMatch(regular.svg, /--support-font-weight:\s*700/);
  assert.equal(regular.normalizedSpec.options.typography.nodes.bold, false);

  const explicitBold = await runtime.renderer.render({
    main_tree: tree,
    options: { typography: { nodes: { bold: true } } },
  });
  assert.match(explicitBold.svg, /--support-font-weight:\s*700/);
  assert.equal(explicitBold.normalizedSpec.options.typography.nodes.bold, true);

  // A global CSS variable alone cannot detect a per-label weight override.
  // Check computed weights both in the workbench and in standalone exports.
  const main = "(((Alpha:1,Beta:1)58:1,Gamma:2)88:1,((Delta:1,Epsilon:1)60:1,Zeta:2)90:1);";
  const alternate = "(((Alpha:1,Beta:1)0.9:1,Delta:2)0.8:1,((Gamma:1,Epsilon:1)0.42:1,Zeta:2)0.7:1);";
  const compound = "(((Alpha:1,Beta:1)58/0.4:1,Gamma:2)31/1:1,((Delta:1,Epsilon:1)60/0.9:1,Zeta:2)90/1:1);";
  const cases = [
    // Four tips give the supported branch a nontrivial unrooted bipartition.
    { name: "low-support-dash", spec: { workspace: "phylogeny", main_tree: { content: "(((Alpha:1,Beta:1)31:1,Gamma:1):1,Delta:4);" }, options: { support: { scale: "percent" } } } },
    { name: "compound-support", spec: { workspace: "phylogeny", main_tree: { content: compound }, options: { support: { scale: "percent/probability" } } } },
    { name: "auxiliary-unmatched", spec: { workspace: "phylogeny", main_tree: { content: main }, support_trees: [{ content: alternate, label: "LPP", scale: "probability" }], options: { support: { scale: "percent" } } } },
    { name: "two-tree-support", spec: { workspace: "conflict", main_tree: { content: compound }, comparison_tree: { content: compound }, options: { conflict: { primary_support_scale: "percent/probability", secondary_support_scale: "percent/probability" } } } },
  ];
  const page = await runtime.renderer.browser.newPage();
  const exported = await runtime.renderer.browser.newPage();
  const evidence = process.argv[2];
  if (evidence) await mkdir(evidence, { recursive: true });
  const results = [];
  const weights = target => target.evaluate(() => [...document.querySelectorAll("svg .support-label")].map(node => ({
    text: node.textContent, weight: getComputedStyle(node).fontWeight,
    marked: node.classList.contains("support-threshold-mark"),
  })));
  const sameWeights = (labels, expected, context) => {
    assert.ok(labels.length, `${context}: expected actual support labels`);
    for (const label of labels) assert.equal(label.weight, expected, `${context}: ${label.text}`);
  };
  try {
    await page.goto(runtime.renderer.agentPageUrl);
    await page.evaluate(() => PhyloRenderReady);
    for (const item of cases) {
      const load = await page.evaluate(spec => PhyloRenderAgent.loadFigure(spec), item.spec);
      const initial = await weights(page);
      assert.ok(initial.some(label => label.marked), `${item.name}: must exercise dash labels`);
      if (item.name !== "low-support-dash") assert.ok(initial.some(label => !label.marked), `${item.name}: must also exercise ordinary numeric labels`);
      sameWeights(initial, "400", `${item.name}: default workbench`);
      const input = await page.evaluate(() => JSON.stringify([state.originalText, state.parsedRoot,
        state.conflict?.nuclearRoot, state.conflict?.plastidRoot]));
      for (const bold of [false, true, false]) {
        await page.evaluate(async bold => {
          const control = document.getElementById("support-font-bold");
          if (control.checked !== bold) control.click();
          await PhyloRenderAgent.currentFigure();
        }, bold);
        const expected = bold ? "700" : "400";
        const screen = await weights(page);
        sameWeights(screen, expected, `${item.name}: checkbox ${bold}`);
        // Placement can reorder SVG elements; compare the complete label
        // multiset rather than treating DOM order as a scientific identity.
        assert.deepEqual(screen.map(label => label.text).sort(), initial.map(label => label.text).sort());
        const current = await page.evaluate(() => PhyloRenderAgent.currentFigure());
        await exported.setContent(current.svg);
        await exported.evaluate(() => document.fonts.ready);
        sameWeights(await weights(exported), expected, `${item.name}: standalone SVG ${bold}`);
        const config = await page.evaluate(() => PhyloRenderAgent.exportConfiguration());
        assert.equal(config.options.typography.nodes.bold, bold);
        const mcp = await runtime.renderer.render(config);
        await exported.setContent(mcp.svg);
        await exported.evaluate(() => document.fonts.ready);
        sameWeights(await weights(exported), expected, `${item.name}: MCP SVG ${bold}`);
        assert.equal(await page.evaluate(() => JSON.stringify([state.originalText, state.parsedRoot,
          state.conflict?.nuclearRoot, state.conflict?.plastidRoot])), input, "Font toggles must not mutate scientific inputs");
        if (evidence) await writeFile(`${evidence}/${item.name}-${bold ? "bold" : "regular"}.svg`, mcp.svg);
      }
      if (evidence) {
        await page.screenshot({ path: `${evidence}/${item.name}-regular.png`, fullPage: true });
        await exported.locator("svg").screenshot({ path: `${evidence}/${item.name}-export-regular.png` });
      }
      results.push({ name: item.name, labels: initial.length, marked: initial.filter(label => label.marked).length,
        default_weight: 400, checkbox_weights: [400, 700, 400], same_scientific_inputs: true,
        workbench_and_standalone_and_mcp: true, initial_topology_unchanged: load.report.topology_unchanged });
      console.log(`NODE_WEIGHT_CASE_PASSED: ${item.name}`);
    }
  } finally {
    await page.close();
    await exported.close();
  }
  if (evidence) await writeFile(`${evidence}/node-weight-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, default_weight: 400, explicit_weight: 700, cases: results }));
} finally {
  await runtime.close();
}
