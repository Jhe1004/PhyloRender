"""Contained archive extraction and recorded, supervised native build commands."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import time

from process_supervisor import run_managed


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def verify_digest(path, expected):
    actual = sha256(path)
    if actual != expected:
        raise ValueError('Input SHA-256 mismatch: ' + str(path))
    return actual


def extract_checked(archive, destination, *, max_entries=20000,
                    max_bytes=400 * 1024**2, max_file_bytes=128 * 1024**2):
    """Validate the complete archive before creating a new extraction directory."""
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        raise FileExistsError(destination)
    with tarfile.open(archive) as handle:
        entries, paths, skipped, total = [], {}, 0, 0
        for member in handle:
            if len(entries) >= max_entries:
                raise ValueError('Too many archive entries')
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or '\\' in member.name:
                raise ValueError('Unsafe archive path: ' + member.name)
            if not (member.isdir() or member.isfile()):
                raise ValueError('Archive links and special files are not accepted')
            if not name.parts and not member.isdir():
                raise ValueError('Archive root must be a directory')
            if member.size < 0 or member.size > max_file_bytes:
                raise ValueError('Archive entry exceeds expanded size limit')
            total += member.size
            if total > max_bytes:
                raise ValueError('Archive exceeds expanded size limit')
            if name in paths:
                raise ValueError('Duplicate archive path: ' + member.name)
            paths[name] = member.isdir()
            entries.append((member, name))
        for name in paths:
            if any(parent in paths and not paths[parent] for parent in name.parents):
                raise ValueError('Archive file/directory collision: ' + str(name))
        destination.mkdir(mode=0o700)
        for member, name in entries:
            if any(part.startswith('._') or part == '.DS_Store' for part in name.parts):
                skipped += 1
                continue
            target = destination.joinpath(*name.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with handle.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                target.chmod(member.mode & 0o777)
    return {'archive_sha256': sha256(archive), 'entries': len(entries),
            'expanded_bytes': total, 'skipped_apple_metadata': skipped}


class BuildCommands:
    """Serial commands with a total deadline and persistent per-step receipts."""
    def __init__(self, work, environment, total_timeout=1800):
        self.work = Path(work)
        self.environment = environment
        self.deadline = time.monotonic() + total_timeout
        self.rows = []
        (self.work / 'logs').mkdir()

    def run(self, name, command, cwd=None, timeout=600):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Native build exceeded its total deadline')
        argv = ['/usr/bin/env', '-i'] + [key + '=' + str(value)
                for key, value in self.environment.items()] + list(map(str, command))
        log = self.work / 'logs' / (name + '.log')
        if log.exists():
            raise FileExistsError(log)
        start = time.monotonic()
        row = {'name': name, 'command': list(map(str, command)),
               'cwd': str(cwd or self.work), 'log': str(log.relative_to(self.work)),
               'started_unix': time.time(), 'exit_code': None}
        try:
            with log.open('w') as stream:
                result = run_managed(argv, cwd or self.work, stream,
                                     timeout=min(timeout, remaining))
            row['exit_code'] = result.returncode
            if result.returncode:
                raise RuntimeError('Native build step failed: ' + name)
            return log.read_text(errors='replace')
        except BaseException as error:
            row['error_type'] = type(error).__name__
            raise
        finally:
            row['elapsed_seconds'] = time.monotonic() - start
            self.rows.append(row)
            (self.work / 'commands.json').write_text(json.dumps(self.rows, indent=2) + '\n')
            print(json.dumps(row), flush=True)

    def staged_install(self, name, source, prefix):
        staging = self.work / (name + '-install-root')
        staging.mkdir()
        if 'DESTDIR' not in (source / 'Makefile').read_text():
            raise ValueError('Unstaged installation is not accepted')
        self.run(name + '-install', ['make', 'install', 'DESTDIR=' + str(staging)], source)
        staged = staging / prefix.relative_to('/')
        if not staged.is_dir():
            raise ValueError('Expected staged prefix was not created')
        shutil.copytree(staged, prefix, dirs_exist_ok=True, symlinks=True)


def relocate_portable(commands, files, destination):
    """Relocate copies only, verify the dependency allowlist and ad-hoc sign."""
    destination.mkdir()
    receipts = []
    for name, source in files.items():
        target = destination / name
        shutil.copy2(source, target)
        before = sha256(target)
        listing = commands.run('before-dependencies-' + name, ['/usr/bin/otool', '-L', target])
        identifier = None
        if name.endswith('.dylib'):
            identifier = commands.run('before-id-' + name, ['/usr/bin/otool', '-D', target]).splitlines()[1].strip()
        for line in listing.splitlines()[1:]:
            dependency = line.strip().split(' (', 1)[0]
            if dependency == identifier or dependency.startswith(('/usr/lib/', '/System/Library/')):
                continue
            base = Path(dependency).name
            if base not in files:
                raise ValueError('Unexpected private dependency: ' + dependency)
            commands.run('relocate-' + name + '-' + base,
                         ['/usr/bin/install_name_tool', '-change', dependency, '@loader_path/' + base, target])
        if identifier:
            commands.run('identifier-' + name, ['/usr/bin/install_name_tool', '-id', '@loader_path/' + name, target])
        commands.run('sign-' + name, ['/usr/bin/codesign', '--force', '--sign', '-',
                     '--timestamp=none', '--identifier', name, target])
        commands.run('verify-' + name, ['/usr/bin/codesign', '--verify', '--strict', target])
        final = commands.run('dependencies-' + name, ['/usr/bin/otool', '-L', target])
        allowed = {'@loader_path/' + item for item in files}
        for line in final.splitlines()[1:]:
            dependency = line.strip().split(' (', 1)[0]
            if dependency not in allowed and not dependency.startswith(('/usr/lib/', '/System/Library/')):
                raise ValueError('Portable dependency escaped the allowlist: ' + dependency)
        receipts.append({'name': name, 'before_relocation_sha256': before, 'sha256': sha256(target)})
    return receipts
