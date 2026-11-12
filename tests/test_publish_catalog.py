import contextlib
import io
import json
import os
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
        (self.cat / "styles").mkdir(parents=True)
        (self.cat / "index.html").write_text(HTML, encoding="utf-8")
        cj = {"schema": "x/1", "url": URL0, "entries": [{"id": "a", "name": "café"}], "z": 1}
        (self.cat / "catalog.json").write_text(json.dumps(cj, indent=1, ensure_ascii=False), encoding="utf-8")
        for i in range(5):
            (self.cat / "styles" / ("f%d.css" % i)).write_text("x" * (i + 1))
        self.out = self.tmp / "out"

    def plan(self, batch="3"):
        return run("plan", "--catalog-dir", str(self.cat), "--out", str(self.out), "--batch", batch)


class PlanTests(Base):
    def test_batching(self):
        code, text, _ = self.plan("3")
        self.assertEqual(code, 0)
        self.assertIn("files: 7", text)
        self.assertIn("batches: 3", text)  # page + 2, then 3, then 1
        b = [json.loads((self.out / ("batch-%d.json" % n)).read_text()) for n in (1, 2, 3)]
        self.assertEqual([len(x["files"]) for x in b], [2, 3, 1])
        allf = [p for x in b for p in x["files"]]
        self.assertEqual(sorted(allf), sorted(set(allf)))
        self.assertNotIn("index.html", allf)
        self.assertEqual(len(allf), 6)
        self.assertNotIn("url", b[0])
        self.assertEqual(b[1]["url"], "<url from batch 1>")
        for x in b:
            self.assertEqual(x["file_path"], "index.html")
            self.assertEqual(x["root"], str(self.cat.resolve()))
            self.assertEqual(x["icon"], "catalog")
            self.assertEqual(x["capabilities"]["db"]["rules"][0]["write"], "admin")
            for k in ("description", "label"):
                self.assertTrue(x[k])
        self.assertIn("Fake Catalog", b[0]["description"])
        self.assertEqual(b[0]["files"]["styles/f0.css"], "styles/f0.css")

    def test_determinism(self):
        self.plan()
        first = {p.name: p.read_bytes() for p in self.out.glob("*.json")}
        self.plan()
        self.assertEqual(first, {p.name: p.read_bytes() for p in self.out.glob("*.json")})

    def test_duplicate_detection(self):
        with self.assertRaises(pc.Fail):
            pc.check_dupes(["a/b.css", "a/B.css"])
        with self.assertRaises(pc.Fail):
            pc.build_batches([("index.html", 1), ("x", 1), ("x", 1)], 3)

    def test_size_limits(self):
        with self.assertRaises(pc.Fail):
            pc.build_batches([("index.html", 1), ("big", pc.MAX_FILE + 1)], 3)
        with self.assertRaises(pc.Fail):
            pc.build_batches([("index.html", 1)] + [("f%d" % i, pc.MAX_FILE) for i in range(5)], 10)

    def test_stale_batches_removed(self):
        self.plan("3")
        self.plan("100")
        self.assertEqual([p.name for p in self.out.glob("batch-*.json")], ["batch-1.json"])

    def test_real_catalog_smoke(self):
        real = REPO / "skill" / "catalog"
        before = sorted(p.relative_to(REPO).as_posix() for p in REPO.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
        code, text, _ = run("plan", "--catalog-dir", str(real), "--out", str(self.out), "--batch", "250")
        after = sorted(p.relative_to(REPO).as_posix() for p in REPO.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
        self.assertEqual(code, 0)
        self.assertIn("files: 391", text)
        self.assertIn("batches: 2", text)
        self.assertEqual(before, after)
        self.assertEqual(sorted(os.listdir(self.out)), ["batch-1.json", "batch-2.json"])


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
