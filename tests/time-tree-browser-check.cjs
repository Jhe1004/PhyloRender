const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const treePath = path.resolve(process.argv[2] || "");
const pageUrl = process.argv[3] || "http://127.0.0.1:8765/";
const supportTreePath = process.argv[4] ? path.resolve(process.argv[4]) : null;
const screenshotPath = process.env.PHYLORENDER_SCREENSHOT;
const pageScreenshotPath = process.env.PHYLORENDER_PAGE_SCREENSHOT;
const shortLeaderScreenshotPath = process.env.PHYLORENDER_SHORT_LEADER_SCREENSHOT;

if (!process.argv[2]) {
  throw new Error("用法：node tests/time-tree-browser-check.cjs <时间树文件> [页面地址]");
}

function overlaps(a, b, padding = 0.25) {
  return a.x < b.x + b.width - padding
    && a.x + a.width > b.x + padding
    && a.y < b.y + b.height - padding
    && a.y + a.height > b.y + padding;
}

function segmentIntersectsRect(segment, rect, padding = 2.5) {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  const minY = Math.min(segment.y1, segment.y2);
  const maxY = Math.max(segment.y1, segment.y2);
  if (maxX < left || minX > right || maxY < top || minY > bottom) return false;
  if (segment.y1 === segment.y2) return segment.y1 >= top && segment.y1 <= bottom;
  if (segment.x1 === segment.x2) return segment.x1 >= left && segment.x1 <= right;
  return true;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  page.on("pageerror", error => console.error("页面错误：", error));
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".workspace-mode-switch").count(), 1, "顶部应提供显式绘图类型切换");
    assert.equal(await page.locator(".workspace-mode-switch [data-workspace-mode]").count(), 4, "应预留四种绘图栏目");
    assert.equal(await page.locator('[data-workspace-mode="phylogeny"]').getAttribute("aria-selected"), "true", "默认进入普通树栏目");
    await page.locator('[data-workspace-mode="time"]').click();
    assert.equal(await page.locator('[data-workspace-mode="time"]').getAttribute("aria-selected"), "true", "Dating 树必须由用户显式选择");
    await page.locator("#tree-file").setInputFiles(treePath);
    await page.waitForFunction(
      () => document.querySelectorAll("#tree-svg .time-tip-label").length > 100,
      null,
      { timeout: 60000 }
    );
    // Time units are deliberately not inferred from numeric ages. This
    // regression fixture is a known-Ma tree, so confirm Mya explicitly.
    await page.locator("#time-source-unit").selectOption("mya");
    await page.locator("#tree-loading").waitFor({ state: "hidden", timeout: 60000 });
    assert.equal(await page.locator("body").evaluate(element => element.classList.contains("time-tree-mode")), true, "显式选择后应进入 Dating 树模式");

    const report = await page.evaluate(() => {
      const rect = element => {
        const box = element.getBBox();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const tips = [...document.querySelectorAll("#tree-svg .time-tip-label")];
      const ages = [...document.querySelectorAll("#tree-svg .time-age-label")];
      const ticks = [...document.querySelectorAll("#tree-svg .time-axis text")]
        .map(element => element.textContent.trim())
        .filter(text => /^\d+(?:\.\d+)?$/.test(text))
        .map(Number);
      const labels = [...document.querySelectorAll("#tree-svg .time-geology text, #tree-svg .time-geology-key text")]
        .map(element => element.textContent.trim())
        .filter(Boolean);
      const ageRects = ages.map(rect);
      const tipRects = tips.map(rect);
      const plotRight = Math.min(...tips.map(element => Number(element.getAttribute("x")))) - 9;
      const branchSegments = [...document.querySelectorAll("#tree-svg .time-branch")].map(line => ({
        x1: Number(line.getAttribute("x1")),
        y1: Number(line.getAttribute("y1")),
        x2: Number(line.getAttribute("x2")),
        y2: Number(line.getAttribute("y2"))
      }));
      const duplicateTipNames = tips.map(element => element.textContent.trim())
        .filter((name, index, names) => names.indexOf(name) !== index);
      return {
        tipCount: tips.length,
        ageCount: ages.length,
        arrowCount: document.querySelectorAll("#tree-svg .node-label-arrow").length,
        arrowHeadCount: document.querySelectorAll("#tree-svg .node-label-arrowhead").length,
        collisionStat: Number(document.querySelector("#collision-count")?.textContent || NaN),
        ticks,
        geologyLabels: labels,
        duplicateTipNames,
        zeroSizeTips: tipRects.filter(box => box.width <= 0 || box.height <= 0).length,
        ageRects,
        tipRects,
        branchSegments,
        leaderCrossings: [...document.querySelectorAll("#tree-svg .time-age-leader")]
          .filter(leader => Number(leader.getAttribute("data-branch-crossings")) > 0).length,
        nonStraightLeaders: [...document.querySelectorAll("#tree-svg .time-age-leader")]
          .filter(leader => leader.tagName.toLowerCase() !== "line"
            || leader.getAttribute("data-straight-leader") !== "true").length,
        unbridgedLeaderCrossings: [...document.querySelectorAll("#tree-svg .time-age-leader")]
          .filter(leader => Number(leader.getAttribute("data-branch-crossings")) > 0
            && (!document.querySelector(`[data-leader-halo-id="${CSS.escape(leader.getAttribute("data-leader-id"))}"]`)
              || leader.getAttribute("data-crossings-bridged") !== "true")).length,
        maxAgeEdgeDistance: Math.max(...ages.map(element => Number(element.getAttribute("data-edge-distance")) || 0)),
        maxLeaderLength: Math.max(0, ...[...document.querySelectorAll("#tree-svg .time-age-leader")]
          .map(element => Number(element.getAttribute("data-leader-length")) || 0)),
        agesBeyondTimePlot: ageRects.filter(box => box.x + box.width > plotRight + 0.5).length,
        svgWidth: document.querySelector("#tree-svg").viewBox.baseVal.width,
        status: document.querySelector("#time-detection-status")?.textContent || ""
      };
    });

    let ageAgeOverlaps = 0;
    let ageTipOverlaps = 0;
    let ageBranchOverlaps = 0;
    for (let i = 0; i < report.ageRects.length; i++) {
      for (let j = i + 1; j < report.ageRects.length; j++) {
        if (overlaps(report.ageRects[i], report.ageRects[j])) ageAgeOverlaps++;
      }
      for (const tipRect of report.tipRects) {
        if (overlaps(report.ageRects[i], tipRect)) ageTipOverlaps++;
      }
      if (report.branchSegments.some(segment => segmentIntersectsRect(segment, report.ageRects[i]))) {
        ageBranchOverlaps++;
      }
    }

    assert.equal(report.tipCount, 173, "必须完整绘制 173 个末端名称");
    assert.equal(report.ageCount, 172, "必须完整绘制 172 个内部节点年龄");
    assert.equal(report.arrowCount, report.ageCount, "每个内部节点年龄都必须有一条指向所属节点的箭头");
    assert.equal(report.arrowHeadCount, report.ageCount, "每个内部节点年龄都必须有一个小箭头尖");
    assert.equal(report.zeroSizeTips, 0, "末端名称不得变成不可见的零尺寸文字");
    assert.equal(report.duplicateTipNames.length, 0, "末端名称不得重复或替换原名称");
    assert.equal(Math.max(...report.ticks), 100, "时间轴最大值应为 100 Ma");
    assert.ok(!report.ticks.includes(150), "时间轴不得因浮点误差扩展到 150 Ma");
    assert.ok(report.geologyLabels.includes("Cretaceous"), "左侧白垩纪色块必须存在");
    assert.ok(report.geologyLabels.includes("Late Cretaceous"), "左侧晚白垩世色块必须存在");
    assert.ok(report.geologyLabels.some(label => ["Q", "Quat.", "Quaternary"].includes(label)), "第四纪色块必须保留可辨认标记");
    assert.equal(ageAgeOverlaps, 0, "密集节点年龄之间不得互相遮挡");
    assert.equal(ageTipOverlaps, 0, "节点年龄不得遮挡末端名称");
    assert.equal(ageBranchOverlaps, 0, "节点年龄不得覆盖时间树树枝");
    assert.equal(report.nonStraightLeaders, 0, "节点时间的全部引导线都必须是直线");
    assert.equal(report.unbridgedLeaderCrossings, 0, "直线不得不穿枝时必须使用白色底衬桥接");
    assert.ok(report.maxAgeEdgeDistance <= 84.5, "默认字号的节点时间必须紧邻所属节点");
    assert.ok(report.maxLeaderLength <= 135, "默认字号的节点时间引导线不得横跨树图");
    assert.equal(report.agesBeyondTimePlot, 0, "节点时间不得越过 0 Mya 末端轴进入样品名称区");
    assert.equal(report.collisionStat, 0, "界面应报告零个残留文字冲突");

    await page.locator("#support-min-size").evaluate(element => {
      element.value = "7";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const shortLeaderRegression = await page.evaluate(() => ["43.06", "40.83"].map(value => {
      const label = [...document.querySelectorAll("#tree-svg .time-age-label")]
        .find(element => element.textContent === value);
      const leader = [...document.querySelectorAll("#tree-svg .time-age-leader")]
        .find(element => element.getAttribute("data-leader-id") === label.getAttribute("data-label-id"));
      return {
        value,
        font: Number(label.getAttribute("font-size")),
        edgeDistance: Number(label.getAttribute("data-edge-distance")),
        triggerDistance: Number(label.getAttribute("data-leader-trigger-distance")),
        leaderRequired: label.getAttribute("data-leader-required"),
        leaderExists: Boolean(leader),
      };
    }));
    shortLeaderRegression.forEach(item => {
      assert.ok(item.edgeDistance <= item.triggerDistance, `${item.value} 仍在一个字高的节点邻域内`);
      assert.equal(item.leaderRequired, "true", `${item.value} 即使贴近节点也必须要求指示箭头`);
      assert.equal(item.leaderExists, true, `${item.value} 旁边必须绘制短直线箭头`);
    });
    const adonisLocalRegression = await page.evaluate(() => {
      const label = document.querySelector('#tree-svg .time-age-label[data-node-id="n317"]');
      const leader = [...document.querySelectorAll("#tree-svg .time-age-leader")]
        .find(element => element.getAttribute("data-leader-id") === label.getAttribute("data-label-id"));
      return {
        value: label.textContent,
        font: Number(label.getAttribute("font-size")),
        edgeDistance: Number(label.getAttribute("data-edge-distance")),
        triggerDistance: Number(label.getAttribute("data-leader-trigger-distance")),
        leaderRequired: label.getAttribute("data-leader-required"),
        leaderExists: Boolean(leader),
      };
    });
    assert.equal(adonisLocalRegression.value, "3.34", "Adonis 密集分支的目标节点应为 3.34");
    assert.ok(adonisLocalRegression.font <= 12, "3.34 应在共享末端间距下使用不超过首选值的字号");
    assert.ok(adonisLocalRegression.edgeDistance <= adonisLocalRegression.triggerDistance, "3.34 必须回到局部节点邻域");
    assert.equal(adonisLocalRegression.leaderRequired, "true", "已回到节点旁边的 3.34 仍必须要求指示箭头");
    assert.equal(adonisLocalRegression.leaderExists, true, "Adonis 密集分支必须保留短直线箭头");
    assert.equal(Number(await page.locator("#collision-count").textContent()), 0, "增加短箭头后不得产生文字冲突");
    if (shortLeaderScreenshotPath) {
      const target = page.locator("#tree-svg .time-age-label").filter({ hasText: /^43\.06$/ });
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      await page.screenshot({
        path: shortLeaderScreenshotPath,
        clip: {
          x: Math.max(0, box.x - 160),
          y: Math.max(0, box.y - 140),
          width: Math.min(460, 1800 - Math.max(0, box.x - 160)),
          height: Math.min(360, 1200 - Math.max(0, box.y - 140)),
        },
      });
    }
    await page.locator("#support-min-size").evaluate(element => {
      element.value = "9";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const dragTarget = page.locator("#tree-svg .time-age-label").first();
    const dragTargetId = await dragTarget.getAttribute("data-label-id");
    const dragBox = await dragTarget.boundingBox();
    assert.ok(dragBox, "应能获取时间标签的拖动区域");
    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width / 2 + 520, dragBox.y + dragBox.height / 2, { steps: 6 });
    await page.mouse.up();
    const boundedManual = await page.evaluate(labelId => {
      const label = [...document.querySelectorAll("#tree-svg .time-age-label")]
        .find(element => element.getAttribute("data-label-id") === labelId);
      const box = label.getBBox();
      return {
        right: box.x + box.width,
        edgeDistance: Number(label.getAttribute("data-edge-distance")),
      };
    }, dragTargetId);
    assert.ok(boundedManual.right <= 816.5, "手动标签不得被拖入样品名称区");
    assert.ok(boundedManual.edgeDistance <= 120.5, "过远的旧手动位置应自动拉回所属节点附近");
    await page.locator(`#tree-svg .time-age-label[data-label-id="${dragTargetId}"]`).dblclick();

    if (supportTreePath) {
      await page.locator('.settings-nav [data-settings-target="data"]').click();
      assert.equal(await page.locator(".support-data-card").isVisible(), false, "Dating 树不得显示支持率上传入口");
      await page.locator("#support-data-files").setInputFiles(supportTreePath);
      await page.waitForTimeout(100);
      const supportSuppressed = await page.evaluate(() => ({
        sources: document.querySelectorAll("#support-data-list .node-data-item").length,
        fullBranches: document.querySelectorAll("#tree-svg .full-support-branch").length,
        supportAttributes: document.querySelectorAll("#tree-svg [data-support-state],#tree-svg [data-support-branch]").length,
        combinedLabels: [...document.querySelectorAll("#tree-svg .time-age-label")]
          .filter(label => label.textContent.includes(" | ")).length,
      }));
      assert.equal(supportSuppressed.sources, 0, "Dating 树必须拒绝附加支持率文件");
      assert.equal(supportSuppressed.fullBranches, 0, "Dating 树不得用粗枝表示满支持率");
      assert.equal(supportSuppressed.supportAttributes, 0, "Dating 树导出层不得携带支持率显示标记");
      assert.equal(supportSuppressed.combinedLabels, 0, "Dating 树节点时间不得与支持率组合显示");
    }

    await page.locator('.settings-nav [data-settings-target="style"]').click();
    await page.locator('details:has(#support-font-family) > summary').click();
    await page.locator("#support-font-family").selectOption('"PhyloRender Baskerville", "Noto Sans SC Variable", serif');
    await page.locator("#support-font-color").fill("#123456");
    await page.locator("#support-font-bold").check();
    await page.locator("#support-font-italic").check();
    await page.locator("#support-min-size").evaluate(element => {
      element.value = "8";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#support-size").evaluate(element => {
      element.value = "18";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const typography = await page.locator("#tree-svg .time-age-label").first().evaluate(element => {
      const style = getComputedStyle(element);
      return {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        fontStyle: style.fontStyle,
        color: style.fill
      };
    });
    assert.match(typography.family, /PhyloRender Baskerville/i, "时间字体选择必须应用到图中");
    assert.equal(typography.size, "18px", "时间字号必须应用到图中");
    assert.equal(typography.weight, "700", "时间粗体开关必须应用到图中");
    assert.equal(typography.fontStyle, "italic", "时间斜体开关必须应用到图中");
    assert.equal(typography.color, "rgb(18, 52, 86)", "时间颜色必须应用到图中");
    const exportedSvg = await page.evaluate(() => serializedSvg());
    assert.match(exportedSvg, /--support-font-family:\s*&quot;PhyloRender Baskerville&quot;/i, "SVG 导出必须保留节点标注字体");
    assert.match(exportedSvg, /--support-font-style:\s*italic/i, "SVG 导出必须保留节点标注斜体");
    assert.match(exportedSvg, /--support-color:\s*#123456/i, "SVG 导出必须保留节点标注颜色");

    const stressReport = await page.evaluate(() => {
      const rect = element => {
        const box = element.getBBox();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const ages = [...document.querySelectorAll("#tree-svg .time-age-label")];
      const tips = [...document.querySelectorAll("#tree-svg .time-tip-label")];
      return {
        ageRects: ages.map(rect),
        tipRects: tips.map(rect),
        branchSegments: [...document.querySelectorAll("#tree-svg .time-branch")].map(line => ({
          x1: Number(line.getAttribute("x1")),
          y1: Number(line.getAttribute("y1")),
          x2: Number(line.getAttribute("x2")),
          y2: Number(line.getAttribute("y2"))
        })),
        ageCount: ages.length,
        maxAgeEdgeDistance: Math.max(...ages.map(element => Number(element.getAttribute("data-edge-distance")) || 0)),
        maxLeaderLength: Math.max(0, ...[...document.querySelectorAll("#tree-svg .time-age-leader")]
          .map(element => Number(element.getAttribute("data-leader-length")) || 0)),
        leaderCrossings: [...document.querySelectorAll("#tree-svg .time-age-leader")]
          .filter(element => Number(element.getAttribute("data-branch-crossings")) > 0).length,
        nonStraightLeaders: [...document.querySelectorAll("#tree-svg .time-age-leader")]
          .filter(element => element.tagName.toLowerCase() !== "line"
            || element.getAttribute("data-straight-leader") !== "true").length,
        unbridgedLeaderCrossings: [...document.querySelectorAll("#tree-svg .time-age-leader")]
          .filter(element => Number(element.getAttribute("data-branch-crossings")) > 0
            && (!document.querySelector(`[data-leader-halo-id="${CSS.escape(element.getAttribute("data-leader-id"))}"]`)
              || element.getAttribute("data-crossings-bridged") !== "true")).length,
        agesBeyondTimePlot: ages.map(rect).filter(box => box.x + box.width > (Math.min(...tips.map(element => Number(element.getAttribute("x")))) - 8.5)).length,
        collisionStat: Number(document.querySelector("#collision-count")?.textContent || NaN)
      };
    });
    let stressAgeAgeOverlaps = 0;
    let stressAgeTipOverlaps = 0;
    let stressAgeBranchOverlaps = 0;
    for (let i = 0; i < stressReport.ageRects.length; i++) {
      for (let j = i + 1; j < stressReport.ageRects.length; j++) {
        if (overlaps(stressReport.ageRects[i], stressReport.ageRects[j])) stressAgeAgeOverlaps++;
      }
      for (const tipRect of stressReport.tipRects) {
        if (overlaps(stressReport.ageRects[i], tipRect)) stressAgeTipOverlaps++;
      }
      if (stressReport.branchSegments.some(segment => segmentIntersectsRect(segment, stressReport.ageRects[i]))) {
        stressAgeBranchOverlaps++;
      }
    }
    assert.equal(stressReport.ageCount, 172, "18 px 压力测试仍须保留全部节点时间");
    assert.equal(stressAgeAgeOverlaps, 0, "18 px 节点时间之间不得互相遮挡");
    assert.equal(stressAgeTipOverlaps, 0, "18 px 节点时间不得遮挡末端名称");
    assert.equal(stressAgeBranchOverlaps, 0, "18 px 节点时间不得覆盖树枝");
    assert.ok(stressReport.maxAgeEdgeDistance <= 120.5, "18 px 节点时间必须留在所属节点附近");
    assert.ok(stressReport.maxLeaderLength <= 150, "18 px 节点时间不得产生横跨树图的引导线");
    assert.equal(stressReport.nonStraightLeaders, 0, "18 px 节点时间引导线必须全部为直线");
    assert.equal(stressReport.unbridgedLeaderCrossings, 0, "18 px 直线穿枝时必须使用白色底衬桥接");
    assert.equal(stressReport.agesBeyondTimePlot, 0, "18 px 节点时间不得进入样品名称区");
    assert.equal(stressReport.collisionStat, 0, "18 px 压力测试应报告零个残留冲突");
    if (screenshotPath) await page.locator("#tree-svg").screenshot({ path: screenshotPath });
    if (pageScreenshotPath) await page.screenshot({ path: pageScreenshotPath });

    console.log(JSON.stringify({
      tree: treePath,
      tips: report.tipCount,
      ages: report.ageCount,
      axisTicks: report.ticks,
      geologyLabels: report.geologyLabels,
      ageAgeOverlaps,
      ageTipOverlaps,
      ageBranchOverlaps,
      leaderCrossings: report.leaderCrossings,
      maxAgeEdgeDistance: report.maxAgeEdgeDistance,
      maxLeaderLength: report.maxLeaderLength,
      collisionStat: report.collisionStat,
      typography,
      stress18px: {
        ageAgeOverlaps: stressAgeAgeOverlaps,
        ageTipOverlaps: stressAgeTipOverlaps,
        ageBranchOverlaps: stressAgeBranchOverlaps,
        maxAgeEdgeDistance: stressReport.maxAgeEdgeDistance,
        maxLeaderLength: stressReport.maxLeaderLength,
        leaderCrossings: stressReport.leaderCrossings,
        agesBeyondTimePlot: stressReport.agesBeyondTimePlot,
        collisionStat: stressReport.collisionStat
      },
      shortLeaderRegression,
      adonisLocalRegression,
      multiSource,
      svgWidth: report.svgWidth,
      status: report.status.trim()
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
