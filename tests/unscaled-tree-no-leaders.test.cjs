const test = require("node:test");
const assert = require("node:assert/strict");
const geometry = require("../core/label-geometry.js");
const treeGeometry = require("../core/tree-geometry.js");
const conflictSupportFactory = require("../render/conflict-support.js");

test("shouldUseNodeLeaderLines suppresses leader arrows whenever branch lengths are not displayed", () => {
  assert.equal(typeof geometry.shouldUseNodeLeaderLines, "function");
  assert.equal(typeof geometry.profileHasBranchLengths, "function");

  const withLengths = treeGeometry.branchLengthDisplayProfile({
    id: "r", length: null, children: [
      { id: "a", label: "A", length: 0.1, children: [] },
      { id: "n", length: 0.05, children: [
        { id: "b", label: "B", length: 0.12, children: [] },
        { id: "c", label: "C", length: 0.08, children: [] },
      ] },
    ],
  });
  const withoutLengths = treeGeometry.branchLengthDisplayProfile({
    id: "r", length: null, children: [
      { id: "a", label: "A", length: null, children: [] },
      { id: "n", length: null, children: [
        { id: "b", label: "B", length: null, children: [] },
        { id: "c", label: "C", length: null, children: [] },
      ] },
    ],
  });

  assert.equal(geometry.profileHasBranchLengths(withLengths), true);
  assert.equal(geometry.profileHasBranchLengths(withoutLengths), false);

  // Phylogram with real branch lengths keeps user-requested arrows.
  assert.equal(geometry.shouldUseNodeLeaderLines(true, {
    workspaceMode: "phylogeny", layoutMode: "phylogram", hasBranchLengths: true,
  }), true);
  assert.equal(geometry.shouldUseNodeLeaderLines(false, {
    workspaceMode: "phylogeny", layoutMode: "phylogram", hasBranchLengths: true,
  }), false);

  // Unscaled topology layouts and branchless inputs never draw leader lines.
  assert.equal(geometry.shouldUseNodeLeaderLines(true, {
    workspaceMode: "phylogeny", layoutMode: "cladogram", hasBranchLengths: true,
  }), false);
  assert.equal(geometry.shouldUseNodeLeaderLines(true, {
    workspaceMode: "phylogeny", layoutMode: "aligned", hasBranchLengths: true,
  }), false);
  assert.equal(geometry.shouldUseNodeLeaderLines(true, {
    workspaceMode: "phylogeny", layoutMode: "phylogram", hasBranchLengths: false,
  }), false);

  // Conflict tanglegrams are equal-step cladograms on both sides: no leader lines.
  assert.equal(geometry.shouldUseNodeLeaderLines(true, {
    workspaceMode: "conflict",
  }), false);

  // Dated chronograms retain user-requested leader behaviour.
  assert.equal(geometry.shouldUseNodeLeaderLines(true, {
    workspaceMode: "time",
  }), true);
  assert.equal(geometry.shouldUseNodeLeaderLines(false, {
    workspaceMode: "time",
  }), false);
});

