import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';

// Exercise the production geometry functions without requiring a browser.
const require = createRequire(import.meta.url);
const geometry = require('../../core/label-geometry.js');
const context = vm.createContext({...geometry,
  candidatePlacements:(node,width,height,maximum,branches=[])=>geometry.candidatePlacements(node,width,height,maximum,branches,{width:1000,height:1000})});
assert.equal(vm.runInContext('fineLabelSlotCandidates({x:100,y:200}).length',context),625,
  'fine search remains bounded');
assert.ok(vm.runInContext('fineLabelSlotCandidates({x:100,y:200}).some(p=>p.x===112&&p.y===194)',context),
  'include small off-grid moves needed for the support 83 regression');
const result = vm.runInContext(`(() => {
  const node={x:100,y:100}, width=78,height=16;
  const branches=[{x1:100,y1:76,x2:500,y2:76},{x1:100,y1:124,x2:500,y2:124},{x1:100,y1:76,x2:100,y2:124}];
  const candidates=candidatePlacements(node,width,height,192,branches);
  const valid=candidates.filter(p=>{
    const b={...p,width,height}, target=leaderTargetCandidates(node,b)[0];
    const angle=nodeArrowAxisAngle(node,target);
    return p.x>100 && p.y>79 && p.y+height<121
      && !branches.some(s=>segmentIntersectsRect(s,b,3))
      && leaderGeometry(node,b).edgeDistance>6 && angle>=20 && angle<=80
      && Math.hypot(target.x-node.x,target.y-node.y)>=14;
  });
  return {count:valid.length, independent:valid.some(p=>p.x===120&&p.y===82),
    gap:valid.some(p=>p.position==='branch-gap')};
})()`,context);
assert.ok(result.count>0, 'find legal slots inside a wide shallow gap');
assert.ok(result.independent, 'independent horizontal/vertical offset is retained');
assert.ok(result.gap, 'sample branch-defined free intervals');
assert.ok(vm.runInContext('leaderVisualCost({crossings:0,length:10000}) > leaderVisualCost({crossings:1,length:14})',context),
  'a branch crossing must not justify an arbitrarily long leader');
assert.ok(vm.runInContext('leaderVisualCost({crossings:0,length:56}) - leaderVisualCost({crossings:0,length:42}) > leaderVisualCost({crossings:0,length:28}) - leaderVisualCost({crossings:0,length:14})',context),
  'equal length increments incur a larger penalty on longer leaders');
assert.equal(vm.runInContext('leaderVisualCost({crossings:0,length:140},200)',context),
  vm.runInContext('leaderVisualCost({crossings:0,length:140},1)',context), 'taxon count does not dilute distance cost');
console.log(JSON.stringify(result));
assert.ok(vm.runInContext(`labelBoundaryCandidates({x:672.69667,y:2917},40.0390625,20.5,
  [{x:605.9673,y:2901.25,width:57.828125,height:18}],135)
  .some(p => p.x < 672 && p.y >= 2921.25 && p.y + 3.45703125 + 13.4033203125 < 2941)`, context),
  'Chrome visible glyphs fit above the 2944 branch despite the larger font line box');
assert.ok(vm.runInContext('leaderVisualCost({crossings:0,length:200},200) - leaderVisualCost({crossings:0,length:20},200) > 0.1',context),
  'long leader shortening remains numerically meaningful in dense layouts');
assert.equal(vm.runInContext('nodeArrowAnglePreferenceCost({length:14,axisAngle:45})',context),0,
  '45 degrees is the preferred leader angle');
assert.ok(vm.runInContext('nodeArrowAnglePreferenceCost({length:14,axisAngle:75}) > nodeArrowAnglePreferenceCost({length:14,axisAngle:60})',context),
  'angle penalty grows progressively with deviation from 45 degrees');
assert.ok(vm.runInContext('leaderVisualCost({crossings:0,length:14,axisAngle:80}) > leaderVisualCost({crossings:0,length:14,axisAngle:45})',context),
  'the shared placement cost prefers 45 degrees when all other properties match');
assert.equal(vm.runInContext('nodeLabelFontCost(15.9,18,16)',context),Infinity, 'font floor is hard');
assert.equal(vm.runInContext('nodeLabelFontCost(18,18,16)',context),0);
assert.equal(vm.runInContext('nodeLabelFontCost(28/3-.001,18,28/3)',context),Infinity,
  'the new 7-pt default remains a hard floor');
assert.ok(vm.runInContext('nodeLabelFontCost(28/3,18,28/3) > nodeLabelFontCost(12,18,28/3) && nodeLabelFontCost(12,18,28/3)>nodeLabelFontCost(16,18,28/3)',context),
  'the extended font range retains increasing penalties toward 7 pt');
assert.ok(vm.runInContext('nodeLabelFontCost(28/3,18,28/3)-nodeLabelFontCost(31/3,18,28/3)>nodeLabelFontCost(16,18,28/3)-nodeLabelFontCost(17,18,28/3)',context),
  'one additional size reduction costs more near the small-font floor');
assert.equal(vm.runInContext('leaderVisualCost({crossings:0,length:28})',context),60,
  'short leaders keep their existing cost');
assert.equal(vm.runInContext('leaderVisualCost({crossings:0,length:70})',context),3000,
  'long leaders incur the extra quadratic surcharge');
assert.equal(vm.runInContext('leaderVisualCost({crossings:0,length:140})',context),20300,
  'very long leaders receive a substantially stronger penalty');
assert.ok(vm.runInContext('nodeLabelFontCost(17,18,16)',context)>0,
  'reducing a label below the requested size has a positive cost');
assert.ok(vm.runInContext('nodeLabelFontCost(16,18,16)-nodeLabelFontCost(17,18,16)>nodeLabelFontCost(17,18,16)',context),
  'progressively discourage larger font reductions');
assert.ok(vm.runInContext('leaderVisualCost({crossings:0,length:100}) > leaderVisualCost({crossings:0,length:30})+nodeLabelFontCost(17,18,16)',context),
  'a modest font reduction can justify a substantial leader reduction');
assert.ok(vm.runInContext('leaderVisualCost({crossings:0,length:30}) < leaderVisualCost({crossings:0,length:28})+nodeLabelFontCost(17,18,16)',context),
  'do not shrink a label just to shave a tiny amount off its leader');
assert.equal(vm.runInContext('nodeLabelFontCost(17,18,16)',context),vm.runInContext('nodeLabelFontCost(34,36,32)',context),
  'relative font penalty is independent of scale');
assert.ok(vm.runInContext(`(() => {
  const n={x:640.911758,y:717.875}, w=56.1640625, h=11.9140625;
  return candidatePlacements(n,w,h,192,[{x1:577.849091,y1:600,x2:577.849091,y2:850}])
    .some(p=>{
      const box={...p,width:w,height:h}, target=leaderTargetCandidates(n,box)[0];
      return p.position==='minimum-leader-gap' && p.x>580.89 && p.x<580.91
        && Math.hypot(target.x-n.x,target.y-n.y)>=14
        && nodeArrowAxisAngle(n,target)<=80;
    });
})()`,context),'sample the narrow fractional corridor and exact legal leader length');
