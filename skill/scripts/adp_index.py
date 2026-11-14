#!/usr/bin/env python3
r"""The catalog index, built from the headers of the kit files (stdlib only).

  adp_index.py index DIR            write DIR/catalog.json (kit-catalog/2) from the headers under DIR/kit; when the headers
                                    or the tree have a problem, list each one, write nothing and exit 1
  adp_index.py index DIR --check    write nothing; exit 1 and list each difference between DIR/catalog.json and what the
                                    headers build, each file without an entry, each header missing a required tag

The header comment of an entry's main file is the only description of the entry. The index keeps what a reader needs to
find and take an entry (id, kind, group, name, summary, tags, status, version, requires, globals, provides, fonts,
extends, main, files, hash); about, config, tokens, db, source, changed and preview stay in the header.

Which files an entry has, and in which order, is written in its header and nowhere else:
  - the main file is the file whose header carries `@id <entry>` (under DIR/kit, or a file at the top of DIR such as adp.js);
  - `@files a, b, c` names the entry's other files, as paths from DIR, in order; `@files none` when the main file is the only one;
  - the entry's files are the main file, then the @files paths in the order given. Entries are sorted by the path of their main file.
A path may be in the @files of several entries (a sample two entries show). --check lists: a header without a required tag
(REQUIRED, @files among them; @provides when the main file is a .js), a @files
path that is not in the tree or is named twice, a @files path that carries a header of its own (that is an entry: @requires
it), two files with one @id, a file under DIR/kit that no entry names, a @db section without its keyword.
catalog.json is read for three values only: url, ver, and `built` (kept when nothing else changed).
`role` of a file record comes from its path: `sample` under kit/samples/, else by extension (ROLES), else `data`.

Escapes in a header: `*\/` reads as `*/`; `\,` is a comma inside one item of a list tag; `\|` is a bar inside one piece of
@config or @source. The page reads the same header the same way (catalog/parts/files.js, parseHeader).

Python API: parse_header(text, path), build_index(catalog_dir), problems(catalog_dir), differences(old, new), main(argv);
HEAD is the number of characters a header must end within (tools/check_headers.py and files.js use the same number).
"""
import datetime
import hashlib
import json
import os
import re
import sys

SCHEMA = 'kit-catalog/2'
REQUIRED = ('id', 'kind', 'group', 'status', 'version', 'summary', 'files')     # on every header; @provides too when the main file is a .js
LISTS = ('tags', 'requires', 'provides', 'globals', 'related', 'optional', 'files')
MANY = ('config', 'source', 'changed')
HEAD = 20000                                  # the header comment, opening mark to closing mark, is in the first HEAD characters of its file
ROLES = (('.html.txt', 'template'), ('.js', 'script'), ('.css', 'style'), ('.md', 'doc'), ('.json', 'data'), ('.txt', 'template'))
CODE = ('.js', '.css', '.js.txt', '.css.txt')        # a header here is the first /** */
PROSE = ('.md', '.txt')                              # a header here is the first <!-- --> (.html.txt too)
SKIP_TOP = {'catalog.json', 'index.html'}     # top-level files that are never a header's file
STAMPS = ('built',)                           # index keys --check does not compare
TAG = re.compile(r'@([a-z][\w-]*)(?:\s+(.*))?$', re.A)      # ASCII names and spaces, as the page's parser


# ---------------------------------------------------------------- header

def _none(v):
    return v is None or str(v).strip().lower() in ('', 'none')


def _pieces(v, sep):
    """The pieces of v between separators, trimmed. A separator after a backslash is that character, not a cut."""
    out, i = [''], 0
    while i < len(v):
        if v[i] == '\\' and v[i + 1:i + 2] == sep: out[-1] += sep; i += 1
        elif v[i] == sep: out.append('')
        else: out[-1] += v[i]
        i += 1
    return [x.strip() for x in out]


def _not_json(name):
    """NaN, Infinity and -Infinity are not JSON: the page's JSON.parse refuses them, so this parser does too."""
    raise ValueError(name)


def _csv(v):
    """A list tag: `a, b, c`; `\\,` is a comma inside an item; `none` is no item."""
    return [] if _none(v) else [x for x in _pieces(v, ',') if x]


def _pair(v):
    """@config: `signature | what it takes`, cut at the first ` | `; `\\|` is a bar inside the signature."""
    a = re.split(r'\s+\|\s+', v, maxsplit=1)
    return [x.replace('\\|', '|').strip() for x in (a + [''])[:2]]


