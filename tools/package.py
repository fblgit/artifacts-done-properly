#!/usr/bin/env python3
"""Validate the ADP skill tree and build a deterministic dist/adp.skill zip."""
import argparse
import hashlib
import json
import os
import re
import sys
import zipfile

SKILL_NAME = "adp"
CATALOG_DIR = "catalog"
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
EXCLUDED_DIRS = {"__pycache__", "node_modules"}
EXCLUDED_FILES = {".DS_Store"}
FIXED_TIME = (1980, 1, 1, 0, 0, 0)


class ValidationError(Exception):
    pass


def _unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def parse_frontmatter(text):
    """Tiny YAML subset: `key: value`, quoted values, one nested map level."""
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0].rstrip() != "---":
        raise ValidationError("file must start with '---' on its first line")
    end = None
    for i in range(1, len(lines)):
        if lines[i].rstrip() == "---":
            end = i
            break
    if end is None:
        raise ValidationError("frontmatter is not closed with '---'")
    data = {}
    current = None
    for n, raw in enumerate(lines[1:end], start=2):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indented = raw[0] in " \t"
        if ":" not in raw:
            raise ValidationError("line %d: expected 'key: value'" % n)
        key, _, val = raw.strip().partition(":")
        key = key.strip()
        if indented:
            if current is None:
                raise ValidationError("line %d: unexpected indented line" % n)
            data[current][key] = _unquote(val)
        elif val.strip() == "":
            data[key] = {}
            current = key
        else:
            data[key] = _unquote(val)
            current = None
    return data


def validate_skill_md(path, expected_folder=None):
    """Return (errors, warnings, frontmatter) for one SKILL.md."""
    errors, warnings = [], []
    try:
        with open(path, encoding="utf-8") as f:
            fm = parse_frontmatter(f.read())
    except OSError as e:
        return ["%s: cannot read (%s)" % (path, e)], warnings, {}
    except UnicodeDecodeError:
        return ["%s: not valid UTF-8" % path], warnings, {}
    except ValidationError as e:
        return ["%s: %s" % (path, e)], warnings, {}
    name = fm.get("name")
    if not isinstance(name, str) or not name:
        errors.append("%s: 'name' is required" % path)
    else:
        if len(name) > 64:
            errors.append("%s: name longer than 64 chars" % path)
        if not NAME_RE.match(name):
            errors.append("%s: name %r must be kebab-case (lowercase letters, "
                          "digits, single hyphens, no leading/trailing hyphen)"
                          % (path, name))
        if expected_folder is not None and name != expected_folder:
            errors.append("%s: folder name %r must equal skill name %r"
                          % (path, expected_folder, name))
    desc = fm.get("description")
    if not isinstance(desc, str) or not desc.strip():
        errors.append("%s: 'description' is required" % path)
    else:
        if len(desc) > 1024:
            errors.append("%s: description is %d chars (max 1024)" % (path, len(desc)))
        if "<" in desc or ">" in desc:
            errors.append("%s: description must not contain '<' or '>'" % path)
    known = {"name", "description", "license", "allowed-tools", "metadata",
             "compatibility"}
    for k in fm:
        if k not in known:
            warnings.append("%s: unknown frontmatter key %r" % (path, k))
    return errors, warnings, fm


def validate_tree(skill_dir):
    errors, warnings = [], []
    root_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(root_md):
        return ["%s: missing" % root_md], warnings, {}
    e, w, fm = validate_skill_md(root_md)
    errors += e
    warnings += w
    refs = os.path.join(skill_dir, "refs")
    if os.path.isdir(refs):
        for d in sorted(os.listdir(refs)):
            full = os.path.join(refs, d)
            if not os.path.isdir(full):
                continue
            md = os.path.join(full, "SKILL.md")
            if not os.path.isfile(md):
                errors.append("%s: missing" % md)
                continue
            e, w, _ = validate_skill_md(md, expected_folder=d)
            errors += e
            warnings += w
    return errors, warnings, fm


def collect_files(skill_dir):
    out = []
    for dirpath, dirnames, filenames in os.walk(skill_dir):
        rel_dir = os.path.relpath(dirpath, skill_dir)
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDED_DIRS)
        if rel_dir == ".":
            dirnames[:] = [d for d in dirnames if d != "evals"]
        for fn in sorted(filenames):
            if fn in EXCLUDED_FILES or fn.endswith(".pyc"):
                continue
            rel = fn if rel_dir == "." else os.path.join(rel_dir, fn)
            out.append((rel.replace(os.sep, "/"), os.path.join(dirpath, fn)))
    out.sort()
    return out


LEGAL = ("LICENSE", "NOTICE")      # Apache-2.0 asks that a copy of the license and the NOTICE travel with every redistribution


def legal_files(skill_dir):
    """LICENSE and NOTICE from the repository root, which sits beside the skill folder: (name, path) for each."""
    top = os.path.dirname(os.path.abspath(skill_dir))
    return [(n, os.path.join(top, n)) for n in LEGAL]


