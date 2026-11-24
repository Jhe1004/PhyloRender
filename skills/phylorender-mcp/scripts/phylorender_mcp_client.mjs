#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  chooseEndpoint,
  ensureLocal,
  figureEndpoint,
  health,
  isFallbackEligibleError,
  jobEndpoint,
  LOCAL_CONFIG,
  LOCAL_ENDPOINT,
  PACKAGE_ROOT,
  PUBLIC_ENDPOINT,
  recordFigure,
  recordJob,
} from "./local_service.mjs";
import { appendMcpUsageAudit, mcpServiceMode, newMcpInvocationId } from "./mcp_usage_audit.mjs";

const DEFAULT_CALL_TIMEOUT_MS = Number(process.env.PHYLORENDER_MCP_CALL_TIMEOUT_MS) || 1_860_000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export function usage() {
  return `Usage:
  phylorender_mcp_client.mjs health
  phylorender_mcp_client.mjs tools
  phylorender_mcp_client.mjs call TOOL_NAME ARGUMENTS_JSON_FILE|-
  phylorender_mcp_client.mjs wait JOB_ID [--interval-ms 2000] [--timeout-ms 1860000]
  phylorender_mcp_client.mjs resource RESOURCE_URI OUTPUT_FILE
  phylorender_mcp_client.mjs download FIGURE_ID REVISION OUTPUT_DIRECTORY [--png] [--panels] [--dpi N]

Environment overrides:
  PHYLORENDER_MCP_ENDPOINT
  PHYLORENDER_PUBLIC_MCP_ENDPOINT
  PHYLORENDER_LOCAL_MCP_ENDPOINT
  PHYLORENDER_MCP_HEALTH
  PHYLORENDER_MCP_TOKEN
  PHYLORENDER_LOCAL_MCP_TOKEN
  PHYLORENDER_KEYCHAIN_SERVICE
  PHYLORENDER_KEYCHAIN_ACCOUNT
  PHYLORENDER_SKILL_CONFIG
  PHYLORENDER_MCP_PACKAGE_ROOT
  PHYLORENDER_MCP_SDK_ROOT
  PHYLORENDER_LOCAL_STATE_ROOT
  PHYLORENDER_MCP_AUDIT_LOG
  PHYLORENDER_MCP_CALL_TIMEOUT_MS

Default: reuse or start the local shared MCP at 127.0.0.1:8766; use a configured remote service only if local startup fails before dispatch and never on 429/validation errors.
Existing figures and background jobs remain pinned to their recorded origin endpoint.`;
}

function projectRequireFor(packageRoot = process.env.PHYLORENDER_MCP_PACKAGE_ROOT || PACKAGE_ROOT) {
  return createRequire(path.join(packageRoot, "package.json"));
}

function tokenFromKeychain() {
  if (process.env.PHYLORENDER_MCP_TOKEN) return process.env.PHYLORENDER_MCP_TOKEN;
  const service = process.env.PHYLORENDER_KEYCHAIN_SERVICE || LOCAL_CONFIG.keychainService;
  if (!service) {
    throw new Error("Remote MCP bearer token missing: set PHYLORENDER_MCP_TOKEN or configure keychainService in local-config.json.");
  }
  const account = process.env.PHYLORENDER_KEYCHAIN_ACCOUNT || LOCAL_CONFIG.keychainAccount || os.userInfo().username;
  try {
    return execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-a", account, "-s", service, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error(`PhyloRender MCP bearer token was not found in Keychain service ${service} for account ${account}.`);
  }
}

async function sdk() {
  const sdkRoot = process.env.PHYLORENDER_MCP_SDK_ROOT
    || path.join(process.env.PHYLORENDER_MCP_PACKAGE_ROOT || PACKAGE_ROOT, "node_modules/@modelcontextprotocol/sdk/dist/esm");
  const clientUrl = pathToFileURL(path.join(sdkRoot, "client/index.js")).href;
  const transportUrl = pathToFileURL(path.join(sdkRoot, "client/streamableHttp.js")).href;
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import(clientUrl),
    import(transportUrl),
  ]);
  return { Client, StreamableHTTPClientTransport };
}

