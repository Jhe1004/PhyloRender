# PhyloRender

**English** | [简体中文](README.zh-CN.md)

**A human- and agent-accessible platform for reproducible, publication-ready phylogenetic visualization**

Modern phylogenomic studies rely heavily on publication-quality trees, yet researchers still face three everyday bottlenecks:

1. **No native AI Agent interface (no dedicated MCP server or Agent Skill)**: Existing phylogenetic software—both GUI viewers and plotting libraries—was built only for manual clicking or ad-hoc scripts. Without a structured Model Context Protocol (MCP) server and domain-specific Agent Skill, AI agents cannot reliably inspect taxon identities, apply MRCA-based clade edits, or check layout quality without fragile glue code.
2. **Fragmented multi-software pipelines across standard manuscript figures**: A typical phylogenomic paper requires a multi-support phylogram, a fossil-calibrated chronogram (dating tree), cytonuclear discordance comparisons (plastome/mitogenome vs. nuclear trees), and gene-tree/species-tree conflict plots combining cloudograms with discordance pie charts. No single conventional tool covers all four, forcing researchers through a dozen or more disconnected programs, format conversions, and scripts.
3. **The "last-mile" manual vector-editing trap**: Even after trees are plotted, node support values and ages routinely collide with dense short branches, while clade grouping, nested clade labeling, branch coloring, and geologic timescale backgrounds in chronograms still require hours of manual dragging and drawing in Adobe Illustrator, CorelDRAW, or Inkscape—work that is lost every time samples change or reviewers request revisions.

**PhyloRender solves all three bottlenecks in one unified platform.** Built on a **single shared deterministic, collision-free engine**, it brings together an interactive **Web Workbench**, a built-in **MCP Server**, and a ready-to-install **Agent Skill** across all four core phylogenomic workspaces—delivering reproducible, submission-ready vector SVGs and high-DPI PNGs directly from Newick/Nexus files.

> **Full Documentation**: [English User Guide](docs/USER_GUIDE.md) · [中文详尽使用文档](docs/USER_GUIDE.zh-CN.md) · [MCP Server Guide (EN)](mcp-server/README.md) · [MCP 服务手册 (中文)](mcp-server/README.zh-CN.md) · [Agent Skill Guide (EN)](skills/phylorender-mcp/README.md) · [Agent Skill 使用指南 (中文)](skills/phylorender-mcp/README.zh-CN.md)

---

## Overview: What PhyloRender Does

### Four Integrated Workspaces

| Workspace | MCP `workspace` | Primary Scientific Tasks & Built-in Features |
| --- | --- | --- |
| **Phylogram** | `phylogeny` | Standard phylogenies with single or multi-tree bipartition-matched node supports (e.g., ML bootstrap `%` + ASTRAL LPP / Bayesian PP), scale-aware decimal precision, `2.5×` bold full-support branches, collision-free `45°` bridged dashed leader lines, and hierarchical clade brackets. |
| **Time Tree** | `time` | Fossil-calibrated chronograms displaying node ages, 95% HPD intervals, and official ICS (0–4567 Ma) geologic timescales with per-cell adaptive narrow-interval label fitting. Strictly preserves input root and chronology; suppresses support values. |
| **Cloudogram & Discordance** | `cloud` | Multi-gene cloud overlays aligned to a dated species tree (`display_alignment` via managed `treePL`) paired with a built-in, Java-free 4-category rooted bipartition discordance pie engine (following Smith et al., 2015). |
| **Tanglegram** | `conflict` | Side-by-side two-tree topological comparisons with strict 1-to-1 taxon identity matching, sister-clade untangling to minimize connector crossings, and tight leaderless support placement. |

### Core Design Highlights

