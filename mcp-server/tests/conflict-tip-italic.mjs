import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

const treeFile = (name, content) => ({ name, mimeType: "text/plain", buffer: Buffer.from(content) });
const nuclear = "((Oreithales_integrifolia_2024:1,Clematis_cf._montana_sampleA:1)95:1,Ranunculaceae:1);";
const plastid = "((Ranunculaceae:1,Oreithales_integrifolia_2024:1)90:1,Clematis_cf._montana_sampleA:1);";

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage();
  try {
    await page.goto(runtime.demoPageUrl);
    await page.locator('[data-workspace-mode="conflict"]').click();
    await page.locator("#conflict-nuclear-file").setInputFiles(treeFile("nuclear.tre", nuclear));
    await page.waitForFunction(() => document.querySelector("#conflict-nuclear-name")?.textContent === "nuclear.tre");
    await page.locator("#tree-loading").waitFor({ state: "hidden" });
    await page.locator("#conflict-plastid-file").setInputFiles(treeFile("plastid.tre", plastid));
    try {
      await page.waitForFunction(() => document.querySelectorAll("#tree-svg .conflict-tip-label").length === 6);
    } catch (error) {
      console.error(await page.evaluate(() => ({
        labels: document.querySelectorAll("#tree-svg .conflict-tip-label").length,
        message: document.querySelector("#message")?.textContent,
        overlay: document.querySelector("#tree-loading")?.textContent,
        nuclear: document.querySelector("#conflict-nuclear-name")?.textContent,
        plastid: document.querySelector("#conflict-plastid-name")?.textContent,
      })));
      throw error;
    }
    const labels = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.querySelectorAll("#tree-svg .conflict-tip-label")].map(label => {
        const bbox = label.getBBox();
        const connectorX = Number(label.dataset.connectorX);
        return {
          text: label.textContent,
          italic: [...label.querySelectorAll(".scientific-name-part")].map(run => run.textContent),
          italicStyles: [...label.querySelectorAll(".scientific-name-part")].map(run => getComputedStyle(run).fontStyle),
          normalStyles: [...label.querySelectorAll("tspan:not(.scientific-name-part)")].map(run => getComputedStyle(run).fontStyle),
          family: getComputedStyle(label).fontFamily,
          gap: connectorX < bbox.x ? bbox.x - connectorX : connectorX - bbox.x - bbox.width,
          engine: label.dataset.nameEngine,
        };
      });
    });
    const font = await page.evaluate(async () => ({
      arial: await systemFontAvailabilityCache.get('Arial'),
      fallback: systemArialFallback,
    }));
    assert.equal(typeof font.arial, 'boolean');
    assert.equal(font.fallback, !font.arial);
    assert.equal(labels.length, 6);
    for (const label of labels) {
      const firstFamily = label.family.split(',')[0].trim().replaceAll('"', '').replaceAll("'", '');
      assert.equal(firstFamily, font.arial ? 'Arial' : 'PhyloRender Arimo');
      assert.ok(label.gap >= 0 && label.gap <= 5, `connector should touch ${label.text}: ${label.gap}`);
    }
    for (const label of labels.filter(item => item.text === "Oreithales integrifolia 2024")) {
      assert.deepEqual(label.italic, ["Oreithales", "integrifolia"]);
      assert.ok(label.italicStyles.every(style => style === "italic"));
      assert.ok(label.normalStyles.every(style => style === "normal"));
    }
    for (const label of labels.filter(item => item.text === "Ranunculaceae")) {
      assert.deepEqual(label.italic, []);
    }
    assert.equal(labels.filter(item => item.text === "Oreithales integrifolia 2024").length, 2);
    if (process.argv[2] && process.argv[3]) {
      await page.reload();
      await page.locator('[data-workspace-mode="conflict"]').click();
      await page.locator("#conflict-nuclear-file").setInputFiles(process.argv[2]);
      await page.waitForFunction(name => document.querySelector("#conflict-nuclear-name")?.textContent === name,
        new URL(`file://${process.argv[2]}`).pathname.split("/").at(-1), { timeout: 120000 });
      await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 120000 });
      await page.locator("#conflict-plastid-file").setInputFiles(process.argv[3]);
      await page.waitForFunction(() => document.querySelectorAll("#tree-svg .conflict-tip-label").length === 226,
        null, { timeout: 120000 });
      await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 120000 });
      const actual = await page.evaluate(() => {
        const labels = [...document.querySelectorAll("#tree-svg .conflict-tip-label")];
        return {
          count: labels.length,
          italicized: labels.filter(label => label.querySelector(".scientific-name-part")).length,
          sample: labels.filter(label => label.textContent.startsWith("Clematis acerifolia")).map(label => ({
            text: label.textContent,
            italic: [...label.querySelectorAll(".scientific-name-part")].map(run => run.textContent),
          })),
          farConnectors: labels.filter(label => {
            const bbox = label.getBBox();
            const connectorX = Number(label.dataset.connectorX);
            const gap = connectorX < bbox.x ? bbox.x - connectorX : connectorX - bbox.x - bbox.width;
            return gap < 0 || gap > 5;
          }).length,
          connectors: document.querySelectorAll("#tree-svg .conflict-connector").length,
          supports: document.querySelectorAll("#tree-svg .conflict-support-label").length,
        };
      });
      assert.equal(actual.count, 226);
      assert.equal(actual.sample.length, 2);
      assert.ok(actual.sample.every(label => label.italic.join("|") === "Clematis|acerifolia"));
      assert.ok(actual.italicized >= 200);
      assert.equal(actual.farConnectors, 0);
      assert.equal(actual.connectors, 113);
      if (process.argv[4]) await page.screenshot({ path: process.argv[4], fullPage: false });
      console.log(JSON.stringify({ actualTree: actual }));
    }
    console.log(JSON.stringify({ passed: true, labels }));
  } finally {
    await page.close();
  }
} finally {
  await runtime.close();
}
