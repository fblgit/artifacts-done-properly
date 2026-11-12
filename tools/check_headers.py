#!/usr/bin/env python3
"""Validate the JSDoc-style header of catalog entries (spec: docs/catalog-header.md).

  check_headers.py [FILES...]   every FILES (repo paths) that is the main file of a catalog entry must carry a valid header;
                                other files (stylesheets, samples) are skipped. No FILES: every main file of the catalog.
  check_headers.py --report     counts per kind and per failed rule; exit 0
  --root DIR                    the catalog directory (default skill/catalog)
"""
import collections
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.join(os.path.dirname(HERE), 'skill', 'catalog')

KINDS = {'kit', 'layout', 'pattern', 'viz', 'theme', 'runtime', 'template', 'guide'}
STATUS = {'new', 'stable'}
GLOBALS = {'htm-preact', 'marked', 'dompurify'}      # the CDN scripts the catalog page can add (catalog/parts/catalog.js, CDN)
SINGLE = ('id', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'provides', 'tokens', 'globals', 'db')
KNOWN = set(SINGLE) | {'config'}                      # config repeats; every other tag once
ALWAYS = ('id', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'globals', 'db')
ID = re.compile(r'[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9.-]*')
SEMVER = re.compile(r'\d+\.\d+\.\d+')
DATE = re.compile(r'\d{4}-\d{2}-\d{2}')
MEMBER = re.compile(r'[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*')
TOKEN = re.compile(r'--[A-Za-z0-9_<>-]+')
SUMMARY_MAX = 260


def main_files(entry):
    """The file that carries an entry's header: the template or doc file of a template or guide, else the first script, else the first style."""
    files = entry.get('files', [])
    for roles in (('template', 'doc'), ('script',), ('style',)):
        for f in files:
            if f.get('role') in roles:
                return f['path']
    return None


def comment_of(text, path):
    """The first header comment of a file: /** ... */ in .js and .css, <!-- ... --> in anything else. None without one."""
    if path.endswith(('.js', '.css')):
        m = re.search(r'/\*\*(.*?)\*/', text[:20000], re.S)
    else:
        m = re.search(r'<!--(.*?)-->', text[:20000], re.S)
    return m.group(1) if m else None


def parse(comment):
    """(title, about, tags): tags is a list of (name, value); a line that does not start with @ continues the tag above it."""
    title, about, tags, cur = '', [], [], None
    for raw in comment.split('\n'):
        line = re.sub(r'^\s*\*? ?', '', raw).rstrip()
        m = re.match(r'@([A-Za-z]+)\s*(.*)$', line)
        if m:
            cur = [m.group(1), m.group(2).strip()]
            tags.append(cur)
        elif cur is not None:
            if line.strip():
                cur[1] = (cur[1] + ' ' + line.strip()).strip()
        elif line.strip():
            if not title:
                title = line.strip()
            else:
                about.append(line.strip())
    return title, ' '.join(about), [(n, v) for n, v in tags]


def split(v, spaces=False):
    """The items of a comma list; tokens may also be separated by spaces."""
    return [x for x in (y.strip() for y in re.split(r'[,\s]+' if spaces else ',', v)) if x]


