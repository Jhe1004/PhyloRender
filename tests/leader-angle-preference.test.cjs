const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const functionSource = name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];
const context = require('../core/label-geometry.js');

test('45 degrees is preferred and deviations receive a progressive symmetric cost',()=>{
  assert.equal(context.nodeArrowAnglePreferenceCost({length:14,axisAngle:45}),0);
  assert.equal(context.nodeArrowAnglePreferenceCost({length:14,axisAngle:30}),6);
  assert.equal(context.nodeArrowAnglePreferenceCost({length:14,axisAngle:60}),6);
  assert.ok(context.nodeArrowAnglePreferenceCost({length:14,axisAngle:75})
    > context.nodeArrowAnglePreferenceCost({length:14,axisAngle:60}));
});

test('angle preference participates in the shared cost without overriding long-line growth',()=>{
  assert.ok(context.leaderVisualCost({crossings:0,length:14,axisAngle:75})
    > context.leaderVisualCost({crossings:0,length:14,axisAngle:45}));
  assert.ok(context.leaderVisualCost({crossings:0,length:70,axisAngle:45})
    > context.leaderVisualCost({crossings:0,length:14,axisAngle:80}));
  assert.match(source,/data-preferred-axis-angle-degrees/);
});
