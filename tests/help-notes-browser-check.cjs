const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

async function openSettingsPage(page, name) {
  await page.locator(`.settings-nav [data-settings-target="${name}"]`).click();
  assert.equal(await page.locator(".controls").getAttribute("data-active-page"), name);
}

async function visibleHelpNoteMetrics(page) {
  return page.locator(".help-note:visible").evaluateAll(notes => notes.map(note => {
    const brief = note.querySelector(".help-note-brief");
    const style = getComputedStyle(note);
    const briefStyle = getComputedStyle(brief);
    return {
      brief: brief.textContent.trim(),
      detail: note.dataset.detail.trim(),
      noteWhiteSpace: style.whiteSpace,
      briefWhiteSpace: briefStyle.whiteSpace,
      briefClientHeight: brief.clientHeight,
      briefScrollHeight: brief.scrollHeight,
      noteClientWidth: note.clientWidth,
      noteScrollWidth: note.scrollWidth,
    };
  }));
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length > 100);

    const allNotes = page.locator(".help-note[data-detail]");
    assert.equal(await allNotes.count(), 14, "全部长期说明都应使用统一的两层说明组件");
    const structure = await allNotes.evaluateAll(notes => notes.map(note => ({
      brief: note.querySelector(".help-note-brief")?.textContent.trim() || "",
      detail: note.dataset.detail?.trim() || "",
      icons: note.querySelectorAll(".help-note-icon").length,
      tabIndex: note.tabIndex,
      describedBy: note.getAttribute("aria-describedby"),
    })));
    structure.forEach(item => {
      assert.ok(item.brief.length > 0 && item.brief.length <= 24, `第一层应是简短句子：${item.brief}`);
      assert.ok(item.detail.length > item.brief.length, `第二层应比摘要更详细：${item.brief}`);
      assert.equal(item.icons, 1, `每条摘要应有一个信息图标：${item.brief}`);
      assert.equal(item.tabIndex, 0, `说明应支持键盘聚焦：${item.brief}`);
      assert.equal(item.describedBy, "help-tooltip");
    });
    const numericHelps = page.locator(".numeric-help[data-detail]");
    assert.ok(await numericHelps.count() >= 9, "所有数值控件都应带有独立问号说明");
    const numericHelpStructure = await numericHelps.evaluateAll(notes => notes.map(note => ({
      text: note.textContent.trim(),
      detail: note.dataset.detail.trim(),
      describedBy: note.getAttribute("aria-describedby"),
    })));
    numericHelpStructure.forEach(item => {
      assert.equal(item.text, "?", "数值控件说明应显示为小问号");
      assert.ok(item.detail.length >= 60, "数值控件问号应提供较完整的参数解释");
      assert.equal(item.describedBy, "help-tooltip");
    });

    const pageMetrics = {};
    for (const name of ["data", "tree", "labels", "style", "groups"]) {
      await openSettingsPage(page, name);
      pageMetrics[name] = await visibleHelpNoteMetrics(page);
      pageMetrics[name].forEach(item => {
        assert.equal(item.noteWhiteSpace, "nowrap", `${name} 页说明容器必须保持单行`);
        assert.equal(item.briefWhiteSpace, "nowrap", `${name} 页摘要必须保持单行`);
        assert.ok(item.briefScrollHeight <= item.briefClientHeight + 1, `${name} 页摘要不得换行：${item.brief}`);
        assert.ok(item.noteScrollWidth <= item.noteClientWidth + 1, `${name} 页说明不得造成横向溢出：${item.brief}`);
      });
    }

    await openSettingsPage(page, "data");
    const firstNote = page.locator("#main-tree-file-hint");
    const firstDetail = await firstNote.getAttribute("data-detail");
    await firstNote.hover();
    const tooltip = page.locator("#help-tooltip");
    await tooltip.waitFor({ state: "visible" });
    assert.equal(await tooltip.textContent(), firstDetail, "悬停时应显示该摘要对应的完整说明");
    const tooltipPosition = await tooltip.evaluate(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, position: getComputedStyle(element).position };
    });
    assert.equal(tooltipPosition.position, "fixed", "详细说明应浮在页面上层，不应撑开侧栏");
    assert.ok(tooltipPosition.left >= 0 && tooltipPosition.top >= 0 && tooltipPosition.right <= 1280 && tooltipPosition.bottom <= 900,
      "悬浮详情必须完整留在视口内");

    await openSettingsPage(page, "tree");
    const branchHelp = page.locator(".numeric-card", { has: page.locator("#branch-width") }).locator(".numeric-help");
    await branchHelp.hover();
    await tooltip.waitFor({ state: "visible" });
    assert.match(await tooltip.textContent(), /树枝线条的宽度/, "数值控件问号悬停时应显示对应参数的详细说明");

    await openSettingsPage(page, "groups");
    await page.locator("#clade-select-hint").focus();
    await tooltip.waitFor({ state: "visible" });
    assert.match(await tooltip.textContent(), /透明点击范围/, "键盘聚焦也应显示详细说明");
    await page.keyboard.press("Escape");
    assert.equal(await tooltip.isHidden(), true, "Escape 应关闭详细说明");

    await page.locator("#tree-file").setInputFiles({
      name: "ultrametric.custom",
      mimeType: "text/plain",
      buffer: Buffer.from("((A:1,B:1):2,((C:1,D:1):1,(E:1,F:1):1):1);")
    });
    await page.waitForFunction(() => document.body.classList.contains("time-tree-mode"));
    await openSettingsPage(page, "data");
    assert.equal(await page.locator("#node-data-intro .help-note-brief").textContent(), "附加树用于给主树节点补充数值。");
    assert.match(await page.locator("#node-data-intro").getAttribute("data-detail"), /时间树决定最终拓扑和时间坐标/,
      "切换为时间树后只应更新详细说明，不得破坏摘要组件");

    await page.locator("#support-data-files").setInputFiles({
      name: "bootstrap.any",
      mimeType: "text/plain",
      buffer: Buffer.from("((A:1,B:1)95:2,((C:1,D:1)90:1,(E:1,F:1)85:1)88:1);")
    });
    await page.waitForFunction(() => document.querySelector("#node-data-note .help-note-brief")?.textContent.includes("已添加"));
    assert.equal(await page.locator("#node-data-note .help-note-icon").count(), 1,
      "数据数量变化后仍应保留信息图标和两层结构");
    assert.match(await page.locator("#node-data-note").getAttribute("data-detail"), /无根二分支匹配/);

    await page.setViewportSize({ width: 800, height: 700 });
    const note = page.locator("#node-data-note");
    await note.scrollIntoViewIfNeeded();
    await note.hover();
    await tooltip.waitFor({ state: "visible" });
    const narrow = await page.evaluate(() => {
      const panel = document.querySelector(".controls");
      const noteBox = document.querySelector("#node-data-note").getBoundingClientRect();
      const tooltipBox = document.querySelector("#help-tooltip").getBoundingClientRect();
      return {
        panelClientWidth: panel.clientWidth,
        panelScrollWidth: panel.scrollWidth,
        noteHeight: noteBox.height,
        tooltipLeft: tooltipBox.left,
        tooltipRight: tooltipBox.right,
        tooltipBottom: tooltipBox.bottom,
      };
    });
    assert.equal(narrow.panelScrollWidth, narrow.panelClientWidth, "窄窗口下说明组件不得引起侧栏横向滚动");
    assert.ok(narrow.tooltipLeft >= 0 && narrow.tooltipRight <= 800 && narrow.tooltipBottom <= 700,
      "窄窗口下悬浮详情仍应完整留在视口内");

    console.log(JSON.stringify({ count: structure.length, pages: pageMetrics, tooltipPosition, narrow }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
