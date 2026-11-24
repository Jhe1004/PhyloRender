// Inspect actual Docker files and every exported layer, not only a Dockerfile.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const [image, destination, ...flags] = process.argv.slice(2);
if (!image || !destination) throw Error('Usage: node image-distribution.mjs IMAGE NEW_OUTPUT [--base-only]');
assert.ok(image.length <= 1024 && /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(image), 'Provide an image reference, not Docker options');
assert.ok(flags.every(flag => flag === '--base-only'));
const baseOnly = flags.includes('--base-only'), output = path.resolve(destination);
await mkdir(output, {recursive:false, mode:0o700});
const execute = promisify(execFile), commands = [];
async function run(name, program, args, timeout=300000) {
  const start = performance.now();
  try {
    const result = await execute(program, args, {timeout, maxBuffer:4*1024*1024});
    await writeFile(path.join(output, name+'.stdout'), result.stdout);
    await writeFile(path.join(output, name+'.stderr'), result.stderr);
    commands.push({name, program, args, exit_code:0, seconds:(performance.now()-start)/1000});
    return result.stdout;
  } catch (error) {
    commands.push({name, program, args, exit_code:error.code, error:error.message});
    throw error;
  } finally {
    await writeFile(path.join(output, 'commands.json'), JSON.stringify(commands,null,2));
  }
}
try {
  const filesystem = JSON.parse(await run('filesystem', 'docker', ['run','--rm','--init',
    '--cpus=1','--memory=512m','--entrypoint','python3',image,'-c',`
from pathlib import Path
import json,hashlib
restricted=[str(p) for p in Path('/ms-playwright').rglob('libwidevinecdm.so')]
private=[p for p in ['/app/.git','/app/mcp-server/.env','/app/defaults/cloud-workspace.local.js','/app/tools/gnfinder/bin','/app/tools/gnparser/bin'] if Path(p).exists()]
required=['/app/LICENSE','/app/THIRD_PARTY_NOTICES.md','/app/core/build-info.js','/app/vendor/treepl/treePL-upstream-source.tar.gz','/app/vendor/native-sources/LLVM-project-20.1.8-LICENSE.TXT']
aux=Path('/app/vendor/native-sources');verified=False
if (aux/'SHA256SUMS').is_file():
 for line in (aux/'SHA256SUMS').read_text().splitlines():
  expected,name=line.split();assert Path(name).name==name
  assert hashlib.sha256((aux/name).read_bytes()).hexdigest()==expected
 verified=True
native=Path(required[3]);native_hash=hashlib.sha256(native.read_bytes()).hexdigest() if native.is_file() else None
print(json.dumps({'restricted_modules':restricted,'private_assets':private,'browser_directories':[p.name for p in Path('/ms-playwright').iterdir() if p.is_dir()],'required_app_files':{p:Path(p).is_file() for p in required},'auxiliary_sources_verified':verified,'native_archive_sha256':native_hash,'browser_notice_files':[str(p) for p in Path('/ms-playwright').rglob('LICENSE.headless_shell')]}))
` ]));
  assert.deepEqual(filesystem.restricted_modules, [], 'Restricted Widevine module must not be distributed');
  assert.deepEqual(filesystem.private_assets, []);
  assert.equal(filesystem.browser_directories.length, 1);
  assert.match(filesystem.browser_directories[0], /^chromium_headless_shell-/);
  assert.ok(filesystem.browser_notice_files.length > 0);
  if (!baseOnly) {
    assert.ok(Object.values(filesystem.required_app_files).every(Boolean));
    assert.equal(filesystem.auxiliary_sources_verified, true);
    assert.equal(filesystem.native_archive_sha256, 'd31d23a66ed7b34b2076ac62e7ed0fb75aaaf2f903bee58d56cd6dad6bb39e31');
  }
  const current = JSON.parse(await run('image-inspect','docker',['image','inspect',image]))[0];
  const original = JSON.parse(await run('upstream-inspect','docker',['image','inspect','mcr.microsoft.com/playwright:v1.61.1-noble']))[0];
  const inherited = current.RootFS.Layers.filter(layer => original.RootFS.Layers.includes(layer));
  assert.deepEqual(inherited, [], 'Final image must not retain upstream layers containing removed proprietary files');
  const archive = path.join(output,'image.tar');
  await run('image-save','docker',['image','save','--output',archive,image],600000);
  const layers = JSON.parse(await run('layers','python3',['-c',`
import tarfile,json,sys,hashlib
from pathlib import PurePosixPath
archive=sys.argv[1];hits=[];rows=[]
with tarfile.open(archive) as outer:
 manifest=json.load(outer.extractfile('manifest.json'));assert len(manifest)==1
 for name in manifest[0]['Layers']:
  count=0
  with tarfile.open(fileobj=outer.extractfile(name),mode='r|*') as layer:
   for entry in layer:
    count+=1
    if PurePosixPath(entry.name).name=='libwidevinecdm.so':hits.append({'layer':name,'path':entry.name})
  rows.append({'layer':name,'entries':count})
h=hashlib.sha256()
with open(archive,'rb') as stream:
 for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
print(json.dumps({'restricted_modules_in_any_layer':hits,'layers':rows,'archive_sha256':h.hexdigest()}))
`, archive],600000));
  assert.deepEqual(layers.restricted_modules_in_any_layer, []);
  const result = {passed:true, scope:baseOnly?'sanitized_browser_base_only':'complete_application_image',
    image_id:current.Id, filesystem, layers, upstream_layers_inherited:inherited};
  await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} catch (error) {
  await writeFile(path.join(output,'failure.json'),JSON.stringify({name:error.name,message:error.message,code:error.code},null,2));
  throw error;
}
