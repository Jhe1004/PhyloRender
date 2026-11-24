# Reproducibility candidate: detached acceptance, 2026-11-01

This is private technical acceptance of the exact artifact below. It is separate
from permission records and from any public push, deployment or paper submission.
The image is retained in the authorized private audit root, not publicly uploaded.

- Accepted image ID: `sha256:f300fe63cd3202c95e2fb052b9809c9b4041c6a96e9ae9cef3b6240378a6021a`.
- Runtime source build: `4642530b77977b40f36f3d9eb549f16e083a70a4ae35bb479aaa3024b0ff4a1b` (229 fingerprint inputs).
- Validated source snapshot: 540 files, every hash verified; source candidate ZIP
  SHA-256 `02c6745f744934e36d87f20f31cda7722fdb8e4cc6d47805e14c6372c4a220f6`.
- Saved image.tar SHA-256: `35948307f5dafb08d1cbe6b46cde3a3fa4b748b8d85e7b89685c4940294ac13b`.
- Detached evidence archive SHA-256: `25de1748b79dfbe456669dfdab73f12cb88199ee41d904bf52b4f72022d69feb`.
- Actual default UID1001/pwuser, Linux x86_64, glibc2.39; headless Chromium149.0.7827.55.
- Full integration/native-science gate, independent PNG artifact capture,
  synthetic engineering workflow, real ML cloud and real 73MB/13797-gene-tree
  stress check: all actual container exits zero, no source bind mount.
- Final filesystem and every saved layer: no restricted Widevine; no inherited
  upstream layers containing the removed module. Native and auxiliary source
  archives match their pins. Code, original input hashes and image ID unchanged.
- Current Linux treePL SHA-256:
  `ed2cefeb0061e03d86e92446065dd41cdfc9739652a4438292a0e3ef2e4d0dc2`.
- Fixed-image PNG pressure witness: 16 runs, two browser restarts, four DPRs,
  four viewports, concurrency and controlled CPU load; all complete PNG bytes equal.
  The same Mac witness also passed 16 runs. MacChrome156 and LinuxChromium149
  outputs differ; the Mac uses system Arial while the image resolves Arial to
  Liberation Sans. These conditions differ together; no single cause is inferred.
- Existing SVG and PNG artifacts remain immutable across renderer changes.
  Configuration replay never silently replaces a historical raster.

The first build failed on public npm registry TLS resets and an npm exit-handler
error. The retained successful retry used the Dockerfile's NPM_REGISTRY build
argument with the reachable public npm mirror. Versions, lockfile integrity and
TLS verification were not relaxed. No global npm upgrade was performed.

## Replay the exact saved image on the validated Linux x86_64 platform

Compare `sha256sum image.tar` with the saved-image hash above, then load it.
Use a new container name and a new output directory. No service port is exposed.

```sh
docker load --input image.tar
docker image inspect sha256:f300fe63cd3202c95e2fb052b9809c9b4041c6a96e9ae9cef3b6240378a6021a --format '{{.Id}}'
docker create --name phylorender-replay --init --cpus=4 --memory=8g \
  --pids-limit=512 --shm-size=1g -w /app --entrypoint node \
  sha256:f300fe63cd3202c95e2fb052b9809c9b4041c6a96e9ae9cef3b6240378a6021a \
  evaluation/check-workflows.mjs /data/figures/replay
docker start --attach phylorender-replay
docker cp phylorender-replay:/data/figures/replay ./replay
docker rm --volumes phylorender-replay
```

The engineering runner checks complete SVG/PNG replay, source input preservation
and all four synthetic workspaces. It does not constitute independent statistical
validation. A rebuild from mutable package repositories is a new artifact, even
when its source fingerprint is unchanged; accept and archive its own image ID.
macOS Docker emulation and Windows are not validated by this x86_64 receipt.

## macOS native reproduction prerequisites

Current active bundle: `vendor/native/macos-arm64/manifest.json`. All three full
files match two clean source builds at different-length paths, including signatures.
Four-thread OpenMP reduction passed five times; two managed scientific Newick
comparisons passed. Historical stage23 files remain unchanged. See NATIVE_BUILD.