MAX_FILES = 200      # claude.ai refuses a skill upload over 200 files


ROAD_FILE = "road.md"


def zip_name(rel):
    """The path a file has in the zip. claude.ai accepts exactly one SKILL.md in a skill upload, so each road skill's refs/<road>/SKILL.md goes in as refs/<road>/road.md;
    `adp.py setup` writes it back as SKILL.md. The repo (and so a plugin install) keeps SKILL.md."""
    parts = rel.split("/")
    if len(parts) == 3 and parts[0] == "refs" and parts[2] == "SKILL.md":
        return "refs/%s/%s" % (parts[1], ROAD_FILE)
    return rel


PACK_BYTES = 900 * 1024     # a pack is split before it passes this size (the skill zip compresses each one)


def catalog_packs(skill_dir):
    """The skill's catalog/ folder as [(name, bytes)]: JSON packs `catalog-pack-NN.json`, each {"schema": "adp-catalog-pack/1", "files": {path: text}}, deterministic.
    A skill zip carries the kit this way, because an upload takes at most MAX_FILES files and a zip may not hold a zip; `adp.py setup` writes the files into ~/.adp/catalog
    (My Own Kit). The kit is text; a file that is not UTF-8 fails the build. [] when there is no catalog folder."""
    root = os.path.join(skill_dir, CATALOG_DIR)
    if not os.path.isfile(os.path.join(root, "catalog.json")):
        return []
    texts = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDED_DIRS)
        for fn in sorted(filenames):
            if fn in EXCLUDED_FILES or fn.endswith(".pyc"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            try:
                with open(full, encoding="utf-8", newline="") as f:
                    texts[rel] = f.read()
            except UnicodeDecodeError:
                raise ValidationError("%s/%s is not UTF-8 text; the catalog pack carries text only" % (CATALOG_DIR, rel))
    groups, cur, size = [], {}, 0
    for rel in sorted(texts):
        if cur and size + len(texts[rel]) > PACK_BYTES:
            groups.append(cur)
            cur, size = {}, 0
        cur[rel] = texts[rel]
        size += len(texts[rel])
    if cur:
        groups.append(cur)
    return [("%s-pack-%02d.json" % (CATALOG_DIR, i + 1),
             json.dumps({"schema": "adp-catalog-pack/1", "files": g}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
            for i, g in enumerate(groups)]


def build(skill_dir, out_dir):
    files = [(r, f) for r, f in collect_files(skill_dir) if not r.startswith(CATALOG_DIR + "/")]
    files = sorted(files + legal_files(skill_dir))
    packs = catalog_packs(skill_dir)
    count = len(files) + len(packs)
    if count > MAX_FILES:
        raise ValidationError("the skill zip would hold %d files; claude.ai accepts at most %d" % (count, MAX_FILES))
    files = sorted((zip_name(r), f) for r, f in files)
    skill_mds = [r for r, _ in files if r.rsplit("/", 1)[-1] == "SKILL.md"]
    if len(skill_mds) != 1:
        raise ValidationError("the skill zip would hold %d SKILL.md files; claude.ai accepts exactly one" % len(skill_mds))
    os.makedirs(out_dir, exist_ok=True)
    target = os.path.join(out_dir, SKILL_NAME + ".skill")
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel, full in files:
            info = zipfile.ZipInfo("%s/%s" % (SKILL_NAME, rel), FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = (0o755 if os.access(full, os.X_OK) else 0o644) << 16
            with open(full, "rb") as f:
                z.writestr(info, f.read(), zipfile.ZIP_DEFLATED, 9)
        for name, data in packs:
            info = zipfile.ZipInfo("%s/%s" % (SKILL_NAME, name), FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o644 << 16
            z.writestr(info, data, zipfile.ZIP_DEFLATED, 9)
    with open(target, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    with open(target + ".sha256", "w", encoding="utf-8") as f:
        f.write("%s  %s.skill\n" % (sha, SKILL_NAME))
    return target, count, os.path.getsize(target), sha


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--skill-dir", default="skill")
    p.add_argument("--out", default="dist")
    p.add_argument("--check", action="store_true", help="validate only")
    a = p.parse_args(argv)
    if not os.path.isdir(a.skill_dir):
        print("error: skill dir not found: %s" % a.skill_dir, file=sys.stderr)
        return 1
    errors, warnings, _ = validate_tree(a.skill_dir)
    errors += ["%s: missing (a redistribution must carry it)" % f for _, f in legal_files(a.skill_dir) if not os.path.isfile(f)]
    for w in warnings:
        print("warning: " + w, file=sys.stderr)
    if errors:
        for e in errors:
            print("error: " + e, file=sys.stderr)
        print("validation failed (%d error(s))" % len(errors), file=sys.stderr)
        return 1
    print("validation ok")
    if a.check:
        return 0
    try:
        target, count, size, sha = build(a.skill_dir, a.out)
    except ValidationError as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    print("built %s: %d files, %d bytes" % (target, count, size))
    print("sha256 %s" % sha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
