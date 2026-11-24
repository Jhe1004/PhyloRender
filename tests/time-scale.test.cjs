const test = require("node:test");
const assert = require("node:assert/strict");
const { niceTickStep, niceAxisMaximum } = require("../time-scale.js");

test("100 Ma treePL rounding noise stays on a 100 Ma axis", () => {
  const maximumAge = 100.00000200000001;
  const tick = niceTickStep(maximumAge);
  assert.equal(tick, 20);
  assert.equal(niceAxisMaximum(maximumAge, tick), 100);
});

test("values meaningfully beyond a tick boundary still expand the axis", () => {
  assert.equal(niceTickStep(104), 50);
  assert.equal(niceAxisMaximum(104, 50), 150);
});

test("ordinary time ranges receive readable five-interval ticks", () => {
  assert.equal(niceTickStep(60), 20);
  assert.equal(niceAxisMaximum(60), 60);
  assert.equal(niceTickStep(9.8), 2);
  assert.equal(niceAxisMaximum(9.8), 10);
});
