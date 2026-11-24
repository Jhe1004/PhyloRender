import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const source=fileURLToPath(new URL('../src/stdio.mjs',import.meta.url));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function processRows(){return execFileSync('ps',['-axo','pid=,ppid=,stat='],{encoding:'utf8'}).trim().split('\n').map(line=>{const [pid,parent,state]=line.trim().split(/\s+/);return {pid:+pid,parent:+parent,state};});}
function descendants(pid){const rows=processRows(),owned=new Set([pid]);let changed=true;while(changed){changed=false;for(const row of rows)if(owned.has(row.parent)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}return [...owned].filter(id=>id!==pid);}
const alive=pid=>processRows().some(row=>row.pid===pid&&!row.state.startsWith('Z'));
async function until(predicate,timeoutMs){const stop=Date.now()+timeoutMs;while(!predicate()&&Date.now()<stop)await pause(50);return predicate();}

for(const mode of ['ready','startup','external-service','transport-limit'])await test(`stdio EOF reclaims owned runtime and lease: ${mode}`,async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'phylorender-stdio-eof-'));
 const external=mode==='external-service'?http.createServer((_req,res)=>res.end('shared fixture')):null;
 if(external)await new Promise(resolve=>external.listen(0,'127.0.0.1',resolve));
 const env={...process.env,PHYLORENDER_OUTPUT_ROOT:directory};delete env.PHYLORENDER_APP_URL;
 if(external)env.PHYLORENDER_APP_URL=`http://127.0.0.1:${external.address().port}/`;
 if(mode==='transport-limit')env.PHYLORENDER_MCP_STDIO_MESSAGE_LIMIT='4096';
 const owner=spawn(process.execPath,[source],{env,stdio:['pipe','ignore','pipe']});
 let diagnostic='',owned=[];owner.stderr.on('data',chunk=>{diagnostic+=chunk;});
 try{
  if(mode!=='startup')assert.equal(await until(()=>diagnostic.includes('stdio server ready'),30_000),true,diagnostic);
  owned=descendants(owner.pid);
  if(mode==='transport-limit')owner.stdin.write('x'.repeat(8192));else owner.stdin.end();
  const stopped=await until(()=>owner.exitCode!==null||owner.signalCode!==null,8000);
  if(!stopped)owned=descendants(owner.pid);
  assert.equal(stopped,true,'closing the MCP client pipe must terminate the server without a signal');
  assert.equal(owner.exitCode,0,diagnostic);
  await until(()=>!owned.some(alive),6000);
  assert.deepEqual(owned.filter(alive),[],'private service and browser descendants must stop');
  await assert.rejects(access(path.join(directory,'.writer-lease.json')));
  if(external)assert.equal((await fetch(env.PHYLORENDER_APP_URL)).status,200,'external shared service remains available');
 }finally{
  if(owner.exitCode===null&&owner.signalCode===null){owner.kill('SIGTERM');if(!await until(()=>owner.exitCode!==null||owner.signalCode!==null,5000)){owner.kill('SIGKILL');await once(owner,'exit');}}
  for(const pid of owned)if(alive(pid))try{process.kill(pid,'SIGTERM');}catch{}
  if(external)await new Promise(resolve=>external.close(resolve));
  await rm(directory,{recursive:true,force:true});
 }
});