def _db(v):
    """@db: `reads a; b / writes c; d / note text` -> {reads, writes, note}. Sections are separated by ` / `, each optional, each
    starting with its keyword in lowercase and a space. A section that starts with none of the three is an error: it is not
    read, it is listed under `unread` (a key that is there only then), and --check names it."""
    out, notes, unread = {'reads': [], 'writes': [], 'note': ''}, [], []
    if _none(v): return out
    for part in re.split(r'\s+/\s+', v):
        m = re.match(r'(reads|writes|note)\s+(.*)$', part.strip(), re.S)
        if not m: unread += [part.strip()] if part.strip() else []
        elif m.group(1) == 'note': notes.append(m.group(2).strip())
        else: out[m.group(1)] += [x.strip() for x in m.group(2).split(';') if x.strip()]
    out['note'] = ' '.join(notes)
    if unread: out['unread'] = unread
    return out


def _source(v):
    """@source: `board | file | what` -> {board, file, what}; `\\|` is a bar inside a piece, a bar after the second cut stays in what."""
    a = _pieces(v, '|')
    return {'board': a[0], 'file': a[1] if len(a) > 1 else '', 'what': ' | '.join(a[2:])}


def _shape(raw):
    """The text of each tag -> the shapes the page builds too (catalog/parts/files.js): lists, [signature, what] pairs, {reads, writes, note}."""
    h = {}
    for k, v in raw.items():
        if k in ('name', 'about'): h[k] = v
        elif k in LISTS: h[k] = _csv(v)
        elif k == 'tokens': h[k] = [] if _none(v) else v.split()
        elif k == 'config': h[k] = [_pair(x) for x in v if not _none(x)]
        elif k == 'source': h[k] = [_source(x) for x in v if not _none(x)]
        elif k == 'changed': h[k] = [x for x in v if not _none(x)]
        elif k == 'db': h[k] = _db(v)
        elif k == 'preview':
            if not _none(v):
                try: h[k] = json.loads(v, parse_constant=_not_json)
                except ValueError: h[k] = None
        else: h[k] = '' if _none(v) else v
    return h


def _comment(text, path):
    r"""The lines of the header comment, None without one. A .js or .css file (or its .txt copy): its first /** */. A .md,
    .html.txt or .txt file: its first <!-- -->. No other file has a header. The comment is whole inside the first HEAD
    characters, and `*\/` in it reads as `*/`."""
    head, p = text[:HEAD], path.lower()
    code = p.endswith(CODE)
    if not code and not p.endswith(PROSE): return None
    m = re.search(r'/\*\*(.*?)\*/' if code else r'<!--(.*?)-->', head, re.S)
    if not m: return None
    return [(re.sub(r'^\s*\*( |$)', '', l) if code else l).replace('*\\/', '*/') for l in m.group(1).split('\n')]


def parse_header(text, path):
    """The header of a kit file as a dict: tag names as keys, plus name and about. {} when the file has no header.
    name: the first line. about: the first paragraph after it, as one line; a blank line ends it, and what follows up to the
    first tag is notes, which are not read. One tag per line; a line between tags that is not a tag is not read.
    tags, requires, provides, globals, related, optional, files, tokens: lists. config: [[signature, what]]. source: [{board, file, what}].
    changed: [text]. db: {reads, writes, note} (see _db). preview: the parsed JSON. Every other tag: its text ('' for none)."""
    text, path = '' if text is None else str(text), str(path or '').replace('\\', '/')
    lines = _comment(text, path)
    if lines is None: return {}
    raw, about, name, in_about = {}, [], None, True     # in_about: the about paragraph is not over yet
    for line in lines:
        l = line.strip()
        m = TAG.match(l)
        if m:
            in_about, k, v = False, m.group(1), (m.group(2) or '').strip()
            if k in MANY: raw.setdefault(k, []).append(v)
            else: raw[k] = v
        elif name is None: name = l or None
        elif l and in_about: about.append(l)
        elif about: in_about = False
    if name is None and not raw: return {}
    raw['name'], raw['about'] = name or '', ' '.join(about)
    return _shape(raw)


# ---------------------------------------------------------------- index

def _sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def _role(path):
    """The role of a file record, from its path alone."""
    if path.startswith('kit/samples/'): return 'sample'
    low = path.lower()
    return next((r for x, r in ROLES if low.endswith(x)), 'data')


def entry_hash(files):
    """First 12 hex of sha256 over the sorted `path=sha256` lines joined with newlines (tools/check_catalog.py)."""
    return hashlib.sha256('\n'.join(sorted(f"{f['path']}={f['sha256']}" for f in files)).encode('utf-8')).hexdigest()[:12]


