/* Shared drawing-unit boundary: complete figure width = 1000 units.
 * Fixed internal design coordinates never depend on print width or DPI. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PhyloRenderUnits = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const pxToPt = value => Number(value) * 72 / 96;
  const ptToPx = value => Number(value) * 96 / 72;
  const pxToMm = value => Number(value) * 25.4 / 96;
  const mmToPx = value => Number(value) * 96 / 25.4;
  // Fixed design geometry isolates layout from print width. Public dimensions
  // use 1000 units across the complete figure, including double-tree figures.
  const drawingWidth = 1000;
  const designWidth = Math.floor(400 * 96 / 25.4);
  const designToDrawing = value => Number(value) * drawingWidth / designWidth;
  const drawingToDesign = value => Number(value) * designWidth / drawingWidth;
  const ptToDrawing = value => designToDrawing(ptToPx(value));
  const drawingToPt = value => pxToPt(drawingToDesign(value));
  function drawingAdjustment(value) {
    return {branch_id:value.branch_id,
      dx_u:value.dx_u ?? designToDrawing(value.dx), dy_u:value.dy_u ?? designToDrawing(value.dy),
      font_reduction_u:value.font_reduction_u ?? designToDrawing(value.font_reduction || 0)};
  }
  function legacyAdjustment(value) {
    return {branch_id:value.branch_id,
      dx:value.dx_u === undefined ? value.dx : drawingToDesign(value.dx_u),
      dy:value.dy_u === undefined ? value.dy : drawingToDesign(value.dy_u),
      font_reduction:value.font_reduction_u === undefined ? value.font_reduction || 0 : drawingToDesign(value.font_reduction_u)};
  }
  function mapOptions(options, toDrawing) {
    const result = structuredClone(options || {});
    const direct = new Set(['layout.tip_spacing', 'time.hpd_thickness', 'cloud.pie_radius']);
    function walk(object, prefix = '') {
      if (!object || typeof object !== 'object') return;
      for (const key of Object.keys(object)) {
        const field = prefix ? `${prefix}.${key}` : key;
        if (toDrawing ? direct.has(field) : key.endsWith('_u') && direct.has(field.slice(0,-2))) {
          const target = toDrawing ? key + '_u' : key.slice(0,-2);
          if (!toDrawing || object[target] === undefined) object[target] = (toDrawing ? designToDrawing : drawingToDesign)(object[key]);
          delete object[key];
        } else if (key.endsWith(toDrawing ? '_pt' : '_u')) {
          const target = key.slice(0, toDrawing ? -3 : -2) + (toDrawing ? '_u' : '_pt');
          if (!toDrawing || object[target] === undefined) object[target] = (toDrawing ? ptToDrawing : drawingToPt)(object[key]);
          delete object[key];
        } else if (typeof object[key] === 'object') walk(object[key], field);
      }
    }
    walk(result);
    return result;
  }
  const drawingOptions = options => mapOptions(options, true);
  const legacyOptions = options => options == null ? options : mapOptions(options, false);
  function drawingSegment(segment) {
    const result = drawingOptions(segment);
    if (result.size !== undefined) {
      if (result.size_u === undefined) result.size_u = designToDrawing(result.size);
      delete result.size;
    }
    return result;
  }
  function printGeometry(widthMm, width, height, dpi = 300) {
    const scale = Number(widthMm) / Number(width);
    return { width_mm: Number(widthMm), height_mm: height * scale,
      drawing_width: drawingWidth, drawing_height: height * drawingWidth / width,
      raster_scale: scale * dpi / 25.4 };
  }
  function canonicalizeSvgAttributes(svg) {
    const attributes = [...svg.attributes].sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    attributes.forEach(attribute => svg.removeAttributeNode(attribute));
    attributes.forEach(attribute => svg.setAttributeNodeNS(attribute));
  }
  function normalizeSvg(svg, widthMm) {
    const box = svg.getAttribute('viewBox').trim().split(/\s+/).map(Number);
    const factor = drawingWidth / box[2];
    const group = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('transform', `scale(${factor})`);
    group.setAttribute('data-drawing-projection','design-to-width-1000');
    for (const child of [...svg.children]) {
      if (!['style','metadata','defs'].includes(child.tagName.toLowerCase())) group.append(child);
    }
    svg.append(group);
    svg.querySelectorAll('style').forEach(style => {
      style.textContent = style.textContent.replace(/vector-effect:\s*non-scaling-stroke/g,'vector-effect: none');
    });
    svg.querySelectorAll('[vector-effect]').forEach(el=>el.setAttribute('vector-effect','none'));
    svg.setAttribute('viewBox',`0 0 ${drawingWidth} ${box[3]*factor}`);
    svg.setAttribute('width',`${widthMm}mm`);
    svg.setAttribute('height',`${widthMm*box[3]/box[2]}mm`);
    svg.setAttribute('data-unit-model','drawing-width-1000-v1');
    canonicalizeSvgAttributes(svg);
  }
  // PNG pHYs stores pixels per metre. Replace existing density rather than
  // duplicating it, so importing a PNG into publishing software preserves size.
  function pngWithDpi(input, dpi) {
    const bytes = new Uint8Array(input);
    if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80) throw new Error("Invalid PNG");
    const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
    view.setUint32(0, 9);
    chunk.set([112, 72, 89, 115], 4);
    const ppm = Math.max(1, Math.round(dpi / .0254));
    view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 17)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
    const parts = [bytes.subarray(0, 33), chunk];
    for (let offset = 33; offset < bytes.length;) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0) + 12;
      if (offset + length > bytes.length) throw new Error("Truncated PNG");
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type !== "pHYs") parts.push(bytes.subarray(offset, offset + length));
      offset += length;
    }
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }
  return { pxToPt, ptToPx, pxToMm, mmToPx, pngWithDpi, drawingWidth, designWidth,
    designToDrawing, drawingToDesign, ptToDrawing, drawingToPt,
    drawingOptions, legacyOptions, printGeometry, normalizeSvg, canonicalizeSvgAttributes, drawingAdjustment, legacyAdjustment, drawingSegment };
});