// Native http/https fetch avoiding Node undici's fixed 300s headersTimeout on long panel/dating exports.
function longTimeoutFetch(input, init = {}) {
  const url = typeof input === "string" || input instanceof URL ? new URL(input.toString()) : new URL(input.url);
  const lib = url.protocol === "https:" ? https : http;
  const headers = {};
  if (init.headers) {
    if (typeof init.headers.forEach === "function") init.headers.forEach((v, k) => { headers[k] = v; });
    else if (Array.isArray(init.headers)) init.headers.forEach(([k, v]) => { headers[k] = v; });
    else Object.assign(headers, init.headers);
  }
  const method = (init.method || "GET").toUpperCase();
  const bodyBuf = init.body == null ? null
    : Buffer.isBuffer(init.body) ? init.body
    : init.body instanceof Uint8Array ? Buffer.from(init.body)
    : Buffer.from(String(init.body), "utf8");
  if (bodyBuf && !Object.keys(headers).some(k => k.toLowerCase() === "content-length")) headers["content-length"] = String(bodyBuf.length);
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers, timeout: DEFAULT_CALL_TIMEOUT_MS }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const resHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach(item => resHeaders.append(k, item));
          else if (v !== undefined) resHeaders.set(k, v);
        }
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode || 500, statusText: res.statusMessage || "", headers: resHeaders }));
      });
      res.on("error", reject);
    });
    const onAbort = () => { req.destroy(init.signal?.reason || new Error("Request aborted")); };
    if (init.signal) {
      if (init.signal.aborted) { onAbort(); return; }
      init.signal.addEventListener("abort", onAbort, { once: true });
      req.once("close", () => init.signal.removeEventListener("abort", onAbort));
    }
    req.on("timeout", () => req.destroy(new Error(`MCP HTTP request timed out after ${DEFAULT_CALL_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function connect(endpoint) {
  const { Client, StreamableHTTPClientTransport } = await sdk();
  const client = new Client({ name: "phylorender-mcp-skill", version: "1.2.0" });
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(endpoint).hostname);
  const token = (PUBLIC_ENDPOINT && endpoint === PUBLIC_ENDPOINT) ? tokenFromKeychain()
    : loopback ? process.env.PHYLORENDER_LOCAL_MCP_TOKEN
    : (process.env.PHYLORENDER_MCP_TOKEN || (LOCAL_CONFIG.keychainService ? tokenFromKeychain() : ""));
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: longTimeoutFetch,
    requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    await client.connect(transport, { timeout: 15000 });
    const discovery = await client.listTools({}, { timeout: 15000 });
    for (const name of ["inspect_tree", "create_figure", "inspect_figure", "export_figure"]) {
      if (!discovery.tools.some(tool => tool.name === name)) throw new Error(`Required tool is missing: ${name}`);
    }
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

async function readJson(source) {
  const text = source === "-"
    ? await new Promise((resolve, reject) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => { data += chunk; });
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", reject);
    })
    : await readFile(source, "utf8");
  return JSON.parse(text);
}

function parseDelimitedMapping(text, delimiter = null) {
  const source = String(text).replace(/^\uFEFF/, "");
  const separator = delimiter || ((source.split(/\r?\n/, 1)[0] || "").includes("\t") ? "\t" : ",");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === separator) { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (quoted) throw new Error("The tip-name mapping table contains an unclosed quote.");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function mappingFromRows(inputRows) {
  const sourceHeaders = new Set(["original", "originalname", "source", "sourcename", "sample", "samplename", "oldname", "currentname", "id", "\u539f\u59cb\u540d\u79f0", "\u539f\u540d\u79f0", "\u65e7\u540d\u79f0", "\u6837\u54c1\u540d\u79f0", "\u6837\u54c1id"]);
  const displayHeaders = new Set(["display", "displayname", "newname", "label", "replacement", "renamed", "\u663e\u793a\u540d\u79f0", "\u65b0\u540d\u79f0", "\u4fee\u6539\u540e\u540d\u79f0", "\u66ff\u6362\u540d\u79f0", "\u56fe\u4e2d\u540d\u79f0"]);
  const headerKey = value => String(value ?? "").trim().toLowerCase().replace(/[\s_.-]+/g, "");
  const rows = inputRows.map(row => row.map(value => String(value ?? "").trim())).filter(row => row.some(Boolean));
  if (!rows.length) throw new Error("The tip-name mapping table is empty.");
  const headers = rows[0].map(headerKey);
  const sourceColumn = headers.findIndex(value => sourceHeaders.has(value));
  const displayColumn = headers.findIndex(value => displayHeaders.has(value));
  const hasHeader = sourceColumn >= 0 && displayColumn >= 0;
  if ((sourceColumn >= 0) !== (displayColumn >= 0)) throw new Error("The mapping header must include both original and display name columns.");
  const output = {};
  rows.slice(hasHeader ? 1 : 0).forEach((row, index) => {
    const original = String(row[hasHeader ? sourceColumn : 0] ?? "").trim();
    const display = String(row[hasHeader ? displayColumn : 1] ?? "").trim();
    if (!original && !display) return;
    if (!original || !display) throw new Error(`Incomplete tip-name mapping at row ${index + (hasHeader ? 2 : 1)}.`);
    if (Object.hasOwn(output, original) && output[original] !== display) throw new Error(`Conflicting display names for ${original}.`);
    output[original] = display;
  });
  if (!Object.keys(output).length) throw new Error("The tip-name mapping table contains no mappings.");
  return output;
}

function decodeXml(value) {
  return String(value).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function attribute(xml, name) {
  return xml.match(new RegExp(`\\b${name.replace(":", "\\:")}="([^"]*)"`, "i"))?.[1] || "";
}

