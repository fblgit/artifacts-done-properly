import contextlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "plugins" / "artifacts-done-properly" / "skills" / "adp" / "scripts"))
import adp_catalog as inv  # noqa: E402

# A small tree that carries the cases a scanner gets wrong. Every name in PROSE sits where nothing reads it.
PROSE = {"--header-prose", "--js-header", "--commented", "--line-comment", "--block-comment", "--in-string", "--in-comment",
         "--between-tags", "--sample-token", "--in-markdown", "--in-python", "--ghost", "--nope"}
BOX_CSS = '''/**
 * Box
 * A box; var(--header-prose) here is prose.
 *
 * @id kit.box
 */
/* .old{color:var(--commented)} */
.box{background:var(--bg-image,none) 0 0/var(--bg-size,auto) var(--bg);color:var(--ink);font:var(--text-size,15px)/var(--leading,1.55) var(--f-display, var(--f-ui))}
.box::after{content:"var(--in-string); /* no comment */ #abc";border:1px solid var(--seam, #ccc);border-radius:6px;outline:2px solid var(--focus)}
@container top (max-width:760px){.box{border-top:var(--edge-w) solid red;border-bottom:none;letter-spacing:.04em;text-transform:var(--label-case)}}
.speck{filter:url(#kit-speckle) invert(var(--speck-invert, 0));box-shadow:0 1px 2px rgba(0, 0, 0, .2);--local:4px;padding:var(--local);
  mask:linear-gradient(#000, transparent);
  background:url(x#fff.png) linear-gradient(#FFF, color-mix(in srgb, var(--accent) 40%, transparent))}
'''
BOX_JS = r'''/**
 * Box script
 * Reads var(--js-header) only as prose.
 *
 * @id kit.box
 * @tokens --bg, --ink, --seam?, --c-<name>
 */
// a line comment with var(--line-comment) and a quote ' that never closes
const SAFE = /^[\d "#%(),.;A-Za-z]+$/, Q = /["\\]/g;
const NS = 'http://www.w3.org/2000/svg', half = a / 2 / b;
const css = '.x{color:var(--ink);margin:var(--gap, var(--bg))}' + /* var(--block-comment) */ '.y{fill:#ABCDEF}';
const dot = k => `<i class="dot" style="background:var(--c-${k});border:2px dashed ${'var(--' + k + '-soft)'}" fill="#123456">${`stroke:var(--deep-${k})`}</i>`;
const any = n => 'var(' + n + ')';
const NAMES = ['--bg', '--seam', '--c-' + kind];
el.style.setProperty('--box-w', w + 'px');
el.style.setProperty('--box-' + side, v);
el.style.setProperty(name, v);
el.style.removeProperty('--box-w');
const got = getComputedStyle(el).getPropertyValue('--seam') + getComputedStyle(el).getPropertyValue(prop);
const col = '#000', isFont = n => n.startsWith('--f-');
'''
PAGE = '''<!--
Page
A page shell; var(--in-comment) is prose.

@id template.page
@tokens --bg, --never, --gone?
-->
<title>{{title}}</title>
<style>body{margin:0;background:var(--bg);font-family:Georgia, serif;text-transform:uppercase}</style>
<main style="color:var(--ink, #222);border-radius:var(--radius)" data-x="var(--attr)">var(--between-tags) {{catalog}}</main>
<svg><rect fill="#0A0" stroke="var(--line)"/></svg>
<script>document.body.style.setProperty('--page-h', innerHeight + 'px'); const s = '<b style="color:var(--in-js)">';</script>
'''
ALT_CSS = '''/* --ghost: var(--nope); */
:root{--paper:#fafafa;--pen:#222; --bg:var(--paper);--ink:var(--pen)}
:root{--accent:color-mix(in srgb, var(--pen) 60%, #06c);--fs-1:12px}
:root{--only-css:1px;font-size:16px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#101010;--pen:#ddd}}
:root[data-theme="dark"]{--paper:#111;--pen:#ddd}
'''
LIGHT, DARK = {"--bg": "#fff", "--ink": "#111", "--accent": "#06c", "--f-ui": "system-ui"}, {"--bg": "#000", "--ink": "#eee"}
ALT = {"light": {"--paper": "#fafafa", "--pen": "#222", "--bg": "#FAFAFA",
                 "--ink": "#333", "--accent": "color-mix(in srgb,var(--pen) 60%,#06c)",
                 "--json-only": "1"},
       "dark": {"--paper": "#111", "--pen": "#ddd", "--bg": "#111", "--ink": "#ddd"}, "scale": {"--fs-1": "12px"}}
