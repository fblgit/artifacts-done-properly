"""adp_index: the header comment of a kit file is the entry; catalog.json is the index the headers build."""
import contextlib
import hashlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "skill" / "scripts"))
import adp_index as ix  # noqa: E402

KEYS = {"id", "kind", "group", "name", "summary", "tags", "status", "version", "requires", "globals", "provides", "main", "files", "hash"}


def lines(i, name="Box", requires="none", files="none", extra=()):
    return [name, "What it is,", "in two lines.", "", "Config: not the about", "@id %s" % i, "@kind %s" % {"kit": "component"}.get(i.split(".")[0], i.split(".")[0]), "@group Demo",
            "@status new", "@version 0.1.0", "@updated 2026-10-25", "@summary One %s." % name, "@tags a, b", "@requires %s" % requires,
            "@provides Kit.x.one, Kit.x.two", "@config one(x) | first", "@config two(y) | second", "@tokens --bg --ink?", "@globals none", "@optional Kit.y",
            "@db none", '@preview {"w": 2}', "@files %s" % files, *extra]


def star(*a, **k):
    return "/**\n" + "".join(" * %s\n" % l for l in lines(*a, **k)) + " */\n.x{}\n"


def angle(*a, **k):
    return "<!--\n" + "\n".join(lines(*a, **k)) + "\n-->\n# body\n"


def make_catalog(root):
    """A three-entry catalog folder (a script with its stylesheet and sample, a guide that requires it, a template with its
    stylesheet) under a page shell; -> {kit path: sha256}."""
    files = {"kit/box.js": star("kit.box", files="kit/box.css, kit/samples/box.json", extra=["@fonts https://f.example/x"]),
             "kit/box.css": ".box{}\n", "kit/samples/box.json": "{}\n", "kit/guides/note.md": angle("guide.note", "Note", requires="kit.box"),
             "kit/templates/page.css": ".page{}\n", "kit/templates/page.html.txt": angle("template.page", "Page", files="kit/templates/page.css"),
             "index.html": "<!doctype html>\n<title>Fake</title>\n", "adp.js": "//adp\n", "content.js": "//content\n",
             "parts/app.js": "//app\n", "styles/page.css": "body{}\n"}
    for p, text in files.items():
        (root / p).parent.mkdir(parents=True, exist_ok=True)
        (root / p).write_text(text, encoding="utf-8")
    return {p: hashlib.sha256(t.encode()).hexdigest() for p, t in files.items() if p.startswith("kit/")}


class Header(unittest.TestCase):
    def test_every_file_type(self):
        for path, text in (("kit/a.js", star("kit.box")), ("kit/a.css", star("kit.box")), ("kit/a.js.txt", star("kit.box")),
                           ("kit/a.css.txt", star("kit.box")), ("kit/a.md", angle("kit.box")), ("kit/a.html.txt", angle("kit.box"))):
            with self.subTest(path=path):
                h = ix.parse_header(text, path)
                self.assertEqual((h["name"], h["about"], h["id"], h["kind"], h["summary"]),
                                 ("Box", "What it is, in two lines.", "kit.box", "component", "One Box."))
                self.assertEqual((h["tags"], h["requires"], h["globals"], h["provides"]), (["a", "b"], [], [], ["Kit.x.one", "Kit.x.two"]))
                self.assertEqual((h["config"], h["tokens"], h["preview"]),
                                 ([["one(x)", "first"], ["two(y)", "second"]], ["--bg", "--ink?"], {"w": 2}))

    def test_repeatable_json_and_no_header(self):
        h = ix.parse_header(star("kit.box", extra=["@changed 0.1.0 first", "@changed 0.1.1 second", "@source b | f.js | what"]), "kit/a.js")
        self.assertEqual((h["changed"], h["source"], h["db"]["reads"]),
                         (["0.1.0 first", "0.1.1 second"], [{"board": "b", "file": "f.js", "what": "what"}], []))
        for text, path in (("// no header", "kit/a.js"), ("{}", "kit/p.json"), ("# md", "kit/a.md")):
            self.assertEqual(ix.parse_header(text, path), {}, path)

    def test_where_the_header_is(self):
        self.assertEqual(ix.parse_header("---\ntitle: x\n---\n" + angle("guide.note"), "kit/guides/note.md")["id"], "guide.note")      # after front matter
        self.assertEqual(ix.parse_header(star("kit.box", extra=["@changed " + "x" * ix.HEAD]), "kit/a.js"), {})                     # it closes past HEAD

    def test_escapes(self):
        h = ix.parse_header(star("kit.box", extra=["@tags a\\, b, c", "@config f(a \\| b) | x | y", "@source B \\| b | f.js | w | z", "@changed one *\\/ two"]), "kit/a.js")
        self.assertEqual((h["tags"], h["config"][-1], h["source"], h["changed"]),
                         (["a, b", "c"], ["f(a | b)", "x | y"], [{"board": "B | b", "file": "f.js", "what": "w | z"}], ["one */ two"]))

    def test_tokens_split_on_spaces_and_db_sections(self):
        h = ix.parse_header(star("kit.box", extra=["@tokens --a,--b --c", "@db reads a; b / Writes c / note Reads d"]), "kit/a.js")
        self.assertEqual((h["tokens"], h["db"]), (["--a,--b", "--c"], {"reads": ["a", "b"], "writes": [], "note": "Reads d", "unread": ["Writes c"]}))


