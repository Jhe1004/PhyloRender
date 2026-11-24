(function initTimeScale(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhyloRenderTimeScale = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTimeScale() {
  function nearlyEqual(a, b, relativeTolerance = 1e-6) {
    return Math.abs(a - b) <= relativeTolerance * Math.max(1, Math.abs(a), Math.abs(b));
  }

  function niceTickStep(maximumAge) {
    const age = Number(maximumAge);
    if (!Number.isFinite(age) || age <= 0) return 1;
    const target = age / 5;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const normalized = target / magnitude;
    const factor = normalized < 1 || nearlyEqual(normalized, 1) ? 1
      : normalized < 2 || nearlyEqual(normalized, 2) ? 2
        : normalized < 5 || nearlyEqual(normalized, 5) ? 5 : 10;
    return factor * magnitude;
  }

  function niceAxisMaximum(maximumAge, tick = niceTickStep(maximumAge)) {
    const age = Number(maximumAge), step = Number(tick);
    if (!Number.isFinite(age) || age <= 0 || !Number.isFinite(step) || step <= 0) return 1;
    const ratio = age / step;
    const nearest = Math.round(ratio);
    const units = nearlyEqual(ratio, nearest) ? nearest : Math.ceil(ratio);
    return Math.max(step, units * step);
  }

  return Object.freeze({ nearlyEqual, niceTickStep, niceAxisMaximum });
});
