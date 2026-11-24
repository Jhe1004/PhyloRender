# PhyloRender MCP Server

**English** | [简体中文](README.zh-CN.md)

PhyloRender MCP exposes the exact same parser, scientific invariants, layout engine, scientific-name typography, bipartition support matching, rooting, hierarchical clade brackets, ICS geologic timescale renderer, and SVG/PNG exporter used by the PhyloRender Web Workbench (`app.js` + `agent-bridge.js`). There is no second drawing implementation.

- **Version**: `0.8.0` (four workspaces: `phylogeny`, `time`, `cloud`, `conflict`; shared defaults via `figure-contract.js`; see [Web/MCP parity contract](../docs/WEB_MCP_PARITY.md))
- **License**: **GPL-3.0-or-later** ([LICENSE](../LICENSE), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md))
- **Canonical Units**: The complete figure width is `1000` drawing units (`u`) across all four workspaces (including double-tree conflict figures). Use `*_u` dimensions, `tip_spacing_u` / `tip_spacing_em`, `width_mm`, and `dpi` (`0` defaults to `400 mm` for single trees or `800 mm` for conflict figures). See [docs/physical-units.md](docs/physical-units.md).
- **Hierarchical Clades & Timescales**:
  - Group names default to `tip_size_u + 3 u` (`typography.clades.follow_tip_size: true`).
  - Multi-tier nested clades (`tier: 0` solid inner brackets, `tier: 1` dashed outer brackets, including same-node multi-tier assignments) lock every peer tier onto a single strict vertical column and stagger colliding vertical labels rightward without shifting brackets.
  - ICS geologic timescale cells (0–4567 Ma) keep full/abbreviated labels at the default font size when they fit, and adaptively shrink only narrow cells down to a `4 px` readability floor before omitting microscopic slivers.

## Capabilities

| MCP tool | Purpose |
| --- | --- |
| `inspect_tree` | Parse Newick/Nexus and report tips, branch lengths, support fields, time-tree diagnostics, and topology fingerprint |
| `compare_tree_samples` | Compare exact original tip labels in two trees and report complete differences before a conflict figure |
| `create_figure` | Create a figure from a main tree, display-only sample-name mappings, auxiliary node-data trees, semantic rooting, style options, and MRCA groups |
| `start_figure_job` | Start a background create with a required idempotency key; use for long analyses |
| `get_figure_job` | Poll queued/running/terminal state and obtain the committed figure ID |
| `cancel_figure_job` | Request cancellation; already committed figures are not deleted |
| `inspect_figure` | Read the current or an earlier revision, including stable branch/source/clade identifiers, without rasterization |
| `edit_figure` | Apply an atomic batch of semantic edits against an explicit base revision |
| `update_figure` | Apply a partial patch with required base_revision; stale revisions are rejected |
| `list_revisions` | List the complete edit history, notes, operations, and redacted diffs |
| `restore_revision` | Restore an earlier state by creating another revision; history is never overwritten |
| `preview_figure` | Return a bounded PNG preview and QA report for the current or a specified revision |
| `export_figure` | Return SVG by default; generate PNG or panel artifacts only when explicitly requested |
| `get_figure_spec` | Return reproducible settings and source hashes without raw tree text |
| `delete_figure` | Delete one job and all server-side artifacts |

The current artifacts are available through `phylorender://figures/{figureId}/{artifact}`. Every immutable historical artifact is addressable through `phylorender://figures/{figureId}/revisions/{revision}/{artifact}`. The figure schema and agent guide are `phylorender://schema/figure-spec` and `phylorender://docs/agent-guide`.

Creation, editing and restoration are SVG-only by default. This avoids opening extra browser rasterization contexts for every figure. `export_figure` defaults to `formats: ["svg"]`; request `formats: ["png"]` only when a user explicitly needs PNG. `preview_figure` is also explicit and creates only the bounded preview. Panel export produces SVG panels for `formats: ["panels"]`; add `"png"` to request panel rasters too. The web editor keeps its existing SVG and PNG export buttons.

## Conversational iteration

`create_figure` returns both `figure_id` and `revision: 1`. An agent keeps those values in the conversation, calls `inspect_figure` before every edit, and sends the returned revision as `base_revision` to `edit_figure`. A successful edit creates revision 2, 3, and so on. If another agent or browser session edits first, the stale request is rejected with a revision conflict instead of overwriting the newer work.

The preferred edit surface is semantic rather than coordinate-driven:

- nested display settings use `set_options`;
- rooting uses exact tip labels through `set_rooting`; when omitted, a unique `Euptelea pleiosperma` (including underscore-separated spelling) is the default outgroup for non-time trees. Missing/ambiguous matches retain the input root. Explicit `rooting.outgroup` overrides the default; time trees retain their calibrated root;
- sample display names use `tip_label_overrides`, `set_tip_label`, `merge_tip_labels`, `replace_tip_labels`, `remove_tip_label`, or `clear_tip_labels`; original tree labels remain the identities used by rooting, support matching, and clades;
- groups use stable `clade_id` values;
- group-bar names inherit their individual group's color, not a global text-color override; legacy `typography.clades.color` and `follow_clade_color=false` are ignored with a report warning;
- one group-bar name can use ordered `name_segments`; every segment independently controls font family, size, color, boldness, and italics. Unspecified color inherits that group's color; other unspecified properties inherit the global clade typography;
- auxiliary data use stable `source_id` values;
- the exceptional manual placement of one node label uses a stable unrooted `branch_id` plus a bounded offset relative to that true branch.

Output geometry is reproducible. `aspect_ratio` accepts `auto`, `content`, `1:1`, `4:3`, `3:2`, `16:9`, A4 orientations and `custom` with `custom_ratio=width/height`. The frame remains 1000 units wide; explicit ratios add height if needed, while full measured content takes priority. Auto/content use natural content height. Horizontal stretch changes branch span within this frame. DPI changes raster density only; reports expose actual width, height, ratio and effective DPI.

Every ordinary or Dating revision reports whether a two-panel set is available. The panel artifacts are generated only when explicitly requested. Small trees stay as one complete panel. Long trees split exactly once: panel 1 keeps the overview and an English continuation marker with extra local clearance above it, while panel 2 is one complete large monophyletic clade whose incoming root line reaches the figure top and ends in an upward arrow beside `Continued from Panel 1`. These display-only guides never alter topology or branch lengths. A third panel is never created. Rooting is applied before the split and the selected outgroup remains in panel 1.

For a Dating tree, `inspect_tree.time_label_density` reports the candidate node-age labels. At 160 or more candidates the default display is the older 50% of the root-to-present time range when no explicit age bounds are supplied. This suppresses only younger node-age numbers and their dots; HPD bars, tree geometry, ages, branches, and time coordinates stay intact. Set `options.time.age_minimum: 0` explicitly to request all labels. That deliberate full-label Dating render uses a bounded, cancellable 30-minute deadline instead of the ordinary 10-minute deadline.

Panels use natural dimensions rather than a fixed A4 page. They preserve configured font sizes, layout, colours, renamed tips, support rules, arrows, clade bars, scale bar, and time geology. Panel export always recomputes automatic compact tip spacing and never inherits manual `tip_spacing` or `tip_spacing_em`. Every returned panel has the same canvas width; a narrower panel gains blank canvas without scaling its tree or text. `report.two_panel` records these guarantees together with the panel count, split strategy, rooting order and second-panel tip count. Request `formats: ["panels"]` to receive panel SVGs. Request `formats: ["panels", "png"]` only when panel PNGs are explicitly needed. The old `a4` format name remains only as a deprecated alias for clients that have not migrated.

Numeric node labels use a small straight dashed pointer to the owning node by default. The pointer attaches to measured visible glyphs. The layout scores a preferred length of about 9.27 drawing units and a 20–80° angle from the horizontal; these geometry targets are advisory, as reported by `angle_and_length_are_soft_preferences`. Missing or misdirected pointers, unbridged crossings, unresolved text collisions and unplaced labels remain export-safety failures. Review angle/length warnings separately. Set `options.labels.node_arrows: false` to omit pointers; then unexpected residual pointers are failures.

For a mixed-style group name, keep `clades[].name` equal to the exact concatenation of all `name_segments[].text` values. Each segment accepts `family`, `size` (8–30), `color`, `bold`, and `italic`. `update_clade` may update both fields together; a segment-only patch derives `name` automatically, while a plain-name-only patch returns the group to one uniform style by clearing stale segments.

`list_revisions` exposes the audit trail. `restore_revision` creates a new revision from any earlier state, so an agent can interpret "undo the last change" without deleting history. See the agent guide for request examples and invariants.

## Requirements

- Node.js 20 or newer
- Python 3 for the existing local PhyloRender page/name-analysis service
- Google Chrome, Chromium, or a Playwright-managed Chromium build

Install dependencies:

```bash
cd mcp-server
npm install
```

If Chrome or Chromium is not installed:

```bash
npm run install-browser
```

## Local stdio server

Run directly:

```bash
npm start
```

Generic MCP client configuration:

