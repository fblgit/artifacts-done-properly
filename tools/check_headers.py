#!/usr/bin/env python3
"""Validate the header of catalog entries (spec: docs/catalog-header.md).

The header of an entry's main file is the only description of the entry; catalog.json is an index built from it
(`adp.py index`). So this check reads the header and compares it with the CODE beside it, never with the index:
the required tags are there (adp_index.REQUIRED and ALSO; @provides on a .js; @tokens when a file of the entry reads a
custom property), the tags are well formed, @id agrees with the path, @provides names are defined by the entry's scripts,
and @tokens is what the theme must supply for the entry's own files (tokens-unread, tokens-undeclared, tokens-own,
tokens-optional: see token_issues). Every rule is an error.
A header that the first adp_index.HEAD characters of its file do not hold whole fails as header-cut: the parser and the
catalog page read no further.
It also fails, under the rule `index`, while catalog.json is not what the headers build (index_issues: every line of
adp_index.differences): a key the build does not write, or a value the entry's header and files do not yield.
The header parser is skill/scripts/adp_index.py (parse_header), the only one in Python.

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
REPO = os.path.dirname(HERE)
DEFAULT_ROOT = os.path.join(REPO, 'skill', 'catalog')
sys.path.insert(0, os.path.join(REPO, 'skill', 'scripts'))      # python3 -I leaves every directory off the path
import adp_index  # noqa: E402

PAGE_KINDS = ('component', 'theme', 'template', 'guide')      # @kind: the keys of KIND in catalog/parts/catalog.js; the page drops an entry of any other
KINDS = {'kit', 'layout', 'pattern', 'viz', 'theme', 'runtime', 'template', 'guide'}
FOLDER_KIND = {'viz': 'viz', 'patterns': 'pattern', 'layout': 'layout', 'themes': 'theme', 'templates': 'template', 'guides': 'guide'}
STATUS = {'new', 'stable'}
GLOBALS = {'htm-preact', 'marked', 'dompurify'}      # the CDN scripts the catalog page can add (catalog/parts/catalog.js, CDN)
KNOWN = {'id', 'kind', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'provides', 'config', 'tokens', 'globals',
         'db', 'source', 'preview', 'changed', 'fonts', 'extends', 'related', 'optional', 'files'}
ALSO = ('updated', 'tags', 'requires', 'globals', 'db')      # required on every header on top of adp_index.REQUIRED; `none` when empty
ID = re.compile(r'[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9.-]*')
SEMVER = re.compile(r'\d+\.\d+\.\d+')
DATE = re.compile(r'\d{4}-\d{2}-\d{2}')
MEMBER = re.compile(r'[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*')
TOKEN = re.compile(r'--[A-Za-z0-9_<>-]+\??')       # a trailing ? marks an optional property
NAME = r'[A-Za-z0-9_-]'
VAR_READ = re.compile(r'var\(\s*(--[A-Za-z0-9_-]+)\s*\)')      # a read with a fallback is optional: it needs no declaration
PARENS = re.compile(r'var\(|[();\n]')
PROPERTY = re.compile(r'--[A-Za-z0-9_-]+')
BUILT = re.compile(r'(?<![A-Za-z0-9_-])(--[A-Za-z0-9_-]*)(?:[\'"`]\s*\+|\$\{)')      # '--seam-' + i, `--c-${pen}`: a name made at run time
SETS = (re.compile(r'(?<![A-Za-z0-9_-])(--[A-Za-z0-9_-]+)\s*:'), re.compile(r'setProperty\(\s*[\'"`](--[A-Za-z0-9_-]+)[\'"`]'))
READS = re.compile(r'var\(\s*--|getPropertyValue\(\s*[\'"`]--')      # a file that reads a custom property, with a fallback or not
SUMMARY_MAX = 260


def header_of(text, path):
    """adp_index.parse_header(text, path): a dict of tag names plus name and about; None when the file has no header."""
    h = adp_index.parse_header(text, path)
    return h if h and any(k not in ('name', 'about') for k in h) else None


def kind_of_path(path):
    """The id prefix a main file's place in the catalog stands for; None for a place with no rule."""
    parts = path.split('/')
    if parts == ['adp.js']:
        return 'runtime'
    if parts[0] != 'kit':
        return None
    return FOLDER_KIND.get(parts[1], None) if len(parts) > 2 else 'kit'


