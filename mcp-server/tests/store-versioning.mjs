import units from "../../figure-units.js";
const equalU=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message || `${actual} != ${expected}`);
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FigureStore } from "../src/store.mjs";
import { applyEditOperations } from "../src/edits.mjs";

const editFixture = {
  main_tree: { name: "names.tre", content: "((A:1,B:1):1,(C:1,D:1):1);" },
  support_trees: [], other_data_trees: [], options: {}, clades: [], label_adjustments: [], tip_label_overrides: {},
};
const mergedLabels = applyEditOperations(editFixture, [
  { op: "set_tip_label", original_name: "A", display_name: "Alpha" },
  { op: "merge_tip_labels", tip_label_overrides: { B: "Beta", C: "Gamma" } },
]).spec;
assert.deepEqual(mergedLabels.tip_label_overrides, { A: "Alpha", B: "Beta", C: "Gamma" });
const removedLabels = applyEditOperations(mergedLabels, [
  { op: "remove_tip_label", original_name: "B" },
  { op: "replace_tip_labels", tip_label_overrides: { D: "Delta" } },
]).spec;
assert.deepEqual(removedLabels.tip_label_overrides, { D: "Delta" });
assert.deepEqual(applyEditOperations(removedLabels, [{ op: "clear_tip_labels" }]).spec.tip_label_overrides, {});

const richCladeFixture = {
  ...editFixture,
  clades: [{
    clade_id: "clade:rich",
    mrca_of: ["A", "B"],
    name: "Alpha beta",
    name_segments: [{ text: "Alpha ", italic: true }, { text: "beta", bold: true }],
  }],
};
const plainRenamedClade = applyEditOperations(richCladeFixture, [{
  op: "update_clade",
  clade_id: "clade:rich",
  patch: { name: "Gamma" },
}]).spec.clades[0];
assert.equal(plainRenamedClade.name, "Gamma");
assert.equal(plainRenamedClade.name_segments, undefined, "renaming plain text must clear stale segment text");
const segmentsOnlyClade = applyEditOperations(richCladeFixture, [{
  op: "update_clade",
  clade_id: "clade:rich",
  patch: { name_segments: [{ text: "Delta ", italic: true }, { text: "group", bold: true }] },
}]).spec.clades[0];
assert.equal(segmentsOnlyClade.name, "Delta group", "segment-only edits must synchronize the plain name");

const outputRoot = await mkdtemp(path.join(os.tmpdir(), "phylorender-store-versioning-"));
const renderer = {
  async render(spec) {
    if (Math.abs(spec.options?.layout?.branch_width_u - units.designToDrawing(3.9)) < 1e-8) throw new Error("Synthetic renderer failure");
    return {
      normalizedSpec: spec,
      report: {
        tips: 4,
        topology_unchanged: true,
        remaining_collisions: 0,
        safe_for_export: true,
        warnings: [],
        branches: [],
      },
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
      png: Buffer.from("png"),
      preview: Buffer.from("preview"),
      pngScale: 1,
    };
  },
};

try {
  const store = await new FigureStore(renderer, outputRoot).initialize();
  assert.equal(store.validatedSpec(editFixture).options.layout.ladderize, 'small-top');
  assert.equal(store.validatedSpec({ ...editFixture, options: { layout: { ladderize: 'file' } } }).options.layout.ladderize, 'file');
  assert.equal(store.validatedSpec({ ...editFixture, options: { layout: { ladderize: 'large-top' } } }).options.layout.ladderize, 'large-top');
  const created = await store.create({
    main_tree: { name: "small.tre", content: "((A:1,B:1)0.9:1,(C:1,D:1)0.8:1);" },
    support_trees: [],
    other_data_trees: [],
    rooting: { outgroup: ["A"] },
    options: { layout: { branch_width: 1.2 } },
    clades: [{ mrca_of: ["A", "B"], name: "AB" }],
  });
  assert.equal(created.revision, 1);
  assert.match(created.spec.requested.clades[0].clade_id, /^clade:/);

  const competing = await Promise.allSettled([
    store.edit(created.figureId, [{ op: "set_options", options: { layout: { branch_width: 1.5 } } }], {
      expectedRevision: 1,
      changeNote: "Agent A edit",
    }),
    store.edit(created.figureId, [{ op: "set_options", options: { layout: { branch_width: 1.7 } } }], {
      expectedRevision: 1,
      changeNote: "Agent B edit",
    }),
  ]);
  assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter(result => result.status === "rejected").length, 1);
  assert.match(competing.find(result => result.status === "rejected").reason.message, /Revision conflict/);

  let history = await store.listRevisions(created.figureId);
  assert.equal(history.current_revision, 2);
  assert.deepEqual(history.revisions.map(item => item.revision), [1, 2]);

  await assert.rejects(
    store.edit(created.figureId, [{ op: "set_options", options: { layout: { branch_width: 3.9 } } }], {
      expectedRevision: 2,
    }),
    /Synthetic renderer failure/,
  );
  history = await store.listRevisions(created.figureId);
  assert.equal(history.current_revision, 2);
  assert.deepEqual(history.revisions.map(item => item.revision), [1, 2]);
  const revisionDirectoriesAfterFailure = await readdir(path.join(outputRoot, created.figureId, "revisions"));
  assert.deepEqual(revisionDirectoriesAfterFailure.sort(), ["000001", "000002"]);

  const restored = await store.restore(created.figureId, 1, {
    expectedRevision: 2,
    changeNote: "Undo concurrent winner",
  });
  assert.equal(restored.revision, 3);
  equalU(restored.spec.requested.options.layout.branch_width_u, units.designToDrawing(1.2));
  history = await store.listRevisions(created.figureId);
  assert.deepEqual(history.revisions.map(item => item.revision), [1, 2, 3]);
  assert.equal(history.revisions[2].action, "restore");

  console.log(JSON.stringify({
    oneConcurrentEditCommitted: true,
    oneStaleEditRejected: true,
    failedRenderRolledBack: true,
    immutableRevisions: history.revisions.length,
  }, null, 2));
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
