import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  figureEditSchema,
  figureIdSchema,
  figurePatchSchema,
  figureSpecSchema,
  revisionSchema,
  treeInputSchema,
} from "./schemas.mjs";
import { artifactNames } from "./store.mjs";
import { MCP_ROOT } from "./runtime.mjs";
import contract from "../../figure-contract.js";
import conflictTrees from "../../conflict-tree.js";
import sampleIdentity from "../../core/sample-identity.js";
import { VERSION } from "./version.mjs";
import { runtimeCapabilities } from "./capabilities.mjs";

function textAndStructured(structuredContent, extraContent = []) {
  return {
    content: [
      { type: "text", text: JSON.stringify(structuredContent, null, 2) },
      ...extraContent,
    ],
    structuredContent,
  };
}

function artifactUri(figureId, artifact, revision = null) {
  return revision === null
    ? `phylorender://figures/${figureId}/${artifact}`
    : `phylorender://figures/${figureId}/revisions/${revision}/${artifact}`;
}

function resourceLink(figureId, artifact, mimeType, description, revision = null) {
  return {
    type: "resource_link",
    uri: artifactUri(figureId, artifact, revision),
    name: artifact,
    title: `PhyloRender ${artifact}`,
    description,
    mimeType,
  };
}

function artifactLinks(figureId, formats = ["svg"], revision = null, panelCount = 0) {
  const links = [];
  if (formats.includes("svg")) links.push(resourceLink(figureId, "figure.svg", "image/svg+xml", "Publication-ready vector tree figure.", revision));
  if (formats.includes("png")) links.push(resourceLink(figureId, "figure.png", "image/png", "Full-resolution raster tree figure.", revision));
  if (formats.includes("panels")) {
    for (let panel = 1; panel <= panelCount; panel++) {
      links.push(resourceLink(figureId, `panel-${panel}.svg`, "image/svg+xml", `Natural-size tree panel ${panel}; panel 2 is one complete monophyletic clade.`, revision));
      if (formats.includes("png")) links.push(resourceLink(figureId, `panel-${panel}.png`, "image/png", `High-resolution tree panel ${panel}.`, revision));
    }
  }
  links.push(resourceLink(figureId, "report.json", "application/json", "Topology, matching, collision, and export safety report.", revision));
  links.push(resourceLink(figureId, "spec.json", "application/json", "Reproducible figure settings with tree text redacted to hashes.", revision));
  return links;
}

async function previewContent(store, figureId, revision = null) {
  await store.ensureArtifacts(figureId, revision, ["preview"]);
  const preview = await store.artifact(figureId, "preview.png", revision);
  return {
    type: "image",
    data: preview.data.toString("base64"),
    mimeType: preview.mimeType,
  };
}

function toolFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  const zodIssues = error?.name === "ZodError" && Array.isArray(error.issues) ? error.issues : null;
  const zodField = zodIssues?.length && Array.isArray(zodIssues[0]?.path) && zodIssues[0].path.length
    ? zodIssues[0].path.join(".") : null;
  const detail = { code: error.code || (error.name === "ZodError" ? "INVALID_ARGUMENT" : "OPERATION_FAILED"),
    message, retryable: error.retryable === true, field: error.field || zodField || null,
    issues: zodIssues || error.issues || [], job_id: error.job_id || null,
    current_revision: error.current_revision ?? null,
    remediation: error.remediation || "Inspect the error details and current figure; correct the input before retrying.",
    ...(error.cleanup_pending ? { cleanup_pending: true, trigger_code: error.trigger_code || null } : {}) };
  return {
    content: [{ type: "text", text: JSON.stringify({ error: detail }) }],
    structuredContent: { error: detail },
    isError: true,
  };
}

