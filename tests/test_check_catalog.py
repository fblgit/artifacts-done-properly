"""tools/check_catalog.py: the committed index is what the headers build, and the headers and the tree have no problem."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_index import ix, make_catalog, star  # noqa: E402

TOOL = Path(__file__).resolve().parent.parent / "tools" / "check_catalog.py"


class CheckCatalog(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.d = Path(t.name) / "catalog"
        make_catalog(self.d)

    def index(self, change=lambda cat: None):
        """Write the index the headers build, changed by `change`."""
        cat = ix.build_index(str(self.d))
        change(cat)
        (self.d / "catalog.json").write_text(json.dumps(cat), encoding="utf-8")

    def tool(self):
        r = subprocess.run([sys.executable, "-I", str(TOOL), str(self.d)], capture_output=True, text=True)
        return r.returncode, r.stdout

    def fails(self, said):
        code, out = self.tool()
        self.assertEqual((code, said in out), (1, True), out)

    def test_the_built_index_passes_and_each_difference_fails(self):
        self.index()
        self.assertEqual(self.tool()[0], 0)
        box = lambda c: c["entries"][0]
        for change, said in ((lambda c: box(c).update(about="x"), "kit.box.about: on disk, not part of the built index"),
                             (lambda c: c.update(schema="kit-catalog/1"), 'schema: on disk "kit-catalog/1"'),
                             (lambda c: box(c)["files"][0].pop("bytes"), "kit.box.files[kit/box.js]: bytes differ"),
                             (lambda c: box(c)["files"][0].update(bytes=1), "kit.box.files[kit/box.js]: bytes differ"),
                             (lambda c: box(c)["files"][1].update(sha256="0" * 64), "kit.box.files[kit/box.css]: sha256 differ"),
                             (lambda c: box(c).update(hash="0" * 12), 'kit.box.hash: on disk "000000000000"'),
                             (lambda c: box(c).pop("main"), "kit.box.main: missing on disk")):
            self.index(change)
            self.fails(said)

    def test_a_main_file_with_the_id_of_another_entry_fails(self):
        self.index()
        (self.d / "kit/box.js").write_text(star("kit.other", files="kit/box.css, kit/samples/box.json"))
        self.fails("kit.box: an entry in catalog.json without a header in the tree")

    def test_a_problem_in_a_header_fails(self):
        (self.d / "kit/zed.js").write_text(star("kit.zed", requires="kit.gone"))
        self.index()                                                                  # equal to the build: only the problem is left
        self.fails("kit.zed: @requires names no entry: kit.gone")

    def test_a_file_of_no_entry_fails_unless_the_shell_copies_it(self):
        (self.d / "styles/more.css").write_text("b{}\n")
        self.index()
        self.assertEqual(self.tool()[0], 0)
        (self.d / "notes").mkdir()
        (self.d / "notes/x.txt").write_text("x\n")
        self.fails("orphan: notes/x.txt belongs to no entry")

    def test_the_catalog_runtime_is_the_skill_runtime(self):
        self.index()
        (self.d.parent / "assets").mkdir()
        (self.d.parent / "assets/adp.js").write_text((self.d / "adp.js").read_text())
        self.assertEqual(self.tool()[0], 0)
        (self.d.parent / "assets/adp.js").write_text("//other\n")
        self.fails("runtime: skill/assets/adp.js and skill/catalog/adp.js differ")


if __name__ == "__main__":
    unittest.main()
