const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const screenshotPath = process.env.PHYLORENDER_OUTPUT_SCREENSHOT;

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function canvasMetrics(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("#tree-svg");
    const horizontalCoordinates = [...svg.querySelectorAll(".branch")]
      .flatMap(line => [Number(line.getAttribute("x1")), Number(line.getAttribute("x2"))])
      .filter(Number.isFinite);
    const status = document.querySelector("#output-layout-status");
    return {
      width: Number(svg.getAttribute("width")),
      height: Number(svg.getAttribute("height")),
      branchSpan: horizontalCoordinates.length
        ? Math.max(...horizontalCoordinates) - Math.min(...horizontalCoordinates)
        : 0,
      pngWidth: Number(status.dataset.pngWidth),
      pngHeight: Number(status.dataset.pngHeight),
      pngScale: Number(status.dataset.pngScale),
      status: status.textContent,
    };
  });
}

function pngDimensions(buffer) {
  assert.deepEqual([...buffer.subarray(1, 4)], [80, 78, 71], "导出文件必须是 PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, acceptDownloads: true });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length > 100);
    await page.locator('.settings-nav [data-settings-target="tree"]').click();
    assert.equal(await page.locator("#output-aspect-ratio").inputValue(), "auto");

    const automatic = await canvasMetrics(page);
    assert.ok(automatic.height > 3300, "默认真实树必须覆盖长树自动比例场景");

    await page.locator("#output-aspect-ratio").selectOption("content");
    const compact = await canvasMetrics(page);
    assert.equal(compact.height, automatic.height, "只改变输出比例时不得改变纵向样品间距");
    assert.ok(automatic.width > compact.width * 1.5, "自动协调必须显著拓宽长树画布");
    assert.ok(automatic.branchSpan > compact.branchSpan * 1.5, "新增宽度必须用于树枝和节点坐标，而不是空白边距");

    await page.locator("#output-aspect-ratio").selectOption("16:9");
    const widescreen = await canvasMetrics(page);
    assert.ok(widescreen.width / widescreen.height >= 16 / 9 - 0.002, "16:9 必须作为最小输出画面比例");
    assert.ok(widescreen.branchSpan > automatic.branchSpan, "更宽的指定比例必须继续延展树形本身");

    await page.locator("#output-aspect-ratio").selectOption("custom");
    assert.equal(await page.locator("#custom-aspect-card").isVisible(), true);
    await setRange(page, "#custom-aspect-ratio", 0.75);
    const custom = await canvasMetrics(page);
    assert.ok(custom.width / custom.height >= 0.75 - 0.002, "自定义宽高比必须生效");

    const timeTree = `(${Array.from({ length: 80 }, (_, index) => `T${index + 1}:10`).join(",")});`;
    await page.locator("#tree-file").setInputFiles({
      name: "tall-ultrametric.anything",
      mimeType: "text/plain",
      buffer: Buffer.from(timeTree),
    });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-tip-label").length === 80);
    await page.locator("#output-aspect-ratio").selectOption("content");
    const compactTimeAxis = await page.locator("#tree-svg .time-axis-line").first().evaluate(line =>
      Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")));
    await page.locator("#output-aspect-ratio").selectOption("auto");
    const automaticTimeAxis = await page.locator("#tree-svg .time-axis-line").first().evaluate(line =>
      Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")));
    assert.ok(automaticTimeAxis > compactTimeAxis * 1.08, "时间树的自动加宽必须同步延展时间轴和节点坐标");

    await page.locator("#tree-file").setInputFiles({
      name: "small-tree.tre",
      mimeType: "text/plain",
      buffer: Buffer.from("((A:1,B:1)0.9:1,(C:1,D:1)0.8:1.2);")
    });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length === 4);
    await page.locator("#output-aspect-ratio").selectOption("content");
    const svgBeforePngScaleChange = await page.locator("#tree-svg").evaluate(svg => svg.outerHTML);
    await setRange(page, "#png-resolution-scale", 3);
    const beforeExport = await canvasMetrics(page);
    const svgAfterPngScaleChange = await page.locator("#tree-svg").evaluate(svg => svg.outerHTML);
    assert.equal(
      svgAfterPngScaleChange,
      svgBeforePngScaleChange,
      "只改变 PNG 清晰度时不得重绘或改变 SVG 中的树形、文字、线宽、间距和位置",
    );
    assert.equal(beforeExport.pngScale, 3, "安全尺寸图像必须使用用户请求的 3× PNG 倍率");
    await page.locator('[data-settings-target="export"]').click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-png").click();
    const download = await downloadPromise;
    const png = await readFile(await download.path());
    const exported = pngDimensions(png);
    assert.equal(exported.width, beforeExport.pngWidth, "PNG 像素宽度必须与界面预告一致");
    assert.equal(exported.height, beforeExport.pngHeight, "PNG 像素高度必须与界面预告一致");

    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({
      phylogeny: { automatic, compact, widescreen, custom },
      timeAxis: { compact: compactTimeAxis, automatic: automaticTimeAxis },
      png: exported,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
