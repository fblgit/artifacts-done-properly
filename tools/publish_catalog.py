#!/usr/bin/env python3
"""Plan, URL-stamp and parity-check the packed publish of skill/catalog/ (stdlib only). It publishes nothing itself.

The catalog goes up packed: the page's own files (index.html, adp.js, content.js, parts/, styles/) plus a seed (seed.json and seed/ packs,
made by `adp.py seed --data`) that carries the kit folders and catalog.json as `kitfiles` docs. adp.js's loader writes the docs to the db on
the first open by an editor: seed.json's `unpack` names the collection, and adp.js publishes its docs as the real files (kit/..., catalog.json),
then writes the record and reloads. Nothing else unpacks.

  plan [--catalog-dir D] [--out D]   stage the page and the seed under OUT/tree, write OUT/publish.json (the Artifact publish call)
  set-url URL                        stamp URL into catalog.json and the index.html comment (then plan again)
  check URL                          exit 1 if either place differs from URL
"""
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = ROOT / "skill" / "catalog"
DEFAULT_OUT = ROOT / "dist" / "catalog-publish"
ADP = ROOT / "skill" / "scripts" / "adp.py"
PAGE = "index.html"
COLLECTION = "kitfiles"      # seed.json `unpack`: adp.js publishes this collection's docs {path, text} as files
PACKED = ("kit/", "catalog.json")      # what rides the packs; every other file is the page's own
CAPABILITIES = {
    "comments": {"customAnchors": True},
    "db": {"rules": [{"path": "", "read": "view", "write": "admin"}]},
    "user": {},
    "artifact": {},      # adp.js publishes the unpacked files
}
COMMENT_RE = re.compile(r"(This artifact's own URL is the catalog URL: )(\S+)[ \t]*$", re.M)


class Fail(Exception):
    pass


def read_text(p):
    with open(p, "r", encoding="utf-8", newline="") as f:
        return f.read()


def write_text(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def walk(catalog):
    out = []
    for dp, dns, fns in os.walk(catalog):
        dns[:] = sorted(d for d in dns if d != "__pycache__")
        for fn in sorted(fns):
            out.append((Path(dp) / fn).relative_to(catalog).as_posix())
    return sorted(out)


def doc_id(path):
    return path.replace("/", "~")      # a doc id holds no slash


def cmd_plan(a):
    catalog, out = Path(a.catalog_dir).resolve(), Path(a.out).resolve()
    if not (catalog / PAGE).is_file():
        raise Fail("%s not found in %s" % (PAGE, catalog))
    files = walk(catalog)
    packed = [p for p in files if p.startswith(PACKED)]
    boot = [p for p in files if p not in packed]
    docs = []
    for p in packed:
        try:
            text = read_text(catalog / p)
        except UnicodeDecodeError:
            raise Fail("%s is not UTF-8 text: a pack holds text" % p)
        docs.append({"collection": COLLECTION, "id": doc_id(p), "data": {"path": p, "text": text}})
    tree = out / "tree"
    if out.exists():
        shutil.rmtree(out)
    for p in boot:
        (tree / p).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(catalog / p, tree / p)
    data = out / "kitfiles.json"
    write_text(data, json.dumps({"docs": docs}, ensure_ascii=False))
    r = subprocess.run([sys.executable, "-I", str(ADP), "seed", str(tree), "--by", "catalog", "--data", str(data), "--unpack", COLLECTION], capture_output=True, text=True)
    if r.returncode:
        raise Fail("adp.py seed failed: %s" % (r.stderr or r.stdout).strip()[-600:])
    staged = walk(tree)
    title = re.search(r"<title>(.*?)</title>", read_text(catalog / PAGE), re.S)
    obj = {
        "file_path": str(tree / PAGE),
        "root": str(tree),
        "files": {p: p for p in staged if p != PAGE},
        "capabilities": CAPABILITIES,
        "description": "%s, published packed: %d kit files unpack themselves on the first open." % (title.group(1).strip() if title else "Catalog", len(packed)),
        "icon": "catalog",
        "label": "Packed publish",
    }
    write_text(out / "publish.json", json.dumps(obj, indent=1, ensure_ascii=False) + "\n")
    packs = [p for p in staged if p.startswith("seed/")]
    print("page files: %d, packs: %d (%d bytes), kit files packed: %d (%d bytes)" % (
        len(boot), len(packs), sum((tree / p).stat().st_size for p in packs), len(packed), sum((catalog / p).stat().st_size for p in packed)))
    print("publish: %s (%d files)" % (out / "publish.json", len(staged)))
    return 0


def stamp(catalog, url):
    """Return (new_catalog_text, new_html_text); raise Fail unless exactly one place each."""
    cj, hp = catalog / "catalog.json", catalog / PAGE
    old = read_text(cj)
    obj = json.loads(old)
    if not isinstance(obj.get("url"), str):
        raise Fail("catalog.json has no string `url` field")
    obj["url"] = url
    new = json.dumps(obj, indent=1, ensure_ascii=False)
    if old.endswith("\n"):
        new += "\n"
    diff = [d for d in difflib.unified_diff(old.splitlines(), new.splitlines(), lineterm="", n=0)
            if d[:1] in "+-" and not d.startswith(("+++", "---"))]
    if len(diff) not in (0, 2) or any('"url"' not in d for d in diff):
        raise Fail("catalog.json would change in more than the url value: %r" % diff[:6])
    html = read_text(hp)
    if len(COMMENT_RE.findall(html)) != 1:
        raise Fail("expected exactly one own-URL comment line in %s" % PAGE)
    return new, COMMENT_RE.sub(lambda m: m.group(1) + url, html)


def cmd_set_url(a):
    catalog = Path(a.catalog_dir)
    if not re.fullmatch(r"https://\S+", a.url):
        raise Fail("URL must be an https:// URL without spaces")
    new_cj, new_html = stamp(catalog, a.url)
    write_text(catalog / "catalog.json", new_cj)
    write_text(catalog / PAGE, new_html)
    print("OK: url set to %s in catalog.json and %s" % (a.url, PAGE))
    return 0


def cmd_check(a):
    catalog = Path(a.catalog_dir)
    bad = []
    got = json.loads(read_text(catalog / "catalog.json")).get("url")
    if got != a.url:
        bad.append("catalog.json url is %r" % got)
    found = COMMENT_RE.findall(read_text(catalog / PAGE))
    if len(found) != 1:
        bad.append("%s has %d own-URL comment lines, expected 1" % (PAGE, len(found)))
    elif found[0][1] != a.url:
        bad.append("%s comment URL is %r" % (PAGE, found[0][1]))
    if bad:
        print("FAIL: parity with %s" % a.url)
        for b in bad:
            print("  " + b)
        return 1
    print("OK")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--catalog-dir", default=str(DEFAULT_CATALOG))
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.set_defaults(fn=cmd_plan)
    for name, fn in (("set-url", cmd_set_url), ("check", cmd_check)):
        p = sub.add_parser(name)
        p.add_argument("url")
        p.add_argument("--catalog-dir", default=str(DEFAULT_CATALOG))
        p.set_defaults(fn=fn)
    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except Fail as e:
        print("FAIL: %s" % e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
