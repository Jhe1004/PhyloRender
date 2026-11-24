/* Display-only group geometry; no tree identities, DOM or global storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderCladeLayout=api;})(globalThis,function(){
  "use strict";
  const overlap=(a,b,gap=3)=>a.x<b.x+b.width+gap&&a.x+a.width>b.x-gap&&a.y<b.y+b.height+gap&&a.y+a.height>b.y-gap;
  function titleBox(item,x,orientation,height){
    const middle=(item.y1+item.y2)/2,size=item.maximumFontSize;
    if(orientation==='horizontal')return {x:x+8,y:middle-size*.95,width:item.nameWidth+6,height:size*1.4};
    const start=Math.min(Math.max(8,middle-item.nameWidth/2),Math.max(8,height-item.nameWidth-8));
    return {x:x+18-size*.65,y:start-4,width:size*1.65,height:item.nameWidth+8};
  }
  function clearSamples(item,orientation,boxes,height,startX=item.baseX){
    let x=startX;
    for(let pass=0;pass<=boxes.length;pass++){
      const title=titleBox(item,x,orientation,height),bar={x:x-6,y:item.y1,width:7,height:item.y2-item.y1};
      const hits=boxes.filter(b=>overlap(title,b)||overlap(bar,b));
      if(!hits.length)return x;
      x=Math.max(x+1,...hits.map(b=>b.x+b.width+10));
    }
    throw Object.assign(new Error('Cannot place group clear of sample labels'),{code:'CLADE_LAYOUT_INVALID'});
  }
  function layout(prepared,{alignment='auto',tipsAligned=false,tipRightEdges=new Map(),labelBounds=[],canvasHeight=Infinity}={}){
    if (!Array.isArray(prepared) || !['auto','nearby','aligned'].includes(alignment) || typeof tipsAligned !== 'boolean')
      throw new TypeError('Invalid group layout input');
    if (!prepared.length) return {items:[],requiredWidth:0};
    for (const item of prepared) if (![item.baseX,item.x,item.y1,item.y2,item.nameWidth,item.maximumFontSize].every(Number.isFinite)
      || item.nameWidth < 0 || item.maximumFontSize <= 0 || item.y2 < item.y1 || !Array.isArray(item.tipIds))
      throw Object.assign(new Error('Invalid group geometry'),{code:'CLADE_LAYOUT_INVALID'});
    const items=prepared.map(item=>({...item,tipIds:[...item.tipIds]}));
    const boxes=labelBounds.filter(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite));
    const maximumTipRight=Math.max(0,...tipRightEdges.values());
    // Place smaller nested clades first so tiers and auto alignment resolve before orientation.
    items.sort((a, b) => a.tipCount - b.tipCount || a.y1 - b.y1 || a.y2 - b.y2);
    items.forEach((item, index) => {
      const tipSet = new Set(item.tipIds), style = item.barStyle || "auto";
      if (!["auto", "solid", "dashed", "dash-dot"].includes(style)) throw new TypeError("Invalid group bar style");
      if (item.requestedTier != null && (!Number.isInteger(item.requestedTier) || item.requestedTier < 0 || item.requestedTier > 5))
        throw new TypeError("Invalid group tier");
      let nestingTier = 0, minTier = 0;
      for (let j = 0; j < index; j++) if (items[j].tipCount < item.tipCount && items[j].tipIds.every(id => tipSet.has(id))) {
        nestingTier = Math.max(nestingTier, items[j].nestingTier + 1); minTier = Math.max(minTier, items[j].effectiveTier + 1);
      }
      item.nestingTier = nestingTier; item.effectiveTier = Math.max(item.requestedTier ?? 0, minTier);
      item.effectiveBarStyle = style !== "auto" ? style : item.effectiveTier <= 0 ? "solid" : item.effectiveTier === 1 ? "dashed" : "dash-dot";
      const len = item.y2 - item.y1, dashed = item.effectiveBarStyle === "dashed" || (item.effectiveBarStyle === "dash-dot" && len < 16);
      const n = dashed ? Math.max(2, Math.round((len + 5.5) / 14)) : Math.max(1, Math.round((len - 9) / 20.4));
      item.dashArray = item.effectiveBarStyle === "solid" || !(len > 0) ? null : dashed
        ? `${(8.5 * len / (8.5 * n + 5.5 * (n - 1) - .02)).toFixed(3)} ${(5.5 * len / (8.5 * n + 5.5 * (n - 1) - .02)).toFixed(3)}`
        : `${(9 * len / (9 + 20.4 * n - .02)).toFixed(3)} ${(4.5 * len / (9 + 20.4 * n - .02)).toFixed(3)} ${(2.4 * len / (9 + 20.4 * n - .02)).toFixed(3)} ${(4.5 * len / (9 + 20.4 * n - .02)).toFixed(3)}`;
    });
    const hasMultiTier = items.some(item => item.effectiveTier > 0);
    const mode = alignment === "auto" ? (tipsAligned || hasMultiTier ? "aligned" : "nearby") : alignment;
    for(const item of items){
      item.requestedOrientation=item.orientation;
      if(item.orientation==='auto'){
        if(mode==='aligned')item.orientation='vertical';
        else{
          const horizontal=clearSamples(item,'horizontal',boxes,canvasHeight);
          const vertical=clearSamples(item,'vertical',boxes,canvasHeight);
          const horizontalRight=horizontal+10+item.nameWidth,verticalRight=vertical+18+item.maximumFontSize;
          // Use existing whitespace before moving a group beyond other samples.
          item.orientation=horizontal===item.baseX&&horizontalRight<=maximumTipRight+14?'horizontal'
            :verticalRight<horizontalRight?'vertical':'horizontal';
          item.x=item.orientation==='vertical'?vertical:horizontal;
        }
      }
      if(!['horizontal','vertical'].includes(item.orientation))throw new TypeError('Invalid group label orientation');
      const mid = (item.y1 + item.y2) / 2, vert = item.orientation === 'vertical';
      if (item.requestedOrientation === 'auto' && vert) {
        const b = titleBox(item, item.x, 'vertical', canvasHeight);
        Object.assign(item, { tY1: b.y + 4, tY2: b.y + b.height - 4, occupiedY1: Math.min(item.y1, b.y), occupiedY2: Math.max(item.y2, b.y + b.height) });
      } else {
        Object.assign(item, { tY1: vert ? mid - item.nameWidth / 2 : (Number.isFinite(item.titleY1) ? item.titleY1 : mid - item.maximumFontSize * .85),
          tY2: vert ? mid + item.nameWidth / 2 : (Number.isFinite(item.titleY2) ? item.titleY2 : mid + item.maximumFontSize * .35) });
        item.occupiedY1 = vert ? Math.min(item.y1, item.tY1) : item.y1; item.occupiedY2 = vert ? Math.max(item.y2, item.tY2) : item.y2;
      }
    }
  const strictlyContains = (outer, inner) => inner.tipIds.every(id => outer.tipIds.includes(id))
    && !outer.tipIds.every(id => inner.tipIds.includes(id));
  const occupiedRight = (item, x = item.x) => (item.orientation === "vertical" ? x + 18 + item.maximumFontSize : x + 10 + item.nameWidth) + (item.labelShiftX || 0);
  const titleLeft = (item, x) => item.orientation === "vertical" ? x + 18 - item.maximumFontSize * .65 : x + 8;
  const barTextHit = (bar, bx, txt, tx) => bx > tx + 2 && bx - 6 <= occupiedRight(txt, tx) + 4
    && bar.y1 <= (txt.orientation === "vertical" ? txt.tY2 + 4 : (txt.y1 + txt.y2) / 2 + txt.maximumFontSize * .5)
    && bar.y2 >= (txt.orientation === "vertical" ? txt.tY1 - 4 : (txt.y1 + txt.y2) / 2 - txt.maximumFontSize * .5);
  const pairConflict = (a, ax, b, bx) => {
    const padY = a.orientation === "horizontal" && b.orientation === "horizontal" ? 2 : 8;
    const barHit = Math.abs(ax - bx) <= 10 && a.y1 <= b.y2 + 4 && a.y2 >= b.y1 - 4;
    const titleHit = titleLeft(a, ax) <= occupiedRight(b, bx) + 8 && occupiedRight(a, ax) >= titleLeft(b, bx) - 8
      && a.tY1 <= b.tY2 + padY && a.tY2 >= b.tY1 - padY;
    return barHit || titleHit || barTextHit(a, ax, b, bx) || barTextHit(b, bx, a, ax);
  };
  const canCoalign = (other, targetX, placed, item) => other.x < targetX
    && (other.requestedOrientation !== "auto" || clearSamples(other, other.orientation, boxes, canvasHeight, targetX) === targetX)
    && !pairConflict(other, targetX, item, targetX)
    && placed.every(p => p === other || (strictlyContains(p, other)
      ? p.x >= Math.max(targetX + 34, occupiedRight(other, targetX) + 14)
      : strictlyContains(other, p) || !pairConflict(other, targetX, p, p.x)));
  items.forEach(item => { item.alignment = mode; item.alignmentOffset = 0; item.alignmentColumn = 0; item.labelShiftX = 0; });
  if (mode === "aligned" && items.length) {
    // Multi-tier hierarchies lock each peer tier to one shared vertical column
    // and stagger colliding vertical labels rightward without shifting brackets.
    const columnBase = Math.max(...[...tipRightEdges.values()].filter(Number.isFinite), ...items.map(item => item.baseX - 14)) + 14;
    const columns = [];
    [...items].sort((a, b) => a.effectiveTier - b.effectiveTier || b.tipCount - a.tipCount || a.y1 - b.y1 || a.y2 - b.y2).forEach(item => {
      let column = item.effectiveTier;
      if (!hasMultiTier) while (columns[column]?.some(other => pairConflict(item, columnBase, other, columnBase))) column++;
      Object.assign(item, { alignmentOffset: columnBase - item.baseX, baseX: columnBase, x: columnBase, alignmentColumn: column });
      (columns[column] ||= []).push(item);
    });
    if (hasMultiTier) columns.forEach(col => {
      const lanes = [];
      [...col].sort((a, b) => a.y1 - b.y1 || a.y2 - b.y2).forEach(item => {
        let lane = 0; while (lanes[lane]?.some(o => item.tY1 <= o.tY2 + 8 && item.tY2 >= o.tY1 - 8)) lane++;
        (lanes[lane] ||= []).push(item); item.labelShiftX = lane * Math.round(item.maximumFontSize * 1.35);
      });
    });
    let x = columnBase;
    columns.forEach(column => {
      column.forEach(item => { item.x = x; });
      x = Math.max(x + 34, ...column.map(item => occupiedRight(item) + 14));
    });
  } else {
    const placed = [];
    items.forEach(item => {
      let shifted = true;
      while (shifted) {
        shifted = false;
        if (item.requestedOrientation === 'auto') {
          const safeX = clearSamples(item,item.orientation,boxes,canvasHeight,item.x);
          if (safeX > item.x) { item.x = safeX; shifted = true; }
        }
        for (const other of placed) {
          if (strictlyContains(item, other)) {
            const outsideX = Math.max(other.x + 34, occupiedRight(other) + 14);
            if (item.x < outsideX) { item.x = outsideX; shifted = true; }
          } else if (!strictlyContains(other, item) && pairConflict(item, item.x, other, other.x)) {
            if (canCoalign(other, item.x, placed, item)) other.x = item.x;
            else item.x = Math.max(item.x, occupiedRight(other) + 14);
            shifted = true;
          }
        }
      }
      placed.push(item);
    });
  }
  const requiredWidth = Math.max(...items.map(item => occupiedRight(item) + (item.orientation === "vertical" ? 28 : 22)));
  return { items, requiredWidth };
  }
  return Object.freeze({layout});
});
