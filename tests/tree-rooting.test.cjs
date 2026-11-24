const assert = require("node:assert/strict");
const test = require("node:test");
const Rooting = require("../tree-rooting.js");

function makeGraph() {
  const nodeRows = [
    ["root", ""], ["ab", ""], ["cd", ""],
    ["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"],
  ];
  const nodes = new Map(nodeRows.map(([id, tipLabel]) => [id, { id, tipLabel }]));
  const edges = [
    { id: "e0", a: "root", b: "ab", length: 2, support: 95 },
    { id: "e1", a: "ab", b: "A", length: 1, support: null },
    { id: "e2", a: "ab", b: "B", length: 1, support: null },
    { id: "e3", a: "root", b: "cd", length: 4, support: 80 },
    { id: "e4", a: "cd", b: "C", length: 1, support: null },
    { id: "e5", a: "cd", b: "D", length: 1, support: null },
  ];
  const adjacency = new Map([...nodes.keys()].map(id => [id, []]));
  edges.forEach(edge => {
    adjacency.get(edge.a).push({ node: edge.b, edge });
    adjacency.get(edge.b).push({ node: edge.a, edge });
  });
  return { nodes, edges, adjacency, originalRootId: "root" };
}

function tips(node) {
  return node.children.length ? node.children.flatMap(tips) : [node.label];
}

function topologyAndData(node, rows = []) {
  rows.push({
    id: node.id,
    children: node.children.map(child => child.id).sort(),
    length: node.length ?? null,
    support: node.support ?? null,
  });
  node.children.forEach(child => topologyAndData(child, rows));
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

test("整支定根把选中类群放在根的第一个子树，并保持末端连续", () => {
  const graph = makeGraph();
  const rooted = Rooting.rerootOnClade(graph, ["A", "B"]);
  assert.equal(rooted.preserveChildOrder, true);
  assert.deepEqual(tips(rooted.children[0]).sort(), ["A", "B"]);
  assert.deepEqual(tips(rooted.children[1]).sort(), ["C", "D"]);
  assert.equal(rooted.children[0].length, 1);
  assert.equal(rooted.children[1].length, 1);
  assert.equal(rooted.children[0].support, null);
  assert.equal(rooted.children[1].support, 95);
});

test("双向阶梯化在所有节点按姊妹群大小排序且不改变成员", () => {
  const tree = {
    id: "r", label: "", children: [
      { id: "abc", label: "", children: [
        { id: "a", label: "A", children: [] },
        { id: "bc", label: "", children: [
          { id: "b", label: "B", children: [] },
          { id: "c", label: "C", children: [] },
        ] },
      ] },
      { id: "d", label: "D", children: [] },
    ]
  };
  const originalTips = tips(tree).sort();
  Rooting.ladderize(tree, "small-top");
  assert.equal(tree.children[0].id, "d");
  assert.equal(tree.children[1].children[0].id, "a");
  assert.deepEqual(tips(tree).sort(), originalTips);
  Rooting.ladderize(tree, "large-top");
  assert.equal(tree.children[0].id, "abc");
  assert.equal(tree.children[0].children[0].id, "bc");
  assert.deepEqual(tips(tree).sort(), originalTips);
});

test("阶梯化只旋转节点，不改变拓扑、枝长或支持率", () => {
  const rooted = Rooting.rerootOnClade(makeGraph(), ["A", "B"]);
  const before = topologyAndData(rooted);
  Rooting.ladderize(rooted, "small-top");
  assert.deepEqual(topologyAndData(rooted), before);
  Rooting.ladderize(rooted, "large-top");
  assert.deepEqual(topologyAndData(rooted), before);
});

test("根节点两侧产生同一二分时优先使用用户实际点击的边", () => {
  const match = Rooting.findSeparatingEdge(makeGraph(), ["C", "D"], "e3");
  assert.equal(match.edge.id, "e3");
  assert.equal(match.selectedEndpointId, "cd");
});

test("重新定根生成的半边仍能回查原始分支", () => {
  const match = Rooting.findSeparatingEdge(makeGraph(), ["C", "D"], "e3a");
  assert.equal(match.edge.id, "e3");
  assert.equal(match.selectedEndpointId, "cd");
});

test("单末端定根仍沿用同一套分支切分逻辑", () => {
  const rooted = Rooting.rerootOnTip(makeGraph(), "A");
  assert.deepEqual(tips(rooted.children[0]), ["A"]);
  assert.equal(rooted.children[0].length, .5);
  assert.equal(rooted.children[1].length, .5);
});

test("非单系样品组合和整棵树不能被误当作一个分支", () => {
  assert.throws(() => Rooting.rerootOnClade(makeGraph(), ["A", "C"]), /monophyletic bipartition/i);
  assert.throws(() => Rooting.rerootOnClade(makeGraph(), ["A", "B", "C", "D"]), /entire tree/i);
});

test("定根不修改原始图的边、枝长和支持率", () => {
  const graph = makeGraph();
  const snapshot = graph.edges.map(edge => ({ ...edge }));
  Rooting.rerootOnClade(graph, ["A", "B"]);
  assert.deepEqual(graph.edges, snapshot);
  assert.equal(graph.nodes.has("display_root"), false);
});

test("当前根已经匹配同一外类群时能够识别为无操作", () => {
  const rooted = Rooting.orientGraph(makeGraph(), "root");
  const match = Rooting.findMatchingRootChild(rooted, ["A", "B"]);
  assert.equal(match.childId, "ab");
  assert.equal(match.otherChildId, "cd");
  assert.deepEqual(match.tipIds.sort(), ["A", "B"]);
});

test("当前根匹配判断与根两侧的显示顺序无关", () => {
  const rooted = Rooting.orientGraph(makeGraph(), "root");
  rooted.children.reverse();
  const match = Rooting.findMatchingRootChild(rooted, ["C", "D"]);
  assert.equal(match.childId, "cd");
  assert.equal(match.otherChildId, "ab");
});

test("根的一侧只部分包含所选样品时不能误判为已定根", () => {
  const rooted = Rooting.orientGraph(makeGraph(), "root");
  assert.equal(Rooting.findMatchingRootChild(rooted, ["A"]), null);
  assert.equal(Rooting.findMatchingRootChild(rooted, ["A", "C"]), null);
});
