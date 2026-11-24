"""Offline LLVM OpenMP source build with path-independent native artifacts."""
from pathlib import Path
import shutil

from native_build_support import extract_checked, sha256


def reproducible_flags(work):
    return ' '.join(flag + str(work) + '=.' for flag in
                    ['-ffile-prefix-map=', '-fdebug-prefix-map=', '-fmacro-prefix-map='])


def build_openmp(commands, work, inputs, prefix, cmake):
    """Use the versioned source archives; never read a precompiled libomp."""
    version = commands.run('cmake-version', [cmake, '--version'])
    if version.splitlines()[0] != 'cmake version 3.31.6':
        raise ValueError('The reproducible macOS recipe requires CMake 3.31.6')
    archives = {
        'openmp': extract_checked(inputs['openmp_source'], work / 'OpenMP'),
        'cmake': extract_checked(inputs['cmake_source'], work / 'CommonCMake'),
    }
    source = work / 'OpenMP/openmp-20.1.8.src'
    shutil.copytree(work / 'CommonCMake/cmake-20.1.8.src', source.parent / 'cmake')
    build = work / 'openmp-build'
    flags = reproducible_flags(work)
    commands.run('openmp-configure', [cmake, '-S', source, '-B', build,
        '-G', 'Unix Makefiles', '-DCMAKE_C_COMPILER=/usr/bin/clang',
        '-DCMAKE_CXX_COMPILER=/usr/bin/clang++', '-DCMAKE_BUILD_TYPE=Release',
        '-DCMAKE_INSTALL_PREFIX=' + str(prefix), '-DCMAKE_OSX_ARCHITECTURES=arm64',
        '-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0', '-DCMAKE_C_FLAGS=' + flags,
        '-DCMAKE_CXX_FLAGS=' + flags,
        '-DCMAKE_SHARED_LINKER_FLAGS=-Wl,-reproducible',
        '-DCMAKE_INSTALL_NAME_DIR=@rpath', '-DCMAKE_BUILD_WITH_INSTALL_NAME_DIR=ON',
        '-DCMAKE_SKIP_RPATH=ON', '-DOPENMP_ENABLE_LIBOMPTARGET=OFF',
        '-DOPENMP_ENABLE_OMPT_TOOLS=OFF', '-DOPENMP_ENABLE_LIBOMP_PROFILING=OFF',
        '-DLIBOMP_ENABLE_SHARED=ON'])
    commands.run('openmp-build', [cmake, '--build', build, '--parallel', '2'])
    commands.run('openmp-install', [cmake, '--install', build])
    runtime = prefix / 'lib/libomp.dylib'
    header = prefix / 'include/omp.h'
    return {'sources': archives, 'runtime_sha256': sha256(runtime),
            'header_sha256': sha256(header), 'source_rebuilt': True,
            'offloading': False, 'compiler_runtime': 'Apple clang toolchain',
            'cmake_version': version.splitlines()[0]}
