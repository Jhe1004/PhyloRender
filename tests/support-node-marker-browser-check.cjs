const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const screenshotPath = process.argv[3] ? path.resolve(process.argv[3]) : null;

function treeFile(name, text) {
  return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.PhyloRenderAgent?.version));
    assert.equal(await page.locator("#full-support-style").inputValue(), "branch");

    const mainTree = "((((A:1,B:1)1:1,C:1)0.8:1,D:1)0.7:1,E:1);";
    const exported = await page.evaluate(async mainTree => {
      const figure = await window.PhyloRenderAgent.loadFigure({
        main_tree: { name: "support-marker-check.tre", content: mainTree },
        options: {
          layout: { branch_width: 1.2 },
          support: { decimals: 1, full_support_marker: "branch", low_support_threshold: 50 },
        },
        clades: [{ mrca_of: ["A", "B"], name: "AB", color: "#cc3344" }],
      });
      const parse = svg => new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
      const exportedSvg = parse(figure.svg);
      return {
        svgHasThickBranch: Boolean(exportedSvg.querySelector(".full-support-branch")),
        svgHasFullMarker: Boolean(exportedSvg.querySelector(".support-node-marker-full")),
        svgHasRootAnchor: exportedSvg.hasAttribute("data-root-x") && exportedSvg.hasAttribute("data-root-y"),
        panelsHaveThickBranch: figure.panel_trees.some(panel => Boolean(parse(panel.svg).querySelector(".full-support-branch"))),
      };
    }, mainTree);
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length === 5);

    const result = await page.evaluate(() => {
      const details = marker => ({
        radius: Number(marker.getAttribute("r")),
        fill: getComputedStyle(marker).fill,
        support: marker.getAttribute("data-support"),
      });
      return {
        bridgeVersion: window.PhyloRenderAgent.version,
        fullBranches: [...document.querySelectorAll("#tree-svg .full-support-branch")].map(branch => ({
          width: Number.parseFloat(getComputedStyle(branch).strokeWidth),
          stroke: getComputedStyle(branch).stroke,
          state: branch.getAttribute("data-support-state"),
        })),
        full: [...document.querySelectorAll("#tree-svg .support-node-marker-full")].map(details),
        partial: [...document.querySelectorAll("#tree-svg .support-node-marker-partial")].map(details),
        genericNodeDots: document.querySelectorAll("#tree-svg .node-dot").length,
        labels: [...document.querySelectorAll("#tree-svg .support-label")].map(label => label.textContent.trim()),
        svg: document.querySelector("#tree-svg").outerHTML,
      };
    });

    assert.match(result.bridgeVersion, /^1\./);
    assert.ok(result.fullBranches.length >= 1, "满支持率必须使对应的入枝加粗");
    assert.ok(result.fullBranches.every(branch => branch.width === 3), "1.2 px 基础枝宽应加粗为 2.5 倍");
    assert.ok(result.fullBranches.every(branch => branch.state === "full"));
    assert.ok(result.fullBranches.some(branch => branch.stroke === "rgb(204, 51, 68)"),
      "分支着色后应保留用户颜色，满支持率只由粗细表示");
    assert.equal(result.full.length, 0, "新默认样式不应给满支持率画黑点");
    assert.ok(result.partial.length >= 1, "非满支持率节点必须显示红色实心圆");
    assert.ok(result.partial.every(marker => marker.radius === 5));
    assert.ok(result.partial.every(marker => marker.fill === "rgb(140, 46, 40)"), "非满支持率圆点应使用默认支持率红色");
    assert.equal(result.genericNodeDots, 0, "新默认样式不应为无支持率或满支持率节点画通用圆点");
    assert.ok(!result.labels.some(label => /^1(?:\.0+)?$/.test(label)), "满支持率数字应由粗分支替代");
    assert.ok(result.labels.some(label => /^0\.8(?:0+)?$/.test(label)), "非满支持率数字仍应正常显示");
    assert.match(result.svg, /class="branch full-support-branch"/);
    assert.equal(exported.svgHasThickBranch, true, "SVG 导出必须保留满支持率粗分支");
    assert.equal(exported.svgHasFullMarker, false, "SVG 导出不应夹带满支持率黑点");
    assert.equal(exported.svgHasRootAnchor, true, "无通用节点时仍要保留拆图所需的根坐标");
    assert.equal(exported.panelsHaveThickBranch, true, "上下两图必须继承满支持率粗分支");

    await page.evaluate(() => {
      const select = document.querySelector("#full-support-style");
      select.value = "circle";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .support-node-marker-full").length > 0);
    const legacy = await page.evaluate(() => ({
      fullMarkers: document.querySelectorAll("#tree-svg .support-node-marker-full").length,
      thickBranches: document.querySelectorAll("#tree-svg .full-support-branch").length,
    }));
    assert.ok(legacy.fullMarkers > 0, "用户仍可显式选择旧的黑圆样式");
    assert.equal(legacy.thickBranches, 0, "旧黑圆样式不应同时加粗分支");

    await page.evaluate(() => {
      const select = document.querySelector("#full-support-style");
      select.value = "branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .full-support-branch").length > 0);
    if (screenshotPath) await page.locator("#tree-svg").screenshot({ path: screenshotPath });

    await page.locator('[data-workspace-mode="conflict"]').click();
    await page.waitForFunction(() => document.body.classList.contains("conflict-tree-mode"));
    await page.locator("#conflict-nuclear-file").setInputFiles(treeFile(
      "nuclear-support-check.tre",
      "((A:1,B:1)100:1,C:1);",
    ));
    await page.waitForFunction(() => document.querySelector("#conflict-nuclear-name")?.textContent === "nuclear-support-check.tre");
    await page.locator("#conflict-plastid-file").setInputFiles(treeFile(
      "plastid-support-check.tre",
      "((A:1,C:1)0.8:1,B:1);",
    ));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .conflict-tree-title").length === 2);
    const conflict = await page.evaluate(() => ({
      fullBranches: [...document.querySelectorAll("#tree-svg .conflict-branch.full-support-branch")]
        .map(branch => Number.parseFloat(getComputedStyle(branch).strokeWidth)),
      fullMarkers: document.querySelectorAll("#tree-svg .support-node-marker-full").length,
      partialMarkers: document.querySelectorAll("#tree-svg .support-node-marker-partial").length,
    }));
    assert.ok(conflict.fullBranches.length > 0, "核质冲突树的满支持率也必须加粗入枝");
    assert.ok(conflict.fullBranches.every(width => width === 3));
    assert.equal(conflict.fullMarkers, 0, "核质冲突树不应再为满支持率画黑点");
    assert.ok(conflict.partialMarkers > 0, "核质冲突树仍应为非满支持率画红点");

    await page.locator('[data-workspace-mode="time"]').click();
    await page.waitForFunction(() => document.body.classList.contains("time-tree-mode"));
    await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 60000 });
    await page.locator("#tree-file").setInputFiles(treeFile(
      "dating-support-check.tre",
      "((A:5,B:5)[&height=5,posterior=0.97]:5,(C:4,D:4)[&height=4,posterior=1]:6)[&height=10,posterior=0.9];",
    ));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-tip-label").length === 4);
    const dating = await page.evaluate(() => ({
      fullBranches: [...document.querySelectorAll("#tree-svg .time-branch.full-support-branch")]
        .map(branch => Number.parseFloat(getComputedStyle(branch).strokeWidth)),
      fullSupportMarkers: document.querySelectorAll("#tree-svg .support-node-marker-full").length,
      ageMarkers: document.querySelectorAll("#tree-svg .time-age-marker").length,
    }));
    assert.ok(dating.fullBranches.length > 0, "Dating 树的满支持率也必须加粗入枝");
    assert.ok(dating.fullBranches.every(width => width === 3));
    assert.equal(dating.fullSupportMarkers, 0, "Dating 树不应再为满支持率画黑点");
    assert.ok(dating.ageMarkers > 0, "Dating 树与节点年龄文字配对的时间标记应继续保留");

    console.log(JSON.stringify({ ...result, svg: undefined, exported, legacy, conflict, dating }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
