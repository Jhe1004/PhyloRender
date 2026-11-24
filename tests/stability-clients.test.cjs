const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=name=>fs.readFileSync(path.join(__dirname,'../core',name),'utf8');
test('cancel during submission recovers the token and waits for terminal native cleanup',async()=>{
 const controller=new AbortController(),requests=[];let cancelled=false;
 const ctx=vm.createContext({AbortSignal,Promise,Date,setTimeout,clearTimeout,addEventListener(){},
  fetch:async(url,options)=>{
   requests.push(String(url));
   if(String(url)==='/api/cloud-date/jobs'){
    controller.abort(Object.assign(new Error('user cancel'),{code:'CANCELLED'}));
    return {ok:true,json:async()=>({job:'X'.repeat(32)})};
   }
   if(String(url).endsWith('/cancel')){cancelled=true;return {ok:true,json:async()=>({status:'cancelling'})};}
   return {ok:true,json:async()=>({status:cancelled?'cancelled':'running'})};
  }});
 vm.runInContext(code('native-client.js'),ctx);
 await assert.rejects(ctx.PhyloRenderNativeClient.run('treepl',{}, {signal:controller.signal}),{code:'CANCELLED'});
 assert.equal(requests.length,3);assert.ok(requests[1].endsWith('/cancel'));assert.equal(ctx.PhyloRenderNativeClient.activeCount,0);
});
test('Worker cancellation and timeout terminate the actual owned Worker, late messages cannot win',async()=>{
 const workers=[];
 class Worker{constructor(){workers.push(this);this.terminated=false;}postMessage(data){this.data=data;}terminate(){this.terminated=true;}}
 const ctx=vm.createContext({URL,Worker,Promise,setTimeout,clearTimeout,addEventListener(){},document:{currentScript:{src:'http://localhost:8765/core/input-tasks.js'}}});
 vm.runInContext(code('input-tasks.js'),ctx);
 const controller=new AbortController();
 const promise=ctx.PhyloRenderInputTasks.run('genes',{}, {signal:controller.signal});
 controller.abort(Object.assign(new Error('stop'),{code:'CANCELLED'}));
 await assert.rejects(promise,{code:'CANCELLED'});
 assert.equal(workers[0].terminated,true);
 workers[0].onmessage({data:{id:workers[0].data.id,result:'stale'}});
 await assert.rejects(ctx.PhyloRenderInputTasks.run('genes',{}, {timeoutMs:5}),{code:'DEADLINE_EXCEEDED'});
 assert.equal(workers[1].terminated,true);assert.equal(ctx.PhyloRenderInputTasks.activeCount,0);
});
test('asynchronous file Worker admission failure only permits bounded single-tree fallback',async()=>{
 const workers=[];let parsed=0;
 class Worker{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}}
 const ctx=vm.createContext({URL,Worker,Promise,setTimeout,clearTimeout,location:{protocol:'file:'},addEventListener(){},
  document:{currentScript:{src:'file:///project/core/input-tasks.js'}},
  PhyloRenderInput:{parseNewick(){parsed++;return 'small-tree';}},PhyloRenderGenePreparation:{assertRenderable:x=>x}});
 vm.runInContext(code('input-tasks.js'),ctx);
 const small=ctx.PhyloRenderInputTasks.run('parse',{text:'(A,B);'});workers[0].onerror();
 assert.equal(await small,'small-tree');assert.equal(parsed,1);assert.equal(workers[0].terminated,true);
 const batch=ctx.PhyloRenderInputTasks.run('genes',{text:'(A,B);'});workers[1].onerror();
 await assert.rejects(batch,{code:'WORKER_FAILED'});assert.equal(parsed,1);assert.equal(ctx.PhyloRenderInputTasks.activeCount,0);
});
test('native client deadline cancels and confirms its job rather than committing a late result',async()=>{
 let cancelled=false;const requests=[];
 const ctx=vm.createContext({AbortSignal,Promise,Date,setTimeout,clearTimeout,addEventListener(){},fetch:async(url)=>{
  requests.push(String(url));
  const result=String(url)==='/api/taxon-names/jobs'?{job:'Y'.repeat(32)}:
    String(url).endsWith('/cancel')?(cancelled=true,{status:'cancelling'}):{status:cancelled?'cancelled':'running'};
  return {ok:true,json:async()=>result};
 }});
 vm.runInContext(code('native-client.js'),ctx);
 await assert.rejects(ctx.PhyloRenderNativeClient.run('names',{}, {timeoutMs:0}),{code:'DEADLINE_EXCEEDED'});
 assert.equal(requests.length,3);assert.ok(cancelled);assert.equal(ctx.PhyloRenderNativeClient.activeCount,0);
});
test('synchronous Worker constructor failure cannot fall back on HTTP or for a batch',async()=>{
 let parsed=0;
 class Worker{constructor(){throw Error('admission failed');}}
 const ctx=vm.createContext({URL,Worker,Promise,setTimeout,clearTimeout,location:{protocol:'http:'},addEventListener(){},
  document:{currentScript:{src:'http://localhost/core/input-tasks.js'}},
  PhyloRenderInput:{parseNewick(){parsed++;return 'small';}},PhyloRenderGenePreparation:{assertRenderable:x=>x}});
 vm.runInContext(code('input-tasks.js'),ctx);
 await assert.rejects(ctx.PhyloRenderInputTasks.run('parse',{text:'(A,B);'}),{code:'WORKER_UNAVAILABLE'});
 assert.equal(parsed,0);
 ctx.location.protocol='file:';
 assert.equal(await ctx.PhyloRenderInputTasks.run('parse',{text:'(A,B);'}),'small');
 await assert.rejects(ctx.PhyloRenderInputTasks.run('genes',{text:'(A,B);'}),{code:'WORKER_UNAVAILABLE'});
 assert.equal(parsed,1);assert.equal(ctx.PhyloRenderInputTasks.activeCount,0);
});
test('a progress callback failure immediately closes the Worker rather than leaving it to timeout',async()=>{
 let worker;
 class Worker{constructor(){worker=this;}postMessage(data){this.id=data.id;}terminate(){this.terminated=true;}}
 const ctx=vm.createContext({URL,Worker,Promise,setTimeout,clearTimeout,addEventListener(){},document:{currentScript:{src:'http://localhost/core/input-tasks.js'}}});
 vm.runInContext(code('input-tasks.js'),ctx);
 const result=ctx.PhyloRenderInputTasks.run('genes',{}, {onProgress(){throw Error('progress failed');}});
 const rejected=assert.rejects(result,/progress failed/);
 assert.doesNotThrow(()=>worker.onmessage({data:{id:worker.id,progress:{current:1}}}));
 await rejected;assert.equal(worker.terminated,true);assert.equal(ctx.PhyloRenderInputTasks.activeCount,0);
});
test('oversize files are refused before allocating their text buffer',async()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const start=app.indexOf('async function readTreeFile('),end=app.indexOf('\nfunction normalizeAnnotationKey',start);
 const ctx=vm.createContext({checkScienceCancellation(){}});vm.runInContext(app.slice(start,end),ctx);
 let read=0;const file={size:12000001,text:async()=>{read++;return 'unused';}};
 await assert.rejects(ctx.readTreeFile(file),{code:'TREE_INPUT_LIMIT'});assert.equal(read,0);
 await assert.rejects(ctx.readTreeFile({...file,size:120000001},true),{code:'TREE_INPUT_LIMIT'});assert.equal(read,0);
});
