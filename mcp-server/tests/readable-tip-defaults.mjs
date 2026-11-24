import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRuntime } from "../src/runtime.mjs";

const output = process.argv[2];
if (output) await mkdir(output, { recursive: true });
const tree = count => `(${Array.from({ length: count }, (_, index) => `Sample_${String(index + 1).padStart(3, "0")}:1`).join(",")});`;
const runtime = await createRuntime();
const reports = [];
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  const audit = async (name, spec, selector) => {
    const result = await page.evaluate(async ({ spec, selector }) => {
      const figure = await window.PhyloRenderAgent.loadFigure(spec);
      const all = [...document.querySelectorAll(selector)];
      const labels = selector === ".conflict-tip-label"
        ? [...new Map(all.map(label => [label.getAttribute("data-sample-key"), label])).values()]
        : all;
      const context = document.createElement("canvas").getContext("2d");
      const rows = labels.map(label => {
        const style = getComputedStyle(label);
        let ascent=0,descent=0;
        const runs=label.children.length?[...label.children]:[label];
        for(const run of runs){
          const runStyle=getComputedStyle(run);
          context.font=`${runStyle.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metric=context.measureText(run.textContent);
          ascent=Math.max(ascent,metric.actualBoundingBoxAscent||0);
          descent=Math.max(descent,metric.actualBoundingBoxDescent||0);
        }
        return { y: Number(label.getAttribute("y")), ascent, descent,
          size: Number.parseFloat(style.fontSize), family: style.fontFamily, weight: style.fontWeight, fontStyle: style.fontStyle };
      }).sort((a, b) => a.y - b.y);
      const gaps = rows.slice(1).map((row, index) => row.y-rows[index].y-rows[index].descent-row.ascent);
      return { count: rows.length, minInkGap: Math.min(...gaps), maxInkGap: Math.max(...gaps),
        sizes: [...new Set(rows.map(row => row.size))], output: figure.report.output,
        automatic: figure.normalized_spec.options.layout.automatic_tip_spacing };
    }, { spec, selector });
    reports.push({ name, ...result });
    return result;
  };

  const denseTree = tree(120);
  const ordinaryDense = await audit("ordinary dense", { main_tree: { name: "ordinary-120.nwk", content: denseTree } }, ".tip-label");
  equalU(ordinaryDense.output.tip_size_u, units.ptToDrawing(15));
  assert.deepEqual(ordinaryDense.sizes, [20]);
  assert.equal(ordinaryDense.automatic, true);
  assert.ok(ordinaryDense.minInkGap >= .99 && ordinaryDense.minInkGap < 2, JSON.stringify(ordinaryDense));

  const ordinarySparse = await audit("ordinary sparse", { main_tree: { name: "ordinary-6.nwk", content: tree(6) } }, ".tip-label");
  equalU(ordinarySparse.output.tip_size_u, units.ptToDrawing(15));
  assert.ok(ordinarySparse.minInkGap >= 5.99, JSON.stringify(ordinarySparse));

  const conflictDense = await audit("conflict dense", {
    workspace: "conflict",
    main_tree: { name: "primary-120.nwk", content: denseTree },
    comparison_tree: { name: "secondary-120.nwk", content: denseTree },
  }, ".conflict-tip-label");
  equalU(conflictDense.output.tip_size_u, units.ptToDrawing(15));
  assert.deepEqual(conflictDense.sizes, [20]);
  assert.equal(conflictDense.automatic, true);
  assert.ok(conflictDense.minInkGap >= .99 && conflictDense.minInkGap < 2, JSON.stringify(conflictDense));

  const explicit = await audit("explicit manual", {
    main_tree: { name: "manual.nwk", content: tree(10) },
    options: { layout: { tip_spacing_em: 1.5 }, typography: { tips: { size_pt: 12 } } },
  }, ".tip-label");
  equalU(explicit.output.tip_size_u, units.ptToDrawing(12));
  assert.equal(explicit.automatic, false);
  assert.equal(explicit.output.tip_spacing_em, 1.5);

  if (output) await writeFile(path.join(output, "readable-tip-defaults.json"), JSON.stringify({ passed: true, reports }, null, 2));
  await page.close();
  console.log("PASS ordinary/conflict 15pt defaults, dense 1px ink gaps, sparse breathing room and explicit manual override");
} finally {
  await runtime.close();
}
