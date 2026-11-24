// Bounded visual-change gate for omitting microscopic Holocene labels.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRuntime} from '../src/runtime.mjs';

const baselineRoot = process.argv[2];
const output = process.argv[3];
assert.ok(baselineRoot && output, 'Usage: node tests/geologic-callout-equivalence.mjs BASELINE_ROOT EVIDENCE_DIR');
const baselineModule = await import(pathToFileURL(path.resolve(baselineRoot, 'mcp-server/src/runtime.mjs')));
await mkdir(output, {recursive:true});
const tree = '(O:0.23,((A:0.1,B:0.12)90:0.11,(C:0.09,D:0.13)80:0.08)85:0.1);';
const dated = '(O:73.5,((A:12,B:12)[&height=12,height_95%_HPD={9,15}]:32,(C:21,D:21)[&height=21,height_95%_HPD={18,25}]:23)[&height=44]:29.5)[&height=73.5];';
const secondary = '(O:0.2,((A:0.09,C:0.13)96/98:0.1,(B:0.12,D:0.14)70/85:0.12)90/99:0.07);';
const common = {tip_label_overrides:{A:'Alpha alpha', B:'Beta beta'}, clades:[{mrca_of:['A','B'],name:'Example',color:'#0072b2'}]};
const counts = 'Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\nN1\t6\t2\t1\t1\tA;B\nN2\t5\t2\t1\t2\tC;D\nN3\t4\t3\t1\t2\tA;B;C;D\n';
const cloudReference = {...common,workspace:'cloud',main_tree:{name:'dated.tree',content:dated},
  phyparts_table:{name:'explicit-counts.tsv',content:counts}};
