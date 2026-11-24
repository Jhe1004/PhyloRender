const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('tree text and aggregate limits rise tenfold and keep boundary validation', async () => {
  const { MAX_TREE_TEXT_LENGTH, MAX_TOTAL_TREE_TEXT_LENGTH, treeInputSchema, figureSpecSchema } = await import('../mcp-server/src/schemas.mjs');
  assert.equal(MAX_TREE_TEXT_LENGTH, 120_000_000);
  assert.equal(MAX_TOTAL_TREE_TEXT_LENGTH, 320_000_000);
  // String ropes test exact limits without serializing hundreds of megabytes.
  assert.equal(treeInputSchema.safeParse({ content: 'x'.repeat(12_000_001) }).success, true);
  assert.equal(treeInputSchema.safeParse({ content: 'x'.repeat(MAX_TREE_TEXT_LENGTH) }).success, true);
  assert.equal(treeInputSchema.safeParse({ content: 'x'.repeat(MAX_TREE_TEXT_LENGTH + 1) }).success, false);
  const input = { workspace: 'cloud', main_tree: { content: 'x'.repeat(120_000_000) },
    gene_trees: { content: 'y'.repeat(120_000_000) }, phyparts_table: { content: 'z'.repeat(80_000_000) }, options:{cloud:{root_age:10}} };
  assert.equal(figureSpecSchema.safeParse(input).success, true);
  input.phyparts_table.content += 'z';
  const rejected = figureSpecSchema.safeParse(input);
  assert.equal(rejected.success, false);
  assert.ok(rejected.error.issues.some(issue => issue.message.includes('320000000')));
});

test('generated agent schema advertises the same input limit', async () => {
  const fs = require('node:fs');
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../mcp-server/schemas/figure-spec.schema.json'), 'utf8'));
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.properties?.content) assert.equal(node.properties.content.maxLength, 120_000_000);
    Object.values(node).forEach(visit);
  };
  visit(schema);
});

test('internal API limits rise tenfold without changing name-analysis limits', () => {
  const result = execFileSync('python3', ['-c',
    'import sys,json; sys.path.insert(0,"tools"); import local_server; print(json.dumps(local_server.REQUEST_BODY_LIMITS))'],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.deepEqual(JSON.parse(result), { '/api/cloud-phyparts': 1_000_000_000,
    '/api/cloud-date': 200_000_000, '/api/cloud-date/jobs': 200_000_000,
    '/api/taxon-names': 5_000_000, '/api/taxon-names/jobs': 5_000_000 });
});
