const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const screenshotPath = process.env.PHYLORENDER_SHAPE_SCREENSHOT;

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  page.on("pageerror", error => console.error("页面错误：", error));
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length > 100);
    await page.locator('.settings-nav [data-settings-target="tree"]').click();

    const originalSupportCount = await page.locator("#support-count").textContent();
    await setRange(page, "#branch-width", 2.4);
    assert.equal(await page.locator("#branch-width-value").textContent(), "2.4 px");
    const phylogenyStroke = await page.locator("#tree-svg .branch").first().evaluate(element => getComputedStyle(element).strokeWidth);
    assert.equal(phylogenyStroke, "2.4px", "系统发育树枝条粗细必须实时应用");
    let exportedSvg = await page.evaluate(() => serializedSvg());
    assert.match(exportedSvg, /--branch-width:\s*2\.4px/i, "SVG 导出必须保留系统发育树枝条粗细");

    const tipOrder = selector => page.locator(selector).allTextContents().then(names => names.map(name => name.trim()));
    await page.locator("#ladder-direction").selectOption("small-top");
    const smallTopOrder = await tipOrder("#tree-svg .tip-label");
    await page.locator("#ladder-direction").selectOption("large-top");
    const largeTopOrder = await tipOrder("#tree-svg .tip-label");
    assert.notDeepEqual(largeTopOrder, smallTopOrder, "两种阶梯化方向必须产生相反的末端显示顺序");
    assert.deepEqual([...largeTopOrder].sort(), [...smallTopOrder].sort(), "阶梯化不得增加、删除或替换末端");
    const supportCountAfterLadderize = await page.locator("#support-count").textContent();
    assert.equal(supportCountAfterLadderize, originalSupportCount, "阶梯化不得改变节点标注数量");
    assert.equal(await page.locator("#tree-svg .branch").first().evaluate(element => getComputedStyle(element).strokeWidth), "2.4px", "阶梯化不得重置枝条粗细");
    if (screenshotPath) await page.screenshot({ path: screenshotPath });

    await page.locator("#tree-file").setInputFiles({
      name: "automatic-time-tree.any",
      mimeType: "text/plain",
      buffer: Buffer.from("(((A:4,B:4):1,C:5):5,((D:3,E:3):2,F:5):5);")
    });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-tip-label").length === 6);
    await page.locator('.settings-nav [data-settings-target="tree"]').click();
    await setRange(page, "#branch-width", 3.1);
    assert.equal(await page.locator("#branch-width-value").textContent(), "3.1 px");
    const timeStroke = await page.locator("#tree-svg .time-branch").first().evaluate(element => getComputedStyle(element).strokeWidth);
    assert.equal(timeStroke, "3.1px", "时间树必须复用同一个枝条粗细设置");
    await page.locator("#ladder-direction").selectOption("small-top");
    const timeSmallTopOrder = await tipOrder("#tree-svg .time-tip-label");
    await page.locator("#ladder-direction").selectOption("large-top");
    const timeLargeTopOrder = await tipOrder("#tree-svg .time-tip-label");
    assert.notDeepEqual(timeLargeTopOrder, timeSmallTopOrder, "时间树也必须支持双向阶梯化");
    assert.deepEqual([...timeLargeTopOrder].sort(), [...timeSmallTopOrder].sort(), "时间树阶梯化不得改变末端成员");
    assert.equal(await page.locator("#support-count").textContent(), "5", "时间树阶梯化不得改变节点时间数量");
    assert.equal(await page.locator("#collision-count").textContent(), "0", "时间树阶梯化后仍不得产生标签冲突");
    exportedSvg = await page.evaluate(() => serializedSvg());
    assert.match(exportedSvg, /--branch-width:\s*3\.1px/i, "SVG 导出必须保留共享的时间树枝条粗细");

    await page.locator('.settings-nav [data-settings-target="groups"]').click();
    await page.locator("#toggle-clade-select").click();
    // Dispatch directly on the SVG hit target. A forced coordinate click can land on
    // an overlapping branch hit area after dense label/leader layout changes.
    await page.locator("#tree-svg .clade-node-hit").first().dispatchEvent("click");
    await page.locator("#clade-name-input").fill("Time clade");
    await page.locator("#save-clade-name").click();
    assert.equal(await page.locator("#tree-svg .clade-bar-label").filter({ hasText: "Time clade" }).count(), 1, "时间树必须复用分组条和分组名称");
    assert.ok(await page.locator("#tree-svg .time-branch[style*='stroke']").count() > 0, "时间树必须复用分支着色");
    await page.locator("#tree-svg .clade-hit").first().click({ button: "right", force: true });
    assert.equal(await page.locator("#branch-context-menu").isVisible(), true, "时间树分支应保留右键放大入口");
    assert.equal(await page.locator("#branch-context-reroot").isVisible(), false, "时间树不得显示重新定根入口");

    console.log(JSON.stringify({
      phylogenyBranchWidth: phylogenyStroke,
      timeBranchWidth: timeStroke,
      phylogenySmallTopFirst: smallTopOrder[0],
      phylogenyLargeTopFirst: largeTopOrder[0],
      timeSmallTopFirst: timeSmallTopOrder[0],
      timeLargeTopFirst: timeLargeTopOrder[0],
      timeGroupingShared: true,
      supportCountBefore: originalSupportCount,
      supportCountAfterLadderize
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
