const assert = require("node:assert/strict");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { basename, join } = require("node:path");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const treePath = process.argv[3] || null;
const outgroups = (process.env.PHYLORENDER_TEST_OUTGROUPS || "")
  .split("|")
  .map(value => value.trim())
  .filter(Boolean);

function balancedTree(labels) {
  if (labels.length === 1) return labels[0];
  const middle = Math.floor(labels.length / 2);
  return `(${balancedTree(labels.slice(0, middle))}:1,${balancedTree(labels.slice(middle))}:1)0.95`;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    if (treePath) {
      const treeContent = await readFile(treePath, "utf8");
      await page.evaluate(async ({ name, content, outgroup }) => {
        window.__phyloRenderPanelTestFigure = await window.PhyloRenderAgent.loadFigure({
          main_tree: { name, content },
          ...(outgroup.length ? { rooting: { outgroup } } : {}),
        });
      }, { name: basename(treePath), content: treeContent, outgroup: outgroups });
      await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length > 68);
    } else {
      const treeContent = `${balancedTree(Array.from({ length: 80 }, (_, index) => `Panel_sample_${index + 1}`))};`;
      await page.evaluate(async content => {
        window.__phyloRenderPanelTestFigure = await window.PhyloRenderAgent.loadFigure({
          main_tree: { name: "balanced-80.newick", content },
        });
      }, treeContent);
      await page.waitForFunction(() => document.querySelectorAll("#tree-svg .tip-label").length === 80);
    }
    const fullResult = await page.evaluate(async () => {
      const figure = window.__phyloRenderPanelTestFigure || await window.PhyloRenderAgent.currentFigure();
      return {
        report: figure.report.two_panel,
        pageSvgs: figure.panel_trees.map(item => item.svg),
        pages: figure.panel_trees.map(item => ({
          page: item.page_number,
          title: item.title,
          tipPoints: item.tip_points,
          nodePoints: item.node_points,
          readable: item.readable,
          width: item.width,
          sourceWidth: item.source_width,
          height: item.height,
          role: new DOMParser().parseFromString(item.svg, "image/svg+xml").documentElement
            .getAttribute("data-phylorender-panel-role"),
          usesSharedRenderer: /data-phylorender-renderer="shared"/.test(item.svg),
          validXml: (() => {
            const parsed = new DOMParser().parseFromString(item.svg, "image/svg+xml");
            return parsed.querySelector("parsererror") === null;
          })(),
          hasContinuation: item.svg.includes("Continued clade") || item.page_number > 1,
          incomingGuideCount: (() => {
            const parsed = new DOMParser().parseFromString(item.svg, "image/svg+xml");
            return parsed.querySelectorAll(".panel-incoming-guide[data-from-panel='1'][data-to-panel='2']").length;
          })(),
          incomingGuide: (() => {
            const parsed = new DOMParser().parseFromString(item.svg, "image/svg+xml");
            const guide = parsed.querySelector(".panel-incoming-guide");
            return guide ? {
              label: guide.querySelector(".panel-continuation-label")?.textContent.trim(),
              arrows: guide.querySelectorAll(".panel-continuation-arrowhead").length,
              verticalSpan: Number(guide.getAttribute("data-root-y"))
                - Number(guide.getAttribute("data-connector-top-y")),
            } : null;
          })(),
          continuationGapRatio: (() => {
            const parsed = new DOMParser().parseFromString(item.svg, "image/svg+xml");
            const rows = [...parsed.querySelectorAll(".tip-label")]
              .map(label => ({ y: Number(label.getAttribute("y")), text: label.textContent.trim() }))
              .sort((left, right) => left.y - right.y);
            const index = rows.findIndex(row => row.text.includes("Continued clade"));
            if (index < 2) return null;
            return (rows[index].y - rows[index - 1].y) / (rows[index - 1].y - rows[index - 2].y);
          })(),
          containsChineseContinuation: /(?:续见|承接|分支|[第] *\d+\/\d+ *页)/.test(item.svg),
          tipTexts: (() => {
            const container = document.createElement("div");
            container.innerHTML = item.svg;
            return [...container.querySelectorAll(".tip-label")].map(node => node.textContent.trim());
          })(),
        })),
      };
    });
    const result = { report: fullResult.report, pages: fullResult.pages };

    if (process.env.PHYLORENDER_A4_OUTPUT_DIR) {
      await mkdir(process.env.PHYLORENDER_A4_OUTPUT_DIR, { recursive: true });
      for (let index = 0; index < fullResult.pageSvgs.length; index++) {
        const svgPath = join(process.env.PHYLORENDER_A4_OUTPUT_DIR, `tree-panel-${index + 1}.svg`);
        await writeFile(svgPath, fullResult.pageSvgs[index]);
        const preview = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
        await preview.setContent(`<!doctype html><style>html,body{margin:0}</style>${fullResult.pageSvgs[index]}`);
        await preview.locator("svg").screenshot({ path: join(process.env.PHYLORENDER_A4_OUTPUT_DIR, `tree-panel-${index + 1}.png`) });
        await preview.close();
      }
    }

    assert.equal(result.pages.length, 2, "大型树必须只拆一次，不能超过两张图");
    assert.equal(result.report.panels, result.pages.length);
    assert.equal(result.report.maximum_panels, 2);
    assert.equal(result.report.split_by_complete_clades, true);
    assert.equal(result.report.continuation_markers, result.pages.length - 1);
    assert.equal(result.report.continuation_guides, result.pages.length - 1);
    assert.equal(result.report.configured_font_sizes_preserved, true);
    assert.equal(result.report.second_panel_is_complete_monophyletic_clade, true);
    assert.equal(result.report.uniform_panel_width, true);
    assert.equal(result.report.automatic_compact_tip_spacing, true);
    assert.equal(new Set(result.pages.map(item => item.width)).size, 1, "两张图必须使用完全相同的画布宽度");
    assert.ok(result.pages.every(item => item.sourceWidth > 0));
    assert.equal(result.pages[0].role, "overview");
    assert.equal(result.pages[1].role, "complete-monophyletic-clade");
    assert.ok(result.pages.every(item => item.width > 0 && item.height > 0));
    assert.ok(result.pages.every(item => item.usesSharedRenderer && item.validXml), "每张图都必须使用共享渲染器并保持为有效 SVG/XML");
    assert.ok(result.pages[0].hasContinuation, "主图必须标记拆出的完整分支");
    assert.ok(result.pages[0].continuationGapRatio > 1.5, "第一张图的续接分支必须与上方真实分支留出额外间隔");
    assert.equal(result.pages[1].hasContinuation, true);
    assert.equal(result.pages[0].incomingGuideCount, 0, "第一张图不应画接入枝");
    assert.equal(result.pages[1].incomingGuideCount, 1, "第二张图必须在根部画一条来自第一张图的接入枝");
    assert.equal(result.pages[1].incomingGuide.label, "Continued from Panel 1");
    assert.equal(result.pages[1].incomingGuide.arrows, 1, "图顶续接线必须有一个向上箭头");
    assert.ok(result.pages[1].incomingGuide.verticalSpan > 30, "续接线必须从根部延伸到图顶，不能只留短枝");
    assert.ok(result.pages.every(item => !item.containsChineseContinuation), "图内承接说明必须使用英文");
    assert.equal(result.pages[1].tipTexts.length, result.report.second_panel_tip_count,
      "第二张图必须包含该单系分支的全部末端");
    if (outgroups.length) {
      assert.equal(result.report.rooting_applied_before_split, true, "拆分必须在外类群定根之后进行");
      const includesName = (texts, name) => texts.includes(name) || texts.includes(name.replaceAll("_", " "));
      assert.ok(outgroups.every(name => includesName(result.pages[0].tipTexts, name)), "所有外类群都必须保留在第一页主图");
      assert.ok(result.pages.slice(1).every(item => outgroups.every(name => !includesName(item.tipTexts, name))), "第二张图不得重复包含外类群");
    }
    console.log(JSON.stringify({
      report: result.report,
      pages: result.pages.map(({ tipTexts, ...item }) => ({
        ...item,
        tipCount: tipTexts.length,
        matchedOutgroups: outgroups.filter(name => tipTexts.includes(name)),
      })),
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
