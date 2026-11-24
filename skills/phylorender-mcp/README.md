# PhyloRender Agent Skill (`phylorender-mcp`)

**English** | [简体中文](README.zh-CN.md)

This directory contains the self-contained **Agent Skill** for operating the PhyloRender MCP server from AI coding assistants (e.g., Codex, Antigravity, Claude Code, Cursor, or any Agent Skills–compatible client).

## What This Skill Does

- Routes phylogenetic visualization tasks **local-first** through a single shared loopback MCP server (`http://127.0.0.1:8766/mcp`), starting it automatically on demand.
- Translates natural-language figure requests into canonical PhyloRender MCP tool calls (`inspect_tree`, `compare_tree_samples`, `create_figure`, `start_figure_job`, `edit_figure`, `export_figure`).
- Enforces scientific confirmation gates (explicit outgroup confirmation for non-dated trees, dense dating-label coverage confirmation, strict two-tree sample mismatch reporting, and zero-mutation of original trees).
- Returns vector SVG artifacts directly by default without unnecessary rasterization or ad-hoc plotting scripts.

## 30-Second Setup

1. **Install PhyloRender MCP dependencies** (from the PhyloRender repository root):

   ```bash
   npm ci --prefix mcp-server
   # Optional if Chrome/Chromium is not installed locally:
   npm --prefix mcp-server run install-browser
   ```

2. **Copy or symlink this skill folder** into your agent's skill directory (example paths):

   ```bash
   # Codex
   cp -R skills/phylorender-mcp ~/.codex/skills/phylorender-mcp

   # Antigravity / Gemini CLI
   cp -R skills/phylorender-mcp ~/.gemini/config/skills/phylorender-mcp
   ```

3. **Bind your local PhyloRender checkout** using a gitignored `local-config.json` inside the installed skill folder:

   ```bash
   cp local-config.example.json local-config.json
   ```

   Edit `repoRoot` in `local-config.json` to the absolute path of your cloned `PhyloRender` repository (environment variable `PHYLORENDER_MCP_PACKAGE_ROOT` also works and overrides `local-config.json`).

4. **Verify connectivity**:

   ```bash
   node scripts/phylorender_mcp_client.mjs health
   node scripts/phylorender_mcp_client.mjs tools
   ```

## Example Prompts You Can Copy

- *"Plot `species_ml.newick` with `astral_lpp.newick` as secondary support, rooted on `Outgroup_sp`, and highlight two nested tiers: tribes (inner solid) and subfamilies (outer dashed)."*
- *"Render my calibrated chronogram `dated_tree.nex` with 95% HPD bars and the ICS geologic timescale in Ma."*
- *"Build a gene-tree/species-tree cloudogram from `species_dated.nwk` and `86_genes.trees` with 4-part discordance pies rooted on `Outgroup_sp`."*
- *"Compare `nuclear.nwk` and `plastid.nwk` as a tanglegram, untangle sister clades to minimize crossings, and export SVG."*

## Files in This Skill

- `SKILL.md` — Operational protocol, confirmation gates, and rendering rules for AI agents.
- `scripts/phylorender_mcp_client.mjs` — Local-first MCP CLI helper (handles health checks, shared startup lock, relative file hydration, async job polling, and artifact download).
- `scripts/local_service.mjs` & `scripts/local_service.test.mjs` — Shared loopback service manager and unit tests.
- `references/workflows.md` — Complete JSON request templates for all four workspaces.
- `references/user-guide.md` — Plain-language capability guide for new users.
- `references/local-service.md` — Local/remote routing, state directory, and troubleshooting reference.
- `local-config.example.json` — Template configuration file (copy to `local-config.json`; never commit personal paths or tokens).
