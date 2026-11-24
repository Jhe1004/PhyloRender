# Reproducible engineering validation bundle

This bundle checks PhyloRender's four workspaces, scientific-input protection,
actual SVG/PNG exports and byte-exact configuration replay. Its original,
deterministic synthetic trees contain no AMD research data. Topologies,
support values, branch lengths, ages and intervals are invented. The cloud
fixtures are not ML estimates: `genes_method=ml` exercises the accepted input
path. Mya in the Dating case is an explicit artificial test convention.

After installing the locked MCP dependencies, run from the repository root:

```sh
node evaluation/verify-cases.mjs
mkdir -p mcp-server/var
node evaluation/check-workflows.mjs mcp-server/var/engineering-check-01
```

Install the normal browser/runtime requirements first. The cloud case needs a
working treePL for the current platform. The parent output directory must exist;
the requested output directory must be new. The script starts a private
loopback runtime and closes it on completion. It writes requests, normalized
settings, reports, SVG/PNG files, bundle fingerprints and `attempts.json`.
Failures retain error details; use a different new directory for each rerun.
Shared services are not restarted. Keep outputs in ignored private paths.

`tasks.json` fixes tasks and success conditions. `fixtures/manifest.json` fixes
input hashes. The generator refuses to overwrite the existing fixture directory.
A changed task, script or document has a new bundle fingerprint; retain the
fingerprint belonging to each recorded run. `runs-template.csv` records
engineering executions and artifact checks.

The scripted runner checks import/export/configuration replay. The additional
ambiguity-recovery task in `tasks.json` is verified separately through the
integration suite or an explicitly recorded engineering execution; the runner
does not automatically score every listed condition. Check raw identities,
topologies and scientific values, not screenshots alone. Same-core replay is
not an independent proof of statistical correctness.

Cloud provenance retains synthetic lengths, the imported relative root, fixed
treePL smoothing/numsites and display_alignment-only shared-clade constraints.
Four-category counts and exclusions remain available even with a two-category
display. Private empirical audit inputs and figures remain outside this bundle.

The current paper scope is in `PUBLICATION_POSITIONING.md`; the evidence matrix
is in `docs/PUBLICATION_EVALUATION_MATRIX.md`. Claims are limited to measured
functionality and engineering validation.
