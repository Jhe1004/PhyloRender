/* Shared display-only sibling ordering and visible-row policy. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderTreeOrder=api;})(globalThis,function(){
"use strict";

const DIRECTIONS = new Set(["file", "small-top", "large-top"]);

function children(node) { return node?.children || []; }

function tipNodes(root) {
  const result = [];
  (function visit(node) {
    if (!node) return;
    if (!children(node).length) { result.push(node); return; }
    children(node).forEach(visit);
  })(root);
  return result;
}

function validateDirection(direction) {
  if (!DIRECTIONS.has(direction)) throw new Error("Unknown ladderization order");
}

function nodeMetrics(root, tipKey) {
  const metrics = new Map();
  (function visit(node) {
    const nested = children(node).map(visit);
    const value = nested.length
      ? {count: nested.reduce((sum, item) => sum + item.count, 0), first: nested.map(item => item.first).sort()[0]}
      : {count: 1, first: tipKey(node.label)};
    metrics.set(node, value);
    return value;
  })(root);
  return metrics;
}

function sortedChildren(node, direction, metrics) {
  const list = children(node);
  if (direction === "file" || list.length < 2) return list;
  return [...list].sort((a, b) => {
    const left = metrics.get(a), right = metrics.get(b);
    const countDifference = direction === "large-top" ? right.count - left.count : left.count - right.count;
    return countDifference || left.first.localeCompare(right.first);
  });
}

function orderedTips(root, direction = "file", {tipKey = label => String(label ?? "").trim().toLowerCase()} = {}) {
  validateDirection(direction);
  const metrics = nodeMetrics(root, tipKey), result = [];
  (function visit(node) {
    if (!children(node).length) { result.push(node); return; }
    sortedChildren(node, direction, metrics).forEach(visit);
  })(root);
  return result;
}

function ladderize(root, direction = "file", {tipKey = label => String(label ?? "").trim().toLowerCase()} = {}) {
  validateDirection(direction);
  if (!root || direction === "file" || root.printOrderLocked) return root;
  const metrics = nodeMetrics(root, tipKey);
  (function visit(node) {
    children(node).forEach(visit);
    if (!node.printOrderLocked && children(node).length > 1) node.children = sortedChildren(node, direction, metrics);
  })(root);
  return root;
}

function visibleTipRows(roots, {parallel = false} = {}) {
  const lists = (roots || []).filter(Boolean).map(tipNodes);
  const counts = lists.map(list => list.length);
  return {tips: lists.flat(), counts,
    rowCount: counts.length ? (parallel ? Math.max(...counts) : counts.reduce((sum, count) => sum + count, 0)) : 0};
}

return Object.freeze({tipNodes, orderedTips, ladderize, visibleTipRows});
});
