const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../core/sample-identity.js');

test('default display spaces taxon words but preserves underscores in numeric sample identifiers', () => {
  const cases = [
    ['Delphinium_caeruleum_2023080906_1', 'Delphinium caeruleum 2023080906_1'],
    ['Delphinium_anthriscifolium_20180406_8', 'Delphinium anthriscifolium 20180406_8'],
    ['Aconitum_carmichaelii_var_hwangshanicum_SRR5397217_2', 'Aconitum carmichaelii var hwangshanicum SRR5397217_2'],
    ['Example_alpha_2021BL017192_run_2', 'Example alpha 2021BL017192_run_2'],
    ['Example_alpha_SRR123456_1', 'Example alpha SRR123456_1'],
    ['Example alpha 2023080906_1', 'Example alpha 2023080906_1'],
    ['SRR123456_1', 'SRR123456_1'],
    ['Example_alpha_2024042508-1', 'Example alpha 2024042508-1'],
    ['  Example_alpha  ', 'Example alpha'],
    ['Example_alpha', 'Example alpha'],
    ['__Example__alpha__', 'Example alpha'],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(identity.baseTipDisplayLabel(raw), expected, raw);
    assert.equal(identity.baseTipDisplayLabel(expected), expected, 'display formatting is idempotent');
  }
});

test('display formatting preserves raw labels, identity keys and explicit overrides', () => {
  const raw = 'Delphinium_caeruleum_2023080906_1';
  const root = {children: [{label: raw, children: []}]};
  const before = JSON.stringify(root);
  const keys = ['exact', 'conflict', 'auxiliary'].map(policy => identity.tipIdentityKey(raw, policy));
  const display = identity.baseTipDisplayLabel(raw);
  assert.equal(identity.resolveTipOriginalName(display, [raw]), raw);
  assert.equal(identity.resolveTipOriginalName('Delphinium caeruleum 2023080906 1', [raw]), raw, 'legacy aliases remain accepted');
  assert.deepEqual([...identity.validateTipLabelOverrides({[raw]: 'Custom_name_1'}, [raw])], [[raw, 'Custom_name_1']]);
  assert.equal(JSON.stringify(root), before);
  assert.deepEqual(['exact', 'conflict', 'auxiliary'].map(policy => identity.tipIdentityKey(raw, policy)), keys);
});
