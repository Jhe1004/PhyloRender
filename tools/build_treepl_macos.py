#!/usr/bin/env python3
"""Offline treePL/ADOL-C/NLopt source build; preserves the shipped binaries."""
import argparse
import json
from pathlib import Path
import platform
import shutil
import time

from native_build_support import BuildCommands, extract_checked, relocate_portable, verify_digest, sha256
from openmp_build import build_openmp, reproducible_flags


def compiler_wrapper(compiler):
    # Old libtool loses -Xpreprocessor before -fopenmp at the final link.
    return '''#!/bin/bash
args=()
previous=""
for arg in "$@"; do
  if [[ "$arg" == "-fopenmp" && "$previous" != "-Xpreprocessor" ]]; then
    args+=("-Xpreprocessor" "-fopenmp")
  else
    args+=("$arg")
  fi
  previous="$arg"
done
exec ''' + compiler + ' "${args[@]}"\n'


def build(work, repo, cmake):
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise ValueError('This recipe is for macOS arm64 only')
    work = work.expanduser().absolute()
    if any(character.isspace() for character in str(work)):
        raise ValueError('Autotools build directory must not contain whitespace')
    if work.exists() or work.is_symlink():
        raise FileExistsError(work)
    manifest = json.loads((repo / 'tools/native_build_manifest.json').read_text())
    inputs = {name: repo / row['path'] for name, row in manifest['inputs'].items()}
    for name, source in inputs.items():
        verify_digest(source, manifest['inputs'][name]['sha256'])
    if shutil.disk_usage(work.parent).free < 2 * 1024**3:
        raise ValueError('At least 2 GiB free space is required')
    work.mkdir(mode=0o700)
    prefix, toolchain, tmp = work / 'prefix', work / 'toolchain', work / 'tmp'
    for directory in [prefix / 'include', prefix / 'lib', toolchain, tmp]:
        directory.mkdir(parents=True)
    sources = {'treePL': extract_checked(inputs['treepl_source'], work / 'source')}
    tree = work / 'source/treePL'
    for name, row in manifest['nested_archives'].items():
        archive = tree / 'deps' / row['filename']
        verify_digest(archive, row['sha256'])
        sources[name] = extract_checked(archive, work / name)
    for name, compiler in [('cc', '/usr/bin/clang'), ('cxx', '/usr/bin/clang++')]:
        wrapper = toolchain / name
        wrapper.write_text(compiler_wrapper(compiler))
        wrapper.chmod(0o755)
    flags = '-O2 ' + reproducible_flags(work)
    environment = {'SOURCE_DATE_EPOCH': '1751587200', 'ZERO_AR_DATE': '1',
                   'CFLAGS': flags, 'CXXFLAGS': flags,
                   'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C',
                   'CC': str(toolchain / 'cc'), 'CXX': str(toolchain / 'cxx'),
                   'CPPFLAGS': '-I' + str(prefix / 'include'),
                   'LDFLAGS': '-Wl,-reproducible',
                   'TMPDIR': str(tmp), 'CLANG_MODULE_CACHE_PATH': str(tmp / 'clang-modules')}
    commands = BuildCommands(work, environment)
    receipt = {'recipe': manifest, 'started_unix': time.time(), 'sources': sources,
               'compiler_environment': environment, 'make_jobs': 2,
               'openmp_source_rebuilt': False, 'science_validation': 'not_run',
               'shipped_binaries_replaced': False}
    try:
        receipt['compiler'] = commands.run('compiler', ['/usr/bin/clang++', '--version'])
        receipt['sdk'] = commands.run('sdk', ['/usr/bin/xcrun', '--show-sdk-path'])
        receipt['make'] = commands.run('make-version', ['make', '--version'])
        receipt['build_tools'] = {name: sha256(repo / 'tools' / name) for name in
            ['build_treepl_macos.py', 'openmp_build.py', 'native_build_support.py']}
        receipt['cmake_sha256'] = sha256(cmake)
        environment['SDKROOT'] = receipt['sdk'].strip()
        environment['MACOSX_DEPLOYMENT_TARGET'] = '11.0'
        receipt['openmp'] = build_openmp(commands, work, inputs, prefix, cmake)
        receipt['openmp_source_rebuilt'] = True
        environment['LDFLAGS'] += ' -L' + str(prefix / 'lib') + ' -L' + str(prefix / 'lib64') + ' -lomp'
        # Autoconf executes conftests; their copied OpenMP must have a loadable ID.
        runtime = prefix / 'lib/libomp.dylib'
        commands.run('stage-openmp-id', ['/usr/bin/install_name_tool', '-id', runtime, runtime])
        commands.run('stage-openmp-sign', ['/usr/bin/codesign', '--force', '--sign', '-', '--timestamp=none', runtime])
        nlopt = work / 'NLopt/nlopt-2.4.2'
        commands.run('nlopt-configure', ['sh', 'configure', '--prefix=' + str(prefix),
                     '--disable-shared', '--enable-static', '--without-guile', '--without-python',
                     '--without-octave', '--without-matlab'], nlopt)
        commands.run('nlopt-make', ['make', '-j2'], nlopt)
        commands.staged_install('nlopt', nlopt, prefix)
        adolc = work / 'ADOL-C/ADOL-C-2.6.3'
        commands.run('adolc-configure', ['sh', 'configure', '--prefix=' + str(prefix),
                     '--enable-shared', '--disable-static',
                     '--with-openmp-flag=-Xpreprocessor -fopenmp'], adolc)
        # Configure needs an absolute loadable runtime. Final links must instead
        # start with stable IDs: relocating later cannot undo path-sized headers
        # or the UUID derived from their original contents.
        commands.run('final-openmp-id', ['/usr/bin/install_name_tool', '-id', '@loader_path/libomp.dylib', runtime])
        commands.run('final-openmp-sign', ['/usr/bin/codesign', '--force', '--sign', '-', '--timestamp=none', runtime])
        libtool = adolc / 'libtool'
        script = libtool.read_text()
        old = r'-install_name \$rpath/\$soname'
        if script.count(old) != 4:
            raise ValueError('Unexpected ADOL-C libtool install-name recipe')
        libtool.write_text(script.replace(old, r'-install_name @loader_path/\$soname'))
        commands.run('adolc-make', ['make', '-j2'], adolc)
        commands.staged_install('adolc', adolc, prefix)
        source = tree / 'src'
        makefile = (source / 'Makefile.in').read_text().replace('-g3', '-g0')
        (source / 'Makefile').write_text(makefile)
        commands.run('treepl-make', ['make', '-j2', 'CC=' + str(toolchain / 'cc'),
                     'CP=' + str(toolchain / 'cxx') + ' -std=c++11',
                     'CPPFLAGS=' + environment['CPPFLAGS'] + ' ' + reproducible_flags(work),
                     'LDFLAGS=-Wl,-reproducible -L' + str(prefix / 'lib') + ' -L' + str(prefix / 'lib64') + ' -I' + str(prefix / 'include'),
                     'OPENMP=-Xpreprocessor -fopenmp',
                     'LIBS=-lm -Xpreprocessor -fopenmp -ladolc -lnlopt -lomp'], source)
        adolc_files = list(prefix.glob('lib*/libadolc.2.dylib'))
        if len(adolc_files) != 1:
            raise ValueError('Expected exactly one installed ADOL-C library')
        receipt['artifacts'] = relocate_portable(commands, {'treePL': source / 'treePL',
            'libadolc.2.dylib': adolc_files[0].resolve(), 'libomp.dylib': runtime}, work / 'portable')
        receipt['status'] = 'build_complete_science_validation_required'
    except BaseException as error:
        receipt['status'] = 'failed'
        receipt['error_type'] = type(error).__name__
        raise
    finally:
        receipt['finished_unix'] = time.time()
        receipt['inputs_unchanged'] = all(verify_digest(source, manifest['inputs'][name]['sha256'])
                                         for name, source in inputs.items())
        (work / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True, help='New directory without whitespace (for example /tmp/phylorender-native-build)')
    parser.add_argument('--cmake', type=Path, required=True, help='CMake 3.31.6 executable')
    arguments = parser.parse_args()
    result = build(arguments.work, Path(__file__).resolve().parent.parent, arguments.cmake.expanduser().resolve())
    print(json.dumps({'status': result['status'], 'artifacts': result['artifacts']}, indent=2))
