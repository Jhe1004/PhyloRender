const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const contract = require('../figure-contract.js');
const display = require('../core/time-display.js').create(require('../core/geologic-timescale.js'));
function settings(values = {}) {
  const points = Object.fromEntries(['period','epoch','legend','axis','unit','key'].map(type => [type, values[`time-${type}-size`]]));
  return display.typographySettings(points, contract.publicationDefaults.time);
}
test('six time typography defaults preserve independent physical units', () => {
  assert.deepEqual(contract.publicationDefaults.time, {
    period_size_pt: 16.5,
    epoch_size_pt: 14.25,
    legend_size_pt: 12.75,
    axis_size_pt: 15.75,
    unit_size_pt: 15,
    key_size_pt: 15,
  });
  const fonts = settings();
  for (const type of ['period', 'epoch', 'legend', 'axis', 'unit', 'key']) {
    assert.ok(Math.abs(fonts[type] - require('../figure-units.js').drawingToDesign(contract.defaults('time').time[`${type}_size_u`]))<1e-9);
    const changed = settings({ [`time-${type}-size`]: 15 });
    assert.equal(changed[type], 20);
    for (const other of ['period', 'epoch', 'legend', 'axis', 'unit', 'key'].filter(other => other !== type)) {
      assert.equal(changed[other], fonts[other]);
    }
  }
});
test('time geometry grows for large requested text without automatic font reduction', () => {
  const fonts = settings({ 'time-period-size': 24, 'time-epoch-size': 24, 'time-axis-size': 24 });
  assert.equal(fonts.period, 32);
  assert.ok(fonts.periodRow >= fonts.period + 10);
  assert.ok(fonts.axisOffset >= fonts.axis + 12);
  for (const invalid of ['', -1, 100, 'bad']) assert.equal(settings({ 'time-axis-size': invalid }).axis, 21);
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  assert.doesNotMatch(css.match(/\.time-geo-label\.compact\s*\{[^}]*\}/)?.[0] || '', /font-size/);
});