```json
{
  "mcpServers": {
    "phylorender": {
      "command": "/usr/local/bin/node",
      "args": [
        "/absolute/path/to/PhyloRender/mcp-server/src/stdio.mjs"
      ],
      "env": {
        "PHYLORENDER_BROWSER_EXECUTABLE": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      }
    }
  }
}
```

Use the actual `node` path reported by `which node`. All protocol messages use stdout; diagnostics and child-process messages use stderr so they cannot corrupt MCP JSON-RPC.

## Remote Streamable HTTP server

Local test:

```bash
PHYLORENDER_MCP_TOKEN='replace-with-a-long-random-token' npm run start:http
```

Endpoint: `http://127.0.0.1:8766/mcp`

Health check: `http://127.0.0.1:8766/health`

Remote binding is deliberately refused unless a bearer token and allowed hosts are configured:

```bash
PHYLORENDER_MCP_HOST='0.0.0.0' \
PHYLORENDER_MCP_PORT='8766' \
PHYLORENDER_MCP_TOKEN='replace-with-a-long-random-token' \
PHYLORENDER_ALLOWED_HOSTS='mcp.example.org' \
PHYLORENDER_ALLOWED_ORIGINS='https://agent.example.org' \
PHYLORENDER_WEBSITE_URL='https://example.org' \
npm run start:http
```

Place the endpoint behind HTTPS. The included bearer-token mode is suitable for controlled clients and staging. A public multi-user service should put an MCP-compatible OAuth 2.1 authorization gateway in front of `/mcp`; the server intentionally does not pretend that a static token is a full public OAuth implementation.

### Deployment status

This repository is a local development snapshot. Historical service addresses and versions do not establish the running build. Verify the actual endpoint, build ID, authentication and a real render separately before deployment acceptance. Source changes do not restart or deploy services.

### Default visual policy for agents

Omitted options use the shared canonical defaults: sample labels about 13.24 u for ordinary/conflict or 15.88 u for Dating/cloud, node preferred 11.91 u and minimum 6.18 u, automatic measured glyph spacing, regular node numbers, and automatic local label placement. Exact values are in `figure-contract.js` through `defaults(workspace)`.

When a phylogram contains positive internal branch lengths but all terminal branch lengths are missing or zero, PhyloRender recognizes the ASTRAL-like display pattern and adds the same length-1 terminal twig to every tip in display coordinates only. The source Newick/Nexus is not edited. The report records the transformation under `display_branch_lengths`, and the scale bar is suppressed because the displayed coordinate system mixes source and display-only lengths.

The MCP initialization instructions, `create_figure` tool description, schema descriptions, and `phylorender://docs/agent-guide` all tell clients that empty space is not an objective. Agents must not shrink readable labels or enlarge blank margins merely to claim there is enough room; compact, legible use of the canvas comes first. User-supplied visual settings still override the defaults within the validated schema ranges.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PHYLORENDER_BROWSER_EXECUTABLE` | autodetect | Chrome/Chromium executable |
| `PHYLORENDER_APP_URL` | internal local service | Existing PhyloRender page URL to render against |
| `PHYLORENDER_PYTHON` | `python3` | Python executable for `tools/local_server.py` |
| `PHYLORENDER_OUTPUT_ROOT` | `mcp-server/var/figures` | Private specifications and generated artifacts |
| `PHYLORENDER_MAX_PNG_PIXELS` | `80000000` | Full PNG pixel safety cap; SVG is unaffected |
| `PHYLORENDER_PREVIEW_MAX_DIMENSION` | `1600` | Longest preview dimension in pixels |
| `PHYLORENDER_MCP_HOST` | `127.0.0.1` | Remote MCP bind address |
| `PHYLORENDER_MCP_PORT` | `8766` | Remote MCP port |
| `PHYLORENDER_MCP_TOKEN` | empty locally | Bearer token; mandatory for non-loopback binding |
| `PHYLORENDER_ALLOWED_HOSTS` | loopback only | Comma-separated HTTP Host allowlist |
| `PHYLORENDER_ALLOWED_ORIGINS` | loopback only | Comma-separated browser Origin allowlist |
| `PHYLORENDER_MCP_BODY_LIMIT` | `400mb` | Maximum JSON-RPC request body |

The tool schema restricts each tree text to 120 million characters and all tree text in one figure to 320 million characters. The HTTP default is 400 MiB. The internal cloud-date API accepts 200 MB; cloud-phyparts accepts 1,000 MB. These limits control input size, not tree count or computational capacity. Environment overrides can lower the HTTP limit. Changing defaults requires a service restart or deployment. Auxiliary source limits remain 20 support trees and 20 other-data trees; the group limit remains 200. The remote service validates Host, Origin when present, bearer credentials, figure identifiers, artifact names, numeric ranges, enums, and colors. It never accepts arbitrary server filesystem paths or remote URLs.

## Storage and privacy

Each figure is isolated under a random UUID directory. Every revision has its own private request, redacted specification, report, and SVG. PNG and preview files are added only by explicit raster requests; panel files are added only by explicit panel export. Committed figure specifications are never edited in place. `metadata.json` records the current revision and exact redacted diffs. The storage root, job directories, and raw tree requests use owner-only permissions. Public `spec.json` files contain only file names, byte counts, SHA-256 hashes, settings, and normalized results. `delete_figure` removes the complete revision history without touching user source files.

Set `PHYLORENDER_OUTPUT_ROOT` to ephemeral encrypted storage for a hosted privacy-first service, or to persistent storage if users need long-lived figure identifiers. Retention cleanup should be enforced by the hosting platform according to the site's published policy.

## Deployment container

From the project root:

```bash
docker build -f mcp-server/Dockerfile -t phylorender-mcp .
docker run --rm --init -p 127.0.0.1:8766:8766 \
  -e PHYLORENDER_MCP_TOKEN='replace-with-a-long-random-token' \
  -e PHYLORENDER_ALLOWED_HOSTS='localhost,127.0.0.1' \
  phylorender-mcp
