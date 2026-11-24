(function exposePhyloRenderAgentBridge() {
  "use strict";

  const VERSION = "1.9.0";
  const LEGACY_FONT_ALIASES = new Map([
    ["Georgia, serif", '"PhyloRender Baskerville", "Noto Sans SC Variable", serif'],
    ['"Times New Roman", serif', '"PhyloRender Source Serif", "Noto Sans SC Variable", serif'],
    ["Arial", 'Arial, "Noto Sans SC Variable", sans-serif'],
    ['"Arial", sans-serif', 'Arial, "Noto Sans SC Variable", sans-serif'],
    ["Arial, sans-serif", 'Arial, "Noto Sans SC Variable", sans-serif'],
    ["Helvetica, sans-serif", '"PhyloRender Arimo", "Noto Sans SC Variable", sans-serif'],
    ['"PingFang SC", "Microsoft YaHei", sans-serif', '"Noto Sans SC Variable", "PhyloRender Arimo", sans-serif'],
  ]);
  let activeCladeIds = new Map();
  let activeLabelAdjustments = [];
  let activeRootingReport = {
    requested_outgroup: [],
    input_root_partition_tip_counts: [],
    input_already_matches: null,
    operation: "none",
    artificial_nodes_added: 0,
  };
  const ENUM_CONTROLS = {
    "support.scale": {id:"support-scale",supportUnits:true},
    "conflict.primary_support_scale": {id:"conflict-primary-support-scale",supportUnits:true},
    "conflict.secondary_support_scale": {id:"conflict-secondary-support-scale",supportUnits:true},
    "cloud.species_method": { id: "cloud-species-method" },
    "cloud.genes_method": { id: "cloud-genes-method" },
    "cloud.dated_unit": { id: "cloud-dated-unit" },
    "cloud.root_age_unit": { id: "cloud-root-age-unit" },
    "cloud.dated_age_source": { id: "cloud-dated-age-source" },
    "cloud.species_shape": { id: "cloud-species-shape" },
    "cloud.pie_mode": { id: "cloud-pie-mode" }, "cloud.pie_legend_position": { id: "cloud-pie-legend-position" },
    "cloud.phyparts_root_policy": { id: "cloud-phyparts-root-policy" },
    "cloud.phyparts_field": { id: "cloud-phyparts-field" },
    "cloud.phyparts_scale": { id: "cloud-phyparts-scale" },
    "conflict.sample_policy": { id: "conflict-sample-policy" },
    "layout.mode": { id: "layout-mode", values: ["phylogram", "cladogram", "aligned"] },
    "layout.ladderize": { id: "ladder-direction", values: ["file", "small-top", "large-top"] },
    "layout.clade_bar_alignment": { id: "clade-bar-alignment", values: PhyloRenderContract.cladeBarAlignment.values },
    "output.aspect_ratio": { id: "output-aspect-ratio", values: ["auto", "content", "1:1", "4:3", "3:2", "16:9", "a4-landscape", "a4-portrait", "custom"] },
    "support.full_support_marker": { id: "full-support-style", values: ["branch", "circle", "number", "hide", "star"] },
    "typography.tips.family": { id: "tip-font-family" },
    "typography.tips.italic_mode": { id: "tip-italic-mode", values: ["auto", "all", "none"] },
    "typography.nodes.family": { id: "support-font-family" },
    "typography.clades.family": { id: "clade-font-family" },
    "typography.scale.family": { id: "scale-font-family" },
    "time.geology": { id: "time-geology", values: ["standard", "none"] },
    "time.source_unit": { id: "time-source-unit", values: ["unconfirmed", "years", "kyr", "mya"] },
    "time.display_unit": { id: "time-display-unit", values: ["same", "years", "kyr", "mya"] },
    "time.age_source": { id: "time-age-source", values: ["auto", "height", "height_mean", "height_median", "branch_lengths"] },
    "time.hpd_scope": { id: "time-hpd-scope", values: ["all", "named_clades"] },
    "time.hpd_marker": { id: "time-hpd-marker", values: ["none", "height_mean", "height_median"] },
  };
  const NUMBER_CONTROLS = {
    "layout.horizontal_scale": { id: "tree-horizontal-scale", min: 25, max: 400, step: .001 },
    "cloud.root_age": { id: "cloud-root-age", min: .000000001, max: 1e20, step: .000000001 },
    "cloud.opacity": { id: "cloud-opacity", min: PhyloRenderContract.cloudOpacity.minimum, max: PhyloRenderContract.cloudOpacity.maximum, step: 1 },
    "cloud.jitter": { id: "cloud-jitter", min: PhyloRenderContract.cloudJitter.minimum, max: PhyloRenderContract.cloudJitter.maximum, step: 1, integer: true },
    "cloud.pie_radius": { id: "cloud-pie-radius", min: PhyloRenderContract.cloudPies.minimumRadiusPx, max: PhyloRenderContract.cloudPies.maximumRadiusPx, step: null }, "cloud.pie_legend_scale": { id: "cloud-pie-legend-scale", min: 75, max: 200, step: 5, integer: true },
    "cloud.phyparts_threshold": { id: "cloud-phyparts-threshold", min: 0, max: 99.9, step: .1 },
    "layout.branch_width": { id: "branch-width", min: 0.5, max: 4, step: 0.1 },
    "layout.tip_spacing": { id: "tip-spacing", min: PhyloRenderContract.tipSpacingLimits.minimumPx, max: PhyloRenderContract.tipSpacingLimits.maximumPx, step: null },
    "output.custom_ratio": { id: "custom-aspect-ratio", min: 0.4, max: 3, step: 0.05 },
    "output.png_scale": { id: "png-resolution-scale", min: 1, max: 4, step: 1 },
    "support.low_support_threshold": { id: "support-threshold", min: 0, max: 100, step: 1 },
    "typography.tips.size": { id: "tip-font-size", min: 8, max: 30, step: 1 },
    "typography.nodes.preferred_size": { id: "support-size", min: 9, max: PhyloRenderContract.nodeLabelReadability.maximumDesign, step: 1 },
    "typography.nodes.minimum_size": { id: "support-min-size", min: 9, max: 18, step: 1 },
    "typography.clades.size": { id: "clade-font-size", min: 8, max: PhyloRenderContract.cladeReadability.maximumDesign, step: 1 },
    "typography.scale.size": { id: "scale-font-size", min: 7, max: 24, step: 1 },
    "time.age_decimals": { id: "time-age-decimals", min: 0, max: 3, step: 1 },
    "time.hpd_opacity": { id: "time-hpd-opacity", min: 0.1, max: 1, step: 0.05 },
    "time.hpd_thickness": { id: "time-hpd-thickness", min: 2, max: 16, step: null },
  };
  const PHYSICAL_CONTROLS = {
    "time.period_size_pt": { id: "time-period-size", min: 3, max: 24, factor: 1 },
    "time.epoch_size_pt": { id: "time-epoch-size", min: 3, max: 24, factor: 1 },
    "time.legend_size_pt": { id: "time-legend-size", min: 3, max: 24, factor: 1 },
    "time.axis_size_pt": { id: "time-axis-size", min: 3, max: 24, factor: 1 },
    "time.unit_size_pt": { id: "time-unit-size", min: 3, max: 24, factor: 1 },
    "time.key_size_pt": { id: "time-key-size", min: 3, max: 24, factor: 1 },
    "layout.branch_width_pt": { id: "branch-width", min: .375, max: 3, factor: 4 / 3 },
    "layout.node_radius_pt": { id: "node-radius", min: 1.5, max: 9, factor: 4 / 3 },
    "output.width_mm": { id: "figure-width", min: 0, max: PhyloRenderContract.outputGeometry.absoluteMaximumWidthMm, factor: 1 },
    "output.dpi": { id: "png-resolution-scale", min: 72, max: 1200, factor: 1 / 96 },
    "typography.tips.size_pt": { id: "tip-font-size", min: 6, max: 22.5, factor: 4 / 3 },
    "typography.nodes.preferred_size_pt": { id: "support-size", min: 6.75, max: PhyloRenderContract.nodeLabelReadability.maximumDesign * .75, factor: 4 / 3 },
    "typography.nodes.minimum_size_pt": { id: "support-min-size", min: 6.75, max: 13.5, factor: 4 / 3 },
    "typography.clades.size_pt": { id: "clade-font-size", min: 6, max: PhyloRenderContract.cladeReadability.maximumDesign * .75, factor: 4 / 3 },
    "typography.scale.size_pt": { id: "scale-font-size", min: 5.25, max: 18, factor: 4 / 3 },
  };
  const BOOLEAN_CONTROLS = {
    "cloud.show_time_axis": "cloud-show-time-axis",
    "cloud.show_gene": "cloud-show-gene",
    "cloud.show_species": "cloud-show-species",
    "cloud.show_pies": "cloud-show-pies",
    "labels.auto_placement": "auto-labels",
    "labels.leader_lines": "leader-lines",
    "typography.tips.normalize_ranks": "tip-normalize-ranks",
    "typography.tips.bold": "tip-font-bold",
    "typography.tips.follow_clade_color": "tip-follow-clade",
    "typography.nodes.automatic_size": "support-size-auto", "typography.nodes.bold": "support-font-bold",
    "typography.nodes.italic": "support-font-italic",
    "typography.clades.bold": "clade-font-bold",
    "typography.clades.italic": "clade-font-italic",
    "typography.clades.follow_tip_size": "clade-font-auto",
    "typography.scale.bold": "scale-font-bold",
    "typography.scale.italic": "scale-font-italic",
    "time.show_node_ages": "time-show-ages",
    "time.show_hpd": "time-show-hpd",
  };
  const COLOR_CONTROLS = {
    "typography.tips.color": "tip-font-color",
    "typography.nodes.color": "support-font-color",
    "typography.scale.color": "scale-font-color",
    "time.hpd_color": "time-hpd-color",
  };
  const initialControls = new Map([...new Set([
    ...Object.values(ENUM_CONTROLS).map(item => item.id),
    ...Object.values(NUMBER_CONTROLS).map(item => item.id),
    ...Object.values(PHYSICAL_CONTROLS).map(item => item.id),
    ...Object.values(BOOLEAN_CONTROLS), ...Object.values(COLOR_CONTROLS), "support-decimals",
  ])].map(id => [id, { value: $(id).value, checked: $(id).checked }]));

  function resetFigureControls() {
    initialControls.forEach((saved, id) => { $(id).value = saved.value; $(id).checked = saved.checked; });
    state.timeAgeRange = { minimumRaw: null, maximumRaw: null, explicit: false };
    retainedNodeLabels.clear();
    state.manualLabels.clear();
  }

  function valueAtPath(object, path) {
    return path.split(".").reduce((value, part) => value?.[part], object);
  }

  function assignAtPath(object, path, value) {
    const parts = path.split(".");
    const finalPart = parts.pop();
    const target = parts.reduce((current, part) => current[part] ||= {}, object);
    target[finalPart] = value;
  }

  function ensureObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
    return value;
  }

  function normalizeTreeInput(value, label) {
    ensureObject(value, label);
    if (typeof value.content !== "string" || !value.content.trim()) throw new Error(`${label}.content must contain Newick or NEXUS tree text`);
    return {
      content: value.content,
      name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : `${label}.tre`,
    };
  }

  function setEnumControl(path, definition, options) {
    const requestedValue = valueAtPath(options, path);
    const value = path.endsWith(".family") ? (LEGACY_FONT_ALIASES.get(requestedValue) || requestedValue) : requestedValue;
    if (value === undefined) return;
    if (definition.values && !definition.values.includes(value)) {
      throw new Error(`${path} must be one of: ${definition.values.join(" / ")}`);
    }
    const control = $(definition.id);
    if(definition.supportUnits) PhyloRenderSupportUnits.ensureOption(control,value,(text,key)=>new Option(text,key));
    if (!control || ![...control.options].some(option => option.value === String(value))) {
      throw new Error(`${path} is not a supported option in the current workspace`);
    }
    control.value = String(value);
  }

  function normalizeSteppedNumber(value, definition, path) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`${path} must be a finite number`);
    if (definition.integer && (typeof value !== "number" || !Number.isInteger(numeric))) throw new Error(`${path} must be an integer`);
    if (numeric < definition.min - 1e-8 || numeric > definition.max + 1e-8) {
      throw new Error(`${path} must be between ${definition.min} and ${definition.max}`);
    }
    if (definition.step === null) return Math.max(definition.min, Math.min(definition.max,numeric));
    const stepped = definition.min + Math.round((numeric - definition.min) / definition.step) * definition.step;
    return Number(stepped.toFixed(6));
  }

  function setNumberControl(path, definition, options) {
    const value = valueAtPath(options, path);
    if (value === undefined) return;
    const normalized = normalizeSteppedNumber(value, definition, path);
    $(definition.id).value = String(normalized);
  }

  function setBooleanControl(path, id, options) {
    const value = valueAtPath(options, path);
    if (value === undefined) return;
    if (typeof value !== "boolean") throw new Error(`${path} must be true or false`);
    $(id).checked = value;
  }

  function setColorControl(path, id, options) {
    const value = valueAtPath(options, path);
    if (value === undefined) return;
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${path} must be a 6-digit hex color, e.g., #0072B2`);
    $(id).value = value.toLowerCase();
  }

  function applySupportDecimals(options) {
    const value = options?.support?.decimals;
    if (value === undefined) return;
    if (value === "auto" || value === "original") { $("support-decimals").value = value; return; }
    const digits = Number(value);
    if (!Number.isInteger(digits) || digits < 0 || digits > 6) throw new Error('support.decimals must be "auto", "original", or an integer between 0 and 6');
    $("support-decimals").value = String(digits);
  }

  function applyFigureOptions(options = {}) {
    ensureObject(options, "options");
    options = PhyloRenderUnits.legacyOptions(options);
    Object.entries(ENUM_CONTROLS).forEach(([path, definition]) => setEnumControl(path, definition, options));
    Object.entries(NUMBER_CONTROLS).forEach(([path, definition]) => setNumberControl(path, definition, options));
    Object.entries(PHYSICAL_CONTROLS).forEach(([path, definition]) => {
      const value = valueAtPath(options, path);
      if (value === undefined) return;
      const maximum = path === "output.width_mm"
        ? PhyloRenderContract.maximumOutputWidthMm(state.workspaceMode) : definition.max;
      if (!Number.isFinite(value) || value < definition.min - 1e-8 || value > maximum + 1e-8)
        throw new Error(`${path} must be between ${definition.min} and ${maximum}`);
      $(definition.id).value = String(Math.max(definition.min,Math.min(maximum,value)) * definition.factor);
    });
    if (options.layout?.tip_spacing !== undefined || options.layout?.tip_spacing_em !== undefined
      || options.typography?.tips?.size_pt !== undefined || options.typography?.tips?.size !== undefined) {
      state.automaticTipSpacing = false;
      updateAutomaticTipSpacingUi();
    }
    if (options.layout?.tip_spacing !== undefined) state.tipSpacingEm = null;
    if (options.layout?.tip_spacing_em !== undefined) {
      const em = options.layout.tip_spacing_em;
      if (!Number.isFinite(em) || em < PhyloRenderContract.tipSpacingLimits.minimumEm || em > PhyloRenderContract.tipSpacingLimits.maximumEm) throw new Error("layout.tip_spacing_em must be between 0.9 and 4");
      state.tipSpacingEm = em;
    }
    if (state.tipSpacingEm !== null) $("tip-spacing").value = String(terminalSpacing());
    if (options.layout?.automatic_tip_spacing !== undefined) {
      state.automaticTipSpacing = Boolean(options.layout.automatic_tip_spacing);
      updateAutomaticTipSpacingUi();
    }
    Object.entries(BOOLEAN_CONTROLS).forEach(([path, id]) => setBooleanControl(path, id, options));
    Object.entries(COLOR_CONTROLS).forEach(([path, id]) => setColorControl(path, id, options));
    applySupportDecimals(options);
    const requestedNodeArrows = options?.labels?.node_arrows;
    if (requestedNodeArrows !== undefined) {
      if (typeof requestedNodeArrows !== "boolean") throw new Error("labels.node_arrows must be a boolean");
      $("leader-lines").checked = requestedNodeArrows;
    }
    if ((options.typography?.nodes?.preferred_size !== undefined || options.typography?.nodes?.preferred_size_pt !== undefined) && options.typography?.nodes?.automatic_size === undefined && $("support-size-auto")) $("support-size-auto").checked = false;
    if (Number($("support-min-size").value) > Number($("support-size").value)) $("support-size").value = $("support-min-size").value;
    updateThresholdUi();
    updateSupportDecimalsUi();
    refreshNumericControls();
    updateAspectControlVisibility();
    updateTimeUnitControls();
    if (options.time?.age_minimum !== undefined || options.time?.age_maximum !== undefined) {
      state.timeAgeRange = { minimumRaw: options.time.age_minimum ?? null,
        maximumRaw: options.time.age_maximum ?? null, explicit: true };
      if (state.timeAgeRange.minimumRaw !== null && state.timeAgeRange.maximumRaw !== null
        && state.timeAgeRange.minimumRaw > state.timeAgeRange.maximumRaw) throw new Error("Invalid node-age label range");
      updateTimeAgeRangeControls();
    }
    if (options.cloud) {
      if (options.cloud.phyparts_outgroups !== undefined) $("cloud-phyparts-outgroups").value = options.cloud.phyparts_outgroups.join("\n");
      state.cloud.pieAgeRange = PhyloRenderCloud.pieAgeRange(options.cloud.pie_age_minimum ?? "", options.cloud.pie_age_maximum ?? "");
      updateCloudLayerControls();
    }
    if (options.conflict) {
      for (const [key, id] of [["primary_title", "conflict-primary-title"], ["secondary_title", "conflict-secondary-title"]]) {
        if (options.conflict[key] !== undefined) $(id).value = String(options.conflict[key]);
      }
    }
  }

  function extractionForRequest(source, requested) {
    if (!requested || requested === "auto") return source.extraction;
    if (requested === "auto-support") return "auto-support";
    if (requested === "ages") {
      if (!source.ageEligible) throw new Error(`${source.fileName} is not an ultrametric tree with computable node ages`);
      return "ages";
    }
    const key = String(requested).replace(/^field:/, "");
    if (!source.fieldCatalog.some(field => field.key === key)) {
      throw new Error(`${source.fileName} does not contain numeric annotation field "${key}"`);
    }
    return `field:${key}`;
  }

  async function addNodeDataFromAgent(input, kind) {
    const tree = normalizeTreeInput(input, kind === "support" ? "support_tree" : "other_data_tree");
    const source = createNodeDataSource(tree.content, tree.name, kind, await parseNewickAsync(tree.content), input.scale || "auto");
    source.agentSourceId = typeof input.source_id === "string" ? input.source_id : null;
    source.extraction = extractionForRequest(source, input.field);
    source.values = buildNodeValueIndex(source.parsedRoot, source.extraction, source.tipKeyMap);
    if (kind === "support") mainSupportScales(source.values,source.scale);
    if (typeof input.label === "string" && input.label.trim()) source.name = input.label.trim();
    if (kind === "other" && input.decimals !== undefined) {
      const digits = Number(input.decimals);
      if (!Number.isInteger(digits) || digits < 0 || digits > 6) throw new Error(`decimals for ${tree.name} must be an integer between 0 and 6`);
      source.digits = digits;
    }
    if (!matchedNodeValueCount(source)) throw new Error(`No bipartitions in ${tree.name} matched the focal tree`);
    state.nodeDataSources.push(source);
    return source;
  }

  function uniqueTipMap(root, keyFor = normalizeTipKey) {
    const map = new Map();
    descendantTipNodes(root).forEach(node => {
      const key = keyFor(node.label);
      if (map.has(key)) throw new Error(`Tip label "${node.label}" collides after normalization and cannot be uniquely resolved`);
      map.set(key, node);
    });
    return map;
  }

  function pathToNode(root, nodeId, path = []) {
    const next = [...path, root];
    if (root.id === nodeId) return next;
    for (const child of root.children) {
      const result = pathToNode(child, nodeId, next);
      if (result) return result;
    }
    return null;
  }

  function mrcaForTipNames(root, names, label = "mrca_of", keyFor = normalizeTipKey) {
    if (!Array.isArray(names) || !names.length) throw new Error(`${label} must contain at least one tip label`);
    const tipMap = uniqueTipMap(root, keyFor);
    const nodes = names.map(name => {
      const node = tipMap.get(keyFor(name));
      if (!node) throw new Error(`Taxon "${name}" in ${label} is absent from the focal tree`);
      return node;
    });
    const paths = nodes.map(node => pathToNode(root, node.id));
    let common = root;
    for (let index = 0; ; index++) {
      const candidate = paths[0][index];
      if (!candidate || paths.some(path => path[index]?.id !== candidate.id)) break;
      common = candidate;
    }
    return common;
  }

  function rerootFromAgent(outgroup, warnings) {
    if (outgroup === undefined || outgroup === null) return;
    if (!Array.isArray(outgroup) || !outgroup.length) throw new Error("rooting.outgroup must be a non-empty array of tip labels");

    // First interpret the requested taxa as an unrooted split. A Newick file can
    // place its arbitrary degree-two root between members of the same biological
    // outgroup, in which case a rooted MRCA search incorrectly returns the whole
    // tree. Searching the original undirected graph finds the separating edge
    // without changing the unrooted topology.
    const tipMap = uniqueTipMap(state.root);
    const requestedTips = outgroup.map(name => {
      const node = tipMap.get(normalizeTipKey(name));
      if (!node) throw new Error(`Taxon "${name}" in rooting.outgroup is absent from the focal tree`);
      return node;
    });
    activeRootingReport = {
      requested_outgroup: requestedTips.map(tip => tip.label),
      input_root_partition_tip_counts: state.root.children.map(child => descendantTipNodes(child).length),
      input_already_matches: false,
      operation: "reroot",
      artificial_nodes_added: 1,
    };

    const existingRootSide = PhyloRenderRooting.findMatchingRootChild(
      state.root,
      requestedTips.map(tip => tip.id),
    );
    if (existingRootSide) {
      state.root.outgroupChildId = existingRootSide.childId;
      state.root.ingroupChildId = existingRootSide.otherChildId;
      state.root.preserveChildOrder = true;
      activeRootingReport.input_already_matches = true;
      activeRootingReport.operation = "noop";
      activeRootingReport.artificial_nodes_added = 0;
      warnings.push("One daughter clade of the input root already matches the requested outgroup; skipped redundant rerooting without inserting an artificial node.");
      return;
    }
    try {
      const exactMatch = PhyloRenderRooting.findSeparatingEdge(
        state.graph,
        requestedTips.map(tip => tip.id),
      );
      state.root = PhyloRenderRooting.rerootOnEdge(
        state.graph,
        exactMatch.edge.id,
        exactMatch.selectedEndpointId,
      );
      clearRootDependentEdits();
      return;
    } catch (error) {
      if (!/monophyletic bipartition/i.test(String(error?.message || error))) throw error;
    }

    // Preserve the convenient MRCA behavior for a partial list chosen from a
    // conventional rooted clade: the complete descendant branch is used and the
    // additional descendants are reported to the caller.
    const clade = mrcaForTipNames(state.root, outgroup, "rooting.outgroup");
    const selectedTips = descendantTipNodes(clade);
    if (selectedTips.length !== new Set(outgroup.map(normalizeTipKey)).size) {
      warnings.push(`MRCA of the specified outgroup taxa spans ${selectedTips.length - outgroup.length} additional unlisted descendant(s); rooted on the complete MRCA clade.`);
    }
    state.root = PhyloRenderRooting.rerootOnClade(
      state.graph,
      selectedTips.map(tip => tip.id),
      clade.incomingEdgeId,
    );
    clearRootDependentEdits();
  }

  function addCladesFromAgent(clades, warnings) {
    if (clades === undefined) return;
    if (!Array.isArray(clades)) throw new Error("clades must be an array");
    clades.forEach((entry, index) => {
      ensureObject(entry, `clades[${index}]`);
      const node = mrcaForTipNames(state.root, entry.mrca_of, `clades[${index}].mrca_of`);
      const requested = new Set(entry.mrca_of.map(normalizeTipKey));
      const descendants = descendantTipNodes(node);
      const extraCount = descendants.filter(tip => !requested.has(normalizeTipKey(tip.label))).length;
      if (extraCount) warnings.push(`MRCA of "${entry.name || `Clade ${index + 1}`}" includes ${extraCount} unlisted descendant tip(s).`);
      const requestedSegments = entry.name_segments === undefined ? null : entry.name_segments.map(segment => ({
        ...segment,
        ...(segment.family ? { family: LEGACY_FONT_ALIASES.get(segment.family) || segment.family } : {}),
      }));
      let nameSegments = null;
      if (requestedSegments) {
        try {
          nameSegments = normalizeCladeNameSegments(requestedSegments);
        } catch (error) {
          throw new Error(`clades[${index}].name_segments: ${error.message}`);
        }
      }
      const segmentedName = nameSegments ? cladeSegmentText(nameSegments) : "";
      const explicitName = entry.name === undefined ? "" : String(entry.name).trim();
      if (explicitName && segmentedName && explicitName !== segmentedName) {
        throw new Error(`clades[${index}].name must match the concatenated text of name_segments`);
      }
      const cladeName = explicitName || segmentedName || cladeSummary(node);
      const color = entry.color || nextCladeColor();
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`clades[${index}].color must be a 6-digit hex color such as #0072B2`);
      const orientation = entry.label_orientation || PhyloRenderContract.cladeLabelOrientation.defaultValue;
      if (!PhyloRenderContract.cladeLabelOrientation.values.includes(orientation)) throw new Error(`clades[${index}].label_orientation must be "auto", "horizontal", or "vertical"`);
      const key = PhyloRenderCladeHierarchy.cladeKey(node.id, entry.tier, state.cladeColors);
      state.cladeColors.set(key, color.toLowerCase());
      state.cladeNames.set(key, cladeName);
      if (nameSegments && (nameSegments.length > 1 || nameSegments.some(cladeSegmentHasStyle))) {
        state.cladeNameSegments.set(key, structuredClone(nameSegments));
      } else {
        state.cladeNameSegments.delete(key);
      }
      state.cladeNameOrientations.set(key, orientation);
      PhyloRenderBridgeHelpers.applyCladeHierarchy(state, key, entry, `clades[${index}]`, PhyloRenderCladeHierarchy);
      if (entry.clade_id) activeCladeIds.set(key, entry.clade_id);
    });
  }

  function sameSet(left, right) {
    return left.size === right.size && [...left].every(value => right.has(value));
  }

  async function sha256(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function topologyFingerprint(root) {
    const tips = allNormalizedTips(root);
    const splits = [...collectDisplaySplitKeys(root)].sort();
    return `sha256:${await sha256(JSON.stringify({ tips, splits }))}`;
  }

  function displaySplitEntries(root) {
    const allTips = allNormalizedTips(root);
    const entries = new Map();
    function visit(node, isRoot = false) {
      if (!node.children.length) return [{ key: normalizeTipKey(node.label), label: node.label }];
      const descendants = node.children.flatMap(child => visit(child));
      if (!isRoot) {
        const key = canonicalSplitKey(descendants.map(tip => tip.key), allTips);
        if (key) {
          const candidate = {
            node,
            labels: descendants.map(tip => tip.label),
            normalized: descendants.map(tip => tip.key).sort(),
          };
          const current = entries.get(key) || [];
          current.push(candidate);
          entries.set(key, current);
        }
      }
      return descendants;
    }
    visit(root, true);
    return entries;
  }

  function preferredDisplayNode(key, candidates) {
    const exact = candidates.find(candidate => candidate.normalized.join("\u001f") === key);
    return exact || [...candidates].sort((a, b) => a.labels.length - b.labels.length)[0];
  }

  async function stableBranchId(key) {
    return `branch:${(await sha256(key)).slice(0, 24)}`;
  }

  async function branchManifest(root) {
    const entries = displaySplitEntries(root);
    const rows = await Promise.all([...entries.entries()].map(async ([key, candidates]) => {
      const selected = preferredDisplayNode(key, candidates);
      const labels = [...selected.labels].sort((a, b) => a.localeCompare(b));
      const childAnchors = selected.node.children
        .map(child => descendantTipNodes(child)[0]?.label)
        .filter(Boolean)
        .slice(0, 2);
      const displayedAnnotation = state.workspaceMode === "time" ? (selected.node.displayNodeLabel ?? null)
        : selected.node.displayNodeLabel
          ?? selected.node.displaySupportOverride
          ?? (selected.node.support !== null && selected.node.support !== undefined ? formatSupportValue(selected.node.support, 0, mainSupportScales()) : null);
      return {
        branch_id: await stableBranchId(key),
        descendant_count: labels.length,
        example_tips: labels.slice(0, 4),
        mrca_of: childAnchors,
        main_support: state.workspaceMode === "time" ? null : (state.mainSupportValues.get(key) ?? null),
        displayed_annotation: displayedAnnotation ?? null,
        display_y: Number(selected.node.y) || 0,
      };
    }));
    return rows
      .sort((a, b) => a.display_y - b.display_y || a.branch_id.localeCompare(b.branch_id))
      .map((row, index) => {
        const { display_y, ...publicRow } = row;
        return { ...publicRow, display_order: index + 1 };
      });
  }

  async function applyLabelAdjustments(adjustments) {
    activeLabelAdjustments = [];
    if (!adjustments?.length) return;
    const lookup = new Map();
    for (const [key, candidates] of displaySplitEntries(state.root)) {
      lookup.set(await stableBranchId(key), preferredDisplayNode(key, candidates).node);
    }
    adjustments.forEach(adjustment => {
      adjustment = PhyloRenderUnits.legacyAdjustment(adjustment);
      const node = lookup.get(adjustment.branch_id);
      if (!node) throw new Error(`Branch ${adjustment.branch_id} in label_adjustments does not belong to the focal tree`);
      const labelId = node.incomingEdgeId || node.id;
      state.manualLabels.set(labelId, {
        dx: Number(adjustment.dx),
        dy: Number(adjustment.dy),
        fontReduction: Number(adjustment.font_reduction || 0),
      });
      activeLabelAdjustments.push({
        branch_id: adjustment.branch_id,
        dx: Number(adjustment.dx),
        dy: Number(adjustment.dy),
        font_reduction: Number(adjustment.font_reduction || 0),
      });
    });
  }

  async function inspectTree(treeInput) {
    const tree = normalizeTreeInput(treeInput, "main_tree");
    const root = await parseNewickAsync(tree.content);
    const stats = treeStats(structuredClone(root));
    const timeDiagnostics = treeTimeDiagnostics(root);
    const timeProfile = buildTimeTreeProfile(structuredClone(root));
    const fields = discoverNodeNumericFields(root);
    const mode = timeProfile.valid ? "time" : "phylogeny";
    const mainSupports = buildMainSupportIndex(root, mode);
    const internalNodes = (function count(node) {
      return node.children.length ? 1 + node.children.reduce((sum, child) => sum + count(child), 0) : 0;
    })(root);
    const timeLabelDensity = timeProfile.valid
      ? PhyloRenderDatingLabelPolicy.inspection({ candidateLabels: internalNodes,
        rootAge: timeProfile.rootAge }, PhyloRenderContract)
      : null;
    return {
      contract_version: PhyloRenderContract.version,
      bridge_version: VERSION,
      file_name: tree.name,
      tree_type: mode,
      time_detection: timeProfile.valid
        ? (timeDiagnostics.ultrametric ? "ultrametric" : "annotated")
        : "not_time_tree",
      tips: stats.tips,
      tip_labels: PhyloRenderBridgeHelpers.rawDescendantTipLabels(root),
      internal_nodes: internalNodes,
      main_support_nodes: mainSupports.size,
      branch_lengths: PhyloRenderTreeGeometry.branchLengthSummary(root),
      ultrametric: timeDiagnostics,
      root_age_raw: timeProfile.valid ? timeProfile.rootAge : null,
      root_age_unit: "unconfirmed",
      root_age_mya: null,
      time_label_density: timeLabelDensity,
      numeric_fields: fields.map(field => ({ key: field.key, label: field.label, count: field.count, scalar: field.scalar })),
      unrooted_topology_fingerprint: await topologyFingerprint(root),
    };
  }

  function getOptions() {
    syncCladeFontSize();
    const options = {};
    Object.entries(ENUM_CONTROLS).forEach(([path, definition]) => { const value = $(definition.id).value; if (value || path !== "conflict.sample_policy") assignAtPath(options, path, value); });
    Object.entries(NUMBER_CONTROLS).forEach(([path, definition]) => assignAtPath(options, path, Number($(definition.id).value)));
    Object.entries(BOOLEAN_CONTROLS).forEach(([path, id]) => assignAtPath(options, path, $(id).checked));
    Object.entries(COLOR_CONTROLS).forEach(([path, id]) => assignAtPath(options, path, $(id).value));
    // Group names always inherit their own group color, not a global override.
    options.typography.clades.follow_clade_color = true;
    options.support.decimals = ["auto", "original"].includes($("support-decimals").value) ? $("support-decimals").value : Number($("support-decimals").value);
    options.labels.node_arrows = $("leader-lines").checked;
    Object.entries(PHYSICAL_CONTROLS).forEach(([path, definition]) => {
      assignAtPath(options, path, Number(($(definition.id).value / definition.factor).toFixed(8)));
      const legacyPath = path.replace(/_pt$/, "");
      if (legacyPath !== path) {
        const parts = legacyPath.split(".");
        delete valueAtPath(options, parts.slice(0, -1).join("."))[parts.at(-1)];
      }
    });
    delete options.output.png_scale;
    delete options.layout.tip_spacing; delete options.layout.tip_spacing_em;
    Object.assign(options.layout, PhyloRenderContract.serializeTipSpacing({ spacingPx: terminalSpacing(),
      fontSizePx: Number($("tip-font-size").value), spacingEm: state.tipSpacingEm, automatic: state.automaticTipSpacing }));
    const explicitTimeAgeRange = state.timeAgeRange.explicit === true
      || Number.isFinite(state.timeAgeRange.minimumRaw)
      || Number.isFinite(state.timeAgeRange.maximumRaw);
    if (explicitTimeAgeRange) {
      options.time.age_minimum = state.timeAgeRange.minimumRaw;
      options.time.age_maximum = state.timeAgeRange.maximumRaw;
    }
    if (state.workspaceMode === "cloud") {
      options.layout.ladderize = $("cloud-ladder-direction").value;
      options.cloud.phyparts_outgroups = $("cloud-phyparts-outgroups").value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
      options.cloud.pie_age_minimum = state.cloud.pieAgeRange.minimum;
      options.cloud.pie_age_maximum = state.cloud.pieAgeRange.maximum;
      options.cloud.hidden_pies = state.cloud.phyPartsTable ? [...PhyloRenderCloud.matchPhyParts(state.cloud.speciesRoot, state.cloud.phyPartsTable).matched]
        .filter(([, row]) => state.cloud.hiddenPieNodes.has(row.id)).map(([node]) => descendantTipLabels(node)) : [];
    } else delete options.cloud;
    if (state.workspaceMode === "conflict") {
      options.conflict ||= {};
      options.layout.ladderize = $("conflict-primary-ladder").value;
      options.conflict.primary_title = $("conflict-primary-title").value;
      options.conflict.secondary_title = $("conflict-secondary-title").value;
      options.conflict.primary_support_field = state.conflict.supportFieldSelections.nuclear;
      options.conflict.secondary_support_field = state.conflict.supportFieldSelections.plastid;
      options.layout.tip_order = descendantTipLabels(state.conflict.primaryDisplayRoot || state.conflict.nuclearRoot);
    } else delete options.conflict;
    return PhyloRenderUnits.drawingOptions(PhyloRenderContract.optionsForWorkspace(state.workspaceMode,options));
  }

  function getCladeSpecs() {
    const items = [];
    state.cladeColors.forEach((color, nodeId) => {
      const node = findNodeById(state.root, PhyloRenderCladeHierarchy.baseNodeId(nodeId));
      if (!node) return;
      const nameSegments = state.cladeNameSegments.get(nodeId);
      items.push({
        clade_id: activeCladeIds.get(nodeId) || null,
        name: state.cladeNames.get(nodeId) || cladeSummary(node),
        ...(nameSegments?.length ? { name_segments: nameSegments.map(({ size, ...segment }) => ({ ...segment, ...(size ? { size_u: PhyloRenderUnits.designToDrawing(size) } : {}) })) } : {}),
        color,
        label_orientation: state.cladeNameOrientations.get(nodeId) || PhyloRenderContract.cladeLabelOrientation.defaultValue,
        ...PhyloRenderBridgeHelpers.serializeCladeHierarchy(state, nodeId),
        descendants: descendantTipLabels(node),
      });
    });
    return items;
  }

  function getOutgroupLabels() {
    const outgroup = state.root?.outgroupChildId
      ? state.root.children.find(child => child.id === state.root.outgroupChildId)
      : null;
    return outgroup ? descendantTipLabels(outgroup) : [];
  }

  function sharedOutputReport(includeActualPng = false) {
    const requested=Number($("png-resolution-scale").value)||2;
    return PhyloRenderFigureReport.output({physical:physicalOutputReport(),canvas:state.currentSvgSize,
      aspectMode:$("output-aspect-ratio").value,requestedAspectRatio:outputAspectRatioValue(),layout:state.currentLayoutInfo,
      requestedPngScale:requested,...(includeActualPng?{actualPngScale:boundedBrowserPngScale(state.currentSvgSize.width,state.currentSvgSize.height,requested)}:{})});
  }
  function sharedFontPortability() {
    return PhyloRenderFigureReport.fontPortability({families:figureSystemFontFamilies(),
      fontsReady:Boolean(document.fonts?.status==="loaded"),systemFontsReady:true,embedsFonts:true,
      fallback:systemArialFallback?{ requested: "Arial", actual: "Arimo", reason: "Arial unavailable" }:null});
  }

  async function buildReport(warnings = []) {
    const originalSplits = collectDisplaySplitKeys(state.parsedRoot);
    const displayedSplits = collectDisplaySplitKeys(state.root);
    const collisionCount = Number($("collision-count").textContent) || 0;
    const sourceReports = state.nodeDataSources.filter(source => state.workspaceMode !== "time" || source.kind !== "support").map(source => {
      const matched = matchedNodeValueCount(source);
      return {
        kind: source.kind,
        name: source.name,
        file_name: source.fileName,
        field: source.extraction,
        source_id: source.agentSourceId,
        ...(source.kind === "support" ? {support_scale:source.scale,resolved_support_scales:mainSupportScales(source.values,source.scale)} : {}),
        values: source.values.size,
        matched_nodes: matched,
        unmatched_values: Math.max(0, source.values.size - matched),
        aligned_tip_aliases: source.tipAlignment?.alignedCount || 0,
      };
    });
    const reportWarnings = [...warnings];
    if (systemArialFallback) reportWarnings.push("Arial is unavailable in this rendering environment; Arimo was used consistently for both layout measurement and font embedding.");
    const timeUnits = state.workspaceMode === "time" ? timeUnitSettings() : null;
    const timeReportRoot = state.workspaceMode === "time" ? structuredClone(state.root) : null;
    const timeProfile = timeReportRoot
      ? buildTimeTreeProfile(timeReportRoot, $("time-age-source").value) : null;
    const timeLabelSummary = timeReportRoot && timeProfile?.valid
      ? PhyloRenderDatingLabelPolicy.summary({ ages: descendantInternalNodes(timeReportRoot).map(node => node.timeAge),
        rootAge: timeProfile.rootAge, range: state.timeAgeRange }, PhyloRenderContract) : null;
    if (timeUnits && !timeUnits.sourceYears) reportWarnings.push("Time unit has not yet been confirmed; raw tree units are displayed and must not be cited as Mya in captions.");
    if (timeProfile?.derivedAgeCount) reportWarnings.push(`Computed ${timeProfile.derivedAgeCount} internal node age(s) uniformly from ultrametric branch lengths without mixing summary statistics.`);
    if (timeProfile?.invalidAgeCount) reportWarnings.push(`${timeProfile.invalidAgeCount} node(s) have selected ages younger than a descendant; time coordinates may be unreliable.`);
    if (timeProfile?.mixedExplicitSources) reportWarnings.push("Automatic age resolution mixed height, height_mean, and height_median; select one age summary explicitly.");
    if (timeLabelSummary?.warning) reportWarnings.push(timeLabelSummary.warning);
    const displayBranchLengths = state.currentBranchLengthDisplay || {
      ...branchLengthDisplayProfile(state.root),
      applied_to_render: false,
    };
    if (displayBranchLengths.applied_to_render) {
      reportWarnings.push(
        `Internal branch lengths are present while all terminal branch lengths are missing or 0; uniform display terminal stubs (${displayBranchLengths.display_terminal_length}) were added for rendering only. Input tree is unchanged and scale bars are suppressed.`,
      );
      if (displayBranchLengths.auto_root_ingroup_gap_applied) {
        reportWarnings.push(
          `Root-to-ingroup branch length is 0; a visual display gap (${displayBranchLengths.display_root_ingroup_length}) was inserted solely to prevent root line overlap. Input tree is unchanged.`,
        );
      }
    }
    const displayNameOwners = new Map();
    descendantTipNodes(state.root).forEach(node => {
      const display = displayTipLabel(node.label);
      const owners = displayNameOwners.get(display) || [];
      owners.push(String(node.label || ""));
      displayNameOwners.set(display, owners);
    });
    const duplicateDisplayNames = [...displayNameOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([display_name, original_names]) => ({ display_name, original_names }));
    if (duplicateDisplayNames.length) {
      reportWarnings.push(`${duplicateDisplayNames.length} display label(s) map to multiple distinct raw tips; rendering is permitted, but readers may not distinguish those tips.`);
    }
    sourceReports.forEach(source => {
      if (source.unmatched_values) reportWarnings.push(`${source.file_name} has ${source.unmatched_values} numeric node(s) with no matching bipartition in the focal tree.`);
    });
    if (collisionCount) reportWarnings.push(`${collisionCount} layout collision(s) remain prior to export.`);
    const nodeLabels = [...$("tree-svg").querySelectorAll(".support-label, .time-age-label")];
    const unplacedNodeLabels = [...$("tree-svg").querySelectorAll(".supports, .time-ages")]
      .reduce((sum, group) => sum + (Number(group.dataset.unplacedCount) || 0), 0);
    if (unplacedNodeLabels) reportWarnings.push(`${unplacedNodeLabels} node annotation(s) had no collision-free placement and were omitted; adjust tip spacing or font size.`);
    const nodeArrows = [...$("tree-svg").querySelectorAll(".node-label-arrow")];
    const arrowByLabel = new Map(nodeArrows.map(arrow => [arrow.dataset.arrowLabelId, arrow]));
    const nodeArrowsEnabled = PhyloRenderLabelGeometry.shouldUseNodeLeaderLines($("leader-lines").checked, { workspaceMode: state.workspaceMode, layoutMode: $("layout-mode").value, hasBranchLengths: PhyloRenderLabelGeometry.profileHasBranchLengths(displayBranchLengths) });
    const minimumNodeFont = Number($("support-min-size").value);
    const labelsBelowMinimum = nodeLabels.filter(label => Number(label.getAttribute("font-size")) + .001 < minimumNodeFont);
    const protectedBranchLabels = nodeLabels.filter(label => label.dataset.branchOverlapProtected === "true"
      && $("tree-svg").querySelector(`[data-label-backdrop-id="${CSS.escape(label.dataset.labelId)}"]`));
    const missingNodeArrows = nodeArrowsEnabled
      ? nodeLabels.filter(label => !arrowByLabel.has(label.dataset.labelId))
      : [];
    const misdirectedNodeArrows = nodeLabels.filter(label => {
      const arrow = arrowByLabel.get(label.dataset.labelId);
      if (!arrow) return false;
      const nodeX = Number(label.dataset.nodeX);
      const nodeY = Number(label.dataset.nodeY);
      return arrow.dataset.arrowPointsToNode !== "true"
        || Math.abs(Number(arrow.getAttribute("x2")) - nodeX) > .01
        || Math.abs(Number(arrow.getAttribute("y2")) - nodeY) > .01;
    });
    const unexpectedNodeArrows = nodeArrowsEnabled ? [] : nodeArrows;
    const crossingPairs = leaderCrossingPairs(nodeArrows.map(arrow => ({
      labelId: arrow.dataset.leaderId,
      x1: Number(arrow.getAttribute("x1")), y1: Number(arrow.getAttribute("y1")),
      x2: Number(arrow.getAttribute("x2")), y2: Number(arrow.getAttribute("y2")),
    })));
    if (crossingPairs.length) reportWarnings.push(`${crossingPairs.length} pair(s) of leader lines cross; verify node-label ownership.`);
    const insufficientAngleArrows = nodeArrowsEnabled
      ? nodeArrows.filter(arrow => Number(arrow.dataset.axisAngleDegrees) < 20 - .001
        || Number(arrow.dataset.axisAngleDegrees) > 80 + .001
        || Number(arrow.dataset.leaderLength) < 14 - .001)
      : [];
    const branchCrossingArrows = nodeArrowsEnabled
      ? nodeArrows.filter(arrow => Number(arrow.dataset.branchCrossings || 0) > 0)
      : [];
    const unbridgedCrossingArrows = branchCrossingArrows
      .filter(arrow => arrow.dataset.crossingsBridged !== "true");
    const arrowAxisAngles = nodeArrows
      .map(arrow => Number(arrow.dataset.axisAngleDegrees))
      .filter(Number.isFinite);
    const arrowHeads = [...$("tree-svg").querySelectorAll(".node-label-arrowhead")];
    if (missingNodeArrows.length) reportWarnings.push(`${missingNodeArrows.length} displaced node label(s) lack a leader arrow pointing to their target node.`);
    if (misdirectedNodeArrows.length) reportWarnings.push(`${misdirectedNodeArrows.length} leader arrow endpoint(s) do not align with their target node.`);
    if (unexpectedNodeArrows.length) reportWarnings.push(`Leader arrows are disabled, yet ${unexpectedNodeArrows.length} leader arrow(s) were rendered.`);
    if (insufficientAngleArrows.length) reportWarnings.push(`${insufficientAngleArrows.length} leader line(s) deviate from the preferred 20°–80° angle or ~${PhyloRenderUnits.designToDrawing(MIN_NODE_ARROW_LENGTH).toFixed(2)} u minimum length (aesthetic advisory only, not text occlusion).`);
    if (unbridgedCrossingArrows.length) reportWarnings.push(`${unbridgedCrossingArrows.length} leader line(s) cross branches without a visual gap bridge.`);
    const topologyUnchanged = sameSet(originalSplits, displayedSplits);
    if (!topologyUnchanged) reportWarnings.push("Displayed tree differs in unrooted bipartition topology from the input focal tree; export safety certification withheld.");
    const cladeBarGaps = window.PhyloRenderCladeBarGapReport?.() || { groups: [], invalid: 0, valid: true };
    if (!cladeBarGaps.valid) reportWarnings.push(`${cladeBarGaps.invalid} clade bar(s) failed tip-label clearance validation.`);
    return {
      contract_version: PhyloRenderContract.version,
      bridge_version: VERSION,
      tree_type: state.workspaceMode,
      ...(timeProfile ? { time: {
        source_unit: timeUnits.source,
        display_unit: timeUnits.display,
        unit_confirmed: Boolean(timeUnits.sourceYears),
        age_source: $("time-age-source").value,
        resolved_age_source: timeProfile.ageSource,
        ...(timeProfile.terminalAgeValidation ? {terminal_age_validation: timeProfile.terminalAgeValidation} : {}),
        root_age_raw: timeProfile.rootAge,
        root_age_display: timeProfile.rootAge * timeUnits.factor,
        explicit_age_nodes: timeProfile.explicitAgeCount,
        branch_derived_age_nodes: timeProfile.derivedAgeCount,
        invalid_age_nodes: timeProfile.invalidAgeCount,
        age_source_counts: timeProfile.sourceCounts,
        mixed_explicit_age_sources: timeProfile.mixedExplicitSources,
        hpd_nodes_available: timeProfile.hpdCount,
        hpd_nodes_shown: $("tree-svg").querySelectorAll(".time-hpd").length,
        hpd_marker: $("time-hpd-marker").value,
        hpd_markers_shown: $("tree-svg").querySelectorAll(".time-hpd-point").length,
        node_age_labels: timeLabelSummary.report,
      } } : {}),
      tips: descendantTipNodes(state.root).length,
      rendered_node_annotations: Number($("support-count").textContent) || 0,
      support_units: state.workspaceMode === "time" ? null : {declared:$("support-scale").value,columns:mainSupportScales(),policy:PhyloRenderSupportScale.policy},
      remaining_collisions: collisionCount,
      leader_lines: nodeArrows.length,
      leader_lines_crossing_branches: branchCrossingArrows.length,
      leader_lines_unbridged_crossings: unbridgedCrossingArrows.length,
      node_arrows: {
        line_style: "dashed",
        crossing_pairs: crossingPairs.length,
        crossing_label_pairs: crossingPairs,
        angle_reference: "horizontal",
        required_minimum_angle_degrees: 20,
        required_maximum_angle_degrees: 80,
        required_minimum_length_u: PhyloRenderUnits.designToDrawing(14),
        required_minimum_length_pt: 14 / state.currentSvgSize.width * physicalOutputReport().width_mm * 72 / 25.4,
        enabled: nodeArrowsEnabled,
        required: nodeArrowsEnabled,
        labels: nodeLabels.length,
        arrows: nodeArrows.length,
        missing: missingNodeArrows.length,
        misdirected: misdirectedNodeArrows.length,
        unexpected: unexpectedNodeArrows.length,
        insufficient_angle: insufficientAngleArrows.length,
        angle_and_length_are_soft_preferences: true,
        insufficient_length: nodeArrows.filter(arrow => Number(arrow.dataset.leaderLength) < 14 - .001).length,
        minimum_axis_angle_degrees: arrowAxisAngles.length ? Math.min(...arrowAxisAngles) : null,
        minimum_leader_length_pt: nodeArrows.length
          ? Math.min(...nodeArrows.map(arrow => Number(arrow.dataset.leaderLength))) / state.currentSvgSize.width * physicalOutputReport().width_mm * 72 / 25.4 : null,
        minimum_leader_length_u: nodeArrows.length ? PhyloRenderUnits.designToDrawing(Math.min(...nodeArrows.map(arrow=>Number(arrow.dataset.leaderLength)))) : null,
        arrowhead_length: arrowHeads.length ? Number(arrowHeads[0].dataset.arrowheadLength) : null,
        arrowhead_half_width: arrowHeads.length ? Number(arrowHeads[0].dataset.arrowheadHalfWidth) : null,
      },
      label_layout: {
        policy: "unified-cost-hard-text-v3",
        unplaced_count: unplacedNodeLabels,
        joint_optimization: [...$("tree-svg").querySelectorAll("[data-joint-energy-before]")].map(group => ({
          energy_before: Number(group.dataset.jointEnergyBefore),
          energy_after: Number(group.dataset.jointEnergyAfter),
          pair_moves: Number(group.dataset.jointMoves),
          actual_layout_accepted: group.dataset.jointAccepted === "true",
          branch_traversals_before: Number(group.dataset.branchTraversalsBefore),
          branch_traversals_after: Number(group.dataset.branchTraversalsAfter),
        })),
        minimum_font_is_hard_limit: true,
        below_minimum_count: labelsBelowMinimum.length,
        ownership_method: nodeArrowsEnabled ? "true-node-arrow" : "nearest-node",
        proximity_is_soft_with_arrows: true,
        protected_branch_overlap_labels: protectedBranchLabels.length,
        global_repaired_labels: nodeLabels.filter(label => label.dataset.autoPosition === "global-repair").length,
      },
      topology_unchanged: topologyUnchanged,
      original_topology_fingerprint: await topologyFingerprint(state.parsedRoot),
      displayed_topology_fingerprint: await topologyFingerprint(state.root),
      canvas: { ...state.currentSvgSize },
      display_branch_lengths: structuredClone(displayBranchLengths),
      output: sharedOutputReport(true),
      outgroup: getOutgroupLabels(),
      rooting: structuredClone(activeRootingReport),
      clades: getCladeSpecs(),
      clade_bar_spacing: cladeBarGaps,
      font_portability: sharedFontPortability(),
      geological_timescale: $("tree-svg").querySelector(".time-geology") ? PhyloRenderGeologicTime.SOURCE : null,
      node_data_sources: sourceReports,
      branches: await branchManifest(state.root),
      tip_labels: {
        total: descendantTipNodes(state.root).length,
        customized: state.tipLabelOverrides.size,
        overrides: tipLabelOverridesObject(),
        duplicate_display_names: duplicateDisplayNames,
      },
      taxon_name_engine: state.taxonNameEngine,
      warnings: reportWarnings,
      safe_for_export: topologyUnchanged
        && (!timeProfile || (Boolean(timeUnits.sourceYears) && timeProfile.valid))
        && labelsBelowMinimum.length === 0
        && unplacedNodeLabels === 0
        && collisionCount === 0
        && missingNodeArrows.length === 0
        && misdirectedNodeArrows.length === 0
        && unexpectedNodeArrows.length === 0
        && unbridgedCrossingArrows.length === 0
        && cladeBarGaps.valid,
    };
  }

  function inputFile(input, fallback) {
    const tree = normalizeTreeInput(input, fallback);
    return new File([tree.content], tree.name, { type: "text/plain" });
  }

  function rotateToOrder(root, order) {
    const names = descendantTipLabels(root), rank = new Map(order.map((name, index) => [normalizeTipKey(name), index]));
    if (rank.size !== names.length || names.some(name => !rank.has(normalizeTipKey(name))))
      throw new Error("Focal-tree tip_order must list every raw tip exactly once");
    const result = structuredClone(root);
    (function visit(node) {
      node.children.forEach(visit);
      node.children.sort((a, b) => Math.min(...descendantTipLabels(a).map(name => rank.get(normalizeTipKey(name))))
        - Math.min(...descendantTipLabels(b).map(name => rank.get(normalizeTipKey(name)))));
    })(result);
    if (descendantTipLabels(result).some((name, index) => normalizeTipKey(name) !== normalizeTipKey(order[index])))
      throw new Error("Requested tip_order is incompatible with the tree topology; only sister-clade rotations are permitted");
    return result;
  }

  function advancedGroups(spec) {
    const root = state.workspaceMode === "cloud" ? state.cloud.speciesRoot : state.conflict.nuclearRoot;
    const target = state.cloud;
    if (state.workspaceMode === "cloud") {
      clearCloudClades();
      (spec.clades || []).forEach((entry, index) => {
        const node = mrcaForTipNames(root, entry.mrca_of, `clades[${index}]`);
        const key = PhyloRenderCladeHierarchy.cladeKey(node.id, entry.tier, target.cladeColors);
        target.cladeColors.set(key, entry.color || CLADE_PALETTE[index % CLADE_PALETTE.length]);
        target.cladeNames.set(key, entry.name || cladeSummary(node));
        target.cladeNameOrientations.set(key, entry.label_orientation || PhyloRenderContract.cladeLabelOrientation.defaultValue);
        PhyloRenderBridgeHelpers.applyCladeHierarchy(target, key, entry, `clades[${index}]`, PhyloRenderCladeHierarchy);
        if (entry.name_segments) target.cladeNameSegments.set(key, entry.name_segments.map(part => { const {size_pt,...segment}=PhyloRenderUnits.legacyOptions(part); return {...segment,...(size_pt ? {size:size_pt*4/3} : {})}; }));
      });
    } else {
      const model = PhyloRenderConflict;
      const groups = [...(spec.sample_groups || []), ...(spec.clades || []).map(entry => ({ name: entry.name || "Group",
        color: entry.color || CLADE_PALETTE[0], samples: model.tipNodes(
          mrcaForTipNames(root, entry.mrca_of, "clade", model.normalizeTipKey)).map(tip => tip.label) }))];
      state.conflict.groupAssignments = groups.length ? model.assignSampleGroups(root, groups) : null;
    }
  }

  // Private single-entry cache in the renderer's isolated page. A cache hit
  // always clones scientific state before presentation mutates node order.
  let cloudAnalysisCache = null;
  let cloudCacheStatus = null;
  async function loadMultiTreeFigure(spec, options, progress) {
    const mode = state.workspaceMode;
    if (spec.support_trees?.length || spec.other_data_trees?.length || spec.label_adjustments?.length)
      throw new Error("Cloudogram and tanglegram workspaces do not accept supplementary single-tree node sources or label_adjustments");
    if (mode === "cloud") {
      if ((options.cloud?.species_method || "ml") === "ml" &&
          (!Number.isFinite(options.cloud?.root_age) || options.cloud.root_age <= 0))
        throw new Error("Uncalibrated ML species trees require a positive options.cloud.root_age (crown/root display age > 0)");
      options.cloud = PhyloRenderContract.merge({ species_method: "ml", genes_method: "ml", dated_unit: "unconfirmed",
        dated_age_source: "auto", root_age: 10, root_age_unit: "relative", opacity: PhyloRenderContract.cloudOpacity.defaultValue, show_gene: true, show_species: true, show_pies: true, show_time_axis: false,
        species_shape: "triangular", pie_mode: "two", pie_radius: PhyloRenderContract.cloudPies.defaultRadiusPx,
        pie_legend_position: PhyloRenderContract.defaults("cloud").cloud.pie_legend_position, pie_legend_scale: 150, jitter: PhyloRenderContract.cloudJitter.defaultValue,
        phyparts_outgroups: [], phyparts_root_policy: "outgroup", phyparts_threshold: 0, phyparts_field: "last", phyparts_scale: "auto" }, options.cloud);
      if (options.cloud.show_gene && !spec.gene_trees) throw new Error("Showing the gene-tree cloud requires gene_trees; set show_gene=false to plot only the species tree or concordance pies");
      applyFigureOptions(options); $("cloud-ladder-direction").value=options.layout.ladderize;
      const analysisKey = await sha256(PhyloRenderAnalysisSpec.identity(spec, options.cloud));
      const cacheHit = cloudAnalysisCache?.key === analysisKey &&
        (!options.cloud.show_gene || cloudAnalysisCache.hasOverlay);
      cloudCacheStatus = { key: analysisKey, hit: !!cacheHit };
      if (cacheHit) {
        state.cloud = structuredClone(cloudAnalysisCache.snapshot);
      } else {
      await globalThis.PhyloRenderImportCloudSpecies(inputFile(spec.main_tree, "species_tree"), progress);
      if (spec.gene_trees) {
        await importCloudGenes(inputFile(spec.gene_trees, "gene_trees"));
        if (options.cloud.show_gene && !state.cloud.geneRoots.length)
          throw new Error("No complete-taxon ML gene trees were eligible for the cloudogram overlay; verify ML branch lengths, complete taxon sampling, and treePL alignment (concordance statistics alone never substitute for a cloudogram).");
      }
      if (spec.phyparts_table) {
        state.cloud.phyPartsTable = PhyloRenderCloud.parsePhyPartsTable(spec.phyparts_table.content);
        state.cloud.phyPartsName = spec.phyparts_table.name || "PhyParts";
        state.cloud.phyPartsText = spec.phyparts_table.content;
        state.cloud.phyPartsMeta = null;
      }
      cloudAnalysisCache = { key: analysisKey, hasOverlay: state.cloud.geneRoots.length > 0,
        snapshot: structuredClone(state.cloud) };
      }
      if (options.cloud.pie_mode === "four" && state.cloud.phyPartsTable && !state.cloud.phyPartsTable.detailed)
        throw new Error("Four-slice concordance pies require full four-category counts and cannot be inferred from two-way counts");
      const afterImport = structuredClone(options);
      if (state.cloud.importedDating) delete afterImport.cloud.root_age;
      applyFigureOptions(afterImport);
      if (options.layout?.tip_order) {
        const ordered = rotateToOrder(state.cloud.speciesRoot, options.layout.tip_order);
        const children = new Map();
        (function visit(node) { children.set(node.id, node.children.map(child => child.id)); node.children.forEach(visit); })(ordered);
        (function visit(node) { node.children.sort((a,b) => children.get(node.id).indexOf(a.id)-children.get(node.id).indexOf(b.id)); node.children.forEach(visit); })(state.cloud.speciesRoot);
      }
      state.cloud.hiddenPieNodes.clear();
      const matches = state.cloud.phyPartsTable ? PhyloRenderCloud.matchPhyParts(state.cloud.speciesRoot, state.cloud.phyPartsTable).matched : new Map();
      for (const samples of options.cloud.hidden_pies || []) {
        const wanted = samples.slice().sort().join("\u001f");
        const match = [...matches].find(([node]) => descendantTipLabels(node).slice().sort().join("\u001f") === wanted);
        if (!match) throw new Error("Taxon set in hidden_pies did not match any concordance pie node");
        state.cloud.hiddenPieNodes.add(match[1].id);
      }
    } else {
      if (!spec.comparison_tree) throw new Error("Tanglegram comparison requires comparison_tree");
      const samplePolicyExplicit = options.conflict?.sample_policy !== undefined;
      options.conflict = PhyloRenderContract.merge({ primary_title: "Primary tree", secondary_title: "Comparison tree" }, options.conflict);
      Object.assign(state.conflict, { nuclearRoot: null, plastidRoot: null, prepared: null,
        primaryDisplayRoot: null, groupAssignments: null, taxonNameRequestKey: "" });
      applyFigureOptions(options); $("conflict-primary-ladder").value=options.layout.ladderize;
      await importConflictTree("nuclear", inputFile(spec.main_tree, "primary_tree"), progress, { interactive: false, preserveSamplePolicy: samplePolicyExplicit, deferRender: true });
      await importConflictTree("plastid", inputFile(spec.comparison_tree, "comparison_tree"), progress, { interactive: false, preserveSamplePolicy: samplePolicyExplicit, deferRender: true });
      if (!conflictTreesReady()) throw new Error($("tree-loading-detail").textContent || "Tanglegram import failed");
      if (spec.rooting?.outgroup?.length) {
        const rooted = PhyloRenderConflict.rerootPairByOutgroup(state.conflict.nuclearRoot,
          state.conflict.plastidRoot, spec.rooting.outgroup, { buildGraph, rooting: PhyloRenderRooting });
        Object.assign(state.conflict, rooted, { primaryDisplayRoot: PhyloRenderConflict.ladderizePrimary(
          rooted.nuclearRoot, options.layout.ladderize) });
      }
      for (const [key, side] of [["primary_support_field", "nuclear"], ["secondary_support_field", "plastid"]]) {
        const value = options.conflict[key];
        if (value !== undefined) {
          const profile = conflictSupportFieldProfile(state.conflict[`${side}Root`]);
          if (value !== "all" && (!/^field:\d+$/.test(value) || Number(value.split(":")[1]) >= profile.maxComponents))
            throw new Error(`${key} does not match any available branch-support column`);
          state.conflict.supportFieldSelections[side] = value;
        }
      }
      if (options.layout.tip_order) state.conflict.primaryDisplayRoot = rotateToOrder(state.conflict.nuclearRoot, options.layout.tip_order);
    }
    advancedGroups(spec);
    const rawTipPool = mode === "cloud"
      ? PhyloRenderBridgeHelpers.rawDescendantTipLabels(state.cloud.speciesRoot)
      : [...new Set([...PhyloRenderBridgeHelpers.rawDescendantTipLabels(state.conflict.nuclearRoot),
          ...PhyloRenderBridgeHelpers.rawDescendantTipLabels(state.conflict.plastidRoot)])];
    const resolvedOverrides = PhyloRenderBridgeHelpers.resolveTipLabelOverrides(
      spec.tip_label_overrides || {}, rawTipPool, mode === "conflict" ? "conflict" : "auxiliary", PhyloRenderSampleIdentity);
    applyTipLabelOverrides(resolvedOverrides, { mode: "replace", render: false, message: false });
    await refreshTaxonNameRecognition({ force: true, deferRender: true });
    await ensureFigureFontsReady();
    if (mode === "cloud") updateCloudStatus();
    else prepareConflictWorkspace({ announce: false, deferRender: true });
    await renderTreeCooperatively(() => {}, { fontReady: true });
    return advancedFigureResult(progress.owner);
  }

  async function advancedFigureResult(owner) {
    const mode = state.workspaceMode;
    const root = mode === "cloud" ? state.cloud.speciesRoot : state.conflict.nuclearRoot;
    const original = mode === "cloud" ? state.cloud.speciesText : state.conflict.nuclearText;
    const originalRoot = original ? parseNewick(original) : root;
    const fingerprint = await topologyFingerprint(root), originalFingerprint = await topologyFingerprint(originalRoot);
    const svg = await serializedSvg({ owner }), options = getOptions();
    const collisions = Number($("collision-count").textContent) || 0;
    const cloud = state.cloud, conflict = state.conflict;
    const warnings = [];
    if (mode === "cloud" && !cloud.importedDating) warnings.push(TIME_UNITS[cloudTimeUnit()] && cloud.datingEngine === "bundled-treePL"
      ? "Display alignment uses the caller-supplied root/crown age; calibration provenance was not verified, and geological colors alone do not establish absolute ages."
      : "Cloudogram horizontal axis uses relative display coordinates without fossil calibration and does not represent absolute divergence times.");
    if (mode === "cloud" && cloud.importedDating?.unit === "unconfirmed") warnings.push("Input time unit has not yet been confirmed; values must not be cited as million years ago (Mya).");
    if (mode === "cloud" && cloud.geneRoots.length) warnings.push("Gene trees are constrained to shared species-tree clade ages for display alignment only, not de novo multispecies-coalescent divergence-time inference.");
    if (systemArialFallback) warnings.push("Arial is unavailable; Arimo was used explicitly. Exact cross-machine parity requires identical fonts.");
    const normalized = { workspace: mode, options, clades: await advancedCladeSpecs(), tip_label_overrides: tipLabelOverridesObject(),
      ...(mode === "conflict" ? { rooting: { outgroup: PhyloRenderConflict.rootOutgroupLabels(root) },
        sample_groups: PhyloRenderConflict.exportSampleGroups(root, conflict.groupAssignments) } : {}) };
    return { normalized_spec: normalized, svg, panel_trees: [], a4_print_pages: [], report: {
      bridge_version: VERSION, contract_version: PhyloRenderContract.version, tree_type: mode,
      topology_unchanged: fingerprint === originalFingerprint, original_topology_fingerprint: originalFingerprint,
      displayed_topology_fingerprint: fingerprint, source_tree_unchanged: original ? fingerprint === originalFingerprint : null,
      source_verification: original ? "input-topology-fingerprint" : "bundled-demo-without-full-input",
      tips: descendantTipLabels(root).length, remaining_collisions: mode === "cloud" ? collisions : 0,
      warnings, canvas: { ...state.currentSvgSize },
      output: sharedOutputReport(),
      font_portability: sharedFontPortability(),
      geological_timescale: $("tree-svg").querySelector(".time-geology") ? PhyloRenderGeologicTime.SOURCE : null,
      safe_for_export: fingerprint === originalFingerprint && (mode === "cloud" ? collisions === 0
        : Number(conflict.prepared?.supportCollisionCount || 0) === 0
          && Number($("tree-svg").dataset.conflictSupportUnplaced || 0) === 0),
      ...(mode === "cloud" ? { cloud: { gene_audit: cloud.geneAudit, overlay_genes: cloud.geneRoots.length,
        analysis_cache: cloudCacheStatus,
        time_interpretation: "display_alignment",
        independently_estimated_gene_times: false,
        constraint_policy: "exact ages for identical shared clades; not a multispecies-coalescent inference",
        dating_engine: cloud.datingEngine, gene_dating_engine: cloud.geneDatingEngine, imported_dating: cloud.importedDating,
        treepl_seed: cloud.treePLSeed ?? null,
        treepl_runs: cloud.treePLRuns || [],
        time_background: cloudTimeBackgroundSettings(),
        phyparts: cloud.phyPartsMeta ? { ...cloud.phyPartsMeta, table: undefined } : null,
        pie_nodes: cloud.phyPartsTable ? [...PhyloRenderCloud.matchPhyParts(root, cloud.phyPartsTable).matched].map(([node,row]) => ({
          node_id: row.id, mrca_of: descendantTipLabels(node), counts: row })) : [] } }
        : { conflict: { support_units:{primary:options.conflict.primary_support_scale,secondary:options.conflict.secondary_support_scale,policy:PhyloRenderSupportScale.policy}, sample_comparison: conflict.prepared.comparison, main_only: conflict.prepared.comparison.nuclearOnly, comparison_only: conflict.prepared.comparison.plastidOnly, crossings_before: conflict.prepared.crossingsBefore,
          crossings_after: conflict.prepared.crossingsAfter, primary_order: descendantTipLabels(conflict.primaryDisplayRoot),
          group_coloring: PhyloRenderConflict.groupColoringReport(conflict.prepared, conflict.groupAssignments),
          support_collisions: conflict.prepared.supportCollisionCount || 0,
          support_unplaced: Number($("tree-svg").dataset.conflictSupportUnplaced || 0),
          comparison_topology_fingerprint: await topologyFingerprint(conflict.plastidRoot) } }),
      two_panel: { supported: false, panels: 0, reason: "Web and MCP both omit two-panel splitting for cloud/conflict." },
      a4_print: { supported: false, pages: 0, deprecated: true, reason: "Replaced by two-panel tree export." },
    } };
  }

  async function advancedCladeSpecs() {
    if (state.workspaceMode !== "cloud") return [];
    return [...state.cloud.cladeColors].map(([id,color]) => {
      const node = findNodeById(state.cloud.speciesRoot, PhyloRenderCladeHierarchy.baseNodeId(id));
      const segments = state.cloud.cladeNameSegments.get(id);
      return { mrca_of: descendantTipLabels(node), name: state.cloud.cladeNames.get(id) || cladeSummary(node), color,
        label_orientation: state.cloud.cladeNameOrientations.get(id) || PhyloRenderContract.cladeLabelOrientation.defaultValue, ...PhyloRenderBridgeHelpers.serializeCladeHierarchy(state.cloud, id),
        ...(segments?.length ? {name_segments:segments.map(({size,...part})=>({...part,...(size ? {size_u:PhyloRenderUnits.designToDrawing(size)} : {})}))} : {}) };
    });
  }

  async function loadFigure(spec, {includePanels = false} = {}) {
    await window.PhyloRenderReady;
    let result;
    await runTreeLoad("Loading figure specification", async progress => { result = await loadFigureSteps(spec, progress, includePanels); }, {
      throwOnError: true,
      deadlineMs: PhyloRenderBridgeHelpers.deadlineMsForSpec(spec?.workspace || "phylogeny", spec?.options),
      captureExtra: () => structuredClone({ activeCladeIds, activeLabelAdjustments, activeRootingReport, cloudAnalysisCache, cloudCacheStatus }),
      restoreExtra: extra => { ({ activeCladeIds, activeLabelAdjustments, activeRootingReport, cloudAnalysisCache, cloudCacheStatus } = extra); },
    });
    return result;
  }
  async function loadFigureSteps(spec, progress, includePanels) {
    const paths = new Set([...Object.keys(ENUM_CONTROLS), ...Object.keys(NUMBER_CONTROLS), ...Object.keys(PHYSICAL_CONTROLS),
      ...Object.keys(BOOLEAN_CONTROLS), ...Object.keys(COLOR_CONTROLS), "layout.tip_spacing_em", "layout.automatic_tip_spacing",
      "layout.tip_order", "support.decimals", "labels.node_arrows", "typography.clades.follow_clade_color", "typography.clades.color",
      "time.age_minimum", "time.age_maximum", "cloud.pie_age_minimum", "cloud.pie_age_maximum", "cloud.hidden_pies", "cloud.phyparts_outgroups",
      "cloud.ladderize", "conflict.primary_ladder", "conflict.primary_title", "conflict.secondary_title", "conflict.primary_support_field", "conflict.secondary_support_field", "conflict.primary_order"]);
    const workspace = PhyloRenderFigureInputValidation.validate(spec, { workspaces: PhyloRenderContract.workspaces,
      optionPaths: paths, currentWorkspace: state.workspaceMode,optionPolicy:PhyloRenderContract });
    const effectiveOptions = PhyloRenderContract.resolveCladeTypography(PhyloRenderContract.merge(PhyloRenderContract.defaults(workspace),
      PhyloRenderContract.optionsForWorkspace(workspace,PhyloRenderContract.physicalOptions(spec.options || {}))));
    // Reject invalid single-tree science before changing workspace, controls or
    // source text. In particular, malformed HPD must not replace a valid figure.
    const mainTree = ["cloud", "conflict"].includes(workspace) ? null : normalizeTreeInput(spec.main_tree, "main_tree");
    const parsedInput = mainTree ? await parseNewickAsync(mainTree.content) : null;
    if (parsedInput) uniqueTipMap(parsedInput);
    if (workspace === "phylogeny") mainSupportScales(buildMainSupportIndex(parsedInput,"phylogeny"),effectiveOptions.support.scale);
    if (workspace === "time")
      PhyloRenderTimeModel.assertValid(buildTimeTreeProfile(parsedInput, effectiveOptions.time?.age_source || "auto"));
    await switchWorkspaceMode(workspace, { loadExample: false, deferRender: true });
    resetFigureControls();
    // Explicit drawing-unit or legacy spacing remains authoritative. Automatic spacing is a
    // separate, reproducible choice, never an inferred viewport preference.
    if ((spec.options?.layout?.tip_spacing !== undefined || spec.options?.layout?.tip_spacing_u !== undefined) && spec.options.layout.tip_spacing_em === undefined)
      delete effectiveOptions.layout.tip_spacing_em;
    if ((spec.options?.layout?.tip_spacing !== undefined || spec.options?.layout?.tip_spacing_u !== undefined || spec.options?.layout?.tip_spacing_em !== undefined)
      && spec.options.layout.automatic_tip_spacing === undefined) effectiveOptions.layout.automatic_tip_spacing = false;
    if (workspace === "cloud" || workspace === "conflict") return loadMultiTreeFigure(spec, effectiveOptions, progress);
    const warnings = [];
    activeRootingReport = {
      requested_outgroup: [],
      input_root_partition_tip_counts: [],
      input_already_matches: null,
      operation: "none",
      artificial_nodes_added: 0,
    };
    state.sourceName = mainTree.name;
    $("file-name").textContent = mainTree.name;
    $("newick-input").value = mainTree.content;
    parseAndDraw({ defaultRooting: spec.rooting?.outgroup === undefined, parsedRoot: parsedInput, supportScale: effectiveOptions.support?.scale, deferRender: true });
    const resolvedOverrides = PhyloRenderBridgeHelpers.resolveTipLabelOverrides(
      spec.tip_label_overrides || {}, PhyloRenderBridgeHelpers.rawDescendantTipLabels(state.root), "auxiliary", PhyloRenderSampleIdentity);
    applyTipLabelOverrides(resolvedOverrides, { mode: "replace", render: false, message: false });
    state.nodeDataSources = [];
    state.nextNodeDataSourceId = 1;
    activeCladeIds = new Map();
    activeLabelAdjustments = [];
    if (workspace !== "time") for (const tree of spec.support_trees || []) await addNodeDataFromAgent(tree, "support");
    for (const tree of spec.other_data_trees || []) await addNodeDataFromAgent(tree, "other");
    const requestedOptions = effectiveOptions;
    if (requestedOptions.typography?.clades?.color !== undefined
      || requestedOptions.typography?.clades?.follow_clade_color === false) {
      warnings.push("Clade labels always inherit their respective clade color; legacy typography.clades.color and follow_clade_color=false were ignored (per-segment name_segments overrides remain active).");
    }
    if (state.workspaceMode === "time") {
      if (requestedOptions.layout?.mode && requestedOptions.layout.mode !== "aligned") {
        warnings.push("Focal tree is a time-calibrated chronogram; layout mode was standardized to aligned contemporaneous tips.");
      }
      requestedOptions.layout ||= {};
      requestedOptions.layout.mode = "aligned";
    }
    applyFigureOptions(requestedOptions);
    rerootFromAgent(spec.rooting?.outgroup, warnings);
    if (effectiveOptions.layout.tip_order) state.root = rotateToOrder(state.root, effectiveOptions.layout.tip_order);
    addCladesFromAgent(spec.clades || [], warnings);
    state.manualLabels.clear();
    await applyLabelAdjustments(spec.label_adjustments || []);
    // Prepare names and fonts before the one final layout; serialization reuses it.
    renderNodeDataLists();
    await refreshTaxonNameRecognition({ force: true, deferRender: true });
    await window.PhyloRenderEnsureFonts?.();
    await renderTreeCooperatively(() => {}, { fontReady: true });
    const report = await buildReport(warnings);
    const svg = await serializedSvg({ owner: progress.owner, reuseLayout: true });
    const a4Print = await buildA4PrintPages({ owner: progress.owner, planOnly: !includePanels });
    report.two_panel = a4Print.summary; report.a4_print = { ...a4Print.summary, deprecated: true };
    return {
      normalized_spec: {
        workspace,
        main_tree: { name: mainTree.name },
        tip_label_overrides: tipLabelOverridesObject(),
        support_trees: workspace === "time" ? [] : state.nodeDataSources.filter(source => source.kind === "support").map(source => ({
          source_id: source.agentSourceId, name: source.fileName, label: source.name, field: source.extraction, scale: source.scale,
        })),
        other_data_trees: state.nodeDataSources.filter(source => source.kind === "other").map(source => ({
          source_id: source.agentSourceId, name: source.fileName, label: source.name, field: source.extraction, decimals: source.digits,
        })),
        rooting: { outgroup: getOutgroupLabels() },
        options: getOptions(),
        clades: getCladeSpecs(),
        label_adjustments: activeLabelAdjustments.map(PhyloRenderUnits.drawingAdjustment),
      },
      report,
      svg,
      panel_trees: a4Print.pages,
      a4_print_pages: a4Print.pages,
    };
  }

  async function currentFigure({includePanels = false} = {}) {
    await window.PhyloRenderReady;
    if (activeTreeLoad) throw Object.assign(new Error("A figure import or computation is currently in progress"), { code: "FIGURE_BUSY", retryable: true });
    if (["cloud", "conflict"].includes(state.workspaceMode)) return advancedFigureResult();
    await window.PhyloRenderEnsureFonts?.();
    const svg = await serializedSvg({ reuseLayout: true });
    const report = await buildReport();
    const a4Print = await buildA4PrintPages({planOnly: !includePanels});
    report.two_panel = a4Print.summary; report.a4_print = { ...a4Print.summary, deprecated: true };
    return {
      normalized_spec: {
        workspace: state.workspaceMode,
        main_tree: { name: state.sourceName },
        tip_label_overrides: tipLabelOverridesObject(),
        rooting: { outgroup: getOutgroupLabels() },
        options: getOptions(),
        clades: getCladeSpecs(),
        label_adjustments: activeLabelAdjustments.map(PhyloRenderUnits.drawingAdjustment),
      },
      report,
      svg,
      panel_trees: a4Print.pages,
      a4_print_pages: a4Print.pages,
    };
  }

  async function exportConfiguration() {
    await window.PhyloRenderReady;
    if (activeTreeLoad) throw Object.assign(new Error("A figure specification is currently loading; wait for completion before exporting"), { code: "FIGURE_BUSY", retryable: true });
    if (!await flushSettingsRender()) throw Object.assign(new Error("Pending layout render has not completed; specification cannot be exported yet"), { code: "FIGURE_NOT_READY" });
    const mode = state.workspaceMode;
    const spec = { workspace: mode, options: getOptions(), tip_label_overrides: tipLabelOverridesObject(), clades: [] };
    const orderingRoot = mode === "cloud" ? state.cloud.speciesRoot : state.root;
    if (mode !== "conflict" && orderingRoot) spec.options.layout.tip_order = descendantTipLabels(orderingRoot);
    if (mode === "cloud") {
      if (!state.cloud.speciesText) throw new Error("Bundled demo data omits full raw tree files; upload your own species tree and gene trees to export a recomputable specification (SVG/PNG export remains available).");
      spec.main_tree = { name: state.cloud.speciesName, content: state.cloud.speciesText };
      if (state.cloud.geneFile) spec.gene_trees = { name: state.cloud.geneName, content: await state.cloud.geneFile.text() };
      if (state.cloud.phyPartsText && !(state.cloud.phyPartsMeta && spec.gene_trees)) spec.phyparts_table = { name: state.cloud.phyPartsName || "statistics.tsv", content: state.cloud.phyPartsText };
      spec.clades = await advancedCladeSpecs();
    } else if (mode === "conflict") {
      if (!conflictTreesReady()) throw new Error("Upload both the primary tree and comparison tree first");
      spec.main_tree = { name: state.conflict.nuclearName, content: state.conflict.nuclearText };
      spec.comparison_tree = { name: state.conflict.plastidName, content: state.conflict.plastidText };
      spec.rooting = { outgroup: PhyloRenderConflict.rootOutgroupLabels(state.conflict.nuclearRoot) };
      spec.sample_groups = PhyloRenderConflict.exportSampleGroups(state.conflict.nuclearRoot, state.conflict.groupAssignments);
    } else {
      if (!state.root) throw new Error("Upload a focal tree first");
      spec.main_tree = { name: state.sourceName || "main.tre", content: $("newick-input").value };
      spec.rooting = { outgroup: mode === "time" ? null : getOutgroupLabels().length ? getOutgroupLabels() : null };
      spec.clades = getCladeSpecs().map(({ descendants, clade_id, ...entry }) => ({ ...entry, mrca_of: descendants,
        ...(clade_id ? {clade_id} : {}) }));
      for (const [kind, field] of [["support", "support_trees"], ["other", "other_data_trees"]]) {
        spec[field] = state.nodeDataSources.filter(source => source.kind === kind && !(mode === "time" && kind === "support")).map(source => ({
          name: source.fileName, content: source.rawText, label: source.name, field: source.extraction,
          ...(source.agentSourceId ? {source_id:source.agentSourceId} : {}), ...(kind === "other" ? {decimals:source.digits} : {scale:source.scale}) }));
      }
      spec.label_adjustments = [];
      for (const [key, nodes] of displaySplitEntries(state.root)) {
        const node = preferredDisplayNode(key, nodes).node;
        const manual = state.manualLabels.get(node.incomingEdgeId || node.id);
        if (manual) spec.label_adjustments.push(PhyloRenderUnits.drawingAdjustment({ branch_id: await stableBranchId(key), dx: manual.dx,
          dy: manual.dy, font_reduction: manual.fontReduction || 0 }));
      }
    }
    return spec;
  }

  $("export-figure-config")?.addEventListener("click", async () => {
    try {
      const spec = await exportConfiguration();
      const url = URL.createObjectURL(new Blob([JSON.stringify(spec, null, 2)], {type:"application/json"}));
      const link = document.createElement("a"); link.href=url; link.download="PhyloRender_figure_spec.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showMessage("Exported specification includes raw tree strings and annotations; share only with trusted collaborators or agents.");
    } catch(error) { showMessage(error.message, true); }
  });
  $("import-figure-config")?.addEventListener("change", async event => {
    try {
      if (!event.target.files[0]) return;
      await loadFigure(JSON.parse(await event.target.files[0].text()));
      fitTreeWidth(); showMessage("Figure specification loaded. Web workbench and MCP share this exact specification.");
    } catch(error) { showMessage(error.message, true); }
    finally { event.target.value=""; }
  });

  window.PhyloRenderAgent = Object.freeze({
    version: VERSION,
    ready: () => window.PhyloRenderReady,
    inspectTree,
    loadFigure: async (spec, options) => withBuild(await loadFigure(spec, options)),
    currentFigure: async options => withBuild(await currentFigure(options)),
    exportConfiguration,
    contractVersion: PhyloRenderContract.version,
    capabilities: PhyloRenderContract.capabilities,
  });
  function withBuild(result) {
    if (result?.report) result.report.provenance = {
      build: globalThis.PhyloRenderBuild || null,
      browser: navigator.userAgent, platform: navigator.platform,
    };
    return result;
  }
})();
