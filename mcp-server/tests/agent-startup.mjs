import assert from 'node:assert/strict';
import {createRuntime} from '../src/runtime.mjs';

const runtime=await createRuntime();
try {
  const page=await runtime.renderer.browser.newPage();
  await page.goto(runtime.renderer.agentPageUrl);
  await page.waitForFunction(()=>window.PhyloRenderAgent?.version,{},{timeout:15000});
  const startup=await page.evaluate(async()=>{
    await window.PhyloRenderReady;
    return {rootLoaded:!!state.root,tips:$('tip-count').textContent,minimum:Number($('support-min-size-number').value)};
  });
  assert.equal(startup.rootLoaded,false);
  assert.equal(startup.tips,'0');
  assert.equal(startup.minimum,7);
  await page.close();
  const start=Date.now();
  const report=await runtime.renderer.inspect({name:'startup-check.tree',content:'((A:1,B:1)95:1,C:3);'});
  assert.equal(report.tips,3);
  assert.ok(Date.now()-start<30000,'inspection must not render the default example');
  console.log(JSON.stringify({agentStartup:true,inspectionMilliseconds:Date.now()-start,...startup}));
} finally {await runtime.close();}
