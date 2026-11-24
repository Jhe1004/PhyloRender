/* Stage 82: explicit module boundary; browser and Node share this implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderNodeLabelLayout=api;})(globalThis,function(){
"use strict";
function create(ports) {
if (!ports || !ports.geometry) throw new TypeError("Node label layout requires a geometry port");
for (const name of ["readContext", "readOptions", "svgEl", "nodeLabelInkRect", "appendNodeLabelArrow", "enableLabelDrag", "formatSupportValue", "nodeLabelFontSettings", "countResidualCollisions", "updateLabelWarnings", "publishPlacements", "publishCollisions", "mapRenderSteps"]) {
  if (typeof ports[name] !== "function") throw new TypeError(`Node label layout requires the ${name} port`);
}
const { geometry, readContext, readOptions, svgEl, nodeLabelInkRect, appendNodeLabelArrow, enableLabelDrag, formatSupportValue, nodeLabelFontSettings, countResidualCollisions, updateLabelWarnings, publishPlacements, publishCollisions, mapRenderSteps } = ports;
const { rectsOverlap,segmentIntersectsRect,supportRectCrossesBranch,clampRectToBounds,nearestBranchFreeRectWithinBounds,routeSegments,segmentIntersection,leaderSegmentConflictsWithBranch,leaderCrossingPairs,leaderGeometry,nodeArrowGeometryExcess,nodeArrowGeometryReason,nodeArrowAxisAngle,nodeArrowAnglePreferenceCost,leaderTargetCandidates,leaderBranchCrossingCount,pointToSegmentDistance,leaderNodeCrossingCount,leaderPlanPriority,leaderVisualCost,nodeLabelFontCost,nodeLabelPlacementCost,nodeArrowHeadPath,timeAgeMaximumEdgeDistance,timeAgeLeaderTriggerDistance,timeAgeCandidatePlacements,readableFontSizes,sampleNodeLabelCandidates,labelBoundaryCandidates,fineLabelSlotCandidates, MIN_NODE_ARROW_AXIS_ANGLE,MAX_NODE_ARROW_AXIS_ANGLE,PREFERRED_NODE_ARROW_AXIS_ANGLE,MIN_NODE_ARROW_LENGTH,NODE_ARROW_LENGTH_TOLERANCE,NODE_ARROW_ANGLE_TOLERANCE,NODE_ARROW_HEAD_LENGTH,NODE_ARROW_HEAD_HALF_WIDTH,MAX_TIME_AGE_EDGE_DISTANCE,MAX_TIME_AGE_LEADER_LENGTH,MIN_TIME_AGE_LEADER_TRIGGER_DISTANCE,MAX_PHYLOGENY_LABEL_EDGE_DISTANCE,MAX_PHYLOGENY_LABEL_FALLBACK_EDGE_DISTANCE,MAX_PHYLOGENY_LABEL_LEADER_LENGTH,MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE } = geometry;
function candidatePlacements(node,width,height,maximum,branches=[]) { const o=readOptions();return geometry.candidatePlacements(node,width,height,maximum,branches,readContext().currentSvgSize,{arrows:o.leaderLines,nodeRadius:o.nodeRadius}); }
function phylogenyLabelOwnership(node,rect,points=[]) { return geometry.phylogenyLabelOwnership(node,rect,points,readOptions().leaderLines); }
function closestPhylogenyLabelCandidate(node,width,height,intended=null,points=[],obstacles=[],leaders=[]) { const layout=readContext();return geometry.closestPhylogenyLabelCandidate(node,width,height,intended,points,obstacles,leaders,{canvasSize:layout.currentSvgSize,branches:layout.branchSegments,arrows:readOptions().leaderLines}); }
function scorePlacement(rect,obstacles,segments,node,includeBranches=true,leaders=[]) { return geometry.scorePlacement(rect,obstacles,segments,node,includeBranches,leaders,readContext().currentSvgSize); }
function leaderRouteForPlacement(node,rect,branches,obstacles=[],leaders=[],points=[]) { return geometry.leaderRouteForPlacement(node,rect,branches,obstacles,leaders,points,readOptions().nodeRadius); }
function fontBoundsForText(text) { const { preferred, minimum } = nodeLabelFontSettings(), s = geometry.nodeGlyphScale ? geometry.nodeGlyphScale(text) : 1; return [preferred * s, minimum * s]; }
function* layoutSupportLabelSteps(
  nodes, group, leaderGroup, tipGroup, internalNodePoints = [], _allowEmergencyShrink = true,
) {
  const layout = readContext();
  const auto = readOptions().autoLabels;
  const obstacles = [];
  [...tipGroup.children].forEach(el => {
    const box = el.getBBox(); obstacles.push({ x: box.x, y: box.y, width: box.width, height: box.height, kind: "tip" });
  });
  const leaderSegments = [];
  const placements = [];

  // Reserve nearby positions for narrow threshold dashes before wider values,
  // while otherwise preserving the biological traversal.
  const orderedNodes = nodes.map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const aText = a.node.displaySupportOverride ?? formatSupportValue(a.node.support);
      const bText = b.node.displaySupportOverride ?? formatSupportValue(b.node.support);
      return Number(!/[—–]/.test(aText)) - Number(!/[—–]/.test(bText)) || a.index - b.index;
    })
    .map(item => item.node);
  for (const [index, node] of orderedNodes.entries()) {
    yield { phase: "labels", current: index + 1, total: orderedNodes.length };
    const id = node.incomingEdgeId || node.id;
    const displaySupport = node.displaySupportOverride ?? formatSupportValue(node.support);
    const [preferred, minimum] = fontBoundsForText(displaySupport);
    const supportClass = /[—–]/.test(displaySupport) ? "support-label support-threshold-mark" : "support-label";
    const manual = layout.manualLabels.get(id);
    let chosen = null, chosenFont = preferred, collisionScore = Infinity;
    const measure = svgEl("text", { class: supportClass, x: -1000, y: -1000, "font-size": preferred }, displaySupport);
    group.append(measure);
    const measureAtFont = font => {
      measure.setAttribute("font-size", font);
      return measure.getBBox();
    };
    const measured = measureAtFont(preferred);

    if (manual) {
      const fontReduction = Number.isFinite(manual.fontReduction) ? manual.fontReduction : 0;
      chosenFont = Math.max(minimum, preferred - fontReduction);
      const manualMeasured = measureAtFont(chosenFont);
      const x = Number.isFinite(manual.dx) ? node.x + manual.dx : manual.x;
      const y = Number.isFinite(manual.dy) ? node.y + manual.dy : manual.y;
      const manualRect = { x, y, width: manualMeasured.width, height: manualMeasured.height, rank: -1, position: "manual" };
      chosen = leaderGeometry(node, manualRect).edgeDistance <= MAX_PHYLOGENY_LABEL_FALLBACK_EDGE_DISTANCE
        && !supportRectCrossesBranch(manualRect, layout.branchSegments, 3)
        ? manualRect
        : closestPhylogenyLabelCandidate(
          node, manualRect.width, manualRect.height, manualRect, internalNodePoints, obstacles, leaderSegments,
        );
      chosen ||= { ...manualRect, x: node.x + 4, y: node.y + 4, position: "local-fallback" };
      manual.dx = chosen.x - node.x;
      manual.dy = chosen.y - node.y;
      collisionScore = scorePlacement(chosen, obstacles, layout.branchSegments, node, true, leaderSegments);
    } else if (!auto) {
      const candidates = candidatePlacements(node, measured.width, measured.height)
        .map(candidate => ({ ...candidate, width: measured.width, height: measured.height }))
        .filter(candidate => !supportRectCrossesBranch(candidate, layout.branchSegments, 3)
          && phylogenyLabelOwnership(node, candidate, internalNodePoints).acceptable);
      let fewestLeaderCrossings = Infinity;
      for (const candidate of candidates) {
        const leaderPlan = leaderRouteForPlacement(
          node, candidate, layout.branchSegments, obstacles, leaderSegments, internalNodePoints,
        );
        const crossings = leaderPlan.crossings;
        if (crossings < fewestLeaderCrossings) {
          chosen = candidate;
          fewestLeaderCrossings = crossings;
        }
        if (crossings === 0) break;
      }
      const fallback = closestPhylogenyLabelCandidate(
        node, measured.width, measured.height, null, internalNodePoints, obstacles, leaderSegments,
      );
      chosen ||= fallback
        ? { ...fallback, width: measured.width, height: measured.height }
        : { x: node.x + 4, y: node.y + 4, width: measured.width, height: measured.height, position: "local-fallback" };
      collisionScore = scorePlacement(chosen, obstacles, layout.branchSegments, node, true, leaderSegments);
    } else {
      // Every font, including the preferred size, searches the same distance
      // range. Distance and type size compete in one objective; neither search
      // radius nor first-fit font order decides the answer in advance.
      const layout = readContext();
  const arrows = readOptions().leaderLines;
      const fonts = readableFontSizes(preferred, minimum);
      const radius = 192;
      const searchBox = {
        left: node.x - radius - measured.width - 8,
        right: node.x + radius + measured.width + 8,
        top: node.y - radius - measured.height - 8,
        bottom: node.y + radius + measured.height + 8,
      };
      const intersectsSearch = segment => Math.max(segment.x1, segment.x2) >= searchBox.left
        && Math.min(segment.x1, segment.x2) <= searchBox.right
        && Math.max(segment.y1, segment.y2) >= searchBox.top
        && Math.min(segment.y1, segment.y2) <= searchBox.bottom;
      const localBranches = layout.branchSegments.filter(intersectsSearch);
      const localLeaders = leaderSegments.filter(intersectsSearch);
      const localObstacles = obstacles.filter(other => other.x + other.width >= searchBox.left
        && other.x <= searchBox.right && other.y + other.height >= searchBox.top
        && other.y <= searchBox.bottom);
      const localNodes = internalNodePoints.filter(point => point.x >= searchBox.left
        && point.x <= searchBox.right && point.y >= searchBox.top && point.y <= searchBox.bottom);
      for (const font of fonts) {
        const box = measureAtFont(font);
        const width = box.width, height = box.height;
        const nearby = localObstacles.filter(other => Math.abs(other.y - node.y) <= 200)
          .sort((a, b) => Math.abs(a.y - node.y) - Math.abs(b.y - node.y)).slice(0, 8);
        const generated = [
          ...candidatePlacements(node, width, height, radius, localBranches),
          ...labelBoundaryCandidates(node, width, height, nearby, radius),
        ];
        const legal = generated.filter(candidate => {
          const rect = { ...candidate, width, height };
          return scorePlacement(rect, localObstacles, localBranches, node, true, localLeaders) === 0
            && (arrows || phylogenyLabelOwnership(node, rect, localNodes).acceptable)
            && localNodes.every(point => Math.hypot(point.x - node.x, point.y - node.y) < .75
              || leaderGeometry(point, rect).edgeDistance > Math.max(3, readOptions().nodeRadius) + 1);
        });
        const sampled = sampleNodeLabelCandidates(node, legal, width, height);
        for (const candidate of sampled) {
          yield;
          const rect = { ...candidate, width, height };
          const plan = leaderRouteForPlacement(
            node, rect, localBranches, localObstacles, localLeaders, localNodes,
          );
          const score = nodeLabelPlacementCost(font, preferred, minimum, plan, {
            distance: leaderGeometry(node, rect).edgeDistance, positionPenalty: arrows || !geometry.directNodeLabelPenalty ? 0 : geometry.directNodeLabelPenalty(node, rect), arrows,
          });
          if (score < collisionScore - 1e-6 || (Math.abs(score - collisionScore) < 1e-6 && font > chosenFont)) {
            chosen = rect;
            chosenFont = font;
            collisionScore = score;
          }
        }
      }
      if (!chosen) {
        // A crowded diagram must report an unresolved annotation instead of
        // drawing two strings on top of one another.
        measure.remove();
        continue;
      }
    }

    const finalMeasurement = measureAtFont(chosenFont);
    const anchorOffsetX = finalMeasurement.x - Number(measure.getAttribute("x"));
    const baseline = chosen.y + Number(measure.getAttribute("y")) - finalMeasurement.y;
    measure.remove();
    const text = svgEl("text", {
      class: supportClass,
      x: chosen.x - anchorOffsetX,
      y: baseline,
      "font-size": chosenFont,
      "data-label-id": id,
      "data-node-x": node.x,
      "data-node-y": node.y,
      "data-auto-position": chosen.position || "manual",
    }, displaySupport);
    group.append(text);
    let actual = text.getBBox();
    let actualRect = {
      x: actual.x,
      y: actual.y,
      width: actual.width,
      height: actual.height,
      kind: "support",
      id,
      position: chosen.position || "manual",
    };
    const repairObstacles = [
      ...[...tipGroup.children].map(element => {
        const box = element.getBBox();
        return { x: box.x, y: box.y, width: box.width, height: box.height, kind: "tip" };
      }),
      ...obstacles.filter(obstacle => obstacle.kind === "support"),
    ];
    if (auto && scorePlacement(
      actualRect, repairObstacles, layout.branchSegments, node, true, leaderSegments,
    ) > 0) {
      const originalAttributes = {
        x: text.getAttribute("x"),
        y: text.getAttribute("y"),
        fontSize: text.getAttribute("font-size"),
      };
      let repaired = null;
      const repairFloor = minimum;
      for (const font of readableFontSizes(chosenFont, repairFloor)) {
        if (repaired) break;
        text.setAttribute("font-size", font);
        text.setAttribute("x", -1000);
        text.setAttribute("y", -1000);
        const probe = text.getBBox();
        const xOffset = probe.x + 1000;
        const baselineOffset = probe.y + 1000;
        const candidates = candidatePlacements(
          node, probe.width, probe.height, MAX_PHYLOGENY_CROSSING_RESCUE_EDGE_DISTANCE,
        ).map(candidate => ({ ...candidate, width: probe.width, height: probe.height }))
          .filter(candidate => !supportRectCrossesBranch(candidate, layout.branchSegments, 3)
            && phylogenyLabelOwnership(node, candidate, internalNodePoints).acceptable
            && scorePlacement(candidate, repairObstacles, layout.branchSegments, node, false, leaderSegments) === 0)
          .sort((a, b) => a.preference - b.preference || a.edgeDistance - b.edgeDistance || a.rank - b.rank);
        for (const candidate of candidates) {
          text.setAttribute("x", candidate.x - xOffset);
          text.setAttribute("y", candidate.y - baselineOffset);
          const box = text.getBBox();
          const rect = {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            kind: "support",
            id,
            position: candidate.position,
          };
          if (scorePlacement(rect, repairObstacles, layout.branchSegments, node, true, leaderSegments) !== 0) continue;
          const plan = leaderRouteForPlacement(
            node, rect, layout.branchSegments, repairObstacles, leaderSegments, internalNodePoints,
          );
          if (plan.obstacleHits > 0 || plan.nodeHits > 0) continue;
          repaired = { font, rect, box };
          break;
        }
      }
      if (repaired) {
        chosenFont = repaired.font;
        actual = repaired.box;
        actualRect = repaired.rect;
        text.setAttribute("data-auto-position", repaired.rect.position);
      } else {
        text.setAttribute("x", originalAttributes.x);
        text.setAttribute("y", originalAttributes.y);
        text.setAttribute("font-size", originalAttributes.fontSize);
      }
    }
    const edgeDistance = leaderGeometry(node, actualRect).edgeDistance;
    const ownership = phylogenyLabelOwnership(node, actualRect, internalNodePoints);
    text.setAttribute("data-edge-distance", edgeDistance.toFixed(3));
    text.setAttribute("data-nearest-other-node-distance", Number.isFinite(ownership.nearestOtherDistance)
      ? ownership.nearestOtherDistance.toFixed(3)
      : "none");
    text.setAttribute("data-nearest-other-node-id", ownership.nearestOtherId || "none");
    text.setAttribute("data-node-ownership-clear", String(ownership.unambiguous));
    const leaderPlan = leaderRouteForPlacement(
      node, actualRect, layout.branchSegments, obstacles, leaderSegments, internalNodePoints,
    );
    const nodeArrowsEnabled = readOptions().leaderLines;
    text.setAttribute("data-leader-required", String(nodeArrowsEnabled));
    text.setAttribute("data-node-arrow-required", String(nodeArrowsEnabled));
    text.setAttribute("data-leader-plan-crossings", String(leaderPlan.crossings));
    text.setAttribute("data-leader-plan-length", leaderPlan.length.toFixed(3));
    text.setAttribute("data-leader-plan-obstacle-hits", String(leaderPlan.obstacleHits));
    text.setAttribute("data-leader-plan-leader-hits", String(leaderPlan.leaderHits));
    text.setAttribute("data-leader-plan-node-hits", String(leaderPlan.nodeHits));
    actualRect.leaderCrossings = 0;
    const arrowDrawn = nodeArrowsEnabled && appendNodeLabelArrow(leaderGroup, node, actualRect, leaderPlan, id, "support");
    text.setAttribute("data-node-arrow-drawn", String(arrowDrawn));
    if (arrowDrawn) {
      routeSegments(leaderPlan.points).forEach(segment => leaderSegments.push({ ...segment, labelId: id }));
    }
    obstacles.push(actualRect);
    enableLabelDrag(text, id);
    placements.push({ ...actualRect, node, score: collisionScore });
  }

  publishPlacements(placements);
  const finalLeaderSegments = yield* refineReadableNodeLabelSteps(
    placements, group, leaderGroup, tipGroup, layout.branchSegments, internalNodePoints, "support", auto,
  );
  group.dataset.unplacedCount = String(orderedNodes.length - placements.length);
  const collisions = countResidualCollisions(
    placements,
    layout.branchSegments,
    [...tipGroup.children].map(el => el.getBBox()),
    finalLeaderSegments,
    group,
  );
  updateLabelWarnings(placements);
  publishCollisions(collisions);
}

function* refineReadableNodeLabelSteps(placements, group, leaderGroup, tipGroup, branches,
  internalNodePoints, kind, auto, bounds = null) {
  const layout = readContext();
  const arrows = readOptions().leaderLines;
  const tips = [...tipGroup.children].map(element => {
    const box = element.getBBox();
    return { x: box.x, y: box.y, width: box.width, height: box.height, kind: "tip" };
  });
  const elements = new Map([...group.querySelectorAll("[data-label-id]")]
    .map(element => [element.dataset.labelId, element]));
  const idFor = rect => rect.id ?? rect.labelId;
  const plans = new Map();
  const rebuildPlans = () => {
    const segments = [];
    for (const rect of placements) {
      const id = idFor(rect);
      const obstacles = [...tips, ...placements.filter(other => other !== rect)];
      const ink = nodeLabelInkRect(elements.get(id), rect);
      const plan = leaderRouteForPlacement(
        rect.node, ink, branches, obstacles, segments, internalNodePoints,
      );
      plans.set(id, plan);
      if (arrows) routeSegments(plan.points || []).forEach(segment => segments.push({ ...segment, labelId: id }));
    }
    return segments;
  };
  let segments = rebuildPlans();
  const textHits = (rect, obstacles) => obstacles.filter(other => rectsOverlap(rect, other, 2)).length;
  const quality = () => ({
    hard: placements.reduce((count, rect) => count
      + textHits(rect, [...tips, ...placements.filter(other => other !== rect)])
      + Number(supportRectCrossesBranch(rect, branches, 3))
      + (arrows ? plans.get(idFor(rect)).obstacleHits : 0)
      + segments.filter(segment => segment.labelId !== idFor(rect)
        && segmentIntersectsRect(segment, rect, 1.5)).length, 0)
      + segments.filter(segment => tips.some(tip => segmentIntersectsRect(segment, tip, 1.5))).length,
    soft: placements.reduce((score, rect) => score
      + (arrows ? leaderPlanPriority(plans.get(idFor(rect))) : 0), 0)
      + leaderCrossingPairs(segments).length * 650,
  });
  const betterQuality = (a, b) => a.hard < b.hard
    || (a.hard === b.hard && a.soft < b.soft - 1e-6);
  const snapshot = () => placements.map(rect => {
    const element = elements.get(idFor(rect));
    return { rect: { ...rect, branchOverlapProtected: Boolean(rect.branchOverlapProtected) },
      x: element.getAttribute("x"), y: element.getAttribute("y"), font: element.getAttribute("font-size") };
  });
  let bestQuality = quality(), bestLayout = snapshot();
  for (let pass = 0; auto && pass < 6; pass++) {
    let changed = false;
    for (const rect of placements) {
      yield { phase: "repair", pass: pass + 1, current: placements.indexOf(rect) + 1, total: placements.length };
      const id = idFor(rect);
      if (layout.manualLabels.has(id)) continue;
      const obstacles = [...tips, ...placements.filter(other => other !== rect)];
      const otherSegments = segments.filter(segment => segment.labelId !== id);
      const plan = plans.get(id);
      const blocked = textHits(rect, obstacles) > 0
        || supportRectCrossesBranch(rect, branches, 3)
        || (arrows && (plan.obstacleHits > 0
          || otherSegments.some(segment => segmentIntersectsRect(segment, rect, 1.5))));
      if (!blocked) continue;
      const maximum = arrows ? Math.max(192, Math.min(320, rect.width * 4)) : 96;
      const candidates = candidatePlacements(rect.node, rect.width, rect.height, maximum, branches);
      // Sample obstacle boundaries as well as rings. A narrow free channel
      // can lie between two rings, especially with fractional physical units.
      const xs = new Set([4, rect.x, rect.node.x + 4, rect.node.x - rect.width - 4]);
      const ys = new Set([4, rect.y, rect.node.y - rect.height / 2]);
      const nearby = [...obstacles, ...branches.map(segment => ({
        x: Math.min(segment.x1, segment.x2), y: Math.min(segment.y1, segment.y2),
        width: Math.abs(segment.x2 - segment.x1), height: Math.abs(segment.y2 - segment.y1),
      }))].filter(other => other.x < rect.node.x + maximum + rect.width
        && other.x + other.width > rect.node.x - maximum - rect.width
        && other.y < rect.node.y + maximum + rect.height
        && other.y + other.height > rect.node.y - maximum - rect.height);
      nearby.forEach(other => {
        xs.add(other.x - rect.width - 3.25); xs.add(other.x + other.width + 3.25);
        ys.add(other.y - rect.height - 3.25); ys.add(other.y + other.height + 3.25);
      });
      for (const x of xs) for (const y of ys) {
        const candidate = { x, y, width: rect.width, height: rect.height, position: "global-repair" };
        if (leaderGeometry(rect.node, candidate).edgeDistance <= maximum) candidates.push(candidate);
      }
      const currentInk = nodeLabelInkRect(elements.get(id), rect);
      const clean = candidates.map(candidate => ({ ...candidate, width: rect.width, height: rect.height }))
        .filter(candidate => candidate.x >= 4 && candidate.y >= 4
          && candidate.x + candidate.width <= layout.currentSvgSize.width - 4
          && candidate.y + candidate.height <= layout.currentSvgSize.height - 4
          && (!bounds || (candidate.x >= (bounds.labelLeft ?? bounds.left) + 4
            && candidate.x + candidate.width <= bounds.right - 4
            && candidate.y >= bounds.top - 2 && candidate.y + candidate.height <= bounds.bottom + 2))
          && textHits(candidate, obstacles) === 0
          && !supportRectCrossesBranch(candidate, branches, 3)
          && internalNodePoints.every(point => leaderGeometry(point, candidate).edgeDistance > Math.max(3, readOptions().nodeRadius) + 1)
          && (arrows || phylogenyLabelOwnership(rect.node, candidate, internalNodePoints).acceptable))
        .filter(candidate => !arrows || leaderTargetCandidates(rect.node, {
          ...currentInk,
          x: currentInk.x + candidate.x - rect.x,
          y: currentInk.y + candidate.y - rect.y,
        }).some(target => nodeArrowAxisAngle(rect.node, target) >= MIN_NODE_ARROW_AXIS_ANGLE
          && nodeArrowAxisAngle(rect.node, target) <= MAX_NODE_ARROW_AXIS_ANGLE
          && Math.hypot(target.x - rect.node.x, target.y - rect.node.y) >= MIN_NODE_ARROW_LENGTH))
        .map(candidate => ({ candidate, distance: leaderGeometry(rect.node, candidate).edgeDistance,
          branchHit: supportRectCrossesBranch(candidate, branches, 3),
          hits: arrows ? otherSegments.filter(segment => segmentIntersectsRect(segment, candidate, 1.5)).length : 0 }))
        .sort((a, b) => a.hits - b.hits || a.distance - b.distance);
      let best = null;
      // Evaluate every nearby clean channel before accepting a remote label.
      const shortlist = [...clean.filter(entry => !entry.branchHit).slice(0, 160),
        ...clean.filter(entry => entry.branchHit).slice(0, 160)];
      for (const entry of shortlist) {
        yield;
        const ink = currentInk;
        const candidatePlan = leaderRouteForPlacement(rect.node, {
          ...ink, x: ink.x + entry.candidate.x - rect.x, y: ink.y + entry.candidate.y - rect.y,
        }, branches, obstacles, otherSegments, internalNodePoints);
        const score = entry.hits ? Infinity : nodeLabelPlacementCost(
          Number(elements.get(id).getAttribute("font-size")),
          ...fontBoundsForText(elements.get(id).textContent),
          candidatePlan, { distance: entry.distance, arrows },
        );
        if (!best || score < best.score) best = { ...entry, plan: candidatePlan, score };
      }
      const element = elements.get(id);
      if (!best || !Number.isFinite(best.score)) continue;
      // At the hard font floor, a temporary pointer/text crossing can free
      // a neighbour's channel on the next pass. It remains in the global
      // collision score and cannot be reported as a clean final layout.
      if (Math.abs(best.candidate.x - rect.x) < 1e-6 && Math.abs(best.candidate.y - rect.y) < 1e-6
        && Boolean(rect.branchOverlapProtected) === best.branchHit) continue;
      element.setAttribute("x", Number(element.getAttribute("x")) + best.candidate.x - rect.x);
      element.setAttribute("y", Number(element.getAttribute("y")) + best.candidate.y - rect.y);
      const actual = element.getBBox();
      Object.assign(rect, { x: actual.x, y: actual.y, width: actual.width, height: actual.height,
        position: "global-repair", branchOverlapProtected: best.branchHit });
      element.dataset.autoPosition = "global-repair";
      element.dataset.position = "global-repair";
      changed = true;
      segments = rebuildPlans();
    }
    const currentQuality = quality();
    if (betterQuality(currentQuality, bestQuality)) { bestQuality = currentQuality; bestLayout = snapshot(); }
    if (!changed) break;
    if (currentQuality.hard === 0 && currentQuality.soft === 0) break;
  }
  // Releasing an old pointer's space can unlock a neighbouring label. Keep
  // only the best whole-layout result so this bounded search cannot regress.
  if (betterQuality(bestQuality, quality())) {
    bestLayout.forEach((saved, index) => {
      Object.assign(placements[index], saved.rect);
      const element = elements.get(idFor(placements[index]));
      element.setAttribute("x", saved.x); element.setAttribute("y", saved.y);
      element.setAttribute("font-size", saved.font);
    });
  }
  // Joint discrete optimization: labels remain movable after the first
  // feasible layout. Pair moves can release mutually occupied slots.
  if (auto && placements.length) {
    segments = rebuildPlans();
    const jointOriginal = snapshot();
    const actualMetrics = () => ({
      text: placements.reduce((sum, rect) => sum
        + textHits(rect, [...tips, ...placements.filter(other => other !== rect)])
        + (arrows ? plans.get(idFor(rect)).obstacleHits : 0), 0),
      branches: placements.filter(rect => supportRectCrossesBranch(rect, branches, 3)).length,
      traversals: arrows ? placements.reduce((sum, rect) => sum + plans.get(idFor(rect)).crossings, 0) : 0,
      nodes: arrows ? placements.reduce((sum, rect) => sum + plans.get(idFor(rect)).nodeHits, 0) : 0,
      visual: arrows ? placements.reduce((sum, rect) => sum + leaderVisualCost(plans.get(idFor(rect)))
        + nodeLabelFontCost(Number(elements.get(idFor(rect)).getAttribute("font-size")), ...fontBoundsForText(elements.get(idFor(rect)).textContent)), 0) : 0,
      crossings: leaderCrossingPairs(segments).length,
      invalid: arrows ? placements.filter(rect => plans.get(idFor(rect)).anglePenalty > 0).length : 0,
    });
    const actualBefore = actualMetrics();
    const pools = [];
    for (const rect of placements) {
      yield { phase: "candidates", current: pools.length + 1, total: placements.length };
      const element = elements.get(idFor(rect));
      const [preferred, minimum] = fontBoundsForText(element.textContent);
      const originalFont = element.getAttribute("font-size");
      const make = (box, font) => {
        const plan = leaderRouteForPlacement(
          rect.node, box, branches, tips, [], internalNodePoints,
        );
        const seg = arrows && plan.points ? { x1: plan.points[0].x, y1: plan.points[0].y,
          x2: plan.points[1].x, y2: plan.points[1].y } : null;
        const branchHit = supportRectCrossesBranch(box, branches, 3);
        const allowed = !branchHit
          && (arrows || phylogenyLabelOwnership(rect.node, box, internalNodePoints).acceptable);
        return { box, font, plan, seg, branchHit, cost: allowed
          ? nodeLabelPlacementCost(font, preferred, minimum, plan, {
            distance: leaderGeometry(rect.node, box).edgeDistance, positionPenalty: arrows || !geometry.directNodeLabelPenalty ? 0 : geometry.directNodeLabelPenalty(rect.node, box), arrows,
          }) : Infinity };
      };
      const current = make(nodeLabelInkRect(element, rect), Number(originalFont));
      if (layout.manualLabels.has(idFor(rect))) { pools.push([current]); continue; }
      const nearby = placements.filter(other => other !== rect)
        .sort((a, b) => Math.abs(a.node.y - rect.node.y) - Math.abs(b.node.y - rect.node.y)).slice(0, 6);
      const candidates = [];
      const fonts = arrows ? [...new Set([Number(originalFont), ...readableFontSizes(preferred, minimum)])] : [Number(originalFont)];
      for (const font of fonts) {
        yield { phase: "candidates", current: pools.length + 1, total: placements.length };
        element.setAttribute("font-size",font);
        const ink = nodeLabelInkRect(element,element.getBBox());
        const raw = [...candidatePlacements(rect.node, ink.width, ink.height, 192, branches),
          ...labelBoundaryCandidates(rect.node, ink.width, ink.height, [...tips,...nearby],192),
          ...nearby.map(other => ({ x: other.x, y: other.y }))];
        const seen = new Set();
        const boxes = raw.map(p => ({ ...p, width: ink.width, height: ink.height }))
        .filter(p => {
          const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return p.x >= 4 && p.y >= 4 && p.x + p.width <= layout.currentSvgSize.width - 4
            && p.y + p.height <= layout.currentSvgSize.height - 4
            && (!bounds || (p.x >= (bounds.labelLeft ?? bounds.left) + 4
              && p.x + p.width <= bounds.right - 4 && p.y >= bounds.top - 2
              && p.y + p.height <= bounds.bottom + 2))
            && !tips.some(t => rectsOverlap(p, t, 2))
            && !supportRectCrossesBranch(p, branches, 3)
            && internalNodePoints.every(n => leaderGeometry(n, p).edgeDistance > Math.max(3, readOptions().nodeRadius) + 1);
        });
        const sampled = sampleNodeLabelCandidates(rect.node, boxes, ink.width, ink.height, 3);
        const evaluated = yield* mapRenderSteps(sampled, box => make(box, font));
        candidates.push(...evaluated.filter(c => Number.isFinite(c.cost)));
      }
      element.setAttribute("font-size",originalFont);
      candidates.sort((a, b) => a.cost - b.cost || b.font-a.font);
      // Preserve alternatives on both sides and above/below the node, rather
      // than letting one locally attractive quadrant consume the whole pool.
      const chosen = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const quadrant = candidates.filter(c => (c.box.x + c.box.width / 2 < rect.node.x ? -1 : 1) === sx
          && (c.box.y + c.box.height / 2 < rect.node.y ? -1 : 1) === sy);
        const diverse = [];
        for (const c of quadrant) {
          if (diverse.every(d => Math.hypot(c.box.x - d.box.x, c.box.y - d.box.y) >= Math.max(6, rect.height / 2))) diverse.push(c);
          if (diverse.length === 4) break;
        }
        chosen.push(...diverse);
      }
      // Reserve a separate near-node pool: quadrant/crossing pruning must not
      // discard the compact slots needed to release a long displaced label.
      const compact = [...candidates].sort((a, b) => a.plan.length - b.plan.length);
      const near = [];
      for (const c of compact) {
        if (near.every(d => Math.hypot(c.box.x - d.box.x, c.box.y - d.box.y) >= Math.max(6, rect.height / 2))) near.push(c);
        if (near.length === 6) break;
      }
      chosen.push(...near.filter(c => !chosen.includes(c)));
      // A reduced-size candidate can unlock a neighbour's route; keep a few
      // per size even if larger labels win the single-label spatial shortlist.
      for (const font of fonts) chosen.push(...candidates.filter(c => c.font === font && !chosen.includes(c)).slice(0,2));
      pools.push([current, ...chosen]);
    }
    const selected = pools.map(() => 0), cache = new Map();
    const pairCost = (i, a, j, b) => {
      if (i > j) return pairCost(j, b, i, a);
      const key = `${i}:${a}:${j}:${b}`;
      if (cache.has(key)) return cache.get(key);
      const x = pools[i][a], y = pools[j][b];
      const textConflict = rectsOverlap(x.box, y.box, 2)
        || Boolean(x.seg && segmentIntersectsRect(x.seg, y.box, 1.5))
        || Boolean(y.seg && segmentIntersectsRect(y.seg, x.box, 1.5));
      const cost = textConflict ? Infinity
        : Number(Boolean(x.seg && y.seg && segmentIntersection(x.seg, y.seg))) * 650;
      // Memoization is optional: cap retained pairs without changing scores.
      if (cache.size >= 250000) cache.clear();
      cache.set(key, cost);
      return cost;
    };
    const localCost = (i, a, except = -1) => pools[i][a].cost
      + selected.reduce((sum, b, j) => sum + (j === i || j === except ? 0 : pairCost(i, a, j, b)), 0);
    const energy = () => selected.reduce((sum, a, i) => sum + pools[i][a].cost
      + selected.slice(i + 1).reduce((s, b, k) => s + pairCost(i, a, i + k + 1, b), 0), 0);
    const before = energy();
    let jointMoves = 0;
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      const order = pools.map((_, i) => i).sort((a, b) =>
        pools[b][selected[b]].plan.length - pools[a][selected[a]].plan.length || a - b);
      for (const i of order) {
        yield { phase: "joint", pass: pass + 1, current: order.indexOf(i) + 1, total: order.length };
        let best = selected[i], value = localCost(i, best);
        for (let a = 0; a < pools[i].length; a++) {
          yield;
          const cost = localCost(i, a);
          if (cost < value - 1e-6) { value = cost; best = a; }
        }
        if (best !== selected[i]) { selected[i] = best; changed = true; }
      }
      const visitedPairs = new Set();
      for (const i of order) {
        const neighbors = placements.map((r, j) => j).filter(j => j !== i)
          .sort((a, b) => Math.abs(placements[a].node.y - placements[i].node.y)
            - Math.abs(placements[b].node.y - placements[i].node.y)).slice(0, 6);
        for (const j of neighbors) {
          yield { phase: "joint", pass: pass + 1, current: order.indexOf(i) + 1, total: order.length };
          const pairKey = `${Math.min(i,j)}:${Math.max(i,j)}`;
          if (visitedPairs.has(pairKey)) continue;
          visitedPairs.add(pairKey);
          const options = function* (k) {
            // Scores do not change while a pair is considered. Compute once
            // per candidate, rather than repeatedly in the sort comparator.
            const ranked = [];
            for (let a = 0; a < pools[k].length; a++) {
              yield;
              ranked.push({ a, cost: localCost(k, a, k === i ? j : i) });
            }
            ranked.sort((a, b) => a.cost - b.cost);
            return [...new Set([selected[k], ...ranked.slice(0, 6).map(entry => entry.a)])];
          };
          let ai = selected[i], bj = selected[j];
          let value = localCost(i, ai, j) + localCost(j, bj, i) + pairCost(i, ai, j, bj);
          const choicesI = yield* options(i), choicesJ = yield* options(j);
          for (const a of choicesI) for (const b of choicesJ) {
            yield;
            const cost = localCost(i, a, j) + localCost(j, b, i) + pairCost(i, a, j, b);
            if (cost < value - 1e-6) { value = cost; ai = a; bj = b; }
          }
          if (ai !== selected[i] || bj !== selected[j]) {
            selected[i] = ai; selected[j] = bj; changed = true; jointMoves++;
          }
        }
      }
      if (!changed) break;
    }
    placements.forEach((rect, i) => {
      const choice = pools[i][selected[i]], element = elements.get(idFor(rect));
      element.setAttribute("font-size",choice.font);
      const ink = nodeLabelInkRect(element,element.getBBox());
      element.setAttribute("x", Number(element.getAttribute("x")) + choice.box.x - ink.x);
      element.setAttribute("y", Number(element.getAttribute("y")) + choice.box.y - ink.y);
      Object.assign(rect, choice.box, { branchOverlapProtected: choice.branchHit, position: "joint-optimization" });
    });
    segments = rebuildPlans();
    const actualAfter = actualMetrics();
    const accepted = actualAfter.text === 0 && actualAfter.branches === 0
      && actualAfter.crossings <= actualBefore.crossings
      && energy() <= before + 1e-6;
    if (!accepted) {
      jointOriginal.forEach((saved, i) => {
        Object.assign(placements[i], saved.rect);
        const element = elements.get(idFor(placements[i]));
        element.setAttribute("x", saved.x); element.setAttribute("y", saved.y);
        element.setAttribute("font-size", saved.font);
      });
      selected.fill(0);
      jointMoves = 0;
      segments = rebuildPlans();
    }
    group.dataset.jointAccepted = accepted;
    group.dataset.branchTraversalsBefore = actualBefore.traversals;
    group.dataset.branchTraversalsAfter = accepted ? actualAfter.traversals : actualBefore.traversals;
    group.dataset.jointEnergyBefore = before;
    group.dataset.jointEnergyAfter = energy();
    group.dataset.jointMoves = jointMoves;
  }
  // Final rendered-geometry descent. A feasible but remote label must not be
  // frozen just because earlier candidate pruning found no collision. Search
  // the full local pool against the *final* other labels, not a static shortlist.
  if (auto && arrows) {
    const metrics = () => ({
      text: placements.reduce((sum, r) => sum + textHits(r, [...tips, ...placements.filter(o => o !== r)])
        + plans.get(idFor(r)).obstacleHits, 0),
      branches: placements.filter(r => supportRectCrossesBranch(r, branches, 3)).length,
      crossings: leaderCrossingPairs(segments).length,
      invalid: placements.filter(r => plans.get(idFor(r)).anglePenalty > 0).length,
      traversals: placements.reduce((sum, r) => sum + plans.get(idFor(r)).crossings, 0),
      nodes: placements.reduce((sum, r) => sum + plans.get(idFor(r)).nodeHits, 0),
      visual: placements.reduce((sum, r) => sum + nodeLabelPlacementCost(
        Number(elements.get(idFor(r)).getAttribute("font-size")), ...fontBoundsForText(elements.get(idFor(r)).textContent),
        plans.get(idFor(r)), { arrows },
      ), 0) + leaderCrossingPairs(segments).length * 650,
      length: placements.reduce((sum, r) => sum + plans.get(idFor(r)).length, 0),
    });
    let moves = 0;
    const startingMetrics = metrics();
    const startingLength = startingMetrics.length;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      const ordered = [...placements].sort((a, b) => plans.get(idFor(b)).length - plans.get(idFor(a)).length);
      for (const rect of ordered) {
        yield { phase: "compact", pass: pass + 1, current: ordered.indexOf(rect) + 1, total: ordered.length };
        const id = idFor(rect), element = elements.get(id), current = plans.get(id);
        const [preferred, minimum] = fontBoundsForText(element.textContent);
        const originalFont = element.getAttribute("font-size");
        const others = [...tips, ...placements.filter(o => o !== rect)];
        const otherSegments = segments.filter(s => s.labelId !== id);
        const currentCrossings = routeSegments(current.points || []).filter(s => otherSegments.some(o => segmentIntersection(s,o))).length;
        if (layout.manualLabels.has(id) || (!currentCrossings && !current.nodeHits
          && Number(originalFont) >= preferred && current.length <= MIN_NODE_ARROW_LENGTH + 1)) continue;
        const legal = [];
        const currentCost = nodeLabelPlacementCost(
          Number(originalFont), preferred, minimum, current, { arrows },
        ) + currentCrossings * 650;
        // Size and position are alternatives in ONE search, not sequential
        // fallbacks. Also allow an already reduced label to recover its size.
        const fonts = [...new Set([Number(originalFont), ...readableFontSizes(preferred, minimum)])];
        for (const font of fonts) {
          yield { phase: "compact", pass: pass + 1, current: ordered.indexOf(rect) + 1, total: ordered.length };
          element.setAttribute("font-size", font);
          const ink = nodeLabelInkRect(element, element.getBBox());
          const maximum = Math.max(48, Math.min(192, current.length));
          const candidates = candidatePlacements(rect.node, ink.width, ink.height, maximum, branches);
          candidates.push({...ink, position:"same-position"},
            ...labelBoundaryCandidates(rect.node, ink.width, ink.height, others, maximum));
          // Refine long leaders continuously around their current slot. Fixed
          // branch/ring samples can miss the small legal interval between the
          // angle boundary and a nearby branch. Only remote labels need this
          // bounded fine grid; all candidates retain the same hard checks.
          if (current.length > MIN_NODE_ARROW_LENGTH * 2) {
            candidates.push(...fineLabelSlotCandidates(ink));
          }
          for (const p of candidates) {
            yield;
            const glyph = {...p, width:ink.width, height:ink.height};
            // SVG getBBox includes font ascent/descent whitespace (which differs
            // across browsers). Protect visible ink plus the existing clearance,
            // rather than treating that invisible line box as painted digits.
            if (glyph.x < 4 || glyph.y < 4 || glyph.x + glyph.width > layout.currentSvgSize.width - 4
              || glyph.y + glyph.height > layout.currentSvgSize.height - 4
              || (bounds && (glyph.x < (bounds.labelLeft ?? bounds.left) + 4 || glyph.x + glyph.width > bounds.right - 4
                || glyph.y < bounds.top - 2 || glyph.y + glyph.height > bounds.bottom + 2))
              || textHits(glyph, others) || supportRectCrossesBranch(glyph, branches, 3)
              || internalNodePoints.some(n => leaderGeometry(n, glyph).edgeDistance <= Math.max(3, readOptions().nodeRadius) + 1)
              || otherSegments.some(s => segmentIntersectsRect(s, glyph, 1.5))) continue;
            const plan = leaderRouteForPlacement(
              rect.node, glyph, branches, others, otherSegments, internalNodePoints,
            );
            const cost = nodeLabelPlacementCost(font, preferred, minimum, plan, { arrows });
            if (!Number.isFinite(cost) || cost >= currentCost - 1e-6) continue;
            legal.push({glyph, plan, font, cost});
          }
        }
        element.setAttribute("font-size", originalFont);
        legal.sort((a,b) => a.cost-b.cost || b.font-a.font);
        for (const choice of legal.slice(0, 8)) {
          const before = metrics(), saved = {...rect}, x = element.getAttribute("x"), y = element.getAttribute("y");
          element.setAttribute("font-size", choice.font);
          const resizedInk = nodeLabelInkRect(element, element.getBBox());
          element.setAttribute("x", +x + choice.glyph.x - resizedInk.x);
          element.setAttribute("y", +y + choice.glyph.y - resizedInk.y);
          const actual = nodeLabelInkRect(element, element.getBBox());
          Object.assign(rect, {x:actual.x,y:actual.y,width:actual.width,height:actual.height,position:"compact-final"});
          segments = rebuildPlans();
          const after = metrics();
          const reducedBenefit = choice.font >= Number(originalFont) || after.invalid < before.invalid
            || after.nodes < before.nodes || after.traversals < before.traversals || after.crossings < before.crossings;
          if (after.text === 0 && after.branches === 0 && after.crossings <= before.crossings
            && reducedBenefit && after.visual < before.visual - 1e-6) {
            changed = true; moves++; break;
          }
          Object.assign(rect, saved); element.setAttribute("x", x); element.setAttribute("y", y);
          element.setAttribute("font-size", originalFont);
          segments = rebuildPlans();
        }
      }
      if (!changed) break;
    }
    group.dataset.compactMoves = moves;
    group.dataset.compactLengthBefore = startingLength.toFixed(3);
    group.dataset.compactLengthAfter = metrics().length.toFixed(3);
    group.dataset.fontLeaderCostBefore = startingMetrics.visual.toFixed(3);
    group.dataset.fontLeaderCostAfter = metrics().visual.toFixed(3);
    // Two neighbouring pointers can cross even when both labels are clean.
    // Move the costlier route into the opposite quadrant while keeping text,
    // branches, nodes and every other pointer no worse.
    let crossingSwaps = 0;
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (const [aId,bId] of leaderCrossingPairs(segments).slice(0,8)) {
        if (layout.manualLabels.has(aId) || layout.manualLabels.has(bId)) continue;
        const a = placements.find(r => idFor(r) === aId), b = placements.find(r => idFor(r) === bId);
        if (!a || !b) continue;
        const ea = elements.get(aId), eb = elements.get(bId), before = metrics();
        const saved = [{...a}, {...b}], attrs = [[ea.getAttribute("x"),ea.getAttribute("y")],
          [eb.getAttribute("x"),eb.getAttribute("y")]];
        const pair=[a,b], worse=leaderVisualCost(plans.get(aId))>=leaderVisualCost(plans.get(bId))?0:1, moving=pair[worse], reference=pair[1-worse];
        const available=bounds || {left:0,top:0,right:layout.currentSvgSize.width,bottom:layout.currentSvgSize.height};
        const target={x:reference.x+reference.width/2<moving.node.x?moving.node.x-moving.width-12:moving.node.x+12,y:reference.y+reference.height/2>moving.node.y?moving.node.y-moving.height-12:moving.node.y+12,width:moving.width,height:moving.height};
        const restricted=target.x>moving.node.x?{...available,labelLeft:Math.max(available.labelLeft??available.left,moving.node.x+4)}:{...available,right:Math.min(available.right,moving.node.x-4)};
        const targets=pair.map(rect=>({x:rect.x,y:rect.y})); targets[worse]=nearestBranchFreeRectWithinBounds(target,branches,restricted,3,[...tips,...placements.filter(rect=>rect!==moving)]);
        [[a,ea,targets[0]],[b,eb,targets[1]]].forEach(([rect,element,target]) => {
          const ink = nodeLabelInkRect(element,element.getBBox());
          element.setAttribute("x",+element.getAttribute("x")+target.x-ink.x);
          element.setAttribute("y",+element.getAttribute("y")+target.y-ink.y);
          const actual = nodeLabelInkRect(element,element.getBBox());
          Object.assign(rect,actual,{position:"crossing-swap"});
        });
        segments = rebuildPlans();
        const after = metrics();
        if (after.text === 0 && after.branches === 0 && after.crossings < before.crossings
          && after.invalid <= before.invalid && after.traversals <= before.traversals
          && after.nodes <= before.nodes) { changed = true; crossingSwaps++; continue; }
        [a,b].forEach((rect,i) => Object.assign(rect,saved[i]));
        [[ea,attrs[0]],[eb,attrs[1]]].forEach(([element,[x,y]]) => {
          element.setAttribute("x",x); element.setAttribute("y",y);
        });
        segments = rebuildPlans();
      }
      if (!changed) break;
    }
    group.dataset.crossingSwaps = crossingSwaps;
  }
  leaderGroup.replaceChildren();
  group.querySelectorAll(".node-label-backdrop").forEach(element => element.remove());
  segments = rebuildPlans();
  for (const rect of placements) {
    const id = idFor(rect), element = elements.get(id), plan = plans.get(id);
    element.dataset.autoPosition = rect.position || element.dataset.autoPosition || "automatic";
    rect.leaderTextHits = arrows ? plan.obstacleHits : 0;
    rect.leaderNodeHits = arrows ? plan.nodeHits : 0;
    rect.leaderGeometryInvalid = arrows && nodeArrowGeometryExcess(plan.axisAngle, plan.length) > 0;
    rect.leaderGeometryReason = nodeArrowGeometryReason(plan.axisAngle, plan.length);
    const ownership = phylogenyLabelOwnership(rect.node, rect, internalNodePoints);
    rect.ownershipUnresolved = !arrows && !ownership.unambiguous;
    // Text never masks the tree; unresolved branch intersections remain
    // visible in the collision report rather than being hidden by a backdrop.
    rect.branchOverlapProtected = false;
    element.dataset.branchOverlapProtected = "false";
    element.dataset.edgeDistance = ownership.ownerDistance.toFixed(3);
    element.dataset.nodeOwnershipClear = String(ownership.unambiguous);
    element.dataset.nodeOwnershipMethod = arrows ? "true-node-arrow" : "nearest-node";
    element.dataset.nearestOtherNodeDistance = Number.isFinite(ownership.nearestOtherDistance)
      ? ownership.nearestOtherDistance.toFixed(3) : "none";
    element.dataset.nearestOtherNodeId = ownership.nearestOtherId || "none";
    element.dataset.leaderPlanCrossings = String(plan.crossings);
    element.dataset.leaderPlanLength = plan.length.toFixed(3);
    element.dataset.layoutTextBox = JSON.stringify({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
    element.dataset.layoutInkBox = JSON.stringify(nodeLabelInkRect(element,rect));
    element.dataset.leaderPlanObstacleHits = String(plan.obstacleHits);
    element.dataset.leaderPlanLeaderHits = String(plan.leaderHits);
    element.dataset.leaderPlanNodeHits = String(plan.nodeHits);
    element.dataset.nodeArrowDrawn = String(arrows && appendNodeLabelArrow(leaderGroup, rect.node, rect, plan, id, kind));
  }
  return segments;
}
return Object.freeze({layoutSupportLabelSteps,refineReadableNodeLabelSteps});
}
return Object.freeze({create});
});
