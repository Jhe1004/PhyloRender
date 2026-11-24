/* Stage 82: explicit module boundary; browser and Node share this implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderRenderScheduler=api;})(globalThis,function(){
"use strict";
function finishRenderSteps(steps) {
  let next;
  do { next = steps.next(); } while (!next.done);
  return next.value;
}

function* mapRenderSteps(values, transform) {
  const results = [];
  for (const value of values) { yield; results.push(transform(value)); }
  return results;
}

async function run(steps, {signal, onProgress=()=>{}, now=()=>performance.now(), pause=()=>new Promise(resolve=>setTimeout(resolve,8)), budget=24}={}) {
  let lastYield = now();
  let progress = {phase:"labels", current:0, total:0};
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = steps.next();
      if (next.done) return next.value;
      signal?.throwIfAborted();
      if (next.value) progress = next.value;
      if (now() - lastYield >= budget) {
        onProgress(progress);
        await pause();
        lastYield = now();
      }
    }
  } finally {
    steps.return();
  }
}

return Object.freeze({finishRenderSteps,mapRenderSteps,run});
});
