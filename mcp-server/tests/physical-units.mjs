import os from 'node:os';
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRuntime } from "../src/runtime.mjs";
import { physicalOptions } from "../src/schemas.mjs";
import { applyEditOperations } from "../src/edits.mjs";
import units from "../../figure-units.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const base = {
  main_tree: { content: "(((Aconitum_alpha:1,Aconitum_beta:1.2)0.83:.5,Carex_gamma:1)0.91:.4,Out_delta:2);" },
  options: { support:{scale:'probability'},layout: { branch_width_pt: .9, node_radius_pt: 3.75, tip_spacing_em: 1.1 },
    output: { width_mm: 180, dpi: 300 },
    typography: { tips: { size_pt: 12.75 }, nodes: { preferred_size_pt: 13.5, minimum_size_pt: 12 } } },
};
const runtime = await createRuntime();
const directory = os.tmpdir() + '/phylorender-physical-units';
await mkdir(directory, { recursive: true });
function density(png) {
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "pHYs") return png.readUInt32BE(offset + 8) * .0254;
    offset += size + 12;
  }
  throw new Error("PNG lacks pHYs density");
}
try {
  const first = await runtime.renderer.render(base);
  const second = await runtime.renderer.render({ ...base, options: { ...base.options, output: { width_mm: 180, dpi: 600 } } });
  assert.equal(first.svg, second.svg, "DPI must not change SVG geometry or typography");
  assert.match(first.svg, /width="[0-9.]+mm"/);
  close(first.report.output.tip_size_u, units.ptToDrawing(12.75));
  close(first.report.output.node_minimum_size_u, units.ptToDrawing(12));
  close(first.report.output.tip_size_pt, units.ptToDrawing(12.75) / 1000 * 180 * 72 / 25.4);
  assert.ok(Math.abs(first.png.readUInt32BE(16) - 180 / 25.4 * 300) <= 1);
  assert.ok(Math.abs(density(first.png) - 300) < .02);
  assert.ok(Math.abs(density(second.png) - 600) < .02);
  assert.ok(Math.abs(second.png.readUInt32BE(16) - first.png.readUInt32BE(16) * 2) <= 1);
  const expanded = await runtime.renderer.render({ ...base, options: { ...base.options, output: { width_mm: 240, dpi: 300 } } });
  close(expanded.report.output.tip_size_u, first.report.output.tip_size_u);
  close(expanded.report.output.tip_size_pt, first.report.output.tip_size_pt * 240 / 180);
  assert.ok(expanded.report.output.width_mm > first.report.output.width_mm + 50);
  close(expanded.report.output.horizontal_expansion, first.report.output.horizontal_expansion);
  const legacy = { ...base, options: { support:{scale:'probability'},layout: { branch_width: 1.2, tip_spacing: 18 }, output: { png_scale: 2 }, typography: { tips: { size: 17 }, nodes: { preferred_size: 18, minimum_size: 16 } } } };
  const old = await runtime.renderer.render(legacy);
  close(old.report.output.requested_dpi, 192);
  close(old.report.output.tip_size_u, units.ptToDrawing(12.75));
  const normalized = physicalOptions(legacy.options);
  close(normalized.typography.nodes.preferred_size_u, units.ptToDrawing(13.5));
  const edited = applyEditOperations({ ...base, support_trees: [], other_data_trees: [], clades: [], label_adjustments: [] }, [{ op: "set_options", options: { typography: { tips: { size: 20 } } } }]).spec;
  close(edited.options.typography.tips.size_u, units.ptToDrawing(15));
  // Frontend dimensions use the same width-relative drawing units as MCP.
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`${runtime.demoPageUrl}?phylorender-agent=1`);
  await page.waitForFunction(() => window.PhyloRenderAgent);
  const ui = await page.evaluate(async spec => {
    await window.PhyloRenderAgent.loadFigure(spec);
    const input = document.getElementById("tip-font-size-number");
    const before = { value: input.value, unit: document.getElementById("tip-font-size-value").textContent };
    input.value = "15"; input.dispatchEvent(new Event("input", { bubbles: true }));
    const after = await window.PhyloRenderAgent.currentFigure();
    return { before, output: after.report.output, options: after.normalized_spec.options };
  }, base);
  close(Number(ui.before.value), Number(units.ptToDrawing(12.75).toFixed(2))); assert.match(ui.before.unit, /绘图单位/);
  close(ui.output.tip_size_u, 15);
  close(ui.options.typography.tips.size_u, 15);
  close(ui.output.tip_spacing_em * ui.output.tip_size_u, 1.1 * units.ptToDrawing(12.75));
  const download=page.waitForEvent('download');
  await page.evaluate(()=>exportPng());
  const browserPng=await readFile(await (await download).path());
  assert.ok(Math.abs(browserPng.readUInt32BE(16)-180/25.4*300)<=1);
  assert.ok(Math.abs(density(browserPng)-300)<.02,'web PNG embeds the same actual DPI as MCP');
  await writeFile(`${directory}/web.png`,browserPng);
  await page.screenshot({ path: `${directory}/editor.png` });
  await page.close();
  for (const [name, item] of [["300dpi", first], ["600dpi", second], ["wide", expanded]]) {
    assert.equal(item.report.topology_unchanged, true);
    assert.equal(item.report.safe_for_export, true);
    await writeFile(`${directory}/${name}.png`, item.png);
    await writeFile(`${directory}/${name}.svg`, item.svg);
  }
  await writeFile(`${directory}/report.json`, JSON.stringify({ first: first.report, second: second.report, ui }, null, 2));
  console.log(JSON.stringify({ passed: true, dpi300: [first.png.readUInt32BE(16), first.png.readUInt32BE(20)], dpi600: [second.png.readUInt32BE(16), second.png.readUInt32BE(20)], ui, directory }, null, 2));
} finally { await runtime.close(); }
