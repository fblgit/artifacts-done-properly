"""What the ADP scripts share (stdlib only): the catalog entry header (read it, validate it, spec: docs/catalog-header.md), the
catalog index (load, main file of an entry) and the file hash. adp_catalog.py is the command that uses it.

  comment_of(text, path)      the header comment of a file, None without one
  parse(comment)              (title, about, [(tag, value)])
  split(value, spaces=False)  the items of a comma list (or a space list of tokens)
  validate(path, comment, entry, ids)   [(rule, message)] for one header
  main_files(entry), load(root)         the file that carries an entry's header; (entries, {main file: entry}) of root/catalog.json
  check(root, files=None)     [(path, state, [(rule, message)])] for the main files (state: header, legacy, skipped), and the entry ids
  sha256(path)                the hex digest of a file
  split_ref(ref)              ('kit/samples/viz.json', 'viz-tree') for 'kit/samples/viz.json#viz-tree': a sample inside a bundle; (ref, None) for a plain path
  sample_issues(root, index)  [line] for the sample bundles: a #key that is not in its bundle, a bundle key no @preview names or no @samples owns, a @samples key not in a bundle of the entry's @files, a bundle not in the @files of the entry that previews on it
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re

KINDS = {'kit', 'layout', 'pattern', 'viz', 'theme', 'runtime', 'template', 'guide'}      # the first word of an @id
KIND = {'component', 'theme', 'template', 'guide'}                                         # @kind
STATUS = {'new', 'stable'}
GLOBALS = {'htm-preact', 'marked', 'dompurify'}      # the CDN scripts the catalog page can add (catalog/parts/catalog.js, CDN)
MANY = ('config', 'source', 'changed')               # these repeat; every other tag once
SINGLE = ('id', 'kind', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'files', 'provides', 'tokens', 'globals',
          'db', 'preview', 'fonts', 'extends', 'related', 'optional', 'samples')
KNOWN = set(SINGLE) | set(MANY)
ALWAYS = ('id', 'kind', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'files', 'globals', 'db')
ID = re.compile(r'[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9.-]*')
SEMVER = re.compile(r'\d+\.\d+\.\d+')
DATE = re.compile(r'\d{4}-\d{2}-\d{2}')
MEMBER = re.compile(r'[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*')
TOKEN = re.compile(r'--[A-Za-z0-9_<\x3e-]+\??')       # a trailing ? marks an optional property
SUMMARY_MAX = 260
KEY = re.compile(r'[\w.-]+')                       # a sample's key inside its bundle: the file name the sample had, without folder and extension


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def split_ref(ref):
    """A @preview sample as (path, key): 'kit/samples/viz.json#viz-tree' is the key viz-tree of the bundle kit/samples/viz.json; a path with
    no # is (path, None), a plain file."""
    path, sep, key = str(ref).partition('#')
    return (path, key) if sep else (path, None)


def main_files(entry):
    """The file that carries an entry's header: the entry's `main` when the index has one, else the template or doc file of a template or
    guide, else the first script, else the first style."""
    if entry.get('main'):
        return entry['main']
    files = entry.get('files', [])
    for roles in (('template', 'doc'), ('script',), ('style',)):
        for f in files:
            if f.get('role') in roles:
                return f['path']
    return None


def comment_of(text, path):
    """The first header comment of a file: /** ... */ in .js and .css (and their .txt copies), <!-- ... --> in anything else. `*\\/` in it
    reads as `*/`. None without one."""
    if path.endswith(('.js', '.css', '.js.txt', '.css.txt')):
        m = re.search(r'/\*\*(.*?)\*/', text[:20000], re.S)
    else:
        m = re.search(r'<!--(.*?)-->', text[:20000], re.S)
    return m.group(1).replace('*\\/', '*/') if m else None


