const {spawnSync}=require("node:child_process"),path=require("node:path"),fs=require("node:fs");
const root=path.resolve(__dirname,".."), node=process.execPath;
const unit=fs.readdirSync(path.join(root,"tests")).filter(name=>name.endsWith(".test.cjs")).sort().map(name=>"tests/"+name);
const commands=[
  [node,["tools/check-module-boundaries.cjs"]],
  [node,["--test",...unit]],
  [node,["--test","mcp-server/tests/audit-state.test.mjs","mcp-server/tests/artifact-integrity.test.mjs","mcp-server/tests/mcp-input-bounds.test.mjs"]],
  [process.env.PHYLORENDER_PYTHON||"python3",["-m","unittest","discover","-s","tools","-p","test_*.py"]],
  [node,["mcp-server/scripts/generate-schema.mjs","--check"]],
  [node,["tools/build-manifest.cjs","--check"]],
];
if(process.argv.includes("--integration")) commands.push(
  ["npm",["--prefix","mcp-server","test"]],
  [node,["mcp-server/tests/tip-width-cap.mjs"]],
  [node,["mcp-server/tests/automatic-row-layout.mjs"]],
  [node,["mcp-server/tests/clade-auto-layout.mjs"]],
  [node,["mcp-server/tests/clade-nested-hierarchy.mjs"]],
  [node,["mcp-server/tests/two-panel-clade-inheritance.mjs"]],
  [node,["mcp-server/tests/time-background-continuity.mjs"]],
  [node,["mcp-server/tests/geologic-range.mjs"]],
  [node,["mcp-server/tests/png-reproducibility.mjs"]],
  [node,["mcp-server/tests/sample-identity-inspection.mjs"]],
  [node,["mcp-server/tests/support-scale-display.mjs"]],
  [node,["mcp-server/tests/clade-relative-size.mjs"]],
  [node,["mcp-server/tests/cloud-legend-default.mjs"]],
  [node,["mcp-server/tests/raw-time-annotations.mjs"]],
  [node,["mcp-server/tests/report-layout-reuse.mjs"]],
  [node,["mcp-server/tests/conflict-alias-import.mjs"]],
  [node,["mcp-server/tests/optional-demo-resource.mjs"]],
  [node,["mcp-server/tests/astral-root-display.mjs"]],
  [node,["mcp-server/tests/acceptance-defects.mjs"]],
  [node,["mcp-server/tests/acceptance-urgent.mjs"]],
  [node,["mcp-server/tests/sample-name-workbench.mjs"]],
  [node,["mcp-server/tests/node-annotation-action.mjs"]],
  [node,["mcp-server/tests/workbench-status-visibility.mjs"]],
  [node,["mcp-server/tests/workbench-separator.mjs"]],
  [node,["mcp-server/tests/audit-browser.mjs"]],
  [node,["mcp-server/tests/runtime-lifecycle.mjs"]],
  [node,["mcp-server/tests/stdio-disconnect.mjs"]],
  [node,["mcp-server/tests/stdio-large-input.mjs"]],
  [node,["mcp-server/tests/runtime-crash.mjs"]],
  [node,["mcp-server/tests/big-data-stability.mjs"]]);
if(process.argv.includes("--native-science")) commands.push(
  ...["cloud-partial-candidates", "cloud-multiple-outgroups", "cloud-imported-dating", "cloud-full-phyparts", "tree-input-validation", "cloud-crown-age"]
    .map(name => [node, [`mcp-server/tests/${name}.mjs`]]));
for(const [command,args] of commands){
  const result=spawnSync(command,args,{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"},stdio:"inherit"});
  if(result.error || result.status!==0){console.error("CHECK_FAILED",command,args.join(" "));process.exit(result.status||1);}
}
console.log("CHECKS_PASSED: this is a test gate, not deployment or release approval.");
