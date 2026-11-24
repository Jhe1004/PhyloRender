import units from "../../figure-units.js";
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRuntime} from '../src/runtime.mjs';
import {figureSpecSchema} from '../src/schemas.mjs';
import {settleFigure} from './settle-figure.mjs';

const output=process.env.PHYLORENDER_TEST_OUTPUT;
if(output)await mkdir(output,{recursive:true});
const runtime=await createRuntime(),records=[],errors=[],posts=[];
const main='(O:70,((A:20,B:20):20,(C:30,D:30):10):30);';
const secondary='(O:70,((A:20,C:20):20,(B:30,D:30):10):30);';
const spec=workspace=>({workspace,main_tree:{name:'primary.tree',content:main},
  ...(workspace==='conflict'?{comparison_tree:{name:'secondary.tree',content:secondary}}:{}),
  options:{layout:{automatic_tip_spacing:false,tip_spacing_em:18/17},typography:{tips:{size_pt:12.75}},
    ...(workspace==='cloud'?{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false}}:{}),
    ...(workspace==='time'?{time:{source_unit:'mya'}}:{})}});
const check=async(name,fn)=>{console.log('CHECK',name);try{const detail=await fn();records.push({name,passed:true,...detail});}
  catch(error){records.push({name,passed:false,message:error.message,code:error.code});}};
