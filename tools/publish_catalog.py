#!/usr/bin/env python3
"""Stamp or check the catalog's own URL in skill/catalog/ (stdlib only). The publish itself comes from `adp.py new catalog DIR`.

  set-url URL   write URL into catalog.json `url` and the own-URL line of index.html; nothing else changes
  check URL     exit 1 if either place differs from URL
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = ROOT / "skill" / "catalog"
PAGE = "index.html"
sys.path.insert(0, str(ROOT / "skill" / "scripts"))      # python3 -I leaves every directory off the path
from adp_shell import OWN_URL as COMMENT_RE  # noqa: E402
URL_RE = re.compile(r'("url"\s*:\s*)"(?:[^"\\]|\\.)*"')


class Fail(Exception):
    pass


def read_text(p):
    with open(p, "r", encoding="utf-8", newline="") as f:
        return f.read()


def write_text(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def stamp(catalog, url):
    """Return (new_catalog_text, new_html_text); raise Fail unless exactly one place each."""
    cj, hp = catalog / "catalog.json", catalog / PAGE
    old = read_text(cj)
    obj = json.loads(old)
    if not isinstance(obj.get("url"), str):
        raise Fail("catalog.json has no string `url` field")
    new = URL_RE.sub(lambda m: m.group(1) + json.dumps(url, ensure_ascii=False), old, count=1)   # the text is kept as `adp.py index` wrote it
    if json.loads(new) != dict(obj, url=url):
        raise Fail("catalog.json: the first \"url\" in the text is not the top-level one")
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