function compareTreeSampleInspections(primary, comparison, policy = "conflict") {
  const primaryTips = primary.tip_labels || [], comparisonTips = comparison.tip_labels || [];
  const flatTree = labels => ({ children: labels.map(label => ({ label, children: [] })) });
  let matched;
  if (policy === "conflict") {
    matched = conflictTrees.compareSampleSets(flatTree(primaryTips), flatTree(comparisonTips));
    const duplicates = [...matched.nuclearDuplicates, ...matched.plastidDuplicates];
    if (duplicates.length) throw Object.assign(new Error("Sample normalization is ambiguous; correct the original labels before comparing trees."),
      { code: "TIP_MAPPING_AMBIGUOUS", issues: duplicates });
  } else if (policy === "auxiliary") {
    const primaryTree = flatTree(primaryTips);
    const comparisonTree = flatTree(comparisonTips);
    const alignment = sampleIdentity.buildTipKeyAlignment(primaryTree, comparisonTree);
    const leftMap = new Map();
    for (const label of primaryTips) {
      leftMap.set(sampleIdentity.resolvedTipKey(label, alignment.keyMap), label);
    }
    const rightMap = new Map();
    for (const label of comparisonTips) {
      rightMap.set(sampleIdentity.normalizeTipKey(label), label);
    }
    const primaryOnly = [], comparisonOnly = [];
    let sharedCount = 0;
    for (const [key, label] of leftMap) {
      if (rightMap.has(key)) sharedCount++;
      else primaryOnly.push(label);
    }
    for (const [key, label] of rightMap) {
      if (!leftMap.has(key)) comparisonOnly.push(label);
    }
    matched = { sharedCount, nuclearOnly: primaryOnly, plastidOnly: comparisonOnly };
  } else {
    const indexByKey = (labels, labelName) => {
      const map = new Map();
      const dups = [];
      for (const label of labels) {
        const key = sampleIdentity.tipIdentityKey(label, policy);
        if (map.has(key)) dups.push(`${labelName}: ${map.get(key)} / ${label}`);
        else map.set(key, label);
      }
      return { map, dups };
    };
    const left = indexByKey(primaryTips, "primary");
    const right = indexByKey(comparisonTips, "comparison");
    const duplicates = [...left.dups, ...right.dups];
    if (duplicates.length) throw Object.assign(new Error("Sample normalization is ambiguous; correct the original labels before comparing trees."),
      { code: "TIP_MAPPING_AMBIGUOUS", issues: duplicates });
    const primaryOnly = [], comparisonOnly = [];
    let sharedCount = 0;
    for (const [key, label] of left.map) {
      if (right.map.has(key)) sharedCount++;
      else primaryOnly.push(label);
    }
    for (const [key, label] of right.map) {
      if (!left.map.has(key)) comparisonOnly.push(label);
    }
    matched = { sharedCount, nuclearOnly: primaryOnly, plastidOnly: comparisonOnly };
  }
  const primarySet = new Set(primaryTips), comparisonSet = new Set(comparisonTips);
  const primaryOnly = matched.nuclearOnly;
  const comparisonOnly = matched.plastidOnly;
  const identical = primaryOnly.length === 0 && comparisonOnly.length === 0;
  const equalCount = primaryTips.length === comparisonTips.length;
  return {
    status: identical ? "identical" : (equalCount ? "equal_count_name_mismatch" : "different_count"),
    matching_policy: policy,
    identical_original_sample_sets: primaryTips.length === comparisonTips.length && primaryTips.every(name => comparisonSet.has(name)) && comparisonTips.every(name => primarySet.has(name)),
    identical_sample_sets: identical,
    equal_sample_counts: equalCount,
    primary_count: primaryTips.length,
    comparison_count: comparisonTips.length,
    shared_count: matched.sharedCount,
    primary_only: primaryOnly,
    comparison_only: comparisonOnly,
    requires_source_correction: !identical && equalCount,
    requires_user_choice: !identical && !equalCount,
    allowed_sample_policies: !identical && !equalCount ? ["intersection", "union"] : [],
  };
}

