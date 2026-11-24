import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

function denseDatedTree(internalNodes = 160) {
  let tree = "(T000:1,T001:1)[&height=1]";
  for (let age = 2; age <= internalNodes; age++) {
    tree = `(${tree}:1,T${String(age).padStart(3, "0")}:${age})[&height=${age}]`;
  }
  return `${tree};`;
}

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await page.goto(runtime.renderer.agentPageUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.PhyloRenderAgent?.version);
  const tree = denseDatedTree();
  const result = await page.evaluate(async treeContent => {
    const input = { name: "dense-dating.tree", content: treeContent };
    const inspection = await window.PhyloRenderAgent.inspectTree(input);
    const figure = await window.PhyloRenderAgent.loadFigure({
      workspace: "time",
      main_tree: input,
      options: { time: { source_unit: "mya", age_source: "height" } },
    });
    return {
      inspection,
      report: figure.report,
      normalizedTime: figure.normalized_spec.options.time,
      labels: document.querySelectorAll(".time-age-label").length,
      dots: document.querySelectorAll(".time-age-marker").length,
      status: document.querySelector("#time-age-range-status").textContent,
      ageRangeState: structuredClone(state.timeAgeRange),
    };
  }, tree);
  assert.equal(result.inspection.tree_type, "time");
  assert.equal(result.inspection.time_label_density.candidate_labels, 160);
  assert.equal(result.inspection.time_label_density.dense, true);
  assert.equal(result.inspection.time_label_density.default_minimum_raw, 80);
  assert.equal(result.inspection.time_label_density.full_labels_deadline_seconds, 1800);
  assert.deepEqual(result.ageRangeState, { minimumRaw: null, maximumRaw: null, explicit: false });
  assert.equal(Object.hasOwn(result.normalizedTime, "age_minimum"), false);
  assert.equal(Object.hasOwn(result.normalizedTime, "age_maximum"), false);
  assert.equal(result.report.time.node_age_labels.selection, "automatic_older_half");
  assert.equal(result.report.time.node_age_labels.visible_nodes, 81);
  assert.equal(result.report.time.node_age_labels.hidden_nodes, 79);
  assert.equal(result.labels, 81);
  assert.equal(result.dots, 81);
  assert.match(result.status, /默认只标较老 50%/);
  assert.match(result.report.warnings.join("\n"), /HPD、树枝和时间坐标不变/);
  console.log("PASS dense Dating default: 160 candidates, older half only, explicit full-label deadline advertised");
} finally {
  await runtime.close();
}
