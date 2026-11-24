import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRuntime, MCP_ROOT } from "../src/runtime.mjs";
import { settleFigure } from "./settle-figure.mjs";

const store = await mkdtemp(path.join(os.tmpdir(), "phylorender-clade-hierarchy-"));
const client = new Client({ name: "clade-nested-hierarchy", version: "1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(MCP_ROOT, "src/stdio.mjs")],
  env: { ...process.env, PHYLORENDER_OUTPUT_ROOT: store },
  stderr: "pipe",
});
transport.stderr?.on("data", () => {});

const tree = "(Out_sp:60,((A_one:20,A_two:20):20,(((B_inner1:10,B_inner2:10):10,(B_outer1:20,B_outer2:20):0):10,(C_one:15,C_two:15):15):10):20);";
const clades = [
  { mrca_of: ["A_one", "A_two"], name: "Subfam Alpha", color: "#D55E00", tier: 1, label_orientation: "horizontal" },
  { mrca_of: ["B_inner1", "B_inner2"], name: "GenB", color: "#009988" },
  { mrca_of: ["B_inner1", "B_outer2"], name: "Subfam Beta", color: "#0072B2", tier: 1 },
  { mrca_of: ["C_one", "C_two"], name: "Subfam Gamma", color: "#009E73", tier: 1, label_orientation: "horizontal" },
];
const table = "Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t8\t1\t1\t0\tB_inner1;B_inner2\n";

const makeSpec = workspace => ({
  workspace,
  main_tree: { name: "hierarchy.nwk", content: tree },
  clades,
  ...(workspace === "cloud" ? { phyparts_table: { name: "counts.tsv", content: table } } : {}),
  options: {
    ...(workspace === "phylogeny" ? { support: { scale: "percent" } } : {}),
    ...(workspace === "time" ? { time: { source_unit: "mya", age_source: "branch_lengths" } } : {}),
    ...(workspace === "cloud" ? { cloud: { species_method: "dated", dated_unit: "mya", dated_age_source: "branch_lengths", show_gene: false } } : {}),
  },
});

