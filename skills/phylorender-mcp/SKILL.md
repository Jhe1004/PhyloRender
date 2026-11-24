---
name: phylorender-mcp
description: Rapidly translate phylogenetic-figure requests into PhyloRender MCP parameters, explain in plain language what figures and adjustments are available to unfamiliar users, and return MCP-produced artifacts immediately. Use local-first routing and do not add manual image inspection or post-processing unless the user explicitly asks for an audit or publication QA.
---

# PhyloRender MCP

Prefer the shared local PhyloRender MCP for drawing and editing figures.

## Fast Return Is the Default

For ordinary requests to create, revise, export, or show a figure, this skill is a thin MCP orchestration layer only:

1. translate the user's request into the smallest valid MCP parameter set;
2. call PhyloRender MCP and retrieve the requested image or artifact;
3. return that MCP result to the user immediately.

Speed is the highest operational priority after input validity and successful MCP completion. Once the requested MCP image or artifact is available, stop and present it in the same turn. Do not open, render, screenshot, visually inspect, compare, redraw, post-process, or independently audit the result. Do not invoke another plotting or figure-review workflow. Do not write a report or add explanatory analysis unless the user explicitly asks for an audit, diagnosis, validation, or publication QA.

Keep only the minimum machine-readable checks needed to make a valid request, detect an MCP-reported failure, and retrieve the artifact. The MCP server's structured report is sufficient for ordinary delivery; do not start a separate QA pass after receiving a successful response.

### SVG-only MCP default

- For every ordinary create, edit, restore, export, or show request, use the MCP server's fast SVG-only path. `create_figure`, edits, and restores already generate only SVG by default; call `export_figure` with `formats: ["svg"]` or omit `formats`.
- Do not request, download, or generate `figure.png`, `preview.png`, panel PNG files, a screenshot, or any other raster preview unless the human user explicitly asks for PNG or asks for a visual audit that requires raster inspection.
- A request to “画图”“输出图片”“给我看看” means return the MCP-produced SVG immediately. It is not permission to create PNG.
- When the user explicitly asks for PNG, call `export_figure` with `formats: ["png"]` (or `["panels", "png"]` for raster panels). Only then use `output.dpi` if the user also specifies a raster resolution.
- `preview_figure` is an explicit PNG-generating operation. Do not call it in the ordinary fast path.

## Default-First Output and Confirmation Gate

Strongly prefer the current PhyloRender and skill defaults. They are deliberately tuned to give the best general balance of readability, compact spacing, and output geometry, and they usually produce a better result than agent-selected aesthetic parameters.

- For a new figure, omit every optional rendering override and let the current renderer defaults apply. Send only the inputs and scientific/content choices required by the user's request, plus `options.layout.automatic_tip_spacing: true` where this skill requires it.
- Before sending any nondefault rendering, typography, layout, spacing, line, marker, support-presentation, color, time-background, cloud-display, panel, output-size, aspect-ratio, or resolution value, stop and ask the user to confirm the exact proposed change and the reason for it. Wait for a new explicit user confirmation before making the MCP call.
- This confirmation is required even when the user previously asked in general terms to make the figure prettier, cleaner, publication-ready, similar to a reference image, or suitable for a journal. A screenshot, existing figure, project context, MCP warning, `safe_for_export` result, or the agent's own aesthetic judgment is not confirmation of a nondefault value.
- Confirmation applies only to the listed fields and values for the current figure or revision. Do not reuse it for other parameters, later figures, or further tuning.
- If the user does not confirm, gives an ambiguous answer, or does not respond, keep the defaults and render the figure without those overrides. Do not generate a customized draft first.
- Do not run an automatic sequence of aesthetic revisions. Return the first successful default figure. Revise it only after the user requests a change and then explicitly confirms the exact nondefault parameters proposed for that revision.

Required scientific inputs and identity choices, such as the tree file, figure type, confirmed outgroup, time unit, sample mapping, and an explicitly requested group definition, follow their own validation gates and are not optional aesthetic overrides. Never change the source tree, topology, support values, ages, HPD, or sample identity as a way to improve appearance.

## Help New Users Discover What They Can Do

When a user asks what PhyloRender can draw, how to use it, what can be adjusted, or otherwise shows that they do not know the software, switch to a short user-guidance mode before making MCP calls. Read [the user guide](references/user-guide.md) and answer in the user's language with plain, nontechnical wording.

