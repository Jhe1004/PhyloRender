const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const code = source.slice(source.indexOf('function buildCladeBarLayout('), source.indexOf('function drawCladeBars('));
const tip = (id, y) => ({ id, y, children: [] });
const branch = (id, ...children) => ({ id, children });
const tips = node => node.children.length ? node.children.flatMap(tips) : [node];
function setup(root, definitions, rights) {
  const groups = { cladeColors: new Map(), cladeNames: new Map(), cladeNameOrientations: new Map() };
  definitions.forEach(([id, name, orientation = 'horizontal']) => {
    groups.cladeColors.set(id, '#0072b2'); groups.cladeNames.set(id, name); groups.cladeNameOrientations.set(id, orientation);
  });
  const control = { value: 'auto' };
  const context = vm.createContext({
    activeCladeState: () => groups, $: () => control,
    PhyloRenderContract: require('../figure-contract.js'),
    PhyloRenderCladeLayout: require('../core/clade-layout.js'), state: {currentSvgSize:{height:1000}},
    descendantTipNodes: tips,
    findNodeById: (node, id) => node.id === id ? node : node.children.map(child => context.findNodeById(child, id)).find(Boolean),
    effectiveCladeNameSegments: (id, name) => [{ text: name }],
    measureCladeNameSegments: segments => ({ width: segments[0].text.length * 7, maximumSize: 14 }),
  });
  vm.runInContext(code, context);
  return { root, groups, control, run: () => context.buildCladeBarLayout(root, rights, 24) };
}
test('nearby remains local while aligned bars use the entire figure rightmost label', () => {
  const root = branch('r', branch('a', tip('a1', 0), tip('a2', 24)), branch('b', tip('b1', 100), tip('b2', 124)), tip('o', 200));
  const setupResult = setup(root, [['a','A'],['b','B']], new Map([['a1',100],['a2',80],['b1',200],['b2',170],['o',300]]));
  const before = JSON.stringify(root), names = [...setupResult.groups.cladeNames];
  const nearby = setupResult.run();
  assert.deepEqual(Array.from(nearby.items, item => item.x), [114,214]);
  setupResult.control.value = 'aligned';
  const aligned = setupResult.run();
  assert.deepEqual(Array.from(aligned.items, item => item.x), [314,314]);
  assert.deepEqual(Array.from(aligned.items, item => item.alignmentOffset), [200,100]);
  assert.ok(aligned.requiredWidth > 314);
  setupResult.control.value = 'nearby';
  assert.deepEqual(Array.from(setupResult.run().items, item => item.x), [114,214]);
  assert.equal(JSON.stringify(root), before); assert.deepEqual([...setupResult.groups.cladeNames], names);
});
test('nested groups automatically switch to right-aligned tier columns under auto while explicit nearby stays local', () => {
  const root = branch('r', branch('a', branch('ai', tip('a1',0),tip('a2',24)),tip('a3',48)),
    branch('b',branch('bi',tip('b1',150),tip('b2',174)),tip('b3',198)));
  const rights = new Map([['a1',120],['a2',120],['a3',120],['b1',220],['b2',220],['b3',220]]);
  const result = setup(root, [['a','Outer A'],['ai','Inner A'],['b','Outer B'],['bi','Inner B']], rights);
  // Default 'auto' detects 2 layers and aligns peer tiers behind the rightmost sample label (220 + 14 = 234)
  const autoItems = new Map(Array.from(result.run().items, item=>[item.nodeId,item]));
  assert.equal(autoItems.get('ai').alignment, 'aligned');
  assert.equal(autoItems.get('ai').x, 234);
  assert.equal(autoItems.get('bi').x, 234);
  assert.equal(autoItems.get('a').x, autoItems.get('b').x);
  assert.ok(autoItems.get('a').x > autoItems.get('ai').x + 34);
  assert.equal(autoItems.get('a').alignmentColumn, 1);
  // Explicit 'nearby' keeps Group A locally near 120+14 rather than pulling it to 234
  result.control.value = 'nearby';
  const nearbyItems = new Map(Array.from(result.run().items, item=>[item.nodeId,item]));
  assert.equal(nearbyItems.get('ai').alignment, 'nearby');
  assert.equal(nearbyItems.get('ai').x, 134);
  assert.equal(nearbyItems.get('bi').x, 234);
});
test('aligned mode separates overlapping singleton or rotated titles instead of forcing collisions', () => {
  for (const orientation of ['horizontal','vertical']) {
    const root=branch('r',tip('a',0),tip('b',10));
    const result=setup(root,[['a','Long title',orientation],['b','Another long title',orientation]],new Map([['a',100],['b',100]]));
    result.control.value='aligned';
    const items=result.run().items;
    assert.notEqual(items[0].alignmentColumn,items[1].alignmentColumn);
    assert.ok(items[1].x>items[0].x+34);
  }
});
test('multi-tier clades keep every peer tier on one strict vertical column without kicking short tribes into outer tiers', () => {
  const layoutApi = require('../core/clade-layout.js');
  const mk = (nodeId, name, tipIds, y1, y2, tier) => ({
    nodeId, color: '#0072b2', name, nameSegments: [{ text: name }],
    nameWidth: name.length * 10, maximumFontSize: 16, orientation: 'auto',
    barStyle: 'auto', requestedTier: tier, tipIds, tipCount: tipIds.length,
    y1, y2, titleY1: (y1 + y2) / 2 - 12, titleY2: (y1 + y2) / 2 + 6,
    occupiedY1: y1, occupiedY2: y2, x: 214, baseX: 214,
  });
  const tipRights = new Map(['d1','d2','k1','k2','p1','s1','s2','s3','c1','n1','n2','n3','n4','x1','x2','h1','h2','h3','h4'].map(id => [id, 200]));
  const prepared = [
    mk('k', 'Koelreuterieae', ['k1','k2'], 40, 76, 0),
    mk('p', 'Paullinieae', ['p1'], 84, 100, 0),
    mk('s', 'Sapindeae', ['s1','s2','s3'], 108, 160, 0),
    mk('c', 'Cupanieae', ['c1'], 168, 184, 0),
    mk('n', 'Nephelieae', ['n1','n2','n3','n4'], 192, 260, 0),
    mk('h', 'Hippocastaneae', ['h1','h2','h3','h4'], 316, 384, 0),
    mk('dod', 'Dodonaeoideae', ['d1','d2'], 0, 32, 1),
    mk('sap', 'Sapindoideae', ['k1','k2','p1','s1','s2','s3','c1','n1','n2','n3','n4'], 40, 260, 1),
    mk('xan', 'Xanthoceroideae', ['x1','x2'], 270, 306, 1),
    mk('hip', 'Hippocastanoideae', ['h1','h2','h3','h4'], 316, 384, 1),
  ];
  for (const alignment of ['auto', 'aligned']) {
    const { items } = layoutApi.layout(prepared, { alignment, tipsAligned: true, tipRightEdges: tipRights, canvasHeight: 500 });
    const tier0 = items.filter(i => i.effectiveTier === 0);
    const tier1 = items.filter(i => i.effectiveTier === 1);
    assert.equal(new Set(tier0.map(i => i.alignmentColumn)).size, 1, `${alignment}: all inner tribes share column 0`);
    assert.equal(new Set(tier0.map(i => i.x)).size, 1, `${alignment}: all inner tribes share one x`);
    assert.equal(new Set(tier1.map(i => i.alignmentColumn)).size, 1, `${alignment}: all outer subfamilies share column 1`);
    assert.equal(new Set(tier1.map(i => i.x)).size, 1, `${alignment}: all outer subfamilies share one x`);
    assert.ok(tier1[0].x > tier0[0].x + 34, `${alignment}: outer column sits strictly outside inner column`);
  }
});
test('alignment is a collapsed shared GUI option and an explicit MCP enum defaulting to auto', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html, /<details id="clade-bar-alignment-section" class="settings-group" data-settings-page="groups">/);
  assert.match(html, /value="auto" selected/);
  assert.match(source, /"clade-bar-alignment"[\s\S]*?addEventListener\("change", requestSettingsRender\)/);
  assert.match(fs.readFileSync(path.join(__dirname,'../agent-bridge.js'),'utf8'), /"layout\.clade_bar_alignment"/);
  assert.match(fs.readFileSync(path.join(__dirname,'../mcp-server/src/schemas.mjs'),'utf8'), /clade_bar_alignment: z\.enum\(contract\.cladeBarAlignment\.values\)/);
});
