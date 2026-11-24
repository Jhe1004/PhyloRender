# OpenMP source and build-recipe provenance

These files retain source material for the recorded LLVM OpenMP dependency.
They are not research inputs and are not new runtime binaries. Complete source
licenses remain inside the upstream archives; the unchanged recipe retains
`recipe/parent/LICENSE` (BSD 3-Clause). Keep these archives, `SHA256SUMS` and the
native license/source bundle with a source distribution.
The upstream shared-CMake component archive has no separate license file;
the unchanged root `LLVM-project-20.1.8-LICENSE.TXT` from the same tag is retained
alongside it. It applies together with any notices in individual source files.

| Archive | Official source / provenance |
| --- | --- |
| `openmp-20.1.8.src.tar.xz` | [LLVM 20.1.8 OpenMP source](https://github.com/llvm/llvm-project/releases/download/llvmorg-20.1.8/openmp-20.1.8.src.tar.xz) |
| `cmake-20.1.8.src.tar.xz` | [LLVM 20.1.8 shared CMake source](https://github.com/llvm/llvm-project/releases/download/llvmorg-20.1.8/cmake-20.1.8.src.tar.xz) |
| `compiler-rt-20.1.8.src.tar.xz` | [LLVM 20.1.8 compiler-rt source](https://github.com/llvm/llvm-project/releases/download/llvmorg-20.1.8/compiler-rt-20.1.8.src.tar.xz) |
| `openmp-20.1.8-he822017_0-recipe.tar.gz` | Unchanged recipe and package-build configuration extracted from the verified Anaconda package below; no package executable/library is included in this recipe archive |

The recorded installed package is
`llvm-openmp-20.1.8-he822017_0.conda`, obtained from
`https://repo.anaconda.com/pkgs/main/osx-arm64/llvm-openmp-20.1.8-he822017_0.conda`.
Its SHA-256 is
`94f079719bbbad632ae2250bbf8d423618b3094aea9a5b96a76d8bd2e99cb485`.
The package was retrieved again and its full hash verified before extracting
the recipe. Its recorded source URL is the full
[llvmorg-20.1.8 tag archive](https://github.com/llvm/llvm-project/archive/refs/tags/llvmorg-20.1.8.tar.gz),
SHA-256 `a6cbad9b2243b17e87795817cfff2107d113543a12486586f8a055a2bb044963`.
The smaller official component archives above retain the relevant OpenMP,
shared CMake and compiler-runtime source. They are not claimed to have the same
archive bytes as that full-project download.

The recipe records Apple arm64 patch
`0001-link-libomp-to-compiler-rt-on-osx-arm.patch`, which links compiler-rt
builtins. Its `build.sh` additionally force-loads the builtins library and uses
the shared CMake directory. This is why compiler-rt source is retained too.
The rendered `recipe/meta.yaml` records the original compiler bootstrap,
CMake, macOS deployment target, dependencies, source hash and feedstock commit
`bb66f649fe23be4f82348610644f55db84e14aa5`. Preserve both this metadata and the
unrendered parent recipe; they describe an upstream package environment, not
the current developer's machine.

The matching package's generated `omp.h` remains unchanged in
`tools/native_headers/omp.h` for historical provenance. The current build generates
its header from OpenMP source and does not read that retained copy or a prebuilt
OpenMP library. `tools/openmp_build.py` compiles the OpenMP/shared-CMake archives;
the Apple clang runtime is an external toolchain dependency. The historical Conda
compiler-rt patch is retained, but is not applied by this Apple-clang recipe.

Two clean source builds in different-length paths produced byte-identical complete
macOS treePL, ADOL-C and OpenMP files. The active bundle and hashes are in
`vendor/native/macos-arm64/manifest.json`; commands, requirements and limits are in
`docs/NATIVE_BUILD.md`. Historical package provenance above remains valid for the
read-only historical files. It does not describe the current compiled binary.
Linux system dependencies and Windows support require their own evidence.
