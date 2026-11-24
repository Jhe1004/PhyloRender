import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = path.resolve(import.meta.dirname, "../..");

test("core/bridge-helpers extracts raw labels and resolves normalized overrides without ambiguity", async () => {
  const helpersUrl = pathToFileURL(path.join(rootDir, "core/bridge-helpers.js")).href;
  const helpers = (await import(helpersUrl)).default;
  const identity = (await import(pathToFileURL(path.join(rootDir, "core/sample-identity.js")).href)).default;
  const tree = {
    id: "r", label: "", length: 0,
    children: [
      { id: "t1", label: "Sample_A_1", length: 1, children: [] },
      { id: "t2", label: "O'Brien b", length: 1, children: [] },
    ],
  };
  assert.deepEqual(helpers.rawDescendantTipLabels(tree), ["Sample_A_1", "O'Brien b"]);

  const resolved = helpers.resolveTipLabelOverrides(
    { "sample a 1": "Display A1" },
    ["Sample_A_1", "O'Brien b"],
    "conflict",
    identity,
  );
  assert.deepEqual(resolved, { Sample_A_1: "Display A1" });

  assert.throws(
    () => helpers.resolveTipLabelOverrides(
      { Sample_A_1: "One", "sample a 1": "Two" },
      ["Sample_A_1", "O'Brien b"],
      "conflict",
      identity,
    ),
    err => err.code === "INVALID_TIP_OVERRIDE",
  );
  assert.throws(
    () => helpers.resolveTipLabelOverrides(
      { Unknown_Tip: "X" },
      ["Sample_A_1", "O'Brien b"],
      "conflict",
      identity,
    ),
    err => err.code === "INVALID_TIP_OVERRIDE",
  );
});

test("edits.mjs cleans legacy spacing fields, supports sample_groups and cloud pie ops, and sets error codes", async () => {
  const { applyEditOperations } = await import("../src/edits.mjs");

  const base = {
    workspace: "phylogeny",
    main_tree: { name: "a.nwk", content: "(A:1,B:1);" },
    options: { layout: { tip_spacing: 24, tip_spacing_u: 18 } },
    tip_label_overrides: {},
    clades: [],
    support_trees: [],
    other_data_trees: [],
    label_adjustments: [],
  };
  const spaced = applyEditOperations(base, [
    { op: "set_options", options: { layout: { tip_spacing_em: 1.5 } } },
  ]);
  assert.equal(spaced.spec.options.layout.tip_spacing_em, 1.5);
  assert.equal(spaced.spec.options.layout.tip_spacing, undefined);
  assert.equal(spaced.spec.options.layout.tip_spacing_u, undefined);

  assert.throws(
    () => applyEditOperations(base, [{ op: "remove_tip_label", original_name: "Missing" }]),
    err => err.code === "TIP_OVERRIDE_NOT_FOUND",
  );

  const conflictSpec = {
    workspace: "conflict",
    main_tree: { name: "l.nwk", content: "(A:1,B:1);" },
    comparison_tree: { name: "r.nwk", content: "(A:1,B:1);" },
    options: {},
  };
  const grouped = applyEditOperations(conflictSpec, [
    { op: "set_sample_groups", sample_groups: [{ name: "G1", color: "#0072B2", samples: ["A"] }] },
  ]);
  assert.equal(grouped.spec.sample_groups.length, 1);
  const cleared = applyEditOperations(grouped.spec, [{ op: "clear_sample_groups" }]);
  assert.equal(cleared.spec.sample_groups, undefined);

  const cloudSpec = {
    workspace: "cloud",
    main_tree: { name: "sp.nwk", content: "(A:1,(B:0.5,C:0.5):0.5);" },
    gene_trees: { name: "g.trees", content: "(A:1,(B:0.5,C:0.5):0.5);" },
    options: { cloud: { root_age: 10 } },
  };
  const hidden = applyEditOperations(cloudSpec, [{ op: "hide_cloud_pie", samples: ["B", "C"] }]);
  assert.deepEqual(hidden.spec.options.cloud.hidden_pies, [["B", "C"]]);
  const shown = applyEditOperations(hidden.spec, [{ op: "show_cloud_pie", samples: ["C", "B"] }]);
  assert.deepEqual(shown.spec.options.cloud.hidden_pies, []);
  const hiddenAgain = applyEditOperations(cloudSpec, [{ op: "hide_cloud_pie", samples: ["B", "C"] }]);
  const reset = applyEditOperations(hiddenAgain.spec, [{ op: "reset_hidden_cloud_pies" }]);
  assert.deepEqual(reset.spec.options.cloud.hidden_pies, []);
});

