# PhyloRender MCP request templates

当前单位：四个板块整张图统一宽1000绘图单位，双树也以整体为基准。字号、线宽、半径、HPD粗细与手动位移采用*_u。毫米只决定印刷大小，普通／Dating／云图上限400 mm，双树800 mm。下文旧pt或像素示例仍作固定参考换算兼容；新调用优先省略默认尺寸，必要时使用*_u。

Use local paths (absolute or relative to the `ARGUMENTS_JSON` file). Store temporary request JSON outside the repository source tree (e.g., system temp dir or your task's output folder). The client replaces every `{ "file": "..." }` tree input with `{ name, content }` before calling MCP.

## Inspect a tree

```json
{
  "main_tree": {
    "file": "/path/to/main_tree.tre"
  }
}
```

Call:

```bash
node <skill-dir>/scripts/phylorender_mcp_client.mjs call inspect_tree /tmp/inspect-tree.json
```

## Create a figure

Before using this template, apply the mandatory outgroup gate from `SKILL.md`. A new ordinary tree or cloud/conflict figure must use the user's explicitly named main/species-tree outgroup. A two-tree comparison needs only the main tree's outgroup; do not ask for or set a separate comparison-tree outgroup. If the required main/species-tree outgroup was not provided, ask the user and wait before calling `create_figure`. Resolve exact original tip labels after inspection. For Dating output, do not ask for an outgroup and omit `rooting` so the fixed root and time direction in the dated input are preserved.

For a cloud figure, use `options.cloud.phyparts_outgroups: ["Exact_outgroup_A", "Exact_outgroup_B"]` and omit `rooting`. The list must match one complete side of the existing species root. Partial-sample genes remain eligible when their observed outgroup subset forms one separating edge; missing-all or incompatible outgroups are audited. Preserve the original species root and dates. This is a scientific input, not an optional styling override.

For a new Dating figure, also read `inspect_tree.time_label_density`. If `dense=true` and the user has not already chosen label coverage, ask once whether to use the recommended older 50%, label every node, or label fewer nodes. Default means omit both age bounds. Full labels mean send `"age_minimum": 0` and omit the maximum. A narrower choice uses the user-confirmed source-unit cutoff. Do not replace this gate by disabling arrows, shrinking fonts, or hiding HPD.

```json
{
  "main_tree": {
    "file": "/absolute/path/main_tree.tre"
  },
  "support_trees": [
    {
      "file": "/absolute/path/bootstrap.tree",
      "label": "Bootstrap"
    }
  ],
  "tip_label_overrides": {
    "Exact_original_tip_A": "Publication display name A"
  },
  "rooting": {
    "outgroup": ["Exact_outgroup_tip_A", "Exact_outgroup_tip_B"]
  },
  "options": {
    "layout": {
      "mode": "phylogram",
      "ladderize": "small-top",
      "branch_width_pt": 0.9,
      "automatic_tip_spacing": true
    },
    "output": {
      "aspect_ratio": "auto",
      "width_mm": 0,
      "dpi": 300
    },
    "labels": {
      "node_arrows": true
    },
    "support": {
      "decimals": 1,
      "full_support_marker": "circle",
      "low_support_threshold": 50
    },
    "typography": {
      "tips": {
        "family": "Arial, sans-serif",
        "size_pt": 15,
        "italic_mode": "auto"
      },
      "nodes": {
        "family": "Arial, sans-serif",
        "preferred_size_pt": 13.5,
        "minimum_size_pt": 7
      }
    }
  },
  "clades": [
    {
      "mrca_of": ["Exact_original_tip_A", "Exact_original_tip_B"],
      "name": "Clematis sect. Atragene",
      "name_segments": [
        {"text": "Clematis ", "family": "Georgia, serif", "italic": true},
        {"text": "sect. ", "family": "Arial, sans-serif", "italic": false},
        {"text": "Atragene", "family": "\"Times New Roman\", serif", "size": 16, "italic": true}
      ],
      "color": "#0072B2",
      "label_orientation": "auto"
    }
  ]
}
```

Inspect the live schema/tool description if an enum is rejected; do not guess new enum values.

## Edit different parts of one clade-bar name

Use the stable `clade_id` returned by `inspect_figure`. This example changes the name to two independently styled spans. Because only `name_segments` is supplied, the server derives `name` as `Updated clade`.

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 1,
  "change_note": "Use separate typography for the two parts of the group name.",
  "operations": [
    {
      "op": "update_clade",
      "clade_id": "clade:STABLE_ID",
      "patch": {
        "name_segments": [
          {"text": "Updated ", "family": "Arial, sans-serif", "bold": true, "italic": false},
          {"text": "clade", "family": "Georgia, serif", "color": "#D55E00", "italic": true}
        ]
      }
    }
  ]
}
```

Every segment requires nonempty `text`. Optional `family`, `size`, `color`, `bold`, and `italic` override the global clade typography only for that span. Spaces belong in segment text and are significant. To return to one uniform style, send `patch: {"name": "Uniform name"}` without `name_segments`. Verify the normalized segments, embedded SVG fonts, clade-bar spacing, and topology fingerprint from the returned SVG and report. Generate a PNG preview only when the user explicitly requests a raster preview or visual audit.

## Rename samples without changing their identities

Rename one sample in a later revision:

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 1,
  "change_note": "Use the manuscript sample label for one terminal.",
  "operations": [
    {
      "op": "set_tip_label",
      "original_name": "Exact_original_tree_tip",
      "display_name": "Desired display name"
    }
  ]
}
```

