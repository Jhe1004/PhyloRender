import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {findBrowserExecutable} from '../src/runtime.mjs';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function postWithHost(port, hostHeader, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} });
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/mcp",
      method: "POST",
      headers: {
        Host: hostHeader,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${token}`,
      },
    }, response => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    request.once("error", reject);
    request.end(body);
  });
}

async function waitForHealth(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error("HTTP MCP server did not become ready.");
}

const port = await freePort();
const outputRoot = await mkdtemp(path.join(os.tmpdir(), "phylorender-http-smoke-"));
const token = "phylorender-test-token";
const child = spawn(process.execPath, ["src/http.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PHYLORENDER_MCP_HOST: "127.0.0.1",
    PHYLORENDER_MCP_PORT: String(port),
    PHYLORENDER_MCP_TOKEN: token,
    PHYLORENDER_OUTPUT_ROOT: outputRoot,
    PHYLORENDER_BROWSER_EXECUTABLE: await findBrowserExecutable(),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let client = null;
try {
  await waitForHealth(`http://127.0.0.1:${port}/health`);
  const unauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(unauthorized.status, 401);
  // Headers alone must be rejected before an attacker supplies a declared 1 GB body.
  const unauthorizedLarge = await new Promise((resolve, reject) => {
    const request = http.request({host:"127.0.0.1",port,path:"/mcp",method:"POST",
      headers:{"Content-Type":"application/json","Content-Length":"1000000000"}}, response => {
      response.resume(); response.once("end",()=>{resolve(response.statusCode);request.destroy();});
    });
    request.setTimeout(2000,()=>{request.destroy();reject(new Error("authentication waited for body"));});
    request.on("error",reject); request.flushHeaders();
  });
  assert.equal(unauthorizedLarge,401);
  const malformedUnauthorized = await fetch(`http://127.0.0.1:${port}/mcp`,{
    method:"POST",headers:{"Content-Type":"application/json"},body:"{broken"});
  assert.equal(malformedUnauthorized.status,401);

  assert.equal(await postWithHost(port, "attacker.example", token), 403);

  const rejectedOrigin = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "initialize", params: {} }),
  });
  assert.equal(rejectedOrigin.status, 403);

  client = new Client({ name: "phylorender-http-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 15);
  const inspection = await client.callTool({
    name: "inspect_tree",
    arguments: { main_tree: { name: "small.tre", content: "((A:1,B:1)95:1,(C:1,D:1)80:1);" } },
  });
  assert.equal(inspection.isError, undefined);
  assert.equal(inspection.structuredContent.tips, 4);
  assert.equal(inspection.structuredContent.main_support_nodes, 0);
  assert.equal(inspection.structuredContent.ultrametric.ultrametric, true);
  console.log(JSON.stringify({
    endpoint: `http://127.0.0.1:${port}/mcp`,
    bearerAuthenticationRequired: true,
    hostAllowlistEnforced: true,
    originAllowlistEnforced: true,
    tools: tools.tools.length,
    inspectedTips: inspection.structuredContent.tips,
  }, null, 2));
} finally {
  await client?.close().catch(() => undefined);
  child.kill("SIGTERM");
  await new Promise(resolve => child.once("exit", resolve));
  await rm(outputRoot, { recursive: true, force: true });
}
