const test=require('node:test'),assert=require('node:assert/strict');
const raster=require('../render/png-raster.js');
function ports(overrides={}){
 const calls=[];const context={scale(...v){calls.push(['scale',...v]);},drawImage(...v){calls.push(['image',...v.slice(1)]);},fillRect(...v){calls.push(['fill',...v]);}};
 const canvas={getContext(type,options){calls.push(['context',type,options]);return context;},toBlob(fn){fn(new Blob([new Uint8Array([1,2,3])]));}};
 return {calls,canvas,limits:require('../figure-contract.js').rasterization,createSource:()=>{calls.push(['source']);return 'private-blob';},revokeSource:url=>calls.push(['revoke',url]),createImage:()=>({decode:async()=>{}}),createCanvas:()=>canvas,pngWithDpi:bytes=>bytes,...overrides};
}
test('fractional scene dimensions round once at physical pixels and use a read-frequent opaque canvas',async()=>{
 const p=ports(),r=await raster.rasterize({svg:'<svg/>',width:1511,height:1187.4,scale:3.126},p);
 assert.equal(r.width,Math.round(1511*3.126));assert.equal(r.height,Math.round(1187.4*3.126));
 assert.deepEqual(p.calls.find(c=>c[0]==='context'),['context','2d',{alpha:false,willReadFrequently:true}]);
 assert.deepEqual(p.calls.find(c=>c[0]==='fill'),['fill',0,0,r.width,r.height]);
 assert.deepEqual(p.calls.find(c=>c[0]==='image'),['image',0,0,1511,1187.4]);
 assert.deepEqual(p.calls.at(-1),['revoke','private-blob']);
});
test('invalid dimensions and excessive output fail before allocating resources',async()=>{
 for(const size of [{width:NaN,height:1},{width:-1,height:1},{width:40000,height:1},{width:10000,height:10000}]){
  const p=ports();await assert.rejects(raster.rasterize({svg:'<svg/>',...size},p));assert.deepEqual(p.calls,[]);
 }
});
test('decode, context and encoding failures always revoke the private SVG source',async()=>{
 for(const failure of [{createImage:()=>{throw Error('constructor failed');}}, {createImage:()=>({decode:async()=>{throw Error('decode failed');}})}, {createCanvas:()=>({getContext:()=>null})}, {createCanvas:()=>({getContext:()=>({fillRect(){},scale(){},drawImage(){}}),toBlob:fn=>fn(null)})}]){
  const p=ports(failure);await assert.rejects(raster.rasterize({svg:'<svg/>',width:10,height:10},p));assert.deepEqual(p.calls.at(-1),['revoke','private-blob']);
 }
});
test('cancellation interrupts pending decode and never encodes a partial image',async()=>{
 const signal=new AbortController(),p=ports({createImage:()=>({decode:()=>new Promise(()=>{})})});
 const job=raster.rasterize({svg:'<svg/>',width:10,height:10,signal:signal.signal},p);signal.abort(Error('cancelled'));
 await assert.rejects(job,/cancelled/);assert.deepEqual(p.calls.at(-1),['revoke','private-blob']);assert.ok(!p.calls.some(c=>c[0]==='context'));
});
test('embedded @font-face SVGs wait for two animation frames after decode before drawing to avoid FOIT blank runs',async()=>{
 const prevRaf=globalThis.requestAnimationFrame;
 let rafCount=0;
 globalThis.requestAnimationFrame=cb=>{rafCount++;setImmediate(()=>cb(rafCount*16));return rafCount;};
 try{
  const p=ports({createImage:()=>({decode:async()=>{p.calls.push(['decoded']);}})});
  const svg='<svg><style>@font-face { font-family: "Noto Sans SC Variable"; font-display: block; src: url("data:font/woff2;base64,AAAA"); }</style><text>↪ Continued clade (111 tips)</text></svg>';
  await raster.rasterize({svg,width:100,height:50},p);
  assert.equal(rafCount,2,'must wait two animation frames for SVG-in-img @font-face instantiation');
  const decodeIndex=p.calls.findIndex(c=>c[0]==='decoded'),drawIndex=p.calls.findIndex(c=>c[0]==='image');
  assert.ok(decodeIndex>=0&&drawIndex>decodeIndex);
  rafCount=0;
  await raster.rasterize({svg:'<svg><text>Plain</text></svg>',width:100,height:50},ports());
  assert.equal(rafCount,0,'SVGs without @font-face do not wait extra animation frames');
 }finally{globalThis.requestAnimationFrame=prevRaf;}
});
test('cancellation during post-decode @font-face settle aborts cleanly and revokes source without drawing',async()=>{
 const prevRaf=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=()=>1;
 try{
  const signal=new AbortController(),p=ports({settleTimeoutMs:5000});
  const svg='<svg><style>@font-face { font-family: "Noto Sans SC Variable"; src: url("data:font/woff2;base64,AAAA"); }</style></svg>';
  const job=raster.rasterize({svg,width:10,height:10,signal:signal.signal},p);
  await Promise.resolve();await Promise.resolve();
  signal.abort(Error('cancelled during font settle'));
  await assert.rejects(job,/cancelled during font settle/);
  assert.deepEqual(p.calls.at(-1),['revoke','private-blob']);
  assert.ok(!p.calls.some(c=>c[0]==='image'));
 }finally{globalThis.requestAnimationFrame=prevRaf;}
});
