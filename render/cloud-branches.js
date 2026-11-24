(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderCloudBranches=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function create(ports) {
    if(typeof ports?.svgEl!=="function")throw new TypeError("Missing cloud branch port: svgEl");
    if(!ports?.model)throw new TypeError("Missing cloud branch dependency: model");
    const {svgEl,model}=ports;
    // The cache belongs to this renderer; its complete key and commit-after-
    // completion rule are unchanged. Cancelled searches never publish rows.
function cladeColorMap(root, selectedColors) {
  const colors = new Map();
  (function visit(node, inherited = null) {
    const color = selectedColors.get(node.id) || inherited;
    if (color) colors.set(node, color);
    node.children.forEach(child => visit(child, color));
  })(root);
  return colors;
}

function appendTriangularBranches(root, ages, ys, group, xOf, segments = null, colors = null, identifyClades = true, paths = null) {
  (function visit(node) {
    if (!node.children.length) return;
    const parentX = xOf(ages.get(node));
    node.children.forEach(child => {
      const childX = xOf(ages.get(child));
      const childY = ys.get(child);
      group.append(svgEl("path", {
        class: "cloud-triangle-edge",
        ...(colors && identifyClades ? { "data-clade-node-id": child.id } : {}),
        ...(colors?.has(child) ? { stroke: colors.get(child) } : {}),
        ...(child.children.length ? {} : { "data-cloud-tip": child.label.trim(), "data-cloud-tip-y": childY }),
        d: paths?.get(child) ?? `M ${parentX} ${ys.get(node)} L ${childX} ${childY}`,
      }));
      if (segments) segments.push({ parent: node, child, x1: parentX, y1: ys.get(node), x2: childX, y2: childY });
      visit(child);
    });
  })(root);
}

function appendRectangularBranches(root, ages, ys, group, xOf, segments = null, colors = null) {
  (function visit(node) {
    if (!node.children.length) return;
    const parentX = xOf(ages.get(node));
    const childRows = node.children.map(child => ys.get(child));
    const low = Math.min(...childRows), high = Math.max(...childRows);
    group.append(svgEl("path", {
      class: "cloud-rectangular-trunk", d: `M ${parentX} ${low} L ${parentX} ${high}`,
      ...(colors?.has(node) ? { stroke: colors.get(node) } : {}),
    }));
    if (segments) segments.push({ parent: node, child: null, x1: parentX, y1: low, x2: parentX, y2: high });
    node.children.forEach(child => {
      const childX = xOf(ages.get(child));
      const childY = ys.get(child);
      group.append(svgEl("path", {
        class: "cloud-rectangular-arm",
        ...(colors ? { "data-clade-node-id": child.id, ...(colors.has(child) ? { stroke: colors.get(child) } : {}) } : {}),
        ...(child.children.length ? {} : { "data-cloud-tip": child.label.trim(), "data-cloud-tip-y": childY }),
        d: `M ${parentX} ${childY} L ${childX} ${childY}`,
      }));
      if (segments) segments.push({ parent: node, child, x1: parentX, y1: childY, x2: childX, y2: childY });
      visit(child);
    });
  })(root);
}

const cloudAlignedRowsCache = new WeakMap();
function* alignedRowSteps(root, tipOrder, ages, rootAge, top, step, anchors = null) {
  const fixedRows = anchors === null ? new Map() : new Map(anchors);
  for (const [node, row] of fixedRows) {
    if (!ages.has(node) || !node.children?.length || !Number.isFinite(row))
      throw Object.assign(new Error("Invalid row anchor for shared clade"), {code: "CLOUD_INVALID_ROW_ANCHOR"});
  }
  const key = JSON.stringify([tipOrder, rootAge, top, step,
    [...ages].map(([node, age]) => [node.id, age, fixedRows.has(node) ? fixedRows.get(node) : null])]);
  const cached = cloudAlignedRowsCache.get(root);
  if (cached?.key === key) return cached.rows;
  const rows = yield* model.optimizeAlignedRowsSteps(root, tipOrder, ages, rootAge, top, step, fixedRows);
  cloudAlignedRowsCache.set(root, { key, rows });
  return rows;
}


    return Object.freeze({cladeColorMap,appendTriangularBranches,appendRectangularBranches,alignedRowSteps});
  }
  return Object.freeze({create});
});
