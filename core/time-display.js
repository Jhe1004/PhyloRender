(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderTimeDisplay=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
function create(timescale) {
if (!timescale?.periods || !timescale.epochs || typeof timescale.intervalsForRange!=="function")
  throw new TypeError("Missing geological timescale data port");
const GEOLOGIC_PERIODS=timescale.periods, GEOLOGIC_EPOCHS=timescale.epochs;
const TIME_UNITS = Object.freeze({
  years: { years: 1, label: "Years ago (yr)" },
  kyr: { years: 1e3, label: "Thousands of years ago (kyr)" },
  mya: { years: 1e6, label: "Million years ago (Mya)" },
});
const TIME_AGE_SOURCE_LABELS = Object.freeze({
  auto: "Auto (one complete source)",
  branch_lengths: "Time branch lengths",
  height: "height",
  height_mean: "height_mean (posterior mean)",
  height_median: "height_median (posterior median)",
});

Object.values(TIME_UNITS).forEach(Object.freeze);

function unitSettings(source, requestedDisplay = "same") {
  const display = source === "unconfirmed" ? "unconfirmed" : requestedDisplay === "same" ? source : requestedDisplay;
  const sourceYears = TIME_UNITS[source]?.years || null;
  const displayYears = TIME_UNITS[display]?.years || null;
  return {
    source, display,
    factor: sourceYears && displayYears ? sourceYears / displayYears : 1,
    sourceYears,
    label: TIME_UNITS[display]?.label || "Tree units (unconfirmed)",
  };
}

function compactTimeUnitLabel(units) {
  return units.display === "mya" ? "Mya"
    : units.display === "kyr" ? "kyr"
    : units.display === "years" ? "yr"
    : "tree units";
}

function formatTimeAgeRangeValue(rawAge, units) {
  if (!Number.isFinite(rawAge)) return "";
  const displayAge = rawAge * units.factor;
  const magnitude = Math.abs(displayAge);
  const digits = magnitude >= 100 ? 2 : magnitude >= 1 ? 3 : 5;
  return Number(displayAge.toFixed(digits)).toString();
}

function ageWithinRange(rawAge, range) {
  if (!Number.isFinite(rawAge)) return false;
  const { minimumRaw, maximumRaw } = range;
  const tolerance = Math.max(1, Math.abs(rawAge)) * 1e-10;
  return (minimumRaw === null || rawAge + tolerance >= minimumRaw)
    && (maximumRaw === null || rawAge - tolerance <= maximumRaw);
}

function ageRangeFigureLabel(range, units) {
  const { minimumRaw, maximumRaw } = range;
  const unit = compactTimeUnitLabel(units);
  if (minimumRaw === null && maximumRaw === null) return "All nodes";
  if (minimumRaw !== null && maximumRaw !== null) {
    return `${formatTimeAgeRangeValue(minimumRaw, units)}–${formatTimeAgeRangeValue(maximumRaw, units)} ${unit}`;
  }
  if (minimumRaw !== null) return `≥ ${formatTimeAgeRangeValue(minimumRaw, units)} ${unit}`;
  return `≤ ${formatTimeAgeRangeValue(maximumRaw, units)} ${unit}`;
}

function typographySettings(pointSizes = {}, defaults = {}) {
  const fallback = { period: 16.5, epoch: 14.25, legend: 12.75, axis: 15.75, unit: 15, key: 15 };
  const fonts = Object.fromEntries(Object.entries(fallback).map(([type, initial]) => {
    const value = Number(pointSizes[type]);
    const points = Number.isFinite(value) && value >= 3 && value <= 24 ? value : defaults[`${type}_size_pt`] ?? initial;
    return [type, points * 4 / 3];
  }));
  fonts.periodRow = Math.max(32, Math.ceil(fonts.period * 1.5 + 10));
  fonts.epochRow = Math.max(32, Math.ceil(fonts.epoch * 1.5 + 10));
  fonts.axisOffset = Math.max(23, Math.ceil(Math.max(fonts.axis, fonts.unit) + 12));
  return fonts;
}


  return Object.freeze({GEOLOGIC_PERIODS,GEOLOGIC_EPOCHS,GEOLOGIC_SOURCE:timescale.SOURCE,geologicIntervals:timescale.intervalsForRange,TIME_UNITS,TIME_AGE_SOURCE_LABELS,unitSettings,compactTimeUnitLabel,formatTimeAgeRangeValue,ageWithinRange,ageRangeFigureLabel,typographySettings});
}
return Object.freeze({create});
});
