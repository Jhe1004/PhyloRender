(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderConflictRenderer=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    for(const name of ["svgEl","publishSize","horizontalLayoutForHeight","measureTip","appendTipLabelContent","fitTipLabelWidth","displayTipLabel","applyTypography","commitFontSettings","finalizeCanvas"])
      if(typeof ports?.[name]!=="function")throw new TypeError("Missing conflict render port: "+name);
    for(const name of ["model","treeGeometry","branches","support","widthPolicy"])
      if(!ports?.[name])throw new TypeError("Missing conflict render dependency: "+name);
    const {svgEl,publishSize,horizontalLayoutForHeight,measureTip,appendTipLabelContent,fitTipLabelWidth,displayTipLabel,applyTypography,commitFontSettings,finalizeCanvas,
      model,treeGeometry,branches,support,widthPolicy}=ports;

    function* renderSteps(config) {
      const {svg,prepared,groupAssignments,originalPrimary,options,labelSource}=config;
  const leftRoot = prepared.nuclearRoot;
  const rightRoot = prepared.plastidRoot;
  const groupColors = model.buildGroupColors(
    leftRoot, rightRoot, groupAssignments, originalPrimary,
  );
  const leftCount = model.tipNodes(leftRoot).length;
  const rightCount = model.tipNodes(rightRoot).length;
  const rowGap = Number.isFinite(options.tipSpacing) ? options.tipSpacing : Math.max(19, options.tipSize * 1.25);
  const headerHeight = 62;
  const outerGutter = 64;
  const measureLegendText = typeof ports.measureLegendText === "function"
    ? ports.measureLegendText
    : text => String(text ?? "").length * 6.5;
  const maxLegendWidth = Math.max(...groupColors.groups.map(item => 27 + measureLegendText(`${item.name} (${item.count})`) + 14), 0);
  const colsForWidth = w => {
    const avail = Math.max(120, w - 2 * outerGutter);
    if (maxLegendWidth > avail / 2) return 4;
    let cols = 4;
    while (cols > 2 && avail / cols < maxLegendWidth) cols -= 1;
    return cols;
  };
  let legendCols = colsForWidth(Number.isFinite(options.maximumWidth) ? options.maximumWidth : 1000);
  const groupLegendRows = Math.ceil(groupColors.groups.length / legendCols);
  let height = Math.max(500, headerHeight + Math.max(leftCount, rightCount) * rowGap + 45 + groupLegendRows * 22);
  const measuredNames = [leftRoot,rightRoot].map(root => model.tipNodes(root).map(node => measureTip(node.label)));
  const maximumLabelWidth = widthPolicy.maximumTipLabelWidth(measuredNames.flat().map(metrics => metrics.width));
  for (const metrics of measuredNames.flat()) metrics.width = Math.min(metrics.width,maximumLabelWidth);
  const leftLabelWidth = Math.max(80, ...measuredNames[0].map(metrics => metrics.width));
  const rightLabelWidth = Math.max(80, ...measuredNames[1].map(metrics => metrics.width));
  const minimumTreeSpan = Number.isFinite(options.minimumTreeSpan) ? options.minimumTreeSpan : 160;
  const connectorGap = 120;
  const fixedWidth = 2 * outerGutter + leftLabelWidth + rightLabelWidth + connectorGap + 72;
  // Fitted name columns share the natural-width median of both sides.
  // Keep the connector lane and use the remaining positive span for branches.
  const fittedNames = measuredNames.flat().some(metrics => metrics.naturalWidth > metrics.width);
  const minimumPlotWidth = fittedNames && Number.isFinite(options.maximumWidth)
    ? Math.min(2 * minimumTreeSpan, Math.max(1, options.maximumWidth - fixedWidth)) : 2 * minimumTreeSpan;
  const horizontalLayout = horizontalLayoutForHeight(height, fixedWidth + 700, fixedWidth, {
    rightContentReserve: fixedWidth, minimumTreeSpan: minimumPlotWidth,
    workspace: "conflict", manualScale: false,
  });
  const treeSpan = horizontalLayout.plotWidth / 2;
  const leftRootX = outerGutter;
  const leftTipX = leftRootX + treeSpan;
  let width = horizontalLayout.canvasWidth;
  legendCols = colsForWidth(width);
  height = Math.max(height, headerHeight + Math.max(leftCount, rightCount) * rowGap + 45 + Math.ceil(groupColors.groups.length / legendCols) * 22);
  const rightRootX = width - outerGutter;
  const rightTipX = rightRootX - treeSpan;
  const topFor = count => headerHeight + (Math.max(leftCount, rightCount) - count) * rowGap / 2;
  const left = treeGeometry.conflictTreeLayout(leftRoot, { rootX: leftRootX, tipX: leftTipX, top: topFor(leftCount), rowGap });
  const right = treeGeometry.conflictTreeLayout(rightRoot, { rootX: rightRootX, tipX: rightTipX, top: topFor(rightCount), rowGap });
  left.tips.forEach(position => { position.labelMetrics = measureTip(position.node.label); });
  right.tips.forEach(position => { position.labelMetrics = measureTip(position.node.label); });
  applyTypography(svg);
  svg.replaceChildren();
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  // candidatePlacements is shared with ordinary and Dating trees and checks
  // the active canvas boundary. Conflict trees must publish their own canvas
  // size before support labels are evaluated, especially for the mirrored
  // right-hand tree; otherwise every right-side candidate is rejected as if
  // it were outside a stale, narrower figure.
  publishSize({ width, height });

  const leftTipsByKey = new Map(left.tips.map(position => [model.normalizeTipKey(position.node.label), position]));
  const rightTipsByKey = new Map(right.tips.map(position => [model.normalizeTipKey(position.node.label), position]));
  const branchGroup = svgEl("g", { class: "conflict-branches" });
  const branchSegments = [];
  branches.appendBranches(branchGroup, leftRoot, left.positions, branchSegments, "left", groupColors.nuclearNodeGroup, options);
  branches.appendBranches(branchGroup, rightRoot, right.positions, branchSegments, "right", groupColors.plastidNodeGroup, options);
  svg.append(branchGroup);

  // Hit targets belong to the left reference tree only. They have no visible
  // stroke and do not become part of the exported tree geometry.
  const primaryHitGroup = svgEl("g", { class: "conflict-primary-hits" });
  left.positions.forEach((position, node) => {
    if ((node.children || []).length < 2) return;
    const childYs = node.children.map(child => left.positions.get(child).y);
    const branchHit = svgEl("line", {
      class: "conflict-primary-branch-hit",
      x1: position.x, y1: Math.min(...childYs),
      x2: position.x, y2: Math.max(...childYs),
      "data-conflict-primary-node-id": node.id,
    });
    branchHit.append(svgEl("title", {}, "Right-click to swap sister clades at this focal-tree branch"));
    primaryHitGroup.append(branchHit);
    const hit = svgEl("circle", {
      class: "conflict-primary-node-hit", cx: position.x, cy: position.y, r: 10,
      "data-conflict-primary-node-id": node.id,
    });
    hit.append(svgEl("title", {}, "Right-click to swap sister clades at this focal-tree node"));
    primaryHitGroup.append(hit);
  });

  const labelGroup = svgEl("g", { class: "conflict-tip-labels" });
  const leftLabelsByKey = new Map();
  const rightLabelsByKey = new Map();
  left.tips.forEach(position => {
    const key = model.normalizeTipKey(position.node.label);
    const matched = rightTipsByKey.has(key);
    const labelX = position.x + 9;
    const labelY = position.y + options.tipSize * .34;
    const label = svgEl("text", {
      class: `conflict-tip-label${matched ? "" : " unmatched"}`,
      x: labelX,
      y: labelY,
      "data-sample-key": key,
      ...(options.tipFollowClade !== false && groupColors.tipGroup.get(key) ? {
        style: `fill:${groupColors.tipGroup.get(key).color}`,
        "data-group": groupColors.tipGroup.get(key).name,
      } : {}),
      "data-connector-x": "",
    });
    appendTipLabelContent(label, position.node.label, labelSource);
    labelGroup.append(label);
    leftLabelsByKey.set(key, label);
  });
  right.tips.forEach(position => {
    const key = model.normalizeTipKey(position.node.label);
    const matched = leftTipsByKey.has(key);
    const labelX = position.x - 9;
    const labelY = position.y + options.tipSize * .34;
    const label = svgEl("text", {
      class: `conflict-tip-label${matched ? "" : " unmatched"}`,
      x: labelX,
      y: labelY,
      "text-anchor": "end",
      "data-sample-key": key,
      ...(options.tipFollowClade !== false && groupColors.tipGroup.get(key) ? {
        style: `fill:${groupColors.tipGroup.get(key).color}`,
        "data-group": groupColors.tipGroup.get(key).name,
      } : {}),
      "data-connector-x": "",
    });
    appendTipLabelContent(label, position.node.label, labelSource);
    labelGroup.append(label);
    rightLabelsByKey.set(key, label);
  });
  svg.append(labelGroup);
  fitTipLabelWidth(labelGroup.children);
  // Measure the actual mixed italic/roman SVG glyphs, not only their canvas
  // estimates. A curve that starts beside its own name can otherwise bend
  // across a different, longer name on another row.
  const labelBounds = label => {
    const box = label.getBBox();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  const leftLabelBounds = new Map([...leftLabelsByKey].map(([key, label]) => [key, labelBounds(label)]));
  const rightLabelBounds = new Map([...rightLabelsByKey].map(([key, label]) => [key, labelBounds(label)]));
  const tipRects = [...leftLabelBounds.values(), ...rightLabelBounds.values()];
  const laneLeft = Math.max(...[...leftLabelBounds.values()].map(box => box.x + box.width)) + 10;
  const laneRight = Math.min(...[...rightLabelBounds.values()].map(box => box.x)) - 10;
  const connectorGroup = svgEl("g", { class: "conflict-connectors" });
  prepared.comparison.sharedKeys.forEach(key => {
    const leftTip = leftTipsByKey.get(key);
    const rightTip = rightTipsByKey.get(key);
    if (!leftTip || !rightTip) return;
    const leftBox = leftLabelBounds.get(key);
    const rightBox = rightLabelBounds.get(key);
    const leftConnectorX = leftBox.x + leftBox.width + 2.5;
    const rightConnectorX = rightBox.x - 2.5;
    leftLabelsByKey.get(key).setAttribute("data-connector-x", leftConnectorX);
    rightLabelsByKey.get(key).setAttribute("data-connector-x", rightConnectorX);
    const path = svgEl("path", {
      class: "conflict-connector",
      d: model.connectorPath(
        leftConnectorX, leftTip.y, rightConnectorX, rightTip.y, laneLeft, laneRight,
      ),
      ...(groupColors.tipGroup.get(key) ? {
        style: `stroke:${groupColors.tipGroup.get(key).color}`,
        "data-group": groupColors.tipGroup.get(key).name,
      } : {}),
      "data-sample-key": key,
      "data-start-x": leftConnectorX,
      "data-end-x": rightConnectorX,
    });
    path.append(svgEl("title", {}, `${displayTipLabel(leftTip.node.label)}: Primary tree ↔ Comparison tree`));
    connectorGroup.append(path);
  });
  // Keep the curves underneath branches and text even though their exact
  // route is computed only after the labels have been inserted and measured.
  svg.insertBefore(connectorGroup, branchGroup);

  const supportEntries = [
    ...support.entries(leftRoot, left.positions, "left", options.annotations.left),
    ...support.entries(rightRoot, right.positions, "right", options.annotations.right),
  ];
  // Avoid every visible internal-node circle, not only nodes that happen to
  // carry a support value. This matches the ordinary/Dating routing rules.
  const nodePoints = [
    ...[...left.positions.entries()]
      .filter(([node]) => (node.children || []).length)
      .map(([node, position]) => ({ id: `conflict:left:${node.id}`, x: position.x, y: position.y })),
    ...[...right.positions.entries()]
      .filter(([node]) => (node.children || []).length)
      .map(([node, position]) => ({ id: `conflict:right:${node.id}`, x: position.x, y: position.y })),
  ];
  // Preserve UI font-floor commit point after geometry and text measurement.
  const activeOptions = typeof options.resolveFonts === "function"
    ? { ...options, fonts: options.resolveFonts({ tipSpacingPx: rowGap, tipSizePx: options.tipSize, plotWidthPx: treeSpan, maxDepth: Math.max(treeGeometry.conflictTreeDepth(leftRoot), treeGeometry.conflictTreeDepth(rightRoot)) }) }
    : options;
  commitFontSettings(activeOptions);
  const supportLayout = yield* support.layoutSteps(supportEntries, {
    branches: branchSegments,
    tipRects,
    nodePoints,
    leftBounds: { left: 8, right: leftTipX - 12, top: 45, bottom: height - 15 },
    rightBounds: { left: rightTipX + 12, right: width - 8, top: 45, bottom: height - 15 },
  }, {...activeOptions,canvasSize:{width,height}});
  svg.dataset.conflictSupportUnplaced = String(supportLayout.unplacedCount);
  svg.dataset.conflictSupportCandidates = String(supportLayout.evaluatedCandidateCount);
  support.appendLayer(svg, supportEntries, supportLayout, activeOptions);
  svg.append(primaryHitGroup);

  svg.append(svgEl("text", { class: "conflict-tree-title", x: leftRootX, y: 31 },
    options.primaryTitle));
  svg.append(svgEl("text", { class: "conflict-tree-title", x: rightRootX, y: 31, "text-anchor": "end" },
    options.secondaryTitle));

  const legendStartY = headerHeight + Math.max(leftCount, rightCount) * rowGap + 25;
  const legendColumnWidth = (width - 2 * outerGutter) / legendCols;
  groupColors.groups.forEach((item, index) => {
    const x = outerGutter + (index % legendCols) * legendColumnWidth;
    const y = legendStartY + Math.floor(index / legendCols) * 22;
    svg.append(svgEl("line", { class: "conflict-group-swatch", x1: x, y1: y - 4, x2: x + 20, y2: y - 4,
      style: `stroke:${item.color}` }));
    svg.append(svgEl("text", { class: "conflict-legend", x: x + 27, y }, `${item.name} (${item.count})`));
  });
  ({width,height}=finalizeCanvas({svg,width,height,bounds:svg.getBBox?.()||null,
    maximumWidth:horizontalLayout.maximumCanvasWidth,maximumWidthMm:horizontalLayout.maximumWidthMm,
    contentDescription:"Tree titles, tip labels, node annotations, or group legend",publishSize}));

  return {groupColors,supportEntries,supportLayout,branchSegments,
    layout:{...horizontalLayout,finalWidth:width,finalHeight:height}};
}

    return Object.freeze({renderSteps});
  }
  return Object.freeze({create});
});
