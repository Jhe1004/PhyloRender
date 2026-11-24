import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";
import contract from "../../figure-contract.js";

const tipCount = 180;
const tips = Array.from({ length: tipCount }, (_, index) =>
  `Taxon_${String(index + 1).padStart(3, "0")}_speciesname`);
const ordinary = `(${tips.map(name => `${name}:1`).join(",")});`;
const dated = `(${tips.map(name => `${name}:100`).join(",")})[&height=100];`;
const runtime = await createRuntime();

function widthMm(svg) {
  const value = /<svg\b[^>]*\bwidth="([0-9.]+)mm"/.exec(svg)?.[1];
  assert.ok(value, "exported SVG must state its physical width in millimetres");
  return Number(value);
}

try {
  const cases = [
    ["phylogeny", { workspace: "phylogeny", main_tree: { name: "large.nwk", content: ordinary },
      options: { output: { width_mm: 400 } } }],
    ["time", { workspace: "time", main_tree: { name: "large-dated.tree", content: dated },
      options: { output: { width_mm: 400 }, time: { source_unit: "mya", display_unit: "mya", show_node_ages: false } } }],
    ["cloud", { workspace: "cloud", main_tree: { name: "large-species.nwk", content: ordinary },
      options: { output: { width_mm: 400 }, cloud: { species_method: "coalescent", show_gene: false } } }],
    ["conflict", { workspace: "conflict", main_tree: { name: "primary.nwk", content: ordinary },
      comparison_tree: { name: "comparison.nwk", content: ordinary }, options: { output: { width_mm: 800 } } }],
  ];
  const reports = [];
  for (const [name, spec] of cases) {
    console.log(`Checking ${name} width cap`);
    const result = await runtime.renderer.render(spec, { formats: ["svg"] });
    const physicalWidth = widthMm(result.svg);
    const maximumWidthMm = contract.maximumOutputWidthMm(name);
    assert.ok(physicalWidth <= maximumWidthMm + .001, `${name} SVG width ${physicalWidth} mm exceeds ${maximumWidthMm} mm`);
    assert.ok(result.report.output.width_mm <= maximumWidthMm + .001,
      `${name} report width ${result.report.output.width_mm} mm exceeds ${maximumWidthMm} mm`);
    assert.equal(result.report.output.maximum_width_mm, maximumWidthMm);
    assert.equal(result.report.tips, tipCount, `${name} must retain every sample`);
    assert.equal(result.report.topology_unchanged, true, `${name} topology must remain unchanged`);
    reports.push({ name, width_mm: physicalWidth, canvas_width: result.report.canvas.width,
      tree_width_unit: result.report.output.tree_width_unit });
  }
  for (const name of ["phylogeny", "time", "cloud"])
    assert.ok(reports.find(item => item.name === name).width_mm > 399, `${name} must exercise its 400 mm ceiling`);
  assert.ok(reports.find(item => item.name === "conflict").width_mm > 799,
    "the double-tree figure must exercise its separate 800 mm ceiling");
  console.log(JSON.stringify({ passed: true, maximum_width_mm_by_workspace: contract.outputGeometry.maximumWidthMmByWorkspace, reports }, null, 2));
} finally {
  await runtime.close();
}
