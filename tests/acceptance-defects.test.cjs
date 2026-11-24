const test=require('node:test'),assert=require('node:assert/strict');
const contract=require('../figure-contract.js');
const input=require('../core/tree-input.js');
const time=require('../core/time-model.js');
const conflict=require('../conflict-tree.js');

test('F01: manual spacing outside em range exports exact absolute pixels, not a clamp',()=>{
  assert.equal(typeof contract.serializeTipSpacing,'function');
  for(const [spacing,font] of [[18,22],[4.5,30],[72,8],[17.125,30]]){
    const result=contract.serializeTipSpacing({spacingPx:spacing,fontSizePx:font,spacingEm:spacing/font,automatic:false});
    assert.equal(result.tip_spacing,spacing);assert.equal(result.tip_spacing_em,undefined);
    assert.equal(result.automatic_tip_spacing,false);
  }
  assert.deepEqual(contract.serializeTipSpacing({spacingPx:24,fontSizePx:24,spacingEm:1,automatic:false}),
    {tip_spacing_em:1,automatic_tip_spacing:false});
  assert.equal(contract.serializeTipSpacing({spacingPx:24,fontSizePx:24,spacingEm:null,automatic:true}).tip_spacing_em,1);
});

test('F03: automatic group names are English, user labels are not translated',()=>{
  const a=input.parseNewick('(O:1,((A:1,B:1):1,(C:1,D:1):1):1);');
  const b=input.parseNewick('(O:1,((A:1,C:1):1,(B:1,D:1):1):1);');
  const automatic=conflict.buildGroupColors(a,b);
  assert(automatic.groups.length>0);assert(automatic.groups.every(g=>/^Primary-tree clade \d+$/.test(g.name)));
  const explicit=conflict.buildGroupColors(a,b,new Map([['a',{name:'用户分组',color:'#0072b2'}]]));
  assert.equal(explicit.groups[0].name,'用户分组');
});

function dated(comment){return input.parseNewick(`(A:70,B:70)[&${comment}];`);}
test('F04: digit-leading MCMCtree 95%HPD is parsed and used only as an interval',()=>{
  const root=dated('95%HPD={60,80}'),before=JSON.stringify(root);
  const fields=input.numericFieldsFromNode(root);
  assert.equal(fields.get('95pcthpd')?.value,'60–80');
  const p=time.assertValid(time.profile(root));
  assert.equal(p.rootAge,70);assert.equal(p.hpdCount,1);assert.equal(p.maximumAge,80);
  assert.deepEqual(root.timeHpd,[60,80]);assert.equal(root.timeAge,70);
  const original=JSON.parse(before);assert.deepEqual(root.comments,original.comments);
  assert.deepEqual(root.children.map(n=>n.length),original.children.map(n=>n.length));
});
test('F04: BEAST interval aliases preserve values and never repair reversed endpoints',()=>{
  for(const key of ['height_95%_HPD','height_95_HPD','height_HPD','95%HPD','95%_HPD']){
    const root=dated(`${key}={60,80}`);assert.equal(time.assertValid(time.profile(root)).hpdCount,1);
    assert.deepEqual(root.timeHpd,[60,80]);assert.equal(root.timeAge,70);
  }
  for(const value of ['{80,60}','{-1,80}','{NaN,80}','{60}','{60,70,80}']){
    const p=time.profile(dated(`95%HPD=${value}`));assert.equal(p.valid,false,value);
    assert.equal(p.validation_errors[0].code,'TIME_INVALID_HPD');
  }
});
test('F04: conflicting HPD aliases reject ambiguity, agreeing aliases count once',()=>{
  assert.equal(time.profile(dated('height_95%_HPD={60,80},95%HPD={61,80}')).valid,false);
  assert.equal(time.assertValid(time.profile(dated('height_95%_HPD={60,80},95%HPD={60,80}'))).hpdCount,1);
});
test('F04: duplicate raw keys and malformed supplied intervals are not silently dropped',()=>{
  assert.equal(time.profile(dated('95%HPD={60,80},95%HPD={61,80}')).validation_errors[0].code,'TIME_HPD_CONFLICT');
  assert.equal(input.parseAnnotationEntries('&95%HPD={60,80},95%HPD={61,80}').length,2);
  for(const range of [70,[60,70,80],[-1,80],[80,60]]){
    const p=time.profile(dated(''),{getHpd:()=>range});assert.equal(p.valid,false);
    assert.equal(p.validation_errors[0].code,'TIME_INVALID_HPD');
  }
});