SHARED = {"path": "kit/samples/shared.json", "role": "sample"}          # one sample, listed by three entries
ENTRIES = [
    {"id": "theme.default", "files": [{"path": "kit/themes/default.css", "role": "style"}, {"path": "kit/themes/default.json", "role": "data"}]},
    {"id": "theme.alt", "files": [{"path": "kit/themes/alt.css", "role": "style"}, {"path": "kit/themes/alt.json", "role": "data"}]},
    {"id": "kit.box", "files": [{"path": "kit/box.js", "role": "script"}, {"path": "kit/box.css", "role": "style"}, SHARED],
     "needs": {"tokens": ["--bg, --ink, --c-<name> plus kit/vocab.css", "--seam (optional)"]}},
    {"id": "kit.plain", "files": [{"path": "kit/plain.css", "role": "style"}, SHARED]},
    {"id": "template.page", "files": [{"path": "kit/templates/page.html.txt", "role": "template"}, SHARED],
     "needs": {"tokens": ["--bg, --never", "--extra-0..2 (optional)"]}},
]
FILES = {
    "catalog/catalog.json": json.dumps({"entries": ENTRIES}),
    "catalog/kit/themes/default.css": ":root{color-scheme:light;" + ";".join("%s:%s" % kv for kv in LIGHT.items()) + "}\n"
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#000;--ink:#eee}}\n'
    ':root[data-theme="dark"]{color-scheme:dark;--bg:#000;--ink:#eee}\n',
    "catalog/kit/themes/default.json": json.dumps({"light": LIGHT, "dark": DARK}),
    "catalog/kit/themes/alt.css": ALT_CSS,
    "catalog/kit/themes/alt.json": json.dumps(ALT),
    "catalog/kit/box.css": BOX_CSS,
    "catalog/kit/box.js": BOX_JS,
    "catalog/kit/plain.css": ".plain{font:inherit;border-color:CanvasText;color:transparent}\n",
    "catalog/kit/samples/shared.json": '{"t": "var(--sample-token)"}',
    "catalog/kit/templates/page.html.txt": PAGE,
    "catalog/kit/guides/note.md": "var(--in-markdown)\n",
    "catalog/index.html": '<!doctype html><body style="outline:2px solid var(--focus)"><script src="parts/app.js"></script>\n',
    "catalog/parts/app.js": "const TOKENS = ['--stripe', '--bg'];\n",
    "assets/app.js": "const TOKENS = ['--stripe', '--bg'];\n",                 # the same bytes, outside catalog/ and templates/
    "assets/tool.py": "print('var(--in-python)')\n",
    "catalog/styles/page.css": "body{color:var(--ink)}\n",
    "templates/starter/index.html.txt": '<title>{{title}}</title><div style="letter-spacing:var(--tracking)"></div>\n',
    "templates/starter/styles/page.css.txt": ".card{border:var(--edge-w, 1px) solid var(--seam);outline:var(--outline, none)}\n",
}


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = inv.main(["inventory", *argv])
    return code, out.getvalue(), err.getvalue()


class SyntheticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t = tempfile.TemporaryDirectory()
        cls.addClassCleanup(t.cleanup)
        cls.root = Path(t.name) / "skill"
        for rel, text in FILES.items():
            (cls.root / rel).parent.mkdir(parents=True, exist_ok=True)
            (cls.root / rel).write_text(text, encoding="utf-8")
        cls.out = inv.inventory(str(cls.root))
        cls.box, cls.page = cls.out["entries"]["kit.box"], cls.out["entries"]["template.page"]

    def test_prose_is_not_a_read(self):
        self.assertEqual(PROSE & set(self.out["tokens"]), set())
        self.assertEqual(run("--root", str(self.root))[1], json.dumps(self.out, indent=1, sort_keys=True, ensure_ascii=False) + "\n")

    def test_stylesheet_reads(self):
        u, css, js = self.box["uses"], "skill/catalog/kit/box.css", "skill/catalog/kit/box.js"
        self.assertEqual(sorted(u), ["--accent", "--bg", "--bg-image", "--bg-size", "--edge-w", "--f-display", "--f-ui", "--focus", "--gap",
                                     "--ink", "--label-case", "--leading", "--local", "--seam", "--speck-invert", "--text-size"])
        self.assertEqual(u["--f-display"]["fallbacks"], ["var(--f-ui)"])
        self.assertEqual(u["--f-ui"], {"n": 1, "bare": 1, "in_fallback": 1, "fallbacks": [], "files": {css: 1}})
        self.assertEqual(u["--bg"], {"n": 2, "bare": 2, "in_fallback": 1, "fallbacks": [], "files": {css: 1, js: 1}})
        self.assertEqual(u["--seam"], {"n": 2, "bare": 1, "in_fallback": 0, "fallbacks": ["#ccc"], "files": {css: 1, js: 1}})   # var() and getPropertyValue
        self.assertEqual([u[k]["fallbacks"] for k in ("--bg-image", "--bg-size", "--text-size", "--leading", "--speck-invert", "--gap")],
                         [["none"], ["auto"], ["15px"], ["1.55"], ["0"], ["var(--bg)"]])

    def test_script_sets_names_and_run_time_names(self):
        self.assertEqual(self.box["sets"], {"--box-w": 1, "--local": 1})            # setProperty and a declaration; removeProperty is neither
        self.assertEqual(self.box["named"], {"--bg": 1, "--seam": 1})

        def line(s):
            return BOX_JS[:BOX_JS.index(s)].count("\n") + 1
        dot = line("const dot")
        self.assertEqual([(d["line"], d["how"], d["pattern"]) for d in self.box["dynamic"]],
                         [(dot, "read", "--*-soft"), (dot, "read", "--c-*"), (dot, "read", "--deep-*"), (line("const any"), "read", "*"),
                          (line("const NAMES"), "name", "--c-*"), (line("'--box-' + side"), "set", "--box-*"), (line("setProperty(name"), "set", "*"),
                          (line("const got"), "read", "*"), (line("const col"), "name", "--f-*")])
        self.assertEqual({d["file"] for d in self.box["dynamic"]}, {"skill/catalog/kit/box.js"})
        self.assertEqual(self.box["colour_strings"], [{"file": "skill/catalog/kit/box.js", "line": line("const col"), "value": "#000"}])

    def test_declared_against_read(self):
        self.assertEqual(self.box["declares"], {"required": ["--bg", "--ink"], "optional": ["--seam"], "patterns": ["--c-<name>"]})
        self.assertNotIn("needs_differ", self.box)
        self.assertEqual(self.box["undeclared"], ["--accent", "--bg-image", "--bg-size", "--edge-w", "--f-display", "--f-ui", "--focus", "--gap",
                                                  "--label-case", "--leading", "--speck-invert", "--text-size"])       # --local: the entry sets it
        self.assertEqual(self.page["declares"], {"required": ["--bg", "--never"], "optional": ["--gone"], "patterns": []})
        self.assertEqual(self.page["needs_differ"], {"header_only": ["--gone?"], "needs_only": ["--extra-0?", "--extra-1?", "--extra-2?"]})
        self.assertEqual(self.page["undeclared"], ["--attr", "--in-js", "--ink", "--line", "--radius"])
        self.assertEqual(self.page["unused"], ["--gone", "--never"])
        self.assertIsNone(self.out["entries"]["kit.plain"]["declares"])

    def test_markup(self):
        self.assertEqual(sorted(self.page["uses"]), ["--attr", "--bg", "--in-js", "--ink", "--line", "--radius"])
        self.assertEqual(self.page["uses"]["--ink"]["fallbacks"], ["#222"])
        self.assertEqual(self.page["sets"], {"--page-h": 1})

    def test_look(self):
        self.assertEqual(self.box["look"], {
            "radius": {"literal": {"6px": 1}}, "case": {"token": {"--label-case": 1}}, "tracking": {"literal": {".04em": 1}},
            "family": {"token": {"--f-display": 1}}, "edge": {"literal": {"1px": 1, "2px": 1, "none": 1}, "token": {"--edge-w": 1}},
            "shadow": {"literal": {"0 1px 2px rgba(0, 0, 0, .2)": 1}}, "ring": {"mixed": {"2px solid var(--focus)": 1}},
            "colour": {"literal": {"#123456": 1, "#abcdef": 1, "#ccc": 1, "#fff": 1, "red": 1, "rgba(0,0,0,.2)": 1}}})
        self.assertEqual(self.page["look"], {"radius": {"token": {"--radius": 1}}, "case": {"literal": {"uppercase": 1}},
                                             "family": {"literal": {"Georgia, serif": 1}}, "colour": {"literal": {"#0a0": 1, "#222": 1}}})
        self.assertEqual(self.out["entries"]["kit.plain"]["look"], {"family": {"literal": {"inherit": 1}}, "colour": {"literal": {"canvastext": 1}}})
        self.assertEqual(self.out["units"]["base.starter"]["look"],
                         {"tracking": {"token": {"--tracking": 1}}, "edge": {"token": {"--edge-w": 1}}, "ring": {"token": {"--outline": 1}}})

    def test_theme(self):
        alt, default = self.out["themes"]["theme.alt"], self.out["themes"]["theme.default"]
        self.assertEqual([(b["scheme"], b["tokens"], b["color-scheme"]) for b in alt["blocks"]],
                         [("light", 4, None), ("light", 2, None), ("light", 1, None), ("dark-media", 2, None), ("dark-attr", 2, None)])
        self.assertEqual(alt["blocks"][2]["other"], [{"property": "font-size", "value": "16px", "line": 4}])
        self.assertEqual([b["color-scheme"] for b in default["blocks"]], ["light", "dark", "dark"])
        self.assertEqual(alt["declares"]["--bg"], {"light": "var(--paper)", "dark": None, "dark_via": ["--paper"]})
        self.assertEqual(alt["declares"]["--accent"]["dark_via"], ["--pen"])
        self.assertEqual(alt["declares"]["--paper"], {"light": "#fafafa", "dark": "#111"})
        self.assertEqual(alt["declares"]["--only-css"], {"light": "1px", "dark": None})
        self.assertEqual(alt["media_differs"], ["--paper"])
        self.assertEqual(alt["uses"], {"--paper": {"by": ["--bg"], "declared": True}, "--pen": {"by": ["--accent", "--ink"], "declared": True}})
        # --bg follows --paper to the json's value, --accent differs in spacing only, --fs-1 is the json's scale: none of them differs
        self.assertEqual(alt["json"], {"light": {"only_css": ["--only-css"], "only_json": ["--json-only"], "differ": ["--ink"]},
                                       "dark": {"only_css": [], "only_json": [], "differ": []}})
        self.assertEqual(alt["convention"], {"light": {"missing": ["--f-ui"], "extra": ["--json-only", "--paper", "--pen"]},
                                             "dark": {"missing": [], "extra": ["--paper", "--pen"]}})
        clean = {"only_css": [], "only_json": [], "differ": []}
        self.assertEqual((default["json"], default["media_differs"]), ({"light": clean, "dark": clean}, []))
        self.assertEqual(self.out["convention"], {"light": sorted(LIGHT), "dark": sorted(DARK)})

    def test_files_and_coverage(self):
        files = {i: x["files"] for i, x in list(self.out["entries"].items()) + list(self.out["units"].items())}
        self.assertEqual(files, {
            "kit.box": ["skill/catalog/kit/box.css", "skill/catalog/kit/box.js"], "kit.plain": ["skill/catalog/kit/plain.css"],
            "template.page": ["skill/catalog/kit/templates/page.html.txt"],
            "catalog.page": ["skill/catalog/index.html", "skill/catalog/parts/app.js", "skill/catalog/styles/page.css"],
            "base.starter": ["skill/templates/starter/index.html.txt", "skill/templates/starter/styles/page.css.txt"]})
        names = ["--bg", "--extra-0", "--ink", "--never", "--seam"]              # what catalog.json's needs hold; --c-<name> is no name
        self.assertEqual(self.out["coverage"], {
            "files": sum(not p.startswith("assets/") for p in FILES), "scanned": sum(len(v) for v in files.values()), "theme": 4,
            "unread": [{"file": "skill/catalog/catalog.json", "why": "index", "names": names},
                       {"file": "skill/catalog/kit/guides/note.md", "why": "unlisted", "names": ["--in-markdown"]},
                       {"file": "skill/catalog/kit/samples/shared.json", "why": "sample", "names": ["--sample-token"]}],
            "outside": [{"file": "skill/assets/app.js", "copy_of": "skill/catalog/parts/app.js", "names": ["--bg", "--stripe"]}]})
        c = self.out["coverage"]
        self.assertEqual(c["files"], c["scanned"] + c["theme"] + len(c["unread"]))

    def test_token_index(self):
        t = self.out["tokens"]
        both = ["theme.alt", "theme.default"]
        self.assertEqual((t["--stripe"]["named"], t["--stripe"]["read"], t["--stripe"]["themes"]["json"]["light"]), ({"catalog.page": 1}, {}, []))
        self.assertEqual((t["--focus"]["read"], t["--focus"]["themes"]["css"]["light"]), ({"catalog.page": 1, "kit.box": 1}, []))
        self.assertEqual(t["--accent"]["themes"], {"css": {"light": both, "dark": ["theme.alt"]}, "json": {"light": both, "dark": []}})
        self.assertEqual(t["--f-ui"]["themes"]["json"], {"light": ["theme.default"], "dark": []})
        self.assertEqual(t["--f-ui"]["convention"], {"light": True, "dark": False})
        self.assertEqual(t["--fs-1"]["themes"], {"css": {"light": ["theme.alt"], "dark": []}, "json": {"light": [], "dark": []}})
        self.assertEqual(t["--pen"]["read_in_themes"], {"theme.alt": 2})
        self.assertEqual(t["--bg"]["declared"], {"required": ["kit.box", "template.page"], "optional": []})
        self.assertEqual(t["--bg"]["named"], {"catalog.page": 1, "kit.box": 1})
        self.assertEqual((t["--seam"]["declared"]["optional"], t["--seam"]["read"]), (["kit.box"], {"base.starter": 1, "kit.box": 2}))
        self.assertEqual((t["--local"]["set"], t["--page-h"]["set"], t["--box-w"]["read"]), ({"kit.box": 1}, {"template.page": 1}, {}))
        # a name built at run time is listed with the names it fits, apart from read; * fits every name and stays with its entry
        built = [{k: d[k] for k in ("in", "how", "pattern")} for d in t["--box-w"]["dynamic"]]
        self.assertEqual(built, [{"in": "kit.box", "how": "set", "pattern": "--box-*"}])
        self.assertEqual([d["pattern"] for d in t["--f-ui"]["dynamic"]], ["--f-*"])
        self.assertEqual((t["--f-display"]["dynamic"], t["--bg"]["dynamic"]), (t["--f-ui"]["dynamic"], []))
        self.assertEqual([d for d in self.box["dynamic"] if d["pattern"] == "--f-*"], [{k: v for k, v in t["--f-ui"]["dynamic"][0].items() if k != "in"}])


