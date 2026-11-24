import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({viewport:{width:1800,height:1100}});
  const errors = [], requests = [], reports = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/api\/cloud-(date|phyparts)/.test(r.url()))requests.push(r.url());});
  const fingerprint = () => page.evaluate(()=>JSON.stringify({roots:[state.cloud.speciesRoot,...state.cloud.geneRoots],
    ages:[...state.cloud.datedAges].map(([r,a])=>[r.id,[...a].map(([n,v])=>[n.id,v])]),
    statistics:state.cloud.phyPartsTable&&[...state.cloud.phyPartsTable.rows],
    groups:[...state.cloud.cladeColors]}));
  const pies = () => page.locator('.cloud-pie').evaluateAll(els=>els.map(e=>({id:e.dataset.phypartsNode,
    age:Number(e.dataset.pieNodeAge),rootAge:Number(e.dataset.pieRootAge),basis:e.dataset.pieSizeBasis,
    target:Number(e.dataset.pieTargetRadius),radius:Number(e.dataset.pieRadius),
    x:Number(e.dataset.pieX),y:Number(e.dataset.pieY),fractions:e.querySelectorAll('path').length})));
  const audit = async name => {
    const rows = await pies(); assert.ok(rows.length>0);
    const maximum = Number(await page.locator('#cloud-pie-radius').inputValue());
    for (const p of rows) {
      assert.equal(p.basis,'relative-node-age');
      const youngest=Math.max(8,maximum*0.55);
      const expected=youngest+(maximum-youngest)*Math.max(0,Math.min(1,p.age/p.rootAge));
      assert.ok(Math.abs(p.target-expected)<.006);
      assert.ok(p.radius>=8&&p.radius<=p.target+.011);
    }
    const ordered=[...rows].sort((a,b)=>a.age-b.age);
    ordered.forEach((p,i)=>{if(i)assert.ok(p.target>=ordered[i-1].target);});
    reports.push({name,pies:rows});return rows;
  };
  const exportPreview = async name => {
    if(!process.argv[2])return;
    const svg=await page.evaluate(()=>serializeRenderedSvg());
    await writeFile(`${process.argv[2]}/${name}.svg`,svg);
    const size=await page.evaluate(()=>state.currentSvgSize);
    const preview=await runtime.renderer.browser.newPage({viewport:{width:Math.ceil(size.width),height:Math.ceil(size.height)}});
    await preview.setContent(`<body style="margin:0">${svg}</body>`);await preview.evaluate(()=>document.fonts.ready);
    const meta=await preview.locator('.cloud-pie').evaluateAll(els=>els.map(e=>({basis:e.dataset.pieSizeBasis,r:Number(e.dataset.pieRadius)})));
    assert.ok(meta.length>0);meta.forEach(p=>{assert.equal(p.basis,'relative-node-age');assert.ok(p.r>=8);});
    await preview.screenshot({path:`${process.argv[2]}/${name}.png`});await preview.close();
  };
  await page.goto(runtime.demoPageUrl);await page.evaluate(()=>window.PhyloRenderReady);
  if(await page.evaluate(()=>Boolean(state.cloud.phyPartsTable))) {
    const before=await fingerprint(); await audit('default real cloud'); await exportPreview('01_默认真实云树_时间缩放');
    if(await page.evaluate(()=>state.cloud.phyPartsTable.detailed)) {
      await page.evaluate(async ()=>{$('cloud-pie-mode').value='four';await renderCloudTree();});
      await audit('default four-part cloud');await exportPreview('02_真实云树_四部分');
    }else reports.push({name:'default four-part cloud',skipped:'Default statistics only contain two categories; no counts fabricated.'});
    assert.equal(await fingerprint(),before);
  }
  const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.evaluate(()=>{$('cloud-show-gene').checked=false;setSettingsPage('data');});
  await page.locator('#cloud-input-section > summary').click();
  await page.locator('#cloud-species-method').selectOption('dated');
  await page.locator('#cloud-species-file').setInputFiles(file('age-sizing.nwk','(O:20,((A:2,B:2):17,(C:17,D:17):2):1);'));
  await page.locator('#tree-loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>state.cloud.speciesName==='age-sizing.nwk');
  await page.locator('#cloud-phyparts-file').setInputFiles(file('statistics.tsv',
    'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\n'+
    'Young\t6\t2\t1\t1\tA;B\nOld\t5\t2\t1\t2\tC;D\nCrown\t4\t3\t1\t2\tA;B;C;D\n'));
  await page.waitForFunction(()=>document.querySelectorAll('.cloud-pie').length===3);
  const before=await fingerprint();
  for(const shape of ['triangular','rectangular'])for(const mode of ['two','four']) {
    await page.evaluate(async ({shape,mode})=>{$('cloud-species-shape').value=shape;$('cloud-pie-mode').value=mode;await renderCloudTree();},{shape,mode});
    const rows=await audit(`${shape}/${mode}`), young=rows.find(p=>p.id==='Young'),old=rows.find(p=>p.id==='Old');
    assert.equal(young.target,19.04);assert.equal(old.target,29.84);
    assert.ok(old.target>young.target,'equal descendant counts cannot force equal sizes');
    assert.ok(old.radius>young.radius,'the isolated older fixture remains visually larger');
    assert.equal(await fingerprint(),before);
    if(mode==='two')await exportPreview(shape==='triangular'?'03_相同样品数_不同时间':'04_直角树_时间缩放');
    if(mode==='four'&&shape==='triangular')await exportPreview('02_四部分时间缩放样例');
  }
  const all=await pies();
  await page.evaluate(async ()=>{state.cloud.hiddenPieNodes.add('Young');await renderCloudTree();});
  assert.deepEqual(await pies(),all.filter(p=>p.id!=='Young'),'manual hiding cannot resize neighbouring pies');
  await page.evaluate(()=>{state.cloud.hiddenPieNodes.clear();$('cloud-pie-age-minimum').value='10';commitCloudPieAgeRangeInputs();});
  assert.deepEqual(await pies(),all.filter(p=>p.age>=10),'filtering cannot renormalize sizes to visible ages');
  assert.equal(await fingerprint(),before);
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  if(process.argv[2])await writeFile(`${process.argv[2]}/05_验证报告.json`,JSON.stringify({reports,errors,requests},null,2));
  console.log('PASS time-based pie size, real cloud and four-part fixture SVG, equal taxa different ages, triangular/rectangular, age filtering/hiding stability, immutable trees/dates/statistics/groups');
}finally{await runtime.close();}
