import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as localService from './local_service.mjs';

const {
  chooseEndpoint,
  ensureLocal,
  figureEndpoint,
  health,
  LOCAL_ENDPOINT,
  PUBLIC_ENDPOINT,
  recordFigure,
} = localService;

test('healthy local service wins without probing public service', async () => {
  let probes = 0;
  const result = await chooseEndpoint({ explicit: '', ensure: async () => ({ started: false }), probe: async () => { probes++; }, notify: () => {} });
  assert.equal(result.endpoint, LOCAL_ENDPOINT);
  assert.equal(probes, 0);
});

test('local failure reports fallback before public health when explicit publicEndpoint is configured', async () => {
  const events = [];
  const publicUrl = 'https://remote.example.test/mcp';
  const result = await chooseEndpoint({
    explicit: '',
    publicEndpoint: publicUrl,
    ensure: async () => { throw new Error('Missing browser'); },
    probe: async endpoint => events.push(endpoint),
    notify: message => events.push(message),
  });
  assert.equal(result.endpoint, publicUrl);
  assert.match(events[0], /Missing browser/);
  assert.equal(events[1], publicUrl);
});

test('explicit remote service never invokes local startup', async () => {
  const publicUrl = 'https://remote.example.test/mcp';
  const result = await chooseEndpoint({ explicit: publicUrl, ensure: async () => { throw new Error('Unexpected startup'); }, probe: async () => {}, notify: () => {} });
  assert.equal(result.automatic, false);
  assert.equal(result.endpoint, publicUrl);
});

test('explicit local failure does not fall back', async () => {
  await assert.rejects(chooseEndpoint({ explicit: LOCAL_ENDPOINT, publicEndpoint: 'https://remote.example.test/mcp', ensure: async () => { throw new Error('Blocked'); }, probe: async () => { throw new Error('Unexpected public request'); } }), /Blocked/);
});

test('both services failing stops routing', async () => {
  await assert.rejects(chooseEndpoint({ explicit: '', publicEndpoint: 'https://remote.example.test/mcp', ensure: async () => { throw new Error('Local down'); }, probe: async () => { throw new Error('Public down'); }, notify: () => {} }), /Public down/);
});

test('figure origins persist and reject cross-service edits', async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), 'phylorender-origin-'));
  const id = '7622a37c-527e-4ab0-a6c5-ec02ffc2fa01';
  const remoteUrl = 'https://remote.example.test/mcp';
  try {
    await assert.rejects(figureEndpoint(id, { state, explicit: '' }), /Unknown figure origin/);
    assert.equal(await figureEndpoint(id, { state, explicit: remoteUrl }), remoteUrl);
    await recordFigure(id, LOCAL_ENDPOINT, { state });
    await recordFigure(id, LOCAL_ENDPOINT, { state });
    assert.equal(await figureEndpoint(id, { state, explicit: '' }), LOCAL_ENDPOINT);
    await assert.rejects(figureEndpoint(id, { state, explicit: remoteUrl }), /conflicts/);
    await assert.rejects(recordFigure(id, remoteUrl, { state }), /Conflicting/);
  } finally { await rm(state, { recursive: true }); }
});

test('automatic startup rejects a non-fixed endpoint', async () => {
  await assert.rejects(ensureLocal({ endpoint: 'http://127.0.0.1:1/mcp' }), /fixed loopback/);
});

test('health rejects an unrelated HTTP service', async () => {
  const endpoint = 'data:application/json,%7B%22ok%22%3Atrue%7D';
  await assert.rejects(health(endpoint), /does not identify/);
});

test('repository skill files contain no hardcoded personal paths, accounts, or private endpoints', async () => {
  const skillRoot = path.resolve(import.meta.dirname, '..');
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(md|mjs)$/i.test(entry.name) && entry.name !== 'local_service.test.mjs') files.push(full);
    }
  }
  await walk(skillRoot);
  assert.ok(files.length >= 6);
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    assert.doesNotMatch(content, /\/Users\/|jianhe|Jian He|nyat\.app|frp-boy\.com/i, `Personal reference leaked in ${path.relative(skillRoot, file)}`);
  }
});

