const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

test('tree page presents vertical and horizontal stretch together', () => {
  const section = html.match(/<details class="settings-group cloud-shared conflict-shared" data-settings-page="tree" id="tip-layout-settings">[\s\S]*?<\/details>/)?.[0] || '';
  assert.match(section, /<strong>Tree Span &amp; Spacing<\/strong><small>Adjust vertical tip spacing &amp; horizontal span independently/);
  assert.match(section, /id="tip-spacing"/);
  assert.match(section, /id="tree-horizontal-scale"/);
  assert.ok(section.indexOf('id="tip-spacing"') < section.indexOf('id="tree-horizontal-scale"'));
  assert.doesNotMatch(source, /\$\("tip-spacing-body"\)\.prepend/);
  assert.doesNotMatch(html, /id="tip-spacing-section"/);
});

test('vertical stretch remains one shared control instead of a duplicate setting', () => {
  assert.equal((html.match(/id="tip-spacing"/g) || []).length, 1);
  assert.equal((html.match(/id="tip-spacing-number"/g) || []).length, 1);
  assert.match(html, /aria-label="Vertical tip spacing"/);
  assert.match(html, /aria-label="Horizontal branch span"/);
  assert.match(html, /numeric-card cloud-hide conflict-hide/);
});
