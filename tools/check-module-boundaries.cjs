// An executable architectural ratchet, not a substitute for code review.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const manifest = require('./module-boundaries.json');

function check(root, read = name => fs.readFileSync(path.join(root, name), 'utf8')) {
  const issues = [];
  const issue = (code, file, message) => issues.push({code, file, message});
  const lines = text => text.split('\n').length - Number(text.endsWith('\n'));
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1].split('?')[0]);
  const appIndex = scripts.indexOf('app.js');
  for (const [file, maximum] of Object.entries(manifest.legacy_budgets)) {
    if (lines(read(file)) > maximum) issue('LEGACY_GROWTH', file, `Line budget ${maximum} exceeded; extract a module.`);
  }
  for (const tool of manifest.build_tools || []) {
    const text = read(tool.path);
    if (lines(text) > tool.max_lines) issue('BUILD_TOOL_GROWTH', tool.path, 'Split build responsibilities before growing this tool.');
    if (!/^tools\/[a-z_]+\.py$/.test(tool.path) || !tool.role ||
        /(?:^|\n)\s*(?:from|import)\s+(?:app|agent_bridge|local_server)\b/.test(text)) {
      issue('BUILD_TOOL_BOUNDARY', tool.path, 'Native builds cannot import the browser or application server.');
    }
    if (scripts.includes(tool.path)) issue('BUILD_TOOL_BOUNDARY', tool.path, 'Build tools are not browser assets.');
  }
  if ((manifest.build_tools || []).length && !read('mcp-server/Dockerfile').includes('COPY tools ./tools')) {
    issue('PACKAGE_COVERAGE', 'mcp-server/Dockerfile', 'Retain build recipes with the source distribution.');
  }
  for (const module of manifest.modules) {
    const text = read(module.path);
    try { new vm.Script(text, {filename: module.path}); }
    catch (error) { issue('MODULE_SYNTAX', module.path, error.message); }
    if (lines(text) > module.max_lines) issue('MODULE_GROWTH', module.path, 'Review responsibility and split before raising the budget.');
    if (/\b(?:document|window|state)\s*(?:\.|\[)|\$\s*\(/.test(text)) {
      issue('AMBIENT_UI_STATE', module.path, 'Use explicit inputs or declared rendering ports, not the application singleton or DOM controls.');
    }
    if (/\b(?:require\s*\(|import\s*\(|import\s+.*from)/.test(text)) {
      issue('UNDECLARED_DEPENDENCY', module.path, 'This module is dependency-free or receives dependencies through its factory.');
    }
    if (module.kind === 'model' && /\b(?:fetch|setTimeout|setInterval|localStorage|sessionStorage)\b/.test(text)) {
      issue('MODEL_SIDE_EFFECT', module.path, 'Scientific/display models cannot own IO, timers or persistence.');
    }
    if (!text.includes(`root.${module.global}=api`) || !text.includes('Object.freeze(')) {
      issue('MODULE_EXPORT', module.path, 'Provide the registered browser global and a frozen public API.');
    }
    const index = scripts.indexOf(module.path);
    if (index < 0 || index >= appIndex || scripts.filter(name => name === module.path).length !== 1) {
      issue('BROWSER_ORDER', module.path, 'Load exactly once before app.js.');
    }
  }
  if (!read('tools/build-manifest.cjs').includes('"render"')) issue('BUILD_COVERAGE', 'tools/build-manifest.cjs', 'Fingerprint rendering modules.');
  if (!read('tools/http_security.py').includes('"render"')) issue('STATIC_COVERAGE', 'tools/http_security.py', 'Serve registered rendering JS through the static whitelist.');
  if (!read('mcp-server/Dockerfile').includes('COPY render ./render')) issue('PACKAGE_COVERAGE', 'mcp-server/Dockerfile', 'Include rendering modules in the image.');
  if (!read('tools/build-manifest.cjs').includes('"ui"')) issue('BUILD_COVERAGE', 'tools/build-manifest.cjs', 'Fingerprint workbench modules.');
  if (!read('tools/http_security.py').includes('"ui"')) issue('STATIC_COVERAGE', 'tools/http_security.py', 'Serve only whitelisted workbench JS.');
  if (!read('mcp-server/Dockerfile').includes('COPY ui ./ui')) issue('PACKAGE_COVERAGE', 'mcp-server/Dockerfile', 'Include workbench modules in the image.');
  return issues;
}

if (require.main === module) {
  const issues = check(path.resolve(__dirname, '..'));
  console.log(JSON.stringify({ok: issues.length === 0, issues, policy: manifest}, null, 2));
  if (issues.length) process.exitCode = 1;
}
module.exports = {check};