def body_of(path, text):
    """What a file says outside its header and its comments: /* */ and <!-- --> comments are dropped (a // comment stays).
    A .json file is read as it is."""
    if path.lower().endswith('.json'):
        return text
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    return text if path.lower().endswith(('.js', '.css')) else re.sub(r'<!--.*?-->', ' ', text, flags=re.S)


def files_of(root, entry):
    """{path: body_of} of every file in the entry's index record that is in the tree."""
    out = {}
    for f in entry.get('files', []):
        p = f.get('path') if isinstance(f, dict) else None
        if p and os.path.isfile(os.path.join(root, p)):
            out[p] = body_of(p, open(os.path.join(root, p), encoding='utf-8', errors='replace').read())
    return out


def sets_of(body):
    """The custom properties a text gives a value: `--x: ...` in a rule or a style string, setProperty('--x', ...)."""
    return {m for rx in SETS for m in rx.findall(body)}


def required_sets(root, names):
    """{property: 'path (entry id)'}: the custom properties set by the stylesheets of the entries `names` (a header's @requires),
    and of the entries those require. The walk stops at a theme: a theme is the supplier of the tokens, not a reason to
    leave one out, and an entry made for one theme still lists what it reads of it."""
    by = {e['id']: e for e in load(root)[0]}
    seen, todo, out = set(), list(names), {}
    while todo:
        i = todo.pop(0)
        if i in seen or i not in by or i.split('.')[0] == 'theme':
            continue
        seen.add(i)
        todo.extend(by[i].get('requires') or [])
        for p, body in files_of(root, by[i]).items():
            if p.lower().endswith('.css'):
                for t in sorted(sets_of(body)):
                    out.setdefault(t, f'{p} ({i})')
    return out


def bare_reads(body):
    """The custom properties read as var(--x) with no fallback, and not inside the fallback of another var(): the reads
    that give nothing when the property is not set."""
    out, depth = set(), []
    for m in PARENS.finditer(body):
        t = m.group()
        if t == 'var(':
            r = VAR_READ.match(body, m.start())
            if r and True not in depth:
                out.add(r.group(1))
            depth.append(True)
        elif t == '(':
            depth.append(False)
        elif t == ')':
            if depth:
                depth.pop()
        else:      # a var() ends before the end of its declaration and of its line
            depth = []
    return out


