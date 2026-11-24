const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../core/tree-input.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function extractLeadingRootingDirective('), source.indexOf('const NUMERIC_TOKEN_SOURCE')), context);

test('one-child source nodes are rejected with machine code, location and sample', () => {
  for (const input of ['((A:1):2,B:3);', '((A:1,B:1):2);', '(((A:1):2):3,B:6);']) {
    assert.throws(() => context.parseNewick(input), error => {
      assert.equal(error.code, 'TREE_SINGLE_CHILD_NODE');
      assert.ok(error.issues.length > 0);
      assert.match(error.message, /example tip:\s*A|taxon.*A|A/i);
      assert.match(error.message, /import (?:aborted|stopped).*(?:without modifying|unmodified)|input file/i);
      return true;
    });
  }
});

test('Nexus validation uses translated sample names and preserves annotation caveat', () => {
  assert.throws(() => context.parseNewick('#NEXUS\nbegin trees; translate 1 Taxon_A, 2 Taxon_B; tree t = ((1:1)95[&height=2]:1,2:2); end;'), error => {
    assert.equal(error.issues[0].exampleTip, 'Taxon_A');
    assert.match(error.message, /sampled[- ]ancestor.*not supported/i);
    return true;
  });
});

test('normal roots, polytomies, zero lengths and absent support are accepted', () => {
  for (const input of ['(A:0,B:0);', '(A:1,B:1,C:1);', '((A:1,B:1):1,C:2);', '[&R](O:3,((A:1,B:1)0.2:1,C:2):1);']) {
    assert.ok(context.parseNewick(input));
  }
});

test('absent support and software-generated unary nodes never get fake dash labels', () => {
  const controls = { 'support-threshold': { value: 50 } };
  const state = { mainSupportValues: new Map(), nodeDataSources: [{ kind: 'support', values: new Map() }] };
  const ctx = vm.createContext({ state, $: id => controls[id],
    mainSupportScales: values => require('../core/support-values.js').create(require('../core/support-scale.js')).profile((values || state.mainSupportValues).values()),
    allNormalizedTips: () => ['a', 'b', 'c', 'd'], normalizeTipKey: label => label.toLowerCase(),
    rootAdjacentSupportlessNodeIds: () => new Set(['root']),
    canonicalSplitKey: tips => tips.length > 1 ? tips.join(',') : null,
    formatSupportValue: value => Number(value) < 50 ? '–' : String(value),
    formatOtherValue: (_source, value) => String(value), isFullSupport: value => Number(value) === 100,
  });
  vm.runInContext(source.slice(source.indexOf('function annotateNodeData('), source.indexOf('function composeNodeAnnotation(')), ctx);
  const tip = label => ({ id: label, label, children: [] });
  const pair = { id: 'pair', children: [tip('A'), tip('B')] };
  const unary = { id: 'old-root', children: [tip('C')] };
  const root = { id: 'root', children: [pair, unary, tip('D')] };
  const before = JSON.stringify(root);
  ctx.annotateNodeData(root);
  assert.equal(pair.nodeData.supportText, null);
  assert.equal(unary.nodeData.supportText, null);
  state.mainSupportValues.set('a,b', 20);
  ctx.annotateNodeData(root);
  assert.equal(pair.nodeData.supportText, '–/–'); // A real low value plus missing auxiliary value.
  assert.equal(unary.nodeData.supportText, null);
  delete pair.nodeData; delete unary.nodeData; delete root.nodeData;
  assert.equal(JSON.stringify(root), before);
});