In guidance mode:

1. Start with the four figure types: ordinary phylogenetic tree, Dating tree, gene-tree/species-tree cloud and conflict figure, and two-tree conflict comparison.
2. For each relevant type, say what input files it needs and what scientific question it displays.
3. Group adjustments by purpose instead of listing raw JSON fields: tree/layout, sample names, node labels and support, groups/colors, time display, cloud display, and export.
4. Give two or three concrete example requests the user can copy.
5. If the user has already supplied files, inspect the tree first and recommend the most suitable figure type; do not make them learn parameter names.
6. Do not dump the MCP schema, internal option names, exhaustive ranges, or implementation details unless the user asks for them.
7. Distinguish display changes from scientific changes. Rerooting changes the displayed root; ladderizing, stretching, coloring, renaming and label movement do not change the unrooted topology. Never imply that formatting creates biological evidence.

Guidance mode must not slow down a clear drawing request. If the user already says what to draw or modify, skip the menu, translate the request into parameters, call MCP, and return the artifact immediately. If one scientifically essential input is missing, ask one concise question or state exactly which file/value is needed.

For cloud figures, the pie-chart key now defaults to the lower left with collision avoidance. Omit `options.cloud.pie_legend_position` on new figures to use that default. Retain explicit positions from existing configurations unless the user asks to move the key. This display-only setting does not change trees, ages or conflict counts.

## Mandatory Outgroup Gate

Apply this gate before creating every new non-Dating figure: ordinary phylogenetic trees, gene-tree/species-tree cloud or conflict figures, and two-tree conflict comparisons.

- If the user explicitly names the outgroup, use that outgroup. After `inspect_tree`, resolve it to the exact original tip label or labels before sending the workspace-specific outgroup parameter; never replace it with a default or a guessed taxon.
- If the user has not named an outgroup, ask one concise question and wait for the answer before calling `create_figure`. Do not infer the outgroup from file order, the first tip, a filename, an existing visual root, a bundled test default, or taxonomic familiarity.
- For a gene-tree/species-tree cloud figure, send the confirmed exact names as `options.cloud.phyparts_outgroups`, never as `rooting.outgroup`. They must match one complete child of the existing binary species root. Preserve the species root and any imported dates. Genes may lack some selected outgroups; the observed subset must define one separating edge. Missing all outgroups or a non-monophyletic observed subset is audited as unrootable; do not prune samples or substitute a smaller collection. Keep the complete input batch and report statistics versus overlay counts separately.
- For a cloud/conflict figure, ask only for the species-tree outgroup. For a two-tree comparison, ask only for the main tree's outgroup and apply rooting only to the main tree. Do not ask for, set, or change a separate outgroup on the comparison tree.
- Dating figures are the only exception. Do not ask for an outgroup, do not send `rooting`, and do not reroot a Dating tree. Preserve the fixed root and time direction encoded by the dated input tree.
- When revising an existing non-Dating MCP figure, retain its established rooting without asking again unless the user requests rerooting or the requested replacement tree has no confirmed outgroup.

## Mandatory Dense Dating Label Gate

Apply this gate only to a new Dating figure, after `inspect_tree` and before `create_figure`.

- Read `inspect_tree.time_label_density`. The current service classifies a Dating tree as dense when it has at least 160 candidate internal-node age labels.
- If `dense` is false, continue with the normal defaults and do not interrupt the user.
- If `dense` is true and the user has not already chosen how many node ages to show, ask one concise question before drawing: `检测到 N 个候选节点时间。默认只标较老 50%（年龄 ≥ CUTOFF UNIT）。要按默认、全部标注，还是标得更少？` Use the returned candidate count, cutoff and unit; do not invent them.
- If the user accepts the default, omit both `options.time.age_minimum` and `options.time.age_maximum`. The renderer automatically displays the older half of the root-to-present range.
- If the user requests every node, send `options.time.age_minimum: 0` and omit the maximum. This explicit full-label Dating request receives a bounded, cancellable 1800-second render deadline.
- If the user requests fewer labels, ask only for the youngest visible age or a simple older fraction if their wording does not already determine it, then send an explicit source-unit age range. Do not guess a cutoff.
- A choice already stated by the user in the current request counts as confirmation; do not ask again. Revising an existing figure retains its established range unless the user asks to change it.
- This is display-only. Suppressed nodes keep their biological ages and HPD bars; topology, branches, coordinates, and source data do not change. Never disable node arrows, shrink fonts, remove HPD, or alter scientific data merely to meet the time limit.
- If an explicit full-label render still reaches the 1800-second deadline, report the timeout and ask the user to narrow the label range. Do not create an unbounded retry loop and do not silently substitute another visual parameter.

