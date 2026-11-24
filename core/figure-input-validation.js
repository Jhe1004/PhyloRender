/* Structural validation shared by the figure importer; no document mutation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderFigureInputValidation=api;})(globalThis,function(){
"use strict";
function validate(spec,{workspaces,optionPaths,currentWorkspace,optionPolicy}) {
  if(!spec||typeof spec!=="object"||Array.isArray(spec))throw new Error("figure_spec must be an object");
  const known=new Set(["workspace","main_tree","comparison_tree","gene_trees","phyparts_table","sample_groups",
    "support_trees","other_data_trees","tip_label_overrides","rooting","options","clades","label_adjustments"]);
  for(const key of Object.keys(spec))if(!known.has(key))throw new Error(`Unknown figure specification field: ${key}`);
  (function check(options,prefix="") {
    if(!options||typeof options!=="object"||Array.isArray(options))throw new Error("Figure options must be an object");
    for(const [key,value] of Object.entries(options)) {
      const path=prefix?`${prefix}.${key}`:key;
      if(value&&typeof value==="object"&&!Array.isArray(value))check(value,path);
      else if(!optionPaths.has(path)&&!optionPaths.has(path.replace(/_u$/,"_pt"))&&!optionPaths.has(path.replace(/_u$/,"")))throw new Error(`Unknown figure option: ${path}`);
    }
  })(spec.options||{});
  const workspace=spec.workspace||(currentWorkspace==="time"?"time":"phylogeny");
  if(!workspaces.includes(workspace))throw new Error("Unknown figure workspace");
  if(workspace!=="cloud"&&(spec.gene_trees||spec.phyparts_table||spec.options?.cloud))throw new Error("Gene trees, concordance tables, and cloudogram options require the cloud workspace");
  if(workspace!=="conflict"&&(spec.comparison_tree||spec.sample_groups||spec.options?.conflict))throw new Error("Comparison trees, taxon groups, and tanglegram options require the conflict workspace");
  if(["time","cloud"].includes(workspace)&&spec.rooting?.outgroup?.length)throw new Error("Time trees and cloudogram species trees must retain their input root");
  const unsupported=optionPolicy?.unsupportedOptionPaths(workspace,spec.options||{})||[];
  if(unsupported.length)throw new Error(`Options not supported in the ${workspace} workspace: ${unsupported.join(", ")}`);
  return workspace;
}
return Object.freeze({validate});
});
