# Shared local MCP operations

## Normal use

Run the installed client helper. It checks health, starts the local service if needed, and verifies MCP tool discovery.

```bash
node <skill-dir>/scripts/phylorender_mcp_client.mjs health
node <skill-dir>/scripts/phylorender_mcp_client.mjs tools
```

Startup waits at most 40 seconds. MCP connection and discovery each use a 15-second request limit. Tool calls use a 1860-second request limit by default.
The helper uses one startup lock. It does not start duplicate processes across simultaneous agents.
It does not restart healthy services. It does not claim that old processes load newly edited code.

The service starts its own internal page server. Opening the workbench HTML does not start MCP.

## Other local agents

Configure their Streamable HTTP MCP endpoint as `http://127.0.0.1:8766/mcp`.
The automatically started loopback service needs no bearer token unless `PHYLORENDER_LOCAL_MCP_TOKEN` is required by a protected host.
Only processes on this machine can reach `127.0.0.1:8766`. A cloud agent cannot reach your localhost.
The skill can manage startup only for agents that read this skill or run its helper.
Other clients must configure this endpoint themselves.

Do not expose an unprotected loopback service to the LAN or internet.
Do not forward remote bearer tokens to local services.

## Local Configuration File (`local-config.json`)

Each local installation directory may contain a gitignored `local-config.json` (never committed to git) to bind environment-specific paths without hardcoding them in scripts or prompts:

```json
{
  "repoRoot": "/path/to/PhyloRender",
  "stateRoot": "/path/to/shared-runtime",
  "localEndpoint": "http://127.0.0.1:8766/mcp",
  "publicEndpoint": "https://your-remote-host/mcp",
  "keychainService": "your-keychain-service"
}
```

Environment variables (`PHYLORENDER_MCP_PACKAGE_ROOT`, `PHYLORENDER_LOCAL_STATE_ROOT`, `PHYLORENDER_PUBLIC_MCP_ENDPOINT`, `PHYLORENDER_MCP_TOKEN`, `PHYLORENDER_KEYCHAIN_SERVICE`, `PHYLORENDER_KEYCHAIN_ACCOUNT`) always override `local-config.json`. Without a `local-config.json`, `stateRoot` defaults to `~/.phylorender/local-mcp`, and `packageRoot` auto-detects `mcp-server/` relative to the repository or current working directory.

## State and failures

Runtime directory (`stateRoot`):

- `service.json`: launch PID, source root, endpoint, and launch time.
- `service.log`: append-only process diagnostics.
- `mcp-usage.jsonl`: append-only audit trail for every client invocation. Each invocation records request, route, and finish events with the actual endpoint and `local`, `public`, or `custom` service mode. Tree content, request arguments, and tokens are never recorded.
- `figures/`: persistent local figure revisions.
- `origins/`: one endpoint record per figure ID.
- `jobs/`: one endpoint record per background `job_id`.
- `startup.lock/`: active launch lock.

Check the log when startup fails. Check the stored PID before touching a lock or process.
Do not remove a lock owned by a live process. The helper recovers locks whose recorded owner has exited.
If a lock has no owner record, inspect it manually. Do not assume that another agent has finished writing it.
If port 8766 belongs to another application, do not kill that application.
Missing Node, dependencies, Python, or Chromium can prevent startup. Report the missing dependency before changing the environment.

Automatic fallback to `publicEndpoint` applies **only** when a remote endpoint is explicitly configured, no local dispatch occurred, and local startup/discovery did not fail with HTTP 429 (`SERVICE_BUSY`) or a scientific/validation error. Do not route busy or invalid requests to an external endpoint.

## Explicit routing and existing figures

Use an explicit endpoint when continuing an existing remote figure or job:

```bash
PHYLORENDER_MCP_ENDPOINT='https://your-remote-host/mcp' \
node <skill-dir>/scripts/phylorender_mcp_client.mjs call inspect_figure /path/to/request.json
```

The helper rejects an explicit endpoint that conflicts with a recorded origin (`origins/` or `jobs/`).
An unknown origin requires an explicit endpoint. Never guess from the UUID.
If a dispatched call times out, inspect its original service before any retry.

Environment overrides:

- `PHYLORENDER_SKILL_CONFIG`: override the `local-config.json` path.
- `PHYLORENDER_MCP_ENDPOINT`: pin one service; disable automatic fallback.
- `PHYLORENDER_PUBLIC_MCP_ENDPOINT`: configure optional remote fallback URL.
- `PHYLORENDER_LOCAL_MCP_ENDPOINT`: override the default loopback URL (`http://127.0.0.1:8766/mcp`).
- `PHYLORENDER_MCP_PACKAGE_ROOT`: override the active MCP package location.
- `PHYLORENDER_MCP_SDK_ROOT`: override only the SDK module location.
- `PHYLORENDER_LOCAL_STATE_ROOT`: isolate tests or use another approved runtime directory.
- `PHYLORENDER_LOCAL_MCP_TOKEN`: authenticate an existing protected local service.
- `PHYLORENDER_MCP_TOKEN`: authenticate remote or explicitly selected services.
- `PHYLORENDER_KEYCHAIN_SERVICE` / `PHYLORENDER_KEYCHAIN_ACCOUNT`: optional macOS Keychain lookup for remote bearer tokens.
- `PHYLORENDER_MCP_HEALTH`: override the health URL for an explicitly selected service.
- `PHYLORENDER_MCP_AUDIT_LOG`: override the required append-only MCP usage log path.
- `PHYLORENDER_MCP_CALL_TIMEOUT_MS`: override the default 1860000 ms (31 min) tool call timeout.

Keep `origins/` and `jobs/` records with the figure data. Do not delete them during a skill update.
