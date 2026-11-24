import tempfile
import unittest
from pathlib import Path
from http_security import request_allowed, static_allowed


class SecurityTests(unittest.TestCase):
    def test_host_origin_and_json(self):
        base = {"Host": "127.0.0.1:8765", "Content-Type": "application/json"}
        self.assertEqual(request_allowed(base, 8765, post=True), (True, None))
        for patch in ({"Host": "attacker.test:8765"}, {"Origin": "null"},
                      {"Origin": "https://attacker.test"}, {"Origin": "http://localhost:9999"},
                      {"Content-Type": "text/plain"}, {"Transfer-Encoding": "chunked"}):
            self.assertFalse(request_allowed({**base, **patch}, 8765, post=True)[0], patch)
        self.assertTrue(request_allowed({**base, "Origin": "http://127.0.0.1:8765"}, 8765, post=True)[0])

    def test_private_files_and_symlinks_not_served(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "site"
            root.mkdir()
            for name in ("index.html", ".env", "secret.json", "app.js"):
                (root / name).write_text("fixture")
            self.assertTrue(static_allowed(root, "/"))
            self.assertTrue(static_allowed(root, "/app.js?v=1"))
            for name in ("/.env", "/%2eenv", "/secret.json", "/../site/.env", "/tools/", "/mcp-server/"):
                self.assertFalse(static_allowed(root, name), name)
            (root / "app.js").unlink()
            secret = Path(directory) / "outside"
            secret.write_text("private")
            (root / "app.js").symlink_to(secret)
            self.assertFalse(static_allowed(root, "/app.js"))

    def test_ui_modules_are_restricted_static_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "site"
            ui = root / "ui"
            ui.mkdir(parents=True)
            for name in ("sample-names.js", "private.json", ".hidden.js"):
                (ui / name).write_text("fixture")
            (ui / "nested").mkdir()
            (ui / "nested" / "module.js").write_text("fixture")
            self.assertTrue(static_allowed(root, "/ui/sample-names.js?v=1"))
            for name in ("/ui/private.json", "/ui/.hidden.js", "/ui/%2ehidden.js",
                         "/ui/nested/module.js", "/ui/"):
                self.assertFalse(static_allowed(root, name), name)
            outside = Path(directory) / "outside.js"
            outside.write_text("private")
            (ui / "escape.js").symlink_to(outside)
            self.assertFalse(static_allowed(root, "/ui/escape.js"))


if __name__ == "__main__":
    unittest.main()
