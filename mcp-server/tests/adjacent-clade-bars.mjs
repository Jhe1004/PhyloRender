import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

const runtime = await createRuntime();
try {
  // Preserve the explicit horizontal-title contract; auto rotation is tested separately.
  const rendered = await runtime.renderer.render({
    main_tree: {
      name: "adjacent-clade-bars.tre",
      content: "((Alpha_longissima:1,Beta_longissima:1):1,(Gamma:1,Delta:1):1);",
    },
    clades: [
      { mrca_of: ["Alpha_longissima", "Beta_longissima"], name: "Long upper group name", color: "#0072b2", label_orientation: "horizontal" },
      { mrca_of: ["Gamma", "Delta"], name: "Lower group", color: "#d55e00", label_orientation: "horizontal" },
    ],
    options: {
      layout: { tip_spacing_em: 18 / 17 },
      typography: { clades: { size_pt: 20 } },
    },
  });
  const groups = rendered.report.clade_bar_spacing.groups;
  assert.equal(groups.length, 2);
  assert.equal(rendered.report.clade_bar_spacing.valid, true);
  assert.equal(rendered.report.remaining_collisions, 0);
  assert.equal(rendered.report.topology_unchanged, true);
  assert.equal(rendered.report.safe_for_export, true);
  assert.ok(groups.every(group => group.layout_shift < 1), `adjacent groups should not be forced sideways: ${JSON.stringify(groups)}`);
  assert.ok(groups.every(group => group.actual_gap <= 20), `group bars should stay next to their tip names: ${JSON.stringify(groups)}`);
  const nearbyTitles = await runtime.renderer.render({
    main_tree: { name: "nearby-clade-titles.tre", content: "((Alpha:1,Beta:1):1,Gamma:1);" },
    clades: [
      { mrca_of: ["Alpha"], name: "Upper single sample", color: "#0072b2", label_orientation: "horizontal" },
      { mrca_of: ["Beta"], name: "Lower single sample", color: "#d55e00", label_orientation: "horizontal" },
    ],
    // Pin compact rows so the fixture genuinely overlaps under portrait defaults.
    options: { layout: { tip_spacing_em: 18 / 17 }, typography: { clades: { size_pt: 20 } } },
  });
  const narrowGroups = nearbyTitles.report.clade_bar_spacing.groups;
  assert.equal(narrowGroups.length, 2);
  assert.ok(narrowGroups.some(group => group.layout_shift > 0),
    `genuinely overlapping single-tip titles should still be separated: ${JSON.stringify(narrowGroups)}`);
  assert.equal(nearbyTitles.report.clade_bar_spacing.valid, true);
  assert.equal(nearbyTitles.report.safe_for_export, true);
  console.log(JSON.stringify({ passed: true, adjacent_groups: groups, nearby_titles: narrowGroups }));
} finally {
  await runtime.close();
}
