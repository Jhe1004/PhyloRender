const test=require('node:test'),assert=require('node:assert/strict');
const display=require('../core/time-display.js').create(require('../core/geologic-timescale.js')),background=require('../render/time-background.js');
function element(tag,attributes={},text='') {
  return {tag,attributes:{...attributes},text,children:[],append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attributes[k]=v;}};
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
test('Dating and cloud shared background covers the full span, not just the last 145 Ma',()=>{
  const renderer=background.create({display,grid:require("../render/geologic-grid.js"),svgEl:element,niceTickStep:()=>10,timeTextWidth:(s,size)=>s.length*size*.5});
  const fonts=display.typographySettings();
  for(const maximum of [.005,90,150,250,500,1000,2500,4567,5000,10000]) {
    const svg=element('svg');renderer.drawTimeBackground(svg,maximum,a=>1000*(1-a/maximum),0,1000,150,500,516,fonts);
    const all=descendants(svg),rows=[all.filter(n=>n.attributes.class==='time-background'),
      ...[10,516].map(y=>all.filter(n=>n.attributes.class?.includes('time-period-block')&&n.attributes.y===y)),
      all.filter(n=>n.attributes.class?.includes('time-epoch-block'))];
    for(const row of rows) {
      const sorted=row.slice().sort((a,b)=>a.attributes.x-b.attributes.x);let edge=0;
      for(const block of sorted){assert.ok(Math.abs(block.attributes.x-edge)<1e-8,`${maximum} Ma has a gap`);edge+=block.attributes.width;}
      assert.ok(Math.abs(edge-1000)<1e-8,`${maximum} Ma row must cover all 1000 units, got ${edge}`);
    }
  }
});
test('one pinned ICS source provides continuous, finite, immutable geological rows and ranks',()=>{
  assert.equal(display.GEOLOGIC_SOURCE.version,'2026/06');assert.equal(display.GEOLOGIC_SOURCE.maximumMa,4567);
  for(const rows of [display.GEOLOGIC_PERIODS,display.GEOLOGIC_EPOCHS]) {
    assert.ok(Object.isFrozen(rows));assert.equal(rows[0].older,4567);assert.equal(rows.at(-1).younger,0);
    rows.forEach((row,i)=>{assert.ok(Object.isFrozen(row));assert.ok(Number.isFinite(row.older)&&row.older>row.younger);
      if(i)assert.equal(rows[i-1].younger,row.older);assert.ok(row.rank);assert.match(row.fill,/^#[0-9A-F]{6}$/);});
  }
  assert.equal(display.GEOLOGIC_PERIODS.find(x=>x.name==='Archean').rank,'eon');
  assert.equal(display.GEOLOGIC_EPOCHS.find(x=>x.name==='Siderian').rank,'period');
});
test('official recent and older boundaries are retained as nominal background ages',()=>{
  for(const [name,older,younger] of [['Cretaceous',143.1,66],['Paleogene',66,23.04],
    ['Jurassic',201.4,143.1],['Triassic',251.902,201.4],['Permian',298.9,251.902],['Hadean',4567,4031]]) {
    const row=display.GEOLOGIC_PERIODS.find(x=>x.name===name);assert.ok(row,name);assert.equal(row.older,older);assert.equal(row.younger,younger);
  }
});
test('times older than the source chart are explicitly unmapped, never extrapolated to a geological unit',()=>{
  const rows=display.geologicIntervals(5000);
  for(const row of [rows.periods[0],rows.epochs[0]]) {
    assert.equal(row.name,'Outside ICS range');assert.equal(row.rank,'unmapped');assert.equal(row.older,5000);assert.equal(row.younger,4567);
    assert.ok(Object.isFrozen(row));
  }
  assert.equal(display.GEOLOGIC_PERIODS[0].older,4567);
  for(const maximum of [0,-1,NaN,Infinity])assert.throws(()=>display.geologicIntervals(maximum),/range/i);
});
