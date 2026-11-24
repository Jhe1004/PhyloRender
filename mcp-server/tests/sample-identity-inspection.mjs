import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createRuntime} from '../src/runtime.mjs';
import {createPhyloRenderMcpServer} from '../src/mcp.mjs';
import {FigureStore} from '../src/store.mjs';

await test('tree inspection and conflict preflight preserve identities and share matching policy', async t => {
  const runtime=await createRuntime();
  const directory=await mkdtemp(path.join(os.tmpdir(),'phylorender-inspection-'));
  const store=await new FigureStore(runtime.renderer,directory).initialize();
  const server=createPhyloRenderMcpServer({renderer:runtime.renderer,store});
  const client=new Client({name:'identity-regression',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b); await client.connect(a);
    const tree=content=>({content});
    const compare=(left,right)=>client.callTool({name:'compare_tree_samples',arguments:{main_tree:tree(left),comparison_tree:tree(right)}});
    await t.test('inspect_tree returns literal parsed labels including underscores and quoted apostrophes',async()=>{
      const result=await client.callTool({name:'inspect_tree',arguments:{main_tree:tree("(Out_group:1,Sample_A:1,'O''Brien b':1);")}});
      assert.equal(result.isError,undefined);
      assert.deepEqual(result.structuredContent.tip_labels,['Out_group','Sample_A',"O'Brien b"]);
    });
    await t.test('preflight accepts the same unambiguous space/case variants as the real conflict renderer',async()=>{
      const main='(Out_group:1,Sample_A:1,Third:1);';
      const other="('out group':1,'sample a':1,third:1);";
      const result=await compare(main,other);
      assert.equal(result.isError,undefined);
      assert.equal(result.structuredContent.status,'identical');
      assert.equal(result.structuredContent.requires_source_correction,false);
      const rendered=await runtime.renderer.render({workspace:'conflict',main_tree:tree(main),comparison_tree:tree(other)},{formats:['svg']});
      assert.equal(rendered.report.conflict.sample_comparison.sharedCount,3);
    });
    await t.test('preflight rejects normalization collisions even when raw sets are equal',async()=>{
      const result=await compare("(A_B:1,'A B':1,C:1);","(A_B:1,'A B':1,C:1);");
      assert.equal(result.isError,true);
      assert.equal(result.structuredContent.error.code,'TIP_MAPPING_AMBIGUOUS');
    });
    await t.test('difference lists retain original labels and do not guess punctuation aliases',async()=>{
      const result=await compare('(Out_group:1,A.B:1,Shared:1);','(Out_group:1,A_B:1,Shared:1);');
      assert.deepEqual(result.structuredContent.primary_only,['A.B']);
      assert.deepEqual(result.structuredContent.comparison_only,['A_B']);
      assert.equal(result.structuredContent.requires_source_correction,true);
    });
  } finally {await client.close();await server.close();await runtime.close();await rm(directory,{recursive:true,force:true});}
});
