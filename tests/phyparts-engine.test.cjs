const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../core/phyparts-engine.js');

const names4 = ['O', 'A', 'B', 'C'];
const species4 = '(T00000,((T00001,T00002),T00003));';

function analyze(genes, options = {}) {
  return engine.analyze({
    species: species4,
    genes,
    names: names4,
    threshold: options.threshold ?? 0,
    mode: options.mode ?? 'four',
  });
}

function rows(table) {
  const [header, ...lines] = table.trim().split(/\r?\n/).map(line => line.split('\t'));
  return Object.fromEntries(lines.map(line => [line[0], Object.fromEntries(header.map((key, index) => [key, line[index]]))]));
}

test('independent engine reproduces concordant, conflicting and unresolved reference counts', () => {
  const result = analyze([
    '(T00000,((T00001,T00002)1,T00003)1);',
    '(T00000,((T00001,T00003)1,T00002)1);',
    '(T00000,T00001,T00003);',
  ]);
  const table = rows(result.table);
  assert.deepEqual(
    ['concordant_N', 'dominant_conflict_N', 'other_conflict_N', 'conflict_total_N', 'no_signal_N', 'informative_N']
      .map(key => Number(table.Node0[key])),
    [2, 0, 0, 0, 1, 2],
  );
  assert.deepEqual(
    ['concordant_N', 'dominant_conflict_N', 'other_conflict_N', 'conflict_total_N', 'no_signal_N', 'informative_N']
      .map(key => Number(table.Node1[key])),
    [1, 1, 0, 1, 1, 2],
  );
  assert.equal(result.engine, 'PhyloRender-conflict-statistics');
  assert.equal(result.algorithm, 'phylorender-conflict-statistics-v2');
  assert.equal(result.mode, 'four');
  assert.equal(result.geneCount, 3);
});

test('partial sampling assigns a collapsed observable branch only to the most specific species node', () => {
  const ab = rows(analyze(['(T00000,(T00001,T00002)1);']).table);
  assert.equal(ab.Node0.concordant_N, '0');
  assert.equal(ab.Node0.no_signal_N, '1');
  assert.equal(ab.Node1.concordant_N, '1');

  const ac = rows(analyze(['(T00000,(T00001,T00003)1);']).table);
  assert.equal(ac.Node0.concordant_N, '1');
  assert.equal(ac.Node1.no_signal_N, '1');
});

test('support cutoff is strict and missing support is excluded only when cutoff is nonzero', () => {
  const equal = rows(analyze(['(T00000,((T00001,T00002)0.7,T00003)1);'], { threshold: 0.7 }).table);
  assert.equal(equal.Node1.informative_N, '0');
  assert.equal(equal.Node1.no_signal_N, '1');

  const noFilter = rows(analyze(['(T00000,((T00001,T00002),T00003));']).table);
  assert.equal(noFilter.Node1.concordant_N, '1');
});

test('observed compatible alternatives are counted together into one dominant conflict', () => {
  const result = engine.analyze({
    species: '(T00000,(((T00001,T00002),T00003),T00004));',
    genes: [
      '(T00000,(((T00001,T00003)1,T00002)1,T00004)1);',
      '(T00000,(((T00001,T00003)1,T00004)1,T00002)1);',
    ],
    names: ['O', 'A', 'B', 'C', 'D'], threshold: 0, mode: 'four',
  });
  const table = rows(result.table);
  assert.deepEqual(
    ['concordant_N', 'dominant_conflict_N', 'other_conflict_N', 'conflict_total_N']
      .map(key => Number(table.Node2[key])),
    [0, 2, 0, 2],
  );
});

test('complete and partial trees sharing one alternative combine without double counting', () => {
  const result = engine.analyze({
    species: '(T00000,(((T00001,T00002),T00003),T00004));',
    genes: [
      '(T00000,(((T00001,T00003)1,T00002)1,T00004)1);',
      '(T00000,((T00001,T00003)1,T00002)1);',
    ],
    names: ['O', 'A', 'B', 'C', 'D'], threshold: 0, mode: 'four',
  });
  const table = rows(result.table);
  assert.deepEqual(
    ['concordant_N', 'dominant_conflict_N', 'other_conflict_N', 'conflict_total_N']
      .map(key => Number(table.Node2[key])),
    [0, 2, 0, 2],
  );
});

test('incompatible alternatives remain separate dominant and other conflict counts', () => {
  const result = engine.analyze({
    species: '(T00000,(((T00001,T00002),T00003),T00004));',
    genes: [
      '(T00000,(((T00001,T00003)1,T00002)1,T00004)1);',
      '(T00000,(((T00001,T00004)1,T00002)1,T00003)1);',
    ],
    names: ['O', 'A', 'B', 'C', 'D'], threshold: 0, mode: 'four',
  });
  const table = rows(result.table);
  assert.deepEqual(
    ['concordant_N', 'dominant_conflict_N', 'other_conflict_N', 'conflict_total_N']
      .map(key => Number(table.Node2[key])),
    [0, 1, 1, 2],
  );
});

test('every species node preserves the complete four-category denominator', () => {
  const result = analyze([
    '(T00000,((T00001,T00002)1,T00003)1);',
    '(T00000,((T00001,T00003)1,T00002)1);',
    '(T00000,T00001,T00002,T00003);',
  ], { mode: 'two' });
  for (const row of Object.values(rows(result.table))) {
    const four = Number(row.concordant_N) + Number(row.dominant_conflict_N)
      + Number(row.other_conflict_N) + Number(row.no_signal_N);
    assert.equal(four, 3);
    assert.equal(Number(row.informative_N), Number(row.concordant_N) + Number(row.conflict_total_N));
  }
  assert.equal(result.mode, 'four');
  assert.equal(result.requestedDisplayMode, 'two');
});

test('invalid payloads fail instead of producing partial statistics', () => {
  assert.throws(() => analyze(['(T00000,(T00001,T99999));']), /unmatched|range|taxon|out of/i);
  assert.throws(() => analyze(['(T00000,(T00001,T00001));']), /duplicate/i);
  assert.throws(() => analyze(['(T00000,(T00001,T00002)1);'], { threshold: 1 }), /threshold|cutoff/i);
});

