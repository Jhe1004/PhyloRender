import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

const tips = Array.from({ length: 180 }, (_, index) =>
  `Taxon_${String(index + 1).padStart(3, "0")}_speciesname`);
const tree = `(${tips.map(name => `${name}:1`).join(",")});`;
const runtime = await createRuntime();

function spec(workspace, aspectRatio) {
  const common = { workspace, main_tree: { name: `${workspace}.nwk`, content: tree },
    options: { output: { width_mm: 0, aspect_ratio: aspectRatio } } };
  if (workspace === "cloud") common.options.cloud = { species_method: "coalescent", show_gene: false };
  if (workspace === "conflict") common.comparison_tree = { name: "comparison.nwk", content: tree };
  return common;
}

try {
  const reports = {};
  for (const workspace of ["cloud", "conflict"]) {
    const content = await runtime.renderer.render(spec(workspace, "content"), { formats: ["svg"] });
    const automatic = await runtime.renderer.render(spec(workspace, "auto"), { formats: ["svg"] });
    assert.equal(automatic.report.canvas.height, content.report.canvas.height,
      `${workspace} aspect changes must not alter vertical sample spacing`);
    assert.equal(automatic.report.canvas.width, content.report.canvas.width,
      `${workspace} shares a fixed drawing frame in auto/content modes`);
    assert.equal(automatic.report.output.drawing_width,1000);
    assert.equal(automatic.report.output.horizontal_expansion, content.report.output.horizontal_expansion,
      `${workspace} auto/content must not change width-relative sizes`);
    assert.equal(content.report.output.aspect_mode, "content");
    assert.equal(automatic.report.output.aspect_mode, "auto");
    assert.equal(automatic.report.tips, tips.length);
    assert.equal(automatic.report.topology_unchanged, true);
    reports[workspace] = {
      content: { width: content.report.canvas.width, expansion: content.report.output.horizontal_expansion },
      automatic: { width: automatic.report.canvas.width, expansion: automatic.report.output.horizontal_expansion },
    };
  }
  console.log(JSON.stringify({ passed: true, reports }, null, 2));
} finally {
  await runtime.close();
}
