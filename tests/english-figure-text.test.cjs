const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const display = require('../core/time-display.js').create(require('../core/geologic-timescale.js'));
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
test('time figure units and age sources use English without changing factors', () => {
  const values = { 'time-source-unit': 'mya', 'time-display-unit': 'same' };
  const settings = () => display.unitSettings(values['time-source-unit'], values['time-display-unit']);
  for (const [unit, label] of [['years','Years ago (yr)'], ['kyr','Thousands of years ago (kyr)'], ['mya','Million years ago (Mya)'], ['unconfirmed','Tree units (unconfirmed)']]) {
    values['time-source-unit'] = unit;
    assert.equal(settings().label, label);
    assert.equal(settings().factor, 1);
  }
  values['time-source-unit'] = 'years'; values['time-display-unit'] = 'mya';
  assert.equal(settings().factor, 1e-6);
});
test('scientific provenance stays in reports and captions instead of the figure canvas', () => {
  const renderer = fs.readFileSync(require('node:path').join(__dirname, '../render/time-tree.js'), 'utf8');
  const cloudRenderer = fs.readFileSync(require('node:path').join(__dirname, '../render/cloud-tree.js'), 'utf8');
  assert.doesNotMatch(renderer, /time-figure-key|Node ages:|Label range:/);
  assert.doesNotMatch(cloudRenderer, /time-figure-key|cloud-alignment-note|Time scale follows|Geological colors are illustrative|Gene trees are time-aligned/);
  assert.match(source, /groups\.cladeNames\.get\(nodeId\) \|\| "Unnamed clade"/);
  assert.match(source, /Time unit not yet confirmed/);
});
