# Reproducible rendering and native builds

## PNG rendering policy

`svg-software-canvas-v1` is the shared GUI/MCP SVG-to-PNG implementation in
`render/png-raster.js`. It uses an opaque Canvas2D surface with
`willReadFrequently:true`, fills the complete physical canvas white, and rounds
physical dimensions once. The GUI, full MCP PNG, preview and panel PNG use this
implementation. PNG density metadata comes from the shared figure-units module.
The report records the raster policy and actual Chromium version.

Previously the GUI used Canvas2D while MCP used an SVG element screenshot at a
fractional device scale. A retained counterexample has different GUI/MCP pixels;
a fractional-height example also exposes a one-pixel rounding difference between
the two paths. A historical sporadic PNG mismatch was not reproduced in every
legacy retry, so its exact trigger is not claimed proven. The compositor screenshot
path and independent rounding are now removed from PNG production.

The software-surface choice follows Chromium's read-frequent canvas behavior;
`willReadFrequently` is a browser hint, not a portable mathematical specification
of text rasterization. See the [HTML canvas specification](https://html.spec.whatwg.org/multipage/canvas.html)
and [Chromium Canvas2D implementation](https://chromium.googlesource.com/chromium/src/third_party/+/8d59c20e6412ff199f8f0b7a8d8f7ef7951abe47/blink/renderer/modules/canvas/canvas2d/canvas_rendering_context_2d.cc).

The integration gate `mcp-server/tests/png-reproducibility.mjs` checks all four
workspaces plus a fractional-height case, actual GUI downloads versus MCP bytes,
PNG-header/report dimensions and exact SVG/PNG/preview replay. No pixel tolerance
is applied. Pure interface tests cover pre-allocation limits, decode/encode failure
and cancellation cleanup. Existing revision SVGs and PNGs are immutable: adding
missing formats compares existing artifacts before any write and rejects a mismatch
with `ARTIFACT_RENDER_MISMATCH`. New raster bytes are an intentional policy change;
historical PNG files are never relabelled or overwritten as new-policy outputs.

## Source-built macOS native bundle

The active macOS arm64 bundle is `vendor/native/macos-arm64/`. treePL, ADOL-C,
NLopt (static) and LLVM OpenMP are built from retained, hash-pinned sources.
Two clean builds at different-length paths produced identical complete treePL,
libadolc.2.dylib and libomp.dylib files, including Mach-O load commands and ad-hoc
signatures. The manifest records hashes, source recipe and exact tool versions.
The historical numbered-stage binaries remain unchanged and are no longer the
macOS runtime fallback. Missing current bundle files cause an explicit unavailable
engine result. See [the build recipe](NATIVE_BUILD.md).

The build fixes source paths, timestamps and archive dates. Final libraries use
stable `@loader_path` IDs before linking consumers. Moving IDs only after linking
was insufficient: temporary path lengths changed header layout and content UUIDs.
The source archives and scientific code are unmodified. Compilation and scientific
validation both run through the existing process supervisor.

A four-thread reduction smoke test ran five times. Two managed scientific checks
(four-tip synthetic calibration and a 57-tip ML gene-tree computational reference)
produced identical complete Newick output to the historical bundle, with inputs
unchanged. They test constrained `display_alignment`, not a new divergence-time
estimator and not equivalence for all possible datasets.

## Supported claim

Exact-byte claims apply to the tested rendering environment and recorded native
toolchain. Preserve SVG/configuration, input hashes, fonts, raster policy, browser
version and the accepted image digest. A fixed image is the portable rendering
reference; a rebuilt image must be accepted as a new artifact. SVG scientific
invariants and geometry are tested separately from pixels.

These changes close the unrebuilt bundled OpenMP dependency and the divergent
GUI/MCP PNG algorithms. They do not imply identical pixels across arbitrary fonts,
Chromium versions or operating systems, nor a source-rebuilt Apple compiler, SDK,
Linux system packages or whole operating system. Linux's system GNU OpenMP is a
separately recorded dependency; it is not LLVM OpenMP from the macOS bundle.
Windows remains outside the validated platform set. No human/independent-model
comparative study is required by this engineering scope.