function spreadsheetColumn(reference) {
  const letters = String(reference).match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function parseXlsxMapping(filePath) {
  const JSZip = projectRequireFor()("jszip");
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const workbook = await zip.file("xl/workbook.xml")?.async("text");
  const relationships = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbook || !relationships) throw new Error("The mapping file is not a valid .xlsx workbook.");
  const firstSheet = workbook.match(/<sheet\b[^>]*>/i)?.[0] || "";
  const relationshipId = attribute(firstSheet, "r:id");
  const relation = [...relationships.matchAll(/<Relationship\b[^>]*>/gi)].map(match => match[0]).find(item => attribute(item, "Id") === relationshipId);
  const target = attribute(relation || "", "Target");
  if (!target) throw new Error("The .xlsx workbook has no readable worksheet.");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = await zip.file(sheetPath)?.async("text");
  if (!sheet) throw new Error("The first .xlsx worksheet is missing.");
  const sharedText = await zip.file("xl/sharedStrings.xml")?.async("text");
  const shared = sharedText ? [...sharedText.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(item => decodeXml([...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(text => text[1]).join(""))) : [];
  const rows = [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)].map(rowMatch => {
    const row = [];
    [...rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)].forEach(cellMatch => {
      const reference = attribute(cellMatch[1], "r");
      const type = attribute(cellMatch[1], "t");
      let value = "";
      if (type === "inlineStr") value = decodeXml([...cellMatch[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(item => item[1]).join(""));
      else {
        const raw = cellMatch[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || "";
        value = type === "s" ? (shared[Number(raw)] || "") : decodeXml(raw);
      }
      row[spreadsheetColumn(reference)] = value;
    });
    return row;
  });
  return mappingFromRows(rows);
}

function resolveInputPath(rawPath, baseDir = process.cwd()) {
  if (path.isAbsolute(rawPath)) return rawPath;
  const fromBase = path.resolve(baseDir, rawPath);
  if (existsSync(fromBase)) return fromBase;
  return path.resolve(rawPath);
}

async function readTipLabelMapping(fileName, baseDir = process.cwd()) {
  const filePath = resolveInputPath(fileName, baseDir);
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".xlsx")) return parseXlsxMapping(filePath);
  if (lower.endsWith(".xls")) throw new Error("Legacy .xls is not supported; save it as .xlsx, CSV, or TSV.");
  return mappingFromRows(parseDelimitedMapping(await readFile(filePath, "utf8"), lower.endsWith(".tsv") ? "\t" : null));
}

export async function hydrateFiles(value, keyName = "", baseDir = process.cwd()) {
  if (Array.isArray(value)) return Promise.all(value.map(child => hydrateFiles(child, keyName, baseDir)));
  if (!value || typeof value !== "object") return value;
  if (keyName === "tip_label_overrides" && typeof value.file === "string") {
    return readTipLabelMapping(value.file, baseDir);
  }
  if (typeof value.file === "string") {
    const filePath = resolveInputPath(value.file, baseDir);
    const { file, ...rest } = value;
    return {
      ...rest,
      name: rest.name || path.basename(filePath),
      content: await readFile(filePath, "utf8"),
    };
  }
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, child]) => [key, await hydrateFiles(child, key, baseDir)]),
  );
  return Object.fromEntries(entries);
}

