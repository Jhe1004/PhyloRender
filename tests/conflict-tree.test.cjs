const test = require('node:test');
const assert = require('node:assert/strict');
const conflict = require('../conflict-tree.js');
const input = require('../core/tree-input.js');
const rooting = require('../tree-rooting.js');

let nextId = 1;
const tip = label => ({ id: nextId++, label, length: 1, children: [] });
const node = (...children) => ({ id: nextId++, label: '', length: 1, children });

test('sample comparison reports shared and tree-specific tips', () => {
  const nuclear = node(tip('A_one'), tip('B two'), tip('C'));
  const plastid = node(tip('A one'), tip('B_two'));
  const result = conflict.compareSampleSets(nuclear, plastid);
  assert.equal(result.nuclearCount, 3);
  assert.equal(result.plastidCount, 2);
  assert.equal(result.sharedCount, 2);
  assert.deepEqual(result.nuclearOnly, ['C']);
  assert.deepEqual(result.plastidOnly, []);
});

test('paired conflict rooting applies the main-tree outgroup to both tree topologies', () => {
  const primary = input.parseNewick('((A:1,B:1):1,(C:1,D:1):1);');
  const comparison = input.parseNewick('((A:1,C:1):1,(B:1,D:1):1);');
  const result = conflict.rerootPairByOutgroup(primary, comparison, ['A'], {
    buildGraph: input.buildGraph,
    rooting,
  });
  for (const root of [result.nuclearRoot, result.plastidRoot]) {
    const outgroup = root.children.find(child => child.id === root.outgroupChildId);
    assert.equal(outgroup.label, 'A');
    assert.equal(root.preserveChildOrder, true);
  }
});

test('equal-sized trees with unmatched names stop and list every mismatch', () => {
  const primary = node(tip('Euptelea_pleiosperma'), tip('Aconitum_jaluense_subsp.jaluense'), tip('Shared'));
  const secondary = node(tip('Out_Euptelea_pleiosperma'), tip('Aconitum_jaluense_subsp_jaluense'), tip('Shared'));
  assert.throws(() => conflict.prepareConflictTrees(primary, secondary), error => {
    assert.equal(error.code, 'CONFLICT_EQUAL_COUNT_NAME_MISMATCH');
    assert.deepEqual(error.mainOnly, ['Euptelea_pleiosperma', 'Aconitum_jaluense_subsp.jaluense']);
    assert.deepEqual(error.comparisonOnly, ['Out_Euptelea_pleiosperma', 'Aconitum_jaluense_subsp_jaluense']);
    assert.match(error.message, /3/);
    assert.match(error.message, /Euptelea_pleiosperma/);
    assert.match(error.message, /Out_Euptelea_pleiosperma/);
    assert.match(error.message, /Aconitum_jaluense_subsp\.jaluense/);
    assert.match(error.message, /Aconitum_jaluense_subsp_jaluense/);
    assert.match(error.message, /guess|automatic/i);
    return true;
  });
});

test('different sample counts require an explicit policy and list both sides', () => {
  const primary = node(tip('A'), tip('B'), tip('C'), tip('primary-only'));
  const secondary = node(tip('A'), tip('B'), tip('secondary-only'));
  assert.throws(() => conflict.prepareConflictTrees(primary, secondary), error => {
    assert.equal(error.code, 'CONFLICT_SAMPLE_POLICY_CONFIRMATION_REQUIRED');
    assert.deepEqual(error.mainOnly, ['C', 'primary-only']);
    assert.deepEqual(error.comparisonOnly, ['secondary-only']);
    assert.match(error.message, /4[\s\S]*3[\s\S]*2/);
    assert.match(error.message, /never|explicit|prune|retain/i);
    return true;
  });
  assert.equal(conflict.prepareConflictTrees(primary, secondary, 'intersection').comparison.sharedCount, 2);
  assert.equal(conflict.prepareConflictTrees(primary, secondary, 'union').comparison.sharedCount, 2);
});

test('intersection policy removes extras and collapses unary nodes', () => {
  const nuclear = node(node(tip('A'), tip('extra')), node(tip('B'), tip('C')));
  const plastid = node(tip('A'), node(tip('B'), tip('C')));
  const prepared = conflict.prepareConflictTrees(nuclear, plastid, 'intersection');
  assert.deepEqual(conflict.tipOrder(prepared.nuclearRoot).sort(), ['a', 'b', 'c']);
  assert.deepEqual(conflict.tipOrder(prepared.plastidRoot).sort(), ['a', 'b', 'c']);
});

