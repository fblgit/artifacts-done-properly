#!/usr/bin/env python3
"""adp/1 parts tool (artifact-dataplane skill): part markers -> per-part hashes -> manifest -> diff.

  adp.py setup [--scope user|project|local] [--dry-run] [--yes]   copy refs/<name>/ to the skills folder, write the config, print (--yes: write) the CLAUDE.md pointer
  adp.py init [DIR]                                 DIR/.adp/config.json for project onboarding; also registers the project (name, path) in ~/.adp/projects/
  adp.py projects                                   the registered projects: name, scope, path
  --project NAME|PATH                               optional, never a default: the project root instead of cwd (a directory, or the name of a registered project; unknown: exit 1);
                                                    `log` reads its .adp/log.jsonl, every command logs there when it has an .adp/, `init` without DIR and `setup --scope project|local` use it
  adp.py log [-n N]                                 the last N lines of log.jsonl (every command appends one; project .adp/ else ~/.adp/)
  adp.py check    PAGE|DIR                          markers balance, ids valid and unique, each part has data-part="<id>"
  adp.py manifest PAGE|DIR [--file NAME=PATH ...]   manifest JSON on stdout (schema, page_hash, parts, files, parents)
  adp.py diff     OLD.json NEW.json                 added / removed / changed parts, deepest first, own elements +/-
  adp.py diff-pages OLD NEW [--file NAME=PATH ...]  the same from two pages (or two DIRs), plus the added/removed lines per deepest part

Build and record (each prints what the Artifact / ArtifactData call needs, so nothing is retyped):
  adp.py templates                                  the templates `new` can start from
  adp.py new (TEMPLATE | --tier minimal|default|full) DIR [--title T] [--slug S] [--by NAME] [--content FILE] [--data FILE|DIR] [--theme ID] [--layout ID] [--catalog URL|-|catalog.json]
                                                    --tier instead of TEMPLATE: minimal = starter, default = default, full = not available yet (the published catalog, later)
                                                    a ready adp/2 artifact in DIR (seed.json and seed/ included; --data as in seed), plus ONE publish object: with a fetched catalog index
                                                    (saved, or --catalog) its `files` already carry the taken kit entries, --theme and --layout.
                                                    --content: views from a content file (`## Lead` text; `## View: <label> (id: <id>)`;
                                                    under it `### Section <id> - <title>` + one ```html block each, used verbatim); the
                                                    starter's welcome view goes; prints built {views, sections, parts, bytes}
  adp.py files DIR [--since MANIFEST.json] [--batch N] [--out DIR]
                                                    the publish arguments for DIR; --since: only changed files (null = removed).
                                                    Files artifacts do not serve (archives, .py: use .txt) are left out and listed under
                                                    `skipped`. Over N files (default 250; a publish takes 255) `files` becomes `batches`, each
                                                    also written to DIR.adp/publish-N.json: publish the page with the first, the rest to the url
  adp.py pins publish-1.json=VERSION_ID ... [--out vermap.json]
                                                    {path: version id} for CAT_VERMAP from the batches and the id each publish returned
  adp.py catalog [URL]                              the user's catalog: URL saves it (~/.adp/config.json); prints the Artifact read that
                                                    fetches its catalog.json into ~/.adp/catalogs/<id>/, or the fetched index's ver and built
  adp.py take CATALOG ID ... [--url URL] [--config C.json]
                                                    a files map taking catalog entries by reference, requires first. CATALOG is the catalog
                                                    url (its fetched index is the live one), `-` for the saved catalog, or a local catalog.json
                                                    (the repo's build: not the live catalog, so the output carries a warning)
  adp.py seed DIR [--by NAME] [--version V] [--data FILE|DIR ...] [--summary S] [--role R] [--batches] [--dry-run]
                                                    writes DIR/seed.json (adp-seed/2) and DIR/seed/pack-N.json: the first docs (parts,
                                                    content, changes/000001, agents, manifest/current last) plus every --data doc (a JSON
                                                    list or {docs} of {collection, id, data}, or a DIR of collection/id.json); the page
                                                    expands them on its first open by an editor. --data docs in a generated collection
                                                    merge into the generated doc (a parts title, the change summary). Empty content is
                                                    skipped (skipped_empty). --batches: the same docs as ArtifactData batches instead, for
                                                    an agent that writes them itself; --dry-run: counts only
  adp.py suggest CATALOG --for "free words" [--n 3] [--kind K]
                                                    catalog entries ranked by overlap with tags, name, summary, id, provides and about, grouped by kind prefix (no model call)
  adp.py kit list [CATALOG] [--kind K] [--tag T]    one JSON line per entry; CATALOG defaults to - (the saved catalog)
  adp.py kit show ID [CATALOG]                      name, summary, about, tags, files, requires, provides
  adp.py kit describe ID [CATALOG]                  the mount signature: needs, provides, requires, file paths, the sample path
The loop (docs/architecture.md "The loop"; each reads what the model fetched, from files):
  adp.py export DIR --url URL [--files-listing F.json] [--docs D.json] [--version V]
                                                    remote-to-local incoming: without the listing or the docs it prints the reads (exit 2);
                                                    with them DIR.adp/incoming/, state.json, the nested repo (base/live/work), report.json,
                                                    live merged into work when nothing is held; ~/.adp/artifacts.json updated
  adp.py classify BASE.json LIVE.json INCOMING.json new/ours/theirs/applied/held/retired over parts and files (contract 4)
  adp.py propose DIR --by NAME --summary S [--retire ID --reason R ...]   (every deleted part id needs its own --retire ID --reason R pair, paired in order)
                                                    local-to-remote incoming: the incoming/<pid> doc and its one ArtifactData batch;
                                                    exit 2 with the list when anything is held, a part is deleted unretired, or no export
  adp.py ack DIR [--result FILE | stdin] [--proposal PID]
                                                    a publish or batch result into state.json; --proposal: an applied one moves base
  adp.py gate [--input FILE | stdin]                the PreToolUse hook decision: deny while the inbox holds anything or a pin is stale
  adp.py hold DIR ID ... --by NAME [--hours H (at most 2)] [--pins P.json] [--config C.json] [--unlock PREFIX ...]
                                                    the hold batch for parts you will touch
  adp.py record OLD.json DIR --seq N --by NAME --summary S [--version V] [--threads T,..] [--pins P.json]
                [--config C.json] [--unlock PREFIX ...] [--holds H.json]
                                                    the record batch after a publish; OLD.json is manifest/current as read
  adp.py config [DIR] [--doc C.json]                the switches: defaults, current values, locked, locked_parts, links (DIR is accepted and not read)
  adp.py config set KEY VALUE [--doc C.json] [--by NAME] [--pins P.json] [--out DIR]
                                                    the pinned write of config/current (+ a changes/d-<ms> data change)
  adp.py requests DUMP.json [--ack RID --by NAME | --progress RID --text T [--by NAME] |
                --done RID --response FILE [--changed a,b] [--version V] [--turns TURNS.json] [--by NAME]] [--pins P.json] [--out DIR]
                                                    the open requests/ of a page that asks (docs/assist.md; ping-lane requests are listed on purpose, a session needs them to answer a ping); with an option, the pinned
                                                    write that moves one forward, plus presence/<NAME>. --turns: answer a reply in the next turn
Batches are written to files (--out, default DIR.adp/) and printed as `writes` lists whose entries carry file_path.
P.json maps "collection/doc" to the version you read, e.g. {"manifest/current": 4, "parts/home": 2}.
C.json is config/current as read ({schema, at, by, values, changed}, or wrapped in data). With --config, hold and record exit 2
when edit.locked is true ({error: "locked", by, at, reason}) and when a changed part falls under a parts.locked prefix
(whole segments: core matches core and core.x, not corex) unless --unlock PREFIX names it ({error: "locked parts", parts}).
With edit.require-hold, record also needs --holds H.json (parts/<id> docs as {id: {holder: ..}} or a {id: holder} map) and refuses
changed existing parts with no holder, deepest only ({error: "unheld", parts}). VALUE in `config set` is JSON when it parses, else text.

DIR (adp/2, a multi-file artifact laid out at its published paths): every file is hashed; the text files with markers
(.html .js .mjs .css) are parsed one by one, markers must balance within a file, data-part roots may sit in any file;
each file's text outside its parts is hashed as _rest:<path>. Schema adp/2 adds part_file {id: path}.

Markers (HTML or JS/CSS comments): <!-- part:ID --> ... <!-- /part:ID -->  |  /* part:ID */ ... /* /part:ID */
ID: dot-separated lowercase kebab, e.g. triage.keys-table. Hash: sha256 of the text between the markers with
whitespace runs collapsed, first 12 hex; a parent's text includes its children. Stdlib only; run with python3 -I."""
import contextlib, datetime, difflib, hashlib, io, json, math, os, re, shutil, sys

ID = r'[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*'
TAG = re.compile(r'<[A-Za-z][A-Za-z0-9-]*')   # an opening tag (also inside JS template strings)
REST = '_rest'                  # pseudo-part: the text outside every part; check reports how big it is
MARK = re.compile(r'(?:<!--|/\*)\s*(/?)part:(' + ID + r')\s*(?:-->|\*/)')
H = lambda s: hashlib.sha256(s.encode()).hexdigest()[:12]
norm = lambda s: re.sub(r'\s+', ' ', s).strip()


def parse(text):
    """-> (parts {id: (start, end, parent)}, problems)"""
    stack, parts, bad = [], {}, []
    for m in MARK.finditer(text):
        close, pid = m.group(1) == '/', m.group(2)
        line = text.count('\n', 0, m.start()) + 1
        if not close:
            if pid in parts or any(p == pid for p, _ in stack): bad.append(f'line {line}: part {pid} opened twice')
            stack.append((pid, m.end()))
        elif not stack or stack[-1][0] != pid:
            bad.append(f'line {line}: /part:{pid} closes {stack[-1][0] if stack else "nothing"}')
        else:
            _, start = stack.pop()
            parts[pid] = (start, m.start(), stack[-1][0] if stack else '')
    bad += [f'part {p} never closed' for p, _ in stack]
    return parts, bad


