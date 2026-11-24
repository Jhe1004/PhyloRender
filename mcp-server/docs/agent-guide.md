# PhyloRender MCP agent guide

Group names default to the current sample-name size plus exactly 3 drawing units (`typography.clades.follow_tip_size=true`) in phylogeny, Dating and cloud. Omit group sizes to retain following. A supplied group size without that flag is fixed, including legacy configurations; true restores automatic sizing. Explicit name-segment sizes remain overrides.

## Audit-remediated operating contract

- For long analysis call start_figure_job with figure_spec and idempotency_key. Retry a lost response with exactly the same key and spec; never create another duplicate. Poll get_figure_job until terminal. On succeeded, inspect/export its figure_id. Cancellation may return cancelling first.
- Job retention is one hour, capacity64; at most8 active/queued figure jobs. An ordinary render has a600-second total deadline. An explicit request to label every node of a Dating tree has an1800-second deadline; it remains bounded and cancellable. Server restart marks interrupted jobs explicitly; it does not claim native computation resumed.
- edit_figure/update_figure/restore_revision require the latest base_revision. On REVISION_CONFLICT inspect again. Do not overwrite another agent's edits.
- Errors expose stable code and retryable. INVALID_ARGUMENT/INVALID_FIGURE/scientific validation require corrected inputs; SERVICE_BUSY permits delayed retry.
- Nonzero tip ages and sampled ancestors are unsupported and rejected. Multi-tree Nexus must be selected/summarized explicitly. Missing ML edges and ambiguous mixed support scales are rejected.
- Gene-tree shared-clade times are constrained display alignment, not independent gene coalescence-time estimates. Synthetic numsites and smoothing are declared in provenance. Never report these as sequence-based dating analysis.
- Styling edits reuse a private bounded analysis cache. Verify cloud.analysis_cache.hit when diagnosing repeated computation.
- Read provenance.build.build_id and font_portability. Same code does not prove the same loaded build or system font.
- This service is for one trusted research group, not isolated untrusted tenants. Raw configurations contain private inputs; do not send them to public services without authorization.

## Shared web/MCP contract, version 1

Select `workspace`: `phylogeny`, `time`, `cloud`, or `conflict`. Legacy requests retain ordinary-tree defaults. Both interfaces load `figure-contract.js` and the same renderer. The web Output page exports a figure configuration. Pass that object directly to `create_figure`. It contains raw inputs; share it only with trusted services. Public MCP reports redact all tree collections and node tables.

- Use shared canonical `*_u` sizes, where the complete figure width is 1000 units: tip defaults about 13.24 u ordinary/conflict or 15.88 u Dating/cloud; node preferred 11.91 u, minimum 6.18 u (compact baseline; `typography.nodes.automatic_size=true` automatically scales preferred node labels with rendered row spacing and horizontal branch span, and applies optical size compensation to asterisk `*` full-support symbols; explicit preferred sizes switch to fixed sizing). Keep automatic ink-aware spacing. Do not increase row spacing for node annotations. Legacy pt/pixel sizes are reference conversions, not fixed physical sizes; see [unit contract](physical-units.md).

For Dating, confirm `options.time.source_unit`. `inspect_tree.time_label_density` reports the number of candidate internal-node age labels. At160 or more candidates the tree is dense. If the user has not already chosen coverage, ask once whether to accept the recommended older50%, label all nodes, or label fewer nodes. Accepting the recommendation means omit both `age_minimum` and `age_maximum`; the renderer then uses `root_age * 0.5` as the youngest visible age. Full labels mean set `age_minimum: 0` and omit the maximum; that explicit full-label render receives an1800-second deadline. A narrower choice uses an explicit source-unit range. The range hides only age numbers and their dots, not HPD bars, topology, ages, branches, or time coordinates. Never reroot a supplied chronogram.

Dating figures deliberately do not render support rates. Posterior/bootstrap fields in the main chronogram remain input provenance only: they must not appear as labels, circles, stars, or thick/full-support branches. Do not send `support_trees` or support-presentation options for `workspace: "time"`; the schema rejects auxiliary support trees. Node ages, HPD, and optional `other_data_trees` remain available. This rule is Dating-only and does not change phylogeny, cloud, or conflict figures.

