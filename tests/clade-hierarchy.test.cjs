const test = require("node:test");
const assert = require("node:assert/strict");

const contract = require("../figure-contract.js");
const hierarchy = require("../core/clade-hierarchy.js");
const cladeLayout = require("../core/clade-layout.js");
const panelClades = require("../core/tree-panel-clades.js");

function makeItem(nodeId, tipIds, y1, y2, extra = {}) {
  return {
    nodeId,
    tipIds,
    tipCount: tipIds.length,
    baseX: 220,
    x: 220,
    y1,
    y2,
    titleY1: (y1 + y2) / 2 - 12,
    titleY2: (y1 + y2) / 2 + 6,
    nameWidth: 80,
    maximumFontSize: 18,
    orientation: "vertical",
    ...extra,
  };
}

function dashEndpointCovered(dashArray, totalLength) {
  const parts = dashArray.split(/\s+/).map(Number);
  assert.ok(parts.length === 2 || parts.length === 4, `unexpected dash pattern: ${dashArray}`);
  assert.ok(parts.every(n => Number.isFinite(n) && n > 0));
  // Walk pattern from 0 to totalLength and verify start and end lie inside drawn dashes (even indices).
  let pos = 0;
  let idx = 0;
  let gapCount = 0;
  let endInStroke = false;
  while (pos < totalLength - 1e-6) {
    const seg = parts[idx % parts.length];
    const isStroke = idx % 2 === 0;
    if (!isStroke) gapCount++;
    if (pos + seg >= totalLength - 1e-6) {
      endInStroke = isStroke;
      break;
    }
    pos += seg;
    idx++;
  }
  return { firstStroke: parts[0], gapCount, endInStroke };
}

test("contract exposes frozen cladeBarStyle and cladeTier policies", () => {
  assert.deepEqual(contract.cladeBarStyle, {
    defaultValue: "auto",
    values: ["auto", "solid", "dashed", "dash-dot"],
  });
  assert.deepEqual(contract.cladeTier, { minimum: 0, maximum: 5 });
  assert.equal(Object.isFrozen(contract.cladeBarStyle), true);
  assert.equal(Object.isFrozen(contract.cladeTier), true);
});

test("single-layer non-nested clades remain solid on tier 0 with null dashArray", () => {
  const items = [
    makeItem("c1", ["t1", "t2"], 20, 60),
    makeItem("c2", ["t3", "t4", "t5"], 100, 170),
  ];
  const tipRightEdges = new Map(["t1", "t2", "t3", "t4", "t5"].map(id => [id, 200]));
  const out = cladeLayout.layout(items, { alignment: "aligned", tipRightEdges });
  assert.equal(out.items.length, 2);
  for (const item of out.items) {
    assert.equal(item.nestingTier, 0);
    assert.equal(item.effectiveTier, 0);
    assert.equal(item.effectiveBarStyle, "solid");
    assert.equal(item.dashArray, null);
    assert.equal(item.alignmentColumn, 0);
  }
});

test("nested clades automatically derive solid inner, dashed outer, and dash-dot super-outer styles with cap-locked endpoints", () => {
  const items = [
    makeItem("genus", ["t1", "t2"], 20, 56),
    makeItem("subfamily", ["t1", "t2", "t3", "t4"], 20, 120),
    makeItem("family", ["t1", "t2", "t3", "t4", "t5", "t6"], 20, 190),
  ];
  const tipRightEdges = new Map(["t1", "t2", "t3", "t4", "t5", "t6"].map(id => [id, 200]));
  const out = cladeLayout.layout(items, { alignment: "aligned", tipRightEdges });
  const byId = new Map(out.items.map(i => [i.nodeId, i]));

  assert.equal(byId.get("genus").effectiveTier, 0);
  assert.equal(byId.get("genus").effectiveBarStyle, "solid");
  assert.equal(byId.get("genus").dashArray, null);
  assert.equal(byId.get("genus").alignmentColumn, 0);

  assert.equal(byId.get("subfamily").effectiveTier, 1);
  assert.equal(byId.get("subfamily").effectiveBarStyle, "dashed");
  assert.equal(byId.get("subfamily").alignmentColumn, 1);
  const subCheck = dashEndpointCovered(byId.get("subfamily").dashArray, 100);
  assert.equal(subCheck.endInStroke, true, "dashed bar must terminate inside a solid dash at bottom cap");
  assert.ok(subCheck.gapCount >= 1);

  assert.equal(byId.get("family").effectiveTier, 2);
  assert.equal(byId.get("family").effectiveBarStyle, "dash-dot");
  assert.equal(byId.get("family").alignmentColumn, 2);
  const famCheck = dashEndpointCovered(byId.get("family").dashArray, 170);
  assert.equal(famCheck.endInStroke, true, "dash-dot bar must terminate inside a solid dash at bottom cap");
  assert.ok(famCheck.gapCount >= 2);

  // Even a very short 1-tip or 2-tip dashed bracket must still visibly contain a gap and end on stroke
  for (const shortLen of [12, 28, 59]) {
    const da = hierarchy.bodyDashArray("dashed", shortLen);
    const check = dashEndpointCovered(da, shortLen);
    assert.equal(check.endInStroke, true, `len=${shortLen} must end on stroke`);
    assert.ok(check.gapCount >= 1, `len=${shortLen} must show at least one visible dash gap`);
  }
});

