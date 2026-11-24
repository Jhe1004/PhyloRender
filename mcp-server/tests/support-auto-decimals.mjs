import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRuntime, MCP_ROOT } from "../src/runtime.mjs";
import { settleFigure } from "./settle-figure.mjs";

const store = await mkdtemp(path.join(os.tmpdir(), "phylorender-support-auto-decimals-"));
const client = new Client({ name: "support-auto-decimals", version: "1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(MCP_ROOT, "src/stdio.mjs")],
  env: { ...process.env, PHYLORENDER_OUTPUT_ROOT: store },
  stderr: "pipe",
});
transport.stderr?.on("data", () => {});

function extractLabels(svg) {
  return [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
    .filter(m => /\bsupport-label\b/.test(m[1]))
    .map(m => m[2].trim());
}

const mlTree = "(Out:0.3,((Sp_A:0.02,Sp_B:0.03)95:0.01,(Sp_C:0.04,(Sp_D:0.01,Sp_E:0.02)100:0.01)82:0.02)100:0.05);";
const ppTree = "(Out:0.3,((Sp_A:0.02,Sp_B:0.03)0.94:0.01,(Sp_C:0.04,(Sp_D:0.01,Sp_E:0.02)1:0.01)0.85:0.02)1:0.05);";

let runtime = null;
let page = null;

try {
  await client.connect(transport);

  // 1. Pure percentage tree with MCP defaults: integers '95', '82' (never '95.0', '82.0')
  const pctRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "ml.tre", content: mlTree },
      options: { support: { scale: "percent" } },
    },
  });
  assert.ok(!pctRes.isError);
  const pctSvg = (await client.readResource({
    uri: pctRes.content.find(c => c.type === "resource_link" && c.name === "figure.svg").uri,
  })).contents[0].text;
  assert.deepEqual(extractLabels(pctSvg).sort(), ["82", "95"]);

  // 2. Compound ML (%) + ASTRAL (probability) tree with MCP defaults: '95/0.94', '82/0.85'
  const dualRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "ml.tre", content: mlTree },
      support_trees: [{ name: "pp.tre", content: ppTree, scale: "probability" }],
      options: { support: { scale: "percent", full_support_marker: "star" } },
    },
  });
  assert.ok(!dualRes.isError);
  const dualSvg = (await client.readResource({
    uri: dualRes.content.find(c => c.type === "resource_link" && c.name === "figure.svg").uri,
  })).contents[0].text;
  assert.deepEqual(extractLabels(dualSvg).sort(), ["*", "82/0.85", "95/0.94"]);

  // 3. Conflict two-tree comparison (left: %, right: probability) with MCP defaults: '82', '95', '0.85', '0.94'
  const conflictRes = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "conflict",
      main_tree: { name: "ml.tre", content: mlTree },
      comparison_tree: { name: "pp.tre", content: ppTree },
      rooting: { outgroup: ["Out"] },
      options: { conflict: { primary_support_scale: "percent", secondary_support_scale: "probability" } },
    },
  });
  assert.ok(!conflictRes.isError);
  const conflictSvg = (await client.readResource({
    uri: conflictRes.content.find(c => c.type === "resource_link" && c.name === "figure.svg").uri,
  })).contents[0].text;
  assert.deepEqual(extractLabels(conflictSvg).sort(), ["0.85", "0.94", "82", "95"]);

  // 4. Web GUI round-trip: default 'auto' -> 'As in file' ('original') -> fixed 1 place -> 'Auto by scale' ('auto')
  runtime = await createRuntime();
  page = await runtime.renderer.browser.newPage();
  await page.goto(new URL("/", runtime.renderer.agentPageUrl).toString());
  await page.waitForFunction(() => Boolean(window.PhyloRenderAgent));
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  await page.evaluate(({ ml, pp }) => window.PhyloRenderAgent.loadFigure({
    workspace: "phylogeny",
    main_tree: { name: "ml.tre", content: ml },
    support_trees: [{ name: "pp.tre", content: pp, scale: "probability" }],
    options: { support: { scale: "percent" } },
  }), { ml: mlTree, pp: ppTree });
  await settleFigure(page);

  const initial = await page.evaluate(async () => ({
    decimals: (await window.PhyloRenderAgent.exportConfiguration()).options.support.decimals,
    labels: [...document.querySelectorAll(".support-label")].map(n => n.textContent.trim()).sort(),
  }));
  assert.equal(initial.decimals, "auto");
  assert.deepEqual(initial.labels, ["82/0.85", "95/0.94"]);

  await page.locator('[data-settings-target="labels"]').click();
  await page.evaluate(() => {
    for (let p = document.getElementById("support-decimals-auto").parentElement; p; p = p.parentElement) {
      if (p.tagName === "DETAILS") p.open = true;
    }
  });
  await page.locator("#support-decimals-auto").click();
  await settleFigure(page);
  const asInFile = await page.evaluate(async () => ({
    decimals: (await window.PhyloRenderAgent.exportConfiguration()).options.support.decimals,
    labels: [...document.querySelectorAll(".support-label")].map(n => n.textContent.trim()).sort(),
  }));
  assert.equal(asInFile.decimals, "original");
  assert.deepEqual(asInFile.labels, ["82/0.85", "95/0.94"]);

  await page.locator("#support-decimals-number").fill("1");
  await page.locator("#support-decimals-number").press("Tab");
  await settleFigure(page);
  const fixedOne = await page.evaluate(async () => ({
    decimals: (await window.PhyloRenderAgent.exportConfiguration()).options.support.decimals,
    labels: [...document.querySelectorAll(".support-label")].map(n => n.textContent.trim()).sort(),
  }));
  assert.equal(fixedOne.decimals, 1);
  assert.deepEqual(fixedOne.labels, ["82.0/0.8", "95.0/0.9"]);

  await page.locator("#support-decimals-scale-auto").click();
  await settleFigure(page);
  const restoredAuto = await page.evaluate(async () => ({
    decimals: (await window.PhyloRenderAgent.exportConfiguration()).options.support.decimals,
    labels: [...document.querySelectorAll(".support-label")].map(n => n.textContent.trim()).sort(),
  }));
  assert.equal(restoredAuto.decimals, "auto");
  assert.deepEqual(restoredAuto.labels, ["82/0.85", "95/0.94"]);

  console.log("PASS support-auto-decimals across pure %, dual %/prob, conflict, and Web GUI round-trip");
} finally {
  await page?.close().catch(() => {});
  await runtime?.close().catch(() => {});
  await client.close().catch(() => {});
  await rm(store, { recursive: true, force: true });
}
