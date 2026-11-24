(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderTimeTree=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    const required=["svgEl","appendNodeLabelArrow","enableLabelDrag","refineReadableNodeLabelSteps","countResidualCollisions","updateLabelWarnings","horizontalLayoutForHeight","publishGeometry","appendTipLabelContent","fitTipLabelWidth","composeTimeNodeAnnotation","buildCladeBarLayout","drawCladeBars","drawRetainedNodeLabels","finalizeCanvas","planRows"];
    for(const name of required) if(typeof ports?.[name] !== "function") throw new TypeError("Missing time tree port: "+name);
    for(const name of ["geometry","treeGeometry","display","scale","background"]) if(!ports?.[name]) throw new TypeError("Missing time tree dependency: "+name);
    const {svgEl,appendNodeLabelArrow,enableLabelDrag,refineReadableNodeLabelSteps,countResidualCollisions,updateLabelWarnings,horizontalLayoutForHeight,publishGeometry,appendTipLabelContent,fitTipLabelWidth,composeTimeNodeAnnotation,buildCladeBarLayout,drawCladeBars,drawRetainedNodeLabels,finalizeCanvas,planRows,geometry,display,scale,background,treeGeometry}=ports;
    const {clampRectToBounds,leaderGeometry,timeAgeMaximumEdgeDistance,nearestBranchFreeRectWithinBounds,timeAgeCandidatePlacements,supportRectCrossesBranch,readableFontSizes,rectsOverlap,segmentIntersectsRect,sampleNodeLabelCandidates,nodeLabelPlacementCost,timeAgeLeaderTriggerDistance,routeSegments}=geometry;
    const {tipCount}=treeGeometry;
function* placeTimeNodeLabelSteps(
  nodes, ageGroup, leaderGroup, tipGroup, bounds, branchSegments, internalNodePoints = [], config,
) {
  const { preferred, minimum } = config.fonts;
  const auto = config.auto;
  const leaderRouteForPlacement = (...args) => geometry.leaderRouteForPlacement(...args, config.nodeRadius);
  const tipRects = [...tipGroup.children].map(element => {
    const box = element.getBBox();
    return { x: box.x, y: box.y, width: box.width, height: box.height, kind: "tip" };
  });
  const obstacles = [...tipRects];
  const leaderSegments = [];
  const placed = [];
  const orderedNodes = [...nodes]
    .filter(node => node.displayNodeLabel)
    .sort((a, b) => a.y - b.y || b.timeAge - a.timeAge);

  for (const [index, node] of orderedNodes.entries()) {
    yield { phase: "labels", current: index + 1, total: orderedNodes.length };
    const id = node.incomingEdgeId || node.id;
    const labelText = node.displayNodeLabel;
    const labelClass = /[—–]/.test(labelText)
      ? "node-label time-age-label support-threshold-mark"
      : "node-label time-age-label";
    const text = svgEl("text", {
      class: labelClass,
      x: -1000,
      y: -1000,
      "font-size": preferred,
      "data-node-id": node.id,
      "data-age": node.timeAge * config.units.factor,
      "data-age-raw": node.timeAge,
      "data-node-x": node.x,
      "data-node-y": node.y,
      "data-label-id": id,
      "data-label-left": bounds.labelLeft ?? bounds.left,
      "data-label-right": bounds.right,
      "data-label-top": bounds.top - 2,
      "data-label-bottom": bounds.bottom + 2,
    }, labelText);
    ageGroup.append(text);
    const manual = config.manualLabels.get(id);
    let chosen = null;
    let chosenFont = preferred;
    let chosenPlan = null;
    let chosenScore = Infinity;
    let measured = text.getBBox();

    if (manual) {
      const fontReduction = Number.isFinite(manual.fontReduction) ? manual.fontReduction : 0;
      chosenFont = Math.max(minimum, preferred - fontReduction);
      text.setAttribute("font-size", chosenFont);
      measured = text.getBBox();
      const x = Number.isFinite(manual.dx) ? node.x + manual.dx : manual.x;
      const y = Number.isFinite(manual.dy) ? node.y + manual.dy : manual.y;
      const intended = clampRectToBounds(
        { x, y, width: measured.width, height: measured.height, position: "manual" },
        bounds,
      );
      if (leaderGeometry(node, intended).edgeDistance <= timeAgeMaximumEdgeDistance(measured.width, measured.height)) {
        chosen = nearestBranchFreeRectWithinBounds(intended, branchSegments, bounds, 3);
      } else {
        const intendedCenter = { x: intended.x + intended.width / 2, y: intended.y + intended.height / 2 };
        chosen = timeAgeCandidatePlacements(node, measured.width, measured.height, bounds, branchSegments)
          .filter(rect => !supportRectCrossesBranch(rect, branchSegments, 3))
          .sort((a, b) => {
            const distance = rect => Math.hypot(
              rect.x + rect.width / 2 - intendedCenter.x,
              rect.y + rect.height / 2 - intendedCenter.y,
            );
            return distance(a) - distance(b);
          })[0] || intended;
      }
      manual.dx = chosen.x - node.x;
      manual.dy = chosen.y - node.y;
    } else {
      const arrows = config.arrows;
      for (const font of auto ? readableFontSizes(preferred, minimum) : [preferred]) {
        text.setAttribute("font-size", font);
        const box = text.getBBox();
        const width = box.width, height = box.height;
        const legal = timeAgeCandidatePlacements(node, width, height, bounds, branchSegments).filter(rect =>
          !supportRectCrossesBranch(rect, branchSegments, 3)
          && !obstacles.some(other => rectsOverlap(rect, other, 2))
          && !leaderSegments.some(segment => segmentIntersectsRect(segment, rect, 1.5))
          && internalNodePoints.every(point => Math.hypot(point.x - node.x, point.y - node.y) < .75
            || leaderGeometry(point, rect).edgeDistance > Math.max(3, config.nodeRadius || 5) + 1));
        for (const rect of sampleNodeLabelCandidates(node, legal, width, height)) {
          yield;
          const plan = leaderRouteForPlacement(
            node, rect, branchSegments, obstacles, leaderSegments, internalNodePoints,
          );
          const score = nodeLabelPlacementCost(font, preferred, minimum, plan, {
            distance: rect.edgeDistance, arrows,
          });
          if (score < chosenScore - 1e-6 || (Math.abs(score - chosenScore) < 1e-6 && font > chosenFont)) {
            chosen = rect;
            chosenPlan = plan;
            chosenScore = score;
            chosenFont = font;
          }
        }
      }
    }

    if (!chosen) {
      if (auto && !manual) {
        text.remove();
        continue;
      }
      const localCandidates = timeAgeCandidatePlacements(node, measured.width, measured.height, bounds, branchSegments);
      chosen = localCandidates.find(rect => !supportRectCrossesBranch(rect, branchSegments, 1))
        || localCandidates[0]
        || {
          x: Math.min(Math.max(4, node.x - measured.width - 4), bounds.right - measured.width - 4),
          y: Math.min(Math.max(bounds.top - 2, node.y + 4), bounds.bottom - measured.height + 2),
          width: measured.width,
          height: measured.height,
          position: "local-fallback",
        };
    }

    text.setAttribute("font-size", chosenFont);
    measured = text.getBBox();
    // Italic fonts can overhang to the left of the SVG text anchor. Align the
    // actual glyph box, not merely the anchor, with the collision-tested rect.
    const measuredAnchorX = Number(text.getAttribute("x"));
    const measuredXOffset = measured.x - measuredAnchorX;
    text.setAttribute("x", chosen.x - measuredXOffset);
    const measuredBaselineOffset = measured.y - Number(text.getAttribute("y"));
    text.setAttribute("y", chosen.y - measuredBaselineOffset);
    text.setAttribute("text-anchor", "start");
    text.dataset.position = chosen.position || "automatic";
    const finalBox = text.getBBox();
    const finalRect = {
      x: finalBox.x,
      y: finalBox.y,
      width: finalBox.width,
      height: finalBox.height,
      nodeId: node.id,
      labelId: id,
      kind: "time-age",
      node,
    };
    const edgeDistance = leaderGeometry(node, finalRect).edgeDistance;
    const leaderTriggerDistance = timeAgeLeaderTriggerDistance(finalRect);
    text.setAttribute("data-edge-distance", edgeDistance.toFixed(3));
    text.setAttribute("data-leader-trigger-distance", leaderTriggerDistance.toFixed(3));
    const nodeArrowsEnabled = config.arrows;
    text.setAttribute("data-leader-required", String(nodeArrowsEnabled));
    text.setAttribute("data-node-arrow-required", String(nodeArrowsEnabled));
    const finalPlan = leaderRouteForPlacement(
      node, finalRect, branchSegments, obstacles, leaderSegments, internalNodePoints,
    );
    const arrowDrawn = nodeArrowsEnabled && appendNodeLabelArrow(leaderGroup, node, finalRect, finalPlan, id, "time");
    text.setAttribute("data-node-arrow-drawn", String(arrowDrawn));
    if (arrowDrawn) {
      routeSegments(finalPlan.points).forEach(segment => leaderSegments.push({ ...segment, labelId: id }));
    }
    enableLabelDrag(text, id);
    placed.push(finalRect);
    obstacles.push(finalRect);
  }

  const finalLeaderSegments = yield* refineReadableNodeLabelSteps(
    placed, ageGroup, leaderGroup, tipGroup, branchSegments,
    internalNodePoints, "time", auto, bounds,
  );
  const collisions = countResidualCollisions(placed, branchSegments, tipRects, finalLeaderSegments, ageGroup);
  ageGroup.dataset.unplacedCount = String(orderedNodes.length - placed.length);
  updateLabelWarnings(placed);
  return { count: placed.length, collisions };
}


    function* renderSteps({svg,root,stats,profile,units,timeFonts,spacing:baseTipSpacing,options,cladeColors,manualLabels,labelSettings}) {
      let spacing=baseTipSpacing;
      const reuseLabelLayout=options.reuseLabelLayout;
      const drawTimeBackground=(...args)=>background.drawTimeBackground(...args,timeFonts);
      const drawTimeAxis=(...args)=>background.drawTimeAxis(...args,timeFonts);
  const tick = scale.niceTickStep(profile.maximumAge);
  const axisMax = Number.isFinite(options.printTimeAxisMaximum) && options.printTimeAxisMaximum > 0
    ? options.printTimeAxisMaximum
    : scale.niceAxisMaximum(profile.maximumAge, tick);
  const geologyVisible = Boolean(units.sourceYears) && options.geology === "standard";
  const topAxisY = geologyVisible ? 18 + timeFonts.periodRow + timeFonts.epochRow : 16;
  const plotTop = topAxisY + timeFonts.axisOffset + 12;
  const intervals = Math.max(0, stats.tips - 1) + (options.panelGapRows || 0);
  let plotBottom = plotTop + 44 + intervals * spacing;
  let bottomPeriodY = plotBottom + 16;
  let axisY = bottomPeriodY + (geologyVisible ? timeFonts.periodRow : 0);
  let height = axisY + timeFonts.axisOffset + 20;
  const automaticRows = planRows({...options.rowLayout,count:stats.tips,intervals,baseSpacing:spacing,naturalHeight:height});
  const extraHeight = automaticRows.height-height;
  spacing=automaticRows.spacing;plotBottom+=extraHeight;bottomPeriodY+=extraHeight;axisY+=extraHeight;height=automaticRows.height;
  const horizontalLayout = {...horizontalLayoutForHeight(height, 940, 176, {
    reuseGeometry: reuseLabelLayout, rightContentReserve: options.rightContentReserve,
  }),tipSpacing:spacing,baseTipSpacing,automaticRows};
  const plotLeft = 56;
  const plotWidth = horizontalLayout.plotWidth;
  const plotRight = plotLeft + plotWidth;
  let tipPosition = 0;
  function assign(node) {
    node.x = plotLeft + ((axisMax - node.timeAge) / axisMax) * plotWidth;
    node.children.forEach(assign);
    node.y = node.children.length
      ? node.children.reduce((sum, child) => sum + child.y, 0) / node.children.length
      : (()=>{
          tipPosition += Math.max(0,Number(node.panelGapBeforeRows)||0);
          const y=plotTop+22+tipPosition*spacing;
          tipPosition+=1;
          return y;
        })();
  }
  assign(root);
  svg.setAttribute("data-root-x", String(root.x));
  svg.setAttribute("data-root-y", String(root.y));
  let width = horizontalLayout.canvasWidth;
  const xForAge = age => plotLeft + ((axisMax - Math.max(0, Math.min(axisMax, age))) / axisMax) * plotWidth;
  svg.setAttribute("width", width); svg.setAttribute("height", height); svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  publishGeometry({ width, height });
  publishGeometry(null, horizontalLayout);
  if (geologyVisible) {
    const toRawAge = mya => mya * 1e6 / units.sourceYears;
    drawTimeBackground(svg, axisMax / toRawAge(1), mya => xForAge(toRawAge(mya)), plotLeft, plotRight, plotTop, plotBottom, bottomPeriodY);
  }
  drawTimeAxis(svg, axisMax, xForAge, plotLeft, plotRight, topAxisY, "top", units);

  const hpdGroup = svgEl("g", { class: "time-hpd-bars" });
  const branchGroup = svgEl("g", { class: "time-branches" });
  const interactionGroup = svgEl("g", { class: "clade-interactions" });
  const leaderGroup = svgEl("g", { class: "time-age-leaders" });
  const nodeGroup = svgEl("g", { class: "time-nodes" });
  const ageGroup = svgEl("g", { class: "time-ages" });
  const tipGroup = svgEl("g", { class: "time-tips" });
  const cladeBarGroup = svgEl("g", { class: "clade-bars" });
  svg.append(hpdGroup, branchGroup, interactionGroup, leaderGroup, nodeGroup, ageGroup, tipGroup, cladeBarGroup);
  const internalNodes = [];
  const timeInternalNodePoints = [];
  let nodeAnnotationCount = 0;
  const timeBranchSegments = [];
  function draw(node, inheritedColor = null) {
    const nodeColor = cladeColors.get(node.id) || inheritedColor;
    if (node.children.length) {
      const ageInRange = display.ageWithinRange(node.timeAge, options.ageRange);
      const showTimeAge = options.showAges && ageInRange;
      timeInternalNodePoints.push({ id: node.incomingEdgeId || node.id, x: node.x, y: node.y });
      const ys = node.children.map(child => child.y);
      branchGroup.append(svgEl("line", {
        class: "branch time-branch", x1: node.x, y1: Math.min(...ys), x2: node.x, y2: Math.max(...ys),
        ...(nodeColor ? { style: `stroke:${nodeColor}` } : {}),
      }));
      timeBranchSegments.push({ x1: node.x, y1: Math.min(...ys), x2: node.x, y2: Math.max(...ys) });
      node.children.forEach(child => {
        const childColor = cladeColors.get(child.id) || nodeColor;
        branchGroup.append(svgEl("line", {
          class: "branch time-branch",
          x1: node.x, y1: child.y, x2: child.x, y2: child.y,
          "data-clade-node-id": child.id,
          ...(childColor ? { style: `stroke:${childColor}` } : {}),
        }));
        const branchSubject = child.children.length ? `Clade (${tipCount(child)} tips)` : `Tip ${child.label.replaceAll("_", " ")}`;
        const hit = svgEl("line", {
          class: "clade-hit", x1: node.x, y1: child.y, x2: child.x, y2: child.y,
          "data-clade-node-id": child.id,
          "data-tip-count": tipCount(child),
          role: "button",
          "aria-label": `${branchSubject}; right-click to inspect`,
        });
        hit.append(svgEl("title", {}, `${branchSubject}; right-click to inspect`));
        interactionGroup.append(hit);
        timeBranchSegments.push({ x1: node.x, y1: child.y, x2: child.x, y2: child.y });
        draw(child, nodeColor);
      });
      const hpdScope = options.hpdScope;
      if (options.showHpd && node.timeHpd
        && (hpdScope === "all" || cladeColors.has(node.id))) {
        const x1 = xForAge(node.timeHpd[1]), x2 = xForAge(node.timeHpd[0]);
        const thickness = Number(options.hpdThickness);
        const color = options.hpdColor;
        const opacity = Number(options.hpdOpacity);
        hpdGroup.append(svgEl("rect", { class: "time-hpd", x: x1, y: node.y - thickness / 2,
          width: Math.max(1, x2 - x1), height: thickness, fill: color, "fill-opacity": opacity,
          "data-node-id": node.id, "data-hpd": node.timeHpd.join("–") }));
        const markerField = options.hpdMarker;
        const markerAge = markerField === "height_mean" ? node.timeMean
          : markerField === "height_median" ? node.timeMedian : null;
        if (markerAge !== null && markerAge >= node.timeHpd[0] && markerAge <= node.timeHpd[1]) {
          const markerX = xForAge(markerAge);
          hpdGroup.append(svgEl("line", { class: "time-hpd-point", x1: markerX, x2: markerX,
            y1: node.y - thickness / 2 - 2, y2: node.y + thickness / 2 + 2,
            stroke: color, "stroke-width": 1.7, "data-node-id": node.id,
            "data-statistic": markerField, "data-age": markerAge * units.factor }));
        }
      }
      if (node.incomingEdgeId) {
        interactionGroup.append(svgEl("circle", {
          class: "clade-node-hit", cx: node.x, cy: node.y, r: 11,
          "data-clade-node-id": node.id,
          "data-tip-count": tipCount(node),
          role: "button",
          "aria-label": `Clade (${tipCount(node)} tips); right-click to inspect`,
        }));
      }
      if (showTimeAge) {
        nodeGroup.append(svgEl("circle", {
          class: "node-dot time-node time-age-marker", "data-node-id": node.id,
          "data-age": node.timeAge * units.factor, "data-age-raw": node.timeAge,
          cx: node.x, cy: node.y, r: labelSettings.nodeRadius,
        }));
      }
      const timeText = showTimeAge
        ? (node.timeAge * units.factor).toFixed(Number(options.ageDecimals))
        : null;
      const annotation = composeTimeNodeAnnotation(node, timeText);
      if (annotation.text || showTimeAge) nodeAnnotationCount++;
      if (annotation.text) {
        node.displayNodeLabel = annotation.text;
        internalNodes.push(node);
      }
    } else {
      const label = svgEl("text", {
        class: "tip-label time-tip-label", x: plotRight + 9, y: node.y, "data-tip-node-id": node.id,
        ...(nodeColor && options.tipFollowClade ? { style: `fill:${nodeColor}` } : {}),
      });
      appendTipLabelContent(label, node.label);
      tipGroup.append(label);
    }
  }
  draw(root, options.inheritedCladeColor || null);
  fitTipLabelWidth(tipGroup.children);
  const tipBounds = tipGroup.getBBox();
  width = Math.max(width, Math.ceil(tipBounds.x + tipBounds.width + 50));
  svg.setAttribute("width", width);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  publishGeometry({ width, height });
  publishGeometry(null, { ...horizontalLayout, finalWidth: width, finalHeight: height });
  const tipRightEdges = new Map([...tipGroup.children].map(label => {
    const box = label.getBBox();
    return [label.getAttribute("data-tip-node-id"), box.x + box.width];
  }));
  const cladeBarLayout = buildCladeBarLayout(root, tipRightEdges, spacing, [...tipGroup.children].map(label => label.getBBox()), height);
  width = Math.max(width, cladeBarLayout.requiredWidth);
  svg.setAttribute("width", width);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  publishGeometry({ width, height });
  const activeLabelSettings = typeof labelSettings.resolveFonts === "function"
    ? { ...labelSettings, fonts: labelSettings.resolveFonts({ tipSpacingPx: spacing, plotWidthPx: plotWidth, maxDepth: stats.maxDepth }) }
    : labelSettings;
  const ageLayout = reuseLabelLayout ? drawRetainedNodeLabels(internalNodes.filter(node => node.displayNodeLabel),
    ageGroup, leaderGroup, tipGroup, timeBranchSegments, "time", timeInternalNodePoints) : yield* placeTimeNodeLabelSteps(
    internalNodes,
    ageGroup,
    leaderGroup,
    tipGroup,
    { left: plotLeft, labelLeft: 0, right: plotRight, top: plotTop, bottom: plotBottom },
    timeBranchSegments,
    timeInternalNodePoints,
    { ...activeLabelSettings, units, manualLabels },
  );
  drawTimeAxis(svg, axisMax, xForAge, plotLeft, plotRight, axisY, "bottom", units);
  drawCladeBars(cladeBarGroup, cladeBarLayout.items, height);
  ({width,height}=finalizeCanvas({svg,width,height,bounds:svg.getBBox(),rightPadding:50,bottomPadding:8,
    maximumWidth:options.maximumWidth,maximumWidthMm:options.maximumWidthMm,
    contentDescription:"Tip labels, node ages, or clade labels",publishSize:size=>publishGeometry(size)}));
  publishGeometry(null, { ...horizontalLayout, finalWidth: width, finalHeight: height });

      return {tipGroup,nodeAnnotationCount,collisions:ageLayout.collisions,hpdShownCount:hpdGroup.querySelectorAll(".time-hpd").length};
    }
    return Object.freeze({placeTimeNodeLabelSteps,renderSteps});
  }
  return Object.freeze({create});
});
