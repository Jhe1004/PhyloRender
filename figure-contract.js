(function exposeFigureContract(root) {
  "use strict";
  const units = () => root.PhyloRenderUnits || (typeof require === "function" ? require("./figure-units.js") : null);
  const rasterization = Object.freeze({ maximumPixels: 80000000, maximumDimension: 32000 });
  const cladeLabelOrientation = Object.freeze({defaultValue: "auto", values: Object.freeze(["auto", "horizontal", "vertical"])});
  const cladeBarAlignment = Object.freeze({defaultValue: "auto", values: Object.freeze(["auto", "nearby", "aligned"])});
  const cladeBarStyle = Object.freeze({defaultValue: "auto", values: Object.freeze(["auto", "solid", "dashed", "dash-dot"])});
  const supportPrecision = Object.freeze({ defaultValue: "auto", percentDecimals: 0, probabilityDecimals: 2,
    values: Object.freeze(["auto", "original", 0, 1, 2, 3, 4, 5, 6]) });
  const cladeTier = Object.freeze({minimum: 0, maximum: 5});
  const cloudPieLegendDefaultPosition = "lower-left";
  const cloudJitter = Object.freeze({ defaultValue: 0, minimum: 0, maximum: 100, step: 1, maximumAmplitudeRows: .5 });
  const cloudOpacity = Object.freeze({ defaultValue: 18, minimum: 2, maximum: 60, step: 1 });
  const cloudPies = Object.freeze({ defaultRadiusPx: 32, minimumRadiusPx: 8, maximumRadiusPx: 54, youngestRatio: 0.55 });
  const tipReadability = Object.freeze({ ordinarySizePt: 15, datedSizePt: 18,
    denseGapPx: 1, sparseGapEm: .3, sparseUntilTips: 12, denseAtTips: 48 });
  const automaticRowLayout = Object.freeze({ targetHeightToWidth: 1.25,
    maximumSpacingEm: 3, fadeStartTips: 80, compactAtTips: 120, viewportSubpixels: 64 });
  const tipLabelWidth = Object.freeze({ maximumMedianRatio: 1.25,
    reference: "natural_width_median", adjustment: "spacingAndGlyphs" });
  function maximumTipLabelWidth(widths) {
    if (!Array.isArray(widths) || widths.some(w => !Number.isFinite(w) || w < 0))
      throw new TypeError("Invalid sample-name widths");
    const sorted = widths.filter(w => w > 0).slice().sort((a,b) => a-b);
    if (!sorted.length) return Infinity;
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : sorted[middle-1] / 2 + sorted[middle] / 2;
    return median * tipLabelWidth.maximumMedianRatio;
  }
  const cladeReadability = Object.freeze({ offsetU: 3, minimumDesign: 8,
    maximumDesign: Math.ceil(30 + units().drawingToDesign(3)) });
  const nodeLabelReadability = Object.freeze({ compactSizePx: 18, datingCompactRatio: .85, extraRowScale: .32,
    maximumTipRatio: 1.3, maximumAutoSizePx: 30, horizontalStepScale: .72, minimumDesign: 9, maximumDesign: 32, asteriskScale: 1.38 });
  function planAutomaticNodeSize(input = {}) {
    const minimumSizePx = Math.max(nodeLabelReadability.minimumDesign, Number(input.minimumSizePx) || nodeLabelReadability.minimumDesign);
    const currentSizePx = Number(input.currentSizePx) || nodeLabelReadability.compactSizePx;
    if (input.automatic === false)
      return { sizePx: Math.max(minimumSizePx, Math.min(nodeLabelReadability.maximumDesign, currentSizePx)), automatic: false };
    const tipSizePx = Number(input.tipSizePx) || 20, tipSpacingPx = Number(input.tipSpacingPx) || tipSizePx * 1.05;
    const baseFloor = Math.max(minimumSizePx, nodeLabelReadability.compactSizePx,
      Math.min(tipSpacingPx * .82, tipSizePx * nodeLabelReadability.datingCompactRatio));
    const byRow = baseFloor + Math.max(0, tipSpacingPx - tipSizePx * 1.05) * nodeLabelReadability.extraRowScale;
    const tipCeiling = Math.min(nodeLabelReadability.maximumAutoSizePx, Math.max(baseFloor, tipSizePx * nodeLabelReadability.maximumTipRatio));
    let sizePx = Math.max(baseFloor, Math.min(tipCeiling, byRow));
    if (Number.isFinite(input.plotWidthPx) && input.plotWidthPx > 0 && Number.isFinite(input.maxDepth) && input.maxDepth > 0)
      sizePx = Math.min(sizePx, Math.max(baseFloor, input.plotWidthPx / Math.max(4, input.maxDepth) * nodeLabelReadability.horizontalStepScale));
    sizePx = Math.max(minimumSizePx, Math.min(nodeLabelReadability.maximumDesign, Math.round(sizePx * 4) / 4));
    return { sizePx, automatic: true, baseFloor, tipSpacingPx, tipSizePx };
  }
  function resolveCladeTypography(options) {
    const result = structuredClone(options), clades = result.typography?.clades;
    if (clades?.follow_tip_size === true)
      clades.size_u = result.typography.tips.size_u + cladeReadability.offsetU;
    return result;
  }
  const datingLabelDensity = Object.freeze({ minimumCandidateLabels: 160,
    defaultOlderFraction: .5, fullRenderDeadlineSeconds: 1800 });
  const maximumWidthMmByWorkspace = Object.freeze({ phylogeny: 400, time: 400, cloud: 400, conflict: 800 });
  const outputGeometry = Object.freeze({ absoluteMaximumWidthMm: 800, maximumWidthMmByWorkspace,
    minimumTreeSpanPx: 160,
    interpretation: "Phylogeny, Dating and cloud workspaces keep the exported canvas at or below 400 mm; the double-tree conflict workspace uses an 800 mm ceiling. When content approaches its workspace ceiling, horizontal tree geometry is compressed before readable text is changed." });
  function maximumOutputWidthMm(workspace = "phylogeny") {
    return maximumWidthMmByWorkspace[workspace] || maximumWidthMmByWorkspace.phylogeny;
  }
  const publicationDefaults = {
    layout: { ladderize: "small-top", clade_bar_alignment: cladeBarAlignment.defaultValue, tip_spacing_em: 1.05,
      automatic_tip_spacing: true, branch_width_pt: .9, node_radius_pt: 3.75 },
    output: { aspect_ratio: "auto", width_mm: 0, dpi: 300 },
    labels: { auto_placement: true, node_arrows: true },
    support: { scale: "auto", decimals: supportPrecision.defaultValue, full_support_marker: "branch", low_support_threshold: 50 },
    conflict: {primary_support_scale: "auto", secondary_support_scale: "auto"},
    time: { period_size_pt: 16.5, epoch_size_pt: 14.25, legend_size_pt: 12.75, axis_size_pt: 15.75, unit_size_pt: 15, key_size_pt: 15 },
    typography: { tips: { size_pt: tipReadability.ordinarySizePt }, nodes: { automatic_size: true, preferred_size_pt: 13.5, minimum_size_pt: 7 } },
  };
  function merge(base, patch) {
    const result = structuredClone(base || {});
    Object.entries(patch || {}).forEach(([key, value]) => {
      result[key] = value && typeof value === "object" && !Array.isArray(value)
        ? merge(result[key], value) : structuredClone(value);
    });
    return result;
  }
  const optionBlocks = Object.freeze({
    phylogeny: ["time", "cloud", "conflict"],
    time: ["cloud", "conflict", "support", "typography.scale", "layout.mode"],
    cloud: ["conflict", "support", "labels", "typography.nodes", "typography.scale", "layout.mode", "layout.node_radius_pt"],
    conflict: ["cloud", "time", "typography.clades", "typography.scale", "layout.mode", "layout.clade_bar_alignment", "layout.horizontal_scale", "labels.auto_placement"],
  });
  const cloudTimeOptions = new Set(["time.period_size_pt", "time.epoch_size_pt", "time.legend_size_pt", "time.axis_size_pt", "time.unit_size_pt", "time.key_size_pt", "time.geology"]);
  function optionSupported(workspace, path) {
    path = path.replace(/_u$/, "_pt");
    if (!Object.hasOwn(optionBlocks, workspace)) return false;
    if (workspace === "conflict" && path === "support.scale") return false; // Each side has its own source units.
    if (workspace === "cloud" && path.startsWith("time.")) return cloudTimeOptions.has(path);
    return !optionBlocks[workspace].some(blocked => path === blocked || path.startsWith(`${blocked}.`));
  }
  function valueAt(object, path) { return path.split(".").reduce((value, key) => value?.[key], object); }
  function assignAt(object, path, value) {
    const keys = path.split("."), last = keys.pop();
    const parent = keys.reduce((value, key) => value[key] ||= {}, object);
    parent[last] = structuredClone(value);
  }
  function deleteAt(object, path) {
    const keys = path.split("."), last = keys.pop();
    const parent = keys.reduce((value, key) => value?.[key], object);
    if (parent) delete parent[last];
  }
  function compact(object) {
    Object.keys(object || {}).forEach(key => {
      const value = object[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        compact(value); if (!Object.keys(value).length) delete object[key];
      }
    });
    return object;
  }
  function normalizeWorkspaceOptions(workspace, options = {}) {
    const result = structuredClone(options || {});
    const aliases = workspace === "cloud" ? [["cloud.ladderize", "layout.ladderize"]]
      : workspace === "conflict" ? [["conflict.primary_ladder", "layout.ladderize"], ["conflict.primary_order", "layout.tip_order"]] : [];
    aliases.forEach(([legacy, canonical]) => {
      const oldValue = valueAt(result, legacy), newValue = valueAt(result, canonical);
      if (oldValue === undefined) return;
      if (newValue !== undefined && JSON.stringify(oldValue) !== JSON.stringify(newValue))
        throw new Error(`Conflicting figure options: ${legacy} vs. ${canonical}`);
      assignAt(result, canonical, oldValue); deleteAt(result, legacy);
    });
    return compact(result);
  }
  function unsupportedOptionPaths(workspace, options = {}) {
    const result = [];
    (function visit(object, prefix = "") {
      Object.entries(object || {}).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) visit(value, path);
        else if (!optionSupported(workspace, path)) result.push(path);
      });
    })(normalizeWorkspaceOptions(workspace, options));
    return result;
  }
  function optionsForWorkspace(workspace, options = {}) {
    const source = normalizeWorkspaceOptions(workspace, options), result = {};
    (function visit(object, target, prefix = "") {
      Object.entries(object || {}).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const nested = {}; visit(value, nested, path); if (Object.keys(nested).length) target[key] = nested;
        } else if (optionSupported(workspace, path)) target[key] = structuredClone(value);
      });
    })(source, result);
    return result;
  }
  function defaults(workspace = "phylogeny") {
    const dated = workspace === "time" || workspace === "cloud";
    return resolveCladeTypography(units().drawingOptions(optionsForWorkspace(workspace, merge(publicationDefaults, {
      ...(workspace === "cloud" ? { cloud: { phyparts_outgroups: [], jitter: cloudJitter.defaultValue,
        opacity: cloudOpacity.defaultValue, pie_radius: cloudPies.defaultRadiusPx,
        pie_legend_position: cloudPieLegendDefaultPosition, pie_legend_scale: 150 } } : {}),
      layout: { automatic_tip_spacing: true, horizontal_scale: 100,
        clade_bar_alignment: cladeBarAlignment.defaultValue },
      typography: {
        tips: { size_pt: dated ? tipReadability.datedSizePt : tipReadability.ordinarySizePt,
          family: 'Arial, "Noto Sans SC Variable", sans-serif',
          color: workspace === "cloud" ? "#202a30" : "#17211b", bold: false,
          italic_mode: "auto", normalize_ranks: true, follow_clade_color: true },
        nodes: { family: 'Arial, "Noto Sans SC Variable", sans-serif', color: "#8c2e28", bold: false, italic: false },
        clades: { family: 'Arial, "Noto Sans SC Variable", sans-serif', follow_tip_size: true, bold: true, italic: false },
        scale: { family: 'Arial, "Noto Sans SC Variable", sans-serif', size_pt: 13.5, color: "#26302b", bold: false, italic: false },
      },
    }))));
  }
  function automaticTipGap(count, size) {
    const density = Math.max(0, Math.min(1,
      (count - tipReadability.sparseUntilTips) / (tipReadability.denseAtTips - tipReadability.sparseUntilTips)));
    return size * tipReadability.sparseGapEm * (1 - density) + tipReadability.denseGapPx * density;
  }
  function planAutomaticRows(input) {
    const {baseSpacing, naturalHeight, intervals, count} = input;
    const result = {spacing: baseSpacing, height: naturalHeight, expanded: false,
      targetHeightToWidth: automaticRowLayout.targetHeightToWidth};
    if (!input.automatic || input.aspectMode !== "auto" || input.workspace === "conflict"
      || count < 2 || !(intervals > 0)) return result;
    const progress = Math.max(0, Math.min(1, (count - automaticRowLayout.fadeStartTips)
      / (automaticRowLayout.compactAtTips - automaticRowLayout.fadeStartTips)));
    const weight = 1 - progress * progress * (3 - 2 * progress);
    const targetHeight = input.width * automaticRowLayout.targetHeightToWidth;
    const limit = Math.max(baseSpacing, Math.min(tipSpacingLimits.maximumPx,
      input.fontSize * automaticRowLayout.maximumSpacingEm));
    const extraSpacing = Math.max(0, Math.min((targetHeight - naturalHeight) / intervals, limit - baseSpacing)) * weight;
    // Blink snaps the CSS viewport to 1/64 px. Keep its viewBox on that same
    // grid before measuring glyphs; a later canvas ceil must not change CTM.
    const grid = automaticRowLayout.viewportSubpixels;
    const alignedHeight = Math.floor((naturalHeight + intervals * extraSpacing) * grid) / grid;
    const height = extraSpacing > 0 ? Math.max(naturalHeight, alignedHeight) : naturalHeight;
    const spacing = baseSpacing + (height - naturalHeight) / intervals;
    return {...result, spacing, height, expanded: spacing > baseSpacing + 1e-9,
      baseSpacing, naturalHeight, count, limit, weight};
  }
  function datingLabelPlan({ candidateLabels = 0, rootAge = null, range = {} } = {}) {
    const count = Math.max(0, Math.trunc(Number(candidateLabels) || 0));
    const minimumRaw = Number.isFinite(range.minimumRaw) && range.minimumRaw >= 0 ? range.minimumRaw : null;
    const maximumRaw = Number.isFinite(range.maximumRaw) && range.maximumRaw >= 0 ? range.maximumRaw : null;
    const explicit = range.explicit === true || minimumRaw !== null || maximumRaw !== null;
    const dense = count >= datingLabelDensity.minimumCandidateLabels;
    const automaticApplied = !explicit && dense && Number.isFinite(rootAge) && rootAge > 0;
    return {
      candidateLabels: count,
      dense,
      threshold: datingLabelDensity.minimumCandidateLabels,
      defaultOlderFraction: datingLabelDensity.defaultOlderFraction,
      automaticApplied,
      explicit,
      effectiveRange: {
        minimumRaw: automaticApplied ? rootAge * (1 - datingLabelDensity.defaultOlderFraction) : minimumRaw,
        maximumRaw,
      },
    };
  }
  function physicalOptions(options = {}) {
    const result = structuredClone(options);
    const move = (object, oldKey, key, factor) => {
      if (!object || object[oldKey] === undefined) return;
      if (object[key] === undefined) object[key] = object[oldKey] * factor;
      delete object[oldKey];
    };
    move(result.layout, "branch_width", "branch_width_pt", .75);
    move(result.output, "png_scale", "dpi", 96);
    for (const section of ["tips", "clades", "scale"]) move(result.typography?.[section], "size", "size_pt", .75);
    move(result.typography?.nodes, "preferred_size", "preferred_size_pt", .75);
    move(result.typography?.nodes, "minimum_size", "minimum_size_pt", .75);
    const clades = result.typography?.clades;
    if (clades && clades.follow_tip_size === undefined && ["size_u", "size_pt", "size"].some(key => clades[key] !== undefined))
      clades.follow_tip_size = false;
    const nodes = result.typography?.nodes;
    if (nodes && nodes.automatic_size === undefined && ["preferred_size_u", "preferred_size_pt", "preferred_size"].some(key => nodes[key] !== undefined))
      nodes.automatic_size = false;
    return units().drawingOptions(result);
  }
  const tipSpacingLimits = Object.freeze({ minimumEm: .9, maximumEm: 4, minimumPx: 4.5, maximumPx: 72 });
  // Preserve GUI row geometry after font edits; do not clamp an invalid em
  // ratio just to serialize it. Fractional absolute pixels are lossless.
  function serializeTipSpacing({ spacingPx, fontSizePx, spacingEm, automatic }) {
    const em = automatic ? spacingPx / fontSizePx : spacingEm;
    const useEm = em !== null && Number.isFinite(em)
      && em >= tipSpacingLimits.minimumEm && em <= tipSpacingLimits.maximumEm;
    return { ...(useEm ? { tip_spacing_em: em } : { tip_spacing: spacingPx }),
      automatic_tip_spacing: Boolean(automatic) };
  }
  const capabilities = Object.freeze({
    automatic_row_layout: { ...automaticRowLayout, interpretation: "Automatic single-tree row spacing targets height/width 1.25 by moving real rows, with a sparse expansion cap and a smooth return to compact dense rows. Conflict comparisons retain landscape preference; manual spacing and explicit aspect modes take priority." },
    tip_label_width: { ...tipLabelWidth, interpretation: "Each complete sample label is at most 1.25 times the median natural glyph width of the rendered sample names (both columns together for conflict figures). Only longer labels compress horizontally; height, full text, identity and scientific data remain unchanged. There is no fixed canvas-fraction cap." },
    clade_label_orientation: { ...cladeLabelOrientation, interpretation: "Aligned groups prefer rotated names with collision columns; nearby groups use existing whitespace without covering sample labels. Explicit orientations remain fixed." },
    clade_bar_alignment: { ...cladeBarAlignment, interpretation: "Automatic mode aligns clade brackets in shared right-side tier columns whenever tree tips are flush-aligned (time trees, cloudograms, cladograms, aligned topologies, or unscaled trees) or when two or more clade layers are present, and keeps single-layer phylogram brackets near each clade's own tip labels. Explicit nearby and aligned modes remain supported." },
    clade_hierarchy: { bar_style: cladeBarStyle, tier: cladeTier, interpretation: "Single-layer clades use solid brackets. When clades nest or an explicit outer tier (>=1) is declared, bar_style=auto renders solid inner brackets, cap-locked dashed first-level outer brackets, and dash-dot higher-order outer brackets while keeping horizontal end caps solid and aligning peer tiers into shared columns." },
    clade_font: { default_mode: "follow_tip_size", offset_u: cladeReadability.offsetU,
      explicit_size_mode: "fixed", workspaces: ["phylogeny", "time", "cloud"] },
    node_font: { ...nodeLabelReadability, default_mode: "automatic_size",
      explicit_size_mode: "fixed", workspaces: ["phylogeny", "time", "conflict"] },
    support_units: { automatic: "reject_ambiguous_fractional_or_mixed_sources", explicit: ["probability", "percent"], zero_only: "equivalent_in_both_units" },
    support_decimals: { ...supportPrecision, interpretation: "Default auto formats percentage columns as integers (0 decimal places) and probability columns to 2 decimal places; explicit 0–6 applies uniformly across columns; original preserves raw unrounded strings." },
    contract_version: 1,
    drawing_units: {model:"drawing-width-1000-v1",width:1000,dimension_suffix:"_u",print_width_affects_layout:false},
    modes: ["phylogeny", "time", "cloud", "conflict"],
    shared_rendering: "index.html + app.js + agent-bridge.js",
    artifact_generation: {default_formats:["svg"],panels:"only_when_requested",panel_report:"generated=false means an unmeasured plan"},
    scientific_inputs: "Original sample identities, topology and source values remain unchanged.",
    output_geometry: { ...outputGeometry },
    scientific_limits: {
      heterochronous_tips: "Rejected until serial-sampling-aware geometry is implemented",
      posterior_tree_sets: "Explicit selection or external summary required; never use first tree implicitly",
      cloud_time_interpretation: "Constrained display alignment, not independently inferred gene divergence/coalescence times",
      parser: { max_characters: 12000000, max_tokens: 1000000, max_nodes: 200000, max_depth: 512 },
    },
    rasterization,
    performance_limits: { mcp_tool_input_elements: 100000, mcp_stdio_message_bytes: 419430400, interactive_tree_tips: 1500, gene_collection_characters: 120000000,
      gene_collection_trees: 20000, gene_collection_nodes: 10000000, overlay_nodes: 30000,
      worker_deadline_seconds: 120, conflict_statistics_worker_deadline_seconds: 300,
      native_owner_lease_seconds: 30,
      native_deadline_seconds: 300, treepl_tree_deadline_seconds: 30,
      dense_dating_labels: { ...datingLabelDensity,
        interpretation: "Dating-only display protection. Omitted age bounds show only the older half when candidate node-age labels reach the threshold; tree, ages and HPD remain unchanged." },
      input_preparation: "Dedicated Worker; oversized input is refused, never silently sampled",
      cleanup_guarantee: "Input/conflict Workers are terminated on cancel, timeout and page exit; native POSIX engine process groups are reaped. CLEANUP_PENDING means stopping is not yet confirmed." },
    jobs: { background: true, tools: ["start_figure_job", "get_figure_job", "cancel_figure_job"],
      queue_capacity: 8, retained_jobs: 64, retention_seconds: 3600, render_deadline_seconds: 600,
      explicit_full_dating_labels_deadline_seconds: datingLabelDensity.fullRenderDeadlineSeconds,
      update_requires_base_revision: true },
    cloud: { gene_outgroups: "Explicit exact sample list matching one existing species-root child; observed subset must define one gene edge; species root and ages unchanged", complete_phyparts: true, exact_terminal_subset_for_overlay: true,
      opacity: { ...cloudOpacity, interpretation: "Baseline gene-tree stroke opacity percentage, adaptively compensated by overlaid gene-tree count for clear visibility across sparse and dense clouds." },
      jitter: { ...cloudJitter, interpretation: "Deterministic display-only branch curvature; larger values spread branch midsections. Endpoints, node ages, topology and counts are unchanged." },
      pie_radius: { ...cloudPies, default_u: units().designToDrawing(cloudPies.defaultRadiusPx), interpretation: "Maximum discordance pie radius with youngest nodes scaled at youngestRatio of maximum and short callout displacement preferred over aggressive shrinking." },
      species_dating: ["PhyloRender-pl-aligner", "imported-dated"], gene_dating: "penalized-likelihood constrained display alignment with shared species clade ages",
      analysis_kind: "display_alignment", independently_estimated_gene_times: false,
      pie_legend_default_position: cloudPieLegendDefaultPosition, pie_modes: ["two", "four"], pie_legend_positions: ["auto", "upper-left", "middle-left", "lower-left"],
      pie_legend_scale: { defaultValue: 150, minimum: 75, maximum: 200, step: 5, unit: "percent" },
      pie_selection: "exact descendant sample sets",
      conflict_statistics: { engine: "PhyloRender-conflict-statistics",
        algorithm: "phylorender-conflict-statistics-v2", implementation: "independent JavaScript" },
      display_alignment: { engine: "PhyloRender-pl-aligner",
        algorithm: "phylorender-pl-display-alignment-v1", implementation: "independent JavaScript" },
      runtime_dependencies: ["built-in JavaScript conflict statistics", "built-in JavaScript penalized-likelihood display aligner"] },
    conflict: { primary: "left", secondary: "right", sample_policies: ["intersection", "union"],
      unequal_sample_counts: "Explicit user-confirmed sample_policy required; no automatic pruning or retention.",
      ordering: "ladderization or topology-preserving primary tip order" },
    editor_only: ["panel width", "panel visibility", "zoom", "viewport scrolling", "menus"],
    limits: ["A4 pagination applies only to phylogeny/time", "Default demo lacks complete raw inputs for configuration export",
      "Identical raster output requires identical fonts and rendering environment"],
  });
  const api = Object.freeze({ version: 1, publicationDefaults, defaults, merge, physicalOptions, capabilities, tipSpacingLimits, serializeTipSpacing, cloudJitter, cloudOpacity, cloudPies, outputGeometry, maximumOutputWidthMm,
    optionSupported,normalizeWorkspaceOptions,unsupportedOptionPaths,optionsForWorkspace,
    cladeLabelOrientation, cladeBarAlignment, cladeBarStyle, supportPrecision, cladeTier, tipReadability, tipLabelWidth, maximumTipLabelWidth, automaticTipGap, automaticRowLayout, planAutomaticRows, cladeReadability, resolveCladeTypography, nodeLabelReadability, planAutomaticNodeSize, datingLabelDensity, datingLabelPlan, rasterization,
    workspaces: Object.freeze(["phylogeny", "time", "cloud", "conflict"]) });
  root.PhyloRenderContract = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