def manifest(text, files):
    parts, bad = parse(text)
    if bad: sys.exit('adp check failed:\n  ' + '\n  '.join(bad))
    hp = {p: H(norm(text[s:e])) for p, (s, e, _) in parts.items()}
    hp[REST] = H(norm(own(text, parts, '')))      # everything outside every part: a change there still shows
    el = {p: len(TAG.findall(own(text, parts, p))) for p in [*parts, REST]}   # own elements, children excluded
    hf = {n: hashlib.sha256(open(f, 'rb').read()).hexdigest()[:12] for n, f in files.items()}
    lines = sorted(f'{p}={h}' for p, h in hp.items()) + sorted(f'file:{n}={h}' for n, h in hf.items())
    return {'schema': 'adp/1', 'page_hash': H('\n'.join(lines)), 'parts': dict(sorted(hp.items())), 'files': hf,
            'parents': {**{p: par for p, (_, _, par) in sorted(parts.items())}, REST: ''}, 'elements': dict(sorted(el.items()))}


TEXT = ('.html', '.js', '.mjs', '.css')


SEED = 'seed.json'   # at DIR's root: the index of the first docs (adp-seed/2), written by `new` and `seed`; the page applies it when its db is empty (adp.js)
SEED_DIR = 'seed'     # DIR/seed/pack-NNN.json: the docs themselves, in packs of PACK bytes, manifest/current the last doc of the last pack
PACK = int(os.environ.get('ADP_PACK', 1_500_000))      # bytes of JSON per pack: a published text file may hold 16 MB; a pack this size fetches fast and, when it fails, fails small
PROTO = ('parts', 'content', 'changes', 'agents', 'manifest')   # the collections seed_writes generates; a --data doc there merges into the generated one
# seed.json and seed/ are published with the page and never in the manifest (they hold the manifest)


def is_seed(p):
    """a DIR-relative path that belongs to the seed: never in the manifest, never in the loop"""
    p = p.replace(os.sep, '/'); return p == SEED or p.startswith(SEED_DIR + '/')


def load(d):
    """A DIR -> (files {path: sha12}, marked {path: text}); dotfiles, the root seed.json and seed/ skipped."""
    files, marked = {}, {}
    for root, dirs, names in os.walk(d):
        dirs[:] = sorted(x for x in dirs if not x.startswith('.'))
        for n in sorted(names):
            if n.startswith('.') or is_seed(os.path.relpath(os.path.join(root, n), d)): continue
            p = os.path.relpath(os.path.join(root, n), d); b = open(os.path.join(root, n), 'rb').read()
            files[p] = hashlib.sha256(b).hexdigest()[:12]
            if p.endswith(TEXT) and MARK.search(t := b.decode('utf-8', 'replace')): marked[p] = t
    return files, marked


def manifest_dir(d):
    files, marked = load(d)
    parts, el, par, where = {}, {}, {}, {}
    for f, t in marked.items():
        m = manifest(t, {})
        for k, h in m['parts'].items():
            kk = f'{REST}:{f}' if k == REST else k
            if kk in parts: sys.exit(f'adp check failed: part {kk} in {where[kk]} and {f}')
            parts[kk], el[kk], par[kk], where[kk] = h, m['elements'][k], m['parents'].get(k, ''), f
    lines = sorted(f'{p}={h}' for p, h in parts.items()) + sorted(f'file:{n}={h}' for n, h in files.items())
    return {'schema': 'adp/2', 'page_hash': H('\n'.join(lines)), 'parts': dict(sorted(parts.items())), 'files': files,
            'parents': dict(sorted(par.items())), 'elements': dict(sorted(el.items())), 'part_file': dict(sorted(where.items()))}


def own(text, parts, p):
    """A part's own text: its region minus its child parts (p = '' or REST: the page minus every top-level part)."""
    s, e = (0, len(text)) if p in ('', REST) else parts[p][:2]
    want = '' if p == REST else p
    out, i = [], s
    for cs, ce in sorted((cs, ce) for cs, ce, par in parts.values() if par == want and s <= cs < e):
        out.append(text[i:cs]); i = ce
    return MARK.sub('', ''.join(out) + text[i:e])


def diff(o, n):
    op, np_ = o.get('parts', {}), n.get('parts', {})
    par = {**o.get('parents', {}), **n.get('parents', {})}
    oe, ne = o.get('elements', {}), n.get('elements', {})
    added, removed = sorted(set(np_) - set(op)), sorted(set(op) - set(np_))
    changed = [p for p in np_ if p in op and op[p] != np_[p]]
    touched = set(changed) | set(added) | set(removed)
    deepest = [p for p in changed if not any(c != p and par.get(c) == p for c in touched)] + added + removed
    grown = {p: f'{ne.get(p, 0) - oe.get(p, 0):+d}' for p in changed if p in oe and p in ne and ne[p] != oe[p]}
    return {'page_hash': [o.get('page_hash'), n.get('page_hash')], 'added': added, 'removed': removed,
            'changed': sorted(changed, key=lambda p: (-p.count('.'), p)), 'deepest': sorted(set(deepest)),
            'elements': grown,          # own elements gained (+) or lost (-): a new or dropped unmarked piece
            'files': {f: [o.get('files', {}).get(f, ''), h] for f, h in n.get('files', {}).items() if o.get('files', {}).get(f) != h}}


HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(HERE, 'templates')
now = lambda: datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
slugify = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40] or 'artifact'


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False, separators=(',', ':')))     # one line: cheaper to read back
    return 0


def agent_id(by):
    """The agents/ doc id for a --by name: the doc-id charset only, so "Claude (ADP - Bootstrap)" becomes claude-adp-bootstrap."""
    return re.sub(r'-{2,}', '-', re.sub(r'[^A-Za-z0-9_\-.~:@+]+', '-', by)).strip('-').lower() or 'agent'


def optall(a, name):
    return [a[i + 1] for i, x in enumerate(a) if x == name and i + 1 < len(a)]


def opt(a, name, default=None):
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


FLAGS = ('--dry-run', '--batches', '--yes', '--hook')      # the options that take no value


def bare(a):
    """positional args: everything that is not a --flag or a flag's value"""
    out, skip = [], False
    for x in a:
        if skip: skip = False
        elif x in FLAGS: pass
        elif x.startswith('--'): skip = True
        else: out.append(x)
    return out


def read_json(path, what='file'):
    """The JSON in a file the person named; a missing or malformed one is one line and exit 1, not a traceback."""
    try:
        with open(path, encoding='utf-8') as f: return json.load(f)
    except OSError as e: sys.exit(f'{what}: cannot read {path}: {e.strerror}')
    except ValueError as e: sys.exit(f'{what}: {path} is not JSON: {e}')


def tmeta(name):
    p = os.path.join(TPL, name, 'template.json')
    if not os.path.isfile(p): sys.exit(f'no template {name}: ' + ', '.join(sorted(os.listdir(TPL))))
    return json.load(open(p))


ADP_HOME = os.environ.get('ADP_HOME') or os.path.join(os.path.expanduser('~'), '.adp')
CAT_URL = re.compile(r'https://claude\.ai/(?:code/)?artifact/[A-Za-z0-9-]+/?$')


def cat_dir(url):
    return os.path.join(ADP_HOME, 'catalogs', url.rstrip('/').rsplit('/', 1)[-1])


def fetch_call(url):
    """The one Artifact read that brings a catalog's live index to disk, where `take` and `catalog` find it."""
    return {'tool': 'Artifact', 'action': 'read', 'url': url, 'path': 'catalog.json', 'out_dir': cat_dir(url), 'then': 'run the command again'}


def saved_catalog():
    p = os.path.join(ADP_HOME, 'config.json')
    return (json.load(open(p)) if os.path.isfile(p) else {}).get('catalog')


def catalog_cmd(a):
    pos = bare(a[1:])
    if pos:
        if not CAT_URL.match(pos[0]): sys.exit('catalog: a claude.ai artifact url (https://claude.ai/artifact/<id>)')
        p = os.path.join(ADP_HOME, 'config.json'); os.makedirs(ADP_HOME, exist_ok=True)
        cfg = json.load(open(p)) if os.path.isfile(p) else {}; cfg['catalog'] = pos[0].rstrip('/')
        json.dump(cfg, open(p, 'w'), indent=1)
    url = saved_catalog()
    if not url: return emit({'catalog': None, 'next': 'adp.py catalog <url> saves the user\'s catalog (SKILL.md says how to find it); never assume one'})
    idx = os.path.join(cat_dir(url), 'catalog.json')
    out = {'catalog': url, 'index': idx, 'fetched': os.path.isfile(idx)}
    if out['fetched']:
        c = json.load(open(idx)); out.update(ver=c.get('ver') or None, built=c.get('built'), entries=len(c.get('entries', [])))
        out['refresh'] = fetch_call(url)      # the same read, when the catalog has published since
    else: out['fetch'] = fetch_call(url)
    return emit(out)


def tree(d):
    for root, dirs, names in os.walk(d):
        dirs[:] = sorted(x for x in dirs if x != '__pycache__')
        for n in sorted(names):
            yield os.path.relpath(os.path.join(root, n), d).replace(os.sep, '/')


# what the artifact service serves, by extension; a publish with any other file is refused (a .py or .sh goes up as .txt)
SERVED = {'.html', '.css', '.js', '.mjs', '.wasm', '.json', '.map', '.geojson', '.webmanifest', '.txt', '.md', '.csv', '.xml',
          '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav',
          '.ogg', '.mp4', '.webm', '.pdf'}
LIMIT = 250     # files per publish (the tool takes 255); the page is one more


def served(p):
    return os.path.splitext(p)[1].lower() in SERVED


def publish_args(d, only=None):
    """The Artifact publish call for DIR: the page, root, and every other file mapped to itself; unservable files listed."""
    fs = [p for p in tree(d) if p != 'index.html' and not p.startswith('.')]
    m = {p: p for p in fs if (only is None or p in only) and served(p)}
    out = {'file_path': os.path.join(d, 'index.html'), 'root': d, 'files': m}
    skipped = [p for p in fs if (only is None or p in only) and not served(p)]
    if skipped: out['skipped'] = skipped
    return out


def page_deps(d):
    """the local files index.html loads, in order: they go up with the page so version 1 renders"""
    p = os.path.join(d, 'index.html')
    if not os.path.isfile(p): return []
    out = []
    for ref in re.findall(r'(?:src|href)="([^"]+)"', open(p, encoding='utf-8').read()):
        if not re.match(r'(?:[a-z]+:|#|//)', ref) and ref not in out and os.path.isfile(os.path.join(d, ref)): out.append(ref)
    return out


