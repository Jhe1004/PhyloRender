const test = require("node:test");
const assert = require("node:assert/strict");
const panels = require("../core/tree-panels.js");
const cladeLayout = require("../core/clade-layout.js");
const panelClades = require("../core/tree-panel-clades.js");

const leaf = (label, id = label) => ({ id, label, length: 1, children: [] });
const branch = (id, children, length = 1) => ({ id, label: "", length, children });
const count = node => (node.children.length ? node.children.reduce((sum, child) => sum + count(child), 0) : 1);
const labels = node => (node.children.length ? node.children.flatMap(labels) : [node.label]);

test("panel 1 and non-split figures resolve an empty panel clade inheritance context", () => {
  const root = branch("root", [branch("outer", [leaf("A"), leaf("B")])]);
  const colors = new Map([["outer", "#0072b2"]]);
  const plans = panels.plan(root, {
    clone: structuredClone,
    tipCount: count,
    descendantTipLabels: labels,
    ladderize: () => {},
    maximumTips: 76,
  });
  assert.equal(plans.length, 1);
  assert.deepEqual(
    panelClades.resolvePanelContext(root, plans[0], colors),
    {
      rootNodeId: null,
      inheritedColor: null,
      incomingBranchColor: null,
      enclosingNodeIds: [],
      enclosingTipIdsByNodeId: new Map(),
    },
  );
});

test("panel 2 inherits nearest enclosing clade color and lays out multi-tier enclosing + inner clade bars without overlap", () => {
  const extractedSub = branch("extracted", [
    branch("inner-sub", Array.from({ length: 40 }, (_, i) => leaf(`S_${i + 1}`))),
    ...Array.from({ length: 50 }, (_, i) => leaf(`E_${i + 1}`)),
  ]);
  const innerEnclosing = branch("sapindoideae", [
    ...Array.from({ length: 6 }, (_, i) => leaf(`Basal_${i + 1}`)),
    extractedSub,
  ]);
  const outerEnclosing = branch("malvids", [
    leaf("Malvid_base"),
    innerEnclosing,
  ]);
  const sisterClade = branch("dodonaeoideae", Array.from({ length: 12 }, (_, i) => leaf(`D_${i + 1}`)));
  const originalRoot = {
    id: "root",
    label: "",
    length: 0,
    outgroupChildId: "outgroup",
    children: [
      branch("outgroup", [leaf("OUT"), ...Array.from({ length: 10 }, (_, i) => leaf(`U_${i + 1}`))]),
      sisterClade,
      outerEnclosing,
    ],
  };

  const plans = panels.plan(originalRoot, {
    clone: structuredClone,
    tipCount: count,
    descendantTipLabels: labels,
    ladderize: () => {},
    maximumTips: 76,
  });
  assert.equal(plans.length, 2);
  const panel2 = plans[1];
  assert.equal(panel2.sourceNodeId, "extracted");

  const cladeColors = new Map([
    ["malvids", "#cc79a7"],
    ["sapindoideae", "#0072b2"],
    ["dodonaeoideae", "#d55e00"],
    ["inner-sub", "#d95f02"],
  ]);

  const context = panelClades.resolvePanelContext(originalRoot, panel2, cladeColors);
  assert.equal(context.rootNodeId, "extracted");
  assert.equal(context.inheritedColor, "#0072b2");
  assert.equal(context.incomingBranchColor, "#0072b2");
  assert.deepEqual(context.enclosingNodeIds, ["malvids", "sapindoideae"]);

  // Sister clade留在 Panel 1，不应出现在 Panel 2 的分组条目标中
  assert.equal(panelClades.resolveBarTarget(panel2.root, "dodonaeoideae", context), null);

  // Panel 2 内部子分组与外包两层祖先分组应呈现严格真子集 tipIds，使 CladeLayout 逐层外推不重叠
  const innerTarget = panelClades.resolveBarTarget(panel2.root, "inner-sub", context);
  const sapTarget = panelClades.resolveBarTarget(panel2.root, "sapindoideae", context);
  const malvidTarget = panelClades.resolveBarTarget(panel2.root, "malvids", context);
  assert.equal(innerTarget.tips.length, 40);
  assert.equal(sapTarget.tips.length, 90);
  assert.equal(malvidTarget.tips.length, 90);
  assert.equal(sapTarget.tipIds.length, 96);
  assert.equal(malvidTarget.tipIds.length, 97);

  // 验证送入 PhyloRenderCladeLayout 后（nearby 与 aligned 模式），两层外包分组条横坐标严格递增且不重叠
  for (const alignment of ["nearby", "aligned"]) {
    const tipRightEdges = new Map(malvidTarget.tips.map(tip => [tip.id, 300]));
    const prepared = [
      { nodeId: "inner-sub", color: "#d95f02", name: "InnerSub", target: innerTarget },
      { nodeId: "sapindoideae", color: "#0072b2", name: "Sapindoideae", target: sapTarget },
      { nodeId: "malvids", color: "#cc79a7", name: "Malvids", target: malvidTarget },
    ].map(({ nodeId, color, name, target }) => ({
      nodeId,
      color,
      name,
      nameSegments: [{ text: name }],
      nameWidth: 90,
      maximumFontSize: 16,
      orientation: "vertical",
      tipIds: target.tipIds,
      tipCount: target.tipIds.length,
      y1: 20,
      y2: 400,
      titleY1: 200,
      titleY2: 220,
      occupiedY1: 20,
      occupiedY2: 400,
      x: 314,
      baseX: 314,
    }));
    const arranged = cladeLayout.layout(prepared, { alignment, tipRightEdges, canvasHeight: 500 });
    const byId = new Map(arranged.items.map(item => [item.nodeId, item]));
    assert.ok(byId.get("sapindoideae").x > byId.get("inner-sub").x, `${alignment}: sapindoideae must clear inner-sub`);
    assert.ok(byId.get("malvids").x > byId.get("sapindoideae").x, `${alignment}: malvids must clear sapindoideae`);
  }

  // 若 extracted 自身也被显式指定颜色，incomingBranchColor 优先使用自身颜色
  cladeColors.set("extracted", "#e69f00");
  const ownContext = panelClades.resolvePanelContext(originalRoot, panel2, cladeColors);
  assert.equal(ownContext.inheritedColor, "#0072b2");
  assert.equal(ownContext.incomingBranchColor, "#e69f00");
});
