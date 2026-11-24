const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../figure-contract.js');
const units = require('../figure-units.js');
const datingLabels = require('../core/dating-label-policy.js');

test('HTTP health and MCP initialization share the package version', async () => {
  const {VERSION} = await import('../mcp-server/src/version.mjs');
  assert.equal(VERSION,require('../mcp-server/package.json').version);
  const fs = require('node:fs');
  for (const file of ['http.mjs','mcp.mjs']) {
    assert.match(fs.readFileSync(require('node:path').join(__dirname,'../mcp-server/src',file),'utf8'),/version: VERSION/);
  }
});

test('mode defaults match web type sizes, grouping and spacing', () => {
  assert.deepEqual(contract.cladeBarAlignment, { defaultValue: 'auto', values: ['auto', 'nearby', 'aligned'] });
  assert.equal(Object.isFrozen(contract.cladeBarAlignment), true);
  for (const workspace of contract.workspaces) {
    const defaults = contract.defaults(workspace);
    const dated = ['time', 'cloud'].includes(workspace);
    assert.equal(defaults.typography.tips.size_u, units.ptToDrawing(dated ? 18 : 15));
    assert.equal(defaults.typography.clades?.size_u, workspace === 'conflict' ? undefined : defaults.typography.tips.size_u + 3);
    assert.equal(defaults.typography.clades?.follow_tip_size, workspace === 'conflict' ? undefined : true);
    assert.equal(defaults.typography.nodes?.bold, workspace === 'cloud' ? undefined : false);
    assert.equal(defaults.layout.clade_bar_alignment, workspace === 'conflict' ? undefined : 'auto');
    assert.equal(defaults.layout.automatic_tip_spacing, true);
    assert.equal(defaults.layout.ladderize, 'small-top');
  }
});

test('new cloud figures prefer the lower-left pie key while explicit old positions round-trip', async () => {
  assert.equal(contract.defaults('cloud').cloud.pie_legend_position, 'lower-left');
  assert.equal(contract.capabilities.cloud.pie_legend_default_position, 'lower-left');
  const {FigureStore} = await import('../mcp-server/src/store.mjs');
  const store = new FigureStore({});
  const fixture = {workspace:'cloud', main_tree:{content:'(O:3,((A:1,B:1):1,C:2):1);'},
    options:{cloud:{species_method:'dated',dated_unit:'mya',show_gene:false}}};
  assert.equal(store.validatedSpec(fixture).options.cloud.pie_legend_position, 'lower-left');
  for (const position of ['auto','upper-left','middle-left','lower-left']) {
    const spec = store.validatedSpec({...fixture,options:{cloud:{...fixture.options.cloud,pie_legend_position:position}}});
    assert.equal(store.validatedSpec(spec).options.cloud.pie_legend_position, position);
  }
});

test('automatic group names stay exactly 3 drawing units above tips; explicit sizes win', () => {
  const ordinary = contract.defaults('phylogeny');
  for (const tip of [units.designToDrawing(8), 13.236267372600926, units.designToDrawing(30)]) {
    const options = contract.merge(ordinary, contract.physicalOptions({typography:{tips:{size_u:tip}}}));
    const resolved = contract.resolveCladeTypography(options);
    assert.equal(resolved.typography.clades.size_u,tip+3);
    assert.equal(resolved.typography.clades.follow_tip_size,true);
    assert.notEqual(options,resolved);
  }
  for (const explicit of [{size_u:11},{size_pt:12},{size:16}]) {
    const patch=contract.physicalOptions({typography:{clades:explicit}});
    assert.equal(patch.typography.clades.follow_tip_size,false);
    const result=contract.resolveCladeTypography(contract.merge(ordinary,patch));
    assert.equal(result.typography.clades.size_u,patch.typography.clades.size_u);
  }
  const restored=contract.resolveCladeTypography(contract.merge(ordinary,contract.physicalOptions({
    typography:{tips:{size_u:18},clades:{follow_tip_size:true,size_u:8}}})));
  assert.equal(restored.typography.clades.size_u,21);
  assert.equal(contract.defaults('conflict').typography.clades,undefined);
});

