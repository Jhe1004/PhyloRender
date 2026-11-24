(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderConflictSupport=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    for(const name of ["svgEl","measureText","appendNodeLabelArrow"])
      if(typeof ports?.[name]!=="function")throw new TypeError("Missing conflict support port: "+name);
    if(!ports?.geometry)throw new TypeError("Missing conflict support dependency: geometry");
    const {svgEl,measureText,appendNodeLabelArrow,geometry}=ports;
    const {candidatePlacements,MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE,readableFontSizes,rectsOverlap,
      segmentIntersectsRect,leaderRouteForPlacement,nodeLabelPlacementCost}=geometry;
function conflictSupportEntries(root, positions, side, annotations) {
  const entries = [];
  (function visit(node, isRoot = false) {
    if (!(node.children || []).length) return;
    if (!isRoot) {
      const annotation = annotations.get(node);
      if (annotation) entries.push({ node, position: positions.get(node), side, annotation });
    }
    node.children.forEach(child => visit(child, false));
  }(root, true));
  return entries;
}


function conflictLayoutNode(entry) {
  const id = `conflict:${entry.side}:${entry.node.id}`;
  return { id, incomingEdgeId: id, x: entry.position.x, y: entry.position.y };
}

function conflictSupportCandidates(entry, text, fontSize, bounds, branches, config) {
  const { width, ascent, descent, height } = measureText(text, fontSize, config.font);
  const layoutNode = conflictLayoutNode(entry);
  const preferredSide = entry.side === "left" ? -1 : 1;
  const seen = new Set();
  const tightMode = config.leaderLines === false;
  const generated = (tightMode
    ? candidatePlacements(layoutNode, width, height, MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE, branches, config.canvasSize, { arrows: false, nodeRadius: config.nodeRadius })
    : candidatePlacements(layoutNode, width, height, MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE, branches, config.canvasSize)
  ).filter(candidate => candidate.x >= bounds.left
    && candidate.x + width <= bounds.right
    && candidate.y >= bounds.top
    && candidate.y + height <= bounds.bottom)
    // The shared generator intentionally reaches the same useful slot from
    // several search passes. Conflict trees test both panels and several font
    // tiers, so remove exact geometric duplicates before the expensive common
    // routing and collision score is evaluated.
    .filter(candidate => {
      const key = `${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Preserve nearby and long-range escape routes without scoring thousands
  // of almost identical slots for every font tier. Sampling each distance
  // band keeps dense-tree rescue positions while preventing a synchronous
  // conflict render from monopolising the page.
  const limits = [96, 80, 72, 64, 48];
  const buckets = [[], [], [], [], []];
  generated.forEach(candidate => {
    const d = candidate.edgeDistance;
    const index = d <= 18 ? 0 : d <= 32 ? 1 : d <= 48 ? 2 : d <= 68 ? 3 : 4;
    buckets[index].push(candidate);
  });
  const sampled = buckets.flatMap((bucket, index) => {
    const limit = limits[index];
    if (bucket.length <= limit) return bucket;
    const headCount = Math.floor(limit / 2);
    const result = bucket.slice(0, headCount);
    const tail = bucket.slice(headCount);
    const remaining = limit - result.length;
    for (let i = 0; i < remaining; i++) {
      result.push(tail[Math.min(tail.length - 1, Math.floor(i * tail.length / remaining))]);
    }
    return result;
  });
  return sampled.map(candidate => {
      const centerX = candidate.x + width / 2;
      const direction = centerX < layoutNode.x ? -1 : 1;
      const rect = {
        ...candidate,
        width,
        height,
        baseline: candidate.y + ascent,
        ascent,
        descent,
      };
      return {
        rect,
        layoutNode,
        sidePenalty: tightMode ? 0 : (direction === preferredSide ? 0 : 18),
        positionPenalty: tightMode && geometry.directNodeLabelPenalty
          ? geometry.directNodeLabelPenalty(layoutNode, rect, preferredSide) : 0,
      };
    });
}

function conflictRectNodeCollisions(rect, nodePoints, currentNodeId, radius) {
  return nodePoints.reduce((count, point) => {
    if (point.id === currentNodeId) return count;
    const circleRect = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 };
    return count + (rectsOverlap(rect, circleRect, 1) ? 1 : 0);
  }, 0);
}

function* layoutConflictSupportSteps(entries, { branches, tipRects, nodePoints, leftBounds, rightBounds }, config) {
  const { preferred, minimum } = config.fonts;
  const fonts = readableFontSizes(preferred, minimum);
  const placed = [];
  const leaderSegments = [];
  let residualCollisions = 0;
  let leaderWarnings = 0;
  let unplacedCount = 0;
  let evaluatedCandidateCount = 0;
  const radius = config.nodeRadius;
  const sorted = [...entries].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  for (const entry of sorted) {
    yield { phase: "labels", current: placed.length, total: sorted.length };
    if (!entry.annotation.text) continue;
    const glyphScale = geometry.nodeGlyphScale ? geometry.nodeGlyphScale(entry.annotation.text) : 1;
    const entryPreferred = preferred * glyphScale, entryMinimum = minimum * glyphScale;
    const entryFonts = glyphScale === 1 ? fonts : readableFontSizes(entryPreferred, entryMinimum);
    const bounds = entry.side === "left" ? leftBounds : rightBounds;
    const preferredMetrics = measureText(entry.annotation.text, entryPreferred, config.font);
    const searchX = MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE + preferredMetrics.width + 8;
    const searchY = MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE + preferredMetrics.height + 8;
    const localBranches = branches.filter(segment => Math.max(segment.x1, segment.x2) >= entry.position.x - searchX
      && Math.min(segment.x1, segment.x2) <= entry.position.x + searchX
      && Math.max(segment.y1, segment.y2) >= entry.position.y - searchY
      && Math.min(segment.y1, segment.y2) <= entry.position.y + searchY);
    const localTipRects = tipRects.filter(rect => rect.x + rect.width >= entry.position.x - searchX
      && rect.x <= entry.position.x + searchX
      && rect.y + rect.height >= entry.position.y - searchY
      && rect.y <= entry.position.y + searchY);
    const localNodePoints = nodePoints.filter(point => point.x >= entry.position.x - searchX
      && point.x <= entry.position.x + searchX
      && point.y >= entry.position.y - searchY
      && point.y <= entry.position.y + searchY);
    const obstacles = [
      ...localTipRects.map(rect => ({ ...rect, kind: "tip" })),
      ...placed.map(item => ({ ...item.rect, kind: "support" })),
    ];
    const candidates = [];
    for (const fontSize of entryFonts) {
      for (const candidate of conflictSupportCandidates(entry, entry.annotation.text, fontSize, bounds, localBranches, config)) {
          yield;
          evaluatedCandidateCount += 1;
          const labelHits = localTipRects.reduce((count, rect) => count + (rectsOverlap(candidate.rect, rect, 2) ? 1 : 0), 0);
          const supportHits = placed.reduce((count, item) => count + (rectsOverlap(candidate.rect, item.rect, 2) ? 1 : 0), 0);
          const branchHits = localBranches.reduce((count, segment) => count + (segmentIntersectsRect(segment, candidate.rect, 3) ? 1 : 0), 0);
          const nodeHits = conflictRectNodeCollisions(candidate.rect, localNodePoints, candidate.layoutNode.id, radius + 1.5);
          const leaderTextHits = leaderSegments.reduce((count, segment) => count
            + (segmentIntersectsRect(segment, candidate.rect, 1.5) ? 1 : 0), 0);
          const physicalCollisionCount = labelHits + supportHits + branchHits + nodeHits + leaderTextHits;
          if (physicalCollisionCount) continue;
          const plan = leaderRouteForPlacement(
            candidate.layoutNode,
            candidate.rect,
            localBranches,
            obstacles,
            leaderSegments,
            localNodePoints,
            config.nodeRadius,
          );
          const score = nodeLabelPlacementCost(fontSize, entryPreferred, entryMinimum, plan, {
            distance: candidate.rect.edgeDistance,
            sidePenalty: candidate.sidePenalty,
            positionPenalty: candidate.positionPenalty || 0,
            arrows: config.leaderLines,
          });
          if (!Number.isFinite(score)) continue;
          candidates.push({
            ...candidate,
            fontSize,
            plan,
            labelHits,
            supportHits,
            branchHits,
            nodeHits,
            leaderTextHits,
            physicalCollisionCount,
            collisionCount: physicalCollisionCount,
            score,
          });
      }
    }
    const chosen = candidates.sort((a, b) => a.score - b.score || b.fontSize - a.fontSize)[0];
    if (!chosen) {
      unplacedCount += 1;
      continue;
    }
    residualCollisions += chosen.physicalCollisionCount;
    const hasLeaderWarning = config.leaderLines && (chosen.plan.obstacleHits
      || chosen.plan.leaderHits || chosen.plan.nodeHits || chosen.plan.anglePenalty > 0);
    if (hasLeaderWarning) leaderWarnings += 1;
    placed.push({ ...entry, ...chosen });
    if (config.leaderLines && chosen.plan.points) {
      const [origin, target] = chosen.plan.points;
      leaderSegments.push({
        x1: origin.x,
        y1: origin.y,
        x2: target.x,
        y2: target.y,
        labelId: chosen.layoutNode.id,
      });
    }
  }
  return {
    placed,
    residualCollisions,
    leaderWarnings,
    unplacedCount,
    evaluatedCandidateCount,
    maximumLeaderLength: Math.max(0, ...placed.map(item => item.plan?.length || 0)),
  };
}

function appendConflictSupportLayer(svg, entries, layout, config) {
  const leaderGroup = svgEl("g", { class: "conflict-support-leaders" });
  const markerGroup = svgEl("g", { class: "conflict-support-markers" });
  const labelGroup = svgEl("g", { class: "conflict-support-labels" });
  entries.forEach(entry => {
    if (!entry.annotation.markerKind) return;
    const full = entry.annotation.markerKind === "full";
    markerGroup.append(svgEl("circle", {
      class: `support-node-marker support-node-marker-${entry.annotation.markerKind}${full ? " full-support-marker" : " partial-support-marker"}`,
      cx: entry.position.x,
      cy: entry.position.y,
      r: config.nodeRadius,
      "data-support": entry.annotation.value,
      "data-support-raw": entry.annotation.rawValue,
      "data-support-state": entry.annotation.markerKind,
      "data-tree-side": entry.side,
      "data-node-id": entry.node.id,
    }));
  });
  layout.placed.forEach(item => {
    const labelId = item.layoutNode.id;
    if (config.leaderLines) appendNodeLabelArrow(
      leaderGroup,
      item.layoutNode,
      item.rect,
      item.plan,
      labelId,
      "support",
    );
    labelGroup.append(svgEl("text", {
      class: `support-label conflict-support-label${/[—–]/.test(item.annotation.text) ? " support-threshold-mark" : ""}`,
      x: item.rect.x,
      y: item.rect.baseline,
      "font-size": item.fontSize,
      "data-support": item.annotation.value,
      "data-support-raw": item.annotation.rawValue,
      "data-tree-side": item.side,
      "data-node-id": item.node.id,
      "data-collisions": item.collisionCount,
      "data-label-id": labelId,
      "data-leader-length": item.plan.length.toFixed(3),
      "data-axis-angle-degrees": item.plan.axisAngle.toFixed(3),
      "data-leader-text-hits": item.plan.obstacleHits + item.leaderTextHits,
      "data-leader-node-hits": item.plan.nodeHits,
    }, item.annotation.text));
  });
  svg.append(leaderGroup, markerGroup, labelGroup);
}


    return Object.freeze({entries:conflictSupportEntries,layoutSteps:layoutConflictSupportSteps,
      appendLayer:appendConflictSupportLayer});
  }
  return Object.freeze({create});
});
