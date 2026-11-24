const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.PhyloRenderAgent?.version === "1.7.0");
    const openedNodeId = await page.evaluate(() => {
      const target = [...document.querySelectorAll("#tree-svg .clade-node-hit")]
        .find(element => element.dataset.cladeNodeId);
      if (!target) throw new Error("No internal clade node is available for the dialog test.");
      openCladeNameDialog(target.dataset.cladeNodeId);
      return target.dataset.cladeNodeId;
    });
    assert.ok(openedNodeId, "a real internal branch must back the editor test");
    await page.locator("#clade-name-dialog").waitFor({ state: "visible" });
    await page.locator("#clade-name-input").fill("Clematis sect. Atragene");
    await page.locator(".clade-segment-editor summary").click();
    await page.locator("#clade-segment-split").click();
    const rows = page.locator("#clade-segment-list .clade-segment-row");
    assert.equal(await rows.count(), 3, "word splitting must create three editable segments");

    await rows.nth(0).locator("select").nth(0).selectOption({ label: "Libre Baskerville（Georgia 风格）" });
    await rows.nth(0).locator("select").nth(2).selectOption("italic");
    await rows.nth(1).locator("select").nth(0).selectOption({ label: "Arimo（Arial 兼容）" });
    await rows.nth(1).locator("select").nth(2).selectOption("normal");
    await rows.nth(1).locator('input[type="color"]').evaluate(element => {
      element.value = "#6f4e9c";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await rows.nth(2).locator("select").nth(0).selectOption({ label: "Source Serif 4（Times 风格）" });
    await rows.nth(2).locator('input[type="number"]').fill("16");
    await rows.nth(2).locator("select").nth(2).selectOption("italic");

    const preview = page.locator("#clade-segment-preview");
    assert.equal(await preview.textContent(), "Clematis sect. Atragene");
    assert.equal(await preview.locator("span").count(), 3);
    if (process.env.PHYLORENDER_RICH_TEXT_SCREENSHOT) {
      await page.locator("#clade-name-dialog").screenshot({
        path: process.env.PHYLORENDER_RICH_TEXT_SCREENSHOT,
      });
    }
    await page.locator("#save-clade-name").click();
    await page.locator("#clade-name-dialog").waitFor({ state: "hidden" });

    const label = page.locator("#tree-svg .clade-bar-label").filter({ hasText: "Clematis sect. Atragene" });
    assert.equal(await label.count(), 1, "the edited bar label must be rendered once");
    assert.equal(await label.getAttribute("data-segment-count"), "3");
    const tspans = label.locator("tspan");
    assert.deepEqual(await tspans.allTextContents(), ["Clematis ", "sect. ", "Atragene"]);
    assert.equal(await tspans.nth(0).getAttribute("font-style"), "italic");
    assert.equal(await tspans.nth(1).getAttribute("font-style"), "normal");
    assert.equal(await tspans.nth(1).getAttribute("fill"), "#6f4e9c");
    assert.equal(await tspans.nth(2).getAttribute("font-size"), "16");

    await page.evaluate(nodeId => openCladeNameDialog(nodeId), openedNodeId);
    await page.locator("#clade-name-dialog").waitFor({ state: "visible" });
    assert.equal(await rows.count(), 3, "reopening the bar must preserve all rich-text segments");
    assert.equal(await rows.nth(1).locator("select").nth(2).inputValue(), "normal");
    assert.equal(await rows.nth(2).locator('input[type="number"]').inputValue(), "16");

    console.log(JSON.stringify({
      bridgeVersion: await page.evaluate(() => window.PhyloRenderAgent.version),
      segments: 3,
      mixedFamilies: true,
      mixedSize: true,
      mixedColor: true,
      mixedItalic: true,
      reopenPersistence: true,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
