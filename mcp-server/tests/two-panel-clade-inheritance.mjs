import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRuntime, MCP_ROOT } from "../src/runtime.mjs";

function balancedNewick(labels, branchLength = 0.05) {
  if (labels.length === 1) return labels[0];
  const mid = Math.floor(labels.length / 2);
  return `(${balancedNewick(labels.slice(0, mid), branchLength)}:${branchLength},${balancedNewick(labels.slice(mid), branchLength)}:${branchLength})95`;
}

function buildDatedBalancedNewick(labels, stepAge = 10) {
  function build(items) {
    if (items.length === 1) return { text: items[0], age: 0 };
    const mid = Math.floor(items.length / 2);
    const left = build(items.slice(0, mid));
    const right = build(items.slice(mid));
    const age = Math.max(left.age, right.age) + stepAge;
    const hpdLow = Math.max(0.5, age - 2);
    const hpdHigh = age + 2;
    const ann = `[&height=${age},height_95%_HPD={${hpdLow},${hpdHigh}}]`;
    return {
      text: `(${left.text}:${age - left.age},${right.text}:${age - right.age})${ann}`,
      age,
    };
  }
  return build(labels);
}

const outgroupNames = Array.from({ length: 12 }, (_, i) => `Outgroup_sp_${i + 1}`);
const sisterNames = Array.from({ length: 12 }, (_, i) => `Dodonaea_sp_${i + 1}`);
const basalSapNames = Array.from({ length: 8 }, (_, i) => `Xanthoceras_basal_${i + 1}`);
const extractedInnerNames = Array.from({ length: 20 }, (_, i) => `Acer_inner_${i + 1}`);
const extractedMiddleNames = Array.from({ length: 25 }, (_, i) => `Dimocarpus_mid_${i + 1}`);
const extractedRestNames = Array.from({ length: 45 }, (_, i) => `Sapindus_core_${i + 1}`);
const extractedInheritedNames = [...extractedMiddleNames, ...extractedRestNames];

// 整个 90-tip 单系冠群 (Acerina 20 + Dimocarpus 25 + Sapindus 45) 是全树唯一能使 Overview 降到 <=76 tips 的可选分支；
// 外包祖先 Sapindoideae 同时包住 basalSapNames (留在 Panel 1) 与该 90-tip 子树 (拆入 Panel 2)。
const extractedSubNewick = `((${balancedNewick(extractedInnerNames)}:0.04,${balancedNewick(extractedMiddleNames)}:0.04)97:0.04,${balancedNewick(extractedRestNames)}:0.08)98`;
const phylogenyNewick = `(${balancedNewick(outgroupNames)}:0.2,(${balancedNewick(sisterNames)}:0.15,(${balancedNewick(basalSapNames)}:0.1,${extractedSubNewick}:0.06)96:0.08)97:0.1);`;

const datedTreeRoot = (() => {
  const out = buildDatedBalancedNewick(outgroupNames, 8);
  const sis = buildDatedBalancedNewick(sisterNames, 8);
  const basal = buildDatedBalancedNewick(basalSapNames, 8);
  const inner = buildDatedBalancedNewick(extractedInnerNames, 8);
  const mid = buildDatedBalancedNewick(extractedMiddleNames, 8);
  const rest = buildDatedBalancedNewick(extractedRestNames, 8);
  const hpd = age => `[&height=${age},height_95%_HPD={${age - 2},${age + 2}}]`;
  const innerMidAge = Math.max(inner.age, mid.age) + 8;
  const innerMidText = `(${inner.text}:${innerMidAge - inner.age},${mid.text}:${innerMidAge - mid.age})${hpd(innerMidAge)}`;
  const extAge = Math.max(innerMidAge, rest.age) + 8;
  const sapAge = Math.max(basal.age, extAge) + 8;
  const ingroupAge = Math.max(sis.age, sapAge) + 8;
  const rootAge = Math.max(out.age, ingroupAge) + 8;
  const extText = `(${innerMidText}:${extAge - innerMidAge},${rest.text}:${extAge - rest.age})${hpd(extAge)}`;
  const sapText = `(${basal.text}:${sapAge - basal.age},${extText}:${sapAge - extAge})${hpd(sapAge)}`;
  const inText = `(${sis.text}:${ingroupAge - sis.age},${sapText}:${ingroupAge - sapAge})${hpd(ingroupAge)}`;
  return `(${out.text}:${rootAge - out.age},${inText}:${rootAge - ingroupAge})${hpd(rootAge)};`;
})();

