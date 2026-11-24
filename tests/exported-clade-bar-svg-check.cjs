const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { chromium } = require("playwright");

if (process.argv.length < 3) {
  throw new Error("Usage: node tests/exported-clade-bar-svg-check.cjs <figure.svg> [...]");
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const results = [];
  try {
    for (const file of process.argv.slice(2)) {
      const svg = await readFile(file, "utf8");
      assert.match(svg, /data:font\/woff2;base64,/, `${file}: embedded fonts are required`);
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body>${svg}</body></html>`, { waitUntil: "load" });
      await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
      const gaps = await page.evaluate(() => [...document.querySelectorAll('.clade-bar[data-bar-part="body"]')].map(bar => {
        const tipIds = (bar.dataset.tipNodeIds || "").split(",").filter(Boolean);
        const tipRights = tipIds.map(id => {
          const label = document.querySelector(`.tip-label[data-tip-node-id="${CSS.escape(id)}"]`);
          const box = label.getBBox();
          return box.x + box.width;
        });
        const actual = Number(bar.getAttribute("x1")) - Math.max(...tipRights);
        const expected = 14 + Number(bar.dataset.layoutShift || 0);
        return { actual, expected, error: actual - expected };
      }));
      await page.close();
      assert.ok(gaps.length > 0, `${file}: expected at least one clade bar`);
      gaps.forEach(gap => {
        assert.ok(gap.actual >= 12, `${file}: clade bar overlaps a tip label`);
        assert.ok(Math.abs(gap.error) <= 1, `${file}: exported font metrics changed the clade-bar gap`);
      });
      results.push({ file, gaps });
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
