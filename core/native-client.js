/* Shared leased job client for web imports and MCP-driven page imports. */
(function(root){
  'use strict';
  const jobs=new Map();
  const failure=(message,code)=>Object.assign(new Error(message),{code});
  async function read(url,options={},timeoutMs=options.method==='POST'?30000:5000){
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeoutMs)});
    const result=await response.json();
    if(!response.ok)throw failure(result.error||`HTTP ${response.status}`,result.code||'NATIVE_REQUEST_FAILED');
    return result;
  }
  async function cancel(path){
    await read(`${path}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},3000);
    const deadline=Date.now()+8000;
    while(Date.now()<deadline){
      const status=await read(path);
      if(!['running','cancelling'].includes(status.status))return status;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw failure('Cancellation request sent, but background process cleanup is still pending; the job remains bounded by server timeout and disconnect leases.','CLEANUP_PENDING');
  }
  async function run(engine,payload,{signal,onProgress=()=>{},timeoutMs=330000}={}){
    signal?.throwIfAborted();
    const endpoint=engine==='treepl'?'/api/cloud-date/jobs':engine==='names'?'/api/taxon-names/jobs':'/api/cloud-phyparts';
    // Submission is not aborted midway: recover its token, then cancel the
    // accepted job. A lost network response is bounded by the owner lease.
    const submitted=await read(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!/^[A-Za-z0-9_-]{32}$/.test(submitted.job||''))throw failure('Backend did not return a valid job identifier','NATIVE_JOB_INVALID');
    const path=`${engine==='phyparts'?endpoint+'/jobs':endpoint}/${submitted.job}`;
    jobs.set(path,signal);let terminal=false;
    try{
      const deadline=Date.now()+timeoutMs;
      while(Date.now()<deadline){
        signal?.throwIfAborted();
        const job=await read(path);
        signal?.throwIfAborted();
        if(job.status==='complete'){terminal=true;return job.result;}
        if(['failed','cancelled','expired'].includes(job.status)){
          terminal=true;throw failure(job.error||'Background computation did not complete',job.code||'ENGINE_FAILED');
        }
        onProgress(job.message||'Computing...');
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      throw failure('Background computation exceeded the overall time limit; partial results were discarded.','DEADLINE_EXCEEDED');
    }finally{
      try{if(!terminal)await cancel(path);}finally{jobs.delete(path);}
    }
  }
  root.addEventListener('pagehide',()=>{
    for(const path of jobs.keys())fetch(`${path}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});
  });
  root.PhyloRenderNativeClient={run,get activeCount(){return jobs.size;}};
})(globalThis);
