const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/../app.js`, 'utf8');
const helper = source.slice(source.indexOf('function cloudTimeBackgroundSettings()'), source.indexOf('function updateCloudTimeBackgroundControls()'));
test('cloud standard palette works for real, relative and unconfirmed times without changing provenance', () => {
  const controls = { 'cloud-show-time-axis': { checked: true }, 'time-geology': { value: 'standard' } };
  const state = { cloud: { importedDating: null } };
  let unit = 'relative-display';
  const context = vm.createContext({ $, state, TIME_UNITS: { mya: {years:1e6,label:'Million years ago (Mya)'}, kyr:{years:1000,label:'Thousands of years ago (kyr)'}, years:{years:1,label:'Years ago (yr)'} }, cloudTimeUnit: () => unit });
  function $(id) { return controls[id]; }
  vm.runInContext(helper, context);
  assert.equal(context.cloudTimeBackgroundSettings().geologyVisible, true);
  assert.equal(context.cloudTimeBackgroundSettings().sourceYears, null);
  assert.equal(context.cloudTimeBackgroundSettings().paletteYears, 1e6);
  assert.equal(context.cloudTimeBackgroundSettings().illustrativePalette, true);
  unit = 'mya'; // Explicit root-age units map colors but do not invent calibration provenance.
  assert.equal(context.cloudTimeBackgroundSettings().geologyVisible, true);
  assert.equal(state.cloud.importedDating, null);
  state.cloud.importedDating = {};
  for (const [value, years] of [['mya',1e6],['kyr',1000],['years',1]]) {
    unit = value;
    assert.equal(context.cloudTimeBackgroundSettings().geologyVisible, true);
    assert.equal(context.cloudTimeBackgroundSettings().sourceYears, years);
  }
  for (const value of ['relative','unconfirmed']) {
    unit = value; assert.equal(context.cloudTimeBackgroundSettings().geologyVisible, true);
    assert.equal(context.cloudTimeBackgroundSettings().sourceYears, null);
    assert.equal(context.cloudTimeBackgroundSettings().illustrativePalette, true);
  }
  unit = 'mya'; controls['time-geology'].value = 'none';
  assert.equal(context.cloudTimeBackgroundSettings().geologyVisible, false);
  controls['time-geology'].value = 'standard'; controls['cloud-show-time-axis'].checked = false;
  assert.equal(context.cloudTimeBackgroundSettings().geologyVisible, false);
});