- **Single Source of Truth (Web ↔ MCP Parity)**: Both the Web Workbench and MCP server execute the exact same `core/` scientific models, `render/` layout engine, `figure-contract.js` (`1000-u` canonical canvas width), and `agent-bridge.js` serializer.
- **Strict Scientific Invariants**: Input topologies, branch lengths, support values, node ages, HPD intervals, and original taxon identities (including specimen accession underscores such as `2023080906_1`) are never mutated by styling, ladderization, italicization, or display renaming.
- **Zero-Collision Publication Typography**: Score-guided candidate search for node labels with `45°` bridged dashed leaders, median-based proportional tip-width capping (`1.25×` median width), automatic portrait row spacing (`h/w ≈ 1.25` target for sparse trees), and automatic binomial italicization via optional offline `gnfinder`/`gnparser` (with built-in botanical/zoological fallback rules).
- **Strict Multi-Tier Clade Brackets**: Supports single-layer or multi-tier nested taxonomy (e.g., inner solid tribe brackets + outer dashed subfamily brackets), including **same-node multi-tier assignments** (e.g., a monotypic subfamily carrying both `tier: 0` tribe and `tier: 1` subfamily brackets). Multi-tier layouts lock every peer tier onto one strict vertical column and stagger colliding vertical labels rightward without shifting brackets.
- **Monophyletic Two-Panel Split (`panels`)**: Tall ordinary or dated trees can be split once into two equal-width panels, isolating one complete monophyletic crown clade in Panel 2 while automatically inheriting spanning outer clade brackets across panels.
- **Deterministic Provenance & Safety**: Every MCP figure stores immutable revisions, redacted `spec.json`, and structured `report.json` (`safe_for_export`, `remaining_collisions`, `topology_unchanged`, `font_portability`, `clade_bar_spacing`). Long-running MCP sessions automatically recover if the headless browser disconnects.

---

## Quick Start

### Prerequisites

- **Python 3.9+** (for the local loopback Web Workbench server and managed native helpers)
- **Node.js 20+** and **Google Chrome / Chromium** (for the MCP server and Agent Skill; Playwright can install Chromium automatically)

```bash
git clone https://github.com/Jhe1004/PhyloRender.git
cd PhyloRender
```

---

### 1. Interactive Web Workbench (Human GUI)

Start the local loopback server from the repository root:

```bash
python3 tools/local_server.py --host 127.0.0.1 --port 8765 --open
```

- On **macOS**, you can also double-click `start_phylorender.command`.
- The workbench opens empty by default. To explore built-in public demonstration datasets immediately, open:
  - Phylogram demo: `http://127.0.0.1:8765/?demo=1&workspace=phylogeny`
  - Time Tree demo: `http://127.0.0.1:8765/?demo=1&workspace=time`
  - Cloudogram demo: `http://127.0.0.1:8765/?demo=1&workspace=cloud`
  - Tanglegram demo: `http://127.0.0.1:8765/?demo=1&workspace=conflict`
- Export editable SVGs, high-DPI PNGs, or complete `spec.json` files from the **Export** tab.

---

### 2. MCP Server (AI Agents & Programmatic Pipelines)

Install MCP server dependencies once:

```bash
npm ci --prefix mcp-server
# Optional if Chrome/Chromium is not installed locally:
npm --prefix mcp-server run install-browser
```

#### Option A: Local `stdio` MCP (Claude Desktop, Cursor, Windsurf, Codex, Antigravity)

Add to your MCP client configuration (replace `/absolute/path/to/PhyloRender` with your local clone path):

```json
{
  "mcpServers": {
    "phylorender": {
      "command": "node",
      "args": ["/absolute/path/to/PhyloRender/mcp-server/src/stdio.mjs"]
    }
  }
}
```

#### Option B: Local Streamable HTTP MCP

```bash
npm --prefix mcp-server run start:http
```

- Endpoint: `http://127.0.0.1:8766/mcp`
- Health check: `http://127.0.0.1:8766/health`

#### Option C: Docker Container (Linux / Shared Server)

```bash
docker build -f mcp-server/Dockerfile -t phylorender-mcp .
docker run --rm --init -p 127.0.0.1:8766:8766 \
  -e PHYLORENDER_MCP_TOKEN='replace-with-a-long-random-token' \
  -e PHYLORENDER_ALLOWED_HOSTS='localhost,127.0.0.1' \
  phylorender-mcp
```

---

### 3. Agent Skill (`skills/phylorender-mcp/`)

This repository ships a complete, self-contained **Agent Skill** in [`skills/phylorender-mcp/`](skills/phylorender-mcp/) designed for AI coding assistants (Codex, Antigravity, Claude Code, Cursor, etc.).

