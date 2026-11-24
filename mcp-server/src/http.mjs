#!/usr/bin/env node
import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPhyloRenderMcpServer } from "./mcp.mjs";
import { createRuntime } from "./runtime.mjs";
import { FigureStore } from "./store.mjs";
import { VERSION, BUILD } from "./version.mjs";
import { runtimeCapabilities } from "./capabilities.mjs";
import { acquireWriterLease } from "./writer-lease.mjs";

const host = process.env.PHYLORENDER_MCP_HOST || "127.0.0.1";
const port = Number(process.env.PHYLORENDER_MCP_PORT) || 8766;
const bearerToken = process.env.PHYLORENDER_MCP_TOKEN || "";
const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
const allowedOrigins = new Set((process.env.PHYLORENDER_ALLOWED_ORIGINS || "")
  .split(",").map(value => value.trim()).filter(Boolean));
const allowedHosts = new Set((process.env.PHYLORENDER_ALLOWED_HOSTS || "")
  .split(",").map(value => value.trim().toLowerCase()).filter(Boolean));

if (!loopback.has(host) && !bearerToken) {
  throw new Error("Remote binding requires PHYLORENDER_MCP_TOKEN. Use an OAuth 2.1 gateway before public deployment.");
}
if (!loopback.has(host) && !allowedHosts.size) {
  throw new Error("Remote binding requires PHYLORENDER_ALLOWED_HOSTS to prevent Host-header rebinding attacks.");
}

function hostAllowed(requestHost) {
  const normalized = String(requestHost || "").toLowerCase();
  if (allowedHosts.size) return allowedHosts.has(normalized) || allowedHosts.has(normalized.replace(/:\d+$/, ""));
  try { return loopback.has(new URL(`http://${normalized}`).hostname.replace(/^\[|\]$/g, "")); }
  catch { return false; }
}

function originAllowed(origin, requestHost) {
  if (!origin) return true;
  if (allowedOrigins.size) return allowedOrigins.has(origin);
  try {
    const value = new URL(origin);
    return value.protocol === "http:" && value.host === String(requestHost || "").toLowerCase();
  } catch {
    return false;
  }
}

function bearerMatches(authorization) {
  if (!bearerToken) return true;
  const expected = Buffer.from(`Bearer ${bearerToken}`);
  const actual = Buffer.from(String(authorization || ""));
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function authenticate(req, res, next) {
  if (!hostAllowed(req.headers.host)) return res.status(403).json({ error: "Host is not allowed." });
  if (!originAllowed(req.headers.origin, req.headers.host)) return res.status(403).json({ error: "Origin is not allowed." });
  if (!bearerMatches(req.headers.authorization)) {
    res.set("WWW-Authenticate", "Bearer realm=\"PhyloRender MCP\"");
    return res.status(401).json({ error: "Valid bearer token required." });
  }
  next();
}

let runtime = null;
let httpServer = null;
let releaseLease = null;

async function close() {
  await new Promise(resolve => httpServer?.close(resolve) || resolve());
  await runtime?.close().catch(() => undefined);
  await releaseLease?.();
}

async function main() {
  runtime = await createRuntime();
  const store = new FigureStore(runtime.renderer);
  releaseLease = await acquireWriterLease(store.outputRoot);
  await store.initialize();
  const app = express();
  app.disable("x-powered-by");
  // Authenticate headers before accepting or parsing an expensive JSON body.
  app.use("/mcp", authenticate);
  let admitted = 0;
  app.use("/mcp", (req, res, next) => {
    if (admitted >= 8) return res.status(429).json({ error: { code: "SERVICE_BUSY", retryable: true } });
    admitted++;
    let released = false;
    const release = () => { if (!released) { released = true; admitted--; } };
    res.once("finish", release); res.once("close", release);
    next();
  });
  app.use("/mcp", express.json({ limit: process.env.PHYLORENDER_MCP_BODY_LIMIT || "400mb" }));
  app.use("/mcp", (error, _req, res, _next) => {
    res.status(error.status === 413 ? 413 : 400).json({
      error: { code: error.status === 413 ? "BODY_TOO_LARGE" : "INVALID_JSON", retryable: false },
    });
  });
  app.get("/health", async (_req, res) => res.json({
    ok: true,
    service: "phylorender-mcp",
    version: VERSION,
    build_id: BUILD.build_id,
    state: "ready",
    pending_renders: runtime.renderer.pending,
    capabilities: await runtimeCapabilities(runtime.pageUrl),
  }));
  app.post("/mcp", async (req, res) => {
    const mcpServer = createPhyloRenderMcpServer({ renderer: runtime.renderer, store });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once("close", async () => {
      await transport.close().catch(() => undefined);
      await mcpServer.close().catch(() => undefined);
    });
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      process.stderr.write(`MCP request failed: ${error.stack || error}\n`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body?.id ?? null,
          error: { code: -32603, message: "Internal server error" },
        });
      }
    }
  });
  app.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").json({
    jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed" },
  }));
  app.delete("/mcp", (_req, res) => res.status(405).set("Allow", "POST").json({
    jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed" },
  }));
  httpServer = app.listen(port, host, () => {
    process.stderr.write(`PhyloRender remote MCP ready at http://${host}:${port}/mcp\n`);
  });
  httpServer.requestTimeout = 1_860_000;
  httpServer.headersTimeout = 30_000;
}

process.once("SIGINT", async () => { await close(); process.exit(0); });
process.once("SIGTERM", async () => { await close(); process.exit(0); });

main().catch(async error => {
  process.stderr.write(`PhyloRender remote MCP failed: ${error.stack || error.message || error}\n`);
  await close();
  process.exit(1);
});
