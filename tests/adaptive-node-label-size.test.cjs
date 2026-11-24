const test = require("node:test");
const assert = require("node:assert/strict");
const contract = require("../figure-contract.js");
const units = require("../figure-units.js");
const geometry = require("../core/label-geometry.js");
const conflictSupportFactory = require("../render/conflict-support.js");

test("contract exposes frozen nodeLabelReadability and defaults automatic_size=true where nodes are supported", () => {
  assert.ok(contract.nodeLabelReadability, "nodeLabelReadability must be exported");
  assert.equal(Object.isFrozen(contract.nodeLabelReadability), true);
  assert.equal(contract.nodeLabelReadability.maximumDesign, 32);
  assert.equal(typeof contract.planAutomaticNodeSize, "function");

  for (const workspace of ["phylogeny", "time", "conflict"]) {
    const d = contract.defaults(workspace);
    assert.equal(d.typography.nodes.automatic_size, true, `${workspace} must default to automatic node sizing`);
  }
  assert.equal(contract.defaults("cloud").typography.nodes, undefined);
});

test("planAutomaticNodeSize scales smoothly across sparse, medium, dense, dated, and narrow-step trees", () => {
  // Sparse 15-tip ordinary tree: roomy row spacing (~58 px) -> scales up to ~26 px, capped by 1.3 * tipSize.
  const sparse = contract.planAutomaticNodeSize({
    automatic: true, tipSpacingPx: 58, tipSizePx: 20, plotWidthPx: 800, maxDepth: 7, minimumSizePx: 9.33,
  });
  assert.equal(sparse.automatic, true);
  assert.ok(sparse.sizePx >= 25.5 && sparse.sizePx <= 26.5, `sparse ordinary size=${sparse.sizePx}`);

  // Medium 41-tip ordinary tree (45.22 px row spacing, 750 px plot width, depth 11) -> ~25.75 px (> 24 px).
  const medium41 = contract.planAutomaticNodeSize({
    automatic: true, tipSpacingPx: 45.22, tipSizePx: 20, plotWidthPx: 750, maxDepth: 11, minimumSizePx: 9.33,
  });
  assert.ok(medium41.sizePx >= 24.5 && medium41.sizePx <= 26.5, `41-tip ordinary size=${medium41.sizePx}`);

  // Medium-large 58-tip ordinary tree (33.5 px row spacing) -> ~22 px (visibly larger than 18 px, smaller than 41-tip).
  const medium58 = contract.planAutomaticNodeSize({
    automatic: true, tipSpacingPx: 33.5, tipSizePx: 20, plotWidthPx: 720, maxDepth: 13, minimumSizePx: 9.33,
  });
  assert.ok(medium58.sizePx >= 21 && medium58.sizePx < medium41.sizePx, `58-tip size=${medium58.sizePx}`);

  // Dense 173-tip ordinary tree (20.5 px compact row spacing) -> converges cleanly to 18 px (13.5 pt).
  const dense173 = contract.planAutomaticNodeSize({
    automatic: true, tipSpacingPx: 20.5, tipSizePx: 20, plotWidthPx: 650, maxDepth: 18, minimumSizePx: 9.33,
  });
  assert.equal(dense173.sizePx, 18);

  // Dated chronogram (tipSizePx=24): compact dated keeps >= 20 px, roomy dated reaches ~27-30 px.
  const datedCompact = contract.planAutomaticNodeSize({
    automatic: true, tipSpacingPx: 25, tipSizePx: 24, plotWidthPx: 700, maxDepth: 16, minimumSizePx: 9.33,
  });
  const datedRoomy = contract.planAutomaticNodeSize({
    automatic: true, tipSpacingPx: 48, tipSizePx: 24, plotWidthPx: 750, maxDepth: 10, minimumSizePx: 9.33,
  });
  assert.ok(datedCompact.sizePx >= 20, `dated compact size=${datedCompact.sizePx}`);
  assert.ok(datedRoomy.sizePx >= 26 && datedRoomy.sizePx <= 30.5, `dated roomy size=${datedRoomy.sizePx}`);

  // Narrow horizontal steps (e.g. 41-tip conflict side treeSpan=225, depth=12) stay compact at 18 px.
  const narrowConflict = contract.planAutomaticNodeSize({
    automatic: true, tipSpacingPx: 20.74, tipSizePx: 20, plotWidthPx: 225, maxDepth: 12, minimumSizePx: 9.33,
  });
  assert.equal(narrowConflict.sizePx, 18);

  // Manual fixed size is preserved verbatim above minimum floor.
  const manual = contract.planAutomaticNodeSize({
    automatic: false, currentSizePx: 19.5, tipSpacingPx: 58, tipSizePx: 20, plotWidthPx: 800, maxDepth: 7, minimumSizePx: 9.33,
  });
  assert.equal(manual.automatic, false);
  assert.equal(manual.sizePx, 19.5);
});

