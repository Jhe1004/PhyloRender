const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .support-label").length > 0);
    await page.locator('.settings-nav [data-settings-target="labels"]').click();

    assert.equal(await page.locator("#support-decimals").inputValue(), "1");
    assert.equal(await page.locator("#support-decimals-auto").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#support-decimals-range").inputValue(), "1");
    assert.equal(await page.locator("#support-decimals-value").textContent(), "1 位");
    assert.equal(await page.locator("#support-decimals-number").inputValue(), "1");
    assert.equal(await page.locator("#support-decimals-stepper").getAttribute("data-active"), "true");
    const defaultPrecisionReport = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("#tree-svg .support-label")].map(node => node.textContent.trim());
      return {
        labels,
        longDecimalLabels: labels.filter(text => /\d+\.\d{2,}/.test(text)),
        oneDecimalLabels: labels.filter(text => /\d+\.\d(?!\d)/.test(text)),
      };
    });
    assert.equal(defaultPrecisionReport.longDecimalLabels.length, 0, "默认支持率不得显示两位或更多小数");
    assert.ok(defaultPrecisionReport.oneDecimalLabels.length > 0, "默认应至少保留一位小数标签供验证");

    await page.locator("#support-decimals-number").fill("2");
    await page.waitForFunction(() => document.querySelector("#support-decimals")?.value === "2");
    assert.equal(await page.locator("#support-decimals-auto").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#support-decimals-range").inputValue(), "2");
    assert.equal(await page.locator("#support-decimals-value").textContent(), "2 位");
    assert.equal(await page.locator("#support-decimals-number").inputValue(), "2");
    assert.ok(
      await page.locator("#tree-svg .support-label").filter({ hasText: /\d+\.\d{2}(?!\d)/ }).count() > 0,
      "启用两位小数后，支持率标签必须统一舍入为两位",
    );

    await page.locator("#support-decimals-auto").click();
    assert.equal(await page.locator("#support-decimals").inputValue(), "auto");
    assert.equal(await page.locator("#support-decimals-value").textContent(), "原值");
    assert.equal(await page.locator("#support-decimals-number").inputValue(), "");
    assert.ok(
      await page.locator("#tree-svg .support-label").filter({ hasText: /\d+\.\d{2,}/ }).count() > 0,
      "恢复保持原值后，原始多位小数标签应重新显示",
    );

    await page.locator("#support-decimals-number").focus();
    await page.waitForFunction(() => document.querySelector("#support-decimals")?.value === "2");
    assert.equal(await page.locator("#support-decimals-range").inputValue(), "2");
    assert.equal(await page.locator("#support-decimals-number").inputValue(), "2");

    console.log(JSON.stringify({
      defaultDigits: 1,
      activatedDigits: 2,
      restoredOriginalPrecision: true,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