test('MCP storage and semantic edits preserve automatic or fixed group sizing', async () => {
  const {FigureStore}=await import('../mcp-server/src/store.mjs');
  const {applyEditOperations}=await import('../mcp-server/src/edits.mjs');
  const store=new FigureStore({}),fixture={main_tree:{content:'((A:1,B:1):1,(C:1,D:1):1);'}};
  let spec=store.validatedSpec(fixture);
  assert.equal(spec.options.typography.clades.follow_tip_size,true);
  spec=store.validatedSpec(applyEditOperations(spec,[{op:'set_options',options:{typography:{tips:{size_u:19.5}}}}]).spec);
  assert.equal(spec.options.typography.clades.size_u,22.5);
  assert.equal(spec.options.typography.clades.follow_tip_size,true);
  spec=store.validatedSpec(applyEditOperations(spec,[{op:'set_options',options:{typography:{clades:{size_u:11}}}}]).spec);
  assert.equal(spec.options.typography.clades.follow_tip_size,false);
  spec=store.validatedSpec(applyEditOperations(spec,[{op:'set_options',options:{typography:{tips:{size_u:16}}}}]).spec);
  assert.equal(spec.options.typography.clades.size_u,11);
  spec=store.validatedSpec(applyEditOperations(spec,[{op:'set_options',options:{typography:{clades:{follow_tip_size:true}}}}]).spec);
  assert.equal(spec.options.typography.clades.size_u,19);
  const maximum=store.validatedSpec({...fixture,options:{typography:{tips:{size_u:units.designToDrawing(30)}}}});
  assert.equal(maximum.options.typography.clades.size_u,units.designToDrawing(30)+3);
});

test('single-tree workspaces use 400 mm while the double-tree workspace uses 800 mm', () => {
  assert.deepEqual(contract.outputGeometry, {
    absoluteMaximumWidthMm: 800,
    maximumWidthMmByWorkspace: {
      phylogeny: 400,
      time: 400,
      cloud: 400,
      conflict: 800,
    },
    minimumTreeSpanPx: 160,
    interpretation: 'Phylogeny, Dating and cloud workspaces keep the exported canvas at or below 400 mm; the double-tree conflict workspace uses an 800 mm ceiling. When content approaches its workspace ceiling, horizontal tree geometry is compressed before readable text is changed.',
  });
  assert.deepEqual(contract.capabilities.output_geometry, contract.outputGeometry);
  assert.deepEqual(contract.workspaces.map(workspace => contract.maximumOutputWidthMm(workspace)), [400, 400, 400, 800]);
  assert.equal(contract.maximumOutputWidthMm('unknown'), 400);
  for (const workspace of contract.workspaces) assert.equal(contract.defaults(workspace).output.width_mm, 0);
});