def token_issues(tokens, bodies, given=None):
    """[(rule, message)]: @tokens against the entry's files. @tokens lists what the theme must supply.
    tokens: the items of @tokens; bodies: {path: body_of} of the entry's files; given: required_sets of its @requires.
    A property the entry's own files set, or the stylesheet of an entry it requires sets, is not the theme's to supply:
    tokens-own: @tokens lists one (the message says who sets it); a read of one needs no declaration.
    tokens-unread: a listed token no file mentions. A name counts as mentioned when it is written in a file, or when a file
    builds names at run time from a prefix of it (`'--seam-' + i`, `--c-${pen}`); built from a bare `--`, the rest of the
    name must also be written at the start of a string. A family (--c-<pen>) counts when a written name fits it or a built
    prefix starts as it does. The ? of an optional token changes nothing here: optional or not, some file has to mention it.
    tokens-undeclared: a property read as var(--x) with no fallback that @tokens does not list (as --x, --x? or a family
    that fits).
    tokens-optional: a token listed as --x? that a file reads as var(--x) with no fallback: optional means every read has one.
    A script that also names the property in a string of its own ('--x', to ask whether it is set) is taken to guard that read."""
    body = '\n'.join(bodies.values())
    names = [t.rstrip('?') for t in tokens if TOKEN.fullmatch(t)]
    plain = {t for t in names if '<' not in t}
    families = {t: re.compile(re.sub(r'<[^>]*>', NAME + '+', t)) for t in names if '<' in t}
    written = set(PROPERTY.findall(body))
    built = set(BUILT.findall(body))
    own = dict(given or {})
    for p, text in bodies.items():
        for t in sets_of(text):
            if own.get(t) not in bodies:      # the entry's own file is named, not a required entry's
                own[t] = p

    def run_time(t):
        for p in built:
            if p == '--':
                if re.search(r'[\'"`]' + re.escape(t[2:]) + f'(?!{NAME})', body):
                    return True
            elif t.startswith(p) and len(t) > len(p):
                return True
        return False

    def family(t):
        prefix = t.split('<')[0]
        return any(families[t].fullmatch(w) for w in written) or any(p.startswith(prefix) for p in built)

    out = []
    mine = sorted(t for t in plain if t in own)
    if mine:
        out.append(('tokens-own', '@tokens lists what the theme does not supply: ' + ', '.join(f'{t} is set by {own[t]}' for t in mine)))
    unread = sorted(t for t in plain if t not in own and t not in written and not run_time(t)) + sorted(t for t in families if not family(t))
    if bodies and unread:
        out.append(('tokens-unread', f'@tokens lists what no file of the entry reads: {" ".join(unread)}'))
    bare = bare_reads(body) - set(own)
    undeclared = sorted(t for t in bare - plain if not any(f.fullmatch(t) for f in families.values()))
    if undeclared:
        out.append(('tokens-undeclared', f'the entry reads tokens @tokens does not list: {" ".join(undeclared)}'))
    asked = {t for t in bare if re.search(r'[\'"`]' + re.escape(t) + r'[\'"`]', body)}      # has(el, '--seam') ? 'var(--seam)' : ...
    needed = sorted(t[:-1] for t in tokens if TOKEN.fullmatch(t) and t.endswith('?') and t[:-1] in bare - asked)
    if needed:
        out.append(('tokens-optional', f'@tokens marks as optional what a file reads with no fallback: {" ".join(needed)}'))
    return out


def against_code(path, head, entry, root):
    """[(rule, message)]: where the parsed header says something the entry's own files do not bear out."""
    out = []
    i = head.get('id') or ''
    kind = kind_of_path(path)
    if ID.fullmatch(i):
        k, name = i.split('.', 1)
        stem = os.path.basename(path).split('.')[0]
        if kind and k != kind:
            out.append(('id-path', f'@id {i} but {path} is a {kind} file: the id starts with {kind}.'))
        elif kind and kind != 'runtime' and not (stem == name or stem.startswith(name + '-') or name.startswith(stem + '-')):
            out.append(('id-path', f'@id {i} but the file is named {stem}'))
    bodies = files_of(root, entry)
    words = set(re.findall(r'[A-Za-z_$][\w$]*', '\n'.join(b for p, b in bodies.items() if p.endswith('.js') and 'samples/' not in p)))
    bad = [p for p in head.get('provides', []) if MEMBER.fullmatch(p) and '.' in p and p.split('.')[0] in ('Kit', 'window')
           and not all(s in words for s in p.split('.')[1:] if s != 'Kit')]
    if words and bad:
        out.append(('provides-code', f'@provides names nothing the script defines: {", ".join(bad)}'))
    if 'tokens' in head:
        out.extend(token_issues(head['tokens'], bodies, required_sets(root, head.get('requires', []))))
    else:
        reads = sorted(p for p, body in bodies.items() if READS.search(body))
        if reads:
            out.append(('missing-tag', f'@tokens is required: {reads[0]} reads a custom property (`@tokens none` when the theme supplies none of them)'))
    return out