test("explicit tier aligns peer subfamilies onto the same outer dashed column even without annotated subclades", () => {
  // Mirrors Fig. S3(a): 4 subfamilies (Dodonaeoideae, Sapindoideae, Xanthoceroideae, Hippocastanoideae)
  // where only Sapindoideae and Hippocastanoideae contain annotated inner clades.
  const items = [
    makeItem("dodonaeoideae", ["d1", "d2"], 20, 60, { requestedTier: 1 }),
    makeItem("litchi_clade", ["s3", "s4", "s5"], 150, 220),
    makeItem("sapindoideae", ["s1", "s2", "s3", "s4", "s5"], 100, 220, { requestedTier: 1 }),
    makeItem("xanthoceroideae", ["x1", "x2", "x3"], 250, 310, { requestedTier: 1 }),
    makeItem("acer_genus", ["h3", "h4", "h5"], 400, 470),
    makeItem("hippocastanoideae", ["h1", "h2", "h3", "h4", "h5"], 340, 470, { requestedTier: 1 }),
  ];
  const allTips = ["d1", "d2", "s1", "s2", "s3", "s4", "s5", "x1", "x2", "x3", "h1", "h2", "h3", "h4", "h5"];
  const tipRightEdges = new Map(allTips.map(id => [id, 240]));
  const out = cladeLayout.layout(items, { alignment: "aligned", tipRightEdges });
  const byId = new Map(out.items.map(i => [i.nodeId, i]));

  // Inner clades sit in column 0 with solid bars
  for (const id of ["litchi_clade", "acer_genus"]) {
    assert.equal(byId.get(id).alignmentColumn, 0);
    assert.equal(byId.get(id).effectiveBarStyle, "solid");
    assert.equal(byId.get(id).dashArray, null);
  }
  const innerX = byId.get("acer_genus").x;
  assert.equal(byId.get("litchi_clade").x, innerX);

  // All 4 peer subfamilies sit in column 1 at the exact same outer x with dashed bars
  const subfamilies = ["dodonaeoideae", "sapindoideae", "xanthoceroideae", "hippocastanoideae"];
  const outerX = byId.get("sapindoideae").x;
  assert.ok(outerX > innerX + 34);
  for (const id of subfamilies) {
    assert.equal(byId.get(id).alignmentColumn, 1, `${id} should be on outer column 1`);
    assert.equal(byId.get(id).x, outerX, `${id} should share exact outer x`);
    assert.equal(byId.get(id).effectiveBarStyle, "dashed", `${id} should automatically use dashed style`);
    assert.ok(byId.get(id).dashArray, `${id} should carry a dashArray`);
  }
});

test("containment monotonicity overrides under-specified outer tier and validates inputs strictly", () => {
  const items = [
    makeItem("inner", ["a", "b"], 20, 60, { requestedTier: 1 }),
    makeItem("outer", ["a", "b", "c"], 20, 90, { requestedTier: 0, barStyle: "solid" }),
  ];
  const out = cladeLayout.layout(items, {
    alignment: "aligned",
    tipRightEdges: new Map([["a", 100], ["b", 100], ["c", 100]]),
  });
  const byId = new Map(out.items.map(i => [i.nodeId, i]));
  assert.equal(byId.get("inner").effectiveTier, 1);
  assert.equal(byId.get("outer").effectiveTier, 2, "outer clade must never be placed inside or on its child's tier");
  assert.equal(byId.get("outer").effectiveBarStyle, "solid", "explicit bar_style override is respected");
  assert.equal(byId.get("outer").dashArray, null);

  assert.throws(() => hierarchy.normalizeBarStyle("wavy"), /bar_style/);
  assert.throws(() => hierarchy.normalizeTier(-1), /tier/);
  assert.throws(() => hierarchy.normalizeTier(6), /tier/);
  assert.throws(() => hierarchy.normalizeTier(1.5), /tier/);
});

