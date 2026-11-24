import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applyEditOperations, deepMerge, ensureSemanticIds } from "./edits.mjs";
import { MCP_ROOT } from "./runtime.mjs";
import { figureSpecSchema, physicalOptions } from "./schemas.mjs";
import contract from "../../figure-contract.js";
import units from "../../figure-units.js";
import { FigureJobs } from "./jobs.mjs";

const ARTIFACTS = Object.freeze({
  "figure.svg": "image/svg+xml",
  "figure.png": "image/png",
  "preview.png": "image/png",
  "report.json": "application/json",
  "spec.json": "application/json",
  ...Object.fromEntries(Array.from({ length: 2 }, (_, index) => [
    `panel-${index + 1}.svg`, "image/svg+xml",
  ])),
  ...Object.fromEntries(Array.from({ length: 2 }, (_, index) => [
    `panel-${index + 1}.png`, "image/png",
  ])),
});

const STANDARD_RENDER_TIMEOUT_MS = 600_000;

export function renderTimeoutMsForSpec(spec = {}) {
  if (spec.workspace !== "time") return STANDARD_RENDER_TIMEOUT_MS;
  const time = spec.options?.time || {};
  const explicitRange = Object.hasOwn(time, "age_minimum") || Object.hasOwn(time, "age_maximum");
  const minimum = time.age_minimum ?? null;
  const maximum = time.age_maximum ?? null;
  const explicitFullLabels = explicitRange && (minimum === null || minimum === 0) && maximum === null;
  return (explicitFullLabels ? contract.datingLabelDensity.fullRenderDeadlineSeconds : 600) * 1000;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function treeMetadata(tree) {
  return {
    name: tree.name || "tree.tre",
    bytes: Buffer.byteLength(tree.content, "utf8"),
    sha256: sha256(tree.content),
  };
}

export function publicRequestSpec(spec) {
  return {
    ...spec,
    main_tree: treeMetadata(spec.main_tree),
    ...(spec.comparison_tree ? { comparison_tree: treeMetadata(spec.comparison_tree) } : {}),
    ...(spec.gene_trees ? { gene_trees: treeMetadata(spec.gene_trees) } : {}),
    ...(spec.phyparts_table ? { phyparts_table: treeMetadata(spec.phyparts_table) } : {}),
    support_trees: (spec.support_trees || []).map(tree => ({
      ...tree,
      content: undefined,
      ...treeMetadata(tree),
    })),
    other_data_trees: (spec.other_data_trees || []).map(tree => ({
      ...tree,
      content: undefined,
      ...treeMetadata(tree),
    })),
  };
}

function revisionName(revision) {
  return String(revision).padStart(6, "0");
}

function valueEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffValues(before, after, currentPath = "", output = []) {
  if (valueEqual(before, after) || output.length >= 250) return output;
  const beforeObject = before && typeof before === "object" && !Array.isArray(before);
  const afterObject = after && typeof after === "object" && !Array.isArray(after);
  if (beforeObject && afterObject) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    keys.forEach(key => diffValues(before[key], after[key], currentPath ? `${currentPath}.${key}` : key, output));
    return output;
  }
  output.push({ path: currentPath || "$", before: before ?? null, after: after ?? null });
  return output;
}

function revisionInfo(revision, parentRevision, action, changes, operationSummary, changeNote) {
  return {
    revision,
    parent_revision: parentRevision,
    action,
    created_at: new Date().toISOString(),
    change_note: changeNote || null,
    operation_summary: operationSummary || [],
    changes,
  };
}

export class FigureStore {
  constructor(renderer, outputRoot = process.env.PHYLORENDER_OUTPUT_ROOT || path.join(MCP_ROOT, "var", "figures")) {
    this.renderer = renderer;
    this.outputRoot = path.resolve(outputRoot);
    this.figureQueues = new Map();
  }

  async initialize() {
    await mkdir(this.outputRoot, { recursive: true, mode: 0o700 });
    await chmod(this.outputRoot, 0o700);
    this.jobs = new FigureJobs(path.join(this.outputRoot, ".jobs"));
    await this.jobs.ready;
    return this;
  }

