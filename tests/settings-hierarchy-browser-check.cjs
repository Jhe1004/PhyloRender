const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

async function visibleTopGroups(page) {
  return page.locator(".controls > [data-settings-page]").evaluateAll(elements => elements
    .filter(element => getComputedStyle(element).display !== "none")
    .map(element => element.querySelector("summary strong")?.textContent || element.dataset.settingsPage));
}

async function openPage(page, name) {
  await page.locator(`.settings-nav [data-settings-target="${name}"]`).click();
  assert.equal(await page.locator(".controls").getAttribute("data-active-page"), name);
  assert.equal(await page.locator(`.settings-nav [data-settings-target="${name}"]`).getAttribute("aria-pressed"), "true");
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length > 100);
    assert.equal(await page.locator(".workspace-mode-switch").count(), 0, "页面不应再有系统发育树/时间树切换窗口");

    assert.equal(await page.locator(".settings-nav [data-settings-target]").count(), 5, "系统发育树应有五个顶层设置类别");
    assert.deepEqual(await visibleTopGroups(page), ["主树", "补充节点数据", "修改样品名称", "恢复文字样式"]);
    assert.equal(await page.locator("#settings-page-title").textContent(), "树与节点数据");

    await openPage(page, "tree");
    assert.deepEqual(await visibleTopGroups(page), ["树形与分支", "样品名称", "比例尺数字"]);
    assert.equal(await page.locator("#layout-mode").isVisible(), true);
    assert.equal(await page.locator("#node-data-section").isVisible(), false);

    await openPage(page, "labels");
    assert.deepEqual(await visibleTopGroups(page), ["自动排版", "支持率显示", "节点标注"]);
    assert.equal(await page.locator("#auto-labels").isVisible(), true);
    assert.equal(await page.locator("#support-decimals-control").isVisible(), true);

    assert.equal(await page.locator("#support-font-family").isVisible(), true);
    await openPage(page, "tree");
    assert.equal(await page.locator('.settings-nav [data-settings-target="style"]').count(), 0);
    assert.equal(await page.locator("#tip-font-family").isVisible(), true);
    assert.equal(await page.locator("#support-font-family").isVisible(), false, "关闭的二级字体面板不应继续占用空间");

    await openPage(page, "groups");
    assert.deepEqual(await visibleTopGroups(page), ["大分支着色与命名", "分组名称"]);
    assert.equal(await page.locator("#toggle-clade-select").isVisible(), true);

    await page.locator("#tree-file").setInputFiles({
      name: "auto-ultrametric.anything",
      mimeType: "text/plain",
      buffer: Buffer.from("((A:4,B:4):1,C:5);")
    });
    await page.waitForFunction(() => document.body.classList.contains("time-tree-mode"));
    assert.equal(await page.locator('.settings-nav [data-settings-target="groups"]').isVisible(), true, "自动识别的时间树仍应使用共享分组功能");
    assert.equal(await page.locator(".controls").getAttribute("data-active-page"), "groups");
    assert.deepEqual(await visibleTopGroups(page), ["大分支着色与命名", "分组名称"]);

    await openPage(page, "tree");
    assert.deepEqual(await visibleTopGroups(page), ["树形与分支", "时间轴与区间", "样品名称", "比例尺数字"]);
    assert.equal(await page.locator("#branch-width").isVisible(), true, "时间树必须复用共享枝条粗细控件");
    assert.equal(await page.locator("#tip-spacing").isVisible(), true, "时间树必须复用共享末端间距控件");
    assert.equal(await page.locator("#time-age-decimals-slider").isVisible(), true);
    assert.equal(await page.locator("#layout-mode").isDisabled(), true, "超度量树的时间坐标应自动锁定");

    await page.locator("#tree-file").setInputFiles({
      name: "ordinary-tree.custom",
      mimeType: "text/plain",
      buffer: Buffer.from("((A:1,B:2):1,C:4);")
    });
    await page.waitForFunction(() => !document.body.classList.contains("time-tree-mode"));
    assert.equal(await page.locator(".controls").getAttribute("data-active-page"), "tree", "自动切换树类型时应留在同一设置页");
    assert.equal(await page.locator("#layout-mode").isDisabled(), false);
    await openPage(page, "groups");
    assert.equal(await page.locator("#toggle-clade-select").isVisible(), true);

    await openPage(page, "tree");
    await page.locator(".controls").evaluate(element => { element.scrollTop = 500; });
    const stickyTop = await page.locator(".settings-nav-shell").evaluate(element => element.getBoundingClientRect().top);
    assert.ok(Math.abs(stickyTop - 76) < 1, "滚动详细设置时顶层导航必须保持可见");

    await page.setViewportSize({ width: 800, height: 900 });
    const responsive = await page.locator(".controls").evaluate(element => {
      const nav = element.querySelector(".settings-nav");
      const firstButton = nav.querySelector("button");
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        navWidth: nav.getBoundingClientRect().width,
        firstButtonWidth: firstButton.getBoundingClientRect().width,
      };
    });
    assert.equal(responsive.scrollWidth, responsive.clientWidth, "窄窗口下设置栏不得产生横向溢出");
    assert.ok(responsive.firstButtonWidth >= 44, "窄窗口下顶层类别仍须保留可点击宽度");

    const duplicateIds = await page.evaluate(() => {
      const counts = new Map();
      document.querySelectorAll("[id]").forEach(element => counts.set(element.id, (counts.get(element.id) || 0) + 1));
      return [...counts.entries()].filter(([, count]) => count > 1);
    });
    assert.deepEqual(duplicateIds, [], "重构后不得产生重复控件 ID");

    console.log(JSON.stringify({
      phylogenyPages: 5,
      timePages: 5,
      dataGroups: ["主树", "补充节点数据", "修改样品名称", "恢复文字样式"],
      labelGroups: ["自动排版", "支持率显示", "节点标注"],
      timeTreeGroups: ["树形与分支", "时间轴与区间", "样品名称", "比例尺数字"],
      stickyTop,
      responsive,
      duplicateIds,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