def batched(out, d, n, where):
    """over n files: `files` -> `batches` (page dependencies first), each written to where/publish-N.json"""
    m = out['files']
    if len(m) <= n: return out
    deps = [p for p in page_deps(d) if p in m]; order = deps + [p for p in m if p not in deps]
    bs = [{p: m[p] for p in order[i:i + n]} for i in range(0, len(order), n)]
    os.makedirs(where, exist_ok=True); paths = []
    for i, b in enumerate(bs, 1):
        p = os.path.join(where, f'publish-{i}.json'); json.dump(b, open(p, 'w'), indent=0); paths.append(os.path.abspath(p))
    out.pop('files'); out['batches'] = bs; out['batch_files'] = paths
    out['note'] = (f'{len(m)} files: publish the page with batches[0] (new artifact: add capabilities, icon), then each other batch to the '
                   'same url; every publish passes file_path and root, the tool refuses files without them; note every version id, then adp.py pins')
    return out


def pins(a):
    pairs = [x for x in bare(a[1:]) if '=' in x]
    if not pairs: sys.exit('usage: adp.py pins publish-1.json=VERSION_ID ... [--out vermap.json]')
    vm = {}
    for x in pairs:
        f, ver = x.rsplit('=', 1)
        for p in json.load(open(f)): vm[p] = ver
    out = opt(a, '--out') or os.path.join(os.path.dirname(os.path.abspath(pairs[0].rsplit('=', 1)[0])), 'vermap.json')
    json.dump(vm, open(out, 'w'), indent=0, sort_keys=True)
    return emit({'pinned': len(vm), 'vermap': os.path.abspath(out), 'next': f'CAT_URL=<url> CAT_VERMAP={out} make catalog, then publish catalog.json to the same url'})


SECTION = re.compile(r'^###\s+Section\s+(\S+)\s*(?:[\u2014\u2013-]+\s*(.*?))?\s*$')
VIEWH = re.compile(r'^##\s+View:\s*(.*?)\s*(?:\(\s*id:\s*(\S+?)\s*\))?\s*$')


def read_content(path):
    """-> (lead, [{label, id, sections: [(id, title, html)]}]) from a content file; a malformed one exits 2 with the line."""
    def bad(n, msg): sys.stderr.write(f'{path}:{n}: {msg}\n'); sys.exit(2)
    lines = open(path, encoding='utf-8').read().split('\n'); lead, views, sec, mode = [], [], None, ''
    i = 0
    while i < len(lines):
        l = lines[i]; i += 1
        if re.match(r'^##\s+Lead\s*$', l): mode = 'lead'; continue
        mv = VIEWH.match(l)
        if mv:
            if not mv.group(2) or not re.fullmatch(ID, mv.group(2)): bad(i, f'view "{mv.group(1)}" has no (id: <id>) with a valid id')
            views.append({'label': mv.group(1), 'id': mv.group(2), 'sections': []}); mode = 'view'; sec = None; continue
        if re.match(r'^##\s', l) and not l.startswith('###'): mode = ''; continue
        ms = SECTION.match(l)
        if ms and mode == 'view':
            if not re.fullmatch(ID, ms.group(1)): bad(i, f'section id {ms.group(1)} is not a part id')
            sec = [ms.group(1), ms.group(2) or ms.group(1), None, i]; views[-1]['sections'].append(sec); continue
        if mode == 'lead': lead.append(l)
        elif mode == 'view' and sec and sec[2] is None and l.strip() == '```html':
            body = []
            while i < len(lines) and lines[i].rstrip() != '```': body.append(lines[i]); i += 1
            if i >= len(lines): bad(sec[3], f'section {sec[0]}: the html block is not closed')
            i += 1; sec[2] = '\n'.join(body)
    for v in views:
        for sid, _, html, n in v['sections']:
            if html is None: bad(n, f'section {sid} has no ```html block')
    return '\n'.join(lead).strip(), [{**v, 'sections': [x[:3] for x in v['sections']]} for v in views]


def build_content(d, path):
    """Replace the starter's welcome view with the views of a content file: parts/app.js and content.js, the html verbatim."""
    lead, views = read_content(path)
    ids = [v['id'] for v in views] + [x[0] for v in views for x in v['sections']]
    dup = sorted({i for i in ids if ids.count(i) > 1} | ({'settings'} & set(ids)))
    if dup: sys.stderr.write(f'{path}: ids used twice, or taken by the settings view: {", ".join(dup)}\n'); sys.exit(2)
    # a section named page.lead is the page's lead (the header owns that part), not a card
    for v in views:
        for x in [x for x in v['sections'] if x[0] == 'page.lead']: v['sections'].remove(x); lead = lead or x[2].strip()
    views = [v for v in views if v['sections']]
    if not views: sys.stderr.write(f'{path}: no `## View: <label> (id: <id>)` with sections\n'); sys.exit(2)
    ap, cp = os.path.join(d, 'parts', 'app.js'), os.path.join(d, 'content.js')
    js, cj = open(ap, encoding='utf-8').read(), open(cp, encoding='utf-8').read()
    q = json.dumps; titles, vjs, cont = {}, [], {}
    for v in views:
        cards = '\n'.join(f'      <!-- part:{i} --><div class="card" data-part="{i}" data-comment-target></div><!-- /part:{i} -->' for i, _, _ in v['sections'])
        vjs.append(f"  /* part:{v['id']} */\n  {q(v['id'])}: {{\n    label: {q(v['label'])},\n    parts: {q([v['id']] + [x[0] for x in v['sections']])},\n"
                   f"    html: () => `<section class=\"view\" data-part=\"{v['id']}\" data-comment-target aria-label={q(v['label'])}>\n{cards}\n    </section>`,\n  }},\n  /* /part:{v['id']} */")
        titles[v['id']] = v['label']
        for i, t, h in v['sections']: titles[i] = t; cont[i] = {'part': i, 'title': t, 'html': h}
    a0, a1 = js.index('  /* part:home */'), js.index('  /* /part:home */') + len('  /* /part:home */')
    js = js[:a0] + '\n'.join(vjs) + js[a1:]
    js = re.sub(r"  home: 'Home', 'home.welcome'.*?'home.about': 'How this page works',\n", lambda _: '  ' + ', '.join(f'{q(k)}: {q(t)}' for k, t in titles.items()) + ',\n', js, flags=re.S)
    js = re.sub(r"/\* A switch of the template's own.*?\n\}\n\n", '', js, flags=re.S)
    js = re.sub(r"\n  else if \(window\.ADP && ADP\.config\) \{ const c = \$\('\[data-part=\"home\.about\"\]'\).*?\}\n", '\n', js)
    js = js.replace("show(view === 'settings' ? 'home' : 'settings')", "show(view === 'settings' ? Object.keys(VIEWS)[0] : 'settings')")
    m = re.search(r'window\.ADP_CONTENT\s*=\s*(\{.*\})\s*;', cj, re.S); old = json.loads(m.group(1))
    new_c = {k: v for k, v in old.items() if k.startswith('settings')}
    new_c['page.lead'] = dict(old['page.lead'], html=lead or old['page.lead']['html']); new_c.update(cont)
    body = '{\n' + ',\n'.join(f' {q(k, ensure_ascii=False)}: {q(v, ensure_ascii=False)}' for k, v in new_c.items()) + '\n}'
    cj = cj[:m.start(1)] + body + cj[m.end(1):]
    open(ap, 'w', encoding='utf-8').write(js); open(cp, 'w', encoding='utf-8').write(cj)
    return {'views': len(views), 'sections': len(cont), 'parts': len(views) + len(cont), 'bytes': sum(len(c['html'].encode()) for c in cont.values())}


def taken(src, ids, a):
    """`take`'s own output for ids, as {} plus the exit code: new merges it into its publish so the call is pasted once."""
    pass_on = [x for f in ('--url', '--config') if opt(a, f) for x in (f, opt(a, f))]
    buf, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(err):
        try: code = take(['take', src, *ids, *pass_on])
        except SystemExit as e: code = e.code if isinstance(e.code, int) else 1; err.write(str(e.code) if not isinstance(e.code, int) and e.code is not None else '')
    out = json.loads(buf.getvalue()) if buf.getvalue().strip() else {}
    if code and not out: out = {'error': 'take failed', 'catalog': src, 'reason': err.getvalue().strip()}   # the take's own message, so the caller sees why (a local index needs --url)
    return out, code


def base_chain(name):
    """The template and every template under it, base first (default -> assistant -> starter): each layer overrides the one before."""
    out = []
    while name:
        if name in out: sys.exit(f'template {name}: base loop ({" -> ".join(out + [name])})')
        out.insert(0, name); name = tmeta(name).get('base')
    return out


def real_name(p):
    """A template keeps a `.txt` on files the artifact service would serve as pages (index.html.txt); the project gets the real name. A file whose own name has no other extension keeps its .txt."""
    stem = p[:-4] if p.endswith('.txt') else p
    return stem if stem != p and os.path.splitext(stem)[1] else p


TIERS = {'minimal': 'starter', 'default': 'default', 'full': None}


INSTALLED = ('id', 'name', 'kind', 'group', 'summary', 'version', 'requires')


def installed_index(src, take):
    """What a page has installed: the entries it takes and everything they require (the files it loads), in load order, cut to
    INSTALLED from the owner's catalog.json (a local file, or the copy `catalog` fetched into ~/.adp). With no catalog on disk an entry is
    just its id: the list is still true, only its words are missing."""
    p = src if src and src != '-' and os.path.isfile(src) else os.path.join(cat_dir(src), 'catalog.json') if src and CAT_URL.match(src) else None
    c = read_json(p, 'catalog') if p and os.path.isfile(p) else {}
    by = {e['id']: e for e in c.get('entries', [])}
    order, seen = [], set()

    def visit(i):
        if i in seen: return
        seen.add(i)
        for r in (by.get(i) or {}).get('requires') or []: visit(r)
        order.append(i)
    for i in take: visit(i)
    return {'schema': 'installed/1', 'url': c.get('url') or (src if src and CAT_URL.match(src) else ''), 'ver': c.get('ver') or '', 'built': c.get('built') or '',
            'entries': [{k: by[i][k] for k in INSTALLED if k in by[i]} if i in by else {'id': i} for i in order]}