test("tight non-arrow candidates sit cleanly at upper-left, lower-left, or right without touching branches or node markers", () => {
  assert.equal(typeof geometry.directNodeLabelPenalty, "function");
  const node = { x: 200, y: 150 };
  const branches = [
    { x1: 140, y1: 150, x2: 200, y2: 150 }, // incoming parent horizontal branch
    { x1: 200, y1: 120, x2: 200, y2: 180 }, // vertical split
    { x1: 200, y1: 120, x2: 320, y2: 120 }, // upper child branch
    { x1: 200, y1: 180, x2: 320, y2: 180 }, // lower child branch
  ];
  const width = 40, height = 14, nodeRadius = 5;
  const defaultPool = geometry.candidatePlacements(node, width, height, 192, branches, { width: 800, height: 600 });
  const arrowPool = geometry.candidatePlacements(node, width, height, 192, branches, { width: 800, height: 600 }, { arrows: true, nodeRadius });
  assert.deepEqual(arrowPool, defaultPool, "arrow-enabled candidate pool must remain byte-for-byte unchanged");

  const tightPool = geometry.candidatePlacements(node, width, height, 192, branches, { width: 800, height: 600 }, { arrows: false, nodeRadius })
    .map(c => ({ ...c, width, height }))
    .filter(rect => !geometry.supportRectCrossesBranch(rect, branches, 3)
      && geometry.leaderGeometry(node, rect).edgeDistance > nodeRadius + 1);

  const findSlot = pos => tightPool.find(c => c.position === pos && c.edgeDistance <= nodeRadius + 2);
  const leftTop = findSlot("left-top");
  const leftBottom = findSlot("left-bottom");
  const rightCenter = findSlot("right-center");
  assert.ok(leftTop, "tight upper-left slot must clear branches and r=5 marker");
  assert.ok(leftBottom, "tight lower-left slot must clear branches and r=5 marker");
  assert.ok(rightCenter, "tight right-center slot must clear branches and r=5 marker");

  const pLeftTop = geometry.directNodeLabelPenalty(node, leftTop, -1);
  const pLeftBottom = geometry.directNodeLabelPenalty(node, leftBottom, -1);
  const pRightCenter = geometry.directNodeLabelPenalty(node, rightCenter, -1);
  assert.ok(pLeftTop < pLeftBottom && pLeftBottom < pRightCenter,
    "left-rooted tree prefers upper-left, then lower-left, then right-center");

  // Mirrored right-rooted tree in conflict workspace prefers upper-right, lower-right, then left-center.
  const rightTop = { x: node.x + 4.5, y: node.y - height - 4.5, width, height };
  const rightBottom = { x: node.x + 4.5, y: node.y + 4.5, width, height };
  const leftCenter = { x: node.x - width - 6.5, y: node.y - height / 2, width, height };
  assert.ok(
    geometry.directNodeLabelPenalty(node, rightTop, 1) < geometry.directNodeLabelPenalty(node, rightBottom, 1)
    && geometry.directNodeLabelPenalty(node, rightBottom, 1) < geometry.directNodeLabelPenalty(node, leftCenter, 1),
    "right-rooted mirrored tree prefers upper-right, then lower-right, then left-center",
  );
});

test("regular unscaled ladder tree places wide and narrow labels tightly without arrows or collisions", () => {
  // Narrow horizontal step (22 px) with wide label '100/–' (44 px) on a middle child whose left side is blocked
  // by the parent vertical bar: must cleanly choose the open right-center cavity rather than drifting far away.
  const support = conflictSupportFactory.create({
    svgEl: (tag, attrs = {}, text = "") => ({ tag, attrs, text, children: [], append(...c) { this.children.push(...c); } }),
    measureText: (text, size) => ({ width: text.length === 1 ? 9 : 44, ascent: size * 0.78, descent: size * 0.22, height: size * 0.8 }),
    appendNodeLabelArrow: () => { throw new Error("Must not append arrows when leaderLines=false"); },
    geometry,
  });
  const branches = [
    // Parent at x=100 spanning y=80..220 (trifurcating so y=150 has vertical bar both above and below at x=100)
    { x1: 100, y1: 80, x2: 100, y2: 220 },
    { x1: 100, y1: 80, x2: 300, y2: 80 },
    { x1: 100, y1: 150, x2: 122, y2: 150 }, // short 22px step to node N(122, 150)
    { x1: 100, y1: 220, x2: 300, y2: 220 },
    // Focal node N at (122, 150) with wide open cavity on the right (y=120..180)
    { x1: 122, y1: 120, x2: 122, y2: 180 },
    { x1: 122, y1: 120, x2: 300, y2: 120 },
    { x1: 122, y1: 180, x2: 300, y2: 180 },
  ];
  const entries = [{ node: { id: "n1" }, position: { x: 122, y: 150 }, side: "left", annotation: { text: "100/–" } }];
  const steps = support.layoutSteps(entries, {
    branches, tipRects: [], nodePoints: [{ id: "conflict:left:p", x: 100, y: 150 }, { id: "conflict:left:n1", x: 122, y: 150 }],
    leftBounds: { left: 8, right: 290, top: 40, bottom: 260 }, rightBounds: {},
  }, { fonts: { preferred: 16, minimum: 12 }, font: {}, nodeRadius: 5, leaderLines: false, canvasSize: { width: 800, height: 400 } });
  let step;
  while (!(step = steps.next()).done) {}
  assert.equal(step.value.unplacedCount, 0);
  assert.equal(step.value.placed.length, 1);
  const placed = step.value.placed[0];
  assert.equal(placed.fontSize, 16, "must preserve preferred font size in the right-hand cavity");
  assert.ok(placed.rect.x > 122 && placed.rect.x <= 130, `expected tight right-side placement near x=128.5, got x=${placed.rect.x}`);
  assert.ok(Math.abs((placed.rect.y + placed.rect.height / 2) - 150) <= 2, "expected vertically centered placement on the right of the node");
});

