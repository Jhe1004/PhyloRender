const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const code=source.slice(source.indexOf('function buildCladeBarLayout('),source.indexOf('function drawCladeBars('));
const leaf=(id,y)=>({id,y,children:[]}),branch=(id,...children)=>({id,children});
const tips=n=>n.children.length?n.children.flatMap(tips):[n];
function layout(root,defs,rights,alignment='aligned',boxes=[],opts={}){
 const groups={cladeColors:new Map(),cladeNames:new Map(),cladeNameOrientations:new Map()};
 for(const[id,name,orientation='auto']of defs){groups.cladeColors.set(id,'#0072b2');groups.cladeNames.set(id,name);groups.cladeNameOrientations.set(id,orientation);}
 const height=opts.height||700;
 const context=vm.createContext({activeCladeState:()=>groups,$:()=>({value:alignment}),descendantTipNodes:tips,
  findNodeById:(n,id)=>n.id===id?n:n.children.map(c=>context.findNodeById(c,id)).find(Boolean),
  effectiveCladeNameSegments:(id,name)=>[{text:name}],measureCladeNameSegments:s=>({width:s[0].text.length*7,maximumSize:18}),
  state:{currentSvgSize:{height},workspaceMode:opts.workspaceMode},PhyloRenderContract:require('../figure-contract.js'),
  PhyloRenderCladeLayout:fs.existsSync(require.resolve('../app.js').replace('app.js','core/clade-layout.js'))?require('../core/clade-layout.js'):null});
 vm.runInContext(code,context);return context.buildCladeBarLayout(root,rights,24,boxes,height,opts.barOpts);
}
test('aligned automatic group names rotate and stagger overlapping neighbors',()=>{
 const root=branch('r',leaf('a',150),branch('b',leaf('b1',174),leaf('b2',198)));
 const result=layout(root,[['a','Staphisagria'],['b','Gymnaconitum']],new Map(tips(root).map(t=>[t.id,300])));
 assert.ok(result.items.every(i=>i.orientation==='vertical'));
 assert.notEqual(result.items[0].alignmentColumn,result.items[1].alignmentColumn);
 assert.ok(result.requiredWidth<540);
});
test('nearby automatic labels retain horizontal text that fits unused name space',()=>{
 const root=branch('r',branch('a',leaf('a1',150),leaf('a2',174)),leaf('o',250));
 const result=layout(root,[['a','Group A']],new Map([['a1',100],['a2',100],['o',400]]),'nearby',[
  {x:20,y:136,width:80,height:20},{x:20,y:160,width:80,height:20},{x:20,y:236,width:380,height:20}]);
 assert.equal(result.items[0].orientation,'horizontal');assert.equal(result.items[0].x,114);
});
test('nearby automatic labels use vertical text when it safely reduces right-side width',()=>{
 const root=branch('r',branch('a',leaf('a1',150),leaf('a2',174),leaf('a3',198),leaf('a4',222)));
 const result=layout(root,[['a','A lengthy group name']],new Map(tips(root).map(t=>[t.id,200])),'nearby');
 assert.equal(result.items[0].orientation,'vertical');
});
test('nearby horizontal gap is retained when rotation would cross another sample name',()=>{
 const root=branch('r',leaf('a',150),leaf('b',174));
 const result=layout(root,[['a','Long group name']],new Map([['a',100],['b',400]]),'nearby',[
  {x:20,y:136,width:80,height:20},{x:20,y:163,width:380,height:20}]);
 assert.equal(result.items[0].orientation,'horizontal');assert.equal(result.items[0].x,114);
});
test('explicit horizontal and vertical choices remain fixed',()=>{
 for(const orientation of ['horizontal','vertical']){
  const root=branch('r',leaf('a',150));const before=JSON.stringify(root);
  const result=layout(root,[['a','A lengthy group',orientation]],new Map([['a',200]]));
  assert.equal(result.items[0].orientation,orientation);assert.equal(JSON.stringify(root),before);
 }
});

