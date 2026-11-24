import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { LOCAL_ENDPOINT, PUBLIC_ENDPOINT, STATE_ROOT } from "./local_service.mjs";

export function mcpServiceMode(endpoint, { publicEndpoint = PUBLIC_ENDPOINT } = {}) {
  if (!endpoint) return "unresolved";
  if (endpoint === LOCAL_ENDPOINT) return "local";
  if (publicEndpoint && endpoint === publicEndpoint) return "public";
  return "custom";
}

export function newMcpInvocationId() {
  return randomUUID();
}

export async function appendMcpUsageAudit(event, {
  stateRoot = STATE_ROOT,
  logFile = process.env.PHYLORENDER_MCP_AUDIT_LOG,
  now = () => new Date(),
} = {}) {
  const file = path.resolve(logFile || path.join(stateRoot, "mcp-usage.jsonl"));
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const record = {
    timestamp: now().toISOString(),
    invocation_id: event.invocation_id,
    phase: event.phase,
    status: event.status,
    command: event.command,
    tool_name: event.tool_name || null,
    figure_id: /^[0-9a-f-]{36}$/i.test(event.figure_id || "") ? event.figure_id : null,
    service_mode: mcpServiceMode(event.service_endpoint),
    service_endpoint: event.service_endpoint || null,
    automatic_routing: typeof event.automatic_routing === "boolean" ? event.automatic_routing : null,
    duration_ms: Number.isFinite(event.duration_ms) ? Math.max(0, Math.round(event.duration_ms)) : null,
    error_name: event.error_name || null,
    pid: process.pid,
    host: os.hostname(),
  };
  await appendFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  return { file, record };
}
