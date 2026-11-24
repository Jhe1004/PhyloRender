import { createHash } from "node:crypto";
import { physicalOptions } from "./schemas.mjs";

function deepMerge(base, patch) {
  if (patch === undefined) return structuredClone(base);
  if (patch === null || Array.isArray(patch) || typeof patch !== "object") return structuredClone(patch);
  const result = base && typeof base === "object" && !Array.isArray(base) ? structuredClone(base) : {};
  Object.entries(patch).forEach(([key, value]) => {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? deepMerge(result[key], value)
      : structuredClone(value);
  });
  return result;
}

function digest(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function assignUniqueId(preferred, prefix, seed, used) {
  const base = preferred || `${prefix}:${digest(seed)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}:${suffix++}`;
  used.add(candidate);
  return candidate;
}

function normalizeTipReference(value) {
  return String(value || "").trim().replace(/[._]+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

export function ensureSemanticIds(input) {
  const spec = structuredClone(input);
  const sourceIds = new Set();
  const normalizeSources = (sources, prefix) => (sources || []).map((source, index) => ({
    ...source,
    source_id: assignUniqueId(
      source.source_id,
      prefix,
      `${source.name || "tree"}\u001f${source.label || ""}\u001f${source.content || ""}\u001f${index}`,
      sourceIds,
    ),
  }));
  spec.support_trees = normalizeSources(spec.support_trees, "support");
  spec.other_data_trees = normalizeSources(spec.other_data_trees, "data");
  spec.tip_label_overrides ||= {};

  const cladeIds = new Set();
  spec.clades = (spec.clades || []).map((clade, index) => ({
    ...clade,
    clade_id: assignUniqueId(
      clade.clade_id,
      "clade",
      `${(clade.mrca_of || []).map(normalizeTipReference).sort().join("\u001f")}\u001f${clade.name || ""}\u001f${index}`,
      cladeIds,
    ),
  }));

  const branchIds = new Set();
  spec.label_adjustments = (spec.label_adjustments || []).map(adjustment => {
    if (branchIds.has(adjustment.branch_id)) {
      throw new Error(`Duplicate label adjustment for branch ${adjustment.branch_id}.`);
    }
    branchIds.add(adjustment.branch_id);
    return adjustment;
  });
  return spec;
}

function requireById(items, key, id, label) {
  const index = items.findIndex(item => item[key] === id);
  if (index < 0) throw Object.assign(new Error(`${label} ${id} was not found. Call inspect_figure before editing.`), { code: "NOT_FOUND" });
  return index;
}

function normalizedSampleSetKey(samples) {
  return [...new Set((samples || []).map(s => String(s).trim()))].sort().join("\u001f");
}

export function applyEditOperations(current, operations) {
  let spec = ensureSemanticIds(current);
  const operationSummary = [];
  operations.forEach((operation, index) => {
    switch (operation.op) {
      case "set_options":
        spec.options = deepMerge(physicalOptions(spec.options || {}), physicalOptions(operation.options));
        if ((operation.options.layout?.tip_spacing !== undefined || operation.options.layout?.tip_spacing_u !== undefined) && operation.options.layout.tip_spacing_em === undefined) delete spec.options.layout.tip_spacing_em;
        if (operation.options.layout?.tip_spacing_em !== undefined) {
          delete spec.options.layout.tip_spacing_u;
          delete spec.options.layout.tip_spacing;
        }
        operationSummary.push(`set_options (${Object.keys(operation.options).join(", ") || "no fields"})`);
        break;
      case "set_rooting":
        spec.rooting = { outgroup: operation.outgroup };
        operationSummary.push(operation.outgroup === null ? "clear rooting" : `set rooting from ${operation.outgroup.length} tip reference(s)`);
        break;
      case "set_tip_label":
        spec.tip_label_overrides[operation.original_name] = operation.display_name;
        operationSummary.push(`set tip label ${operation.original_name}`);
        break;
      case "remove_tip_label":
        if (!Object.hasOwn(spec.tip_label_overrides, operation.original_name)) {
          throw Object.assign(new Error(`Tip label override ${operation.original_name} was not found. Call inspect_figure before editing.`), { code: "TIP_OVERRIDE_NOT_FOUND", field: "tip_label_overrides" });
        }
        delete spec.tip_label_overrides[operation.original_name];
        operationSummary.push(`remove tip label ${operation.original_name}`);
        break;
      case "merge_tip_labels":
        spec.tip_label_overrides = { ...spec.tip_label_overrides, ...operation.tip_label_overrides };
        operationSummary.push(`merge ${Object.keys(operation.tip_label_overrides).length} tip label(s)`);
        break;
      case "replace_tip_labels":
        spec.tip_label_overrides = structuredClone(operation.tip_label_overrides);
        operationSummary.push(`replace tip labels with ${Object.keys(operation.tip_label_overrides).length} mapping(s)`);
        break;
      case "clear_tip_labels":
        spec.tip_label_overrides = {};
        operationSummary.push("clear all tip labels");
        break;
      case "add_clade":
        spec.clades.push(operation.clade);
        spec = ensureSemanticIds(spec);
        operationSummary.push(`add clade ${spec.clades.at(-1).clade_id}`);
        break;
      case "update_clade": { 
        const itemIndex = requireById(spec.clades, "clade_id", operation.clade_id, "Clade");
        const currentClade = spec.clades[itemIndex];
        const patch = structuredClone(operation.patch);
        const updatesName = Object.hasOwn(patch, "name");
        const updatesSegments = Object.hasOwn(patch, "name_segments");
        if (updatesName && !updatesSegments) delete currentClade.name_segments;
        if (updatesSegments && !updatesName) {
          patch.name = patch.name_segments.map(segment => segment.text).join("");
        }
        const merged = { ...currentClade, ...patch, clade_id: operation.clade_id };
        if (merged.tier === null) delete merged.tier;
        spec.clades[itemIndex] = merged;
        operationSummary.push(`update clade ${operation.clade_id}`);
        break;
      }
      case "remove_clade": { 
        const itemIndex = requireById(spec.clades, "clade_id", operation.clade_id, "Clade");
        spec.clades.splice(itemIndex, 1);
        operationSummary.push(`remove clade ${operation.clade_id}`);
        break;
      }
      case "add_support_tree":
        spec.support_trees.push(operation.tree);
        spec = ensureSemanticIds(spec);
        operationSummary.push(`add support source ${spec.support_trees.at(-1).source_id}`);
        break;
      case "update_support_tree": { 
        const itemIndex = requireById(spec.support_trees, "source_id", operation.source_id, "Support source");
        spec.support_trees[itemIndex] = { ...spec.support_trees[itemIndex], ...operation.patch, source_id: operation.source_id };
        operationSummary.push(`update support source ${operation.source_id}`);
        break;
      }
      case "remove_support_tree": { 
        const itemIndex = requireById(spec.support_trees, "source_id", operation.source_id, "Support source");
        spec.support_trees.splice(itemIndex, 1);
        operationSummary.push(`remove support source ${operation.source_id}`);
        break;
      }
      case "add_other_data_tree":
        spec.other_data_trees.push(operation.tree);
        spec = ensureSemanticIds(spec);
        operationSummary.push(`add other-data source ${spec.other_data_trees.at(-1).source_id}`);
        break;
      case "update_other_data_tree": { 
        const itemIndex = requireById(spec.other_data_trees, "source_id", operation.source_id, "Other-data source");
        spec.other_data_trees[itemIndex] = { ...spec.other_data_trees[itemIndex], ...operation.patch, source_id: operation.source_id };
        operationSummary.push(`update other-data source ${operation.source_id}`);
        break;
      }
      case "remove_other_data_tree": { 
        const itemIndex = requireById(spec.other_data_trees, "source_id", operation.source_id, "Other-data source");
        spec.other_data_trees.splice(itemIndex, 1);
        operationSummary.push(`remove other-data source ${operation.source_id}`);
        break;
      }
      case "set_label_adjustment": { 
        const itemIndex = spec.label_adjustments.findIndex(item => item.branch_id === operation.adjustment.branch_id);
        if (itemIndex < 0) spec.label_adjustments.push(operation.adjustment);
        else spec.label_adjustments[itemIndex] = operation.adjustment;
        operationSummary.push(`set label adjustment ${operation.adjustment.branch_id}`);
        break;
      }
      case "remove_label_adjustment": { 
        const itemIndex = requireById(spec.label_adjustments, "branch_id", operation.branch_id, "Label adjustment");
        spec.label_adjustments.splice(itemIndex, 1);
        operationSummary.push(`remove label adjustment ${operation.branch_id}`);
        break;
      }
      case "reset_label_adjustments":
        spec.label_adjustments = [];
        operationSummary.push("reset all label adjustments");
        break;
      case "set_sample_groups":
        if ((spec.workspace || "phylogeny") !== "conflict") {
          throw Object.assign(new Error("set_sample_groups requires conflict workspace."), { code: "UNSUPPORTED_OPERATION" });
        }
        spec.sample_groups = structuredClone(operation.sample_groups);
        operationSummary.push(`set ${spec.sample_groups.length} sample group(s)`);
        break;
      case "clear_sample_groups":
        if ((spec.workspace || "phylogeny") !== "conflict") {
          throw Object.assign(new Error("clear_sample_groups requires conflict workspace."), { code: "UNSUPPORTED_OPERATION" });
        }
        delete spec.sample_groups;
        operationSummary.push("clear sample groups");
        break;
      case "hide_cloud_pie": {
        if ((spec.workspace || "phylogeny") !== "cloud") {
          throw Object.assign(new Error("hide_cloud_pie requires cloud workspace."), { code: "UNSUPPORTED_OPERATION" });
        }
        spec.options ||= {};
        spec.options.cloud ||= {};
        const existing = Array.isArray(spec.options.cloud.hidden_pies) ? spec.options.cloud.hidden_pies : [];
        const targetKey = normalizedSampleSetKey(operation.samples);
        if (!existing.some(list => normalizedSampleSetKey(list) === targetKey)) {
          spec.options.cloud.hidden_pies = [...existing, [...operation.samples]];
        }
        operationSummary.push(`hide cloud pie (${operation.samples.length} tips)`);
        break;
      }
      case "show_cloud_pie": {
        if ((spec.workspace || "phylogeny") !== "cloud") {
          throw Object.assign(new Error("show_cloud_pie requires cloud workspace."), { code: "UNSUPPORTED_OPERATION" });
        }
        const existing = Array.isArray(spec.options?.cloud?.hidden_pies) ? spec.options.cloud.hidden_pies : [];
        const targetKey = normalizedSampleSetKey(operation.samples);
        const filtered = existing.filter(list => normalizedSampleSetKey(list) !== targetKey);
        if (filtered.length === existing.length) {
          throw Object.assign(new Error("Specified hidden cloud pie sample set was not found."), { code: "NOT_FOUND" });
        }
        spec.options.cloud.hidden_pies = filtered;
        operationSummary.push(`show cloud pie (${operation.samples.length} tips)`);
        break;
      }
      case "reset_hidden_cloud_pies":
        if ((spec.workspace || "phylogeny") !== "cloud") {
          throw Object.assign(new Error("reset_hidden_cloud_pies requires cloud workspace."), { code: "UNSUPPORTED_OPERATION" });
        }
        if (spec.options?.cloud) spec.options.cloud.hidden_pies = [];
        operationSummary.push("reset hidden cloud pies");
        break;
      default:
        throw new Error(`Unsupported edit operation at index ${index}: ${operation.op}`);
    }
  });
  return { spec: ensureSemanticIds(spec), operationSummary };
}

export { deepMerge };