test('loadLocalConfig reads repoRoot, stateRoot, and publicEndpoint from explicit config JSON', async () => {
  assert.equal(typeof localService.loadLocalConfig, 'function');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'phylorender-skill-cfg-'));
  try {
    const cfgPath = path.join(tempDir, 'local-config.json');
    await writeFile(cfgPath, JSON.stringify({
      repoRoot: '/tmp/phylo-repo',
      stateRoot: '/tmp/phylo-state',
      publicEndpoint: 'https://configured.example.org/mcp',
    }));
    const cfg = localService.loadLocalConfig(cfgPath);
    assert.equal(cfg.repoRoot, '/tmp/phylo-repo');
    assert.equal(cfg.stateRoot, '/tmp/phylo-state');
    assert.equal(cfg.publicEndpoint, 'https://configured.example.org/mcp');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('429 SERVICE_BUSY or missing public endpoint prevents public fallback', async () => {
  assert.equal(typeof localService.isFallbackEligibleError, 'function');
  const busyErr = Object.assign(new Error('HTTP 429 SERVICE_BUSY'), { status: 429, code: 'SERVICE_BUSY' });
  assert.equal(localService.isFallbackEligibleError(busyErr), false);
  await assert.rejects(
    chooseEndpoint({
      explicit: '',
      publicEndpoint: 'https://remote.example.test/mcp',
      ensure: async () => { throw busyErr; },
      probe: async () => { throw new Error('Must never fall back on 429'); },
      notify: () => {},
    }),
    /SERVICE_BUSY/,
  );
  await assert.rejects(
    chooseEndpoint({
      explicit: '',
      publicEndpoint: '',
      ensure: async () => { throw new Error('Local connection failed'); },
      probe: async () => { throw new Error('Must not probe empty public endpoint'); },
      notify: () => {},
    }),
    /Local connection failed/,
  );
});

test('recordJob and jobEndpoint persist async job routing and reject endpoint conflicts', async () => {
  assert.equal(typeof localService.recordJob, 'function');
  assert.equal(typeof localService.jobEndpoint, 'function');
  const state = await mkdtemp(path.join(os.tmpdir(), 'phylorender-job-origin-'));
  const jobId = '11111111-2222-4333-8444-555555555555';
  const remoteUrl = 'https://remote.example.test/mcp';
  try {
    await localService.recordJob(jobId, LOCAL_ENDPOINT, { state });
    assert.equal(await localService.jobEndpoint(jobId, { state, explicit: '' }), LOCAL_ENDPOINT);
    await assert.rejects(localService.jobEndpoint(jobId, { state, explicit: remoteUrl }), /conflicts/);
    await assert.rejects(localService.recordJob(jobId, remoteUrl, { state }), /Conflicting/);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test('client helpers extract job figure_id, hydrate relative files from argsDir, and parse download flags', async () => {
  const clientMod = await import('./phylorender_mcp_client.mjs');
  assert.equal(typeof clientMod.extractFigureId, 'function');
  assert.equal(typeof clientMod.hydrateFiles, 'function');
  assert.equal(typeof clientMod.parseDownloadArgs, 'function');

  const fid1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const fid2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  assert.equal(clientMod.extractFigureId({ structuredContent: { figure_id: fid1 } }), fid1);
  assert.equal(clientMod.extractFigureId({ structuredContent: { status: 'succeeded', result: { figure_id: fid2 } } }), fid2);

  const parsed = clientMod.parseDownloadArgs([fid1, '3', '/tmp/out', '--png', '--panels', '--dpi', '600']);
  assert.deepEqual(parsed, {
    figureId: fid1,
    revision: 3,
    outputDirectory: '/tmp/out',
    png: true,
    panels: true,
    dpi: 600,
  });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'phylorender-hydrate-'));
  try {
    await mkdir(path.join(tempDir, 'sub'), { recursive: true });
    await writeFile(path.join(tempDir, 'sub', 'demo.nwk'), '(A:1,B:1);');
    const hydrated = await clientMod.hydrateFiles(
      { main_tree: { file: 'sub/demo.nwk' } },
      '',
      tempDir,
    );
    assert.equal(hydrated.main_tree.name, 'demo.nwk');
    assert.equal(hydrated.main_tree.content, '(A:1,B:1);');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  assert.equal(PUBLIC_ENDPOINT, '');
});

