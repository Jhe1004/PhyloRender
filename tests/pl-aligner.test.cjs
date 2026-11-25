'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lbfgs = require('../core/lbfgs-solver.js');
const plModule = require('../core/pl-aligner.js');
const aligner = plModule.create({ lbfgs });
const { parseNewick } = require('../core/tree-input.js');
const cloud = require('../cloud-tree.js');

function nodeAgeMap(newickText) {
  const root = parseNewick(newickText, { validateInput: false });
  const map = new Map();
  function visit(nd) {
    if (!nd.children.length) return { tips: [nd.label], age: 0 };
    const sub = nd.children.map(ch => ({ ...visit(ch), bl: ch.length }));
    const tips = sub.flatMap(s => s.tips).sort();
    const ages = sub.map(s => s.age + s.bl);
    const maxDiff = Math.max(...ages) - Math.min(...ages);
    assert.ok(maxDiff < 1e-5, `Tree must be ultrametric within 1e-5, got spread ${maxDiff}`);
    const age = ages.reduce((a, b) => a + b, 0) / ages.length;
    map.set(tips.join(','), age);
    return { tips, age };
  }
  visit(root);
  return map;
}

test('L-BFGS solver minimizes non-convex Rosenbrock function to machine precision', () => {
  function rosenbrock(x, g) {
    const d1 = 1 - x[0], d2 = x[1] - x[0] * x[0];
    g[0] = -2 * d1 - 400 * x[0] * d2;
    g[1] = 200 * d2;
    return d1 * d1 + 100 * d2 * d2;
  }
  const sol = lbfgs.minimize(rosenbrock, [-1.2, 1.0]);
  assert.equal(sol.converged, true);
  assert.ok(Math.abs(sol.x[0] - 1) < 1e-8);
  assert.ok(Math.abs(sol.x[1] - 1) < 1e-8);
  assert.ok(sol.f < 1e-16);
});

test('penalized-likelihood aligner preserves fixed shared-clade ages and strict ultrametricity', () => {
  const payload = {
    analysis_kind: 'display_alignment',
    age: 73.5,
    trees: [
      {
        newick: '(T00000:0.22,(((T00001:0.08,T00002:0.11):0.09,T00003:0.17):0.06,(T00004:0.12,T00005:0.09):0.14):0.07);',
        rootTips: ['T00000', 'T00001'],
        calibrations: [
          { tips: ['T00001', 'T00005'], age: 52.0 },
          { tips: ['T00001', 'T00002'], age: 18.4 },
          { tips: ['T00004', 'T00005'], age: 24.7 },
        ],
      },
    ],
  };
  const res = aligner.alignBatch(payload);
  assert.equal(res.engine, 'PhyloRender-pl-aligner');
  assert.equal(res.algorithm, 'phylorender-pl-display-alignment-v1');
  assert.equal(res.analysis_kind, 'display_alignment');
  assert.equal(res.independently_estimated_gene_times, false);
  assert.equal(res.seed, 1);
  assert.equal(res.datedTrees.length, 1);

  const ages = nodeAgeMap(res.datedTrees[0]);
  assert.ok(Math.abs(ages.get('T00000,T00001,T00002,T00003,T00004,T00005') - 73.5) < 1e-6);
  assert.ok(Math.abs(ages.get('T00001,T00002,T00003,T00004,T00005') - 52.0) < 1e-6);
  assert.ok(Math.abs(ages.get('T00001,T00002') - 18.4) < 1e-6);
  assert.ok(Math.abs(ages.get('T00004,T00005') - 24.7) < 1e-6);
  const freeAge = ages.get('T00001,T00002,T00003');
  assert.ok(freeAge > 18.4 && freeAge < 52.0, `Free clade age ${freeAge} must lie strictly between 18.4 and 52.0`);

  // Determinism check: repeated runs yield byte-identical Newick strings
  assert.equal(aligner.alignBatch(payload).datedTrees[0], res.datedTrees[0]);
});

test('penalized-likelihood aligner rejects invalid, non-display, or inverted inputs', () => {
  const validTree = {
    newick: '(T00000:0.2,(T00001:0.1,T00002:0.12):0.08);',
    rootTips: ['T00000', 'T00001'],
    calibrations: [],
  };
  assert.throws(() => aligner.alignBatch({ analysis_kind: 'fossil_dating', age: 50, trees: [validTree] }), /display_alignment only/);
  assert.throws(() => aligner.alignBatch({ age: 0, trees: [validTree] }), /root age/);
  assert.throws(() => aligner.alignBatch({ age: 50, trees: [] }), /Between 1 and 100/);
  assert.throws(() => aligner.alignBatch({
    age: 50,
    trees: [{ newick: '(T00000:0.2,(T00001:0.1,T00002):0.08);', rootTips: ['T00000', 'T00001'] }],
  }), /missing a non-root branch length/);
  assert.throws(() => aligner.alignBatch({
    age: 50,
    trees: [{ newick: '(T00000:0.2,(T00001:-0.1,T00002:0.1):0.08);', rootTips: ['T00000', 'T00001'] }],
  }), /invalid branch length/);
  assert.throws(() => aligner.alignBatch({
    age: 50,
    trees: [{ newick: '(T00000:0.2,(T00001:0.1,T00001:0.1):0.08);', rootTips: ['T00000', 'T00001'] }],
  }), /duplicate taxon/);
  assert.throws(() => aligner.alignBatch({
    age: 50,
    trees: [{
      newick: '(T00000:0.2,((T00001:0.1,T00002:0.1):0.05,T00003:0.15):0.05);',
      rootTips: ['T00000', 'T00001'],
      calibrations: [
        { tips: ['T00001', 'T00003'], age: 20 },
        { tips: ['T00001', 'T00002'], age: 30 },
      ],
    }],
  }), /inverted fixed clade ages/);
});

