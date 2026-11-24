const test=require('node:test'),assert=require('node:assert/strict');
const input=require('../core/tree-input.js');
const tips=root=>root.children.length?root.children.flatMap(tips):[root.label];
test('E01: ambiguous unquoted multiword tips reject, never silently replace identity',()=>{
  for(const raw of ['(Homo sapiens:1,Pan troglodytes:1);','(Homo[comment]sapiens:1,B:1);',"('Homo sapiens' extra:1,B:1);"])
    assert.throws(()=>input.parseNewick(raw),e=>e.code==='TREE_AMBIGUOUS_LABEL'&&/quot/i.test(e.message));
});
test('E01: quoted names and internal labels remain exact',()=>{
  assert.deepEqual(tips(input.parseNewick("('Homo sapiens':1,'Pan troglodytes':1)99;")),['Homo sapiens','Pan troglodytes']);
  assert.deepEqual(tips(input.parseNewick("('O''Brien; A':1,B:1)95[&height=1];")),["O'Brien; A",'B']);
});
test('E02: nested comments never supply a translate mapping',()=>{
  const raw='#NEXUS\n[translate 1 Wrong_A,2 Wrong_B; [tree fake=(3,4);]]\nbegin trees; translate 1 Correct_A,2 Correct_B;tree t=(1:1,2:1);end;';
  assert.deepEqual(tips(input.parseNewick(raw)),['Correct_A','Correct_B']);
});
test('E02: translate belongs to selected TREES block, not another block or quote',()=>{
  const raw="#NEXUS\nbegin taxa; title 'translate 1 Wrong_A,2 Wrong_B;';end;begin trees;translate 1 First_A,2 First_B;tree t=(1:1,2:1);end;begin trees;translate 1 'Second; A',2 'Second, B';tree u=(1:2,2:2);end;";
  assert.throws(()=>input.parseNewick(raw),e=>e.code==='TREE_MULTIPLE_TREES');
  assert.deepEqual(tips(input.parseNewick(raw,{treeIndex:1})),['Second; A','Second, B']);
  assert.deepEqual(tips(input.parseNewick(raw,{treeIndex:0})),['First_A','First_B']);
});
test('E02: malformed or duplicate translate blocks and incomplete entries reject',()=>{
  for(const table of ['translate 1 A,2 B;translate 1 C,2 D;','translate 1 A,1 B;','translate 1 A;','translate 1 A B,2 C;'])
    assert.throws(()=>input.parseNewick(`#NEXUS\nbegin trees;${table}tree t=(1:1,2:1);end;`),e=>/^TREE_TRANSLATE_/.test(e.code));
});
test('E02: unclosed comment, quote and TREES block reject explicitly',()=>{
  for(const raw of ["#NEXUS\nbegin trees;[comment tree t=(1,2);end;","#NEXUS\nbegin trees;translate 1 'broken,2 B;tree t=(1,2);end;",'#NEXUS\nbegin trees;tree t=(A:1,B:1);'])
    assert.throws(()=>input.parseNewick(raw),e=>e.code==='TREE_NEXUS_INVALID');
});