## Two-tree Sample Mismatch

Two-tree conflict inputs can contain different sample names or different sample counts. PhyloRender enforces **strict 1-to-1 sample matching** (many-to-one or one-to-many fuzzy aliases are rejected with `TIP_MAPPING_AMBIGUOUS`). After inspecting the trees, call the read-only MCP tool `compare_tree_samples` before `create_figure`; do not parse raw Newick/Nexus or invent a separate matching algorithm in the skill. The MCP service returns the complete tree-specific sample lists and also repeats the validation during figure creation.

- If `identical_sample_sets` is true, continue without a sample policy.
- If the two trees have the same sample count but different names (`equal_count_name_mismatch`), report every name from `primary_only` and `comparison_only` and ask the user to correct the source names, or confirm whether they intentionally want `"intersection"` or `"union"` (`options.conflict.sample_policy`). Do not guess pairings or silently rename, remove, or merge samples.
- If the sample counts differ (`different_count`), show the complete `primary_only` and `comparison_only` lists and ask whether to use only the common samples (`intersection`) or retain all samples (`union`). Do not select either policy by default.
- After the user chooses, send or retry with that explicit `options.conflict.sample_policy`. If the user does not choose, keep the inputs unchanged and do not render the comparison.
- This gate applies to two-tree conflict comparisons. It does not replace the stricter exact-sample requirements of gene-tree/species-tree cloud analysis.
- If the connected service predates `compare_tree_samples`, do not emulate it by reading raw tree text. Let `create_figure` return its structured mismatch error, ask the user, and retry only after an explicit choice or corrected input.

## Local-first Connection

- Local MCP: `http://127.0.0.1:8766/mcp`.
- Local health: `http://127.0.0.1:8766/health`.
- Configuration: resolve `repoRoot` / `packageRoot`, `stateRoot` (defaults to `~/.phylorender/local-mcp`), optional remote `publicEndpoint`, and optional macOS `keychainService` / `keychainAccount` from environment variables or a gitignored `<skill-dir>/local-config.json` file inside the installed skill folder.
- Expected version: `0.8.0`. Confirm live health and capabilities before using new fields.
- Optional remote bearer credentials: supply `PHYLORENDER_MCP_TOKEN` or configure `keychainService` (and optional `keychainAccount`) in `local-config.json`.
- Client helper: `scripts/phylorender_mcp_client.mjs`.

The helper checks local health first. It starts one detached HTTP service when no healthy local service responds.
Agents share this service. A startup lock prevents duplicate launches.
The helper binds only `127.0.0.1`. It leaves the shared service running after each task.
The helper preserves logs, figure data, and endpoint/job-origin records in the configured runtime state directory.
It never kills unrelated processes. It never installs missing dependencies automatically.

If local startup or pre-dispatch discovery fails and an explicit remote `publicEndpoint` is configured, the helper reports the reason and tries that remote service. **Never fall back to a remote endpoint when local MCP returns HTTP 429 (`SERVICE_BUSY`) or any scientific/schema validation error** — private unpublished trees must stay local.
Tell the user when fallback sends a task to a remote service.
Do not bypass input validation, scientific errors, or missing mode dependencies by silently switching services.
Do not retry an operation on another endpoint after dispatch. A timeout can leave a completed operation behind.

Each created figure and background job keeps its service origin (`origins/` and `jobs/` under `stateRoot`). Use that origin for later edits, waits, and downloads.
Local and remote services do not share figure storage.
For an older figure without an origin record, set `PHYLORENDER_MCP_ENDPOINT` to its known original endpoint.
An explicit endpoint disables automatic fallback. Never recreate an existing figure merely because its service is unavailable.

Read [local service operations](references/local-service.md) when startup fails or another agent needs connection settings.

Never place bearer tokens in a prompt, source file, report, shell output, or final response. Do not delete an MCP figure unless the user explicitly requests deletion.

