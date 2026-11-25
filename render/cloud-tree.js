(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderCloudTreeRenderer=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    for(const name of ["svgEl","publishSize","horizontalLayoutForHeight","appendTipLabelContent","fitTipLabelWidth","updateRankNormalizationStatus","buildCladeBarLayout","drawCladeBars","finalizeCanvas","planRows"])
      if(typeof ports?.[name]!=="function")throw new TypeError("Missing cloud render port: "+name);
    for(const name of ["model","colorModel","jitterModel","jitterLimits","branches","pies","backgroundRenderer","display"])
      if(!ports?.[name])throw new TypeError("Missing cloud render dependency: "+name);
    const {svgEl,publishSize,horizontalLayoutForHeight,appendTipLabelContent,fitTipLabelWidth,updateRankNormalizationStatus,buildCladeBarLayout,drawCladeBars,finalizeCanvas,planRows,model,colorModel,jitterModel,jitterLimits,branches,pies,backgroundRenderer,display}=ports;
    function* renderSteps(config) {
      const {svg,model:cloud,options,timeBackground,timeFonts,tips,unit,fontFamily,cladeSelectionMode,labelSource,provenance,layout={}}=config;
      const baseTipSpacing=config.rowStep;let rowStep=baseTipSpacing;
      const species=cloud.speciesRoot;
      const jitter=jitterModel.validateStrength(options?.jitter ?? jitterLimits.defaultValue,jitterLimits);
      svg.replaceChildren();
      svg.classList.toggle("clade-select-mode",cladeSelectionMode);
  const rightContentReserve = Math.max(260, Number(layout.rightContentReserve) || 0);
  const plotLeft = 72;
  const topAxisY = timeBackground.geologyVisible ? 18 + timeFonts.periodRow + timeFonts.epochRow : 16;
  const treeTop = timeBackground.visible ? topAxisY + timeFonts.axisOffset + 36 : 64;
  const intervals=Math.max(0,tips.length-1);
  let plotBottom = treeTop + intervals * rowStep + 22;
  let bottomPeriodY = plotBottom + 16;
  let bottomAxisY = bottomPeriodY + (timeBackground.geologyVisible ? timeFonts.periodRow : 0);
  let timeContentBottom = bottomAxisY + timeFonts.axisOffset;
  let height = Math.max(650, 330 + tips.length * rowStep + treeTop - 64,
    timeBackground.visible ? timeContentBottom + 20 : 0);
  const automaticRows=planRows({...layout.rowLayout,count:tips.length,intervals,baseSpacing:rowStep,naturalHeight:height});
  const extraHeight=automaticRows.height-height;
  rowStep=automaticRows.spacing;plotBottom+=extraHeight;bottomPeriodY+=extraHeight;bottomAxisY+=extraHeight;timeContentBottom+=extraHeight;height=automaticRows.height;
  const horizontalLayout = {...horizontalLayoutForHeight(height, plotLeft + 1000 + rightContentReserve,
    plotLeft + rightContentReserve, { rightContentReserve: plotLeft + rightContentReserve, workspace: "cloud" }),
    tipSpacing:rowStep,baseTipSpacing,automaticRows};
  const plotWidth = horizontalLayout.plotWidth;
  const plotRight = plotLeft + plotWidth;
  let width = horizontalLayout.canvasWidth;
  svg.setAttribute("width", width); svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.dataset.phylorenderRenderer = cloud.importedDating ? "cloud-imported-dated"
    : cloud.datingEngine === "relative-display"
    ? "cloud-relative-display" : cloud.datingEngine === "bundled-treePL" ? "cloud-bundled-treepl" : "cloud-pl-aligned";
  publishSize({ width, height });
  if (!species) {
    svg.append(svgEl("text", { x: width / 2, y: 275, "text-anchor": "middle", fill: "#34414b", "font-family": fontFamily, "font-size": 26 }, "Gene-tree and species-tree discordance"));
    svg.append(svgEl("text", { x: width / 2, y: 312, "text-anchor": "middle", fill: "#718087", "font-family": fontFamily, "font-size": 16 }, "Import a species tree and all gene trees to calculate node pies and the cloud subset"));
    return {tips:0,matchedCount:0,rangeCounts:null,labels:null,
      layout:{...horizontalLayout,finalWidth:width,finalHeight:height}};
  }
  svg.dataset.cloudTimeBackground = JSON.stringify({ visible: timeBackground.visible,
    geology: timeBackground.visible && timeBackground.geologyVisible, unit: unit, illustrativePalette: timeBackground.illustrativePalette });
  svg.dataset.cloudLadderDirection = options.ladderDirection;
  svg.dataset.cloudHiddenPieNodes = JSON.stringify([...cloud.hiddenPieNodes].sort());
  svg.dataset.cloudPieAgeRange = JSON.stringify({ ...options.pieAgeRange, unit: unit, fossilCalibrated: cloud.importedDating ? null : false });
  svg.append(svgEl("metadata", { id: "cloud-dating-provenance" }, JSON.stringify(provenance.dating)));
  svg.append(svgEl("metadata", { id: "cloud-clade-provenance" }, JSON.stringify(provenance.clades)));
  svg.dataset.cloudLayers = [options.showGene && "gene", options.showSpecies && "species", options.showPies && "pies"].filter(Boolean).join(" ");
  if (provenance.phyParts) svg.append(svgEl("metadata", { id: "cloud-phyparts-provenance" }, JSON.stringify(provenance.phyParts)));
  svg.dataset.cloudSpeciesShape = options.speciesShape;
  const rootAge = options.age;
  if (cloud.datedRootAge !== rootAge || !cloud.datedAges.has(species)) throw new Error("Layout coordinates must be computed for the species tree first");
  const speciesAge = cloud.datedAges.get(species);
  const xOf = age => plotLeft + (rootAge - age) / rootAge * plotWidth;
  const tipOrder = tips.map(tip => tip.label.trim());
  const yFor = function*(root, anchors = null) {
    return yield* branches.alignedRowSteps(root, tipOrder, cloud.datedAges.get(root), rootAge, treeTop, rowStep, anchors);
  };
  const speciesY = options.speciesShape === "rectangular"
    ? model.alignedRows(species, tipOrder, treeTop, rowStep) : yield* yFor(species);
  const cladeColors = branches.cladeColorMap(species, cloud.cladeColors);
  const background = svgEl("rect", { width, height, fill: "#fff" });
  svg.append(background);
  if (timeBackground.visible) {
    if (timeBackground.geologyVisible) {
      const rawPerMya = 1e6 / timeBackground.paletteYears;
      backgroundRenderer.drawTimeBackground(svg, rootAge / rawPerMya, mya => xOf(mya * rawPerMya),
        plotLeft, plotRight, treeTop - 22, plotBottom, bottomPeriodY, timeFonts);
    }
    backgroundRenderer.drawTimeAxis(svg, rootAge, xOf, plotLeft, plotRight, topAxisY, "top", timeBackground, timeFonts);
    backgroundRenderer.drawTimeAxis(svg, rootAge, xOf, plotLeft, plotRight, bottomAxisY, "bottom", timeBackground, timeFonts);
  }
  if (options.showGene && cloud.geneRoots.length) {
    // Even a gene-only view retains the species layout as its reference.
    const sharedRows = yield* model.cladeRowReferenceSteps(species, speciesY);
    const colorReference = cloud.cladeColors.size ? yield* colorModel.referenceSteps(species, cladeColors) : null;
    const geneOpacity = model.effectiveGeneOpacity(options.opacity, cloud.geneRoots.length);
    const geneGroup = svgEl("g", { class: "cloud-gene-lines", fill: "none", stroke: "#52606d",
      "stroke-width": Number(((options.branchWidth||1.2)/1.2).toFixed(6)), "stroke-opacity": geneOpacity,
      "data-configured-opacity": Number((Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : .18).toFixed(6)) });
    for (const [index, root] of cloud.geneRoots.entries()) {
      const ages = cloud.datedAges.get(root);
      if (!ages || !["PhyloRender-pl-aligner", "bundled-treePL"].includes(cloud.geneDatingEngine || cloud.datingEngine)) throw new Error("Gene trees lacking penalized-likelihood display-alignment ages were encountered; rendering aborted");
      yield { phase: "layout", current: index + 1, total: cloud.geneRoots.length };
      const anchors = yield* model.sharedRowAnchorsSteps(root, sharedRows);
      const ys = yield* yFor(root, anchors);
      const geneColors = colorReference ? yield* colorModel.branchColorsSteps(root, colorReference) : null;
      const paths = jitter ? yield* jitterModel.branchPathsSteps(root, ages, ys, xOf,
        { strength:jitter, limits:jitterLimits, rowStep, minimumY:treeTop, maximumY:plotBottom, index }) : null;
      branches.appendTriangularBranches(root, ages, ys, geneGroup, xOf, null, geneColors, false, paths);
    }
    svg.append(geneGroup);
  }
  const speciesBranches = [];
  if (options.showSpecies) {
    const speciesGroup = svgEl("g", { class: "cloud-species-tree", fill: "none", stroke: "#202a30", "stroke-width": Number((2.2*(options.branchWidth||1.2)/1.2).toFixed(6)), "stroke-linecap": "round", "stroke-linejoin": "round" });
    if (options.speciesShape === "rectangular")
      branches.appendRectangularBranches(species, speciesAge, speciesY, speciesGroup, xOf, speciesBranches, cladeColors);
    else branches.appendTriangularBranches(species, speciesAge, speciesY, speciesGroup, xOf, speciesBranches, cladeColors);
    svg.append(speciesGroup);
    const hits = svgEl("g", { class: "cloud-species-hits cloud-editor-only" });
    speciesBranches.filter(edge => edge.child).forEach(edge => {
      const hit = svgEl("path", { class: "clade-hit", "data-clade-node-id": edge.child.id,
        d: `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}` });
      hit.append(svgEl("title", {}, "Species-tree branch: click to assign clade when selection mode is active; right-click to inspect"));
      hits.append(hit);
    });
    model.nodeClades(species).forEach((_, node) => {
      hits.append(svgEl("circle", { class: "clade-node-hit", "data-clade-node-id": node.id,
        cx: xOf(speciesAge.get(node)), cy: speciesY.get(node), r: 6 }));
    });
    svg.append(hits);
  }
  const labels = svgEl("g", { class: "cloud-tip-labels" });
  tips.forEach(tip => {
    const label = svgEl("text", { class: "cloud-tip-label", "data-tip-node-id": tip.id,
      x: plotRight + 8, y: speciesY.get(tip),
      ...(cladeColors.has(tip) && options.tipFollowClade ? { style: `fill:${cladeColors.get(tip)}` } : {}) });
    appendTipLabelContent(label, tip.label, labelSource);
    labels.append(label);
  });
  svg.append(labels);
  fitTipLabelWidth(labels.children);
  updateRankNormalizationStatus(labels);
  const labelBoxes = [...labels.querySelectorAll("text")].map(label => {
    const bounds = label.getBBox();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  // The pie legend and displaced pies must not cover axes or geological keys.
  if (timeBackground.visible) {
    labelBoxes.push({ x: 0, y: 0, width, height: treeTop - 24, layoutOnly: true },
      { x: 0, y: plotBottom + 8, width, height: height - plotBottom - 8, layoutOnly: true });
  }
  const tipRights = new Map([...labels.children].map(label => {
    const box = label.getBBox();
    return [label.dataset.tipNodeId, box.x + box.width];
  }));
  // A detached layout view supplies y positions to the ordinary-tree bar
  // engine; original species nodes, order, lengths and ages stay untouched.
  const layoutView = node => ({ ...node, y: speciesY.get(node), x: xOf(speciesAge.get(node)),
    children: node.children.map(layoutView) });
  const cloudCladeLayout = buildCladeBarLayout(layoutView(species), tipRights, rowStep, labelBoxes.filter(box => !box.layoutOnly), height);
  const cladeBars = svgEl("g", { class: "clade-bars cloud-clade-bars" });
  svg.append(cladeBars);
  drawCladeBars(cladeBars, cloudCladeLayout.items, height);
  labelBoxes.push(...cloudCladeLayout.items.map(item => ({ x: item.x - 6, y: item.occupiedY1,
    width: item.orientation === "vertical" ? item.maximumFontSize + 32 : item.nameWidth + 20,
    height: Math.max(item.occupiedY2 - item.occupiedY1, item.maximumFontSize) })));
  // The full-width top/bottom boxes are only obstacles for pie placement. They
  // already lie inside the canvas and must not manufacture an extra 30 px of
  // output width when the canvas is at its 400 mm ceiling.
  width = Math.max(width, Math.ceil(Math.max(...labelBoxes.filter(box => !box.layoutOnly)
    .map(box => box.x + box.width), 0) + 30));
  width = Math.max(width, cloudCladeLayout.requiredWidth);
  if (width > horizontalLayout.maximumCanvasWidth) {
    throw Object.assign(new Error(`Tip labels, clade labels, or geological scale require at least ${width.toFixed(0)} px and exceed the ${horizontalLayout.maximumWidthMm} mm figure width limit; please shorten display labels.`),
      { code: "FIGURE_WIDTH_CONTENT_LIMIT", requiredWidth: width,
        maximumWidth: horizontalLayout.maximumCanvasWidth, rightContentReserve });
  }
  svg.setAttribute("width", width);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  background.setAttribute("width", width);
  publishSize({ width, height });
  const {matchedCount,rangeCounts,timeFilteredNodes,legendPieObstacles} = yield* pies.renderLayerSteps({
    svg,species,table:options.showPies ? cloud.phyPartsTable : null,speciesAges:speciesAge,speciesY,xOf,
    branches:speciesBranches,options,labelBoxes,hiddenNodes:cloud.hiddenPieNodes,rootAge,
  });
  svg.dataset.cloudTimeFilteredPieNodes = JSON.stringify(timeFilteredNodes.sort());
  if (matchedCount) {
    const legendScale = (options.legendScale ?? 150) / 100;
    const legendSize = options.mode === "four" ? { legendWidth: 260 * legendScale, legendHeight: 210 * legendScale }
      : { legendWidth: 220 * legendScale, legendHeight: 210 * legendScale };
    const position = model.placePieLegend({ width, height, ...legendSize,
      branches: speciesBranches, pies: legendPieObstacles, labelBoxes,
      position: options.legendPosition });
    // With very few tips and large axis fonts, the legend cannot fit beside
    // the tree. Grow a safe footer rather than covering the time scale.
    if (timeBackground.visible && position.y + position.height > plotBottom + 8
      && position.y < timeContentBottom + 12) {
      position.y = timeContentBottom + 24;
      height = Math.max(height, position.y + position.height + 28);
      svg.setAttribute("height", height);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      background.setAttribute("height", height);
      publishSize({ width, height });
    }
    pies.appendLegend(svg, options.mode, position, fontFamily, legendScale);
  }
  ({width,height}=finalizeCanvas({svg,width,height,bounds:svg.getBBox?.()||null,
    maximumWidth:horizontalLayout.maximumCanvasWidth,maximumWidthMm:horizontalLayout.maximumWidthMm,
    contentDescription:"Tip labels, clade labels, concordance pies, or legend",background,publishSize}));
  return {tips:tips.length,matchedCount,rangeCounts,labels,layout:{...horizontalLayout,finalWidth:width,finalHeight:height}};
}


    return Object.freeze({renderSteps});
  }
  return Object.freeze({create});
});
