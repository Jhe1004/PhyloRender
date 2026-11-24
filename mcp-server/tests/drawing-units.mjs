import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import units from '../../figure-units.js';
const tree='(O:85,((A_alpha:30,B_beta:30)90:25,(C_gamma:10,D_delta:10)95:45)100:30);';
const runtime=await createRuntime();
try {
  const page=await runtime.renderer.browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>PhyloRenderAgent.ready());
  for(const workspace of ['phylogeny','time','cloud','conflict']){
    const base={workspace,main_tree:{content:tree},...(workspace==='conflict'?{comparison_tree:{content:tree}}:{}),options:{
      layout:{automatic_tip_spacing:true,...(workspace==='cloud'?{}:{node_radius_u:4}),branch_width_u:1},typography:{tips:{size_u:12}},
      ...(workspace==='time'?{time:{source_unit:'mya'}}:{}),
      ...(workspace==='cloud'?{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false,show_time_axis:true,pie_radius_u:16},time:{geology:'standard'}}:{}),
    }};
    const canonical=source=>page.evaluate(source=>{const doc=new DOMParser().parseFromString(source,'image/svg+xml');
      doc.querySelector('metadata#phylorender-build')?.remove();
      doc.documentElement.removeAttribute('width');doc.documentElement.removeAttribute('height');
      return new XMLSerializer().serializeToString(doc.documentElement);},source);
    const small=await runtime.renderer.render({...base,options:{...base.options,output:{width_mm:180,dpi:300}}});
    const large=await runtime.renderer.render({...base,options:{...base.options,output:{width_mm:360,dpi:300}}});
    assert.equal(small.report.topology_unchanged,true);assert.equal(large.report.topology_unchanged,true);
    assert.equal(small.report.output.drawing_width,1000);
    assert.equal(small.report.output.width_mm,180);assert.equal(large.report.output.width_mm,360);
    assert.equal(large.report.output.height_mm,small.report.output.height_mm*2);
    assert.equal(large.report.output.tip_size_pt,small.report.output.tip_size_pt*2);
    const smallSvg=await canonical(small.svg),largeSvg=await canonical(large.svg);
    if(smallSvg!==largeSvg&&process.env.PHYLORENDER_TEST_EVIDENCE){
      const dir=path.resolve(process.env.PHYLORENDER_TEST_EVIDENCE);await mkdir(dir,{recursive:true});
      await writeFile(path.join(dir,`${workspace}-small.svg`),smallSvg);
      await writeFile(path.join(dir,`${workspace}-large.svg`),largeSvg);
    }
    assert.equal(smallSvg,largeSvg,'print width changes only physical size, including stroke widths');
    assert.match(small.svg,/viewBox="0 0 1000 /);
    const configuration=small.normalizedSpec;
    assert.ok(Math.abs(configuration.options.typography.tips.size_u-12)<1e-9);
    if(workspace==='cloud') assert.ok(Math.abs(configuration.options.cloud.pie_radius_u-16)<1e-8,'fractional internal radius is not rounded to pixels');
    assert.equal(configuration.options.typography.tips.size_pt,undefined);
    const web=await page.evaluate(spec=>PhyloRenderAgent.loadFigure(spec),{...base,options:{...base.options,output:{width_mm:180,dpi:300}}});
    assert.equal(await canonical(web.svg),await canonical(small.svg),'web/MCP graphics agree');
    const unitLabels=await page.locator('.numeric-unit').allTextContents();
    assert.ok(unitLabels.some(text=>/\bu\b|drawing units/i.test(text)));
    const font=await page.locator('#tree-svg .tip-label, #tree-svg .cloud-tip-label, #tree-svg .conflict-tip-label').first().evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
    assert.ok(Math.abs(font*1000/small.report.canvas.width-12)<1e-8,'painted font size is 12/1000 of the complete width');
    const markerSelector=workspace==='time'?'.time-age-marker':'.support-node-marker';
    if(workspace!=='cloud') {
      const radii=await page.locator(`#tree-svg ${markerSelector}`).evaluateAll(elements=>elements.map(el=>Number(el.getAttribute('r'))));
      assert.ok(radii.length>0,`${workspace} exercises visible node circles`);
      assert.ok(radii.every(radius=>Math.abs(radius*1000/small.report.canvas.width-4)<1e-8),'painted radius is 4/1000 of the complete width');
    }
    if(workspace==='phylogeny'||workspace==='time') {
      const stretched=await runtime.renderer.render({...base,options:{...base.options,layout:{...base.options.layout,horizontal_scale:50}}},{formats:['svg']});
      assert.equal(stretched.report.canvas.width,units.designWidth,'stretch preserves the drawing-unit reference frame');
      assert.ok(Math.abs(stretched.report.output.tip_size_u-12)<1e-8);
      assert.ok(stretched.report.output.horizontal_expansion<small.report.output.horizontal_expansion);
    }
    const square=await runtime.renderer.render({...base,options:{...base.options,output:{aspect_ratio:'1:1',width_mm:180}}},{formats:['svg']});
    assert.equal(square.report.canvas.width,units.designWidth);
    assert.equal(square.report.canvas.height,units.designWidth,'sparse explicit square preserves requested ratio');
    assert.equal(square.report.output.drawing_width,1000);
    assert.equal(square.report.output.drawing_height,1000);
    const legacy=await runtime.renderer.render({...base,options:{...base.options,typography:{tips:{size_pt:units.drawingToPt(12)}},output:{width_mm:180,dpi:300}}},{formats:['svg']});
    assert.equal(await canonical(legacy.svg),await canonical(small.svg),'legacy inputs convert to the same relative geometry');
    console.log(`PASS ${workspace}: width=1000, 180/360 mm equal geometry, canonical units, web/MCP parity`);
  }
  const hpdSpec={workspace:'time',main_tree:{content:'((A:30,B:30)[&height=30,height_95%_HPD={25,35}]:55,(C:10,D:10)[&height=10]:75)[&height=85];'},
    options:{time:{source_unit:'mya',hpd_thickness_u:4.123},typography:{tips:{size_u:12}}}};
  const hpd=await runtime.renderer.render(hpdSpec,{formats:['svg']});
  assert.ok(Math.abs(hpd.normalizedSpec.options.time.hpd_thickness_u-4.123)<1e-8,'HPD width preserves arbitrary drawing-unit decimals');
  const clade=await runtime.renderer.render({main_tree:{content:tree},clades:[{name:'AB',mrca_of:['A_alpha','B_beta'],name_segments:[{text:'AB',size_u:10.123}]}],
    options:{typography:{tips:{size_u:12}}}},{formats:['svg']});
  assert.ok(Math.abs(clade.normalizedSpec.clades[0].name_segments[0].size_u-10.123)<1e-8);
  assert.equal(clade.normalizedSpec.clades[0].name_segments[0].size_pt,undefined);
  const branch=hpd.report.branches[0];
  assert.ok(branch);
  const adjusted=await runtime.renderer.render({...hpdSpec,label_adjustments:[{branch_id:branch.branch_id,dx_u:4.123,dy_u:-2.456,font_reduction_u:0.123}]},{formats:['svg']});
  const offset=adjusted.normalizedSpec.label_adjustments[0];
  for(const [field,value] of Object.entries({dx_u:4.123,dy_u:-2.456,font_reduction_u:0.123})) assert.ok(Math.abs(offset[field]-value)<1e-8);
  assert.equal(offset.dx,undefined);
  assert.deepEqual(errors,[]);
  await page.close();
} finally {await runtime.close();}
