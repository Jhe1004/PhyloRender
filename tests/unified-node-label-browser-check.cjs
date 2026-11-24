const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const phylogenyScreenshotPath = process.env.PHYLORENDER_PHYLOGENY_SCREENSHOT;
const extremeScreenshotPath = process.env.PHYLORENDER_EXTREME_SCREENSHOT;
const largeMinimumLeaderScreenshotPath = process.env.PHYLORENDER_LARGE_MIN_LEADER_SCREENSHOT;
const nodeOwnershipScreenshotPath = process.env.PHYLORENDER_NODE_OWNERSHIP_SCREENSHOT;

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

function treeFile(name, text) {
  return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  page.setDefaultTimeout(120000);
  page.on("pageerror", error => console.error("页面错误：", error));
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });

    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length > 100);
    await page.locator("#support-decimals").evaluate(element => {
      element.value = "auto";
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => [...document.querySelectorAll("#tree-svg .support-label")]
      .some(element => element.textContent === "–/–"));
    await setRange(page, "#support-min-size", 14);
    await setRange(page, "#support-size", 18);
    const extremeMinimumRegression = await page.evaluate(() => {
      const label = [...document.querySelectorAll("#tree-svg .support-label")]
        .find(element => element.textContent === "–/–");
      const box = element => {
        const rect = element.getBBox();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const overlaps = (a, b, padding = 1) => a.x < b.x + b.width + padding
        && a.x + a.width + padding > b.x
        && a.y < b.y + b.height + padding
        && a.y + a.height + padding > b.y;
      const labelBox = box(label);
      const overlappingTips = [...document.querySelectorAll("#tree-svg .tip-label")]
        .filter(tip => overlaps(labelBox, box(tip)))
        .map(tip => tip.textContent);
      return {
        font: Number(label.getAttribute("font-size")),
        edgeDistance: Number(label.getAttribute("data-edge-distance")),
        overlappingTips,
        collisionCount: Number(document.querySelector("#collision-count")?.textContent || NaN),
      };
    });
    if (extremeScreenshotPath) {
      const problemLabel = page.locator("#tree-svg .support-label").filter({ hasText: /^—\/–$/ });
      await problemLabel.scrollIntoViewIfNeeded();
      const problemBox = await problemLabel.boundingBox();
      await page.screenshot({
        path: extremeScreenshotPath,
        clip: {
          x: Math.max(0, problemBox.x - 230),
          y: Math.max(0, problemBox.y - 190),
          width: Math.min(650, 1800 - Math.max(0, problemBox.x - 230)),
          height: Math.min(430, 1200 - Math.max(0, problemBox.y - 190)),
        },
      });
    }
    assert.ok(extremeMinimumRegression.font >= 14, "自动避让不得突破用户设置的 14 px 最小字号");
    assert.ok(extremeMinimumRegression.edgeDistance <= 320.5, "极端最小字号允许扩展局部搜索，不应移到图外");
    assert.ok(Number.isFinite(extremeMinimumRegression.collisionCount), "极端字号组合仍须报告排版冲突状态");
    await setRange(page, "#support-min-size", 9);
    await setRange(page, "#support-size", 16);
    const nodeOwnershipRegression = await page.evaluate(() => {
      const label = [...document.querySelectorAll("#tree-svg .support-label")]
        .find(element => element.textContent === "–/–");
      const box = label.getBBox();
      return {
        font: Number(label.getAttribute("font-size")),
        position: label.getAttribute("data-auto-position"),
        ownerDistance: Number(label.getAttribute("data-edge-distance")),
        nearestOtherDistance: Number(label.getAttribute("data-nearest-other-node-distance")),
        ownershipClear: label.getAttribute("data-node-ownership-clear"),
        ownershipMethod: label.dataset.nodeOwnershipMethod,
        arrowDrawn: label.dataset.nodeArrowDrawn,
        node: {
          x: Number(label.getAttribute("data-node-x")),
          y: Number(label.getAttribute("data-node-y")),
        },
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        collisionCount: Number(document.querySelector("#collision-count")?.textContent || NaN),
      };
    });
    assert.equal(nodeOwnershipRegression.ownershipMethod, "true-node-arrow", "开启箭头时以真实端点表达归属，不强制最近节点");
    assert.equal(nodeOwnershipRegression.arrowDrawn, "true", "放宽归属距离限制必须有箭头");
    assert.ok(Number.isFinite(nodeOwnershipRegression.collisionCount), "节点归属回归仍须报告排版冲突状态");
    if (nodeOwnershipScreenshotPath) {
      const problemLabel = page.locator("#tree-svg .support-label").filter({ hasText: /^—\/–$/ });
      await problemLabel.scrollIntoViewIfNeeded();
      const problemBox = await problemLabel.boundingBox();
      await page.screenshot({
        path: nodeOwnershipScreenshotPath,
        clip: {
          x: Math.max(0, problemBox.x - 230),
          y: Math.max(0, problemBox.y - 190),
          width: Math.min(650, 1800 - Math.max(0, problemBox.x - 230)),
          height: Math.min(430, 1200 - Math.max(0, problemBox.y - 190)),
        },
      });
    }
    await setRange(page, "#support-min-size", 16);
    await setRange(page, "#support-size", 20);
    const largeMinimumLeaderRegression = await page.evaluate(() => {
      const label = [...document.querySelectorAll("#tree-svg .support-label")]
        .find(element => element.textContent === "–/–");
      const id = label.getAttribute("data-label-id");
      const leader = [...document.querySelectorAll("#tree-svg .support-leader")]
        .find(element => element.getAttribute("data-leader-id") === id);
      const halo = [...document.querySelectorAll("#tree-svg .support-leader-halo")]
        .find(element => element.getAttribute("data-leader-halo-id") === id);
      return {
        font: Number(label.getAttribute("font-size")),
        edgeDistance: Number(label.getAttribute("data-edge-distance")),
        leaderRequired: label.getAttribute("data-leader-required"),
        planCrossings: Number(label.getAttribute("data-leader-plan-crossings")),
        planLength: Number(label.getAttribute("data-leader-plan-length")),
        planObstacleHits: Number(label.getAttribute("data-leader-plan-obstacle-hits")),
        leaderExists: Boolean(leader),
        leaderLength: leader ? Number(leader.getAttribute("data-leader-length")) : null,
        leaderTag: leader?.tagName.toLowerCase() || null,
        straightLeader: leader?.getAttribute("data-straight-leader") || null,
        crossingsBridged: leader?.getAttribute("data-crossings-bridged") || null,
        haloExists: Boolean(halo),
        leaderStrokeWidth: leader ? Number.parseFloat(getComputedStyle(leader).strokeWidth) : null,
        leaderStrokeOpacity: leader ? Number.parseFloat(getComputedStyle(leader).strokeOpacity) : null,
        leaderDasharray: leader ? getComputedStyle(leader).strokeDasharray : null,
      };
    });
    if (!largeMinimumLeaderRegression.leaderExists) console.error("20/16 px 引导线缺失", largeMinimumLeaderRegression);
    assert.equal(largeMinimumLeaderRegression.leaderExists, true, "距节点较远的 Aconitum 密集节点标注必须显示箭头");
    assert.ok(largeMinimumLeaderRegression.leaderLength <= 380, "大字号可使用扩展搜索，但箭头不可无限延长");
    assert.equal(largeMinimumLeaderRegression.leaderTag, "line", "Aconitum 密集节点标注的箭头连接线必须是单一直线元素");
    assert.equal(largeMinimumLeaderRegression.straightLeader, "true", "Aconitum 密集节点标注的箭头连接线不得包含折点");
    if (largeMinimumLeaderRegression.planCrossings > 0) {
      assert.equal(largeMinimumLeaderRegression.crossingsBridged, "true", "不可避免的穿枝路线必须标记为已桥接");
      assert.equal(largeMinimumLeaderRegression.haloExists, true, "穿枝引导线必须使用白色底衬与树枝分开");
    }
    assert.ok(largeMinimumLeaderRegression.leaderStrokeWidth >= 1.1, "节点引导线必须具有清晰可见的线宽");
    assert.ok(largeMinimumLeaderRegression.leaderStrokeOpacity >= .85, "节点引导线不得因透明度过低而难以辨认");
    assert.ok(
      /4px.*2.5px/.test(largeMinimumLeaderRegression.leaderDasharray),
      "节点引导线默认使用清楚的短虚线",
    );
    if (largeMinimumLeaderScreenshotPath) {
      const problemLabel = page.locator("#tree-svg .support-label").filter({ hasText: /^—\/–$/ });
      await problemLabel.scrollIntoViewIfNeeded();
      const problemBox = await problemLabel.boundingBox();
      await page.screenshot({
        path: largeMinimumLeaderScreenshotPath,
        clip: {
          x: Math.max(0, problemBox.x - 230),
          y: Math.max(0, problemBox.y - 190),
          width: Math.min(650, 1800 - Math.max(0, problemBox.x - 230)),
          height: Math.min(430, 1200 - Math.max(0, problemBox.y - 190)),
        },
      });
    }
    await page.locator('.settings-nav [data-settings-target="labels"]').click();
    await page.locator("#full-support-style").selectOption("number", { force: true });
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .support-label").length > 150);
    await setRange(page, "#support-min-size", 9);
    await setRange(page, "#support-size", 12);
    const realTree12 = await page.locator("#tree-svg .support-label").evaluateAll(labels => labels.map(label => Number(label.getAttribute("font-size"))));
    await setRange(page, "#support-size", 18);
    const realTree18 = await page.locator("#tree-svg .support-label").evaluateAll(labels => labels.map(label => Number(label.getAttribute("font-size"))));
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    assert.equal(Math.max(...realTree12), 12, "真实系统发育树必须实际使用 12 px 首选字号");
    assert.equal(Math.max(...realTree18), 18, "提高首选字号后真实系统发育树必须实际出现 18 px 标注");
    assert.ok(mean(realTree18) > mean(realTree12), "提高首选字号必须提高真实系统发育树的实际平均字号");
    assert.ok(realTree18.every(size => size >= 9 && size <= 18), "真实系统发育树字号不得越过首选值或自动避让最小值");
    await setRange(page, "#support-min-size", 9);
    await setRange(page, "#support-size", 22);
    const phylogenyLocalStress = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("#tree-svg .support-label")];
      const leaders = [...document.querySelectorAll("#tree-svg .support-leader")];
      const box = element => {
        const rect = element.getBBox();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const overlaps = (a, b, pad = 1) => a.x < b.x + b.width + pad
        && a.x + a.width + pad > b.x
        && a.y < b.y + b.height + pad
        && a.y + a.height + pad > b.y;
      const rows = labels.map(label => ({
        id: label.getAttribute("data-label-id"),
        text: label.textContent,
        font: Number(label.getAttribute("font-size")),
        edgeDistance: Number(label.getAttribute("data-edge-distance")),
        box: box(label),
      }));
      const tipBoxes = [...document.querySelectorAll("#tree-svg .tip-label")].map(box);
      const branches = [...document.querySelectorAll("#tree-svg .branch")].map(line => ({
        x1: Number(line.getAttribute("x1")), y1: Number(line.getAttribute("y1")),
        x2: Number(line.getAttribute("x2")), y2: Number(line.getAttribute("y2")),
      }));
      const segmentHits = (segment, rect, pad = 3) => {
        const left = rect.x - pad, right = rect.x + rect.width + pad;
        const top = rect.y - pad, bottom = rect.y + rect.height + pad;
        const minX = Math.min(segment.x1, segment.x2), maxX = Math.max(segment.x1, segment.x2);
        const minY = Math.min(segment.y1, segment.y2), maxY = Math.max(segment.y1, segment.y2);
        if (maxX < left || minX > right || maxY < top || minY > bottom) return false;
        return segment.y1 === segment.y2
          ? segment.y1 >= top && segment.y1 <= bottom
          : segment.x1 >= left && segment.x1 <= right;
      };
      const pointerHits = (segment, rect, pad = 1.5) => {
        const left = rect.x - pad, right = rect.x + rect.width + pad;
        const top = rect.y - pad, bottom = rect.y + rect.height + pad;
        const inside = point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
        const a = { x: segment.x1, y: segment.y1 };
        const b = { x: segment.x2, y: segment.y2 };
        if (inside(a) || inside(b)) return true;
        const orientation = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        const intersects = (p1, p2, q1, q2) => {
          const o1 = orientation(p1, p2, q1);
          const o2 = orientation(p1, p2, q2);
          const o3 = orientation(q1, q2, p1);
          const o4 = orientation(q1, q2, p2);
          return ((o1 <= 0 && o2 >= 0) || (o1 >= 0 && o2 <= 0))
            && ((o3 <= 0 && o4 >= 0) || (o3 >= 0 && o4 <= 0));
        };
        const corners = [
          { x: left, y: top }, { x: right, y: top },
          { x: right, y: bottom }, { x: left, y: bottom },
        ];
        return corners.some((corner, index) => intersects(a, b, corner, corners[(index + 1) % 4]));
      };
      const leaderLabelOverlaps = leaders.flatMap(leader => {
        const segment = {
          x1: Number(leader.getAttribute("x1")), y1: Number(leader.getAttribute("y1")),
          x2: Number(leader.getAttribute("x2")), y2: Number(leader.getAttribute("y2")),
        };
        const owner = leader.getAttribute("data-leader-id");
        return rows
          .filter(row => row.id !== owner && pointerHits(segment, row.box))
          .map(row => ({ leader: owner, crossedLabel: row.text }));
      });
      const residuals = rows.flatMap((row, index) => {
        const labelHit = rows.find((other, otherIndex) => otherIndex !== index && overlaps(row.box, other.box));
        const tipHit = tipBoxes.some(other => overlaps(row.box, other));
        const branchHit = branches.some(branch => segmentHits(branch, row.box));
        return labelHit || tipHit || branchHit
          ? [{ text: row.text, font: row.font, labelHit: labelHit?.text || null, tipHit, branchHit, box: row.box }]
          : [];
      });
      return {
        fontRange: [Math.min(...rows.map(row => row.font)), Math.max(...rows.map(row => row.font))],
        maxEdgeDistance: Math.max(...rows.map(row => row.edgeDistance)),
        maxLeaderLength: Math.max(0, ...leaders.map(leader => Number(leader.getAttribute("data-leader-length")) || 0)),
        nonStraightLeaders: leaders.filter(leader => leader.tagName.toLowerCase() !== "line"
          || leader.getAttribute("data-straight-leader") !== "true").length,
        collisionCount: Number(document.querySelector("#collision-count")?.textContent || NaN),
        representativeDenseLabel: rows.find(row => row.text.includes("0.890")) || rows[0] || null,
        farthest: rows.sort((a, b) => b.edgeDistance - a.edgeDistance).slice(0, 5),
        leaderLabelOverlaps,
        residuals,
      };
    });
    assert.ok(phylogenyLocalStress.maxEdgeDistance <= 320.5, "大字号支持有限扩展搜索");
    assert.ok(phylogenyLocalStress.maxLeaderLength <= 380, "扩大距离限制后仍应避免无界远移");
    assert.equal(phylogenyLocalStress.nonStraightLeaders, 0, "系统发育树的全部引导线都必须是直线");
    assert.ok(phylogenyLocalStress.fontRange[0] >= 9, "任何系统发育树节点数字都不得小于 9 px 可读底线");
    if (phylogenyLocalStress.leaderLabelOverlaps.length) {
      console.error("可读字号优先后无法完全避开的引导线交叠", phylogenyLocalStress.leaderLabelOverlaps);
    }
    if (phylogenyLocalStress.collisionCount) console.error("可读字号优先后的系统发育树局部冲突", phylogenyLocalStress.residuals);
    assert.ok(phylogenyLocalStress.representativeDenseLabel, "默认真实树应包含可检查的节点标注");
    assert.ok(phylogenyLocalStress.representativeDenseLabel.edgeDistance <= 320.5, "密集区代表节点使用有限扩展搜索");
    if (phylogenyScreenshotPath) await page.locator("#tree-svg").screenshot({ path: phylogenyScreenshotPath });

    const phylogeny = "((A:1,B:1)88:1,(C:1,D:2)77:1);";
    await page.locator("#tree-file").setInputFiles(treeFile("four-tip-phylogeny.tre", phylogeny));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .support-label").length === 2);
    await setRange(page, "#support-min-size", 9);
    await setRange(page, "#support-size", 18);
    let phylogenyFonts = await page.locator("#tree-svg .support-label").evaluateAll(labels => labels.map(label => Number(label.getAttribute("font-size"))));
    assert.deepEqual(phylogenyFonts, [18, 18], "稀疏系统发育树必须优先使用首选字号，而不是自动跳到最小字号");
    await setRange(page, "#support-size", 12);
    phylogenyFonts = await page.locator("#tree-svg .support-label").evaluateAll(labels => labels.map(label => Number(label.getAttribute("font-size"))));
    assert.deepEqual(phylogenyFonts, [12, 12], "改变首选字号必须直接改变系统发育树节点标注字号");

    const annotatedTimeTree = "((A:5,B:5)[&height=5,posterior=0.97]:5,(C:4,D:4):6)[&height=10,posterior=1];";
    await page.locator("#tree-file").setInputFiles(treeFile("beast-annotated-time.tree", annotatedTimeTree));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-tip-label").length === 4);
    await page.locator('.settings-nav [data-settings-target="data"]').click();
    assert.ok(await page.locator("#node-data-section").isVisible(), "时间树的数据页必须显示统一的节点数据入口");
    assert.equal(await page.locator(".support-data-card").isVisible(), false, "Dating 树不得显示支持率上传入口");
    await page.locator('.settings-nav [data-settings-target="labels"]').click();
    const demoLabels = await page.locator("#tree-svg .time-age-label").allTextContents();
    assert.ok(demoLabels.every(label => !label.includes("0.97")), "Dating 树不得显示主树中的 posterior");
    assert.equal(await page.locator("#tree-svg .full-support-branch").count(), 0, "Dating 树不得用粗枝表示满支持率");
    assert.equal(await page.locator('details:has(#full-support-style)').isVisible(), false, "Dating 树不得显示支持率显示规则");
    assert.ok(await page.locator("#support-size").count(), "时间树必须保留统一的首选字号控件");
    assert.ok(await page.locator("#support-min-size").count(), "时间树必须保留统一的自动避让最小字号控件");

    const timeTree = "(((A:4,B:4):1,C:5):5,((D:3,E:3):2,F:5):5);";
    await page.locator("#tree-file").setInputFiles(treeFile("four-tip-time.tre", timeTree));
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-tip-label").length === 6);
    await setRange(page, "#support-min-size", 9);
    await setRange(page, "#support-size", 18);
    let timeFonts = await page.locator("#tree-svg .time-age-label").evaluateAll(labels => labels.map(label => Number(label.getAttribute("font-size"))));
    assert.ok(timeFonts.length === 5 && timeFonts.some(size => size === 18), "时间树必须在存在安全位置的节点使用首选字号");
    assert.ok(timeFonts.every(size => size >= 9 && size <= 18), "时间树仅可在首选字号和最小字号之间逐级缩小");

    const supportTree = "(((A:1,B:1)88:1,C:1)77:1,((D:1,E:1)66:1,F:1)55:1);";
    await page.locator("#support-data-files").setInputFiles(treeFile("bootstrap.any-extension", supportTree));
    await page.waitForTimeout(100);
    let combinedLabels = await page.locator("#tree-svg .time-age-label").allTextContents();
    assert.equal(await page.locator("#support-data-list .node-data-item").count(), 0, "Dating 树必须拒绝附加支持率文件");
    assert.ok(combinedLabels.every(label => !label.includes("88") && !label.includes("66")), "Dating 树不得显示附加支持率");

    const otherTree = "(((A:1,B:1)1.2:1,C:1)2.3:1,((D:1,E:1)3.4:1,F:1)4.5:1);";
    await page.locator("#other-data-files").setInputFiles(treeFile("quartet-score.custom", otherTree));
    await page.waitForFunction(() => document.querySelectorAll("#other-data-list .node-data-item").length === 1);
    combinedLabels = await page.locator("#tree-svg .time-age-label").allTextContents();
    assert.ok(combinedLabels.includes("4.00 | 1.20"), "时间树必须能在同一节点组合时间和其他数字");
    assert.ok(combinedLabels.includes("3.00 | 3.40"), "其他节点数字必须保持自己的格式并匹配正确节点");

    await page.locator('.settings-nav [data-settings-target="tree"]').click();
    await page.locator("#ladder-direction").selectOption("large-top");
    await page.waitForFunction(() => document.querySelectorAll("#tree-svg .time-tip-label").length === 6);
    assert.equal(await page.locator("#support-data-list .node-data-item").count(), 0, "调整共享树形设置后 Dating 树仍不得接收支持率来源");
    assert.equal(await page.locator("#other-data-list .node-data-item").count(), 1, "调整共享树形设置后时间树其他数字来源不得丢失");
    combinedLabels = await page.locator("#tree-svg .time-age-label").allTextContents();
    assert.ok(combinedLabels.includes("4.00 | 1.20"), "共享树形设置重绘后时间与其他数字标注必须保持不变");
    timeFonts = await page.locator("#tree-svg .time-age-label").evaluateAll(labels => labels.map(label => Number(label.getAttribute("font-size"))));
    assert.ok(timeFonts.every(size => size >= 9 && size <= 18), "时间树自动避让字号必须始终位于首选字号和最小字号之间");

    console.log(JSON.stringify({
      phylogenyPreferred18: phylogenyFonts.length,
      extremeMinimumRegression,
      nodeOwnershipRegression,
      largeMinimumLeaderRegression,
      realPhylogenyFontMeans: [Number(mean(realTree12).toFixed(3)), Number(mean(realTree18).toFixed(3))],
      phylogenyLocalStress,
      beastPosteriorVisible: demoLabels.some(label => label.includes("0.97")),
      timeCombinedLabels: combinedLabels,
      timeFontRange: [Math.min(...timeFonts), Math.max(...timeFonts)],
      preservedSupportSources: await page.locator("#support-data-list .node-data-item").count(),
      preservedOtherSources: await page.locator("#other-data-list .node-data-item").count()
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
