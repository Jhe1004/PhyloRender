const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

function treeFile(name, text) {
  return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#support-threshold").inputValue(), "50");
    assert.equal(await page.locator("#support-threshold-number").inputValue(), "50");
    assert.equal(await page.locator("#support-threshold-value").textContent(), "50");
    assert.ok(await page.locator("#support-threshold-card.active").count(), "低支持率替换应默认启用为 50");

    const mainTree = "(((A:1,B:1)0.5:1,C:1)0.9:1,(D:1,E:1)0.95:1);";
    const supportTree = "(((A:1,B:1)78:1,C:1)90:1,(D:1,E:1)95:1);";
    await page.locator("#tree-file").setInputFiles(treeFile("per-source-threshold-main.tre", mainTree));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length === 5);
    await page.locator("#support-data-files").setInputFiles(treeFile("per-source-threshold-support.tre", supportTree));
    await page.waitForFunction(() => document.querySelectorAll("#support-data-list .node-data-item").length === 1);

    await page.locator('.settings-nav [data-settings-target="labels"]').click();
    await page.locator("#support-decimals-number").focus();
    await page.locator("#support-decimals-number").fill("1");
    await page.locator("#support-threshold-number").fill("51");
    await page.waitForFunction(() => [...document.querySelectorAll("#tree-svg .support-label")]
      .some(label => label.textContent.trim() === "–/78.0"));

    const labels = await page.locator("#tree-svg .support-label").allTextContents();
    assert.ok(labels.includes("–/78.0"), "低支持率替换必须逐个来源处理，而不是替换整个组合标注");
    assert.ok(!labels.includes("—"), "存在高支持率来源时，组合标注不得坍缩成一条横线");

    console.log(JSON.stringify({
      defaultThreshold: 50,
      threshold: 51,
      decimals: 1,
      expected: "–/78.0",
      labels,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
