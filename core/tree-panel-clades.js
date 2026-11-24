/* Pure clade inheritance mapping across split panels; no DOM, IO or global storage. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderTreePanelClades=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function descendantTips(node) {
    if (!node) return [];
    return node.children?.length ? node.children.flatMap(descendantTips) : [node];
  }
  function findById(node, id) {
    if (!node || !id) return null;
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  }
  function ancestorNodes(rootNode, targetId) {
    if (!rootNode || !targetId) return [];
    const ancestors = [];
    function visit(node) {
      if (node.id === targetId) return true;
      for (const child of node.children || []) {
        ancestors.push(node);
        if (visit(child)) return true;
        ancestors.pop();
      }
      return false;
    }
    return visit(rootNode) ? ancestors : [];
  }
  function resolvePanelContext(originalRoot, plan, cladeColors) {
    const empty = {
      rootNodeId: null,
      inheritedColor: null,
      incomingBranchColor: null,
      enclosingNodeIds: [],
      enclosingTipIdsByNodeId: new Map(),
    };
    if (!plan || plan.panelNumber !== 2 || !plan.sourceNodeId || !originalRoot || !cladeColors?.size) return empty;
    const enclosing = ancestorNodes(originalRoot, plan.sourceNodeId).filter(node => cladeColors.has(node.id));
    const inheritedColor = enclosing.length ? cladeColors.get(enclosing.at(-1).id) : null;
    const incomingBranchColor = cladeColors.get(plan.sourceNodeId) || inheritedColor || null;
    if (!enclosing.length && !incomingBranchColor) return empty;
    const enclosingTipIdsByNodeId = new Map(enclosing.map(node => [node.id, descendantTips(node).map(tip => tip.id)]));
    return {
      rootNodeId: plan.root?.id || plan.sourceNodeId,
      inheritedColor,
      incomingBranchColor,
      enclosingNodeIds: enclosing.map(node => node.id),
      enclosingTipIdsByNodeId,
    };
  }
  function resolveBarTarget(panelRoot, nodeId, context) {
    const node = findById(panelRoot, nodeId);
    if (node) {
      const tips = descendantTips(node);
      return { tips, tipIds: tips.map(tip => tip.id) };
    }
    if (context?.rootNodeId && panelRoot?.id === context.rootNodeId && context.enclosingTipIdsByNodeId?.has(nodeId)) {
      return { tips: descendantTips(panelRoot), tipIds: [...context.enclosingTipIdsByNodeId.get(nodeId)] };
    }
    return null;
  }
  return Object.freeze({ ancestorNodes, resolvePanelContext, resolveBarTarget });
});