test('retain-all policy keeps unmatched tips but connects only shared names', () => {
  const nuclear = node(tip('A'), tip('B'), tip('nuclear-only'), tip('another-nuclear-only'));
  const plastid = node(tip('A'), tip('B'), tip('plastid-only'));
  const prepared = conflict.prepareConflictTrees(nuclear, plastid, 'union');
  assert.equal(conflict.tipNodes(prepared.nuclearRoot).length, 4);
  assert.equal(conflict.tipNodes(prepared.plastidRoot).length, 3);
  assert.equal(prepared.comparison.sharedCount, 2);
});

test('optimization never increases crossings and preserves every clade', () => {
  const nuclear = node(node(tip('A'), tip('B')), node(tip('C'), tip('D')));
  const plastid = node(node(tip('D'), tip('C')), node(tip('B'), tip('A')));
  const nuclearClades = conflict.cladeSignatureSet(nuclear);
  const plastidClades = conflict.cladeSignatureSet(plastid);
  const optimized = conflict.optimizeTanglegram(nuclear, plastid);
  assert.ok(optimized.crossingsAfter <= optimized.crossingsBefore);
  assert.deepEqual(conflict.cladeSignatureSet(optimized.nuclearRoot), nuclearClades);
  assert.deepEqual(conflict.cladeSignatureSet(optimized.plastidRoot), plastidClades);
  assert.deepEqual(conflict.tipOrder(optimized.nuclearRoot), conflict.tipOrder(nuclear));
});

test('primary ladderization preserves topology and branch data; the comparison tree follows without moving the primary', () => {
  const primary = node(node(tip('A'), tip('B'), tip('C')), tip('D'));
  primary.children[0].label = '87/99';
  const secondary = node(tip('D'), node(tip('C'), tip('A'), tip('B')));
  const originalPrimaryOrder = conflict.tipOrder(primary);
  const laddered = conflict.ladderizePrimary(primary, 'small-top');
  assert.deepEqual(conflict.tipOrder(laddered), ['d', 'a', 'b', 'c']);
  assert.deepEqual(conflict.tipOrder(primary), originalPrimaryOrder);
  assert.deepEqual(conflict.cladeSignatureSet(laddered), conflict.cladeSignatureSet(primary));
  assert.equal(laddered.children[1].label, '87/99');
  const first = conflict.prepareConflictTrees(laddered, secondary);
  assert.deepEqual(conflict.tipOrder(first.nuclearRoot), conflict.tipOrder(laddered));
  const swapped = conflict.swapPrimaryChildren(laddered, laddered.id);
  const second = conflict.prepareConflictTrees(swapped, secondary);
  assert.deepEqual(conflict.tipOrder(second.nuclearRoot), ['a', 'b', 'c', 'd']);
  assert.deepEqual(conflict.tipOrder(laddered), ['d', 'a', 'b', 'c']);
  assert.deepEqual(conflict.cladeSignatureSet(second.nuclearRoot), conflict.cladeSignatureSet(primary));
  assert.ok(second.crossingsAfter <= second.crossingsBefore);
  assert.throws(() => conflict.swapPrimaryChildren(laddered, 'missing'), /not (?:be )?found|absent|missing/i);
});

test('multifurcations can rotate without changing their topology', () => {
  const nuclear = node(tip('A'), tip('B'), tip('C'), tip('D'));
  const plastid = node(tip('D'), tip('C'), tip('B'), tip('A'));
  const optimized = conflict.optimizeTanglegram(nuclear, plastid);
  assert.equal(conflict.tipNodes(optimized.nuclearRoot).length, 4);
  assert.deepEqual(conflict.cladeSignatureSet(optimized.nuclearRoot), conflict.cladeSignatureSet(nuclear));
});

test('connector endpoints touch each sample label edge instead of a shared distant column', () => {
  assert.equal(conflict.connectorEndpoint(400, 120, 'left'), 531.5);
  assert.equal(conflict.connectorEndpoint(1200, 200, 'right'), 988.5);
  assert.throws(() => conflict.connectorEndpoint(0, 0, 'middle'));
});

test('connector changes rows only inside the label-free middle corridor', () => {
  const path = conflict.connectorPath(600, 40, 1200, 160, 780, 1030);
  assert.equal(path, 'M 600 40 L 780 40 C 870 40, 940 160, 1030 160 L 1200 160');
  assert.throws(() => conflict.connectorPath(600, 40, 1200, 160, 580, 1030), /corridor|turn/i);
  assert.throws(() => conflict.connectorPath(600, 40, 1200, 160, 780, 1220), /corridor|turn/i);
});

