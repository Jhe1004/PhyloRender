const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
test('Arial is a distinct real system-font option, never an Arimo alias', () => {
  const html = read('index.html'), app = read('app.js'), bridge = read('agent-bridge.js');
  for (const id of ['tip-font-family', 'support-font-family', 'clade-font-family', 'scale-font-family']) {
    const select = html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`))[1];
    assert.match(select, /value="Arial, &quot;Noto Sans SC Variable&quot;, sans-serif">Arial<\/option>/);
    assert.match(select, /Arimo \(open-source sans fallback\)/);
  }
  assert.match(app, /new FontFace\("PhyloRender System Font Probe", `local\("\$\{family\}"\)`\)\.load\(\)/);
  const serialization = app.slice(app.indexOf('async function serializeRenderedSvg('), app.indexOf('function a4PrintRootPlans('));
  assert.match(serialization, /const fontKey = await ensureFigureFontsReady\(\)/);
  assert.match(serialization, /if \(activeTreeLoad && owner !== currentLoadController\) throw/);
  assert.match(bridge, /\["Arial, sans-serif", 'Arial, "Noto Sans SC Variable", sans-serif'\]/);
  assert.doesNotMatch(bridge, /\["Arial, sans-serif",[^\n]*Arimo/);
});
test('every workspace defaults tip labels to Arial and keeps explicit Arimo fallback', () => {
  const html = read('index.html'), app = read('app.js'), contract = read('figure-contract.js');
  const tipSelect = html.match(/<select id="tip-font-family">([\s\S]*?)<\/select>/)[1];
  assert.match(tipSelect, /^\s*<option value="Arial,[^>]+>Arial<\/option>/);
  assert.match(app, /"tip-font-family": FIGURE_FONT_FAMILIES\.sans/);
  assert.match(contract, /tips:\s*\{\s*size_pt:[\s\S]*?family:\s*'Arial, "Noto Sans SC Variable", sans-serif'/);
  assert.doesNotMatch(contract, /family:\s*workspace === "cloud"/);
  assert.match(app, /applyArialFallback\(\)/);
});
test('node annotations default to regular weight in the contract, UI and typography reset', () => {
  const html = read('index.html'), app = read('app.js'), contract = read('figure-contract.js'), css = read('styles.css');
  const nodeBoldControl = html.match(/<input id="support-font-bold"[^>]*>/)?.[0] || '';
  assert.ok(nodeBoldControl);
  assert.doesNotMatch(nodeBoldControl, /\bchecked\b/);
  assert.match(app, /"support-font-bold": false/);
  assert.match(contract, /nodes:\s*\{[^}]*bold:\s*false/);
  assert.match(css, /--support-font-weight:\s*400/);
});
test('Arial missing explicitly selects Arimo, reports fallback and reflows before export', () => {
  const app = read('app.js'), bridge = read('agent-bridge.js');
  assert.match(app, /if \(!await systemFontAvailabilityCache\.get\(family\)\) \{\s*applyArialFallback\(\)/);
  assert.match(app, /usesArialFont\(\$\(id\)\?\.value\)\) \$\(id\)\.value = FIGURE_FONT_FAMILIES\.arimo/);
  assert.match(app, /lastRenderedFigureFontKey !== fontKey\) await renderTreeCooperatively\(\(\) => \{\}, \{ fontReady: true \}\)/);
  assert.match(app, /data-font-fallback/);
  assert.match(read('index.html'), /id="figure-font-notice"[^>]*role="status"/);
  assert.match(bridge, /requested: "Arial", actual: "Arimo"/);
});
test('all workspace ordering controls default to smaller sister clades on top', () => {
  const html = read('index.html');
  for (const id of ['ladder-direction', 'cloud-ladder-direction', 'conflict-primary-ladder']) {
    const select = html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`))[1];
    const selected = [...select.matchAll(/<option\b[^>]*\bselected[^>]*>/g)];
    assert.equal(selected.length, 1, id);
    assert.match(selected[0][0], /value="small-top"/, id);
    assert.match(select, /value="file"/);
    assert.match(select, /value="large-top"/);
  }
});
test('cloud pie time range is collapsed, independent of Dating and display-only', () => {
  const app = read('app.js'), html = read('index.html');
  const details = html.match(/<details id="cloud-pie-age-range-section"[^>]*>/)[0];
  assert.match(details, /cloud-only/); assert.match(details, /data-settings-page="labels"/);
  assert.doesNotMatch(details, /\bopen\b/);
  for (const id of ['cloud-pie-age-minimum', 'cloud-pie-age-maximum', 'cloud-pie-age-range-reset']) assert.ok(html.includes(`id="${id}"`));
  const commit = app.slice(app.indexOf('function commitCloudPieAgeRangeInputs'), app.indexOf('function cloudPieOutsideTimeRange'));
  assert.match(commit, /state\.cloud\.pieAgeRange/);
  assert.doesNotMatch(commit, /dateCloudTrees|importCloudGenes|runAutomaticPhyParts|fetch\(/);
  assert.match(read('render/cloud-pies.js'), /data-hidden-reason/);
  assert.match(read('render/cloud-tree.js'), /cloudPieAgeRange = JSON\.stringify/);
});
test('cloud branch ordering is collapsed by default and only redraws the cloud workspace', () => {
  const html = read('index.html'), app = read('app.js');
  assert.match(html, /id="cloud-branch-order-section"[^>]*data-settings-page="tree"/);
  assert.doesNotMatch(html.match(/<details id="cloud-branch-order-section"[^>]*>/)[0], /\bopen\b/);
  assert.match(html, /id="cloud-ladder-direction"/);
  assert.match(app, /PhyloRenderCloud\.orderedTips\(species, \$\("cloud-ladder-direction"\)\.value\)/);
  const handler = app.slice(app.indexOf('$("cloud-ladder-direction").addEventListener'),
    app.indexOf('["cloud-root-age", "cloud-opacity"', app.indexOf('$("cloud-ladder-direction").addEventListener')));
  assert.match(handler, /renderCloudTree\(\)/);
  assert.doesNotMatch(handler, /dateCloudTrees|importCloudGenes|runAutomaticPhyParts|fetch\(/);
});
test('normal startup is empty; demonstration trees require an explicit opt-in; MCP stays independent', () => {
  const app = read('app.js');
  assert.match(app, /query\.get\("demo"\) === "1"/);
  assert.match(app, /await switchWorkspaceMode\(mode, \{ loadExample: false \}\)/);
  assert.match(read('index.html'), /data-demo-src="defaults\/cloud-workspace\.local\.js/);
  assert.doesNotMatch(read('index.html'), /<script src="defaults\//);
  const loader = app.slice(app.indexOf('async function loadDefaultCloudWorkspace()'), app.indexOf('function bindControls()'));
  assert.match(loader, /example\.phyPartsMeta\?\.algorithm !== PhyloRenderPhyParts\.ALGORITHM/);
  assert.ok(loader.indexOf('PHYPARTS_CACHE_VERSION_MISMATCH') < loader.indexOf('await switchWorkspaceMode("cloud")'));
  assert.match(loader, /await switchWorkspaceMode\("cloud"\)/);
  assert.match(app, /get\("phylorender-agent"\) === "1"/);
  assert.match(read('index.html'), /class="active" data-workspace-mode="cloud" role="tab" aria-selected="true"/);
  assert.match(read('.gitignore'), /defaults\/cloud-workspace\.local\.js/);
});
test('instrument theme loads after base styles and is included in MCP packaging', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('ui-shell.css') > html.indexOf('styles.css'));
  assert.ok(html.indexOf('ui-controls.css') > html.indexOf('ui-shell.css'));
  assert.match(html, /ui-controls\.css[^>]+data-phylorender-ui-only/);
  assert.match(read('mcp-server/Dockerfile'), /COPY index\.html styles\.css ui-shell\.css ui-controls\.css app\.js cloud-tree\.js conflict-tree\.js /);
});
test('header enables the conflict and cloud workspaces', () => {
  const html = read('index.html');
  assert.match(html, /class="workspace-mode-switch"/);
  assert.match(html, /data-workspace-mode="phylogeny"/);
  assert.match(html, /data-workspace-mode="time"/);
  assert.match(html, /data-workspace-mode="cloud"/);
  assert.doesNotMatch(html, /data-workspace-mode="cloud"[^>]*disabled/);
  assert.match(html, /id="cloud-species-file"/);
  assert.match(html, /id="cloud-genes-file"/);
  assert.match(html, /data-workspace-mode="conflict"/);
  assert.doesNotMatch(html, /data-workspace-mode="conflict"[^>]*disabled/);
  assert.match(html, /id="conflict-nuclear-file"/);
  assert.match(html, /id="conflict-plastid-file"/);
  assert.match(html, /id="conflict-sample-policy"/);
  assert.match(html, /<option value="" selected>Inspect differences and choose policy<\/option>/);
  assert.doesNotMatch(html, /<option value="intersection" selected>/);
  assert.match(html, /Re-confirm whenever either tree file is replaced/);
  assert.match(html, /id="conflict-support-field-section"[^>]*data-settings-page="labels"/);
  assert.match(html, /id="conflict-nuclear-support-field"/);
  assert.match(html, /id="conflict-plastid-support-field"/);
  assert.match(html, /Field 1 \(left\)/);
  assert.match(html, /Field 2 \(right\)/);
  const app = read('app.js');
  assert.doesNotMatch(app, /state\.workspaceMode\s*=\s*detectedTimeProfile\.valid/);
  assert.match(app, /divergence-time annotations were detected without auto-switching/);
  assert.match(app, /state\.conflict\.supportFieldSelections\[side\]/);
  assert.match(app, /side === "left" \? "nuclear" : side === "right" \? "plastid" : side/);
  const conflictSupport=read('render/conflict-support.js');
  assert.match(conflictSupport, /data-support-raw/);
  assert.match(conflictSupport, /conflictSupportCandidates[\s\S]*candidatePlacements/);
  assert.match(conflictSupport, /layoutConflictSupportSteps[\s\S]*leaderRouteForPlacement/);
  assert.match(conflictSupport, /layoutConflictSupportSteps[\s\S]*nodeLabelPlacementCost/);
  assert.match(read('core/label-geometry.js'), /leaderPlanPriority[\s\S]*leaderVisualCost/);
  assert.match(conflictSupport, /appendConflictSupportLayer[\s\S]*appendNodeLabelArrow/);
  const conflictRender = read('render/conflict-tree.js');
  assert.ok(conflictRender.indexOf('publishSize({ width, height })') >= 0);
  assert.ok(conflictRender.indexOf('publishSize({ width, height })')
    < conflictRender.indexOf('support.layoutSteps(supportEntries'),
  'conflict canvas bounds must be published before shared support candidate generation');
  assert.match(conflictRender, /\.\.\.left\.positions\.entries\(\)[\s\S]*\.\.\.right\.positions\.entries\(\)/);
  const cloudRender = read('render/cloud-tree.js'), cloudPies = read('render/cloud-pies.js');
  assert.match(cloudRender, /const anchors = yield\* model\.sharedRowAnchorsSteps\(root, sharedRows\);\s+const ys = yield\* yFor\(root, anchors\);\s+const geneColors = colorReference \? yield\* colorModel\.branchColorsSteps\(root, colorReference\) : null;\s+const paths = jitter \? yield\* jitterModel\.branchPathsSteps\(root, ages, ys, xOf,\s+\{ strength:jitter, limits:jitterLimits, rowStep, minimumY:treeTop, maximumY:plotBottom, index \}\) : null;\s+branches\.appendTriangularBranches\(root, ages, ys, geneGroup, xOf, null, geneColors, false, paths\)/);
  assert.match(cloudRender, /branches\.appendTriangularBranches\(species, speciesAge, speciesY, speciesGroup, xOf, speciesBranches, cladeColors\)/);
  assert.match(cloudRender, /branches\.appendRectangularBranches\(species, speciesAge, speciesY, speciesGroup, xOf, speciesBranches, cladeColors\)/);
  assert.match(html, /id="cloud-show-gene"/);
  assert.match(html, /id="cloud-show-species"/);
  assert.match(html, /id="cloud-show-pies"/);
  assert.match(html, /id="cloud-species-shape"/);
  assert.doesNotMatch(html, /id="cloud-pie-(scope|node)"/);
  assert.match(app, /function setCloudPieVisibility\(nodeId, visible\)/);
  assert.match(html, /id="cloud-pie-menu"/);
  assert.match(app, /openCloudPieMenu\(target\.dataset\.cloudPieToggle, event\.clientX, event\.clientY\)/);
  assert.match(cloudPies, /hiddenNodes\.has\(item\.row\.id\)/);
  assert.match(cloudPies, /appendHiddenNode\(pies, item\)/);
  assert.match(app, /function cloudFigureReady\(\)/);
  assert.match(app, /state\.workspaceMode === "cloud" \? cloudFigureReady\(\)/);
});
test('dating workspace removes every interactive reroot entry while ordinary trees keep it', () => {
  const html = read('index.html');
  const app = read('app.js');
  const css = read('styles.css');
  assert.match(html, /id="rooting-section"/);
  assert.match(app, /section\.hidden = fixedRoot/);
  assert.match(app, /rerootButton\.hidden = timeMode \|\| conflictMode \|\| cloudMode/);
  assert.match(app, /if \(!canRerootCurrentTree\(\)\)/);
  assert.match(app, /Time Tree workspace preserves the calibrated root from the input file/);
  assert.match(app, /Right-click: zoom into clade/);
  assert.match(app, /right-click a branch to inspect or reroot/);
  assert.match(css, /body\.time-tree-mode #rooting-section \{ display: none !important; \}/);
  assert.match(css, /\.branch-context-menu button\[hidden\] \{ display: none; \}/);
});
test('dating labels expose an age range that filters labels and dots while retaining HPD', () => {
  const html = read('index.html');
  const app = read('app.js');
  const css = read('styles.css');
  const timeRenderer = read('render/time-tree.js');
  assert.match(html, /id="time-age-range-section"[^>]*data-settings-page="labels"/);
  assert.match(html, /id="time-age-minimum"/);
  assert.match(html, /id="time-age-maximum"/);
  assert.match(html, /&ge;160 candidate nodes.*older 50% of nodes by default/);
  assert.match(html, /Filtering hides out-of-range age numerals and markers while preserving 95% HPD bars, branches, and time coordinates/);
  assert.match(app, /function timeAgeWithinActiveRange\(rawAge, range/);
  assert.match(app, /PhyloRenderContract\.datingLabelPlan/);
  assert.match(app, /automaticApplied/);
  assert.match(timeRenderer, /if \(options\.showHpd && node\.timeHpd/);
  assert.doesNotMatch(timeRenderer, /if \(ageInRange && options\.showHpd && node\.timeHpd/);
  assert.match(timeRenderer, /class: "node-dot time-node time-age-marker"/);
  assert.match(app, /state\.timeAgeRange = \{ minimumRaw: null, maximumRaw: null, explicit: false \}/);
  assert.match(css, /body\.time-tree-mode \.controls\[data-active-page="labels"\] > \.time-labels-only/);
  assert.match(css, /\.time-node, \.time-age-marker \{ fill: var\(--support-color\); \}/);
});
test('shell theme does not restyle scientific SVG contents or figure variables', () => {
  const css = read('ui-shell.css');
  assert.doesNotMatch(css, /(?:\.tip-label|\.branch\b|\.support-label|#tree-svg|--tip-|--support-|--branch-|--scale-|--clade-)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /focus-visible/);
});
test('future MCP compose uses canonical consolidated paths', () => {
  const compose = read('deploy/amd/compose.mcp.yml');
  assert.match(compose, /services\/phylorender\/mcp\/shared\/figures/);
  assert.match(compose, /services\/phylorender\/mcp\/shared\/mcp.env/);
});
