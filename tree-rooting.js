(function exposeTreeRooting(root, factory) {
  const treeOrder = typeof module === "object" && module.exports
    ? require("./core/tree-order.js") : root.PhyloRenderTreeOrder;
  const api = factory(treeOrder);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhyloRenderRooting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTreeRooting(treeOrder) {
  "use strict";

  if (!treeOrder) throw new Error("Missing shared tree-order policy");

  function rebuildAdjacency(graph) {
    graph.adjacency = new Map([...graph.nodes.keys()].map(id => [id, []]));
    graph.edges.forEach(edge => {
      graph.adjacency.get(edge.a).push({ node: edge.b, edge });
      graph.adjacency.get(edge.b).push({ node: edge.a, edge });
    });
    return graph;
  }

  function cloneGraph(graph) {
    return rebuildAdjacency({
      nodes: new Map([...graph.nodes].map(([id, node]) => [id, { ...node }])),
      edges: graph.edges.map(edge => ({ ...edge })),
      adjacency: new Map(),
      originalRootId: graph.originalRootId,
    });
  }

  function orientGraph(graph, rootId) {
    function orient(id, parentId = null, incoming = null) {
      const graphNode = graph.nodes.get(id);
      if (!graphNode) throw new Error("Requested rooting position is absent from the current tree");
      const node = {
        id,
        label: graphNode.tipLabel,
        original: graphNode.original || null,
        length: incoming?.length ?? null,
        support: incoming?.support ?? null,
        incomingEdgeId: incoming?.id ?? null,
        children: [],
      };
      graph.adjacency.get(id).forEach(({ node: nextId, edge }) => {
        if (nextId !== parentId) node.children.push(orient(nextId, id, edge));
      });
      return node;
    }
    return orient(rootId);
  }

  function componentTipIds(graph, startId, blockedId) {
    const tips = [];
    const stack = [{ id: startId, parentId: blockedId }];
    while (stack.length) {
      const { id, parentId } = stack.pop();
      const node = graph.nodes.get(id);
      if (node?.tipLabel) tips.push(id);
      graph.adjacency.get(id).forEach(connection => {
        if (connection.node !== parentId) stack.push({ id: connection.node, parentId: id });
      });
    }
    return tips;
  }

  function sameTipSet(ids, selected) {
    return ids.length === selected.size && ids.every(id => selected.has(id));
  }

  function rootedDescendantTipIds(node) {
    if (!node?.children?.length) return node ? [node.id] : [];
    return node.children.flatMap(rootedDescendantTipIds);
  }

  function findMatchingRootChild(rooted, selectedTipIds) {
    if (!rooted?.children?.length) return null;
    const selected = new Set(selectedTipIds);
    if (!selected.size) return null;
    for (const child of rooted.children) {
      const childTipIds = rootedDescendantTipIds(child);
      if (sameTipSet(childTipIds, selected)) {
        return {
          child,
          childId: child.id,
          tipIds: childTipIds,
          otherChildId: rooted.children.length === 2
            ? rooted.children.find(candidate => candidate.id !== child.id)?.id || null
            : null,
        };
      }
    }
    return null;
  }

  function selectedSideOfEdge(graph, edge, selected) {
    const fromA = componentTipIds(graph, edge.a, edge.b);
    if (sameTipSet(fromA, selected)) return { edge, selectedEndpointId: edge.a, otherEndpointId: edge.b };
    const fromB = componentTipIds(graph, edge.b, edge.a);
    if (sameTipSet(fromB, selected)) return { edge, selectedEndpointId: edge.b, otherEndpointId: edge.a };
    return null;
  }

  function originalEdgeId(graph, edgeId) {
    if (!edgeId) return null;
    if (graph.edges.some(edge => edge.id === edgeId)) return edgeId;
    const candidate = edgeId.replace(/[ab]$/, "");
    return graph.edges.some(edge => edge.id === candidate) ? candidate : null;
  }

  function findSeparatingEdge(graph, selectedTipIds, preferredEdgeId = null) {
    const selected = new Set(selectedTipIds);
    const allTips = [...graph.nodes.values()].filter(node => node.tipLabel);
    if (selected.size < 1) throw new Error("Selected branch contains no terminal tips");
    if (selected.size >= allTips.length) throw new Error("Cannot assign the entire tree as the outgroup");
    for (const id of selected) {
      if (!graph.nodes.get(id)?.tipLabel) throw new Error("Selected branch includes tips absent from the focal tree");
    }

    const preferredOriginalId = originalEdgeId(graph, preferredEdgeId);
    if (preferredOriginalId) {
      const preferred = graph.edges.find(edge => edge.id === preferredOriginalId);
      const preferredMatch = selectedSideOfEdge(graph, preferred, selected);
      if (preferredMatch) return preferredMatch;
    }

    for (const edge of graph.edges) {
      const match = selectedSideOfEdge(graph, edge, selected);
      if (match) return match;
    }
    throw new Error("Selected taxa do not form a single monophyletic bipartition in the tree");
  }

  function uniqueRootId(graph) {
    let rootId = "display_root";
    let suffix = 2;
    while (graph.nodes.has(rootId)) rootId = `display_root_${suffix++}`;
    return rootId;
  }

  function rerootOnEdge(graph, edgeId, selectedEndpointId) {
    const working = cloneGraph(graph);
    const edge = working.edges.find(candidate => candidate.id === edgeId);
    if (!edge) throw new Error("Selected branch could not be found");
    if (edge.a !== selectedEndpointId && edge.b !== selectedEndpointId) throw new Error("Selected clade is inconsistent with the target rooting branch");
    const otherEndpointId = edge.a === selectedEndpointId ? edge.b : edge.a;
    const rootId = uniqueRootId(working);
    working.nodes.set(rootId, { id: rootId, tipLabel: "", original: null });
    working.edges = working.edges.filter(candidate => candidate.id !== edge.id);
    const halfLength = edge.length === null ? null : edge.length / 2;
    working.edges.push(
      { id: `${edge.id}a`, a: rootId, b: selectedEndpointId, length: halfLength, support: null },
      { id: `${edge.id}b`, a: rootId, b: otherEndpointId, length: halfLength, support: edge.support },
    );
    rebuildAdjacency(working);
    const rooted = orientGraph(working, rootId);
    rooted.children.sort((a, b) => (a.id === selectedEndpointId ? -1 : b.id === selectedEndpointId ? 1 : 0));
    rooted.preserveChildOrder = true;
    rooted.outgroupChildId = selectedEndpointId;
    rooted.ingroupChildId = otherEndpointId;
    return rooted;
  }

  function ladderize(rooted, direction = "file") {
    // Multi-panel pagination fixes the continuation placeholder at the bottom;
    // subsequent ladderization must not float that placeholder to the top.
    return treeOrder.ladderize(rooted, direction);
  }

  function rerootOnTip(graph, tipId) {
    const node = graph.nodes.get(tipId);
    if (!node?.tipLabel) throw new Error("Selected node is not a terminal tip in the focal tree");
    const connection = graph.adjacency.get(tipId)?.[0];
    if (!connection) throw new Error("Outgroup tip has no incident branch");
    return rerootOnEdge(graph, connection.edge.id, tipId);
  }

  function rerootOnClade(graph, selectedTipIds, preferredEdgeId = null) {
    const match = findSeparatingEdge(graph, selectedTipIds, preferredEdgeId);
    return rerootOnEdge(graph, match.edge.id, match.selectedEndpointId);
  }

  return {
    orientGraph,
    componentTipIds,
    findMatchingRootChild,
    findSeparatingEdge,
    rerootOnEdge,
    rerootOnTip,
    rerootOnClade,
    ladderize,
  };
});