## Start Every Task

1. Check local-first health. This command also starts the local shared service when needed:

   ```bash
   node <skill-dir>/scripts/phylorender_mcp_client.mjs health
   ```

2. Confirm tool discovery:

   ```bash
   node <skill-dir>/scripts/phylorender_mcp_client.mjs tools
   ```

3. Record the selected endpoint with every `figure_id`, `job_id`, and `revision`.
4. If the active service fails, stop and report the failure. Read local service operations before local repair.
5. Inspecting or redeploying a remote host requires explicit authorization and the host's own connection procedure; drawing requests do not authorize remote changes.

## Calling Tools

The helper accepts JSON from a file or stdin:

```bash
node <skill-dir>/scripts/phylorender_mcp_client.mjs call TOOL_NAME ARGUMENTS_JSON
```

Use `-` as `ARGUMENTS_JSON` to read JSON from stdin. In request JSON, any tree-input object can use `"file": "/path/to/tree"`; relative paths resolve from the `ARGUMENTS_JSON` file's directory (falling back to the current working directory), and the helper replaces them with `{ name, content }` before sending the request. A `tip_label_overrides` object can likewise use `{"file": "mapping.csv"}` with CSV, TSV, or `.xlsx` input. Tool calls default to a 1860-second client timeout to match full-label Dating and PhyParts limits.

For large trees, full-label Dating (`age_minimum: 0`), or many gene trees, start and poll an asynchronous job instead of blocking a single call:

```bash
node <skill-dir>/scripts/phylorender_mcp_client.mjs call start_figure_job request.json
node <skill-dir>/scripts/phylorender_mcp_client.mjs wait JOB_ID
```

`wait` polls `get_figure_job` on the same pinned endpoint until completion and automatically records the resulting `figure_id` origin.

Examples and complete request templates are in `references/workflows.md`. Read that file when creating, editing, restoring, or exporting a figure. Read `references/user-guide.md` only for capability discovery, onboarding, or when the user's intended figure type is unclear.

## Output Geometry and Resolution

### Mandatory automatic-spacing policy

For every created or revised figure, set `options.layout.automatic_tip_spacing: true` and omit both `options.layout.tip_spacing` and `options.layout.tip_spacing_em` unless the user explicitly requests a numeric manual spacing for that single figure. Never add manual blank space between samples for visual elegance. The renderer derives row spacing from actual glyphs and whole-figure geometry: in auto mode, ordinary, Dating and cloud figures target height/width 1.25 by spreading real rows when sparse, with a comfort cap; dense or already-tall trees stay compact, and double-tree comparisons retain landscape preference. Leave this calculation to the renderer; do not send manual spacing or an aspect override to emulate the default. When revising an older figure that contains a legacy manual spacing value, enable automatic spacing and do not copy that manual value into the edit request.

For `panels` output, PhyloRender itself must return equal-width canvases and automatic compact sample spacing. Do not post-process either panel, resize one panel independently, or add manual row gaps. Only use a manual spacing field when the human user explicitly requests a numeric manual spacing for that one figure.

### Mandatory local Arial preference

When the selected MCP renderer runs on a computer with real Arial installed, use Arial for all default figure typography, including tip labels, node labels, clade names, scale text, legends, and fixed headings. Usually omit explicit `typography.*.family` fields and let the current renderer default apply. If an older live service does not yet expose the Arial-first default, explicitly request `Arial, sans-serif` for tips, nodes, clades, and scale. Do not substitute Baskerville merely for visual elegance.

Read `report.font_portability` after rendering. If Arial is unavailable, accept only the renderer's explicit bundled Arimo fallback, normalized options, reflow, warning, and SVG metadata; never label Arimo as Arial. A PNG is already rasterized on the rendering host. An editable SVG that retains system Arial still requires Arial on the viewing computer. A user-requested font always overrides this default preference.

### Physical-unit model (0.7.0 and later)

Complete sample labels have a shared default width limit of 1.25 times the median natural glyph width of the displayed sample names. Both columns count together in a double-tree figure; for even counts use the mean of the middle two widths. This replaces the old canvas-fraction limit. Only names exceeding the limit compress horizontally; text height, complete content, specimen underscores and original identities stay unchanged. Short names keep their original proportions. Let the renderer compute this and place group brackets and connectors from the adjusted bounds; do not emulate it in the agent or use smaller fonts, wrapping, truncation or image post-processing.

