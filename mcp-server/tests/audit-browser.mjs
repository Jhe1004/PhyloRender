import assert from "node:assert/strict";
import {mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {createRuntime} from "../src/runtime.mjs";
import {FigureStore} from "../src/store.mjs";
const runtime=await createRuntime(), directory=await mkdtemp(path.join(os.tmpdir(),"phylorender-audit-"));
const evidence=process.env.PHYLORENDER_TEST_OUTPUT;
const results={}, requests=[];
const createPage=runtime.renderer.browser.newPage.bind(runtime.renderer.browser);
runtime.renderer.browser.newPage=async (...args)=>{
  const page=await createPage(...args);
  page.on("request",r=>{if(r.method()==="POST" && /\/api\/cloud-(date\/jobs|phyparts)$/.test(r.url()))requests.push(new URL(r.url()).pathname);});
  return page;
};
try {
  const dated="(O:4,((A:1,B:1):1,C:2):2);";
  const tree={name:"dated.tree",content:dated};
  await assert.rejects(runtime.renderer.render({workspace:"time",main_tree:{content:"(A[&height=5]:5,B:10)[&height=10];"}}),/非零末端年龄/);
  await assert.rejects(runtime.renderer.render({workspace:"time",main_tree:{content:"#NEXUS\nbegin trees;tree a=(A:1,B:1);tree b=(A:2,B:2);end;"}}),/多棵树/);
  await assert.rejects(runtime.renderer.render({workspace:"time",main_tree:{content:"((A:1,B:1)[&height=8]:1,C:2)[&height=2];"}}),/时间|年龄/);
  const valid=await runtime.renderer.render({workspace:"time",main_tree:tree,options:{time:{source_unit:"mya",age_source:"branch_lengths"}}});
  assert.equal(valid.report.topology_unchanged,true);
  assert.equal(valid.report.safe_for_export,true,"explicit branch-length ages are valid when the full chronogram is validated");
  assert.ok(valid.svg.includes("phylorender-build"));
  results.dating_rejected_invalid_and_recovered=true;
  const store=await new FigureStore(runtime.renderer,directory).initialize();
  const spec={workspace:"cloud",main_tree:tree,
    gene_trees:{content:"(O:.4,((A:.1,B:.1):.1,C:.2):.2);\n(O:.4,((A:.1,C:.1):.1,B:.2):.2);"},
    options:{cloud:{species_method:"dated",dated_unit:"mya",show_gene:false}}};
  const first=await store.create(spec), calls=requests.length;
  const second=await store.update(first.figureId,{options:{typography:{tips:{size_pt:19}}}},{expectedRevision:1});
  assert.equal(requests.length,calls,"font-only edits must not call scientific services");
  assert.equal(second.report.cloud.analysis_cache.hit,true);
  const third=await store.update(first.figureId,{options:{cloud:{pie_mode:"four"}}},{expectedRevision:2});
  assert.equal(requests.length,calls,"pie display mode must not call scientific services");
  assert.deepEqual(third.report.cloud.pie_nodes,first.report.cloud.pie_nodes);
  results.cache={scientific_requests_after_create:calls,after_font_and_pie_edits:requests.length};
  const page=await createPage({viewport:{width:1500,height:1000}});
  await page.goto(runtime.renderer.agentPageUrl);await page.evaluate(()=>PhyloRenderReady);
  await page.evaluate(spec=>PhyloRenderAgent.loadFigure(spec),{...spec,gene_trees:undefined});
  const rollback=await page.evaluate(async()=>{
    const before=state.cloud.speciesText;
    let rejected=false;
    try{await PhyloRenderImportCloudSpecies(new File(["(O:4,((A:1):1,C:2):2);"],"bad.tree"));}catch{rejected=true;}
    return {rejected,preserved:state.cloud.speciesText===before&&Boolean(state.cloud.speciesRoot)};
  });
  assert.deepEqual(rollback,{rejected:true,preserved:true});results.rollback=rollback;
  await page.close();
  for(const resource of [".env","AGENTS.md","tools/local_server.py","mcp-server/package.json",".git/config"])
    assert.equal((await fetch(new URL(resource,runtime.pageUrl))).status,404,resource);
  const wrongOrigin=await fetch(new URL("api/cloud-date",runtime.pageUrl),{method:"POST",
    headers:{"Content-Type":"application/json",Origin:"https://attacker.invalid"},body:"{}"});
  assert.equal(wrongOrigin.status,403);
  const simple=await fetch(new URL("api/cloud-date",runtime.pageUrl),{method:"POST",headers:{"Content-Type":"text/plain"},body:"{}"});
  assert.equal(simple.status,415);
  const wrongHost=await new Promise((resolve,reject)=>{
    const u=new URL(runtime.pageUrl),req=http.request({hostname:u.hostname,port:u.port,path:"/",headers:{Host:"attacker.invalid"}},res=>{res.resume();resolve(res.statusCode);});
    req.on("error",reject);req.end();
  });
  assert.equal(wrongHost,403);results.local_security=true;
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,"audit-browser.json"),JSON.stringify(results,null,2));
    await writeFile(path.join(evidence,"valid-dating.svg"),valid.svg);await writeFile(path.join(evidence,"valid-dating.png"),valid.png);}
  console.log(JSON.stringify(results,null,2));
} finally {await runtime.close();await rm(directory,{recursive:true,force:true});}
