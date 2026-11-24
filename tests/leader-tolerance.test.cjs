const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = ['app.js','core/label-geometry.js','render/node-label-layout.js'].map(file => fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8')).join('\n');
const start = source.indexOf('const MIN_NODE_ARROW_AXIS_ANGLE');
const end = source.indexOf('\n}',source.indexOf('function nodeArrowGeometryReason'))+2;
const context = require('../core/label-geometry.js');
test('observed rounding differences do not produce geometry warnings',()=>{
  for(const [angle,length] of [[74.59,13.969],[76.266,13.957],[19.9,14],[80.1,14]]) {
    assert.equal(context.nodeArrowGeometryExcess(angle,length),0);
    assert.equal(context.nodeArrowGeometryReason(angle,length),'');
  }
});
test('real violations remain penalized with specific measured explanations',()=>{
  for(const [angle,length] of [[18,14],[82,14],[74,13.5]]) {
    assert.ok(context.nodeArrowGeometryExcess(angle,length)>0);
    assert.ok(context.nodeArrowGeometryReason(angle,length).length>0);
  }
  assert.match(context.nodeArrowGeometryReason(82,13.5),/82.0°.*13.50/);
});
test('automatic and retained reporting use the same tolerance as routing',()=>{
  assert.equal((source.match(/rect.leaderGeometryInvalid = arrows && nodeArrowGeometryExcess\(plan.axisAngle, plan.length\) > 0/g)||[]).length,2);
  assert.match(source,/const anglePenalty = nodeArrowGeometryExcess\(axisAngle, length\) \* 100/);
});