let runtime;
let page;
try {
  await client.connect(transport);
  const mcpSvgs = new Map();
  let phylogenyId = null;
  let alphaCladeId = null;

  for (const workspace of ["phylogeny", "time", "cloud"]) {
    const res = await client.callTool({ name: "create_figure", arguments: makeSpec(workspace) }, undefined, { timeout: 240000 });
    assert.ok(!res.isError, JSON.stringify(res.content));
    const link = res.content.find(c => c.type === "resource_link" && c.name === "figure.svg");
    assert.ok(link);
    mcpSvgs.set(workspace, (await client.readResource({ uri: link.uri })).contents[0].text);
    if (workspace !== "cloud") {
      const gapGroups = res.structuredContent.report.clade_bar_spacing.groups;
      assert.equal(res.structuredContent.report.clade_bar_spacing.valid, true);
      assert.equal(gapGroups.filter(g => g.bar_style === "dashed" && g.alignment_column === 1).length, 3, `${workspace}: all 3 peer subfamilies must be dashed on column 1`);
      assert.equal(gapGroups.filter(g => g.bar_style === "solid" && g.alignment_column === 0).length, 1, `${workspace}: inner genus must be solid on column 0`);
    }
    if (workspace === "phylogeny") {
      phylogenyId = res.structuredContent.figure_id;
      const inspected = await client.callTool({ name: "inspect_figure", arguments: { figure_id: phylogenyId } });
      alphaCladeId = inspected.structuredContent.state.clades.find(c => c.name === "Subfam Alpha").clade_id;
      assert.equal(inspected.structuredContent.state.clades.find(c => c.name === "Subfam Alpha").tier, 1);
      assert.equal(inspected.structuredContent.report.clades.find(c => c.name === "Subfam Alpha").bar_style, "auto");
      assert.equal(inspected.structuredContent.report.clades.find(c => c.name === "Subfam Alpha").tier, 1);
    }
  }

  // Test MCP edit_figure: explicit dash-dot override, then clearing tier via null
  const updatedDashDot = await client.callTool({
    name: "edit_figure",
    arguments: {
      figure_id: phylogenyId,
      base_revision: 1,
      operations: [{ op: "update_clade", clade_id: alphaCladeId, patch: { bar_style: "dash-dot" } }],
    },
  });
  assert.ok(!updatedDashDot.isError);
  assert.ok(updatedDashDot.structuredContent.report.clade_bar_spacing.groups.some(g => g.bar_style === "dash-dot"));

  const clearedTier = await client.callTool({
    name: "edit_figure",
    arguments: {
      figure_id: phylogenyId,
      base_revision: 2,
      operations: [{ op: "update_clade", clade_id: alphaCladeId, patch: { tier: null, bar_style: "auto" } }],
    },
  });
  assert.ok(!clearedTier.isError);
  const afterClear = await client.callTool({ name: "inspect_figure", arguments: { figure_id: phylogenyId } });
  const alphaState = afterClear.structuredContent.state.clades.find(c => c.clade_id === alphaCladeId);
  assert.equal(alphaState.tier, undefined, "tier: null must clear explicit tier back to automatic mode");
  assert.equal(
    clearedTier.structuredContent.report.clade_bar_spacing.groups.filter(g => g.bar_style === "solid" && g.alignment_column === 0).length,
    2,
    "without explicit tier, un-nested Subfam Alpha returns to column 0 solid",
  );

  // Single-layer dated tree under default "auto" aligns flush tips onto one shared solid line,
  // while a single-layer phylogram keeps local "nearby" solid brackets
  const singleLayerTime = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "time",
      main_tree: { name: "single.nwk", content: "(Out_sp:40,((Short_a:20,Short_b:20):10,(Very_long_species_name_alpha_12345:20,Very_long_species_name_beta_12345:20):10):10);" },
      clades: [
        { mrca_of: ["Short_a", "Short_b"], name: "Short Clade", color: "#D55E00" },
        { mrca_of: ["Very_long_species_name_alpha_12345", "Very_long_species_name_beta_12345"], name: "Long Clade", color: "#0072B2" },
      ],
      options: { time: { source_unit: "mya", age_source: "branch_lengths" } },
    },
  });
  assert.ok(!singleLayerTime.isError);
  const singleTimeGroups = singleLayerTime.structuredContent.report.clade_bar_spacing.groups;
  assert.equal(singleTimeGroups.length, 2);
  assert.ok(singleTimeGroups.every(g => g.alignment === "aligned" && g.bar_style === "solid"), "1-layer dated clades under default auto align onto one shared solid column");

  const singleLayerPhylogram = await client.callTool({
    name: "create_figure",
    arguments: {
      workspace: "phylogeny",
      main_tree: { name: "single-phylogram.nwk", content: "(Out_sp:40,((Short_a:5,Short_b:5):5,(Very_long_species_name_alpha_12345:25,Very_long_species_name_beta_12345:25):10):10);" },
      clades: [
        { mrca_of: ["Short_a", "Short_b"], name: "Short Clade", color: "#D55E00" },
        { mrca_of: ["Very_long_species_name_alpha_12345", "Very_long_species_name_beta_12345"], name: "Long Clade", color: "#0072B2" },
      ],
    },
  });
  assert.ok(!singleLayerPhylogram.isError);
  const singlePhylogramGroups = singleLayerPhylogram.structuredContent.report.clade_bar_spacing.groups;
  assert.equal(singlePhylogramGroups.length, 2);
  assert.ok(singlePhylogramGroups.every(g => g.alignment === "nearby" && g.bar_style === "solid"), "1-layer phylogram clades under default auto keep local nearby solid bars");

  // Invalid tier / bar_style rejected cleanly without advancing revision
  const badEdit = await client.callTool({
    name: "edit_figure",
    arguments: {
      figure_id: phylogenyId,
      base_revision: 3,
      operations: [{ op: "update_clade", clade_id: alphaCladeId, patch: { tier: 9 } }],
    },
  });
  assert.equal(badEdit.isError, true);

  await client.close();
  await transport.close();

  // Browser parity + GUI dialog roundtrip + rollback check
  runtime = await createRuntime();
  page = await runtime.renderer.browser.newPage();
  const pageErrors = [];
  let computations = 0;
  page.on("pageerror", err => pageErrors.push(err.message));
  page.on("request", req => {
    if (req.method() === "POST" && /\/api\/cloud-(date|phyparts)/.test(req.url())) computations++;
  });
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => PhyloRenderAgent.ready());

  const canonical = svg => page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    if (doc.querySelector("parsererror")) throw new Error("SVG_PARSE_FAILED");
    doc.querySelectorAll("metadata#phylorender-build").forEach(n => n.remove());
    const walk = n => n.nodeType === 1
      ? { tag: n.tagName, attributes: [...n.attributes].map(a => [a.name, a.value]).sort(), children: [...n.childNodes].map(walk) }
      : { type: n.nodeType, text: n.textContent };
    return JSON.stringify(walk(doc.documentElement));
  }, svg);

  for (const workspace of ["phylogeny", "time", "cloud"]) {
    const spec = makeSpec(workspace);
    await page.evaluate(s => PhyloRenderAgent.loadFigure(s), spec);
    const webSvg = await page.evaluate(() => serializeRenderedSvg());
    assert.equal(await canonical(webSvg), await canonical(mcpSvgs.get(workspace)), `${workspace}: Web and MCP SVG must match exactly`);

    // Verify DOM attributes: dashed body bars have stroke-dasharray, while top/bottom caps stay solid
    const domCheck = await page.evaluate(() => {
      const bodies = [...document.querySelectorAll('.clade-bar[data-bar-part="body"]')].map(el => ({
        id: el.dataset.cladeNodeId,
        style: el.dataset.barStyle,
        col: Number(el.dataset.alignmentColumn),
        x: Number(el.getAttribute("x1")),
        dash: el.getAttribute("stroke-dasharray"),
      }));
      const capsWithDash = [...document.querySelectorAll('.clade-bar[data-bar-part="top"], .clade-bar[data-bar-part="bottom"]')]
        .filter(el => el.hasAttribute("stroke-dasharray")).length;
      return { bodies, capsWithDash };
    });
    assert.equal(domCheck.capsWithDash, 0, `${workspace}: horizontal end caps must always remain solid`);
    const dashedBodies = domCheck.bodies.filter(b => b.style === "dashed");
    assert.equal(dashedBodies.length, 3);
    assert.equal(new Set(dashedBodies.map(b => b.x)).size, 1, `${workspace}: peer outer tier bars share exact x coordinate`);
    assert.ok(dashedBodies.every(b => typeof b.dash === "string" && b.dash.length > 0));

    // Exercise GUI dialog controls without triggering scientific engines
    const beforeComputations = computations;
    await page.evaluate(() => {
      const id = [...activeCladeState().cladeNames].find(([, name]) => name === "GenB")[0];
      openCladeNameDialog(id);
    });
    assert.equal(await page.locator("#clade-bar-tier").inputValue(), "auto");
    assert.equal(await page.locator("#clade-bar-style").inputValue(), "auto");
    await page.locator("#clade-bar-style").selectOption("dashed");
    await page.locator("#save-clade-name").click();
    await settleFigure(page);
    assert.equal(computations, beforeComputations, "changing clade bracket style must not invoke native engines");
    const exportedAfterGui = await page.evaluate(() => PhyloRenderAgent.exportConfiguration());
    assert.equal(exportedAfterGui.clades.find(c => c.name === "GenB").bar_style, "dashed");

    // Restore via GUI back to auto and verify exact SVG recovery + failed import rollback
    await page.evaluate(() => {
      const id = [...activeCladeState().cladeNames].find(([, name]) => name === "GenB")[0];
      openCladeNameDialog(id);
    });
    await page.locator("#clade-bar-style").selectOption("auto");
    await page.locator("#save-clade-name").click();
    await settleFigure(page);
    assert.equal(await canonical(await page.evaluate(() => serializeRenderedSvg())), await canonical(webSvg));

    await assert.rejects(page.evaluate(s => PhyloRenderAgent.loadFigure(s), {
      ...spec,
      main_tree: { name: "bad.nwk", content: tree.replace("A_one:20", "A_one:-20") },
    }));
    assert.equal(await canonical(await page.evaluate(() => serializeRenderedSvg())), await canonical(webSvg), `${workspace}: failed import preserves clade tier/style state`);
  }

  assert.deepEqual(pageErrors, []);
  console.log("PASS clade-nested-hierarchy across MCP, Web GUI, roundtrip, cap-locked dashes, and rollback");
} finally {
  await page?.close();
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
  if (runtime) {
    for (const ctx of runtime.renderer.browser.contexts()) await ctx.close();
    await runtime.close();
  }
  await rm(store, { recursive: true, force: true });
}
