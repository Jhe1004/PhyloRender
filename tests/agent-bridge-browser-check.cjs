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
      readFile(path.join(projectRoot, "defaults", "Raxml-Chloroplast.con.tre"), "utf8"),
      readFile(path.join(projectRoot, "defaults", "RAxML_bipartitions.Raxml-Chloroplast"), "utf8"),
    ]);
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.PhyloRenderAgent?.version);

    const result = await page.evaluate(async ({ mainTree, supportTree }) => {
      const inspection = await window.PhyloRenderAgent.inspectTree({
        name: "Raxml-Chloroplast.con.tre",
        content: mainTree,
      });
      const figure = await window.PhyloRenderAgent.loadFigure({
        main_tree: { name: "Raxml-Chloroplast.con.tre", content: mainTree },
        support_trees: [{
          source_id: "support:test-bootstrap",
          name: "RAxML_bipartitions.Raxml-Chloroplast",
          content: supportTree,
          label: "Bootstrap",
        }],
        tip_label_overrides: {
          Euptelea_pleiosperma: "Euptelea outgroup",
          Aconitum_barbatum: "Aconitum sample 01",
        },
        rooting: { outgroup: ["Euptelea_pleiosperma"] },
        options: {
          layout: { mode: "aligned", ladderize: "small-top", branch_width: 1.4, tip_spacing: 24 },
          output: { aspect_ratio: "auto", custom_ratio: 1.5, png_scale: 3 },
          support: { decimals: 1, full_support_marker: "circle", low_support_threshold: 50 },
        },
        clades: [{
          clade_id: "clade:test-aconitum",
          mrca_of: ["Aconitum_barbatum", "Aconitum_pulchellum"],
          name: "Aconitum",
          color: "#0072B2",
        }],
      });

      const crossRootOutgroup = await window.PhyloRenderAgent.loadFigure({
        main_tree: {
          name: "cross-root-outgroup.tre",
          content: "(Out_A:1,((In_A:1,In_B:1)95:1,Out_B:1):1);",
        },
        rooting: { outgroup: ["Out_A", "Out_B"] },
        options: { layout: { mode: "aligned", ladderize: "file" } },
      });
      return {
        inspection,
        report: figure.report,
        normalized: figure.normalized_spec,
        svgStartsCorrectly: /^<svg\b/.test(figure.svg.trim()),
        svgHasClade: figure.svg.includes("Aconitum"),
        svgHasRenamedTips: figure.svg.includes("Euptelea outgroup") && figure.svg.includes("Aconitum sample 01"),
        crossRootOutgroup: {
          report: crossRootOutgroup.report,
          normalized: crossRootOutgroup.normalized_spec,
        },
      };
    }, { mainTree, supportTree });

    assert.equal(result.inspection.tips, 173);
    assert.equal(result.inspection.main_support_nodes, 170);
    assert.equal(result.inspection.tree_type, "phylogeny");
    assert.equal(result.report.tips, 173);
    assert.equal(result.report.remaining_collisions, 0);
    assert.equal(result.report.topology_unchanged, true);
    if (!result.report.safe_for_export) {
      console.error(JSON.stringify({
        warnings: result.report.warnings,
        nodeArrows: result.report.node_arrows,
        labelLayout: result.report.label_layout,
        cladeBarSpacing: result.report.clade_bar_spacing,
      }, null, 2));
    }
    assert.equal(result.report.safe_for_export, true);
    assert.equal(result.report.node_arrows.required, true);
    assert.equal(result.report.node_arrows.missing, 0);
    assert.equal(result.report.node_arrows.misdirected, 0);
    assert.equal(result.report.node_arrows.angle_and_length_are_soft_preferences, true);
    assert.equal(result.report.leader_lines_unbridged_crossings, 0);
    assert.equal(result.report.node_arrows.line_style, "dashed");
    assert.equal(result.report.node_arrows.arrowhead_length, 1.8);
    assert.equal(result.report.node_arrows.arrowhead_half_width, 0.85);
    assert.equal(result.report.node_arrows.arrows, result.report.node_arrows.labels);
    assert.equal(result.report.original_topology_fingerprint, result.report.displayed_topology_fingerprint);
    assert.deepEqual(result.report.outgroup, ["Euptelea pleiosperma"]);
    assert.equal(result.report.tip_labels.customized, 2);
    assert.deepEqual(result.normalized.tip_label_overrides, {
      Euptelea_pleiosperma: "Euptelea outgroup",
      Aconitum_barbatum: "Aconitum sample 01",
    });
    assert.equal(result.report.node_data_sources[0].matched_nodes, 168);
    assert.equal(result.report.node_data_sources[0].source_id, "support:test-bootstrap");
    assert.ok(result.report.branches.length >= 170);
    assert.equal(new Set(result.report.branches.map(branch => branch.branch_id)).size, result.report.branches.length);
    assert.ok(result.report.branches.every(branch => /^branch:[0-9a-f]{24}$/.test(branch.branch_id)));
    assert.deepEqual(result.report.branches.map(branch => branch.display_order),
      Array.from({ length: result.report.branches.length }, (_, index) => index + 1));
    assert.ok(result.report.branches.every(branch => branch.mrca_of.length === 2));
    assert.equal(result.normalized.options.support.decimals, 1);
    assert.equal(result.normalized.options.output.aspect_ratio, "auto");
    assert.equal(result.normalized.options.output.png_scale, 3);
    assert.equal(result.report.output.aspect_mode, "auto");
    assert.equal(result.report.output.requested_png_scale, 3);
    assert.ok(result.report.output.horizontal_expansion > 1);
    assert.equal(result.normalized.clades[0].clade_id, "clade:test-aconitum");
    assert.equal(result.normalized.clades[0].descendants.length, 10);
    assert.equal(result.svgStartsCorrectly, true);
    assert.equal(result.svgHasClade, true);
    assert.equal(result.svgHasRenamedTips, true);
    assert.deepEqual(result.crossRootOutgroup.report.outgroup.sort(), ["Out A", "Out B"]);
    assert.equal(result.crossRootOutgroup.report.tips, 4);
    assert.equal(result.crossRootOutgroup.report.topology_unchanged, true);
    assert.equal(result.crossRootOutgroup.report.safe_for_export, true);
    assert.deepEqual(result.crossRootOutgroup.normalized.rooting.outgroup.sort(), ["Out A", "Out B"]);

    console.log(JSON.stringify({
      bridgeVersion: result.inspection.bridge_version,
      tips: result.report.tips,
      matchedAuxiliarySupports: result.report.node_data_sources[0].matched_nodes,
      remainingCollisions: result.report.remaining_collisions,
      topologyFingerprint: result.report.original_topology_fingerprint,
      cladeTips: result.normalized.clades[0].descendants.length,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
