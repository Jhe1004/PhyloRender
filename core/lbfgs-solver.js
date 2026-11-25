/*
 * Pure JavaScript deterministic L-BFGS quasi-Newton minimizer.
 * Zero DOM, filesystem, network, or global application state dependencies.
 */
(function exposeLbfgsSolver(root, factory) {
  const api = factory();
  root.PhyloRenderLBFGS=api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLbfgsSolver() {
  'use strict';

  function dot(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
  }

  function infNorm(v) {
    let max = 0;
    for (let i = 0; i < v.length; i++) {
      const abs = Math.abs(v[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  function minimize(evaluate, x0, options = {}) {
    const n = x0.length;
    const x = Float64Array.from(x0);
    const g = new Float64Array(n);
    let f = evaluate(x, g);
    if (!n || !Number.isFinite(f)) return { x, f, iterations: 0, converged: n === 0 };

    const m = options.memory ?? 16;
    const maxIter = options.maxIterations ?? 1000;
    const gtol = options.gtol ?? 1e-11;
    const ftol = options.ftol ?? 1e-15;
    const sList = [], yList = [], rhoList = [];
    const alphaBuf = new Float64Array(m);
    const xNext = new Float64Array(n), gNext = new Float64Array(n), q = new Float64Array(n);

    for (let iter = 0; iter < maxIter; iter++) {
      if (infNorm(g) <= gtol) return { x, f, iterations: iter, converged: true };

      for (let i = 0; i < n; i++) q[i] = -g[i];
      const k = sList.length;
      for (let i = k - 1; i >= 0; i--) {
        const a = rhoList[i] * dot(sList[i], q);
        alphaBuf[i] = a;
        const y = yList[i];
        for (let j = 0; j < n; j++) q[j] -= a * y[j];
      }
      if (k > 0) {
        const sLast = sList[k - 1], yLast = yList[k - 1];
        const yy = dot(yLast, yLast);
        const gamma = yy > 0 ? dot(sLast, yLast) / yy : 1;
        for (let j = 0; j < n; j++) q[j] *= gamma;
      }
      for (let i = 0; i < k; i++) {
        const b = rhoList[i] * dot(yList[i], q);
        const s = sList[i], diff = alphaBuf[i] - b;
        for (let j = 0; j < n; j++) q[j] += diff * s[j];
      }

      let dg = dot(g, q);
      if (!(dg < 0)) {
        sList.length = 0; yList.length = 0; rhoList.length = 0;
        for (let i = 0; i < n; i++) q[i] = -g[i];
        dg = -dot(g, g);
      }

      let step = k === 0 ? 1 / Math.max(1, infNorm(q)) : 1, accepted = false, fNext = f;
      let lo = 0, hi = Infinity;
      const c1 = 1e-4, c2 = 0.9;
      for (let ls = 0; ls < 48; ls++) {
        for (let i = 0; i < n; i++) xNext[i] = x[i] + step * q[i];
        fNext = evaluate(xNext, gNext);
        if (!Number.isFinite(fNext) || fNext > f + c1 * step * dg) {
          hi = step;
          step = 0.5 * (lo + hi);
        } else {
          const dgNext = dot(gNext, q);
          if (dgNext >= c2 * dg || hi - lo < 1e-12 * step) { accepted = true; break; }
          lo = step;
          step = Number.isFinite(hi) ? 0.5 * (lo + hi) : step * 2.0;
        }
      }
      if (!accepted && lo > 0) {
        step = lo;
        for (let i = 0; i < n; i++) xNext[i] = x[i] + step * q[i];
        fNext = evaluate(xNext, gNext);
        accepted = true;
      }
      if (!accepted) {
        if (sList.length) { sList.length = 0; yList.length = 0; rhoList.length = 0; continue; }
        return { x, f, iterations: iter, converged: infNorm(g) <= 1e-4 };
      }

      const sVec = new Float64Array(n), yVec = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        sVec[i] = xNext[i] - x[i];
        yVec[i] = gNext[i] - g[i];
        x[i] = xNext[i];
        g[i] = gNext[i];
      }
      const fPrev = f;
      f = fNext;
      const ys = dot(yVec, sVec);
      if (ys > 1e-18 * Math.sqrt(dot(sVec, sVec) * dot(yVec, yVec))) {
        if (sList.length === m) { sList.shift(); yList.shift(); rhoList.shift(); }
        sList.push(sVec); yList.push(yVec); rhoList.push(1 / ys);
      }
      if (Math.abs(fPrev - f) <= ftol * Math.max(1, Math.abs(fPrev), Math.abs(f)) && infNorm(g) <= 1e-5) {
        return { x, f, iterations: iter + 1, converged: true };
      }
    }
    return { x, f, iterations: maxIter, converged: infNorm(g) <= 1e-4 };
  }

  return Object.freeze({ minimize });
});