const cases = [
  {name:'ordinary', spec:{...common, workspace:'phylogeny', main_tree:{name:'main.tree',content:tree}}},
  {name:'dating', spec:{...common, workspace:'time',main_tree:{name:'dated.tree',content:dated},options:{time:{source_unit:'mya'}}}},
  {name:'dating-converted', spec:{...common,workspace:'time',main_tree:{name:'dated.tree',content:dated},
    options:{time:{source_unit:'mya',display_unit:'kyr',age_minimum:15,age_maximum:50,hpd_scope:'named_clades'}}}},
  {name:'dating-large-fonts', spec:{...common,workspace:'time',main_tree:{name:'dated.tree',content:dated},
    options:{time:{source_unit:'mya',period_size_pt:18,epoch_size_pt:15,axis_size_pt:17,legend_size_pt:12,unit_size_pt:13,key_size_pt:11,hpd_marker:'height_mean'}}}},
  {name:'dating-unconfirmed', spec:{workspace:'time',main_tree:{name:'dated.tree',content:dated},
    options:{time:{source_unit:'unconfirmed',show_node_ages:false},labels:{node_arrows:false}}}},
  {name:'conflict', spec:{workspace:'conflict',main_tree:{name:'main.tree',content:tree},comparison_tree:{name:'other.tree',content:secondary}}},
  {name:'conflict-union-circle',spec:{...common,workspace:'conflict',
    main_tree:{name:'left.tree',content:'(O:0.2,((A:0.1,B:0.12)1.0/100:0.1,(C:0.09,X:0.13)0.8/91:0.1)1.0/100:0.1);'},
    comparison_tree:{name:'right.tree',content:'(O:0.2,((A:0.1,C:0.1)1.0/100:0.1,(B:0.1,Y:0.1)0.7/80:0.1)1.0/100:0.1);'},
    options:{conflict:{sample_policy:'union',primary_title:'Nuclear reference',secondary_title:'Plastid comparison'},support:{full_support_marker:'circle'},
      typography:{tips:{size_pt:18,bold:true,italic_mode:'auto'}}}}},
  {name:'conflict-fields-star',spec:{...common,workspace:'conflict',main_tree:{name:'main.tree',content:tree},
    comparison_tree:{name:'other.tree',content:secondary.replaceAll('96/98','1.0/100')},
    options:{conflict:{primary_support_field:'field:0',secondary_support_field:'field:1',primary_ladder:'large-top'},
      support:{full_support_marker:'star',decimals:2,low_support_threshold:85},typography:{nodes:{italic:true,bold:false}}}}},
  {name:'conflict-hidden-no-arrows',spec:{workspace:'conflict',main_tree:{name:'main.tree',content:tree.replaceAll('90','100')},
    comparison_tree:{name:'other.tree',content:secondary.replaceAll('96/98','1/100')},
    options:{support:{full_support_marker:'hide'},labels:{node_arrows:false},typography:{tips:{italic_mode:'none'}}}}},
  {name:'conflict-polytomy-numbers',spec:{workspace:'conflict',
    main_tree:{name:'multi.tree',content:'(O:1,(A:1,B:1,C:1)100:1,(D:1,E:1)85:1);'},
    comparison_tree:{name:'multi-other.tree',content:'(O:1,(A:1,C:1)100:1,(B:1,D:1,E:1)0.87:1);'},
    options:{conflict:{primary_ladder:'small-top'},support:{full_support_marker:'number'},
      typography:{tips:{italic_mode:'all'},nodes:{preferred_size_pt:16,minimum_size_pt:10}}}}},
  {name:'conflict-font-floor',spec:{workspace:'conflict',main_tree:{name:'main.tree',content:tree},comparison_tree:{name:'other.tree',content:secondary},
    options:{typography:{nodes:{preferred_size_pt:7,minimum_size_pt:12}},layout:{node_radius_pt:6}}}},
  {name:'cloud', spec:{...common, workspace:'cloud',main_tree:{name:'dated.tree',content:dated},
    gene_trees:{name:'genes.trees',content:tree+'\n'+secondary},
    options:{cloud:{species_method:'dated',dated_unit:'mya',genes_method:'ml',pie_mode:'four'}}}},
  {name:'cloud-four-rectangular',spec:{...cloudReference,
    options:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false,show_time_axis:true,species_shape:'rectangular',pie_mode:'four'},time:{geology:'standard'}}}},
  {name:'cloud-two-filtered',spec:{...cloudReference,
    options:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false,pie_mode:'two',pie_age_minimum:15,pie_age_maximum:50,hidden_pies:[['C','D']],ladderize:'large-top'}}}},
  {name:'cloud-gene-only',spec:{workspace:'cloud',main_tree:{name:'dated.tree',content:dated},
    gene_trees:{name:'genes.trees',content:tree+'\n'+secondary},
    options:{cloud:{species_method:'dated',dated_unit:'mya',genes_method:'ml',show_species:false,show_pies:false,ladderize:'large-top'}}}},
  {name:'cloud-large-fonts',spec:{...cloudReference,
    options:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false,show_time_axis:true,pie_mode:'four'},
      time:{geology:'standard',period_size_pt:24,epoch_size_pt:24,axis_size_pt:24,legend_size_pt:24,unit_size_pt:24,key_size_pt:24}}}},
  {name:'cloud-illustrative-species',spec:{...common,workspace:'cloud',main_tree:{name:'dated.tree',content:dated},
    options:{cloud:{species_method:'dated',dated_unit:'unconfirmed',show_gene:false,show_pies:false,show_time_axis:true},time:{geology:'standard'}}}},
  ...['phylogeny','time','conflict','cloud'].map(workspace=>({name:workspace+'-name-format',spec:{
    workspace,main_tree:{name:'main.tree',content:workspace==='time'||workspace==='cloud'?dated:tree},
    ...(workspace==='conflict'?{comparison_tree:{name:'secondary.tree',content:secondary}}:{}),
    ...(workspace==='cloud'?{phyparts_table:{name:'counts.tsv',content:counts}}:{}),
    tip_label_overrides:{A:'Clematis alpha subsp. minor (L.) Test',B:'Salix × beta L.',C:'Genus sp. voucher 123'},
    options:{typography:{tips:{family:'Arial',size_pt:16.5,bold:true,italic_mode:'auto',normalize_ranks:true}},
      ...(workspace==='time'?{time:{source_unit:'mya'}}:{}),
      ...(workspace==='cloud'?{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false,pie_mode:'four'}}:{})}
  }}))
];
let before, after;
const results = [];
try {
  before = await baselineModule.createRuntime();
  after = await createRuntime();
  let page = await after.renderer.browser.newPage();
  const canonical = (source, mode = 'full') => page.evaluate(({text,mode}) => {
    const document = new DOMParser().parseFromString(text, 'image/svg+xml');
    document.querySelectorAll('metadata').forEach(element => element.remove());
    if (mode === 'outside-geology') document.querySelectorAll('.time-geology').forEach(element => element.remove());
    if (mode === 'geology-geometry') {
      const allowed = ['class','x','y','width','height','fill','rx'];
      return JSON.stringify([...document.querySelectorAll('.time-background,.time-geo-block')].map(element => ({
        tag:element.tagName, attributes:Object.fromEntries(allowed.filter(name=>element.hasAttribute(name)).map(name=>[name,element.getAttribute(name)])),
        title:element.querySelector('title')?.textContent || '',
      })));
    }
    if (mode === 'callout-audit') return JSON.stringify({
      leaders:document.querySelectorAll('.time-geo-callout-leader').length,
      external:[...document.querySelectorAll('.time-geo-label.external-label')].map(element=>element.dataset.fullName),
      externalText:[...document.querySelectorAll('.time-geo-label.external-label')].map(element=>element.textContent.trim()),
      arrowPaths:[...document.querySelectorAll('path.time-geo-callout-leader')].map(element=>element.getAttribute('d')),
      forced:document.querySelectorAll('.time-geo-label.minimum-label').length,
      holocenePlacements:[...document.querySelectorAll('.time-geo-block[data-full-name="Holocene"]')].map(element=>element.dataset.labelPlacement),
      holoceneText:[...document.querySelectorAll('.time-geo-label[data-full-name="Holocene"]')].map(element=>element.textContent.trim()),
    });
    const visit = node => node.nodeType === 1 ? {
      tag:node.tagName,
      attributes:Object.fromEntries([...node.attributes].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value])),
      children:[...node.childNodes].map(visit)
    } : {type:node.nodeType,text:node.textContent};
    return JSON.stringify(visit(document.documentElement));
  }, {text:source,mode});
  const sha = value => createHash('sha256').update(value).digest('hex');
  for (const item of cases) {
    // The new name fixtures each get a fresh private workspace. Retain the
    // baseline busy-load failure in evidence; do not retry a failed comparison
    // or ignore any SVG/PNG attribute to force equivalence.
    if(item.name.endsWith('-name-format')){
      await Promise.all([before.close(),after.close()]);
      before=await baselineModule.createRuntime();
      after=await createRuntime();
      page=await after.renderer.browser.newPage();
    }
    console.log(`Comparing baseline/current: ${item.name}`);
    const left = await before.renderer.render(item.spec);
    const right = await after.renderer.render(item.spec);
    const a = await canonical(left.svg), b = await canonical(right.svg);
    await writeFile(path.join(output, `${item.name}-baseline.svg`), left.svg);
    await writeFile(path.join(output, `${item.name}-current.svg`), right.svg);
    await writeFile(path.join(output, `${item.name}-current.png`), right.preview);
    await writeFile(path.join(output, `${item.name}-spec.json`), JSON.stringify(item.spec,null,2));
    if (a !== b) {
      let index=0; while(index<Math.min(a.length,b.length)&&a[index]===b[index]) index++;
      await writeFile(path.join(output, `${item.name}-difference.json`), JSON.stringify({index,before:a.slice(index,index+1000),after:b.slice(index,index+1000)},null,2));
    }
    const geological = JSON.parse(await canonical(right.svg,'geology-geometry')).length > 0;
    if (!geological) {
      assert.equal(sha(a),sha(b),`${item.name}: unaffected SVG must match exactly`);
      assert.equal(sha(left.png),sha(right.png),`${item.name}: unaffected PNG must match exactly`);
    } else {
      assert.equal(await canonical(left.svg,'outside-geology'),await canonical(right.svg,'outside-geology'),`${item.name}: content outside the geological layer must match`);
      assert.equal(await canonical(left.svg,'geology-geometry'),await canonical(right.svg,'geology-geometry'),`${item.name}: geological boundaries, colors and backgrounds must match`);
      const audit=JSON.parse(await canonical(right.svg,'callout-audit'));
      assert.equal(audit.leaders,0,`${item.name}: microscopic Holocene must not use an external callout`);
      assert.deepEqual(audit.external,[],`${item.name}: all visible abbreviations must remain inside their blocks`);
      assert.deepEqual(audit.externalText,[],`${item.name}: no geological full name may be detached from its block`);
      assert.equal(audit.arrowPaths.length,0,`${item.name}: omitted Holocene must not use a vector arrow`);
      assert.equal(audit.forced,0,`${item.name}: no label may remain forced inside a microscopic block`);
      assert.ok(audit.holocenePlacements.length>0 && audit.holocenePlacements.every(value=>value==='omitted'),
        `${item.name}: microscopic Holocene blocks must be marked omitted`);
      assert.deepEqual(audit.holoceneText,[],`${item.name}: microscopic Holocene must not emit text`);
    }
    assert.equal(right.report.topology_unchanged,true);
    results.push({name:item.name,geological,exact_svg:sha(a)===sha(b),exact_png:sha(left.png)===sha(right.png),
      outside_geology_exact:geological?await canonical(left.svg,'outside-geology')===await canonical(right.svg,'outside-geology'):true,
      geology_geometry_exact:geological?await canonical(left.svg,'geology-geometry')===await canonical(right.svg,'geology-geometry'):true,
      canonical_svg_sha256:sha(b),png_sha256:sha(right.png),report:right.report});
  }
  await writeFile(path.join(output,'equivalence.json'),JSON.stringify({passed:true,baseline:path.resolve(baselineRoot),
    contract:'ordinary/conflict exact; Dating/cloud exact outside time-geology; geological rectangles exact; microscopic Holocene omitted',cases:results},null,2));
  console.log('GEOLOGIC_CALLOUT_EQUIVALENCE_PASSED');
} finally {
  await Promise.all([before?.close(),after?.close()]);
}
