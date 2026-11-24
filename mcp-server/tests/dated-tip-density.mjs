import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';

const output=process.argv[2],runtime=await createRuntime();
try{
  const page=await runtime.renderer.browser.newPage({viewport:{width:1800,height:1100}});
  const errors=[],requests=[],reports=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/api\/cloud-(date|phyparts)/.test(r.url()))requests.push(r.url());});
  await page.goto(runtime.demoPageUrl);await page.evaluate(()=>window.PhyloRenderReady);
  const audit=async name=>{
    const result=await page.evaluate(()=>{
      const labels=[...document.querySelectorAll('.cloud-tip-label,.time-tip-label')];
      const context=document.createElement('canvas').getContext('2d');
      const rows=labels.map(e=>{
        const style=getComputedStyle(e);let ascent=0,descent=0;
        const runs=e.children.length?[...e.children]:[e];
        for(const run of runs){const runStyle=getComputedStyle(run);
          context.font=`${runStyle.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metric=context.measureText(run.textContent);
          ascent=Math.max(ascent,metric.actualBoundingBoxAscent||0);
          descent=Math.max(descent,metric.actualBoundingBoxDescent||0);
        }
        return {text:e.textContent,y:Number(e.getAttribute('y')),ascent,descent,
          size:Number(parseFloat(style.fontSize))};
      }).sort((a,b)=>a.y-b.y);
      const gaps=rows.slice(1).map((r,i)=>r.y-rows[i].y-rows[i].descent-r.ascent);
      return {mode:state.workspaceMode,count:rows.length,sizePt:Number($('tip-font-size').value)*.75,
        automatic:state.automaticTipSpacing,spacing:terminalSpacing(),
        minInkGap:Math.min(...gaps),maxInkGap:Math.max(...gaps),rows};
    });
    assert.equal(result.sizePt,18);assert.ok(result.automatic);
    assert.ok(result.minInkGap>=.99,`${name}: actual text overlap/gap ${result.minInkGap}`);
    assert.ok(result.rows.every(r=>r.size===24));
    if(result.count>=80)assert.ok(result.minInkGap<3,`${name}: dense text remains too far apart`);
    if(result.count<=20)assert.ok(result.minInkGap>=7.19,`${name}: small tree lacks breathing room`);
    reports.push({name,...result});return result;
  };
  const exportPreview=async name=>{
    if(!output)return;
    const svg=await page.evaluate(()=>serializeRenderedSvg());
    await writeFile(path.join(output,`${name}.svg`),svg);
    const size=await page.evaluate(()=>state.currentSvgSize);
    const preview=await runtime.renderer.browser.newPage({viewport:{width:Math.ceil(size.width),height:Math.ceil(size.height)}});
    await preview.setContent(`<body style="margin:0">${svg}</body>`);await preview.evaluate(()=>document.fonts.ready);
    await preview.screenshot({path:path.join(output,`${name}.png`)});await preview.close();
  };
  const cloudBefore=await page.evaluate(()=>JSON.stringify({roots:[state.cloud.speciesRoot,...state.cloud.geneRoots],
    ages:[...state.cloud.datedAges].map(([r,a])=>[r.id,[...a].map(([n,v])=>[n.id,v])]),
    table:state.cloud.phyPartsTable&&[...state.cloud.phyPartsTable.rows]}));
  if(await page.locator('.cloud-tip-label').count()){
    await audit('real default cloud');await exportPreview('01_真实99样品云树_18pt_紧凑名称');
  }
  await page.evaluate(()=>switchWorkspaceMode('time'));
  const configuredPath=process.env.PHYLORENDER_DATED_QA_FILE;
  const content=configuredPath ? await readFile(configuredPath,'utf8')
    : '(O:3,((Alpha_a:1,Beta_b:1):1,(Gamma_c:1,Delta_d:1):1):1);';
  console.log('DATING_QA_INPUT',JSON.stringify({source:configuredPath?'explicit_file':'synthetic'}));
  await page.evaluate(async content=>{
    $('time-show-ages').checked=false; // Focused label QA, not a node-number benchmark.
    $('newick-input').value=content;parseAndDraw({defaultRooting:false,deferRender:true,throwOnError:true});
    await window.PhyloRenderEnsureFonts();await renderTree({fontReady:true});
  },content);
  await audit(configuredPath?'explicit Dating fixture':'synthetic Dating fixture');await exportPreview('02_Dating测试输入_18pt_紧凑名称');
  const datedBefore=await page.evaluate(()=>JSON.stringify(state.root));
  await page.evaluate(async ()=>{
    $('tip-spacing').value='34';$('tip-spacing').dispatchEvent(new Event('input',{bubbles:true}));
    $('tip-font-size').value='28';$('tip-font-size').dispatchEvent(new Event('input',{bubbles:true}));
    await renderTree({fontReady:true});
  });
  assert.equal(await page.evaluate(()=>state.automaticTipSpacing),false);
  assert.equal(await page.evaluate(()=>terminalSpacing()),34);
  await page.evaluate(()=>switchWorkspaceMode('cloud'));await audit('cloud independently restored');
  assert.equal(await page.evaluate(()=>JSON.stringify({roots:[state.cloud.speciesRoot,...state.cloud.geneRoots],
    ages:[...state.cloud.datedAges].map(([r,a])=>[r.id,[...a].map(([n,v])=>[n.id,v])]),
    table:state.cloud.phyPartsTable&&[...state.cloud.phyPartsTable.rows]})),cloudBefore);
  await page.evaluate(()=>switchWorkspaceMode('time'));
  assert.equal(await page.evaluate(()=>Number($('tip-font-size').value)),28);
  assert.equal(await page.evaluate(()=>terminalSpacing()),34);
  assert.equal(await page.evaluate(()=>JSON.stringify(state.root)),datedBefore);
  await page.evaluate(async ()=>{
    $('tip-font-size').value='24';state.automaticTipSpacing=true;
    $('newick-input').value='(Outgroup_x:3,((Alpha_alpha:1,Beta_beta:1):1,(Gamma_gamma:1,Delta_delta:1):1):1);';
    parseAndDraw({defaultRooting:false,deferRender:true,throwOnError:true});await renderTree({fontReady:true});
  });
  const small=await audit('small Dating');assert.equal(small.count,5);await exportPreview('03_五样品Dating树_较宽间隔');
  await page.evaluate(()=>switchWorkspaceMode('phylogeny'));
  assert.equal(await page.evaluate(()=>Number($('tip-font-size').value)),20);
  assert.equal(await page.evaluate(()=>state.automaticTipSpacing),true);
  assert.ok(await page.evaluate(()=>terminalSpacing())>10);
  await page.evaluate(()=>switchWorkspaceMode('cloud'));
  await page.evaluate(async ()=>{
    $('tip-font-size').value='30';$('tip-font-size').dispatchEvent(new Event('input',{bubbles:true}));
    await renderCloudTree();
  });
  assert.equal(await page.evaluate(()=>state.automaticTipSpacing),false);
  await page.getByRole('button',{name:'树形',exact:true}).click();
  await page.locator('#tip-layout-settings > summary').click();
  await page.locator('#automatic-tip-spacing').check();
  assert.equal(await page.evaluate(()=>state.automaticTipSpacing),true);
  await page.evaluate(()=>switchWorkspaceMode('time'));
  const explicit=await page.evaluate(async()=>{
    const figure=await window.PhyloRenderAgent.loadFigure({
      main_tree:{name:'explicit-dated-fixture.tree',content:'(O:3,((A:1,B:1):1,(C:1,D:1):1):1);'},
      options:{layout:{tip_spacing_em:1.5},typography:{tips:{size_pt:12}},
        time:{source_unit:'mya',display_unit:'mya',show_node_ages:false}},
    });
    return {automatic:state.automaticTipSpacing,spacing:terminalSpacing(),output:figure.report.output};
  });
  equalU(explicit.automatic,false);equalU(explicit.spacing,24);equalU(explicit.output.tip_size_u,units.ptToDrawing(12));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  if(output)await writeFile(path.join(output,'04_名称字号与字形间隙验证.json'),JSON.stringify({reports,explicit,errors,requests,passed:true},null,2));
  console.log('PASS Dating/cloud defaults, explicitly identified input, measured dense/sparse ink gaps, manual geometry preservation, independent modes and immutable biological inputs');
}finally{await runtime.close();}
