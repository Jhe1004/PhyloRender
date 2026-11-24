/* Horizontal glyph fitting for connected sample text; no document storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderTipWidth=api;})(globalThis,function(){
  "use strict";
  function reset(element) {
    if (element.getAttribute("data-tip-horizontal-scale") !== null) {
      for (const key of ["textLength","lengthAdjust","data-tip-horizontal-scale","data-tip-natural-width","data-tip-width-limit"])
        element.removeAttribute(key);
    }
  }
  function fit(element, maximumWidth) {
    if (typeof maximumWidth !== "number" || !(maximumWidth > 0)) throw new TypeError("Invalid sample-name width");
    reset(element);
    const naturalWidth = element.getBBox().width;
    if (!Number.isFinite(naturalWidth) || naturalWidth < 0) throw new TypeError("Invalid sample-name geometry");
    if (naturalWidth <= maximumWidth) return {compressed:false,naturalWidth,width:naturalWidth,scale:1};
    const advance = element.getComputedTextLength();
    if (!Number.isFinite(advance) || advance <= 0) throw new TypeError("Invalid sample-name advance geometry");
    let length = advance * maximumWidth / naturalWidth;
    element.setAttribute("lengthAdjust","spacingAndGlyphs");
    element.setAttribute("textLength",length);
    // SVG ink bounds can differ from the advance, especially for italic runs.
    // Re-measure the actual adjusted glyphs before downstream layout uses them.
    let width = element.getBBox().width;
    for (let pass = 0; pass < 4 && Math.abs(width - maximumWidth) > .00001; pass++) {
      length *= maximumWidth / width;
      element.setAttribute("textLength",length);
      width = element.getBBox().width;
    }
    if (!Number.isFinite(width) || Math.abs(width - maximumWidth) > .01)
      throw new Error("Cannot fit sample-name glyphs to the width limit");
    const scale = length / advance;
    element.setAttribute("data-tip-horizontal-scale",scale);
    element.setAttribute("data-tip-natural-width",naturalWidth);
    element.setAttribute("data-tip-width-limit",maximumWidth);
    return {compressed:true,naturalWidth,width,scale};
  }
  function fitAll(elements, maximumForWidths) {
    const labels = Array.from(elements);
    labels.forEach(reset);
    const maximumWidth = maximumForWidths(labels.map(label => label.getBBox().width));
    return {maximumWidth, labels:labels.map(label => fit(label, maximumWidth))};
  }
  return Object.freeze({fit,fitAll});
});
