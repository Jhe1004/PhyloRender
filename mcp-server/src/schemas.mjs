import * as z from "zod/v4";
import contract from "../../figure-contract.js";
import units from "../../figure-units.js";
import geologicTime from "../../core/geologic-timescale.js";

export const MAX_TREE_TEXT_LENGTH = 120_000_000;
export const MAX_TOTAL_TREE_TEXT_LENGTH = 320_000_000;
const supportScaleSchema = z.string().min(1).max(1000).regex(/^(?:auto|probability|percent)(?:\/(?:auto|probability|percent))*$/)
  .describe("auto rejects ambiguous fractional-only or mixed-unit sources; use probability or percent explicitly; for compound columns, declare one unit per column separated by /, for example probability/percent.");
export const semanticIdSchema = z.string().trim().min(1).max(160)
  .regex(/^[A-Za-z0-9._:-]+$/)
  .describe("Stable semantic identifier returned by PhyloRender, not a screen coordinate or transient DOM node id.");

export const treeInputSchema = z.object({
  name: z.string().trim().min(1).max(255).optional()
    .describe("Original file name used for provenance and exported artifact naming."),
  content: z.string().min(1).max(MAX_TREE_TEXT_LENGTH)
    .describe("Complete Newick or Nexus tree text. The server reads this value but never edits it."),
}).strict();

export const nodeDataTreeSchema = treeInputSchema.extend({
  source_id: semanticIdSchema.optional()
    .describe("Stable source identifier. Omit on creation to let PhyloRender assign one."),
  label: z.string().trim().min(1).max(120).optional()
    .describe("Display name for this node-data source, such as Bootstrap or posterior probability."),
  field: z.string().trim().min(1).max(120).optional()
    .describe("Numeric field to read. Use auto, ages, a field key, or field:<key>. Omit to use PhyloRender's safe automatic selection."),
  decimals: z.number().int().min(0).max(6).optional()
    .describe("Decimal places for an other-data source. Support-rate precision is controlled globally."),
}).strict();

const supportTreeSchema = nodeDataTreeSchema.omit({ decimals: true }).extend({
  scale: supportScaleSchema.optional().describe("Explicit support units for this source, optionally one unit per /-separated column. Auto resolves each column from the whole source and rejects nonzero values confined to 0–1 because they could also be low percentages."),
});

const fontFamilySchema = z.string().trim().min(1).max(200)
  .describe("CSS font-family value. Figure defaults prefer real installed Arial for all typography. Arial requests use real installed Arial when available; otherwise explicitly switch to bundled Arimo, reflow and report the actual font in normalized options, warnings and SVG metadata. Arial remains a system-font reference in SVG; fallback Arimo subsets are embedded. Georgia, Times, Helvetica and PingFang legacy requests map to bundled alternatives whose required subsets are embedded.");
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)
  .describe("Six-digit hexadecimal color such as #0072B2.");
export const cladeNameSegmentSchema = z.object({
  text: z.string().min(1).max(120)
    .describe("Exact text for this consecutive part of the clade-bar label. Spaces may be retained at either edge to separate adjacent parts."),
  family: fontFamilySchema.optional()
    .describe("Font family for only this text segment. Omit to inherit the global clade-label font."),
  size: z.number().int().min(8).max(30).optional()
    .describe("Font size in SVG pixels for only this segment. Omit to inherit the global clade-label size."),
  size_pt: z.number().min(6).max(22.5).optional().describe("Legacy point-reference font size, converted to drawing units; scales with print width. Prefer size_u."),
  size_u: z.number().min(units.ptToDrawing(6)).max(units.ptToDrawing(22.5)).optional().describe("Font size in drawing units. The complete figure width is 1000 units; this field supersedes legacy size_pt."),
  color: colorSchema.optional()
    .describe("Text color for only this segment of one group. Omit to inherit that group's color; there is no global clade-label color."),
  bold: z.boolean().optional()
    .describe("Set true or false to override boldness for this segment. Omit to inherit the global clade-label weight."),
  italic: z.boolean().optional()
    .describe("Set true or false to override italics for this segment. Omit to inherit the global clade-label style."),
}).strict();
const tipNameSchema = z.string().trim().min(1).max(1000);
const sampleGroupSchema = z.object({
  name: z.string().min(1).max(120).describe("Legend and group label for these samples."),
  color: colorSchema.describe("Hex color #RRGGBB shared by the primary clade, comparison tips, and connecting lines."),
  samples: z.array(tipNameSchema).min(1).max(5000).describe("Exact original primary-tree tip labels belonging to this group."),
}).strict();
export const tipLabelOverridesSchema = z.record(tipNameSchema, tipNameSchema)
  .superRefine((mapping, context) => {
    if (Object.keys(mapping).length > 5000) {
      context.addIssue({ code: "custom", message: "tip_label_overrides can contain at most 5000 samples." });
    }
  })
  .describe("Display-only sample-name mapping from an exact original tree tip label to the desired figure label. Original labels remain the semantic identifiers for rooting, support matching, clades, and later edits.");