export function extractFigureId(result, fallbackId = null) {
  return result?.structuredContent?.figure_id
    || result?.structuredContent?.result?.figure_id
    || fallbackId
    || null;
}

export function extractJobId(result, rawArgs = null) {
  return result?.structuredContent?.job_id || rawArgs?.job_id || null;
}

export function parseWaitArgs(argv) {
  const [jobId, ...rest] = argv;
  if (!UUID_RE.test(jobId || "")) throw new Error(usage());
  let intervalMs = 2000;
  let timeoutMs = DEFAULT_CALL_TIMEOUT_MS;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === "--interval-ms") {
      intervalMs = Number(rest[++i]);
      if (!Number.isFinite(intervalMs) || intervalMs < 100) throw new Error("Invalid --interval-ms value.");
    } else if (flag === "--timeout-ms") {
      timeoutMs = Number(rest[++i]);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) throw new Error("Invalid --timeout-ms value.");
    } else {
      throw new Error(`Unknown wait flag: ${flag}`);
    }
  }
  return { jobId, intervalMs, timeoutMs };
}

export function parseDownloadArgs(argv) {
  const [figureId, revisionText, outputDirectory, ...flags] = argv;
  const revision = Number(revisionText);
  if (!UUID_RE.test(figureId || "") || !Number.isInteger(revision) || revision < 1 || !outputDirectory) {
    throw new Error(usage());
  }
  let png = false;
  let panels = false;
  let dpi = null;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === "--png") png = true;
    else if (flag === "--panels") panels = true;
    else if (flag === "--dpi") {
      const value = Number(flags[++i]);
      if (!Number.isInteger(value) || value < 72 || value > 1200) {
        throw new Error("--dpi must be an integer between 72 and 1200.");
      }
      dpi = value;
      png = true;
    } else {
      throw new Error(`Unknown download flag: ${flag}`);
    }
  }
  return { figureId, revision, outputDirectory, png, panels, dpi };
}

export function safeToolResult(result) {
  const hasStructuredContent = result?.structuredContent !== undefined;
  return {
    isError: Boolean(result?.isError),
    structuredContent: result?.structuredContent,
    content: (result?.content || []).map(item => {
      if (item.type === "image") {
        return { type: "image", mimeType: item.mimeType, bytes: Buffer.from(item.data || "", "base64").length };
      }
      if (item.type === "text" && hasStructuredContent) {
        return { type: "text", note: "Omitted because the same result is available in structuredContent." };
      }
      if (item.type === "text" && item.text?.length > 20000) {
        return {
          type: "text",
          text: `${item.text.slice(0, 20000)}\n… [truncated by the skill client]`,
          originalCharacters: item.text.length,
        };
      }
      return item;
    }),
  };
}

async function readResourceToFile(client, uri, outputFile) {
  const result = await client.readResource({ uri });
  const item = result.contents?.[0];
  if (!item) throw new Error(`Resource returned no content: ${uri}`);
  const data = item.blob ? Buffer.from(item.blob, "base64") : Buffer.from(item.text || "", "utf8");
  await mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
  await writeFile(outputFile, data, { flag: "wx" });
  return { uri, output: path.resolve(outputFile), mimeType: item.mimeType, bytes: data.length };
}

function versionedFilename(artifactName, revision) {
  const extIndex = artifactName.lastIndexOf(".");
  if (extIndex <= 0) return `${artifactName}_v${revision}`;
  return `${artifactName.slice(0, extIndex)}_v${revision}${artifactName.slice(extIndex)}`;
}

