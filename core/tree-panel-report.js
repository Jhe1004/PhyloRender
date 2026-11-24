/* Pure panel-report formatting; planning never claims measured readability. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderTreePanelReport=api;})(globalThis,function(){
"use strict";
const strategy="single_bottom_complete_monophyletic_clade";
function rendered({uniformPages,minimumTipPoints,minimumNodePoints,maximumPanels,rooted}) {
  return {
      supported: true,
      generated: true,
      format: "two-panel tree set",
      pages: uniformPages.length,
      panels: uniformPages.length,
      maximum_panels: maximumPanels,
      split_by_complete_clades: uniformPages.length > 1,
      split_strategy: strategy,
      second_panel_is_complete_monophyletic_clade: uniformPages.length === 2,
      second_panel_tip_count: uniformPages[1]?.original_tip_count || 0,
      uniform_panel_width: true,
      panel_width: uniformPages[0]?.width || 0,
      source_panel_widths: uniformPages.map(page => page.source_width),
      automatic_compact_tip_spacing: true,
      rooting_applied_before_split: Boolean(rooted),
      rendering_profile: {
        renderer: "shared",
        inherits_figure_rendering: true,
        preserved: [
          "layout", "ladderize", "branch_width", "tip_label_overrides",
          "support_rules", "typography", "colors", "node_arrows",
          "clade_coloring", "clade_bars", "scale_bar", "time_geology",
        ],
        print_adaptations: ["single_clade_split", "natural_panel_height", "uniform_panel_width", "automatic_compact_tip_spacing"],
      },
      continuation_markers: Math.max(0, uniformPages.length - 1),
      continuation_guides: Math.max(0, uniformPages.length - 1),
      minimum_tip_points: minimumTipPoints,
      minimum_node_points: minimumNodePoints,
      readable: true,
      configured_font_sizes_preserved: true,
    };
}
function planned({tipCounts,maximumPanels,rooted}) {
  return {
    supported:true,generated:false,measurement_status:"not_requested",
    panels:tipCounts.length,maximum_panels:maximumPanels,split_strategy:strategy,
    second_panel_is_complete_monophyletic_clade:tipCounts.length===2,
    second_panel_tip_count:tipCounts[1]||0,rooting_applied_before_split:Boolean(rooted),
  };
}
return Object.freeze({rendered,planned});
});