def _walk(root):
    """Every file under root/kit, plus the files at the top of root, as posix paths relative to root."""
    out = []
    for d, dirs, names in os.walk(os.path.join(root, 'kit')):
        dirs[:] = sorted(x for x in dirs if not x.startswith('.') and x != '__pycache__')
        for n in sorted(names):
            if not n.startswith('.'): out.append(os.path.relpath(os.path.join(d, n), root).replace(os.sep, '/'))
    top = sorted(n for n in os.listdir(root) if os.path.isfile(os.path.join(root, n)) and not n.startswith('.') and n not in SKIP_TOP) \
        if os.path.isdir(root) else []
    return out, top


def _head(root, path):
    try:
        with open(os.path.join(root, path), encoding='utf-8', errors='replace') as f:
            return parse_header(f.read(), path)
    except OSError:
        return {}


def _old(root):
    try:
        with open(os.path.join(root, 'catalog.json'), encoding='utf-8') as f: c = json.load(f)
        return c if isinstance(c, dict) else {}
    except (OSError, ValueError):
        return {}


def _inside(path):
    """A @files path as the index writes it (posix, from the catalog folder); None when it is not a path inside that folder."""
    p = path.replace('\\', '/')
    while p.startswith('./'): p = p[2:]
    parts = p.split('/')
    return None if not p or p.startswith('/') or ':' in parts[0] or any(x in ('', '.', '..') for x in parts) else p


def _build(catalog_dir):
    """(index, problems): the index the headers build and what is wrong with the headers and the tree."""
    root = os.path.abspath(catalog_dir)
    old, issues = _old(root), []
    kit, top = _walk(root)
    heads = {}                                    # every file that carries a header with an @id
    for p in kit + top:
        if p.startswith('kit/samples/') or not p.lower().endswith(CODE + PROSE): continue
        h = _head(root, p)
        if h.get('id'): heads[p] = h
    mains = {}                                    # id -> its main file
    for p in sorted(heads):
        i = heads[p]['id']
        if i in mains: issues.append(f'{p}: its header has @id {i}, which is the @id of {mains[i]}; one file carries the header of an entry')
        else: mains[i] = p
    built, named = [], set(heads)
    for i, cp in sorted(mains.items(), key=lambda x: x[1]):
        h = heads[cp]
        paths = [cp]
        for given in h.get('files', []):
            p = _inside(given)
            if p is None: issues.append(f'{i}: @files names {given}, which is not a path inside the catalog folder')
            elif p == cp: issues.append(f'{i}: @files names {p}, the main file itself; name the other files only')
            elif p in paths: issues.append(f'{i}: @files names {p} twice')
            elif p in heads: issues.append(f"{i}: @files names {p}, which carries the header of {heads[p]['id']}; name that entry in @requires")
            elif not os.path.isfile(os.path.join(root, p)): issues.append(f'{i}: @files names {p}, which is not in the tree')
            else: paths.append(p)
        named.update(paths)
        files = []
        for p in paths:
            fp = os.path.join(root, p)
            files.append({'path': p, 'role': _role(p), 'sha256': _sha(fp), 'bytes': os.path.getsize(fp)})
        for t in REQUIRED + (('provides',) if cp.lower().endswith('.js') else ()):      # a list tag is there when written, `none` included
            if (t not in h) if t in LISTS else not h.get(t): issues.append(f'{i}: {cp}: the header has no @{t}')
        if not h.get('name'): issues.append(f'{i}: {cp}: the header has no name (its first line)')
        for x in h.get('db', {}).get('unread', []): issues.append(f'{i}: {cp}: @db has a section that starts with none of `reads `, `writes `, `note `: {_cut(x, 60)}')
        if 'preview' in h and h['preview'] is None: issues.append(f'{i}: {cp}: @preview is not one line of JSON')
        e = {'id': i, 'kind': h.get('kind', ''), 'group': h.get('group', ''), 'name': h.get('name', ''), 'summary': h.get('summary', ''),
             'tags': h.get('tags', []), 'status': h.get('status', ''), 'version': h.get('version', ''),
             'requires': h.get('requires', []), 'globals': h.get('globals', []), 'provides': h.get('provides', [])}
        for k in ('fonts', 'extends'):
            if h.get(k): e[k] = h[k]
        e.update(main=cp, files=files, hash=entry_hash(files))
        built.append(e)
    for e in built:
        bad = [r for r in e['requires'] if r not in mains]
        if bad: issues.append(f"{e['id']}: @requires names no entry: {', '.join(bad)}")
    for p in kit:
        if p not in named: issues.append(f'{p}: no entry names it (add it to @files in the header of its entry)')
    index = {'schema': SCHEMA, 'url': old.get('url', '') or '', 'ver': old.get('ver', '') or '', 'built': '', 'entries': built}
    same = old.get('schema') == SCHEMA and old.get('entries') == built and old.get('built')
    index['built'] = old['built'] if same else datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return index, issues