test("crowded terminal split without leader lines slightly reduces font to stay tightly tucked at upper-left instead of floating above child corner", () => {
  // Exact geometry from 41-tip Sapindales tanglegram node n0 (cx=251.69, cy=803.52):
  // Left corridor between x=214.15 and x=251.69 is 37.54px wide (net 31.54px after 3px branch clearance).
  // At preferred font 18, '98.0' is 32px wide (just 0.5px too wide for tight upper-left, tempting a drift to y=784 above child branch y=787.96).
  // Without leader lines, the solver must slightly step down font (e.g. 17) so '98.0' stays tightly tucked at n0's upper-left!
  const support = conflictSupportFactory.create({
    svgEl: (tag, attrs = {}, text = "") => ({ tag, attrs, text, children: [], append(...c) { this.children.push(...c); } }),
    measureText: (_text, size) => ({ width: size * (32 / 18), ascent: size * 0.78, descent: size * 0.22, height: size * 0.85 }),
    appendNodeLabelArrow: () => { throw new Error("Must not append arrows when leaderLines=false"); },
    geometry,
  });
  const branches = [
    { x1: 214.15, y1: 741.29, x2: 214.15, y2: 834.63 },
    { x1: 232.92, y1: 803.52, x2: 232.92, y2: 865.74 },
    { x1: 232.92, y1: 803.52, x2: 251.69, y2: 803.52 },
    { x1: 251.69, y1: 787.96, x2: 251.69, y2: 819.07 },
    { x1: 251.69, y1: 787.96, x2: 289.23, y2: 787.96 },
    { x1: 251.69, y1: 819.07, x2: 270.46, y2: 819.07 },
    { x1: 270.46, y1: 808.70, x2: 270.46, y2: 829.44 },
  ];
  const entries = [{ node: { id: "n0" }, position: { x: 251.69, y: 803.52 }, side: "left", annotation: { text: "98.0" } }];
  const steps = support.layoutSteps(entries, {
    branches,
    tipRects: [],
    nodePoints: [{ id: "conflict:left:n0", x: 251.69, y: 803.52 }, { id: "conflict:left:c1", x: 270.46, y: 819.07 }],
    leftBounds: { left: 8, right: 285, top: 40, bottom: 900 },
    rightBounds: {},
  }, { fonts: { preferred: 18, minimum: 12 }, font: {}, nodeRadius: 5, leaderLines: false, canvasSize: { width: 1500, height: 950 } });
  let step;
  while (!(step = steps.next()).done) {}
  assert.equal(step.value.unplacedCount, 0);
  const placed = step.value.placed[0];
  const edgeDistance = geometry.leaderGeometry({ x: 251.69, y: 803.52 }, placed.rect).edgeDistance;
  assert.ok(edgeDistance <= 8.5, `expected tight placement within 8.5u of node, got edgeDistance=${edgeDistance.toFixed(2)}`);
  assert.ok(placed.rect.x + placed.rect.width <= 251.69 - 3, "label must sit cleanly to the left of n0's vertical split rather than straddling above the child corner");
});
