import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRuntime, MCP_ROOT } from "../src/runtime.mjs";
import { settleFigure } from "./settle-figure.mjs";
import units from "../../figure-units.js";

const store = await mkdtemp(path.join(os.tmpdir(), "phylorender-adaptive-node-size-"));
const client = new Client({ name: "adaptive-node-label-size", version: "1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(MCP_ROOT, "src/stdio.mjs")],
  env: { ...process.env, PHYLORENDER_OUTPUT_ROOT: store },
  stderr: "pipe",
});
transport.stderr?.on("data", () => {});

const smallTree = "(Out:0.3,(((Sp_A:0.02,Sp_B:0.03)100/82:0.01,(Sp_F:0.01,Sp_G:0.02)100/100:0.01)98/95:0.02,(Sp_C:0.04,(Sp_D:0.01,Sp_E:0.02)100/100:0.01)96/90:0.02)100/100:0.05);";
const datedTree = "(Out:40,((Sp_A:12,Sp_B:12):10,(Sp_C:15,(Sp_D:8,Sp_E:8):7):7):18);";
let runtime = null;
let page = null;

function extractSupportFonts(svg) {
  return [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
    .filter(m => /\b(?:support-label|time-age-label)\b/.test(m[1]))
    .map(m => ({ fontSize: Number(m[1].match(/\bfont-size="([^"]+)"/)?.[1]), text: m[2].trim() }))
    .filter(item => Number.isFinite(item.fontSize) && item.text);
}

try {
  await client.connect(transport);

  // 1. Small aligned tree: automatic node preferred size scales well above 18 px, and "*" gets optical compensation
  const smallRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "small.tre", content: smallTree },
      options: {
        layout: { mode: "aligned" },
        support: { scale: "percent/percent", full_support_marker: "star" },
      },
    },
  });
  assert.ok(!smallRes.isError);
  const smallReport = smallRes.structuredContent.report;
  assert.equal(smallReport.safe_for_export, true);
  assert.ok(smallReport.output.node_preferred_size_u > units.designToDrawing(23),
    `expected auto-scaled preferred size > 23 px equivalent, got ${smallReport.output.node_preferred_size_u}`);

  const smallLink = smallRes.content.find(c => c.type === "resource_link" && c.name === "figure.svg");
  const smallSvg = (await client.readResource({ uri: smallLink.uri })).contents[0].text;
  const smallFonts = extractSupportFonts(smallSvg);
  const numericFonts = smallFonts.filter(item => item.text !== "*").map(item => item.fontSize);
  const starFonts = smallFonts.filter(item => item.text === "*").map(item => item.fontSize);
  assert.ok(numericFonts.length >= 2 && starFonts.length >= 2);
  assert.ok(numericFonts.every(f => f >= 24), `expected numeric labels >= 24 px on roomy tree, got ${numericFonts}`);
  assert.ok(starFonts.every(f => f > numericFonts[0] * 1.3), `expected optical asterisk compensation > 1.3x numeric size, got ${starFonts}`);

  // 2. Explicit manual preferred_size_u overrides automatic scaling and stays fixed
  const manualRes = await client.callTool({
    name: "edit_figure",
    arguments: {
      figure_id: smallRes.structuredContent.figure_id,
      base_revision: smallRes.structuredContent.revision,
      operations: [{ op: "set_options", options: { typography: { nodes: { preferred_size_u: units.designToDrawing(15) } } } }],
    },
  });
  assert.ok(!manualRes.isError);
  assert.ok(Math.abs(manualRes.structuredContent.report.output.node_preferred_size_u - units.designToDrawing(15)) < 1e-4);
  const inspectedManual = await client.callTool({
    name: "inspect_figure",
    arguments: { figure_id: smallRes.structuredContent.figure_id },
  });
  assert.equal(inspectedManual.structuredContent.state.options.typography.nodes.automatic_size, false);

  // 3. Restoring automatic_size=true via edit_figure re-enables adaptive sizing
  const restoredRes = await client.callTool({
    name: "edit_figure",
    arguments: {
      figure_id: smallRes.structuredContent.figure_id,
      base_revision: manualRes.structuredContent.revision,
      operations: [{ op: "set_options", options: { typography: { nodes: { automatic_size: true } } } }],
    },
  });
  assert.ok(!restoredRes.isError);
  assert.ok(restoredRes.structuredContent.report.output.node_preferred_size_u > units.designToDrawing(23));

  // 4. Roomy dated chronogram also scales node-age labels up automatically
  const datedRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "time",
      main_tree: { name: "dated.tre", content: datedTree },
      options: { time: { source_unit: "mya", age_source: "branch_lengths" } },
    },
  });
  assert.ok(!datedRes.isError);
  assert.equal(datedRes.structuredContent.report.safe_for_export, true);
  assert.ok(datedRes.structuredContent.report.output.node_preferred_size_u > units.designToDrawing(25),
    `expected roomy dated node age size > 25 px equivalent, got ${datedRes.structuredContent.report.output.node_preferred_size_u}`);

  // 5. Dense 173-tip tree converges back to compact 18 px (13.5 pt)
  const rawConsensus = await readFile(path.join(MCP_ROOT, "../defaults/Raxml-Chloroplast.con.tre"), "utf8");
  const match = rawConsensus.match(/tree\s+\S+\s*=\s*(?:\[[^\]]*\]\s*)*(\([^;]+;)/i);
  const denseRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "dense173.tre", content: match[1] },
      options: { support: { scale: "probability" } },
    },
  });
  assert.ok(!denseRes.isError);
  assert.ok(Math.abs(denseRes.structuredContent.report.output.node_preferred_size_u - units.ptToDrawing(13.5)) < 1e-4,
    `expected dense 173-tip tree to converge to 13.5 pt compact baseline, got ${denseRes.structuredContent.report.output.node_preferred_size_u}`);

  // 6. Web GUI checkbox & stepper interaction + lossless export/import round-trip
  runtime = await createRuntime();
  page = await runtime.renderer.browser.newPage();
  await page.goto(new URL("/", runtime.renderer.agentPageUrl).toString());
  await page.waitForFunction(() => Boolean(window.PhyloRenderAgent));
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  await page.evaluate(tree => window.PhyloRenderAgent.loadFigure({
    workspace: "phylogeny",
    main_tree: { name: "small.tre", content: tree },
    options: { layout: { mode: "aligned" }, support: { scale: "percent/percent", full_support_marker: "star" } },
  }), smallTree);
  await settleFigure(page);

  const guiAuto = await page.evaluate(async () => ({
    checked: document.getElementById("support-size-auto").checked,
    sizePx: Number(document.getElementById("support-size").value),
    exported: await window.PhyloRenderAgent.exportConfiguration(),
  }));
  assert.equal(guiAuto.checked, true);
  assert.ok(guiAuto.sizePx >= 24);
  assert.equal(guiAuto.exported.options.typography.nodes.automatic_size, true);

  // Manual stepper edit turns off automatic checkbox; re-checking restores adaptive size
  await page.locator('[data-settings-target="labels"]').click();
  await page.evaluate(() => {
    for (let p = document.getElementById("support-size-number").parentElement; p; p = p.parentElement) {
      if (p.tagName === "DETAILS") p.open = true;
    }
  });
  await page.locator("#support-size-decrease").click();
  await settleFigure(page);
  const afterManualStep = await page.evaluate(() => ({
    checked: document.getElementById("support-size-auto").checked,
    sizePx: Number(document.getElementById("support-size").value),
  }));
  assert.equal(afterManualStep.checked, false);
  assert.ok(afterManualStep.sizePx < guiAuto.sizePx);

  await page.locator("#support-size-auto").check();
  await settleFigure(page);
  const afterReAuto = await page.evaluate(() => ({
    checked: document.getElementById("support-size-auto").checked,
    sizePx: Number(document.getElementById("support-size").value),
  }));
  assert.equal(afterReAuto.checked, true);
  assert.equal(afterReAuto.sizePx, guiAuto.sizePx);

  console.log("PASS adaptive-node-label-size across sparse, medium, dense, dated, manual override, and Web GUI");
} finally {
  await page?.close().catch(() => {});
  await runtime?.close().catch(() => {});
  await client.close().catch(() => {});
  await rm(store, { recursive: true, force: true });
}
