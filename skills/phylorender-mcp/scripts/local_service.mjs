import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { access, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const SKILL_ROOT = path.resolve(import.meta.dirname, '..');

export function loadLocalConfig(configPath = process.env.PHYLORENDER_SKILL_CONFIG || path.join(SKILL_ROOT, 'local-config.json')) {
  try {
    if (!configPath || !existsSync(configPath)) return {};
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export const LOCAL_CONFIG = loadLocalConfig();

function resolvePackageRoot() {
  if (process.env.PHYLORENDER_MCP_PACKAGE_ROOT) return path.resolve(process.env.PHYLORENDER_MCP_PACKAGE_ROOT);
  if (LOCAL_CONFIG.packageRoot) return path.resolve(LOCAL_CONFIG.packageRoot);
  if (LOCAL_CONFIG.repoRoot) return path.join(path.resolve(LOCAL_CONFIG.repoRoot), 'mcp-server');
  const bundledRepoMcp = path.resolve(SKILL_ROOT, '../../mcp-server');
  if (existsSync(path.join(bundledRepoMcp, 'src/http.mjs'))) return bundledRepoMcp;
  return path.resolve(process.cwd(), 'mcp-server');
}

function resolveStateRoot() {
  if (process.env.PHYLORENDER_LOCAL_STATE_ROOT) return path.resolve(process.env.PHYLORENDER_LOCAL_STATE_ROOT);
  if (LOCAL_CONFIG.stateRoot) return path.resolve(LOCAL_CONFIG.stateRoot);
  return path.join(os.homedir(), '.phylorender', 'local-mcp');
}

export const LOCAL_ENDPOINT = process.env.PHYLORENDER_LOCAL_MCP_ENDPOINT
  || LOCAL_CONFIG.localEndpoint
  || 'http://127.0.0.1:8766/mcp';
export const PUBLIC_ENDPOINT = process.env.PHYLORENDER_PUBLIC_MCP_ENDPOINT
  || LOCAL_CONFIG.publicEndpoint
  || '';
export const PACKAGE_ROOT = resolvePackageRoot();
export const STATE_ROOT = resolveStateRoot();

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

export function isFallbackEligibleError(error) {
  if (!error) return true;
  if (Number(error.status) === 429) return false;
  if (typeof error.code === 'string' && /^(SERVICE_BUSY|INVALID_ARGUMENT|VALIDATION_ERROR|TIP_MAPPING_AMBIGUOUS|FIGURE_NOT_FOUND|REVISION_CONFLICT)$/.test(error.code)) {
    return false;
  }
  const message = String(error.message || '');
  if (/\b429\b|SERVICE_BUSY|\bbusy\b/i.test(message)) return false;
  return true;
}

export async function health(endpoint, { timeout = 3000, url = null } = {}) {
  const response = await fetch(url || endpoint.replace(/\/mcp\/?$/, '/health'), {
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    const err = new Error(`Health HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const result = await response.json();
  if (result.ok !== true || result.service !== 'phylorender-mcp' || typeof result.version !== 'string') {
    throw new Error('The endpoint does not identify a healthy PhyloRender MCP service.');
  }
  return result;
}

async function json(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

export async function ensureLocal({ endpoint = LOCAL_ENDPOINT, root = PACKAGE_ROOT, state = STATE_ROOT, timeout = 40000 } = {}) {
  try { return { endpoint, health: await health(endpoint), started: false }; } catch (error) {
    if (error?.status === 429) throw error;
  }
  // Only the fixed loopback address permits automatic process creation.
  if (endpoint !== 'http://127.0.0.1:8766/mcp' && endpoint !== LOCAL_ENDPOINT) {
    throw new Error('Automatic startup requires the fixed loopback endpoint.');
  }
  const parsedEndpoint = new URL(endpoint);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsedEndpoint.hostname) || parsedEndpoint.port !== '8766') {
    throw new Error('Automatic startup requires the fixed loopback endpoint.');
  }
  await access(path.join(root, 'src/http.mjs'));
  await access(path.join(root, 'node_modules/@modelcontextprotocol/sdk/package.json'));
  await mkdir(state, { recursive: true, mode: 0o700 });
  const lock = path.join(state, 'startup.lock');
  const deadline = Date.now() + timeout;
  let ownsLock = false;
  while (Date.now() < deadline) {
    try {
      await mkdir(lock, { mode: 0o700 });
      ownsLock = true;
      await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await json(path.join(lock, 'owner.json'));
      if (owner && !alive(owner.pid)) { await rm(lock, { recursive: true }); continue; }
      try { return { endpoint, health: await health(endpoint, { timeout: 1000 }), started: false }; } catch {}
      await pause(250);
    }
  }
  if (!ownsLock) throw new Error('Another startup did not complete within 40 seconds. Check startup.lock and the service log.');
  try {
    try { return { endpoint, health: await health(endpoint), started: false }; } catch {}
    const running = await json(path.join(state, 'service.json'));
    let started = false;
    if (!alive(running?.pid)) {
      const log = await open(path.join(state, 'service.log'), 'a', 0o600);
      try {
        const env = { ...process.env,
          PHYLORENDER_MCP_HOST: '127.0.0.1', PHYLORENDER_MCP_PORT: '8766',
          PHYLORENDER_OUTPUT_ROOT: path.join(state, 'figures'),
        };
        // Do not forward public credentials or render against an old external page.
        for (const name of ['PHYLORENDER_MCP_TOKEN', 'PHYLORENDER_ALLOWED_HOSTS', 'PHYLORENDER_ALLOWED_ORIGINS', 'PHYLORENDER_APP_URL']) delete env[name];
        const child = spawn(process.execPath, [path.join(root, 'src/http.mjs')], {
          cwd: root, env, detached: true, stdio: ['ignore', log.fd, log.fd],
        });
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        await writeFile(path.join(state, 'service.json'), JSON.stringify({ pid: child.pid, root, endpoint, started_at: new Date().toISOString() }), { mode: 0o600 });
        child.unref();
        started = true;
      } finally { await log.close(); }
    }
    while (Date.now() < deadline) {
      try { return { endpoint, health: await health(endpoint, { timeout: 1000 }), started }; } catch {}
      const current = await json(path.join(state, 'service.json'));
      if (!alive(current?.pid)) throw new Error('Local MCP exited during startup. Check service.log.');
      await pause(250);
    }
    throw new Error('Local MCP did not become healthy within 40 seconds. Check service.log.');
  } finally { await rm(lock, { recursive: true, force: true }); }
}

export async function chooseEndpoint({
  explicit = process.env.PHYLORENDER_MCP_ENDPOINT,
  publicEndpoint = PUBLIC_ENDPOINT,
  ensure = ensureLocal,
  probe = health,
  notify = message => process.stderr.write(`${message}\n`),
} = {}) {
  if (explicit) {
    if (explicit === LOCAL_ENDPOINT) await ensure();
    else await probe(explicit, { url: process.env.PHYLORENDER_MCP_HEALTH || null });
    return { endpoint: explicit, automatic: false };
  }
  try {
    const result = await ensure();
    notify(`PhyloRender: local MCP ${result.started ? 'started' : 'reused'} at ${LOCAL_ENDPOINT}`);
    return { endpoint: LOCAL_ENDPOINT, automatic: true };
  } catch (error) {
    if (!isFallbackEligibleError(error) || !publicEndpoint) throw error;
    notify(`PhyloRender: local MCP unavailable (${error.message}). Trying the configured remote MCP service.`);
    await probe(publicEndpoint);
    return { endpoint: publicEndpoint, automatic: true };
  }
}

async function resolveOrigin(kind, id, { state = STATE_ROOT, explicit = process.env.PHYLORENDER_MCP_ENDPOINT } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`Invalid ${kind} ID.`);
  const folder = kind === 'job' ? 'jobs' : 'origins';
  const record = await json(path.join(state, folder, `${id}.json`));
  if (record && explicit && record.endpoint !== explicit) {
    throw new Error(`The selected endpoint conflicts with the recorded ${kind} origin.`);
  }
  if (record) return record.endpoint;
  if (explicit) return explicit;
  throw new Error(`Unknown ${kind} origin. Set PHYLORENDER_MCP_ENDPOINT to the service that created this ${kind}. Do not recreate it automatically.`);
}

async function writeOrigin(kind, id, endpoint, { state = STATE_ROOT } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return;
  const folder = kind === 'job' ? 'jobs' : 'origins';
  const idField = kind === 'job' ? 'job_id' : 'figure_id';
  const directory = path.join(state, folder);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${id}.json`);
  try {
    await writeFile(file, JSON.stringify({ [idField]: id, endpoint }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const record = await json(file);
    if (record?.endpoint !== endpoint) throw new Error(`Conflicting ${kind} origin. Refusing to overwrite the record.`);
  }
}

export function figureEndpoint(id, options = {}) {
  return resolveOrigin('figure', id, options);
}

export function recordFigure(id, endpoint, options = {}) {
  return writeOrigin('figure', id, endpoint, options);
}

export function jobEndpoint(id, options = {}) {
  return resolveOrigin('job', id, options);
}

export function recordJob(id, endpoint, options = {}) {
  return writeOrigin('job', id, endpoint, options);
}
