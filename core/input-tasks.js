/* One isolated Worker per input transaction. No stale result can mutate state. */
(function(root){
  'use strict';
  const url=new URL('input-worker.js',document.currentScript.src),active=new Set();let sequence=0;
  function run(operation,payload,{signal,timeoutMs=120000,onProgress=()=>{}}={}){
    return new Promise((resolve,reject)=>{
      if(signal?.aborted){reject(signal.reason);return;}
      let worker;
      try{worker=new Worker(url);}catch(error){
        // Local file browsers may disallow workers. Small trees remain usable;
        // never silently run a large batch on the UI thread.
        if(location.protocol==='file:'&&operation==='parse'&&payload.text.length<=200000){
          try{resolve(PhyloRenderGenePreparation.assertRenderable(PhyloRenderInput.parseNewick(payload.text,payload.options)));}catch(e){reject(e);}return;
        }
        reject(Object.assign(new Error('Unable to launch background parser Worker; please open PhyloRender via the local server rather than opening index.html directly.'),{code:'WORKER_UNAVAILABLE'}));return;
      }
      const id=++sequence;active.add(worker);let finished=false;
      const done=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();active.delete(worker);error?reject(error):resolve(result);};
      const abort=()=>done(signal.reason||Object.assign(new Error('Computation cancelled'),{code:'CANCELLED'}));
      const timer=setTimeout(()=>done(Object.assign(new Error(`Background task exceeded ${Math.round(timeoutMs/1000)} s; Worker terminated and partial results discarded.`),{code:'DEADLINE_EXCEEDED'})),timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});
      worker.onerror=()=>{
        // Some file:// browsers report Worker admission failure asynchronously.
        // Only a bounded single-tree parse may use the main-thread fallback.
        if(location.protocol==='file:'&&operation==='parse'&&payload.text.length<=200000){
          try{done(null,PhyloRenderGenePreparation.assertRenderable(PhyloRenderInput.parseNewick(payload.text,payload.options)));}
          catch(error){done(error);}
        }else done(Object.assign(new Error('Background Worker failed; task terminated without applying partial results. Please launch via the local server and check your input.'),{code:'WORKER_FAILED'}));
      };
      worker.onmessage=({data})=>{if(data.id!==id||finished)return;try{if(data.progress)onProgress(data.progress);else done(data.error?Object.assign(new Error(data.error.message),data.error):null,data.result);}catch(error){done(error);}};
      try{worker.postMessage({id,operation,payload});}catch(error){done(error);}
    });
  }
  root.addEventListener('pagehide',()=>{for(const worker of active)worker.terminate();active.clear();});
  root.PhyloRenderInputTasks={run,get activeCount(){return active.size;}};
})(globalThis);