Group names default to automatic orientation: omit `clades[].label_orientation` or use `"auto"`. For single-layer clades, nearby ordinary-tree bars retain horizontal names when they fit unused space and aligned Dating/cloud bars prefer 90-degree rotated names. Whenever two or more clade tiers are present (`tier: 0` inner solid brackets, `tier: 1` outer dashed brackets, including same-node multi-tier assignments where a single clade node carries both an inner tribe and an outer subfamily), the renderer locks every peer tier onto a single strict vertical column, keeps all labels vertical, and staggers colliding vertical labels rightward without shifting brackets. Preserve explicit `"horizontal"` or `"vertical"` choices unless the user asks to change them. These display changes must not alter groups, font sizes, source trees, ages or statistics.

Group-name fonts in phylogeny, Dating and cloud default to `typography.clades.follow_tip_size: true`: the renderer keeps them exactly **3 drawing units larger than the current sample-name font size**, including after sample-size edits. Omit group sizes to retain this automatic relationship. An explicit group size without this flag selects fixed sizing; explicitly true restores following on an existing figure. Explicit clade-name segment sizes remain overrides. This offset is 3 u, not 3 pt or 3 legacy pixels; let the shared renderer compute it.

Use canonical drawing dimensions (`*_u`) only for intentional overrides. Entire figure width is 1000 u in all four workspaces, including double-tree figures. Omit sizes to use shared defaults (tips about 13.24 u ordinary/conflict or 15.88 u Dating/cloud, node preferred 11.91 u and minimum 6.18 u, branch width 0.794 u, node radius 3.309 u). Nodes are regular weight. Use automatic ink-aware spacing; do not increase row spacing to place node annotations. Use clade segments `size_u`, manual offsets `dx_u`/`dy_u`/`font_reduction_u`, cloud `pie_radius_u`, and time `hpd_thickness_u`.

For Dating/cloud time-background typography omit explicit size fields to retain shared readable defaults. Intentional overrides use `period_size_u`, `epoch_size_u`, `axis_size_u`, `unit_size_u`. Legacy legend/key fields remain compatibility-only; no on-canvas footer is added.

Dating/cloud share the pinned ICS timescale reported in `geological_timescale`: continuous 0–4567 Ma coverage, with available formal ranks in the Precambrian. Older axis portions are neutral and marked `Outside ICS range`; never extrapolate unit names or alter input ages. Relative/unconfirmed time backgrounds remain illustrative. Cells with sufficient width keep the default font size (trying full name, short abbreviation, then shortest abbreviation); narrow cells that cannot fit the shortest abbreviation at default size adaptively shrink only that cell's shortest label down to a `4 px` readability floor, omitting text only for microscopic slivers below `4 px` and never placing labels outside cells. See `docs/GEOLOGIC_TIMESCALE_CHANGELOG.md` and `docs/TIME_BACKGROUND_READABILITY_CHANGELOG.md` in the source repository.

For `workspace: "time"`, never send `support_trees` or support-presentation settings. Dating figures intentionally suppress posterior/bootstrap labels, support markers, and full-support branch thickening even when those fields exist in the main tree. Use node ages, HPD, and optional `other_data_trees` only. This restriction is Dating-only; do not apply it to phylogeny, cloud, or conflict output.

Use `output.width_mm: 0` for automatic physical width. Phylogeny, Dating and cloud requests may specify up to 400 mm; the double-tree conflict workspace may specify up to 800 mm. All four workspaces use the same aspect-ratio and physical-width calculator; the conflict renderer only divides its calculated tree-body width equally between the left and right trees. Nonzero width overrides aspect ratio and reallocates real branch coordinates; near the active workspace limit, PhyloRender compresses the horizontal tree body before readable type, vertical sample spacing, topology, ages, or statistics. Never request a wider width, post-process the SVG wider, or shrink text merely to evade the limit. If text plus the minimum tree span cannot fit, return the renderer's explicit `FIGURE_WIDTH_CONTENT_LIMIT` and ask for shorter display names instead of clipping. Read `report.output.width_mm`, `maximum_width_mm`, `width_limited_to_maximum`, and `height_mm`. Long ordinary or Dating trees use `formats: ["panels"]`: at most two natural-height SVG trees, equal canvas widths, automatic compact sample spacing, and one complete monophyletic clade in Panel 2. Add `"png"` only after an explicit raster request. `a4` is only a deprecated alias.

