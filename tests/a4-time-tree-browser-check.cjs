const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

function balancedTree(labels) {
  if (labels.length === 1) return labels[0];
  const middle = labels.length / 2;
  return `(${balancedTree(labels.slice(0, middle))}:1,${balancedTree(labels.slice(middle))}:1)0.95`;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.locator('[data-workspace-mode="time"]').click();
    await page.waitForFunction(() => document.body.classList.contains("time-tree-mode"));
    const tree = `${balancedTree(Array.from({ length: 128 }, (_, index) => `Time_sample_${index + 1}`))};`;
    await page.locator("#tree-file").setInputFiles({
      name: "balanced-128-ultrametric.tre",
      mimeType: "text/plain",
      buffer: Buffer.from(tree),
    });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-tip-label").length === 128);
    await page.waitForFunction(() => !activeTreeLoad, null, { timeout: 120000 });
    const result = await page.evaluate(async () => {
      const figure = await window.PhyloRenderAgent.currentFigure();
      return {
        report: figure.report.two_panel,
        widths: figure.panel_trees.map(item => item.width),
        maxima: figure.panel_trees.map(item => {
          const labels = [...item.svg.matchAll(/class="time-axis-label"[^>]*>([^<]+)<\/text>/g)]
            .map(match => Number(match[1]))
            .filter(Number.isFinite);
          return Math.max(...labels);
        }),
      };
    });
    console.log(JSON.stringify(result, null, 2));
    assert.equal(result.report.panels, 2, "128 末端时间树应只拆成上下两张图");
    assert.equal(result.report.second_panel_is_complete_monophyletic_clade, true);
    assert.equal(result.report.configured_font_sizes_preserved, true);
    assert.equal(result.report.uniform_panel_width, true);
    assert.equal(result.report.automatic_compact_tip_spacing, true);
    assert.equal(new Set(result.widths).size, 1, "两张时间树必须使用完全相同的画布宽度");
    assert.equal(new Set(result.maxima).size, 1, "第二张图必须保留完整时间树的同一年代轴");
    assert.ok(result.maxima[0] >= 7, "两张图的时间轴不得小于原树根年龄");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
