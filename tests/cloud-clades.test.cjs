const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

test('cloud grouping uses its own species root and maps, not ordinary node IDs', () => {
  const state = { workspaceMode: 'cloud', root: { id: 'n1', label: 'ordinary' },
    cloud: { speciesRoot: { id: 'n1', label: 'cloud' }, cladeColors: new Map() }, cladeColors: new Map() };
  const context = vm.createContext({ state });
  vm.runInContext(source.slice(source.indexOf('function activeCladeState()'), source.indexOf('function clearCloudClades()')), context);
  assert.equal(context.activeCladeState(), state.cloud);
  assert.equal(context.activeCladeRoot(), state.cloud.speciesRoot);
  state.workspaceMode = 'phylogeny';
  assert.equal(context.activeCladeState(), state);
  assert.equal(context.activeCladeRoot(), state.root);
});

test('cloud group inheritance and nested override change no input nodes', () => {
  const a = { id: 'a', label: 'Alpha_a', length: 2, children: [] };
  const b = { id: 'b', label: 'Beta_b', length: 2, children: [] };
  const c = { id: 'c', label: 'Gamma_c', length: 4, children: [] };
  const clade = { id: 'ab', length: 2, children: [a,b] };
  const root = { id: 'root', children: [clade,c] };
  const engine = require('../render/cloud-branches.js').create({svgEl:()=>{},model:require('../cloud-tree.js')});
  const before = JSON.stringify(root), colors = engine.cladeColorMap(root,new Map([['ab', '#0072b2'], ['a', '#d55e00']]));
  assert.equal(colors.get(clade), '#0072b2');
  assert.equal(colors.get(a), '#d55e00'); assert.equal(colors.get(b), '#0072b2');
  assert.equal(colors.has(c), false); assert.equal(colors.has(root), false);
  assert.equal(JSON.stringify(root), before);
});

test('a manually selected lowercase group color is not reused as a new automatic color', () => {
  const context = vm.createContext({
    activeCladeState: () => ({ cladeColors: new Map([['one', '#0072b2']]) }),
    CLADE_PALETTE: ['#0072B2', '#D55E00'],
  });
  vm.runInContext(source.slice(source.indexOf('function nextCladeColor()'), source.indexOf('function cladeSummary(')), context);
  assert.equal(context.nextCladeColor(), '#D55E00');
});

test('cloud bars share the normal layout engine through detached display geometry', () => {
  const render = fs.readFileSync(path.join(__dirname,'../render/cloud-tree.js'),'utf8');
  assert.match(render, /children: node\.children\.map\(layoutView\)/);
  assert.match(render, /buildCladeBarLayout\(layoutView\(species\), tipRights, rowStep, labelBoxes\.filter\(box => !box\.layoutOnly\), height\)/);
  assert.match(render, /drawCladeBars\(cladeBars, cloudCladeLayout\.items, height\)/);
  assert.doesNotMatch(render, /node\.y\s*=|tip\.y\s*=/);
  assert.match(render, /cloud-clade-provenance/);
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  assert.doesNotMatch(css, /body\.cloud-tree-mode \.settings-nav \[data-settings-target="groups"\] \{ display: none/);
});

test('default cloud demonstration groups are complete disjoint clades and never modify inputs', () => {
  const cloud = require('../cloud-tree.js');
  let serial = 0;
  const tip = () => ({ id: `t${serial++}`, label: `Sample_${serial}`, length: 1, children: [] });
  const branch = children => ({ id: `n${serial++}`, length: 1, children });
  const tree = depth => depth ? branch([tree(depth - 1), tree(depth - 1)]) : tip();
  const root = branch([tip(), tree(6)]);
  const state = { cloud: { cladeColors: new Map(), cladeNames: new Map(), cladeNameOrientations: new Map() } };
  const context = vm.createContext({ state, PhyloRenderContract: require('../figure-contract.js'), PhyloRenderCloud: cloud, CLADE_PALETTE: ['a','b','c','d','e','f','g','h'] });
  vm.runInContext(source.slice(source.indexOf('function seedDefaultCloudClades('), source.indexOf('async function loadDefaultCloudWorkspace()')), context);
  const before = JSON.stringify(root);
  context.seedDefaultCloudClades(root);
  assert.equal(state.cloud.cladeColors.size, 8);
  const used = new Set();
  for (const [node, clade] of cloud.nodeClades(root)) {
    if (!state.cloud.cladeColors.has(node.id)) continue;
    assert.ok(clade.names.length >= 3);
    clade.names.forEach(name => { assert.equal(used.has(name), false); used.add(name); });
  }
  assert.equal(used.size, 64);
  assert.equal(JSON.stringify(root), before);
  assert.equal((source.match(/seedDefaultCloudClades\(state\.cloud\.speciesRoot\)/g) || []).length, 1);
  assert.match(source.slice(source.indexOf('async function loadDefaultCloudWorkspace()'), source.indexOf('function bindControls()')), /seedDefaultCloudClades\(state\.cloud\.speciesRoot\)/);
});