Only after the user explicitly requests PNG, use `output.dpi` (default 300, range 72–1200) for raster clarity. SVG stores millimetres; PNG embeds density metadata. DPI must not change layout or relative font sizes. Verify `requested_dpi`, `effective_dpi`, `png_width`, and `png_height`; safety caps can lower effective DPI. Increasing tip count grows the figure, not reduces physical type size. Inserting a whole tall figure into a fixed small page will still shrink it: use the equal-width two-panel export or the intended physical dimensions.

Older examples below are compatibility aliases. Legacy pt/pixel values convert to drawing units using the fixed reference design; their physical point size changes with print width. New calls use *_u. output.width_mm only scales the finished figure; 0 selects the 400 mm maximum (800 mm for the entire conflict figure). DPI affects density only.

The current local renderer source supports these semantic output options:

- `options.output.aspect_ratio`: `auto`, `content`, `1:1`, `4:3`, `3:2`, `16:9`, `a4-landscape`, `a4-portrait`, or `custom`;
- `options.output.custom_ratio`: width divided by height from `0.4` to `3.0`, used only with `custom`;
- `options.output.png_scale`: integer pixel multiplier from `1` to `4`.

Prefer `auto` unless the user requests a specific publication or slide ratio. The renderer now targets height/width 1.25 for sparse ordinary, Dating and cloud figures by increasing real row spacing, with a comfort cap; dense or already-tall trees stay compact, and double-tree comparisons retain landscape preference. Explicit manual spacing or aspect modes take priority. Do not send custom ratios or manual spacing to imitate this default. The complete canvas remains 1000 drawing units wide; print width scales the finished figure within the workspace ceiling. `content` retains natural compact geometry.

SVG is always vector output and is the MCP default. PNG scale controls raster pixels only after an explicit PNG export. Large raster figures may be capped by the renderer's total-pixel and maximum-dimension safety limits. Read `report.output.actual_png_scale` and the exported PNG dimensions instead of assuming that the requested scale was possible.

PhyloRender MCP v0.8.0 accepts these output fields across all four workspaces, reports requested and effective geometry, supports display-only sample-name mappings and mixed-style clade-bar names, embeds required font subsets in SVG exports, validates clade-bar spacing after display-name changes, and allows node arrows to be disabled with `labels.node_arrows: false`. Geometrically unavoidable leader crossings receive a white bridge. Always check the live `health` version and capabilities before each task.

## ASTRAL-like terminal display lengths

When `inspect_tree.branch_lengths` shows positive internal lengths while all terminal lengths are missing or zero, PhyloRender automatically adds the same length-1 terminal twig in display coordinates for a phylogram. This is a visual harmonization only: the stored Newick/Nexus and source branch lengths remain unchanged. Require `report.display_branch_lengths.applied_to_render: true`, `source_tree_unchanged: true`, `display_terminal_length: 1`, and `scale_bar_suppressed: true`. Do not interpret or describe the added terminal constant as substitutions, time, or coalescent units.

## Mixed-style Clade-Bar Names

Use `clades[].name_segments` when consecutive parts of one group-bar name require different typography. Each ordered segment has required `text` and optional `family`, `size` (8–30), `color`, `bold`, and `italic`. Omitted style properties inherit `options.typography.clades`. If `name` is also present, it must equal the exact concatenation of every segment's `text`, including spaces.

For later revisions, use `update_clade` with the stable `clade_id`. A `name_segments`-only patch automatically derives the combined plain name. A `name`-only patch intentionally clears old segment formatting and returns the label to the global clade style. After creation or editing, require the report to retain the normalized `name_segments`, `clade_bar_spacing.valid: true`, `font_portability.svg_export_embeds_fonts: true`, and `safe_for_export: true`. Add manual visual inspection only when the user requests an audit or publication QA.

## Required Workflow for a New Figure

1. Preserve the original tree file. Never rewrite it merely to change rooting, label style, sister-group order, or display branch lengths.
2. Call `inspect_tree` first. Confirm:
   - tip count;
   - tree type and branch-length meaning;
   - support fields and support-node count;
   - ultrametric status when relevant;
   - topology fingerprint.
