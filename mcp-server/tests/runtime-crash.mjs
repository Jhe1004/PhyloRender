// A killed MCP owner must not leave its private page service or browser alive.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const runtimeUrl = new URL('../src/runtime.mjs',import.meta.url).href;
const env={...process.env}; delete env.PHYLORENDER_APP_URL;
const source=`import {createRuntime} from ${JSON.stringify(runtimeUrl)}; const runtime=await createRuntime(); process.send({url:runtime.pageUrl});`;
const owner=spawn(process.execPath,['--input-type=module','-e',source],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),env,stdio:['ignore','ignore','pipe','ipc'],
});
let diagnostics=''; owner.stderr.on('data',bytes=>{diagnostics+=bytes;});
const rows=()=>execFileSync('ps',['-axo','pid=,ppid=,stat='],{encoding:'utf8'}).trim().split('\n')
  .map(row=>row.trim().split(/\s+/)).map(([pid,parent,state])=>({pid:+pid,parent:+parent,state}));
const alive=pid=>rows().some(row=>row.pid===pid&&!row.state.startsWith('Z'));
let owned=[];
try{
  const url=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Owner startup timed out: '+diagnostics)),30000);
    owner.once('message',value=>{clearTimeout(timer);resolve(value.url);});
    owner.once('exit',code=>{clearTimeout(timer);reject(Error('Owner exited before ready: '+code+' '+diagnostics));});
  });
  assert.equal((await fetch(url)).status,200);
  const processRows=rows(),set=new Set([owner.pid]);let changed=true;
  while(changed){changed=false;for(const row of processRows)if(set.has(row.parent)&&!set.has(row.pid)){set.add(row.pid);changed=true;}}
  owned=[...set].filter(pid=>pid!==owner.pid); assert.ok(owned.length>1);
  const exited=new Promise(resolve=>owner.once('exit',resolve)); owner.kill('SIGKILL');await exited;
  const start=Date.now();while(owned.some(alive)&&Date.now()-start<6000)await new Promise(resolve=>setTimeout(resolve,100));
  assert.deepEqual(owned.filter(alive),[],'SIGKILL of MCP owner must stop its private server/browser descendants');
  await assert.rejects(fetch(url,{signal:AbortSignal.timeout(1000)}));
  console.log('PASS MCP owner SIGKILL closes its private HTTP service and browser; owned children checked at OS level');
}finally{
  if(owner.exitCode===null&&owner.signalCode===null)owner.kill('SIGKILL');
  for(const pid of owned)if(alive(pid))try{process.kill(pid,'SIGTERM');}catch{}
}
