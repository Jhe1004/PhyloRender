import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

const treeFile = (name, content) => ({ name, mimeType: "text/plain", buffer: Buffer.from(content) });
const primary = "(((A:1,B:1)95:2,C:3)90:4,D:5);";
const comparison = "(D:5,(C:3,(B:1,A:1)80:2)85:4);";
const runtime = await createRuntime();

try {
  const page = await runtime.renderer.browser.newPage();
  try {
    await page.goto(runtime.demoPageUrl);
    await page.locator('[data-workspace-mode="conflict"]').click();
    assert.equal(await page.locator('[data-workspace-mode="conflict"] span').textContent(), "双树冲突对照");
    assert.equal(await page.locator("#export-a4").isDisabled(), true);
    await page.locator("#conflict-nuclear-file").setInputFiles(treeFile("any-primary.nwk", primary));
    await page.locator("#tree-loading").waitFor({ state: "hidden" });
    await page.locator("#conflict-plastid-file").setInputFiles(treeFile("any-comparison.nwk", comparison));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .conflict-tip-label").length === 8);
    await page.locator("#tree-loading").waitFor({ state: "hidden" });

    const orders = () => page.evaluate(() => {
      const labels = [...document.querySelectorAll("#tree-svg .conflict-tip-label")];
      return {
        left: labels.slice(0, 4).map(item => item.textContent.trim()),
        right: labels.slice(4).map(item => item.textContent.trim()),
        titles: [...document.querySelectorAll("#tree-svg .conflict-tree-title")].map(item => item.textContent),
        crossings: state.conflict.prepared.crossingsAfter,
      };
    });
    assert.equal(await page.locator("#conflict-primary-ladder").inputValue(), "small-top");
    assert.deepEqual((await orders()).left, ["D", "C", "A", "B"]);
    await page.locator('[data-settings-target="tree"]').click();
    await page.locator("#conflict-layout-section > summary").click();
    await page.locator("#conflict-primary-ladder").selectOption("file");
    assert.deepEqual((await orders()).left, ["A", "B", "C", "D"]);
    await page.locator("#conflict-primary-ladder").selectOption("small-top");
    assert.deepEqual((await orders()).left, ["D", "C", "A", "B"]);
    await page.locator('[data-settings-target="data"]').click();
    await page.locator("#conflict-input-section > summary").click();
    await page.locator("#conflict-primary-title").fill("Species tree");
    await page.locator("#conflict-secondary-title").fill("Gene tree");
    assert.deepEqual((await orders()).titles, ["Species tree", "Gene tree"]);

    await page.locator('#tree-svg .conflict-primary-node-hit[data-conflict-primary-node-id="n0"]').click({ button: "right" });
    assert.equal(await page.locator("#conflict-branch-menu").isVisible(), true);
    await page.locator("#conflict-branch-swap").click();
    assert.deepEqual((await orders()).left, ["C", "A", "B", "D"]);
    const sourceAfterSwap = await page.evaluate(() => PhyloRenderConflict.tipOrder(state.conflict.nuclearRoot));
    assert.deepEqual(sourceAfterSwap, ["a", "b", "c", "d"]);
    await page.locator('[data-settings-target="tree"]').click();
    await page.locator("#conflict-layout-section > summary").click();
    await page.locator("#conflict-optimize").click();
    await page.locator("#tree-loading").waitFor({ state: "hidden" });
    assert.deepEqual((await orders()).left, ["C", "A", "B", "D"]);
    const svg = await page.evaluate(() => serializeRenderedSvg());
    assert.ok(!svg.includes("conflict-primary-hits"), "interactive hit targets must not be exported");
    const smallTreeResult = await orders();
    await page.locator('[data-settings-target="data"]').click();
    await page.locator("#conflict-input-section > summary").click();
    await page.locator("#conflict-swap-trees").click();
    assert.equal(await page.locator("#conflict-nuclear-name").textContent(), "any-comparison.nwk");
    assert.equal(await page.locator("#conflict-plastid-name").textContent(), "any-primary.nwk");
    assert.deepEqual((await orders()).titles, ["Gene tree", "Species tree"]);
    assert.deepEqual((await orders()).left, ["D", "C", "A", "B"]);
    if (process.argv[2] && process.argv[3]) {
      await page.reload();
      await page.locator('[data-workspace-mode="conflict"]').click();
      await page.locator("#conflict-nuclear-file").setInputFiles(process.argv[2]);
      await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 120000 });
      await page.locator("#conflict-plastid-file").setInputFiles(process.argv[3]);
      await page.waitForFunction(() => document.querySelectorAll("#tree-svg .conflict-tip-label").length === 226,
        null, { timeout: 120000 });
      await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 120000 });
      const realBefore = await page.evaluate(() => ({
        original: PhyloRenderConflict.tipOrder(state.conflict.nuclearRoot),
        display: PhyloRenderConflict.tipOrder(state.conflict.prepared.nuclearRoot),
        crossings: state.conflict.prepared.crossingsAfter,
      }));
      const expectedDefault = await page.evaluate(() => PhyloRenderConflict.tipOrder(
        PhyloRenderConflict.ladderizePrimary(state.conflict.nuclearRoot, "small-top")));
      assert.deepEqual(realBefore.display, expectedDefault);
      await page.locator('[data-settings-target="tree"]').click();
      await page.locator("#conflict-layout-section > summary").click();
      await page.locator("#conflict-primary-ladder").selectOption("file");
      const realLaddered = await page.evaluate(() => ({
        original: PhyloRenderConflict.tipOrder(state.conflict.nuclearRoot),
        display: PhyloRenderConflict.tipOrder(state.conflict.prepared.nuclearRoot),
        crossingsBefore: state.conflict.prepared.crossingsBefore,
        crossingsAfter: state.conflict.prepared.crossingsAfter,
        connectors: document.querySelectorAll("#tree-svg .conflict-connector").length,
      }));
      assert.deepEqual(realLaddered.original, realBefore.original);
      assert.deepEqual(realLaddered.display, realBefore.original);
      assert.notDeepEqual(realLaddered.display, realBefore.display);
      assert.equal(realLaddered.connectors, 113);
      assert.ok(realLaddered.crossingsAfter <= realLaddered.crossingsBefore);
      console.log(JSON.stringify({ realTree: {
        tips: realLaddered.display.length,
        connectors: realLaddered.connectors,
        crossingsBefore: realLaddered.crossingsBefore,
        crossingsAfter: realLaddered.crossingsAfter,
      } }));
    }
    console.log(JSON.stringify({ passed: true, afterSwap: smallTreeResult }));
  } finally {
    await page.close();
  }
} finally {
  await runtime.close();
}
