import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import {settleFigure} from './settle-figure.mjs';

const pairs=Array.from({length:32},(_,i)=>[`Taxon_alpha_${i*2+1}`,`Taxon_alpha_${i*2+2}`]);
const tree=`(Outgroup_2024:4,(${pairs.map(p=>`(${p[0]}:1,${p[1]}:1):1`).join(',')}):2);`;
const table='Node_ID\tconcordant_N\tdominant_conflict_N\tother_conflict_N\tno_signal_N\tdescendant_samples\n'
  +pairs.map((p,i)=>`N${i+1}\t6\t2\t1\t1\t${p.join(';')}`).join('\n');
const upload=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
const runtime=await createRuntime(),evidence=process.argv[2];
try{
  const page=await runtime.renderer.browser.newPage({viewport:{width:1800,height:1100}}),errors=[],science=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/api\/cloud-(date|phyparts)/.test(r.url()))science.push(r.url());});
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
  assert.equal(await page.locator('#cloud-pie-legend-position').inputValue(),'lower-left','fresh GUI default');
  await page.locator('[data-workspace-mode="cloud"]').click();
  await page.getByRole('button',{name:'Data',exact:true}).click();
  await page.locator('#cloud-input-section').evaluate(el=>el.open=true);
  await page.locator('#cloud-species-method').selectOption('dated');
  await page.locator('#cloud-dated-unit').selectOption('mya');
  await page.getByRole('button',{name:'Layout',exact:true}).click();
  await page.locator('#cloud-background-section').evaluate(el=>el.open=true);
  await page.locator('#cloud-show-gene').uncheck();await settleFigure(page);
  await page.locator('#cloud-species-file').setInputFiles(upload('dated.tree',tree));
  await page.locator('#tree-loading').waitFor({state:'hidden',timeout:120000});
  await page.locator('#cloud-phyparts-file').setInputFiles(upload('counts.tsv',table));
  await page.waitForFunction(()=>state.cloud.phyPartsTable&&!activeTreeLoad);await settleFigure(page);
  const snapshot=()=>page.evaluate(()=>JSON.stringify({root:state.cloud.speciesRoot,
    ages:[...state.cloud.datedAges.get(state.cloud.speciesRoot)],table:[...state.cloud.phyPartsTable.rows],
    branches:document.querySelector('.cloud-species-tree').outerHTML,pies:document.querySelector('.cloud-pies').outerHTML}));
  const before=await snapshot();
  const location=()=>page.evaluate(()=>{
    const svg=$('tree-svg').getBoundingClientRect(),key=$('cloud-pie-legend-layer').getBoundingClientRect();
    return {x:(key.left-svg.left)/svg.width,y:(key.top-svg.top)/svg.height,
      right:(key.right-svg.left)/svg.width,bottom:(key.bottom-svg.top)/svg.height};
  });
  const lower=await location();assert.ok(lower.y>.6,JSON.stringify(lower));assert.ok(lower.x<.3);
  assert.ok(lower.right<=1&&lower.bottom<=1,'whole key stays inside the canvas');
  const config=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  assert.equal(config.options.cloud.pie_legend_position,'lower-left');
  const web=await page.evaluate(()=>serializeRenderedSvg());
  const canonical=source=>page.evaluate(text=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');assertXml(doc);
    function assertXml(d){if(d.querySelector('parsererror'))throw Error('SVG_PARSE_FAILED');}
    doc.querySelectorAll('metadata#phylorender-build').forEach(n=>n.remove());
    const visit=n=>n.nodeType===1?{tag:n.tagName,attrs:[...n.attributes].map(a=>[a.name,a.value]).sort(),children:[...n.childNodes].map(visit)}:{type:n.nodeType,text:n.textContent};
    return JSON.stringify(visit(doc.documentElement));
  },source);
  const rendered=await runtime.renderer.render(config,{formats:evidence?['svg','png']:['svg']});
  assert.equal(await canonical(rendered.svg),await canonical(web),'same effective GUI and MCP configuration');
  const fresh={...config,options:{...config.options,cloud:{...config.options.cloud}}};delete fresh.options.cloud.pie_legend_position;
  const defaultRender=await runtime.renderer.render(fresh);
  assert.equal(defaultRender.normalizedSpec.options.cloud.pie_legend_position,'lower-left');
  assert.equal(await canonical(defaultRender.svg),await canonical(web),'omitting position uses the same lower-left default');
  await page.getByRole('button',{name:'Annotations',exact:true}).click();
  await page.locator('#cloud-pie-settings-section').evaluate(el=>el.open=true);
  await page.locator('#cloud-pie-legend-position').selectOption('auto');await settleFigure(page);
  const automatic=await location();assert.ok(automatic.y<lower.y-.2);
  assert.equal(await snapshot(),before,'moving the key cannot change branches, pies, ages or statistics');
  const oldConfig=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
  await page.evaluate(input=>PhyloRenderAgent.loadFigure(input),oldConfig);await settleFigure(page);
  assert.equal(await page.locator('#cloud-pie-legend-position').inputValue(),'auto','explicit old configuration survives');
  await page.locator('#cloud-pie-legend-position').selectOption('lower-left');await settleFigure(page);
  assert.deepEqual(await location(),lower);assert.equal(await snapshot(),before);
  assert.deepEqual(science,[],'legend placement never starts a scientific calculation');assert.deepEqual(errors,[]);
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,'web.svg'),web);
    await writeFile(path.join(evidence,'mcp.svg'),rendered.svg);await writeFile(path.join(evidence,'mcp.png'),rendered.png);
    await writeFile(path.join(evidence,'report.json'),JSON.stringify({lower,automatic,report:rendered.report},null,2));}
  console.log('CLOUD_LEGEND_DEFAULT_PASSED: lower-left default, explicit positions, GUI/MCP equality and unchanged science');
}finally{await runtime.close();}
