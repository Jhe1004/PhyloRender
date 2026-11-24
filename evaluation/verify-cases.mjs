// Bundle validation is an engineering check, not an independent scientific oracle.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {figureSpecSchema} from '../mcp-server/src/schemas.mjs';
import input from '../core/tree-input.js';

const root = new URL('./fixtures/', import.meta.url);
export async function bundleFingerprint() {
  const names = ['README.md','tasks.json','runs-template.csv','generate_cases.py',
    'verify-cases.mjs','check-workflows.mjs','fixtures/manifest.json'];
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  names.push(...manifest.cases.map(item => 'fixtures/'+item.file));
  const files = {};
  for (const name of names.sort()) {
    files[name] = createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex');
  }
  return {files, sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};
}
export async function readCases() {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const cases = [];
  for (const entry of manifest.cases) {
    assert.match(entry.file, /^[a-z]+-[0-9]+\.json$/);
    const payload = await readFile(new URL(entry.file, root));
    assert.equal(createHash('sha256').update(payload).digest('hex'), entry.sha256);
    const item = JSON.parse(payload);
    assert.equal(item.synthetic, true);
    figureSpecSchema.parse(item.spec);
    const parsed = input.parseNewick(item.spec.main_tree.content);
    const leaves = [];
    const visit = node => node.children?.length ? node.children.forEach(visit) : leaves.push(node.label);
    visit(parsed);
    assert.equal(new Set(leaves).size, leaves.length);
    assert.equal(leaves.length, Number(item.id.split('-')[1]));
    cases.push(item);
  }
  assert.deepEqual(cases.map(item => item.spec.workspace), ['phylogeny','time','conflict','cloud']);
  return cases;
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  console.log(JSON.stringify({validated_cases: (await readCases()).map(item => item.id), bundle:await bundleFingerprint(),
    validation_scope: "engineering"}));
}
