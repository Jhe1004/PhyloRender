"""Archive safety checks for the offline native build tool."""
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

from native_build_support import extract_checked, sha256, verify_digest


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def archive(self, entries):
        archive = self.root / 'source.tar'
        with tarfile.open(archive, 'w') as handle:
            for name, kind, contents in entries:
                member = tarfile.TarInfo(name)
                member.type = kind
                if kind == tarfile.REGTYPE:
                    member.size = len(contents)
                member.linkname = '../outside'
                handle.addfile(member, io.BytesIO(contents) if member.isfile() else None)
        return archive

    def reject(self, entries, **limits):
        archive = self.archive(entries)
        target = self.root / 'destination'
        with self.assertRaises(ValueError):
            extract_checked(archive, target, **limits)
        self.assertFalse(target.exists(), 'reject the entire archive before writing')

    def test_regular_files_and_apple_metadata(self):
        archive = self.archive([('source/', tarfile.DIRTYPE, b''),
                                ('source/configure', tarfile.REGTYPE, b'original'),
                                ('source/._configure', tarfile.REGTYPE, b'metadata')])
        target = self.root / 'destination'
        receipt = extract_checked(archive, target)
        self.assertEqual((target / 'source/configure').read_bytes(), b'original')
        self.assertFalse((target / 'source/._configure').exists())
        self.assertEqual(receipt['skipped_apple_metadata'], 1)
        self.assertEqual(receipt['archive_sha256'], sha256(archive))

    def test_traversal_absolute_and_links(self):
        for name, kind in [('.', tarfile.REGTYPE), ('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE),
                           ('source/link', tarfile.SYMTYPE), ('hard', tarfile.LNKTYPE),
                           ('device', tarfile.CHRTYPE)]:
            with self.subTest(name=name, kind=kind):
                self.reject([('source/ok', tarfile.REGTYPE, b'ok'), (name, kind, b'x')])

    def test_duplicates_and_file_directory_collisions(self):
        self.reject([('.', tarfile.REGTYPE, b'x')])
        for names in [('same', './same'), ('parent', 'parent/child'), ('p/child', 'p')]:
            with self.subTest(names=names):
                self.reject([(name, tarfile.REGTYPE, b'x') for name in names])

    def test_entry_count_and_expanded_sizes(self):
        self.reject([('a', tarfile.REGTYPE, b'x'), ('b', tarfile.REGTYPE, b'x')], max_entries=1)
        self.reject([('a', tarfile.REGTYPE, b'xx')], max_file_bytes=1)
        self.reject([('a', tarfile.REGTYPE, b'xx'), ('b', tarfile.REGTYPE, b'xx')], max_bytes=3)

    def test_existing_directory_and_digest_mismatch(self):
        archive = self.archive([('a', tarfile.REGTYPE, b'x')])
        with self.assertRaises(ValueError):
            verify_digest(archive, '0' * 64)
        target = self.root / 'existing'
        target.mkdir()
        (target / 'retain').write_text('preserve')
        with self.assertRaises(FileExistsError):
            extract_checked(archive, target)
        self.assertEqual((target / 'retain').read_text(), 'preserve')


class BundledNativeTests(unittest.TestCase):
    def test_current_source_built_bundle_and_missing_files(self):
        from unittest.mock import patch
        import local_server
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            directory = root / 'vendor/native/macos-arm64'
            directory.mkdir(parents=True)
            # An incomplete current bundle cannot fall back to historical files.
            old = root / '23_treePL集成_20260928/05_软件内置组件/01_macOS_arm64'
            old.mkdir(parents=True)
            (old / 'treePL').write_text('historical')
            with patch.object(local_server, 'PROJECT_ROOT', root), patch.object(local_server.platform, 'system', return_value='Darwin'), patch.object(local_server.platform, 'machine', return_value='arm64'):
                self.assertIsNone(local_server.bundled_treepl())
                for name in ['treePL', 'libadolc.2.dylib', 'libomp.dylib']:
                    (directory / name).write_text('new')
                self.assertEqual(local_server.bundled_treepl(), directory / 'treePL')
                (directory / 'libomp.dylib').unlink()
                self.assertIsNone(local_server.bundled_treepl())


if __name__ == '__main__':
    unittest.main()