Merge a mapping table into the existing names by using the personal helper's file hydration:

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 2,
  "operations": [
    {
      "op": "merge_tip_labels",
      "tip_label_overrides": {
        "file": "/absolute/path/sample_name_mapping.xlsx"
      }
    }
  ]
}
```

The table uses two columns named `original_name` and `display_name`, or `原始名称` and `显示名称`. CSV, TSV, TXT, and `.xlsx` are supported; save legacy `.xls` as `.xlsx`. The operations `remove_tip_label`, `replace_tip_labels`, and `clear_tip_labels` restore one name, replace the full map, or clear it. Always use original tree labels in `rooting.outgroup` and `clades[].mrca_of`, even after the displayed names change. Verify `report.tip_labels.customized`, the SVG text, unchanged topology fingerprints, and unchanged auxiliary support matching.

Before using the `output` object against the public endpoint, confirm that authenticated tool discovery exposes these fields. The local renderer may be newer than the deployed MCP. A strict older schema will reject unknown fields.

## Inspect an existing figure

```json
{
  "figure_id": "FIGURE_UUID"
}
```

Call `inspect_figure` and retain `current_revision`.

## Root or reroot with multiple outgroups

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 1,
  "change_note": "Root on the branch containing the two specified outgroup tips.",
  "operations": [
    {
      "op": "set_rooting",
      "outgroup": ["Exact_outgroup_tip_A", "Exact_outgroup_tip_B"]
    }
  ]
}
```

Call `edit_figure`. Verify that the returned report preserves both topology fingerprints and lists the intended outgroup.

## Change styling without replacing the tree

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 2,
  "change_note": "Increase branch weight and change support precision.",
  "operations": [
    {
      "op": "set_options",
      "options": {
        "layout": {"branch_width_pt": 1.35},
        "support": {"decimals": 2}
      }
    }
  ]
}
```

## Change output proportion or PNG resolution

Use automatic geometry for a tall tree:

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 3,
  "change_note": "Let the tall tree expand naturally and export a 600 DPI PNG.",
  "operations": [
    {
      "op": "set_options",
      "options": {
        "output": {
          "aspect_ratio": "auto",
          "dpi": 600
        }
      }
    }
  ]
}
```