try{
  let page;
  const freshPage=async()=>{
    await page?.close();page=await runtime.renderer.browser.newPage({viewport:{width:1500,height:1050}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);});
    await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderAgent.ready());
  };
  await freshPage();
  const canonical=svg=>page.evaluate(svg=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');doc.querySelectorAll('metadata').forEach(n=>n.remove());
    const visit=n=>n.nodeType===1?{tag:n.tagName,attributes:Object.fromEntries([...n.attributes].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>{
      const value=a.name==='style'?[...n.style].sort().map(p=>[p,n.style.getPropertyValue(p),n.style.getPropertyPriority(p)]):a.value;
      return [a.name,value];})),children:[...n.childNodes].map(visit)}:{type:n.nodeType,text:n.textContent};
    return JSON.stringify(visit(doc.documentElement));
  },svg);
  const same=async(name,a,b)=>{
    if(a!==b&&output){let i=0;while(i<Math.min(a.length,b.length)&&a[i]===b[i])i++;
      await writeFile(`${output}/${name}-diff.json`,JSON.stringify({i,left:a.slice(i,i+700),right:b.slice(i,i+700)},null,2));}
    const sha=t=>createHash('sha256').update(t).digest('hex');assert.equal(sha(a),sha(b),name);
  };
  const load=async s=>{await settleFigure(page);const result=await page.evaluate(s=>PhyloRenderAgent.loadFigure(s),s);await settleFigure(page);return result;};
  for(const workspace of ['phylogeny','time','cloud','conflict'])await check(`F01-${workspace}`,async()=>{
    await load(spec(workspace));
    assert.equal(await page.evaluate(()=>terminalSpacing()),18);
    await page.locator('[data-settings-target="tips"]').click();
    await page.locator('#tip-font-size-number').evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
    await page.locator('#tip-font-size-number').fill(String(units.ptToDrawing(16.5)));await page.locator('#tip-font-size-number').press('Tab');await settleFigure(page);
    await page.evaluate(()=>renderTree());await settleFigure(page);
    const configuration=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());
    figureSpecSchema.parse(configuration);
    assert.ok(Math.abs(configuration.options.layout.tip_spacing_u-units.designToDrawing(18))<1e-8);
    assert.equal(configuration.options.layout.tip_spacing_em,undefined);
    const geometry=await canonical(await page.evaluate(()=>serializeRenderedSvg()));
    const returned=await load(configuration);
    await same(workspace+'-GUI-round-trip',await canonical(returned.svg),geometry);
    const mcp=await runtime.renderer.render(configuration);
    await same(workspace+'-web-MCP',await canonical(mcp.svg),geometry);
    assert.equal(mcp.report.topology_unchanged,true);
    if(output){await writeFile(`${output}/${workspace}-spacing.svg`,mcp.svg);await writeFile(`${output}/${workspace}-spacing.png`,mcp.preview);}
    return {spacing_px:18,font_pt:16.5,gui_round_trip:true,web_mcp_exact:true};
  });
  await check('F01-schema-boundaries',async()=>{
    for(const value of [4.5,17.125,72]){
      const s=spec('phylogeny');delete s.options.layout.tip_spacing_em;s.options.layout.tip_spacing=value;
      figureSpecSchema.parse(s);await load(s);
      assert.equal(await page.evaluate(()=>terminalSpacing()),value);
      assert.ok(Math.abs((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).options.layout.tip_spacing_u-units.designToDrawing(value))<1e-8);
    }
    for(const value of [4.49,72.01])assert.throws(()=>figureSpecSchema.parse({...spec('phylogeny'),options:{layout:{tip_spacing:value}}}));
    return {fractional_and_bounds:true};
  });
  await check('F02-real-keyboard-titles',async()=>{
    await freshPage();
    await load(spec('conflict'));
    await page.locator('[data-settings-target="data"]').click();
    await page.locator('#conflict-primary-title').evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
    const before=await page.evaluate(()=>JSON.stringify([state.conflict.nuclearRoot,state.conflict.plastidRoot]));
    const previousPosts=posts.length,typing=[];
    for(const delay of [0,30,100])for(const [id,title,index] of [['conflict-primary-title',`Species tree ${delay}`,0],['conflict-secondary-title',`Gene tree ${delay}`,1]]){
      await page.locator(`#${id}`).click();await page.locator(`#${id}`).press('ControlOrMeta+A');await page.keyboard.type(title,{delay});await settleFigure(page);
      const actual=await page.evaluate(({id,index})=>({value:$(id).value,title:document.querySelectorAll('.conflict-tree-title')[index]?.textContent,
        focus:document.activeElement.id,inert:document.querySelector('main').inert,loading:!$('tree-loading').hidden}),{id,index});
      assert.equal(actual.value,title);assert.equal(actual.title,title);assert.equal(actual.focus,id);
      assert.equal(actual.inert,false);assert.equal(actual.loading,false);typing.push({delay,id,...actual});
    }
    assert.equal(await page.evaluate(()=>JSON.stringify([state.conflict.nuclearRoot,state.conflict.plastidRoot])),before);
    assert.equal(posts.length,previousPosts);
    if(output)await page.screenshot({path:`${output}/keyboard-titles.png`});
    return {typing,scientific_input_unchanged:true,no_native_requests:true};
  });
  await check('F03-English-auto-legends',async()=>{
    await freshPage();
    await load(spec('conflict'));
    const texts=await page.locator('#tree-svg text').allTextContents();
    assert(!texts.some(t=>/[\u3400-\u9fff]/u.test(t)));assert(texts.some(t=>t.startsWith('Primary-tree clade ')));
    if(output){await writeFile(`${output}/english-legends.svg`,await page.evaluate(()=>serializeRenderedSvg()));await page.screenshot({path:`${output}/english-legends.png`});}
    return {english_automatic_legend:true};
  });
  await check('F04-MCMCtree-HPD',async()=>{
    await freshPage();
    const s=spec('time');s.main_tree.content='(O:70,((A:20,B:20)[&95%HPD={15,25}]:20,(C:30,D:30):10):30)[&95%HPD={60,80}];';
    await load(s);
    assert.equal(await page.evaluate(()=>buildTimeTreeProfile(state.root).hpdCount),2);
    assert.equal(await page.locator('.time-hpd').count(),2);
    assert.equal(await page.evaluate(()=>buildTimeTreeProfile(state.root).rootAge),70);
    const config=await page.evaluate(()=>PhyloRenderAgent.exportConfiguration());assert.equal(config.main_tree.content,s.main_tree.content);
    const web=await canonical(await page.evaluate(()=>serializeRenderedSvg())),mcp=await runtime.renderer.render(config);
    await same('HPD-web-MCP',await canonical(mcp.svg),web);assert.equal(mcp.report.topology_unchanged,true);
    if(output){await writeFile(`${output}/mcmctree-hpd.svg`,mcp.svg);await writeFile(`${output}/mcmctree-hpd.png`,mcp.preview);}
    for(const interval of ['{80,60}','{NaN,80}','{-1,80}','{60}','{60,70,80}']){
      const bad=structuredClone(s);bad.main_tree.content=`(A:70,B:70)[&95%HPD=${interval}];`;
      await assert.rejects(()=>page.evaluate(s=>PhyloRenderAgent.loadFigure(s),bad),/HPD/);
      assert.equal((await page.evaluate(()=>PhyloRenderAgent.exportConfiguration())).main_tree.content,s.main_tree.content,'rejected input rolls back original');
    }
    return {hpd_count:2,root_age:70,raw_preserved:true,web_mcp_exact:true,reused_worker_no_stale_diagnostics:true,invalid_hpd_rollback:true};
  });
  assert.deepEqual(errors,[]);
}finally{
  await runtime.close();
  const result={passed:records.every(r=>r.passed),records,browser_errors:errors};
  if(output)await writeFile(`${output}/results.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}