class Index(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.d = Path(t.name)
        self.sha = make_catalog(self.d)

    def run_main(self, *argv):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return ix.main(["index", str(self.d), *argv])

    def test_shape(self):
        idx = ix.build_index(str(self.d))
        self.assertEqual((idx["schema"], set(idx)), ("kit-catalog/2", {"schema", "url", "ver", "built", "entries"}))
        by = {e["id"]: e for e in idx["entries"]}
        self.assertEqual([e["main"] for e in idx["entries"]], sorted(e["main"] for e in idx["entries"]))      # not by id: guide.note is second
        self.assertEqual({i: e["main"] for i, e in by.items()},          # the file that carries the header: a template's is its .html.txt
                         {"kit.box": "kit/box.js", "guide.note": "kit/guides/note.md", "template.page": "kit/templates/page.html.txt"})
        for e in by.values():
            self.assertEqual(set(e) - {"fonts", "extends"}, KEYS, e["id"])      # no about, needs, source, changed, preview, at, by
            self.assertEqual({f["path"]: f["sha256"] for f in e["files"]}, {f["path"]: self.sha[f["path"]] for f in e["files"]})
        self.assertEqual([[f["path"] for f in by[i]["files"]] for i in ("kit.box", "template.page")],
                         [["kit/box.js", "kit/box.css", "kit/samples/box.json"], ["kit/templates/page.html.txt", "kit/templates/page.css"]])
        self.assertEqual({f["path"] for e in by.values() for f in e["files"]}, set(self.sha))
        self.assertEqual((by["kit.box"]["fonts"], "fonts" in by["guide.note"], by["guide.note"]["requires"], by["guide.note"]["tags"]),
                         ("https://f.example/x", False, ["kit.box"], ["a", "b"]))

    def test_check(self):
        self.assertEqual(self.run_main("--check"), 1)                             # no catalog.json yet
        self.assertEqual((self.run_main(), self.run_main("--check")), (0, 0))
        (self.d / "kit/box.css").write_text(".box{color:red}\n")                  # the index on disk is stale
        self.assertEqual(self.run_main("--check"), 1)
        self.assertEqual((self.run_main(), self.run_main("--check")), (0, 0))
        (self.d / "kit/bare.js").write_text("// no header\n")                     # a file of no entry
        self.assertEqual((self.run_main(), self.run_main("--check")), (1, 1))
        (self.d / "kit/bare.js").write_text(star("kit.bare").replace(" * @summary One Box.\n", ""))      # a required tag is missing
        self.assertEqual((self.run_main(), self.run_main("--check")), (1, 1))
        (self.d / "kit/bare.js").write_text(star("kit.bare"))
        self.assertEqual((self.run_main(), self.run_main("--check")), (0, 0))

    def test_problems(self):
        for tag, said in (("@files kit/gone.css", "not in the tree"), ("@files kit/box.css, kit/box.css", "twice"), ("@files kit/zed.js", "the main file itself"),
                          ("@files ../x.css", "not a path inside"), ("@files kit/box.js", "carries the header of kit.box"),
                          ("@db board/x", "@db has a section"), ("@id kit.box", "which is the @id of kit/box.js"),
                          ("@requires kit.gone", "@requires names no entry: kit.gone")):
            (self.d / "kit/zed.js").write_text(star("kit.zed", extra=[tag]))
            self.assertEqual([said in p for p in ix.problems(str(self.d))], [True], tag)


if __name__ == "__main__":
    unittest.main()
