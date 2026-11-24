const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const svgPath = process.argv[2];
if (!svgPath) throw new Error("Usage: node rendered-leader-label-overlap-check.cjs /absolute/figure.svg [...]");

function segmentIntersectsRect(a, b, rect, padding = 1.5) {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  const inside = point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
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
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const results = [];
    for (const input of process.argv.slice(2)) {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(path.resolve(input)).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts?.ready);
      const report = await page.evaluate(source => {
        const labels = [...document.querySelectorAll(".support-label, .time-age-label")].map(label => {
          const box = label.getBBox();
          return {
            id: label.getAttribute("data-label-id"),
            text: label.textContent,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
          };
        });
        const leaders = [...document.querySelectorAll(".support-leader, .time-age-leader")].map(leader => ({
          id: leader.getAttribute("data-leader-id"),
          a: { x: Number(leader.getAttribute("x1")), y: Number(leader.getAttribute("y1")) },
          b: { x: Number(leader.getAttribute("x2")), y: Number(leader.getAttribute("y2")) },
        }));
        return { source, labels, leaders };
      }, input);
      const overlaps = report.leaders.flatMap(leader => report.labels
        .filter(label => label.id !== leader.id && segmentIntersectsRect(leader.a, leader.b, label.box))
        .map(label => ({ leader: leader.id, crossed: label.id, crossedText: label.text })));
      assert.deepEqual(overlaps, [], `${input}: 引导线不得穿过其他节点数字`);
      results.push({ file: input, labels: report.labels.length, leaders: report.leaders.length, overlaps: overlaps.length });
      await page.close();
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