test('dense Dating trees default to the older half while explicit full labels get an extended deadline', async () => {
  const policy = contract.datingLabelDensity;
  assert.deepEqual(policy, {
    minimumCandidateLabels: 160,
    defaultOlderFraction: 0.5,
    fullRenderDeadlineSeconds: 1800,
  });
  assert.deepEqual(contract.datingLabelPlan({ candidateLabels: 159, rootAge: 100 }), {
    candidateLabels: 159,
    dense: false,
    threshold: 160,
    defaultOlderFraction: 0.5,
    automaticApplied: false,
    explicit: false,
    effectiveRange: { minimumRaw: null, maximumRaw: null },
  });
  assert.deepEqual(contract.datingLabelPlan({ candidateLabels: 160, rootAge: 100 }), {
    candidateLabels: 160,
    dense: true,
    threshold: 160,
    defaultOlderFraction: 0.5,
    automaticApplied: true,
    explicit: false,
    effectiveRange: { minimumRaw: 50, maximumRaw: null },
  });
  assert.deepEqual(contract.datingLabelPlan({ candidateLabels: 260, rootAge: 100,
    range: { minimumRaw: 0, maximumRaw: null, explicit: true } }).effectiveRange,
    { minimumRaw: 0, maximumRaw: null });
  const { renderTimeoutMsForSpec } = await import('../mcp-server/src/store.mjs');
  assert.equal(renderTimeoutMsForSpec({ workspace: 'time', options: { time: {} } }), 600_000);
  assert.equal(renderTimeoutMsForSpec({ workspace: 'time', options: { time: { age_minimum: 50 } } }), 600_000);
  assert.equal(renderTimeoutMsForSpec({ workspace: 'time', options: { time: { age_minimum: 0 } } }), 1_800_000);
  assert.equal(renderTimeoutMsForSpec({ workspace: 'phylogeny', options: { time: { age_minimum: 0 } } }), 600_000);
});

test('dense Dating report counts suppressed labels without altering source ages', () => {
  const ages = Array.from({ length: 160 }, (_, index) => 100 - (100 * index / 159));
  const before = [...ages];
  const result = datingLabels.summary({ ages, rootAge: 100,
    range: { minimumRaw: null, maximumRaw: null, explicit: false } }, contract);
  assert.equal(result.report.selection, 'automatic_older_half');
  assert.equal(result.report.visible_nodes, 80);
  assert.equal(result.report.hidden_nodes, 80);
  assert.deepEqual(ages, before);
  assert.match(result.warning, /HPD bars, branch lengths, and time coordinates remain unchanged/);
});

test('unit aliases normalize before defaults without modifying input', () => {
  const input = {typography:{tips:{size:12}}, output:{png_scale:2}};
  assert.deepEqual(contract.physicalOptions(input), {typography:{tips:{size_u:units.ptToDrawing(9)}},output:{dpi:192}});
  assert.equal(input.typography.tips.size,12);
  assert.equal(contract.merge(contract.defaults(),contract.physicalOptions(input)).typography.tips.size_u,units.ptToDrawing(9));
});

test('advanced schemas reject irrelevant options, rerooting and incomplete inputs', async () => {
  const {figureSpecSchema} = await import('../mcp-server/src/schemas.mjs');
  const main_tree = {content:'(A:1,B:1);'};
  assert.equal(figureSpecSchema.safeParse({workspace:'conflict',main_tree}).success,false);
  assert.equal(figureSpecSchema.safeParse({workspace:'time',main_tree,rooting:{outgroup:['A']}}).success,false);
  assert.equal(figureSpecSchema.safeParse({workspace:'cloud',main_tree,rooting:{outgroup:['A']}}).success,false);
  assert.equal(figureSpecSchema.safeParse({main_tree,options:{cloud:{show_gene:false}}}).success,false);
  assert.equal(figureSpecSchema.safeParse({workspace:'cloud',main_tree,options:{cloud:{show_gene:false,pie_age_minimum:20,pie_age_maximum:10}}}).success,false);
  assert.equal(figureSpecSchema.safeParse({workspace:'cloud',main_tree,options:{cloud:{show_gene:false,pie_mode:'four',pie_legend_scale:150,root_age:10}}}).success,true);
});

