const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const largeTimeTreePath = process.argv[3] || null;
const screenshotPath = process.env.PHYLORENDER_NODE_ARROW_SCREENSHOT;

async function arrowAudit(page) {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll("#tree-svg .support-label, #tree-svg .time-age-label")];
    const arrows = [...document.querySelectorAll("#tree-svg .node-label-arrow")];
    const heads = [...document.querySelectorAll("#tree-svg .node-label-arrowhead")];
    const arrowById = new Map(arrows.map(arrow => [arrow.dataset.arrowLabelId, arrow]));
    const headIds = new Set(heads.map(head => head.dataset.arrowheadLabelId));
    const axisAngles = arrows.map(arrow => Number(arrow.dataset.axisAngleDegrees)).filter(Number.isFinite);
    const headMetrics = heads.map(head => {
      const box = head.getBBox();
      return {
        length: Number(head.dataset.arrowheadLength),
        halfWidth: Number(head.dataset.arrowheadHalfWidth),
        maximumExtent: Math.max(box.width, box.height),
      };
    });
    return {
      mode: document.body.classList.contains("time-tree-mode") ? "time" : "phylogeny",
      labels: labels.length,
      arrows: arrows.length,
      heads: heads.length,
      missing: labels.filter(label => !arrowById.has(label.dataset.labelId)).map(label => label.textContent),
      missingHeads: labels.filter(label => !headIds.has(label.dataset.labelId)).map(label => label.textContent),
      misdirected: labels.filter(label => {
        const arrow = arrowById.get(label.dataset.labelId);
        return arrow && (
          arrow.dataset.arrowPointsToNode !== "true"
          || Math.abs(Number(arrow.getAttribute("x2")) - Number(label.dataset.nodeX)) > .01
          || Math.abs(Number(arrow.getAttribute("y2")) - Number(label.dataset.nodeY)) > .01
        );
      }).map(label => label.textContent),
      bent: arrows.filter(arrow => arrow.tagName.toLowerCase() !== "line"
        || arrow.dataset.straightLeader !== "true").length,
      insufficientAngle: arrows.filter(arrow => +arrow.dataset.axisAngleDegrees < 19.99 || +arrow.dataset.axisAngleDegrees > 80.01 || +arrow.dataset.leaderLength < 13.99).length,
      solidArrows: arrows.filter(arrow => getComputedStyle(arrow).strokeDasharray === "none").length,
      minimumAxisAngle: axisAngles.length ? Math.min(...axisAngles) : null,
      emptyHeads: heads.filter(head => !head.getAttribute("d")?.trim()).length,
      maximumHeadExtent: headMetrics.length ? Math.max(...headMetrics.map(metric => metric.maximumExtent)) : 0,
      headLengths: [...new Set(headMetrics.map(metric => metric.length))],
      headHalfWidths: [...new Set(headMetrics.map(metric => metric.halfWidth))],
      optionalControl: {
        checked: document.querySelector("#leader-lines").checked,
        disabled: document.querySelector("#leader-lines").disabled,
      },
    };
  });
}