def new(a):
    pos = bare(a[1:]); tier = opt(a, '--tier')
    if '--tier' in a:
        if tier not in TIERS or len(pos) != 1: sys.exit('usage: adp.py new --tier minimal|default|full DIR (not together with TEMPLATE)')
        if tier == 'full': sys.exit('tier full is not available yet')
        if not os.path.isfile(os.path.join(TPL, TIERS[tier], 'template.json')): sys.exit(f"tier {tier}: template '{TIERS[tier]}' not found")
        pos = [TIERS[tier]] + pos
    if len(pos) != 2: sys.exit('usage: adp.py new TEMPLATE|--tier T DIR [--title T] [--slug S] [--by NAME] [--content FILE] [--data FILE|DIR] [--theme ID] [--layout ID] [--catalog URL|-|catalog.json]')
    name, d = pos
    if os.path.exists(d) and os.listdir(d): sys.exit(f'{d} exists and is not empty')
    meta = tmeta(name); title = opt(a, '--title', 'Untitled artifact'); slug = opt(a, '--slug') or slugify(title)
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', slug): sys.exit('--slug: lowercase kebab, e.g. status-pill')
    content = opt(a, '--content')
    if content:
        if not os.path.isfile(content): sys.exit(f'--content: no file {content}')
        if name != 'starter' and tmeta(name).get('base') != 'starter': sys.exit('--content needs the starter or a template based on it')
        read_content(content)       # a malformed file fails before anything is written
    layers = base_chain(name)
    files = {}
    for layer in layers:
        src = os.path.join(TPL, layer)
        for p in tree(src):
            if p != 'template.json': files[real_name(p)] = os.path.join(src, p)
    for p in meta.get('drop', []): files.pop(real_name(p), None)
    files['adp.js'] = os.path.join(HERE, 'assets', 'adp.js')
    cat = opt(a, '--catalog')
    cat = cat if cat and CAT_URL.match(cat) else saved_catalog()
    cat = cat or 'none saved yet: python3 adp.py catalog <url> saves the owner\'s catalog url'
    sub = lambda t: t.replace('{{title}}', title).replace('{{slug}}', slug).replace('{{catalog}}', cat)
    for p, src in sorted(files.items()):
        dst = os.path.join(d, sub(p)); os.makedirs(os.path.dirname(dst), exist_ok=True)
        if p == 'adp.js': shutil.copyfile(src, dst); continue
        with open(src, encoding='utf-8') as f, open(dst, 'w', encoding='utf-8') as g: g.write(sub(f.read()))
    built = build_content(d, content) if content else None
    tk = list(dict.fromkeys(meta.get('take', []) + optall(a, '--theme') + optall(a, '--layout')))
    if any(tmeta(l).get('installed') for l in layers):     # the My catalog tab lists this file
        ix = installed_index(opt(a, '--catalog') or saved_catalog(), tk)
        if opt(a, '--url'): ix['url'] = opt(a, '--url')       # the link the owner gave wins over the one inside the file
        with open(os.path.join(d, 'installed.json'), 'w', encoding='utf-8') as f: json.dump(ix, f, ensure_ascii=False, separators=(',', ':'))
    seed_file(d, opt(a, '--by') or 'adp', data=data_docs(optall(a, '--data')), summary=opt(a, '--summary'), role=opt(a, '--role', ''))
    design = meta.get('design') or (tmeta(meta['base']).get('design', '') if meta.get('base') else '')
    out = {'template': name, 'dir': d, 'title': title, 'slug': slug,
           'publish': dict(publish_args(d), capabilities=meta.get('capabilities', {})),
           'take': tk,
           'design': design}
    if built: out['built'] = built
    src = opt(a, '--catalog'); saved = saved_catalog()
    if src is None and saved and os.path.isfile(os.path.join(cat_dir(saved), 'catalog.json')): src = saved
    merged = bool(src and tk)
    if merged:
        t, code = taken(src, tk, a)
        if code: emit(t); sys.exit(2)
        out['publish']['files'].update(t['files']); out['catalog'] = t['catalog']; out['entries'] = t['entries']
    out['next'] = ['adp.py check ' + d,
                   'Design it: read `design` above, take a theme and the layouts the content needs from the catalog, then write page.css and the views for this content (a script that emits them beats typing)' if design and not built else '',
                   'Artifact publish with the `publish` arguments (first publish: add icon; label "adp/2 start"); its files already carry the kit entries' if merged else 'Artifact publish with the `publish` arguments (first publish: add icon; label "adp/2 start")',
                   ('adp.py take ' + (saved or '<catalog url>') + ' ' + ' '.join(tk) + ', then publish those files to the same url') if tk and not merged else '',
                   'Open the page as an editor (you, or the owner): it expands seed.json and seed/ into its database on that first open and shows what ADP is while it does. Only when nobody can open it: adp.py seed ' + d + ' --batches prints the ArtifactData batches']
    out['next'] = [x for x in out['next'] if x]
    return emit(out)


def take(a):
    pos = bare(a[1:])
    if len(pos) < 2: sys.exit('usage: adp.py take CATALOG ID ... [--url URL] [--config C.json]   CATALOG: the catalog url, - (saved), or a local catalog.json')
    src = pos[0]
    if src == '-': src = saved_catalog() or sys.exit('take: no saved catalog; adp.py catalog <url> saves one')
    live = bool(CAT_URL.match(src))
    if live:
        url, idx = src.rstrip('/'), os.path.join(cat_dir(src), 'catalog.json')
        if not os.path.isfile(idx): emit({'error': 'index not fetched', 'catalog': url, 'fetch': fetch_call(url)}); sys.exit(2)
    else:
        idx = src
        if not os.path.isfile(idx): sys.exit(f'take: {src} is neither a catalog url nor a catalog.json')
        cfg = cvalues(read_doc(opt(a, '--config'))) if opt(a, '--config') else {}
        url = opt(a, '--url') or cfg.get('links.catalog') or json.load(open(idx)).get('url')
        if not url: sys.exit('take: no catalog url. Pass the catalog url as CATALOG (then the index is the live one), or --url with a local index')
    cat = json.load(open(idx)); by = {e['id']: e for e in cat['entries']}
    order, seen = [], set()
    def visit(i):
        if i in seen: return
        if i not in by: sys.exit(f'no entry {i} in {pos[0]}')
        seen.add(i)
        for r in by[i].get('requires', []): visit(r)
        order.append(i)
    for i in pos[1:]: visit(i)
    m = {}
    for i in order:
        for f in by[i]['files']:
            if f.get('role') == 'sample' and i not in pos[1:]: continue
            m[f['path']] = dict({'artifact': url, 'path': f['path']}, **({'ver': f['ver']} if f.get('ver') else {}))
    info = {'url': url, 'index': os.path.abspath(idx), 'live': live, 'ver': cat.get('ver') or None, 'built': cat.get('built')}
    if not live: info['warning'] = 'a local index is a build, not the live catalog: a file it lists may be missing there. adp.py take <catalog url> ... reads the fetched live index'
    return emit({'catalog': info, 'entries': order, 'files': m, 'sha256': {f['path']: f['sha256'] for i in order for f in by[i]['files'] if f['path'] in m}})


def index_of(src, a):
    """(catalog dict, warning or None) for a CATALOG argument, resolved as `take` does: url (fetched index), - (saved), or a local catalog.json."""
    if src == '-': src = saved_catalog() or sys.exit('no saved catalog; adp.py catalog <url> saves one')
    if CAT_URL.match(src):
        idx = os.path.join(cat_dir(src), 'catalog.json')
        if not os.path.isfile(idx): emit({'error': 'index not fetched', 'catalog': src.rstrip('/'), 'fetch': fetch_call(src.rstrip('/'))}); sys.exit(2)
        return json.load(open(idx)), None
    if not os.path.isfile(src): sys.exit(f'{src} is neither a catalog url nor a catalog.json')
    return json.load(open(src)), 'a local index is a build, not the live catalog: a file it lists may be missing there'