def parse(comment):
    """(title, about, tags): the first line is the title, the first paragraph after it the about text (later paragraphs before the tags are
    notes and not read); tags is a list of (name, value), a line that does not start with @ continues the tag above it."""
    title, about, tags, cur, done = '', [], [], None, False
    for raw in comment.split('\n'):
        line = re.sub(r'^\s*\*? ?', '', raw).rstrip()
        m = re.match(r'@([A-Za-z]+)\s*(.*)$', line)
        if m:
            cur = [m.group(1), m.group(2).strip()]
            tags.append(cur)
        elif cur is not None:
            if line.strip():
                cur[1] = (cur[1] + ' ' + line.strip()).strip()
        elif not line.strip():
            done = done or bool(about)
        elif not title:
            title = line.strip()
        elif not done:
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
        elif n not in MANY and n in val:
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
    if val.get('kind') and val['kind'] not in KIND:
        out.append(('kind', f'@kind {val["kind"]}: one of {", ".join(sorted(KIND))}'))
    if val.get('files'):
        got = [] if val['files'] == 'none' else split(val['files'])
        want = [f['path'] for f in entry.get('files', []) if f['path'] != path]
        if len(got) != len(set(got)) or sorted(got) != sorted(want):
            out.append(('files', f'@files lists {", ".join(got) or "none"}; catalog.json lists the other files {", ".join(want) or "none"}'))
    if val.get('db') and val['db'] != 'none':
        bad = [s for s in re.split(r'\s+/\s+', val['db']) if not re.match(r'(reads|writes|note)\s+\S', s.strip())]
        if bad:
            out.append(('db', f'@db: sections `reads a; b` / `writes c` / `note text`, keywords in lowercase; not: {bad[0][:40]}'))
    if val.get('preview'):
        try:
            pv = json.loads(val['preview'])
        except ValueError:
            out.append(('preview', '@preview is not one line of JSON'))
        else:
            for s in (pv.get('samples') if isinstance(pv, dict) else None) or []:
                path, key = split_ref(s) if isinstance(s, str) else ('', None)
                if not path or (key is not None and not KEY.fullmatch(key)):
                    out.append(('preview', f'@preview samples: a path, or path#key with a key of letters, digits, . _ -; not: {str(s)[:40]}'))
    if val.get('samples'):
        ss = split(val['samples'])
        if len(ss) != len(set(ss)) or any(not KEY.fullmatch(s) for s in ss):
            out.append(('samples', '@samples: a comma list of bundle keys (letters, digits, . _ -), no repeats'))
    if names.count('changed') > 1:
        out.append(('changed', '@changed appears once: the newest change'))
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
            out.append(('tokens', f'@tokens: custom properties like --ink (--ink? when optional); not: {", ".join(bad)}'))
    if val.get('globals') and val['globals'] != 'none':
        bad = [g for g in split(val['globals']) if g not in GLOBALS]
        if bad:
            out.append(('globals', f'@globals: none or {", ".join(sorted(GLOBALS))}; not: {", ".join(bad)}'))
    for n, v in tags:
        if n == 'config' and ' | ' not in v:
            out.append(('config', f'@config {v[:40]}: "signature | what it takes"'))
        if n == 'source' and len(re.split(r'\s\|\s', v)) < 3:
            out.append(('source', f'@source {v[:40]}: "board | file | what"'))
    return out


def load(root):
    cat = json.loads(Path(os.path.join(root, 'catalog.json')).read_text(encoding='utf-8'))['entries']
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
        text = Path(os.path.join(root, rel)).read_text(encoding='utf-8')
        c = comment_of(text, rel)
        if c is None or '@id' not in c:
            results.append((rel, 'legacy', [('legacy', 'no @id header')]))
            continue
        results.append((rel, 'header', validate(rel, c, e, ids)))
    return results, ids


# ---------------------------------------------------------------- catalog.json (kit-catalog/2), built from the headers

SCHEMA = 'kit-catalog/2'
LISTS = ('tags', 'requires', 'provides', 'globals', 'related', 'optional', 'files', 'samples')      # comma lists; `\,` is a comma inside an item
ROLES = (('.html.txt', 'template'), ('.js', 'script'), ('.css', 'style'), ('.md', 'doc'), ('.json', 'data'), ('.txt', 'template'))
CODE = ('.js', '.css', '.js.txt', '.css.txt')
PROSE = ('.md', '.txt')
SKIP_TOP = {'catalog.json', 'index.html'}            # top-level files that are never an entry's main file
STAMPS = ('built',)                                  # keys of the index that `differences` does not compare
READ_MAX = 256                                       # paths in one Artifact read: the main files of all entries are fetched in one call


def _none(v):
    return v is None or str(v).strip().lower() in ('', 'none')


def _pieces(v, sep):
    """The pieces of v between separators, trimmed; a separator after a backslash is that character, not a cut."""
    out, i = [''], 0
    while i < len(v):
        if v[i] == '\\' and v[i + 1:i + 2] == sep:
            out[-1] += sep
            i += 1
        elif v[i] == sep:
            out.append('')
        else:
            out[-1] += v[i]
        i += 1
    return [x.strip() for x in out]


def _csv(v):
    return [] if _none(v) else [x for x in _pieces(v, ',') if x]


