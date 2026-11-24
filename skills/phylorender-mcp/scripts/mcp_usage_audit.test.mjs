import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendMcpUsageAudit, mcpServiceMode } from "./mcp_usage_audit.mjs";
import { LOCAL_ENDPOINT } from "./local_service.mjs";

test("classifies local, public, custom, and unresolved MCP routes", () => {
  const configuredPublic = "https://remote.example.test/mcp";
  assert.equal(mcpServiceMode(LOCAL_ENDPOINT), "local");
  assert.equal(mcpServiceMode(configuredPublic, { publicEndpoint: configuredPublic }), "public");
  assert.equal(mcpServiceMode("https://example.test/mcp", { publicEndpoint: configuredPublic }), "custom");
  assert.equal(mcpServiceMode(null), "unresolved");
});

test("appends a minimal JSONL audit record without request content", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "phylorender-audit-"));
  const result = await appendMcpUsageAudit({
    invocation_id: "9f0c83ad-d99e-4d89-9956-d82b5f18c705",
    phase: "routed",
    status: "started",
    command: "call",
    tool_name: "inspect_tree",
    figure_id: null,
    service_endpoint: LOCAL_ENDPOINT,
    automatic_routing: true,
  }, {
    stateRoot,
    now: () => new Date("2026-10-25T12:00:00.000Z"),
  });
  const records = (await readFile(result.file, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(records.length, 1);
  assert.equal(records[0].timestamp, "2026-10-25T12:00:00.000Z");
  assert.equal(records[0].service_mode, "local");
  assert.equal(records[0].service_endpoint, LOCAL_ENDPOINT);
  assert.equal(records[0].tool_name, "inspect_tree");
  assert.equal(Object.hasOwn(records[0], "arguments"), false);
  assert.equal(Object.hasOwn(records[0], "tree_content"), false);
});