The validated CMake prerequisite was the official PyPI wheel
`cmake-3.31.6-py3-none-macosx_10_10_universal2.whl`, SHA-256 `da9d4fd9abd571fd016ddb27da0428b10277010b23bb21e3678f8b9e96e1686e`.
Its exact [download](https://files.pythonhosted.org/packages/7f/09/516b0d709672bc430eb13278f0316acd34869269447744f5d136daeef689/cmake-3.31.6-py3-none-macosx_10_10_universal2.whl) and
[official release metadata](https://pypi.org/pypi/cmake/3.31.6/json) were checked against the actual
private build tool. It was extracted privately; no global installation is needed.
The executable hash is `cb2cbe87f7a7914bec020cf4afcda9c0e64ded2c69ed70a75cd46a2b45674c80`. Apple clang21.0.0
(clang-2100.1.1.101) and macOS26.5 SDK are recorded external prerequisites.
Neither the Apple toolchain/SDK nor Linux's system GNU OpenMP/NLopt packages
are claimed source-rebuilt by the macOS recipe. Exact claims cover the recorded
bundle and fixed rendering environment, not arbitrary fonts, operating systems
or whole-system byte reproducibility.

## Prior detached image receipt (historical, preserved)

### Previous candidate-image acceptance record

This records actual private acceptance of the candidate below. It is detached
from the image to avoid a circular image hash. It is not a deployment, push,
paper submission or approval of upstream/intermediate image redistribution.

- Image: `sha256:b188748a43af19715540a115e080ba8b8ab12257bd9aa994bea947abb7c0c4b7`
- Runtime source fingerprint: `4ab6fc1bc201aea7116d4fca29291945449a0cfec23abd460196abcdc7050d2f` (223 inputs).
- Source files verified in the AMD candidate checkout: 530; zero hash mismatches.
- Complete application image: default `pwuser`, no source bind mount; actual browser, MCP, state/protocol and native-science suite.
- Real-data tests: image `/app` code, read-only private input copies, original hashes and image ID unchanged.
- Final filesystem and every exported layer: no restricted Widevine module; no inherited upstream layers. The headless browser and full notice remain.
- Fixed treePL source bundle and auxiliary OpenMP/CMake/compiler-rt archives: actual image hashes verified.
- Actual non-root UID: `1001` (`pwuser`).
- Actual Linux treePL SHA-256: `ed2cefeb0061e03d86e92446065dd41cdfc9739652a4438292a0e3ef2e4d0dc2`.
- Linux system dependencies from the image package inventory: `libgomp1	14.2.0-4ubuntu2~24.04.1	amd64; libnlopt-cxx-dev	2.7.1-5build2	amd64; libnlopt-cxx0	2.7.1-5build2	amd64; libnlopt-dev	2.7.1-5build2	amd64; libnlopt0	2.7.1-5build2	amd64`. These are recorded system packages; the macOS NLopt 2.4.2 recipe is not their source-build evidence.
- Evidence archive SHA-256: `5f8937e5ce839b2ae142dd6e641acc8c63bd42b08c92b53205536f37bf96ff63`.

| Actual command | Exit | Seconds |
| --- | --- | --- |
| build-manifest | 0 | 0.16 |
| source-permission | 0 | 0.16 |
| build | 0 | 315.19 |
| image-inspect | 0 | 0.06 |
| distribution | 0 | 18.6 |
| environment | 0 | 1.47 |
| production-time-target-v3 | 0 | 2.47 |
| production-time-target-v3-inspect | 0 | 0.03 |
| production-time-target-v3-copy | 0 | 0.06 |
| production-time-target-v3-remove | 0 | 0.06 |
| production-full-v3 | 0 | 1357.95 |
| production-full-v3-inspect | 0 | 0.07 |
| production-full-v3-copy | 0 | 0.06 |
| production-full-v3-remove | 0 | 0.06 |
| production-evaluation-v3 | 0 | 103.21 |
| production-evaluation-v3-inspect | 0 | 0.06 |
| production-evaluation-v3-copy | 0 | 0.06 |
| production-evaluation-v3-remove | 0 | 0.06 |
| package-inventory | 0 | 0.57 |
| npm-audit | 0 | 1.87 |
| image-before | 0 | 0.06 |
| real-ml-cloud-create | 0 | 0.11 |
| real-ml-cloud-helper | 0 | 0.11 |
| real-ml-cloud-run | 0 | 10.33 |
| real-ml-cloud-inspect | 0 | 0.06 |
| real-ml-cloud-copy | 0 | 0.11 |
| real-ml-cloud-remove | 0 | 0.06 |
| real-stress-create | 0 | 0.06 |
| real-stress-run | 0 | 71.65 |
| real-stress-inspect | 0 | 0.06 |
| real-stress-copy | 0 | 0.11 |
| real-stress-remove | 0 | 0.06 |
| image-after | 0 | 0.06 |

The original image's restricted-module counterexample, the first complete image
attempt's two missing-public-file failures, the second attempt's optional-padding width failure, and the corrected run are retained.
No assertion was removed or relaxed. A separate private orchestration log-name
collision was retained and recovered with an actual new stress command; its old
nonzero orchestration exit is not described as an all-zero run.

Large saved image files remain in the private AMD audit root; the evidence
archive contains their exact hashes and every-layer inspection. Empirical
research inputs/configurations/figures and editable audit HTML remain private.
The public engineering-validation inputs are synthetic. The current paper scope
focuses on functionality, input protection, reproducibility and failure recovery.
Windows is not validated.

Source permission records implement the owner's existing GPL-3.0-or-later and
demo-tree decisions plus retained third-party grants. They are separate from
this technical receipt and from any actual public distribution action.
