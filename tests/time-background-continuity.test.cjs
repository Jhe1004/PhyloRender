const test=require('node:test'),assert=require('node:assert/strict');
const background=require('../render/time-background.js'),display=require('../core/time-display.js').create(require('../core/geologic-timescale.js'));
function element(tag,attributes={},text=''){
  return {tag,attributes:{...attributes},text,children:[],append(...nodes){this.children.push(...nodes);},
    setAttribute(k,v){this.attributes[k]=v;}};
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
test('geological fills meet the bottom period row without moving blocks or axes',()=>{
  const renderer=background.create({display,grid:require("../render/geologic-grid.js"),svgEl:element,niceTickStep:()=>10,timeTextWidth:(t,s)=>t.length*s*.5});
  const fonts=display.typographySettings();
  for(const separation of [16,0,145]){
    const svg=element('svg'),plotTop=145,plotBottom=500,bottomRow=plotBottom+separation;
    renderer.drawTimeBackground(svg,72,age=>72-age,0,72,plotTop,plotBottom,bottomRow,fonts);
    const all=descendants(svg),fills=all.filter(n=>n.attributes.class==='time-background');
    const bottom=all.filter(n=>n.attributes.class?.includes('time-period-block')&&n.attributes.y===bottomRow);
    assert.ok(fills.length>0);assert.equal(fills.length,bottom.length);
    for(let i=0;i<fills.length;i++){
      const a=fills[i].attributes,b=bottom[i].attributes;
      assert.equal(a.y+a.height,b.y,'no unpainted strip before the bottom period row');
      assert.equal(a.y,plotTop);assert.equal(a.x,b.x);assert.equal(a.width,b.width);
      assert.ok(a.height>0);
    }
    assert.ok(all.filter(n=>n.tag!=='g'&&n.attributes['data-row']==='period-bottom').every(n=>n.attributes.y===bottomRow||n.attributes.y1===bottomRow));
  }
});
