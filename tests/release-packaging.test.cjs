const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

test('release image supplies the approved project license before enforcing the gate',()=>{
  const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'phylorender-release-context-'));
  const image=path.join(sandbox,'image'); fs.mkdirSync(image);
  try {
    // Synthetic approval belongs only to this fixture, never to the real project.
    for(const name of ['README.md','tools/check-release.cjs']) {
      const target=path.join(sandbox,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);
    }
    fs.mkdirSync(path.join(sandbox,'docs'));
    fs.mkdirSync(path.join(sandbox,'mcp-server'));
    fs.writeFileSync(path.join(sandbox,'mcp-server/package.json'),JSON.stringify({license:'test-only'}));
    fs.writeFileSync(path.join(sandbox,'mcp-server/package-lock.json'),'{}');
    fs.writeFileSync(path.join(sandbox,'docs/LICENSE_DECISION.md'),'Synthetic test-only approval');
    fs.writeFileSync(path.join(sandbox,'docs/DEMO_DATA_PERMISSION.md'),'Synthetic test-only demonstration permission');
    fs.writeFileSync(path.join(sandbox,'docs/RELEASE_PERMISSION_EVIDENCE.md'),'Synthetic test-only permission evidence');
    fs.writeFileSync(path.join(sandbox,'THIRD_PARTY_NOTICES.md'),'Synthetic test-only notices');
    fs.writeFileSync(path.join(sandbox,'LICENSE'),'Synthetic test license. Not a project license.\n');
    fs.writeFileSync(path.join(sandbox,'docs/RELEASE_STATUS.json'),JSON.stringify({release_status:'approved',project_license:'test-only',phyparts_redistribution_permission:'not_applicable',approval_evidence:'docs/RELEASE_PERMISSION_EVIDENCE.md'}));
    const dockerfile=fs.readFileSync(path.join(root,'mcp-server/Dockerfile'),'utf8');
    const gate=dockerfile.indexOf('RUN node tools/check-release.cjs');
    assert.ok(gate>=0,'the image must enforce the release gate');
    // Reproduce only repository COPY instructions before the gate. Native image
    // assembly still needs a real Docker build and final distribution review.
    let workdir=image;
    for(const line of dockerfile.slice(0,gate).split('\n')) {
      if(line.startsWith('WORKDIR ')) {
        const name=line.trim().split(/\s+/)[1];
        workdir=name.startsWith('/')?path.join(image,name.slice(1)):path.join(workdir,name);
        fs.mkdirSync(workdir,{recursive:true});continue;
      }
      if(!line.startsWith('COPY '))continue;
      // Stage copies read an image filesystem, never this repository fixture.
      if(line.startsWith('COPY --from='))continue;
      const parts=line.trim().split(/\s+/).slice(1),destination=parts.pop();
      for(const pattern of parts) {
        const sources=pattern.includes('*')?fs.readdirSync(sandbox).filter(name=>new RegExp('^'+pattern.replace(/\*/g,'.*')+'$').test(name)): [pattern];
        for(const name of sources) {
          if(!fs.existsSync(path.join(sandbox,name)))continue;
          const target=path.join(workdir,destination.endsWith('/')?path.join(destination,path.basename(name)):destination);
          fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(sandbox,name),target,{recursive:true});
        }
      }
    }
    assert.ok(fs.existsSync(path.join(workdir,'docs/DEMO_DATA_PERMISSION.md')),'retain demo distribution permission in the image');
    const result=spawnSync(process.execPath,['tools/check-release.cjs'],{cwd:workdir,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  } finally {fs.rmSync(sandbox,{recursive:true,force:true});}
});