export function createPhyloRenderMcpServer({ renderer, store }) {
  const server = new McpServer({
    name: "phylorender",
    title: "PhyloRender phylogenetic figure renderer",
    version: VERSION,
    ...(process.env.PHYLORENDER_WEBSITE_URL ? { websiteUrl: process.env.PHYLORENDER_WEBSITE_URL } : {}),
  }, {
    // Bound structural validation separately from large, legitimate tree strings.
    maxToolInputElements: contract.capabilities.performance_limits.mcp_tool_input_elements,
    instructions: [
      "Select workspace explicitly: phylogeny, time, cloud, or conflict. Web and MCP share figure-contract.js defaults and the same renderer. Read phylorender://capabilities for dependencies and limits. Import a web-exported figure configuration directly through create_figure. The complete figure width is 1000 drawing units in every workspace; phylogeny/conflict tips default to about 13.24 u and time/cloud tips to about 15.88 u. Automatic row spacing targets height/width 1.25 for sparse ordinary, Dating and cloud figures, with bounded real-row expansion and compact dense rows; comparisons retain landscape preference. Explicit manual spacing or aspect modes take priority. Every workspace defaults to automatic ink-aware row spacing, and single-layer clades follow each clade's sample-label length while multi-layer clades align into shared right-hand columns. Conflict accepts comparison_tree and treats the left main_tree as primary. Give only the main-tree outgroup in rooting.outgroup; the comparison tree is rooted automatically on the same sample-defined side before its sister branches are rotated to reduce crossings. If conflict sample counts differ, rendering requires an explicit user-confirmed sample_policy; report complete difference lists and ask the user instead of choosing automatically. Equal-sized conflict trees with unmatched labels require source-name correction and never use guessed aliases. Cloud accepts all gene_trees, calculates complete four-category conflict statistics with PhyloRender's independent JavaScript engine, and overlays only eligible exact-terminal ML trees. Select cloud.species_method=dated to retain a supplied chronogram and align genes for display using shared species clade ages; these are not independently inferred gene divergence or coalescence times. The built-in penalized-likelihood display aligner is display_alignment only (synthetic numsites=100000000, smooth=100, seed=1); older backend responses without that seed stop explicitly. Dated/cloud species roots cannot be reset through rooting.outgroup.",
      "Use inspect_tree before rendering unfamiliar files. A tool call may contain at most 100000 object keys and array elements in total, independent of tree-text byte limits.",
      "Dense Dating-label gate: inspect_tree reports time_label_density. When dense=true and the user has not already chosen an age-label range, ask once before create_figure whether to use the recommended older 50%, label every node, or label fewer nodes. Accepting the recommendation means omit both options.time.age_minimum and age_maximum; the renderer then applies the display-only older-half range. Full labels mean send age_minimum=0 with no upper bound and receive the bounded 1800-second render deadline. A narrower choice must be sent as an explicit source-unit age range. This gate hides only node-age numbers and their dots; topology, ages, HPD bars, branches, and time coordinates remain unchanged. Never disable arrows, shrink type, or alter scientific data to make a dense Dating render finish.",
      "Before a two-tree conflict comparison, call compare_tree_samples. Only strict 1-to-1 sample matching is supported (no many-to-one mapping). Exact sets may proceed; equal counts with unmatched labels require source-name correction or an explicit policy when the user requests intersection/union; different counts require asking the user to choose intersection or union before create_figure. Never choose a sample policy automatically.",
      "Use width-relative drawing units: the complete figure including both trees in conflict is 1000 units. Canonical dimensions end in _u: typography.tips.size_u, nodes.preferred_size_u/minimum_size_u, layout.branch_width_u/node_radius_u, time.*_size_u/hpd_thickness_u and cloud.pie_radius_u. Defaults come from figure-contract.js, approximately tips 13.24 u (phylogeny/conflict) or 15.88 u (time/cloud), node preferred 11.91 u compact baseline (typography.nodes.automatic_size=true scales preferred node sizes automatically with rendered row spacing and branch span, with optical compensation for asterisk symbols) and minimum 6.18 u, branch width 0.794 u and node radius 3.309 u. Node numbers default to regular weight. Automatic ink-aware tip spacing is default; manual spacing accepts tip_spacing_u or tip_spacing_em. Print width changes physical scale only, preserving layout and relative typography: output.width_mm=0 uses 400 mm except conflict uses 800 mm; these are also the respective maximums. Explicit aspect ratios add height when needed, while measured content and minimum readable row spacing take priority. Horizontal stretch changes branches inside the fixed frame. Legacy *_pt and pixel fields are converted using the fixed reference design, not interpreted as physical point sizes at the selected print width. SVG viewBox width is always 1000. MCP create/edit/restore generate SVG only by default. Request PNG explicitly via export_figure; output.dpi defaults to 300 for raster output and affects density only. Ordinary/Dating panels are an explicit export option, split once with panel 2 one complete monophyletic clade.",
      "If a phylogram has positive internal branch lengths while every terminal branch length is missing or zero, treat it as an ASTRAL-like display case: preserve all source values, add an equal display-only terminal length of 1 to every tip, and suppress the scale bar because the resulting coordinate system mixes source and display lengths. Never describe that constant terminal display length as substitutions, time, or coalescent units.",
      "Terminal spacing is centre-to-centre, not blank space between glyphs. Automatic spacing uses measured ink: dense trees approach a 1 px visible gap, while sparse trees retain modest breathing room. Do not increase row spacing to place node annotations or node labels; move those annotations locally with their leaders instead.",
      "Do not treat 'enough space', large blank margins, or a collision-free result achieved by tiny text as goals. Human readability comes first: keep labels large and let the tree occupy the useful canvas; use automatic geometry expansion and local placement only when needed. Do not increase spacing or canvas size merely to manufacture empty space, and do not shrink labels below the readable defaults unless the user explicitly asks for smaller typography.",
      "The configured minimum font size is a hard floor. With arrows enabled, labels need not be nearest to their own node: the straight arrow identifies the true node. Branch crossings may use white bridges, and unavoidable label/branch overlap may use a tight white backdrop that never covers other text or node symbols. Do not restore nearest-node or zero-branch-crossing constraints at the expense of readability. Inspect report.label_layout and remaining_collisions; unresolved text conflicts remain unsafe for export.",
      "The main tree always determines topology. Additional trees only contribute node values matched by unrooted bipartitions.",
      "Support units are determined per source and per compound column before display classification. Use options.support.scale for the ordinary main tree, support_trees[].scale for independent auxiliary sources, and conflict.primary_support_scale/secondary_support_scale for the two conflict sides. Values are auto, probability or percent; declare mixed columns as probability/percent or another /-separated sequence. Nonzero sources confined to 0–1 are ambiguous in auto mode and require explicit units; zero-only values are equivalent in both scales. Full-support drawing uses the selected display precision: every required source and component must round to its own maximum (100 percent or probability 1); original precision compares raw values, and missing sources prevent full support. This applies to branches, circles, numbers, stars and hidden styles without changing source data. Low-support cutoffs remain raw. Cloud uses its separate scalar phyparts_scale across the whole comparable gene batch before serialization; its scientific thresholds and counts never use display rounding.",
      "Use tip names, never screen coordinates, for rooting and MRCA clade definitions.",
      "When rooting is omitted in phylogeny, a unique Euptelea pleiosperma supplies the default outgroup (spaces or underscores accepted). Missing or ambiguous matches retain the input root. Conflict uses only the main-tree rooting.outgroup and applies that same sample-defined root side to the comparison tree; do not request a second outgroup. Time and cloud retain their supplied roots. Check the normalized specification for the actual conflict outgroup.",
      "Use tip_label_overrides or tip-label edit operations to change displayed sample names. Original tree labels remain the identifiers for rooting, matching, and clades.",
      "A clade-bar name may use name_segments so consecutive parts have independent font family, size, color, boldness, and italics. Keep name equal to the exact concatenated segment text.",
      "Keep figure_id and revision across turns. Call inspect_figure before edit_figure, then submit semantic operations with the current base_revision.",
      "Node arrows are enabled by default for branch-length phylograms and dated time trees, and can be disabled with options.labels.node_arrows=false; when branch lengths are not displayed (ordinary cladogram/aligned modes, branchless input trees, and conflict tanglegrams), leader lines are automatically suppressed and support labels sit directly beside each node (upper-left, lower-left, or right; mirrored on the right conflict tree). Straight dashed shafts prefer a length of about 9.27 drawing units and an angle between 20 and 80 degrees from the horizontal. Angle and length are scored preferences, reported through angle_and_length_are_soft_preferences and advisory counts; they are not additional safe_for_export gates. Preserve the font floor and attach to visible glyphs and the true node. Both low and missing support values use the short dash (–). When enabled, require missing, misdirected and leader_lines_unbridged_crossings to be zero and inspect advisory geometry and bridged crossings. When disabled or suppressed, require arrows and unexpected counts to be zero.",
      "All figure typography defaults prefer installed Arial. Bundled fonts embed in SVG. System Arial does not embed; missing Arial explicitly uses bundled Arimo. Check report.font_portability. Identical raster results require the same fonts and rendering environment. For ordinary/time figures, require report.clade_bar_spacing.valid=true before presenting group bars.",
      "Group-name fonts default to the current tip-name font size plus exactly 3 drawing units in phylogeny, time and cloud. Omit group sizes to retain this live relationship (typography.clades.follow_tip_size=true). A group size supplied without that flag is fixed, preserving legacy configurations; explicitly true restores following. Per-segment size overrides remain independent. Changing typography never changes scientific data or starts treePL/conflict statistics.",
      "For time trees, never infer years, kyr, or Mya from numeric heights. Confirm the source analysis, then set options.time.source_unit explicitly; optional display_unit converts the figure without rewriting the tree. Choose age_source when height, height_mean, and height_median differ. Verify report.time and preserve the source/unit/calibration explanation for the manuscript caption; the SVG has no bottom explanatory key.",
      "Check report.safe_for_export and report.warnings before presenting an artifact as publication-ready.",
    ].join(" "),
  });

  server.registerResource(
    "figure-spec-schema",
    "phylorender://schema/figure-spec",
    {
      title: "PhyloRender figure specification schema",
      description: "Detailed JSON Schema for deterministic agent-driven phylogenetic figures.",
      mimeType: "application/schema+json",
    },
    async uri => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/schema+json",
        text: await readFile(path.join(MCP_ROOT, "schemas", "figure-spec.schema.json"), "utf8"),
      }],
    }),
  );

  server.registerResource("figure-capabilities", "phylorender://capabilities", {
    title: "Web and MCP figure capabilities", mimeType: "application/json",
    description: "Shared modes, scientific constraints, dependencies and explicit unsupported features.",
  }, async uri => ({contents:[{uri:uri.href,mimeType:"application/json",text:JSON.stringify({
    ...contract.capabilities, runtime: await runtimeCapabilities(renderer.pageUrl),
  },null,2)}]}));

  server.registerResource(
    "figure-revision-artifact",
    new ResourceTemplate("phylorender://figures/{figureId}/revisions/{revision}/{artifact}", { list: undefined }),
    {
      title: "Immutable PhyloRender revision artifact",
      description: "SVG, PNG, preview, reproducible specification, or QA report for one immutable figure revision.",
    },
    async (uri, variables) => {
      const figureId = String(variables.figureId || "");
      const revision = Number(variables.revision);
      const artifact = String(variables.artifact || "");
      if (!artifactNames.includes(artifact)) throw new Error(`Unsupported artifact ${artifact}.`);
      const item = await store.artifact(figureId, artifact, revision);
      if (item.mimeType.startsWith("image/") && item.mimeType !== "image/svg+xml") {
        return { contents: [{ uri: uri.href, mimeType: item.mimeType, blob: item.data.toString("base64") }] };
      }
      return { contents: [{ uri: uri.href, mimeType: item.mimeType, text: item.data.toString("utf8") }] };
    },
  );

  server.registerResource(
    "agent-guide",
    "phylorender://docs/agent-guide",
    {
      title: "PhyloRender agent guide",
      description: "Workflow, parameter semantics, and publication-safety rules for AI agents.",
      mimeType: "text/markdown",
    },
    async uri => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: await readFile(path.join(MCP_ROOT, "docs", "agent-guide.md"), "utf8"),
      }],
    }),
  );

  server.registerResource(
    "figure-artifact",
    new ResourceTemplate("phylorender://figures/{figureId}/{artifact}", { list: undefined }),
    {
      title: "PhyloRender figure artifact",
      description: "SVG, PNG, preview, reproducible specification, or QA report for a rendered figure.",
    },
    async (uri, variables) => {
      const figureId = String(variables.figureId || "");
      const artifact = String(variables.artifact || "");
      if (!artifactNames.includes(artifact)) throw new Error(`Unsupported artifact ${artifact}.`);
      const item = await store.artifact(figureId, artifact);
      if (item.mimeType.startsWith("image/") && item.mimeType !== "image/svg+xml") {
        return { contents: [{ uri: uri.href, mimeType: item.mimeType, blob: item.data.toString("base64") }] };
      }
      return { contents: [{ uri: uri.href, mimeType: item.mimeType, text: item.data.toString("utf8") }] };
    },
  );

  server.registerTool("inspect_tree", {
    title: "Inspect a phylogenetic tree",
    description: "Parse Newick or Nexus without changing it. Reports tips, branch lengths, numeric fields, support count, ultrametric diagnostics, root age when applicable, and an unrooted topology fingerprint. Call this before create_figure for unfamiliar input.",
    inputSchema: { main_tree: treeInputSchema },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ main_tree }) => {
    try {
      const inspection = await renderer.inspect(main_tree);
      return textAndStructured(inspection);
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("compare_tree_samples", {
    title: "Compare samples in two phylogenetic trees",
    description: "Parse two Newick or Nexus trees without changing them. Preserve original labels in difference lists and use the same unambiguous case/space/underscore matching policy as the conflict renderer. Returns complete tree-specific sample lists and states whether source correction or an explicit user choice between intersection and union is required before a two-tree conflict figure. Rejects normalization collisions.",
    inputSchema: {
      main_tree: treeInputSchema,
      comparison_tree: treeInputSchema,
      policy: z.enum(["conflict", "auxiliary", "exact"]).optional().default("conflict")
        .describe("Sample-name matching policy: conflict (default case/space/underscore-folded), auxiliary (outgroup-prefix & punctuation-folded), or exact."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ main_tree, comparison_tree, policy = "conflict" }) => {
    try {
      const [primary, comparison] = await Promise.all([renderer.inspect(main_tree), renderer.inspect(comparison_tree)]);
      return textAndStructured(compareTreeSampleInspections(primary, comparison, policy));
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("create_figure", {
    title: "Create a PhyloRender figure",
    description: "Create a deterministic phylogenetic figure with complete figure width=1000 drawing units in all four workspaces. Canonical dimensions use _u: typography.tips.size_u (about 13.24 ordinary/conflict, 15.88 time/cloud), typography.nodes.preferred_size_u/minimum_size_u, layout.branch_width_u/node_radius_u, time.*_size_u/hpd_thickness_u, cloud.pie_radius_u, clade name_segments[].size_u, label_adjustments dx_u/dy_u/font_reduction_u. Shared contract supplies exact defaults and automatic ink-aware row spacing. Print width only scales the finished figure: width_mm 0 uses the maximum, 400 mm ordinary/Dating/cloud or 800 mm double-tree conflict. DPI only controls PNG density. Default SVG-only output avoids rasterization; request PNG explicitly later. Legacy point/pixel fields are converted to the fixed width-relative reference. Node annotations move locally and must not force larger terminal spacing. Do not shrink readable type or add blank rows. Overlong text produces an explicit content-width error. ASTRAL-like zero-terminal trees get display-only twigs and no misleading scale bar, retaining all source data. Main tree alone defines topology; auxiliary values match unrooted splits. Rooting/clades use original sample identities; tip_label_overrides only rename display. Returns immutable SVG, canonical reproducible settings and QA report.",
    inputSchema: figureSpecSchema,
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (spec, extra) => {
    try {
      const figure = await store.create(spec, { signal: extra?.signal });
      const result = { figure_id: figure.figureId, revision: figure.revision, report: figure.report, spec: figure.spec };
      return textAndStructured(result, artifactLinks(figure.figureId, ["svg"], figure.revision));
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("start_figure_job", {
    title: "Start a bounded background figure job",
    description: "Use for large analyses. Returns immediately. Reuse the same idempotency_key after a lost response; a different spec with that key is rejected. Poll get_figure_job, then inspect/export the resulting figure. Jobs retain results for one hour; interrupted jobs are reported explicitly after restart.",
    inputSchema: { figure_spec: figureSpecSchema, idempotency_key: z.string().min(1).max(128) },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ figure_spec, idempotency_key }) => {
    try {
      store.validatedSpec(figure_spec);
      return textAndStructured(await store.jobs.start(figure_spec, idempotency_key,
        signal => store.create(figure_spec, { signal })));
    } catch (error) { return toolFailure(error); }
  });
  server.registerTool("get_figure_job", {
    title: "Read background figure job",
    inputSchema: { job_id: z.string().uuid() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ job_id }) => {
    try { return textAndStructured(await store.jobs.get(job_id)); }
    catch (error) { return toolFailure(error); }
  });
  server.registerTool("cancel_figure_job", {
    title: "Cancel background figure job",
    description: "Stops queued or rendering work and prevents publication. A cancelling status is not completion; poll until terminal. Native helper processes have separate bounded deadlines. Already committed figures are not deleted.",
    inputSchema: { job_id: z.string().uuid() },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ job_id }) => {
    try { return textAndStructured(await store.jobs.cancel(job_id)); }
    catch (error) { return toolFailure(error); }
  });

  server.registerTool("inspect_figure", {
    title: "Inspect an editable PhyloRender figure",
    description: "Return the current or requested immutable revision, redacted settings, stable source/clade/branch identifiers, revision metadata, and QA report without generating a raster preview. Call this before each conversational edit.",
    inputSchema: {
      figure_id: figureIdSchema,
      revision: revisionSchema.optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ figure_id, revision }) => {
    try {
      const figure = await store.describe(figure_id, revision ?? null);
      const requested = figure.spec.requested;
      const result = {
        figure_id,
        revision: figure.revision,
        current_revision: figure.currentRevision,
        is_current: figure.revision === figure.currentRevision,
        revision_info: figure.revisionInfo,
        state: {
          workspace: requested.workspace || "phylogeny",
          main_tree: requested.main_tree,
          comparison_tree: requested.comparison_tree || null,
          gene_trees: requested.gene_trees || null,
          phyparts_table: requested.phyparts_table || null,
          sample_groups: requested.sample_groups || [],
          options: requested.options || {},
          rooting: requested.rooting || { outgroup: null },
          clades: requested.clades || [],
          support_sources: requested.support_trees || [],
          other_data_sources: requested.other_data_trees || [],
          label_adjustments: requested.label_adjustments || [],
          tip_label_overrides: requested.tip_label_overrides || {},
          branches: figure.report.branches || [],
        },
        report: figure.report,
      };
      return textAndStructured(result);
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("edit_figure", {
    title: "Apply semantic edits to a PhyloRender figure",
    description: "Apply one atomic batch of semantic edits to the current figure revision. Supports nested settings, rooting, individual or batch sample display-name changes, add/update/remove clades including mixed-style name_segments, sample_groups (conflict), cloud pie visibility (hide_cloud_pie/show_cloud_pie/reset_hidden_cloud_pies), node-data sources, and stable-branch label adjustments. Returns a new SVG-only immutable revision, exact change diff and QA report. Rejects stale base_revision values.",
    inputSchema: figureEditSchema,
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ figure_id, base_revision, operations, change_note }) => {
    try {
      const figure = await store.edit(figure_id, operations, {
        expectedRevision: base_revision,
        changeNote: change_note,
      });
      const result = {
        figure_id,
        revision: figure.revision,
        parent_revision: figure.revisionInfo.parent_revision,
        changes: figure.revisionInfo.changes,
        operation_summary: figure.revisionInfo.operation_summary,
        report: figure.report,
        spec: figure.spec,
      };
      return textAndStructured(result, artifactLinks(figure_id, ["svg"], figure.revision));
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("update_figure", {
    title: "Update an existing PhyloRender figure",
    description: "Apply a partial patch to an existing figure and rerender from the original tree data. Nested option objects merge; support_trees, other_data_trees, and clades arrays replace the previous arrays. Returns a new SVG-only revision and updated QA report under the same figure identifier.",
    inputSchema: {
      figure_id: figureIdSchema,
      patch: figurePatchSchema,
      base_revision: revisionSchema,
      change_note: z.string().trim().min(1).max(500).optional(),
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ figure_id, patch, base_revision, change_note }) => {
    try {
      const figure = await store.update(figure_id, patch, {
        expectedRevision: base_revision,
        changeNote: change_note,
      });
      const result = {
        figure_id: figure.figureId,
        revision: figure.revision,
        parent_revision: figure.revisionInfo.parent_revision,
        changes: figure.revisionInfo.changes,
        report: figure.report,
        spec: figure.spec,
      };
      return textAndStructured(result, artifactLinks(figure.figureId, ["svg"], figure.revision));
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("list_revisions", {
    title: "List PhyloRender figure revisions",
    description: "List immutable revision numbers, parent revisions, timestamps, change notes, semantic operation summaries, and exact redacted diffs for one figure.",
    inputSchema: { figure_id: figureIdSchema },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ figure_id }) => {
    try {
      return textAndStructured(await store.listRevisions(figure_id));
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("restore_revision", {
    title: "Restore a prior PhyloRender revision",
    description: "Create a new immutable revision from a prior revision. History is never deleted or moved backward. Requires the current base_revision to prevent concurrent overwrites.",
    inputSchema: {
      figure_id: figureIdSchema,
      target_revision: revisionSchema,
      base_revision: revisionSchema,
      change_note: z.string().trim().min(1).max(500).optional(),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ figure_id, target_revision, base_revision, change_note }) => {
    try {
      const figure = await store.restore(figure_id, target_revision, {
        expectedRevision: base_revision,
        changeNote: change_note,
      });
      const result = {
        figure_id,
        revision: figure.revision,
        restored_from: target_revision,
        changes: figure.revisionInfo.changes,
        report: figure.report,
        spec: figure.spec,
      };
      return textAndStructured(result, artifactLinks(figure_id, ["svg"], figure.revision));
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("preview_figure", {
    title: "Preview a PhyloRender figure",
    description: "Explicitly generate and return a bounded-size PNG preview plus the current QA report. Do not call this in the default fast SVG workflow; use it only when the user asks for a raster preview or visual audit.",
    inputSchema: { figure_id: figureIdSchema, revision: revisionSchema.optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ figure_id, revision }) => {
    try {
      const figure = await store.describe(figure_id, revision ?? null);
      return textAndStructured({
        figure_id,
        revision: figure.revision,
        current_revision: figure.currentRevision,
        report: figure.report,
      }, [await previewContent(store, figure_id, figure.revision)]);
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("export_figure", {
    title: "Export a PhyloRender figure",
    description: "Return MCP resource links for publication-ready artifacts. SVG is the fast default. PNG rasterization occurs only when formats explicitly contains 'png'; panel SVGs occur only when formats explicitly contains 'panels'. The original tree text remains private to the rendering job.",
    inputSchema: {
      figure_id: figureIdSchema,
      revision: revisionSchema.optional(),
      formats: z.array(z.enum(["svg", "png", "panels", "a4"])).min(1).max(4).optional().default(["svg"]),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ figure_id, revision, formats }) => {
    try {
      const figure = await store.describe(figure_id, revision ?? null);
      const requestedFormats = [...formats];
      formats = [...new Set(formats.map(format => format === "a4" ? "panels" : format))];
      const unsupported = formats.includes("panels") && figure.report.two_panel?.supported === false ? ["panels"] : [];
      formats = formats.filter(format => !unsupported.includes(format));
      await store.ensureArtifacts(figure_id, figure.revision, formats);
      const result = {
        figure_id,
        revision: figure.revision,
        formats,
        unsupported_formats: unsupported,
        safe_for_export: figure.report.safe_for_export,
        warnings: [...figure.report.warnings,
          ...(requestedFormats.includes("a4") ? ["Format 'a4' is deprecated and is served as the two-panel tree set."] : []),
          ...(unsupported.length ? ["Two-panel splitting is unavailable for cloud/conflict, exactly as in the web editor."] : [])],
        resources: artifactLinks(figure_id, formats, figure.revision, figure.report.two_panel?.panels || 0).map(link => ({ uri: link.uri, mime_type: link.mimeType })),
      };
      return textAndStructured(result, artifactLinks(figure_id, formats, figure.revision, figure.report.two_panel?.panels || 0));
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("get_figure_spec", {
    title: "Get a reproducible PhyloRender specification",
    description: "Return requested and normalized settings, input file hashes, and the QA report. Raw Newick/Nexus text is deliberately omitted.",
    inputSchema: { figure_id: figureIdSchema, revision: revisionSchema.optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ figure_id, revision }) => {
    try {
      const figure = await store.describe(figure_id, revision ?? null);
      return textAndStructured({
        figure_id,
        revision: figure.revision,
        current_revision: figure.currentRevision,
        revision_info: figure.revisionInfo,
        spec: figure.spec,
        report: figure.report,
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("delete_figure", {
    title: "Delete a PhyloRender figure",
    description: "Permanently delete one figure job and all generated artifacts. This does not affect the user's original tree files.",
    inputSchema: { figure_id: figureIdSchema },
    annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ figure_id }) => {
    try {
      return textAndStructured(await store.delete(figure_id));
    } catch (error) {
      return toolFailure(error);
    }
  });

  return server;
}

export { artifactNames };
