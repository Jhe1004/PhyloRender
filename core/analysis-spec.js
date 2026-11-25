(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhyloRenderAnalysisSpec = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  // Only scientific inputs belong here. Never add font, colour or pie-display
  // settings: changing them must not launch another inference process.
  const fields = Object.freeze(["species_method", "genes_method", "dated_unit",
    "dated_age_source", "root_age", "root_age_unit", "phyparts_root_policy",
    "phyparts_outgroups", "phyparts_threshold", "phyparts_field", "phyparts_scale"]);
  function identity(spec, cloud) {
    return JSON.stringify({
      version: 6, // Invalidates cached bundled-treePL alignments in favor of PhyloRender-pl-aligner.
      species: spec.main_tree?.content || "",
      genes: spec.gene_trees?.content || "",
      counts: spec.phyparts_table?.content || "",
      parameters: Object.fromEntries(fields.map(key => [key, cloud[key] ?? null])),
    });
  }
  return Object.freeze({ identity, fields });
});
