import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readCases} from '../../evaluation/verify-cases.mjs';
import {createRuntime} from '../src/runtime.mjs';
const output=process.env.PHYLORENDER_TEST_OUTPUT;
if(output)await mkdir(output,{recursive:false});
const runtime=await createRuntime();
try {
 const fractional={workspace:'phylogeny',main_tree:{name:'synthetic-fractional.nwk',content:'((A:1,B:1)90:1,(C:1,D:1)80:1);'},options:{support:{scale:'percent'},layout:{automatic_tip_spacing:false,tip_spacing_u:13.37},output:{width_mm:180,dpi:300}}};
 const rows=[];
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const cases=[{id:'fractional',spec:fractional},...await readCases()];
 for(const item of cases){
  const result=await runtime.renderer.render(item.spec,{formats:['svg','png','preview']});
  const dims=bytes=>[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  const directory=output&&path.join(output,item.id);
  if(directory){await mkdir(directory);await writeFile(path.join(directory,'mcp.png'),result.png);await writeFile(path.join(directory,'source.svg'),result.svg);await writeFile(path.join(directory,'report.json'),JSON.stringify(result.report,null,2));}
  assert.deepEqual(dims(result.png),[result.report.output.png_width,result.report.output.png_height], 'PNG header must exactly match reported dimensions');
  assert.equal(result.report.output.rasterization.policy,'svg-software-canvas-v1');
  const page=runtime.renderer.workerPage;
  // Exercise the actual GUI download after changing its viewport. The export
  // must be independent of viewport clipping and use the same physical canvas.
  await page.setViewportSize({width:911,height:613});
  const event=page.waitForEvent('download');await page.evaluate(()=>exportPng());const download=await event;
  const gui=await readFile(await download.path());if(directory)await writeFile(path.join(directory,'gui.png'),gui);
  assert.deepEqual(dims(gui),dims(result.png));
  assert.deepEqual(gui,result.png,'GUI and MCP must encode exactly the same PNG bytes');
  const replay=await runtime.renderer.render(item.spec,{formats:['svg','png','preview']});
  assert.equal(replay.svg,result.svg,'Raster changes must not mutate the complete SVG');
  assert.deepEqual(replay.png,result.png,'Repeated full PNG must be byte-identical');
  assert.deepEqual(replay.preview,result.preview,'Repeated preview must be byte-identical');
  rows.push({id:item.id,dimensions:dims(gui),png_sha256:hash(gui),gui_mcp_png_exact:true,replay_exact:true});
 }
 if(output)await writeFile(path.join(output,'result.json'),JSON.stringify({browser:runtime.renderer.browser.version(),platform:process.platform,cases:rows},null,2));
 console.log(JSON.stringify({passed:true,cases:rows}));
}finally{await runtime.close();}