```

For a real domain, replace the allowlist and terminate HTTPS/OAuth at the reverse proxy or identity gateway.

The recipe retains only the headless shell used for rendering, with its complete
browser notice. It removes the full-browser payload containing separately
licensed Widevine and reconstructs a clean root layer. Do not distribute the
upstream/intermediate stages or build cache as the application image. The actual
final filesystem and every saved image layer can be checked from the source
checkout with `node mcp-server/tests/image-distribution.mjs IMAGE NEW_OUTPUT`.
The `--base-only` option checks only the generic browser stage and does not
accept an application image. The source evaluation package is also included at
`/app/evaluation/`; retain private trial output outside the public source tree.

## Verification

```bash
npm test
```

The stdio test uses the real 173-tip default main tree and RAxML auxiliary support tree. It verifies all 15 tools, stable semantic identifiers, atomic edits, four immutable revisions, stale-edit rejection, historical resource reading, restoration, topology fingerprints, zero residual collisions, redaction, export, and deletion. The HTTP test verifies Streamable HTTP discovery, bearer rejection, Host/Origin controls, tool execution, and ultrametric inspection.

## Publication audit additions

The project license is GPL-3.0-or-later; see the repository LICENSE and THIRD_PARTY_NOTICES.md. Release approval remains a separate evidence gate.

MCP SDK 1.32.2 and Zod 4.6.7 are pinned in the lockfile. Tool arguments are limited to 100000 object keys plus array elements in total before tool-schema validation. This structural bound is independent of tree-text and HTTP-body limits. Oversized structures are refused; no collection is truncated.

`inspect_tree.tip_labels` returns original parsed labels, including underscores. `compare_tree_samples` uses the same unambiguous case/space/underscore policy as conflict rendering, reports original labels in differences, and rejects collisions. Its `identical_original_sample_sets` field separately reports literal set equality.

When a historical revision needs PNG/preview/panel artifacts, its re-rendered SVG must exactly match the stored SVG, ignoring only the build metadata element. Differences in text, fonts, geometry, layers or scientific metadata produce `ARTIFACT_RENDER_MISMATCH` before new files are written. Use the recorded environment or create and inspect a new figure. Existing revisions are preserved.

Two-panel export is rendered on demand: standard SVG, PNG, and preview calls return a `two_panel` split plan (`generated: false`, `measurement_status: "not_requested"`) without pre-rendering panel layouts. Requesting `panels` explicitly invokes the shared renderer; unrendered plans omit measured minimum font sizes and `readable` verdicts. Stored revision SVGs and creation reports remain immutable, while subsequent panel exports are verified against the exported artifact metadata.

Support scales: `auto` mode rejects inputs whose non-zero values all fall in `(0, 1]` or contain mixed scale evidence rather than guessing between posterior probabilities and low percentages. Callers should declare `probability` or `percent` explicitly (per column for composite support strings). Low-support thresholds and bipartition discordance statistics always evaluate raw values; full-support visual styling (`100` or `1`) follows the displayed precision when rounding is enabled, or raw values when `decimals: "auto"`. Missing supplementary sources never count as full support, and raw support values are never mutated. Scale declarations are scientific inputs, not cosmetic preferences.
