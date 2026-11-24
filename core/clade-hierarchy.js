/* Pure clade nesting, rank-tier alignment and cap-locked bracket dash geometry; no DOM or global storage. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhyloRenderCladeHierarchy=api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const BAR_STYLES = Object.freeze(["auto", "solid", "dashed", "dash-dot"]);
  const MAX_TIER = 5;
  const MAP_KEYS = Object.freeze([
    "cladeColors", "cladeNames", "cladeNameSegments", "cladeNameOrientations", "cladeBarStyles", "cladeTiers",
  ]);

  function normalizeBarStyle(value, field = "bar_style") {
    if (value === undefined || value === null || value === "") return "auto";
    if (BAR_STYLES.includes(value)) return value;
    throw new Error(`${field} must be "auto", "solid", "dashed", or "dash-dot"`);
  }

  function normalizeTier(value, field = "tier", { allowString = false } = {}) {
    if (value === undefined || value === null || value === "" || value === "auto") return null;
    const parsed = allowString && typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_TIER) {
      throw new Error(`${field} must be an integer between 0 and ${MAX_TIER} or null`);
    }
    return parsed;
  }

  function effectiveStyleForTier(barStyle, effectiveTier) {
    const normalized = normalizeBarStyle(barStyle);
    if (normalized !== "auto") return normalized;
    if (effectiveTier <= 0) return "solid";
    return effectiveTier === 1 ? "dashed" : "dash-dot";
  }

  function bodyDashArray(effectiveBarStyle, length) {
    if (!effectiveBarStyle || effectiveBarStyle === "solid" || !(length > 0)) return null;
    if (effectiveBarStyle === "dashed" || (effectiveBarStyle === "dash-dot" && length < 16)) {
      const count = Math.max(2, Math.round((length + 5.5) / 14));
      const weight = 8.5 * count + 5.5 * (count - 1) - 0.02;
      return `${(8.5 * length / weight).toFixed(3)} ${(5.5 * length / weight).toFixed(3)}`;
    }
    if (effectiveBarStyle === "dash-dot") {
      const cycles = Math.max(1, Math.round((length - 9) / 20.4));
      const scale = length / (9 + 20.4 * cycles - 0.02);
      return `${(9 * scale).toFixed(3)} ${(4.5 * scale).toFixed(3)} ${(2.4 * scale).toFixed(3)} ${(4.5 * scale).toFixed(3)}`;
    }
    return null;
  }

  function descendantTipIds(node) {
    if (!node) return [];
    return node.children?.length ? node.children.flatMap(descendantTipIds) : [node.id];
  }

  function resolveItemsHierarchy(entries) {
    const ordered = entries.map(entry => ({
      ...entry,
      tipSet: new Set(entry.tipIds),
      barStyle: normalizeBarStyle(entry.barStyle),
      requestedTier: normalizeTier(entry.requestedTier),
    })).sort((a, b) => a.tipIds.length - b.tipIds.length);
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      let nestingTier = 0;
      let minContainedTier = 0;
      for (let j = 0; j < i; j++) {
        const inner = ordered[j];
        if (inner.tipIds.length < item.tipIds.length && inner.tipIds.every(id => item.tipSet.has(id))) {
          nestingTier = Math.max(nestingTier, inner.nestingTier + 1);
          minContainedTier = Math.max(minContainedTier, inner.effectiveTier + 1);
        }
      }
      item.nestingTier = nestingTier;
      item.effectiveTier = Math.max(item.requestedTier ?? 0, minContainedTier);
      item.effectiveBarStyle = effectiveStyleForTier(item.barStyle, item.effectiveTier);
    }
    return ordered.map(({ tipSet, ...rest }) => rest);
  }

  const baseNodeId = key => String(key || "").split("::t")[0];
  const cladeKey = (nodeId, tier, map) => !map?.has(nodeId) ? nodeId : `${nodeId}::t${tier ?? map.size}`;

  function resolveTreeHierarchy(rootNode, groups) {
    const map = new Map();
    if (!rootNode || !groups?.cladeColors?.size) return map;
    const byId = new Map();
    (function index(node) { if (!node) return; byId.set(node.id, node); (node.children || []).forEach(index); })(rootNode);
    const raw = [];
    groups.cladeColors.forEach((_, key) => {
      const node = byId.get(baseNodeId(key));
      if (!node) return;
      raw.push({
        nodeId: key, tipIds: descendantTipIds(node),
        barStyle: groups.cladeBarStyles?.get(key) || "auto",
        requestedTier: groups.cladeTiers?.has(key) ? groups.cladeTiers.get(key) : null,
      });
    });
    for (const resolved of resolveItemsHierarchy(raw)) map.set(resolved.nodeId, resolved);
    return map;
  }

  function clearMaps(groups) {
    if (!groups) return;
    for (const key of MAP_KEYS) groups[key]?.clear?.();
  }

  function deleteNode(groups, nodeId) {
    if (!groups) return;
    for (const key of MAP_KEYS) groups[key]?.delete?.(nodeId);
  }

  return Object.freeze({
    BAR_STYLES, MAX_TIER, baseNodeId, cladeKey, normalizeBarStyle, normalizeTier, effectiveStyleForTier,
    bodyDashArray, resolveItemsHierarchy, resolveTreeHierarchy, clearMaps, deleteNode,
  });
});
