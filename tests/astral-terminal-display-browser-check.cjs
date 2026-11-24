const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.PhyloRenderAgent?.version);

    const result = await page.evaluate(async () => {
      const astral = "((A:0,B:0)0.91:0.5,(C:0,D:0)0.82:2);";
      const inspection = await window.PhyloRenderAgent.inspectTree({ name: "astral-like.tre", content: astral });
      const rendered = await window.PhyloRenderAgent.loadFigure({
        main_tree: { name: "astral-like.tre", content: astral },
        options: { layout: { mode: "phylogram" } },
      });
      const terminalBranches = [...document.querySelectorAll("#tree-svg .branch[data-clade-node-id]")]
        .filter(line => {
          const id = line.getAttribute("data-clade-node-id");
          return document.querySelector(`#tree-svg .tip-label[data-tip-node-id="${CSS.escape(id)}"]`);
        })
        .map(line => Math.abs(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1"))));
      const astralState = {
        inspection,
        report: rendered.report,
        terminalBranches,
        scaleLines: document.querySelectorAll("#tree-svg .scale-line").length,
        nodePreferred: document.querySelector("#support-size").value,
        nodeMinimum: document.querySelector("#support-min-size").value,
        supportMarkerRadii: [...document.querySelectorAll("#tree-svg .support-node-marker")]
          .map(marker => Number(marker.getAttribute("r"))),
      };

      const ordinary = await window.PhyloRenderAgent.loadFigure({
        main_tree: { name: "ordinary.tre", content: "((A:0.1,B:0.2)0.91:0.5,(C:0.3,D:0.4)0.82:2);" },
        options: { layout: { mode: "phylogram" } },
      });
      return {
        astralState,
        ordinaryDisplay: ordinary.report.display_branch_lengths,
        ordinaryScaleLines: document.querySelectorAll("#tree-svg .scale-line").length,
      };
    });

    const raw = result.astralState.inspection.branch_lengths;
    assert.deepEqual(raw.terminal, { total: 4, positive: 0, zero: 4, missing: 0 });
    assert.equal(raw.display_recommendation.auto_equal_terminal_length, true);
    assert.equal(raw.display_recommendation.source_tree_unchanged, true);
    assert.equal(result.astralState.report.display_branch_lengths.applied_to_render, true);
    assert.equal(result.astralState.report.display_branch_lengths.display_terminal_length, 1);
    assert.equal(result.astralState.report.display_branch_lengths.source_tree_unchanged, true);
    assert.equal(result.astralState.report.display_branch_lengths.scale_bar_suppressed, true);
    assert.equal(result.astralState.scaleLines, 0, "混合显示长度不得绘制误导性比例尺");
    assert.equal(result.astralState.terminalBranches.length, 4);
    assert.ok(result.astralState.terminalBranches.every(length => length > 0), "每条零长度末端都应获得可见的等长显示短枝");
    assert.ok(Math.max(...result.astralState.terminalBranches) - Math.min(...result.astralState.terminalBranches) < 1e-6);
    assert.equal(result.astralState.nodePreferred, "18");
    assert.equal(result.astralState.nodeMinimum, "16");
    assert.ok(result.astralState.supportMarkerRadii.every(radius => radius === 5));
    assert.equal(result.ordinaryDisplay.applied_to_render, false);
    assert.ok(result.ordinaryScaleLines > 0, "普通真实枝长树仍应保留比例尺");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
