/* Shared report fragments for ordinary, Dating, cloud and conflict output. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderFigureReport=api;})(globalThis,function(){
"use strict";

function output({physical = {}, canvas = {}, aspectMode = "auto", requestedAspectRatio = null,
  layout = {}, requestedPngScale = null, actualPngScale, requestedDpi} = {}) {
  return {
    ...physical,
    ...(requestedDpi == null ? {} : {requested_dpi: requestedDpi}),
    aspect_mode: aspectMode,
    requested_aspect_ratio: requestedAspectRatio,
    actual_aspect_ratio: Number(canvas.width || 0) / Math.max(1, Number(canvas.height || 0)),
    auto_expanded: Boolean(layout.autoExpanded),
    horizontal_expansion: Number(layout.horizontalExpansion || 1),
    ...(layout.automaticRows ? {automatic_row_layout: {...layout.automaticRows}} : {}),
    ...(requestedPngScale == null ? {} : {requested_png_scale: requestedPngScale}),
    ...(actualPngScale === undefined ? {} : {actual_png_scale: actualPngScale}),
  };
}

function fontPortability({families = [], fontsReady = true, systemFontsReady = fontsReady, embedsFonts = true, fallback = null} = {}) {
  return {
    bundled_fonts_ready: Boolean(fontsReady),
    svg_export_embeds_fonts: Boolean(embedsFonts),
    system_font_families: [...families],
    system_fonts_ready: Boolean(systemFontsReady),
    all_fonts_embedded: families.length === 0,
    fallback,
  };
}

return Object.freeze({output, fontPortability});
});
