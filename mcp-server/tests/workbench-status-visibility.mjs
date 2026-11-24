import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const output=process.argv[2];
if(output)await mkdir(output,{recursive:true});
const tree='(O:70,(A_alpha:30,B_beta:30)90:40);';
const dated='(O:70,(A_alpha:30,B_beta:30)[&height=30]:40)[&height=70];';
const specs=[
  {workspace:'phylogeny',main_tree:{name:'ordinary.nwk',content:tree}},
  {workspace:'time',main_tree:{name:'dated.nwk',content:dated},options:{time:{source_unit:'mya'}}},
  {workspace:'conflict',main_tree:{name:'primary.nwk',content:tree},comparison_tree:{name:'secondary.nwk',content:tree.replace('90','80')}},
  {workspace:'cloud',main_tree:{name:'species.nwk',content:dated},
    phyparts_table:{name:'counts.tsv',content:'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA_alpha;B_beta\n'},
    options:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false}}},
];
const runtime=await createRuntime(),cases=[],errors=[];
try{
  const page=await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
  const configuration=()=>page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  const svg=()=>page.evaluate(async()=>{
    const doc=new DOMParser().parseFromString(await serializeRenderedSvg(),'image/svg+xml');
    doc.querySelectorAll('metadata').forEach(item=>item.remove());
    return new XMLSerializer().serializeToString(doc.documentElement);
  });
  for(const spec of specs){
    await page.evaluate(input=>PhyloRenderAgent.loadFigure(input),spec);await settleFigure(page);
    const before=await configuration(),beforeSvg=await svg();
    assert.equal(await page.locator('.settings-status').isVisible(),false,'tree statistics must not appear in the workbench');
    assert.ok(Number(await page.locator('#tip-count').textContent())>0,'internal tip count remains available');
    // Routine notices remain available to existing state readers, but not on screen.
    await page.evaluate(()=>showMessage('Tree rooted on default outgroup; file imported'));
    assert.equal(await page.locator('#message').isVisible(),false,'routine rooting/success messages must not occupy the workbench');
    const tabs=await page.locator('.settings-nav button:visible').evaluateAll(items=>items.map(item=>item.dataset.settingsTarget));
    let views=0;
    for(const width of [1440,820,390]){
      await page.setViewportSize({width,height:1000});
      for(const tab of tabs){
        await page.locator(`[data-settings-target="${tab}"]`).click();
        assert.equal(await page.locator('.settings-status').isVisible(),false);
        assert.equal(await page.locator('#label-warning-count').isVisible(),false);
        assert.equal(await page.locator('#issue-location-status').isVisible(),false);
        assert.equal(await page.locator('#message').isVisible(),false);
        assert.equal(await page.locator('#settings-page-title').isVisible(),true);
        views++;
      }
    }
    await page.setViewportSize({width:1440,height:1000});
    assert.deepEqual(await configuration(),before,'navigation and suppressed notices preserve the complete configuration');
    assert.equal(await svg(),beforeSvg,'navigation and status cleanup preserve all SVG attributes and geometry');
    await page.locator('[data-settings-target="export"]').click();
    await page.locator('#import-figure-config').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{bad json')});
    await page.waitForFunction(()=>document.getElementById('message').classList.contains('error'));
    assert.equal(await page.locator('#message').isVisible(),true,'actual invalid configuration must still show an error');
    assert.equal(await page.locator('#message').getAttribute('role'),'alert');
    assert.ok((await page.locator('#message').textContent()).trim());
    assert.deepEqual(await configuration(),before,'invalid import preserves the previous configuration');
    if(output)await page.screenshot({path:path.join(output,spec.workspace+'-error.png')});
    await page.locator('#import-figure-config').setInputFiles({name:'retry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(before))});
    await page.waitForFunction(()=>document.getElementById('message').textContent.includes('Figure specification loaded'));
    await settleFigure(page);
    assert.equal(await page.locator('#message').isVisible(),false,'a successful GUI retry removes the old error and suppresses the success notice');
    await page.locator('[data-settings-target="labels"]').click();
    if(output){
      await page.screenshot({path:path.join(output,spec.workspace+'-clean-workbench.png')});
      await writeFile(path.join(output,spec.workspace+'.svg'),await page.evaluate(()=>serializeRenderedSvg()));
    }
    cases.push({workspace:spec.workspace,tab_viewport_checks:views,statistics_hidden:true,routine_notice_hidden:true,error_visible:true,retry_clears_error:true,configuration_and_svg_preserved:true});
  }
  assert.deepEqual(errors,[]);
  if(output)await writeFile(path.join(output,'results.json'),JSON.stringify({passed:true,cases,errors},null,2));
  console.log('PASS workbench statistics and routine notices removed, public errors visible and retries functional in four modes');
}finally{await runtime.close();}
