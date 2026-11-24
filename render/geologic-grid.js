/* One opaque row border and one line per geological boundary. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderGeologicGrid=api;})(globalThis,function(){
  "use strict";
  function append(svgEl,group,blocks,rowY,rowHeight,rowName) {
    const visible=blocks.filter(Boolean).sort((a,b)=>a.x1-b.x1);
    if (!visible.length) return;
    const left=visible[0].x1,right=visible[visible.length-1].x2;
    const grid=svgEl("g",{class:"time-geo-grid","data-row":rowName});
    grid.append(svgEl("rect",{
      class:"time-geo-frame",x:left,y:rowY,width:right-left,height:rowHeight,"data-row":rowName,
    }));
    const drawn=[];
    for (const block of visible.slice(0,-1)) {
      const x=block.x2;
      if (x-left<1||right-x<1||drawn.some(value=>Math.abs(value-x)<1)) continue;
      drawn.push(x);
      grid.append(svgEl("line",{
        class:"time-geo-divider",x1:x,y1:rowY,x2:x,y2:rowY+rowHeight,
        "data-row":rowName,"data-boundary-age":block.interval.younger,
      }));
    }
    group.append(grid);
  }
  return Object.freeze({append});
});
