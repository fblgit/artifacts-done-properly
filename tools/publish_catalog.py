#!/usr/bin/env python3
"""Plan, URL-stamp and parity-check a fresh publish of skill/catalog/ (stdlib only).

This script never publishes. `plan` writes batch-N.json files holding the
arguments Claude passes to the Artifact tool.

  plan [--catalog-dir D] [--out D] [--batch N]   write batch-N.json files
  set-url URL                                    stamp URL into catalog.json and the index.html comment
  check URL                                      exit 1 if either place differs from URL
"""
import argparse
import difflib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = ROOT / "skill" / "catalog"
DEFAULT_OUT = ROOT / "dist" / "catalog-publish"
MAX_FILE = 16 * 1024 * 1024
MAX_BATCH = 64 * 1024 * 1024
PAGE = "index.html"
PLACEHOLDER = "<url from batch 1>"
CAPABILITIES = {
    "comments": {"customAnchors": True},
    "db": {"rules": [{"path": "", "read": "view", "write": "admin"}]},
    "user": {},
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
        dns.sort()
        for fn in sorted(fns):
            p = Path(dp) / fn
            out.append((p.relative_to(catalog).as_posix(), p.stat().st_size))
    out.sort()
    return out


def check_dupes(paths):
    seen = {}
    for p in paths:
        k = unicodedata.normalize("NFC", p).casefold()
        if k in seen:
            raise Fail("duplicate published path: %r and %r" % (seen[k], p))
        seen[k] = p


def title_of(catalog):
    m = re.search(r"<title>(.*?)</title>", read_text(catalog / PAGE), re.S)
    return m.group(1).strip() if m else "Artifact Kit Catalog"


def build_batches(entries, batch):
    """entries: sorted [(path, size)] incl. index.html. Batch 1 holds index.html
    plus up to batch-1 files; later batches hold up to batch files."""
    check_dupes([p for p, _ in entries])
    sizes = dict(entries)
    if PAGE not in sizes:
        raise Fail("%s not found in catalog dir" % PAGE)
    for p, s in entries:
        if s > MAX_FILE:
            raise Fail("file over 16 MB: %s (%d bytes)" % (p, s))
    others = [p for p, _ in entries if p != PAGE]
    groups, i = [], 0
    first = max(batch - 1, 0)
    groups.append(others[:first])
    i = first
    while i < len(others):
        groups.append(others[i:i + batch])
        i += batch
    totals = []
    for gi, g in enumerate(groups):
        # the page is part of every call per the tool contract, so count it in each
        t = sizes[PAGE] + sum(sizes[p] for p in g)
        if t > MAX_BATCH:
            raise Fail("batch %d is %d bytes, over 64 MB" % (gi + 1, t))
        totals.append(t)
    return groups, totals


def cmd_plan(a):
    catalog = Path(a.catalog_dir).resolve()
    out = Path(a.out)
    if a.batch < 2:
        raise Fail("--batch must be at least 2")
    if not (catalog / PAGE).is_file():
        raise Fail("%s not found in %s" % (PAGE, catalog))
    entries = walk(catalog)
    groups, totals = build_batches(entries, a.batch)
    title = title_of(catalog)
    desc = "%s, published fresh from the repo tree (%d files)." % (title, len(entries))
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("batch-*.json"):
        old.unlink()
    for n, g in enumerate(groups, 1):
        obj = {
            "file_path": PAGE,
            "root": str(catalog),
            "files": {p: p for p in g},
            "capabilities": CAPABILITIES,
            "description": desc,
            "icon": "catalog",
            "label": "Fresh publish, batch %d of %d" % (n, len(groups)),
        }
        if n > 1:
            obj["url"] = PLACEHOLDER
        write_text(out / ("batch-%d.json" % n), json.dumps(obj, indent=1, ensure_ascii=False) + "\n")
    print("batches: %d" % len(groups))
    print("files: %d" % len(entries))
    print("total bytes: %d" % sum(s for _, s in entries))
    for n, t in enumerate(totals, 1):
        print("batch %d: %d files, %d bytes (index.html counted in every batch)" % (n, len(groups[n - 1]) + (1 if n == 1 else 0), t))
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
    p.add_argument("--batch", type=int, default=250)
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
