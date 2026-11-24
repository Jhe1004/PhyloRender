const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const contract = require('../figure-contract.js');

test('new figures default to readable tip names and automatic compact spacing in every workspace', () => {
  for (const workspace of contract.workspaces) {
    const defaults = contract.defaults(workspace);
    const dated = workspace === 'time' || workspace === 'cloud';
    assert.equal(defaults.typography.tips.size_u, require('../figure-units.js').ptToDrawing(dated ? 18 : 15));
    assert.equal(defaults.layout.automatic_tip_spacing, true);
  }
  assert.equal(contract.publicationDefaults.layout.tip_spacing_em, 1.05);
  assert.deepEqual(contract.tipReadability, {
    ordinarySizePt: 15,
    datedSizePt: 18,
    denseGapPx: 1,
    sparseGapEm: 0.3,
    sparseUntilTips: 12,
    denseAtTips: 48,
  });
});

test('automatic spacing gives dense trees almost no ink gap and sparse trees modest breathing room', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const context = vm.createContext({ PhyloRenderContract: contract });
  vm.runInContext(source.match(/function automaticTipGap\([\s\S]*?\n\}/)[0], context);
  assert.equal(context.automaticTipGap(48, 20), 1);
  assert.equal(context.automaticTipGap(5000, 20), 1);
  assert.equal(context.automaticTipGap(12, 20), 6);
  assert.ok(context.automaticTipGap(24, 20) < 6);
  assert.ok(context.automaticTipGap(24, 20) > 1);
  let previous = Infinity;
  for (let count = 1; count <= 200; count++) {
    const gap = context.automaticTipGap(count, 20);
    assert.ok(gap <= previous);
    assert.ok(gap >= 1);
    previous = gap;
  }
});

test('MCP guidance does not recommend tiny labels or enlarged row spacing', () => {
  const mcp = fs.readFileSync(path.join(__dirname, '../mcp-server/src/mcp.mjs'), 'utf8');
  const guide = fs.readFileSync(path.join(__dirname, '../mcp-server/docs/agent-guide.md'), 'utf8');
  for (const text of [mcp, guide]) {
    assert.match(text, /size_u/);
    assert.match(text, /node annotations|node labels|\u8282\u70b9\u6807\u6ce8/i);
    assert.match(text, /do not increase (?:terminal |row )?spacing/i);
  }
});
