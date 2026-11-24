const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'ui-shell.css'), 'utf8');
const controls = fs.readFileSync(path.join(root, 'ui-controls.css'), 'utf8');
const numeric = fs.readFileSync(path.join(root, 'ui/numeric-controls.js'), 'utf8');

test('all adjustable numeric parameters share the compact stepper presentation', () => {
  const configure = source.slice(source.indexOf('function configureCompactNumericInputs()'), source.indexOf('function configureCompactPointInputs()'));
  assert.ok(configure, 'compact numeric configuration exists');
  assert.match(configure, /NUMERIC_SETTING_CONTROLS/);
  for (const id of ['cloud-opacity', 'cloud-jitter', 'cloud-pie-radius', 'cloud-pie-legend-scale', 'time-hpd-opacity', 'time-hpd-thickness']) {
    assert.match(numeric, new RegExp(`"${id}"`), `${id} is compact`);
  }
  assert.match(controls, /\.compact-numeric-control :is\(output, \.numeric-scale\)/);
  assert.match(controls, /\.numeric-scale/);
  assert.match(source, /data-phylorender-ui-only/);
  assert.match(shell, /\.compact-point-stepper/);
});

test('expandable help uses one question-mark affordance and one hint vocabulary', () => {
  assert.doesNotMatch(html, /class="help"/);
  assert.match(numeric, /\.help-note-icon/);
  assert.match(numeric, /icon\.textContent = "\?"/);
});
