const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {check} = require('../tools/check-module-boundaries.cjs');
const policy = require('../tools/module-boundaries.json');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const altered = (file, text) => check(root, name => name === file ? text : read(name));

test('the registered production graph passes the architectural ratchet', () => {
  assert.deepEqual(check(root), []);
});
test('ambient UI and IO dependencies are refused in independent model modules', () => {
  for (const [code, addition] of [['AMBIENT_UI_STATE','state.root;'], ['AMBIENT_UI_STATE','document.querySelector("x");'],
    ['MODEL_SIDE_EFFECT','fetch("x");'], ['UNDECLARED_DEPENDENCY','require("../app.js");']]) {
    assert.ok(altered('core/sample-identity.js', read('core/sample-identity.js')+'\n'+addition).some(issue => issue.code === code));
  }
});
test('legacy file growth, script order and packaging omissions fail closed', () => {
  assert.ok(altered('app.js', read('app.js')+'\n'.repeat(policy.legacy_budgets['app.js']+1)).some(issue => issue.code === 'LEGACY_GROWTH'));
  assert.ok(altered('index.html', read('index.html').replace(/<script src="core\/sample-identity\.js[^\"]*"><\/script>/,'')).some(issue => issue.code === 'BROWSER_ORDER'));
  assert.ok(altered('mcp-server/Dockerfile', read('mcp-server/Dockerfile').replace('COPY render ./render','')).some(issue => issue.code === 'PACKAGE_COVERAGE'));
  assert.ok(altered('mcp-server/Dockerfile', read('mcp-server/Dockerfile').replace('COPY ui ./ui','')).some(issue => issue.code === 'PACKAGE_COVERAGE'));
  assert.ok(altered('tools/build-manifest.cjs', read('tools/build-manifest.cjs').replace('"ui",','')).some(issue => issue.code === 'BUILD_COVERAGE'));
  assert.ok(altered('tools/http_security.py', read('tools/http_security.py').replace('parts[0] == "ui"','parts[0] == "unregistered"')).some(issue => issue.code === 'STATIC_COVERAGE'));
});
test('registered native build tools stay bounded and outside browser code', () => {
  assert.ok(policy.build_tools.some(item => item.path === 'tools/native_build_support.py'));
  const tool = 'tools/native_build_support.py';
  assert.ok(altered(tool, read(tool) + '\n'.repeat(200)).some(issue => issue.code === 'BUILD_TOOL_GROWTH'));
  assert.ok(altered(tool, read(tool) + '\nimport app\n').some(issue => issue.code === 'BUILD_TOOL_BOUNDARY'));
  assert.ok(altered('mcp-server/Dockerfile', read('mcp-server/Dockerfile').replace('COPY tools ./tools', '')).some(issue => issue.code === 'PACKAGE_COVERAGE'));
});
