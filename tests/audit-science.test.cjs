const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../core/tree-input.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),cloud=require('../cloud-tree.js');
const ctx=vm.createContext({});
vm.runInContext(src.slice(src.indexOf('function extractLeadingRootingDirective('),src.indexOf('const NUMERIC_TOKEN_SOURCE')),ctx);
test('F01: malformed closers fail promptly, never spin',()=>{
 for(const input of ['(A:1,B:1)];',']','(A:1,B:1);]']){
 ctx.input=input;assert.throws(()=>vm.runInContext('parseNewick(input)',ctx,{timeout:100}),err=>err.code!=='ERR_SCRIPT_EXECUTION_TIMEOUT');}
});
test('F01: deterministic malformed-token mutations all terminate within a bounded VM budget',()=>{
 const seed='((A:1,B:1):1,C:2);',symbols=[']','[',"'",'"','(',')',',',';',':'];
 for(let i=0;i<=seed.length;i++)for(const symbol of symbols){
   ctx.input=seed.slice(0,i)+symbol+seed.slice(i);
   try{vm.runInContext('parseNewick(input)',ctx,{timeout:100});}
   catch(error){assert.notEqual(error.code,'ERR_SCRIPT_EXECUTION_TIMEOUT',ctx.input);}
 }
});
test('F09: normalization and outgroup-prefix matching cannot merge two sample identities',()=>{
 const c=require('../core/sample-identity.js');
 const tree=labels=>({children:labels.map(label=>({label,children:[]}))});
 assert.throws(()=>c.buildTipKeyAlignment(tree(['A_B','A B']),tree(['A_B','C'])),/collide|duplicate/i);
 assert.throws(()=>c.buildTipKeyAlignment(tree(['A','Out_A']),tree(['A','B'])),{code:'TIP_MAPPING_AMBIGUOUS'});
 const accepted=c.buildTipKeyAlignment(tree(['Out_A','B']),tree(['A','B']));
 assert.equal(accepted.keyMap.get('out_a'),'a');
});
test('F03/F09: reject ambiguous multi-tree Nexus and incomplete Translate',()=>{
 assert.throws(()=>ctx.parseNewick('#NEXUS\nbegin trees;tree STATE_0=(A:1,B:1);tree STATE_1=(A:2,B:2);end;'),/多棵|多树|multiple/i);
 assert.throws(()=>ctx.parseNewick('#NEXUS\nbegin trees;translate 1 A,2 B;tree t=((1:1,2:1):1,3:2);end;'),/translate|映射/i);
 assert.throws(()=>ctx.parseNewick('#NEXUS\nbegin trees;translate 1 A,1 B;tree t=(1:1,2:1);end;'),/重复|duplicate/i);
});
test('F05: missing internal ML length cannot be serialized as zero',()=>{
 const t=ctx.parseNewick('((A:1,B:1),C:2);');
 assert.throws(()=>cloud.validateMlInput(t,{method:'ml'}),/branch length/i);
 assert.throws(()=>cloud.treePLInput(t),/branch length/i);
 assert.throws(()=>ctx.parseNewick('((A:2,B:2):-1,C:1);'),/负|negative/i);
});
test('F06: auto support scale must not coerce a mixed batch',()=>{
 const p=ctx.parseNewick('(O:1,(A:1,B:1)0.95:1);'),q=ctx.parseNewick('(O:1,(A:1,B:1)95:1);');
 assert.throws(()=>cloud.phyPartsSupportScale([p,q]),/混合|mixed/i);
 assert.throws(()=>cloud.phyPartsSupportScale([p]),{code:'SUPPORT_SCALE_AMBIGUOUS'});
 assert.equal(cloud.phyPartsInput(p,['O','A','B'],{scale:'probability'}),cloud.phyPartsInput(q,['O','A','B'],{scale:cloud.phyPartsSupportScale([q])}));
});
test('F07: rounded full-support drawing preserves raw low-support thresholds',()=>{
 const c=vm.createContext({$:()=>({value:'1'}),supportValues:require('../core/support-values.js').create(require('../core/support-scale.js'))});
 vm.runInContext(src.slice(src.indexOf('function isBelowSupportThreshold('),src.indexOf('function normalizeTipKey(')),c);
 assert.equal(c.isFullSupport('0.96',['probability']),true);
 assert.equal(c.isBelowSupportThreshold('0.49',50,['probability']),true);
 assert.equal(c.formatSupportValue('0.49',50,['probability']),'–');
});
test('F08: contradictory, blank, fractional and inconsistent totals are rejected',()=>{
 const h='Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tconflict_total_N\tno_signal_N\tdescendant_samples\n';
 for(const r of ['N1\t5\t2\t3\t999\t0\tA;B','N1\t\t2\t3\t5\t0\tA;B','N1\t5.5\t2\t3\t5\t0\tA;B','N1\t5\t2\t3\t5\t0\tA;B\nN2\t6\t2\t3\t5\t0\tC;D'])
 assert.throws(()=>cloud.parsePhyPartsTable(h+r+'\n'));
});
