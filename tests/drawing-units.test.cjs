const test=require('node:test');
const assert=require('node:assert/strict');
const units=require('../figure-units.js');
const contract=require('../figure-contract.js');
test('root attribute canonicalization preserves original namespaced nodes and values',()=>{
  const nodes=[{name:'viewBox',value:'0 0 1511 320'},{name:'xml:lang',namespaceURI:'http://www.w3.org/XML/1998/namespace',value:'en'},{name:'data-root-y',value:'66.81074905395508'}];
  const svg={attributes:[...nodes],removeAttributeNode(node){this.attributes=this.attributes.filter(a=>a!==node);},setAttributeNodeNS(node){this.attributes.push(node);}};
  units.canonicalizeSvgAttributes(svg);
  assert.deepEqual(svg.attributes.map(a=>a.name),['data-root-y','viewBox','xml:lang']);
  for(const node of nodes)assert.ok(svg.attributes.includes(node));
  assert.equal(svg.attributes[2].namespaceURI,'http://www.w3.org/XML/1998/namespace');
  assert.equal(svg.attributes[0].value,'66.81074905395508');
});
test('1000-wide drawing dimensions round trip without changing their source',()=>{
  const source={typography:{tips:{size_pt:18}},layout:{branch_width_pt:.9,tip_spacing:24},cloud:{pie_radius:25},time:{hpd_thickness:6}};
  const saved=structuredClone(source),relative=units.drawingOptions(source);
  assert.equal(relative.typography.tips.size_u,units.ptToDrawing(18));
  assert.equal(relative.cloud.pie_radius_u,units.designToDrawing(25));
  assert.equal(relative.time.hpd_thickness_u,units.designToDrawing(6));
  const restored=units.legacyOptions(relative);
  assert.ok(Math.abs(restored.typography.tips.size_pt-18)<1e-12);
  assert.deepEqual(source,saved);
  assert.equal(units.drawingOptions({layout:{branch_width_pt:1,branch_width_u:2}}).layout.branch_width_u,2);
  assert.equal(units.legacyOptions({layout:{branch_width_pt:1,branch_width_u:2}}).layout.branch_width_pt,units.drawingToPt(2));
  assert.deepEqual(units.drawingSegment({text:'name',size:18}),{text:'name',size_u:units.designToDrawing(18)});
  const adjustment={branch_id:'branch:a',dx_u:12,dy_u:-7,font_reduction_u:1};
  const roundTrip=units.drawingAdjustment(units.legacyAdjustment(adjustment));
  for(const key of ['dx_u','dy_u','font_reduction_u']) assert.ok(Math.abs(roundTrip[key]-adjustment[key])<1e-12);
});
test('all workspaces expose drawing-unit defaults and fixed-width scaling',()=>{
  for(const workspace of contract.workspaces){
    const options=contract.defaults(workspace);
    assert.ok(options.typography.tips.size_u>0);
    assert.equal(options.typography.tips.size_pt,undefined);
    const small=units.printGeometry(180,units.designWidth,3000,300),large=units.printGeometry(360,units.designWidth,3000,300);
    assert.equal(small.drawing_width,1000);
    assert.equal(small.drawing_height,large.drawing_height);
    assert.equal(large.height_mm,small.height_mm*2);
    assert.equal(large.raster_scale,small.raster_scale*2);
  }
});
test('MCP validates relative units and rejects invalid sizes',async()=>{
  const {figureSpecSchema}=await import('../mcp-server/src/schemas.mjs');
  const spec={workspace:'time',main_tree:{content:'(A:1,B:1);'},options:{typography:{tips:{size_u:12}},layout:{node_radius_u:3},time:{hpd_thickness_u:4}}};
  assert.equal(figureSpecSchema.safeParse(spec).success,true);
  for(const size of [-1,NaN,Infinity,'12']) assert.equal(figureSpecSchema.safeParse({...spec,options:{typography:{tips:{size_u:size}}}}).success,false);
  assert.equal(figureSpecSchema.safeParse({...spec,label_adjustments:[{branch_id:'b',dx_u:5,dy_u:-2}]}).success,true);
  assert.equal(figureSpecSchema.safeParse({...spec,label_adjustments:[{branch_id:'b',dx_u:5}]}).success,false);
  assert.equal(figureSpecSchema.safeParse({...spec,options:{cloud:{pie_radius_u:-1}}}).success,false);
  assert.equal(figureSpecSchema.safeParse({...spec,options:{layout:{branch_width_u:100}}}).success,false);
});
