(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderTimeBackground=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    for (const name of ["svgEl","timeTextWidth","niceTickStep"]) {
      if(typeof ports?.[name] !== "function") throw new TypeError("Missing time background port: "+name);
    }
    if(!ports.display?.GEOLOGIC_PERIODS || !ports.display?.GEOLOGIC_EPOCHS) throw new TypeError("Missing time display model");
    const {svgEl,timeTextWidth,niceTickStep}=ports;
    if(typeof ports.display.geologicIntervals!=="function" || typeof ports.grid?.append!=="function") throw new TypeError("Missing geological data/grid port");
const MIN_SHRUNK_FONT_PX = 4;
function fitGeologicLabel(interval, width, epoch = false, fonts) {
  const size = epoch ? fonts.epoch : fonts.period;
  const weight = epoch ? 650 : 750;
  const choices = [[interval.name, 14, size * .01], [interval.shortName, 8, 0], [interval.tinyName, 7, 0]];
  const seen = new Set();
  let shortest = "";
  for (const [label, padding, letterSpacing] of choices) {
    if (!label || seen.has(label)) continue;
    seen.add(label);
    shortest = label;
    if (width >= timeTextWidth(label, size, weight, letterSpacing) + padding) return { label, fontSize: null, shrunk: false };
  }
  const available = width - Math.min(4, Math.max(2, width * .18));
  const natural = shortest && available > 0 ? timeTextWidth(shortest, size, weight, 0) : 0;
  if (!(natural > 0)) return { label: "", fontSize: null, shrunk: false };
  let fitted = Math.min(size, size * (available / natural));
  while (fitted >= MIN_SHRUNK_FONT_PX && timeTextWidth(shortest, fitted, weight, 0) > available) fitted -= .25;
  if (fitted < MIN_SHRUNK_FONT_PX) return { label: "", fontSize: null, shrunk: false };
  return { label: shortest, fontSize: Math.floor(fitted * 100) / 100, shrunk: true };
}
function geologicLabelForWidth(interval, width, epoch = false, fonts) {
  return fitGeologicLabel(interval, width, epoch, fonts).label;
}
function geologicAbbreviationEntries(axisMax, plotWidth, fonts) {
  if (!(Number.isFinite(axisMax) && axisMax > 0 && Number.isFinite(plotWidth) && plotWidth > 0)) return [];
  const {periods,epochs}=ports.display.geologicIntervals(axisMax);
  const entries = [];
  const seen = new Set();
  for (const [collection, epoch] of [[periods, false], [epochs, true]]) {
    for (const interval of collection) {
      const span = Math.min(axisMax, interval.older) - Math.max(0, interval.younger);
      if (!(span > 0)) continue;
      const label = geologicLabelForWidth(interval, plotWidth * span / axisMax, epoch, fonts);
      if (!label) continue;
      if (label === interval.name || seen.has(label)) continue;
      seen.add(label);
      entries.push(Object.freeze({ label, name: interval.name, fill: interval.fill, epoch }));
    }
  }
  return entries;
}
function appendGeologicBlock(group, interval, rowY, rowHeight, axisMax, xForAge, className = "", fonts) {
  const older = Math.min(axisMax, interval.older);
  const younger = Math.max(0, interval.younger);
  if (older <= younger) return;
  const x1 = xForAge(older), x2 = xForAge(younger), width = x2 - x1;
  const rect = svgEl("rect", {
    class: `time-geo-block ${className.includes("time-epoch-label") ? "time-epoch-block" : "time-period-block"}`,
    x: x1, y: rowY, width, height: rowHeight, fill: interval.fill,
    "data-geologic-rank":interval.rank, "data-geologic-informal":interval.informal || null,
  });
  rect.append(svgEl("title", {}, `${interval.name} (${interval.rank}) · ${interval.olderApproximate ? "~" : ""}${interval.older}–${interval.youngerApproximate ? "~" : ""}${interval.younger} Mya`));
  group.append(rect);
  const fitted = fitGeologicLabel(interval, width, className.includes("time-epoch-label"), fonts);
  const { label, fontSize, shrunk } = fitted;
  const omitted = !label, compact = Boolean(label) && label !== interval.name;
  const sourceX = x1 + width / 2, sourceY = rowY + rowHeight / 2;
  rect.setAttribute("data-full-name", interval.name);
  rect.setAttribute("data-label-placement", omitted ? "omitted" : "inside");
  if (!omitted) group.append(svgEl("text", {
    class: `time-geo-label ${className} ${compact ? "compact" : ""} ${shrunk ? "shrunk" : ""}`.trim(),
    x: sourceX, y: sourceY, "data-full-name": interval.name, "data-display-label": label,
    ...(shrunk ? { "data-label-shrunk": "true", style: `font-size:${fontSize}px` } : {}),
  }, label));
  return { hidden: omitted, interval, label, compact, shrunk, fontSize, sourceX, sourceY, x1, x2, rowY, rowHeight };
}
function appendGeologicGrid(...args) {
  return ports.grid.append(svgEl,...args);
}
function drawTimeBackground(svg, axisMax, xForAge, plotLeft, plotRight, plotTop, plotBottom, bottomPeriodY, fonts) {
  const {periods,epochs}=ports.display.geologicIntervals(axisMax);
  const geology = svgEl("g", {class:"time-geology",
    "data-timescale-version":ports.display.GEOLOGIC_SOURCE.version,
    "data-timescale-maximum-ma":ports.display.GEOLOGIC_SOURCE.maximumMa});
  const topPeriods = [], bottomPeriods = [];
  periods.forEach(period => {
    const older = Math.min(axisMax, period.older), younger = Math.max(0, period.younger);
    if (older <= younger) return;
    const x1 = xForAge(older), x2 = xForAge(younger);
    // Fill the reserved padding too; keep the period row, tree and axes fixed.
    geology.append(svgEl("rect", { class: "time-background", x: x1, y: plotTop, width: x2 - x1, height: bottomPeriodY - plotTop, fill: period.background }));
    topPeriods.push(appendGeologicBlock(geology, period, 10, fonts.periodRow, axisMax, xForAge, "", fonts));
    bottomPeriods.push(appendGeologicBlock(geology, period, bottomPeriodY, fonts.periodRow, axisMax, xForAge, "", fonts));
  });
  const epochY = 12 + fonts.periodRow;
  const epochBlocks = epochs.map(epoch => appendGeologicBlock(geology, epoch, epochY, fonts.epochRow, axisMax, xForAge, "time-epoch-label", fonts));
  appendGeologicGrid(geology, topPeriods, 10, fonts.periodRow, "period-top");
  appendGeologicGrid(geology, epochBlocks, epochY, fonts.epochRow, "epoch-top");
  appendGeologicGrid(geology, bottomPeriods, bottomPeriodY, fonts.periodRow, "period-bottom");
  svg.append(geology);
}
function drawTimeAxis(svg, axisMax, xForAge, plotLeft, plotRight, axisY, position = "bottom", units, fonts) {
  const group = svgEl("g", { class: `time-axis time-axis-${position}` });
  group.append(svgEl("line", { class: "time-axis-line", x1: plotLeft, y1: axisY, x2: plotRight, y2: axisY }));
  const displayMax = axisMax * units.factor;
  let step = niceTickStep(displayMax);
  // Coarsen ticks when their requested font cannot fit; never shrink the font.
  const numberWidth = Math.max(timeTextWidth(Number(displayMax.toPrecision(10)).toString(), fonts.axis),
    timeTextWidth(Number(step.toPrecision(10)).toString(), fonts.axis));
  while ((plotRight - plotLeft) * step / displayMax < numberWidth + 14) step *= 2;
  for (let index = 0; index * step <= displayMax + step * .01; index++) {
    const displayAge = index * step;
    const x = xForAge(Math.min(displayAge / units.factor, axisMax));
    group.append(svgEl("line", { class: "time-axis-tick", x1: x, y1: axisY, x2: x, y2: axisY + 7 }));
    group.append(svgEl("text", { class: "time-axis-label", x, y: axisY + fonts.axisOffset }, Number(displayAge.toPrecision(10)).toString()));
  }
  group.append(svgEl("text", {
    class: "time-axis-unit", x: plotRight + 14 + timeTextWidth("0", fonts.axis) / 2, y: axisY + fonts.axisOffset,
    "text-anchor": "start",
  }, units.label));
  svg.append(group);
}
    return Object.freeze({geologicLabelForWidth,geologicAbbreviationEntries,appendGeologicBlock,appendGeologicGrid,drawTimeBackground,drawTimeAxis});
  }
  return Object.freeze({create});
});
