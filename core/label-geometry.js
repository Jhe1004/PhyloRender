/* Stage 82: explicit module boundary; browser and Node share this implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderLabelGeometry=api;})(globalThis,function(){
"use strict";
const MIN_NODE_ARROW_AXIS_ANGLE = 20;
const MAX_NODE_ARROW_AXIS_ANGLE = 80;
const PREFERRED_NODE_ARROW_AXIS_ANGLE = 45;
const MIN_NODE_ARROW_LENGTH = 14;
const NODE_ARROW_LENGTH_TOLERANCE = 0.1;
const NODE_ARROW_ANGLE_TOLERANCE = 0.25;
const NODE_ARROW_HEAD_LENGTH = 1.8;
const NODE_ARROW_HEAD_HALF_WIDTH = .85;
const MAX_TIME_AGE_EDGE_DISTANCE = 120;
const MAX_TIME_AGE_LEADER_LENGTH = 150;
const MIN_TIME_AGE_LEADER_TRIGGER_DISTANCE = 18;
const MAX_PHYLOGENY_LABEL_EDGE_DISTANCE = 36;
const MAX_PHYLOGENY_LABEL_FALLBACK_EDGE_DISTANCE = 84;
const MAX_PHYLOGENY_LABEL_LEADER_LENGTH = 96;
const MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE = 96;

function rectsOverlap(a, b, pad = 1) {
  return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
}

function segmentIntersectsRect(seg, rect, pad = 1) {
  const r = { x: rect.x - pad, y: rect.y - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad };
  const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
  const minY = Math.min(seg.y1, seg.y2), maxY = Math.max(seg.y1, seg.y2);
  if (maxX < r.x || minX > r.x + r.width || maxY < r.y || minY > r.y + r.height) return false;
  if (seg.y1 === seg.y2) return seg.y1 >= r.y && seg.y1 <= r.y + r.height;
  if (seg.x1 === seg.x2) return seg.x1 >= r.x && seg.x1 <= r.x + r.width;
  // Liang–Barsky clipping: a diagonal's bounding box is not the segment.
  // The previous shortcut falsely reported labels beside oblique pointers.
  let enter = 0, leave = 1;
  const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
  for (const [p, q] of [[-dx, seg.x1 - r.x], [dx, r.x + r.width - seg.x1], [-dy, seg.y1 - r.y], [dy, r.y + r.height - seg.y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t); else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return true;
}

function supportRectCrossesBranch(rect, segments, pad = 3) {
  return segments.some(seg => segmentIntersectsRect(seg, rect, pad));
}

function clampRectToBounds(rect, bounds, pad = 4) {
  const left = (bounds.labelLeft ?? bounds.left) + pad;
  const right = bounds.right - pad;
  const top = bounds.top - 2;
  const bottom = bounds.bottom + 2;
  const maxX = Math.max(left, right - rect.width);
  const maxY = Math.max(top, bottom - rect.height);
  return {
    ...rect,
    x: Math.min(Math.max(left, rect.x), maxX),
    y: Math.min(Math.max(top, rect.y), maxY),
  };
}

function nearestBranchFreeRectWithinBounds(rect, segments, bounds, pad = 3, obstacles = []) {
  const initial = clampRectToBounds(rect, bounds);
  const clear = candidate => !supportRectCrossesBranch(candidate, segments, pad)
    && !obstacles.some(other => rectsOverlap(candidate, other, 3));
  if (clear(initial)) return initial;
  const offsets = [{ x: 0, y: 0 }];
  [4, 8, 14, 22, 32, 46, 64, 86, 112].forEach(distance => {
    offsets.push(
      { x: distance, y: 0 }, { x: -distance, y: 0 },
      { x: 0, y: distance }, { x: 0, y: -distance },
      { x: distance, y: distance }, { x: distance, y: -distance },
      { x: -distance, y: distance }, { x: -distance, y: -distance },
    );
  });
  const seen = new Set();
  for (const offset of offsets) {
    const candidate = clampRectToBounds({ ...initial, x: initial.x + offset.x, y: initial.y + offset.y }, bounds);
    const key = `${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (clear(candidate)) return candidate;
  }
  return initial;
}

function routeSegments(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < .25) continue;
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return segments;
}

function segmentIntersection(a, b) {
  const epsilon = 1e-6;
  const p = { x: a.x1, y: a.y1 };
  const r = { x: a.x2 - a.x1, y: a.y2 - a.y1 };
  const q = { x: b.x1, y: b.y1 };
  const s = { x: b.x2 - b.x1, y: b.y2 - b.y1 };
  const cross = (u, v) => u.x * v.y - u.y * v.x;
  const dot = (u, v) => u.x * v.x + u.y * v.y;
  const qmp = { x: q.x - p.x, y: q.y - p.y };
  const rxs = cross(r, s);
  const qmpxr = cross(qmp, r);

  if (Math.abs(rxs) < epsilon && Math.abs(qmpxr) < epsilon) {
    const rr = dot(r, r);
    if (rr < epsilon) return null;
    const t0 = dot(qmp, r) / rr;
    const t1 = t0 + dot(s, r) / rr;
    const start = Math.max(0, Math.min(t0, t1));
    const end = Math.min(1, Math.max(t0, t1));
    if (end < start - epsilon) return null;
    const startPoint = { x: p.x + start * r.x, y: p.y + start * r.y };
    const endPoint = { x: p.x + end * r.x, y: p.y + end * r.y };
    return { type: end - start > epsilon ? "overlap" : "point", startPoint, endPoint };
  }
  if (Math.abs(rxs) < epsilon) return null;

  const t = cross(qmp, s) / rxs;
  const u = cross(qmp, r) / rxs;
  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return null;
  const point = { x: p.x + t * r.x, y: p.y + t * r.y };
  return { type: "point", startPoint: point, endPoint: point };
}

function leaderSegmentConflictsWithBranch(leaderSegment, branch, origin) {
  const hit = segmentIntersection(leaderSegment, branch);
  if (!hit) return false;
  const distanceFromOrigin = point => Math.hypot(point.x - origin.x, point.y - origin.y);
  if (hit.type === "point" && distanceFromOrigin(hit.startPoint) <= .75) return false;
  if (hit.type === "overlap" && Math.max(distanceFromOrigin(hit.startPoint), distanceFromOrigin(hit.endPoint)) <= .75) return false;
  return true;
}

function leaderCrossingPairs(segments) {
  const pairs = [];
  segments.forEach((a, index) => segments.slice(index + 1).forEach(b => {
    if (a.labelId !== b.labelId && segmentIntersection(a, b)) pairs.push([a.labelId, b.labelId]);
  }));
  return pairs;
}

function leaderGeometry(node, rect) {
  const origin = { x: node.x, y: node.y };
  const target = {
    x: Math.max(rect.x, Math.min(node.x, rect.x + rect.width)),
    y: Math.max(rect.y, Math.min(node.y, rect.y + rect.height)),
  };
  return { origin, target, edgeDistance: Math.hypot(target.x - origin.x, target.y - origin.y) };
}

function nodeArrowGeometryExcess(angle, length) {
  return Math.max(0, MIN_NODE_ARROW_AXIS_ANGLE - NODE_ARROW_ANGLE_TOLERANCE - angle)
    + Math.max(0, angle - MAX_NODE_ARROW_AXIS_ANGLE - NODE_ARROW_ANGLE_TOLERANCE)
    + Math.max(0, MIN_NODE_ARROW_LENGTH - NODE_ARROW_LENGTH_TOLERANCE - length);
}

function nodeArrowGeometryReason(angle, length) {
  const reasons = [];
  if (angle < MIN_NODE_ARROW_AXIS_ANGLE - NODE_ARROW_ANGLE_TOLERANCE
    || angle > MAX_NODE_ARROW_AXIS_ANGLE + NODE_ARROW_ANGLE_TOLERANCE) {
    reasons.push(`Leader angle ${angle.toFixed(1)}° (target 20°–80°)`);
  }
  if (length < MIN_NODE_ARROW_LENGTH - NODE_ARROW_LENGTH_TOLERANCE) {
    reasons.push(`Leader length ${length.toFixed(2)} u (target >= 14 u)`);
  }
  return reasons.join("; ");
}

function nodeArrowAxisAngle(origin, target) {
  const dx = Math.abs(target.x - origin.x);
  const dy = Math.abs(target.y - origin.y);
  if (Math.max(dx, dy) <= .25) return 0;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function nodeArrowAnglePreferenceCost(plan) {
  if (!plan || plan.length <= .25 || !Number.isFinite(plan.axisAngle)) return 0;
  const deviationUnits = Math.abs(plan.axisAngle - PREFERRED_NODE_ARROW_AXIS_ANGLE) / 15;
  return 6 * deviationUnits * deviationUnits;
}

function leaderTargetCandidates(origin, rect) {
  // Attach beside the visible digits, not at a typographic box corner.
  // Satisfy slope/length by moving the label, never by faking this attachment.
  const middleY = rect.y + rect.height / 2;
  if (origin.x <= rect.x || origin.x >= rect.x + rect.width) {
    const x = origin.x <= rect.x ? rect.x - 1 : rect.x + rect.width + 1;
    return [0, -.12, .12].map(offset => ({ x, y: middleY + rect.height * offset }));
  }
  return [{ x: Math.max(rect.x, Math.min(rect.x + rect.width, origin.x)),
    y: origin.y < middleY ? rect.y - 1 : rect.y + rect.height + 1 }];
}

function leaderBranchCrossingCount(points, branches, origin) {
  const segments = routeSegments(points);
  return branches.filter(branch => segments.some(seg => leaderSegmentConflictsWithBranch(seg, branch, origin))).length;
}

function pointToSegmentDistance(point, segment) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return Math.hypot(point.x - segment.x1, point.y - segment.y1);
  const t = Math.max(0, Math.min(1,
    ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
  return Math.hypot(point.x - (segment.x1 + t * dx), point.y - (segment.y1 + t * dy));
}

function leaderNodeCrossingCount(points, nodePoints, origin, clearance) {
  const segments = routeSegments(points);
  return nodePoints.filter(point => {
    // The line is supposed to end at its own node marker.
    if (Math.hypot(point.x - origin.x, point.y - origin.y) <= .75) return false;
    return segments.some(segment => pointToSegmentDistance(point, segment) <= clearance);
  }).length;
}

function leaderPlanPriority(plan) {
  // Ink and pointer/ink intersections are not legal placements. Every other
  // visual compromise uses the same finite scale as font and distance costs.
  if (plan.obstacleHits) return Infinity;
  return leaderVisualCost(plan) + plan.anglePenalty;
}

function leaderVisualCost(plan) {
  const units = Math.max(0, plan.length) / MIN_NODE_ARROW_LENGTH;
  // A 70-unit pointer and a reduction toward the seven-point floor have
  // comparable costs. Crossing a node is expensive, but cannot silently
  // dominate every readable-font alternative by eight orders of magnitude.
  const excess = Math.max(0, units - 2);
  return (plan.nodeHits || 0) * 2800 + (plan.leaderHits || 0) * 650
    + (plan.crossings || 0) * 180
    + 10 * units + 10 * units * units + 300 * excess * excess
    + nodeArrowAnglePreferenceCost(plan);
}

function nodeGlyphScale(text) {
  return String(text || "").trim() === "*" ? 1.38 : 1;
}

function nodeLabelFontCost(font, preferred, minimum) {
  if (!Number.isFinite(font) || font < minimum - 1e-7) return Infinity;
  const units = Math.max(0, 1 - font / preferred) / .05;
  return 20 * units + 25 * units * units;
}

function profileHasBranchLengths(display) {
  if (!display || typeof display !== "object") return false;
  return (Number(display.internal_positive) || 0) + (Number(display.internal_zero) || 0)
    + (Number(display.terminal_positive) || 0) + (Number(display.terminal_zero) || 0) > 0;
}

function shouldUseNodeLeaderLines(requestedArrows, {
  workspaceMode = "phylogeny", layoutMode = "phylogram", hasBranchLengths = true,
} = {}) {
  if (!requestedArrows) return false;
  if (workspaceMode === "time") return true;
  if (workspaceMode === "phylogeny") return layoutMode === "phylogram" && Boolean(hasBranchLengths);
  return false;
}

function directNodeLabelPenalty(node, rect, preferredSide = -1) {
  const onPreferred = preferredSide < 0 ? rect.x + rect.width <= node.x + .5 : rect.x >= node.x - .5;
  const onOpposite = preferredSide < 0 ? rect.x >= node.x - .5 : rect.x + rect.width <= node.x + .5;
  const above = rect.y + rect.height <= node.y + .5;
  const below = rect.y >= node.y - .5;
  if (onPreferred && above) return 0;
  if (onPreferred && below) return .6;
  if (onOpposite && Math.abs(rect.y + rect.height / 2 - node.y) <= 2.5) return 1.2;
  if (onOpposite && (above || below)) return 2.4;
  return 18;
}

function nodeLabelPlacementCost(font, preferred, minimum, plan, {
  distance = 0, sidePenalty = 0, positionPenalty = 0, arrows = true,
} = {}) {
  const typography = nodeLabelFontCost(font, preferred, minimum);
  if (!Number.isFinite(typography)) return Infinity;
  const tightDrift = Math.max(0, distance - 8.5);
  const routing = arrows
    ? leaderPlanPriority(plan)
    : distance * 2 + tightDrift * tightDrift * 6 + (plan?.crossings || 0) * 400 + (plan?.nodeHits || 0) * 800;
  return typography + routing + sidePenalty + positionPenalty;
}

function leaderRouteForPlacement(
  node, rect, branches, obstacles = [], existingLeaderSegments = [], nodePoints = [], nodeRadius = 5,
) {
  const { origin, edgeDistance } = leaderGeometry(node, rect);
  if (edgeDistance <= .25) return {
    points: null, crossings: 0, obstacleHits: 0, leaderHits: 0, nodeHits: 0, length: edgeDistance,
    axisAngle: 0, anglePenalty: Infinity, sufficientlyAngled: false,
  };
  // Every rendered node value has one straight dashed pointer. Compare only
  // central text-edge attachments; do not shift into descender space or a
  // distant corner merely to force an angle against orthogonal branches.
  // Every candidate shaft lies inside this envelope. Broad-phase rejection
  // avoids rechecking the entire tree for each edge target, without changing
  // any exact intersection result (the extra padding covers text clearance).
  const left = Math.min(origin.x, rect.x) - 4, right = Math.max(origin.x, rect.x + rect.width) + 4;
  const top = Math.min(origin.y, rect.y) - 4, bottom = Math.max(origin.y, rect.y + rect.height) + 4;
  const nearbySegment = segment => Math.max(segment.x1, segment.x2) >= left
    && Math.min(segment.x1, segment.x2) <= right
    && Math.max(segment.y1, segment.y2) >= top && Math.min(segment.y1, segment.y2) <= bottom;
  const nearbyBranches = branches.filter(nearbySegment);
  const nearbyLeaders = existingLeaderSegments.filter(nearbySegment);
  const nearbyObstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width >= left
    && obstacle.x <= right && obstacle.y + obstacle.height >= top && obstacle.y <= bottom);
  const nodeClearance = Math.max(2.4, Number(nodeRadius) || 5) + 1.5;
  const nearbyNodes = nodePoints.filter(point => point.x >= left - nodeClearance
    && point.x <= right + nodeClearance && point.y >= top - nodeClearance
    && point.y <= bottom + nodeClearance);
  let best = null;
  leaderTargetCandidates(origin, rect).forEach(target => {
    const points = [origin, target];
    const segments = routeSegments(points);
    const crossings = leaderBranchCrossingCount(points, nearbyBranches, origin);
    const obstacleHits = nearbyObstacles.filter(obstacle => segments.some(seg => segmentIntersectsRect(seg, obstacle, 1.5))).length;
    const leaderHits = nearbyLeaders.filter(existing =>
      segments.some(seg => segmentIntersection(seg, existing))
    ).length;
    const nodeHits = leaderNodeCrossingCount(points, nearbyNodes, origin, nodeClearance);
    const length = Math.hypot(target.x - origin.x, target.y - origin.y);
    const axisAngle = nodeArrowAxisAngle(origin, target);
    const anglePenalty = nodeArrowGeometryExcess(axisAngle, length) * 100;
    const candidate = {
      points, crossings, obstacleHits, leaderHits, nodeHits, length, axisAngle, anglePenalty,
      sufficientlyAngled: axisAngle >= MIN_NODE_ARROW_AXIS_ANGLE - NODE_ARROW_ANGLE_TOLERANCE
        && axisAngle <= MAX_NODE_ARROW_AXIS_ANGLE + NODE_ARROW_ANGLE_TOLERANCE,
    };
    candidate.score = leaderPlanPriority(candidate);
    if (!best || candidate.score < best.score) best = candidate;
  });
  return best || {
    points: null, crossings: 0, obstacleHits: 0, leaderHits: 0, nodeHits: 0, length: edgeDistance,
    axisAngle: 0, anglePenalty: 0, sufficientlyAngled: false,
  };
}

function nodeArrowHeadPath(origin, target, length = NODE_ARROW_HEAD_LENGTH, halfWidth = NODE_ARROW_HEAD_HALF_WIDTH) {
  const dx = origin.x - target.x;
  const dy = origin.y - target.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= .25) return "";
  const ux = dx / distance;
  const uy = dy / distance;
  const actualLength = Math.min(length, Math.max(.8, distance * .42));
  const baseX = origin.x - ux * actualLength;
  const baseY = origin.y - uy * actualLength;
  const px = -uy * halfWidth;
  const py = ux * halfWidth;
  return `M ${baseX + px} ${baseY + py} L ${origin.x} ${origin.y} L ${baseX - px} ${baseY - py}`;
}

function timeAgeMaximumEdgeDistance(width, height) {
  // Font size must not change which distance bands are searchable.
  return MAX_TIME_AGE_EDGE_DISTANCE;
}

function timeAgeLeaderTriggerDistance(rect) {
  // A small vertical offset is normally needed to keep a time value off the
  // horizontal branch that enters its node. Treat anything within roughly one
  // rendered line height as locally adjacent instead of adding a tiny leader.
  return Math.max(MIN_TIME_AGE_LEADER_TRIGGER_DISTANCE, Math.min(30, rect.height + 4));
}

function timeAgeCandidatePlacements(node, width, height, bounds, branches = []) {
  // Use the ordinary-tree search and distance bands. Dating only adds its
  // plot boundary, so age labels cannot enter the sample-name/time-axis area.
  return candidatePlacements(node, width, height, 192, branches,
    { width: bounds.right, height: bounds.bottom + 6 })
    .map(candidate => ({ ...candidate, width, height }))
    .filter(rect => rect.y >= bounds.top - 2 && rect.y + height <= bounds.bottom + 2
      && rect.x >= (bounds.labelLeft ?? 0) + 4);
}

function readableFontSizes(preferred, minimum) {
  const sizes = [];
  for (let font = preferred; font > minimum + 1e-7; font -= 1) sizes.push(font);
  sizes.push(minimum);
  return sizes;
}

function candidatePlacements(node, width, height, maximumEdgeDistance = MAX_PHYLOGENY_LABEL_EDGE_DISTANCE, branches = [], canvasSize, options = null) {
  const tightMode = Boolean(options && options.arrows === false);
  const tightRadius = tightMode ? Math.max(3, Number(options.nodeRadius) || 5) : 0;
  const tightMinDistance = tightMode ? tightRadius + 1 : 0;
  const placements = [];
  let rank = 0;
  const add = (x, y, position, preference) => {
    const rect = { x, y, width, height };
    if (x < 4 || y < 4
      || x + width > canvasSize.width - 4
      || y + height > canvasSize.height - 4) return;
    const edgeDistance = leaderGeometry(node, rect).edgeDistance;
    if (edgeDistance > maximumEdgeDistance || (tightMode && edgeDistance <= tightMinDistance)) return;
    placements.push({ x, y, anchor: "start", position, preference: tightMode ? (preference ?? 4) : 0, rank: rank++, edgeDistance });
  };
  const gap = 4;
  let tightSideGap = 0;
  if (tightMode) {
    const cornerGap = Math.max(4.5, (tightRadius + 1.2) / Math.SQRT2);
    const tightBranchGap = 3.15;
    const tightCornerY = Math.max(4.5, Math.sqrt(Math.max(0, (tightMinDistance + .25) ** 2 - tightBranchGap ** 2)));
    tightSideGap = Math.max(4.5, tightRadius + 1.5);
    add(node.x - width - cornerGap, node.y - height - cornerGap, "left-top", 0);
    add(node.x - width - tightBranchGap, node.y - height - tightCornerY, "left-top", .1);
    add(node.x - width - cornerGap, node.y + cornerGap, "left-bottom", .6);
    add(node.x - width - tightBranchGap, node.y + tightCornerY, "left-bottom", .7);
    add(node.x + tightSideGap, node.y - height / 2, "right-center", 1.2);
    add(node.x + cornerGap, node.y - height - cornerGap, "right-top", 1.8);
    add(node.x + tightBranchGap, node.y - height - tightCornerY, "right-top", 1.9);
    add(node.x + cornerGap, node.y + cornerGap, "right-bottom", 2);
    add(node.x + tightBranchGap, node.y + tightCornerY, "right-bottom", 2.1);
    add(node.x - width - tightSideGap, node.y - height / 2, "left-center", 1.2);
  }

  // Preferred order: directly left, lower-left, upper-left, directly right,
  // then the two right-hand corners. Wider rings preserve the same priority.
  add(node.x - width - gap, node.y - height / 2, "left-center", 0);
  add(node.x - width - gap, node.y + gap, "left-bottom", 1);
  add(node.x - width - gap, node.y - height - gap, "left-top", 2);
  add(node.x + gap, node.y - height / 2, "right-center", 3);
  add(node.x + gap, node.y - height - gap, "right-top", 4);
  add(node.x + gap, node.y + gap, "right-bottom", 4.2);

  // Search only within a node-local envelope. When it is crowded, keep the
  // configured readable minimum and use a clear leader instead of shrinking
  // the text below the user's minimum.
  [8, 12, 18, 26, 34, 42, 50, 58, 68, 76, 84, 92, 96, 112, 136, 160, 192, 240, 288, 320]
    .filter(distance => distance <= maximumEdgeDistance).forEach(distance => {
    add(node.x - width - distance, node.y - height / 2, "left-center", 0);
    add(node.x - width - distance, node.y + distance, "left-bottom", 1);
    add(node.x - width - distance, node.y - height - distance, "left-top", 2);
    add(node.x + distance, node.y - height / 2, "right-center", 3);
    add(node.x + distance, node.y - height - distance, "right-top", 4);
    add(node.x + distance, node.y + distance, "right-bottom", 4.2);
    add(node.x - width / 2, node.y - height - distance, "center-top", 5);
    add(node.x - width / 2, node.y + distance, "center-bottom", 5.2);
    add(node.x - width - gap, node.y - height / 2 + distance, "left-near-bottom", 1.15);
    add(node.x - width - gap, node.y - height / 2 - distance, "left-near-top", 2.15);
    add(node.x + gap, node.y - height / 2 + distance, "right-near-bottom", 4.25);
    add(node.x + gap, node.y - height / 2 - distance, "right-near-top", 4.15);
  });
  // Horizontal and vertical offsets are independent: diagonal rings alone
  // miss wide, shallow spaces between two horizontal branches.
  const offsetsX = [8, 12, 20, 32, 48, 72].filter(d => d <= maximumEdgeDistance);
  for (const dx of offsetsX) for (const dy of [4, 8, 10, 12, 18, 26, 42]) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      add(sx < 0 ? node.x - width - dx : node.x + dx,
        node.y - height / 2 + sy * dy, "independent-offset", 4);
    }
  }
  // Sample the actual sides of vertical branches too. A narrow corridor can
  // lie between all fixed x offsets; smaller fonts are useless if that slot
  // never enters the candidate pool. Use the branch clearance plus a guard.
  const branchColumns = [...new Set(branches.filter(b => Math.abs(b.x2-b.x1)<.001
    && Math.abs(b.x1-node.x) <= maximumEdgeDistance+width
    && Math.max(b.y1,b.y2) >= node.y-maximumEdgeDistance-height
    && Math.min(b.y1,b.y2) <= node.y+maximumEdgeDistance+height).map(b=>b.x1))]
    .sort((a,b)=>Math.abs(a-node.x)-Math.abs(b-node.x)).slice(0,12).sort((a,b)=>a-b);
  const slots = new Set(offsetsX.flatMap(dx => [node.x-width-dx,node.x+dx]));
  if (tightSideGap > 0 && tightSideGap <= maximumEdgeDistance) {
    slots.add(node.x + tightSideGap); slots.add(node.x - width - tightSideGap);
  }
  for (const x of branchColumns) {
    slots.add(x+3.05); slots.add(x-width-3.05);
  }
  for (let i=0;i+1<branchColumns.length;i++) {
    if (branchColumns[i+1]-branchColumns[i] >= width+6.1) slots.add((branchColumns[i]+branchColumns[i+1]-width)/2);
  }
  for (const x of slots) {
    for (const dy of [8,12,18,26,42,58,76,96]) for (const sy of [-1,1]) {
      add(x,node.y-height/2+sy*dy,"branch-column-gap",4);
    }
    // Include the exact minimum-length boundary: fixed y steps can skip the
    // tiny legal 20–80 degree interval in a narrow vertical corridor.
    const centerTarget = leaderTargetCandidates(node,{x,y:node.y-height/2,width,height})[0];
    const dx = Math.abs(centerTarget.x-node.x);
    const dy = Math.sqrt(Math.max(0,MIN_NODE_ARROW_LENGTH**2-dx**2))+.05;
    for (const sy of [-1,1]) add(x,node.y-height/2+sy*dy,"minimum-leader-gap",4);
  }
  // Sample actual free vertical intervals at each candidate horizontal slot.
  // Final collision/angle checks still use the full geometry and glyph box.
  for (const x of slots) {
    const levels = [...new Set(branches.filter(b => Math.abs(b.y2 - b.y1) < .001
      && Math.max(b.x1, b.x2) >= x - 3 && Math.min(b.x1, b.x2) <= x + width + 3
      && Math.abs(b.y1 - node.y) <= maximumEdgeDistance + height).map(b => b.y1))].sort((a,b) => a-b);
    for (let i = 0; i + 1 < levels.length; i++) {
      const top = levels[i] + 3.25, bottom = levels[i + 1] - height - 3.25;
      if (bottom < top) continue;
      for (const y of [top, bottom, (top + bottom) / 2,
        Math.max(top, Math.min(bottom, node.y - height / 2 - 10)),
        Math.max(top, Math.min(bottom, node.y - height / 2 + 10))]) {
        add(x, y, "branch-gap", 4);
      }
    }
  }
  return placements;
}

function sampleNodeLabelCandidates(node, candidates, width, height, limitPerRegion = 3) {
  const regions = new Map();
  const seen = new Set();
  for (const candidate of candidates) {
    const key = `${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distance = leaderGeometry(node, { ...candidate, width, height }).edgeDistance;
    const band = distance <= 24 ? 0 : distance <= 48 ? 1 : distance <= 96 ? 2 : 3;
    const side = candidate.x + width / 2 < node.x ? "left" : "right";
    const vertical = candidate.y + height < node.y - 2 ? "above"
      : candidate.y > node.y + 2 ? "below" : "level";
    const region = `${band}:${side}:${vertical}`;
    const entries = regions.get(region) || [];
    entries.push({ candidate, distance });
    entries.sort((a, b) => a.distance - b.distance
      || (a.candidate.rank ?? 0) - (b.candidate.rank ?? 0));
    if (entries.length > limitPerRegion) entries.length = limitPerRegion;
    regions.set(region, entries);
  }
  return [...regions.values()].flatMap(entries => entries.map(entry => entry.candidate));
}

function labelBoundaryCandidates(node, width, height, obstacles, maximum) {
  const candidates = [];
  for (const other of obstacles) {
    if (Math.abs(other.y - node.y) > maximum + height) continue;
    for (const dx of [4, 8, 12, 20, 32, 48]) for (const sx of [-1, 1]) {
      const x = sx < 0 ? node.x - width - dx : node.x + dx;
      // Collision checks require 2 units between text boxes. Use a small
      // numerical guard, not the 3-unit clearance required around branches.
      for (const y of [other.y - height - 2.05, other.y + other.height + 2.05]) candidates.push({x, y});
    }
  }
  return candidates;
}

function fineLabelSlotCandidates(ink) {
  const candidates=[];
  for (let dx=-24;dx<=24;dx+=2) for (let dy=-24;dy<=24;dy+=2) {
    candidates.push({x:ink.x+dx,y:ink.y+dy,position:"local-fine-refinement"});
  }
  return candidates;
}

function phylogenyLabelOwnership(node, rect, internalNodePoints = [], arrows = true) {
  const ownerDistance = leaderGeometry(node, rect).edgeDistance;
  let nearestOtherDistance = Infinity;
  let nearestOtherId = null;
  internalNodePoints.forEach(point => {
    if (Math.hypot(point.x - node.x, point.y - node.y) <= .75) return;
    const distance = leaderGeometry(point, rect).edgeDistance;
    if (distance < nearestOtherDistance) {
      nearestOtherDistance = distance;
      nearestOtherId = point.id;
    }
  });
  return {
    ownerDistance,
    nearestOtherDistance,
    nearestOtherId,
    // Proximity is diagnostic, not an ownership veto when a true-node arrow
    // is visible. Without arrows, keep the conservative nearest-node rule.
    unambiguous: nearestOtherDistance + .5 >= ownerDistance,
    acceptable: arrows || nearestOtherDistance + .5 >= ownerDistance,
  };
}

function closestPhylogenyLabelCandidate(
  node,
  width,
  height,
  intended = null,
  internalNodePoints = [],
  obstacles = [],
  leaderSegments = [],
  context,
) {
  const { canvasSize, branches, arrows } = context;
  const candidates = candidatePlacements(node, width, height, MAX_PHYLOGENY_LABEL_FALLBACK_EDGE_DISTANCE, [], canvasSize)
    .filter(candidate => {
      const rect = { ...candidate, width, height };
      return !supportRectCrossesBranch(rect, branches, 3)
        && phylogenyLabelOwnership(node, rect, internalNodePoints, arrows).acceptable;
    });
  if (!candidates.length) return null;
  const target = intended
    ? { x: intended.x + intended.width / 2, y: intended.y + intended.height / 2 }
    : { x: node.x, y: node.y };
  return candidates.sort((a, b) => {
    const collision = candidate => scorePlacement(
      { ...candidate, width, height }, obstacles, branches, node, false, leaderSegments, canvasSize,
    );
    const distance = candidate => Math.hypot(candidate.x + width / 2 - target.x, candidate.y + height / 2 - target.y);
    return collision(a) - collision(b)
      || distance(a) - distance(b) || a.preference - b.preference || a.rank - b.rank;
  })[0];
}

function scorePlacement(rect, obstacles, segments, node, includeBranches = true, leaderSegments = [], canvasSize) {
  let score = 0;
  obstacles.forEach(other => { if (rectsOverlap(rect, other, 2)) score += other.kind === "support" ? 100 : 60; });
  leaderSegments.forEach(segment => {
    if (segmentIntersectsRect(segment, rect, 1.5)) score += 1000;
  });
  if (includeBranches) {
    segments.forEach(seg => {
      // Manual labels still report a strong collision score when placed on a branch.
      if (!segmentIntersectsRect(seg, rect, 3)) return;
      score += 1000;
    });
  }
  if (rect.x < 4 || rect.y < 4 || rect.x + rect.width > canvasSize.width - 4 || rect.y + rect.height > canvasSize.height - 4) score += 200;
  return score;
}
return Object.freeze({rectsOverlap,segmentIntersectsRect,supportRectCrossesBranch,clampRectToBounds,nearestBranchFreeRectWithinBounds,routeSegments,segmentIntersection,leaderSegmentConflictsWithBranch,leaderCrossingPairs,leaderGeometry,nodeArrowGeometryExcess,nodeArrowGeometryReason,nodeArrowAxisAngle,nodeArrowAnglePreferenceCost,leaderTargetCandidates,leaderBranchCrossingCount,pointToSegmentDistance,leaderNodeCrossingCount,leaderPlanPriority,leaderVisualCost,nodeGlyphScale,nodeLabelFontCost,profileHasBranchLengths,shouldUseNodeLeaderLines,directNodeLabelPenalty,nodeLabelPlacementCost,leaderRouteForPlacement,nodeArrowHeadPath,timeAgeMaximumEdgeDistance,timeAgeLeaderTriggerDistance,timeAgeCandidatePlacements,readableFontSizes,candidatePlacements,sampleNodeLabelCandidates,labelBoundaryCandidates,fineLabelSlotCandidates,phylogenyLabelOwnership,closestPhylogenyLabelCandidate,scorePlacement,MIN_NODE_ARROW_AXIS_ANGLE,MAX_NODE_ARROW_AXIS_ANGLE,PREFERRED_NODE_ARROW_AXIS_ANGLE,MIN_NODE_ARROW_LENGTH,NODE_ARROW_LENGTH_TOLERANCE,NODE_ARROW_ANGLE_TOLERANCE,NODE_ARROW_HEAD_LENGTH,NODE_ARROW_HEAD_HALF_WIDTH,MAX_TIME_AGE_EDGE_DISTANCE,MAX_TIME_AGE_LEADER_LENGTH,MIN_TIME_AGE_LEADER_TRIGGER_DISTANCE,MAX_PHYLOGENY_LABEL_EDGE_DISTANCE,MAX_PHYLOGENY_LABEL_FALLBACK_EDGE_DISTANCE,MAX_PHYLOGENY_LABEL_LEADER_LENGTH,MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE});
});