test("whole-tree hierarchy preserves outer dashed style across split panels when inner subclade stays in Panel 1", () => {
  const leaf = id => ({ id, label: id, children: [] });
  const branch = (id, ...children) => ({ id, children });
  const fullTree = branch(
    "root",
    leaf("outgroup"),
    branch(
      "sapindoideae",
      branch("panel1_subclade", leaf("a1"), leaf("a2")),
      branch("panel2_subtree", leaf("b1"), leaf("b2"), leaf("b3")),
    ),
  );
  const groups = {
    cladeColors: new Map([["sapindoideae", "#0072b2"], ["panel1_subclade", "#009988"]]),
    cladeBarStyles: new Map(),
    cladeTiers: new Map(),
  };
  const treeTiers = hierarchy.resolveTreeHierarchy(fullTree, groups);
  assert.equal(treeTiers.get("panel1_subclade").effectiveTier, 0);
  assert.equal(treeTiers.get("sapindoideae").effectiveTier, 1);
  assert.equal(treeTiers.get("sapindoideae").effectiveBarStyle, "dashed");

  // Simulate Panel 2 where only panel2_subtree is rendered and sapindoideae is inherited as enclosing clade
  const panel2Root = fullTree.children[1].children[1];
  const ctx = panelClades.resolvePanelContext(fullTree, { panelNumber: 2, sourceNodeId: "panel2_subtree", root: panel2Root }, groups.cladeColors);
  const target = panelClades.resolveBarTarget(panel2Root, "sapindoideae", ctx);
  const panel2Item = makeItem("sapindoideae", target.tipIds, 20, 80, {
    requestedTier: treeTiers.get("sapindoideae").effectiveTier,
    barStyle: treeTiers.get("sapindoideae").barStyle,
  });
  const out = cladeLayout.layout([panel2Item], {
    alignment: "aligned",
    tipRightEdges: new Map([["b1", 200], ["b2", 200], ["b3", 200]]),
  });
  assert.equal(out.items[0].effectiveBarStyle, "dashed", "Panel 2 continuation bar must retain outer dashed style");
});

test("aligned peer clades share a single column per tier and switch colliding auto titles to horizontal rather than staggering tiers", () => {
  // Case 1 (mirrors Fig. S4a): short 2-tip Dodonaeoideae (y=[20, 90], nameWidth=180 -> title=[-35, 145])
  // sits above 13-tip Sapindoideae (y=[110, 680], nameWidth=150 -> title=[320, 470]).
  // Neither bars ([20,90] vs [110,680]) nor titles ([-35,145] vs [320,470]) overlap -> MUST stay on the same column 1!
  const nonCollidingItems = [
    makeItem("dodonaeoideae", ["d1", "d2"], 20, 90, { requestedTier: 1, nameWidth: 180 }),
    makeItem("tribe_nephelieae", ["s3", "s4", "s5"], 380, 580, { nameWidth: 110 }),
    makeItem("sapindoideae", ["s1", "s2", "s3", "s4", "s5", "s6"], 110, 680, { requestedTier: 1, nameWidth: 150 }),
  ];
  const rights = new Map(["d1", "d2", "s1", "s2", "s3", "s4", "s5", "s6"].map(id => [id, 220]));
  const collinearOut = cladeLayout.layout(nonCollidingItems, { alignment: "aligned", tipRightEdges: rights });
  const collinearById = new Map(collinearOut.items.map(i => [i.nodeId, i]));
  assert.equal(collinearById.get("tribe_nephelieae").alignmentColumn, 0);
  assert.equal(collinearById.get("sapindoideae").alignmentColumn, 1);
  assert.equal(collinearById.get("dodonaeoideae").alignmentColumn, 1, "peer clade must stay on the same column when titles have ample space");
  assert.equal(collinearById.get("dodonaeoideae").x, collinearById.get("sapindoideae").x);

  // Case 2: vertical title-to-title collision within tier 1 -> both stay strictly collinear on column 1, keep vertical text, and stagger labelShiftX
  const collidingItems = [
    makeItem("short_subfamily", ["d1", "d2"], 20, 60, { requestedTier: 1, nameWidth: 180, orientation: "auto" }),
    makeItem("inner_tribe", ["s3", "s4"], 140, 190, { nameWidth: 50, orientation: "auto" }),
    makeItem("major_subfamily", ["s1", "s2", "s3", "s4"], 80, 200, { requestedTier: 1, nameWidth: 160, orientation: "auto" }),
  ];
  const collidingOut = cladeLayout.layout(collidingItems, { alignment: "aligned", tipRightEdges: rights });
  const collidingById = new Map(collidingOut.items.map(i => [i.nodeId, i]));
  assert.equal(collidingById.get("inner_tribe").alignmentColumn, 0);
  assert.equal(collidingById.get("major_subfamily").alignmentColumn, 1, "major enclosing subfamily holds primary tier-1 column");
  assert.equal(collidingById.get("short_subfamily").alignmentColumn, 1, "peer tier-1 clade must stay strictly collinear on column 1");
  assert.equal(collidingById.get("short_subfamily").x, collidingById.get("major_subfamily").x);
  assert.equal(collidingById.get("short_subfamily").orientation, "vertical");
  assert.equal(collidingById.get("major_subfamily").orientation, "vertical");
  assert.notEqual(collidingById.get("short_subfamily").labelShiftX, collidingById.get("major_subfamily").labelShiftX);
});