3. Apply the mandatory outgroup gate above. For every new non-Dating figure, use the user's explicitly named outgroup or ask before creating the figure. Resolve exact original tip labels from the inspection/source before setting rooting. Multiple outgroups are allowed when they define one complete unrooted branch. For Dating figures, preserve the input root and omit `rooting` entirely.
4. For a new Dating figure, apply the mandatory dense Dating label gate above. Ask only when inspection reports a dense tree and the user has not already chosen label coverage.
5. Call `create_figure` with semantic options. Prefer actual branch lengths unless the user requests a cladogram/equal-tip display.
   - Apply the default-first confirmation gate before adding any optional nondefault value. Without a separate explicit confirmation of the exact fields and values, omit those fields and use the renderer defaults.
   - If sample names must change, use `tip_label_overrides` keyed by exact original tree labels. Values affect display and export only.
   - Always set `options.layout.automatic_tip_spacing: true`. Omit `tip_spacing` and `tip_spacing_em`; do not manually enlarge sample-row gaps.
   - Prefer the renderer's Arial-first typography defaults. If the live service predates that default and the local host has Arial, explicitly request `Arial, sans-serif` for tips, nodes, clades, and scale. Do not override a font named by the user.
   - For Dating/cloud output, use the readable four-field time-background defaults above and omit them on a current renderer. Do not request a figure legend or bottom provenance sentence; derive any needed caption wording from the returned MCP report.
   - Default to `options.output.aspect_ratio: "auto"` for long trees.
   - Set `options.output.png_scale` only when the user requests a raster resolution; otherwise retain the renderer default.
   - Node arrows default to on. Retain that default unless the user asks for a cleaner figure without pointers; use `options.labels.node_arrows: false` to turn them off reproducibly.
   - If one group name needs mixed typography, supply ordered `clades[].name_segments`; use original tree labels in `mrca_of`, not displayed sample names.
6. Record both returned values in the task:
   - `service_endpoint`
   - `figure_id`
   - `revision`
7. Read the report returned by the same MCP operation only far enough to detect an MCP-reported failure and confirm the requested artifact is available. Do not launch a separate QA operation for an ordinary request. For an explicit audit or publication-QA request, additionally require:
   - `topology_unchanged: true`;
   - identical original and displayed topology fingerprints;
   - `remaining_collisions: 0`;
   - `safe_for_export: true`;
   - `report.clade_bar_spacing.valid: true` and `invalid: 0` whenever named clades are present;
   - `report.font_portability.bundled_fonts_ready: true` and `svg_export_embeds_fonts: true`;
   - expected tip count;
   - expected support/source matching.
   - when node arrows are enabled: `report.node_arrows.enabled: true`, equal `labels` and `arrows`, `missing`, `misdirected`, and `report.leader_lines_unbridged_crossings` all equal to `0`; review `insufficient_angle` and `insufficient_length` as advisory when `angle_and_length_are_soft_preferences` is true, `arrowhead_length == 1.8`, and `arrowhead_half_width == 0.85`;
   - when node arrows are disabled: `report.node_arrows.enabled: false`, `arrows: 0`, and `unexpected: 0`;
   - expected `report.output.aspect_mode`, actual canvas ratio, horizontal expansion, PNG scale, and pixel dimensions.
8. Export and download the immutable SVG revision artifact. Keep prior revisions and prior local files. Download PNG only after an explicit PNG request.
9. For an explicit audit or publication-QA request, render or open the PNG preview and inspect non-full support labels, rooting, tip order, clipped text, overall proportion, and arrow routing. For an ordinary request to generate, revise, or show a figure, stop as soon as the MCP result and requested artifact are available, then present them directly; do not add a separate manual inspection pass or any post-processing unless the user asks for it.

## Required Workflow for Iteration

Before every modification:

