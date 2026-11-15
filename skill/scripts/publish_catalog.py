#!/usr/bin/env python3
"""Plan, URL-stamp and parity-check the packed publish of the catalog (the skill folder's catalog/, or ~/.adp/catalog; stdlib only). It publishes nothing itself.
Run it as python3 -I <adp skill folder>/scripts/publish_catalog.py COMMAND ... (--out defaults to ./catalog-publish).

The catalog goes up packed. Published directly, as real files: the page (index.html, adp.js, content.js, parts/, styles/), catalog.json, and the
kit files the inbox needs to run (the closure of BOOT_ENTRY). Everything else under kit/ rides the seed (seed.json and seed/ packs, made by
`adp.py seed --data`) as ONE PROPOSAL PER KIT FOLDER: an incoming/<pid> doc and its incoming/<pid>/chunks docs, the shape `adp.py propose` writes.
adp.js's loader writes them to the db on the first open by an editor; the page's Incoming panel (Kit.inbox) lists them, and an editor's Apply
publishes each folder's files with an ifMatch per file and records it in What changed, with its real version. Nothing else unpacks.

  welcome [--url URL] [--out D]      one self-contained About ADP page as OUT/tree/index.html, to publish first: it gives the artifact its URL
  plan --url URL [--catalog-dir D] [--out D]
                                     stage the page and the seed under OUT/tree with URL stamped into the staged catalog.json and index.html
                                     (the working tree is not touched), add welcome.html, write OUT/publish.json (the Artifact publish call)
  update --url URL [--live D] [--catalog-dir D] [--out D]
                                     the day-2 plan: the repo against the local copy of the live catalog (D, default ~/.adp/catalog: adp.py catalog
                                     fetches it) as inbox proposals with the live sha as ifMatch for every changed or removed kit file, written as
                                     ArtifactData batches (OUT/update-NN.json); the page applies them when an editor has it open
  set-url URL                        stamp URL into the repo's catalog.json and the index.html comment (a commit once the catalog is live)
  check URL                          exit 1 if either place differs from URL
"""
import argparse
import difflib
import datetime
import hashlib
import html as htmllib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent      # the adp skill folder (a repo's skill/, a plugin's, or an installed adp/)
ADP = HERE / "adp.py"
# the catalog to publish: the skill folder's own catalog/ (a repo, a clone, a plugin), else the user's local copy (an installed zip: setup put it there)
DEFAULT_CATALOG = SKILL / "catalog" if (SKILL / "catalog" / "catalog.json").is_file() else Path(os.environ.get("ADP_HOME") or Path.home() / ".adp") / "catalog"
DEFAULT_OUT = Path.cwd() / "catalog-publish"
PAGE = "index.html"
REPO = "https://github.com/fblgit/artifacts-done-properly"
WELCOME = Path(__file__).with_name("welcome.html")
BOOT_ENTRY = "pattern.inbox"     # the entry the page runs to apply the proposals: it and its requires are published directly
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
    """kit/x.js -> kit ; kit/layout/x.js -> layout ; a file outside kit/ (catalog.json) -> root"""
    parts = path.split("/")
    if parts[0] != "kit":
        return "root"
    return parts[1] if len(parts) > 2 else "kit"


def texts(catalog, paths):
    """ITEMS for proposals(): every path as a new file ({path, ifMatch: None, text}); a proposal holds text."""
    out = []
    for p in paths:
        try:
            out.append({"path": p, "ifMatch": None, "text": read_text(catalog / p)})
        except UnicodeDecodeError:
            raise Fail("%s is not UTF-8 text: a proposal holds text" % p)
    return out


