import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createPhyloRenderMcpServer} from '../src/mcp.mjs';

await test('MCP rejects excessive structure before schema validation and remains usable',async()=>{
  let inspected=0;
  const renderer={async inspect(){inspected++;return {tips:3,tip_labels:['A','B','C']};}};
  const server=createPhyloRenderMcpServer({renderer,store:{}});
  const client=new Client({name:'input-bound-test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);await client.connect(a);
    const result=await client.callTool({name:'inspect_tree',arguments:{main_tree:{content:'(A,B,C);'},extra:Array(100_001).fill(null)}});
    assert.equal(result.isError,true);
    assert.match(result.content[0].text,/maximum of 100000 elements/);
    assert.equal(inspected,0);
    const valid=await client.callTool({name:'inspect_tree',arguments:{main_tree:{content:'(A,B,C);'}}});
    assert.equal(valid.isError,undefined);assert.equal(valid.structuredContent.tips,3);assert.equal(inspected,1);
  }finally{await client.close();await server.close();}
});
