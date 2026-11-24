const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
test('workbench categorizes names, scientific data, node annotations and background separately', () => {
  for (const [id, page] of [['tip-typography-section','tips'], ['tip-format-section','tips'], ['tip-layout-settings','tree'],
    ['cloud-dating-section','data'], ['time-node-display-section','labels'],
    ['time-background-section','background'], ['cloud-background-section','tree']]) {
    assert.match(html.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`))[0], new RegExp(`data-settings-page="${page}"`));
  }
  assert.match(html, /tip-rename-section[^>]*data-settings-page="tips"/);
  assert.doesNotMatch(source, /\$\("tip-spacing-body"\)\.prepend/);
  assert.doesNotMatch(html, /id="tip-spacing-section"/);
  assert.match(css, /body\.conflict-tree-mode \.controls\[data-active-page="data"\] > \.conflict-only\[data-settings-page="data"\]/);
  assert.match(css, /body\.conflict-tree-mode \.controls\[data-active-page="tree"\] > \.conflict-only\[data-settings-page="tree"\]/);
});
test('Dating import is one ordered two-step flow', () => {
  const section = html.match(/<details class="settings-group tree-source-section"[^>]*>[\s\S]*?<\/details>/)?.[0] || '';
  assert.match(source, /\$\("tree-source-title"\)\.textContent = timeMode \? "Import Time Tree" : "Primary Tree"/);
  assert.match(section, /id="dating-import-step-1"/);
  assert.match(section, />Step 1 — Import Chronogram</);
  assert.match(section, /id="time-input-section"/);
  assert.match(section, />Step 2 — Confirm Time Unit &amp; Age Source</);
  assert.ok(section.indexOf('id="dating-import-step-1"') < section.indexOf('id="time-input-section"'));
  assert.equal((html.match(/id="time-input-section"/g) || []).length, 1);
  assert.doesNotMatch(html, /<details[^>]*id="time-input-section"/);
  assert.match(source, /section\.open = state\.workspaceMode === "time" && page === "data" && section\.classList\.contains\("tree-source-section"\) && section\.open/);
});
test('conflict rename inventory comes from both compared trees, never an unrelated ordinary tree', () => {
  const state = { workspaceMode:'conflict', root:{labels:['Wrong']}, conflict:{nuclearRoot:{labels:['A','B']},plastidRoot:{labels:['B','C']}} };
  const context = vm.createContext({state, descendantTipNodes:root=>root.labels.map(label=>({label}))});
  vm.runInContext(source.slice(source.indexOf('function currentTipOriginalLabels()'), source.indexOf('function resolveTipOriginalName(')), context);
  assert.deepEqual([...context.currentTipOriginalLabels()], ['A','B','C']);
  state.conflict.plastidRoot = null;
  assert.deepEqual([...context.currentTipOriginalLabels()], ['A','B']);
});
