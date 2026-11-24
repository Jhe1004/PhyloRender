import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRuntime} from '../src/runtime.mjs';
const runtime=await createRuntime();
const hash=text=>createHash('sha256').update(text).digest('hex');
try{
 const page=await runtime.renderer.browser.newPage();
 await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderReady);
 const loaded=await page.evaluate(()=>PhyloRenderAgent.loadFigure({workspace:'phylogeny',main_tree:{content:'(O:3,((A:1,B:1)90:1,C:2)85:1);'}}));
 assert.equal(loaded.panel_trees.length,0);assert.equal(loaded.report.two_panel.generated,false);assert.equal(loaded.report.two_panel.readable,undefined);
 const reuse=await page.evaluate(async()=>{
  const baseRoot=state.root,before=await serializeRenderedSvg({reuseLayout:true}),render=renderTreeCooperatively;let baseRenders=0;
  renderTreeCooperatively=async(...args)=>{if(state.root===baseRoot)baseRenders++;return render(...args);};
  try{const result=await PhyloRenderAgent.currentFigure();return{baseRenders,before,after:await serializeRenderedSvg({reuseLayout:true}),safe:result.report.safe_for_export};}
  finally{renderTreeCooperatively=render;}
 });
 assert.equal(reuse.baseRenders,0,'reading an accepted figure must not rerender the base or unrequested panels');
 assert.equal(hash(reuse.before),hash(reuse.after));assert.equal(reuse.safe,true);
 const panels=await page.evaluate(()=>PhyloRenderAgent.currentFigure({includePanels:true}));
 assert.ok(panels.panel_trees.length>0);assert.equal(panels.report.two_panel.generated,true);
 assert.equal(panels.report.two_panel.configured_font_sizes_preserved,true);
 assert.equal(panels.report.two_panel.rendering_profile.renderer,'shared');
 assert.equal(panels.report.two_panel.rendering_profile.inherits_figure_rendering,true);
 await page.evaluate(()=>PhyloRenderAgent.loadFigure({workspace:'cloud',main_tree:{content:'[&R](O,((A,B),(C,D)));'},gene_trees:{content:'[&R](O,((A,B),(C,D)));\n[&R](O,((A,C),(B,D)));'},options:{cloud:{species_method:'coalescent',genes_method:'coalescent',show_gene:false}}}));
 const timing=await page.evaluate(async()=>{
  const biology=()=>JSON.stringify({root:state.cloud.speciesRoot,table:state.cloud.phyPartsTable});const before=biology();
  state.cloud.phyPartsMeta.elapsedSeconds=12.5;await renderCloudTree();const first=await serializeRenderedSvg({reuseLayout:true});
  state.cloud.phyPartsMeta.elapsedSeconds=13.5;await renderCloudTree();const second=await serializeRenderedSvg({reuseLayout:true});
  return{first,second,before,after:biology(),report:(await PhyloRenderAgent.currentFigure()).report};
 });
 assert.equal(hash(timing.first),hash(timing.second),'runtime duration must not change scientific SVG provenance');
 assert.equal(timing.before,timing.after);assert.equal(timing.report.cloud.phyparts.elapsedSeconds,13.5);
 assert.doesNotMatch(timing.second,/"elapsedSeconds"/);
 const repeated=await page.evaluate(()=>PhyloRenderAgent.loadFigure({workspace:'phylogeny',main_tree:{content:'(O:3,((A:1,B:1)90:1,C:2)85:1);'}}));
 if(repeated.svg!==reuse.before){let i=0;while(i<Math.min(repeated.svg.length,reuse.before.length)&&repeated.svg[i]===reuse.before[i])i++;console.log(JSON.stringify({difference:i,first:reuse.before.slice(Math.max(0,i-80),i+300),repeated:repeated.svg.slice(Math.max(0,i-80),i+300)}));}
 assert.equal(hash(repeated.svg),hash(reuse.before),'prior workspace history must not change a repeated SVG');
 console.log('REPORT_LAYOUT_REUSE_PASSED: completed base layout reused, exact SVG restored, volatile timing kept in report only');
}finally{await runtime.close();}
