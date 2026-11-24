import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

const primary = "(Euptelea_pleiosperma:1,Aconitum_jaluense_subsp.jaluense:1,Shared:1);";
const comparison = "(Out_Euptelea_pleiosperma:1,Aconitum_jaluense_subsp_jaluense:1,Shared:1);";
const larger = "((A:1,B:1):1,C:1,Main_only:1);";
const smaller = "(A:1,B:1,C:1);";
const expectedNames = [
  "Euptelea_pleiosperma",
  "Out_Euptelea_pleiosperma",
  "Aconitum_jaluense_subsp.jaluense",
  "Aconitum_jaluense_subsp_jaluense",
];
const runtime = await createRuntime();

try {
  await assert.rejects(runtime.renderer.render({
    workspace: "conflict",
    main_tree: { name: "primary.nwk", content: primary },
    comparison_tree: { name: "comparison.nwk", content: comparison },
  }), error => {
    assert.match(error.message, /样品数同为 3/);
    assert.match(error.message, /软件不会自动猜测/);
    expectedNames.forEach(name => assert.ok(error.message.includes(name), `MCP error must list ${name}`));
    return true;
  });

  await assert.rejects(runtime.renderer.render({
    workspace: "conflict",
    main_tree: { name: "larger.nwk", content: larger },
    comparison_tree: { name: "smaller.nwk", content: smaller },
  }), error => {
    assert.match(error.message, /主树 4 个，副树 3 个，共同 3 个/);
    assert.match(error.message, /Main_only/);
    assert.match(error.message, /需要用户确认|让用户确认/);
    return true;
  });

  const confirmed = await runtime.renderer.render({
    workspace: "conflict",
    main_tree: { name: "larger.nwk", content: larger },
    comparison_tree: { name: "smaller.nwk", content: smaller },
    options: { conflict: { sample_policy: "intersection" } },
  });
  assert.equal(confirmed.report.conflict.sample_comparison.sharedCount, 3);

  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(runtime.demoPageUrl);
    await page.locator('[data-workspace-mode="conflict"]').click();
    await page.locator("#conflict-nuclear-file").setInputFiles({
      name: "primary.nwk", mimeType: "text/plain", buffer: Buffer.from(primary),
    });
    await page.locator("#tree-loading").waitFor({ state: "hidden" });
    await page.locator("#conflict-plastid-file").setInputFiles({
      name: "comparison.nwk", mimeType: "text/plain", buffer: Buffer.from(comparison),
    });
    await page.waitForFunction(() => document.querySelector("#tree-loading")?.dataset.state === "error");
    const message = await page.locator("#tree-loading-detail").textContent();
    assert.match(message, /样品数同为 3/);
    assert.match(message, /软件不会自动猜测/);
    expectedNames.forEach(name => assert.ok(message.includes(name), `web error must list ${name}`));
    assert.equal(await page.locator("#conflict-plastid-name").textContent(), "尚未导入");
  } finally {
    await page.close();
  }

  const confirmationPage = await runtime.renderer.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await confirmationPage.goto(runtime.demoPageUrl);
    await confirmationPage.locator('[data-workspace-mode="conflict"]').click();
    await confirmationPage.locator("#conflict-nuclear-file").setInputFiles({
      name: "larger.nwk", mimeType: "text/plain", buffer: Buffer.from(larger),
    });
    await confirmationPage.locator("#tree-loading").waitFor({ state: "hidden" });
    let promptMessage = "";
    confirmationPage.once("dialog", async dialog => {
      promptMessage = dialog.message();
      await dialog.accept();
    });
    await confirmationPage.locator("#conflict-plastid-file").setInputFiles({
      name: "smaller.nwk", mimeType: "text/plain", buffer: Buffer.from(smaller),
    });
    await confirmationPage.locator("#tree-loading").waitFor({ state: "hidden" });
    assert.match(promptMessage, /主树 4 个，副树 3 个，共同 3 个/);
    assert.match(promptMessage, /Main_only/);
    assert.equal(await confirmationPage.locator("#conflict-sample-policy").inputValue(), "intersection");
    assert.equal(await confirmationPage.locator("#tip-count").textContent(), "3");
  } finally {
    await confirmationPage.close();
  }

  const deferredPage = await runtime.renderer.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await deferredPage.goto(runtime.demoPageUrl);
    await deferredPage.locator('[data-workspace-mode="conflict"]').click();
    await deferredPage.locator("#conflict-nuclear-file").setInputFiles({
      name: "larger.nwk", mimeType: "text/plain", buffer: Buffer.from(larger),
    });
    await deferredPage.locator("#tree-loading").waitFor({ state: "hidden" });
    deferredPage.once("dialog", dialog => dialog.dismiss());
    await deferredPage.locator("#conflict-plastid-file").setInputFiles({
      name: "smaller.nwk", mimeType: "text/plain", buffer: Buffer.from(smaller),
    });
    await deferredPage.locator("#tree-loading").waitFor({ state: "hidden" });
    assert.equal(await deferredPage.locator("#conflict-nuclear-name").textContent(), "larger.nwk");
    assert.equal(await deferredPage.locator("#conflict-plastid-name").textContent(), "smaller.nwk");
    assert.equal(await deferredPage.locator("#conflict-sample-policy").inputValue(), "");
    assert.match(await deferredPage.locator("#conflict-sample-summary").textContent(), /确认前不会绘图/);
    assert.equal(await deferredPage.locator("#tip-count").textContent(), "0");
    await deferredPage.locator("#conflict-sample-policy").selectOption("union");
    await deferredPage.locator("#tree-loading").waitFor({ state: "hidden" });
    assert.equal(await deferredPage.locator("#conflict-sample-policy").inputValue(), "union");
    assert.equal(await deferredPage.locator("#tip-count").textContent(), "3");
  } finally {
    await deferredPage.close();
  }
  console.log("PASS conflict sample mismatches require correction or explicit user-confirmed handling in web and MCP");
} finally {
  await runtime.close();
}
