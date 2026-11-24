const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function fixture() {
  const ctx = vm.createContext({
    nodeLabelInkRect: el => el.ink,
    rectsOverlap: (a,b,p) => a.x < b.x+b.width+p && a.x+a.width+p > b.x && a.y < b.y+b.height+p && a.y+a.height+p > b.y,
    segmentIntersectsRect: (s,r,p) => Math.max(s.x1,s.x2) >= r.x-p && Math.min(s.x1,s.x2) <= r.x+r.width+p && Math.max(s.y1,s.y2) >= r.y-p && Math.min(s.y1,s.y2) <= r.y+r.height+p,
  });
  vm.runInContext(source.slice(source.indexOf('function countResidualCollisions('), source.indexOf('function enableLabelDrag(')), ctx);
  return ctx.countResidualCollisions;
}
test('font whitespace reproduces false positive; automatic and retained reports now agree', () => {
  const count = fixture();
  const ink = {x:10,y:10,width:40,height:10};
  const outer = {id:'a',x:10,y:2,width:40,height:26};
  const branches = [{x1:0,y1:27,x2:80,y2:27}];
  const group = {querySelectorAll: () => [{dataset:{labelId:'a'},ink}]};
  assert.equal(count([outer],branches,[]),1,'old outer-box reporting falsely counts the empty descent area');
  assert.equal(count([{...ink,id:'a'}],branches,[],[],group),0);
  assert.equal(count([outer],branches,[],[],group),0,'no-op fast redraw has the same result');
  branches[0].y1 = branches[0].y2 = 16;
  assert.equal(count([outer],branches,[],[],group),1,'genuine ink/branch overlap must remain visible');
});
test('time label does not collide with its own leader when only labelId is present', () => {
  const count = fixture();
  const r={labelId:'a',x:10,y:10,width:20,height:10};
  const own={labelId:'a',x1:0,y1:15,x2:20,y2:15};
  assert.equal(count([r],[],[],[own]),0);
  assert.equal(count([r],[],[],[{...own,labelId:'b'}]),1);
});
test('leader style issues are not counted as physical text overlaps', () => {
  const count=fixture();
  assert.equal(count([{id:'a',x:0,y:0,width:20,height:10,leaderGeometryInvalid:true,ownershipUnresolved:true,leaderCrossings:2}],[],[]),0);
});
test('both full rendering paths and fast rendering use the common ink-aware reporter', () => {
  const renderer = fs.readFileSync(require('node:path').join(__dirname,'../render/node-label-layout.js'),'utf8');
  assert.match(renderer,/finalLeaderSegments,\s+group,/);
  const timeRenderer = fs.readFileSync(require('node:path').join(__dirname,'../render/time-tree.js'),'utf8');
  assert.match(timeRenderer,/countResidualCollisions\(placed, branchSegments, tipRects, finalLeaderSegments, ageGroup\)/);
  assert.match(source,/countResidualCollisions\(placements, branches, tips, segments, group\)/);
});
