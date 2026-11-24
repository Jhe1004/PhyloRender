const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
test('group defaults follow tip size plus 3 u and retain each workspace bar alignment',()=>{
  const code = source.match(/function cladePresentationDefaults\([\s\S]*?\n\}/)[0];
  const units=require('../figure-units.js'),contract=require('../figure-contract.js');
  const context = vm.createContext({figureUnits:units,PhyloRenderContract:contract});
  vm.runInContext(code,context);
  for(const mode of ['time','cloud']) {
    const defaults = context.cladePresentationDefaults(mode);
    assert.equal(defaults.alignment,'auto');
    assert(Math.abs(units.designToDrawing(Number(defaults.size))-contract.defaults(mode).typography.tips.size_u-3)<1e-10);
    assert.equal(defaults.followTipSize,true);
  }
  for(const mode of ['phylogeny','conflict']) {
    const defaults = context.cladePresentationDefaults(mode);
    assert.equal(defaults.alignment,'auto');assert.equal(defaults.followTipSize,true);
  }
  assert.match(source,/cladePresentationByMode\.set\(state\.workspaceMode, captureCladePresentation\(\)\)/);
  assert.match(source,/cladePresentationByMode\.get\(mode\) \|\| cladePresentationDefaults\(mode\)/);
  assert.match(source,/\$\("clade-font-size"\)\.value = cladePresentationDefaults\(state\.workspaceMode\)\.size/);
});