Dating axis typography uses point-size settings in `options.time`: `period_size_pt`, `epoch_size_pt`, `axis_size_pt` (tick numbers) and `unit_size_pt`. Each accepts 3–24 pt. `legend_size_pt` and `key_size_pt` remain accepted only for backward configuration compatibility; figures draw neither an abbreviation-to-full-name legend nor a bottom provenance sentence. The web editor exposes only the active controls under Background → Geological periods and time axis. Geological row heights and axis spacing grow with the requested size; each block tries its full English name and declared abbreviations at the unchanged requested size. If even the shortest form cannot fit completely, the text is omitted while the true colored interval remains; text never crosses into a neighboring block and no detached label or arrow is added. Each row uses one opaque frame and draws a shared divider once, rather than giving every colored cell an overlapping translucent stroke. Define abbreviations, node-age source, label range, HPD meaning and unit provenance in the manuscript caption, using the MCP report/spec as the source of truth. These settings do not change node-label or tip-label sizes, ages, branch lengths or HPD values. System-generated figure text is English; the editor UI remains Chinese. User-provided names and titles are preserved verbatim.

The web workbench groups display-name edits and tip formatting in Sample names. Dating and cloud share Background for geological colors, time axes and four visible point-size controls; gene-cloud visibility/opacity and species geometry live under Tree. The standard epoch row includes Early Cretaceous (143.1–100.5 Mya), using `Early Cretaceous` or the safe in-cell abbreviation `Early K` according to measured width. Cloud axes are opt-in via `options.cloud.show_time_axis` (default false). `options.time.geology=standard` is available for all cloud time modes, including relative/unconfirmed ages. Confirmed units map bands by unit conversion; relative/unconfirmed units use an illustrative one-raw-unit-per-Mya color mapping without changing actual ages, axis units or calibration provenance. `options.time.source_unit` cannot override cloud units. An undated ML species tree requires explicit positive `options.cloud.root_age`; select `root_age_unit` (`mya`, `kyr`, `years`, or API default `relative`). This fixes the entire input root, not an automatically selected ingroup crown. Already dated inputs skip species-tree treePL and retain all original ages. Background changes never rerun treePL or PhyParts. The pinned ICS 2026/06 table covers 0–4567 Ma continuously, using the available formal ranks in the Precambrian. Older axis portions use neutral Outside ICS range cells. The report records the source in geological_timescale; the original tree ages are never clipped or extrapolated.

For cloud, pass the species tree as `main_tree` and all genes as `gene_trees`. Confirm their branch sources with `species_method` and `genes_method`. The built-in JavaScript conflict engine uses all eligible rooted trees, including partial terminal sets; it follows the published rooted-bipartition method but is not official PhyParts. The overlay uses only exact-terminal ML subsets. Both two- and four-part pies use complete four-category statistics. Never invent detailed counts from two-part input. A non-ML species tree requires `show_gene=false`. That mode permits rectangular species trees and conflict pies without treePL.

Use `species_method="dated"` for a supplied chronogram. Confirm `dated_unit` and, when needed, `dated_age_source`. The renderer preserves species ages and calibrates ML genes against matching species clades. ML dating uses treePL `seed=1`. The client rejects a backend that omits this seed. Arbitrary root ages are relative display units, not fossil-calibrated dates.

Cloud display options include layer switches, opacity, shape, ladderization, pie mode/radius, and pie age bounds. `hidden_pies` uses exact descendant sample sets. Never use transient PhyParts Node IDs for edits. Groups use `clades[].mrca_of`; single-sample groups remain valid.

For conflict, `main_tree` always defines the left primary tree. Supply the right tree through `comparison_tree`. If sample counts differ, never choose a policy automatically: report every main-only and comparison-only label, ask the user, then retry with an explicit `sample_policy="intersection"` or `"union"`. If both trees contain the same number of tips but any names fail to match one-to-one, rendering stops and requires source-name correction; never guess aliases. Use `primary_ladder`, or `primary_order` for sister rotations. Set `primary_support_field` and `secondary_support_field` to `"all"` or `"field:0"`, `"field:1"`, etc. `sample_groups` maps exact primary sample identities to group names and colors. The comparison and connector colors follow those identities.

