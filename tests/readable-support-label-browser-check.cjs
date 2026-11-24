const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const screenshotPath = process.env.PHYLORENDER_READABLE_SUPPORT_SCREENSHOT;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length > 100);
    await page.locator('.settings-nav [data-settings-target="labels"]').click();
    await page.locator("#full-support-style").selectOption("number");
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .support-label").length > 150);

    const result = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("#tree-svg .support-label")];
      const target = labels.find(label => label.textContent === "1.0/83.0")
        || labels.find(label => label.textContent.includes("83.0"));
      const leaders = [...document.querySelectorAll("#tree-svg .support-leader")];
      const targetLeader = target && leaders.find(leader =>
        leader.getAttribute("data-leader-id") === target.getAttribute("data-label-id"));
      return {
        minimumControl: Number(document.querySelector("#support-min-size").value),
        minimumRendered: Math.min(...labels.map(label => Number(label.getAttribute("font-size")))),
        target: target ? {
          text: target.textContent,
          font: Number(target.getAttribute("font-size")),
          ownershipClear: target.getAttribute("data-node-ownership-clear"),
          ownershipMethod: target.dataset.nodeOwnershipMethod,
          edgeDistance: Number(target.getAttribute("data-edge-distance")),
        } : null,
        leader: targetLeader ? {
          width: Number.parseFloat(getComputedStyle(targetLeader).strokeWidth),
          opacity: Number.parseFloat(getComputedStyle(targetLeader).strokeOpacity),
          dasharray: getComputedStyle(targetLeader).strokeDasharray,
          straight: targetLeader.getAttribute("data-straight-leader"),
        } : null,
      };
    });

    assert.ok(result.target, "默认主树必须包含可检查的 1.0/83.0 节点标注");
    assert.ok(result.minimumControl >= 9, "界面不得允许低于 9 px 的节点最小字号");
    assert.ok(result.minimumRendered >= result.minimumControl, "实际渲染不得突破用户设置的最小字号");
    assert.ok(result.target.font >= result.minimumControl, "1.0/83.0 节点必须保持可读字号");
    assert.equal(result.target.ownershipMethod, "true-node-arrow", "1.0/83.0 通过真实节点箭头明确归属，不以最近节点作为硬限制");
    assert.ok(result.leader, "放宽最近节点限制时必须保留可见箭头");
    if (result.leader) {
      assert.ok(result.leader.width >= 1.1, "节点引导线必须清楚可见");
      assert.ok(result.leader.opacity >= .85, "节点引导线不得过淡");
      assert.match(result.leader.dasharray, /4px.*2.5px/, "节点引导线默认使用清楚的短虚线");
      assert.equal(result.leader.straight, "true", "节点引导线必须保持直线");
    }

    if (screenshotPath) {
      const target = page.locator("#tree-svg .support-label").filter({ hasText: /83\.0/ }).first();
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      await page.screenshot({
        path: screenshotPath,
        clip: {
          x: Math.max(0, box.x - 230),
          y: Math.max(0, box.y - 190),
          width: Math.min(680, 1800 - Math.max(0, box.x - 230)),
          height: Math.min(440, 1200 - Math.max(0, box.y - 190)),
        },
      });
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
