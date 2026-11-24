# PhyloRender User & Reviewer Guide

**English** | [简体中文](USER_GUIDE.zh-CN.md)

This guide provides a complete walkthrough of **PhyloRender (v0.8.0)**: its architecture, four visualization workspaces, scientific invariants, Web Workbench workflow, MCP Server integration, and **Agent Skill** setup and usage.

---

## 1. Platform Architecture

PhyloRender separates **interaction surfaces** from a **single deterministic core**:

```text
Human Researcher (Browser)              AI Coding Agent (Codex / Antigravity / Claude / Cursor)
        │                                                 │
        ▼                                                 ▼
Web Workbench (index.html + app.js)      Agent Skill (skills/phylorender-mcp/) + MCP Server (stdio / HTTP)
        │                                                 │
        └───────────────────────┬─────────────────────────┘
                                ▼
          Shared Semantic Bridge (agent-bridge.js) & Contract (figure-contract.js)
                                ▼
         Pure Scientific Models (core/) + Deterministic Renderers (render/)
                                ▼
   Editable Vector SVG (1000-u) · Optional High-DPI PNG · Two-Panel Split · spec.json · report.json
```

Because both interfaces load the exact same browser engine and JavaScript modules, a figure created via MCP can be opened in the Web Workbench for interactive inspection, and a `spec.json` exported from the Web Workbench reproduces identically through MCP.

---

## 2. Detailed Guide to the Four Workspaces

### 2.1 Phylogram (`workspace: "phylogeny"`)
- **Inputs**: Main tree (Newick/Nexus) plus up to 20 auxiliary support trees or auxiliary numeric-data trees matched by unrooted bipartition identity.
- **Multi-Source Support Display**:
  - Automatically formats composite supports (e.g., `ML BS / ASTRAL LPP`) using scale-aware precision (`decimals: "auto"` formats percentages as integers and probabilities to 2 decimals).
  - Supports explicit `percent` (`0–100`) and `probability` (`0–1`) declarations; refuses to guess ambiguous scales.
  - Full dual-support branches (`100/1.00`, evaluated after active display rounding) can be rendered as `2.5×` bold branches (`full_support_marker: "branch"`), reducing visual clutter while keeping all raw values intact.
  - Low-support thresholds (`low_support_threshold`, e.g., `< 50`) always evaluate raw unrounded values and mask sub-threshold values as `–`.
- **Collision-Free Node Labels**: Evaluates multi-directional candidate positions against branch segments, tip labels, and node markers, connecting displaced numerals with `45°` bridged dashed leader lines (`remaining_collisions = 0`).
- **ASTRAL-Like Zero-Terminal Trees**: When internal branch lengths are positive but all terminal branch lengths are missing or zero, PhyloRender applies a uniform display-only length-1 terminal twig, suppresses the misleading scale bar, and discloses `display_branch_lengths` in the report without modifying the input file.

### 2.2 Time Tree (`workspace: "time"`)
- **Inputs**: Fossil-calibrated Newick/Nexus chronogram (e.g., StarBEAST3, BEAST2, MCMCTree, RelTime) with node heights/ages and optional 95% HPD intervals.
- **Two-Step Guided Import**: Step 1 loads the tree; Step 2 confirms the source time unit (`years`, `kyr`, `mya`, `bya`) and whole-tree age source (`mean`, `median`, `height`, or `branch_lengths`). Age sources are never mixed across nodes.
- **Scientific Safeguards**:
  - Strictly preserves the input root and chronology (no automatic rerooting or re-dating).
  - Intentionally suppresses posterior/bootstrap support markers and branch thickening so readers never confuse statistical support with temporal uncertainty.
  - Rejects negative ages, age inversions, malformed HPD intervals, and non-zero terminal ages beyond floating-point roundoff (`rootAge × 64 × Number.EPSILON`).
- **ICS Geologic Timescale**: Continuous coverage of the official ICS 0–4567 Ma timescale (Periods and Epochs). Cells with ample width render full names or standard abbreviations at the default font size; narrow cells (such as Quaternary `Q`, Pliocene `Pl`, Pleistocene `Ps` on a 100 Ma scale) adaptively shrink only that cell's shortest label down to a `4 px` readability floor before omitting microscopic slivers.
- **Dense Dating Trees**: Trees with ≥160 candidate internal age labels default to showing the older 50% of the root-to-present range unless an explicit `age_minimum` (e.g., `0` for all nodes) is requested; all HPD bars and coordinates are always retained.

