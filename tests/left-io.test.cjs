const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
test('import and export live only in the left workbench, across all modes',()=>{
 const header=html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)[0];
 assert.doesNotMatch(header,/header-actions|header-import|header-cloud-import|header-conflict-import|export-svg|export-png|export-a4|tree-file/);
 assert.match(html,/data-settings-target="data"[^>]*>Data<\/button>/);
 assert.match(html,/data-settings-target="export"[^>]*>Export<\/button>/);
 const aside=html.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)[0];
 const exports=aside.match(/<section id="figure-export-section"[^>]*>[\s\S]*?<\/section>/)[0];
 assert.match(exports,/cloud-shared conflict-shared/);assert.match(exports,/data-settings-page="export"/);
 for(const id of ['export-svg','export-png','export-a4'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 for(const id of ['export-svg','export-png','export-a4'])assert.ok(exports.includes(`id="${id}"`),id);
 assert.ok(aside.includes('id="tree-file"'));assert.doesNotMatch(app,/header-import-label|header-cloud-import|header-conflict-import/);
});
test('moved export buttons preserve original handlers and unsupported two-panel gating',()=>{
 for(const [id,fn] of [['export-svg','exportSvg'],['export-png','exportPng'],['export-a4','exportA4PrintBundle']]){
   assert.ok(app.includes(`$("${id}").addEventListener("click", async () => { if (await flushSettingsRender()) await ${fn}(); });`));
 }
 assert.match(app,/\$\("export-a4"\)\.disabled = conflictMode \|\| cloudMode/);
});