Use original primary-tree labels in `sample_groups[].samples`. Group lookup uses the same case, space, and underscore rules as two-tree matching and preserves other punctuation. Unknown samples, duplicate assignments, and conflicting colors for one group return structured errors. A branch inherits a group only when every descendant belongs to that group. Saved configurations retain the original labels and effective colors. `report.conflict.group_coloring` lists the number of primary samples assigned by the configuration and the number actually colored in the displayed subset, plus the visible groups and their counts.

Read `phylorender://capabilities` before choosing a workflow. The two-panel export applies only to ordinary/Dating trees. It returns equal-width canvases and always uses automatic compact tip spacing; agents must not add `tip_spacing` or `tip_spacing_em` to panel requests. Zoom and menus are editor controls, not figure parameters. The bundled demo lacks complete raw inputs for a recalculable configuration. It still exports SVG/PNG. Uploaded datasets support configuration round trips.

Dating and imported dated cloud species trees accept zero-point terminal-age residues only within `rootAge * 64 * Number.EPSILON`, in the input time unit. Original annotations, HPD and lengths are retained; only derived display ages use present (0). Accepted tips and tolerance are reported in `time.terminal_age_validation` or `cloud.imported_dating.terminalAgeValidation`. There is no extra drawing option to set. Larger positive tip ages, negatives and invalid values still fail; do not edit source trees to bypass validation.

MCP creation, editing and restoration use the fast SVG-only path by default. They do not generate `figure.png`, `preview.png`, or panel PNG files. `export_figure` also defaults to `formats: ["svg"]`. Rasterization is explicit: request `formats: ["png"]` only when the user asks for PNG, and call `preview_figure` only when the user explicitly asks for a PNG preview or visual audit. Request `formats: ["panels"]` for vector panel SVGs; add `"png"` only for explicitly requested raster panels.

Run `npm run test:parity` after renderer, schema or default changes. The test uses GUI file imports and real MCP calls. It compares all SVG attributes, text, fonts, geometry, layers and scientific provenance; only the build metadata is excluded. It also checks GUI configuration reloads, the built-in JavaScript conflict engine, treePL and invalid input rejection.

PhyloRender is a deterministic rendering and revision service. The connected agent translates a user's request into explicit biological and visual operations; PhyloRender parses trees, preserves biological invariants, lays out labels, records every revision, checks the result, and exports artifacts. It does not silently rewrite source trees.

## Default visual policy: readability before empty space

Node-leader routing shares an unbounded convex cost across initialization, repair and joint optimization: `1000 * branch_crossings + 10*u + 10*u*u + 300*max(0,u-2)**2`, where `u = length / minimum_allowed_leader_length`. Length cost is not divided by label count and uses logical geometry, independent of PNG DPI. Branch crossings remain expensive but cannot justify an arbitrarily long detour. Font floors, text occlusion and leader/leader conflicts retain independent protections. Candidate pools retain spatially diverse alternatives; there is no fixed left-side preference. Leaders longer than twice the minimum also receive a bounded local fine search (24 logical units in each direction, 2-unit steps), so legal slots between coarse candidates are considered without hard-coding individual nodes.

Joint optimization and final refinement compare font sizes and positions together. Their visual objective adds `10*r + 10*r*r`, where `r = max(0, 1 - actual_size/preferred_size)/0.05`. Modest shrinking is justified only by a meaningful routing improvement; progressively larger reductions cost more. The configured minimum font size remains hard. The search can also restore a larger font when space allows, and can move neighbouring labels together to release occupied routes. Do not lower the minimum font size merely to eliminate a long leader; the remaining constraints may make a compact placement impossible. Browser and MCP use this same renderer. Candidate positions include actual vertical-branch boundaries and exact minimum-leader-length positions, so narrow corridors are not skipped by fixed sampling steps.

