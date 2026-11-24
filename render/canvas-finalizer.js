/* Canonical measurement and final measured-canvas policy for every renderer. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderCanvasFinalizer=api;})(globalThis,function(){
"use strict";

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

async function runAtCanonicalScale(svg, operation) {
  if (!svg?.style || typeof operation !== "function") throw new TypeError("canonical layout requires an SVG and an operation");
  const previousTransform = svg.style.transform;
  let completed = false;
  svg.style.transform = "none";
  try {
    const result = await operation();
    completed = true;
    return result;
  } finally {
    if (!completed || svg.style.transform === "none") svg.style.transform = previousTransform;
  }
}

function finalize({svg, width, height, bounds = null, rightPadding = 0, bottomPadding = 0,
  maximumWidth = Infinity, maximumWidthMm = null, contentDescription = "figure content",
  background = null, publishSize = null} = {}) {
  if (!svg?.setAttribute) throw new TypeError("canvas finalization requires an SVG element");
  const initialWidth = Math.max(1, finite(width, 1));
  const initialHeight = Math.max(1, finite(height, 1));
  const contentRight = bounds ? finite(bounds.x) + Math.max(0, finite(bounds.width)) : 0;
  const measuredRight = contentRight + (bounds ? Math.max(0, finite(rightPadding)) : 0);
  // Blank padding may stop at the ceiling; measured content may never cross it.
  const measuredBottom = bounds ? finite(bounds.y) + Math.max(0, finite(bounds.height)) + Math.max(0, finite(bottomPadding)) : 0;
  const finalWidth = Math.max(initialWidth, contentRight <= maximumWidth ? Math.min(Math.ceil(measuredRight), maximumWidth) : Math.ceil(measuredRight));
  const finalHeight = measuredBottom > initialHeight ? Math.ceil(measuredBottom) : initialHeight;
  if (finalWidth > maximumWidth) {
    throw Object.assign(new Error(`${contentDescription} require ${finalWidth} drawing units (u), exceeding the ${maximumWidth} u limit for a ${maximumWidthMm ?? "current"} mm figure width; please shorten display labels.`),
      {code: "FIGURE_WIDTH_CONTENT_LIMIT", requiredWidth: finalWidth, maximumWidth});
  }
  svg.setAttribute("width", finalWidth);
  svg.setAttribute("height", finalHeight);
  svg.setAttribute("viewBox", `0 0 ${finalWidth} ${finalHeight}`);
  background?.setAttribute?.("width", finalWidth);
  background?.setAttribute?.("height", finalHeight);
  const changed = finalWidth !== initialWidth || finalHeight !== initialHeight;
  if (changed && typeof publishSize === "function") publishSize({width: finalWidth, height: finalHeight});
  return {width: finalWidth, height: finalHeight, changed};
}

return Object.freeze({finalize,runAtCanonicalScale});
});
