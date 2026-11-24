const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const functionSource = name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];
const context = require('../core/label-geometry.js');

test("a leader detects another node circle but excludes its own endpoint", () => {
  const points = [{ x: 0, y: 0 }, { x: 20, y: 20 }];
  const nodes = [
    { id: "owner", x: 0, y: 0 },
    { id: "crossed", x: 10, y: 10 },
    { id: "clear", x: 10, y: 18 },
  ];
  assert.equal(context.leaderNodeCrossingCount(points, nodes, points[0], 3), 1);
});

test("node-circle crossings are costly without overwhelming every typography choice", () => {
  const clear = { nodeHits: 0, crossings: 0, length: 14, axisAngle: 45 };
  const nodeHit = { ...clear, nodeHits: 1 };
  const branchHit = { ...clear, crossings: 1 };
  const angled = { ...clear, axisAngle: 75 };
  assert.ok(context.leaderVisualCost(nodeHit) > context.leaderVisualCost(branchHit));
  assert.ok(context.leaderVisualCost(nodeHit) > context.leaderVisualCost(angled));
  assert.ok(context.leaderVisualCost(nodeHit) < context.leaderVisualCost({ ...clear, length: 70 }),
    "a long detour is allowed to lose to one visible node-crossing warning");
});