1. Call `inspect_figure` without a revision and read `current_revision`.
2. If the proposed revision changes any optional parameter away from the current skill defaults, list the exact fields, values, and reason to the user. Wait for a new explicit confirmation before calling `edit_figure`; a general request to improve the figure is insufficient.
3. Use that exact number as `base_revision` in `edit_figure`.
4. Apply only the confirmed semantic operations such as `set_options`, `set_rooting`, `set_tip_label`, `merge_tip_labels`, `add_support_tree`, `update_clade`, `set_sample_groups`, `clear_sample_groups`, `hide_cloud_pie`, `show_cloud_pie`, `reset_hidden_cloud_pies`, or a stable `branch_id` label adjustment.
5. If the server reports a revision conflict, inspect again. Never overwrite a newer revision silently.
6. Confirm that the edit created a new immutable revision and retained the original topology fingerprint.
7. Use `restore_revision` to undo by creating another revision. Do not delete history.

Stable identifiers survive rerooting and ladderization:

- `figure_id` identifies the persistent figure.
- `branch_id` identifies an unrooted biological split.
- `source_id` identifies an auxiliary support or other-data tree.
- `clade_id` identifies a named/colored clade.

## Export and Local Files

After `export_figure`, download exact immutable revision resources:

```bash
node <skill-dir>/scripts/phylorender_mcp_client.mjs download FIGURE_ID REVISION OUTPUT_DIRECTORY [--png] [--panels]
```

The helper writes:

- `figure_vN.svg` (default)
- `figure_vN.png` (when `--png` is passed after explicit user request for raster output)
- `panel-1_vN.svg` / `panel-2_vN.svg` (and panel PNGs when `--panels` is passed with `--png` on ordinary/Dating trees)
- `report_vN.json`
- `spec_vN.json`

When `--png` or `--panels` is passed, the helper calls `export_figure` automatically to ensure those artifacts exist before downloading. It refuses to overwrite existing files; choose a new versioned output directory when necessary.

## Scientific and Safety Rules

- Treat the main tree as the topology authority.
- Keep original tree tip labels as semantic identities. Display-name mappings must never be substituted into rooting, auxiliary-tree matching, or `mrca_of` references.
- After any individual or batch display-name change, require the clade-bar spacing report to remain valid. The exported SVG must contain embedded font data so bar placement does not change on another computer.
- Match auxiliary node data by biological splits, not transient node numbers or screen coordinates.
- Keep support values attached to their original stable branches after rerooting or sister-order changes.
- Do not infer missing support as full support without evidence.
- Node arrows are enabled by default, but the user may disable them. When enabled, missing or misdirected arrows and unbridged crossings are export blockers. The current layout reports its 20–80° angle and approximately 9.27 u length targets as soft preferences; inspect the advisory counts and final figure without inventing a 4.95° hard gate. A nonzero `leader_lines_crossing_branches` is acceptable only when `leader_lines_unbridged_crossings` is zero and the crossing is visibly separated by a white bridge. When disabled, require `arrows: 0` and `unexpected: 0` instead.
- Require the requested exported artifact and accept the MCP report delivered with the operation. Add a manual visual-inspection pass only for an explicit audit or publication-QA request; ordinary generate/revise/show requests must return the MCP result immediately without post-processing.
- For aspect-ratio changes, verify that the tree or time-axis horizontal span changes with the canvas; canvas width alone is not evidence of natural widening.
- For PNG exports, report the actual pixel dimensions and `actual_png_scale` when safety limiting reduced the requested multiplier.
- Do not expose raw private tree content in the final response.
- Do not expose Keychain output or bearer credentials.
- Do not delete retained figures after export unless the user explicitly asks.

## Current Architecture

The public visual editor and MCP are separate running services but share the same parser, rooting, layout, typography, and export code. Renderer changes require rebuilding both services; protocol-only changes require rebuilding MCP. Using this skill to draw a tree does not authorize changing or redeploying either service.

The local service loads the active source repository. Editing the repository does not restart an already running service.
Report a version mismatch. Ask before restarting a busy shared service.

Support units are scientific inputs: auto rejects nonzero supports confined to 0–1 or mixed evidence, since 0.5 may mean 50% probability or 0.5 percent. Require an explicit probability/percent declaration, including each compound column when needed; zero-only inputs are equivalent. Full-support drawing classification (numbers, bold branches, circles, stars, or hidden styles) follows the values rounded to the active display decimal places (100 for percent or 1 for probability; `"original"` precision compares unrounded values, and compound/auxiliary sources require all configured columns/sources to reach full support). Low-support cutoffs and gene-tree conflict counts always remain unrounded raw values, and source data is never altered. Do not infer units from display precision.
