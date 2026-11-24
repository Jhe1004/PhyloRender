const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../core/output-geometry.js');

const base = {
  height: 3600,
  naturalPlotWidth: 700,
  fixedWidth: 300,
  minimumPlotWidth: 160,
  maximumCanvasWidth: 1511,
  requestedCanvasWidth: 0,
  mode: 'auto',
  targetRatio: null,
};

test('one pure calculator supplies identical geometry to every workspace', () => {
  const expected = geometry.calculate(base);
  for (const workspace of ['phylogeny', 'time', 'cloud', 'conflict']) {
    assert.deepEqual(geometry.calculate({...base, workspace}), expected);
  }
  assert.ok(expected.plotWidth > base.naturalPlotWidth);
  assert.equal(expected.canvasWidth, expected.plotWidth + base.fixedWidth);
});

test('content, fixed ratio and explicit physical width allocate real plot space', () => {
  const content = geometry.calculate({...base, mode:'content'});
  const ratio = geometry.calculate({...base, mode:'custom', targetRatio:1.2});
  const physical = geometry.calculate({...base, requestedCanvasWidth:1400});
  const compactPhysical = geometry.calculate({...base, requestedCanvasWidth:800});
  assert.equal(content.canvasWidth, 1000);
  assert.equal(content.plotWidth, 700);
  assert.ok(ratio.canvasWidth > content.canvasWidth);
  assert.equal(physical.canvasWidth, 1400);
  assert.equal(physical.plotWidth, 1100);
  assert.equal(compactPhysical.canvasWidth, 800);
  assert.equal(compactPhysical.plotWidth, 500);
});

test('workspace ceiling compresses plot geometry before text and preserves a minimum span', () => {
  const single = geometry.calculate({...base, height:12000, fixedWidth:620, maximumCanvasWidth:1511});
  const double = geometry.calculate({...base, height:12000, fixedWidth:900, minimumPlotWidth:320,
    maximumCanvasWidth:3023});
  assert.equal(single.canvasWidth, 1511);
  assert.equal(single.plotWidth, 891);
  assert.equal(single.widthLimited, true);
  assert.equal(double.canvasWidth, 3023);
  assert.equal(double.plotWidth, 2123);
  assert.ok(double.plotWidth / 2 >= 160);
  assert.throws(() => geometry.calculate({...base, fixedWidth:1400, maximumCanvasWidth:1511}),
    error => error.code === 'FIGURE_WIDTH_CONTENT_LIMIT');
});

test('manual horizontal scale is bounded and never compounds', () => {
  const layout = geometry.calculate({...base, mode:'content'});
  const stretched = geometry.applyManualScale(layout, 1.5);
  assert.equal(stretched.plotWidth, layout.plotWidth * 1.5);
  assert.deepEqual(geometry.applyManualScale(layout, 1.5), stretched);
  assert.equal(geometry.applyManualScale(layout, 10).canvasWidth, base.maximumCanvasWidth);
});

test('layout measures at canonical SVG scale and restores the prior view on failure',async()=>{
  const {runAtCanonicalScale}=require('../render/canvas-finalizer.js');
  const svg={style:{transform:'scale(0.4)'}};
  const result=await runAtCanonicalScale(svg,async()=>{assert.equal(svg.style.transform,'none');return 42;});
  assert.equal(result,42);assert.equal(svg.style.transform,'scale(0.4)');
  await runAtCanonicalScale(svg,async()=>{svg.style.transform='scale(0.8)';});
  assert.equal(svg.style.transform,'scale(0.8)','keep the completed renderer view');
  const failure=Object.assign(new Error('cancelled'),{code:'CANCELLED'});
  await assert.rejects(runAtCanonicalScale(svg,async()=>{svg.style.transform='scale(0.9)';throw failure;}),error=>error===failure);
  assert.equal(svg.style.transform,'scale(0.8)','a cancelled render cannot leave a changed view scale');
});
