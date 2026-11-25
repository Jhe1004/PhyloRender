import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {createRuntime, PROJECT_ROOT} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const output = process.env.PHYLORENDER_TEST_OUTPUT;
const refresh = process.argv.includes('--refresh-default');
const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage({viewport:{width:1800,height:1100}});
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {if (/\/api\/cloud-(date|phyparts)/.test(r.url())) requests.push(r.url());});
  await page.goto(runtime.demoPageUrl);
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  if (refresh) {
    const snapshotPath = path.join(PROJECT_ROOT,'defaults/cloud-workspace.local.js');
    const before = await readFile(snapshotPath,'utf8'), context = {};
    vm.runInNewContext(before, context);
    const example = context.PhyloRenderLocalCloudExample;
    const inputPath = process.env.PHYLORENDER_REFRESH_GENES_FILE;
    if (!inputPath) throw new Error('--refresh-default requires explicit PHYLORENDER_REFRESH_GENES_FILE');
    const raw = await readFile(inputPath,'utf8');
    const result = await page.evaluate(async ({raw, old}) => {
      const species = state.cloud.speciesRoot;
      const roots = [];
      for (const tree of PhyloRenderCloud.splitGeneTrees(raw)) {
        const root = parseNewick(tree), eligibility = PhyloRenderCloud.phyPartsEligibility(species, root, {rootPolicy:old.rootPolicy});
        if (!eligibility.accepted) continue;
        const out = PhyloRenderCloud.tips(root).find(t => t.label === eligibility.outgroup);
        roots.push(out && !PhyloRenderRooting.findMatchingRootChild(root,[out.id])
          ? PhyloRenderRooting.rerootOnTip(buildGraph(root),out.id) : root);
      }
      $('cloud-phyparts-field').value = old.supportField;
      $('cloud-phyparts-scale').value = old.supportScale;
      $('cloud-phyparts-threshold').value = old.threshold * 100;
      $('cloud-phyparts-root-policy').value = old.rootPolicy;
      $('cloud-pie-mode').value = 'two';
      const full = await runAutomaticPhyParts(species,roots,PhyloRenderCloud.sampleProfile(species).names);
      const table = PhyloRenderCloud.parsePhyPartsTable(full.table);
      const previous = state.cloud.phyPartsTable;
      for (const [id,row] of previous.rows) {
        const next = table.rows.get(id);
        for (const key of ['concordant','conflict','noSignal','informative','total'])
          if (next?.[key] !== row[key]) throw new Error(`旧统计不一致 ${id}/${key}`);
        if (JSON.stringify(next.names) !== JSON.stringify(row.names)) throw new Error(`样品集合不一致 ${id}`);
      }
      return full;
    }, {raw,old:example.phyPartsMeta});
    assert.equal(result.geneCount,example.phyPartsMeta.geneCount);
    assert.equal(result.mode,'four');
    // Generated cache only: retain every tree, age, audit and all other fields.
    example.phyPartsText = result.table;
    const {table, ...metadata} = result;
    example.phyPartsMeta = metadata;
    const after = `globalThis.PhyloRenderLocalCloudExample = ${JSON.stringify(example)};\n`;
    await writeFile(snapshotPath,after);
    if(output) {
      await writeFile(path.join(output,'01_默认示例完整节点表.tsv'),result.table);
      await writeFile(path.join(output,'02_真实重算记录.json'),JSON.stringify({
        inputPath,inputSHA256:createHash('sha256').update(raw).digest('hex'),
        beforeSHA256:createHash('sha256').update(before).digest('hex'),
        afterSHA256:createHash('sha256').update(after).digest('hex'),
        metadata,previousTotalsUnchanged:true,treesAndAgesUnchanged:true},null,2));
    }
    // The test runtime serves a frozen source copy. Do not reload its old cache.
    await page.evaluate(async result => {
      state.cloud.phyPartsText = result.table;
      state.cloud.phyPartsTable = PhyloRenderCloud.parsePhyPartsTable(result.table);
      state.cloud.phyPartsMeta = result;
      updateCloudStatus(); await renderCloudTree();
    }, result);
  }
  const fingerprint = () => page.evaluate(() => JSON.stringify({
    roots:[state.cloud.speciesRoot,...state.cloud.geneRoots],
    ages:[...state.cloud.datedAges].map(([r,a])=>[r.id,[...a].map(([n,v])=>[n.id,v])]),
    table:state.cloud.phyPartsTable&&[...state.cloud.phyPartsTable.rows],
    groups:[...state.cloud.cladeColors],hidden:[...state.cloud.hiddenPieNodes]}));
  const hasDefault = await page.evaluate(()=>!!state.cloud.speciesRoot);
  if(hasDefault) {
    assert.equal(await page.evaluate(()=>state.cloud.phyPartsTable.detailed),true,'default must keep full detail');
    const before = await fingerprint(), count = requests.length;
    await page.locator('[data-settings-target="labels"]').click();
    await page.locator('#cloud-pie-settings-section').evaluate(el=>el.open=true);
    for(const mode of ['four','two','four']) {
      await page.locator('#cloud-pie-mode').selectOption(mode);
      await settleFigure(page);
      assert.equal(await page.locator('#cloud-pie-mode').inputValue(),mode);
      assert.equal(await fingerprint(),before);
      assert.equal(requests.length,count,'composition switch must not start any analysis');
      assert.equal(await page.locator('.cloud-pie').count(),97);
      if(output) {
        const name = mode==='four'?'03_默认云树四部分':'04_默认云树两部分';
        const svg = await page.evaluate(()=>serializeRenderedSvg());
        await writeFile(path.join(output,`${name}.svg`),svg);
        const size = await page.evaluate(()=>state.currentSvgSize);
        const preview = await runtime.renderer.browser.newPage({viewport:{width:Math.ceil(size.width),height:Math.ceil(size.height)}});
        await preview.setContent(`<body style="margin:0">${svg}</body>`);
        await preview.evaluate(()=>document.fonts.ready);
        await preview.screenshot({path:path.join(output,`${name}.png`)});
        await preview.close();
      }
    }
  }
  // Exercise actual upload -> built-in analysis with default two-part display.
  await page.evaluate(()=>{ $('cloud-show-gene').checked=false; $('cloud-species-method').value='coalescent'; });
  const file = (name,text) => ({name,mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.locator('#cloud-species-file').setInputFiles(file('species.tree','(O,((A,B),C));'));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:120000});
  await page.evaluate(()=>{ $('cloud-pie-mode').value='two'; $('cloud-phyparts-scale').value='probability'; });
  await page.locator('#cloud-genes-file').setInputFiles(file('genes.trees',
    '(O,((A,B)1,C)1);\n(O,((A,C)1,B)1);\n(O,A,C);'));
  await page.waitForFunction(()=>!activeTreeLoad,null,{timeout:120000});
  assert.notEqual(await page.locator('#tree-loading').getAttribute('data-state'),'error',await page.locator('#tree-loading-detail').textContent());
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:120000});
  assert.equal(await page.evaluate(()=>state.cloud.phyPartsTable?.detailed),true);
  assert.equal(await page.locator('#cloud-pie-mode').inputValue(),'two');
  assert.equal(await page.evaluate(()=>state.cloud.phyPartsMeta.mode),'four');
  const before = await fingerprint(), count = requests.length;
  await page.locator('[data-settings-target="labels"]').click();
  await page.locator('#cloud-pie-settings-section').evaluate(el=>el.open=true);
  await page.locator('#cloud-pie-mode').selectOption('four');
  await settleFigure(page);
  assert.equal(await fingerprint(),before);
  assert.equal(requests.length,count);
  assert.match(await page.locator('#cloud-pie-composition-status').textContent(),/without recalculating|display|只改变显示/i);
  // Old manual tables remain supported, with an explicit reason, no fake detail.
  await page.locator('#cloud-phyparts-file').setInputFiles(file('old.tsv',
    'Node_ID\tconcordant_N\tconflict_total_N\tno_signal_N\tdescendant_samples\nN1\t1\t1\t1\tA;B\n'));
  await settleFigure(page);
  assert.equal(await page.locator('#cloud-pie-mode option[value="four"]').isDisabled(),true);
  assert.match(await page.locator('#cloud-pie-composition-status').textContent(),/legacy table lacks|two-part pies only|旧统计表缺少/i);
  assert.deepEqual(errors,[]);
  if(output)await writeFile(path.join(output,'05_界面验证.json'),JSON.stringify({hasDefault,errors,requests,passed:true},null,2));
  console.log('PASS complete four-category built-in counts even with two-part display, default four/two switching without analysis, old-table explanation, unchanged trees/ages/groups/statistics');
} finally {await runtime.close();}