test('the geometry module uses copied inputs and rejects invalid coordinates',()=>{
 const core=require('../core/clade-layout.js');assert.ok(Object.isFrozen(core));
 assert.deepEqual(core.layout([]),{items:[],requiredWidth:0});
 const item={nodeId:'a',orientation:'auto',baseX:114,x:114,y1:140,y2:180,nameWidth:100,maximumFontSize:18,titleY1:145,titleY2:168,tipCount:1,tipIds:['a']};
 const input=[item],before=structuredClone(input);core.layout(input,{alignment:'aligned',tipRightEdges:new Map([['a',100]])});assert.deepEqual(input,before);
 assert.throws(()=>core.layout([{...item,x:NaN}]),{code:'CLADE_LAYOUT_INVALID'});
});

test('flush-tip trees (cloud, dating, and aligned topologies) align single-layer clades on one line under auto',()=>{
 const dodo=branch('dodo',leaf('d1',48),leaf('d2',72));
 const sap=branch('sap',...Array.from({length:12},(_,i)=>leaf(`s${i}`,96+i*24)));
 const xan=branch('xan',leaf('x1',384),leaf('x2',408),leaf('x3',432));
 const hip=branch('hip',...Array.from({length:15},(_,i)=>leaf(`h${i}`,456+i*24)));
 const root=branch('r',leaf('out',24),dodo,sap,xan,hip);
 const rights=new Map([['out',790],['d1',795],['d2',795],...tips(sap).map((t,i)=>[t.id,i===1?817:805]),
  ...tips(xan).map(t=>[t.id,801]),...tips(hip).map((t,i)=>[t.id,i===8?836:812])]);
 const defs=[['dodo','Dodonaeoideae'],['sap','Sapindoideae'],['xan','Xanthoceroideae'],['hip','Hippocastanoideae']];
 for(const opts of [{workspaceMode:'cloud',height:900},{workspaceMode:'time',height:900},{barOpts:{tipsAligned:true},height:900}]){
  const result=layout(root,defs,rights,'auto',[],opts);
  assert.equal(result.items.length,4);
  assert.ok(result.items.every(i=>i.alignment==='aligned'&&i.orientation==='vertical'&&i.alignmentColumn===0));
  assert.equal(new Set(result.items.map(i=>i.x)).size,1,'all four non-overlapping subfamilies must share one bracket line');
  assert.equal(result.items[0].x,850);
 }
});

test('explicit nearby avoids false bounding-box staggering and co-aligns nearby vertical neighbors safely',()=>{
 const dodo=branch('dodo',leaf('d1',48),leaf('d2',72));
 const sap=branch('sap',...Array.from({length:10},(_,i)=>leaf(`s${i}`,96+i*24)));
 const root=branch('r',dodo,sap);
 // Same baseX: short bracket with vertical text extending past y2 must not push neighbor whose title is far below
 const equalRights=new Map(tips(root).map(t=>[t.id,300]));
 const equalRes=layout(root,[['dodo','Dodonaeoideae','vertical'],['sap','Sapindoideae','vertical']],equalRights,'nearby',[],{height:600});
 assert.deepEqual(Array.from(equalRes.items,i=>i.x),[314,314]);
 // Slightly shorter upper group (22 px difference): pull upper bracket flush to 314 instead of kicking lower group to ~366
 const slightRights=new Map([...tips(dodo).map(t=>[t.id,278]),...tips(sap).map(t=>[t.id,300])]);
 const slightRes=layout(root,[['dodo','Dodonaeoideae','vertical'],['sap','Sapindoideae','vertical']],slightRights,'nearby',[],{height:600});
 assert.deepEqual(Array.from(slightRes.items,i=>i.x),[314,314]);
 // Far-apart phylogram branches remain at their own local positions
 const farRights=new Map([...tips(dodo).map(t=>[t.id,140]),...tips(sap).map(t=>[t.id,360])]);
 const farRes=layout(root,[['dodo','Dodonaeoideae','vertical'],['sap','Sapindoideae','vertical']],farRights,'nearby',[],{height:600});
 assert.deepEqual(Array.from(farRes.items,i=>i.x),[154,374]);
});
