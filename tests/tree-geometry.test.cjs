const test = require('node:test');
const assert = require('node:assert/strict');

const input = require('../core/tree-input.js');
const geometry = require('../core/tree-geometry.js');

function scientificSnapshot(node) {
  return {
    label: node.label,
    length: node.length,
    comments: [...(node.comments || [])],
    children: node.children.map(scientificSnapshot),
  };
}

test('supported zero-length ASTRAL ingroup stem receives a display-only root gap', () => {
  const root = input.parseNewick('(O:0,((A:0,B:0)0.90:2,C:0)1.00:0);');
  const ingroup = root.children.find(child => child.children.length > 0);
  const before = scientificSnapshot(root);

  assert.equal(ingroup.label, '1.00');
  assert.equal(input.supportFromNode(ingroup), '1.00');
  assert.equal(ingroup.length, 0);

  const stats = geometry.treeStats(root);

  assert.equal(stats.branchLengthDisplay.auto_terminal_length_applied, true);
  assert.equal(stats.branchLengthDisplay.auto_root_ingroup_gap_applied, true);
  assert.equal(stats.branchLengthDisplay.display_root_ingroup_length, 1);
  assert.equal(ingroup.distance, 1, 'the visible ingroup stem must not collapse onto the root connector');
  assert.deepEqual(scientificSnapshot(root), before, 'display geometry must preserve source support, lengths and topology');
});

test('root-gap display rule stays limited to zero-length single-tip-outgroup ASTRAL profiles', () => {
  const positiveRootStem = input.parseNewick('(O:0,((A:0,B:0)0.90:2,C:0)1.00:0.25);');
  const positiveProfile = geometry.branchLengthDisplayProfile(positiveRootStem);
  assert.equal(positiveProfile.auto_terminal_length_applied, true);
  assert.equal(positiveProfile.auto_root_ingroup_gap_applied, false);

  const ordinaryTerminals = input.parseNewick('(O:1,((A:1,B:1)0.90:2,C:1)1.00:0);');
  const ordinaryProfile = geometry.branchLengthDisplayProfile(ordinaryTerminals);
  assert.equal(ordinaryProfile.auto_terminal_length_applied, false);
  assert.equal(ordinaryProfile.auto_root_ingroup_gap_applied, false);

  const noSingleTipOutgroup = input.parseNewick('((A:0,B:0)0.90:2,(C:0,D:0)1.00:0);');
  const ambiguousProfile = geometry.branchLengthDisplayProfile(noSingleTipOutgroup);
  assert.equal(ambiguousProfile.auto_terminal_length_applied, true);
  assert.equal(ambiguousProfile.auto_root_ingroup_gap_applied, false);
});

test('branch length inspection summary reuses the display-only geometry profile', () => {
  const root = input.parseNewick('(O:0,((A:0,B)0.90:2,C:0)1.00:0);');
  const summary = geometry.branchLengthSummary(root);
  assert.deepEqual({ present: summary.present, missing: summary.missing, minimum: summary.minimum,
    maximum: summary.maximum }, { present: 5, missing: 1, minimum: 0, maximum: 2 });
  assert.equal(summary.internal.positive, 1);
  assert.equal(summary.terminal.missing, 1);
  assert.equal(summary.display_recommendation.auto_equal_terminal_length, true);
  assert.equal(summary.display_recommendation.source_tree_unchanged, true);
});
