import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
import assert from "node:assert/strict";
import { selectHistoricalConsensus } from './select-historical-consensus.mjs';
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import contract from "../../figure-contract.js";
import {findBrowserExecutable} from '../src/runtime.mjs';

const outputRoot = await mkdtemp(path.join(os.tmpdir(), "phylorender-mcp-smoke-"));
const browserExecutable = await findBrowserExecutable();
const client = new Client({ name: "phylorender-smoke-test", version: "1.0.0" });
const callTool = client.callTool.bind(client);
client.callTool = async (...args) => {
  const name = args[0]?.name || "unknown";
  const started = Date.now();
  console.error(`[mcp-smoke] start ${name}`);
  try {
    const result = await callTool(...args);
    console.error(`[mcp-smoke] finish ${name} ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    console.error(`[mcp-smoke] fail ${name} ${Date.now() - started}ms`);
    throw error;
  }
};
// The 173-tip figure also renders the two-panel tree set; its runtime may exceed
// the SDK's 60-second default on a busy workstation without being a failure.
const largeFigureTimeout = { timeout: 180000 };
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["src/stdio.mjs"],
  env: {
    ...process.env,
    PHYLORENDER_OUTPUT_ROOT: outputRoot,
    PHYLORENDER_BROWSER_EXECUTABLE: browserExecutable,
  },
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map(tool => tool.name),
    [
      "inspect_tree",
      "compare_tree_samples",
      "create_figure",
      "start_figure_job",
      "get_figure_job",
      "cancel_figure_job",
      "inspect_figure",
      "edit_figure",
      "update_figure",
      "list_revisions",
      "restore_revision",
      "preview_figure",
      "export_figure",
      "get_figure_spec",
      "delete_figure",
    ],
  );
  const [schemaResource, guideResource] = await Promise.all([
    client.readResource({ uri: "phylorender://schema/figure-spec" }),
    client.readResource({ uri: "phylorender://docs/agent-guide" }),
  ]);
  assert.match(schemaResource.contents[0].text, /"name_segments"/);
  assert.match(guideResource.contents[0].text, /Mixed-style group-bar names/);
  assert.match(guideResource.contents[0].text, /readability before empty space/i);
  assert.match(guideResource.contents[0].text, /size_u/);
  assert.match(guideResource.contents[0].text, /node preferred 11.91 u, minimum 6.18 u/);
  assert.match(guideResource.contents[0].text, /display coordinates only/i);
  const createTool = tools.tools.find(tool => tool.name === "create_figure");
  assert.match(createTool.description, /tips.size_u/);
  assert.match(createTool.description, /Do not shrink readable type or add blank rows/);
  assert.match(createTool.description, /must not force larger terminal spacing/);

  const [mainTree, supportTree] = await Promise.all([
    readFile("../defaults/Raxml-Chloroplast.con.tre", "utf8").then(selectHistoricalConsensus),
    readFile("../defaults/RAxML_bipartitions.Raxml-Chloroplast", "utf8"),
  ]);
  const inspection = await client.callTool({
    name: "inspect_tree",
    arguments: { main_tree: { name: "Raxml-Chloroplast.con.tre", content: mainTree } },
  });
  assert.equal(inspection.isError, undefined);
  assert.equal(inspection.structuredContent.tips, 173);
  assert.equal(inspection.structuredContent.main_support_nodes, 170);
  assert.equal(inspection.structuredContent.tree_type, "phylogeny");

  const equalCountMismatch = await client.callTool({
    name: "compare_tree_samples",
    arguments: {
      main_tree: { name: "primary.nwk", content: "(A:1,B:1,C:1);" },
      comparison_tree: { name: "comparison.nwk", content: "(A:1,B:1,D:1);" },
    },
  });
  assert.equal(equalCountMismatch.isError, undefined);
  assert.equal(equalCountMismatch.structuredContent.status, "equal_count_name_mismatch");
  assert.deepEqual(equalCountMismatch.structuredContent.primary_only, ["C"]);
  assert.deepEqual(equalCountMismatch.structuredContent.comparison_only, ["D"]);
  assert.equal(equalCountMismatch.structuredContent.requires_source_correction, true);

  const differentCount = await client.callTool({
    name: "compare_tree_samples",
    arguments: {
      main_tree: { name: "primary.nwk", content: "(A:1,B:1,C:1,D:1);" },
      comparison_tree: { name: "comparison.nwk", content: "(A:1,B:1,C:1);" },
    },
  });
  assert.equal(differentCount.isError, undefined);
  assert.equal(differentCount.structuredContent.status, "different_count");
  assert.deepEqual(differentCount.structuredContent.primary_only, ["D"]);
  assert.equal(differentCount.structuredContent.requires_user_choice, true);
  assert.deepEqual(differentCount.structuredContent.allowed_sample_policies, ["intersection", "union"]);

  const created = await client.callTool({
    name: "create_figure",
    arguments: {
      main_tree: { name: "Raxml-Chloroplast.con.tre", content: mainTree },
      support_trees: [{ name: "RAxML_bipartitions.Raxml-Chloroplast", content: supportTree, label: "Bootstrap",scale:"percent" }],
      tip_label_overrides: { Euptelea_pleiosperma: "Euptelea outgroup" },
      rooting: { outgroup: ["Euptelea_pleiosperma"] },
      options: {
        layout: { mode: "aligned", ladderize: "small-top", branch_width: 1.4, tip_spacing: 24 },
        output: { aspect_ratio: "auto", custom_ratio: 1.5, png_scale: 2 },
        support: { scale: "probability", decimals: 1, full_support_marker: "circle", low_support_threshold: 50 },
        typography: {
          tips: { family: "Georgia, serif", size: 12, italic_mode: "auto" },
          nodes: { family: "Arial, sans-serif", preferred_size: 11, minimum_size: 9 },
        },
      },
      clades: [{
        mrca_of: ["Aconitum_barbatum", "Aconitum_pulchellum"],
        name: "Aconitum sect. Aconitum",
        name_segments: [
          { text: "Aconitum ", family: "Georgia, serif", italic: true, bold: false },
          { text: "sect. ", family: "Arial, sans-serif", italic: false, color: "#6F4E9C" },
          { text: "Aconitum", family: '"Times New Roman", serif', size: 16, italic: true },
        ],
        color: "#0072B2",
        label_orientation: "horizontal",
      }],
    },
  }, undefined, largeFigureTimeout);
  assert.equal(created.isError, undefined);
  const figureId = created.structuredContent.figure_id;
  assert.match(figureId, /^[0-9a-f-]{36}$/i);
  assert.equal(created.structuredContent.revision, 1);
  assert.equal(created.structuredContent.report.tips, 173);
  assert.equal(created.structuredContent.report.remaining_collisions, 0);
  assert.equal(created.structuredContent.report.topology_unchanged, true);
  assert.equal(created.structuredContent.report.safe_for_export, true);
  assert.equal(created.structuredContent.report.clade_bar_spacing.valid, true);
  assert.equal(created.structuredContent.report.two_panel.split_strategy, "single_bottom_complete_monophyletic_clade");
  assert.equal(created.structuredContent.report.two_panel.maximum_panels, 2);
  assert.equal(created.structuredContent.report.two_panel.second_panel_is_complete_monophyletic_clade, true);
  assert.equal(created.structuredContent.report.two_panel.rooting_applied_before_split, true);
  assert.equal(created.structuredContent.report.two_panel.generated, false);
  assert.equal(created.structuredContent.report.two_panel.measurement_status, "not_requested");
  assert.equal(created.structuredContent.report.clades[0].name_segments.length, 3);
  assert.match(
    (await readFile(path.join(outputRoot, figureId, "revisions", "000001", "figure.svg"), "utf8")),
    /data-segment-count="3"/,
  );
  assert.equal(created.structuredContent.report.font_portability.bundled_fonts_ready, true);
  assert.equal(created.structuredContent.report.font_portability.svg_export_embeds_fonts, true);
  assert.equal(created.structuredContent.report.node_arrows.enabled, false, "aligned 拓扑模式不展示枝长，自动抑制延长引线");
  assert.equal(created.structuredContent.report.node_arrows.required, false);
  assert.equal(created.structuredContent.report.node_arrows.missing, 0);
  assert.equal(created.structuredContent.report.node_arrows.misdirected, 0);
  assert.equal(created.structuredContent.report.node_arrows.unexpected, 0);
  assert.equal(created.structuredContent.report.node_arrows.arrows, 0);
  assert.equal(created.structuredContent.report.node_arrows.angle_and_length_are_soft_preferences, true);
  assert.equal(created.structuredContent.report.leader_lines_unbridged_crossings, 0);
  assert.equal(created.structuredContent.report.node_arrows.line_style, "dashed");
  assert.equal(created.structuredContent.report.output.aspect_mode, "auto");
  assert.equal(created.structuredContent.report.output.requested_png_scale, 2);
  equalU(created.structuredContent.report.output.actual_png_scale, 400 / units.pxToMm(units.designWidth) * 2);
  assert.equal(created.structuredContent.report.output.drawing_width,1000);
  assert.equal(created.structuredContent.report.tip_labels.customized, 1);

  // Four tips provide an informative internal split whose unit is ambiguous.
  // The original three-tip visual fixture has no such classified split.
  const ambiguousDefaultTree="(O:3,((A:1,B:1)0.83:1,C:2):1);";
  const ambiguousDefault = await client.callTool({name:"create_figure",arguments:{main_tree:{content:ambiguousDefaultTree}}});
  assert.equal(ambiguousDefault.isError,true);
  assert.match(JSON.stringify(ambiguousDefault),/SUPPORT_SCALE_AMBIGUOUS/);
  const defaultFigure = await client.callTool({
    name: "create_figure",
    arguments: {
      main_tree: { name: "default-visual-policy.tre", content: "((A:1,B:1)0.83:1,C:2);" },
    },
  });
  assert.equal(defaultFigure.isError, undefined);
  assert.equal(defaultFigure.structuredContent.report.rendered_node_annotations, 0);
  assert.deepEqual(defaultFigure.structuredContent.spec.requested.options, contract.defaults("phylogeny"));
  assert.equal(defaultFigure.structuredContent.spec.normalized.options.layout.automatic_tip_spacing, true);
  equalU(defaultFigure.structuredContent.spec.normalized.options.typography.tips.size_u, units.ptToDrawing(15));
  await client.callTool({ name: "delete_figure", arguments: { figure_id: defaultFigure.structuredContent.figure_id } });
  const phylogramArrowFigure = await client.callTool({
    name: "create_figure",
    arguments: {
      main_tree: { name: "phylogram-arrows.tre", content: "(O:3,((A:1,B:1)83:1,C:2)91:1);" },
      options: { support: { scale: "percent" } },
    },
  });
  assert.equal(phylogramArrowFigure.isError, undefined);
  assert.equal(phylogramArrowFigure.structuredContent.report.node_arrows.required, true);
  assert.equal(phylogramArrowFigure.structuredContent.report.node_arrows.arrowhead_length, 1.8);
  assert.equal(phylogramArrowFigure.structuredContent.report.node_arrows.arrowhead_half_width, 0.85);
  assert.equal(phylogramArrowFigure.structuredContent.report.node_arrows.arrows, phylogramArrowFigure.structuredContent.report.node_arrows.labels);
  await client.callTool({ name: "delete_figure", arguments: { figure_id: phylogramArrowFigure.structuredContent.figure_id } });
  assert.equal(created.structuredContent.report.two_panel.panels, 2);
  assert.equal(created.structuredContent.report.two_panel.configured_font_sizes_preserved, undefined);
  assert.equal(created.structuredContent.spec.requested.tip_label_overrides.Euptelea_pleiosperma, "Euptelea outgroup");
  assert.ok(created.structuredContent.report.output.horizontal_expansion > 1);
  assert.equal(created.content.some(item => item.type === "image"), false);
  const defaultLinks = created.content.filter(item => item.type === "resource_link");
  assert.deepEqual(defaultLinks.map(item => item.name).sort(), ["figure.svg", "report.json", "spec.json"]);
  const createdRevisionDirectory = path.join(outputRoot, figureId, "revisions", "000001");
  await access(path.join(createdRevisionDirectory, "figure.svg"));
  await assert.rejects(access(path.join(createdRevisionDirectory, "figure.png")));
  await assert.rejects(access(path.join(createdRevisionDirectory, "preview.png")));
  const originalFingerprint = created.structuredContent.report.original_topology_fingerprint;

  const initial = await client.callTool({ name: "inspect_figure", arguments: { figure_id: figureId } });
  assert.equal(initial.isError, undefined);
  assert.equal(initial.structuredContent.revision, 1);
  assert.equal(initial.structuredContent.current_revision, 1);
  assert.equal(initial.structuredContent.state.clades.length, 1);
  assert.equal(initial.structuredContent.state.clades[0].name_segments.length, 3);
  assert.match(initial.structuredContent.state.clades[0].clade_id, /^clade:/);
  assert.match(initial.structuredContent.state.support_sources[0].source_id, /^support:/);
  assert.ok(initial.structuredContent.state.branches.length >= 170);
  assert.deepEqual(initial.structuredContent.state.tip_label_overrides, { Euptelea_pleiosperma: "Euptelea outgroup" });
  assert.equal(
    new Set(initial.structuredContent.state.branches.map(branch => branch.branch_id)).size,
    initial.structuredContent.state.branches.length,
  );
  const editableBranch = initial.structuredContent.state.branches.find(branch => branch.main_support !== null);
  assert.ok(editableBranch);
  const cladeId = initial.structuredContent.state.clades[0].clade_id;

  const edited = await client.callTool({
    name: "edit_figure",
    arguments: {
      figure_id: figureId,
      base_revision: 1,
      change_note: "Increase branch weight, rename one clade, and nudge one support label.",
      operations: [
        { op: "set_options", options: { layout: { branch_width: 1.8 }, labels: { node_arrows: false }, support: { low_support_threshold: 70 } } },
        { op: "set_tip_label", original_name: "Aconitum_barbatum", display_name: "Aconitum sample 01" },
        { op: "update_clade", clade_id: cladeId, patch: {
          name: "Aconitum group",
          name_segments: [
            { text: "Aconitum ", family: "Georgia, serif", italic: true },
            { text: "group", family: "Arial, sans-serif", italic: false, bold: true },
          ],
          color: "#D55E00",
        } },
        { op: "set_label_adjustment", adjustment: { branch_id: editableBranch.branch_id, dx: 4, dy: 0, font_reduction: 1 } },
      ],
    },
  }, undefined, largeFigureTimeout);
  assert.equal(edited.isError, undefined);
  assert.equal(edited.structuredContent.revision, 2);
  assert.equal(edited.structuredContent.parent_revision, 1);
  assert.ok(edited.structuredContent.changes.some(change => change.path === "options.layout.branch_width_u"));
  assert.equal(edited.structuredContent.report.clades[0].name_segments.length, 2);
  assert.equal(edited.structuredContent.report.original_topology_fingerprint, originalFingerprint);
  assert.equal(edited.structuredContent.report.displayed_topology_fingerprint, originalFingerprint);
  assert.equal(edited.structuredContent.report.node_arrows.enabled, false);
  assert.equal(edited.structuredContent.report.node_arrows.arrows, 0);
  assert.equal(edited.structuredContent.report.node_arrows.missing, 0);
  assert.equal(edited.structuredContent.report.node_arrows.unexpected, 0);
  assert.equal(edited.structuredContent.report.safe_for_export, true);
  assert.equal(edited.structuredContent.report.tip_labels.customized, 2);

  const afterEdit = await client.callTool({ name: "inspect_figure", arguments: { figure_id: figureId } });
  assert.equal(afterEdit.structuredContent.revision, 2);
  equalU(afterEdit.structuredContent.state.options.layout.branch_width_u, units.ptToDrawing(1.35));
  assert.equal(afterEdit.structuredContent.state.options.support.low_support_threshold, 70);
  assert.equal(afterEdit.structuredContent.state.options.labels.node_arrows, false);
  assert.equal(afterEdit.structuredContent.state.clades[0].clade_id, cladeId);
  assert.equal(afterEdit.structuredContent.state.clades[0].name, "Aconitum group");
  assert.deepEqual(afterEdit.structuredContent.state.tip_label_overrides, {
    Euptelea_pleiosperma: "Euptelea outgroup",
    Aconitum_barbatum: "Aconitum sample 01",
  });
  assert.deepEqual(afterEdit.structuredContent.state.label_adjustments, [units.drawingAdjustment({
    branch_id: editableBranch.branch_id,
    dx: 4,
    dy: 0,
    font_reduction: 1,
  })]);

  const staleEdit = await client.callTool({
    name: "edit_figure",
    arguments: {
      figure_id: figureId,
      base_revision: 1,
      operations: [{ op: "set_options", options: { layout: { branch_width: 2.2 } } }],
    },
  });
  assert.equal(staleEdit.isError, true);
  assert.match(staleEdit.content[0].text, /Revision conflict: expected 1.*revision 2/i);

  const revisionsBeforeRestore = await client.callTool({ name: "list_revisions", arguments: { figure_id: figureId } });
  assert.equal(revisionsBeforeRestore.structuredContent.current_revision, 2);
  assert.deepEqual(revisionsBeforeRestore.structuredContent.revisions.map(item => item.revision), [1, 2]);
  assert.equal(revisionsBeforeRestore.structuredContent.revisions[1].action, "edit");
  assert.equal(revisionsBeforeRestore.structuredContent.revisions[1].operation_summary.length, 4);

  const [revisionOneSpec, revisionTwoSpec] = await Promise.all([
    client.readResource({ uri: `phylorender://figures/${figureId}/revisions/1/spec.json` }),
    client.readResource({ uri: `phylorender://figures/${figureId}/revisions/2/spec.json` }),
  ]);
  const revisionOne = JSON.parse(revisionOneSpec.contents[0].text);
  const revisionTwo = JSON.parse(revisionTwoSpec.contents[0].text);
  equalU(revisionOne.requested.options.layout.branch_width_u, units.designToDrawing(1.4));
  equalU(revisionTwo.requested.options.layout.branch_width_u, units.designToDrawing(1.8));
  assert.equal(revisionTwo.requested.options.labels.node_arrows, false);
  assert.equal(revisionOne.requested.tip_label_overrides.Euptelea_pleiosperma, "Euptelea outgroup");
  assert.equal(revisionTwo.requested.tip_label_overrides.Aconitum_barbatum, "Aconitum sample 01");
  assert.equal(revisionOne.requested.main_tree.content, undefined);
  assert.match(revisionOne.requested.main_tree.sha256, /^[0-9a-f]{64}$/);
  const [revisionOneSvg, revisionTwoSvg] = await Promise.all([
    client.readResource({ uri: `phylorender://figures/${figureId}/revisions/1/figure.svg` }),
    client.readResource({ uri: `phylorender://figures/${figureId}/revisions/2/figure.svg` }),
  ]);
  assert.doesNotMatch(revisionOneSvg.contents[0].text, /node-label-arrow/, "aligned 拓扑模式默认不得绘制多余延长引线");
  assert.match(revisionOneSvg.contents[0].text, /data:font\/woff2;base64,/, "导出的 SVG 必须嵌入实际使用的字体子集");
  assert.match(revisionOneSvg.contents[0].text, /data-clade-bar-gap-valid="true"/, "导出的 SVG 必须记录类群 bar 间距检查通过");
  assert.match(revisionOneSvg.contents[0].text, /Euptelea outgroup/, "初始显示名必须进入 SVG");
  assert.match(revisionTwoSvg.contents[0].text, /Aconitum sample 01/, "逐个修改的显示名必须进入新修订 SVG");
  assert.doesNotMatch(revisionTwoSvg.contents[0].text, /node-label-arrow/, "node_arrows=false 的修订不得残留箭头");
  const revisionOnePanelExport = await client.callTool({
    name: "export_figure",
    arguments: { figure_id: figureId, revision: 1, formats: ["panels"] },
  }, undefined, largeFigureTimeout);
  assert.equal(revisionOnePanelExport.isError, undefined, JSON.stringify(revisionOnePanelExport.content));
  const revisionOnePanel = await client.readResource({
    uri: `phylorender://figures/${figureId}/revisions/1/panel-1.svg`,
  });
  assert.match(revisionOnePanel.contents[0].text, /data-phylorender-tree-panel="1"/);
  assert.match(revisionOnePanel.contents[0].text, /data-phylorender-panel-role="overview"/);
  assert.match(revisionOnePanel.contents[0].text, /data-phylorender-renderer="shared"/);
  assert.doesNotMatch(revisionOnePanel.contents[0].text, /font-family=""|style="--support-font-family: "/);
  assert.match(revisionOnePanel.contents[0].text, /Continued clade/);
  assert.doesNotMatch(revisionOnePanel.contents[0].text, /续见|承接/);
  const revisionTwoPanel = await client.readResource({
    uri: `phylorender://figures/${figureId}/revisions/1/panel-2.svg`,
  });
  assert.match(revisionTwoPanel.contents[0].text, /data-phylorender-panel-role="complete-monophyletic-clade"/);

  const restored = await client.callTool({
    name: "restore_revision",
    arguments: {
      figure_id: figureId,
      target_revision: 1,
      base_revision: 2,
      change_note: "Undo the latest conversational edit.",
    },
  }, undefined, largeFigureTimeout);
  assert.equal(restored.isError, undefined);
  assert.equal(restored.structuredContent.revision, 3);
  assert.equal(restored.structuredContent.restored_from, 1);
  equalU(restored.structuredContent.spec.requested.options.layout.branch_width_u, units.designToDrawing(1.4));
  assert.equal(restored.structuredContent.spec.requested.options.support.low_support_threshold, 50);
  assert.deepEqual(restored.structuredContent.spec.requested.label_adjustments, []);
  assert.deepEqual(restored.structuredContent.spec.requested.tip_label_overrides, { Euptelea_pleiosperma: "Euptelea outgroup" });

  const updated = await client.callTool({
    name: "update_figure",
    arguments: {
      figure_id: figureId,
      base_revision: 3,
      change_note: "Compatibility patch after restore.",
      patch: { options: { layout: { branch_width: 1.6 } } },
    },
  }, undefined, largeFigureTimeout);
  assert.equal(updated.isError, undefined);
  assert.equal(updated.structuredContent.revision, 4);
  equalU(updated.structuredContent.spec.requested.options.layout.branch_width_u, units.designToDrawing(1.6));
  assert.equal(updated.structuredContent.report.original_topology_fingerprint, originalFingerprint);

  const preview = await client.callTool({ name: "preview_figure", arguments: { figure_id: figureId, revision: 1 } }, undefined, largeFigureTimeout);
  assert.equal(preview.structuredContent.revision, 1);
  assert.equal(preview.structuredContent.current_revision, 4);
  assert.ok(preview.content.some(item => item.type === "image" && item.mimeType === "image/png"));

  const specification = await client.callTool({ name: "get_figure_spec", arguments: { figure_id: figureId } });
  assert.equal(specification.structuredContent.revision, 4);
  assert.equal(specification.structuredContent.spec.requested.main_tree.content, undefined);
  assert.equal(specification.structuredContent.spec.requested.main_tree.bytes > 0, true);
  assert.match(specification.structuredContent.spec.requested.main_tree.sha256, /^[0-9a-f]{64}$/);

  const defaultExported = await client.callTool({
    name: "export_figure",
    arguments: { figure_id: figureId, revision: 2 },
  });
  assert.deepEqual(defaultExported.structuredContent.formats, ["svg"]);
  assert.ok(defaultExported.structuredContent.resources.some(resource => /figure\.svg$/.test(resource.uri)));
  assert.equal(defaultExported.structuredContent.resources.some(resource => /\.png$/.test(resource.uri)), false);

  const exported = await client.callTool({
    name: "export_figure",
    arguments: { figure_id: figureId, revision: 2, formats: ["svg", "png"] },
  }, undefined, largeFigureTimeout);
  assert.equal(exported.structuredContent.revision, 2);
  assert.equal(exported.structuredContent.safe_for_export, true);
  assert.deepEqual(exported.structuredContent.formats, ["svg", "png"]);
  assert.ok(exported.structuredContent.resources.every(resource => resource.uri.includes("/revisions/2/")));
  const exportedPanels = await client.callTool({
    name: "export_figure",
    arguments: { figure_id: figureId, revision: 2, formats: ["panels"] },
  }, undefined, largeFigureTimeout);
  assert.ok(exportedPanels.structuredContent.resources.some(resource => /panel-1\.svg$/.test(resource.uri)));
  assert.equal(exportedPanels.structuredContent.resources.some(resource => /panel-1\.png$/.test(resource.uri)), false);

  const currentSvg = await client.readResource({ uri: `phylorender://figures/${figureId}/figure.svg` });
  assert.match(currentSvg.contents[0].text, /<svg\b/);
  assert.match(currentSvg.contents[0].text, /Aconitum/);

  const revisionsAfterRestore = await client.callTool({ name: "list_revisions", arguments: { figure_id: figureId } });
  assert.deepEqual(revisionsAfterRestore.structuredContent.revisions.map(item => item.revision), [1, 2, 3, 4]);
  assert.equal(revisionsAfterRestore.structuredContent.revisions[2].action, "restore");

  const deleted = await client.callTool({ name: "delete_figure", arguments: { figure_id: figureId } });
  assert.equal(deleted.structuredContent.deleted, true);

  console.log(JSON.stringify({
    tools: tools.tools.length,
    inspectedTips: inspection.structuredContent.tips,
    figureId,
    topologyFingerprint: originalFingerprint,
    stableBranches: initial.structuredContent.state.branches.length,
    revisions: 4,
    staleEditRejected: true,
    restoreCreatedNewRevision: true,
    rawTreeRedactedFromPublicSpec: true,
    deleted: true,
  }, null, 2));
} finally {
  await client.close().catch(() => undefined);
  await rm(outputRoot, { recursive: true, force: true });
}
