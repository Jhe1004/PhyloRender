import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const evidence = process.argv[2];
if (evidence) await mkdir(evidence, {recursive:true});
const tree = '(O:3,((A_alpha:1,B_beta:1)90:1,(C_gamma:1,D_delta:1)80:1)85:1);';
const dated = '(O:3,((A_alpha:1,B_beta:1)[&height=1]:1,(C_gamma:1,D_delta:1)[&height=1]:1)[&height=2]:1)[&height=3];';
const specs = [
  {workspace:'phylogeny', main_tree:{name:'ordinary.nwk',content:tree}},
  {workspace:'time', main_tree:{name:'dated.nwk',content:dated},options:{time:{source_unit:'mya'}}},
  {workspace:'cloud', main_tree:{name:'dated.nwk',content:dated},
    phyparts_table:{name:'counts.tsv',content:'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA_alpha;B_beta\n'},
    options:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false,pie_mode:'four'}}},
  {workspace:'conflict',main_tree:{name:'primary.nwk',content:tree},comparison_tree:{name:'secondary.nwk',content:'(O:3,((A_alpha:1,C_gamma:1)90:1,(B_beta:1,D_delta:1)80:1)85:1);'}},
];
const runtime = await createRuntime();
const audits = [];
try {
  const page = await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>PhyloRenderAgent.ready());
  for (const spec of specs) {
    await page.evaluate(input=>PhyloRenderAgent.loadFigure(input),spec);
    await settleFigure(page);
    const before = await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    const tabs = await page.locator('.settings-nav button:visible').evaluateAll(items=>items.map(item=>item.dataset.settingsTarget));
    for (const width of [1440,820,390]) {
      await page.setViewportSize({width,height:1000});
      for (const tab of tabs) {
        await page.locator(`[data-settings-target="${tab}"]`).click();
        const layout = await page.evaluate(()=>{
          const panel=document.getElementById('node-label-controls');
          const controls=panel.parentElement;
          const active=[...controls.children].filter(item=>item!==panel&&item.getBoundingClientRect().height>0);
          const bounds=panel.getBoundingClientRect();
          return {last:controls.lastElementChild===panel,top:bounds.top,
            precedingBottom:Math.max(...active.map(item=>item.getBoundingClientRect().bottom)),
            label:document.getElementById('reset-labels').textContent.trim(),
            count:document.querySelectorAll('#reset-labels').length,
            displayed:getComputedStyle(panel).display!=='none',
            unrelatedAncestor:panel.closest('[data-settings-page]')?.dataset.settingsPage||null,
            oldPhrase:[...controls.querySelectorAll('*')].some(item=>item.children.length===0&&/重新自动排版/.test(item.textContent))};
        });
        assert.equal(layout.label,'自动调整节点标注位置');
        assert.equal(layout.count,1,'one shared action, never duplicate controls');
        assert.equal(layout.last,true,`${spec.workspace}/${tab}/${width}: shared action must be the last workbench child`);
        assert.ok(layout.top>=layout.precedingBottom-1,`${spec.workspace}/${tab}/${width}: action follows all visible settings`);
        assert.equal(layout.displayed,true,`${spec.workspace}/${tab}: action remains accessible`);
        assert.equal(layout.unrelatedAncestor,null);
        assert.equal(layout.oldPhrase,false);
        audits.push({mode:spec.workspace,tab,width,...layout});
      }
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-settings-target="tips"]').click();
    await page.locator('#tip-typography-section > summary').click();
    await page.locator('#node-label-controls').scrollIntoViewIfNeeded();
    const expanded = await page.evaluate(()=>{
      const panel=document.getElementById('node-label-controls');
      return panel.getBoundingClientRect().top>=document.getElementById('tip-typography-section').getBoundingClientRect().bottom;
    });
    assert.equal(expanded,true,'expanded typography stays above the shared action');
    await page.locator('.auto-layout-options > summary').click();
    assert.equal(await page.locator('#auto-labels').isVisible(),spec.workspace!=='cloud','cloud must not expose ineffective numeric-label controls');
    const controlsBefore = await page.evaluate(()=>Object.fromEntries(['tip-font-size','tip-font-family','tip-spacing','support-size','support-min-size'].map(id=>[id,document.getElementById(id).value])));
    await page.locator('#reset-labels').click();
    await settleFigure(page);
    const after = await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    const controlsAfter = await page.evaluate(()=>Object.fromEntries(['tip-font-size','tip-font-family','tip-spacing','support-size','support-min-size'].map(id=>[id,document.getElementById(id).value])));
    assert.deepEqual(controlsAfter,controlsBefore,'annotation adjustment preserves user typography and spacing');
    assert.deepEqual(after.main_tree,before.main_tree,'source tree remains intact');
    assert.deepEqual(after.comparison_tree,before.comparison_tree,'comparison source remains intact');
    assert.deepEqual(after.options,before.options,'the action does not reset the configuration');
    if (evidence) {
      await page.locator('#node-label-controls').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(evidence,`${spec.workspace}-footer.png`)});
      await writeFile(path.join(evidence,`${spec.workspace}.svg`),await page.evaluate(()=>serializeRenderedSvg()));
    }
  }
  assert.deepEqual(errors,[]);
  if (evidence) await writeFile(path.join(evidence,'results.json'),JSON.stringify({passed:true,audits,clicks:4,errors},null,2));
  console.log(`PASS shared annotation action: ${audits.length} mode/tab/viewport checks and 4 real clicks`);
} finally {await runtime.close();}