def cut(text, path):
    """A message when text has a header comment that is not whole in the first adp_index.HEAD characters of the file, else
    None. adp_index and the catalog page read a header there and no further, so to them such a file has no header."""
    limit = adp_index.HEAD
    if path.lower().endswith(adp_index.CODE):
        i = text.find('/**')
        end = text.find('*/', i + 3) + 2 if i >= 0 else 1
    else:
        m = re.search(r'<!--.*?-->', text, re.S) if path.lower().endswith(adp_index.PROSE) else None
        i, end = (m.start(), m.end()) if m else (0, 1)
    if end <= limit or '@id' not in text[i:end]:      # end is 1 when there is no comment, or the comment has no end
        return None
    return (f'the header comment runs from character {i} to {end} of the file; a header is read in the first {limit} '
            f'characters (adp_index.HEAD), so this one is not: ' + ('move it to the top of the file' if end - i <= limit
                                                                   else f'shorten it by {end - limit} characters or more'))


def raw_tags(text, path):
    """[(name, value)] of the tag lines of a file's header as written, a repeated tag once per line; the lines are the ones
    the parser reads (adp_index._comment). The parser keeps one value of a tag that may be given once and drops a `none`,
    so the parsed header cannot answer duplicate-tag or `@config none`."""
    return [(m.group(1), (m.group(2) or '').strip()) for m in (adp_index.TAG.match(line.strip()) for line in adp_index._comment(text, path) or []) if m]


def validate(path, head, entry, ids, root=None, text=None):
    """[(rule, message)] for one header. head: what header_of returned;
    entry: the catalog entry this file is the main file of;
    root: the catalog directory, to compare the header with the entry's code (left out: only the tags are checked);
    text: the file as written, for what the parsed header cannot answer (duplicate-tag, `@config none`)."""
    written = raw_tags(text, path) if text is not None else []
    out = []
    out.extend(('unknown-tag', f'@{n} is not a header tag') for n in head if n not in KNOWN and n not in ('name', 'about'))
    names = [n for n, _v in written if n in KNOWN and n not in adp_index.MANY]
    out.extend(('duplicate-tag', f'@{n} appears twice') for n in sorted(set(names), key=names.index) if names.count(n) > 1)
    if not head.get('name'):
        out.append(('title', 'the first line of the comment is the entry name'))
    if not head.get('about'):
        out.append(('about', 'a paragraph after the name says what the entry is'))
    need = (*adp_index.REQUIRED, *(n for n in ALSO if n not in adp_index.REQUIRED))
    for n in (*need, 'provides') if path.endswith('.js') else need:      # @tokens: against_code, which reads the files
        if head.get(n, '') == '':      # a list or @db is there when written, `none` included
            out.append(('missing-tag', f'@{n} is required'))
    i = head.get('id')
    if i and (not ID.fullmatch(i) or i.split('.')[0] not in KINDS):
        out.append(('id', f'@id {i}: kind.name with kind one of {", ".join(sorted(KINDS))}'))
    if head.get('kind') and head['kind'] not in PAGE_KINDS:
        out.append(('kind', f'@kind {head["kind"]}: one of {", ".join(PAGE_KINDS)}'))
    if head.get('status') and head['status'] not in STATUS:
        out.append(('status', f'@status {head["status"]}: one of {", ".join(sorted(STATUS))}'))
    if head.get('version') and not SEMVER.fullmatch(head['version']):
        out.append(('version', f'@version {head["version"]}: major.minor.patch'))
    if head.get('updated') and not DATE.fullmatch(head['updated']):
        out.append(('updated', f'@updated {head["updated"]}: YYYY-MM-DD'))
    if head.get('summary') and len(head['summary']) > SUMMARY_MAX:
        out.append(('summary', f'@summary is {len(head["summary"])} characters, at most {SUMMARY_MAX}'))
    ts = head.get('tags', [])
    if len(ts) != len(set(ts)) or any(t != t.lower() for t in ts):
        out.append(('tags', '@tags: a comma list, lowercase, no repeats'))
    bad = [r for r in head.get('requires', []) if r not in ids]
    if bad:
        out.append(('requires', f'@requires names no catalog entry: {", ".join(bad)}'))
    bad = [p for p in head.get('provides', []) if not MEMBER.fullmatch(p)]
    if bad:
        out.append(('provides', f'@provides: dotted names, comma separated; not: {", ".join(bad)}'))
    bad = [t for t in head.get('tokens', []) if not TOKEN.fullmatch(t)]
    if bad:
        out.append(('tokens', f'@tokens: custom properties separated by spaces, like --ink (--ink? when optional); not: {" ".join(bad)}'))
    bad = [g for g in head.get('globals', []) if g not in GLOBALS]
    if bad:
        out.append(('globals', f'@globals: none or {", ".join(sorted(GLOBALS))}; not: {", ".join(bad)}'))
    for what, detail in head.get('config', []):
        if not (what and detail):
            out.append(('config', f'@config {(what or detail)[:40]}: "what | detail"'))
    if any(n == 'config' and v in ('', 'none') for n, v in written):
        out.append(('config', '@config none: no @config line at all when there is nothing to say'))
    for s in head.get('source', []):
        if not all(s.get(k) for k in ('board', 'file', 'what')):
            out.append(('source', f'@source {" | ".join(s.get(k) or "" for k in ("board", "file", "what"))[:60]}: "board | file | what"'))
    if 'preview' in head and head['preview'] is None:
        out.append(('preview', '@preview: one line of JSON'))
    for x in (head.get('db') or {}).get('unread', []):      # the sections the parser could not read (adp_index._db)
        out.append(('db', f'@db: none, or sections separated by " / ", each starting with reads, writes or note and a space; not: "{x[:40]}"'))
    if root is not None:
        out.extend(against_code(path, head, entry, root))
    return out