def _db(v):
    """@db `reads a; b / writes c / note text` -> {reads, writes, note}; a section without its keyword is listed under `unread`."""
    out, notes, unread = {'reads': [], 'writes': [], 'note': ''}, [], []
    if _none(v):
        return out
    for part in re.split(r'\s+/\s+', v):
        m = re.match(r'(reads|writes|note)\s+(.*)$', part.strip(), re.S)
        if not m:
            unread += [part.strip()] if part.strip() else []
        elif m.group(1) == 'note':
            notes.append(m.group(2).strip())
        else:
            out[m.group(1)] += [x.strip() for x in m.group(2).split(';') if x.strip()]
    out['note'] = ' '.join(notes)
    if unread:
        out['unread'] = unread
    return out


def _source(v):
    """@source `board | file | what` -> {board, file, what}; `\\|` is a bar inside a piece, a bar after the second cut stays in what."""
    a = _pieces(v, '|')
    return {'board': a[0], 'file': a[1] if len(a) > 1 else '', 'what': ' | '.join(a[2:])}


def _not_json(name):
    raise ValueError(name)           # NaN, Infinity and -Infinity are not JSON: the page's JSON.parse refuses them


def _shape(raw):
    """The text of each tag -> what the page builds too (catalog/parts/files.js): lists, [signature, what] pairs, {reads, writes, note}."""
    h = {}
    for k, v in raw.items():
        if k in ('name', 'about'):
            h[k] = v
        elif k in LISTS:
            h[k] = _csv(v)
        elif k == 'tokens':
            h[k] = [] if _none(v) else v.split()
        elif k == 'config':
            h[k] = [[x.replace('\\|', '|').strip() for x in (re.split(r'\s+\|\s+', c, maxsplit=1) + [''])[:2]] for c in v if not _none(c)]
        elif k == 'source':
            h[k] = [_source(s) for s in v if not _none(s)]
        elif k == 'changed':
            h[k] = [x for x in v if not _none(x)]
        elif k == 'db':
            h[k] = _db(v)
        elif k == 'preview':
            if not _none(v):
                try:
                    h[k] = json.loads(v, parse_constant=_not_json)
                except ValueError:
                    h[k] = None
        else:
            h[k] = '' if _none(v) else v
    return h


def parse_header(text, path):
    """The header of a file as a dict (tag names as keys, plus name and about; lists, pairs and sections shaped as the page shapes them);
    {} when the file has no header."""
    c = comment_of('' if text is None else str(text), str(path or '').replace('\\', '/'))
    if c is None:
        return {}
    title, about, tags = parse(c)
    raw = {}
    for n, v in tags:
        if n in MANY:
            raw.setdefault(n, []).append(v)
        else:
            raw[n] = v
    if not title and not raw:
        return {}
    raw['name'], raw['about'] = title, about
    return _shape(raw)


def _role(path):
    low = path.lower()
    if path.startswith('kit/samples/'):
        return 'sample'
    return next((r for x, r in ROLES if low.endswith(x)), 'data')


def entry_hash(files):
    """First 12 hex of sha256 over the sorted `path=sha256` lines joined with newlines."""
    return hashlib.sha256('\n'.join(sorted(f"{f['path']}={f['sha256']}" for f in files)).encode('utf-8')).hexdigest()[:12]


def _walk(root):
    """Every file under root/kit, and the files at the top of root, as posix paths relative to root."""
    out = []
    for d, dirs, names in os.walk(os.path.join(root, 'kit')):
        dirs[:] = sorted(x for x in dirs if not x.startswith('.') and x != '__pycache__')
        out += [os.path.relpath(os.path.join(d, n), root).replace(os.sep, '/') for n in sorted(names) if not n.startswith('.')]
    top = sorted(n for n in os.listdir(root) if os.path.isfile(os.path.join(root, n)) and not n.startswith('.') and n not in SKIP_TOP)
    return out, top


def _inside(path):
    """A @files path as the index writes it (posix, from the catalog folder); None when it is not a path inside that folder."""
    p = path.replace('\\', '/')
    while p.startswith('./'):
        p = p[2:]
    parts = p.split('/')
    return None if not p or p.startswith('/') or ':' in parts[0] or any(x in ('', '.', '..') for x in parts) else p


def _old(root):
    try:
        with open(os.path.join(root, 'catalog.json'), encoding='utf-8') as f:
            c = json.load(f)
        return c if isinstance(c, dict) else {}
    except (OSError, ValueError):
        return {}