def proposals(items, label="Catalog kit files"):
    """One proposal per folder from ITEMS [{path, ifMatch, text, reason}] (text None: the file is removed, as adp.py propose writes it):
    [(pid, folder, files, docs)], docs being the incoming/<pid> doc and its chunk docs as {collection, id, data}."""
    groups = {}
    for it in sorted(items, key=lambda i: i["path"]):
        groups.setdefault(folder_of(it["path"]), []).append(it)
    parts = []      # a folder over the caps becomes several proposals (patterns-1, patterns-2, ...): one Apply is one publish call
    for name in sorted(groups):
        cur, size, pieces = [], 0, []
        for it in groups[name]:
            n = len((it["text"] or "").encode("utf-8"))
            if cur and (len(cur) >= MAX_FILES or size + n > MAX_BYTES):
                pieces.append(cur); cur, size = [], 0
            cur.append(it); size += n
        pieces.append(cur)
        parts += [(name if len(pieces) == 1 else "%s-%d" % (name, k), g) for k, g in enumerate(pieces, 1)]
    out = []
    for folder, group in parts:
        files, chunks, h = [], [], hashlib.sha256()
        for it in group:
            p, text = it["path"], it["text"]
            ctype = CTYPE.get(os.path.splitext(p)[1].lower(), "text/plain")
            if text is None:      # removed: content null, a reason, no sha256 (inbox.js gone())
                h.update(p.encode("utf-8") + b"\0-\0")
                files.append({"path": p, "ifMatch": it["ifMatch"], "contentType": ctype, "content": None, "reason": it.get("reason", "")})
                continue
            raw = text.encode("utf-8")
            h.update(p.encode("utf-8") + b"\0" + raw + b"\0")
            pieces = [text[i:i + CHUNK] for i in range(0, len(text), CHUNK)] or [""]
            files.append({"path": p, "ifMatch": it["ifMatch"], "contentType": ctype, "sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw), "chunks": len(pieces)})
            chunks += [{"path": p, "n": n, "of": len(pieces), "content": c} for n, c in enumerate(pieces)]
        pid = "p-catalog-%s-%s" % (folder, h.hexdigest()[:8])
        doc = {"by": "catalog", "at": "", "summary": "%s: %s (%d files)" % (label, folder, len(files)), "threads": [],
               "base": {"version": "", "page_hash": "", "docs": {}}, "parts": [], "files": files, "live_files": {}, "status": "new",
               "decided": {"by": "", "at": "", "reason": ""}, "applied": {"version": "", "at": ""}}
        docs = [{"collection": "incoming/%s/chunks" % pid, "id": str(i), "data": c} for i, c in enumerate(chunks)]
        docs.append({"collection": "incoming", "id": pid, "data": doc})
        out.append((pid, folder, files, docs))
    return out


def human(n):
    return "%.1f MB" % (n / 1048576) if n >= 1048576 else "%d KB" % round(n / 1024)


def welcome_html(catalog, url):
    """The About ADP page: welcome.html (beside this script) with the catalog's counts, version and the source commit filled in; URL may be None (before it exists)."""
    idx = json.loads(read_text(catalog / "catalog.json"))
    kinds = {}
    for e in idx["entries"]:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    files = walk(catalog)
    try:
        commit = subprocess.run(["git", "-C", str(SKILL), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        commit = "unknown"
    vals = {"REPO": REPO, "REPO_SHORT": REPO.split("github.com/")[1], "ENTRIES": len(idx["entries"]), "COMPONENTS": kinds.get("component", 0),
            "THEMES": kinds.get("theme", 0), "TEMPLATES": kinds.get("template", 0), "GUIDES": kinds.get("guide", 0), "BUILT": idx.get("built") or "unknown",
            "SCHEMA": idx.get("schema") or "unknown", "FILES": len(files), "BYTES": human(sum((catalog / p).stat().st_size for p in files)), "COMMIT": commit,
            "PLANNED": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "URL": url or "<the link of this page>"}
    text = read_text(WELCOME)
    for k, v in vals.items():
        text = text.replace("{{%s}}" % k, htmllib.escape(str(v)))
    left = re.findall(r"\{\{[A-Z_]+\}\}", text)
    if left:
        raise Fail("welcome.html has placeholders nothing fills: %s" % ", ".join(sorted(set(left))))
    return text


def cmd_welcome(a):
    catalog, out = Path(a.catalog_dir).resolve(), Path(a.out).resolve()
    if out.exists():
        shutil.rmtree(out)
    (out / "tree").mkdir(parents=True)
    write_text(out / "tree" / PAGE, welcome_html(catalog, a.url))
    obj = {"file_path": str(out / "tree" / PAGE), "root": str(out / "tree"), "files": {}, "capabilities": CAPABILITIES,
           "description": "About ADP (Artifacts Done Properly), and the artifact kit catalog.", "icon": "catalog", "label": "About ADP"}
    write_text(out / "publish.json", json.dumps(obj, indent=1, ensure_ascii=False) + "\n")
    print("welcome page: %s\npublish: %s (1 file; the artifact's URL is what this gives you: pass it to plan --url)" % (out / "tree" / PAGE, out / "publish.json"))
    return 0


def cmd_plan(a):
    catalog, out = Path(a.catalog_dir).resolve(), Path(a.out).resolve()
    if not re.fullmatch(r"https://\S+", a.url):
        raise Fail("--url must be an https:// URL without spaces")
    if not (catalog / PAGE).is_file():
        raise Fail("%s not found in %s" % (PAGE, catalog))
    files = walk(catalog)
    boot_kit = boot_kit_files(catalog)
    kit = [p for p in files if p.startswith("kit/") and p not in boot_kit]
    boot = [p for p in files if not p.startswith("kit/") or p in boot_kit]
    props = proposals(texts(catalog, kit))
    tree = out / "tree"
    if out.exists():
        shutil.rmtree(out)
    for p in boot:
        (tree / p).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(catalog / p, tree / p)
    new_cj, new_html = stamp(tree, a.url)      # the URL goes into the staged copies only: the working tree stays as it is
    write_text(tree / "catalog.json", new_cj)
    write_text(tree / PAGE, new_html)
    write_text(tree / "welcome.html", welcome_html(catalog, a.url))
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


def cmd_update(a):
    """The day-2 plan: the repo against the live catalog, as inbox proposals with an ifMatch (the live sha) for every changed or removed file."""
    catalog, out = Path(a.catalog_dir).resolve(), Path(a.out).resolve()
    live_dir = Path(a.live).expanduser().resolve()
    if not re.fullmatch(r"https://\S+", a.url):
        raise Fail("--url must be an https:// URL without spaces")
    if not (live_dir / "catalog.json").is_file():
        raise Fail("no copy of the live catalog in %s: run `adp.py catalog <url>` and its reads first (My Own Kit)" % live_dir)
    live_cj = read_text(live_dir / "catalog.json")
    live = {f["path"]: f["sha256"] for e in json.loads(live_cj)["entries"] for f in e["files"]}
    now = sorted(p for p in walk(catalog) if p.startswith("kit/"))
    items, n = [], {"changed": 0, "new": 0, "removed": 0}
    for it in texts(catalog, now):
        old = live.get(it["path"])
        if old == hashlib.sha256(it["text"].encode("utf-8")).hexdigest():
            continue
        it["ifMatch"] = old
        n["changed" if old else "new"] += 1
        items.append(it)
    for p in sorted(set(live) - set(now)):
        if p.startswith("kit/"):
            items.append({"path": p, "ifMatch": live[p], "text": None, "reason": "removed from the catalog"})
            n["removed"] += 1
    new_cj = stamp(catalog, a.url)[0]
    if new_cj != live_cj:
        items.append({"path": "catalog.json", "ifMatch": hashlib.sha256(live_cj.encode("utf-8")).hexdigest(), "text": new_cj})
        n["changed"] += 1
    if not items:
        print("nothing to update: the live catalog already holds these files")
        return 0
    props = proposals(items, "Catalog update")
    writes = [{"op": "set", "collection": d["collection"], "doc_id": d["id"], "data": d["data"]} for _pid, _folder, _files, docs in props for d in docs]
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    batches, cur, size = [], [], 0
    for w in writes:      # an ArtifactData batch holds at most 50 writes and 1 MiB; the order is kept (a proposal's chunks first, its doc last)
        n_bytes = len(json.dumps(w, ensure_ascii=False).encode("utf-8"))
        if cur and (len(cur) >= 50 or size + n_bytes > 700 * 1024):
            batches.append(cur); cur, size = [], 0
        cur.append(w); size += n_bytes
    batches.append(cur)
    for k, b in enumerate(batches, 1):
        write_text(out / ("update-%02d.json" % k), json.dumps({"url": a.url, "action": "batch", "writes": b}, ensure_ascii=False) + "\n")
    print("update: %d changed, %d new, %d removed -> %d proposals, %d batches in %s" % (n["changed"], n["new"], n["removed"], len(props), len(batches), out))
    for _pid, folder, fl, _docs in props:
        print("  %-10s %3d files  %s" % (folder, len(fl), _pid))
    print("write update-01.json ... in order with ArtifactData (action batch); the catalog page applies them when an editor has it open.\n"
          "Not covered: the page's own files (index.html, adp.js, parts/, styles/, welcome.html): their live shas are not in the index.")
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
    p.add_argument("--url", required=True)
    p.add_argument("--catalog-dir", default=str(DEFAULT_CATALOG))
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.set_defaults(fn=cmd_plan)
    p = sub.add_parser("update")
    p.add_argument("--url", required=True)
    p.add_argument("--live", default=str(Path(os.environ.get("ADP_HOME") or Path.home() / ".adp") / "catalog"))
    p.add_argument("--catalog-dir", default=str(DEFAULT_CATALOG))
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.set_defaults(fn=cmd_update)
    p = sub.add_parser("welcome")
    p.add_argument("--url", default=None)
    p.add_argument("--catalog-dir", default=str(DEFAULT_CATALOG))
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.set_defaults(fn=cmd_welcome)
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