const legacyFigureOptionsSchema = z.object({
  layout: z.object({
    mode: z.enum(["phylogram", "cladogram", "aligned"]).optional()
      .describe("Ordinary-tree coordinate mode. phylogram preserves branch lengths; cladogram uses topological depth; aligned extends terminal twigs to one edge. Dating, cloud and conflict workspaces reject it because they own specialized coordinates."),
    ladderize: z.enum(["file", "small-top", "large-top"]).optional()
      .describe("Canonical display-only sister-clade rotation for all four workspaces. It never changes topology or node values."),
    clade_bar_alignment: z.enum(contract.cladeBarAlignment.values).optional()
      .describe("auto (default) places single-layer clade bars beside each clade's own sample labels and switches to shared vertical columns after the rightmost sample label whenever nested or multi-tier clades are present; nearby forces local placement; aligned forces shared right-aligned columns."),
    automatic_tip_spacing: z.boolean().optional().describe("Use actual font metrics and shared automatic row layout. Ordinary, Dating and cloud figures target height/width 1.25 by spreading real rows when sparse, with a comfort cap and compact dense rows; comparisons retain landscape preference. Manual spacing and explicit aspect modes take priority. Defaults to true."),
    horizontal_scale: z.number().min(25).max(400).optional().describe("Horizontal branch stretch in percent for phylogeny, Dating and cloud. Conflict owns a fixed mirrored two-tree layout and rejects this field."),
    tip_order: z.array(tipNameSchema).min(2).max(5000).nullable().optional().describe("Canonical exact display order for all four workspaces. Only sister rotations are permitted; ladderize=file retains it. Null clears the order."),
    branch_width: z.number().min(0.5).max(4).optional().describe("Branch line stroke width in legacy SVG pixels; prefer branch_width_u."),
    branch_width_pt: z.number().min(.375).max(3).optional().describe("Branch thickness in points, 1 pt = 1/72 inch. Independent of PNG DPI."),
    node_radius_pt: z.number().min(1.5).max(9).optional().describe("Support-circle radius in points; diameter is twice this value."),
    tip_spacing_em: z.number().min(contract.tipSpacingLimits.minimumEm).max(contract.tipSpacingLimits.maximumEm).optional().describe("Manual terminal centre spacing as a multiple of terminal font size. Compact fallback default 1.05 em; automatic spacing is enabled by default. Export uses exact tip_spacing pixels if a manual font edit produces an out-of-range em ratio; no geometry is clamped."),
    tip_spacing: z.number().min(contract.tipSpacingLimits.minimumPx).max(contract.tipSpacingLimits.maximumPx).optional()
      .describe("Exact center-to-center vertical distance in drawing pixels, including fractional values, 4.5–72 px like the GUI (25–400% of 18 px). This is also the lossless fallback for manual spacing outside the em range; it does not denote blank space between glyphs."),
  }).strict().optional(),
  output: z.object({
    width_mm: z.number().min(0).max(contract.outputGeometry.absoluteMaximumWidthMm).optional().describe("Print width in millimetres. Zero selects the workspace maximum: 400 mm phylogeny/time/cloud or 800 mm for the entire double-tree conflict figure. Changes only physical scale; all relative drawing geometry remains identical."),
    dpi: z.number().min(72).max(1200).optional().describe("PNG pixels per inch, default 300 when PNG is explicitly requested. MCP creation remains SVG-only by default. Only raster clarity changes; physical font sizes and geometry stay identical. PNG embeds pHYs density. Check effective_dpi when safety limits cap large images."),
    aspect_ratio: z.enum(["auto", "content", "1:1", "4:3", "3:2", "16:9", "a4-landscape", "a4-portrait", "custom"]).optional()
      .describe("Canvas width stays 1000 drawing units. Auto/content retain natural content height; explicit ratios may add height. Complete measured content and readable row spacing take priority when a requested ratio cannot fit."),
    custom_ratio: z.number().min(0.4).max(3).optional()
      .describe("Target width divided by height when aspect_ratio is custom."),
    png_scale: z.number().int().min(1).max(4).optional()
      .describe("PNG pixel-density multiplier only. It increases raster width and height without changing SVG geometry, aspect ratio, relative font size, line width, node positions, or clade spacing. Very large PNGs are safely capped."),
  }).strict().optional(),
  labels: z.object({
    auto_placement: z.boolean().optional(),
    leader_lines: z.boolean().optional()
      .describe("Backward-compatible alias for node_arrows."),
    node_arrows: z.boolean().optional()
      .describe("Show a small straight arrow from each rendered numeric node label to its owning node on branch-length phylograms and dated time trees (automatically suppressed when branch lengths are not displayed). Defaults to true."),
  }).strict().optional(),
  support: z.object({
    scale: supportScaleSchema.optional().describe("Main-tree support units, optionally one unit per /-separated column. Auto resolves each column from the whole source and rejects nonzero values confined to 0–1 because they could also be low percentages."),
    decimals: z.union([z.literal("auto"), z.literal("original"), z.number().int().min(0).max(6)]).optional()
      .describe('Default "auto": rounds percentage support columns (0–100) to integers (0 decimal places) and probability columns (0–1) to 2 decimal places. Set 0–6 to force uniform decimal places across all columns, or "original" to preserve unrounded source strings. Full-support styling uses the active display rounding ("original" stays unrounded); source values and low-support cutoffs remain unchanged.'),
    full_support_marker: z.enum(["branch", "circle", "number", "hide", "star"]).optional()
      .describe("Show nodes whose available support sources and components all reach their maximum at the selected display precision by thickening the incoming branch (default), or use circle, number, hidden, or star styles. Missing sources prevent full support."),
    low_support_threshold: z.number().int().min(0).max(100).optional()
      .describe("Each support component below this percent becomes an em dash. Zero disables replacement."),
  }).strict().optional(),
  typography: z.object({
    tips: z.object({
      size_pt: z.number().min(6).max(22.5).optional().describe("Terminal label size in points: default 15 pt for phylogeny/conflict and 18 pt for time/cloud. Height stays fixed; complete names wider than 1.25 times the median natural sample-name width compress glyphs horizontally to that limit."),
      family: fontFamilySchema.optional(),
      size: z.number().int().min(8).max(30).optional()
        .describe("Legacy terminal-taxon label size in SVG pixels. The ordinary/conflict default is a clearly readable 20 px; height stays fixed; the shared 1.25-times-median rule compresses only overlong glyph widths."),
      color: colorSchema.optional(),
      bold: z.boolean().optional(),
      italic_mode: z.enum(["auto", "all", "none"]).optional(),
      normalize_ranks: z.boolean().optional(),
      follow_clade_color: z.boolean().optional(),
    }).strict().optional(),
    nodes: z.object({
      automatic_size: z.boolean().optional().describe("Default true: preferred node-label font size scales automatically with the tree's rendered row spacing and branch span, with optical size compensation for asterisk full-support symbols. Supplying an explicit preferred size without this flag selects a fixed size; setting true restores automatic sizing."),
      preferred_size_pt: z.number().min(6.75).max(contract.nodeLabelReadability.maximumDesign * .75).optional().describe("Preferred numeric node label size in points when fixed, or baseline fallback (13.5 pt compact baseline, up to 24 pt manual ceiling)."),
      minimum_size_pt: z.number().min(6.75).max(13.5).optional().describe("Hard minimum for collision avoidance, default 7 pt. Smaller text incurs a progressively increasing penalty; this is a floor, not the target size."),
      family: fontFamilySchema.optional(),
      preferred_size: z.number().min(9).max(contract.nodeLabelReadability.maximumDesign).optional()
        .describe("Preferred node-number size in SVG design pixels (9–32 px)."),
      minimum_size: z.number().int().min(9).max(18).optional()
        .describe("Smallest node-number size allowed during collision avoidance. The MCP publication default is 16 px; readability takes priority over eliminating every overlap by shrinking text."),
      color: colorSchema.optional(),
      bold: z.boolean().optional().describe("Whether numeric node annotations are bold. The default is false (regular weight)."),
      italic: z.boolean().optional(),
    }).strict().optional(),
    clades: z.object({
      size_pt: z.number().min(6).max(contract.cladeReadability.maximumDesign * .75).optional(),
      family: fontFamilySchema.optional(),
      size: z.number().min(8).max(contract.cladeReadability.maximumDesign).optional(),
      follow_tip_size: z.boolean().optional().describe("Default true: group-name font size follows the current tip-name size plus exactly 3 drawing units. A supplied group size without this flag selects a fixed size; true restores automatic sizing. Explicit name-segment sizes remain independent."),
      color: colorSchema.optional().describe("Deprecated compatibility field: ignored with a warning. Group names inherit their individual clade color."),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      follow_clade_color: z.boolean().optional().describe("Deprecated compatibility field: group names always follow their individual clade color; false is ignored with a warning."),
    }).strict().optional(),
    scale: z.object({
      size_pt: z.number().min(5.25).max(18).optional(),
      family: fontFamilySchema.optional(),
      size: z.number().int().min(7).max(24).optional(),
      color: colorSchema.optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
    }).strict().optional(),
  }).strict().optional(),
  time: z.object({
    period_size_pt: z.number().min(3).max(24).optional().describe("Geological period-name font size in points; independent from epoch names and node labels."),
    epoch_size_pt: z.number().min(3).max(24).optional().describe("Geological epoch-name font size in points."),
    legend_size_pt: z.number().min(3).max(24).optional().describe("Deprecated compatibility option. Abbreviation full names now belong in the figure caption and are not drawn on the canvas."),
    axis_size_pt: z.number().min(3).max(24).optional().describe("Time-axis tick-number font size in points."),
    unit_size_pt: z.number().min(3).max(24).optional().describe("Time-axis unit caption font size in points."),
    key_size_pt: z.number().min(3).max(24).optional().describe("Deprecated compatibility setting; bottom provenance explanations are no longer drawn inside figures."),
    age_minimum: z.number().min(0).nullable().optional().describe("Youngest visible node age in source-tree units. Omit both age bounds to use the Dating density guard: at 160 or more candidate node ages, only the older half is labelled by default. Set 0 explicitly to request every node age and the bounded 30-minute full-label render deadline. HPD bars, branches and time coordinates remain visible."),
    age_maximum: z.number().min(0).nullable().optional().describe("Oldest visible node age in source-tree units. Omit with age_minimum for automatic dense-tree protection; range filtering hides only age numbers and their dots."),
    show_node_ages: z.boolean().optional(),
    show_hpd: z.boolean().optional(),
    geology: z.enum(["standard", "none"]).optional().describe(`Shared Dating/cloud background from ICS ${geologicTime.SOURCE.version}, ${geologicTime.SOURCE.minimumMa}–${geologicTime.SOURCE.maximumMa} Ma. Rows use the available formal ranks in the Precambrian. Older axis portions are neutral and marked Outside ICS range; no ages are inferred or changed.`),
    age_decimals: z.number().int().min(0).max(3).optional(),
    source_unit: z.enum(["unconfirmed", "years", "kyr", "mya"]).optional(),
    display_unit: z.enum(["same", "years", "kyr", "mya"]).optional(),
    age_source: z.enum(["auto", "height", "height_mean", "height_median", "branch_lengths"]).optional(),
    hpd_scope: z.enum(["all", "named_clades"]).optional(),
    hpd_marker: z.enum(["none", "height_mean", "height_median"]).optional(),
    hpd_color: colorSchema.optional(),
    hpd_opacity: z.number().min(.1).max(1).optional(),
    hpd_thickness: z.number().int().min(2).max(16).optional(),
  }).strict().optional(),
  cloud: z.object({
    show_time_axis: z.boolean().optional().describe("Show shared Dating-style top/bottom axes and standard geological palette in any time mode. Default false. With relative/unconfirmed units, colors are illustrative (one raw unit maps to one Mya for colors only); no ages or calibration provenance change. Appearance and fonts use options.time."),
    species_method: z.enum(["ml", "dated", "coalescent", "other"]).optional(),
    genes_method: z.enum(["ml", "coalescent", "other"]).optional(),
    dated_unit: z.enum(["unconfirmed", "relative", "years", "kyr", "mya"]).optional(),
    dated_age_source: z.enum(["auto", "height", "height_mean", "height_median", "branch_lengths"]).optional(),
    root_age: z.number().positive().optional().describe("Required for an undated ML species tree. Fixed age of the entire input root/crown, not an automatically selected ingroup node. No silent default. Ignored for imported dated species trees."),
    root_age_unit: z.enum(["relative", "years", "kyr", "mya"]).optional().describe("Unit of user-supplied root_age for undated ML species trees. Default relative for API compatibility; choose mya explicitly for Mya. Does not establish fossil-calibration provenance."),
    opacity: z.number().min(contract.cloudOpacity.minimum).max(contract.cloudOpacity.maximum).optional(),
    jitter: z.number().int().min(contract.cloudJitter.minimum).max(contract.cloudJitter.maximum).optional().describe("Cloud jitter strength, integer 0–100, default 0. Deterministic display-only curvature: larger values spread gene branch midsections; endpoints, times, topology and statistics remain unchanged. Maximum midpoint displacement is half a sample row; zero-duration branches remain straight."),
    show_gene: z.boolean().optional(), show_species: z.boolean().optional(), show_pies: z.boolean().optional(),
    species_shape: z.enum(["triangular", "rectangular"]).optional(),
    ladderize: z.enum(["file", "small-top", "large-top"]).optional().describe("Deprecated compatibility alias for layout.ladderize; normalized to the canonical layout field."),
    pie_mode: z.enum(["two", "four"]).optional(), pie_radius: z.number().min(contract.cloudPies.minimumRadiusPx).max(contract.cloudPies.maximumRadiusPx).optional(),
    pie_legend_position: z.enum(["auto", "upper-left", "middle-left", "lower-left"]).optional()
      .describe("Default lower-left: place the pie-chart key near the lower left while avoiding species branches, pies, labels, and time axes. Explicit auto, upper-left, and middle-left retain their existing placement rules."),
    pie_legend_scale: z.number().int().min(75).max(200).optional()
      .describe("Pie-chart key scale in percent. Default 150. Its full scaled box participates in collision avoidance."),
    pie_age_minimum: z.number().min(0).nullable().optional(), pie_age_maximum: z.number().min(0).nullable().optional(),
    hidden_pies: z.array(z.array(tipNameSchema).min(2).max(5000)).max(5000).optional()
      .describe("Hide pies by exact descendant sample sets, not transient Node IDs."),
    phyparts_outgroups: z.array(tipNameSchema).max(5000).optional()
      .describe("Exact original outgroup sample names, matching one complete child of the existing binary species root. Empty preserves singleton detection. Multi-outgroups require an explicit list. Genes may lack some outgroups; observed outgroups must define one separating edge. Missing all or non-monophyletic outgroups are audited as unrootable. Never reroots the species tree. Incompatible with root_policy=input."),
    phyparts_root_policy: z.enum(["outgroup", "input"]).optional(),
    phyparts_threshold: z.number().min(0).max(99.9).optional(),
    phyparts_field: z.enum(["first", "last"]).optional(),
    phyparts_scale: z.enum(["auto", "percent", "probability"]).optional().describe("Batch-wide units. Nonzero supports confined to 0–1 require an explicit declaration; zero-only inputs are equivalent in both units."),
  }).strict().optional(),
  conflict: z.object({
    sample_policy: z.enum(["intersection", "union"]).optional()
      .describe("Required after the user confirms how to handle different sample counts. Never infer it automatically: report both difference lists, ask the user, then retry explicitly."),
    primary_title: z.string().max(80).optional(), secondary_title: z.string().max(80).optional(),
    primary_ladder: z.enum(["file", "small-top", "large-top"]).optional().describe("Deprecated compatibility alias for layout.ladderize; normalized to the canonical layout field."),
    primary_support_field: z.string().min(1).max(120).optional(),
    secondary_support_field: z.string().min(1).max(120).optional(),
    primary_support_scale: supportScaleSchema.optional(),
    secondary_support_scale: supportScaleSchema.optional(),
    primary_order: z.array(tipNameSchema).min(2).max(5000).nullable().optional()
      .describe("Deprecated compatibility alias for layout.tip_order. Only sister rotations are allowed; topology never changes."),
  }).strict().optional(),
}).strict();

