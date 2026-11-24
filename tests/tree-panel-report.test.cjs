const test=require('node:test'),assert=require('node:assert/strict');
const report=require('../core/tree-panel-report.js');
test('a panel plan cannot claim measured layout or fonts',()=>{
 const counts=Object.freeze([173,58]);
 const result=report.planned({tipCounts:counts,maximumPanels:2,rooted:true});
 assert.equal(result.panels,2);assert.equal(result.second_panel_tip_count,58);
 assert.equal(result.rooting_applied_before_split,true);assert.equal(result.generated,false);
 assert.equal(result.measurement_status,'not_requested');assert.equal(result.readable,undefined);
 assert.equal(result.configured_font_sizes_preserved,undefined);assert.deepEqual(counts,[173,58]);
});
test('measured panel reporting preserves exact values and independent arrays',()=>{
 const pages=Object.freeze([Object.freeze({width:1000,source_width:900,original_tip_count:173}),Object.freeze({width:1000,source_width:800,original_tip_count:58})]);
 const input={uniformPages:pages,minimumTipPoints:13.24,minimumNodePoints:9.333333,maximumPanels:2,rooted:true};
 const first=report.rendered(input),second=report.rendered(input);
 assert.equal(first.generated,true);assert.equal(first.readable,true);assert.equal(first.minimum_node_points,9.333333);
 assert.equal(first.minimum_tip_points,13.24);assert.equal(first.panel_width,1000);assert.deepEqual(first.source_panel_widths,[900,800]);
 assert.equal(first.configured_font_sizes_preserved,true);assert.equal(first.split_strategy,report.planned({tipCounts:[173,58],maximumPanels:2}).split_strategy);
 first.rendering_profile.preserved.push('test-only');assert.ok(!second.rendering_profile.preserved.includes('test-only'));
});