const outputRoot = await mkdtemp(path.join(os.tmpdir(), "phylorender-two-panel-clades-"));
const runtime = await createRuntime();
const client = new Client({ name: "two-panel-clade-inheritance", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(MCP_ROOT, "src/stdio.mjs")],
  env: { ...process.env, PHYLORENDER_OUTPUT_ROOT: outputRoot },
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => window.PhyloRenderAgent.ready());

  const sapColor = "#0072b2";
  const innerColor = "#d95f02";
  const sisterColor = "#d55e00";

  const clades = [
    {
      mrca_of: [sisterNames[0], sisterNames.at(-1)],
      name: "Dodonaeoideae",
      color: sisterColor,
    },
    {
      mrca_of: [basalSapNames[0], extractedRestNames.at(-1)],
      name: "Sapindoideae",
      name_segments: [{ text: "Sapin", italic: true }, { text: "doideae", bold: true }],
      color: sapColor,
    },
    {
      mrca_of: [extractedInnerNames[0], extractedInnerNames.at(-1)],
      name: "Acerina",
      color: innerColor,
    },
  ];

  // --- 用例 A: phylogeny 工作区（Web & MCP 双端检验 + 富文本 + 样式还原） ---
  const phylogenySpec = {
    workspace: "phylogeny",
    main_tree: { name: "two-panel-clades.newick", content: phylogenyNewick },
    rooting: { outgroup: outgroupNames },
    clades,
    options: {
      support: { scale: "percent" },
      layout: { automatic_tip_spacing: true },
    },
  };

  const created = await client.callTool({ name: "create_figure", arguments: phylogenySpec }, undefined, { timeout: 240000 });
  assert.ok(!created.isError, JSON.stringify(created.content));
  const exported = await client.callTool({
    name: "export_figure",
    arguments: { figure_id: created.structuredContent.figure_id, formats: ["panels"] },
  }, undefined, { timeout: 240000 });
  assert.ok(!exported.isError, JSON.stringify(exported.content));
  const panel1Link = exported.content.find(c => c.type === "resource_link" && c.name === "panel-1.svg");
  const panel2Link = exported.content.find(c => c.type === "resource_link" && c.name === "panel-2.svg");
  assert.ok(panel1Link && panel2Link, "MCP must produce panel-1.svg and panel-2.svg");
  const mcpPanel1Svg = (await client.readResource({ uri: panel1Link.uri })).contents[0].text;
  const mcpPanel2Svg = (await client.readResource({ uri: panel2Link.uri })).contents[0].text;

  // 在 Web 页面加载完全相同的 spec，并分别用 Web buildA4PrintPages 路径获取 Panel SVGs
  const webInspect = await page.evaluate(async spec => {
    const loaded = await window.PhyloRenderAgent.loadFigure(spec, { includePanels: true });
    const webBuilt = await buildA4PrintPages();
    const afterExportSvg = await serializeRenderedSvg({ reuseLayout: true });
    const exportedConfig = await window.PhyloRenderAgent.exportConfiguration();

    const parsePanel = svgText => {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const branchColors = [...doc.querySelectorAll(".branches .branch")].map(el => el.getAttribute("style") || "");
      const tipColors = [...doc.querySelectorAll(".tips .tip-label")].map(el => ({
        text: el.textContent.trim(),
        style: el.getAttribute("style") || "",
      }));
      const cladeBars = [...doc.querySelectorAll(".clade-bars .clade-bar[data-bar-part='body']")].map(el => ({
        nodeId: el.getAttribute("data-clade-node-id"),
        x: Number(el.getAttribute("x1")),
        style: el.getAttribute("style") || "",
      }));
      const cladeLabels = [...doc.querySelectorAll(".clade-bars .clade-bar-label")].map(el => ({
        text: el.textContent.trim(),
        style: el.getAttribute("style") || "",
        segmentCount: Number(el.getAttribute("data-segment-count") || 0),
        segments: [...el.querySelectorAll("tspan")].map(s => ({
          text: s.textContent,
          italic: s.getAttribute("font-style"),
          bold: s.getAttribute("font-weight"),
        })),
      }));
      const incoming = doc.querySelector(".panel-continuation-guide");
      const incomingBranchStyle = incoming?.querySelector(".panel-incoming-branch")?.getAttribute("style") || "";
      const incomingArrowFill = incoming?.querySelector(".panel-continuation-arrowhead")?.getAttribute("fill") || "";
      const incomingLabelFill = incoming?.querySelector(".panel-continuation-label")?.getAttribute("fill") || "";
      return { branchColors, tipColors, cladeBars, cladeLabels, incomingBranchStyle, incomingArrowFill, incomingLabelFill };
    };

    const canonicalize = svgText => {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      doc.querySelector("metadata#phylorender-build")?.remove();
      return new XMLSerializer().serializeToString(doc.documentElement);
    };

    return {
      agentPanel2Count: loaded.panel_trees.length,
      webPanel2Count: webBuilt.pages.length,
      webPanel2MatchesAgent: canonicalize(webBuilt.pages[1].svg) === canonicalize(loaded.panel_trees[1].svg),
      panel2Parsed: parsePanel(webBuilt.pages[1].svg),
      afterExportHasOriginalCount: new DOMParser().parseFromString(afterExportSvg, "image/svg+xml").querySelectorAll(".tip-label").length,
      exportedCladeNames: exportedConfig.clades.map(c => c.name).sort(),
      mainCanvasBarCount: document.querySelectorAll("#tree-svg .clade-bar[data-bar-part='body']").length,
    };
  }, phylogenySpec);

  // 验证 MCP 与 Web Panel 2 完全一致
  const mcpMatchesWeb = await page.evaluate(({ mcpSvg, tipFollowCheck }) => {
    const doc = new DOMParser().parseFromString(mcpSvg, "image/svg+xml");
    const sapColorCount = [...doc.querySelectorAll(".branches .branch")].filter(el => (el.getAttribute("style") || "").toLowerCase().includes("#0072b2")).length;
    const barCount = doc.querySelectorAll(".clade-bars .clade-bar[data-bar-part='body']").length;
    const labelTexts = [...doc.querySelectorAll(".clade-bars .clade-bar-label")].map(el => el.textContent.trim());
    const incomingStyle = doc.querySelector(".panel-incoming-branch")?.getAttribute("style") || "";
    return { sapColorCount, barCount, labelTexts, incomingStyle };
  }, { mcpSvg: mcpPanel2Svg });

  assert.equal(webInspect.agentPanel2Count, 2);
  assert.equal(webInspect.webPanel2Count, 2);
  assert.equal(webInspect.webPanel2MatchesAgent, true, "Web and MCP Panel 2 SVGs must match");

  const p2 = webInspect.panel2Parsed;
  const sapBranches = p2.branchColors.filter(s => s.toLowerCase().includes(sapColor));
  const innerBranches = p2.branchColors.filter(s => s.toLowerCase().includes(innerColor));
  assert.ok(sapBranches.length >= 90, `Panel 2 must inherit Sapindoideae branch color (#0072b2), got ${sapBranches.length} branches`);
  assert.ok(innerBranches.length >= 40, `Panel 2 inner clade Acerina (#d95f02) must retain its own branch color, got ${innerBranches.length}`);

  const sapTips = p2.tipColors.filter(t => (t.text.startsWith("Sapindus") || t.text.startsWith("Dimocarpus")) && t.style.toLowerCase().includes(sapColor));
  const innerTips = p2.tipColors.filter(t => t.text.startsWith("Acer") && t.style.toLowerCase().includes(innerColor));
  assert.equal(sapTips.length, extractedInheritedNames.length, "All inherited Sapindus/Dimocarpus tips in Panel 2 must follow Sapindoideae color");
  assert.equal(innerTips.length, extractedInnerNames.length, "Inner Acerina tips must follow inner clade color");

  assert.ok(p2.incomingBranchStyle.toLowerCase().includes(sapColor), `Incoming guide branch should inherit ${sapColor}, got ${p2.incomingBranchStyle}`);
  assert.equal(p2.incomingArrowFill.toLowerCase(), sapColor, "Incoming arrowhead should inherit enclosing clade color");
  assert.equal(p2.incomingLabelFill.toLowerCase(), sapColor, "Incoming label follows enclosing clade color when tip_follow_clade is checked");

  assert.equal(p2.cladeBars.length, 2, "Panel 2 must display inherited Sapindoideae bar and inner Acerina bar (excluding Panel 1 Dodonaeoideae)");
  const sapBar = p2.cladeBars.find(b => b.style.toLowerCase().includes(sapColor));
  const innerBar = p2.cladeBars.find(b => b.style.toLowerCase().includes(innerColor));
  assert.ok(sapBar && innerBar, "Both inherited Sapindoideae and inner Acerina clade bars must exist in Panel 2");
  assert.ok(sapBar.x > innerBar.x, `Inherited enclosing Sapindoideae bar (${sapBar.x}) must be placed outside inner Acerina bar (${innerBar.x})`);

  const sapLabel = p2.cladeLabels.find(l => l.text === "Sapindoideae");
  assert.ok(sapLabel, "Sapindoideae clade label must render in Panel 2");
  assert.equal(sapLabel.segmentCount, 2, "Sapindoideae rich-text segments must be preserved in Panel 2");
  assert.equal(sapLabel.segments[0].italic, "italic");
  assert.equal(sapLabel.segments[1].bold, "700");

  assert.ok(mcpMatchesWeb.sapColorCount >= 90, "MCP Panel 2 SVG must inherit Sapindoideae branch color");
  assert.equal(mcpMatchesWeb.barCount, 2, "MCP Panel 2 SVG must render inherited + inner clade bars");
  assert.deepEqual([...mcpMatchesWeb.labelTexts].sort(), ["Acerina", "Sapindoideae"]);
  assert.ok(mcpMatchesWeb.incomingStyle.toLowerCase().includes(sapColor), "MCP Panel 2 incoming guide inherits Sapindoideae color");

  // 原主图交互态无污染
  assert.equal(webInspect.afterExportHasOriginalCount, 122);
  assert.deepEqual(webInspect.exportedCladeNames, ["Acerina", "Dodonaeoideae", "Sapindoideae"]);
  assert.equal(webInspect.mainCanvasBarCount, 3);

  // 关闭 tip-follow-clade 后，Panel 2 末端标签不应带颜色，树枝与分组条仍继承分组色
  const noFollow = await page.evaluate(async () => {
    $("tip-follow-clade").checked = false;
    await renderTree();
    const res = await window.PhyloRenderAgent.currentFigure({ includePanels: true });
    const doc = new DOMParser().parseFromString(res.panel_trees[1].svg, "image/svg+xml");
    return {
      coloredTips: [...doc.querySelectorAll(".tips .tip-label")].filter(el => (el.getAttribute("style") || "").includes("fill:")).length,
      sapBranches: [...doc.querySelectorAll(".branches .branch")].filter(el => (el.getAttribute("style") || "").toLowerCase().includes("#0072b2")).length,
      incomingLabelFill: doc.querySelector(".panel-continuation-label")?.getAttribute("fill") || "",
    };
  });
  assert.equal(noFollow.coloredTips, 0, "Tips must remain neutral when tip_follow_clade is disabled");
  assert.ok(noFollow.sapBranches >= 90, "Branches still inherit Sapindoideae color when tip_follow_clade is disabled");
  assert.notEqual(noFollow.incomingLabelFill.toLowerCase(), sapColor, "Incoming label stays neutral when tip_follow_clade is disabled");

  // --- 用例 B: time 工作区 + hpd_scope: "named_clades" ---
  const timeSpec = {
    workspace: "time",
    main_tree: { name: "dated-two-panel.tree", content: datedTreeRoot },
    clades,
    options: {
      time: {
        source_unit: "mya",
        age_source: "height",
        show_hpd: true,
        hpd_scope: "named_clades",
      },
      layout: { automatic_tip_spacing: true },
    },
  };
  const timeResult = await page.evaluate(async spec => {
    const res = await window.PhyloRenderAgent.loadFigure(spec, { includePanels: true });
    const doc = new DOMParser().parseFromString(res.panel_trees[1].svg, "image/svg+xml");
    const branchColors = [...doc.querySelectorAll(".time-branches .branch")].map(el => el.getAttribute("style") || "");
    const tipColors = [...doc.querySelectorAll(".time-tips .tip-label")].map(el => el.getAttribute("style") || "");
    const bars = [...doc.querySelectorAll(".clade-bars .clade-bar-label")].map(el => el.textContent.trim());
    const hpdCount = doc.querySelectorAll(".time-hpd").length;
    const incomingStyle = doc.querySelector(".panel-incoming-branch")?.getAttribute("style") || "";
    const hasRootId = doc.documentElement.getAttribute("data-root-x");
    const rootHpd = doc.querySelectorAll(`.time-hpd`).length;
    return {
      panelCount: res.panel_trees.length,
      sapBranchCount: branchColors.filter(s => s.toLowerCase().includes("#0072b2")).length,
      sapTipCount: tipColors.filter(s => s.toLowerCase().includes("#0072b2")).length,
      bars: bars.sort(),
      hpdCount,
      incomingStyle,
      hasRootId,
      rootHpd,
    };
  }, timeSpec);

  assert.equal(timeResult.panelCount, 2);
  assert.ok(timeResult.sapBranchCount >= 90, `Time tree Panel 2 must inherit #0072b2 branches, got ${timeResult.sapBranchCount}`);
  assert.equal(timeResult.sapTipCount, extractedInheritedNames.length, "Time tree Panel 2 tips must inherit #0072b2");
  assert.deepEqual(timeResult.bars, ["Acerina", "Sapindoideae"]);
  assert.ok(timeResult.incomingStyle.toLowerCase().includes("#0072b2"), "Time tree Panel 2 incoming guide inherits #0072b2");
  // Acerina 是唯一落在 Panel 2 内的显式命名 HPD 节点（1 个 HPD）；未命名的 Panel 2 根节点绝不能被伪造额外 HPD 条！
  assert.equal(timeResult.hpdCount, 1, `hpd_scope=named_clades must draw HPD only for Acerina (1), not phantom root node (got ${timeResult.hpdCount})`);

  assert.deepEqual(errors, [], `Unexpected page errors: ${errors.join("; ")}`);
  console.log("TWO_PANEL_CLADE_INHERITANCE_PASSED: Web & MCP phylogeny + dated trees inherit enclosing clade colors and bars faithfully");
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
  await runtime.close().catch(() => {});
  await rm(outputRoot, { recursive: true, force: true }).catch(() => {});
}