// These are protocol defaults, not suggestions that an agent must repeat in
// every request. Keeping them explicit in the stored request makes an omitted
// options object reproducible even if the browser UI defaults change later.
function relativeSchema(schema, prefix = '') {
  if (schema instanceof z.ZodOptional) return relativeSchema(schema.unwrap(), prefix).optional();
  if (!(schema instanceof z.ZodObject)) return schema;
  const shape = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const path = prefix ? `${prefix}.${key}` : key;
    shape[key] = relativeSchema(field, path);
    const direct = ['layout.tip_spacing','time.hpd_thickness','cloud.pie_radius'].includes(path);
    if (key.endsWith('_pt') || direct) {
      shape[key] = shape[key].describe('Legacy dimension in the fixed reference design. Converted to drawing units, then scaled with print width; use the corresponding _u field for new requests.');
      const number = field.unwrap();
      const convert = direct ? units.designToDrawing : units.ptToDrawing;
      shape[(direct ? key : key.slice(0,-3)) + '_u'] = z.number()
        .min(convert(number.minValue)).max(convert(number.maxValue)).optional()
        .describe('Drawing units: complete figure width = 1000. Independent of print width and DPI; supersedes the corresponding legacy dimension.');
    }
  }
  return schema.extend(shape);
}
export const figureOptionsSchema = relativeSchema(legacyFigureOptionsSchema);
export const MCP_PUBLICATION_DEFAULT_OPTIONS = Object.freeze(contract.defaults("phylogeny"));