def build_index(root):
    """(index, problems): the kit-catalog/2 index the headers under root/kit (and the top of root) build, and what is wrong with the tree:
    a @files path that cannot be taken, two files with one @id, a kit file no entry names, a @requires that names no entry. The main file
    of an entry is the file whose header carries its @id; its files are that file, then its @files in order. url and ver are kept from
    the catalog.json on disk, and built when nothing else changed. What is wrong with a header itself is `validate`'s."""
    root, issues = os.path.abspath(root), []
    old, (kit, top) = _old(root), _walk(root)
    heads = {}
    for p in kit + top:
        if p.startswith('kit/samples/') or not p.lower().endswith(CODE + PROSE):
            continue
        try:
            with open(os.path.join(root, p), encoding='utf-8', errors='replace') as f:
                h = parse_header(f.read(), p)
        except OSError:
            h = {}
        if h.get('id'):
            heads[p] = h
    mains = {}
    for p in sorted(heads):
        i = heads[p]['id']
        if i in mains:
            issues.append(f'{p}: its header has @id {i}, which is the @id of {mains[i]}; one file carries the header of an entry')
        else:
            mains[i] = p
    built, named = [], set(heads)
    for i, cp in sorted(mains.items(), key=lambda x: x[1]):
        h, paths = heads[cp], [cp]
        for given in h.get('files', []):
            p = _inside(given)
            if p is None:
                issues.append(f'{i}: @files names {given}, which is not a path inside the catalog folder')
            elif p == cp:
                issues.append(f'{i}: @files names {p}, the main file itself; name the other files only')
            elif p in paths:
                issues.append(f'{i}: @files names {p} twice')
            elif p in heads:
                issues.append(f"{i}: @files names {p}, which carries the header of {heads[p]['id']}; name that entry in @requires")
            elif not os.path.isfile(os.path.join(root, p)):
                issues.append(f'{i}: @files names {p}, which is not in the tree')
            else:
                paths.append(p)
        named.update(paths)
        files = [{'path': p, 'role': _role(p), 'sha256': sha256(os.path.join(root, p)), 'bytes': os.path.getsize(os.path.join(root, p))} for p in paths]
        e = {'id': i, 'kind': h.get('kind', ''), 'group': h.get('group', ''), 'name': h.get('name', ''), 'summary': h.get('summary', ''),
             'tags': h.get('tags', []), 'status': h.get('status', ''), 'version': h.get('version', ''), 'requires': h.get('requires', []),
             'globals': h.get('globals', []), 'provides': h.get('provides', [])}
        for k in ('fonts', 'extends'):
            if h.get(k):
                e[k] = h[k]
        e.update(main=cp, files=files, hash=entry_hash(files))
        built.append(e)
    for e in built:
        bad = [r for r in e['requires'] if r not in mains]
        if bad:
            issues.append(f"{e['id']}: @requires names no entry: {', '.join(bad)}")
    issues += [f'{p}: no entry names it (add it to @files in the header of its entry)' for p in kit if p not in named]
    index = {'schema': SCHEMA, 'url': old.get('url', '') or '', 'ver': old.get('ver', '') or '', 'built': '', 'entries': built}
    same = old.get('schema') == SCHEMA and old.get('entries') == built and old.get('built')
    index['built'] = old['built'] if same else datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return index, issues


def header_issues(root, index):
    """[line] for every rule `validate` finds broken in the header of each entry's main file in index."""
    ids, out = {e['id'] for e in index['entries']}, []
    for e in index['entries']:
        with open(os.path.join(root, e['main']), encoding='utf-8', errors='replace') as f:
            c = comment_of(f.read(), e['main'])
        out += [f"{e['id']}: {e['main']}: [{rule}] {msg}" for rule, msg in validate(e['main'], c, e, ids)]
    return out


