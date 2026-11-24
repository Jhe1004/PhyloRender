import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRuntime, MCP_ROOT } from "../src/runtime.mjs";
import { settleFigure } from "./settle-figure.mjs";

const store = await mkdtemp(path.join(os.tmpdir(), "phylorender-unscaled-no-leaders-"));
const client = new Client({ name: "unscaled-tree-no-leaders", version: "1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(MCP_ROOT, "src/stdio.mjs")],
  env: { ...process.env, PHYLORENDER_OUTPUT_ROOT: store },
  stderr: "pipe",
});
transport.stderr?.on("data", () => {});

const alignedTree = "(Out:0.3,((Sp_A:0.02,Sp_B:0.03)100/82:0.01,(Sp_C:0.04,(Sp_D:0.01,Sp_E:0.02)100/100:0.01)96/90:0.02)100/100:0.05);";
let runtime = null;
let page = null;

try {
  await client.connect(transport);

  // 1. Aligned topology mode: suppresses leader lines and places labels tightly by nodes
  const alignedRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "aligned.tre", content: alignedTree },
      options: {
        layout: { mode: "aligned" },
        support: { scale: "percent/percent", full_support_marker: "star", low_support_threshold: 85 },
        labels: { auto_placement: true, node_arrows: true },
      },
    },
  });
  assert.ok(!alignedRes.isError);
  const alignedReport = alignedRes.structuredContent.report;
  assert.equal(alignedReport.safe_for_export, true);
  assert.equal(alignedReport.node_arrows.enabled, false);
  assert.equal(alignedReport.node_arrows.required, false);
  assert.equal(alignedReport.node_arrows.arrows, 0);
  assert.equal(alignedReport.node_arrows.missing, 0);
  assert.equal(alignedReport.node_arrows.unexpected, 0);
  const alignedLink = alignedRes.content.find(c => c.type === "resource_link" && c.name === "figure.svg");
  const alignedSvg = (await client.readResource({ uri: alignedLink.uri })).contents[0].text;
  assert.doesNotMatch(alignedSvg, /node-label-arrow/);

  // 2. Cladogram mode: also suppresses leader lines
  const cladoRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "cladogram.tre", content: alignedTree },
      options: {
        layout: { mode: "cladogram" },
        support: { scale: "percent/percent", full_support_marker: "number" },
        labels: { auto_placement: true, node_arrows: true },
      },
    },
  });
  assert.ok(!cladoRes.isError);
  assert.equal(cladoRes.structuredContent.report.safe_for_export, true);
  assert.equal(cladoRes.structuredContent.report.node_arrows.enabled, false);
  assert.equal(cladoRes.structuredContent.report.node_arrows.arrows, 0);

  // 3. Branchless Newick in default phylogram mode: no branch lengths to display, so no leader lines
  const branchlessRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "branchless.tre", content: "(Out,((Taxon_1,Taxon_2)95,(Taxon_3,(Taxon_4,Taxon_5)100)88)99);" },
      options: {
        layout: { mode: "phylogram" },
        support: { scale: "percent", full_support_marker: "star" },
        labels: { auto_placement: true, node_arrows: true },
      },
    },
  });
  assert.ok(!branchlessRes.isError);
  assert.equal(branchlessRes.structuredContent.report.safe_for_export, true);
  assert.equal(branchlessRes.structuredContent.report.node_arrows.enabled, false);
  assert.equal(branchlessRes.structuredContent.report.node_arrows.arrows, 0);

  // 4. Phylogram WITH real branch lengths retains leader lines
  const phyloRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "phylogram.tre", content: alignedTree },
      options: {
        layout: { mode: "phylogram" },
        support: { scale: "percent/percent", full_support_marker: "star", low_support_threshold: 85 },
        labels: { auto_placement: true, node_arrows: true },
      },
    },
  });
  assert.ok(!phyloRes.isError);
  assert.equal(phyloRes.structuredContent.report.safe_for_export, true);
  assert.equal(phyloRes.structuredContent.report.node_arrows.enabled, true);
  assert.equal(phyloRes.structuredContent.report.node_arrows.arrows, phyloRes.structuredContent.report.node_arrows.labels);

  // 5. Conflict tanglegram: equal-step topology trees on both sides must never draw leader lines
  const conflictRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "conflict",
      main_tree: { name: "left.tre", content: "(Out:0.2,((Sp_A:0.1,Sp_B:0.1)98:0.1,(Sp_C:0.1,Sp_D:0.1)76:0.1)100:0.1);" },
      comparison_tree: { name: "right.tre", content: "(Out:0.2,((Sp_A:0.1,Sp_C:0.1)91:0.1,(Sp_B:0.1,Sp_D:0.1)84:0.1)100:0.1);" },
      options: {
        conflict: { primary_support_scale: "percent", secondary_support_scale: "percent" },
        support: { full_support_marker: "circle" },
        labels: { node_arrows: true },
      },
    },
  });
  assert.ok(!conflictRes.isError);
  assert.equal(conflictRes.structuredContent.report.safe_for_export, true);
  const conflictLink = conflictRes.content.find(c => c.type === "resource_link" && c.name === "figure.svg");
  const conflictSvg = (await client.readResource({ uri: conflictLink.uri })).contents[0].text;
  assert.doesNotMatch(conflictSvg, /node-label-arrow/);

  await client.close();
  await transport.close();

  // 6. Browser GUI parity + live #layout-mode toggle (phylogram -> aligned -> phylogram)
  runtime = await createRuntime();
  page = await runtime.renderer.browser.newPage();
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));
  await page.goto(new URL("/", runtime.renderer.agentPageUrl).href);
  await page.evaluate(() => PhyloRenderAgent.ready());

  await page.evaluate(tree => PhyloRenderAgent.loadFigure({
    workspace: "phylogeny",
    main_tree: { name: "toggle.tre", content: tree },
    options: {
      layout: { mode: "phylogram" },
      support: { scale: "percent/percent", full_support_marker: "star", low_support_threshold: 85 },
      labels: { auto_placement: true, node_arrows: true },
    },
  }), alignedTree);

  const arrowsInPhylogram = await page.locator("#tree-svg .node-label-arrow").count();
  assert.ok(arrowsInPhylogram > 0, "phylogram mode must render leader arrows");

  // Switch via GUI dropdown to "aligned": arrows must disappear AND labels must tighten close to nodes!
  await page.locator('.settings-nav [data-settings-target="tree"]').click();
  if (!(await page.locator("#layout-mode").isVisible())) {
    await page.locator("details:has(#layout-mode) > summary").click();
  }
  await page.locator("#layout-mode").selectOption("aligned");
  await settleFigure(page);
  const alignedMetrics = await page.evaluate(() => {
    const arrows = document.querySelectorAll("#tree-svg .node-label-arrow").length;
    const distances = [...document.querySelectorAll("#tree-svg .support-label")]
      .map(el => Number(el.dataset.edgeDistance));
    return { arrows, maxDistance: Math.max(...distances) };
  });
  assert.equal(alignedMetrics.arrows, 0, "GUI switch to aligned must remove all leader lines");
  assert.ok(alignedMetrics.maxDistance <= 10, `GUI switch to aligned must pull labels tightly beside nodes, got max edgeDistance=${alignedMetrics.maxDistance}`);

  // Switch back to "phylogram": leader arrows return cleanly!
  await page.locator("#layout-mode").selectOption("phylogram");
  await settleFigure(page);
  assert.equal(await page.locator("#tree-svg .node-label-arrow").count(), arrowsInPhylogram, "switching back to phylogram restores leader arrows");
  assert.deepEqual(pageErrors, []);
  console.log("PASS unscaled-tree-no-leaders across MCP, Web GUI live mode toggle, branchless input, and conflict");
} finally {
  await page?.close().catch(() => {});
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
  if (runtime) {
    for (const ctx of runtime.renderer.browser.contexts()) await ctx.close();
    await runtime.close();
  }
  await rm(store, { recursive: true, force: true });
}