// Normalize old logical-pixel requests before default merge, including edits.
// An explicit new-unit field wins over its deprecated alias.
export function physicalOptions(options = {}) {
  return contract.physicalOptions(options);
}

export const rootingSchema = z.object({
  outgroup: z.array(z.string().trim().min(1).max(1000)).min(1).max(5000).nullable().optional()
    .describe("One or more tip labels inside one monophyletic outgroup branch. Omit to use a unique Euptelea pleiosperma by default for non-time trees; null explicitly retains the input root."),
}).strict();

const outgroupEditSchema = z.array(z.string().trim().min(1).max(1000)).min(1).max(5000).nullable()
  .describe("One or more exact tip labels inside one monophyletic outgroup branch, or null to clear rooting.");

export const cladeSchema = z.object({
  clade_id: semanticIdSchema.optional()
    .describe("Stable group identifier. Omit on creation to let PhyloRender assign one."),
  mrca_of: z.array(z.string().trim().min(1).max(1000)).min(1).max(5000)
    .describe("One tip label defines a single-sample group; multiple tip labels define the colored MRCA clade."),
  name: z.string().trim().min(1).max(120).optional(),
  name_segments: z.array(cladeNameSegmentSchema).min(1).max(60).optional()
    .describe("Consecutive rich-text parts of one clade-bar label. Their text values are concatenated in order; when name is also supplied, it must equal that concatenation exactly."),
  color: colorSchema.optional(),
  label_orientation: z.enum(contract.cladeLabelOrientation.values).optional()
    .describe("Default auto: prefer compact rotated labels in aligned Dating/cloud groups; nearby phylogeny groups retain horizontal labels when they fit unused name space. Overlapping groups use separate columns. Explicit horizontal/vertical remains fixed."),
  bar_style: z.enum(contract.cladeBarStyle.values).optional()
    .describe("Clade bracket line style. Default auto uses solid bars for single-layer or innermost clades, cap-locked dashed vertical bars with solid horizontal end caps for first-level outer clades, and dash-dot bars for higher-order outer clades."),
  tier: z.number().int().min(contract.cladeTier.minimum).max(contract.cladeTier.maximum).nullable().optional()
    .describe("Optional explicit bracket tier (0 = innermost column, 1 = first outer column, etc.) so peer taxonomic ranks such as subfamilies align in the same outer dashed column even when some lack annotated subclades. Null or omitted derives tier automatically from clade nesting."),
}).strict();