The shared renderer performs bounded joint candidate optimization after feasibility repair. It compares the whole layout, including text occlusion, leader/text intersections, leader crossings and length; single and paired label moves can release occupied positions. Manual positions are fixed. Actual glyph/leader geometry is rechecked after applying the proposal; increases in text conflicts, leader crossings or invalid angles trigger rollback of the whole proposal. This is a deterministic heuristic, not a guarantee of a global optimum. Inspect `report.label_layout.joint_optimization` for before/after objective values, pair-move counts and acceptance.

Automatic layout preferentially untangles crossing node-label leaders by moving labels, never by swapping their values or node endpoints. Check `report.node_arrows.crossing_pairs` and `crossing_label_pairs` for remaining crossings. This is a layout preference subordinate to the readable font floor and correct node ownership.

Node-label leaders default to clear, straight dashed shafts on branch-length phylograms and dated time trees; phylogenetic branches remain solid. When branch lengths are not displayed (`cladogram`, `aligned`, branchless inputs, or `conflict` tanglegrams), leaders are automatically suppressed and labels sit directly beside each node (upper-left, lower-left, or right; mirrored on the right conflict tree). Leaders prefer about 9.27 drawing units in length and 20–80 degrees from the horizontal. Both are scored preferences, recorded as advisory diagnostics rather than extra export gates. Review these warnings while preserving the font floor. The label-side endpoint is computed from visible glyph bounds, not font descender space, and side attachments stay near the vertical middle of the digits. Low and missing support values both use the short dash (–), with their underlying meanings retained.

For ordinary trees and legacy requests, keep this publication preset. Dating and cloud use the mode defaults above:

- Use shared canonical `*_u` sizes, where the complete figure width is 1000 units: tip defaults about 13.24 u ordinary/conflict or 15.88 u Dating/cloud; node preferred 11.91 u, minimum 6.18 u (compact baseline; `typography.nodes.automatic_size=true` automatically scales preferred node labels with rendered row spacing and horizontal branch span, and applies optical size compensation to asterisk `*` full-support symbols; explicit preferred sizes switch to fixed sizing). Keep automatic ink-aware spacing. Do not increase row spacing for node annotations. Legacy pt/pixel sizes are reference conversions, not fixed physical sizes; see [unit contract](physical-units.md).
- terminal spacing: automatic ink-aware spacing. In auto aspect mode, ordinary/Dating/cloud rows target height/width 1.25 with a 3-em comfort cap, smoothly returning to compact rows between 80 and 120 samples. Already-tall figures stay compact. Comparisons retain landscape preference. Explicit manual spacing and aspect modes take priority; agents should leave the renderer to compute this. The compact manual fallback remains **1.05 em**;
- branch width **about 0.794 u**, support-circle radius **about 3.309 u**;
- physical width **automatic** (`width_mm: 0`) through one shared layout algorithm; the hard maximum is **400 mm** for phylogeny, Dating and cloud, and **800 mm** for the double-tree conflict workspace. Near the active limit the renderer compresses horizontal tree geometry before readable text. Never request a wider canvas or shrink type to bypass the limit. If text itself cannot fit, surface the explicit error; PNG density is **300 DPI only when raster output is explicitly requested**; see [physical unit contract](physical-units.md). Check actual millimetre dimensions and effective DPI for PNG; never make font size depend on raster pixel count;
- output aspect ratio: **auto**, retaining natural content height inside a fixed 1000-unit-wide frame;
- automatic label placement and node arrows: enabled.

“Enough space” is not a valid optimization target by itself. Do **not** make labels small, enlarge the canvas, increase row spacing, or add wide blank margins merely so every object appears to have extra room. In particular, do not increase row spacing to place node annotations or node labels; move those annotations locally with their leaders. A technically collision-free figure with hard-to-read text or wasted canvas is a failed figure. The priorities are:

1. text and numbers must be comfortably readable by a person;
2. every annotation must remain associated with its true node;
3. the tree should occupy the useful canvas compactly and naturally;
4. only then should local placement, straight leaders, or real coordinate expansion resolve dense areas.

