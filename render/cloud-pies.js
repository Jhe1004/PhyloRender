(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderCloudPies=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    if(typeof ports?.svgEl!=="function")throw new TypeError("Missing cloud pie port: svgEl");
    if(!ports?.model)throw new TypeError("Missing cloud pie dependency: model");
    const {svgEl,model}=ports;
function appendHiddenNode(group, item, reason = "manual") {
  // Editor-only affordance: preserve a small node marker and a generous hit
  // target. Neither is a biological annotation or part of the exported figure.
  const marker = svgEl("g", { class: "cloud-hidden-pie-node cloud-editor-only",
    "data-cloud-pie-toggle": item.row.id, role: "button", tabindex: 0,
    "data-hidden-reason": reason,
    "aria-label": `${item.row.id}: configure pie visibility`, "aria-haspopup": "menu" });
  marker.append(svgEl("title", {}, `${item.row.id} · ${reason === "time-range" ? "Outside pie age range" : "Pie hidden"}; click to configure pie visibility`));
  marker.append(svgEl("circle", { cx: item.x, cy: item.y, r: 9, fill: "transparent", "pointer-events": "all" }));
  marker.append(svgEl("circle", { class: "cloud-hidden-pie-marker", cx: item.x, cy: item.y,
    r: 1.5, fill: "#202a30", stroke: "none" }));
  group.append(marker);
}


function appendCloudPieSlices(group, x, y, portions, colors, radius, startAngle = -Math.PI / 2) {
  if (!portions.length) return;
  let cursor = startAngle;
  portions.forEach((fraction, index) => {
    if (fraction <= 0) return;
    if (fraction >= 1 - 1e-9) {
      group.append(svgEl("circle", { cx: x, cy: y, r: radius, fill: colors[index] }));
      return;
    }
    const end = cursor + fraction * Math.PI * 2;
    const x1 = x + radius * Math.cos(cursor), y1 = y + radius * Math.sin(cursor);
    const x2 = x + radius * Math.cos(end), y2 = y + radius * Math.sin(end);
    const large = fraction > .5 ? 1 : 0;
    group.append(svgEl("path", { d: `M ${x} ${y} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`, fill: colors[index] }));
    cursor = end;
  });
  group.append(svgEl("circle", { cx: x, cy: y, r: radius, fill: "none", stroke: "#fff", "stroke-width": 1.1 }));
}

function cloudPie(svgGroup, placement, row, mode, targetRadius) {
  const portions = model.pieFractions(row, mode);
  if (!portions.length) return;
  const { x, y, radius, anchorX, anchorY } = placement;
  const colors = mode === "four" ? ["#4477ad", "#e69f00", "#d94d43", "#aeb5bc"] : ["#4477ad", "#d94d43"];
  const group = svgEl("g", { class: "cloud-pie", "data-phyparts-node": row.id,
    "data-cloud-pie-toggle": row.id, role: "button", tabindex: 0,
    "aria-label": `${row.id}: configure pie visibility`, "aria-haspopup": "menu",
    "data-pie-radius": radius.toFixed(2), "data-pie-target-radius": targetRadius.toFixed(2),
    "data-pie-x": x.toFixed(2), "data-pie-y": y.toFixed(2),
    "data-pie-anchor-x": anchorX.toFixed(2), "data-pie-anchor-y": anchorY.toFixed(2) });
  const title = mode === "four"
    ? `${row.id} · Concordant ${row.concordant} / Main alternative ${row.dominant} / Other conflicting ${row.other} / Uninformative ${row.noSignal}; Total ${row.total}`
    : `${row.id} · Concordant ${row.concordant} / Discordant ${row.conflict}; Informative ${row.informative}, Uninformative ${row.noSignal}`;
  group.append(svgEl("title", {}, `${title}; click to configure pie visibility`));
  if (Math.hypot(x - anchorX, y - anchorY) > radius + 1) {
    group.append(svgEl("line", { class: "cloud-pie-leader", x1: anchorX, y1: anchorY,
      x2: x, y2: y, stroke: "#343f48", "stroke-width": 1.2 }));
    group.append(svgEl("circle", { class: "cloud-pie-anchor", cx: anchorX, cy: anchorY,
      r: 2, fill: "#343f48" }));
  }
  appendCloudPieSlices(group, x, y, portions, colors, radius);
  svgGroup.append(group);
}

function appendCloudLegendArrow(group, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = 3.5, back = 7;
  group.append(svgEl("line", { x1, y1, x2, y2, stroke: "#111", "stroke-width": 1.5 }));
  group.append(svgEl("path", { d: `M ${x2} ${y2} L ${x2 - back * Math.cos(angle) + wing * Math.sin(angle)} ${y2 - back * Math.sin(angle) - wing * Math.cos(angle)} L ${x2 - back * Math.cos(angle) - wing * Math.sin(angle)} ${y2 - back * Math.sin(angle) + wing * Math.cos(angle)} Z`, fill: "#111" }));
}

function appendCloudPieLegend(svg, mode, position, fontFamily, scale = 1) {
  const logicalWidth = position.width / scale;
  const legend = svgEl("g", { id: "cloud-pie-legend-layer", class: "cloud-pie-legend", "data-pie-mode": mode,
    "data-pie-legend-scale": scale,
    "data-layout-x": position.x, "data-layout-y": position.y,
    "data-layout-width": position.width, "data-layout-height": position.height,
    transform: `translate(${position.x} ${position.y}) scale(${scale})`,
    "font-family": fontFamily, fill: "#111" });
  legend.append(svgEl("text", { x: logicalWidth / 2, y: 25, "text-anchor": "middle",
    "font-size": 19, "font-weight": 700 }, "Pie chart key"));
  if (mode === "two") {
    const x = logicalWidth / 2, y = 115, radius = 25;
    // The red upper sector and blue lower sector match the supplied example.
    legend.append(svgEl("circle", { cx: x, cy: y, r: radius, fill: "#4477ad" }));
    const start = -5 * Math.PI / 6, end = -Math.PI / 6;
    legend.append(svgEl("path", { d: `M ${x} ${y} L ${x + radius * Math.cos(start)} ${y + radius * Math.sin(start)} A ${radius} ${radius} 0 0 1 ${x + radius * Math.cos(end)} ${y + radius * Math.sin(end)} Z`, fill: "#d94d43" }));
    legend.append(svgEl("text", { x, y: 54, "text-anchor": "middle", "font-size": 14 }, "Discordant"));
    appendCloudLegendArrow(legend, x, 62, x, 84);
    legend.append(svgEl("text", { x, y: 188, "text-anchor": "middle", "font-size": 14 }, "Concordant"));
    appendCloudLegendArrow(legend, x, 167, x, 145);
  } else {
    const x = 130, y = 112, radius = 22;
    // The exemplar matches the supplied four-way key: amber above, red left,
    // blue right and gray below. Slice colors keep their plot-wide meanings.
    appendCloudPieSlices(legend, x, y, [.22, .23, .40, .15],
      ["#e69f00", "#4477ad", "#aeb5bc", "#d94d43"], radius,
      -Math.PI / 2 - .11 * Math.PI * 2);
    const label = (text, lx, ly, anchor = "middle", size = 12.5) =>
      legend.append(svgEl("text", { x: lx, y: ly, "text-anchor": anchor,
        "font-size": size }, text));
    label("Discordant", x, 51);
    label("(main alternative)", x, 67, "middle", 11.5);
    appendCloudLegendArrow(legend, x, 72, x, 86);
    label("Discordant", 10, 94, "start", 12);
    label("(remaining", 10, 109, "start", 11.5);
    label("alternatives)", 10, 124, "start", 11.5);
    appendCloudLegendArrow(legend, 96, y, 104, y);
    label("Concordant", 166, 116, "start", 12.5);
    appendCloudLegendArrow(legend, 164, y, 156, y);
    label("Uninformative", x, 189);
    appendCloudLegendArrow(legend, x, 168, x, 140);
  }
  svg.append(legend);
}


    function* renderLayerSteps(config) {
      const {svg,species,table,speciesAges,speciesY,xOf,branches,options,labelBoxes,hiddenNodes,rootAge}=config;
  let matchedCount = 0;
  const rangeCounts = { visible: 0, total: 0, filtered: 0, manual: 0 };
  const timeFilteredNodes = [];
  const legendPieObstacles = [];
  if (table) {
    const match = model.matchPhyParts(species, table);
    const pies = svgEl("g", { class: "cloud-pies" });
    const items = [...match.matched].filter(([, row]) =>
      model.pieFractions(row, options.mode).length)
      .map(([node, row]) => ({ node, row, age: speciesAges.get(node), x: xOf(speciesAges.get(node)), y: speciesY.get(node) }));
    // Reserve all placements even when hidden: toggling one pie must not move
    // its neighbours or run PhyParts/treePL again.
    const placements = yield* model.layoutPiePlacementSteps(items, branches, options.radius, labelBoxes, rootAge);
    rangeCounts.total = items.length;
    items.forEach(item => {
      const placement = placements.get(item.node);
      if (!model.pieAgeWithinRange(speciesAges.get(item.node), options.pieAgeRange)) {
        rangeCounts.filtered++;
        timeFilteredNodes.push(item.row.id);
        appendHiddenNode(pies, item, "time-range");
        pies.lastElementChild.setAttribute("data-clade-node-id", item.node.id);
        return;
      }
      if (hiddenNodes.has(item.row.id)) {
        rangeCounts.manual++;
        appendHiddenNode(pies, item);
        pies.lastElementChild.setAttribute("data-clade-node-id", item.node.id);
        return;
      }
      legendPieObstacles.push({ x: placement.x, y: placement.y, r: placement.radius });
      cloudPie(pies, placement, item.row, options.mode,
        model.pieTargetRadius(item.age, rootAge, options.radius));
      pies.lastElementChild.setAttribute("data-clade-node-id", item.node.id);
      pies.lastElementChild.setAttribute("data-pie-node-age", item.age);
      pies.lastElementChild.setAttribute("data-pie-root-age", rootAge);
      pies.lastElementChild.setAttribute("data-pie-size-basis", "relative-node-age");
      matchedCount++;
    });
    svg.append(pies);
  }
  rangeCounts.visible = matchedCount;
  return {matchedCount,rangeCounts,timeFilteredNodes,legendPieObstacles};

    }
    return Object.freeze({appendHiddenNode,appendSlices:appendCloudPieSlices,cloudPie,appendLegend:appendCloudPieLegend,renderLayerSteps});
  }
  return Object.freeze({create});
});
