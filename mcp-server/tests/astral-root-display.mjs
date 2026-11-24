import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {findBrowserExecutable} from '../src/runtime.mjs';

const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'phylorender-astral-root-'));
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = new Client({ name: 'phylorender-astral-root-test', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['src/stdio.mjs'],
  cwd: serverRoot,
  env: {
    ...process.env,
    PHYLORENDER_OUTPUT_ROOT: outputRoot,
    PHYLORENDER_BROWSER_EXECUTABLE: await findBrowserExecutable(),
  },
  stderr: 'pipe',
});

try {
  await client.connect(transport);
  const created = await client.callTool({
    name: 'create_figure',
    arguments: {
      main_tree: {
        name: 'supported-root-astral.tre',
        content: '(O:0,((A:0,B:0)0.91:0.5,C:0)1.00:0);',
      },
      options: { support:{scale:'probability'},layout: { mode: 'phylogram' } },
    },
  }, undefined, { timeout: 120000 });

  assert.equal(created.isError, undefined);
  const display = created.structuredContent.report.display_branch_lengths;
  assert.equal(display.applied_to_render, true);
  assert.equal(display.auto_root_ingroup_gap_applied, true);
  assert.equal(display.display_root_ingroup_length, 1);
  assert.equal(display.source_tree_unchanged, true);
  assert.ok(created.structuredContent.report.warnings.some(message =>
    message.includes('根到内群的原始枝长为 0')));

  await client.callTool({
    name: 'delete_figure',
    arguments: { figure_id: created.structuredContent.figure_id },
  });
  console.log(JSON.stringify({ passed: true, display }, null, 2));
} finally {
  await client.close().catch(() => undefined);
  await rm(outputRoot, { recursive: true, force: true });
}
