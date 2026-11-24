"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

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
    const mainTree = "(Delphinium_elatum_var.sericeum:1,Delphinium_pylzowii_var.trigynum:1,(Aconitum_jaluense_subsp.jaluense:1,Aconitum_japonicum_subsp.napiforme:1):1);";
    await page.locator("#tree-file").setInputFiles(treeFile("taxon-rank-spacing-check.tre", mainTree));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length === 4);

    const result = await page.evaluate(() => [...document.querySelectorAll("#tree-svg .tip-label")].map(label => ({
      original: label.getAttribute("data-original-tip-label"),
      display: label.getAttribute("data-display-tip-label"),
      rendered: label.textContent,
      normalized: Number(label.getAttribute("data-rank-change-count")) > 0,
      italic: label.getAttribute("data-italic-segments"),
    })));

    const expected = new Map([
      ["Delphinium_elatum_var.sericeum", "Delphinium elatum var. sericeum"],
      ["Delphinium_pylzowii_var.trigynum", "Delphinium pylzowii var. trigynum"],
      ["Aconitum_jaluense_subsp.jaluense", "Aconitum jaluense subsp. jaluense"],
      ["Aconitum_japonicum_subsp.napiforme", "Aconitum japonicum subsp. napiforme"],
    ]);
    assert.equal(result.length, expected.size);
    result.forEach(label => {
      assert.equal(label.display, expected.get(label.original), label.original);
      assert.equal(label.rendered, expected.get(label.original), `${label.original} SVG text`);
      assert.equal(label.normalized, true, `${label.original} should report display normalization`);
      assert.ok(!label.italic.includes("var."), `${label.original} var. should remain roman`);
      assert.ok(!label.italic.includes("subsp."), `${label.original} subsp. should remain roman`);
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