def load(root):
    """(entries of the index, {main file: entry}). The index is read only for which files make an entry."""
    cat = json.load(open(os.path.join(root, 'catalog.json'), encoding='utf-8'))['entries']
    by_path = {}
    for e in cat:
        p = e.get('main')
        if p:
            by_path[p] = e
    return cat, by_path


def index_issues(root):
    """[('index', line)] for each place catalog.json is not what the headers build (adp_index.differences)."""
    try:
        cat = json.load(open(os.path.join(root, 'catalog.json'), encoding='utf-8'))
        lines = adp_index.differences(cat, adp_index.build_index(root))
    except Exception as x:      # no index to compare with is a failure, not a pass
        return [('index-build', f'catalog.json or adp_index.build_index: {type(x).__name__}: {x}')]
    return [('index', m) for m in lines]


def check(root, files=None):
    """(results, ids): results is [(path, state, [(rule, message)])] with state header, legacy or skipped."""
    cat, by_path = load(root)
    ids = {e['id'] for e in cat}
    paths = sorted(by_path) if files is None else files
    results = []
    for p in paths:
        rel = os.path.relpath(os.path.abspath(p), os.path.abspath(root)).replace(os.sep, '/') if files is not None else p
        e = by_path.get(rel)
        if e is None:
            results.append((rel, 'skipped', []))
            continue
        if not os.path.isfile(os.path.join(root, rel)):
            results.append((rel, 'legacy', [('missing-file', f'the index lists {rel} for {e["id"]} but the file is not there')]))
            continue
        text = open(os.path.join(root, rel), encoding='utf-8').read()
        head = header_of(text, rel)
        if head is None or not head.get('id'):
            late = cut(text, rel)      # a header is there, past where a header is read
            results.append((rel, 'legacy', [('header-cut', late) if late else ('legacy', 'no @id header')]))
            continue
        results.append((rel, 'header', validate(rel, head, e, ids, root, text)))
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
    index = index_issues(root)
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
        rules.update(r for r, _m in index)
        for r, n in rules.most_common():
            print(f'  rule {r}: {n}')
        return 0
    bad = [(p, s, i) for p, s, i in results if i]
    for p, _s, issues in bad:
        for r, m in issues:
            print(f'{p}: [{r}] {m}')
    checked = sum(1 for _p, s, _i in results if s == 'header')
    for r, m in index:
        print(f'catalog.json: [{r}] {m}')
    if bad or index:
        print(f'{len(bad)} file(s) with problems; catalog.json: {len(index)} problem(s)', file=sys.stderr)
        return 1
    print(f'ok: {checked} header(s) valid, {sum(1 for _p, s, _i in results if s == "skipped")} skipped')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
