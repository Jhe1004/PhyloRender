import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const directory=await mkdtemp(path.join(os.tmpdir(),'phylorender-large-stdio-'));
const client=new Client({name:'large-stdio-regression',version:'1'});
const env={...process.env,PHYLORENDER_OUTPUT_ROOT:directory};delete env.PHYLORENDER_APP_URL;delete env.PHYLORENDER_MCP_STDIO_MESSAGE_LIMIT;
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/stdio.mjs',import.meta.url))],env,stderr:'pipe'});
let diagnostic='';transport.stderr?.on('data',chunk=>{diagnostic+=chunk;});
try{
 await client.connect(transport);
 const content='(A_B:1,C_D:1,E_F:1)['+'x'.repeat(10*1024*1024+1024)+'];';
 assert.ok(content.length<12_000_000);
 const result=await client.callTool({name:'inspect_tree',arguments:{main_tree:{name:'large-comment-fixture.nwk',content}}},undefined,{timeout:120_000});
 assert.equal(result.isError,undefined,JSON.stringify(result.structuredContent||result.content));
 assert.deepEqual(result.structuredContent.tip_labels,['A_B','C_D','E_F']);
 assert.equal(result.structuredContent.tips,3);
 console.log(JSON.stringify({passed:true,request_tree_bytes:Buffer.byteLength(content),tips:3,original_labels_preserved:true}));
}finally{await client.close();await rm(directory,{recursive:true,force:true});}
