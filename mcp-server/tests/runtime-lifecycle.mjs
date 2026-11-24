import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import http from 'node:http';
import {createRuntime} from '../src/runtime.mjs';

const children=()=>execFileSync('ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).trim().split('\n')
  .map(row=>row.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
  .filter(([,pid,parent,command])=>+parent===process.pid&&!/(^|\/)ps$/.test(command)).map(([,pid])=>+pid);
const original=process.env.PHYLORENDER_BROWSER_EXECUTABLE,baseline=children();
try{
  process.env.PHYLORENDER_BROWSER_EXECUTABLE='/usr/bin/false';
  await assert.rejects(createRuntime());
  assert.deepEqual(children(),baseline,'failed browser startup must close its own local page service');
}finally{
  if(original===undefined)delete process.env.PHYLORENDER_BROWSER_EXECUTABLE;
  else process.env.PHYLORENDER_BROWSER_EXECUTABLE=original;
}
const runtime=await createRuntime();
assert.equal((await fetch(runtime.pageUrl)).status,200);
await runtime.close();
await assert.rejects(fetch(runtime.pageUrl,{signal:AbortSignal.timeout(1000)}));
assert.equal(runtime.renderer.browser.isConnected(),false);
assert.deepEqual(children(),baseline,'normal runtime shutdown must reap its own page service');
const shared=http.createServer((_request,response)=>response.end('external shared fixture'));
await new Promise(resolve=>shared.listen(0,'127.0.0.1',resolve));
const originalApp=process.env.PHYLORENDER_APP_URL;
try{
  process.env.PHYLORENDER_APP_URL=`http://127.0.0.1:${shared.address().port}/`;
  const external=await createRuntime();await external.close();
  assert.equal(shared.listening,true,'runtime never owns an external APP_URL service');
  assert.equal((await fetch(process.env.PHYLORENDER_APP_URL)).status,200);
  assert.deepEqual(children(),baseline,'external service runtime still reaps its own browser');
}finally{
  if(originalApp===undefined)delete process.env.PHYLORENDER_APP_URL;else process.env.PHYLORENDER_APP_URL=originalApp;
  await new Promise(resolve=>shared.close(resolve));
}
console.log('PASS failed startup and normal shutdown reap private children; external APP_URL service remains available');