Preserve these defaults unless the user explicitly asks for different typography or the preview demonstrates a specific visual need. If an extreme tree cannot satisfy every collision check without tiny text, keep the readable minimum, use local placement/leader lines, and report the remaining limitation instead of hiding it with microscopic labels or empty space.

The configured minimum font size is a hard floor, including fractional point sizes. With node arrows enabled, nearest-node proximity is only a preference: a label may be closer to another node as long as its straight arrow ends at the true source node. Tree-branch crossings are also a soft preference and receive a white bridge under the pointer. Do not undo these readable placements just to satisfy a nearest-node or zero-branch-crossing rule. The shared web/MCP renderer revisits final glyph boxes globally, repairs text overlaps where possible, and reroutes pointers against all final labels. Text-label overlaps and unresolved pointer-through-text conflicts remain reported; they are not hidden from `safe_for_export`. Disabling arrows restores conservative proximity checks and can leave more conflicts in dense trees.

The label itself must not overlap tree branches, node symbols or other text. White label backdrops must not hide branches; only leaders may cross branches. `below_minimum_count` must be zero. If a preferred size is below the configured minimum, the renderer raises the preferred size rather than reducing the minimum. Global repair retains the best complete layout found within its bounded search; it does not promise zero collisions for arbitrary overcrowded inputs.

For an ASTRAL-like phylogram whose internal branches contain positive lengths while every terminal length is missing or zero, PhyloRender automatically adds an equal terminal twig of length 1 in display coordinates only. The stored source tree and all source branch lengths remain unchanged. Because that view mixes source lengths with a display-only terminal constant, PhyloRender suppresses the scale bar and records the transformation in `report.display_branch_lengths`. Do not interpret that terminal constant as substitutions, time, or coalescent units.

## First rendering

1. Call `inspect_tree` for every unfamiliar main tree.
2. Before a two-tree conflict comparison, call `compare_tree_samples`. If counts are equal but names differ, ask the user to correct the source names. If counts differ, show both complete difference lists and ask the user to choose `intersection` or `union`; never choose automatically.
3. Confirm tree type, exact tip labels, branch-length coverage, numeric fields, support count, and ultrametric diagnostics.
4. Call `create_figure`. Only the main tree determines topology; additional trees contribute node values.
5. Save both returned values: `figure_id` and `revision`.
6. For ordinary delivery, return the SVG immediately after a successful MCP response. Inspect a PNG preview only when the user explicitly requests an audit or raster preview.

## Conversational editing loop

For each later user request:

1. Call `inspect_figure` with `figure_id`. Do not rely on an old conversational summary of the settings.
2. Translate the request into the smallest possible `edit_figure.operations` batch.
3. Send the current `revision` as `base_revision`. Put a concise human-readable summary in `change_note`.
4. Inspect the exact `changes` and QA report. Generate a PNG preview only after an explicit user request.
5. Keep the new revision for the next turn.

All operations in one `edit_figure` call are atomic: either one new revision is fully rendered and committed, or none of them is. A stale `base_revision` is rejected. When that happens, call `inspect_figure` again, compare the current state with the user's intention, and reapply only the still-needed change. Never retry blindly.

### Semantic operations

- `set_options`: merge layout, typography, support, label, or time settings.
- `set_rooting`: use exact tip labels; `null` clears a prior rooting request.
- `set_tip_label` / `remove_tip_label`: change or restore one sample's display text.
- `merge_tip_labels` / `replace_tip_labels` / `clear_tip_labels`: update, replace, or clear the complete display-name map.
- `add_clade`, `update_clade`, `remove_clade`: manipulate a group using its stable `clade_id`.
- `add_support_tree`, `update_support_tree`, `remove_support_tree`: manipulate an auxiliary support source using `source_id`.
- `add_other_data_tree`, `update_other_data_tree`, `remove_other_data_tree`: manipulate ages, rates, HPD, or other values using `source_id`.
- `set_sample_groups` / `clear_sample_groups` (conflict workspace): replace or clear explicit color/group tables for paired comparisons.
- `hide_cloud_pie` / `show_cloud_pie` / `reset_hidden_cloud_pies` (cloud workspace): toggle individual cloud node pies using exact descendant tip sets.
- `set_label_adjustment`, `remove_label_adjustment`, `reset_label_adjustments`: make an exceptional bounded visual adjustment relative to a stable `branch_id`.

