(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderOutputGeometry=api;})(globalThis,function(){
  "use strict";

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function automaticTargetAspectRatio(height) {
    if (height <= 1200) return null;
    const progress = clamp((height - 1200) / 4800, 0, 1);
    return .62 - .18 * Math.sqrt(progress);
  }

  function calculate(input = {}) {
    const height = Math.max(1, finite(input.height, 1));
    const naturalPlotWidth = Math.max(1, finite(input.naturalPlotWidth, 1));
    const fixedWidth = Math.max(0, finite(input.fixedWidth, 0));
    const minimumPlotWidth = Math.max(1, finite(input.minimumPlotWidth, 160));
    const maximumCanvasWidth = Math.max(1, finite(input.maximumCanvasWidth, Infinity));
    const requestedCanvasWidth = Math.max(0, finite(input.requestedCanvasWidth, 0));
    const mode = input.mode || "auto";
    const minimumCanvasWidth = fixedWidth + minimumPlotWidth;
    if (minimumCanvasWidth > maximumCanvasWidth) {
      throw Object.assign(new Error("Readable text plus the minimum tree span exceeds this workspace width ceiling."), {
        code: "FIGURE_WIDTH_CONTENT_LIMIT", requiredWidth: minimumCanvasWidth,
        maximumWidth: maximumCanvasWidth, fixedWidth, minimumPlotWidth,
      });
    }
    const naturalCanvasWidth = fixedWidth + naturalPlotWidth;
    let targetRatio = Number.isFinite(Number(input.targetRatio)) ? Number(input.targetRatio) : null;
    let targetCanvasWidth = naturalCanvasWidth;
    let resultMode = mode;
    if (requestedCanvasWidth > 0) {
      resultMode = "physical-width";
      targetRatio = null;
      targetCanvasWidth = requestedCanvasWidth;
    } else if (mode === "auto") {
      targetRatio = automaticTargetAspectRatio(height);
      if (targetRatio) {
        const expansionLimit = Math.min(4800, fixedWidth + naturalPlotWidth
          * (2.6 + Math.min(2, Math.max(0, Math.log2(height / 1200)) * .45)));
        targetCanvasWidth = Math.min(height * targetRatio, expansionLimit);
      }
    } else if (mode !== "content" && targetRatio) {
      targetCanvasWidth = height * targetRatio;
    }
    const desiredCanvasWidth = requestedCanvasWidth > 0
      ? Math.max(minimumCanvasWidth, targetCanvasWidth)
      : Math.max(minimumCanvasWidth, naturalCanvasWidth, targetCanvasWidth);
    const canvasWidth = Math.floor(Math.min(maximumCanvasWidth, desiredCanvasWidth));
    const plotWidth = canvasWidth - fixedWidth;
    return {
      mode: resultMode, targetRatio, naturalPlotWidth, naturalCanvasWidth, fixedWidth,
      minimumPlotWidth, maximumCanvasWidth, canvasWidth, plotWidth,
      autoExpanded: mode === "auto" && requestedCanvasWidth === 0 && canvasWidth > naturalCanvasWidth + 1,
      widthLimited: canvasWidth >= maximumCanvasWidth - 1,
      horizontalExpansion: plotWidth / naturalPlotWidth,
      manualHorizontalScale: 1,
    };
  }

  function applyManualScale(layout, factor = 1) {
    const scale = clamp(finite(factor, 1), .25, 4);
    const maximumPlotWidth = layout.maximumCanvasWidth - layout.fixedWidth;
    const plotWidth = Math.min(maximumPlotWidth, layout.plotWidth * scale);
    return { ...layout, plotWidth, canvasWidth: Math.ceil(layout.fixedWidth + plotWidth),
      horizontalExpansion: plotWidth / layout.naturalPlotWidth, manualHorizontalScale: scale,
      widthLimited: layout.fixedWidth + plotWidth >= layout.maximumCanvasWidth - 1 };
  }

  return Object.freeze({automaticTargetAspectRatio,calculate,applyManualScale});
});
