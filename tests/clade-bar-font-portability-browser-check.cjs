const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

function figureSpec({ longNames = false, vertical = false } = {}) {
  return {
    main_tree: {
      name: "clade-spacing.tre",
      content: "(((A_one:1,B_two:1):1,(C_three:1,D_four:1):1):1,(E_five:1,F_six:1):1);",
    },
    tip_label_overrides: longNames ? {
      A_one: "Aconitum specimen with a deliberately extended publication label",
      B_two: "毛茛科中文样品名称甲",
      C_three: "Clematis specimen 03",
    } : {
      A_one: "A",
      B_two: "B",
    },
    options: {
      layout: { mode: "aligned", ladderize: "file" },
      typography: {
        tips: { family: "Georgia, serif" },
        clades: { family: "Arial, sans-serif" },
      },
    },
    clades: [
      {
        clade_id: "inner",
        mrca_of: ["A_one", "B_two"],
        name: longNames ? "Clematis sect. Atragene" : "Inner",
        ...(longNames ? { name_segments: [
          { text: "Clematis ", family: "Georgia, serif", italic: true, bold: false },
          { text: "sect. ", family: "Arial, sans-serif", italic: false, color: "#6F4E9C" },
          { text: "Atragene", family: '"Times New Roman", serif', size: 16, italic: true },
        ] } : {}),
        color: "#0072B2",
        label_orientation: vertical ? "vertical" : "horizontal",
      },
      {
        clade_id: "outer",
        mrca_of: ["A_one", "D_four"],
        name: longNames ? "Outer clade with long name" : "Outer",
        color: "#D55E00",
      },
    ],
  };
}

async function standaloneGapReport(browser, svg) {
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><html><body>${svg}</body></html>`, { waitUntil: "load" });
    await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
    return await page.evaluate(() => [...document.querySelectorAll('.clade-bar[data-bar-part="body"]')].map(bar => {
      const tipIds = bar.dataset.tipNodeIds.split(",").filter(Boolean);
      const rights = tipIds.map(id => {
        const label = document.querySelector(`.tip-label[data-tip-node-id="${CSS.escape(id)}"]`);
        const box = label.getBBox();
        return box.x + box.width;
      });
      const actual = Number(bar.getAttribute("x1")) - Math.max(...rights);
      const expected = 14 + Number(bar.dataset.layoutShift || 0);
      return { actual, expected, error: actual - expected };
    }));
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.PhyloRenderAgent?.version === "1.7.0");

    const shortFirst = await page.evaluate(spec => window.PhyloRenderAgent.loadFigure(spec), figureSpec());
    const long = await page.evaluate(spec => window.PhyloRenderAgent.loadFigure(spec), figureSpec({ longNames: true, vertical: true }));
    const shortAgain = await page.evaluate(spec => window.PhyloRenderAgent.loadFigure(spec), figureSpec());

    for (const [name, figure] of [["short-first", shortFirst], ["long", long], ["short-again", shortAgain]]) {
      assert.equal(figure.report.clade_bar_spacing.valid, true, `${name}: live clade-bar spacing must pass`);
      assert.equal(figure.report.clade_bar_spacing.invalid, 0, `${name}: no live gap may drift`);
      assert.equal(figure.report.font_portability.bundled_fonts_ready, true, `${name}: bundled fonts must be ready`);
      assert.equal(figure.report.safe_for_export, true, `${name}: figure must remain safe for export`);
      assert.match(figure.svg, /data-embedded-fonts="true"/, `${name}: SVG must declare embedded fonts`);
      assert.match(figure.svg, /data:font\/woff2;base64,/, `${name}: SVG must contain embedded WOFF2 data`);
      assert.doesNotMatch(figure.svg, /url\(["']?https?:/i, `${name}: SVG must not depend on external font URLs`);
      const standalone = await standaloneGapReport(browser, figure.svg);
      assert.equal(standalone.length, 2, `${name}: both nested clade bars must survive export`);
      standalone.forEach(item => {
        assert.ok(item.actual >= 12, `${name}: standalone bar must not overlap a tip label`);
        assert.ok(Math.abs(item.error) <= 1, `${name}: standalone font metrics must match the layout metrics`);
      });
    }

    const richLabelData = await page.evaluate(svgSource => {
      const documentNode = new DOMParser().parseFromString(svgSource, "image/svg+xml");
      const label = [...documentNode.querySelectorAll(".clade-bar-label")]
        .find(element => element.textContent === "Clematis sect. Atragene");
      return {
        count: label?.getAttribute("data-segment-count"),
        segments: [...(label?.querySelectorAll("tspan") || [])].map(element => ({
          text: element.textContent,
          family: element.getAttribute("font-family"),
          size: element.getAttribute("font-size"),
          fill: element.getAttribute("fill"),
          weight: element.getAttribute("font-weight"),
          style: element.getAttribute("font-style"),
        })),
      };
    }, long.svg);
    assert.equal(richLabelData.count, "3", "rich clade label must contain three styled segments");
    const richSegments = richLabelData.segments;
    assert.deepEqual(richSegments.map(item => item.text), ["Clematis ", "sect. ", "Atragene"]);
    assert.equal(richSegments[0].style, "italic");
    assert.equal(richSegments[0].weight, "400");
    assert.equal(richSegments[1].style, "normal");
    assert.equal(richSegments[1].fill, "#6f4e9c");
    assert.equal(richSegments[2].size, "16");
    assert.equal(long.normalized_spec.clades.find(clade => clade.clade_id === "inner").name_segments.length, 3);
    assert.match(long.svg, /class="clade-bar-label-segment"/, "exported SVG must preserve rich clade tspans");

    assert.deepEqual(
      shortAgain.report.clade_bar_spacing.groups.map(item => item.actual_gap),
      shortFirst.report.clade_bar_spacing.groups.map(item => item.actual_gap),
      "short → long → short must return to the same clade-bar spacing",
    );
    console.log(JSON.stringify({
      bridgeVersion: long.report.bridge_version,
      bundledFonts: true,
      embeddedSvgFonts: true,
      shortLongShortStable: true,
      nestedClades: true,
      verticalCladeName: true,
      chineseLabels: true,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