export const labelAdjustmentSchema = z.object({
  branch_id: semanticIdSchema
    .describe("Stable branch identifier returned by inspect_figure; never use an internal node id."),
  dx: z.number().min(-10000).max(10000).optional()
    .describe("Horizontal label-box offset from the true node in SVG pixels."),
  dy: z.number().min(-10000).max(10000).optional()
    .describe("Vertical label-box offset from the true node in SVG pixels."),
  font_reduction: z.number().min(0).max(15).optional(),
  dx_u:z.number().min(-10000).max(10000).optional(),
  dy_u:z.number().min(-10000).max(10000).optional(),
  font_reduction_u:z.number().min(0).max(units.designToDrawing(15)).optional(),
}).strict().superRefine((value,context)=>{
  if(value.dx_u===undefined&&value.dx===undefined) context.addIssue({code:'custom',path:['dx_u'],message:'A horizontal offset is required.'});
  if(value.dy_u===undefined&&value.dy===undefined) context.addIssue({code:'custom',path:['dy_u'],message:'A vertical offset is required.'});
});

const figureSpecObjectSchema = z.object({
  workspace: z.enum(["phylogeny", "time", "cloud", "conflict"]).optional()
    .describe("Explicit workspace, identical to the web tabs. Legacy requests use phylogeny; time must preserve the input root."),
  main_tree: treeInputSchema,
  comparison_tree: treeInputSchema.optional().describe("Right comparison tree; required for conflict."),
  gene_trees: treeInputSchema.optional().describe("All gene trees as a Newick collection. The built-in conflict engine uses all eligible trees; the cloud uses exact-terminal ML subsets."),
  phyparts_table: treeInputSchema.optional().describe("Optional precomputed node table. Omit to calculate complete four-category conflict statistics from gene_trees with PhyloRender's built-in JavaScript engine."),
  sample_groups: z.array(sampleGroupSchema).max(200).optional()
    .describe("Explicit sample grouping table for conflict figures; overrides Newick clade annotations and inferred clades."),
  support_trees: z.array(supportTreeSchema).max(20).optional().default([]),
  other_data_trees: z.array(nodeDataTreeSchema).max(20).optional().default([]),
  tip_label_overrides: tipLabelOverridesSchema.optional().default({}),
  rooting: rootingSchema.optional(),
  options: figureOptionsSchema.optional().default({}),
  clades: z.array(cladeSchema).max(200).optional().default([]),
  label_adjustments: z.array(labelAdjustmentSchema).max(500).optional().default([]),
}).strict();