### 2.3 Cloudogram & Discordance (`workspace: "cloud"`)
- **Inputs**: Dated species tree + batch of ML gene trees (Newick/Nexus).
- **Gene-Tree Overlay (`display_alignment`)**: Only complete-taxon gene trees with valid branch lengths enter the cloud overlay, aligned to shared species-tree clade ages via managed `treePL` (`display_alignment` is explicitly disclosed in `report.json` as visual alignment rather than de novo multispecies-coalescent divergence dating). Gene branches inherit the color of their species-tree MRCA clade; shared internal nodes anchor vertically to species-tree coordinates.
- **Built-in Bipartition Discordance Engine (`core/phyparts-engine.js`)**: Pure JavaScript rooted-bipartition engine following Smith et al. (2015)—zero Java or upstream PhyParts binary dependency. Computes complete 4-category counts (*Concordant*, *Main alternative*, *Remaining alternatives*, *Uninformative*) across all comparable gene trees (including partial-taxon trees) without altering denominators when switching pie display modes or hiding individual pies.

### 2.4 Tanglegram (`workspace: "conflict"`)
- **Inputs**: Primary (left) tree and comparison (right) tree.
- **Strict 1-to-1 Sample Matching**: Rejects ambiguous fuzzy aliases. When sample sets differ, reports exact `primary_only` and `comparison_only` lists and requires an explicit `intersection` or `union` choice.
- **Topological Untangling**: Rotates sister clades on the comparison tree to drastically reduce connector crossings without altering its unrooted topology or branch lengths.

---

## 3. Hierarchical Multi-Tier Clade Brackets & Typography

PhyloRender supports both single-layer and multi-tier taxonomic brackets (for example, inner tribes + outer subfamilies):

- **Explicit Tiers (`clades[].tier`)**: `tier: 0` draws solid inner brackets; `tier: 1` draws cap-locked dashed outer brackets; `tier: 2+` draws dash-dot brackets.
- **Same-Node Multi-Tier Support**: A single clade node (such as a monotypic subfamily like *Xanthoceroideae* / *Xanthocereae*) can hold both a `tier: 0` inner tribe entry and a `tier: 1` outer subfamily entry simultaneously. The innermost tier (`tier: 0`) colors descendant branches and tip labels, while the outer tier renders cleanly on the outer dashed column.
- **Strict Collinear Multi-Tier Columns**: Whenever 2+ tiers exist, every bracket in the same tier locks onto one single vertical line (`X_0`, `X_1`, …). All multi-tier clade labels stay vertical; if adjacent short-span labels collide vertically within a tier, only the colliding labels stagger slightly rightward (`labelShiftX`) while the brackets remain perfectly aligned.
- **Automatic Size & Width Rules**:
  - Clade labels default to `tip_size_u + 3 u` (`typography.clades.follow_tip_size: true`).
  - Tip names longer than `1.25×` the median natural glyph width are horizontally compressed in place without changing text height, content, or specimen underscores.
  - Display-only renaming (`tip_label_overrides`) and infraspecific rank normalization (`normalize_ranks: true`, e.g., `Acer pictum subsp. mono`) never alter raw scientific identities.

---

## 4. Monophyletic Two-Panel Export (`panels`)

For tall trees (e.g., 100–300+ taxa) that become unreadable on a single journal page, PhyloRender provides **on-demand monophyletic two-panel splitting**:
- Splits at most once after rooting and ladderization.
- **Panel 1** retains outgroups, basal lineages, and an explicit continuation guide (`↪ Continued clade (N tips) — see Panel 2`).
- **Panel 2** isolates one complete monophyletic crown clade at the exact same canvas width, automatically inheriting spanning outer clade brackets (such as *Sapindoideae*) across panels.
- Request via the Web Workbench **Export** tab or MCP `export_figure(..., formats: ["panels"])` (add `"png"` only when raster panels are needed).

---

## 5. Using the Interactive Web Workbench

1. **Launch locally**:
   ```bash
   python3 tools/local_server.py --host 127.0.0.1 --port 8765 --open
   ```
   (On macOS, double-click `start_phylorender.command`.)