test("auto alignment tracks per-clade tip lengths for 1 layer and switches to flush right columns when 2+ layers exist", () => {
  const rights = new Map([["a1", 120], ["a2", 120], ["b1", 260], ["b2", 260], ["b3", 260]]);
  // Single layer: each clade follows its own rightmost tip label (120+14=134 vs 260+14=274)
  const singleOut = cladeLayout.layout([
    makeItem("cA", ["a1", "a2"], 20, 60, { baseX: 134, x: 134 }),
    makeItem("cB", ["b1", "b2", "b3"], 120, 190, { baseX: 274, x: 274 }),
  ], { alignment: "auto", tipRightEdges: rights });
  const singleById = new Map(singleOut.items.map(i => [i.nodeId, i]));
  assert.equal(singleById.get("cA").alignment, "nearby");
  assert.equal(singleById.get("cA").x, 134);
  assert.equal(singleById.get("cB").x, 274);

  // Two layers (nested subclade inside cB): automatically switches to flush right alignment behind 260+14=274
  const multiOut = cladeLayout.layout([
    makeItem("cA", ["a1", "a2"], 20, 60, { baseX: 134, x: 134, requestedTier: 1 }),
    makeItem("cB_inner", ["b1", "b2"], 120, 160, { baseX: 274, x: 274 }),
    makeItem("cB_outer", ["b1", "b2", "b3"], 120, 190, { baseX: 274, x: 274, requestedTier: 1 }),
  ], { alignment: "auto", tipRightEdges: rights });
  const multiById = new Map(multiOut.items.map(i => [i.nodeId, i]));
  assert.equal(multiById.get("cB_inner").alignment, "aligned");
  assert.equal(multiById.get("cB_inner").x, 274);
  assert.equal(multiById.get("cA").alignment, "aligned");
  assert.equal(multiById.get("cA").x, multiById.get("cB_outer").x);
  assert.ok(multiById.get("cA").x > 274 + 34);
});

test("same-node multi-tier clades use distinct tier keys and preserve both solid inner and dashed outer tiers", () => {
  const root = { id: "r", children: [{ id: "x", children: [{ id: "x1", children: [] }, { id: "x2", children: [] }] }, { id: "o", children: [] }] };
  const groups = { cladeColors: new Map(), cladeBarStyles: new Map(), cladeTiers: new Map() };
  const k0 = hierarchy.cladeKey("x", 0, groups.cladeColors);
  groups.cladeColors.set(k0, "#009e73"); groups.cladeTiers.set(k0, 0);
  const k1 = hierarchy.cladeKey("x", 1, groups.cladeColors);
  groups.cladeColors.set(k1, "#334155"); groups.cladeTiers.set(k1, 1);
  assert.equal(k0, "x");
  assert.equal(k1, "x::t1");
  assert.equal(hierarchy.baseNodeId(k1), "x");
  const resolved = hierarchy.resolveTreeHierarchy(root, groups);
  assert.equal(resolved.size, 2);
  assert.equal(resolved.get(k0).effectiveTier, 0);
  assert.equal(resolved.get(k0).effectiveBarStyle, "solid");
  assert.equal(resolved.get(k1).effectiveTier, 1);
  assert.equal(resolved.get(k1).effectiveBarStyle, "dashed");
});
