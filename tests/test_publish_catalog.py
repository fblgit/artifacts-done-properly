import contextlib
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "skill" / "scripts"))
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

    def plan(self, cat=None):
        return run("plan", "--url", URL1, "--catalog-dir", str(cat or self.cat), "--out", str(self.out))


def tree_of(root):
    return sorted(p.relative_to(root).as_posix() for p in Path(root).rglob("*") if p.is_file() and "__pycache__" not in p.parts)


def seed_docs(tree):
    """Every doc the seed under TREE holds: {(collection, id): data}."""
    out = {}
    for p in json.loads((tree / "seed.json").read_text())["packs"]:
        for d in json.loads((tree / p).read_text())["docs"]:
            out[(d["collection"], d["id"])] = d["data"]
    return out


class PlanTests(Base):
    def test_real_catalog_boots_with_the_inbox_and_every_other_kit_file_rides_one_proposal(self):
        real = REPO / "skill" / "catalog"
        before = tree_of(REPO)
        code, text, _ = self.plan(real)
        self.assertEqual(code, 0, text)
        self.assertEqual(before, tree_of(REPO))      # it publishes nothing and writes nothing in the repo
        pub = json.loads((self.out / "publish.json").read_text())
        tree = self.out / "tree"
        self.assertEqual(pub["file_path"], str((tree / "index.html").resolve()))
        for k in ("artifact", "db", "comments", "user"):
            self.assertIn(k, pub["capabilities"])
        # what is published directly: the page, catalog.json, the seed and the kit files the inbox needs (its entry and what it requires)
        idx = json.loads((real / "catalog.json").read_text())
        by = {e["id"]: e for e in idx["entries"]}
        need, todo = set(), [pc.BOOT_ENTRY]
        while todo:
            e = by[todo.pop()]
            todo += [r for r in e.get("requires", []) if r not in need]
            need.add(e["id"])
        boot_kit = sorted(f["path"] for i in need for f in by[i]["files"] if f.get("role") != "sample")
        self.assertIn("kit/patterns/inbox.js", boot_kit)
        direct = sorted(p for p in pub["files"] if p.startswith("kit/"))
        self.assertEqual(direct, boot_kit)
        self.assertIn("catalog.json", pub["files"])
        self.assertIn("seed.json", pub["files"])
        self.assertIn("welcome.html", pub["files"])      # About ADP, published beside the catalog
        self.assertEqual(json.loads((tree / "catalog.json").read_text())["url"], URL1)      # the URL is in the staged copies, not in the working tree
        self.assertIn("catalog URL: " + URL1, (tree / "index.html").read_text())
        self.assertIn(URL1, (tree / "welcome.html").read_text())
        # every other kit file is in exactly one proposal (one per kit folder), chunks joined byte for byte
        docs = seed_docs(tree)
        props = {i: d for (c, i), d in docs.items() if c == "incoming"}
        self.assertEqual(sorted({i.split("-")[2] for i in props}), ["guides", "kit", "layout", "patterns", "samples", "templates", "themes", "viz"])
        seen = []
        for pid, p in props.items():
            self.assertEqual((p["status"], p["parts"], p["by"]), ("new", [], "catalog"))
            self.assertLessEqual(len(p["files"]), pc.MAX_FILES)      # one Apply is one publish call: a folder over the caps is split
            self.assertLessEqual(sum(f["size"] for f in p["files"]), pc.MAX_BYTES + max(f["size"] for f in p["files"]))
            chunks = {}
            for (c, i), d in docs.items():
                if c == "incoming/%s/chunks" % pid:
                    chunks.setdefault(d["path"], []).append(d)
            for f in p["files"]:
                self.assertIsNone(f["ifMatch"])      # a new file
                text_of = "".join(c["content"] for c in sorted(chunks[f["path"]], key=lambda c: c["n"]))
                self.assertEqual(text_of, (real / f["path"]).read_text(encoding="utf-8"), f["path"])
                self.assertEqual(hashlib.sha256(text_of.encode("utf-8")).hexdigest(), f["sha256"])
                seen.append(f["path"])
        want = sorted(q for q in tree_of(real) if q.startswith("kit/") and q not in boot_kit)
        self.assertEqual(sorted(seen), want)
        self.assertEqual(len(seen), len(set(seen)))

    def test_plan_needs_a_url_and_welcome_is_one_page_with_the_catalogs_counts(self):
        with self.assertRaises(SystemExit): run("plan", "--catalog-dir", str(self.cat), "--out", str(self.out))      # --url is mandatory
        real = REPO / "skill" / "catalog"
        code, _, _ = run("welcome", "--catalog-dir", str(real), "--out", str(self.out))
        self.assertEqual(code, 0)
        page = (self.out / "tree" / "index.html").read_text()
        self.assertNotIn("{{", page)
        entries = json.loads((real / "catalog.json").read_text())["entries"]
        self.assertIn("<b>%d</b><span>entries</span>" % len(entries), page)
        self.assertIn("<b>%d</b><span>themes</span>" % sum(e["kind"] == "theme" for e in entries), page)
        self.assertEqual(json.loads((self.out / "publish.json").read_text())["files"], {})      # one file: the page, whose publish gives the artifact its URL

    def test_update_makes_proposals_with_the_live_sha_for_changed_new_and_removed_files(self):
        real = REPO / "skill" / "catalog"
        live, new = self.tmp / "live", self.tmp / "new"
        for d in (live, new):
            shutil.copytree(real, d)
            pc.write_text(d / "catalog.json", pc.stamp(d, URL1)[0])      # the live copy and the new tree carry the same URL
        sha = lambda p: hashlib.sha256((live / p).read_bytes()).hexdigest()
        with open(new / "kit" / "dom.js", "a", encoding="utf-8") as f: f.write("// changed\n")
        (new / "kit" / "tokens.js").unlink()
        (new / "kit" / "newthing.js").write_text("N")
        code, text, _ = run("update", "--url", URL1, "--live", str(live), "--catalog-dir", str(new), "--out", str(self.out))
        self.assertEqual(code, 0, text)
        self.assertIn("1 changed, 1 new, 1 removed", text)
        docs = [w for f in sorted(self.out.glob("update-*.json")) for w in json.loads(f.read_text())["writes"]]
        files = {f["path"]: f for w in docs if w["collection"] == "incoming" for f in w["data"]["files"]}
        self.assertEqual(sorted(files), ["kit/dom.js", "kit/newthing.js", "kit/tokens.js"])
        self.assertEqual(files["kit/dom.js"]["ifMatch"], sha("kit/dom.js"))      # changed: the live sha, so a file that moved meanwhile is held
        self.assertIsNone(files["kit/newthing.js"]["ifMatch"])
        self.assertEqual((files["kit/tokens.js"]["ifMatch"], files["kit/tokens.js"]["content"], "sha256" in files["kit/tokens.js"]), (sha("kit/tokens.js"), None, False))
        self.assertEqual(docs[-1]["collection"], "incoming")      # a proposal's doc is written after its chunks
        shutil.rmtree(self.out)
        same = run("update", "--url", URL1, "--live", str(live), "--catalog-dir", str(live), "--out", str(self.out))
        self.assertIn("nothing to update", same[1])
        self.assertEqual(run("update", "--url", URL1, "--live", str(self.tmp / "none"), "--out", str(self.out))[0], 1)      # no copy of the live catalog

    def test_a_file_that_is_not_text_stops_the_plan(self):
        cj = json.loads((self.cat / "catalog.json").read_text())
        cj["entries"] = [{"id": pc.BOOT_ENTRY, "files": [], "requires": []}]
        (self.cat / "catalog.json").write_text(json.dumps(cj))
        (self.cat / "kit").mkdir()
        (self.cat / "kit" / "x.bin").write_bytes(b"\xff\xfe\x00\x80")
        code, _, err = self.plan()
        self.assertEqual(code, 1)
        self.assertIn("not UTF-8", err)

    def test_a_catalog_without_its_page_stops_the_plan(self):
        (self.cat / "index.html").unlink()
        code, _, err = self.plan()
        self.assertEqual(code, 1)
        self.assertIn("index.html", err)


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

    def test_real_copy_set_url_keeps_adp_catalog_passing(self):
        copy = self.tmp / "real"
        shutil.copytree(REPO / "skill" / "catalog", copy)
        self.assertEqual(run("set-url", URL1, "--catalog-dir", str(copy))[0], 0)
        r = subprocess.run([sys.executable, str(REPO / "skill" / "scripts" / "adp_catalog.py"), str(copy)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(run("check", URL1, "--catalog-dir", str(copy))[0], 0)


if __name__ == "__main__":
    unittest.main()