#### Why Use the Agent Skill?
Instead of letting an AI assistant write fragile ad-hoc R/Python plotting scripts or guess screen coordinates, the skill equips the agent with:
1. **Local-first shared MCP orchestration** (`scripts/phylorender_mcp_client.mjs`): automatically starts/reuses a single loopback MCP instance (`127.0.0.1:8766`), supports relative file paths in request JSON, handles async jobs (`start_figure_job` / `wait`), and supports long renders (>30 min) without hitting default 5-minute HTTP timeouts.
2. **Scientific confirmation gates**: requires explicit outgroup confirmation on non-dated trees, asks before rendering dense (>160-node) chronograms, enforces strict 1-to-1 sample-mismatch checks on tanglegrams, and forbids silently mutating source trees.
3. **Default-first fast SVG return**: uses canonical `*_u` defaults and returns editable SVG immediately unless PNG or two-panel export is explicitly requested.

#### 30-Second Skill Installation

```bash
# 1. Install MCP server dependencies once (from the PhyloRender root)
npm ci --prefix mcp-server

# 2. Copy the skill folder into your agent's skill directory
# For Codex:
cp -R skills/phylorender-mcp ~/.codex/skills/phylorender-mcp
# For Antigravity / Gemini CLI:
cp -R skills/phylorender-mcp ~/.gemini/config/skills/phylorender-mcp

# 3. Point the skill to your cloned PhyloRender repository (gitignored)
cp skills/phylorender-mcp/local-config.example.json ~/.codex/skills/phylorender-mcp/local-config.json
# Edit "repoRoot" inside local-config.json to your absolute PhyloRender path

# 4. Verify live health and tool discovery
node ~/.codex/skills/phylorender-mcp/scripts/phylorender_mcp_client.mjs health
node ~/.codex/skills/phylorender-mcp/scripts/phylorender_mcp_client.mjs tools
```

For detailed workflows, copy-paste prompt examples, and troubleshooting, read [skills/phylorender-mcp/README.md](skills/phylorender-mcp/README.md) ([中文指南](skills/phylorender-mcp/README.zh-CN.md)) and [docs/USER_GUIDE.md](docs/USER_GUIDE.md) ([中文详尽文档](docs/USER_GUIDE.zh-CN.md)).

---

## Documentation Index

| Topic | English | 简体中文 |
| --- | --- | --- |
| Project Overview & Quick Start | [README.md](README.md) | [README.zh-CN.md](README.zh-CN.md) |
| Comprehensive User & Reviewer Guide | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | [docs/USER_GUIDE.zh-CN.md](docs/USER_GUIDE.zh-CN.md) |
| Agent Skill Installation & Usage | [skills/phylorender-mcp/README.md](skills/phylorender-mcp/README.md) | [skills/phylorender-mcp/README.zh-CN.md](skills/phylorender-mcp/README.zh-CN.md) |
| MCP Server API & Deployment | [mcp-server/README.md](mcp-server/README.md) | [mcp-server/README.zh-CN.md](mcp-server/README.zh-CN.md) |
| MCP Agent Reference & Schemas | [mcp-server/docs/agent-guide.md](mcp-server/docs/agent-guide.md) | [mcp-server/docs/physical-units.md](mcp-server/docs/physical-units.md) |
| Evaluation Benchmark Suite | [evaluation/README.md](evaluation/README.md) | — |

---

## Verification & Testing

Run the full automated test and release-compliance suite from the repository root:

```bash
node tools/build-manifest.cjs
node tools/check-project.cjs
node tools/check-release.cjs
node --test skills/phylorender-mcp/scripts/local_service.test.mjs
```

For real-browser end-to-end integration tests:

```bash
(cd mcp-server && node tests/mcp-smoke.mjs && node tests/http-smoke.mjs)
```

---

## License & Citation

- **License**: Original source code is licensed under **GPL-3.0-or-later** ([LICENSE](LICENSE)). Third-party components, bundled fonts, and public demonstration datasets retain their respective licenses ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [defaults/README.md](defaults/README.md)).
- **Citation**: Please cite the accompanying *Molecular Ecology Resources* article via [CITATION.cff](CITATION.cff):
  > *PhyloRender: a human- and agent-accessible platform for reproducible phylogenetic visualization* (v0.8.0).
