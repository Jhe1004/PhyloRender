(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderConflictBranches=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    if(typeof ports?.svgEl!=="function")throw new TypeError("Missing conflict branch port: svgEl");
    const {svgEl}=ports;
function appendConflictBranches(group, root, positions, segments = [], side = "left", nodeGroups = new Map(), config) {
  (function visit(node) {
    const children = node.children || [];
    if (!children.length) return;
    const parent = positions.get(node);
    const childPositions = children.map(child => positions.get(child));
    const minimumY = Math.min(...childPositions.map(item => item.y));
    const maximumY = Math.max(...childPositions.map(item => item.y));
    const parentGroup = nodeGroups.get(node);
    group.append(svgEl("line", {
      class: "conflict-branch", x1: parent.x, y1: minimumY, x2: parent.x, y2: maximumY,
      ...(parentGroup ? { style: `stroke:${parentGroup.color}`, "data-group": parentGroup.name } : {}),
    }));
    segments.push({
      x1: parent.x, y1: minimumY, x2: parent.x, y2: maximumY,
      nodeIds: new Set([node.id, ...children.map(child => child.id)]),
    });
    children.forEach(child => {
      const position = positions.get(child);
      const annotation = config.annotations[side].get(child);
      const full = config.fullStyle === "branch" && Boolean(annotation?.full);
      group.append(svgEl("line", {
        class: `conflict-branch${full ? " full-support-branch" : ""}`,
        x1: parent.x, y1: position.y, x2: position.x, y2: position.y,
        ...(nodeGroups.get(child) ? {
          style: `stroke:${nodeGroups.get(child).color}`,
          "data-group": nodeGroups.get(child).name,
        } : {}),
        ...(full ? { "data-support-state": "full", "data-support-branch": "true" } : {}),
      }));
      segments.push({
        x1: parent.x, y1: position.y, x2: position.x, y2: position.y,
        nodeIds: new Set([node.id, child.id]),
      });
      visit(child);
    });
  }(root));
  return segments;
}


    return Object.freeze({appendBranches:appendConflictBranches});
  }
  return Object.freeze({create});
});
