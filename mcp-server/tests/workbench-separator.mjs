import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';

const output=process.argv[2];
if(output)await mkdir(output,{recursive:true});
const runtime=await createRuntime(),cases=[],errors=[];
try {
  const page=await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>PhyloRenderAgent.ready());
  for(const mode of ['phylogeny','time','cloud','conflict']) {
    await page.locator(`[data-workspace-mode="${mode}"]`).click();
    const tabs=await page.locator('.settings-nav button:visible').evaluateAll(items=>items.map(item=>item.dataset.settingsTarget));
    for(const width of [1440,820,390]) {
      await page.setViewportSize({width,height:1000});
      for(const tab of tabs) {
        await page.locator(`[data-settings-target="${tab}"]`).click();
        const style=await page.evaluate(()=>{
          const shell=getComputedStyle(document.querySelector('.settings-nav-shell'));
          const nav=getComputedStyle(document.querySelector('.settings-nav'));
          const active=getComputedStyle(document.querySelector('.settings-nav button.active'));
          return {shell:{width:shell.borderBottomWidth,style:shell.borderBottomStyle,color:shell.borderBottomColor},nav:{width:nav.borderBottomWidth},active:{width:active.borderBottomWidth,style:active.borderBottomStyle}};
        });
        assert.equal(style.nav.width,'0px','no second full-width separator inside the tab grid');
        assert.equal(style.shell.width,'2px','one heavier workbench separator');
        assert.equal(style.shell.style,'solid');
        assert.equal(style.shell.color,'rgb(139, 141, 146)');
        assert.ok(parseFloat(style.active.width)>0,'selected-tab underline remains visible');
        assert.equal(style.active.style,'solid');
        cases.push({mode,width,tab,...style});
      }
      if(output)await page.screenshot({path:path.join(output,`${mode}-${width}.png`)});
    }
  }
  assert.deepEqual(errors,[]);
  if(output)await writeFile(path.join(output,'results.json'),JSON.stringify({passed:true,cases,errors},null,2));
  console.log(`PASS one solid separator and preserved active-tab indicator: ${cases.length} mode/tab/viewport checks`);
} finally {await runtime.close();}
