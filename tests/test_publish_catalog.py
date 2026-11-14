import contextlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
import publish_catalog as pc  # noqa: E402

URL0 = "https://claude.ai/artifact/OLD"
URL1 = "https://claude.ai/artifact/NEW123"
HTML = ("<!doctype html>\n<title>Fake Catalog</title>\n<!--\nThis artifact's own URL is the catalog URL: %s\nmore\n-->\n" % URL0)


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = pc.main(list(argv))
    return code, out.getvalue(), err.getvalue()


class Base(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.tmp = Path(t.name)
        self.cat = self.tmp / "catalog"
        self.cat.mkdir()
        (self.cat / "index.html").write_text(HTML, encoding="utf-8")
        cj = {"schema": "x/1", "url": URL0, "entries": [{"id": "a", "name": "café"}], "z": 1}
        (self.cat / "catalog.json").write_text(json.dumps(cj, indent=1, ensure_ascii=False), encoding="utf-8")


class UrlTests(Base):
    def snap(self):
        return (self.cat / "catalog.json").read_bytes(), (self.cat / "index.html").read_bytes()

    def test_set_url_exactly_two_places(self):
        old_cj, old_html = self.snap()
        code, _, _ = run("set-url", URL1, "--catalog-dir", str(self.cat))
        self.assertEqual(code, 0)
        new_cj, new_html = self.snap()
        self.assertEqual(new_cj.decode().replace(URL1, URL0), old_cj.decode())
        self.assertEqual(new_html.decode().replace(URL1, URL0), old_html.decode())
        self.assertEqual(new_cj.decode().count(URL1), 1)
        self.assertEqual(new_html.decode().count(URL1), 1)
        self.assertEqual(run("check", URL1, "--catalog-dir", str(self.cat))[0], 0)

    def test_set_url_failure_writes_nothing(self):
        (self.cat / "index.html").write_text(HTML.replace("catalog URL:", "catalog link:"))
        before = self.snap()
        code, _, err = run("set-url", URL1, "--catalog-dir", str(self.cat))
        self.assertEqual(code, 1)
        self.assertIn("FAIL", err)
        self.assertEqual(before, self.snap())
        # two comment lines also fail
        (self.cat / "index.html").write_text(HTML + HTML)
        before = self.snap()
        self.assertEqual(run("set-url", URL1, "--catalog-dir", str(self.cat))[0], 1)
        self.assertEqual(before, self.snap())

    def test_check(self):
        code, text, _ = run("check", URL0, "--catalog-dir", str(self.cat))
        self.assertEqual((code, text.strip()), (0, "OK"))
        code, text, _ = run("check", URL1, "--catalog-dir", str(self.cat))
        self.assertEqual(code, 1)
        self.assertEqual(text.count("\n  "), 2)
        (self.cat / "index.html").write_text(HTML.replace(URL0, URL1))
        code, text, _ = run("check", URL1, "--catalog-dir", str(self.cat))
        self.assertEqual(code, 1)
        self.assertEqual(text.count("\n  "), 1)

    def test_real_copy_set_url_keeps_check_catalog_passing(self):
        copy = self.tmp / "real"
        shutil.copytree(REPO / "skill" / "catalog", copy)
        self.assertEqual(run("set-url", URL1, "--catalog-dir", str(copy))[0], 0)
        r = subprocess.run([sys.executable, str(REPO / "tools" / "check_catalog.py"), str(copy)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(run("check", URL1, "--catalog-dir", str(copy))[0], 0)


if __name__ == "__main__":
    unittest.main()
