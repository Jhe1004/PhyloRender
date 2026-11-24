/* Stage 82: explicit module boundary; browser and Node share this implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderTreeGeometry=api;})(globalThis,function(){
"use strict";
const ASTRAL_DISPLAY_TERMINAL_LENGTH = 1;
const ASTRAL_DISPLAY_ROOT_INGROUP_LENGTH = 1;
const ZERO_BRANCH_EPSILON = 1e-12;

function tipCount(node) {
  if (!node.children.length) return 1;
  return node.children.reduce((sum, child) => sum + tipCount(child), 0);
}

function branchLengthDisplayProfile(root) {
  const profile = {
    internal_positive: 0,
    internal_zero: 0,
    internal_missing: 0,
    terminal_positive: 0,
    terminal_zero: 0,
    terminal_missing: 0,
    terminal_total: 0,
    auto_terminal_length_applied: false,
    display_terminal_length: null,
    auto_root_ingroup_gap_applied: false,
    display_root_ingroup_length: null,
    display_only: false,
    source_tree_unchanged: true,
    scale_bar_suppressed: false,
    reason: null,
  };
  (function visit(node, isRoot = true) {
    if (!isRoot) {
      const terminal = node.children.length === 0;
      const value = Number(node.length);
      const missing = node.length === null || !Number.isFinite(value);
      const zero = !missing && Math.abs(value) <= ZERO_BRANCH_EPSILON;
      const bucket = terminal ? "terminal" : "internal";
      if (terminal) profile.terminal_total++;
      if (missing) profile[`${bucket}_missing`]++;
      else if (zero) profile[`${bucket}_zero`]++;
      else if (value > ZERO_BRANCH_EPSILON) profile[`${bucket}_positive`]++;
    }
    node.children.forEach(child => visit(child, false));
  })(root);
  const allTerminalLengthsNonInformative = profile.terminal_total > 0
    && profile.terminal_positive === 0
    && profile.terminal_zero + profile.terminal_missing === profile.terminal_total;
  if (profile.internal_positive > 0 && allTerminalLengthsNonInformative) {
    profile.auto_terminal_length_applied = true;
    profile.display_terminal_length = ASTRAL_DISPLAY_TERMINAL_LENGTH;
    profile.display_only = true;
    profile.scale_bar_suppressed = true;
    profile.reason = "positive_internal_lengths_with_all_terminal_lengths_missing_or_zero";
    const rootChildren = root.children || [];
    const rootTip = rootChildren.find(child => child.children.length === 0);
    const rootIngroup = rootChildren.find(child => child.children.length > 0);
    // A zero-length ingroup stem beside a single-tip outgroup otherwise draws
    // directly on top of the root connector. Its support annotation is
    // independent of branch length and must not suppress the visible stem.
    // Separate it only in display coordinates; preserve source support,
    // lengths and topology.
    if (rootChildren.length === 2 && rootTip && rootIngroup
      && (rootIngroup.length === null || Math.abs(rootIngroup.length) <= ZERO_BRANCH_EPSILON)) {
      profile.auto_root_ingroup_gap_applied = true;
      profile.display_root_ingroup_length = ASTRAL_DISPLAY_ROOT_INGROUP_LENGTH;
    }
  }
  return profile;
}

function treeStats(root) {
  let tips = 0, supports = 0, maxDepth = 0, maxDistance = 0, hasLengths = false;
  const branchLengthDisplay = branchLengthDisplayProfile(root);
  function visit(node, depth, distance) {
    node.depth = depth;
    node.distance = distance;
    maxDepth = Math.max(maxDepth, depth);
    maxDistance = Math.max(maxDistance, distance);
    if (!node.children.length) tips++;
    if (node.support !== null) supports++;
    if (node.length !== null) hasLengths = true;
    node.children.forEach(child => {
      const displayStep = branchLengthDisplay.auto_terminal_length_applied && child.children.length === 0
        ? branchLengthDisplay.display_terminal_length
        : node === root && branchLengthDisplay.auto_root_ingroup_gap_applied && child.children.length > 0
          ? branchLengthDisplay.display_root_ingroup_length
        : (child.length ?? 1);
      visit(child, depth + 1, distance + displayStep);
    });
  }
  visit(root, 0, 0);
  return { tips, supports, maxDepth, maxDistance, hasLengths, branchLengthDisplay };
}

function assignCoordinates(root, mode, left, top, plotWidth, spacing, stats) {
  let tipPosition = 0;
  const denominator = mode === "phylogram" ? (stats.maxDistance || 1) : (stats.maxDepth || 1);
  function visit(node) {
    const xValue = mode === "phylogram" ? node.distance : node.depth;
    node.x = mode === "aligned" && !node.children.length
      ? left + plotWidth
      : left + (xValue / denominator) * plotWidth;
    node.children.forEach(visit);
    if (!node.children.length) {
      tipPosition += Math.max(0, Number(node.panelGapBeforeRows) || 0);
      node.y = top + tipPosition * spacing;
      tipPosition += 1;
    }
    else node.y = node.children.reduce((sum, child) => sum + child.y, 0) / node.children.length;
  }
  visit(root);
}

function treeTimeDiagnostics(root) {
  const distances = [];
  let hasAllLengths = true;
  function visit(node, distance = 0, isRoot = true) {
    if (!isRoot && node.length === null) hasAllLengths = false;
    const nextDistance = distance + (isRoot ? 0 : (node.length ?? 0));
    if (!node.children.length) distances.push(nextDistance);
    else node.children.forEach(child => visit(child, nextDistance, false));
  }
  visit(root);
  const min = Math.min(...distances), max = Math.max(...distances);
  const relativeSpread = max > 0 ? (max - min) / max : Infinity;
  return { hasAllLengths, min, max, relativeSpread, ultrametric: hasAllLengths && relativeSpread <= 1e-4 };
}

function countDescendantTips(node) {
  if (!node.children.length) return 1;
  return node.children.reduce((sum, child) => sum + countDescendantTips(child), 0);
}

function rootAdjacentSupportlessNodeIds(root) {
  const ids = new Set();
  if (!root?.children?.length) return ids;
  ids.add(root.id);

  const markedIngroup = root.ingroupChildId
    ? root.children.find(child => child.id === root.ingroupChildId)
    : null;
  if (markedIngroup?.children.length) {
    ids.add(markedIngroup.id);
    return ids;
  }

  const children = root.children.map(child => ({ node: child, tips: countDescendantTips(child) }));
  const total = children.reduce((sum, child) => sum + child.tips, 0);
  const larger = children.reduce((best, child) => child.tips > best.tips ? child : best, children[0]);
  const outsideLarger = total - larger.tips;
  if (larger.node.children.length && outsideLarger <= Math.max(1, total * 0.25)) {
    ids.add(larger.node.id);
  }
  return ids;
}

function conflictTreeDepth(root) {
  function visit(node, depth) {
    if (!(node.children || []).length) return depth;
    return Math.max(...node.children.map(child => visit(child, depth + 1)));
  }
  return Math.max(1, visit(root, 0));
}

function conflictTreeLayout(root, { rootX, tipX, top, rowGap }) {
  const positions = new Map();
  const tips = [];
  const maxDepth = conflictTreeDepth(root);
  let tipIndex = 0;
  function visit(node, depth) {
    const children = node.children || [];
    if (!children.length) {
      const position = { x: tipX, y: top + tipIndex * rowGap, depth, tip: true, node };
      tipIndex += 1;
      tips.push(position);
      positions.set(node, position);
      return position;
    }
    const childPositions = children.map(child => visit(child, depth + 1));
    const fraction = depth / maxDepth;
    const position = {
      x: rootX + (tipX - rootX) * fraction,
      y: childPositions.reduce((sum, item) => sum + item.y, 0) / childPositions.length,
      depth,
      tip: false,
      node,
    };
    positions.set(node, position);
    return position;
  }
  visit(root, 0);
  return { positions, tips };
}

function branchLengthSummary(root) {
  const lengths = [];
  let missing = 0;
  const display = branchLengthDisplayProfile(root);
  (function visit(node, isRoot = true) {
    if (!isRoot && (node.length === null || !Number.isFinite(Number(node.length)))) missing++;
    else if (!isRoot) lengths.push(Number(node.length));
    node.children.forEach(child => visit(child, false));
  }(root));
  return {
    present: lengths.length, missing,
    minimum: lengths.length ? Math.min(...lengths) : null,
    maximum: lengths.length ? Math.max(...lengths) : null,
    internal: { positive: display.internal_positive, zero: display.internal_zero, missing: display.internal_missing },
    terminal: { total: display.terminal_total, positive: display.terminal_positive,
      zero: display.terminal_zero, missing: display.terminal_missing },
    display_recommendation: { auto_equal_terminal_length: display.auto_terminal_length_applied,
      terminal_length: display.display_terminal_length, display_only: display.display_only,
      source_tree_unchanged: true, scale_bar_should_be_suppressed: display.scale_bar_suppressed,
      reason: display.reason },
  };
}
return Object.freeze({tipCount,branchLengthDisplayProfile,branchLengthSummary,treeStats,assignCoordinates,treeTimeDiagnostics,countDescendantTips,rootAdjacentSupportlessNodeIds,conflictTreeDepth,conflictTreeLayout});
});
