import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
// Real DOM events and the shared agent/render path exercise the same naming facade.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const evidence=process.argv[2] || process.env.PHYLORENDER_SAMPLE_NAME_OUTPUT;
const tree='(O:70,(A_alpha:30,Example_beta_2023080906_1:30)90:40);';
const dated='(O:70,(A_alpha:30,Example_beta_2023080906_1:30)[&height=30,height_95%_HPD={25,35}]:40)[&height=70];';
const counts='Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA_alpha;Example_beta_2023080906_1\n';
const specs=[
  {workspace:'phylogeny',main_tree:{name:'ordinary.tre',content:tree}},
  {workspace:'time',main_tree:{name:'dated.tree',content:dated},options:{time:{source_unit:'mya'}}},
  {workspace:'conflict',main_tree:{name:'primary.tre',content:tree},comparison_tree:{name:'secondary.tre',content:tree.replace(')90:',')80:')}},
  {workspace:'cloud',main_tree:{name:'species.tree',content:dated},phyparts_table:{name:'counts.tsv',content:counts},
    options:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false,pie_mode:'four'}}},
];
const runtime=await createRuntime();
const results=[];
try {
  if(evidence)await mkdir(evidence,{recursive:true});
  const page=await runtime.renderer.browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],scientificRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    if(request.method()==='POST'&&/\/api\/cloud-(date|phyparts)/.test(request.url()))scientificRequests.push(request.url());
  });
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>PhyloRenderAgent.ready());
  const scientificSnapshot=()=>page.evaluate(()=>{
    function node(n){
      if(!n)return null;
      const result={};
      for(const key of ['label','length','support','annotations','timeAge','timeHpd','timeHPD','timeHeight'])
        if(Object.hasOwn(n,key))result[key]=n[key];
      result.children=(n.children||[]).map(node);
      return result;
    }
    const roots=state.workspaceMode==='cloud'?[state.cloud.speciesRoot,...state.cloud.geneRoots]:
      state.workspaceMode==='conflict'?[state.conflict.nuclearRoot,state.conflict.plastidRoot]:[state.root];
    return JSON.stringify({roots:roots.map(node),originals:currentTipOriginalLabels().sort(),
      counts:state.workspaceMode==='cloud'?state.cloud.phyPartsTable:null},(_key,value)=>
        value instanceof Map?[...value].map(([key,item])=>[typeof key==='object'?key.id:key,item]):
        value instanceof Set?[...value]:value);
  });
  const canonical=source=>page.evaluate(text=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');
    doc.querySelectorAll('metadata#phylorender-build').forEach(node=>node.remove());
    const visit=node=>node.nodeType===1?{tag:node.tagName,
      attributes:Object.fromEntries([...node.attributes]
        .sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value])),
      children:[...node.childNodes].map(visit)}:{type:node.nodeType,text:node.textContent};
    return JSON.stringify(visit(doc.documentElement));
  },source);
  const openSection=async selector=>{
    const section=page.locator(selector);
    if(await section.getAttribute('open')===null)await section.locator(':scope > summary').click();
  };
  for(const spec of specs){
    console.log('Checking sample-name workbench: '+spec.workspace);
    await page.evaluate(input=>PhyloRenderAgent.loadFigure(input),spec);
    await settleFigure(page);
    // Earlier name-control events can still own the optional native-name slot.
    // Finish them before selecting the same real name provider for both renders.
    await page.waitForFunction(()=>PhyloRenderNativeClient.activeCount===0,null,{timeout:60000});
    await page.evaluate(async()=>{
      await refreshTaxonNameRecognition({force:true,deferRender:true});
      await ensureFigureFontsReady();
      await renderTree();
    });
    await settleFigure(page);
    const before=await scientificSnapshot(),requestCount=scientificRequests.length;
    const originalLabel='Example_beta_2023080906_1';
    const expectedLabel='Example beta 2023080906_1';
    const sampleLabels=page.locator('#tree-svg [data-original-tip-label="'+originalLabel+'"]');
    assert.ok(await sampleLabels.count()>0);
    assert.ok((await sampleLabels.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-display-tip-label'))))
      .every(label=>label===expectedLabel),spec.workspace+': default rendering preserves the full sample identifier');
    const defaultWeb=await page.evaluate(()=>serializeRenderedSvg());
    // The workbench may retain presentation settings from the preceding mode.
    // Compare both renderers using the exact same effective configuration.
    const defaultConfiguration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    const defaultRendered=await runtime.renderer.render(defaultConfiguration,{formats:evidence?['svg','png']:['svg']});
    const defaultWebCanonical=await canonical(defaultWeb),defaultMcpCanonical=await canonical(defaultRendered.svg);
    if(defaultWebCanonical!==defaultMcpCanonical){
      const directory=evidence||path.resolve('mcp-server/var/sample-name-workbench-failures');
      await mkdir(directory,{recursive:true});
      await writeFile(path.join(directory,spec.workspace+'-web-failure.svg'),defaultWeb);
      await writeFile(path.join(directory,spec.workspace+'-mcp-failure.svg'),defaultRendered.svg);
      await writeFile(path.join(directory,spec.workspace+'-configuration.json'),JSON.stringify(await page.evaluate(()=>PhyloRenderAgent.exportConfiguration()),null,2));
    }
    assert.ok(defaultWebCanonical===defaultMcpCanonical,spec.workspace+': default GUI/MCP SVG match including data attributes; differing SVGs saved');
    if(evidence){
      await writeFile(path.join(evidence,spec.workspace+'-default.svg'),defaultRendered.svg);
      await writeFile(path.join(evidence,spec.workspace+'-default.png'),defaultRendered.png);
    }
    await page.locator('[data-settings-target="tips"]').click();
    await openSection('#tip-typography-section');
    assert.equal(await page.locator('#tip-font-bold').evaluate(element=>element.closest('details').id),'tip-typography-section',spec.workspace+': bold belongs to name font and color');
    assert.equal(await page.locator('#tip-font-bold').isVisible(),true,'bold must be usable with scientific-name formatting collapsed');
    assert.equal(await page.locator('#tip-format-section').getAttribute('open'),null);
    await openSection('.tip-rename-section');
    await page.locator('#tip-rename-select').selectOption('A_alpha');
    await page.locator('#tip-rename-edit').click();
    await page.locator('#tip-rename-input').fill('Clematis alpha subsp. minor (L.) Test');
    await page.locator('#tip-rename-form button[type="submit"]').click();
    await settleFigure(page);
    const renamed=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    assert.equal(renamed.tip_label_overrides.A_alpha,'Clematis alpha subsp. minor (L.) Test');
    assert.equal(await scientificSnapshot(),before,spec.workspace+': scientific inputs unchanged by rename');
    // A valid first row must not leak when a later row has an unknown raw identity.
    await page.locator('#tip-label-map-file').setInputFiles({name:'invalid.csv',mimeType:'text/csv',
      buffer:Buffer.from('original,display\nExample_beta_2023080906_1,Beta renamed\nunknown_taxon,Bad\n')});
    await page.waitForFunction(()=>document.getElementById('message').textContent.includes('名称映射表未应用'));
    assert.deepEqual((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).tip_label_overrides,renamed.tip_label_overrides);
    assert.equal(await page.locator('#tip-label-map-file').inputValue(),'');
    // Restoring the selected raw identity uses the same scoped facade.
    await page.locator('#tip-rename-edit').click();
    await page.locator('#tip-rename-restore').click();
    await settleFigure(page);
    assert.deepEqual((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).tip_label_overrides,{});
    await page.locator('#tip-label-map-file').setInputFiles({name:'valid.tsv',mimeType:'text/tab-separated-values',
      buffer:Buffer.from('original\tdisplay\nA_alpha\tClematis alpha subsp. minor (L.) Test\nExample_beta_2023080906_1\tSalix × beta L.\n')});
    await page.waitForFunction(()=>document.getElementById('message').textContent.includes('已从 valid.tsv'));
    await settleFigure(page);
    await openSection('#tip-typography-section');
    await page.locator('#tip-font-family').selectOption('Arial');
    await page.locator('#tip-font-size-number').fill(String(units.ptToDrawing(16.5)));
    // Explicit valid spacing: an inherited independent bug can export <0.9 em
    // after increasing a manual ordinary-tree font while preserving row pixels.
    // Its old/new reproducer is retained in the stage evidence, not hidden here.
    await page.locator('[data-settings-target="tree"]').click();
    await openSection('#tip-layout-settings');
    await page.locator('#tip-spacing-number').fill(String(units.designToDrawing(39.6)));
    await page.locator('[data-settings-target="tips"]').click();
    await openSection('#tip-typography-section');
    await openSection('#tip-format-section');
    await page.locator('#tip-font-bold').check();
    await page.locator('#tip-italic-mode').selectOption('none');
    await page.locator('#tip-normalize-ranks').uncheck();
    await page.locator('#tip-font-color').evaluate(element=>{element.value='#0072b2';element.dispatchEvent(new Event('input',{bubbles:true}));});
    await settleFigure(page);
    const weights=()=>page.locator('#tree-svg .tip-label, #tree-svg .cloud-tip-label, #tree-svg .conflict-tip-label').evaluateAll(labels=>labels.map(label=>getComputedStyle(label).fontWeight));
    assert.ok((await weights()).length>0);
    assert.ok((await weights()).every(weight=>weight==='700'),'the relocated checkbox makes every sample-name parent bold');
    await page.locator('#tip-font-bold').uncheck();
    await settleFigure(page);
    assert.ok((await weights()).every(weight=>weight==='400'),'unchecking restores normal sample-name weight');
    assert.equal(await scientificSnapshot(),before,'toggling bold preserves the complete scientific model');
    await page.locator('#tip-font-bold').check();
    await settleFigure(page);
    // Finish all checkbox edits before the existing font-ready full render.
    // Compare completed figures, not a layout retained between live changes.
    await page.evaluate(async()=>{await ensureFigureFontsReady();await renderTree();});
    await settleFigure(page);
    const configuration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    assert.ok(configuration.options.layout.tip_spacing_em>=.9&&configuration.options.layout.tip_spacing_em<=4);
    equalU(configuration.options.typography.tips.size_u,units.ptToDrawing(16.5));
    assert.equal(configuration.options.typography.tips.italic_mode,'none');
    assert.equal(configuration.options.typography.tips.bold,true,'existing MCP bold field remains unchanged');
    assert.equal(await scientificSnapshot(),before,spec.workspace+': typography preserves raw model and counts');
    assert.equal(scientificRequests.length,requestCount,'Name/presentation changes must not start treePL or PhyParts');
    const web=await page.evaluate(()=>serializeRenderedSvg());
    const rendered=await runtime.renderer.render(configuration,{formats:evidence?['svg','png']:['svg']});
    assert.equal(await canonical(web),await canonical(rendered.svg),spec.workspace+': GUI and shared MCP renderer match');
    assert.equal(rendered.report.topology_unchanged,true);
    await page.locator('#import-figure-config').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(configuration))});
    await page.waitForFunction(()=>document.getElementById('message').textContent.includes('绘图配置已载入'));
    await settleFigure(page);
    assert.deepEqual((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).tip_label_overrides,configuration.tip_label_overrides);
    assert.equal(await scientificSnapshot(),before,spec.workspace+': configuration round trip preserves scientific inputs');
    assert.equal(await page.locator('#tip-font-bold').isChecked(),true,'bold state survives configuration import');
    if(evidence){
      await page.locator('[data-settings-target="tips"]').click();
      await openSection('#tip-typography-section');
      await page.locator('#tip-font-bold').scrollIntoViewIfNeeded();
      await writeFile(path.join(evidence,spec.workspace+'-names.svg'),rendered.svg);
      await writeFile(path.join(evidence,spec.workspace+'-names.png'),rendered.png);
      await page.screenshot({path:path.join(evidence,spec.workspace+'-workbench.png')});
    }
    results.push({workspace:spec.workspace,rename:true,atomic_invalid_batch:true,restore:true,
      typography:true,bold_in_typography:true,bold_on_and_off:true,bold_configuration_roundtrip:true,
      raw_model_unchanged:true,shared_renderer_match:true,configuration_roundtrip:true});
  }
  assert.deepEqual(errors,[]);
  if(evidence)await writeFile(path.join(evidence,'sample-name-workbench.json'),JSON.stringify({passed:true,cases:results,errors},null,2));
  console.log('SAMPLE_NAME_WORKBENCH_PASSED: all four workspaces');
} finally {await runtime.close();}