Use `update_figure` only for clients that already construct complete partial patches. Arrays in a patch replace the existing array. New conversational agents should prefer semantic operations because they do not require resending unchanged collections.

### Mixed-style group-bar names

Use ordered `clades[].name_segments` when consecutive parts of one group-bar name need different typography. Every segment requires nonempty `text` and may override `family`, `size_u` (about 5.29–19.85), `color`, `bold`, and `italic`; missing properties inherit `options.typography.clades`. Spaces are part of the segment text. If `name` is supplied too, it must equal the exact concatenation of all segment texts.

For later revisions, copy the stable `clade_id` from `inspect_figure` and use `update_clade`. A patch containing only `name_segments` automatically derives the combined `name`. A patch containing only `name` clears stale segment formatting and returns the label to the global clade style. After either change, verify the returned normalized segments, `report.clade_bar_spacing.valid`, embedded SVG fonts, topology fingerprints, and the preview.

## Stable identifiers

`inspect_figure.state` returns three identifier classes:

- `clade_id` identifies a named/colored MRCA group;
- `source_id` identifies one auxiliary support or other-data tree;
- `branch_id` identifies an unrooted biological split, not a DOM node or screen location.

Each branch row also provides its current top-to-bottom `display_order`, two representative `mrca_of` tips, a short tip sample, main-tree support, and the current displayed annotation. These fields let an agent resolve phrases such as “上面那个 0.993” or “包含 A 和 B 的节点” without using pixel coordinates. Branch identifiers remain stable across sister-clade rotation, layout mode changes, rerooting, and redraws; display order is only a current-view hint. A label adjustment is stored as a small offset from its true branch, so it follows the node when the tree is rearranged. Do not infer or invent identifiers; always copy them from `inspect_figure`.

## Undo, comparison, and restoration

`list_revisions` returns the current revision and a chronological history containing parent revision, action, timestamp, note, operation summary, and redacted exact diff. Use it to answer “刚才改了什么” or to identify an undo target.

`restore_revision` never rewinds or deletes history. It copies the chosen prior state into a new current revision. For example, restoring revision 3 while the current state is revision 5 creates revision 6. The user can still inspect or export revisions 1–5.

The current artifact URI is:

`phylorender://figures/{figureId}/{artifact}`

An immutable historical artifact URI is:

`phylorender://figures/{figureId}/revisions/{revision}/{artifact}`

## Biological invariants

New cloud figures default to a lower-left pie-chart key. Omit `options.cloud.pie_legend_position` to follow that default. Explicit saved positions, including `auto`, remain unchanged; changing key placement does not recompute dates or conflict statistics.

