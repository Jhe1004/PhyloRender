const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const projectRoot = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    const [mainTree, supportTree] = await Promise.all([
      readFile(path.join(projectRoot, "defaults", "RAxML_bipartitions.Raxml-Chloroplast"), "utf8"),
      readFile(path.join(projectRoot, "defaults", "RAxML_bipartitions.Raxml-Chloroplast"), "utf8"),
    ]);
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.PhyloRenderAgent?.version));

    const result = await page.evaluate(async ({ mainTree, supportTree }) => {
      const figure = await window.PhyloRenderAgent.loadFigure({
        main_tree: { name: "full-rendering-main.tre", content: mainTree },
        support_trees: [{ name: "full-rendering-bootstrap.tre", content: supportTree, label: "Bootstrap" }],
        tip_label_overrides: { Out_Euptelea_pleiosperma: "CUSTOM OUTGROUP LABEL" },
        rooting: { outgroup: ["Out_Euptelea_pleiosperma"] },
        options: {
          layout: { mode: "phylogram", ladderize: "small-top", branch_width: 2.4, tip_spacing: 28 },
          labels: { auto_placement: true, node_arrows: true },
          support: { decimals: 1, full_support_marker: "circle", low_support_threshold: 50 },
          typography: {
            tips: { family: "Arial, sans-serif", size: 14, italic_mode: "all", bold: true, color: "#123456", follow_clade_color: true },
            nodes: { family: '"Times New Roman", serif', preferred_size: 13, minimum_size: 9, bold: true, italic: true, color: "#654321" },
            clades: { family: "Arial, sans-serif", size: 14, bold: true, italic: true, color: "#2468ac", follow_clade_color: true },
            scale: { family: "Arial, sans-serif", size: 11, bold: true, italic: true, color: "#334455" },
          },
        },
        clades: [{
          mrca_of: ["Aconitum_barbatum", "Aconitum_pulchellum"],
          name: "Aconitum styled group",
          name_segments: [
            { text: "Aconitum ", family: "Georgia, serif", italic: true },
            { text: "styled ", family: "Arial, sans-serif", color: "#8844aa" },
            { text: "group", family: '"Times New Roman", serif', bold: true },
          ],
          color: "#0072b2",
        }],
      });
      const pages = figure.panel_trees.map(item => {
        const documentNode = new DOMParser().parseFromString(item.svg, "image/svg+xml");
        const root = documentNode.documentElement;
        return {
          validXml: documentNode.querySelector("parsererror") === null,
          sharedRenderer: root.getAttribute("data-phylorender-renderer"),
          rootStyle: root.getAttribute("style") || "",
          text: root.textContent,
          hasEmbeddedFonts: item.svg.includes("data:font/woff2;base64,"),
          hasArrow: Boolean(root.querySelector(".node-label-arrow")),
          hasFullSupportCircle: Boolean(root.querySelector(".full-support-marker")),
          fullSupportCircles: [...root.querySelectorAll(".support-node-marker-full")]
            .map(marker => ({ radius: Number(marker.getAttribute("r")) })),
          partialSupportCircles: [...root.querySelectorAll(".support-node-marker-partial")]
            .map(marker => ({ radius: Number(marker.getAttribute("r")) })),
          embedsBlackFullMarkerStyle: item.svg.includes(".support-node-marker-full")
            && (/fill:\s*#111(?:111)?/i.test(item.svg) || /fill:\s*rgb\(17,\s*17,\s*17\)/i.test(item.svg)),
          hasScaleBar: Boolean(root.querySelector(".scale-line")),
          hasCladeBar: Boolean(root.querySelector(".clade-bar")),
          hasRichCladeLabel: Boolean(root.querySelector('.clade-bar-label[data-segment-count="3"]')),
          hasColoredBranch: [...root.querySelectorAll(".branch")]
            .some(branch => /stroke\s*:\s*#0072b2/i.test(branch.getAttribute("style") || "")),
          supportTexts: [...root.querySelectorAll(".support-label")].map(label => label.textContent),
        };
      });
      return { report: figure.report.two_panel, pages };
    }, { mainTree, supportTree });

    assert.equal(result.pages.length, 2);
    assert.equal(result.report.maximum_panels, 2);
    assert.equal(result.report.second_panel_is_complete_monophyletic_clade, true);
    assert.equal(result.report.rendering_profile.renderer, "shared");
    assert.equal(result.report.rendering_profile.inherits_figure_rendering, true);
    assert.ok(result.pages.every(item => item.validXml && item.sharedRenderer === "shared"));
    assert.ok(result.pages.every(item => item.hasEmbeddedFonts), "每一页都必须内嵌所需字体");
    const combinedText = result.pages.map(item => item.text).join("\n");
    assert.match(combinedText, /CUSTOM OUTGROUP LABEL/, "名称映射必须进入两张图");
    assert.match(combinedText, /Aconitum styled group/, "类群名称必须进入两张图");
    assert.ok(result.pages.some(item => item.hasArrow), "节点箭头必须进入两张图");
    assert.ok(result.pages.some(item => item.hasFullSupportCircle), "满支持率实心圆必须进入两张图");
    const fullSupportCircles = result.pages.flatMap(item => item.fullSupportCircles);
    const partialSupportCircles = result.pages.flatMap(item => item.partialSupportCircles);
    assert.ok(fullSupportCircles.length > 0 && partialSupportCircles.length > 0, "两张图必须同时保留满值与非满值支持率圆点");
    assert.ok(fullSupportCircles.every(marker => marker.radius === 5), "满值圆点必须保留当前配置尺寸");
    assert.ok(partialSupportCircles.every(marker => marker.radius === 5), "非满值圆点必须与满值圆点同尺寸");
    assert.ok(result.pages.some(item => item.embedsBlackFullMarkerStyle), "两张图必须内嵌满值黑色圆点样式");
    assert.ok(result.pages.some(item => item.hasScaleBar), "比例尺必须进入两张图");
    assert.ok(result.pages.some(item => item.hasCladeBar && item.hasRichCladeLabel), "分组 bar 与混合字体名称必须进入两张图");
    assert.ok(result.pages.some(item => item.hasColoredBranch), "分支着色必须进入两张图");
    assert.ok(result.pages.flatMap(item => item.supportTexts).some(text => /\d+\.\d(?:\D|$)/.test(text)), "支持率小数规则必须进入两张图");
    const styles = result.pages.map(item => item.rootStyle).join(";").toLowerCase();
    assert.match(styles, /--branch-width:\s*2\.4px/);
    assert.match(styles, /--tip-color:\s*#123456/);
    assert.match(styles, /--support-color:\s*#654321/);
    assert.match(styles, /--scale-color:\s*#334455/);
    assert.match(styles, /--tip-font-weight:\s*700/);
    assert.match(styles, /--tip-font-style:\s*italic/);
    assert.match(styles, /--support-font-style:\s*italic/);

    console.log(JSON.stringify({
      pages: result.pages.length,
      renderingProfile: result.report.rendering_profile,
      inherited: {
        renamedTips: true,
        supportRules: true,
        arrows: true,
        branchColor: true,
        cladeBar: true,
        richCladeTypography: true,
        scaleBar: true,
      },
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
