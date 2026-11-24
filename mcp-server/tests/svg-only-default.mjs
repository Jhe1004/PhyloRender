import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FigureStore } from "../src/store.mjs";

const outputRoot = await mkdtemp(path.join(os.tmpdir(), "phylorender-svg-only-default-"));
const renderCalls = [];
const renderer = {
  async render(spec, { formats = ["svg", "png", "preview", "panels"] } = {}) {
    renderCalls.push([...formats]);
    return {
      normalizedSpec: spec,
      report: {
        tips: 2,
        topology_unchanged: true,
        remaining_collisions: 0,
        safe_for_export: true,
        warnings: [],
        branches: [],
        output: { requested_dpi: 300, actual_png_scale: 3.125, effective_dpi: 300 },
      },
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
      ...(formats.includes("png") ? { png: Buffer.from("png") } : {}),
      ...(formats.includes("preview") ? { preview: Buffer.from("preview") } : {}),
      pngScale: 3.125,
      panelTrees: [],
    };
  },
};

try {
  const store = await new FigureStore(renderer, outputRoot).initialize();
  const figure = await store.create({
    main_tree: { name: "small.tre", content: "(A:1,B:1);" },
  });
  const revisionDirectory = path.join(outputRoot, figure.figureId, "revisions", "000001");

  assert.deepEqual(renderCalls, [["svg"]], "default MCP creation must request SVG only");
  await access(path.join(revisionDirectory, "figure.svg"));
  await assert.rejects(access(path.join(revisionDirectory, "figure.png")));
  await assert.rejects(access(path.join(revisionDirectory, "preview.png")));

  await store.ensureArtifacts(figure.figureId, figure.revision, ["png"]);
  assert.deepEqual(renderCalls.at(-1), ["svg", "png"], "PNG rasterization must require an explicit request");
  await access(path.join(revisionDirectory, "figure.png"));
  await assert.rejects(access(path.join(revisionDirectory, "preview.png")));

  await store.ensureArtifacts(figure.figureId, figure.revision, ["preview"]);
  assert.deepEqual(renderCalls.at(-1), ["svg", "preview"], "preview rasterization must also be explicit");
  await access(path.join(revisionDirectory, "preview.png"));

  console.log(JSON.stringify({ passed: true, renderCalls }, null, 2));
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