test('workspace option policy rejects no-op controls and canonicalizes legacy ordering aliases', async () => {
  assert.equal(contract.optionSupported('cloud','layout.branch_width_pt'),true);
  assert.equal(contract.optionSupported('cloud','layout.mode'),false);
  assert.equal(contract.optionSupported('conflict','layout.horizontal_scale'),false);
  assert.equal(contract.optionSupported('time','support.decimals'),false);
  assert.equal(contract.defaults('cloud').layout.mode,undefined);
  assert.equal(contract.defaults('conflict').layout.horizontal_scale,undefined);
  assert.deepEqual(contract.normalizeWorkspaceOptions('cloud',{cloud:{ladderize:'large-top'}}),
    {layout:{ladderize:'large-top'}});
  assert.deepEqual(contract.normalizeWorkspaceOptions('conflict',{conflict:{primary_ladder:'file',primary_order:['B','A']}}),
    {layout:{ladderize:'file',tip_order:['B','A']}});
  assert.throws(()=>contract.normalizeWorkspaceOptions('cloud',{
    layout:{ladderize:'file'},cloud:{ladderize:'large-top'}}),/conflict/i);

  const {figureSpecSchema} = await import('../mcp-server/src/schemas.mjs');
  const tree={content:'(A:1,B:1);'}, cloud={workspace:'cloud',main_tree:tree,options:{cloud:{species_method:'other',show_gene:false}}};
  assert.equal(figureSpecSchema.safeParse({...cloud,options:{...cloud.options,layout:{mode:'aligned'}}}).success,false);
  assert.equal(figureSpecSchema.safeParse({...cloud,options:{...cloud.options,layout:{branch_width_pt:1.2,ladderize:'large-top'}}}).success,true);
  assert.equal(figureSpecSchema.safeParse({workspace:'time',main_tree:tree,options:{support:{decimals:1}}}).success,false);
  assert.equal(figureSpecSchema.safeParse({workspace:'conflict',main_tree:tree,comparison_tree:tree,
    options:{layout:{horizontal_scale:150}}}).success,false);
  assert.equal(figureSpecSchema.safeParse({workspace:'conflict',main_tree:tree,comparison_tree:tree,
    options:{layout:{ladderize:'large-top'}}}).success,true);
});

test('physical-width schema applies the workspace-specific ceiling', async () => {
  const {figureSpecSchema} = await import('../mcp-server/src/schemas.mjs');
  const tree = {content:'(A:1,B:1);'};
  for (const workspace of ['phylogeny', 'time', 'cloud']) {
    const options = {output:{width_mm:401}, ...(workspace === 'cloud' ? {cloud:{species_method:'other',show_gene:false}} : {})};
    assert.equal(figureSpecSchema.safeParse({workspace,main_tree:tree,options}).success,false, workspace);
  }
  assert.equal(figureSpecSchema.safeParse({workspace:'conflict',main_tree:tree,comparison_tree:tree,
    options:{output:{width_mm:800}}}).success,true);
  assert.equal(figureSpecSchema.safeParse({workspace:'conflict',main_tree:tree,comparison_tree:tree,
    options:{output:{width_mm:801}}}).success,false);
});

test('public figure specs redact every raw multi-tree input', async () => {
  const {publicRequestSpec} = await import('../mcp-server/src/store.mjs');
  const tree = {name:'private.tre',content:'(Secret_A:1,Secret_B:1);'};
  const result = publicRequestSpec({main_tree:tree,comparison_tree:tree,gene_trees:tree,phyparts_table:tree});
  assert.ok(!JSON.stringify(result).includes('Secret_A'));
  for (const field of ['main_tree','comparison_tree','gene_trees','phyparts_table']) {
    assert.equal(result[field].content,undefined);
    assert.equal(result[field].sha256.length,64);
  }
});

test('cloud opacity and pie size defaults live in the shared contract', () => {
  assert.deepEqual(contract.cloudOpacity, { defaultValue: 18, minimum: 2, maximum: 60, step: 1 });
  assert.deepEqual(contract.cloudPies, { defaultRadiusPx: 32, minimumRadiusPx: 8, maximumRadiusPx: 54, youngestRatio: 0.55 });
  const cloudDefaults = contract.defaults('cloud');
  assert.equal(cloudDefaults.cloud.opacity, 18);
  assert.ok(Math.abs(cloudDefaults.cloud.pie_radius_u - units.designToDrawing(32)) < 1e-9);
});