WORD = re.compile(r'[a-z0-9]+')
STOP = {'a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'for', 'with', 'between', 'by', 'is', 'it', 'as', 'at', 'my', 'that', 'this', 'from'}


def suggest(a):
    pos, words, n = bare(a[1:]), opt(a, '--for'), int(opt(a, '--n', 3))
    if len(pos) != 1 or not words: sys.exit('usage: adp.py suggest CATALOG --for "free words" [--n 3] [--kind K]')
    cat, warn = index_of(pos[0], a); want = set(WORD.findall(words.lower())); want |= {w[:-1] for w in want if len(w) > 3 and w.endswith('s')}; want -= STOP
    groups = {}
    for e in cat['entries']:
        kind = e['id'].split('.')[0]
        if opt(a, '--kind') and kind != opt(a, '--kind'): continue
        hit = [t for t in e.get('tags', []) if want & set(WORD.findall(t.lower()))]
        fields = {'name/summary': e.get('name', '') + ' ' + e.get('summary', ''), 'id': e['id'], 'provides': ' '.join(e.get('provides', [])), 'about': e.get('about') or e.get('details') or ''}
        seen = {f: want & set(WORD.findall(v.lower())) for f, v in fields.items()}
        score = 3 * len(hit) + len(seen['name/summary']) + len(seen['id']) + 2 * len(seen['provides']) + len(seen['about'])
        if score: groups.setdefault(kind, []).append((score, e['id'], {'id': e['id'], 'kind': kind, 'why': '; '.join(([f"tags: {', '.join(hit)}"] if hit else []) + [f"{f}: {', '.join(sorted(w))}" for f, w in seen.items() if w]),
                  'requires': e.get('requires', []), 'takes': len([f for f in e['files'] if f.get('role') != 'sample'])}))
    out = [x[2] for k in sorted(groups) for x in sorted(groups[k], key=lambda t: (-t[0], t[1]))[:n]]
    if warn: sys.stderr.write('warning: ' + warn + '\n')
    return emit(out)


def kit(a):
    pos = bare(a[1:]); sub = pos[0] if pos else ''
    if sub not in ('list', 'show', 'describe') or (sub != 'list' and len(pos) < 2): sys.exit('usage: adp.py kit list [CATALOG] [--kind K] [--tag T] | show ID [CATALOG] | describe ID [CATALOG]')
    cat, warn = index_of((pos[1] if sub == 'list' else pos[2] if len(pos) > 2 else '-') if len(pos) > (1 if sub == 'list' else 2) else '-', a)
    if warn: sys.stderr.write('warning: ' + warn + '\n')
    if sub == 'list':
        for e in cat['entries']:
            if opt(a, '--kind') and e['id'].split('.')[0] != opt(a, '--kind') and e.get('kind') != opt(a, '--kind'): continue
            if opt(a, '--tag') and opt(a, '--tag') not in e.get('tags', []): continue
            emit({'id': e['id'], 'kind': e['id'].split('.')[0], 'name': e.get('name'), 'summary': e.get('summary'), 'tags': e.get('tags', [])})
        return 0
    e = next((x for x in cat['entries'] if x['id'] == pos[1]), None) or sys.exit(f'no entry {pos[1]} in the catalog')
    paths = [f['path'] for f in e['files'] if f.get('role') != 'sample']; sample = [f['path'] for f in e['files'] if f.get('role') == 'sample']
    if sub == 'show':
        return emit({'id': e['id'], 'name': e.get('name'), 'summary': e.get('summary'), 'about': e.get('details') or e.get('about') or '', 'tags': e.get('tags', []),
                     'files': [f['path'] for f in e['files']], 'requires': e.get('requires', []), 'provides': e.get('provides', [])})
    return emit({'id': e['id'], 'needs': e.get('globals', []), 'optional': e.get('optional', []), 'provides': e.get('provides', []),
                 'requires': e.get('requires', []), 'files': paths, 'sample': sample[0] if sample else None})


def content_of(d):
    p = os.path.join(d, 'content.js')
    if not os.path.isfile(p): return {}
    m = re.search(r'window\.ADP_CONTENT\s*=\s*(\{.*\})\s*;', open(p, encoding='utf-8').read(), re.S)
    return json.loads(m.group(1)) if m else {}


class Batch:
    """ArtifactData writes, each doc in its own file, printed as lists of at most 50 with `last` docs at the end."""
    def __init__(self, out, pins, dry=False):
        self.out, self.pins, self.w, self.unpinned, self.dry, self.bytes = out, pins, [], [], dry, 0

    def put(self, op, coll, doc, data=None, exists=False):
        e = {'op': op, 'collection': coll, 'doc_id': doc}
        if op != 'delete':
            p = os.path.join(self.out, f"{coll.replace('/', '~')}__{doc}.json")
            self.bytes += len(json.dumps(data, ensure_ascii=False, indent=1).encode())
            if not self.dry:
                os.makedirs(self.out, exist_ok=True)          # made with the first doc written, so a refused call leaves nothing behind
                json.dump(data, open(p, 'w'), ensure_ascii=False, indent=1); e['file_path'] = os.path.abspath(p)
        k = f'{coll}/{doc}'
        if k in self.pins: e['if_version'] = self.pins[k]
        elif exists or op in ('update', 'delete'): self.unpinned.append(k)
        self.w.append(e)

    def emit(self, last=('manifest',), extra=None):
        tail = [x for x in self.w if x['collection'] in last]; body = [x for x in self.w if x['collection'] not in last]
        allw = body + tail; lists = [allw[i:i + 50] for i in range(0, len(allw), 50)]
        if len(lists) > 1 and tail and len(lists[-1]) < len(tail): lists[-2:] = [lists[-2][:len(lists[-2]) - len(tail)], lists[-2][-len(tail):] + lists[-1]]
        out = {**(extra or {}), 'batches': lists, 'docs_dir': os.path.abspath(self.out)}
        if self.unpinned: out['needs_pin'] = self.unpinned       # existing docs: read their version, pass --pins
        return emit(out)


def man_doc(m, d, version, by, at):
    c = {k: H(v.get('html', '')) for k, v in content_of(d).items()}
    return {'schema': m['schema'], 'version': version, 'page_hash': m['page_hash'], 'parts': m['parts'], 'elements': m['elements'],
            'files': m['files'], 'part_file': m.get('part_file', {}), 'content': c, 'at': at, 'by': by}


def seed_writes(d, by, version, at, role='', summary=None):
    """The first docs of DIR, manifest last: [(collection, id, data)] and the parts whose content is empty (no doc)."""
    m = manifest_dir(d); cont = content_of(d); w = []
    real = [p for p in m['parts'] if not p.startswith(REST)]
    for p in real:
        w.append(('parts', p, {'title': (cont.get(p) or {}).get('title', p), 'parent': m['parents'].get(p, ''), 'hash': m['parts'][p],
                               'version': version, 'at': at, 'by': by, 'summary': 'added in the first build', 'holder': '', 'hold_until': '',
                               'file': m['part_file'].get(p, '')}))
    empty = [k for k, v in cont.items() if v.get('html', '') == '']      # nothing to show: no content doc; every other part is seeded
    for k, v in cont.items():
        if k not in empty: w.append(('content', k, dict(v, at=at, by=by, since=version)))
    w.append(('changes', '000001', {'version': version, 'at': at, 'by': by, 'summary': summary or 'adp/2 adopted: first build',
                                    'parts': [{'id': p, 'from': '', 'to': m['parts'][p]} for p in real], 'threads': []}))
    w.append(('agents', agent_id(by), {'role': role, 'session': '', 'last_seen': at, 'holds': []}))
    w.append(('manifest', 'current', man_doc(m, d, version, by, at)))
    return w, empty


def data_docs(sources):
    """--data sources -> [(collection, id, data)]. A file: a JSON list, or {docs: [...]}, of {collection, id | doc_id, data | file_path}.
    A directory: every collection/id.json (nested collections: a/b/c/d.json), or a flat collection__id.json."""
    out = []
    for src in sources:
        if os.path.isdir(src):
            for p in tree(src):
                if not p.endswith('.json'): continue
                rel = p[:-5]; segs = rel.split('__', 1) if '__' in rel and '/' not in rel else rel.split('/')
                if len(segs) % 2: sys.exit(f'--data {src}: {p} is not collection/id.json')
                out.append(('/'.join(segs[:-1]), segs[-1], json.load(open(os.path.join(src, p), encoding='utf-8'))))
            continue
        if not os.path.isfile(src): sys.exit(f'--data: no file or directory {src}')
        f = json.load(open(src, encoding='utf-8')); docs = f.get('docs') if isinstance(f, dict) else f
        if not isinstance(docs, list): sys.exit(f'--data {src}: a list of docs or {{docs: [...]}}')
        for x in docs:
            c, i = x.get('collection'), x.get('id', x.get('doc_id'))
            data = x.get('data') if 'data' in x else (json.load(open(x['file_path'], encoding='utf-8')) if x.get('file_path') else None)
            if not isinstance(c, str) or not isinstance(i, str) or not isinstance(data, dict): sys.exit(f'--data {src}: a doc needs collection, id and data (an object)')
            out.append((c, i, data))
    return out


def seed_docs(d, by, version, at, data=None, role='', summary=None):
    """Every doc the seed holds, in order: the --data docs, then parts, content, changes, agents, manifest last. A --data doc in a
    generated collection merges into the generated one (its fields win); one for a doc nothing generates is kept as given."""
    w, empty = seed_writes(d, by, version, at, role, summary)
    over = {(c, i): data for c, i, data in (data or []) if c in PROTO}
    docs = [(c, i, dict(data, **over.pop((c, i), {}))) for c, i, data in w]
    extra = [(c, i, data) for c, i, data in (data or []) if c not in PROTO] + [(c, i, data) for (c, i), data in over.items()]
    docs = extra + docs[:-1] + [docs[-1]]
    return docs, empty


def read_seed(d):
    """The docs a DIR's seed.json and packs hold now: (index, [(collection, id, data)]); ({}, []) without one."""
    p = os.path.join(d, SEED)
    if not os.path.isfile(p): return {}, []
    f = json.load(open(p, encoding='utf-8')); docs = list(f['docs']) if isinstance(f.get('docs'), list) else []   # adp-seed/1 held them inline
    for pk in f.get('packs') or []:
        q = os.path.join(d, pk)
        if os.path.isfile(q): docs += json.load(open(q, encoding='utf-8')).get('docs') or []
    return f, [(x['collection'], x['id'], x['data']) for x in docs if isinstance(x, dict) and isinstance(x.get('data'), dict)]


def seed_given(d, data=None):
    """What the seed carries beyond the generated docs: the extra docs its packs hold now and the overrides its index keeps, with the
    --data docs of this run replacing them by id -> ([(collection, id, data)], index)."""
    old, had = read_seed(d)
    extra = {(c, i): x for c, i, x in had if c not in PROTO}
    over = {(x['collection'], x['id']): x['data'] for x in old.get('overrides') or []}
    for c, i, x in (data or []): (over if c in PROTO else extra)[(c, i)] = x
    return [(c, i, x) for (c, i), x in extra.items()] + [(c, i, x) for (c, i), x in over.items()], old


def seed_file(d, by=None, version=None, at=None, data=None, summary=None, role=''):
    """Write DIR/seed.json (adp-seed/2, the index) and DIR/seed/pack-NNN.json (the docs, PACK bytes each, manifest/current the last doc):
    the page expands them when its db is empty and an editor opens it. --data docs given before are kept (replaced by id when given
    again). Unchanged docs keep the files as they are (so `files --since` does not re-send them); returns True when (re)written."""
    given, old = seed_given(d, data); had = read_seed(d)[1]
    by, version = by or old.get('by', 'adp'), version or old.get('version', '1')      # a value given wins; else the seed's own
    role, summary = role or old.get('role', ''), summary or old.get('summary')
    strip = lambda docs: [(c, i, {k: v for k, v in x.items() if k not in ('at', 'last_seen')}) for c, i, x in docs]
    docs, empty = seed_docs(d, by, version, at or old.get('at') or now(), given, role, summary)
    if old.get('schema') == 'adp-seed/2' and strip(had) == strip(docs): return False
    at = at or now(); docs, empty = seed_docs(d, by, version, at, given, role, summary)
    packs, cur, size = [], [], 0
    for c, i, x in docs:
        n = len(json.dumps({'collection': c, 'id': i, 'data': x}, ensure_ascii=False).encode())
        if cur and size + n > PACK: packs.append(cur); cur, size = [], 0
        cur.append({'collection': c, 'id': i, 'data': x}); size += n
    if cur: packs.append(cur)
    sd = os.path.join(d, SEED_DIR); os.makedirs(sd, exist_ok=True)
    for n in os.listdir(sd):
        if re.fullmatch(r'pack-\d+\.json', n): os.remove(os.path.join(sd, n))
    names = []
    for k, pk in enumerate(packs, 1):
        name = f'{SEED_DIR}/pack-{k:03d}.json'; names.append(name)
        json.dump({'schema': 'adp-seed/2', 'pack': k, 'of': len(packs), 'docs': pk}, open(os.path.join(d, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    counts = {}
    for c, i, x in docs: counts[c] = counts.get(c, 0) + 1
    idx = {'schema': 'adp-seed/2', 'version': version, 'by': by, 'at': at, 'docs': len(docs), 'collections': counts, 'packs': names,
           'overrides': [{'collection': c, 'id': i, 'data': x} for c, i, x in given if c in PROTO]}
    if role: idx['role'] = role
    if summary: idx['summary'] = summary
    json.dump(idx, open(os.path.join(d, SEED), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return True


def seed(a):
    d = bare(a[1:])[0] if bare(a[1:]) else sys.exit('usage: adp.py seed DIR [--by NAME] [--version V] [--data FILE|DIR ...] [--summary S] [--role R] [--batches] [--dry-run]')
    if not os.path.isdir(d): sys.exit(f'seed: {d} is not a directory (adp.py new makes one)')
    at, dry = opt(a, '--at') or now(), '--dry-run' in a
    given, old = seed_given(d, data_docs(optall(a, '--data')))
    by, version = opt(a, '--by') or old.get('by', 'adp'), opt(a, '--version') or old.get('version', '1')
    role, summary = opt(a, '--role') or old.get('role', ''), opt(a, '--summary') or old.get('summary')
    docs, empty = seed_docs(d, by, version, at, given, role, summary)
    if '--batches' in a:
        b = Batch(opt(a, '--out', d.rstrip('/') + '.adp'), {}, dry)
        for c, i, x in docs: b.put('set', c, i, x)
        if dry:
            n = {c: sum(1 for w in b.w if w['collection'] == c) for c in dict.fromkeys(w['collection'] for w in b.w)}
            return emit({'collections': n, 'batches': math.ceil(len(b.w) / 50), 'skipped_empty': empty, 'bytes': b.bytes})
        return b.emit(extra={'skipped_empty': empty} if empty else None)
    n = {}
    for c, i, x in docs: n[c] = n.get(c, 0) + 1
    if dry: return emit({'collections': n, 'docs': len(docs), 'batches': math.ceil(len(docs) / 50), 'skipped_empty': empty,
                         'bytes': sum(len(json.dumps(x, ensure_ascii=False).encode()) for c, i, x in docs)})
    written = seed_file(d, by, version, at, data=given, summary=summary, role=role)
    idx = read_seed(d)[0]
    return emit({'seed': os.path.join(d, SEED), 'written': written, 'docs': idx['docs'], 'collections': idx['collections'], 'packs': idx['packs'],
                 'bytes': sum(os.path.getsize(os.path.join(d, p)) for p in idx['packs']), 'skipped_empty': empty,
                 'next': 'publish DIR (seed.json and seed/ go up with the files) and open the page once as an editor: it expands the packs into its database'})


# The core switches: key -> (type, default, enum options). assets/adp.js is the source of truth; the two must agree.
CORE = {
    'edit.locked': ('bool', False, None), 'edit.until': ('datetime', '', None), 'edit.reason': ('text', '', None),
    'edit.require-hold': ('bool', False, None), 'parts.locked': ('list', [], None), 'comments.enabled': ('bool', True, None),
    'panel.changes': ('enum', 'everyone', ['everyone', 'editors', 'off']), 'panel.checks': ('enum', 'editors', ['everyone', 'editors', 'off']),
    'playground.enabled': ('bool', True, None), 'look.theme': ('text', '', None), 'look.mode': ('enum', 'auto', ['auto', 'light', 'dark']),
    'look.density': ('enum', 'comfortable', ['comfortable', 'compact']), 'links.catalog': ('url', '', None),
    'links.board': ('url', '', None), 'links.repo': ('url', '', None), 'log.data-changes': ('bool', True, None),
}
KEY = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*')


def read_doc(path):
    if not path: return {}
    d = json.load(open(path)); return d.get('data', d) if 'values' not in d and isinstance(d.get('data'), dict) else d


def cvalues(doc):
    return {**{k: v[1] for k, v in CORE.items()}, **(doc.get('values') or {})}


def real_date(v):
    """An ISO date or date-time (what adp.js's Date.parse takes from the settings page) that is a real moment: month 13 and hour 25 fail."""
    if re.match(r'\d{4}-\d\d-\d\d([T ]\d\d:\d\d(:\d\d)?(\.\d+)?(Z|[+-]\d\d:?\d\d)?)?$', v) is None: return False
    try: datetime.datetime.fromisoformat(v[:-1] + '+00:00' if v.endswith('Z') else v)
    except ValueError: return False
    return True


def check_value(key, v):
    if key not in CORE: return
    t, _, opts = CORE[key]
    ok = {'bool': isinstance(v, bool), 'text': isinstance(v, str) and len(v) <= 2000, 'enum': v in (opts or []) if isinstance(v, str) else False,
          'list': isinstance(v, list) and all(isinstance(x, str) for x in v),
          'url': isinstance(v, str) and (v == '' or re.match(r'https://\S+$', v) is not None),
          'datetime': isinstance(v, str) and (v == '' or real_date(v))}[t]
    if not ok: sys.exit(f'{key}: expected {t}' + (' of ' + '/'.join(opts) if opts else '') + f', got {json.dumps(v)}')


def under(pid, prefix):
    return pid == prefix or pid.startswith(prefix + '.')


def guard(a, changed, deepest=None, existing=None):
    """Soft locks from config/current (--config); exits 2 with a JSON error on stdout. changed: ids touched."""
    if not opt(a, '--config'): return
    doc = read_doc(opt(a, '--config')); v = cvalues(doc)
    def stop(o): emit(o); sys.exit(2)
    if v['edit.locked'] is True:
        ch = (doc.get('changed') or {}).get('edit.locked') or {}
        stop({'error': 'locked', 'by': ch.get('by', doc.get('by', '')), 'at': ch.get('at', doc.get('at', '')), 'reason': v['edit.reason']})
    unlock = optall(a, '--unlock')
    hit = sorted(p for p in changed if any(under(p, x) and x not in unlock for x in v['parts.locked']))
    if hit: stop({'error': 'locked parts', 'parts': hit})
    if v['edit.require-hold'] is True and deepest is not None:
        if not opt(a, '--holds'): stop({'error': 'unheld', 'parts': sorted(deepest), 'note': 'edit.require-hold needs --holds'})
        h = read_json(opt(a, '--holds'), '--holds')
        who = lambda x: (x.get('holder') if isinstance(x, dict) else x) or ''
        un = sorted(p for p in deepest if p in (existing or ()) and not who(h.get(p)))
        if un: stop({'error': 'unheld', 'parts': un})


def config_cmd(a):
    if len(a) > 1 and a[1] == 'set':
        pos = bare(a[2:])
        if len(pos) != 2: sys.exit('usage: adp.py config set KEY VALUE [--doc C.json] [--by NAME] [--pins P.json] [--out DIR]')
        key, raw = pos
        if not KEY.fullmatch(key): sys.exit(f'{key}: keys are group.name, lower case, dashes allowed')
        try: val = json.loads(raw)
        except ValueError: val = raw
        check_value(key, val)
        doc = read_doc(opt(a, '--doc')); by, at = opt(a, '--by', 'agent'), now()
        vals, chg = dict(doc.get('values') or {}), dict(doc.get('changed') or {})
        if key in CORE and val == CORE[key][1]: vals.pop(key, None)       # at its default: no value kept, but changed[key] stays, as in adp.js
        else: vals[key] = val
        chg[key] = {'by': by, 'at': at}
        pins = read_json(opt(a, '--pins'), '--pins') if opt(a, '--pins') else {}
        b = Batch(opt(a, '--out', 'config.adp'), pins)
        b.put('set', 'config', 'current', {'schema': 'adp-config/1', 'at': at, 'by': by, 'values': vals, 'changed': chg}, exists=True)
        if cvalues(doc)['log.data-changes'] is not False:
            b.put('set', 'changes', 'd-' + str(int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)),
                  {'version': '', 'at': at, 'by': by, 'summary': f'Set {key} = {json.dumps(val)}', 'parts': [], 'threads': [], 'data': [{'doc': 'config/current'}]})
        return b.emit((), {'key': key, 'value': val, **({} if key in CORE else {'unknown': True})})
    v = cvalues(read_doc(opt(a, '--doc')))
    return emit({'defaults': {k: x[1] for k, x in CORE.items()}, 'values': v, 'locked': v['edit.locked'] is True,
                 'locked_parts': v['parts.locked'], 'links': {k[6:]: x for k, x in v.items() if k.startswith('links.')}})


def hold(a):
    pos = bare(a[1:])
    if len(pos) < 2: sys.exit('usage: adp.py hold DIR ID ... --by NAME [--hours H (at most 2)] [--pins P.json]')
    by, hrs = opt(a, '--by', 'agent'), float(opt(a, '--hours', '2'))
    guard(a, pos[1:])
    until = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=min(hrs, 2))).strftime('%Y-%m-%dT%H:%M:%SZ')
    pins = read_json(opt(a, '--pins'), '--pins') if opt(a, '--pins') else {}
    b = Batch(opt(a, '--out', pos[0].rstrip('/') + '.adp'), pins)
    for p in pos[1:]: b.put('update', 'parts', p, {'holder': by, 'hold_until': until})
    b.put('update' if f'agents/{agent_id(by)}' in pins else 'set', 'agents', agent_id(by), {'last_seen': now(), 'holds': pos[1:]})
    return b.emit((), {'hold_until': until})


def record(a):
    pos = bare(a[1:])
    if len(pos) != 2 or not opt(a, '--seq') or not opt(a, '--summary'):
        sys.exit('usage: adp.py record OLD.json DIR --seq N --by NAME --summary S [--version V] [--threads T,..] [--pins P.json]')
    o = read_json(pos[0], 'OLD.json'); o = o.get('data', o) if 'parts' not in o else o      # a saved doc may wrap its fields in data
    d = pos[1]; n = manifest_dir(d)
    by, at, version = opt(a, '--by', 'agent'), now(), opt(a, '--version', '')
    seq, summary = opt(a, '--seq').zfill(6), opt(a, '--summary')
    threads = [t for t in (opt(a, '--threads', '') or '').split(',') if t]
    pins = read_json(opt(a, '--pins'), '--pins') if opt(a, '--pins') else {}
    real = lambda m: {k: v for k, v in m.get('parts', {}).items() if not k.startswith(REST)}
    op, np_, moved, cont = real(o), real(n), [], content_of(d)
    ch = {p for p in np_ if p not in op or op[p] != np_[p]} | {p for p in op if p not in np_}
    par = {**o.get('parents', {}), **n.get('parents', {})}
    guard(a, ch, {p for p in ch if p in op and not any(par.get(c) == p for c in ch)}, set(op))
    b = Batch(opt(a, '--out', d.rstrip('/') + '.adp'), pins)
    for p, h in np_.items():
        if p not in op:
            b.put('set', 'parts', p, {'title': (cont.get(p) or {}).get('title', p), 'parent': n['parents'].get(p, ''), 'hash': h, 'version': version,
                                      'at': at, 'by': by, 'summary': 'added: ' + summary, 'holder': '', 'hold_until': '', 'file': n['part_file'].get(p, '')})
            moved.append({'id': p, 'from': '', 'to': h})
        elif op[p] != h:
            b.put('update', 'parts', p, {'hash': h, 'version': version, 'at': at, 'by': by, 'summary': summary, 'holder': '', 'hold_until': '',
                                         'file': n['part_file'].get(p, '')})
            moved.append({'id': p, 'from': op[p], 'to': h})
    for p in op:
        if p not in np_: b.put('delete', 'parts', p); moved.append({'id': p, 'from': op[p], 'to': ''})
    b.put('set', 'changes', seq, {'version': version, 'at': at, 'by': by, 'summary': summary, 'parts': moved, 'threads': threads})
    for t in threads: b.put('update', 'threads', t, {'status': 'done', 'holder': '', 'done_in': version})
    b.put('update' if f'agents/{agent_id(by)}' in pins else 'set', 'agents', agent_id(by), {'last_seen': at, 'holds': []})
    b.put('set', 'manifest', 'current', man_doc(n, d, version, by, at), exists=True)
    return b.emit()


def req_dump(path):
    """A dump of a collection: a list of docs ({id|doc_id, data, version} as ArtifactData returns them, or bare docs with id),
    or an {id: doc} map. -> {id: (doc, version or None)}"""
    raw = read_json(path, 'DUMP.json')
    if isinstance(raw, dict) and isinstance(raw.get('documents', raw.get('docs')), list): raw = raw.get('documents', raw.get('docs'))
    items = raw.items() if isinstance(raw, dict) else [(x.get('id') or x.get('doc_id') or '', x) for x in raw if isinstance(x, dict)]
    out = {}
    for k, x in items:
        if not isinstance(x, dict): continue
        k = str(k).split('/')[-1]
        if isinstance(x.get('data'), dict): out[k] = (x['data'], x['version'] if isinstance(x.get('version'), int) else None)
        else: out[k] = ({f: v for f, v in x.items() if f not in ('id', 'doc_id')}, None)
    return out


def rstate(d):
    return 'done' if d.get('status') == 'done' else 'working' if d.get('state') == 'working' else 'ack' if d.get('state') in ('ack', 'seen') else 'queue'


def requests_cmd(a):
    use = ('usage: adp.py requests DUMP.json [--ack RID --by NAME | --progress RID --text T [--by NAME] | --done RID --response FILE [--changed a,b] [--version V] [--turns TURNS.json] [--by NAME]]'
           ' [--pins P.json] [--out DIR]')
    pos = bare(a[1:])
    if len(pos) != 1: sys.exit(use)
    docs, by, at = req_dump(pos[0]), opt(a, '--by', 'agent'), now()
    acts = [x for x in ('--ack', '--progress', '--done') if x in a]
    if not acts:
        rows = [{'id': k, 'lane': d.get('lane', ''), 'state': rstate(d), 'scope': d.get('scope') or {}, 'project': d.get('project', ''),
                 'text': d.get('text', ''), 'quote': d.get('quote', ''), 'by': d.get('by', ''), 'at': d.get('at', ''),
                 'last_progress': ((d.get('progress') or [{}])[-1] or {}).get('text', ''), 'reopened': bool(d.get('response') or d.get('doneAt'))}
                for k, (d, _) in docs.items() if d.get('status') != 'done']
        rows.sort(key=lambda r: r['at'])
        return emit({'open': rows, 'count': len(rows), 'trailer': '· adp request {<rid>} · lane <lane> · scope part:<id>|page'})
    if len(acts) > 1: sys.exit('one of --ack, --progress, --done')
    act = acts[0]; rid = opt(a, act)
    if not rid or rid.startswith('--'): sys.exit(use)
    if rid not in docs: sys.exit(f'{rid}: not in {pos[0]}')
    d, ver = docs[rid]
    pins = read_json(opt(a, '--pins'), '--pins') if opt(a, '--pins') else {}
    if ver is not None: pins.setdefault(f'requests/{rid}', ver)
    b = Batch(opt(a, '--out', 'requests.adp'), pins)
    doing = f"{rid} ({d.get('lane', '')})"
    if act == '--ack':
        patch = {'state': 'ack', 'ackBy': by, 'ackAt': at}
    elif act == '--progress':
        if not opt(a, '--text'): sys.exit('--progress needs --text T')
        patch = {'state': 'working', 'progress': list(d.get('progress') or []) + [{'at': at, 'text': opt(a, '--text')}]}
    else:
        if not opt(a, '--response'): sys.exit('--done needs --response FILE (Markdown)')
        text = open(opt(a, '--response'), encoding='utf-8').read().strip()
        changed = [x for x in (opt(a, '--changed', '') or '').split(',') if x]
        patch = {'status': 'done', 'doneAt': at, 'changed': changed, 'version': opt(a, '--version', '')}
        if opt(a, '--turns'):                         # a reply reopened it: the answer is the next turn
            n = max([int(k) for k in req_dump(opt(a, '--turns')) if k.isdigit()] or [0]) + 1
            b.put('set', f'requests/{rid}/turns', f'{n:04d}', {'by': 'claude', 'at': at, 'text': text})
        else: patch['response'] = text
        doing = ''
    b.put('update', 'requests', rid, patch)
    b.put('set', 'presence', by, {'at': at, 'doing': doing, 'session': by})
    return b.emit((), {'request': rid, 'state': rstate({**d, **patch})})


SECRET_FLAG = re.compile(r'token|secret|key|password', re.I)
BEGIN, END = '<!-- adp:begin -->', '<!-- adp:end -->'


def redact(a):
    """argv with the value of every flag whose name contains token/secret/key/password replaced by ***."""
    out, hide = [], False
    for x in a:
        if hide: out.append('***'); hide = False; continue
        if x.startswith('--') and SECRET_FLAG.search(x.split('=', 1)[0]):
            if '=' in x: out.append(x.split('=', 1)[0] + '=***')
            else: out.append(x); hide = True
        else: out.append(x)
    return out


PROJECT = None      # the resolved --project root, set by the entry point


def resolve_project(x):
    """--project X: an existing directory, else the name (or registry folder name) of a registered project; absolute path or exit 1."""
    if os.path.isdir(x): return os.path.abspath(x)
    root = os.path.join(ADP_HOME, 'projects')
    for n in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        try: c = json.load(open(os.path.join(root, n, 'config.json')))
        except (OSError, ValueError): continue
        if x in (c.get('name'), n) and os.path.isdir(c.get('path', '')): return os.path.abspath(c['path'])
    sys.exit(f'project not found: {x} (adp.py projects lists them)')


def log_path():
    """log.jsonl in the .adp/ of --project when it has one, else the nearest .adp/ from cwd upward, else ADP_HOME."""
    if PROJECT and os.path.isdir(os.path.join(PROJECT, '.adp')): return os.path.join(PROJECT, '.adp', 'log.jsonl')
    d = os.path.abspath(os.getcwd())
    while True:
        if os.path.isdir(os.path.join(d, '.adp')): return os.path.join(d, '.adp', 'log.jsonl')
        if os.path.dirname(d) == d: return os.path.join(ADP_HOME, 'log.jsonl')
        d = os.path.dirname(d)


def log_line(a, code, ms):
    """One JSON line per subcommand: ts, cmd, args (secrets redacted), exit, duration_ms, cwd. Never raises, never logs file contents."""
    if a[:1] == ['setup'] and '--dry-run' in a: return      # a dry run writes nothing at all
    try:
        p = log_path(); os.makedirs(os.path.dirname(p), exist_ok=True)
        rec = {'ts': now(), 'cmd': a[0] if a else '', 'args': redact(a[1:]), 'exit': code, 'duration_ms': ms, 'cwd': os.getcwd()}
        with open(p, 'a') as f: f.write(json.dumps(rec, ensure_ascii=False, separators=(',', ':')) + '\n')
    except Exception:
        pass


def log_cmd(a):
    n = int(opt(a, '-n', 20)); p = os.path.join(PROJECT, '.adp', 'log.jsonl') if PROJECT else log_path()
    if os.path.isfile(p): sys.stdout.write(''.join(open(p).readlines()[-n:] if n > 0 else []))
    return 0


def project_reg(d):
    """The registry entry of project folder d in ADP_HOME/projects/<name>/config.json, or None."""
    root = os.path.join(ADP_HOME, 'projects')
    for n in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        try: c = json.load(open(os.path.join(root, n, 'config.json')))
        except (OSError, ValueError): continue
        if c.get('path') == d: return os.path.join(root, n, 'config.json')
    return None


def register_project(d, scope):
    """Write the project's config into ADP_HOME/projects/<name>/config.json (path, scope); one entry per folder, updated in place."""
    d = os.path.abspath(d); p = project_reg(d)
    if not p:
        base = re.sub(r'[^a-z0-9._-]+', '-', os.path.basename(d).lower()).strip('-') or 'project'; n, i = base, 2
        while os.path.exists(os.path.join(ADP_HOME, 'projects', n)): n, i = f'{base}-{i}', i + 1
        p = os.path.join(ADP_HOME, 'projects', n, 'config.json')
    old = json.load(open(p)) if os.path.isfile(p) else {}
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump({**old, 'schema': 'adp-project/1', 'name': os.path.basename(d), 'path': d, 'scope': scope, 'created': old.get('created', now()), 'at': now()}, open(p, 'w'), indent=1)
    return p


def projects_cmd(a):
    root = os.path.join(ADP_HOME, 'projects'); rows = []
    for n in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        try: c = json.load(open(os.path.join(root, n, 'config.json')))
        except (OSError, ValueError): continue
        rows.append((c.get('name', n), c.get('scope', ''), c.get('path', '') + ('' if os.path.isdir(c.get('path', '')) else '  (missing)')))
    if not rows: print('no projects registered (run adp.py init in a project folder)'); return 0
    for r in rows: print('\t'.join(r))
    return 0


def init_cmd(a):
    d = os.path.abspath((bare(a[1:]) or [PROJECT or '.'])[0]); p = os.path.join(d, '.adp', 'config.json')
    reg = register_project(d, 'project')
    if os.path.isfile(p): print(f'{p} exists; registered in {reg}'); return 0
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump({'schema': 'adp-project/1', 'name': os.path.basename(d), 'created': now()}, open(p, 'w'), indent=1)
    print(f'created {p}; registered in {reg}'); return 0


def ref_version(skill_md):
    """metadata.version from a SKILL.md frontmatter, or None."""
    try: lines = open(skill_md).read().split('\n')
    except OSError: return None
    if not lines or lines[0].strip() != '---': return None
    meta = False
    for l in lines[1:]:
        if l.strip() == '---': break
        if re.match(r'metadata:\s*$', l): meta = True
        elif meta and (m := re.match(r'\s+version:\s*[\'"]?([^\'"\s]+)', l)): return m.group(1)
        elif meta and l[:1] not in ' \t' and l.strip(): meta = False
    return None


def tree_files(d):
    """{relative path: bytes} of every file under d, __pycache__ excluded."""
    return {os.path.relpath(os.path.join(r, f), d): open(os.path.join(r, f), 'rb').read()
            for r, ds, fs in os.walk(d) if not ds.__setitem__(slice(None), [x for x in ds if x != '__pycache__']) for f in fs}


def setup_cmd(a):
    scope = opt(a, '--scope', 'user'); dry, yes = '--dry-run' in a, '--yes' in a
    if scope not in ('user', 'project', 'local'): sys.exit('setup: --scope user|project|local')
    cwd, home = PROJECT if PROJECT and scope != 'user' else os.getcwd(), os.path.expanduser('~')
    refs = os.path.join(HERE, 'refs'); names = sorted(n for n in os.listdir(refs) if os.path.isdir(os.path.join(refs, n))) if os.path.isdir(refs) else []
    skills = os.path.join(home if scope == 'user' else cwd, '.claude', 'skills')
    cfg = os.path.join(ADP_HOME if scope == 'user' else os.path.join(cwd, '.adp'), 'config.json')
    ptr = {'user': os.path.join(home, '.claude', 'CLAUDE.md'), 'project': os.path.join(cwd, 'CLAUDE.md'), 'local': os.path.join(cwd, 'CLAUDE.local.md')}[scope]
    gi = os.path.join(cwd, '.gitignore') if scope != 'user' else None
    block = '\n'.join([BEGIN, 'For artifacts, ADP or the catalog, load the `adp` skill and run `python3 -I ' + os.path.abspath(__file__) + ' ...` for its commands.', END])
    print(f'setup {scope}{" (dry run)" if dry else ""}: {len(names)} skills ({", ".join(names)}) -> {skills}; skill_root {HERE}')
    print(f'config: {cfg}' + ('' if scope == 'user' else f'; registry {os.path.join(ADP_HOME, "projects")}/<name>/config.json (path {cwd})')); print(f'pointer {ptr}' + ('' if yes and not dry else ' (add with --yes)') + ':'); print(block)
    if gi: print(f'gitignore {gi}: .adp/log.jsonl' + ('' if yes and not dry else ' (add with --yes)'))
    modified = [os.path.join(skills, n) for n in names if os.path.isdir(os.path.join(skills, n)) and tree_files(os.path.join(skills, n)) != tree_files(os.path.join(refs, n))]
    for m in modified: print(f'modified {m}: differs from the packaged skill, left untouched')
    if dry: return 0
    for n in names:
        t = os.path.join(skills, n)
        if t in modified: continue
        shutil.rmtree(t, ignore_errors=True)
        shutil.copytree(os.path.join(refs, n), t, ignore=shutil.ignore_patterns('__pycache__'))
    os.makedirs(os.path.dirname(cfg), exist_ok=True)
    c = json.load(open(cfg)) if os.path.isfile(cfg) else {}
    c.update({'schema': 'adp-setup/1', 'scope': scope, 'skill_root': HERE, 'skills': names,
              'version': {n: v for n in names if (v := ref_version(os.path.join(refs, n, 'SKILL.md')))}, 'at': now()})
    json.dump(c, open(cfg, 'w'), indent=1)
    if scope != 'user': register_project(cwd, scope)
    if not yes: return 0
    os.makedirs(os.path.dirname(ptr), exist_ok=True)
    old = open(ptr).read() if os.path.isfile(ptr) else ''
    pat = re.compile(re.escape(BEGIN) + r'.*?' + re.escape(END), re.S)
    new = pat.sub(lambda m: block, old, count=1) if pat.search(old) else old + ('\n' if old and not old.endswith('\n') else '') + block + '\n'
    open(ptr, 'w').write(new)
    if gi:
        g = open(gi).read() if os.path.isfile(gi) else ''
        if '.adp/log.jsonl' not in g.split('\n'): open(gi, 'w').write(g + ('\n' if g and not g.endswith('\n') else '') + '.adp/log.jsonl\n')
    return 0


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adp_loop
adp_loop.A = sys.modules[__name__]


def main(a):
    cmds = {'export': adp_loop.export, 'classify': adp_loop.classify_cmd, 'propose': adp_loop.propose, 'ack': adp_loop.ack, 'gate': adp_loop.gate, 'new': new, 'take': take, 'seed': seed, 'hold': hold, 'record': record, 'config': config_cmd, 'requests': requests_cmd, 'pins': pins, 'catalog': catalog_cmd, 'suggest': suggest, 'kit': kit, 'setup': setup_cmd, 'init': init_cmd, 'projects': projects_cmd, 'log': log_cmd}
    if a and a[0] in cmds: return cmds[a[0]](a)
    if a[:1] == ['templates']:
        for t in sorted(os.listdir(TPL)):
            if os.path.isfile(os.path.join(TPL, t, 'template.json')): m = tmeta(t); print(f"{t:10} {m['summary']}\n{'':10} use when: {m['use_when']}")
        return 0
    if len(a) >= 2 and a[0] == 'files':
        since = opt(a, '--since'); n = int(opt(a, '--batch', LIMIT)); where = opt(a, '--out', a[1].rstrip('/') + '.adp')
        fresh = os.path.isfile(os.path.join(a[1], SEED)) and seed_file(a[1])    # edits after `new` change the hashes the seed carries
        if not since: return emit(batched(publish_args(a[1]), a[1], n, where))
        o = json.load(open(since)); o = o.get('data', o) if 'files' not in o else o
        nf = manifest_dir(a[1])['files']; of = o.get('files', {})
        changed = {p for p, h in nf.items() if of.get(p) != h and p != 'index.html'} | ({SEED, *read_seed(a[1])[0].get('packs', [])} if fresh else set())
        out = publish_args(a[1], changed); out['files'].update({p: None for p in of if p not in nf})
        out['page_changed'] = of.get('index.html') != nf.get('index.html')
        if not out['page_changed']: out['note'] = 'index.html is unchanged: publish with url and the changed files, still passing file_path (the tool requires it; the page is re-sent as is)'
        return emit(batched(out, a[1], n, where))
    if len(a) >= 2 and a[0] == 'check':
        marked = load(a[1])[1] if os.path.isdir(a[1]) else {a[1]: open(a[1], encoding='utf-8').read()}
        allt, bad, ids, rest, size = '\n'.join(marked.values()), [], {}, 0, 0
        for f, text in marked.items():
            parts, b = parse(text); pre = f'{f}: ' if len(marked) > 1 else ''
            bad += [pre + x for x in b]
            bad += [f'part {p} in {ids[p]} and {f}' for p in parts if p in ids]
            ids.update({p: f for p in parts})
            if not b: rest += len(norm(own(text, parts, ''))); size += len(norm(text))
        bad += [f'part {p}: no data-part="{p}" in the page' for p in ids
                if f'data-part="{p}"' not in allt and not p.startswith(('page.style', 'page.script'))]
        named = set(re.findall(r'data-part="(' + ID + r')"', allt))
        bad += [f'data-part="{p}" has no part:{p} markers (a new piece nobody marked)' for p in sorted(named - set(ids))]
        r = rest if not bad else 0
        print(f'{len(ids)} parts' + (f' in {len(marked)} files' if len(marked) > 1 else '') +
              ('' if bad else f', ok; {r} chars ({r / max(size, 1):.0%}) outside every part, hashed as {REST}'))
        [print('  ' + b) for b in bad]
        bare = sorted({m.group(1) for m in re.finditer(r'<[^<>]*data-part="(' + ID + r')"[^<>]*>', allt)
                       if 'data-comment-target' not in m.group(0)})   # comments anchor to a leaf there, not the part
        if bare: print(f'  warning: {len(bare)} part roots without data-comment-target: ' + ', '.join(bare[:8]) + (' …' if len(bare) > 8 else ''))
        return 1 if bad else 0
    if len(a) >= 2 and a[0] == 'manifest':
        files = dict(x.split('=', 1) for x in a[a.index('--file') + 1:] if '=' in x) if '--file' in a else {}
        m = manifest_dir(a[1]) if os.path.isdir(a[1]) else manifest(open(a[1], encoding='utf-8').read(), files)
        print(json.dumps(m, indent=1)); return 0
    if len(a) == 3 and a[0] == 'diff':
        print(json.dumps(diff(*(json.load(open(x)) for x in a[1:])), indent=1)); return 0
    if len(a) >= 3 and a[0] == 'diff-pages':          # the diff plus what was added/removed in each deepest part
        files = dict(x.split('=', 1) for x in a[a.index('--file') + 1:] if '=' in x) if '--file' in a else {}
        def side(x):                                    # -> manifest, {part: own text}
            if os.path.isdir(x):
                m, (_, marked) = manifest_dir(x), load(x)
                pa = {f: parse(t)[0] for f, t in marked.items()}
                return m, {**{p: own(marked[f], pa[f], p) for p, f in m['part_file'].items() if not p.startswith(REST)},
                           **{f'{REST}:{f}': own(t, pa[f], REST) for f, t in marked.items()}}
            t = open(x, encoding='utf-8').read(); pa = parse(t)[0]
            return manifest(t, files), {**{p: own(t, pa, p) for p in pa}, REST: own(t, pa, REST)}
        (om, ot), (nm, nt) = side(a[1]), side(a[2]); d = diff(om, nm)
        tok = lambda t: [x for x in (norm(y) for y in re.split(r'(?<=>)|(?=<)', t)) if x]
        d['detail'] = {}
        for p in d['deepest']:
            dl = [l[:120] for l in difflib.unified_diff(tok(ot.get(p, '')), tok(nt.get(p, '')), lineterm='', n=0)
                  if l[:1] in '+-' and l[:3] not in ('+++', '---')]
            d['detail'][p] = dl[:12] + ([f'… {len(dl) - 12} more'] if len(dl) > 12 else [])
        print(json.dumps(d, indent=1, ensure_ascii=False)); return 0
    print(__doc__); return 2


if __name__ == '__main__':
    import time
    argv, t0, code = sys.argv[1:], time.monotonic(), 1
    try:
        run = argv
        if '--project' in argv:
            i = argv.index('--project')
            if i + 1 >= len(argv): sys.exit('--project needs a NAME or PATH')
            PROJECT = resolve_project(argv[i + 1]); run = argv[:i] + argv[i + 2:]
        code = main(run)
        code = 0 if code is None else code
    except SystemExit as e:
        code = 0 if e.code is None else e.code if isinstance(e.code, int) else 1
        raise
    finally:
        log_line(argv, code, int((time.monotonic() - t0) * 1000))
    sys.exit(code)
