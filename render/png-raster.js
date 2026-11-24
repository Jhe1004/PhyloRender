/* Shared SVG-to-PNG conversion; callers provide browser primitives explicitly. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderPngRaster=api;})(globalThis,function(root){
  'use strict';
  const policy='svg-software-canvas-v1';
  function failure(message,code='PNG_RASTERIZATION_FAILED') {return Object.assign(new Error(message),{code});}
  function waitAnimationFrame(timeoutMs) {
    if(typeof root.requestAnimationFrame!=='function')return Promise.resolve();
    return new Promise(resolve=>{
      let settled=false;
      const done=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve();};
      const timer=setTimeout(done,timeoutMs);
      root.requestAnimationFrame(done);
    });
  }
  async function settleEmbeddedFonts(svg,ports,check) {
    if(ports.settleDecodedImage){await ports.settleDecodedImage(svg);return;}
    if(!/@font-face\b/i.test(svg)||typeof root.requestAnimationFrame!=='function')return;
    const timeoutMs=Number.isFinite(ports.settleTimeoutMs)&&ports.settleTimeoutMs>0?ports.settleTimeoutMs:60;
    await waitAnimationFrame(timeoutMs);check();
    await waitAnimationFrame(timeoutMs);
  }
  async function rasterize({svg,width,height,scale=1,dpi=null,maxPixels=null,signal=null},ports) {
    const check=()=>{signal?.throwIfAborted();ports.checkCancelled?.();};
    check();
    maxPixels ??= ports.limits.maximumPixels;
    const maximumDimension=ports.limits.maximumDimension;
    if(typeof svg!=='string'||!svg.trim()||![width,height,scale,maxPixels].every(value=>Number.isFinite(value)&&value>0))
      throw failure('SVG and finite positive raster dimensions are required','PNG_RASTER_INPUT_INVALID');
    const pixelWidth=Math.max(1,Math.round(width*scale)),pixelHeight=Math.max(1,Math.round(height*scale));
    if(pixelWidth>maximumDimension||pixelHeight>maximumDimension||pixelWidth*pixelHeight>maxPixels)
      throw failure('Requested PNG exceeds the raster size limit','PNG_RASTER_LIMIT');
    const source=ports.createSource(svg);
    let abort,image;
    try {
      image=ports.createImage();image.src=source;
      const ready=(async()=>{await image.decode();check();await settleEmbeddedFonts(svg,ports,check);})();
      if(signal){
        ready.catch(()=>{});
        const cancelled=new Promise((_,reject)=>{
          abort=()=>reject(signal.reason||failure('PNG rasterization cancelled','CANCELLED'));
          signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
        });
        await Promise.race([ready,cancelled]);
      }else await ready;
      check();
      const canvas=ports.createCanvas();canvas.width=pixelWidth;canvas.height=pixelHeight;
      // Chromium's read-frequent surface avoids GPU/compositor tile rasterization.
      const context=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
      if(!context)throw failure('Unable to create software PNG canvas');
      context.fillStyle='white';context.fillRect(0,0,pixelWidth,pixelHeight);
      context.scale(scale,scale);context.drawImage(image,0,0,width,height);
      await ports.beforeEncode?.({width:pixelWidth,height:pixelHeight});check();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw failure('PNG encoding failed');
      let bytes=new Uint8Array(await blob.arrayBuffer());check();
      if(dpi!==null)bytes=ports.pngWithDpi(bytes,dpi);
      return {bytes,width:pixelWidth,height:pixelHeight,policy};
    }finally{if(abort)signal.removeEventListener('abort',abort);if(image)image.src='';ports.revokeSource(source);}
  }
  return Object.freeze({rasterize,policy});
});