function assertAudit(audit, expectedMode, enabled = true) {
  assert.equal(audit.mode, expectedMode);
  assert.ok(audit.labels > 0, "测试树必须实际绘制节点数字");
  assert.equal(audit.arrows, enabled ? audit.labels : 0, enabled ? "开启时每个节点数字必须恰有一条指向线" : "关闭时不得绘制箭头线");
  assert.equal(audit.heads, enabled ? audit.labels : 0, enabled ? "开启时每个节点数字必须恰有一个小箭头尖" : "关闭时不得绘制箭头尖");
  if (enabled) {
    assert.deepEqual(audit.missing, [], "开启时不得有节点数字缺少指向线");
    assert.deepEqual(audit.missingHeads, [], "开启时不得有节点数字缺少箭头尖");
  }
  assert.deepEqual(audit.misdirected, [], "箭头尖端必须等于文字保存的真实节点坐标");
  assert.equal(audit.bent, 0, "箭头连接线必须保持单一直线");
  assert.equal(audit.insufficientAngle, 0, "引导线与水平线夹角 20–80 度，且长度至少 14 逻辑单位");
  assert.equal(audit.emptyHeads, 0, "箭头尖不得为空");
  if (enabled) {
    assert.equal(audit.solidArrows, 0, "虚线已区分引导线和树枝，不强制斜角或偏移文字端点");
    assert.deepEqual(audit.headLengths, [1.8], "箭头头部长度必须缩小到 1.8 px");
    assert.deepEqual(audit.headHalfWidths, [0.85], "箭头头部半宽必须缩小到 0.85 px");
    assert.ok(audit.maximumHeadExtent <= 2.7, "箭头头部的实际外框必须保持小巧");
  }
  assert.deepEqual(audit.optionalControl, { checked: enabled, disabled: false }, "节点箭头开关必须可操作并反映当前状态");
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on("pageerror", error => console.error("页面错误：", error));
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.PhyloRenderAgent?.loadFigure);
    assert.deepEqual(await page.locator("#leader-lines").evaluate(element => ({ checked: element.checked, disabled: element.disabled })),
      { checked: true, disabled: false }, "网页默认必须开启节点箭头，同时允许用户关闭");

    const ordinary = await page.evaluate(async () => window.PhyloRenderAgent.loadFigure({
      main_tree: {
        name: "node-arrow-ordinary.tre",
        content: "(((A:1,B:1)0.83:1,C:1.7)0.72:1,((D:1,E:1)0.64:1,F:2.2)0.91:1);",
      },
      options: {
        support: { decimals: 2, full_support_marker: "number" },
        labels: { auto_placement: true, node_arrows: true },
      },
    }));
    assert.equal(ordinary.report.node_arrows.required, true);
    assert.equal(ordinary.report.node_arrows.missing, 0);
    assert.equal(ordinary.report.node_arrows.misdirected, 0);
    assert.equal(ordinary.report.node_arrows.angle_and_length_are_soft_preferences, true);
    assert.equal(ordinary.report.leader_lines_unbridged_crossings, 0);
    assert.equal(ordinary.report.node_arrows.line_style, "dashed");
    assert.equal(ordinary.report.node_arrows.arrowhead_length, 1.8);
    assert.equal(ordinary.report.node_arrows.arrowhead_half_width, 0.85);
    assert.equal(ordinary.normalized_spec.options.labels.leader_lines, true);
    assert.equal(ordinary.normalized_spec.options.labels.node_arrows, true);
    assertAudit(await arrowAudit(page), "phylogeny");

    await page.locator('.settings-nav [data-settings-target="labels"]').click();
    const beforeToggle = await page.locator("#tree-svg .support-label").evaluateAll(labels =>
      labels.map(label => ({ id: label.dataset.labelId, x: label.getAttribute("x"), y: label.getAttribute("y") })));
    await page.locator("#leader-lines").uncheck();
    assertAudit(await arrowAudit(page), "phylogeny", false);
    const afterToggleOff = await page.locator("#tree-svg .support-label").evaluateAll(labels =>
      labels.map(label => ({ id: label.dataset.labelId, x: label.getAttribute("x"), y: label.getAttribute("y") })));
    assert.deepEqual(afterToggleOff, beforeToggle, "关闭箭头不应让已经排好的数字跳位");
    await page.locator("#leader-lines").check();
    assertAudit(await arrowAudit(page), "phylogeny");

    const first = page.locator("#tree-svg .support-label").first();
    const labelId = await first.getAttribute("data-label-id");
    const before = await page.locator(`#tree-svg .node-label-arrow[data-arrow-label-id="${labelId}"]`).evaluate(arrow => ({
      x1: Number(arrow.getAttribute("x1")), y1: Number(arrow.getAttribute("y1")),
      x2: Number(arrow.getAttribute("x2")), y2: Number(arrow.getAttribute("y2")),
    }));
    const box = await first.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2 + 18, { steps: 4 });
    await page.mouse.up();
    const after = await page.locator(`#tree-svg .node-label-arrow[data-arrow-label-id="${labelId}"]`).evaluate(arrow => ({
      x1: Number(arrow.getAttribute("x1")), y1: Number(arrow.getAttribute("y1")),
      x2: Number(arrow.getAttribute("x2")), y2: Number(arrow.getAttribute("y2")),
    }));
    assert.ok(Math.hypot(after.x1 - before.x1, after.y1 - before.y1) > 2, "拖动数字后箭头文字端必须更新");
    assert.equal(after.x2, before.x2, "拖动数字不得改变箭头所属节点 x 坐标");
    assert.equal(after.y2, before.y2, "拖动数字不得改变箭头所属节点 y 坐标");
    assertAudit(await arrowAudit(page), "phylogeny");

    const ordinaryOff = await page.evaluate(async () => window.PhyloRenderAgent.loadFigure({
      main_tree: {
        name: "node-arrow-ordinary-off.tre",
        content: "(((A:1,B:1)0.83:1,C:1.7)0.72:1,((D:1,E:1)0.64:1,F:2.2)0.91:1);",
      },
      options: {
        support: { decimals: 2, full_support_marker: "number" },
        labels: { auto_placement: true, node_arrows: false },
      },
    }));
    assert.equal(ordinaryOff.report.node_arrows.enabled, false);
    assert.equal(ordinaryOff.report.node_arrows.required, false);
    assert.equal(ordinaryOff.report.node_arrows.labels, 4);
    assert.equal(ordinaryOff.report.node_arrows.arrows, 0);
    assert.equal(ordinaryOff.report.node_arrows.missing, 0);
    assert.equal(ordinaryOff.report.node_arrows.unexpected, 0);
    assert.equal(ordinaryOff.report.safe_for_export, true);
    assert.equal(ordinaryOff.normalized_spec.options.labels.node_arrows, false);
    assert.equal(ordinaryOff.normalized_spec.options.labels.leader_lines, false);
    assertAudit(await arrowAudit(page), "phylogeny", false);
    const exportedOff = await page.evaluate(() => window.PhyloRenderAgent.currentFigure());
    assert.doesNotMatch(exportedOff.svg, /node-label-arrow/, "关闭箭头后的 SVG 不得残留箭头元素");

    const legacyOff = await page.evaluate(async () => window.PhyloRenderAgent.loadFigure({
      main_tree: {
        name: "node-arrow-legacy-off.tre",
        content: "(((A:1,B:1)0.83:1,C:1.7)0.72:1,((D:1,E:1)0.64:1,F:2.2)0.91:1);",
      },
      options: { support: { decimals: 2, full_support_marker: "number" }, labels: { leader_lines: false } },
    }));
    assert.equal(legacyOff.normalized_spec.options.labels.node_arrows, false, "旧 leader_lines=false 必须继续关闭箭头");
    assertAudit(await arrowAudit(page), "phylogeny", false);

    const time = await page.evaluate(async () => window.PhyloRenderAgent.loadFigure({
      main_tree: {
        name: "node-arrow-time.tre",
        content: "(((A:1,B:1):1,C:2):1,((D:1,E:1):1,F:2):1);",
      },
      options: { labels: { auto_placement: true, node_arrows: true }, time: { show_node_ages: true, age_decimals: 2 } },
    }));
    assert.equal(time.report.tree_type, "time");
    assert.equal(time.report.node_arrows.missing, 0);
    assert.equal(time.report.node_arrows.misdirected, 0);
    assertAudit(await arrowAudit(page), "time");

    let largeTime = null;
    if (largeTimeTreePath) {
      await page.locator("#tree-file").setInputFiles(largeTimeTreePath);
      await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-age-label").length > 100, null, { timeout: 60000 });
      largeTime = await arrowAudit(page);
      assert.ok(largeTime.labels > 150, "大型时间树必须完整绘制内部节点文字");
      assertAudit(largeTime, "time");
    }

    const exported = await page.evaluate(() => window.PhyloRenderAgent.currentFigure());
    assert.match(exported.svg, /node-label-arrow/);
    assert.match(exported.svg, /node-label-arrowhead/);
    if (screenshotPath) await page.locator("#tree-svg").screenshot({ path: screenshotPath });
    console.log(JSON.stringify({ ordinary: ordinary.report.node_arrows, ordinaryOff: ordinaryOff.report.node_arrows, legacyOff: legacyOff.report.node_arrows, time: time.report.node_arrows, largeTime, drag: { before, after } }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
