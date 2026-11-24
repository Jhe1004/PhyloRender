import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

const treeFile = (name, content) => ({ name, mimeType: "text/plain", buffer: Buffer.from(content) });
const names = [
  "Clematis_a", "Clematis_b", "Clematis_delavayi_var._spinescens_long_name",
  "Clematis_d", "Clematis_e", "Clematis_f", "Clematis_g", "Clematis_h",
];
const [a, b, c, d, e, f, g, h] = names;
const primary = `(((${a}:1,${b}:1):1,(${c}:1,${d}:1):1):1,(((${e}:1,${f}:1):1,${g}:1):1,${h}:1):1);`;
const comparison = `(((${a}:1,${h}:1):1,(${b}:1,${g}:1):1):1,(((${c}:1,${f}:1):1,${d}:1):1,${e}:1):1);`;

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage();
  try {
    await page.goto(runtime.demoPageUrl);
    await page.locator('[data-workspace-mode="conflict"]').click();
    await page.locator("#conflict-nuclear-file").setInputFiles(treeFile("primary.nwk", primary));
    await page.locator("#tree-loading").waitFor({ state: "hidden" });
    await page.locator("#conflict-plastid-file").setInputFiles(treeFile("comparison.nwk", comparison));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .conflict-connector").length === 8);
    await page.locator("#tree-loading").waitFor({ state: "hidden" });

    // Compare design-coordinate gaps at canonical scale. Platform glyph hinting
    // at viewport fit zoom must not be confused with changed SVG geometry.
    const markup = await page.locator('#tree-svg').innerHTML();
    await page.evaluate(() => setZoom(1));
    assert.equal(await page.locator('#tree-svg').innerHTML(), markup);
    const geometry = await page.evaluate(async () => {
      await document.fonts.ready;
      const labels = [...document.querySelectorAll("#tree-svg .conflict-tip-label")];
      const half = labels.length / 2;
      const bounds = labels.map(label => ({
        key: label.dataset.sampleKey,
        text: label.textContent, font: getComputedStyle(label).fontFamily, weight: getComputedStyle(label).fontWeight,
        box: label.getBBox(),
        endpointX: Number(label.dataset.connectorX),
      }));
      const maxLeft = Math.max(...bounds.slice(0, half).map(({ box }) => box.x + box.width));
      const minRight = Math.min(...bounds.slice(half).map(({ box }) => box.x));
      const collisions = [];
      let minEndpointGap = Infinity;
      let maxEndpointGap = -Infinity;
      for (const { box, endpointX } of bounds) {
        const gap = endpointX < box.x ? box.x - endpointX : endpointX - box.x - box.width;
        minEndpointGap = Math.min(minEndpointGap, gap);
        maxEndpointGap = Math.max(maxEndpointGap, gap);
      }
      const paths = [...document.querySelectorAll("#tree-svg .conflict-connector")];
      for (const path of paths) {
        const d = path.getAttribute("d");
        const match = d.match(/^M [\d.]+ [\d.]+ L ([\d.]+) [\d.]+ C [\d.]+ [\d.]+, [\d.]+ [\d.]+, ([\d.]+) [\d.]+ L [\d.]+ [\d.]+$/);
        if (!match) throw new Error(`Expected straight exits and one central curve: ${d}`);
        if (Number(match[1]) < maxLeft + 8 || Number(match[2]) > minRight - 8) {
          throw new Error(`Curve leaves the label-free corridor: ${d}`);
        }
        const length = path.getTotalLength();
        for (let distance = 0; distance <= length; distance += 1) {
          const point = path.getPointAtLength(distance);
          const hit = bounds.find(({ box }) => point.x >= box.x - 1 && point.x <= box.x + box.width + 1
            && point.y >= box.y - 1 && point.y <= box.y + box.height + 1);
          if (hit) {
            collisions.push({ connector: path.dataset.sampleKey, label: hit.key });
            break;
          }
        }
      }
      return { paths: paths.length, labels: labels.length, collisions, minEndpointGap, maxEndpointGap,
        endpoints: bounds.map(({text,font,weight,box,endpointX})=>({text,font,weight,x:box.x,width:box.width,endpointX})) };
    });
    assert.equal(geometry.paths, 8);
    assert.equal(geometry.labels, 16);
    assert.deepEqual(geometry.collisions, []);
    assert.ok(geometry.minEndpointGap >= 2 && geometry.maxEndpointGap <= 5, JSON.stringify(geometry));
    console.log(JSON.stringify(geometry));
  } finally {
    await page.close();
  }
} finally {
  await runtime.close();
}
