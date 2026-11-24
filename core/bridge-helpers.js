(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhyloRenderBridgeHelpers=api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function rawDescendantTipLabels(root) {
    const labels = [];
    (function visit(node) {
      if (!node) return;
      if (!node.children || !node.children.length) {
        if (node.label !== undefined && node.label !== null && String(node.label) !== "") {
          labels.push(String(node.label));
        }
        return;
      }
      node.children.forEach(visit);
    })(root);
    return labels;
  }

  function resolveTipLabelOverrides(overrides, rawLabels, policy, identityApi) {
    const entries = Object.entries(overrides || {});
    if (!entries.length) return {};
    const exactSet = new Set(rawLabels);
    const byPolicy = new Map();
    for (const label of rawLabels) {
      const key = identityApi.tipIdentityKey(label, policy);
      const list = byPolicy.get(key) || [];
      list.push(label);
      byPolicy.set(key, list);
    }
    const resolved = {};
    const seenTargets = new Set();
    for (const [rawKey, displayValue] of entries) {
      const candidateKey = String(rawKey || "").trim();
      let matchedLabel = null;
      if (exactSet.has(candidateKey)) {
        matchedLabel = candidateKey;
      } else {
        const key = identityApi.tipIdentityKey(candidateKey, policy);
        const candidates = byPolicy.get(key) || [];
        if (candidates.length === 1) {
          matchedLabel = candidates[0];
        } else if (candidates.length > 1) {
          throw Object.assign(
            new Error(`Tip override key "${rawKey}" matches multiple raw tip labels after normalization`),
            { code: "INVALID_TIP_OVERRIDE", field: "tip_label_overrides" },
          );
        }
      }
      if (!matchedLabel) {
        throw Object.assign(
          new Error(`Tip override key "${rawKey}" was not found among raw tip labels in the current tree`),
          { code: "INVALID_TIP_OVERRIDE", field: "tip_label_overrides" },
        );
      }
      if (seenTargets.has(matchedLabel)) {
        throw Object.assign(
          new Error(`Multiple tip_label_overrides entries map to the same raw tip label "${matchedLabel}"`),
          { code: "INVALID_TIP_OVERRIDE", field: "tip_label_overrides" },
        );
      }
      seenTargets.add(matchedLabel);
      resolved[matchedLabel] = String(displayValue);
    }
    return resolved;
  }

  function deadlineMsForSpec(workspace, effectiveOptions) {
    if (workspace === "time" && effectiveOptions?.time?.age_minimum === 0 && effectiveOptions?.time?.age_maximum == null) {
      return 1800000;
    }
    if (workspace === "cloud") return 1800000;
    return 600000;
  }

  function applyCladeHierarchy(target, nodeId, entry, prefix, hierarchyApi) {
    const barStyle = hierarchyApi.normalizeBarStyle(entry?.bar_style, `${prefix}.bar_style`);
    const tier = hierarchyApi.normalizeTier(entry?.tier, `${prefix}.tier`);
    target.cladeBarStyles.set(nodeId, barStyle);
    if (tier === null) target.cladeTiers.delete(nodeId);
    else target.cladeTiers.set(nodeId, tier);
  }

  function serializeCladeHierarchy(source, nodeId) {
    return {
      bar_style: source.cladeBarStyles?.get(nodeId) || "auto",
      ...(source.cladeTiers?.has(nodeId) ? { tier: source.cladeTiers.get(nodeId) } : {}),
    };
  }

  return Object.freeze({
    rawDescendantTipLabels,
    resolveTipLabelOverrides,
    deadlineMsForSpec,
    applyCladeHierarchy,
    serializeCladeHierarchy,
  });
});
