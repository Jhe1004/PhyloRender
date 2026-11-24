import assert from "node:assert/strict";
import { createRuntime } from "../src/runtime.mjs";

const cases = [
  ["Oreithales integrifolia", ["Oreithales", "integrifolia"]],
  ["Oreithales cf. integrifolia", ["Oreithales", "integrifolia"]],
  ["Oreithales sp.", ["Oreithales"]],
  ["Ranunculales", []],
  ["Aconitum jaluense subsp. jaluense", ["Aconitum", "jaluense", "jaluense"]],
];

const runtime = await createRuntime();
try {
  const page = await runtime.renderer.browser.newPage();
  await page.goto(runtime.demoPageUrl);
  await page.waitForFunction(() => globalThis.PhyloRenderNameStyling);
  const segments = await page.evaluate(labels => labels.map(label => ({
    label,
    italic: globalThis.PhyloRenderNameStyling.segmentsFromAnalysis(label)
      .filter(segment => segment.italic)
      .map(segment => segment.text),
  })), cases.map(([label]) => label));
  await page.close();
  for (const [label, expected] of cases) {
    assert.deepEqual(
      segments.find(item => item.label === label)?.italic,
      expected,
      `scientific-name segments for ${label}`,
    );
  }

  const rendered = await runtime.renderer.render({
    main_tree: {
      name: "taxon-italic-regression.tre",
      content: "((Oreithales_integrifolia:1,Oreithales_cf._integrifolia:1):1,(Ranunculales:1,Aconitum_jaluense_subsp.jaluense:1):1);",
    },
  });
  assert.equal(rendered.report.topology_unchanged, true);
  assert.equal(rendered.report.safe_for_export, true);
  function italicSegments(label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tag = rendered.svg.match(new RegExp(`<text\\b[^>]*data-display-tip-label="${escaped}"[^>]*>`))?.[0];
    assert.ok(tag, `exported SVG includes ${label}`);
    return tag.match(/data-italic-segments="([^"]*)"/)?.[1] ?? null;
  }
  assert.equal(italicSegments("Oreithales integrifolia"), "Oreithales|integrifolia");
  assert.equal(italicSegments("Ranunculales"), "");
  assert.equal(italicSegments("Aconitum jaluense subsp. jaluense"), "Aconitum|jaluense|jaluense");
  console.log(JSON.stringify({ passed: true, cases: segments, svg: "verified" }));
} finally {
  await runtime.close();
}