async function runCli() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  let endpoint;
  let client;
  const invocationId = newMcpInvocationId();
  const invocationStartedAt = Date.now();
  let auditFigureId = null;
  let auditSelection = null;
  let auditStatus = "completed";

  async function audit(phase, status, error = null) {
    const result = await appendMcpUsageAudit({
      invocation_id: invocationId,
      phase,
      status,
      command,
      tool_name: command === "call" ? args[0] : (command === "wait" ? "get_figure_job" : null),
      figure_id: auditFigureId,
      service_endpoint: endpoint || null,
      automatic_routing: auditSelection?.automatic,
      duration_ms: Date.now() - invocationStartedAt,
      error_name: error?.name || null,
    });
    process.stderr.write(`PhyloRender audit: ${mcpServiceMode(endpoint)} MCP ${status} recorded in ${result.file}\n`);
  }

  try {
    if (!["health", "tools", "call", "wait", "resource", "download"].includes(command)) throw new Error(usage());
    let rawArgs = null;
    let argsBaseDir = process.cwd();
    if (command === "call") {
      if (!args[0] || !args[1]) throw new Error(usage());
      if (args[1] !== "-") argsBaseDir = path.dirname(path.resolve(args[1]));
      rawArgs = await readJson(args[1]);
    }
    const waitParsed = command === "wait" ? parseWaitArgs(args) : null;
    const downloadParsed = command === "download" ? parseDownloadArgs(args) : null;
    const figureId = command === "call" ? rawArgs?.figure_id
      : command === "download" ? downloadParsed.figureId
      : command === "resource" ? args[0]?.match(/^phylorender:\/\/figures\/([0-9a-f-]{36})(?:\/|$)/i)?.[1] : null;
    const jobId = command === "wait" ? waitParsed.jobId
      : (command === "call" ? rawArgs?.job_id : null);
    auditFigureId = figureId || null;
    await audit("requested", "requested");

    let selection;
    if (figureId) {
      endpoint = await figureEndpoint(figureId);
      selection = { endpoint, automatic: false };
      if (endpoint === LOCAL_ENDPOINT) await ensureLocal();
      else await health(endpoint);
      process.stderr.write(`PhyloRender: figure origin pinned to ${endpoint}\n`);
    } else if (jobId) {
      endpoint = await jobEndpoint(jobId);
      selection = { endpoint, automatic: false };
      if (endpoint === LOCAL_ENDPOINT) await ensureLocal();
      else await health(endpoint);
      process.stderr.write(`PhyloRender: job origin pinned to ${endpoint}\n`);
    } else {
      selection = await chooseEndpoint();
      endpoint = selection.endpoint;
    }
    auditSelection = selection;
    await audit("routed", "started");

    if (command === "health") {
      console.log(JSON.stringify({ ...await health(endpoint, { url: process.env.PHYLORENDER_MCP_ENDPOINT ? process.env.PHYLORENDER_MCP_HEALTH || null : null }), endpoint }));
    } else {
      try { client = await connect(endpoint); }
      catch (error) {
        if (!selection.automatic || endpoint !== LOCAL_ENDPOINT || !PUBLIC_ENDPOINT || !isFallbackEligibleError(error)) throw error;
        process.stderr.write(`PhyloRender: local MCP discovery failed (${error.message}). Trying configured remote MCP before sending the task.\n`);
        endpoint = PUBLIC_ENDPOINT;
        await health(endpoint);
        client = await connect(endpoint);
        auditSelection = { endpoint, automatic: true };
        await audit("rerouted", "started");
      }
      process.stderr.write(`PhyloRender: using ${endpoint}\n`);
    }

    if (command === "health") {
      // Health never invokes drawing or accesses private input files.
    } else if (command === "tools") {
      const result = await client.listTools();
      console.log(JSON.stringify(result.tools.map(tool => ({ name: tool.name, description: tool.description })), null, 2));
    } else if (command === "call") {
      const [toolName] = args;
      const toolArgs = await hydrateFiles(rawArgs, "", argsBaseDir);
      // Never retry a dispatched operation on another service.
      const result = await client.callTool({ name: toolName, arguments: toolArgs }, undefined, { timeout: DEFAULT_CALL_TIMEOUT_MS });
      if (result.isError) auditStatus = "tool_error";
      if (!result.isError) {
        const createdFigureId = extractFigureId(result, figureId);
        const createdJobId = extractJobId(result, rawArgs);
        auditFigureId = createdFigureId || auditFigureId;
        if (createdFigureId) {
          try { await recordFigure(createdFigureId, endpoint); }
          catch { process.stderr.write(`PhyloRender: could not save figure origin. Keep figure ${createdFigureId} pinned to ${endpoint}.\n`); }
        }
        if (createdJobId) {
          try { await recordJob(createdJobId, endpoint); }
          catch { process.stderr.write(`PhyloRender: could not save job origin. Keep job ${createdJobId} pinned to ${endpoint}.\n`); }
        }
      }
      console.log(JSON.stringify({ service_endpoint: endpoint, ...safeToolResult(result) }, null, 2));
      if (result.isError) process.exitCode = 2;
    } else if (command === "wait") {
      const deadline = Date.now() + waitParsed.timeoutMs;
      let latest;
      while (true) {
        latest = await client.callTool(
          { name: "get_figure_job", arguments: { job_id: waitParsed.jobId } },
          undefined,
          { timeout: Math.min(30000, waitParsed.timeoutMs) },
        );
        const status = latest?.structuredContent?.status;
        if (latest.isError || !["queued", "running", "cancelling"].includes(status)) break;
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for job ${waitParsed.jobId} (last status: ${status}).`);
        }
        await new Promise(resolve => setTimeout(resolve, waitParsed.intervalMs));
      }
      const createdFigureId = extractFigureId(latest, null);
      if (!latest.isError && createdFigureId) {
        auditFigureId = createdFigureId;
        try { await recordFigure(createdFigureId, endpoint); }
        catch { process.stderr.write(`PhyloRender: could not save figure origin. Keep figure ${createdFigureId} pinned to ${endpoint}.\n`); }
      }
      const terminalStatus = latest?.structuredContent?.status;
      if (latest.isError || ["failed", "cancelled", "interrupted"].includes(terminalStatus)) {
        auditStatus = "tool_error";
        process.exitCode = 2;
      }
      console.log(JSON.stringify({ service_endpoint: endpoint, ...safeToolResult(latest) }, null, 2));
    } else if (command === "resource") {
      const [uri, outputFile] = args;
      if (!uri || !outputFile) throw new Error(usage());
      console.log(JSON.stringify(await readResourceToFile(client, uri, outputFile), null, 2));
    } else if (command === "download") {
      const { figureId: fid, revision, outputDirectory, png, panels, dpi } = downloadParsed;
      const base = `phylorender://figures/${fid}/revisions/${revision}`;
      let artifactList = ["figure.svg", "report.json", "spec.json"];
      if (png || panels) {
        const formats = ["svg", ...(png ? ["png"] : []), ...(panels ? ["panels"] : [])];
        const exported = await client.callTool(
          { name: "export_figure", arguments: { figure_id: fid, revision, formats } },
          undefined,
          { timeout: DEFAULT_CALL_TIMEOUT_MS },
        );
        if (exported.isError) {
          console.log(JSON.stringify({ service_endpoint: endpoint, ...safeToolResult(exported) }, null, 2));
          auditStatus = "tool_error";
          process.exitCode = 2;
          return;
        }
        const uris = (exported.structuredContent?.resources || []).map(item => item.uri);
        if (uris.length) {
          artifactList = uris.map(uri => uri.split("/").pop());
        }
        if ((exported.structuredContent?.unsupported_formats || []).length) {
          process.stderr.write(`PhyloRender notice: unsupported download formats skipped: ${exported.structuredContent.unsupported_formats.join(", ")}\n`);
        }
      }
      const written = [];
      for (const artifact of artifactList) {
        const outName = versionedFilename(artifact, revision);
        const item = await readResourceToFile(client, `${base}/${artifact}`, path.join(outputDirectory, outName));
        written.push(item);
        if (dpi !== null && artifact === "report.json") {
          const report = JSON.parse(await readFile(item.output, "utf8"));
          const actualDpi = report?.output?.requested_dpi;
          if (actualDpi && actualDpi !== dpi) {
            process.stderr.write(`PhyloRender notice: --dpi ${dpi} requested, but revision ${revision} was rendered with options.output.dpi=${actualDpi}. Use edit_figure (set_options) to change output.dpi before re-downloading PNG.\n`);
          }
        }
      }
      console.log(JSON.stringify(written, null, 2));
    }
    await audit("finished", auditStatus);
  } catch (error) {
    try { await audit("finished", "failed", error); }
    catch (auditError) {
      process.stderr.write(`PhyloRender audit failure: ${auditError.message}\n`);
    }
    throw error;
  } finally {
    await client?.close().catch(() => undefined);
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
