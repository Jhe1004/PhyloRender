import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FigureJobs } from "../src/jobs.mjs";
import { FigureStore } from "../src/store.mjs";
import { PhyloRenderRenderer } from "../src/runtime.mjs";
import { EventEmitter } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPhyloRenderMcpServer } from "../src/mcp.mjs";
import { acquireWriterLease } from "../src/writer-lease.mjs";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function terminal(jobs, id) {
  for (let i=0;i<100;i++) { const job=await jobs.get(id); if (["succeeded","failed","cancelled"].includes(job.status)) return job; await pause(5); }
  throw new Error("job never reached terminal state");
}
test("background jobs: idempotency, capacity, cancel, persistent results and interruption recovery", async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),"phylorender-jobs-"));
  try {
    const jobs=new FigureJobs(directory,{limit:1}); let runs=0;
    const execute=signal=>new Promise((resolve,reject)=>{
      runs++; signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
    });
    const job=await jobs.start({main:"x"},"same",execute);
    assert.equal((await jobs.start({main:"x"},"same",execute)).job_id,job.job_id);
    await assert.rejects(jobs.start({main:"y"},"same",execute),{code:"IDEMPOTENCY_CONFLICT"});
    await assert.rejects(jobs.start({main:"y"},"next",execute),{code:"SERVICE_BUSY"});
    await pause(20); assert.equal(runs,1);
    await jobs.cancel(job.job_id);
    assert.equal((await terminal(jobs,job.job_id)).status,"cancelled");
    const done=await jobs.start({main:"y"},"next",async()=>({figureId:"fixture",revision:1}));
    assert.equal((await terminal(jobs,done.job_id)).status,"succeeded");
    await pause(20);
    const restored=new FigureJobs(directory);
    assert.equal((await restored.get(done.job_id)).result.figure_id,"fixture");
    const id="11111111-1111-4111-8111-111111111111";
    await writeFile(path.join(directory,id+".json"),JSON.stringify({job_id:id,status:"running",created_at:1}));
    const restarted=new FigureJobs(directory);
    assert.equal((await restarted.get(id)).error.code,"PROCESS_INTERRUPTED");
  } finally {await rm(directory,{recursive:true,force:true});}
});
test("F19: delete and update serialize without resurrecting an empty figure",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"phylorender-race-"));
  let block=null;
  const renderer={async render(spec){if(block)await block;return {normalizedSpec:spec,report:{},svg:"<svg/>",png:Buffer.from("png"),preview:Buffer.from("png"),pngScale:1};}};
  try {
    const store=await new FigureStore(renderer,directory).initialize();
    const figure=await store.create({main_tree:{content:"(A:1,B:1);"}});
    let finish; block=new Promise(resolve=>{finish=resolve;});
    const update=store.update(figure.figureId,{options:{typography:{tips:{size_pt:19}}}},{expectedRevision:1});
    const deletion=store.delete(figure.figureId); await pause(10); finish();
    await update;await deletion;
    assert.equal(await store.exists(figure.figureId),false);
    assert.ok(!(await readdir(directory)).includes(figure.figureId));
  } finally{await rm(directory,{recursive:true,force:true});}
});
test("renderer rejects excess queued work and recovers after an aborted item",async()=>{
  const renderer=new PhyloRenderRenderer("http://127.0.0.1:1",{});
  let finish;const hold=new Promise(resolve=>{finish=resolve;});
  const accepted=Array.from({length:8},()=>renderer.serial(()=>hold));
  await assert.rejects(renderer.serial(()=>1),{code:"SERVICE_BUSY"});
  finish();await Promise.all(accepted);
  const controller=new AbortController();controller.abort(new Error("stop"));
  await assert.rejects(renderer.serial(()=>assert.fail(),{signal:controller.signal}),/stop/);
  assert.equal(await renderer.serial(()=>42),42);
});
for (const endpoint of ["/api/cloud-phyparts", "/api/cloud-date/jobs", "/api/taxon-names/jobs"]) {
test(`total deadline cleans ${endpoint} and releases the queue`,async(t)=>{
  const requests=[];
  t.mock.method(globalThis,"fetch",async(url,options)=>{requests.push({url:String(url),method:options.method});return {json:async()=>({status:"cancelled"})};});
  const page=new EventEmitter();let closed=false;
  Object.assign(page,{isClosed:()=>closed,setDefaultTimeout(){},async goto(){},async waitForFunction(){},
    async close(){closed=true;},evaluate(){
      page.emit("response",{request:()=>({method:()=>"POST"}),url:()=>`http://127.0.0.1${endpoint}`,
        json:async()=>({job:"fixture-token"})});
      return new Promise(()=>{});
    }});
  const renderer=new PhyloRenderRenderer("http://127.0.0.1/",{newPage:async()=>page});
  await assert.rejects(renderer.render({}, {timeoutMs:40}),{code:"DEADLINE_EXCEEDED"});
  assert.equal(closed,true);assert.equal(renderer.workerPage,null);
  assert.equal(renderer.pending,0);assert.equal(await renderer.serial(()=>42),42);
  const jobPath=`http://127.0.0.1${endpoint}${endpoint.endsWith('/jobs')?'':'/jobs'}/fixture-token`;
  assert.deepEqual(requests,[{url:`${jobPath}/cancel`,method:"POST"},
    {url:jobPath,method:undefined}]);
});
}
test("unconfirmed native cleanup is explicit and is never reported as cancelled completion",async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('disconnected');});
  const page=new EventEmitter();let closed=false;
  Object.assign(page,{isClosed:()=>closed,setDefaultTimeout(){},async goto(){},async waitForFunction(){},
    async close(){closed=true;},evaluate(){
      page.emit('response',{request:()=>({method:()=>"POST"}),url:()=>"http://127.0.0.1/api/cloud-date/jobs",json:async()=>({job:'owned-token'})});
      return new Promise(()=>{});
    }});
  const renderer=new PhyloRenderRenderer('http://127.0.0.1/',{newPage:async()=>page});
  await assert.rejects(renderer.render({}, {timeoutMs:20}),{code:'CLEANUP_PENDING',cleanup_pending:true,trigger_code:'DEADLINE_EXCEEDED'});
  const directory=await mkdtemp(path.join(os.tmpdir(),'phylorender-pending-'));
  try{
    const jobs=new FigureJobs(directory);let signal;
    const job=await jobs.start({},'pending',async ownSignal=>{
      signal=ownSignal;await new Promise(resolve=>ownSignal.addEventListener('abort',resolve,{once:true}));
      throw Object.assign(new Error('cleanup pending'),{code:'CLEANUP_PENDING',cleanup_pending:true,trigger_code:'CANCELLED'});
    });
    for(let i=0;i<50&&!signal;i++)await pause(5);
    await jobs.cancel(job.job_id);const stopped=await terminal(jobs,job.job_id);
    assert.equal(stopped.status,'failed');assert.equal(stopped.error.cleanup_pending,true);assert.equal(stopped.error.trigger_code,'CANCELLED');
    let journal;
    for(let i=0;i<50;i++){
      journal=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(directory,job.job_id+'.json'),'utf8'));
      if(journal.status==='failed')break;
      await pause(5);
    }
    assert.equal(journal.error.cleanup_pending,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test("MCP protocol exposes idempotent jobs, structured conflicts and mandatory revisions",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"phylorender-protocol-"));
  let calls=0;
  const renderer={async render(spec){calls++;await pause(10);return {normalizedSpec:spec,report:{},svg:"<svg/>",png:Buffer.from("png"),preview:Buffer.from("png"),pngScale:1};}};
  const store=await new FigureStore(renderer,directory).initialize();
  const server=createPhyloRenderMcpServer({renderer,store});
  const client=new Client({name:"audit-protocol",version:"1"});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);await client.connect(clientTransport);
    const args={figure_spec:{main_tree:{content:"(A:1,B:1);"}},idempotency_key:"protocol"};
    const first=await client.callTool({name:"start_figure_job",arguments:args});
    const second=await client.callTool({name:"start_figure_job",arguments:args});
    assert.equal(first.isError,undefined);assert.equal(first.structuredContent.job_id,second.structuredContent.job_id);
    const conflict=await client.callTool({name:"start_figure_job",arguments:{...args,figure_spec:{main_tree:{content:"(A:2,B:2);"}}}});
    assert.equal(conflict.isError,true);assert.equal(conflict.structuredContent.error.code,"IDEMPOTENCY_CONFLICT");
    assert.equal(conflict.structuredContent.error.retryable,false);
    const job=await terminal(store.jobs,first.structuredContent.job_id);
    const polled=await client.callTool({name:"get_figure_job",arguments:{job_id:job.job_id}});
    assert.equal(polled.structuredContent.status,"succeeded");assert.equal(calls,1);
    const stale=await client.callTool({name:"update_figure",arguments:{figure_id:job.result.figure_id,base_revision:9,patch:{}}});
    assert.equal(stale.structuredContent.error.code,"REVISION_CONFLICT");
    assert.equal(stale.structuredContent.error.current_revision,1);
    const tools=await client.listTools();
    assert.ok(tools.tools.find(x=>x.name==="update_figure").inputSchema.required.includes("base_revision"));
  } finally {await client.close();await server.close();await rm(directory,{recursive:true,force:true});}
});
test("a page created after cancellation is closed and cannot replace the next worker",async()=>{
  let release,closed=false;
  const browser={newPage:()=>new Promise(resolve=>{release=resolve;})};
  const renderer=new PhyloRenderRenderer("http://127.0.0.1/",browser);
  await assert.rejects(renderer.render({}, {timeoutMs:20}),{code:"DEADLINE_EXCEEDED"});
  const next={close:async()=>assert.fail("late page must not close another worker")};
  renderer.workerPage=next;
  release({close:async()=>{closed=true;}});await pause(10);
  assert.equal(closed,true);assert.equal(renderer.workerPage,next);
});
test("service output directory admits a single writer and releases its own lease",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"phylorender-lease-"));
  try {
    const release=await acquireWriterLease(directory);
    await assert.rejects(acquireWriterLease(directory),{code:"OUTPUT_DIRECTORY_LOCKED"});
    await release();await release();
    const next=await acquireWriterLease(directory);await next();
  } finally {await rm(directory,{recursive:true,force:true});}
});
