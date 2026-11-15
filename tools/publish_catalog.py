#!/usr/bin/env python3
"""Plan, URL-stamp and parity-check the packed publish of skill/catalog/ (stdlib only). It publishes nothing itself.

The catalog goes up packed. Published directly, as real files: the page (index.html, adp.js, content.js, parts/, styles/), catalog.json, and the
kit files the inbox needs to run (the closure of BOOT_ENTRY). Everything else under kit/ rides the seed (seed.json and seed/ packs, made by
`adp.py seed --data`) as ONE PROPOSAL PER KIT FOLDER: an incoming/<pid> doc and its incoming/<pid>/chunks docs, the shape `adp.py propose` writes.
adp.js's loader writes them to the db on the first open by an editor; the page's Incoming panel (Kit.inbox) lists them, and an editor's Apply
publishes each folder's files with an ifMatch per file and records it in What changed, with its real version. Nothing else unpacks.

  plan [--catalog-dir D] [--out D]   stage the page and the seed under OUT/tree, write OUT/publish.json (the Artifact publish call)
  set-url URL                        stamp URL into catalog.json and the index.html comment (then plan again)
  check URL                          exit 1 if either place differs from URL
"""
import argparse
import difflib
import hashlib
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
BOOT_ENTRY = "pattern.inbox"      # the entry the page runs to apply the proposals: it and its requires are published directly
MAX_FILES, MAX_BYTES = 60, 600 * 1024      # one proposal = one publish call; a real call of 100 files / 900 KB went through, so stay well under it
CHUNK = 100 * 1024     # a chunk doc holds this many characters of a file (adp_loop.propose splits at CHUNK // 2 of 200 KB)
CTYPE = {".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown", ".txt": "text/plain", ".html": "text/html"}
CAPABILITIES = {
    "comments": {"customAnchors": True},
    "db": {"rules": [{"path": "", "read": "view", "write": "admin"}]},
    "user": {},
    "artifact": {},      # Apply publishes the files
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


def boot_kit_files(catalog):
    """The kit files BOOT_ENTRY needs to run: its own files and those of everything it requires, from the catalog's own index (no samples)."""
    idx = json.loads(read_text(catalog / "catalog.json"))
    by = {e["id"]: e for e in idx["entries"]}
    if BOOT_ENTRY not in by:
        raise Fail("catalog.json has no entry %s" % BOOT_ENTRY)
    seen, order = set(), []

    def visit(i):
        if i in seen:
            return
        seen.add(i)
        for r in by[i].get("requires", []):
            visit(r)
        order.append(i)
    visit(BOOT_ENTRY)
    return sorted({f["path"] for i in order for f in by[i]["files"] if f.get("role") != "sample"})


def folder_of(path):
    """kit/x.js -> kit ; kit/layout/x.js -> layout"""
    parts = path.split("/")
    return parts[1] if len(parts) > 2 else "kit"


def proposals(catalog, paths):
    """One proposal per kit folder: [(pid, folder, files, docs)], docs being the incoming/<pid> doc and its chunk docs as {collection, id, data}."""
    groups = {}
    for p in paths:
        groups.setdefault(folder_of(p), []).append(p)
    parts = []      # a folder over the caps becomes several proposals (patterns-1, patterns-2, ...): one Apply is one publish call
    for name in sorted(groups):
        cur, size, pieces = [], 0, []
        for p in groups[name]:
            n = (catalog / p).stat().st_size
            if cur and (len(cur) >= MAX_FILES or size + n > MAX_BYTES):
                pieces.append(cur); cur, size = [], 0
            cur.append(p); size += n
        pieces.append(cur)
        parts += [(name if len(pieces) == 1 else "%s-%d" % (name, k), g) for k, g in enumerate(pieces, 1)]
    out = []
    for folder, group in parts:
        files, chunks, h = [], [], hashlib.sha256()
        for p in group:
            try:
                text = read_text(catalog / p)
            except UnicodeDecodeError:
                raise Fail("%s is not UTF-8 text: a proposal holds text" % p)
            h.update(p.encode("utf-8") + b"\0" + text.encode("utf-8") + b"\0")
            pieces = [text[i:i + CHUNK] for i in range(0, len(text), CHUNK)] or [""]
            files.append({"path": p, "ifMatch": None, "contentType": CTYPE.get(os.path.splitext(p)[1].lower(), "text/plain"),
                          "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(), "size": len(text.encode("utf-8")), "chunks": len(pieces)})
            chunks += [{"path": p, "n": n, "of": len(pieces), "content": c} for n, c in enumerate(pieces)]
        pid = "p-catalog-%s-%s" % (folder, h.hexdigest()[:8])
        doc = {"by": "catalog", "at": "", "summary": "Catalog kit files: %s (%d files)" % (folder, len(files)), "threads": [],
               "base": {"version": "", "page_hash": "", "docs": {}}, "parts": [], "files": files, "live_files": {}, "status": "new",
               "decided": {"by": "", "at": "", "reason": ""}, "applied": {"version": "", "at": ""}}
        docs = [{"collection": "incoming/%s/chunks" % pid, "id": str(i), "data": c} for i, c in enumerate(chunks)]
        docs.append({"collection": "incoming", "id": pid, "data": doc})
        out.append((pid, folder, files, docs))
    return out


def cmd_plan(a):
    catalog, out = Path(a.catalog_dir).resolve(), Path(a.out).resolve()
    if not (catalog / PAGE).is_file():
        raise Fail("%s not found in %s" % (PAGE, catalog))
    files = walk(catalog)
    boot_kit = boot_kit_files(catalog)
    kit = [p for p in files if p.startswith("kit/") and p not in boot_kit]
    boot = [p for p in files if not p.startswith("kit/") or p in boot_kit]
    props = proposals(catalog, kit)
    tree = out / "tree"
    if out.exists():
        shutil.rmtree(out)
    for p in boot:
        (tree / p).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(catalog / p, tree / p)
    data = out / "proposals.json"
    write_text(data, json.dumps({"docs": [d for _pid, _folder, _files, docs in props for d in docs]}, ensure_ascii=False))
    r = subprocess.run([sys.executable, "-I", str(ADP), "seed", str(tree), "--by", "catalog", "--data", str(data)], capture_output=True, text=True)
    if r.returncode:
        raise Fail("adp.py seed failed: %s" % (r.stderr or r.stdout).strip()[-600:])
    staged = walk(tree)
    title = re.search(r"<title>(.*?)</title>", read_text(catalog / PAGE), re.S)
    obj = {
        "file_path": str(tree / PAGE),
        "root": str(tree),
        "files": {p: p for p in staged if p != PAGE},
        "capabilities": CAPABILITIES,
        "description": "%s, published packed: %d kit files wait in %d proposals, applied from the Incoming panel." % (title.group(1).strip() if title else "Catalog", len(kit), len(props)),
        "icon": "catalog",
        "label": "Packed publish",
    }
    write_text(out / "publish.json", json.dumps(obj, indent=1, ensure_ascii=False) + "\n")
    packs = [p for p in staged if p.startswith("seed/")]
    print("published directly: %d files (the page, catalog.json and %d kit files the inbox needs: %s)" % (len(boot), len(boot_kit), ", ".join(boot_kit)))
    print("proposals: %d, kit files in them: %d (%d bytes), packs: %d (%d bytes)" % (
        len(props), len(kit), sum((catalog / p).stat().st_size for p in kit), len(packs), sum((tree / p).stat().st_size for p in packs)))
    for pid, folder, fl, _docs in props:
        print("  %-10s %3d files %8d bytes  %s" % (folder, len(fl), sum(f["size"] for f in fl), pid))
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
