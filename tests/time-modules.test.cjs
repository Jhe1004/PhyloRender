const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('time display, shared background and dated renderer have independent public modules', () => {
  for (const file of ['core/time-display.js','render/time-background.js','render/time-tree.js']) {
    assert.ok(fs.existsSync(path.resolve(__dirname,'..',file)), 'Missing module '+file);
  }
});

const display = require('../core/time-display.js').create(require('../core/geologic-timescale.js'));
const background = require('../render/time-background.js');
const timeTree = require('../render/time-tree.js');
const geometry = require('../core/label-geometry.js');
const treeGeometry = require('../core/tree-geometry.js');
const scale = require('../time-scale.js');
const scheduler = require('../core/render-scheduler.js');
const finalizeCanvas = require('../render/canvas-finalizer.js').finalize;
function svgEl(tag, attributes = {}, text = '') {
  return {tag,attributes:{...attributes},text,children:[],dataset:{},
    append(...children) {this.children.push(...children);},
    setAttribute(name,value) {this.attributes[name]=value;},
    getAttribute(name) {return this.attributes[name];},
    getBBox() {return {x:Number(this.attributes.x)||0,y:(Number(this.attributes.y)||0)-10,width:String(this.text).length*6,height:12};},
    remove() {this.removed=true;},
  };
}
function descendants(node) {
  return [node,...node.children.flatMap(descendants)];
}
function backgroundFixture() {
  return background.create({display,grid:require("../render/geologic-grid.js"),svgEl,niceTickStep:scale.niceTickStep,
    timeTextWidth:(text,size)=>text.length*size*.5});
}
function treeFixture(overrides = {}) {
  return timeTree.create({geometry,treeGeometry,display,scale,background:backgroundFixture(),svgEl,
    appendNodeLabelArrow:()=>false, enableLabelDrag:()=>{}, refineReadableNodeLabelSteps:function*(){return [];},
    countResidualCollisions:()=>0, updateLabelWarnings:()=>{}, horizontalLayoutForHeight:()=>({plotWidth:940,canvasWidth:1116}),
    publishGeometry:()=>{}, appendTipLabelContent:()=>{},fitTipLabelWidth(){},
    composeTimeNodeAnnotation:()=>({text:''}),buildCladeBarLayout:()=>({items:[],requiredWidth:1116}),
    drawCladeBars:()=>{},drawRetainedNodeLabels:()=>({collisions:0}),finalizeCanvas,planRows:require('../figure-contract.js').planAutomaticRows,...overrides});
}
test('Dating node labels use the ordinary-tree candidate standard within time bounds', () => {
  const node={x:210,y:240},width=46,height=14;
  const bounds={left:50,labelLeft:0,right:500,top:140,bottom:600};
  const branches=[{x1:170,y1:160,x2:170,y2:400},{x1:100,y1:260,x2:400,y2:260}];
  const ordinary=geometry.candidatePlacements(node,width,height,192,branches,{width:500,height:606})
    .map(candidate=>({...candidate,width,height}))
    .filter(rect=>rect.y>=bounds.top-2 && rect.y+rect.height<=bounds.bottom+2);
  assert.deepEqual(geometry.timeAgeCandidatePlacements(node,width,height,bounds,branches),ordinary);
});
test('time units and ranges use only their supplied document, without changing raw values', () => {
  const range={minimumRaw:10,maximumRaw:20};
  const saved=structuredClone(range);
  const units=display.unitSettings('mya','kyr');
  assert.equal(units.factor,1000);
  assert.equal(display.ageRangeFigureLabel(range,units),'10000–20000 kyr');
  assert.equal(display.ageWithinRange(10-1e-10,range),true);
  assert.equal(display.ageWithinRange(9,range),false);
  assert.equal(display.ageWithinRange(NaN,range),false);
  assert.equal(display.ageWithinRange(9,{minimumRaw:null,maximumRaw:null}),true);
  assert.deepEqual(range,saved);
  assert.equal(display.unitSettings('unconfirmed','mya').factor,1);
});
test('shared geological constants cannot be mutated by a workspace', () => {
  for(const values of [display.GEOLOGIC_EPOCHS,display.GEOLOGIC_PERIODS]) {
    assert.ok(Object.isFrozen(values));
    assert.ok(values.every(Object.isFrozen));
  }
  assert.ok(Object.isFrozen(display.TIME_UNITS.mya));
  assert.equal(display.GEOLOGIC_PERIODS.find(item=>item.name==='Paleogene').younger,23.04);
  const earlyCretaceous=display.GEOLOGIC_EPOCHS.find(item=>item.name==='Early Cretaceous');
  assert.deepEqual(earlyCretaceous && {
    older:earlyCretaceous.older,younger:earlyCretaceous.younger,shortName:earlyCretaceous.shortName,
  },{older:143.1,younger:100.5,shortName:'Early K'},
  'the epoch row must cover the Early Cretaceous instead of leaving 143.1–100.5 Mya blank');
});
test('background factories have independent SVG targets and require explicit ports', () => {
  assert.throws(()=>background.create({}),/Missing time background port/);
  const a=backgroundFixture(),b=backgroundFixture();
  const left=svgEl('svg'),right=svgEl('svg');
  const fonts=display.typographySettings();
  a.drawTimeBackground(left,70,age=>70-age,0,70,20,100,120,fonts);
  assert.equal(right.children.length,0);
  assert.equal(left.children[0].attributes.class,'time-geology');
  b.drawTimeAxis(right,70,age=>70-age,0,70,120,'bottom',display.unitSettings('mya'),fonts);
  assert.equal(right.children[0].attributes.class,'time-axis time-axis-bottom');
  assert.ok(Object.isFrozen(a));
});
test('geological abbreviation changes names, never reduces the requested font size', () => {
  const renderer=backgroundFixture(),fonts=display.typographySettings({period:24});
  const period=display.GEOLOGIC_PERIODS.find(item=>item.name==='Cretaceous');
  assert.equal(renderer.geologicLabelForWidth(period,500,false,fonts),'Cretaceous');
  assert.equal(renderer.geologicLabelForWidth(period,30,false,fonts),'K');
  assert.equal(renderer.geologicLabelForWidth(period,2,false,fonts),'');
  assert.equal(fonts.period,32);
});
test('narrow geological intervals shrink their shortest abbreviation per cell while preserving normal-sized cells and omitting microscopic slivers', () => {
  const renderer=backgroundFixture(),fonts=display.typographySettings();
  const q=display.GEOLOGIC_PERIODS.at(-1), pl=display.GEOLOGIC_EPOCHS.at(-3), ps=display.GEOLOGIC_EPOCHS.at(-2), h=display.GEOLOGIC_EPOCHS.at(-1);
  assert.equal(renderer.geologicLabelForWidth(q,14,false,fonts),'Q',
    'a narrow Quaternary cell must shrink Q to fit inside instead of staying blank');
  assert.equal(renderer.geologicLabelForWidth(pl,22,true,fonts),'Pl',
    'a narrow Pliocene cell must shrink Pl to fit inside instead of staying blank');
  assert.equal(renderer.geologicLabelForWidth(ps,21,true,fonts),'Ps',
    'a narrow Pleistocene cell must shrink Ps to fit inside instead of staying blank');
  assert.equal(renderer.geologicLabelForWidth(h,1,true,fonts),'',
    'Holocene remains omitted at microscopic width below minimum legible font size');
  assert.equal(renderer.geologicLabelForWidth(display.GEOLOGIC_EPOCHS.find(item=>item.name==='Oligocene'),48.4,true,fonts),'Olig',
    'a concise but recognizable label is retained at requested size when it fits safely');
  const svg=svgEl('svg');
  renderer.drawTimeBackground(svg,97.5,age=>100+(97.5-age)*6.0,100,685,145,500,520,fonts);
  const all=descendants(svg);
  const qLabel=all.find(child=>child.tag==='text' && child.attributes['data-full-name']==='Quaternary');
  const plLabel=all.find(child=>child.tag==='text' && child.attributes['data-full-name']==='Pliocene');
  const psLabel=all.find(child=>child.tag==='text' && child.attributes['data-full-name']==='Pleistocene');
  const mioLabel=all.find(child=>child.tag==='text' && child.attributes['data-full-name']==='Miocene');
  assert.equal(qLabel?.text,'Q');
  assert.equal(qLabel?.attributes['data-label-shrunk'],'true');
  assert.match(String(qLabel?.attributes.style||''),/font-size:/);
  assert.equal(plLabel?.text,'Pl');
  assert.equal(plLabel?.attributes['data-label-shrunk'],'true');
  assert.equal(psLabel?.text,'Ps');
  assert.equal(psLabel?.attributes['data-label-shrunk'],'true');
  assert.equal(mioLabel?.text,'Miocene');
  assert.equal(mioLabel?.attributes['data-label-shrunk'],undefined,'cells that already fit must not be shrunk');
  assert.equal(mioLabel?.attributes.style,undefined,'cells that already fit must keep default CSS font size');
});
test('geological rows use one opaque frame and one divider per shared boundary', () => {
  const renderer=backgroundFixture(),fonts=display.typographySettings(),svg=svgEl('svg');
  renderer.drawTimeBackground(svg,150,age=>78+(150-age)*4.3,78,723,145,6200,6345,fonts);
  const all=descendants(svg);
  const frames=all.filter(child=>String(child.attributes.class||'').includes('time-geo-frame'));
  const dividers=all.filter(child=>String(child.attributes.class||'').includes('time-geo-divider'));
  assert.equal(frames.length,3,'top periods, epochs and bottom periods each need one frame');
  assert.ok(dividers.length>0,'shared interval boundaries need explicit single dividers');
  const identities=dividers.map(line=>`${line.attributes['data-row']}|${Number(line.attributes.x1).toFixed(6)}`);
  assert.equal(new Set(identities).size,identities.length,'a shared boundary must not be painted twice');
  const earlyBlock=all.find(child=>String(child.attributes.class||'').includes('time-epoch-block')
    && child.attributes['data-full-name']==='Early Cretaceous');
  const earlyLabel=all.find(child=>child.tag==='text' && child.attributes['data-full-name']==='Early Cretaceous');
  assert.ok(earlyBlock,'143.1–100.5 Mya needs a real Early Cretaceous epoch block');
  assert.equal(earlyBlock.attributes['data-label-placement'],'inside');
  assert.equal(earlyLabel?.text,'Early Cretaceous','the wide default block should show the full epoch name');
  const css=fs.readFileSync(path.resolve(__dirname,'../styles.css'),'utf8');
  assert.match(css,/\.time-geo-block\s*\{[^}]*stroke:\s*none/s,
    'individual colored cells must not draw overlapping borders');
  assert.match(css,/\.time-geo-frame[^}]*stroke-opacity:\s*1/s,
    'the single row frame must be opaque rather than a translucent hairline');
});
test('geologic labels stay inside their blocks or are omitted, with no full-name key', () => {
  const renderer=backgroundFixture(),fonts=display.typographySettings({period:24,epoch:24,legend:12});
  const svg=svgEl('svg');
  renderer.drawTimeBackground(svg,70,age=>70-age,0,70,150,500,520,fonts);
  const geology=svg.children[0];
  const blocks=geology.children.filter(child=>String(child.attributes.class||'').includes('time-geo-block'));
  const labels=descendants(geology).filter(child=>String(child.attributes.class||'').includes('time-geo-label'));
  assert.ok(labels.every(label=>String(label.text).trim().length>0));
  const leaders=descendants(geology).filter(child=>String(child.attributes.class||'').includes('time-geo-callout-leader'));
  for(const block of blocks) {
    const name=block.attributes['data-full-name'];
    const inside=labels.some(label=>label.attributes['data-full-name']===name
      && !String(label.attributes.class||'').includes('external-label'));
    if(block.attributes['data-label-placement']==='omitted') assert.equal(inside,false,
      `${name} must not force text across a narrow block`);
    else assert.ok(inside,`${name} must keep its label inside the block`);
  }
  assert.ok(blocks.some(block=>block.attributes['data-full-name']!=='Holocene'
    && block.attributes['data-label-placement']==='omitted'),
  'other microscopic intervals must receive the same no-overlap protection as Holocene');
  const compact=labels.filter(label=>String(label.attributes.class||'').includes('compact'));
  assert.ok(compact.length>0,'narrow blocks should use abbreviations');
  assert.deepEqual(leaders,[],'omitted Holocene must not create an external arrow');
  assert.deepEqual(labels.filter(item=>String(item.attributes.class||'').includes('external-label')),[],
    'all visible geological labels must stay inside their own blocks');
  assert.ok(compact.every(item=>!String(item.attributes.class||'').includes('external-label')),
    'abbreviations remain in place even when they slightly overlap a border');
  const key=geology.children.find(child=>child.attributes.class==='time-geology-key');
  assert.equal(key,undefined,'abbreviation full names belong in the figure caption, not on the canvas');
});
test('microscopic Holocene is omitted without an external label or arrow', () => {
  const renderer=backgroundFixture(),fonts=display.typographySettings({period:24,epoch:24,legend:12});
  const layoutEntries=renderer.geologicAbbreviationEntries(70,70,fonts);
  assert.equal(layoutEntries.some(item=>item.name==='Holocene'),false,
    'omitted Holocene must not reserve an invisible legend row');
  const svg=svgEl('svg');
  renderer.drawTimeBackground(svg,70,age=>70-age,0,70,150,500,520,fonts);
  const geology=svg.children[0];
  const all=descendants(geology);
  const holocene=all.find(child=>child.tag==='text' && child.attributes['data-full-name']==='Holocene');
  assert.equal(holocene,undefined,'Holocene text is omitted when even H cannot fit');
  const leader=all.find(child=>String(child.attributes.class||'').includes('time-geo-callout-leader')
    && child.attributes['data-full-name']==='Holocene');
  assert.equal(leader,undefined,'omitted Holocene must not create an arrow');
  const blocks=all.filter(child=>String(child.attributes.class||'').includes('time-epoch-block')
    && child.attributes['data-full-name']==='Holocene');
  assert.ok(blocks.length>0,'the true Holocene colored interval remains present');
  assert.ok(blocks.every(block=>block.attributes['data-label-placement']==='omitted'));
  assert.equal(all.some(child=>String(child.attributes.class||'').includes('minimum-label')
    && child.attributes['data-full-name']==='Holocene'),false,'do not force the H into the interval');
});
test('dated label factory uses explicit factor and manual map, with no cross-document changes', () => {
  assert.throws(()=>timeTree.create({}),/Missing time tree port/);
  const renderer=treeFixture(),group=svgEl('g'),otherManual=new Map([['other',{dx:4,dy:5}]]);
  const config={fonts:{preferred:12,minimum:12},auto:false,arrows:false,nodeRadius:5,
    units:display.unitSettings('mya','kyr'),manualLabels:new Map()};
  const node={id:'n',x:50,y:40,timeAge:20,displayNodeLabel:'20.00'};
  const saved=structuredClone(node);
  const result=scheduler.finishRenderSteps(renderer.placeTimeNodeLabelSteps([node],group,svgEl('g'),svgEl('g'),
    {left:0,right:150,top:0,bottom:100},[],[],config));
  assert.deepEqual(result,{count:1,collisions:0});
  assert.equal(group.children[0].attributes['data-age'],20000);
  assert.equal(group.children[0].attributes['data-age-raw'],20);
  assert.deepEqual(node,saved);
  assert.deepEqual([...otherManual],[['other',{dx:4,dy:5}]]);
});
test('cancelling the dated label generator leaves unprocessed labels and scientific input untouched', async () => {
  const renderer=treeFixture(),controller=new AbortController(),group=svgEl('g');
  const node={id:'n',x:50,y:40,timeAge:20,displayNodeLabel:'20.00'};
  const saved=structuredClone(node);
  const config={fonts:{preferred:12,minimum:12},auto:false,arrows:false,nodeRadius:5,
    units:display.unitSettings('mya'),manualLabels:new Map()};
  const steps=renderer.placeTimeNodeLabelSteps([node],group,svgEl('g'),svgEl('g'),{left:0,right:150,top:0,bottom:100},[],[],config);
  let clock=0;
  await assert.rejects(scheduler.run(steps,{signal:controller.signal,now:()=>clock+=30,
    pause:async()=>{},onProgress:()=>controller.abort()}),/abort/i);
  assert.equal(group.children.length,0);
  assert.equal(steps.next().done,true);
  assert.deepEqual(node,saved);
});
