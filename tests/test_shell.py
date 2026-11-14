"""adp_shell: the catalog as it is published, a thin shell plus kit packs and a seed, with no kit/ file sent."""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_index import ix, make_catalog  # noqa: E402  (it puts skill/scripts on the path)
import adp_shell  # noqa: E402


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def build(cat, out, **kw):
    said = io.StringIO()
    with contextlib.redirect_stdout(said), contextlib.redirect_stderr(io.StringIO()):
        return adp_shell.build_catalog(str(cat), str(out), **kw), said.getvalue()


class Shell(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t = tempfile.TemporaryDirectory()
        cls.addClassCleanup(t.cleanup)
        cls.cat, cls.out = Path(t.name) / "catalog", Path(t.name) / "out"
        make_catalog(cls.cat)
        (cls.cat / "catalog.json").write_text(json.dumps({"url": "https://claude.ai/artifact/OLD", "ver": "v9"}))      # the publish before this one
        cls.pub, cls.said = build(cls.cat, cls.out, by="tester")
        cls.index, cls.seed, cls.kit = (load(cls.out / n) for n in ("catalog.json", "seed.json", "kit.json"))
        cls.docs = [x for p in cls.seed["packs"] for x in load(cls.out / p)["docs"]]
        cls.disk = {p.relative_to(cls.cat).as_posix(): p.read_bytes().decode() for p in (cls.cat / "kit").rglob("*") if p.is_file()}

    def test_out_dir_is_the_shell_and_no_kit(self):
        self.assertEqual(sorted(os.listdir(self.out)),
                         ["adp.js", "catalog.json", "content.js", "index.html", "kit.json", "kitpack", "parts", "search.json", "seed", "seed.json", "styles"])
        for p in ("index.html", "adp.js", "content.js", "parts/app.js", "styles/page.css"):
            self.assertEqual((self.out / p).read_bytes(), (self.cat / p).read_bytes(), p)
        built = ix.build_index(str(self.cat))
        self.assertEqual((self.index["schema"], self.index["entries"]), ("kit-catalog/2", built["entries"]))
        self.assertEqual((built["url"], built["ver"], self.index["url"], self.index["ver"]), ("https://claude.ai/artifact/OLD", "v9", "", ""))      # shipped without a link

    def test_search_json_has_each_entry_and_the_about_the_index_lacks(self):
        got = [(x["id"], x["about"], x["source"]) for x in load(self.out / "search.json")]
        self.assertEqual(got, [(e["id"], "What it is, in two lines.", "") for e in self.index["entries"]])
        self.assertNotIn("What it is", (self.out / "catalog.json").read_text(encoding="utf-8"))

    def test_the_shipped_page_does_not_name_the_catalog_before_it(self):
        with tempfile.TemporaryDirectory() as t:
            make_catalog(Path(t) / "catalog")
            line = "<!--\nThis artifact's own URL is the catalog URL%s\nmore\n-->\n"
            (Path(t) / "catalog" / "index.html").write_text(line % ": https://claude.ai/artifact/OLD")
            build(Path(t) / "catalog", Path(t) / "out")
            self.assertEqual((Path(t) / "out" / "index.html").read_text(), line % ".")
            self.assertIn("claude.ai/artifact/OLD", (Path(t) / "catalog" / "index.html").read_text())

    def test_every_kit_file_is_in_the_kit_packs_once(self):
        self.assertEqual((self.kit["schema"], self.kit["files"]), ("adp-kit/1", len(self.disk)))        # the count is the files on disk
        self.assertEqual(self.kit["packs"], sorted("kitpack/" + n for n in os.listdir(self.out / "kitpack")))
        packs = [load(self.out / p) for p in self.kit["packs"]]
        self.assertEqual([(k["schema"], k["pack"], k["of"]) for k in packs], [("adp-kit/1", n, len(packs)) for n in range(1, len(packs) + 1)])
        packed = [x for k in packs for x in k["files"]]
        self.assertEqual((len(packed) - 1, {x["path"]: x["text"] for x in packed[:-1]}), (len(self.disk), self.disk))
        self.assertEqual(packed[-1], {"path": self.kit["probe"], "text": json.dumps({"stamp": self.kit["stamp"]})})      # the stamp file, last
        self.assertNotIn(self.kit["probe"], [f["path"] for e in self.index["entries"] for f in e["files"]])

    def test_small_packs_still_hold_every_file_once(self):
        files = adp_shell.kit_files(str(self.cat))
        with tempfile.TemporaryDirectory() as t:
            kit = adp_shell.write_kit(t, files, 1)                                                      # one byte a pack: a pack per file
            got = [x for p in kit["packs"] for x in load(Path(t) / p)["files"]]
            other = adp_shell.write_kit(t, [dict(files[0], text="changed")] + files[1:], 1)["stamp"]
        self.assertEqual((len(kit["packs"]), kit["files"], got[:-1], got[-1]["path"]), (len(files) + 1, len(self.disk), files, "kit/_stamp.json"))
        self.assertNotEqual(kit["stamp"], other)                                                        # the stamp names the kit's bytes

    def test_the_seed_holds_the_entries_and_no_kit_file(self):
        self.assertEqual(self.seed["packs"], sorted("seed/" + n for n in os.listdir(self.out / "seed")))
        self.assertEqual((self.seed["docs"], self.seed["by"]), (len(self.docs), "tester"))
        self.assertNotIn("blobs", {x["collection"] for x in self.docs})
        entries = [x for x in self.docs if x["collection"] == "entries"]
        self.assertEqual([(x["id"], x["data"]) for x in entries], [(e["id"], e) for e in self.index["entries"]])       # the index record
        text = "".join((self.out / p).read_text(encoding="utf-8") for p in self.seed["packs"])
        self.assertEqual([p for p, t in self.disk.items() if len(t) > 20 and json.dumps(t)[1:-1] in text], [])            # no file's text

    def test_publish_object_has_no_url_and_names_no_kit_path(self):
        self.assertEqual(json.loads(self.said), self.pub)                                      # the one line it prints is the Artifact call
        self.assertNotIn("url", self.pub)
        self.assertEqual((self.pub["file_path"], self.pub["root"]), (str(self.out / "index.html"), str(self.out)))
        found = {p.relative_to(self.out).as_posix() for p in self.out.rglob("*") if p.is_file()}
        self.assertEqual(set(self.pub["files"]), found - {"index.html"})
        self.assertEqual([p for p in found if p.split("/")[0] == "kit"], [])
        self.assertTrue({"catalog.json", "seed.json", "kit.json", *self.seed["packs"], *self.kit["packs"]} <= set(self.pub["files"]))
        self.assertEqual((self.pub["capabilities"]["artifact"], self.pub["capabilities"]["db"]["rules"][0]["write"]), ({}, "admin"))

    def test_a_folder_that_holds_a_kit_is_refused_and_left_as_it_is(self):
        with tempfile.TemporaryDirectory() as t:
            make_catalog(Path(t) / "out")                                                      # a copy of the source, given as OUT_DIR
            with self.assertRaisesRegex(SystemExit, "not a catalog shell: kit"):
                build(self.cat, Path(t) / "out")
            self.assertTrue((Path(t) / "out" / "kit" / "box.js").is_file())

    def test_headers_with_problems_and_twin_paths_are_refused_before_any_write(self):
        twins = [{"path": "kit/Box.js", "text": ""}, {"path": "kit/box.js", "text": ""}]       # one path once case is folded
        with tempfile.TemporaryDirectory() as t:
            with mock.patch.object(adp_shell, "kit_files", return_value=twins), self.assertRaisesRegex(SystemExit, "differ only in case"):
                build(self.cat, Path(t) / "out")
            make_catalog(Path(t) / "catalog")
            (Path(t) / "catalog" / "kit" / "stray.js").write_text("//no header\n")
            with self.assertRaisesRegex(SystemExit, "stray.js: no entry names it"):
                build(Path(t) / "catalog", Path(t) / "out")
            self.assertFalse((Path(t) / "out").exists())

    def test_a_file_or_a_publish_over_the_size_limit_is_refused(self):
        for name, said in (("MAX_FILE", "more than one published file holds: .*kit.json"), ("MAX_TOTAL", "over 20 in one publish")):
            with tempfile.TemporaryDirectory() as t, mock.patch.object(adp_shell, name, 20), self.assertRaisesRegex(SystemExit, said):
                build(self.cat, Path(t) / "out")

    def test_an_empty_kit_is_refused(self):
        with tempfile.TemporaryDirectory() as t:
            make_catalog(Path(t) / "catalog")
            shutil.rmtree(Path(t) / "catalog" / "kit")
            (Path(t) / "catalog" / "kit").mkdir()
            with self.assertRaisesRegex(SystemExit, "kit holds no file"):
                build(Path(t) / "catalog", Path(t) / "out")
            self.assertFalse((Path(t) / "out").exists())                                       # refused before any write

    def test_the_same_tree_builds_the_same_bytes(self):
        with tempfile.TemporaryDirectory() as t:
            cat, out = Path(t) / "catalog", Path(t) / "out"
            make_catalog(cat)
            index = dict(ix.build_index(str(cat)), built="2020-01-01T00:00:00Z")               # the index on disk, as `adp.py index` left it
            (cat / "catalog.json").write_text(json.dumps(index))
            got = []
            for _ in range(2):
                build(cat, out, by="tester", at="2026-01-01T00:00:00Z")
                got.append({p.relative_to(out).as_posix(): p.read_bytes() for p in out.rglob("*") if p.is_file()})
            self.assertEqual((got[0], load(out / "catalog.json")["built"]), (got[1], index["built"]))

    def test_more_files_than_one_publish_takes_is_refused(self):
        import adp
        with tempfile.TemporaryDirectory() as t, mock.patch.object(adp, "LIMIT", 3):
            with self.assertRaisesRegex(SystemExit, "over 3 in one publish"):
                build(self.cat, Path(t) / "out")


if __name__ == "__main__":
    unittest.main()
