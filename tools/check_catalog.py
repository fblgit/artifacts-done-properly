#!/usr/bin/env python3
"""Verify skill/catalog/ and its generated index catalog.json (stdlib only).

The header comment of an entry's main file is the only description of the entry; catalog.json
(schema kit-catalog/2) is the index `adp.py index` builds from the headers. This check fails when:

  - the committed index differs from what adp_index.build_index builds from the tree (adp_index.differences: the schema,
    a key the build does not write, a value, a file's sha256 or bytes, an entry's hash or main; `built` is not compared);
  - a header or the tree is wrong (adp_index.problems: a required tag, a @files path, a kit file no entry names);
  - a file in the tree belongs to no entry and is not one of the page's own: catalog.json, and what adp_shell copies
    (its SHELL_FILES and everything under its SHELL_DIRS);
  - skill/assets/adp.js and the catalog's adp.js differ.

Usage: check_catalog.py [catalog_dir]   (default: <repo>/skill/catalog)
Exit 0 and one OK line, or exit 1 with a list of failures. Every number printed is computed.
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "skill" / "scripts"))      # python3 -I leaves every directory off the path
import adp_index as ai  # noqa: E402
from adp_shell import SHELL_DIRS, SHELL_FILES  # noqa: E402

MAX_DIFFS = 40


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "skill" / "catalog"
    cat = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
    built, errors = ai.build_index(str(root)), []
    diffs = ai.differences(cat, built)
    if diffs:
        errors.append(f"index: catalog.json differs from what the headers build in {len(diffs)} place(s); run `adp.py index` and commit the result")
        errors.extend("  " + d for d in diffs[:MAX_DIFFS])
        if len(diffs) > MAX_DIFFS:
            errors.append(f"  ... and {len(diffs) - MAX_DIFFS} more")
    errors.extend(ai.problems(str(root)))
    listed = {f["path"] for e in built["entries"] for f in e["files"]}
    tree = sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file())
    own = {"catalog.json", *SHELL_FILES}
    errors.extend(f"orphan: {p} belongs to no entry and is not a page file" for p in tree
                  if not (p in listed or p in own or p.split("/")[0] in SHELL_DIRS))
    skill_runtime = root.parent / "assets" / "adp.js"
    if root.name == "catalog" and skill_runtime.is_file() and (root / "adp.js").is_file() \
            and skill_runtime.read_bytes() != (root / "adp.js").read_bytes():
        errors.append("runtime: skill/assets/adp.js and skill/catalog/adp.js differ; the skill has one runtime")
    if errors:
        print(f"FAIL: {sum(1 for m in errors if not m.startswith('  '))} problem(s)")
        for m in errors:
            print("  " + m)
        return 1
    print(f"OK: {len(built['entries'])} entries, {len(listed)} entry files, {len(tree)} files in tree, no orphan, the index equals the build")
    return 0


if __name__ == "__main__":
    sys.exit(main())