Use a custom width-to-height ratio:

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 4,
  "change_note": "Use a 1.6 width-to-height target for the manuscript figure.",
  "operations": [
    {
      "op": "set_options",
      "options": {
        "output": {
          "aspect_ratio": "custom",
          "custom_ratio": 1.6
        }
      }
    }
  ]
}
```

Supported `aspect_ratio` values are `auto`, `content`, `1:1`, `4:3`, `3:2`, `16:9`, `a4-landscape`, `a4-portrait`, and `custom`. After the edit, inspect `report.canvas` and `report.output`. Require the expected `aspect_mode`; automatic mode expands real horizontal coordinates only until the active workspace ceiling, after which it compresses the tree body. A requested ratio is therefore a target, not permission to exceed 400 mm for phylogeny, Dating or cloud, or 800 mm for conflict. Require `report.output.width_mm <= report.output.maximum_width_mm`; if `width_limited_to_maximum` is true, explain only that the tree body was fitted to the maximum, not that fonts or samples were reduced. For PNG, use `actual_png_scale` and the artifact's real pixel dimensions; safety limits can reduce the requested `png_scale`.

## Export an immutable revision

```json
{
  "figure_id": "FIGURE_UUID",
  "revision": 2,
  "formats": ["svg"]
}
```

For an ordinary drawing request, call `export_figure` with SVG only (or omit `formats`, whose default is SVG), stop only on an MCP-reported failure, download the returned artifact, and present it immediately. Do not open or visually inspect it. Request `formats: ["png"]` only when the human user explicitly asks for PNG. For an explicit audit or publication-QA request, additionally require `safe_for_export: true` and verify the requested output geometry from the report before downloading.

Node arrows are on by default. Only for an explicit audit or publication-QA request, check that enabled arrows have no MCP-reported missing, misdirected, insufficient-angle, or unbridged-crossing failures, and visually inspect their routing. To omit pointers, set `options.labels.node_arrows: false`. The legacy `labels.leader_lines` field remains a backward-compatible alias.

## Asynchronous jobs (`start_figure_job` -> `wait` -> `download`)

Use `start_figure_job` for large trees, dense full-label Dating (`age_minimum: 0`), or large PhyParts batches:

```bash
node <skill-dir>/scripts/phylorender_mcp_client.mjs call start_figure_job /tmp/create-job.json
# Returns { "job_id": "JOB_UUID", "status": "queued", ... }
node <skill-dir>/scripts/phylorender_mcp_client.mjs wait JOB_UUID
# Polls get_figure_job on the pinned endpoint and records the resulting figure_id origin
node <skill-dir>/scripts/phylorender_mcp_client.mjs download FIGURE_UUID 1 /tmp/output --png --panels
```

Request JSON for `start_figure_job`:

```json
{
  "idempotency_key": "unique-job-key-001",
  "figure_spec": {
    "workspace": "time",
    "main_tree": { "file": "/path/to/dated.nex" },
    "options": {
      "time": { "source_unit": "mya", "age_minimum": 0 },
      "layout": { "automatic_tip_spacing": true }
    }
  }
}
```

## Edit two-tree sample groups or cloud pie visibility

Set or clear explicit `sample_groups` in `conflict`:

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 1,
  "operations": [
    {
      "op": "set_sample_groups",
      "sample_groups": [
        { "name": "Clade A", "color": "#0072B2", "samples": ["Tip_1", "Tip_2"] }
      ]
    }
  ]
}
```

Hide, show, or reset hidden node pie charts in `cloud`:

```json
{
  "figure_id": "FIGURE_UUID",
  "base_revision": 1,
  "operations": [
    { "op": "hide_cloud_pie", "samples": ["Tip_1", "Tip_2"] }
  ]
}
```

Use `{"op": "show_cloud_pie", "samples": ["Tip_1", "Tip_2"]}` to restore one pie, `{"op": "reset_hidden_cloud_pies"}` to restore all hidden pies, or `{"op": "clear_sample_groups"}` in `conflict` to remove all explicit sample groups.

## Restore an earlier state

```json
{
  "figure_id": "FIGURE_UUID",
  "target_revision": 1,
  "base_revision": 3,
  "change_note": "Restore revision 1 as a new revision."
}
```

Restoration creates another revision and keeps all history.

## Read one resource

```bash
node <skill-dir>/scripts/phylorender_mcp_client.mjs resource \
  'phylorender://figures/FIGURE_UUID/revisions/2/report.json' \
  /path/to/output/report_v2.json
```

