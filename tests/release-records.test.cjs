const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

test('release approval requires real in-repository evidence and consistent license metadata',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phylorender-release-records-'));
 try{
  for(const name of ['tools','docs','mcp-server'])fs.mkdirSync(path.join(directory,name));
  fs.copyFileSync(path.join(root,'tools/check-release.cjs'),path.join(directory,'tools/check-release.cjs'));
  fs.writeFileSync(path.join(directory,'LICENSE'),'Fixture license text');
  fs.writeFileSync(path.join(directory,'THIRD_PARTY_NOTICES.md'),'Fixture notices');
  fs.writeFileSync(path.join(directory,'mcp-server/package.json'),JSON.stringify({license:'GPL-3.0-or-later'}));
  const policy={release_status:'approved',project_license:'GPL-3.0-or-later',phyparts_redistribution_permission:'not_applicable',approval_evidence:'docs/approval.md'};
  const run=changes=>{fs.writeFileSync(path.join(directory,'docs/RELEASE_STATUS.json'),JSON.stringify({...policy,...changes}));return spawnSync(process.execPath,['tools/check-release.cjs'],{cwd:directory,encoding:'utf8'});};
  assert.equal(run({}).status,1,'a nonempty evidence path is not evidence that the file exists');
  fs.writeFileSync(path.join(directory,'docs/approval.md'),'Synthetic approval fixture only');
  assert.equal(run({}).status,0);
  assert.equal(run({approval_evidence:'../outside.md'}).status,1);
  assert.equal(run({project_license:'MIT'}).status,1,'package and policy must record the same owner-selected license');
  assert.equal(run({project_license:' '}).status,1);
  assert.equal(run({release_status:'blocked'}).status,1);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
