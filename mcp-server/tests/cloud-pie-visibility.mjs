import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createRuntime } from "../src/runtime.mjs";
import { settleFigure } from './settle-figure.mjs';

const tree = "(O:3,((A:1,B:1):1,(C:1,D:1):1):1);";
const table = "Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\n" +
  "N1\t6\t2\t1\t1\tA;B\nN2\t5\t2\t1\t2\tC;D\nN3\t4\t3\t1\t2\tA;B;C;D\n";
const file = (name, content) => ({ name, mimeType: "text/plain", buffer: Buffer.from(content) });
const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const errors = [], analysisRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/\/api\/cloud-(date|phyparts)(?:[/?]|$)/.test(request.url())) analysisRequests.push(request.url());
  });
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.locator("#cloud-background-section > summary").click();
  await page.locator("#cloud-show-gene").uncheck();
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.locator("#cloud-input-section > summary").click();
  await page.locator("#cloud-species-method").selectOption("coalescent");
  await page.locator("#cloud-species-file").setInputFiles(file("species.tre", tree));
  await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 120000 });
  await page.locator("#cloud-phyparts-file").setInputFiles(file("statistics.tsv", table));
  await page.waitForFunction(() => document.querySelectorAll(".cloud-pie").length === 3);
  assert.equal(await page.locator("#cloud-pie-node, #cloud-pie-scope").count(), 0);
  const hidePie = async id => {
    const count = await page.locator(".cloud-pie").count();
    await page.locator(`.cloud-pie[data-phyparts-node="${id}"]`).click();
    assert.equal(await page.locator(".cloud-pie").count(), count, "click only opens a menu");
    assert.equal(await page.locator("#cloud-pie-menu-show").getAttribute("aria-checked"), "true");
    await page.locator("#cloud-pie-menu-hide").click();
    await settleFigure(page);
    assert.equal(await page.locator("#cloud-pie-menu").isVisible(), false);
  };
  const showPie = async id => {
    const count = await page.locator(".cloud-pie").count();
    await page.locator(`.cloud-hidden-pie-node[data-cloud-pie-toggle="${id}"]`).click();
    assert.equal(await page.locator(".cloud-pie").count(), count);
    assert.equal(await page.locator("#cloud-pie-menu-hide").getAttribute("aria-checked"), "true");
    await page.locator("#cloud-pie-menu-show").click();
    await settleFigure(page);
  };
  await page.locator('.cloud-pie[data-phyparts-node="N1"]').click();
  assert.equal(await page.locator(".cloud-pie").count(), 3);
  const deferred = await page.evaluate(async () => {
    const before = $('tree-svg').innerHTML;
    await renderCloudTree();
    return { open: !$('cloud-pie-menu').hidden, unchanged: before === $('tree-svg').innerHTML,
      pending: cloudPieMenuPendingRender };
  });
  assert.deepEqual(deferred, { open: true, unchanged: true, pending: true }, 'background redraw cannot dismiss an active pie menu');
  await page.locator("#cloud-pie-menu-cancel").click();
  await page.waitForFunction(() => !cloudPieMenuPendingRender);
  await settleFigure(page);
  assert.equal(await page.locator(".cloud-pie").count(), 3);
  await page.locator('.cloud-pie[data-phyparts-node="N1"]').click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#cloud-pie-menu").isVisible(), false);
  await page.locator('.cloud-pie[data-phyparts-node="N1"]').click();
  await page.locator(".cloud-tip-label").first().click();
  assert.equal(await page.locator("#cloud-pie-menu").isVisible(), false);
  const before = await page.evaluate(() => ({
    placement: document.querySelector('.cloud-pie[data-phyparts-node="N2"]').outerHTML,
    stats: JSON.stringify([...state.cloud.phyPartsTable.rows.values()]),
    branches: document.querySelector(".cloud-species-tree").outerHTML,
  }));
  await hidePie("N1");
  assert.equal(await page.locator(".cloud-pie").count(), 2);
  assert.equal(await page.locator('.cloud-hidden-pie-node[data-cloud-pie-toggle="N1"]').count(), 1);
  const marker = await page.locator(".cloud-hidden-pie-marker").evaluate(element => ({
    radius: Number(element.getAttribute("r")), stroke: getComputedStyle(element).stroke,
    fill: getComputedStyle(element).fill,
  }));
  assert.equal(marker.radius, 1.5);
  assert.equal(marker.stroke, "none", "hidden marker is a tiny solid point, never a ring");
  assert.notEqual(marker.fill, "none");
  const hidden = await page.evaluate(() => ({
    placement: document.querySelector('.cloud-pie[data-phyparts-node="N2"]').outerHTML,
    stats: JSON.stringify([...state.cloud.phyPartsTable.rows.values()]),
    branches: document.querySelector(".cloud-species-tree").outerHTML,
  }));
  assert.deepEqual(hidden, before, "visibility cannot move neighbouring pies, alter branches, or alter counts");
  const exported = await page.evaluate(async () => {
    const document = new DOMParser().parseFromString(await serializeRenderedSvg(), "image/svg+xml");
    return { pies: document.querySelectorAll(".cloud-pie").length,
      editor: document.querySelectorAll(".cloud-editor-only, [data-cloud-pie-toggle], [tabindex]").length,
      hidden: document.documentElement.getAttribute("data-cloud-hidden-pie-nodes") };
  });
  assert.deepEqual(exported, { pies: 2, editor: 0, hidden: '["N1"]' });
  await showPie("N1");
  assert.equal(await page.locator(".cloud-pie").count(), 3);
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await page.locator('#cloud-pie-settings-section > summary').click();
  await page.locator("#cloud-pie-mode").selectOption("four");
  await settleFigure(page);
  await hidePie("N2");
  await page.locator("#cloud-pie-mode").selectOption("two");
  await settleFigure(page);
  assert.equal(await page.locator('.cloud-hidden-pie-node[data-cloud-pie-toggle="N2"]').count(), 1);
  await page.locator('.cloud-hidden-pie-node[data-cloud-pie-toggle="N2"]').press("Enter");
  assert.equal(await page.locator(".cloud-pie").count(), 2);
  await page.locator("#cloud-pie-menu-show").click();
  await settleFigure(page);
  assert.equal(await page.locator(".cloud-pie").count(), 3);
  await page.locator('.cloud-pie[data-phyparts-node="N2"]').press("Space");
  assert.equal(await page.locator(".cloud-pie").count(), 3);
  await page.locator("#cloud-pie-menu-hide").click();
  await settleFigure(page);
  assert.equal(await page.locator(".cloud-pie").count(), 2);
  await hidePie("N1");
  await hidePie("N3");
  assert.equal(await page.locator(".cloud-pie").count(), 0);
  assert.equal(await page.locator(".cloud-hidden-pie-node").count(), 3);
  assert.equal(await page.locator("#cloud-pie-legend-layer").count(), 0);
  await showPie("N3");
  assert.equal(await page.locator(".cloud-pie").count(), 1);
  assert.equal(await page.locator("#cloud-pie-legend-layer").count(), 1);
  // New species input must not inherit hidden IDs from the previous figure.
  await page.locator("#cloud-species-file").setInputFiles(file("species-new.tre", tree));
  await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 120000 });
  assert.equal(await page.evaluate(() => state.cloud.hiddenPieNodes.size), 0);
  assert.deepEqual(analysisRequests, [], "pie toggles must never start PhyParts or treePL");
  assert.deepEqual(errors, []);
  if (process.argv[2] && process.argv[3] && process.argv[4]) {
    await page.locator("#cloud-species-file").setInputFiles(process.argv[3]);
    await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 120000 });
    await page.locator("#cloud-phyparts-file").setInputFiles(process.argv[4]);
    await page.waitForFunction(() => document.querySelectorAll(".cloud-pie").length > 20);
    const original = await page.evaluate(() => ({
      pies: document.querySelectorAll(".cloud-pie").length,
      id: document.querySelector(".cloud-pie").dataset.phypartsNode,
    }));
    await hidePie(original.id);
    assert.equal(await page.locator(".cloud-pie").count(), original.pies - 1);
    const svg = await page.evaluate(() => serializeRenderedSvg());
    await writeFile(path.join(process.argv[2], "02_真实树_隐藏一个饼图.svg"), svg);
    // Rasterize the original exported SVG in a separate preview page. A
    // screenshot of the editor's scroll container would clip the lower tips.
    const size = await page.evaluate(() => state.currentSvgSize);
    const preview = await runtime.renderer.browser.newPage({ viewport: {
      width: Math.ceil(size.width), height: Math.ceil(size.height) } });
    await preview.setContent(`<body style="margin:0">${svg}</body>`);
    await preview.evaluate(() => document.fonts.ready);
    await preview.screenshot({ path: path.join(process.argv[2], "03_真实树原生SVG预览.png") });
    await preview.close();
    await showPie(original.id);
    assert.equal(await page.locator(".cloud-pie").count(), original.pies);
    await writeFile(path.join(process.argv[2], "04_真实数据验收.json"), JSON.stringify({
      speciesFile: process.argv[3], statisticsFile: process.argv[4],
      originalPies: original.pies, hiddenId: original.id, hiddenPies: original.pies - 1,
      restoredPies: original.pies, exportRemovedEditorMarkers: !/class="[^"]*cloud-editor-only/.test(svg),
    }, null, 2));
  }
  console.log("PASS cloud pie explicit menu, cancel/outside/Escape, tiny solid point, keyboard, stable layout, unchanged statistics, clean SVG, and new-tree reset");
} finally { await runtime.close(); }