test('support field selection keeps single values automatic and lets compound values choose either side', () => {
  assert.deepEqual(conflict.supportComponents('86.4/100'), ['86.4', '100']);
  assert.equal(conflict.selectSupportComponent('86.4/100', 'all'), '86.4/100');
  assert.equal(conflict.selectSupportComponent('86.4/100', 'field:0'), '86.4');
  assert.equal(conflict.selectSupportComponent('86.4/100', 'field:1'), '100');
  assert.equal(conflict.selectSupportComponent('0.9', 'field:1'), '0.9');
  assert.equal(conflict.selectSupportComponent('86.4/100', 'field:8'), '86.4');
});

test('automatic groups are nuclear clades and color matching plastid tips without painting mixed ancestors', () => {
  const nuclear = node(node(tip('A'), tip('B')), node(tip('C'), tip('D')));
  const plastid = node(node(tip('A'), tip('C')), node(tip('B'), tip('D')));
  const colors = conflict.buildGroupColors(nuclear, plastid);
  assert.equal(colors.source, 'automatic');
  assert.equal(colors.groups.length, 2);
  assert.equal(colors.tipGroup.get('a'), colors.tipGroup.get('b'));
  assert.notEqual(colors.tipGroup.get('a'), colors.tipGroup.get('c'));
  assert.equal(colors.plastidNodeGroup.get(plastid.children[0]), null);
  assert.equal(colors.plastidNodeGroup.get(plastid.children[0].children[0]), colors.tipGroup.get('a'));
});

test('sample group table overrides topology and preserves explicit colors', () => {
  const nuclear = node(node(tip('A'), tip('B')), tip('C'));
  const plastid = node(tip('C'), node(tip('B'), tip('A')));
  const assignments = conflict.parseGroupTable('sample,group,color\nA,alpha,#123456\nB,beta,#abcdef\nC,alpha,#123456');
  const colors = conflict.buildGroupColors(nuclear, plastid, assignments);
  assert.equal(colors.source, 'table');
  assert.equal(colors.tipGroup.get('a').color, '#123456');
  assert.equal(colors.tipGroup.get('b').color, '#abcdef');
  assert.equal(colors.tipGroup.get('c'), colors.tipGroup.get('a'));
  assert.equal(colors.nuclearNodeGroup.get(nuclear.children[0]), null);
  assert.equal(colors.plastidNodeGroup.get(plastid.children[0]), colors.tipGroup.get('c'));
});

test('group table reads quoted CSV or TSV and rejects duplicate samples', () => {
  const csv = conflict.parseGroupTable('样品,分组,颜色\n"A, one","group, 1",#123456\nB,group 2,');
  assert.equal(csv.get('a, one').name, 'group, 1');
  assert.equal(conflict.parseGroupTable('sample\tgroup\nA\tfirst').get('a').name, 'first');
  assert.throws(() => conflict.parseGroupTable('sample,group\nA,one\na,two'), /duplicate/i);
});

test('nuclear Newick group annotations take precedence over inferred clades', () => {
  const nuclear = node(node(tip('A'), tip('B')), tip('C'));
  nuclear.children[0].comments = ['&group=Ranunculaceae,color=#126789'];
  const plastid = node(tip('B'), node(tip('C'), tip('A')));
  const colors = conflict.buildGroupColors(nuclear, plastid);
  assert.equal(colors.source, 'annotations');
  assert.equal(colors.tipGroup.get('a').name, 'Ranunculaceae');
  assert.equal(colors.tipGroup.get('b').color, '#126789');
  assert.equal(colors.tipGroup.has('c'), false);
  assert.equal(colors.unassignedNuclear, 1);
});

test('nuclear group colors remain stable after sister-clade rotations and sample pruning', () => {
  const nuclear = node(node(tip('A'), tip('B')), node(tip('C'), tip('D')));
  const plastid = node(node(tip('D'), tip('A')), node(tip('C'), tip('B')));
  const first = conflict.buildGroupColors(nuclear, plastid, null, nuclear);
  const rotatedNuclear = conflict.orientByTargetRanks(nuclear, ['d', 'c', 'b', 'a']);
  const rotatedPlastid = conflict.orientByTargetRanks(plastid, ['d', 'c', 'b', 'a']);
  const second = conflict.buildGroupColors(rotatedNuclear, rotatedPlastid, null, nuclear);
  assert.equal(second.tipGroup.get('a').color, first.tipGroup.get('a').color);
  assert.equal(second.tipGroup.get('d').color, first.tipGroup.get('d').color);
  const pruned = conflict.pruneToKeys(rotatedNuclear, new Set(['a', 'b', 'c']));
  const prunedColors = conflict.buildGroupColors(pruned, rotatedPlastid, null, nuclear);
  assert.equal(prunedColors.tipGroup.get('c').color, first.tipGroup.get('c').color);
});

