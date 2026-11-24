const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('app.js');

test('global group-name color controls, defaults and bridge mappings are removed', () => {
  for (const name of ['app.js', 'index.html', 'agent-bridge.js']) {
    assert.doesNotMatch(read(name), /clade-font-color|clade-follow-clade/);
  }
  assert.doesNotMatch(read('styles.css'), /--clade-color/);
  const drawing = source.slice(source.indexOf('function drawCladeBars('), source.indexOf('function cladeBarGapReport('));
  assert.match(drawing, /style: `fill:\$\{item.color\}`/);
  assert.match(read('agent-bridge.js'), /options.typography.clades.follow_clade_color = true/);
});

test('editing a name inherits the selected group color, new groups preview the next palette color', () => {
  const groups = { cladeColors: new Map([['one', '#d55e00']]) };
  const state = { pendingCladeNodeId: 'one' };
  const context = vm.createContext({ state, activeCladeState: () => groups, nextCladeColor: () => '#0072b2' });
  vm.runInContext(source.slice(source.indexOf('function pendingCladeNameColor('), source.indexOf('function updateCladeSegmentPreview(')), context);
  assert.equal(context.pendingCladeNameColor(), '#d55e00');
  state.pendingCladeNodeId = 'new';
  assert.equal(context.pendingCladeNameColor(), '#0072b2');
  assert.equal(groups.cladeColors.size, 1);
});
