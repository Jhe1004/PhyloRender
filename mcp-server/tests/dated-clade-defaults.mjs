import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import units from '../../figure-units.js';
import {createRuntime} from '../src/runtime.mjs';
const output=process.argv[2], runtime=await createRuntime();
try {
  const page=await runtime.renderer.browser.newPage({viewport:{width:1800,height:1100}});
  const errors=[],requests=[],reports=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/api\/cloud-(date|phyparts)/.test(r.url()))requests.push(r.url());});
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>window.PhyloRenderReady);
  await page.evaluate(()=>PhyloRenderAgent.loadFigure({workspace:'cloud',
    main_tree:{content:'(O:4,((Alpha_a:1,Beta_b:1):1,Gamma_c:2):2);'},
    gene_trees:{content:'(O:4,((Alpha_a:1,Beta_b:1)95:1,Gamma_c:2)95:2);'},
    clades:[{mrca_of:['O'],name:'Outgroup'},{mrca_of:['Alpha_a','Beta_b','Gamma_c'],name:'Ingroup'}],
    options:{cloud:{species_method:'other',show_gene:false,phyparts_scale:'percent'},typography:{tips:{italic_mode:'none'}}}}));
  const settings=()=>page.evaluate(()=>({alignment:$('clade-bar-alignment').value,
    sizePt:Number((Number($('clade-font-size').value)*.75).toFixed(8)),
    display:$('clade-font-size-value').textContent,precise:$('clade-font-size-number').value}));
  const checkSettings=async(alignment,sizePt)=>{
    const s=await settings(),drawing=Number(units.ptToDrawing(sizePt).toFixed(2));
    assert.equal(s.alignment,alignment);assert.equal(s.sizePt,sizePt);
    assert.equal(Number(s.precise),drawing);assert.equal(parseFloat(s.display),drawing);
    assert.match(s.display,/绘图单位|\bu\b/);return s;
  };
  const defaultPt=()=>page.evaluate(()=>PhyloRenderUnits.drawingToPt(PhyloRenderUnits.designToDrawing(Number($('tip-font-size').value))+PhyloRenderContract.cladeReadability.offsetU));
  const checkDefault=async(mode,alignment='auto')=>{
    const expected=Number((await defaultPt()).toFixed(8));
    reports.push({mode,...await checkSettings(alignment,expected)});
    assert.equal(await page.locator('#clade-font-auto').isChecked(),true);
  };
  const exportPreview=async name=>{
    if(!output)return;
    const svg=await page.evaluate(()=>serializeRenderedSvg());
    await writeFile(path.join(output,`${name}.svg`),svg);
    const size=await page.evaluate(()=>state.currentSvgSize);
    const p=await runtime.renderer.browser.newPage({viewport:{width:Math.ceil(size.width),height:Math.ceil(size.height)}});
    await p.setContent(`<body style="margin:0">${svg}</body>`);await p.evaluate(()=>document.fonts.ready);
    await p.screenshot({path:path.join(output,`${name}.png`)});await p.close();
  };
  const checkBars=async()=>{
    const bars=await page.locator('.clade-bar[data-bar-part="body"]').evaluateAll(els=>els.map(e=>({x:e.getAttribute('x1'),base:e.dataset.baseX,column:e.dataset.alignmentColumn,alignment:e.dataset.barAlignment})));
    assert.ok(bars.length>=2);
    assert.ok(bars.every(b=>b.alignment==='aligned'),'single-layer clades on flush-tip trees align on one shared line under default auto');
    assert.equal(new Set(bars.filter(b=>b.column==='0').map(b=>b.x)).size,1);
    assert.equal(await page.evaluate(()=>cladeBarGapReport().valid),true);
    const pts=await page.locator('.clade-bar-label').evaluateAll(els=>els.map(e=>parseFloat(getComputedStyle(e).fontSize)*.75));
    const expected=await defaultPt();assert.ok(pts.every(n=>Math.abs(n-expected)<.0001));
  };
  await checkDefault('cloud');
  const cloudBefore=await page.evaluate(()=>JSON.stringify({root:state.cloud.speciesRoot,
    dates:[...state.cloud.datedAges].map(([r,a])=>[r.id,[...a].map(([n,v])=>[n.id,v])]),
    table:state.cloud.phyPartsTable&&[...state.cloud.phyPartsTable.rows]}));
  await checkBars();await exportPreview('01_合成云树_统一对齐_默认加3u');
  await page.evaluate(()=>switchWorkspaceMode('time'));await checkDefault('time');
  const configuredPath=process.env.PHYLORENDER_DATED_QA_FILE;
  const content=configuredPath ? await readFile(configuredPath,'utf8')
    : '(O:3,((Alpha_a:1,Beta_b:1):1,(Gamma_c:1,Delta_d:1):1):1);';
  const name=configuredPath ? path.basename(configuredPath) : 'synthetic-dated-fixture.tree';
  console.log('DATING_QA_INPUT',JSON.stringify({source:configuredPath?'explicit_file':'synthetic',name}));
  await page.evaluate(async({content,name})=>{
    // Focused grouping QA does not need the MCP report/two-panel workflow.
    // Suppress node-age labels only in this test, retaining supplied times/HPD.
    $('time-show-ages').checked=false;
    $('newick-input').value=content;state.sourceName=name;
    parseAndDraw({defaultRooting:false,deferRender:true,throwOnError:true});
    state.root.children.forEach((n,i)=>{
      state.cladeColors.set(n.id,i?'#d55e00':'#0072b2');state.cladeNames.set(n.id,`Group ${i+1}`);
    });
    await window.PhyloRenderEnsureFonts();await renderTree({fontReady:true});
  },{content,name});
  await checkDefault('time-loaded');await checkBars();await exportPreview('02_Dating树_统一对齐_默认加3u');
  const datedBefore=await page.evaluate(()=>JSON.stringify(state.root));
  await page.evaluate(()=>{$('clade-font-auto').checked=false;$('clade-font-size').value='20';$('clade-bar-alignment').value='nearby';refreshNumericControls();});
  await page.evaluate(()=>switchWorkspaceMode('cloud'));await checkDefault('cloud-restored');
  await page.evaluate(()=>{$('clade-font-auto').checked=false;$('clade-font-size').value='24';$('clade-bar-alignment').value='nearby';refreshNumericControls();});
  await page.evaluate(()=>switchWorkspaceMode('time'));
  await checkSettings('nearby',15);
  assert.equal(await page.evaluate(()=>JSON.stringify(state.root)),datedBefore);
  await page.evaluate(()=>resetTypography());await checkDefault('time-reset','nearby');
  await page.evaluate(()=>switchWorkspaceMode('phylogeny'));
  assert.equal((await settings()).alignment,'auto');assert.equal((await settings()).sizePt,Number((await defaultPt()).toFixed(8)));
  await page.evaluate(()=>switchWorkspaceMode('cloud'));
  assert.equal((await settings()).alignment,'nearby');assert.equal((await settings()).sizePt,18);
  await page.evaluate(()=>resetTypography());await checkDefault('cloud-reset','nearby');
  assert.equal(await page.evaluate(()=>JSON.stringify({root:state.cloud.speciesRoot,
    dates:[...state.cloud.datedAges].map(([r,a])=>[r.id,[...a].map(([n,v])=>[n.id,v])]),
    table:state.cloud.phyPartsTable&&[...state.cloud.phyPartsTable.rows]})),cloudBefore);
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  if(output)await writeFile(path.join(output,'03_验证报告.json'),JSON.stringify({reports,datingInput:name,requests,errors,passed:true},null,2));
  console.log('PASS Dating/cloud aligned defaults with drawing-unit controls, independent user choices, typography reset, unchanged ordinary defaults, SVG exports and immutable chronology/statistics');
}finally{await runtime.close();}
