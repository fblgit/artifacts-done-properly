#!/usr/bin/env python3
"""Read-only report: where the JS header comment disagrees with catalog.json (stdlib only).

Usage: catalog_drift.py [--catalog-dir skill/catalog] [--field version,about,provides,tokens,db] [--strict]

For every entry with a non-sample .js file, the header is the first block comment
(within the first 8000 chars) that contains "What it is:". It is compared with the entry.
One line per disagreement:  <entry id> <field>: header=<...> catalog=<...>   (values cut to 80 chars)
Then a summary table (equal / differ / no header per field) and the entries without a header.
Entries whose files are only css/json/md/txt are reported as "no js header" and counted, not failed.

Tolerances:
  version   exact string match ("kit version X" on the first header line).
  provides  sets of names; the header names are the comma list in the first parentheses.
  about     share of the catalog about's words (5+ letters) found in the header's "What it is" >= 0.5.
  tokens    sets of css custom properties after dropping wildcards (names ending in "-"),
            which are listed separately as wildcards.
  db        the catalog needs.db.note, if any, must appear (first 40 chars, case-insensitive)
            in the header's "db collections:" text; no note matches an absent or "none" header text.
Exit code 0 always, except 1 with --strict when any version or provides disagreement exists.
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path

FIELDS = ["version", "about", "provides", "tokens", "db"]
norm = lambda s: re.sub(r"\s+", " ", s or "").strip()


def cut(v, n=80):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return s if len(s) <= n else s[: n - 3] + "..."


def find_header(text):
    for b in re.findall(r"/\*(.*?)\*/", text[:8000], re.S):
        if "What it is:" in b:
            return b
    return None


def parse_header(h):
    lines = h.split("\n")
    first = lines[0] if lines[0].strip() else (lines[1] if len(lines) > 1 else "")
    m = re.search(r"\(([^)]*)\)", first)
    v = re.search(r"kit version\s+(\S+)", h)
    w = re.search(r"What it is:(.*?)(?=\n\s*(?:Needs from|db collections:|Lifted from:|Provides:|css |needs )|$)", h, re.S)
    css = re.search(r"custom properties\s+(.*?)(?:\n\s*(?:needs|db collections:|Lifted)|\Z)", h, re.S)
    db = re.search(r"db collections:(.*?)(?=\n\s*Lifted|\Z)", h, re.S)
    toks = re.findall(r"--[\w-]+", css.group(1)) if css else []
    return {
        "version": v.group(1) if v else None,
        "provides": {x.strip() for x in m.group(1).split(",") if x.strip()} if m else set(),
        "what": norm(w.group(1)) if w else "",
        "tokens": {t for t in toks if not t.endswith("-")},
        "wildcards": sorted({t for t in toks if t.endswith("-")}),
        "db": norm(db.group(1)) if db else None,
    }


def words(s):
    return set(re.findall(r"[a-z]{5,}", (s or "").lower()))


def compare(field, h, e):
    """Return (equal, header_value, catalog_value)."""
    if field == "version":
        return h["version"] == e.get("version"), h["version"], e.get("version")
    if field == "provides":
        c = set(e.get("provides") or [])
        return h["provides"] == c, sorted(h["provides"]), sorted(c)
    if field == "tokens":
        c = {t for t in ((e.get("needs") or {}).get("tokens") or []) if not t.endswith("-")}
        return h["tokens"] == c, sorted(h["tokens"]), sorted(c)
    if field == "about":
        a, b = words(e.get("about")), words(h["what"])
        share = len(a & b) / len(a) if a else 1.0
        return share >= 0.5, h["what"], "%s (share %.2f)" % (e.get("about", ""), share)
    note = norm(((e.get("needs") or {}).get("db") or {}).get("note"))
    d = h["db"]
    if not note:
        ok = d is None or d.lower().startswith("none")
    else:
        ok = bool(d) and note[:40].lower() in d.lower()
    return ok, d, note


def analyse(catalog_dir, fields):
    cdir = Path(catalog_dir)
    entries = json.loads((cdir / "catalog.json").read_text(encoding="utf-8"))["entries"]
    lines, counts = [], {f: collections.Counter() for f in fields}
    nojs, nohdr, wild = [], [], []
    for e in entries:
        js = [f["path"] for f in e.get("files", []) if f["path"].endswith(".js") and f.get("role") != "sample"]
        if not js:
            nojs.append(e["id"])
            continue
        h = None
        for p in js:
            fp = cdir / p
            if fp.is_file():
                hdr = find_header(fp.read_text(encoding="utf-8", errors="replace"))
                if hdr:
                    h = parse_header(hdr)
                    break
        if h is None:
            nohdr.append(e["id"])
            for f in fields:
                counts[f]["no header"] += 1
            continue
        if h["wildcards"]:
            wild.append((e["id"], h["wildcards"]))
        for f in fields:
            ok, hv, cv = compare(f, h, e)
            counts[f]["equal" if ok else "differ"] += 1
            if not ok:
                lines.append((e["id"], f, "%s %s: header=%s catalog=%s" % (e["id"], f, cut(hv), cut(cv))))
    return lines, counts, nojs, nohdr, wild, len(entries)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--catalog-dir", default=str(Path(__file__).resolve().parent.parent / "skill" / "catalog"))
    ap.add_argument("--field", default=",".join(FIELDS), help="comma list of: " + ",".join(FIELDS))
    ap.add_argument("--strict", action="store_true", help="exit 1 if any version or provides disagreement")
    a = ap.parse_args(argv)
    fields = [f.strip() for f in a.field.split(",") if f.strip()]
    bad = [f for f in fields if f not in FIELDS]
    if bad or not fields:
        ap.error("unknown field: " + ",".join(bad or ["(none)"]))
    lines, counts, nojs, nohdr, wild, total = analyse(a.catalog_dir, fields)
    for _, _, t in lines:
        print(t)
    print("\n%d entries; %d with a js file, %d no js header (css/json/md/txt only), %d js entries without a header"
          % (total, total - len(nojs), len(nojs), len(nohdr)))
    print("%-10s %6s %6s %10s" % ("field", "equal", "differ", "no header"))
    for f in fields:
        c = counts[f]
        print("%-10s %6d %6d %10d" % (f, c["equal"], c["differ"], c["no header"]))
    if nohdr:
        print("entries without a header: " + ", ".join(nohdr))
    if nojs:
        print("no js header: " + ", ".join(nojs))
    if wild:
        print("wildcard tokens (not compared): " + "; ".join("%s %s" % (i, " ".join(w)) for i, w in wild))
    strict_hit = any(f in ("version", "provides") for _, f, _ in lines)
    return 1 if a.strict and strict_hit else 0


if __name__ == "__main__":
    sys.exit(main())