function totalTreeTextLength(spec) {
  return spec.main_tree.content.length
    + [spec.comparison_tree, spec.gene_trees, spec.phyparts_table].reduce((sum, tree) => sum + (tree?.content.length || 0), 0)
    + (spec.support_trees || []).reduce((sum, tree) => sum + tree.content.length, 0)
    + (spec.other_data_trees || []).reduce((sum, tree) => sum + tree.content.length, 0);
}

export const figureSpecSchema = figureSpecObjectSchema.superRefine((spec, context) => {
  const issue = (path, message) => context.addIssue({ code: "custom", path, message });
  const workspace = spec.workspace || "phylogeny";
  try {
    for (const path of contract.unsupportedOptionPaths(workspace, spec.options))
      issue(["options", ...path.split(".")], `${path} is not used by the ${workspace} workspace; omit it instead of storing a no-op setting.`);
  } catch (error) { issue(["options"], error.message); }
  const maximumWidthMm = contract.maximumOutputWidthMm(workspace);
  if ((spec.options.output?.width_mm || 0) > maximumWidthMm)
    issue(["options", "output", "width_mm"], `${workspace} workspace output.width_mm cannot exceed ${maximumWidthMm} mm.`);
  if (spec.workspace === "cloud" && (spec.options.cloud?.species_method || "ml") === "ml" && spec.options.cloud?.root_age == null)
    issue(["options", "cloud", "root_age"], "Undated ML species trees require an explicit positive root/crown age (root_age); there is no default age.");
  if (spec.workspace === "conflict" && !spec.comparison_tree) issue(["comparison_tree"], "Conflict workspace requires comparison_tree.");
  if (spec.workspace !== "conflict" && (spec.comparison_tree || spec.sample_groups)) issue(["workspace"], "comparison_tree/sample_groups require conflict workspace.");
  if (spec.workspace !== "cloud" && (spec.gene_trees || spec.phyparts_table)) issue(["workspace"], "gene_trees/phyparts_table require cloud workspace.");
  if (spec.workspace === "time" && spec.support_trees?.length)
    issue(["support_trees"], "Dating figures do not display support rates; omit support_trees.");
  if (["time", "cloud"].includes(spec.workspace) && spec.rooting?.outgroup?.length) issue(["rooting"], "Dated/cloud species trees must retain the input root.");
  if (spec.options.cloud && spec.workspace !== "cloud") issue(["options", "cloud"], "Cloud options require cloud workspace.");
  if (spec.options.conflict && spec.workspace !== "conflict") issue(["options", "conflict"], "Conflict options require conflict workspace.");
  if (["cloud", "conflict"].includes(spec.workspace)) {
    for (const field of ["support_trees", "other_data_trees", "label_adjustments"])
      if (spec[field]?.length) issue([field], "This feature applies only to phylogeny/time workspaces.");
  }
  for (const [name, min, max] of [["time", "age_minimum", "age_maximum"], ["cloud", "pie_age_minimum", "pie_age_maximum"]]) {
    const options = spec.options?.[name];
    if (options?.[min] != null && options?.[max] != null && options[min] > options[max]) issue(["options", name, max], "Maximum age must not be younger than minimum age.");
  }
  if (totalTreeTextLength(spec) > MAX_TOTAL_TREE_TEXT_LENGTH) {
    context.addIssue({
      code: "custom",
      message: `Combined tree text exceeds the ${MAX_TOTAL_TREE_TEXT_LENGTH}-character safety limit.`,
    });
  }
});

