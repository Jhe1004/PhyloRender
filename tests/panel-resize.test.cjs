const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'panel-resize.js'),'utf8');
test('panel resize bounds retain usable controls/canvas on every desktop size',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(source.match(/function panelWidthBounds\([\s\S]*?\n  \}/)[0],ctx);
  for(const width of [641,800,1000,1440,2560]){
    const bounds=ctx.panelWidthBounds(width);
    assert.equal(bounds.minimum,280);assert.ok(bounds.maximum>=280);
    assert.ok(width-bounds.maximum-8>=240);
  }
});
test('collapsed controls cannot retain focus and collapse uses an explicit overshoot',()=>{
  assert.match(source,/const collapseOvershoot = 48/);
  assert.match(source,/controls\.inert = hidden/);
  assert.match(source,/controls\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(source,/previous\.collapsed/);
  assert.match(source,/phylorender\.controls-collapsed\.v1/);
  assert.match(source,/collapsed && window\.innerWidth > 640/);
  const css=fs.readFileSync(path.join(root,'ui-shell.css'),'utf8');
  assert.match(css,/controls-collapsed > \.controls \{ visibility: hidden; overflow: hidden; padding: 0;/);
});
test('divider is accessible, shares all modes, ships to MCP and cannot mutate figures',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/<div id="panel-divider" role="separator" aria-orientation="vertical"/);
  assert.match(html,/id="settings-controls"/);assert.match(html,/id="tree-workspace"/);
  assert.match(html,/panel-resize\.js\?v=/);
  assert.match(fs.readFileSync(path.join(root,'mcp-server/Dockerfile'),'utf8'),/COPY .*panel-resize\.js/);
  assert.doesNotMatch(source,/renderTree|requestSettingsRender|tree-svg|state\.|\.innerHTML/);
  for(const entry of ['pointercancel','lostpointercapture','Escape','ArrowLeft','ArrowRight','dblclick','localStorage'])assert.ok(source.includes(entry));
});
test('restore icon remains outside the separator and provides a native button',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/<\/div>\s*<button id="panel-restore" type="button" aria-label="Expand Figure Workbench"/);
  assert.match(html,/aria-controls="settings-controls" title="Expand Figure Workbench" hidden/);
  assert.match(source,/restoreButton\.hidden = !hidden/);
  assert.match(source,/restoreButton\.addEventListener\("click"/);
  assert.match(source,/divider\.focus\(\{ preventScroll: true \}\)/);
  const css=fs.readFileSync(path.join(root,'ui-shell.css'),'utf8');
  assert.match(css,/controls-collapsed \{ --panel-divider-width: 22px;/);
  assert.match(css,/#panel-restore\[hidden\] \{ display: none;/);
});