- Never represent a root or group with screen coordinates.
- Use `rooting.outgroup` with one or more exact tip labels inside one monophyletic branch.
- For cloud figures use `options.cloud.phyparts_outgroups` instead of `rooting.outgroup`. The exact names must form one complete child of the existing binary species root; the species root and imported ages stay unchanged. Each gene may lack some outgroups, but all observed outgroups must define a separating edge. Missing-all or incompatible outgroups are audited as unrootable; partial-sample eligible genes still enter the complete statistics, while overlays require the exact species sample set.
- Use `tip_label_overrides` only for figure text. Continue to use original tree labels in rooting, auxiliary-tree matching, and `mrca_of` after renaming.
- Use `clades[].mrca_of` to define a group. Verify the returned descendants; two well-chosen tips are often sufficient.
- `layout.ladderize` rotates sister groups only. It does not change topology, branch lengths, node values, or membership.
- `layout.mode=phylogram` preserves branch-length coordinates. `cladogram` and `aligned` are display transformations and do not overwrite input lengths.
- A detected time tree uses terminal-aligned time coordinates. Conflicting ordinary-tree layout requests are ignored and reported.
- Time units are never inferred from numeric ages. Set `options.time.source_unit` to `years`, `kyr`, or `mya` after checking the source analysis; otherwise the figure uses a neutral unconfirmed axis and disables geologic bands. `display_unit` only converts displayed values. Choose `age_source` (`auto`, `height`, `height_mean`, `height_median`, `branch_lengths`) when the distinction matters. One complete source controls the whole tree, coordinates and node labels. Explicit incomplete fields and reversed ages are rejected before export; `report.time.resolved_age_source` records the actual selection.
- `options.time.hpd_scope` is `all` or `named_clades` (the latter uses nodes identified by `clades[].mrca_of`). `hpd_color`, `hpd_opacity`, `hpd_thickness_u`, and optional `hpd_marker` (`none`, `height_mean`, `height_median`) control HPD bars. The SVG includes a figure key stating the node-age definition, interval meaning, marker, and display unit.
- Main-tree supports display by default. Auxiliary support trees are matched by unrooted bipartitions, regardless of root position or child order.
- Other-data trees never participate in full-support or low-support decisions.
- Low-support replacement is component-wise: with threshold 51, `0.5/78.0` becomes `–/78.0`.
- Full-support drawing uses each component rounded to the selected display precision (1 for probability, 100 for percent). Every required source must be present and every component must reach its own maximum. Original precision compares unrounded values. All full-support styles share this rule; source values, low-support cutoffs and conflict statistics remain unchanged.
- Raw tree text remains private. Public specifications and diffs expose file name, bytes, SHA-256 hash, and settings only.

## Example: iterative edit

First inspect the existing figure. Suppose it returns revision 4, `clade:8e31...`, and `branch:ab12...`. A user asks: “把枝条稍微加粗，把 Aconitum 改成蓝色，并把这个拥挤的支持率往左移一点。” Submit one atomic edit:

```json
{
  "figure_id": "the-returned-uuid",
  "base_revision": 4,
  "change_note": "Thicken branches, recolor Aconitum, and nudge one support label.",
  "operations": [
    {
      "op": "set_options",
      "options": { "layout": { "branch_width": 1.6 } }
    },
    {
      "op": "update_clade",
      "clade_id": "clade:8e31...",
      "patch": { "color": "#0072B2" }
    },
    {
      "op": "set_label_adjustment",
      "adjustment": {
        "branch_id": "branch:ab12...",
        "dx": -8,
        "dy": 0,
        "font_reduction": 0
      }
    }
  ]
}
```

If the user then says “撤销刚才那一步,” call `restore_revision` with `target_revision: 4` and the latest current revision as `base_revision`.

## QA report

- `topology_unchanged`: displayed and original trees have identical normalized tips and unrooted bipartitions.
- topology fingerprints: SHA-256 digests of the normalized tip and split set.
- `remaining_collisions`: unresolved overlaps with labels, branches, or tip names.
- `clade_bar_spacing.valid`: every named group bar preserves the intended gap after mixed-font measurement and any display-name change.
- `font_portability.svg_export_embeds_fonts`: the exported SVG contains the font subsets required to preserve measured group-name spacing on another computer.
- `leader_lines_crossing_branches`: leaders crossing a branch; any nonzero value needs visual review and a visible white bridge.
- `leader_lines_unbridged_crossings`: branch crossings without a white bridge; this must be zero before export.
- `node_data_sources[].matched_nodes`: values mapped to the main topology.
- `node_data_sources[].unmatched_values`: auxiliary values absent from the main topology.
- `warnings`: MRCA expansions, unmatched values, layout conflicts, or other review items.
- `safe_for_export`: topology is unchanged and residual collision count is zero. Scientific warnings may still require review.
- `two_panel.panels`: one for a short tree, exactly two when a long tree is split.
- `two_panel.maximum_panels`: always 2. The renderer never recursively creates a third panel.
- `two_panel.split_strategy`: `single_bottom_complete_monophyletic_clade` means one complete lower clade is extracted from the overview.
- `two_panel.second_panel_is_complete_monophyletic_clade`: true only when panel 2 is the complete selected clade rather than a visual crop.
- `two_panel.second_panel_tip_count`: number of terminal taxa in that complete clade.
- `two_panel.rooting_applied_before_split`: true when requested outgroup rooting was applied before the split; all requested outgroup tips must stay in panel 1.
- `two_panel.rendering_profile.inherits_figure_rendering`: must be true. Both panels preserve layout, ladder direction, branch width, renamed tips, support rules, typography, colours, arrows, clade colouring/bars, scale bar, and time geology.
- `two_panel.configured_font_sizes_preserved`: must be true. The panels use natural heights and do not shrink labels to fit a fixed paper page.