  validateId(figureId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(figureId)) {
      throw Object.assign(new Error("Invalid figure identifier."), { code: "INVALID_ARGUMENT", field: "figure_id", retryable: false });
    }
    return figureId;
  }

  validateRevision(revision) {
    const value = Number(revision);
    if (!Number.isInteger(value) || value < 1) {
      throw Object.assign(new Error("Invalid figure revision."), { code: "INVALID_ARGUMENT", field: "revision", retryable: false });
    }
    return value;
  }

  directory(figureId) {
    return path.join(this.outputRoot, this.validateId(figureId));
  }

  metadataPath(figureId) {
    return path.join(this.directory(figureId), "metadata.json");
  }

  revisionDirectory(figureId, revision) {
    return path.join(this.directory(figureId), "revisions", revisionName(this.validateRevision(revision)));
  }

  async exists(figureId) {
    try {
      await stat(this.metadataPath(figureId));
      return true;
    } catch {
      return false;
    }
  }

  async requireFigure(figureId) {
    if (!await this.exists(figureId)) {
      throw Object.assign(new Error(`Figure ${figureId} was not found or has expired.`), {
        code: "FIGURE_NOT_FOUND",
        field: "figure_id",
        retryable: false,
        remediation: "Verify the figure_id or create a new figure with create_figure.",
      });
    }
    return this.directory(figureId);
  }

  async readMetadata(figureId) {
    await this.requireFigure(figureId);
    return JSON.parse(await readFile(this.metadataPath(figureId), "utf8"));
  }

  async writeMetadata(figureId, metadata) {
    const target = this.metadataPath(figureId);
    const pending = `${target}.pending`;
    await writeFile(pending, json(metadata), { mode: 0o600 });
    await rename(pending, target);
  }

  serialFigure(figureId, operation) {
    const previous = this.figureQueues.get(figureId) || Promise.resolve();
    const result = previous.then(operation, operation);
    const sentinel = result.catch(() => undefined);
    this.figureQueues.set(figureId, sentinel);
    sentinel.finally(() => {
      if (this.figureQueues.get(figureId) === sentinel) this.figureQueues.delete(figureId);
    });
    return result;
  }

  validatedSpec(spec) {
    const parsed = figureSpecSchema.parse(spec);
    const workspace = parsed.workspace || "phylogeny";
    const withPublicationDefaults = {
      ...parsed,
      label_adjustments: parsed.label_adjustments.map(units.drawingAdjustment),
      clades: parsed.clades.map(clade=>({...clade,...(clade.name_segments ? {name_segments:clade.name_segments.map(part=>units.drawingSegment(part))} : {})})),
      options: contract.resolveCladeTypography(deepMerge(contract.defaults(workspace), contract.optionsForWorkspace(workspace, physicalOptions(parsed.options || {})))),
    };
    if ((parsed.options?.layout?.tip_spacing !== undefined || parsed.options?.layout?.tip_spacing_u !== undefined) && parsed.options.layout.tip_spacing_em === undefined) delete withPublicationDefaults.options.layout.tip_spacing_em;
    if ((parsed.options?.layout?.tip_spacing !== undefined || parsed.options?.layout?.tip_spacing_u !== undefined || parsed.options?.layout?.tip_spacing_em !== undefined)
      && parsed.options.layout.automatic_tip_spacing === undefined) withPublicationDefaults.options.layout.automatic_tip_spacing = false;
    return figureSpecSchema.parse(ensureSemanticIds(withPublicationDefaults));
  }

  async writeRevisionDirectory(directory, figureId, revision, spec, rendered, info) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const publicSpec = {
      requested: publicRequestSpec(spec),
      normalized: rendered.normalizedSpec,
      figure_id: figureId,
      revision,
    };
    const report = { ...rendered.report, png_scale: rendered.pngScale, figure_id: figureId, revision };
    const writes = [
      writeFile(path.join(directory, "request.private.json"), json(spec), { mode: 0o600 }),
      writeFile(path.join(directory, "spec.json"), json(publicSpec)),
      writeFile(path.join(directory, "report.json"), json(report)),
      writeFile(path.join(directory, "revision.json"), json(info)),
      writeFile(path.join(directory, "figure.svg"), rendered.svg, "utf8"),
      ...(rendered.png ? [writeFile(path.join(directory, "figure.png"), rendered.png)] : []),
      ...(rendered.preview ? [writeFile(path.join(directory, "preview.png"), rendered.preview)] : []),
      ...(rendered.panelTrees || []).flatMap(panel => [
        writeFile(path.join(directory, `panel-${panel.pageNumber}.svg`), panel.svg, "utf8"),
        ...(panel.png ? [writeFile(path.join(directory, `panel-${panel.pageNumber}.png`), panel.png)] : []),
      ]),
    ];
    await Promise.all(writes);
  }

  async create(spec, { signal } = {}) {
    const validatedSpec = this.validatedSpec(spec);
    const figureId = randomUUID();
    const pendingDirectory = path.join(this.outputRoot, `.pending-${figureId}`);
    const finalDirectory = this.directory(figureId);
    const revision = 1;
    const info = revisionInfo(revision, null, "create", [], ["create figure"], null);
    try {
      signal?.throwIfAborted();
      const rendered = await this.renderer.render(validatedSpec, { signal, formats: ["svg"],
        timeoutMs: renderTimeoutMsForSpec(validatedSpec) });
      signal?.throwIfAborted();
      const revisionDirectory = path.join(pendingDirectory, "revisions", revisionName(revision));
      await this.writeRevisionDirectory(revisionDirectory, figureId, revision, validatedSpec, rendered, info);
      const metadata = {
        figure_id: figureId,
        current_revision: revision,
        created_at: info.created_at,
        updated_at: info.created_at,
        revisions: [info],
      };
      await writeFile(path.join(pendingDirectory, "metadata.json"), json(metadata), { mode: 0o600 });
      await chmod(pendingDirectory, 0o700);
      signal?.throwIfAborted();
      await rename(pendingDirectory, finalDirectory);
      return this.describe(figureId, revision);
    } catch (error) {
      await rm(pendingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async readPrivateSpec(figureId, revision = null) {
    const metadata = await this.readMetadata(figureId);
    const selected = revision === null ? metadata.current_revision : this.validateRevision(revision);
    if (!metadata.revisions.some(item => item.revision === selected)) {
      throw new Error(`Revision ${selected} does not exist for figure ${figureId}.`);
    }
    return JSON.parse(await readFile(path.join(this.revisionDirectory(figureId, selected), "request.private.json"), "utf8"));
  }

  assertExpectedRevision(metadata, expectedRevision) {
    if (expectedRevision === undefined || expectedRevision === null) return;
    const expected = this.validateRevision(expectedRevision);
    if (metadata.current_revision !== expected) {
      throw Object.assign(new Error(`Revision conflict: expected ${expected}, but figure is now at revision ${metadata.current_revision}. Call inspect_figure and reapply the edit.`),
        { code: "REVISION_CONFLICT", retryable: false, expected_revision: expected, current_revision: metadata.current_revision });
    }
  }

  async commitRevision(figureId, metadata, nextSpec, {
    action,
    expectedRevision = null,
    operationSummary = [],
    changeNote = null,
  }) {
    this.assertExpectedRevision(metadata, expectedRevision);
    const currentSpec = await this.readPrivateSpec(figureId, metadata.current_revision);
    const validated = this.validatedSpec(nextSpec);
    const changes = diffValues(publicRequestSpec(currentSpec), publicRequestSpec(validated));
    if (!changes.length) throw new Error("The requested edit does not change the current figure.");
    const rendered = await this.renderer.render(validated, { formats: ["svg"],
      timeoutMs: renderTimeoutMsForSpec(validated) });
    const revision = metadata.current_revision + 1;
    const info = revisionInfo(revision, metadata.current_revision, action, changes, operationSummary, changeNote);
    const figureDirectory = this.directory(figureId);
    const pending = path.join(figureDirectory, `.pending-revision-${revisionName(revision)}`);
    const final = this.revisionDirectory(figureId, revision);
    try {
      await this.writeRevisionDirectory(pending, figureId, revision, validated, rendered, info);
      await rename(pending, final);
      const nextMetadata = {
        ...metadata,
        current_revision: revision,
        updated_at: info.created_at,
        revisions: [...metadata.revisions, info],
      };
      try {
        await this.writeMetadata(figureId, nextMetadata);
      } catch (error) {
        await rm(final, { recursive: true, force: true });
        throw error;
      }
      return this.describe(figureId, revision);
    } catch (error) {
      await rm(pending, { recursive: true, force: true });
      throw error;
    }
  }

  update(figureId, patch, { expectedRevision = null, changeNote = null } = {}) {
    return this.serialFigure(figureId, async () => {
      const metadata = await this.readMetadata(figureId);
      this.assertExpectedRevision(metadata, expectedRevision);
      const current = await this.readPrivateSpec(figureId, metadata.current_revision);
      const currentWorkspace = current.workspace || "phylogeny";
      const nextWorkspace = patch.workspace || currentWorkspace;
      const base = nextWorkspace === currentWorkspace ? current : {
        workspace: nextWorkspace,
        main_tree: current.main_tree,
        tip_label_overrides: current.tip_label_overrides || {},
        clades: nextWorkspace === "conflict" ? [] : (current.clades || []),
        options: {
          ...(current.options?.typography ? { typography: current.options.typography } : {}),
          ...(current.options?.output ? { output: current.options.output } : {}),
          ...(current.options?.labels ? { labels: current.options.labels } : {}),
          ...(current.options?.layout ? {
            layout: {
              ...(current.options.layout.ladderize ? { ladderize: current.options.layout.ladderize } : {}),
              ...(current.options.layout.clade_bar_alignment ? { clade_bar_alignment: current.options.layout.clade_bar_alignment } : {}),
              ...(current.options.layout.automatic_tip_spacing !== undefined ? { automatic_tip_spacing: current.options.layout.automatic_tip_spacing } : {}),
            },
          } : {}),
        },
      };
      const next = deepMerge(base, patch);
      if (patch.options) {
        next.options = deepMerge(physicalOptions(base.options), physicalOptions(patch.options));
        if ((patch.options.layout?.tip_spacing !== undefined || patch.options.layout?.tip_spacing_u !== undefined) && patch.options.layout.tip_spacing_em === undefined) delete next.options.layout.tip_spacing_em;
        if (patch.options.layout?.tip_spacing_em !== undefined) {
          delete next.options.layout.tip_spacing_u;
          delete next.options.layout.tip_spacing;
        }
      }
      return this.commitRevision(figureId, metadata, next, {
        action: "update",
        expectedRevision,
        operationSummary: ["apply partial figure patch"],
        changeNote,
      });
    });
  }

  edit(figureId, operations, { expectedRevision, changeNote = null } = {}) {
    return this.serialFigure(figureId, async () => {
      const metadata = await this.readMetadata(figureId);
      this.assertExpectedRevision(metadata, expectedRevision);
      const current = await this.readPrivateSpec(figureId, metadata.current_revision);
      const { spec, operationSummary } = applyEditOperations(current, operations);
      return this.commitRevision(figureId, metadata, spec, {
        action: "edit",
        expectedRevision,
        operationSummary,
        changeNote,
      });
    });
  }

  restore(figureId, targetRevision, { expectedRevision, changeNote = null } = {}) {
    return this.serialFigure(figureId, async () => {
      const metadata = await this.readMetadata(figureId);
      this.assertExpectedRevision(metadata, expectedRevision);
      const target = this.validateRevision(targetRevision);
      const spec = await this.readPrivateSpec(figureId, target);
      return this.commitRevision(figureId, metadata, spec, {
        action: "restore",
        expectedRevision,
        operationSummary: [`restore revision ${target}`],
        changeNote: changeNote || `Restore revision ${target}`,
      });
    });
  }

  async listRevisions(figureId) {
    const metadata = await this.readMetadata(figureId);
    return {
      figure_id: figureId,
      current_revision: metadata.current_revision,
      revisions: metadata.revisions,
    };
  }

  async describe(figureId, revision = null) {
    const metadata = await this.readMetadata(figureId);
    const selected = revision === null ? metadata.current_revision : this.validateRevision(revision);
    const info = metadata.revisions.find(item => item.revision === selected);
    if (!info) throw new Error(`Revision ${selected} does not exist for figure ${figureId}.`);
    const directory = this.revisionDirectory(figureId, selected);
    const [spec, report] = await Promise.all([
      readFile(path.join(directory, "spec.json"), "utf8").then(JSON.parse),
      readFile(path.join(directory, "report.json"), "utf8").then(JSON.parse),
    ]);
    return {
      figureId,
      revision: selected,
      currentRevision: metadata.current_revision,
      directory,
      spec,
      report,
      revisionInfo: info,
    };
  }

  async artifact(figureId, artifact, revision = null) {
    if (!Object.hasOwn(ARTIFACTS, artifact)) throw new Error(`Unsupported artifact ${artifact}.`);
    const figure = await this.describe(figureId, revision);
    const filePath = path.join(figure.directory, artifact);
    return {
      figureId,
      revision: figure.revision,
      artifact,
      mimeType: ARTIFACTS[artifact],
      filePath,
      data: await readFile(filePath),
      uri: `phylorender://figures/${figureId}/revisions/${figure.revision}/${artifact}`,
    };
  }

  ensureArtifacts(figureId, revision, formats) {
    return this.serialFigure(figureId, async () => {
      const figure = await this.describe(figureId, revision ?? null);
      const requested = [...new Set(formats || [])];
      const files = [];
      if (requested.includes("png")) files.push("figure.png");
      if (requested.includes("preview")) files.push("preview.png");
      if (requested.includes("panels")) {
        const count = Number(figure.report.two_panel?.panels) || 0;
        for (let panel = 1; panel <= count; panel++) {
          files.push(`panel-${panel}.svg`);
          if (requested.includes("png")) files.push(`panel-${panel}.png`);
        }
      }
      const missing = [];
      for (const file of files) {
        try { await stat(path.join(figure.directory, file)); }
        catch { missing.push(file); }
      }
      if (!missing.length) return figure;

      const renderFormats = ["svg"];
      if (requested.includes("png")) renderFormats.push("png");
      if (requested.includes("preview")) renderFormats.push("preview");
      if (requested.includes("panels")) renderFormats.push("panels");
      const spec = await this.readPrivateSpec(figureId, figure.revision);
      const rendered = await this.renderer.render(spec, { formats: renderFormats,
        timeoutMs: renderTimeoutMsForSpec(spec) });
      const originalSvg = await readFile(path.join(figure.directory, "figure.svg"), "utf8");
      const graphicalSvg = svg => svg.replace(/<metadata\b[^>]*\bid="phylorender-build"[^>]*>[\s\S]*?<\/metadata>/g, "");
      if (graphicalSvg(rendered.svg) !== graphicalSvg(originalSvg)) {
        throw Object.assign(new Error("The current renderer does not reproduce this revision's SVG; no new artifacts were written."), {
          code: "ARTIFACT_RENDER_MISMATCH", retryable: false,
          remediation: "Use the recorded rendering environment, or create and inspect a new figure from the original configuration. The existing revision is unchanged.",
        });
      }
      const candidates = [
        ...(requested.includes("png") && rendered.png ? [["figure.png", rendered.png]] : []),
        ...(requested.includes("preview") && rendered.preview ? [["preview.png", rendered.preview]] : []),
        ...(requested.includes("panels") ? (rendered.panelTrees || []).flatMap(panel => [
          [`panel-${panel.pageNumber}.svg`, panel.svg],
          ...(requested.includes("png") && panel.png ? [[`panel-${panel.pageNumber}.png`, panel.png]] : []),
        ]) : []),
      ];
      // Check every existing artifact before writing any missing one. A changed
      // rasterizer must never replace an immutable PNG while adding a preview.
      for (const [name, bytes] of candidates) {
        if (missing.includes(name)) continue;
        const previous = await readFile(path.join(figure.directory, name));
        const equal = name.endsWith(".svg")
          ? graphicalSvg(previous.toString("utf8")) === graphicalSvg(String(bytes))
          : previous.equals(Buffer.from(bytes));
        if (!equal) throw Object.assign(new Error("The current renderer does not reproduce this revision's " + name + "; no new artifacts were written."), {
          code:"ARTIFACT_RENDER_MISMATCH", retryable:false,
          remediation:"Use the recorded rendering environment, or create a new figure from the original configuration. The existing revision is unchanged.",
        });
      }
      await Promise.all(candidates.filter(([name]) => missing.includes(name))
        .map(([name, bytes]) => writeFile(path.join(figure.directory, name), bytes, {flag:"wx"})));
      return this.describe(figureId, figure.revision);
    });
  }

  async delete(figureId) {
    return this.serialFigure(figureId, async () => {
      const directory = await this.requireFigure(figureId);
      await rm(directory, { recursive: true, force: false });
      return { figure_id: figureId, deleted: true };
    });
  }
}

export const artifactNames = Object.freeze(Object.keys(ARTIFACTS));
