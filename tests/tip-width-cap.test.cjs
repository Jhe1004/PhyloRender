const test=require('node:test'),assert=require('node:assert/strict');
const contract=require('../figure-contract.js');
function label(width,anchor='start') {
 const attrs=new Map([['x','100'],['y','80'],['text-anchor',anchor],['font-size','24']]);
 return {textContent:'Aconitum scientific name_SPECIMEN_1',children:[{textContent:'Aconitum',italic:true}],
  attrs,setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k)||null,removeAttribute:k=>attrs.delete(k),
  getComputedTextLength:()=>attrs.has('textLength')?Number(attrs.get('textLength')):width,
  getBBox(){const w=attrs.has('textLength')?Number(attrs.get('textLength')):width;return {x:anchor==='end'?100-w:100,y:60,width:w,height:24};}};
}
test('sample-name maximum is 1.25 times the natural-width median, independent of canvas',()=>{
 assert.equal(contract.tipLabelWidth.maximumMedianRatio,1.25);
 assert.equal(contract.maximumTipLabelWidth([900,100,110,120,130]),150);
 assert.equal(contract.maximumTipLabelWidth([100,200,300,800]),312.5);
 assert.equal(contract.maximumTipLabelWidth([500,500,500]),625);
 assert.equal(contract.maximumTipLabelWidth([300]),375);
 assert.equal(contract.maximumTipLabelWidth([]),Infinity);
 assert.equal(contract.maximumTipLabelWidth([0,0]),Infinity);
 for(const widths of [[NaN],[Infinity],[-1]]) assert.throws(()=>contract.maximumTipLabelWidth(widths),/width/i);
});
test('long mixed-style names compress glyphs horizontally, preserving text, anchor and height',()=>{
 const fit=require('../render/tip-width.js').fit;
 for(const anchor of ['start','end']) {
  const node=label(900,anchor),text=node.textContent,runs=structuredClone(node.children),before=node.getBBox();
  const result=fit(node,500);assert.equal(result.compressed,true);assert.equal(node.getBBox().width,500);
  assert.equal(node.getAttribute('lengthAdjust'),'spacingAndGlyphs');assert.equal(node.getAttribute('font-size'),'24');
  assert.equal(node.getBBox().height,before.height);assert.equal(node.getAttribute('x'),'100');assert.equal(node.getAttribute('y'),'80');
  assert.equal(node.textContent,text);assert.deepEqual(node.children,runs);
  assert.equal(fit(node,500).scale,result.scale,'repeated layout must not accumulate compression');
  fit(node,1000);assert.equal(node.getBBox().width,900);assert.equal(node.getAttribute('textLength'),null);
 }
});
test('short and exact-limit names retain byte-identical attributes; invalid geometry is rejected',()=>{
 const fit=require('../render/tip-width.js').fit;
 for(const width of [120,500]) {const node=label(width),before=[...node.attrs];assert.equal(fit(node,500).compressed,false);assert.deepEqual([...node.attrs],before);}
 assert.throws(()=>fit(label(300),0),/width/i);
 assert.throws(()=>fit({...label(10),getBBox:()=>({width:NaN})},500),/geometry/i);
});

test('batch fitting measures all natural names before fitting and allows wider typical names',()=>{
 const nodes=[label(400),label(420),label(440),label(460),label(900)];
 const fitAll=require('../render/tip-width.js').fitAll;
 const before=nodes.map(n=>n.getBBox());
 const result=fitAll(nodes,contract.maximumTipLabelWidth);
 assert.equal(result.maximumWidth,550);
 assert.deepEqual(nodes.map(n=>n.getBBox().width),[400,420,440,460,550]);
 assert.deepEqual(nodes.map(n=>n.getBBox().height),before.map(n=>n.height));
 assert.deepEqual(fitAll(nodes,contract.maximumTipLabelWidth),result,'repeat uses natural widths, not previous fits');
 fitAll([nodes[4]],contract.maximumTipLabelWidth);assert.equal(nodes[4].getBBox().width,900);
 assert.deepEqual(fitAll([],contract.maximumTipLabelWidth).labels,[]);
});
