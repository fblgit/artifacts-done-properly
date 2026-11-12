#!/usr/bin/env python3
"""Verify skill/catalog/ against its own catalog.json (stdlib only).

For every entry file: exists, size == bytes, sha256 == sha256.
For every entry: hash == first 12 hex of sha256 over the sorted "path=sha256"
lines joined with newlines.
Every published path in the tree must be referenced by an entry or be one of
the page's own files (index.html, catalog.json, content.js, adp.js,
styles/catalog.css, parts/*).

Usage: check_catalog.py [catalog_dir]   (default: <repo>/skill/catalog)
Exit 0 and one OK line, or exit 1 with a list of failures.
"""
import hashlib
import json
import sys
from pathlib import Path

PAGE_FILES = {"index.html", "catalog.json", "content.js", "adp.js", "styles/catalog.css"}


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "skill" / "catalog"
    cat = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
    errors = []
    referenced = set()
    nfiles = 0
    for e in cat["entries"]:
        eid = e.get("id", "?")
        lines = []
        for f in e.get("files", []):
            nfiles += 1
            path = f["path"]
            referenced.add(path)
            p = root / path
            if not p.is_file():
                errors.append(f"{eid}: missing file {path}")
                continue
            size = p.stat().st_size
            if size != f["bytes"]:
                errors.append(f"{eid}: size {path}: file {size} != bytes {f['bytes']}")
            digest = sha256(p)
            if digest != f["sha256"]:
                errors.append(f"{eid}: sha256 {path}: file {digest} != entry {f['sha256']}")
            lines.append(f"{path}={f['sha256']}")
        if "hash" in e:
            want = hashlib.sha256("\n".join(sorted(lines)).encode("utf-8")).hexdigest()[:12]
            if want != e["hash"]:
                errors.append(f"{eid}: hash {e['hash']} != computed {want}")
        else:
            errors.append(f"{eid}: entry has no hash")
    tree = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    for path in sorted(tree):
        if path in referenced or path in PAGE_FILES or path.startswith("parts/"):
            continue
        errors.append(f"orphan: {path} is not referenced by any entry or page file")
    skill_runtime = root.parent / "assets" / "adp.js"
    if root.name == "catalog" and skill_runtime.is_file() and (root / "adp.js").is_file() \
            and skill_runtime.read_bytes() != (root / "adp.js").read_bytes():
        errors.append("runtime: skill/assets/adp.js and skill/catalog/adp.js differ; the skill has one runtime")
    if errors:
        print(f"FAIL: {len(errors)} problem(s)")
        for m in errors:
            print("  " + m)
        return 1
    print(f"OK: {len(cat['entries'])} entries, {nfiles} entry files, {len(tree)} files in tree, 0 orphans, all sizes, sha256 and hashes match")
    return 0


if __name__ == "__main__":
    sys.exit(main())
