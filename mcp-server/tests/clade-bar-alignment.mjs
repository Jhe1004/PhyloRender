import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';
import { figureOptionsSchema } from '../src/schemas.mjs';

assert.equal(figureOptionsSchema.parse({ layout: { clade_bar_alignment: 'aligned' } }).layout.clade_bar_alignment, 'aligned');
assert.throws(() => figureOptionsSchema.parse({ layout: { clade_bar_alignment: 'wrong' } }));
const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/api\/cloud-(date|phyparts)/.test(r.url())) requests.push(r.url()); });
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderReady);
  if (await page.evaluate(() => Boolean(state.cloud.speciesRoot))) {
    // The Dating/cloud default is now aligned; exercise both choices explicitly.
    await page.evaluate(async ()=>{ state.cloud.cladeNameOrientations.forEach((value,id)=>state.cloud.cladeNameOrientations.set(id,'horizontal'));$('clade-bar-alignment').value='nearby';await renderCloudTree(); });
    const fingerprint = () => page.evaluate(() => JSON.stringify({
      roots: [state.cloud.speciesRoot, ...state.cloud.geneRoots],
      dates: [...state.cloud.datedAges].map(([root, ages]) => [root.id,[...ages].map(([node, age]) => [node.id,age])]),
      statistics: [...state.cloud.phyPartsTable.rows],
      groups: [...state.cloud.cladeNames], hidden: [...state.cloud.hiddenPieNodes],
      order: [...document.querySelectorAll('.cloud-tip-label')].map(t => t.dataset.originalTipLabel),
      speciesGeometry: document.querySelector('.cloud-species-tree').outerHTML,
      geneGeometry: document.querySelector('.cloud-gene-lines')?.outerHTML,
    }));
    const before = await fingerprint();
    const bars = () => page.locator('.clade-bar[data-bar-part="body"]').evaluateAll(elements => elements.map(el => ({
      id: el.dataset.cladeNodeId, x: Number(el.getAttribute('x1')), column: Number(el.dataset.alignmentColumn), alignment: el.dataset.barAlignment,
    })));
    const original = await bars();
    assert.ok(new Set(original.map(b=>b.x)).size>1);
    await page.getByRole('button', { name: '分组', exact: true }).click();
    assert.equal(await page.locator('#clade-bar-alignment-section').getAttribute('open'),null);
    await page.locator('#clade-bar-alignment-section > summary').click();
    await page.getByLabel('分组条对齐方式', { exact: true }).selectOption('aligned');
    await page.waitForFunction(() => [...document.querySelectorAll('.clade-bar[data-bar-part="body"]')].every(el=>el.dataset.barAlignment==='aligned'));
    const aligned = await bars();
    assert.equal(new Set(aligned.map(b=>b.x)).size,1);
    assert.equal(await fingerprint(),before);
    assert.ok(await page.evaluate(()=>cladeBarGapReport().valid));
    assert.equal(await page.evaluate(()=>JSON.parse(document.querySelector('#cloud-clade-provenance').textContent).barAlignment),'aligned');
    const exportPreview = async name => {
      if (!process.argv[2]) return;
      const svg = await page.evaluate(()=>serializeRenderedSvg());
      await writeFile(`${process.argv[2]}/${name}.svg`,svg);
      const size=await page.evaluate(()=>state.currentSvgSize);
      const preview=await runtime.renderer.browser.newPage({viewport:{width:Math.ceil(size.width),height:Math.ceil(size.height)}});
      await preview.setContent(`<body style="margin:0">${svg}</body>`);
      await preview.evaluate(()=>document.fonts.ready);
      await preview.screenshot({path:`${process.argv[2]}/${name}.png`});
      await preview.close();
    };
    await exportPreview('01_云树统一对齐');
    if (process.argv[2]) await page.screenshot({path:`${process.argv[2]}/03_对齐方式界面.png`});
    await page.getByLabel('分组条对齐方式', {exact:true}).selectOption('nearby');
    await page.waitForFunction(()=>[...document.querySelectorAll('.clade-bar[data-bar-part="body"]')].every(el=>el.dataset.barAlignment==='nearby'));
    assert.deepEqual(await bars(),original);
    assert.equal(await fingerprint(),before);
    await exportPreview('02_云树贴近名称');
    assert.deepEqual(requests,[]);
    // A much longer display name changes the common alignment anchor, not
    // sample identity, topology, time or node statistics.
    await page.evaluate(()=>applyTipLabelOverrides({[PhyloRenderCloud.tips(state.cloud.speciesRoot)[0].label]:'A deliberately very long display name for alignment testing '.repeat(4)},{mode:'merge'}));
    await page.getByLabel('分组条对齐方式',{exact:true}).selectOption('aligned');
    await page.waitForFunction(()=>[...document.querySelectorAll('.clade-bar[data-bar-part="body"]')].every(el=>el.dataset.barAlignment==='aligned'));
    assert.equal(new Set((await bars()).map(b=>b.x)).size,1);
    assert.ok(await page.evaluate(()=>cladeBarGapReport().valid));
    assert.ok((await bars())[0].x>aligned[0].x);
    assert.equal(await fingerprint(),before);
  }
  assert.deepEqual(errors,[]);
  const spec={main_tree:{name:'alignment.nwk',content:'((Alpha_longissima:1,Beta_longissima:1):1,(Gamma:1,Delta:1):1);'},
    rooting:{outgroup:null},clades:[{mrca_of:['Alpha_longissima','Beta_longissima'],name:'Upper',color:'#0072b2',label_orientation:'horizontal'},
      {mrca_of:['Gamma','Delta'],name:'Lower',color:'#d55e00',label_orientation:'horizontal'}],options:{layout:{clade_bar_alignment:'aligned'}}};
  const rendered=await runtime.renderer.render(spec);
  assert.equal(rendered.normalizedSpec.options.layout.clade_bar_alignment,'aligned');
  assert.ok(rendered.report.clade_bar_spacing.valid);
  assert.equal(rendered.report.topology_unchanged,true);
  assert.equal(rendered.report.safe_for_export,true);
  assert.equal(new Set([...rendered.svg.matchAll(/data-base-x="([^"]+)"/g)].map(m=>m[1])).size,1);
  const nearby=await runtime.renderer.render({...spec,options:{layout:{clade_bar_alignment:'nearby'}}});
  assert.ok(nearby.report.clade_bar_spacing.valid);
  assert.equal(new Set([...nearby.svg.matchAll(/data-base-x="([^"]+)"/g)].map(m=>m[1])).size,2);
  // Dating uses the same grouping engine and retains its supplied chronology.
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(()=>window.PhyloRenderReady);
  await page.evaluate(async spec=>{await switchWorkspaceMode('time');await window.PhyloRenderAgent.loadFigure(spec);},
    {...spec,options:{layout:{clade_bar_alignment:'aligned'},time:{source_unit:'mya',display_unit:'mya'}}});
  const dated=await page.evaluate(()=>({mode:state.workspaceMode,rootAge:buildTimeTreeProfile(state.root).rootAge,
    columns:[...document.querySelectorAll('.clade-bar[data-bar-part="body"]')].map(el=>el.getAttribute('x1')),
    options:document.querySelector('#clade-bar-alignment').value,gap:cladeBarGapReport()}));
  assert.equal(dated.mode,'time');assert.equal(dated.rootAge,2);assert.equal(dated.options,'aligned');
  assert.equal(new Set(dated.columns).size,1);assert.ok(dated.gap.valid);
  const nested=await runtime.renderer.render({...spec,clades:[...spec.clades,{mrca_of:['Alpha_longissima'],name:'Nested sample',color:'#009e73'}]});
  assert.ok(nested.report.clade_bar_spacing.valid);assert.ok(nested.report.safe_for_export);
  assert.ok(nested.report.clade_bar_spacing.groups.some(group=>group.alignment_column>0));
  if(process.argv[2])await writeFile(`${process.argv[2]}/04_验证报告.json`,JSON.stringify({cloudRequests:requests,errors,
    ordinary:rendered.report.clade_bar_spacing,dated,nested:nested.report.clade_bar_spacing},null,2));
  console.log('PASS cloud GUI near/aligned/restore, long-name reflow, immutable tree/time/statistics, ordinary and Dating, nested tiers, MCP enum/settings/SVG export');
} finally { await runtime.close(); }
