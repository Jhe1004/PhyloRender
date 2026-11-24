const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const functionSource = name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}(?! =)`))[0];
const context = require('../core/label-geometry.js');

test('support label shrink cost is convex and respects the seven-point floor', () => {
  const cost = font => context.nodeLabelFontCost(font, 18, 28 / 3);
  assert.equal(cost(18), 0);
  assert.ok(cost(10) > 2 * cost(14));
  assert.equal(cost(9), Infinity);
});

test('a readable label beats a modestly longer pointer, not an extreme one', () => {
  const route = length => context.leaderVisualCost({ crossings: 0, length, axisAngle: 45 });
  const reduced = context.nodeLabelFontCost(10, 18, 28 / 3) + route(14);
  assert.ok(reduced > context.nodeLabelFontCost(18, 18, 28 / 3) + route(42));
  assert.ok(reduced < context.nodeLabelFontCost(18, 18, 28 / 3) + route(70));
});

test('the same score compares all font sizes at both near and far positions', () => {
  const plan = length => ({length, crossings:0, nodeHits:0, leaderHits:0,
    obstacleHits:0, axisAngle:45, anglePenalty:0});
  const score = (font, length) => context.nodeLabelPlacementCost(font, 18, 28/3, plan(length));
  assert.ok(score(18, 42) < score(28/3, 14),
    'a somewhat farther full-sized annotation beats a tiny nearby annotation');
  assert.ok(score(28/3, 14) < score(18, 140),
    'an extreme leader can still justify reducing the font');
  assert.equal(context.nodeLabelPlacementCost(18,18,28/3,
    {...plan(14), obstacleHits:1}), Infinity,
    'a pointer through another text label is never a candidate');
});