export const figurePatchSchema = z.object({
  workspace: figureSpecObjectSchema.shape.workspace,
  comparison_tree: treeInputSchema.optional(), gene_trees: treeInputSchema.optional(), phyparts_table: treeInputSchema.optional(),
  sample_groups: figureSpecObjectSchema.shape.sample_groups,
  main_tree: treeInputSchema.optional(),
  support_trees: z.array(supportTreeSchema).max(20).optional(),
  other_data_trees: z.array(nodeDataTreeSchema).max(20).optional(),
  tip_label_overrides: tipLabelOverridesSchema.optional(),
  rooting: rootingSchema.optional(),
  options: figureOptionsSchema.optional(),
  clades: z.array(cladeSchema).max(200).optional(),
  label_adjustments: z.array(labelAdjustmentSchema).max(500).optional(),
}).strict();

export const figureIdSchema = z.string().uuid().describe("Figure identifier returned by create_figure.");
export const revisionSchema = z.number().int().min(1).describe("Immutable figure revision number.");

const supportTreePatchSchema = supportTreeSchema.omit({ source_id: true }).partial().strict();
const otherTreePatchSchema = nodeDataTreeSchema.omit({ source_id: true }).partial().strict();
const cladePatchSchema = cladeSchema.omit({ clade_id: true }).partial().strict();

