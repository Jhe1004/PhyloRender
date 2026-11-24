const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const cloud = require('../cloud-tree.js');
const source = fs.readFileSync(path.join(__dirname, '../core/tree-input.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const code = name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];
const parser = vm.createContext({});
vm.runInContext(['extractLeadingRootingDirective', 'extractTreeSource', 'tokenizeNewick', 'parseNewick'].map(code).join('\n'), parser);
const parse = parser.parseNewick;

test('partial-sampling gene trees remain eligible for statistics, not cloud overlay', () => {
  const species = parse('(O,((A,B),C));');
  const partial = parse('(O,(A,C));');
  assert.deepEqual(cloud.phyPartsEligibility(species, partial), { accepted: true, exact: false, outgroup: 'O', missing: 1 });
  assert.equal(cloud.phyPartsEligibility(species, parse('((A,B),C);')).category, 'unrootable');
  assert.equal(cloud.phyPartsEligibility(species, parse('(O,(A,D));')).category, 'unknown');
  assert.throws(() => parse('(O,(A,A));'), { code: 'TREE_DUPLICATE_OR_EMPTY_TIP' });
  // Also test the scientific helper's defence on an already constructed tree.
  assert.equal(cloud.phyPartsEligibility(species, parse('(O,(A,A));', { validateInput: false })).category, 'invalid');
  assert.equal(cloud.phyPartsEligibility(species, parse('[&U](O,(A,B));'), { rootPolicy: 'input' }).accepted, false);
  assert.throws(() => cloud.phyPartsEligibility(parse('((O,A),(B,C));'), partial), /single-taxon outgroup|explicitly select/i);
  assert.equal(cloud.phyPartsEligibility(species, partial, { rootPolicy: 'input' }).accepted, true);
});

test('PhyParts safe IDs preserve names including @ and support field choices', () => {
  const root = parse("('A@1',('B name','C_name')95/80);");
  const names = cloud.sampleProfile(root).names;
  const before = JSON.stringify(root);
  assert.equal(cloud.phyPartsInput(root, names), '(T00000,(T00001,T00002)0.8);');
  assert.equal(cloud.phyPartsInput(root, names, { field: 'first' }), '(T00000,(T00001,T00002)0.95);');
  assert.equal(cloud.phyPartsInput(parse('(A,(B,C)1);'), ['A', 'B', 'C'], { scale: 'percent' }), '(T00000,(T00001,T00002)0.01);');
  assert.equal(JSON.stringify(root), before);
  assert.throws(() => cloud.phyPartsInput(parse('(A,(B,C)105);'), ['A', 'B', 'C']), /range|scale|0.*100/i);
});

test('gene collection scanner accepts multiline Newick and quoted/comment semicolons', () => {
  assert.deepEqual(cloud.splitGeneTrees("\n(O,\n('A;z',B)[a;b]);\n(O,(B,C));"), ["(O,\n('A;z',B)[a;b]);", '(O,(B,C));']);
  assert.equal(cloud.splitGeneTrees('(O,(A,B));\n(O,(B,C))').length, 2);
  assert.throws(() => cloud.splitGeneTrees('#NEXUS\nbegin trees;'), /translate|nexus|newick/i);
});

test('auto support units apply across the collection, so 1 percent is not 100 percent', () => {
  const roots = [parse('(O,(A,B)95/80);'), parse('(O,(A,B)50/1);')];
  const scale = cloud.phyPartsSupportScale(roots);
  assert.equal(scale, 'percent');
  assert.equal(cloud.phyPartsInput(roots[1], ['O', 'A', 'B'], { scale }), '(T00000,(T00001,T00002)0.01);');
  assert.throws(()=>cloud.phyPartsSupportScale([parse('(O,(A,B)0.6);')]),{code:'SUPPORT_SCALE_AMBIGUOUS'});
  assert.equal(cloud.phyPartsSupportScale([parse('(O,(A,B)0.6);')],{scale:'probability'}), 'probability');
});

test('rerooting moves support with the physical split, not with the old node', () => {
  const rooting = require('../tree-rooting.js');
  const original = parse('(A:1,B:1,(C:1,(O:1,D:1)0.9:1)0.8:1);');
  const nodes = new Map(), edges = [], adjacency = new Map();
  (function visit(node, parent) {
    nodes.set(node.id, { id: node.id, tipLabel: node.children.length ? '' : node.label, original: node });
    adjacency.set(node.id, []);
    if (parent) edges.push({ id: 'e' + edges.length, a: parent.id, b: node.id, length: node.length,
      support: node.children.length ? node.label || null : null });
    node.children.forEach(child => visit(child, node));
  })(original);
  edges.forEach(edge => {
    adjacency.get(edge.a).push({ node: edge.b, edge });
    adjacency.get(edge.b).push({ node: edge.a, edge });
  });
  const graph = { nodes, edges, adjacency, originalRootId: original.id };
  const rerooted = rooting.rerootOnTip(graph, cloud.tips(original).find(node => node.label === 'O').id);
  const names = cloud.sampleProfile(original).names;
  function values(root, getter) {
    const entries = [];
    (function visit(node) {
      if (node !== root && node.children.length && getter(node)) {
        const inside = cloud.tips(node).map(n => n.label).sort();
        const outside = names.filter(name => !inside.includes(name)).sort();
        const side = inside.length < outside.length ? inside : outside;
        entries.push([JSON.stringify(side), String(getter(node))]);
      }
      node.children.forEach(visit);
    })(root);
    return entries.sort();
  }
  assert.deepEqual(values(rerooted, node => node.support), values(original, node => node.label));
  assert.equal(cloud.tips(rerooted).length, 5);
});

test('backend output parser and guards do not depend on Java installation', () => {
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tools', '-p', 'test_phyparts_runtime.py'],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('large exact-tip subsets date in bounded batches and changing options clears old statistics', () => {
  assert.match(source, /offset < inputs\.length; offset \+= 100/);
  assert.match(source, /runBatch\(inputs\.slice\(offset, offset \+ 100\)\)/);
  assert.match(source, /phyPartsTable: null, phyPartsText: "", phyPartsMeta: null/);
  assert.match(source, /result\.mode !== "four"/);
  assert.match(fs.readFileSync(path.join(__dirname, '../render/cloud-tree.js'), 'utf8'), /id: "cloud-phyparts-provenance"/);
});

test('automatic analysis always requests and validates full detail independent of display', async () => {
  const complete = 'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t1\t1\t0\t1\tA;B\n';
  const requests = [];
  let table = complete, algorithm = require('../core/phyparts-engine.js').ALGORITHM;
  const context = vm.createContext({ PhyloRenderCloud: cloud, PhyloRenderPhyParts: require('../core/phyparts-engine.js'),
    currentScienceSignal: () => undefined,
    PhyloRenderInputTasks: {run: async (operation, payload) => {
      requests.push({operation,payload});
      if (operation === 'payload') return require('../core/gene-preparation.js').payload(payload.speciesRoot,payload.genes,payload.names,payload.options);
      return {engine:'PhyloRender-conflict-statistics',algorithm,geneCount:1,mode:'four',table};
    }},
    Object, Number, Date, Promise, setTimeout: fn => fn(),
    supportFromNode: node => node.label,
    $: id => ({ value: {'cloud-pie-mode':'two','cloud-phyparts-threshold':'0',
      'cloud-phyparts-field':'last','cloud-phyparts-scale':'probability','cloud-phyparts-root-policy':'outgroup'}[id] }),
  });
  vm.runInContext(code('runAutomaticPhyParts').replace(/^function/, 'async function'), context);
  const species = parse('(O,((A,B),C));'), gene = parse('(O,((A,B)1,C)1);');
  const result = await context.runAutomaticPhyParts(species, [gene], ['O','A','B','C']);
  assert.equal(requests[0].operation, 'payload');
  assert.equal(requests[1].operation, 'phyparts');
  assert.equal(requests[1].payload.mode, 'four');
  assert.equal(cloud.parsePhyPartsTable(result.table).detailed, true);
  algorithm = 'phylorender-conflict-statistics-v1';
  await assert.rejects(context.runAutomaticPhyParts(species, [gene], ['O','A','B','C']), /version|algorithm/i);
  algorithm = require('../core/phyparts-engine.js').ALGORITHM;
  table = 'Node_ID\tconcordant_N\tconflict_total_N\tno_signal_N\tdescendant_samples\nN1\t1\t1\t1\tA;B\n';
  await assert.rejects(context.runAutomaticPhyParts(species, [gene], ['O','A','B','C']), /four-category|4-category|detailed/i);
  assert.doesNotMatch(source, /正在计算四部分 PhyParts 饼图/);
});