def build_index(catalog_dir):
    """The kit-catalog/2 index of catalog_dir, from the headers under its kit/ (url and ver from its catalog.json when there is one)."""
    return _build(catalog_dir)[0]


def problems(catalog_dir):
    """What is wrong with the headers and the tree: a kit file no entry names, a header missing a required tag or @files, a @files path that cannot be taken."""
    return _build(catalog_dir)[1]


# ---------------------------------------------------------------- command

def _cut(v, n=90):
    s = json.dumps(v, ensure_ascii=False, sort_keys=True)
    return s if len(s) <= n else s[:n - 3] + '...'


def differences(old, new):
    """One line per place the index on disk differs from the built one."""
    out = []
    if not old: return ['catalog.json: missing or not JSON']
    for k in sorted((set(old) | set(new)) - set(STAMPS) - {'entries'}):
        if old.get(k) != new.get(k): out.append(f'{k}: on disk {_cut(old.get(k))}, built {_cut(new.get(k))}')
    oe = {e.get('id'): e for e in old.get('entries', []) if isinstance(e, dict)}
    ne = {e['id']: e for e in new['entries']}
    for i in ne:
        if i not in oe: out.append(f'{i}: a header in the tree, no entry in catalog.json')
    for i in oe:
        if i not in ne: out.append(f'{i}: an entry in catalog.json without a header in the tree')
    for i, a in oe.items():
        b = ne.get(i)
        if b is None: continue
        for k in sorted(set(a) | set(b)):
            if k == 'files' and isinstance(a.get(k), list):
                fa = {f.get('path'): f for f in a[k] if isinstance(f, dict)}
                fb = {f['path']: f for f in b.get(k, [])}
                for p in fb:
                    if p not in fa: out.append(f'{i}.files: {p} is built, not on disk')
                for p in fa:
                    if p not in fb: out.append(f'{i}.files: {p} is on disk, not built')
                    elif fa[p] != fb[p]:
                        ks = [x for x in sorted(set(fa[p]) | set(fb[p])) if fa[p].get(x) != fb[p].get(x)]
                        out.append(f"{i}.files[{p}]: {', '.join(ks)} differ")
                if not (set(fa) ^ set(fb)) and list(fa) != list(fb): out.append(f'{i}.files: in a different order')
            elif k not in b: out.append(f'{i}.{k}: on disk, not part of the built index')
            elif k not in a: out.append(f'{i}.{k}: missing on disk; built {_cut(b[k])}')
            elif a[k] != b[k]: out.append(f'{i}.{k}: on disk {_cut(a[k])}, built {_cut(b[k])}')
    if not out and list(oe) != list(ne): out.append('entries: in a different order')
    return out


def main(argv=None):
    a = list(sys.argv[1:] if argv is None else argv)
    check = '--check' in a
    pos = [x for x in a if not x.startswith('--')]
    if len(pos) != 2 or pos[0] != 'index' or [x for x in a if x.startswith('--') and x != '--check']:
        sys.stderr.write('usage: adp_index.py index DIR [--check]\n'); return 2
    root = pos[1]
    if not os.path.isdir(os.path.join(root, 'kit')):
        sys.stderr.write(f'adp_index: no kit/ folder in {root}\n'); return 2
    index, issues = _build(root)
    path = os.path.join(root, 'catalog.json')
    nfiles = sum(len(e['files']) for e in index['entries'])
    if check:
        lines = differences(_old(root), index) + issues
        if lines:
            print(f'FAIL: {len(lines)} problem(s) in {root}')
            for l in lines: print('  ' + l)
            return 1
        print(f"OK: {len(index['entries'])} entries, {nfiles} files; catalog.json is what the headers build")
        return 0
    if issues:                                    # an index built from broken headers is not written
        sys.stderr.write(f'{len(issues)} problem(s) in the headers; {path} is not written:\n' + ''.join(f'  {l}\n' for l in issues))
        return 1
    text = json.dumps(index, ensure_ascii=False, indent=1) + '\n'
    try:
        with open(path, encoding='utf-8') as f: unchanged = f.read() == text
    except OSError:
        unchanged = False
    if not unchanged:
        with open(path, 'w', encoding='utf-8') as f: f.write(text)
    print(f"{'unchanged' if unchanged else 'wrote'} {path}: {len(index['entries'])} entries, {nfiles} files")
    return 0


if __name__ == '__main__':
    sys.exit(main())
