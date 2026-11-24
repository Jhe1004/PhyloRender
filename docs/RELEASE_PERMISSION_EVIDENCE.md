# Permission evidence for the source candidate

This file records evidence, not a new license choice, permission to publish a
service, a legal certification, or proof that an image has passed acceptance.
The actual release marker remains in `RELEASE_STATUS.json`.

The owner explicitly chose **GPL-3.0-or-later** for the project's original code;
see `LICENSE_DECISION.md` and the full root `LICENSE`. The owner separately
approved public distribution of the existing Ranunculaceae 173/58-tip and
Salicaceae 27-tip demonstration trees; see `DEMO_DATA_PERMISSION.md`.
These decisions do not cover arbitrary private research inputs or outputs.

The source candidate retains the following separate third-party records:

| Material | Evidence retained with the source |
| --- | --- |
| treePL | Full GPL-3.0 text and fixed upstream source archive, including nested ADOL-C and NLopt archives; hash and offline build steps in `NATIVE_BUILD.md` and `tools/native_build_manifest.json` |
| ADOL-C | Full EPL-1.0 / GPL-2.0-or-later dual-license notice and 2.6.3 source archive in the treePL bundle |
| NLopt | Full component notices and 2.4.2 source archive in that bundle |
| LLVM OpenMP/header | Full original LLVM license, generated current header and retained historical header attribution, source-built current binary hashes plus historical package hashes, upstream OpenMP/CMake/compiler-rt 20.1.8 sources and the exact installed package's unchanged recipe/patches; see `vendor/native-sources/README.md` |
| OpenMP package recipe | Original BSD-3-Clause text at `recipe/parent/LICENSE` inside its recipe archive |
| JSZip | Full original MIT / GPL notice in `vendor/jszip.LICENSE.markdown` |
| Open fonts | Original family licenses and copyright in `vendor/fonts/`; Arial is an installed system font, not redistributed or embedded |
| Optional name helpers | MIT licenses and version/source records; local native helper executables are excluded from public source/image inputs |
| npm dependencies | Exact lockfile versions/integrities; distributions installing these packages retain their own full license/NOTICE/README texts, including isarray's MIT notice in its README |
| Browser/base OS | Their own distribution notices, package inventory and source terms must be retained and checked for the actual final image; the private audit image is not a substitute for that check |

`THIRD_PARTY_NOTICES.md` maps these records to their source locations. Source
archive inventories and hashes cover auxiliary license/source files as well as
runtime files. The renderer's build fingerprint intentionally describes runtime
and tool inputs; it is not the full distribution inventory.

All new empirical AMD files, raw audit inputs, private configurations, generated
research figures and HTML audit reports remain in ignored `mcp-server/var/`
or the local-only `private-tests/` handoff bundle (also excluded from Docker context).
The public evaluation inputs are original artificial fixtures, explicitly
labelled as such; they do not publish an empirical dataset or infer a biological
result. The original raw 27-tip example is retained but rejected by current
strict tip-age validation; its replacement demonstration is independently
constructed artificial data.

The independent conflict engine contains no upstream PhyParts code or binary;
method attribution remains Smith et al. (2015). It is not official PhyParts.

The current bounded distribution review checks direct public-file listings,
known private-path exclusions, source archive hashes, notice presence and four
secret formats. It does not establish that all Git history or arbitrary future
build outputs can be published. Publishing Git history, deploying/restarting a
shared service, and submitting a paper are separate operations.

The executable engineering-validation bundle covers the current paper scope;
see `evaluation/README.md` and `PUBLICATION_EVALUATION_MATRIX.md`.

The source-candidate inspection retained every listed source file by hash,
confirmed the private-path exclusions, and found only the three standalone
research-tree files already covered by the owner's demo permission. Fonts,
native sources, original notices and both owner decisions were retained. This
closes the source-permission evidence previously missing from the release
record; it does not extend the owner's permission to other research files.

The sanitized headless-browser base was independently built and inspected as
image `sha256:77603ead98fa5a91a79cb3f175910f607ad4efe1afb71b0fc982d51b02e5196b`.
Its filesystem contains only the headless browser and full notice, inherits no
layers from the upstream image, and its two saved layers contain no Widevine
module. This is base-stage evidence, not completed application-image acceptance.
The source permission record relies on the existing owner decisions and
retained third-party license grants, not an agent-selected replacement license.
Any complete binary-image distribution still requires its own exact artifact
inspection and technical acceptance; a permission-record gate passing does not
perform that review or authorize pushing/deploying it.
