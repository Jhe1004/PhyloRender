#!/usr/bin/env node
import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPhyloRenderMcpServer } from "./mcp.mjs";
import { createRuntime } from "./runtime.mjs";
import { FigureStore } from "./store.mjs";
import { acquireWriterLease } from "./writer-lease.mjs";
import contract from "../../figure-contract.js";

const maximumMessageBytes = contract.capabilities.performance_limits.mcp_stdio_message_bytes;
const messageLimit = Number(process.env.PHYLORENDER_MCP_STDIO_MESSAGE_LIMIT ?? maximumMessageBytes);
if (!Number.isSafeInteger(messageLimit) || messageLimit < 1024 || messageLimit > maximumMessageBytes)
  throw new Error(`PHYLORENDER_MCP_STDIO_MESSAGE_LIMIT must be an integer from 1024 to ${maximumMessageBytes} bytes.`);

let runtime = null;
let server = null;
let releaseLease = null;
let startup = null;
let closing = null;
let stopping = null;

async function close() {
  if (!closing) closing = (async () => {
    await server?.close().catch(() => undefined);
    await runtime?.close().catch(() => undefined);
    await releaseLease?.();
  })();
  return closing;
}

function stop(code = 0) {
  if (!stopping) stopping = (async () => {
    // Do not abandon a runtime/lease still being acquired during startup.
    await startup?.catch(() => undefined);
    try { await close(); }
    catch (error) { process.stderr.write(`PhyloRender cleanup failed: ${error.message}\n`); code = 1; }
    process.exit(code);
  })();
  return stopping;
}

async function main() {
  runtime = await createRuntime();
  const store = new FigureStore(runtime.renderer);
  releaseLease = await acquireWriterLease(store.outputRoot);
  await store.initialize();
  server = createPhyloRenderMcpServer({ renderer: runtime.renderer, store });
  server.server.onclose = () => { void stop(); };
  await server.connect(new StdioServerTransport(process.stdin, process.stdout, {maxBufferSize: messageLimit}));
  process.stderr.write(`PhyloRender MCP stdio server ready; page renderer ${runtime.pageUrl}\n`);
}

process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
// Keep stdin buffered until the transport attaches its data listener. Resuming
// it here would lose an initialize request sent while the browser is starting.
process.stdin.once("end", () => { void stop(); });
process.stdin.once("error", () => { void stop(1); });
process.stdout.once("error", () => { void stop(1); });

startup = main();
startup.catch(async error => {
  process.stderr.write(`PhyloRender MCP failed: ${error.stack || error.message || error}\n`);
  await close();
  process.exit(1);
});
