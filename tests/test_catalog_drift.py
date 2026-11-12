import json, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "tools" / "catalog_drift.py"

HDR = """/* Kit thing: demo (Kit.a.One, Kit.a.Two)    kit version %s
   What it is: renders gorgeous colourful sparkling widgets for dashboards.
   Needs from the board:
     config  One({x})
     css     kit/a.css; custom properties --ink --panel --c-
   db collections: none.
   Lifted from: nowhere. */
(function () {})();
"""


def entry(i, files, **kw):
    e = {"id": i, "version": "1.0.0", "about": "Renders gorgeous colourful sparkling widgets.",
         "provides": ["Kit.a.One", "Kit.a.Two"], "files": files,
         "needs": {"tokens": ["--ink", "--panel"], "db": {"reads": [], "writes": []}}}
    e.update(kw)
    return e


class Drift(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory(); self.d = Path(self.t.name)
        self.addCleanup(self.t.cleanup); self.entries = []

    def js(self, name, text):
        (self.d / name).write_text(text, encoding="utf-8")
        return [{"path": name, "role": "script"}]

    def run_tool(self, *args):
        (self.d / "catalog.json").write_text(json.dumps({"entries": self.entries}))
        return subprocess.run([sys.executable, str(TOOL), "--catalog-dir", str(self.d), *args], capture_output=True, text=True)

    def test_match(self):
        self.entries = [entry("ok", self.js("a.js", HDR % "1.0.0"))]
        r = self.run_tool("--strict")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertNotIn("ok version", r.stdout)
        self.assertIn("version", r.stdout)

    def test_version_drift_and_strict(self):
        self.entries = [entry("v", self.js("a.js", HDR % "1.0.1"))]
        r = self.run_tool()
        self.assertEqual(r.returncode, 0)
        self.assertIn("v version: header=1.0.1 catalog=1.0.0", r.stdout)
        self.assertEqual(self.run_tool("--strict").returncode, 1)

    def test_provides_drift(self):
        self.entries = [entry("p", self.js("a.js", HDR % "1.0.0"), provides=["Kit.a.One"])]
        r = self.run_tool("--strict")
        self.assertIn("p provides:", r.stdout); self.assertEqual(r.returncode, 1)

    def test_wildcards_listed_not_compared(self):
        self.entries = [entry("w", self.js("a.js", HDR % "1.0.0"))]
        r = self.run_tool()
        self.assertNotIn("w tokens", r.stdout)
        self.assertIn("wildcard tokens (not compared): w --c-", r.stdout)

    def test_missing_header(self):
        self.entries = [entry("n", self.js("a.js", "/* nothing */\n"))]
        r = self.run_tool("--strict")
        self.assertEqual(r.returncode, 0)
        self.assertIn("entries without a header: n", r.stdout)

    def test_non_js(self):
        (self.d / "a.css").write_text("a{}")
        self.entries = [entry("c", [{"path": "a.css", "role": "style"}])]
        r = self.run_tool("--strict")
        self.assertEqual(r.returncode, 0); self.assertIn("no js header: c", r.stdout)
        self.assertIn("1 no js header", r.stdout)

    def test_field_filter(self):
        self.entries = [entry("f", self.js("a.js", HDR % "9.9.9"), provides=["x"])]
        r = self.run_tool("--field", "provides")
        self.assertIn("f provides:", r.stdout); self.assertNotIn("f version", r.stdout)
        self.assertEqual(self.run_tool("--field", "about", "--strict").returncode, 0)
        self.assertNotEqual(self.run_tool("--field", "bogus").returncode, 0)

    def test_real_catalog_smoke(self):
        r = subprocess.run([sys.executable, str(TOOL)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("no header", r.stdout)
        self.assertIn("equal", r.stdout)


if __name__ == "__main__":
    unittest.main()