test("explicit node preferred sizes switch automatic_size to false while exported automatic configs round-trip", async () => {
  for (const explicit of [{ preferred_size_u: 14 }, { preferred_size_pt: 15 }, { preferred_size: 20 }]) {
    const normalized = contract.physicalOptions({ typography: { nodes: explicit } });
    assert.equal(normalized.typography.nodes.automatic_size, false);
  }
  const exportedAuto = contract.physicalOptions({
    typography: { nodes: { preferred_size_u: units.designToDrawing(25.75), automatic_size: true } },
  });
  assert.equal(exportedAuto.typography.nodes.automatic_size, true);

  const { FigureStore } = await import("../mcp-server/src/store.mjs");
  const { applyEditOperations } = await import("../mcp-server/src/edits.mjs");
  const store = new FigureStore({});
  const fixture = { main_tree: { content: "((A:1,B:1)95:1,(C:1,D:1)100:1);" } };
  let spec = store.validatedSpec(fixture);
  assert.equal(spec.options.typography.nodes.automatic_size, true);

  spec = store.validatedSpec(applyEditOperations(spec, [{
    op: "set_options", options: { typography: { nodes: { preferred_size_u: 15 } } },
  }]).spec);
  assert.equal(spec.options.typography.nodes.automatic_size, false);
  assert.equal(spec.options.typography.nodes.preferred_size_u, 15);

  spec = store.validatedSpec(applyEditOperations(spec, [{
    op: "set_options", options: { typography: { nodes: { automatic_size: true } } },
  }]).spec);
  assert.equal(spec.options.typography.nodes.automatic_size, true);
});

test("asterisk full-support symbol receives optical size compensation while preserving collision-free clearance", () => {
  assert.equal(typeof geometry.nodeGlyphScale, "function");
  assert.ok(geometry.nodeGlyphScale("*") > 1.3 && geometry.nodeGlyphScale("*") <= 1.45);
  assert.equal(geometry.nodeGlyphScale("100/–"), 1);
  assert.equal(geometry.nodeGlyphScale("98.0"), 1);

  const support = conflictSupportFactory.create({
    svgEl: (tag, attrs = {}, text = "") => ({ tag, attrs, text, children: [], append(...c) { this.children.push(...c); } }),
    measureText: (text, size) => text === "*"
      ? { width: size * 0.39, ascent: size * 0.72, descent: -size * 0.35, height: size * 0.37 }
      : { width: size * 1.6, ascent: size * 0.78, descent: size * 0.22, height: size * 0.8 },
    appendNodeLabelArrow: () => {},
    geometry,
  });
  const branches = [
    { x1: 100, y1: 150, x2: 180, y2: 150 },
    { x1: 180, y1: 110, x2: 180, y2: 190 },
    { x1: 180, y1: 110, x2: 280, y2: 110 },
    { x1: 180, y1: 190, x2: 280, y2: 190 },
  ];
  const entries = [
    { node: { id: "n1" }, position: { x: 180, y: 150 }, side: "left", annotation: { text: "*" } },
  ];
  const steps = support.layoutSteps(entries, {
    branches, tipRects: [], nodePoints: [{ id: "conflict:left:n1", x: 180, y: 150 }],
    leftBounds: { left: 8, right: 275, top: 40, bottom: 260 }, rightBounds: {},
  }, { fonts: { preferred: 24, minimum: 12 }, font: {}, nodeRadius: 3.5, leaderLines: false, canvasSize: { width: 800, height: 400 } });
  let step;
  while (!(step = steps.next()).done) {}
  assert.equal(step.value.unplacedCount, 0);
  const placed = step.value.placed[0];
  assert.ok(Math.abs(placed.fontSize - 24 * geometry.nodeGlyphScale("*")) < 0.01,
    `expected optically compensated asterisk font size, got ${placed.fontSize}`);
});