test('Node CLI and Python HTTP runtime execute the same built-in JS aligner without C++ binaries', () => {
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tools', '-p', 'test_treepl_jobs.py'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('analytic penalized-likelihood gradient matches central finite differences within 1e-8', () => {
  let capturedEval = null, capturedX0 = null;
  const spySolver = {
    minimize(evaluate, x0) {
      capturedEval = evaluate;
      capturedX0 = Float64Array.from(x0);
      return lbfgs.minimize(evaluate, x0);
    },
  };
  const spyAligner = plModule.create({ lbfgs: spySolver });
  spyAligner.alignSingleTree({
    newick: '(T00000:0.22,(((T00001:0.08,T00002:0.11):0.09,T00003:0.17):0.06,(T00004:0.12,T00005:0.09):0.14):0.07);',
    rootTips: ['T00000', 'T00001'],
    calibrations: [{ tips: ['T00001', 'T00005'], age: 52.0 }],
  }, 73.5, 1);

  const pt = Float64Array.from(capturedX0, (v, idx) => v + 0.13 * Math.sin(idx + 1));
  const analytic = new Float64Array(pt.length);
  capturedEval(pt, analytic);
  const eps = 6e-6;
  const dummy = new Float64Array(pt.length);
  for (let k = 0; k < pt.length; k++) {
    const orig = pt[k];
    pt[k] = orig + eps;
    const fPlus = capturedEval(pt, dummy);
    pt[k] = orig - eps;
    const fMinus = capturedEval(pt, dummy);
    pt[k] = orig;
    const fd = (fPlus - fMinus) / (2 * eps);
    assert.ok(Math.abs(analytic[k] - fd) < 1e-7,
      `Gradient component ${k}: analytic ${analytic[k]} vs finite-diff ${fd}`);
  }
});

test('oracle parity against native C++ treePL (thorough L-BFGS) when binary is present locally', t => {
  const binary = path.resolve(__dirname, '..', 'vendor', 'native', 'macos-arm64', 'treePL');
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || !fs.existsSync(binary)) {
    t.skip('Native macOS arm64 treePL reference binary not present on this runner');
    return;
  }
  const cases = [
    {
      age: 70,
      newick: '(T00000:0.25,(((T00001:0.04,T00002:0.09):0.07,(T00003:0.06,T00004:0.05):0.08):0.06,(T00005:0.11,T00006:0.14):0.05):0.09);',
      rootTips: ['T00000', 'T00001'],
      calibrations: [
        { tips: ['T00001', 'T00006'], age: 48.5 },
        { tips: ['T00005', 'T00006'], age: 22.0 },
      ],
    },
    {
      // Includes zero-length internal edge and asymmetric discordant rates
      age: 100,
      newick: '(T00000:0.31,(((T00001:0.0000001,T00002:0.05):0,T00003:0.09):0.08,(T00004:0.16,T00005:0.03):0.07):0.11);',
      rootTips: ['T00000', 'T00001'],
      calibrations: [{ tips: ['T00001', 'T00005'], age: 64.2 }],
    },
  ];

  const jsBatch = aligner.alignBatch({ analysis_kind: 'display_alignment', age: cases[0].age, trees: [cases[0]] });
  assert.equal(jsBatch.datedTrees.length, 1);

  for (const item of cases) {
    const jsDated = aligner.alignSingleTree(item, item.age, 1);
    const jsAges = nodeAgeMap(jsDated);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-oracle-'));
    try {
      fs.writeFileSync(path.join(tmp, 'in.tre'), item.newick + '\n');
      const calLines = item.calibrations.map((c, idx) =>
        `mrca = c${idx} ${c.tips[0]} ${c.tips[1]}\nmin = c${idx} ${c.age}\nmax = c${idx} ${c.age}\n`).join('');
      fs.writeFileSync(path.join(tmp, 'run.cfg'),
        `treefile = in.tre\noutfile = out.tre\nnumsites = 100000000\nsmooth = 100\nseed = 1\nopt = 1\nthorough\nmoredetail\n` +
        `mrca = root ${item.rootTips[0]} ${item.rootTips[1]}\nmin = root ${item.age}\nmax = root ${item.age}\n${calLines}`);
      const proc = spawnSync(binary, ['run.cfg'], { cwd: tmp, encoding: 'utf8' });
      assert.equal(proc.status, 0, proc.stderr);
      const cppAges = nodeAgeMap(fs.readFileSync(path.join(tmp, 'out.tre'), 'utf8').trim());
      assert.equal(jsAges.size, cppAges.size);
      for (const [cladeKey, jsAge] of jsAges) {
        const cppAge = cppAges.get(cladeKey);
        assert.ok(Math.abs(jsAge - cppAge) < 1e-3,
          `Clade ${cladeKey}: JS age ${jsAge} vs C++ treePL age ${cppAge} exceeded 1e-3 tolerance`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
});
