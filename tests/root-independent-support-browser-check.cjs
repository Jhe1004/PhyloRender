const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const actualMainPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const actualSupportPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const pageUrl = process.argv[4] || "http://127.0.0.1:8765/";

function treeFile(name, text) {
  return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}

async function supportMeta(page) {
  return page.locator("#support-data-list .node-data-meta").textContent();
}

async function rerootOnTip(page, tipName) {
  const tip = page.locator("#tree-svg .tip-label").filter({ hasText: new RegExp(`^${tipName}$`) });
  const tipId = await tip.getAttribute("data-tip-node-id");
  await page.locator(`#tree-svg .clade-hit[data-clade-node-id="${tipId}"]`).dispatchEvent("contextmenu", {
    button: 2,
    buttons: 2,
    clientX: 900,
    clientY: 400,
  });
  await page.locator("#branch-context-reroot").dispatchEvent("click");
  await page.waitForFunction(() => document.querySelector("#branch-context-menu")?.hidden === true);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });

    const rootedMain = "((Euptelea_pleiosperma:1,Akebia_quinata:1)0.99:1,((B:1,C:1)0.95:1,(D:1,E:1)0.90:1)0.88:1);";
    const arbitrarilyRootedSupport = "((Out_Euptelea_pleiosperma:1,Out_Akebia_quinata:1)100:1,(B:1,C:1)95:1,(D:1,E:1)90:1);";
    await page.locator("#tree-file").setInputFiles(treeFile("rooted-main.tre", rootedMain));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length === 6);
    await page.locator("#support-data-files").setInputFiles(treeFile("unrooted-support.tre", arbitrarilyRootedSupport));
    await page.waitForFunction(() => document.querySelectorAll("#support-data-list .node-data-item").length === 1);
    const syntheticBefore = await supportMeta(page);
    assert.match(syntheticBefore, /匹配 3\/3 个节点/, "任意根方向的支持率树必须按无根二分支完整匹配");
    assert.match(syntheticBefore, /无根二分支/, "界面必须说明支持率的根无关匹配方式");
    assert.match(syntheticBefore, /自动对齐 2 个样品名/, "Out_ 外类群前缀必须一对一安全对齐");

    await rerootOnTip(page, "B");
    const syntheticAfter = await supportMeta(page);
    assert.match(syntheticAfter, /匹配 3\/3 个节点/, "主树换根后附加支持率匹配数不得改变");

    let actual = null;
    if (actualMainPath && actualSupportPath) {
      await page.locator("#tree-file").setInputFiles(actualMainPath);
      await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length === 173);
      await page.locator("#support-data-files").setInputFiles(actualSupportPath);
      await page.waitForFunction(() => document.querySelectorAll("#support-data-list .node-data-item").length === 1);
      const beforeRooting = await supportMeta(page);
      assert.match(beforeRooting, /匹配 168\/170 个节点/, "真实主树与 RAxML 支持率树应仅保留 2 条真实拓扑差异");
      assert.match(beforeRooting, /自动对齐 5 个样品名/, "真实支持率树的 5 个 Out_ 外类群名称必须自动对齐");
      await rerootOnTip(page, "Euptelea pleiosperma");
      const afterRooting = await supportMeta(page);
      assert.match(afterRooting, /匹配 168\/170 个节点/, "真实主树定根后无根支持率匹配数必须保持不变");
      actual = { beforeRooting, afterRooting };
    }

    console.log(JSON.stringify({ syntheticBefore, syntheticAfter, actual }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