Export SVG by default. PNG is generated only after an explicit user request for a raster file. For a long ordinary or Dating tree, request `formats: ["panels"]` for SVG panels and place panel 1 above panel 2 in the manuscript; add `"png"` only for explicitly requested raster panels. The legacy `a4` request is accepted only as a deprecated alias.

## Inspection, admission and historical artifact integrity

`inspect_tree.tip_labels` preserves original labels. `compare_tree_samples` shares the conflict renderer’s unambiguous case/space/underscore policy; difference lists retain original names, and normalization collisions are errors. Literal equality is separately reported in `identical_original_sample_sets`.

A tool call may contain at most 100000 object keys and array elements in total, independent of large tree-text limits. This bound protects validation before the tool handler runs; oversized structures fail without partial rendering.

Historical PNG/preview/panel generation verifies that re-rendering reproduces the stored SVG exactly apart from build metadata. `ARTIFACT_RENDER_MISMATCH` means no new artifacts were written. Preserve the existing revision and use its recorded environment or create a new figure for the current renderer.

上下两图按请求排版：普通SVG、PNG、预览只提供two_panel计划（generated=false，measurement_status=not_requested），不提前计算面板。显式panels导出复用同一渲染器；计划不含已量测的最小字号或readable结论。已有revision的SVG和创建报告不可变，后续面板以实际导出资源的元数据复核。

Support units are scientific inputs: auto rejects nonzero supports confined to 0–1 or mixed evidence, since 0.5 may mean 50% probability or 0.5 percent. Require an explicit probability/percent declaration, including each compound column when needed; zero-only inputs are equivalent. Display rounding never changes full-support or threshold classification. Do not infer units from display precision.

Clade bar alignment defaults to `layout.clade_bar_alignment: "auto"`: single-layer clades follow each clade's own rightmost sample label (`nearby`), whereas figures with two or more clade layers (nested clades or explicit `tier >= 1`) automatically align peer tiers into shared right-hand columns (`aligned`). Explicit `"nearby"` or `"aligned"` overrides remain supported. Clade names default to `label_orientation: "auto"`: aligned groups prefer rotated labels with collision columns; nearby groups reuse horizontal whitespace without covering sample labels. Omit these fields for the shared defaults; explicit choices roundtrip without changing scientific inputs.

Nested clade hierarchy and bar styles: `clades[].bar_style` accepts `"auto"` (default), `"solid"`, `"dashed"`, or `"dash-dot"`, and optional `clades[].tier` accepts integers `0..5`. Under `"auto"`, innermost clades (effective tier 0) render with solid vertical bars, first-level enclosing/outer clades (tier 1) render with symmetric cap-locked long dashes while keeping horizontal end-caps solid, and tier 2+ clades render with dash-dot bars. Effective tier enforces strict topological containment (`effective_tier(parent) >= max(effective_tier(child) + 1)`); setting `tier: 1` on peer higher-rank clades (such as subfamilies when only some contain annotated genera) aligns all peer outer bars in the same outer column automatically under default `"auto"` or `"aligned"` alignment. Pass `tier: null` in `update_clade` to return to automatic tier inference.

Sample-name width policy: shared figure-contract caps each complete tip label at 0.8/3 (about 26.67%) of the whole canvas. Overlong labels use horizontal glyph compression (spacingAndGlyphs), preserving height and full text; short labels remain unchanged. All four GUI/MCP workspaces use the same render/tip-width module, and group/connector layout uses the fitted ink bounds. No optional parameter is required.