2. **Choose a workspace** in the top bar: *Phylogram*, *Time Tree*, *Cloudogram & Discordance*, or *Tanglegram*.
3. **Import trees** under the **Data** tab (for Time Trees, complete both Step 1 and Step 2 inside the unified import drawer).
4. **Customize live** across **Layout**, **Tip Labels**, **Annotations**, **Clades**, and **Time Scale & Backdrop** (for Time/Cloud). Click **Optimize Node Label Placement** at the bottom of the sidebar whenever you want to re-run collision avoidance.
5. **Export** under **Export**: save editable SVG, high-DPI PNG, two-panel SVGs, or `spec.json` (which can be handed directly to an AI agent via MCP).

---

## 6. Using the MCP Server & Agent Skill

### 6.1 Direct MCP Server Integration (No Skill Required)
Any MCP-compatible client (Claude Desktop, Cursor, Windsurf, Codex, Antigravity) can connect directly to:
- **stdio**: `node /path/to/PhyloRender/mcp-server/src/stdio.mjs`
- **Streamable HTTP**: `npm --prefix mcp-server run start:http` → `http://127.0.0.1:8766/mcp`

See [mcp-server/README.md](../mcp-server/README.md) for all 15 tools, environment variables, Docker deployment, and revision semantics.

### 6.2 Recommended: Installing & Using the Agent Skill (`skills/phylorender-mcp/`)

Installing the bundled **Agent Skill** makes AI assistants dramatically more reliable and scientifically disciplined when driving PhyloRender:

1. **Install dependencies once**:
   ```bash
   npm ci --prefix mcp-server
   ```
2. **Install the skill into your assistant**:
   ```bash
   # Codex
   cp -R skills/phylorender-mcp ~/.codex/skills/phylorender-mcp
   # Antigravity / Gemini CLI
   cp -R skills/phylorender-mcp ~/.gemini/config/skills/phylorender-mcp
   ```
3. **Configure `local-config.json`** inside the installed skill folder:
   ```bash
   cp skills/phylorender-mcp/local-config.example.json ~/.codex/skills/phylorender-mcp/local-config.json
   ```
   Update `"repoRoot"` to the absolute path of your cloned `PhyloRender` directory.
4. **Verify**:
   ```bash
   node ~/.codex/skills/phylorender-mcp/scripts/phylorender_mcp_client.mjs health
   ```
5. **How the skill operates during your conversation**:
   - Calls `inspect_tree` before drawing unfamiliar inputs.
   - Asks you to confirm the exact outgroup on non-dated trees (and sample policy on mismatched tanglegrams).
   - Uses `start_figure_job` + `wait` automatically for large trees, cloudograms, and full-label chronograms.
   - Hydrates `{"file": "./my_tree.nwk"}` and `{"file": "./rename.csv"}` paths automatically so you never paste giant Newick strings into chat.
   - Tracks `figure_id` and `revision` so follow-up requests ("make tips slightly larger", "add two-tier tribe/subfamily clades", "export 350 DPI PNG") edit the existing figure atomically via `edit_figure` with `base_revision` protection.

---

## 7. Troubleshooting & FAQ

- **Chrome / Chromium not found**: Run `npm --prefix mcp-server run install-browser`, or set `PHYLORENDER_BROWSER_EXECUTABLE` to your local Chrome/Chromium path.
- **`OUTPUT_DIRECTORY_LOCKED` on `stdio.mjs`**: Each MCP storage directory enforces a single-writer lease (`.writer-lease.json`) to prevent revision corruption. Use separate `PHYLORENDER_OUTPUT_ROOT` directories if running multiple independent `stdio` servers, or connect multiple agents to the single shared local HTTP server (`127.0.0.1:8766`).
- **Missing Arial on Linux / minimal environments**: PhyloRender automatically falls back to bundled Arimo, re-measures all glyphs, embeds font subsets in SVG, and records the fallback transparently in `report.font_portability`.
- **Long two-panel or dense dating renders**: The bundled skill client uses a native Node `http/https` transport with a 31-minute default timeout (`PHYLORENDER_MCP_CALL_TIMEOUT_MS`), avoiding default 5-minute `fetch` timeouts.