def validate(path, comment, entry, ids):
    """[(rule, message)] for one header. entry: the catalog entry this file is the main file of."""
    title, about, tags = parse(comment)
    out = []
    names = [n for n, _ in tags]
    val = {}
    for n, v in tags:
        if n not in KNOWN:
            out.append(('unknown-tag', f'@{n} is not a header tag'))
        elif n != 'config' and n in val:
            out.append(('duplicate-tag', f'@{n} appears twice'))
        else:
            val.setdefault(n, v)
    if not title:
        out.append(('title', 'the first line of the comment is the entry name'))
    if not about:
        out.append(('about', 'a paragraph after the name says what the entry is'))
    need = list(ALWAYS)
    if path.endswith('.js'):
        need.append('provides')
    if any(f.get('role') == 'style' for f in entry.get('files', [])):
        need.append('tokens')
    for n in need:
        if n not in names or not val.get(n):
            out.append(('missing-tag', f'@{n} is required'))
    i = val.get('id')
    if i:
        if not ID.fullmatch(i) or i.split('.')[0] not in KINDS:
            out.append(('id', f'@id {i}: kind.name with kind one of {", ".join(sorted(KINDS))}'))
        if i != entry['id']:
            out.append(('id-mismatch', f'@id {i} but catalog.json lists this file under {entry["id"]}'))
    if val.get('status') and val['status'] not in STATUS:
        out.append(('status', f'@status {val["status"]}: one of {", ".join(sorted(STATUS))}'))
    if val.get('version') and not SEMVER.fullmatch(val['version']):
        out.append(('version', f'@version {val["version"]}: major.minor.patch'))
    if val.get('updated') and not DATE.fullmatch(val['updated']):
        out.append(('updated', f'@updated {val["updated"]}: YYYY-MM-DD'))
    if val.get('summary') and len(val['summary']) > SUMMARY_MAX:
        out.append(('summary', f'@summary is {len(val["summary"])} characters, at most {SUMMARY_MAX}'))
    if val.get('tags'):
        ts = split(val['tags'])
        if len(ts) != len(set(ts)) or any(t != t.lower() for t in ts):
            out.append(('tags', '@tags: a comma list, lowercase, no repeats'))
    if val.get('requires') and val['requires'] != 'none':
        bad = [r for r in split(val['requires']) if r not in ids]
        if bad:
            out.append(('requires', f'@requires names no catalog entry: {", ".join(bad)}'))
    if val.get('provides') and val['provides'] != 'none':
        bad = [p for p in split(val['provides']) if not MEMBER.fullmatch(p)]
        if bad:
            out.append(('provides', f'@provides: dotted names, comma separated; not: {", ".join(bad)}'))
    if val.get('tokens') and val['tokens'] != 'none':
        bad = [t for t in split(val['tokens'], spaces=True) if not TOKEN.fullmatch(t)]
        if bad:
            out.append(('tokens', f'@tokens: custom properties like --ink; not: {", ".join(bad)}'))
    if val.get('globals') and val['globals'] != 'none':
        bad = [g for g in split(val['globals']) if g not in GLOBALS]
        if bad:
            out.append(('globals', f'@globals: none or {", ".join(sorted(GLOBALS))}; not: {", ".join(bad)}'))
    for n, v in tags:
        if n == 'config' and ' | ' not in v:
            out.append(('config', f'@config {v[:40]}: "signature | what it takes"'))
    return out


def load(root):
    cat = json.load(open(os.path.join(root, 'catalog.json'), encoding='utf-8'))['entries']
    by_path = {}
    for e in cat:
        p = main_files(e)
        if p:
            by_path[p] = e
    return cat, by_path


def check(root, files=None):
    """(results, ids): results is [(path, state, [(rule, message)])] with state header, legacy or skipped."""
    cat, by_path = load(root)
    ids = {e['id'] for e in cat}
    paths = sorted(by_path) if files is None else files
    results = []
    for p in paths:
        rel = os.path.relpath(os.path.abspath(p), root).replace(os.sep, '/') if files is not None else p
        e = by_path.get(rel)
        if e is None:
            results.append((rel, 'skipped', []))
            continue
        if not os.path.isfile(os.path.join(root, rel)):
            results.append((rel, 'legacy', [('missing-file', f'catalog.json lists {rel} for {e["id"]} but the file is not there')]))
            continue
        text = open(os.path.join(root, rel), encoding='utf-8').read()
        c = comment_of(text, rel)
        if c is None or '@id' not in c:
            results.append((rel, 'legacy', [('legacy', 'no @id header')]))
            continue
        results.append((rel, 'header', validate(rel, c, e, ids)))
    return results, ids


def main(argv):
    root, files, mode = DEFAULT_ROOT, [], 'check'
    a = list(argv)
    while a:
        x = a.pop(0)
        if x == '--root':
            root = a.pop(0)
        elif x == '--report':
            mode = 'report'
        elif x.startswith('--'):
            sys.exit(f'unknown option {x}')
        else:
            files.append(x)
    results, _ = check(root, files or None)
    if mode == 'report':
        _, by_path = load(root)
        kinds = collections.defaultdict(collections.Counter)
        rules = collections.Counter()
        for rel, state, issues in results:
            if state == 'skipped':
                continue
            kinds[by_path[rel]['id'].split('.')[0]]['legacy' if state == 'legacy' else 'invalid' if issues else 'header'] += 1
            for r, _m in issues:
                rules[r] += 1
        for k in sorted(kinds):
            c = kinds[k]
            print(f'{k:9s} header ok {c["header"]:3d}   invalid {c["invalid"]:3d}   legacy {c["legacy"]:3d}')
        for r, n in rules.most_common():
            print(f'  rule {r}: {n}')
        return 0
    bad = [(p, s, i) for p, s, i in results if i]
    for p, _s, issues in bad:
        for r, m in issues:
            print(f'{p}: [{r}] {m}')
    checked = sum(1 for _p, s, _i in results if s == 'header')
    if bad:
        print(f'{len(bad)} file(s) with problems', file=sys.stderr)
        return 1
    print(f'ok: {checked} header(s) valid, {sum(1 for _p, s, _i in results if s == "skipped")} skipped')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