export const figureEditOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_options"), options: figureOptionsSchema }).strict(),
  z.object({ op: z.literal("set_rooting"), outgroup: outgroupEditSchema }).strict(),
  z.object({ op: z.literal("set_tip_label"), original_name: tipNameSchema, display_name: tipNameSchema }).strict(),
  z.object({ op: z.literal("remove_tip_label"), original_name: tipNameSchema }).strict(),
  z.object({ op: z.literal("merge_tip_labels"), tip_label_overrides: tipLabelOverridesSchema }).strict(),
  z.object({ op: z.literal("replace_tip_labels"), tip_label_overrides: tipLabelOverridesSchema }).strict(),
  z.object({ op: z.literal("clear_tip_labels") }).strict(),
  z.object({ op: z.literal("add_clade"), clade: cladeSchema }).strict(),
  z.object({ op: z.literal("update_clade"), clade_id: semanticIdSchema, patch: cladePatchSchema }).strict(),
  z.object({ op: z.literal("remove_clade"), clade_id: semanticIdSchema }).strict(),
  z.object({ op: z.literal("add_support_tree"), tree: supportTreeSchema }).strict(),
  z.object({ op: z.literal("update_support_tree"), source_id: semanticIdSchema, patch: supportTreePatchSchema }).strict(),
  z.object({ op: z.literal("remove_support_tree"), source_id: semanticIdSchema }).strict(),
  z.object({ op: z.literal("add_other_data_tree"), tree: nodeDataTreeSchema }).strict(),
  z.object({ op: z.literal("update_other_data_tree"), source_id: semanticIdSchema, patch: otherTreePatchSchema }).strict(),
  z.object({ op: z.literal("remove_other_data_tree"), source_id: semanticIdSchema }).strict(),
  z.object({ op: z.literal("set_label_adjustment"), adjustment: labelAdjustmentSchema }).strict(),
  z.object({ op: z.literal("remove_label_adjustment"), branch_id: semanticIdSchema }).strict(),
  z.object({ op: z.literal("reset_label_adjustments") }).strict(),
  z.object({ op: z.literal("set_sample_groups"), sample_groups: z.array(sampleGroupSchema).max(200) }).strict(),
  z.object({ op: z.literal("clear_sample_groups") }).strict(),
  z.object({ op: z.literal("hide_cloud_pie"), samples: z.array(tipNameSchema).min(2).max(5000) }).strict(),
  z.object({ op: z.literal("show_cloud_pie"), samples: z.array(tipNameSchema).min(2).max(5000) }).strict(),
  z.object({ op: z.literal("reset_hidden_cloud_pies") }).strict(),
]);

export const figureEditSchema = z.object({
  figure_id: figureIdSchema,
  base_revision: revisionSchema
    .describe("Current revision read from inspect_figure. The edit is rejected if another agent has already created a newer revision."),
  operations: z.array(figureEditOperationSchema).min(1).max(100),
  change_note: z.string().trim().min(1).max(500).optional(),
}).strict();
