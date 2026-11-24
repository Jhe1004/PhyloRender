const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');

test('entering a settings page collapses disclosures without changing drawing settings', () => {
  const sections = [{open:true}, {open:true}];
  const controls = {dataset:{}, scrollTop:120, querySelectorAll:() => sections};
  const state = {settingsPage:'data', fontSize:18};
  const context = vm.createContext({state, SETTINGS_PAGE_LABELS:{tree:'树形'}, SETTINGS_PAGE_DESCRIPTIONS:{tree:'说明'},
    document:{querySelector:()=>controls, querySelectorAll:()=>[]}, $:()=>({}), hideHelpTooltip(){}, refreshRootingChoices(){}});
  vm.runInContext(source.slice(source.indexOf('function setSettingsPage('), source.indexOf('function refreshRootingChoices(')), context);
  context.setSettingsPage('tree');
  assert.ok(sections.every(section=>!section.open));
  assert.equal(controls.scrollTop,0);
  assert.equal(state.fontSize,18);
  sections[0].open=true;
  context.setSettingsPage('tree');
  assert.equal(sections[0].open,false);
});

test('rooting selector uses sample labels and existing rooting with cooperative progress', () => {
  assert.match(source, /new Option\(displayTipLabel\(tip.label\), String\(tip.id\)\)/);
  const reroot = source.slice(source.indexOf('async function rerootOnSelectedClade()'), source.indexOf('function cladeSegmentText'));
  assert.match(reroot, /runTreeLoad\("Rerooting Tree"/);
  assert.match(reroot, /PhyloRenderRooting.rerootOnClade/);
  assert.match(reroot, /await finishInteractiveTreeLoad\(progress\)/);
  assert.doesNotMatch(reroot, /\brenderTree\(\)/);
});