def sample_issues(root, index):
    """[line] for the sample bundles of index. A bundle is a sample file (under kit/samples/) that some @preview names as path#key: its top-level
    keys are the samples. Wrong: a #key that is not in its file, a bundle that is not among the sample files in the entry's own @files (an entry
    that previews on another folder's samples lists that bundle too) or that is not a JSON object, a key of a bundle that no @preview names, an
    entry that lists a bundle in @files but names no key of it in its @preview. @samples names the keys an entry owns: each must be a key of
    a bundle in the entry's own @files, and every key of a bundle must be owned by at least one entry."""
    root, out, refs, owned = os.path.abspath(root), [], [], {}
    listed = {f['path'] for e in index['entries'] for f in e['files'] if f['role'] == 'sample'}
    own = {e['id']: {f['path'] for f in e['files'] if f['role'] == 'sample'} for e in index['entries']}
    for e in index['entries']:
        with open(os.path.join(root, e['main']), encoding='utf-8', errors='replace') as f:
            h = parse_header(f.read(), e['main'])
        pv = h.get('preview')
        owned[e['id']] = h.get('samples') or []
        for s in (pv.get('samples') if isinstance(pv, dict) else None) or []:
            path, key = split_ref(s) if isinstance(s, str) else ('', None)
            if key is not None and path:
                refs.append((e['id'], path, key))
    cache = {}

    def bundle(path):
        if path not in cache:
            try:
                with open(os.path.join(root, path), encoding='utf-8') as f:
                    j = json.load(f)
            except (OSError, ValueError):
                j = None
            cache[path] = j if isinstance(j, dict) else None
        return cache[path]
    named = {}
    for i, path, key in refs:
        named.setdefault(path, set()).add(key)
        if path not in own[i]:
            out.append(f'{i}: @preview names {path}#{key}, but {path} is not a sample file in its @files')
        elif bundle(path) is None:
            out.append(f'{i}: @preview names {path}#{key}, but {path} is not a JSON object')
        elif key not in bundle(path):
            out.append(f'{i}: @preview names {path}#{key}, but {path} has no key {key}')
    for e in index['entries']:
        mine = {p for i, p, _k in refs if i == e['id']}
        out += [f"{e['id']}: @files lists the sample bundle {f['path']}, but its @preview names no key of it"
                for f in e['files'] if f['role'] == 'sample' and f['path'] in named and f['path'] not in mine]
    for path in sorted(named):
        if bundle(path) is not None and path in listed:
            out += [f'{path}: the key {k} is named by no entry\'s @preview' for k in sorted(set(bundle(path)) - named[path])]
    owners = {}
    for i, keys in owned.items():
        for k in keys:
            mine = [p for p in sorted(own[i]) if p in named and bundle(p) is not None and k in bundle(p)]
            if mine:
                owners.setdefault(mine[0], set()).add(k)
            else:
                out.append(f'{i}: @samples names {k}, which is a key of no sample bundle in its @files')
    for path in sorted(named):
        if bundle(path) is not None and path in listed:
            out += [f"{path}: the key {k} is owned by no entry's @samples" for k in sorted(set(bundle(path)) - owners.get(path, set()))]
    return out


def _cut(v, n=90):
    s = json.dumps(v, ensure_ascii=False, sort_keys=True)
    return s if len(s) <= n else s[:n - 3] + '...'


def differences(old, new):
    """One line per place the index on disk (old) differs from the built one (new)."""
    out = []
    if not old:
        return ['catalog.json: missing or not JSON']
    for k in sorted((set(old) | set(new)) - set(STAMPS) - {'entries'}):
        if old.get(k) != new.get(k):
            out.append(f'{k}: on disk {_cut(old.get(k))}, built {_cut(new.get(k))}')
    oe = {e.get('id'): e for e in old.get('entries', []) if isinstance(e, dict)}
    ne = {e['id']: e for e in new['entries']}
    out += [f'{i}: a header in the tree, no entry in catalog.json' for i in ne if i not in oe]
    out += [f'{i}: an entry in catalog.json without a header in the tree' for i in oe if i not in ne]
    for i, a in oe.items():
        b = ne.get(i)
        if b is None:
            continue
        for k in sorted(set(a) | set(b)):
            if k == 'files' and isinstance(a.get(k), list):
                fa = {f.get('path'): f for f in a[k] if isinstance(f, dict)}
                fb = {f['path']: f for f in b.get(k, [])}
                out += [f'{i}.files: {p} is built, not on disk' for p in fb if p not in fa]
                for p in fa:
                    if p not in fb:
                        out.append(f'{i}.files: {p} is on disk, not built')
                    elif fa[p] != fb[p]:
                        out.append(f"{i}.files[{p}]: {', '.join(x for x in sorted(set(fa[p]) | set(fb[p])) if fa[p].get(x) != fb[p].get(x))} differ")
                if not (set(fa) ^ set(fb)) and list(fa) != list(fb):
                    out.append(f'{i}.files: in a different order')
            elif k not in b:
                out.append(f'{i}.{k}: on disk, not part of the built index')
            elif k not in a:
                out.append(f'{i}.{k}: missing on disk; built {_cut(b[k])}')
            elif a[k] != b[k]:
                out.append(f'{i}.{k}: on disk {_cut(a[k])}, built {_cut(b[k])}')
    if not out and list(oe) != list(ne):
        out.append('entries: in a different order')
    return out
