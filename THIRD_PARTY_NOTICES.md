# Third-party components and research inputs

PhyloRender's original code is GPL-3.0-or-later; see `LICENSE` and
`docs/LICENSE_DECISION.md`. This file is an inventory and attribution record.
It is not a substitute for the full license texts or a blanket redistribution
approval. Distribution must retain applicable copyright and license notices.

| Component | Use | Retained terms / source |
| --- | --- | --- |
| treePL | Native display-alignment calculation | GPL-3.0; `23_treePL集成_20260928/05_软件内置组件/02_许可证与源码/treePL-GPL-3.0.txt`; corresponding upstream snapshot `treePL-upstream-source.tar.gz` |
| ADOL-C 2.6.3 | treePL dependency | Dual EPL-1.0 or GPL-2.0-or-later; full `ADOL-C-LICENSE.txt` and `ADOL-C-2.6.3.tgz` inside the retained source archive |
| NLopt 2.4.2 | macOS treePL build dependency | Combined library includes LGPL-2.1-or-later and MIT components; `NLopt-COPYING.txt` and archived `nlopt-2.4.2.tar.gz` |
| LLVM OpenMP 20.1.8 | Source-built macOS treePL runtime and generated header | Full `LLVM-OpenMP-LICENSE.txt`; source/CMake/compiler-rt snapshots and BSD-licensed package recipe in `vendor/native-sources/`; source pins in `tools/native_build_manifest.json`; current source-built file hashes in `vendor/native/macos-arm64/manifest.json` |
| GNfinder | Optional offline name recognition | MIT; `tools/gnfinder/LICENSE` and upstream/version/hash in its README; local executables are not committed |
| GNparser | Optional offline name parsing | MIT; `tools/gnparser/LICENSE` and upstream/version/hash in its README; local executables are not committed |
| JSZip | Browser archive exports | MIT or GPL-3.0-or-later; `vendor/jszip.LICENSE.markdown` |
| Arimo, Libre Baskerville, Noto Sans SC, Source Sans 3, Source Serif 4 | Embedded open fonts | SIL OFL 1.1; each family retains its `vendor/fonts/<family>/LICENSE` and attribution |
| Arial | Optional installed system font | Not redistributed or embedded. A viewing system needs its own installed Arial; absent Arial uses explicitly named Arimo |
| npm runtime dependencies | MCP protocol, HTTP, browser automation, validation, ZIP | Exact versions and integrity hashes in `mcp-server/package-lock.json`; preserve each installed package's license and NOTICE in distributions |
| Playwright browser / base container | Headless rendering | Browser and operating-system components retain their upstream terms. Reassess the exact image/browser shipped in each release |

The candidate Docker recipe retains only the headless shell and its full browser
notice file. The upstream full-browser payload includes Widevine, which requires
a separate Google distribution agreement; it is removed together with unneeded
browser payloads. A fresh filesystem layer prevents the removed module remaining
in inherited image layers. Verify the final image with
`mcp-server/tests/image-distribution.mjs`, including its saved layers. The
upstream/intermediate stages and build cache are not approved distribution
artifacts. This change does not grant a Widevine license.

The retained treePL source archive has SHA-256
`d31d23a66ed7b34b2076ac62e7ed0fb75aaaf2f903bee58d56cd6dad6bb39e31`.
The Linux Docker recipe verifies that digest before compiling. In the container,
the retained native license/source bundle is located at `/app/vendor/treepl/`. System-installed
Linux dependencies also need their exact package versions and source/notice
records in the release evidence. This macOS audit does not certify a newly
built Linux image.

The current repository does not contain upstream PhyParts source or binaries.
`core/phyparts-engine.js` is an independent implementation. Its rooted
bipartition method is attributed to Smith et al. (2015),
<https://doi.org/10.1186/s12862-015-0423-0>. treePL's method is attributed to Smith
and O'Meara (2012), <https://doi.org/10.1093/bioinformatics/bts492>.

## Research examples and user files

The ordinary and Dating examples in `defaults/` derive from research trees.
The owner explicitly approved public distribution of these existing examples
on 2026-10-30; retain `docs/DEMO_DATA_PERMISSION.md` with their provenance.
This is permission for the existing software examples, not a blanket license
for all research inputs. The
owner's authorization to use AMD files for audit tests is test-use permission;
it does not itself establish a public data license.

Private audit inputs and output live under Git/Docker-ignored `mcp-server/var/`.
Do not add them, local cloud snapshots, credentials, generated figures or user
configurations to a public source archive or container. Do not infer that the
project GPL license applies to users' scientific data or output.

The native binary/source trace, section-comparison limits and remaining build
receipt requirements are recorded in `docs/NATIVE_COMPONENT_EVIDENCE.md`.
The offline macOS source-build recipe and its validation limits are documented
in `docs/NATIVE_BUILD.md`. The generated `tools/native_headers/omp.h` retains its
original LLVM attribution and SPDX notice; its full license is in the native
license/source bundle named above.

## Distribution evidence still required

- This local audit located license metadata and retained notice text for all 109 locked npm packages (including the MIT notice in isarray README). Preserve these exact installed notices in any distribution and repeat the check if the lockfile changes.
- Record corresponding sources and reproducible build steps for any shipped
  native binaries; compare against the binaries actually distributed.
- Preserve the full font licenses next to the embedded font resources.
- Retain the owner permission record for existing research-derived demo fixtures.
- Validate the actual source archive and final image contents; `.gitignore`
  alone does not control Docker contents or historical Git objects.
