const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

for(const asset of ['vendor/jszip.min.js','defaults/ordinary-workspace.js','tools/native_headers/omp.h','vendor/native/macos-arm64/treePL','vendor/native/macos-arm64/libomp.dylib','vendor/native/macos-arm64/libadolc.2.dylib'])test(`build fingerprint detects changes to ${asset}`,()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phylorender-build-assets-'));
  try {
    for(const name of ['tools','core','render','ui','mcp-server/src','vendor/fonts','defaults'])fs.mkdirSync(path.join(directory,name),{recursive:true});
    fs.copyFileSync(path.join(root,'tools/build-manifest.cjs'),path.join(directory,'tools/build-manifest.cjs'));
    fs.writeFileSync(path.join(directory,'mcp-server/package.json'),JSON.stringify({version:'0.0.0-test'}));
    fs.writeFileSync(path.join(directory,'mcp-server/package-lock.json'),'{}');
    fs.mkdirSync(path.join(directory,'mcp-server/schemas'));
    fs.writeFileSync(path.join(directory,'mcp-server/schemas/figure-spec.schema.json'),'{}');
    fs.mkdirSync(path.dirname(path.join(directory,asset)),{recursive:true});
    fs.writeFileSync(path.join(directory,asset),'window.testVersion=1;');
    const run=(...args)=>spawnSync(process.execPath,['tools/build-manifest.cjs',...args],{cwd:directory,encoding:'utf8'});
    assert.equal(run().status,0);
    assert.equal(run('--check').status,0);
    fs.writeFileSync(path.join(directory,'defaults/cloud-workspace.local.js'),'private local research data');
    assert.equal(run('--check').status,0,'private local cloud snapshot is not a release asset');
    fs.writeFileSync(path.join(directory,asset),'window.testVersion=2;');
    const changed=run('--check');
    assert.equal(changed.status,1,'changing a shipped runtime dependency must invalidate the build');
    assert.match(changed.stderr,/BUILD_MANIFEST_STALE/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
