import assert from 'node:assert/strict';import{createRuntime}from'../src/runtime.mjs';
const runtime=await createRuntime();try{
 const page=await runtime.renderer.browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/defaults/cloud-workspace.local.js*',r=>r.fulfill({status:404,body:'Not present in a public clone'}));
 for(const workspace of ['cloud','phylogeny','time']){
  const url=new URL(runtime.demoPageUrl);url.searchParams.set('workspace',workspace);await page.goto(url.href);await page.evaluate(()=>PhyloRenderReady);
  assert.equal(await page.evaluate(()=>state.workspaceMode),workspace);
  if(workspace==='cloud'){assert.equal(await page.locator('.cloud-tip-label').count(),0);assert.match(await page.locator('#tree-svg').textContent(),/Import a species tree and all gene trees/);}
  else assert.ok(await page.locator('.tip-label').count()>20,'public tree examples must still load');
 }
 assert.deepEqual(errors,[]);
 await page.route('**/defaults/ordinary-workspace.js*',r=>r.fulfill({status:404,body:'Required asset unavailable'}));
 await page.goto(runtime.demoPageUrl);await assert.rejects(page.evaluate(()=>PhyloRenderReady),/示例资源加载失败/);
 console.log('OPTIONAL_DEMO_RESOURCE_PASSED: missing private snapshot is optional; required public resources still fail visibly');
}finally{await runtime.close();}