test("FigureStore returns FIGURE_NOT_FOUND on missing id and strips stale workspace fields on workspace switch", async () => {
  const { FigureStore } = await import("../src/store.mjs");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "phylorender-store-audit-"));
  try {
    const fakeRenderer = {
      async render(spec) {
        return {
          svg: "<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='500'></svg>",
          report: { topology_unchanged: true, warnings: [] },
          normalizedSpec: spec,
          pngScale: 1,
          panelTrees: [],
        };
      },
    };
    const store = await new FigureStore(fakeRenderer, tempRoot).initialize();
    await assert.rejects(
      store.describe("00000000-0000-4000-8000-000000000000"),
      err => err.code === "FIGURE_NOT_FOUND" && err.retryable === false,
    );

    const created = await store.create({
      workspace: "conflict",
      main_tree: { name: "l.nwk", content: "(A:1,B:1);" },
      comparison_tree: { name: "r.nwk", content: "(A:1,B:1);" },
      sample_groups: [{ name: "G", color: "#0072B2", samples: ["A"] }],
      options: { conflict: { primary_title: "Left" } },
    });
    const updated = await store.update(created.figureId, {
      workspace: "phylogeny",
      main_tree: { name: "a.nwk", content: "(A:1,B:1);" },
    }, { expectedRevision: created.revision });
    assert.equal(updated.spec.requested.workspace, "phylogeny");
    assert.equal(updated.spec.requested.comparison_tree, undefined);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("compare_tree_samples supports policy selection and ZodError toolFailure surfaces exact field path", async () => {
  const { createPhyloRenderMcpServer } = await import("../src/mcp.mjs");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

  const renderer = {
    pageUrl: "http://127.0.0.1:0/",
    async inspect(tree) {
      const labels = [...tree.content.matchAll(/([A-Za-z0-9_' ]+):/g)].map(m => m[1]);
      return { tip_labels: labels };
    },
  };
  const store = {
    async create() {
      const { figureSpecSchema } = await import("../src/schemas.mjs");
      figureSpecSchema.parse({ workspace: "cloud", main_tree: { content: "(A:1,B:1);" } });
    },
    async update() {
      const { figureSpecSchema } = await import("../src/schemas.mjs");
      figureSpecSchema.parse({ workspace: "cloud", main_tree: { content: "(A:1,B:1);" } });
    },
  };
  const server = createPhyloRenderMcpServer({ renderer, store });
  const client = new Client({ name: "audit-client", version: "1.0.0" });
  const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(sTransport), client.connect(cTransport)]);

  const auxCompare = await client.callTool({
    name: "compare_tree_samples",
    arguments: {
      main_tree: { content: "(Outgroup_RefA:1,B:1);" },
      comparison_tree: { content: "(RefA:1,B:1);" },
      policy: "auxiliary",
    },
  });
  assert.equal(auxCompare.isError, undefined);
  assert.equal(auxCompare.structuredContent.matching_policy, "auxiliary");
  assert.equal(auxCompare.structuredContent.status, "identical");

  const badCloud = await client.callTool({
    name: "create_figure",
    arguments: { workspace: "cloud", main_tree: { content: "(A:1,B:1);" } },
  });
  assert.equal(badCloud.isError, true);
  assert.match(badCloud.content?.[0]?.text || "", /options\.cloud\.root_age/);

  const badPatch = await client.callTool({
    name: "update_figure",
    arguments: {
      figure_id: "00000000-0000-4000-8000-000000000000",
      base_revision: 1,
      patch: { workspace: "cloud" },
    },
  });
  assert.equal(badPatch.isError, true);
  assert.equal(badPatch.structuredContent.error.code, "INVALID_ARGUMENT");
  assert.equal(badPatch.structuredContent.error.field, "options.cloud.root_age");

  await client.close();
  await server.close();
});

test("http.mjs and runtime.mjs enforce raised concurrency, 1860s timeout, and retryable deadline errors", async () => {
  const httpSrc = await readFile(path.join(rootDir, "mcp-server/src/http.mjs"), "utf8");
  const runtimeSrc = await readFile(path.join(rootDir, "mcp-server/src/runtime.mjs"), "utf8");
  assert.match(httpSrc, /admitted\s*>=\s*8/);
  assert.match(httpSrc, /1_860_000/);
  assert.match(runtimeSrc, /DEADLINE_EXCEEDED",\s*retryable:\s*true/);
});