class RealCatalogTests(unittest.TestCase):
    """What must hold for the catalog on disk, whatever it holds today: nothing here is a count to keep up."""

    @classmethod
    def setUpClass(cls):
        cls.skill = REPO / "plugins" / "artifacts-done-properly" / "skills" / "adp"
        cls.base = cls.skill.parent       # the inventory labels a file relative to the skill folder's parent: adp/catalog/...
        cls.out = inv.inventory(str(cls.skill))
        cls.entries = json.loads((cls.skill / "catalog" / "catalog.json").read_text(encoding="utf-8"))["entries"]
        cls.all = list(cls.out["entries"].items()) + list(cls.out["units"].items())

    def test_every_entry_and_page_is_there(self):
        ids = {e["id"] for e in self.entries}
        themes = {i for i in ids if i.startswith("theme.")}
        self.assertEqual((set(self.out["themes"]), set(self.out["entries"])), (themes, ids - themes))
        bases = {"base." + p.name for p in (self.skill / "templates").iterdir() if p.is_dir()}
        self.assertEqual(set(self.out["units"]), bases | {"catalog.page"})

    def test_every_file_is_accounted_for(self):
        def scans(path):
            return path[:-4].endswith((".css", ".js", ".html")) if path.endswith(".txt") else path.endswith((".css", ".js", ".html"))
        found = [p for top in ("catalog", "templates") for p in (self.skill / top).rglob("*") if p.is_file()]
        c = self.out["coverage"]
        self.assertEqual(c["files"], len(found))
        self.assertEqual(c["files"], c["scanned"] + c["theme"] + len(c["unread"]))
        themed = {"adp/catalog/" + f["path"] for e in self.entries if e["id"] in self.out["themes"] for f in e["files"]}
        scanned = {f for _, x in self.all for f in x["files"]}
        self.assertEqual(scanned, {p for p in (q.relative_to(self.base).as_posix() for q in found) if scans(p) and p not in themed})
        self.assertEqual((c["scanned"], c["theme"]), (len(scanned), len(themed)))
        for e in self.entries:                                                      # each entry scans each of its own files, shared or not
            if e["id"] in self.out["entries"]:
                mine = sorted("adp/catalog/" + f["path"] for f in e["files"] if scans(f["path"]))
                self.assertEqual(self.out["entries"][e["id"]]["files"], mine, e["id"])
        listed = {"adp/catalog/" + f["path"] for e in self.entries for f in e["files"]}
        self.assertEqual(listed & set(self.out["units"]["catalog.page"]["files"]), set())
        self.assertEqual({u["file"] for u in c["unread"]}, {q.relative_to(self.base).as_posix() for q in found} - scanned - themed)
        for o in c["outside"]:
            self.assertNotIn(o["file"], scanned)
            if o["copy_of"]:
                self.assertEqual((self.base / o["file"]).read_bytes(), (self.base / o["copy_of"]).read_bytes())

    def test_a_built_name_is_listed_with_the_names_it_fits(self):
        units = dict(self.all)
        for k, x in self.out["tokens"].items():
            for d in x["dynamic"]:
                self.assertIn({a: b for a, b in d.items() if a != "in"}, units[d["in"]]["dynamic"])
                self.assertRegex(k, "^" + re.escape(d["pattern"]).replace(r"\*", r"[\w-]*") + "$")

    def test_theme_index_is_what_the_json_files_say(self):
        t = self.out["tokens"]
        for i, th in self.out["themes"].items():
            j = json.loads((self.base / th["files"]["json"]).read_text(encoding="utf-8"))
            for s in ("light", "dark"):
                self.assertEqual({k for k in t if i in t[k]["themes"]["json"][s]}, set(j[s]), (i, s))
                if i == "theme.default":
                    self.assertEqual(self.out["convention"][s], sorted(j[s]))
                    self.assertEqual({k for k in t if t[k]["convention"][s]}, set(j[s]))

    def test_stylesheet_reads_equal_a_plain_regex_count(self):
        for i, x in self.all:
            for f in x["files"]:
                if f.endswith((".css", ".css.txt")):
                    text = re.sub(r"/\*.*?\*/", " ", (self.base / f).read_text(encoding="utf-8"), flags=re.S)
                    plain = len(re.findall(r"var\(\s*--[A-Za-z0-9_-]+\s*[,)]", text))
                    self.assertEqual(sum(u["files"].get(f, 0) for u in x["uses"].values()), plain, (i, f))

    def test_cli(self):
        cmd = [sys.executable, "-I", str(REPO / "plugins" / "artifacts-done-properly" / "skills" / "adp" / "scripts" / "adp_catalog.py"), "inventory"]
        a, b = (subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=os.sep) for _ in range(2))
        self.assertEqual((a.returncode, a.stderr), (0, ""))
        self.assertEqual(a.stdout, b.stdout)
        self.assertEqual(json.loads(a.stdout), self.out)
        code, text, err = run("--root", str(REPO / "no-such-dir"))
        self.assertEqual((code, text), (1, ""))
        self.assertIn("FAIL", err)
        with self.assertRaises(SystemExit):
            run("--bogus")


if __name__ == "__main__":
    unittest.main()