test('an explicit color applies even if the first group member leaves the color blank', () => {
  const nuclear = node(tip('A'), tip('B'));
  const groups = conflict.parseGroupTable('sample,group,color\nA,one,\nB,one,#123456');
  const colors = conflict.buildGroupColors(nuclear, nuclear, groups);
  assert.equal(colors.tipGroup.get('a').color, '#123456');
  assert.throws(() => conflict.parseGroupTable('sample,group,color\nA,one,#123456\nB,one,#abcdef'), /conflicting|different.*colou?r/i);
});

test('configuration groups preserve original specimen labels and match the same keys as the two-tree renderer', () => {
  const first = 'Example_alpha_2023080906_1';
  const second = 'Example_alpha_2023080906-1';
  const primary = node(tip(first), tip(second));
  const secondary = node(tip('example alpha 2023080906 1'), tip(second));
  const groups = [{ name: 'Blue', color: '#0072B2', samples: [first] },
    { name: 'Green', color: '#009E73', samples: [second] }];
  const assignments = conflict.assignSampleGroups(primary, groups);
  const rendered = conflict.buildGroupColors(primary, secondary, assignments);
  assert.equal(rendered.plastidNodeGroup.get(secondary.children[0]).color, '#0072b2');
  assert.equal(rendered.plastidNodeGroup.get(secondary.children[1]).color, '#009e73');
  assert.equal(rendered.plastidNodeGroup.get(secondary), null);
  assert.deepEqual(conflict.exportSampleGroups(primary, assignments),
    groups.map(group => ({ ...group, color: group.color.toLowerCase() })));
  const table = conflict.parseGroupTable(`sample,group\n${first},Blue`);
  const fromTable = conflict.exportSampleGroups(primary, table);
  assert.equal(fromTable[0].color, conflict.buildGroupColors(primary, secondary, table).groups[0].color);
  assert.deepEqual(fromTable[0].samples, [first]);
});

test('explicit configuration groups reject unknown samples, duplicate aliases and inconsistent colors', () => {
  const primary = node(tip('Example_alpha_ID_1'), tip('Example_beta_ID-2'));
  const blue = { name: 'Lineage', color: '#0072b2', samples: ['Example_alpha_ID_1'] };
  const assign = group => conflict.assignSampleGroups(primary, [blue, group]);
  assert.throws(() => assign({ ...blue, samples: ['Example_beta_ID_2'] }),
    { code: 'CONFLICT_GROUP_SAMPLE_UNKNOWN', field: 'sample_groups' });
  assert.throws(() => assign({ ...blue, samples: ['example alpha id 1'] }),
    { code: 'CONFLICT_GROUP_SAMPLE_DUPLICATE' });
  assert.throws(() => assign({ ...blue, color: '#009e73', samples: ['Example_beta_ID-2'] }),
    { code: 'CONFLICT_GROUP_COLOR_MISMATCH' });
});

test('display support follows the incoming split when an outgroup reverses an internal edge', () => {
  const input = require('../core/tree-input.js');
  const rooting = require('../tree-rooting.js');
  const source = input.parseNewick('((A:1,B:1)89/0.8:1,(C:1,D:1)[&bootstrap=76]:1,E:1);');
  const prepared = conflict.rerootByOutgroup(source, ['A'], 'primary', {buildGraph:input.buildGraph, rooting});
  const all = conflict.tipNodes(source).map(tip => tip.label).sort();
  function supportedSplits(root) {
    const result = new Map();
    function visit(node, isRoot) {
      if (!node.children.length) return;
      const support = input.supportFromDisplayEdge(node);
      if (!isRoot && support !== null) {
        const labels = conflict.tipNodes(node).map(tip => tip.label).sort();
        const other = all.filter(label => !labels.includes(label));
        const split = [labels.join(','), other.join(',')].sort().join('|');
        result.set(split, support);
      }
      node.children.forEach(child => visit(child, false));
    }
    visit(root, true);
    return result;
  }
  assert.deepEqual(supportedSplits(source), new Map([['A,B|C,D,E','89/0.8'], ['A,B,E|C,D','76']]));
  assert.deepEqual(supportedSplits(prepared), supportedSplits(source));
  const oldAB = prepared.children.find(child => child.id === source.children[0].id);
  assert.equal(input.supportFromDisplayEdge(oldAB), null);
});
