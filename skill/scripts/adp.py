#!/usr/bin/env python3
"""adp/2 parts tool (artifact-dataplane skill): part markers -> per-part hashes -> manifest -> diff.

  adp.py check    DIR                               markers balance, ids valid and unique, each part has data-part="<id>"
  adp.py manifest DIR                               manifest JSON on stdout (schema, page_hash, parts, files, parents)
  adp.py diff     OLD.json NEW.json                 added / removed / changed parts, deepest first, own elements +/-
  adp.py diff-pages OLD_DIR NEW_DIR                 the same from two DIRs, plus the added/removed lines per deepest part

Build and record (each prints what the Artifact / ArtifactData call needs, so nothing is retyped):
  adp.py new PROJECT [--title T] [--by NAME] [--data FILE|DIR]
                                                    creates PROJECT/.adp with independent persistent live/preview and portable Makefile launch targets.
                                                    --standalone DIR retains the low-level standalone artifact scaffold for legacy integrations.
                                                    the one start: the starter page, the whole kit, the seed (--data: a JSON list or {docs} of {collection, id, data},
                                                    or a DIR of collection/id.json) and the first publish, packed. Prints the ordered list: check, pack,
                                                    publish, open, status/seed, export
  adp.py pack DIR                                   the first publish only: refresh the seed, rebuild DIR.pack (loader + pack.json), bake DIR.adp/bundle/ (the first
                                                    export asks a delta over it). Refused once DIR.adp/state.json exists: export, then propose
  adp.py take DIR ID ...                            the one Artifact read that brings the catalog entries' files (registryDependencies first) as text into DIR/kit; then adp.py propose DIR --by <you> sends them
  adp.py files DIR [--since MANIFEST.json] [--batch N] [--out DIR]
                                                    the catalog site's own publish (a page packed or live is refused). The publish arguments for DIR; --since: only
                                                    changed files (null = removed). Files artifacts do not serve (archives, .py: use .txt) are left out and listed
                                                    under `skipped`. Over N files (default 250; a publish takes 255) `files` becomes `batches`, each also written
                                                    to DIR.adp/publish-N.json: publish the site with the first, the rest to the url
  adp.py kit consume PACK [--site DIR]            verify and import an exported kit entry
  adp.py pins publish-1.json=VERSION_ID ... [--out vermap.json]
                                                    {path: version id} for CAT_VERMAP from the batches and the id each publish returned (the catalog site)
  adp.py site [URL]                              the user's catalog: URL saves it (~/.adp/config.json); prints the Artifact read that
                                                    fetches its adp.json into ~/.adp/sites/<id>/, or the fetched index's ver and built
  adp.py take SITE ID ... [--url URL] [--config C.json]
                                                    the catalog site's own publish by reference: a files map taking catalog entries, registryDependencies first. SITE is the catalog
                                                    url (its fetched index is the live one), `-` for the saved catalog, or a local adp.json
                                                    (the repo's build: not the live catalog, so the output carries a warning)
  adp.py suggest SITE --for "free words" [--n 3] [--kind K]
                                                    catalog entries ranked by keywords/description overlap, grouped by the name's first word (no model call)
  adp.py kit list [SITE] [--kind K] [--tag T]    one JSON line per entry; SITE defaults to the catalog the plugin ships (- is the saved catalog)
  adp.py kit show ID [SITE]                      name, title, description, about, keywords, files, registryDependencies, exports
  adp.py kit describe ID [SITE]                  the mount signature: dependencies, exports, registryDependencies, file paths
The loop (docs/architecture.md "The loop"; each reads what the model fetched, from files):
  adp.py export DIR --url URL [--full] [--version V]
                                                    the one read of a page. Prints the export ask and the outbox list (exit 2: run them in order, then run
                                                    the same export again; --full forces a full bundle). The second run unpacks the bundle and writes
                                                    DIR.adp/incoming/, state.json, the nested repo (base/live/work) and report.json, merges live
                                                    into work when nothing is held, updates ~/.adp/artifacts.json
  adp.py import UNPACKED DIR [--title T] [--by B]
                                                    a page from an unpacked bundle (references/loop.md)
  adp.py unpack OUTBOX_DIR OUT --request AT [--over BASE]
                                                    joins and checks the bundle that answers the ask (every sha256, the tree against the page index)
                                                    into OUT; a delta lays over BASE (export runs it)
  adp.py kit check [NAME] [--site DIR]              recompute a kit item (or all) from kit/<name>/registry-item.json: declared / failing; exit 1 on failing
  adp.py apply NAME --base B.json --repo R.json --artifact A.json [--write]   RFC 7396 patch of an artifact edit onto a record; conflicts held
  adp.py classify BASE.json LIVE.json INCOMING.json new/ours/theirs/applied/held/retired over parts and files (contract 4)
  adp.py propose DIR --by NAME [--summary S] [--retire ID --reason R ...] [--repo DIR] [--code-rev REV] [--no-code]
                                                    local-to-remote incoming: the incoming/<pid> doc and its one ArtifactData batch; a board's records that cite files in git
                                                    also carry codemap/code and codemap/trace (adp_code.py), derived here, nothing to run;
                                                    exit 2 with the list when anything is held, a part is deleted unretired, there was no export, or the page is stale
  adp.py ack DIR [--result FILE | stdin] [--proposal PID]
                                                    a publish or batch result into state.json; --proposal: an applied one moves base
  adp.py gate [--input FILE | stdin]                the PreToolUse hook decision: allow a pinned data write; allow the proposal batch, the export ask and an answering write; deny any other framework write, and any write while the page is stale
  adp.py hold DIR ID ... --by NAME [--hours H] [--pins P.json] [--config C.json] [--unlock PREFIX ...]
                                                    the catalog site's hold batch for parts you will touch (a page changes by propose)
  adp.py record OLD.json DIR --seq N --by NAME --summary S [--version V] [--threads T,..] [--pins P.json]
                [--config C.json] [--unlock PREFIX ...] [--holds H.json]
                                                    the catalog site's record batch after a publish; OLD.json is manifest/current as read (a page records by propose)
  adp.py config DIR [--doc C.json]                  the switches: defaults, current values, locked, locked_parts, links
  adp.py config set KEY VALUE [--doc C.json] [--by NAME] [--pins P.json] [--out DIR]
                                                    the pinned write of config/current (+ a changes/d-<ms> data change)
  adp.py requests DUMP.json [--ack RID --by NAME | --progress RID --text T [--by NAME] |
                --done RID --response FILE [--changed a,b] [--version V] [--turns TURNS.json] [--by NAME]] [--pins P.json] [--out DIR]
                                                    the open requests/ of a page that asks (docs/assist.md); with an option, the pinned
                                                    write that moves one forward, plus presence/<NAME>. --turns: answer a reply in the next turn
Batches are written to files (--out, default DIR.adp/) and printed as `writes` lists whose entries carry file_path.
P.json maps "collection/doc" to the version you read, e.g. {"manifest/current": 4, "parts/home": 2}.
C.json is config/current as read ({schema, at, by, values, changed}, or wrapped in data). With --config, hold and record exit 2
when edit.locked is true ({error: "locked", by, at, reason}) and when a changed part falls under a parts.locked prefix
(whole segments: core matches core and core.x, not corex) unless --unlock PREFIX names it ({error: "locked parts", parts}).
With edit.require-hold, record also needs --holds H.json (parts/<id> docs as {id: {holder: ..}} or a {id: holder} map) and refuses
changed existing parts with no holder, deepest only ({error: "unheld", parts}). VALUE in `config set` is JSON when it parses, else text.

DIR (adp/2, the only layout: the artifact laid out at its published paths; a single .html page is refused): every file is hashed; the text files with markers
(.html .js .mjs .css) are parsed one by one, markers must balance within a file, data-part roots may sit in any file;
each file's text outside its parts is hashed as _rest:<path>. The manifest (schema adp/2) carries part_file {id: path}.

Markers (HTML or JS/CSS comments): <!-- part:ID --> ... <!-- /part:ID -->  |  /* part:ID */ ... /* /part:ID */
ID: dot-separated lowercase kebab, e.g. triage.keys-table. Hash: sha256 of the text between the markers with
whitespace runs collapsed, first 12 hex; a parent's text includes its children. Stdlib only; run with python3 -I."""
import contextlib, datetime, difflib, hashlib, io, json, os, re, shutil, sys

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


def file_parts(text):
    """One marked file of a DIR -> {parts, parents, elements}; its leftover text is REST here (manifest_dir names it _rest:<path>)."""
    parts, bad = parse(text)
    if bad: sys.exit('adp check failed:\n  ' + '\n  '.join(bad))
    hp = {p: H(norm(text[s:e])) for p, (s, e, _) in parts.items()}
    hp[REST] = H(norm(own(text, parts, '')))      # everything outside every part: a change there still shows
    el = {p: len(TAG.findall(own(text, parts, p))) for p in [*parts, REST]}   # own elements, children excluded
    return {'parts': dict(sorted(hp.items())), 'parents': {**{p: par for p, (_, _, par) in sorted(parts.items())}, REST: ''},
            'elements': dict(sorted(el.items()))}


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
        m = file_parts(t)
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


def own_texts(d):
    """{part id: own text} for every marked file of a DIR: the part's region minus its child parts, as written (own_hashes hashes it normalized).
    The text outside every part is `_rest:<path>`. propose reads it for the live files and the work files to carry the line edits between them."""
    out = {}
    for f, t in load(d)[1].items():
        parts, bad = parse(t)
        if bad: continue
        for k in parts: out[k] = own(t, parts, k)
        out[f'{REST}:{f}'] = own(t, parts, '')
    return out


def own_hashes(d):
    """{part id: own hash} for every marked file of a DIR: the sha12 of the part's own text (its region minus its child parts, whitespace collapsed),
    the same rule file_parts applies to the leftover. A parent's whole hash moves when a child does; this one moves only with the part's own text,
    so a proposal or a change record can say which region really changed. The text outside every part is `_rest:<path>`."""
    return {k: H(norm(v)) for k, v in own_texts(d).items()}


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
SITE = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'adp', 'site')     # the kit's files, when the plugin ships them
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


SWITCHES = ('--write', '--hook', '--no-code')     # flags that take no value


def manifest_of(m):
    """manifest/current is stored bare ({version,files,parts,..}) or wrapped ({data:{..}}, no files/parts): the one unwrap (JS: ADP.manifest)."""
    return m['data'] if isinstance(m, dict) and isinstance(m.get('data'), dict) and 'parts' not in m and 'files' not in m else m


def bare(a):
    """positional args: everything that is not a --flag or a flag's value (a SWITCHES flag has none)"""
    out, skip = [], False
    for x in a:
        if skip: skip = False
        elif x in SWITCHES: pass
        elif x.startswith('--'): skip = True
        else: out.append(x)
    return out


def tmeta(name):
    p = os.path.join(TPL, name, 'template.json')
    if not os.path.isfile(p): sys.exit(f'no template {name}: ' + ', '.join(sorted(os.listdir(TPL))))
    return json.load(open(p))


ADP_HOME = os.environ.get('ADP_HOME') or os.path.join(os.path.expanduser('~'), '.adp')
CAT_URL = re.compile(r'https://claude\.ai/(?:code/)?artifact/[A-Za-z0-9-]+/?$')


def cat_dir(url):
    return os.path.join(ADP_HOME, 'sites', url.rstrip('/').rsplit('/', 1)[-1])


def fetch_call(url, paths=None):
    """The one Artifact read that brings a catalog's live index and seed to disk, where `take`, `new` and `catalog` find them:
    adp.json (the entries and their files), seed.json and its first pack (the kit's docs, which `new` seeds into every new artifact)."""
    return {'tool': 'Artifact', 'action': 'read', 'url': url, 'paths': paths or ['adp.json', SEED, f'{SEED_DIR}/pack-001.json'], 'out_dir': cat_dir(url), 'then': 'run the command again'}


def kit_docs(cat_root, files, url, ver, at, entries=True, all_parts=False):
    """The kit's docs for an artifact that took `files` from the catalog at cat_root (its fetched seed.json and packs): entries/<name>
    (every entry, as the catalog describes it), parts/<id> for every taken file the catalog cut into a part (its hash, so the record
    matches the file), and kit/self (where the kit came from). [] when the catalog's seed is not on disk."""
    idx, docs = read_seed(cat_root)
    if not docs: return []
    out = [('entries', i, x) for c, i, x, *_ in docs if c == 'entries'] if entries else []
    out += [('parts', i, dict(x, version='1', at=at, summary=f'taken from the catalog, version {ver or "?"}', holder='', hold_until=''))
            for c, i, x, *_ in docs if c == 'parts' and (x.get('file') in files or (all_parts and x.get('file', '').startswith('kit/')))]
    out += [('files', i, x) for c, i, x, *_ in docs if c == 'files' and (i in files or x.get('path') in files)]    # 0.5.3: files/<path> {text, sha256}, the sha the entry's Merkle hash is built from
    out.append(('kit', 'self', {'site': url, 'ver': ver or '', 'at': at, 'by': idx.get('by', ''), 'entries': len([1 for c, *_ in out if c == 'entries']),
                                'files': len(files), 'note': 'the Artifact Kit this page carries, taken by reference from catalog; a take of more pins the same ver'}))
    return out


def saved_site():
    p = os.path.join(ADP_HOME, 'config.json')
    return (json.load(open(p)) if os.path.isfile(p) else {}).get('site')


def site_cmd(a):
    pos = bare(a[1:])
    if pos:
        if not CAT_URL.match(pos[0]): sys.exit('catalog: a claude.ai artifact url (https://claude.ai/artifact/<id>)')
        p = os.path.join(ADP_HOME, 'config.json'); os.makedirs(ADP_HOME, exist_ok=True)
        cfg = json.load(open(p)) if os.path.isfile(p) else {}; cfg['site'] = pos[0].rstrip('/')
        json.dump(cfg, open(p, 'w'), indent=1)
    url = saved_site()
    if not url: return emit({'site': None, 'next': 'adp.py site <url> saves the user\'s catalog (SKILL.md says how to find it); never assume one'})
    idx = os.path.join(cat_dir(url), 'adp.json')
    out = {'site': url, 'index': idx, 'fetched': os.path.isfile(idx)}
    if out['fetched']:
        c = json.load(open(idx)); out.update(ver=c.get('ver') or None, built=c.get('built'), entries=len(c.get('entries', [])))
        sidx, sdocs = read_seed(cat_dir(url)); missing = [pk for pk in sidx.get('packs', []) if not os.path.isfile(os.path.join(cat_dir(url), pk))]
        out['seed'] = {'docs': len(sdocs), 'packs': len(sidx.get('packs', [])), 'fetched': bool(sidx) and not missing}
        if not sidx or missing: out['fetch'] = fetch_call(url, missing or None); out['note'] = 'the kit docs are not on disk: new seeds the whole kit only once this read has run'
        else: out['refresh'] = fetch_call(url)      # the same read, when the catalog has published since
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
    """the files index.html loads, in order, local or taken, then the seed: they go up with the page so version 1 renders and seeds"""
    p = os.path.join(d, 'index.html')
    if not os.path.isfile(p): return []
    out = []
    for ref in re.findall(r'(?:src|href)="([^"]+)"', open(p, encoding='utf-8').read()):
        if not re.match(r'(?:[a-z]+:|#|//)', ref) and ref not in out: out.append(ref.split('?')[0].split('#')[0])
    return out + [SEED, *read_seed(d)[0].get('packs', [])]


def batched(out, d, n, where):
    """over n files: `files` -> `batches` (page dependencies first), each written to where/publish-N.json"""
    m = out['files']
    if len(m) <= n: return out
    deps = [p for p in page_deps(d) if p in m]; order = deps + [p for p in m if p not in deps]
    bs = [{p: m[p] for p in order[i:i + n]} for i in range(0, len(order), n)]
    os.makedirs(where, exist_ok=True); paths = []
    for i, b in enumerate(bs, 1):
        p = os.path.join(where, f'publish-{i}.json'); json.dump(b, open(p, 'w'), indent=0); paths.append(os.path.abspath(p))
    out.pop('files'); out['batch_files'] = paths; out['batch_sizes'] = [len(b) for b in bs]
    out['note'] = (f'{len(m)} files in {len(bs)} publishes, each a `files` map written to batch_files[i] (not printed: a map this size would drown the result). '
                   'Read batch_files[0] and publish the page with it as `files` (new artifact: add capabilities, icon); then each other batch file to the '
                   'same url; every publish passes file_path and root, the tool refuses files without them; note every version id, then adp.py pins')
    return out


LOADER = """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{title}}</title></head><body>
<script>
  const idOf = p => p.replace(/[^A-Za-z0-9_.\\-]/g, c => '~' + c.charCodeAt(0).toString(16) + '~'), CH = 150000, own = k => !k.startsWith('seed/') && !k.startsWith('$');
  const hex = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))), b => b.toString(16).padStart(2, '0')).join('');
  const group = snap => { const by = {}; snap.docs.forEach(d => { const x = d.data(); (by[x.path] = by[x.path] || []).push(x); }); return Object.entries(by).map(([path, xs]) => (xs.sort((a, b) => a.c - b.c), {path, text: xs.map(x => x.text).join(''), sha: xs[0].sha, n: xs[0].n, got: xs.length})); };
  const pool = async (items, fn, start = 96, max = 192) => {      // heavy parallelism that backs off: halve on resource_exhausted, grow back slowly
    let limit = start, i = 0, active = 0, ok = 0, err = null;
    await new Promise(fin => {
      const next = () => { while (!err && active < limit && i < items.length) { active++; go(items[i++], 0); } if (active === 0 && (err || i >= items.length)) fin(); };
      const go = async (it, tries) => {
        try { await fn(it); if (++ok % limit === 0 && limit < max) limit++; }
        catch (e) { if (e && e.code === 'resource_exhausted' && tries < 8) { limit = Math.max(8, limit >> 1); await new Promise(r => setTimeout(r, 400 * (tries + 1))); return go(it, tries + 1); } err = err || e; }
        active--; next();
      };
      next();
    });
    if (err) throw err;
  };
  async function settle(P, cl, db) {      // behind the render: the page's files become records, are checked, and the pack goes
    try {
      const user = await cl.use('user'), art = await cl.use('artifact');
      if (!db || !art || !user || !await user.canEdit()) return;
      const ks = Object.keys(P).filter(own).sort(), st = await db.doc('status/files').get();
      const pk = await hex(JSON.stringify(ks.map(p => [p, P[p]])));      // a new pack (an update published as loader + pack.json) is settled again
      if (!(st.exists && st.data().state === 'verified' && st.data().pack === pk)) {
        const jobs = ks.flatMap(p => { const t = P[p], n = Math.max(1, Math.ceil(t.length / CH)); return Array.from({length: n}, (_, c) => ({p, t, n, c, id: idOf(p) + (n > 1 ? '.c' + c : '')})); });
        await pool(jobs, async j => db.collection('files').doc(j.id).set({path: j.p, c: j.c, n: j.n, text: j.t.slice(j.c * CH, (j.c + 1) * CH), sha: j.c ? '' : await hex(j.t)}));
        const keep = new Set(jobs.map(j => j.id));      // records of an older pack (a file removed, or chunked differently) go
        await pool((await db.collection('files').get()).docs.filter(x => !keep.has(x.id)), async x => db.collection('files').doc(x.id).delete());
        const back = group(await db.collection('files').get()), by = Object.fromEntries(back.map(x => [x.path, x]));
        if (back.length !== ks.length) return;
        for (const p of ks) { const x = by[p]; if (!x || x.got !== x.n || x.text !== P[p] || x.sha !== await hex(P[p])) return; }      // anything that does not match: the pack stays
        await db.doc('status/files').set({state: 'verified', files: ks.length, pack: pk, at: new Date().toISOString()});
      }
      for (let i = 0; ; i++) {      // the pack also carries the seed: it stays until the page has finished seeding its database
        const sd = await db.doc('status/seed').get(); if (sd.exists && sd.data().state === 'done') break;
        if (i >= 200) return; await new Promise(r => setTimeout(r, 3000));
      }
      await art.publish({'pack.json': null});
    } catch (_) {}      // the pack stays: a page that could not settle is a page that still works
  }
  const KEEP = ['data-skin', 'data-skin-with', 'data-skin-font', 'media'];      // a theme link's switches: its inline <style> keeps them, or every theme applies at once
  const keep = (l, st) => { for (const a of KEEP) if (l.hasAttribute(a)) st.setAttribute(a, l.getAttribute(a)); return st; };
  async function records(db) {
    const back = group(await db.collection('files').get()), R = {};
    for (const x of back) { if (x.sha && await hex(x.text) !== x.sha) throw new Error('the record for ' + x.path + ' does not match its sha256'); R[x.path] = x.text; }
    return R;
  }
  async function getPack() {
    let P = null; try { const r = await fetch('pack.json'); if (r.ok) P = await r.json(); } catch (_) {}
    const cl = window.claude, db = cl && await cl.use('db').catch(() => null);
    if (P && P.$base === 'records') {      // a delta pack (an applied proposal on a settled page): the changed files over the records
      if (!db) throw new Error('this page has a delta pack and no database to read its files from');
      const R = await records(db); for (const k of P.$removed || []) delete R[k];
      for (const k of Object.keys(P)) if (!k.startsWith('$')) R[k] = P[k];
      P = R;
    }
    if (P) { settle(P, cl, db); return P; }
    if (!db) throw new Error('this page has no pack.json and no database to read its files from');
    return records(db);
  }
(async () => {
  const P = await getPack().catch(e => { document.body.textContent = 'This page could not load its files: ' + e.message; throw e; }), key = u => String(u).split('?')[0].replace(/^\\.?\\//, '');
  window.ADP_FILES = Object.keys(P);
  const real = window.fetch.bind(window);
  window.fetch = (u, o) => key(u) in P ? Promise.resolve(new Response(P[key(u)], {status: 200, headers: {'content-type': /\\.json$/.test(key(u)) ? 'application/json' : 'text/plain'}})) : real(u, o);
  const own = u => { const k = key(u); return !/^[a-z][a-z0-9+.-]*:/i.test(String(u)) && k in P ? k : null; };      // a file the pack holds, by a relative path
  const mime = k => /\\.css$/.test(k) ? 'text/css' : /\\.svg$/.test(k) ? 'image/svg+xml' : /\\.json$/.test(k) ? 'application/json' : 'text/javascript';
  const blob = k => URL.createObjectURL(new Blob([P[k]], {type: mime(k)}));
  const css = (l, k) => { const st = keep(l, document.createElement('style')); st.textContent = P[k]; document.head.appendChild(st);
    for (const p of ['disabled', 'media']) Object.defineProperty(l, p, {configurable: true, get: () => st[p], set: v => { st[p] = v; }});      // the page toggles its link (kit.skins: disabled, media); the style it became follows
    setTimeout(() => l.dispatchEvent(new Event('load')), 0); };      // a stylesheet becomes inline css: the page's style policy refuses a blob link
  for (const [proto, prop] of [[HTMLScriptElement.prototype, 'src'], [HTMLLinkElement.prototype, 'href'], [HTMLImageElement.prototype, 'src']]) {      // files the page adds later (kit parts load on demand)
    const d = Object.getOwnPropertyDescriptor(proto, prop); Object.defineProperty(proto, prop, Object.assign({}, d, {set(v) { const k = own(v); if (k && this instanceof HTMLLinkElement && /\\.css$/.test(k)) return css(this, k); d.set.call(this, k ? blob(k) : v); }}));
  }
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) { const k = /^(src|href)$/i.test(n) && /^(SCRIPT|LINK|IMG)$/.test(this.tagName) ? own(v) : null; if (k && this.tagName === 'LINK' && /\\.css$/.test(k)) return css(this, k); return setAttr.call(this, n, k ? blob(k) : v); };
  const HOME = 'index.html', doc = new DOMParser().parseFromString(P[HOME], 'text/html'), run = [];
  for (const l of [...doc.querySelectorAll('link[rel=stylesheet]')]) { const h = l.getAttribute('href'); if (h in P) { const st = keep(l, document.createElement('style')); st.textContent = P[h]; l.replaceWith(st); } }
  for (const sc of [...doc.querySelectorAll('script')]) { run.push(sc); sc.replaceWith(document.createComment('script')); }
  document.title = doc.title || document.title;
  for (const n of [...doc.head.childNodes]) if (n.nodeName !== 'TITLE') document.head.appendChild(document.adoptNode(n));
  for (const a of doc.body.attributes) document.body.setAttribute(a.name, a.value);
  document.body.textContent = ''; for (const n of [...doc.body.childNodes]) document.body.appendChild(document.adoptNode(n));
  for (const sc of run) { const n = document.createElement('script'); for (const a of sc.attributes) if (a.name !== 'src') n.setAttribute(a.name, a.value);
    const src = sc.getAttribute('src'); if (src && !(src in P)) n.src = src; else n.textContent = src ? P[src] : sc.textContent;
    document.body.appendChild(n); await new Promise(r => n.src ? (n.onload = n.onerror = r) : r()); }
})();
</script></body></html>
"""


def build_pack(d, title):
    """The published form of DIR: one pack.json (every file of the page, the seed, and the whole kit as {path: text}) and a loader
    index.html that unpacks it in the browser. Returns the Artifact publish arguments: two files, whatever the page holds."""
    dist = d.rstrip('/') + '.pack'; os.makedirs(dist, exist_ok=True); pack = {}
    for p in tree(d):
        if p.startswith('.') or not served(p): continue
        try: pack[p] = open(os.path.join(d, p), encoding='utf-8').read()
        except UnicodeDecodeError: pass
    kp = os.path.join(d, 'kit', 'all.json'); idx = os.path.join(SITE, 'adp.json')
    if os.path.isfile(kp):      # the kit `new` took from the page's own catalog (sha256-checked there), not the plugin's copy
        for p, text in json.load(open(kp, encoding='utf-8')).items():
            if p not in pack and served(p): pack[p] = text
    elif os.path.isfile(idx):   # a page with no packed kit: the catalog the plugin ships
        for e in json.load(open(idx))['entries']:
            for f in e['files']:
                q = os.path.join(SITE, f['path'])
                if f['path'] not in pack and os.path.isfile(q) and served(f['path']):
                    try: pack[f['path']] = open(q, encoding='utf-8').read()
                    except UnicodeDecodeError: pass
    if 'index.html' not in pack:
        raise ValueError('Cannot package ADP: index.html is missing or unreadable')
    # Packaging must not turn missing startup dependencies into a successful artifact.
    refs = re.findall(r'<(?:script|link)\b[^>]*?\b(?:src|href)=[\"\']([^\"\']+)', pack['index.html'], re.I)
    missing = sorted({ref.split('?')[0].split('#')[0] for ref in refs
                      if not re.match(r'(?:[a-z][a-z0-9+.-]*:|#|//)', ref, re.I)
                      and ref.split('?')[0].split('#')[0] not in pack})
    if missing:
        raise ValueError('Cannot package ADP: missing startup files: ' + ', '.join(missing))
    json.dump(pack, open(os.path.join(dist, 'pack.json'), 'w'), separators=(',', ':'))
    open(os.path.join(dist, 'index.html'), 'w', encoding='utf-8').write(LOADER.replace('{{title}}', title.replace('<', '&lt;')))
    return {'file_path': os.path.join(dist, 'index.html'), 'root': dist, 'files': {'pack.json': 'pack.json'}}


def is_packed(d):
    """DIR is published packed (a loader and pack.json, or settled: the loader alone, the files as records): `new` and `import` leave DIR.pack,
    an export of such a url records page=pack|records."""
    if os.path.isfile(os.path.join(d.rstrip('/') + '.pack', 'pack.json')): return True
    try: return bool(json.load(open(os.path.join(d.rstrip('/') + '.adp', 'state.json'))).get('page'))
    except (OSError, ValueError): return False


def live_line(d):
    return f'the page is live: run adp.py export {d} --url <its url> and the calls it prints, then adp.py propose {d} --by <you>'


def is_live(d):
    return os.path.isfile(os.path.join(d.rstrip('/') + '.adp', 'state.json'))


def bake_bundle(d, dist):
    """DIR.adp/bundle/: the first publish as the page will export it (the pack's files, the seed's docs, bundle.json {kind: full, at: the seed version}),
    so the first `export` asks a delta over it."""
    b = os.path.join(d.rstrip('/') + '.adp', 'bundle'); shutil.rmtree(b, ignore_errors=True); os.makedirs(b)
    for p, text in json.load(open(os.path.join(dist, 'pack.json'), encoding='utf-8')).items():
        if is_seed(p): continue
        q = os.path.join(b, p); os.makedirs(os.path.dirname(q), exist_ok=True)
        with open(q, 'w', encoding='utf-8', newline='') as g: g.write(text)
    idx, docs = read_seed(d); recs = {}
    for c, i, x, *_ in docs: recs.setdefault(c, {})[i] = x
    json.dump(recs, open(os.path.join(b, 'docs.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump({'schema': 'adp-bundle/1', 'kind': 'full', 'page': 'pack', 'at': idx.get('version', ''), 'by': idx.get('by', '')}, open(os.path.join(b, 'bundle.json'), 'w', encoding='utf-8'))


def pack_road(d):
    """The first publish of DIR: refresh the seed, rebuild DIR.pack (loader + pack.json, the whole page and kit), bake DIR.adp/bundle/. Refused once the page is live."""
    if is_live(d): sys.exit(live_line(d))
    if os.path.isfile(os.path.join(d, SEED)): seed_file(d)
    m = re.search(r'<title>(.*?)</title>', open(os.path.join(d, 'index.html'), encoding='utf-8').read(), re.S)
    out = build_pack(d, m.group(1).strip() if m else 'Artifact'); bake_bundle(d, out['root'])
    return {'publish': out, 'packed': True,
            'note': 'publish `publish` (file_path, root, files: pack.json) to the url; first publish: the `new` output, capabilities included. Open the url as an editor once: the loader writes the files records and drops pack.json'}


def pack_cmd(a):
    pos = bare(a[1:])
    if len(pos) != 1 or not os.path.isfile(os.path.join(pos[0], 'index.html')): sys.exit('usage: adp.py pack DIR   (DIR holds the page: index.html, seed.json ...)')
    return emit(pack_road(pos[0]))


def import_cmd(a):
    """adp.py import UNPACKED DIR [--title T] [--by B]: the other end of `unpack`. UNPACKED is what unpack wrote (the files, docs.json). DIR becomes a
    new page from it: the same files, a seed built from the exported records, one pack.json and a loader, and the same two-file publish as `new`.
    Moving a page, forking it or restoring it is this command; the live page never re-imports. status/ is not carried: the new page seeds its own."""
    pos = bare(a[1:])
    if len(pos) != 2 or not os.path.isdir(pos[0]): sys.exit('usage: adp.py import UNPACKED DIR [--title T] [--by B]   (UNPACKED: what adp.py unpack wrote)')
    src, d = pos
    if os.path.exists(d) and os.listdir(d): sys.exit(f'import: {d} is not empty')
    title, by = opt(a, '--title', 'Imported page'), opt(a, '--by', 'adp')
    for p in tree(src):
        if p in ('docs.json', 'bundle.json') or p.startswith('.') or p == SEED or p.startswith(SEED_DIR + '/'): continue
        dst = os.path.join(d, p); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copyfile(os.path.join(src, p), dst)
    dj = os.path.join(src, 'docs.json'); recs = json.load(open(dj, encoding='utf-8')) if os.path.isfile(dj) else {}
    data = [(c, i, x) for c, ds in recs.items() if c not in ('status', 'outbox', 'manifest') for i, x in ds.items()]
    seed_file(d, by, data=data, summary='Imported from an export: the files and records of another page.', role='maintainer of this page')
    return emit({'template': 'import', 'dir': d, 'title': title, 'publish': dict(build_pack(d, title), capabilities=tmeta('starter').get('capabilities', {})),
                 'seed': dict(read_seed(d)[0].get('collections', {})),
                 'next': ['Artifact publish with the `publish` arguments (first publish: add icon; label "adp/2 import"); open it once as an editor: the page seeds itself and settles']})


def unpack_cmd(a):
    """adp.py unpack OUTBOX_DIR OUT --request AT [--over BASE]: the command `adp.py export DIR --url URL` prints after the outbox list. OUTBOX_DIR is the
    outbox folder `ArtifactData list outbox out_dir=...` wrote. Joins the chunks, checks the length and sha256 of the bundle and of every file, writes the
    files as they were, the records to OUT/docs.json ({collection: {id: data}}) and the joined bundle to OUT/bundle.json. A delta bundle goes over BASE,
    the last unpack's OUT: its files and records replace BASE's, what its index drops goes, and the merged tree must match the index (a gap in the page's
    log stops it: run `adp.py export DIR --url URL --full`). --request AT takes the bundle that answers the ask (its `at`); none yet = the page has not
    answered. Any mismatch stops with nothing written."""
    pos = bare(a[1:])
    if len(pos) != 2 or not os.path.isdir(pos[0]) or not opt(a, '--request'):
        sys.exit('usage: adp.py unpack OUTBOX_DIR OUT --request AT [--over BASE]   (as adp.py export DIR --url URL prints it; OUTBOX_DIR: the folder its outbox list wrote)')
    src, out = pos; docs = {}
    for f in sorted(os.listdir(src)):
        if f.endswith('.json'):
            j = json.load(open(os.path.join(src, f), encoding='utf-8')); docs[f[:-5]] = j.get('data', j) if isinstance(j, dict) else {}
    metas = {i: d for i, d in docs.items() if d.get('schema') == 'adp-bundle/1' and 'chunks' in d and d.get('state') == 'done'}
    AGAIN = 'Run adp.py export DIR --url URL, its two ArtifactData calls, and the same export again.'
    if not metas: sys.exit('unpack: no finished bundle in ' + src + '. ' + AGAIN)
    ask = opt(a, '--request')      # the bundle that answers this ask (pattern.outbox writes the ask's `at` as `request`)
    bid = next((i for i, m in metas.items() if m.get('request') == ask), None)
    if not bid: sys.exit(f'unpack: the page has not answered export ask {ask}. Stop: report "open the page" to the session that called you; '
                         f'once it is open, run the outbox list and the same export again.')
    m = metas[bid]
    parts = [docs.get(f'{bid}-c{i:03d}') for i in range(m['chunks'])]
    if any(c is None or c.get('n') != i or c.get('bundle') != bid for i, c in enumerate(parts)): sys.exit(f'unpack: bundle {bid} is missing chunks (expected {m["chunks"]}). ' + AGAIN)
    text = ''.join(c['text'] for c in parts)
    if len(text.encode('utf-16-le')) // 2 != m['chars'] or hashlib.sha256(text.encode('utf-8')).hexdigest() != m['sha256']: sys.exit(f'unpack: bundle {bid} does not match its recorded length and sha256. ' + AGAIN)      # chars: the page's JS length, in UTF-16 units
    b = json.loads(text); bad = []
    for p, f in b['files'].items():
        if hashlib.sha256(f['text'].encode('utf-8')).hexdigest() != f['sha256']: bad.append(p)
        n = os.path.normpath(p)
        if os.path.isabs(n) or n.startswith('..'): sys.exit(f'unpack: refusing the path {p}')
    if bad: sys.exit('unpack: sha256 differs for ' + ', '.join(bad[:5]) + (' ...' if len(bad) > 5 else '') + '. ' + AGAIN)
    if len(b['files']) != m['files'] or len(b['docs']) != m['docs']: sys.exit('unpack: the bundle holds a different count than its meta doc records. ' + AGAIN)
    files = {p: f['text'] for p, f in b['files'].items()}; byc = {}
    for x in b['docs']: byc.setdefault(x['collection'], {})[x['id']] = x['data']
    kind, ix = b.get('kind', 'full'), b.get('index') or {}
    if kind == 'delta':
        base = opt(a, '--over')
        if not base or not os.path.isfile(os.path.join(base, 'docs.json')): sys.exit(f'unpack: bundle {bid} is a delta and needs the last unpack. Run adp.py export DIR --url URL --full, its two ArtifactData calls, and the same export again.')
        old = {}
        for root, _, fs in os.walk(base):
            for f in fs:
                rel = os.path.relpath(os.path.join(root, f), base).replace(os.sep, '/')
                if rel not in ('docs.json', 'bundle.json'): old[rel] = open(os.path.join(root, f), encoding='utf-8', newline='').read()
        files = {**{p: t for p, t in old.items() if p in ix.get('files', {})}, **files}
        od = json.load(open(os.path.join(base, 'docs.json'), encoding='utf-8')); keep = set(ix.get('docs', {}))
        merged = {}
        for c, ds in od.items():
            for i, d in ds.items():
                if f'{c}/{i}' in keep: merged.setdefault(c, {})[i] = d
        for c, ds in byc.items(): merged.setdefault(c, {}).update(ds)
        byc = merged
    if ix:      # every file and record of the tree must be the page's: a gap in its log, or a base that is not the agent's, stops here
        import adp_kit
        miss = [p for p, h in ix.get('files', {}).items() if p not in files or hashlib.sha256(files[p].encode('utf-8')).hexdigest() != h]
        miss += [p for p in files if p not in ix.get('files', {})]
        have = {f'{c}/{i}': d for c, ds in byc.items() for i, d in ds.items()}
        miss += [k for k, h in ix.get('docs', {}).items() if k not in have or hashlib.sha256(adp_kit.canon(have[k]).encode('utf-8')).hexdigest() != h]
        if miss: sys.exit(f'unpack: {len(miss)} file(s) or record(s) differ from the page\'s index ({", ".join(miss[:5])}{" ..." if len(miss) > 5 else ""}). Nothing was written. Run adp.py export DIR --url URL --full, its two ArtifactData calls, and the same export again.')
    if os.path.isdir(out) and opt(a, '--over') and os.path.abspath(out) == os.path.abspath(opt(a, '--over')): shutil.rmtree(out)
    for p, t in files.items():
        dst = os.path.join(out, p); os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, 'w', encoding='utf-8', newline='') as g: g.write(t)
    json.dump(byc, open(os.path.join(out, 'docs.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    with open(os.path.join(out, 'bundle.json'), 'w', encoding='utf-8', newline='') as g: g.write(text)      # the chunks joined and verified: the one file
    return emit({'bundle': bid, 'kind': kind, 'base': b.get('base', ''), 'page': b.get('page', ''), 'by': b['by'], 'at': b['at'], 'files': len(files), 'docs': sum(len(v) for v in byc.values()),
                 'carried': {'files': len(b['files']), 'docs': len(b['docs'])}, 'out': out, 'verified': 'bundle sha256, every file sha256' + (', the whole tree against the page index' if ix else '')})


def pins(a):
    pairs = [x for x in bare(a[1:]) if '=' in x]
    if not pairs: sys.exit('usage: adp.py pins publish-1.json=VERSION_ID ... [--out vermap.json]')
    vm = {}
    for x in pairs:
        f, ver = x.rsplit('=', 1)
        for p in json.load(open(f)): vm[p] = ver
    out = opt(a, '--out') or os.path.join(os.path.dirname(os.path.abspath(pairs[0].rsplit('=', 1)[0])), 'vermap.json')
    json.dump(vm, open(out, 'w'), indent=0, sort_keys=True)
    return emit({'pinned': len(vm), 'vermap': os.path.abspath(out), 'next': f'CAT_URL=<url> CAT_VERMAP={out} make site, then publish adp.json to the same url'})


def taken(src, ids, a):
    """`take`'s own output for ids, as {} plus the exit code: new merges it into its publish so the call is pasted once."""
    pass_on = [x for f in ('--url', '--config') if opt(a, f) for x in (f, opt(a, f))]
    buf, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(err):
        try: code = take(['take', src, *ids, *pass_on])
        except SystemExit as e: code = e.code if isinstance(e.code, int) else 1; err.write(str(e.code) if not isinstance(e.code, int) and e.code is not None else '')
    out = json.loads(buf.getvalue()) if buf.getvalue().strip() else {}
    if code and not out: out = {'error': 'take failed', 'site': src, 'reason': err.getvalue().strip()}   # the take's own message, so the caller sees why (a local index needs --url)
    return out, code


NEW_USAGE = 'usage: adp.py new DIR [--title T] [--by NAME] [--data FILE|DIR] [--standalone] (DIR is the project by default)'


def new_target(a):
    pos, i = [], 1
    while i < len(a):
        if a[i] in ('--title', '--by', '--data') and i + 1 < len(a): i += 2
        elif a[i] == '--standalone': i += 1
        elif a[i].startswith('--'): sys.exit(f'new: no option {a[i]}. ' + NEW_USAGE)
        else: pos.append(a[i]); i += 1
    if len(pos) != 1: sys.exit(NEW_USAGE)
    return pos[0]


def new(a):
    d = new_target(a)
    if '--standalone' in a: return new_standalone(a)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(HERE)), 'mcp'))
    from workspace_bootstrap import create_workspace
    try: result = create_workspace(d, opt(a, '--title', 'Untitled artifact'), opt(a, '--by', 'adp'), optall(a, '--data'))
    except (OSError, ValueError) as error: sys.exit('new: ' + str(error))
    return emit(result)


def new_standalone(a):
    d = new_target(a)
    if os.path.exists(d) and os.listdir(d): sys.exit(f'{d} exists and is not empty')
    bundled = os.path.join(SITE, 'adp.json')
    if not os.path.isfile(bundled): sys.exit(f'new: the plugin ships no catalog ({bundled})')
    meta = tmeta('starter'); title = opt(a, '--title', 'Untitled artifact'); slug = slugify(title); by = opt(a, '--by', 'adp')
    files = {p: os.path.join(TPL, 'starter', p) for p in tree(os.path.join(TPL, 'starter')) if p != 'template.json'}
    files['adp.js'] = os.path.join(HERE, 'assets', 'adp.js')
    sub = lambda t: t.replace('{{title}}', title).replace('{{slug}}', slug)
    for p, src in sorted(files.items()):
        dst = os.path.join(d, sub(p)); os.makedirs(os.path.dirname(dst), exist_ok=True)
        if p == 'adp.js': shutil.copyfile(src, dst); continue
        with open(src, encoding='utf-8') as f, open(dst, 'w', encoding='utf-8') as g: g.write(sub(f.read()))
    tk = meta.get('take', [])
    out = {'dir': d, 'title': title, 'publish': dict(publish_args(d), capabilities=meta.get('capabilities', {}))}
    try: cat, _ = index_of(bundled, a)
    except OldFormat as e: emit({'error': 'new failed', 'site': bundled, 'reason': str(e)}); sys.exit(2)
    t, code = taken(bundled, tk, ['--url', 'adp:bundled'])
    if code: emit(t); sys.exit(2)
    json.dump(cat, open(os.path.join(d, 'adp.json'), 'w'), separators=(',', ':')); out['publish']['files']['adp.json'] = 'adp.json'      # the Catalog view reads it when the db has no entries/
    tf = {p: v for p, v in t['files'].items() if p not in out['publish']['files']}      # a file the scaffold wrote (adp.js, the runtime) wins over the catalog's copy
    want = {f['path']: f.get('sha256') for e in cat['entries'] for f in e['files']}
    def kit_text(p):
        q = os.path.join(SITE, p)
        if not os.path.isfile(q): return None
        try: return open(q, encoding='utf-8').read()
        except UnicodeDecodeError: return None
    for p in list(tf):
        text = kit_text(p)
        if text is not None:
            os.makedirs(os.path.dirname(os.path.join(d, p)), exist_ok=True); open(os.path.join(d, p), 'w', encoding='utf-8').write(text); tf[p] = p
    packed = {p: x for p in want for x in [kit_text(p)] if x is not None}      # every kit file travels in pack.json: the page carries the whole kit
    miss = sorted(p for p in want if p not in packed)
    if miss: sys.exit(f'new: {len(miss)} kit files of the plugin\'s catalog are not on disk (first: {miss[0]}). Reinstall the plugin.')
    os.makedirs(os.path.join(d, 'kit'), exist_ok=True); json.dump(packed, open(os.path.join(d, 'kit', 'all.json'), 'w'), separators=(',', ':')); tf['kit/all.json'] = 'kit/all.json'
    out['publish']['files'].update(tf)
    kit = kit_docs(SITE, tf, '', t['site'].get('ver'), now(), entries=True, all_parts=True)
    if not kit: sys.exit(f'new: the plugin\'s catalog seed is not on disk ({SITE}/{SEED}). Reinstall the plugin.')
    seed_file(d, by, data=kit + data_docs(optall(a, '--data')), summary='First build of this page on adp/2: the whole Artifact Kit, its entries and its files.', role='maintainer of this page')
    out['publish'] = dict(pack_road(d)['publish'], capabilities=meta.get('capabilities', {}))
    out['seed'] = dict(read_seed(d)[0].get('collections', {})); out['entries'] = len(cat['entries'])
    out['next'] = ['adp.py check ' + d,
                   'adp.py pack ' + d + '   (run after your last edit to DIR)',
                   'Artifact publish with the `publish` arguments: file_path, root, files, capabilities, icon, label "adp/2 start"',
                   'Open the url the publish returned in the browser pane (navigate): the page expands seed.json and seed/ into its database on that first open',
                   'ArtifactData get status/seed until state is done',
                   'stop: the user confirms the page in the browser; then run the export below',
                   'adp.py export ' + d + ' --url URL   (the url the publish returned; run its two ArtifactData calls, then the same export again; the first export is a delta over ' + d.rstrip('/') + '.adp/bundle)']
    return emit(out)


def take_into(d, ids):
    """`take DIR ID ...`: the one Artifact read that brings the entries' files (registryDependencies first) as text into DIR/kit; propose carries them."""
    url = saved_site() or sys.exit('take: no saved catalog; adp.py site <url> saves it')
    cat, _ = index_of(url, [])
    by = {e['name']: e for e in map(rec, cat['entries'])}; order, seen = [], set()
    def visit(i):
        if i in seen: return
        if i not in by: sys.exit(f'no entry {i} in {url}')
        seen.add(i)
        for r in by[i].get('registryDependencies', []): visit(r)
        order.append(i)
    for i in ids: visit(i)
    paths = [f['path'] for i in order for f in by[i]['files']]
    return emit({'entries': order, 'calls': [{'tool': 'Artifact', 'action': 'read', 'url': url, 'paths': paths, 'out_dir': os.path.join(d, 'kit')}],
                 'then': f'after the Artifact read, run adp.py propose {d} --by <you>'})


def take(a):
    pos = bare(a[1:])
    if len(pos) < 2: sys.exit('usage: adp.py take DIR ID ...   (the one Artifact read into DIR/kit)\n       adp.py take SITE ID ... [--url URL] [--config C.json]   (the catalog site: SITE is its url, - (saved), or a local adp.json)')
    if os.path.isdir(pos[0]): return take_into(pos[0], pos[1:])
    src = pos[0]
    if src == '-': src = saved_site() or sys.exit('take: no saved catalog; adp.py site <url> saves one')
    live = bool(CAT_URL.match(src))
    if live:
        url, idx = src.rstrip('/'), os.path.join(cat_dir(src), 'adp.json')
        if not os.path.isfile(idx): emit({'error': 'index not fetched', 'site': url, 'fetch': fetch_call(url)}); sys.exit(2)
    else:
        idx = src
        if not os.path.isfile(idx): sys.exit(f'take: {src} is neither a catalog url nor a adp.json')
        cfg = cvalues(read_doc(opt(a, '--config'))) if opt(a, '--config') else {}
        url = opt(a, '--url') or cfg.get('links.site') or json.load(open(idx)).get('url')
        if not url: sys.exit('take: no catalog url. Pass the catalog url as CATALOG (then the index is the live one), or --url with a local index')
    cat = json.load(open(idx)); refuse_old(cat); by = {e['name']: e for e in map(rec, cat['entries'])}
    order, seen = [], set()
    def visit(i):
        if i in seen: return
        if i not in by: sys.exit(f'no entry {i} in {pos[0]}')
        seen.add(i)
        for r in by[i].get('registryDependencies', []): visit(r)
        order.append(i)
    for i in pos[1:]: visit(i)
    m = {}
    for i in order:
        for f in by[i]['files']:
            m[f['path']] = dict({'artifact': url, 'path': f['path']}, **({'ver': f['ver']} if f.get('ver') else {}))
    info = {'url': url, 'index': os.path.abspath(idx), 'live': live, 'ver': cat.get('ver') or None, 'built': cat.get('built')}
    if not live: info['warning'] = 'a local index is a build, not the live catalog: a file it lists may be missing there. adp.py take <catalog url> ... reads the fetched live index'
    return emit({'site': info, 'entries': order, 'files': m, 'sha256': {f['path']: f['sha256'] for i in order for f in by[i]['files'] if f['path'] in m}})


OLD_FORMAT = 'this catalog is in the pre-0.5.3 format; refresh it from a catalog published at 0.5.3+ (adp.py site <url>)'


class OldFormat(SystemExit):
    """A catalog index in the pre-0.5.3 shape (an entry with `id`, or without `type`): refused, never read."""


def refuse_old(cat):
    if any('id' in e or 'type' not in e for e in cat['entries']): raise OldFormat(OLD_FORMAT)
    return cat


def index_of(src, a):
    """(catalog dict, warning or None) for a SITE argument, resolved as `take` does: url (fetched index), - (saved), or a local adp.json."""
    if src == '-': src = saved_site() or sys.exit('no saved catalog; adp.py site <url> saves one')
    if CAT_URL.match(src):
        idx = os.path.join(cat_dir(src), 'adp.json')
        if not os.path.isfile(idx): emit({'error': 'index not fetched', 'site': src.rstrip('/'), 'fetch': fetch_call(src.rstrip('/'))}); sys.exit(2)
        return refuse_old(json.load(open(idx))), None
    if not os.path.isfile(src): sys.exit(f'{src} is neither a catalog url nor a adp.json')
    return refuse_old(json.load(open(src))), 'a local index is a build, not the live catalog: a file it lists may be missing there'


def rec(e):
    """A catalog entry (a record: name, description, keywords, registryDependencies, dependencies, meta, modules) with the working fields the
    readers below use added: exports (the ones its modules declare), about."""
    return dict(e, exports=[x['name'] for mo in e.get('modules', []) for x in mo.get('exports', [])], about=e.get('docs') or e.get('description', ''))


WORD = re.compile(r'[a-z0-9]+')


def suggest(a):
    pos, words, n = bare(a[1:]), opt(a, '--for'), int(opt(a, '--n', 3))
    if len(pos) != 1 or not words: sys.exit('usage: adp.py suggest SITE --for "free words" [--n 3] [--kind K]')
    cat, warn = index_of(pos[0], a); want = set(WORD.findall(words.lower())); want |= {w[:-1] for w in want if len(w) > 3 and w.endswith('s')}
    groups = {}
    for e in map(rec, cat['entries']):
        kind = e['name'].split('.')[0]
        if opt(a, '--kind') and opt(a, '--kind') not in (kind, e['type'].split(':')[-1]): continue
        hit = [t for t in e.get('keywords', []) if want & set(WORD.findall(t.lower()))]
        sw = want & set(WORD.findall((e.get('description', '') + ' ' + e.get('title', '')).lower()))
        score = 3 * len(hit) + len(sw)
        if score: groups.setdefault(kind, []).append((score, e['name'], {'id': e['name'], 'kind': kind, 'why': 'keywords: ' + ', '.join(hit or sorted(sw)),
                  'registryDependencies': e.get('registryDependencies', []), 'takes': len(e['files'])}))
    out = [x[2] for k in sorted(groups) for x in sorted(groups[k], key=lambda t: (-t[0], t[1]))[:n]]
    if warn: sys.stderr.write('warning: ' + warn + '\n')
    return emit(out)


def kit_consume(path, a):
    """`kit consume PACK [--site DIR]`: the repo end of the catalog bench's Export. PACK is the adp-seed/2 pack the bench wrote to
    ns/users/<uid>/bench/<name>/pack (field `text`; save it to a file). Every entries/<name> doc must pass its schema, name its folder
    kit/<name>/, and carry a files/<id> doc per file whose sha256 and bytes match and whose item hash recomputes; then the files and
    registry-item.json are written under SITE and `kit check <name>` runs on them. Any mismatch stops with nothing written."""
    import adp_kit
    site = os.path.abspath(opt(a, '--site', 'adp/site'))
    try: pack = json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e: sys.exit('kit consume: ' + str(e))
    if not isinstance(pack, dict) or pack.get('schema') != 'adp-seed/2' or not isinstance(pack.get('docs'), list): sys.exit('kit consume: not an adp-seed/2 pack (schema, docs)')
    by = lambda c: {x['id']: x['data'] for x in pack['docs'] if x.get('collection') == c}
    ents, fdocs = by('entries'), by('files'); out, plan = [], []
    if not ents: sys.exit('kit consume: the pack holds no entries/<name> doc')
    for name, e in ents.items():
        if e.get('name') != name: sys.exit('kit consume: entries/%s names %s' % (name, e.get('name')))
        raw = {k: v for k, v in e.items() if k not in adp_kit.ENVELOPE}; raw['files'] = [{k: v for k, v in f.items() if k not in ('sha256', 'bytes')} for f in e.get('files', [])]
        bad = adp_kit.validate_doc('entries', dict(raw, **{k: e.get(k) for k in adp_kit.ENVELOPE if k in e}))      # the record as registry-item.json holds it, plus hash, at, by
        if bad: sys.exit('kit consume: entries/%s · %s · %s' % (name, bad[0]['field'], bad[0]['expected']))
        hashes, texts = {}, {}
        for f in e['files']:
            q = os.path.normpath(f['path'])
            if os.path.isabs(q) or not q.startswith('kit' + os.sep + name + os.sep): sys.exit('kit consume: %s is not under kit/%s/' % (f['path'], name))
            d = next((x for x in fdocs.values() if x.get('path') == f['path']), None)
            if d is None: sys.exit('kit consume: no files/ doc for ' + f['path'])
            if adp_kit.sha(d['text']) != f['sha256'] or d.get('sha256') != f['sha256'] or len(d['text'].encode('utf-8')) != f['bytes']: sys.exit('kit consume: %s differs from its recorded sha256 or bytes' % f['path'])
            hashes[f['path']] = f['sha256']; texts[f['path']] = d['text']
        if adp_kit.item_hash(raw, hashes) != e['hash']: sys.exit('kit consume: entries/%s hash does not match its record and files' % name)
        plan.append((name, raw, texts))
    same = {}      # an existing kit/<name>/ with the pack's files byte for byte is a no-op; with any other content it is refused
    for name, raw, texts in plan:
        d = os.path.join(site, 'kit', name)
        if not os.path.isdir(d): same[name] = False; continue
        def cur(p):
            try: return open(os.path.join(site, p), encoding='utf-8', newline='').read()
            except OSError: return None
        if any(cur(p) != t for p, t in texts.items()): sys.exit('kit consume: %s already exists and its files differ from the pack; nothing written' % os.path.join('kit', name))
        same[name] = True
    for name, raw, texts in plan:
        replaced = same[name]
        if not replaced:
            for p, t in texts.items():
                dst = os.path.join(site, p); os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(dst, 'w', encoding='utf-8', newline='') as g: g.write(t)
            with open(os.path.join(site, 'kit', name, adp_kit.RECORD), 'w', encoding='utf-8') as g: g.write(json.dumps(raw, indent=2, ensure_ascii=False) + '\n')
        r = adp_kit.check(site, name); out.append({'name': name, 'files': len(texts), 'unchanged': replaced, 'kit_check': r['summary'], 'failing': [i for i in r['items'] if i['state'] == 'failing']})
    emit({'consumed': out, 'next': ['make site (stamps the hashes into adp.json and the seed)', 'adp.py kit check', 'review the diff, then the pull request']})
    return 1 if any(o['kit_check']['failing'] for o in out) else 0


def kit_tree(sub, names, a):
    """`kit check [NAME]` on the repository's kit (adp_kit.py): the folders kit/<name>/ with their registry-item.json."""
    import adp_kit
    site = os.path.abspath(opt(a, '--site', 'adp/site'))
    r = adp_kit.check(site, names[0] if names else None)
    emit(r)
    return adp_kit.check_exit(r)


def kit(a):
    pos = bare(a[1:]); sub = pos[0] if pos else ''
    if sub == 'check': return kit_tree(sub, pos[1:], a)
    if sub == 'consume' and len(pos) == 2: return kit_consume(pos[1], a)
    if sub not in ('list', 'show', 'describe') or (sub != 'list' and len(pos) < 2): sys.exit('usage: adp.py kit list [SITE] [--kind K] [--tag T] | show ID [SITE] | describe ID [SITE] | check [NAME] [--site DIR] | consume PACK [--site DIR]')
    src = pos[1] if sub == 'list' and len(pos) > 1 else pos[2] if sub != 'list' and len(pos) > 2 else None
    cat, warn = index_of(src, a) if src else (refuse_old(json.load(open(os.path.join(SITE, 'adp.json')))), None)      # no CATALOG: the catalog the plugin ships, as `new` reads it
    if warn: sys.stderr.write('warning: ' + warn + '\n')
    cat = dict(cat, entries=[rec(e) for e in cat['entries']])
    if sub == 'list':
        for e in cat['entries']:
            if opt(a, '--kind') and opt(a, '--kind') not in (e['name'].split('.')[0], e['type'].split(':')[-1]): continue
            if opt(a, '--tag') and opt(a, '--tag') not in e.get('keywords', []): continue
            emit({'id': e['name'], 'kind': e['name'].split('.')[0], 'title': e.get('title'), 'description': e.get('description'), 'keywords': e.get('keywords', [])})
        return 0
    e = next((x for x in cat['entries'] if x['name'] == pos[1]), None) or sys.exit(f'no entry {pos[1]} in the catalog')
    if sub == 'show':
        return emit({'id': e['name'], 'title': e.get('title'), 'description': e.get('description'), 'about': e['about'], 'keywords': e.get('keywords', []),
                     'files': [f['path'] for f in e['files']], 'registryDependencies': e.get('registryDependencies', []), 'exports': e.get('exports', [])})
    return emit({'id': e['name'], 'needs': e.get('dependencies', []), 'exports': e.get('exports', []),
                 'registryDependencies': e.get('registryDependencies', []), 'files': [f['path'] for f in e['files']]})


def content_of(d):
    p = os.path.join(d, 'content.js')
    if not os.path.isfile(p): return {}
    m = re.search(r'window\.ADP_CONTENT\s*=\s*(\{.*\})\s*;', open(p, encoding='utf-8').read(), re.S)
    return json.loads(m.group(1)) if m else {}


def schema_gate(docs, where, partial=False, seed=False):
    """The one write gate: every (collection, id, data) validated against its schema/<collection>.schema.json (adp_kit.validate) before a
    batch is printed or a seed written. A bad doc stops: `file · collection/id · field · rule`. partial (an update patch): `required` is not demanded."""
    import adp_kit
    for c, i, data in docs:
        for f in adp_kit.validate_doc(c, data, partial, i):
            sys.exit(f"adp: {where(c, i)} \u00b7 {c}/{i} \u00b7 {f['field']} \u00b7 expected {f['expected']}, found {f['found']}")


class Batch:
    """ArtifactData writes, each doc in its own file, printed as lists of at most 50 with `last` docs at the end."""
    def __init__(self, out, pins, dry=False):
        self.out, self.pins, self.w, self.unpinned, self.dry, self.bytes = out, pins, [], [], dry, 0
        if not dry: os.makedirs(out, exist_ok=True)

    def put(self, op, coll, doc, data=None, exists=False):
        e = {'op': op, 'collection': coll, 'doc_id': doc}
        if op != 'delete':
            p = os.path.join(self.out, f"{coll.replace('/', '~')}__{doc}.json")
            schema_gate([(coll, doc, data)], lambda c, i: p, partial=op == 'update')
            self.bytes += len(json.dumps(data, ensure_ascii=False, indent=1).encode())
            if not self.dry: json.dump(data, open(p, 'w'), ensure_ascii=False, indent=1); e['file_path'] = os.path.abspath(p)
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
    gen = {(c, i) for c, i, _ in w}
    over = {(c, i): data for c, i, data in (data or []) if c in PROTO and (c, i) in gen}
    docs = [(c, i, dict(data, **over.pop((c, i), {}))) for c, i, data in w]
    extra = [(c, i, data) for c, i, data in (data or []) if not (c in PROTO and (c, i) in gen)]
    docs = extra + docs[:-1] + [docs[-1]]
    ent = [{'doc': c + '/' + i} for c, i, _ in extra]      # changes/000001 names the page's own docs it wrote (Latest entries reads them)
    if ent: docs = [(c, i, dict(x, data=ent) if c == 'changes' and i == '000001' else x) for c, i, x in docs]
    return docs, empty


def read_seed(d):
    """The docs a DIR's seed.json and packs hold now: (index, [(collection, id, data)]); ({}, []) without one."""
    p = os.path.join(d, SEED)
    if not os.path.isfile(p): return {}, []
    f = json.load(open(p, encoding='utf-8')); docs = []
    for pk in f.get('packs') or []:
        q = os.path.join(d, pk)
        if os.path.isfile(q): docs += json.load(open(q, encoding='utf-8')).get('docs') or []
    return f, [(x['collection'], x['id'], x['data']) + ((True,) if x.get('given') else ()) for x in docs if isinstance(x, dict) and isinstance(x.get('data'), dict)]


def seed_given(d, data=None):
    """What the seed carries beyond the generated docs: the extra docs its packs hold now and the overrides its index keeps, with the
    --data docs of this run replacing them by id -> ([(collection, id, data)], index)."""
    old, had = read_seed(d)
    gen = {(c, i) for c, i, _ in seed_writes(d, 'adp', '1', '')[0]}      # what this DIR generates now
    extra = {(c, i): x[0] for c, i, *x in had if c not in PROTO or len(x) > 1}      # a packed doc marked `given` (the kit's parts) is kept; a generated one is remade
    over = {(x['collection'], x['id']): x['data'] for x in old.get('overrides') or []}
    for c, i, x in (data or []): (over if c in PROTO and (c, i) in gen else extra)[(c, i)] = x
    return [(c, i, x) for (c, i), x in extra.items()] + [(c, i, x) for (c, i), x in over.items()], old


def seed_file(d, by=None, version=None, at=None, data=None, summary=None, role=''):
    """Write DIR/seed.json (adp-seed/2, the index) and DIR/seed/pack-NNN.json (the docs, PACK bytes each, manifest/current the last doc):
    the page expands them when its db is empty and an editor opens it. --data docs given before are kept (replaced by id when given
    again); by and version given here win, None keeps the file's. Unchanged docs keep the files as they are (so `files --since` does
    not re-send them); returns True when (re)written."""
    given, old = seed_given(d, data); had = [x[:3] for x in read_seed(d)[1]]; gen = {(c, i) for c, i, _ in seed_writes(d, 'adp', '1', '')[0]}
    by, version = by or old.get('by', 'adp'), version or old.get('label', '1')     # given wins; a refresh (adp.py files) keeps what the file says
    role, summary = role or old.get('role', ''), summary or old.get('summary')
    strip = lambda docs: [(c, i, {k: v for k, v in x.items() if k not in ('at', 'last_seen')}) for c, i, x in docs]
    docs, empty = seed_docs(d, by, version, at or old.get('at') or now(), given, role, summary)
    if old.get('schema') == 'adp-seed/2' and strip(had) == strip(docs): return False
    at = at or now(); docs, empty = seed_docs(d, by, version, at, given, role, summary)
    packs, cur, size = [], [], 0; mark = {(c, i) for c, i, _ in given if c in PROTO and (c, i) not in gen}   # given docs in a generated collection: flagged so a refresh keeps them
    for c, i, x in docs:
        e = {'collection': c, 'id': i, 'data': x, **({'given': True} if (c, i) in mark else {})}
        n = len(json.dumps(e, ensure_ascii=False).encode())
        if cur and size + n > PACK: packs.append(cur); cur, size = [], 0
        cur.append(e); size += n
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
    stamp = hashlib.sha256(json.dumps(strip(docs), sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]   # changes exactly when the seeded docs do; the page re-seeds when it differs from status/seed.version
    idx = {'schema': 'adp-seed/2', 'version': stamp, 'label': version, 'by': by, 'at': at, 'docs': len(docs), 'collections': counts, 'packs': names,
           'overrides': [{'collection': c, 'id': i, 'data': x} for c, i, x in given if c in PROTO and (c, i) in gen]}
    if role: idx['role'] = role
    if summary: idx['summary'] = summary
    json.dump(idx, open(os.path.join(d, SEED), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return True


# The core switches: key -> (type, default, enum options). assets/adp.js is the source of truth; the two must agree.
CORE = {
    'edit.locked': ('bool', False, None), 'edit.until': ('datetime', '', None), 'edit.reason': ('text', '', None),
    'edit.require-hold': ('bool', False, None), 'parts.locked': ('list', [], None), 'comments.enabled': ('bool', True, None),
    'panel.changes': ('enum', 'everyone', ['everyone', 'editors', 'off']), 'panel.checks': ('enum', 'editors', ['everyone', 'editors', 'off']),
    'playground.enabled': ('bool', True, None), 'look.theme': ('text', '', None), 'look.mode': ('enum', 'auto', ['auto', 'light', 'dark']),
    'look.density': ('enum', 'comfortable', ['comfortable', 'compact']), 'links.site': ('url', '', None),
    'links.board': ('url', '', None), 'links.repo': ('url', '', None), 'log.data-changes': ('bool', True, None),
    'inbox.auto_accept': ('bool', True, None),
}
KEY = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:[-_][a-z0-9]+)*')


def read_doc(path):
    if not path: return {}
    d = json.load(open(path)); return d.get('data', d) if 'values' not in d and isinstance(d.get('data'), dict) else d


def cvalues(doc):
    return {**{k: v[1] for k, v in CORE.items()}, **(doc.get('values') or {})}


def check_value(key, v):
    if key not in CORE: return
    t, _, opts = CORE[key]
    ok = {'bool': isinstance(v, bool), 'text': isinstance(v, str), 'enum': v in (opts or []) if isinstance(v, str) else False,
          'list': isinstance(v, list) and all(isinstance(x, str) for x in v),
          'url': isinstance(v, str) and (v == '' or re.match(r'https?://\S+$', v) is not None),
          'datetime': isinstance(v, str) and (v == '' or re.match(r'\d{4}-\d\d-\d\d([T ]\d\d:\d\d(:\d\d)?(\.\d+)?(Z|[+-]\d\d:?\d\d)?)?$', v) is not None)}[t]
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
        h = json.load(open(opt(a, '--holds')))
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
        if key in CORE and val == CORE[key][1]: vals.pop(key, None); chg.pop(key, None)
        else: vals[key] = val; chg[key] = {'by': by, 'at': at}
        pins = json.load(open(opt(a, '--pins'))) if opt(a, '--pins') else {}
        b = Batch(opt(a, '--out', 'config.adp'), pins)
        b.put('set', 'config', 'current', {'schema': 'adp-config/1', 'at': at, 'by': by, 'values': vals, 'changed': chg}, exists=True)
        if cvalues(doc)['log.data-changes'] is not False:
            b.put('set', 'changes', 'd-' + str(int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)),
                  {'version': '', 'at': at, 'by': by, 'summary': f'Set {key} = {json.dumps(val)}', 'parts': [], 'threads': [],
                   'data': [{'doc': 'config/current'}]})
        return b.emit((), {'key': key, 'value': val, **({} if key in CORE else {'unknown': True})})
    if len(bare(a[1:])) < 1: sys.exit('usage: adp.py config DIR [--doc C.json]  |  adp.py config set KEY VALUE ...')
    v = cvalues(read_doc(opt(a, '--doc')))
    return emit({'defaults': {k: x[1] for k, x in CORE.items()}, 'values': v, 'locked': v['edit.locked'] is True,
                 'locked_parts': v['parts.locked'], 'links': {k[6:]: x for k, x in v.items() if k.startswith('links.')}})


def hold(a):
    pos = bare(a[1:])
    if len(pos) < 2: sys.exit('usage: adp.py hold DIR ID ... --by NAME [--hours H] [--pins P.json]')
    by, hrs = opt(a, '--by', 'agent'), float(opt(a, '--hours', '2'))
    guard(a, pos[1:])
    until = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=min(hrs, 2))).strftime('%Y-%m-%dT%H:%M:%SZ')
    pins = json.load(open(opt(a, '--pins'))) if opt(a, '--pins') else {}
    b = Batch(opt(a, '--out', pos[0].rstrip('/') + '.adp'), pins)
    for p in pos[1:]: b.put('update', 'parts', p, {'holder': by, 'hold_until': until})
    b.put('update' if f'agents/{agent_id(by)}' in pins else 'set', 'agents', agent_id(by), {'last_seen': now(), 'holds': pos[1:]})
    return b.emit(())


def record(a):
    pos = bare(a[1:])
    if len(pos) != 2 or not opt(a, '--seq') or not opt(a, '--summary'):
        sys.exit('usage: adp.py record OLD.json DIR --seq N --by NAME --summary S [--version V] [--threads T,..] [--pins P.json]')
    o = json.load(open(pos[0])); o = manifest_of(o)      # a saved doc may wrap its fields in data
    d = pos[1]; n = manifest_dir(d)
    by, at, version = opt(a, '--by', 'agent'), now(), opt(a, '--version', '')
    seq, summary = opt(a, '--seq').zfill(6), opt(a, '--summary')
    threads = [t for t in (opt(a, '--threads', '') or '').split(',') if t]
    pins = json.load(open(opt(a, '--pins'))) if opt(a, '--pins') else {}
    real = lambda m: {k: v for k, v in m.get('parts', {}).items() if not k.startswith(REST)}
    op, np_, moved, cont = real(o), real(n), [], content_of(d)
    own_to = own_hashes(d)      # each moved part also logs the hash of its own text (children excluded): [from, to], from unknown here
    ch = {p for p in np_ if p not in op or op[p] != np_[p]} | {p for p in op if p not in np_}
    par = {**o.get('parents', {}), **n.get('parents', {})}
    guard(a, ch, {p for p in ch if p in op and not any(par.get(c) == p for c in ch)}, set(op))
    b = Batch(opt(a, '--out', d.rstrip('/') + '.adp'), pins)
    for p, h in np_.items():
        if p not in op:
            b.put('set', 'parts', p, {'title': (cont.get(p) or {}).get('title', p), 'parent': n['parents'].get(p, ''), 'hash': h, 'version': version,
                                      'at': at, 'by': by, 'summary': 'added: ' + summary, 'holder': '', 'hold_until': '', 'file': n['part_file'].get(p, '')})
            moved.append({'id': p, 'from': '', 'to': h, 'own': [None, own_to.get(p)]})
        elif op[p] != h:
            b.put('update', 'parts', p, {'hash': h, 'version': version, 'at': at, 'by': by, 'summary': summary, 'holder': '', 'hold_until': '',
                                         'file': n['part_file'].get(p, '')})
            moved.append({'id': p, 'from': op[p], 'to': h, 'own': [None, own_to.get(p)]})
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
    raw = json.load(open(path))
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
    return 'done' if d.get('state') == 'done' or d.get('status') == 'done' else 'working' if d.get('state') == 'working' else 'ack' if d.get('state') in ('ack', 'seen') else 'queue'


READS = {'part': 'the part {id} in the files', 'record': 'records/{id}', 'entry': 'entries/{id}', 'file': 'files/{id}', 'change': 'changes with version {id}', 'page': 'the whole page', 'session': 'presence/{id}'}


def reads(sc):
    """What an agent opens for a request's scope (references/requests.md); an old scope with no kind is a part."""
    k = sc.get('kind') or ('part' if sc.get('id') else 'page')
    return READS.get(k, '').format(id=sc.get('id', ''))


def other_session(d, by):
    """A ping scoped to one session (scope {kind: session, id}) belongs to that session only; with no --by every ping is shown."""
    sc = d.get('scope') or {}
    return bool(by) and d.get('lane') == 'ping' and sc.get('kind') == 'session' and bool(sc.get('id')) and sc.get('id') != by


def requests_cmd(a):
    use = 'usage: adp.py requests DUMP.json [--ack RID --by NAME | --progress RID --text T | --done RID --response FILE --changed a,b --version V] [--out DIR]'
    pos = bare(a[1:])
    if len(pos) != 1: sys.exit(use)
    docs, by, at = req_dump(pos[0]), opt(a, '--by', 'agent'), now()
    acts = [x for x in ('--ack', '--progress', '--done') if x in a]
    if not acts:
        rows = [{'id': k, 'lane': d.get('lane', ''), 'state': rstate(d), 'scope': d.get('scope') or {}, 'reads': reads(d.get('scope') or {}), 'project': d.get('project', ''),
                 'text': d.get('text', ''), 'quote': d.get('quote', ''), 'by': d.get('by', ''), 'at': d.get('at', ''),
                 'last_progress': ((d.get('progress') or [{}])[-1] or {}).get('text', ''), 'reopened': bool(d.get('response') or d.get('done_at') or d.get('doneAt'))}
                for k, (d, _) in docs.items() if d.get('status') != 'done' and not other_session(d, opt(a, '--by'))]
        rows.sort(key=lambda r: r['at'])
        return emit({'open': rows, 'count': len(rows), 'trailer': '· adp request {<rid>} · lane <lane> · scope <kind>:<id>|page'})
    if len(acts) > 1: sys.exit('one of --ack, --progress, --done')
    act = acts[0]; rid = opt(a, act)
    if not rid or rid.startswith('--'): sys.exit(use)
    if rid not in docs: sys.exit(f'{rid}: not in {pos[0]}')
    d, ver = docs[rid]
    if other_session(d, opt(a, '--by')): sys.exit(f"{rid}: a ping for session {d['scope']['id']}, not {by}")
    pins = json.load(open(opt(a, '--pins'))) if opt(a, '--pins') else {}
    if ver is not None: pins.setdefault(f'requests/{rid}', ver)
    b = Batch(opt(a, '--out', 'requests.adp'), pins)
    doing = f"{rid} ({d.get('lane', '')})"
    if act == '--ack':
        patch = {'state': 'ack', 'ack_by': by, 'ack_at': at}
    elif act == '--progress':
        if not opt(a, '--text'): sys.exit('--progress needs --text T')
        patch = {'state': 'working', 'progress': list(d.get('progress') or []) + [{'at': at, 'text': opt(a, '--text')}]}
    else:
        if not opt(a, '--response'): sys.exit('--done needs --response FILE (Markdown)')
        text = open(opt(a, '--response'), encoding='utf-8').read().strip()
        changed = [x for x in (opt(a, '--changed', '') or '').split(',') if x]
        patch = {'state': 'done', 'status': 'done', 'done_at': at, 'changed': changed, 'version': opt(a, '--version', '')}
        if opt(a, '--turns'):                         # a reply reopened it: the answer is the next turn
            n = max([int(k) for k in req_dump(opt(a, '--turns')) if k.isdigit()] or [0]) + 1
            b.put('set', f'requests/{rid}/turns', f'{n:04d}', {'by': 'claude', 'at': at, 'text': text})
        else: patch['response'] = text
        doing = ''
    b.put('update', 'requests', rid, patch)
    recs = [x for x in patch.get('changed', []) if x.startswith('records/')]
    if recs:      # records an agent changed: one data change, named by their project (the request's)
        b.put('set', 'changes', 'd-' + str(int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)),
              {'version': '', 'at': at, 'by': by, 'summary': f'Request {rid} done', 'parts': [], 'threads': [], 'data': [{'doc': x} for x in recs],
               **({'project': d['project']} if d.get('project') else {})})
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


def log_path():
    """log.jsonl in the nearest .adp/ from cwd upward, else ADP_HOME."""
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
    n = int(opt(a, '-n', 20)); p = log_path()
    if os.path.isfile(p): sys.stdout.write(''.join(open(p).readlines()[-n:] if n > 0 else []))
    return 0


def init_cmd(a):
    d = os.path.abspath((bare(a[1:]) or ['.'])[0]); p = os.path.join(d, '.adp', 'config.json')
    if os.path.isfile(p): print(f'{p} exists'); return 0
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump({'schema': 'adp-project/1', 'name': os.path.basename(d), 'created': now()}, open(p, 'w'), indent=1)
    print(f'created {p}'); return 0


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


def setup_cmd(a):
    scope = opt(a, '--scope', 'user'); dry, yes = '--dry-run' in a, '--yes' in a
    if scope not in ('user', 'project', 'local'): sys.exit('setup: --scope user|project|local')
    cwd, home = os.getcwd(), os.path.expanduser('~')
    refs = os.path.join(HERE, 'refs'); names = sorted(n for n in os.listdir(refs) if os.path.isdir(os.path.join(refs, n))) if os.path.isdir(refs) else []
    skills = os.path.join(home if scope == 'user' else cwd, '.claude', 'skills')
    cfg = os.path.join(ADP_HOME if scope == 'user' else os.path.join(cwd, '.adp'), 'config.json')
    ptr = {'user': os.path.join(home, '.claude', 'CLAUDE.md'), 'project': os.path.join(cwd, 'CLAUDE.md'), 'local': os.path.join(cwd, 'CLAUDE.local.md')}[scope]
    gi = os.path.join(cwd, '.gitignore') if scope != 'user' else None
    block = '\n'.join([BEGIN, 'For artifacts, ADP or the catalog, load the `adp` skill and run `python3 -I ' + os.path.abspath(__file__) + ' ...` for its commands.', END])
    print(f'setup {scope}{" (dry run)" if dry else ""}: {len(names)} skills ({", ".join(names)}) -> {skills}; skill_root {HERE}')
    print(f'config: {cfg}'); print(f'pointer {ptr}' + ('' if yes and not dry else ' (add with --yes)') + ':'); print(block)
    if gi: print(f'gitignore {gi}: .adp/log.jsonl' + ('' if yes and not dry else ' (add with --yes)'))
    if dry: return 0
    for n in names:
        t = os.path.join(skills, n); shutil.rmtree(t, ignore_errors=True)
        shutil.copytree(os.path.join(refs, n), t, ignore=shutil.ignore_patterns('__pycache__'))
    os.makedirs(os.path.dirname(cfg), exist_ok=True)
    c = json.load(open(cfg)) if os.path.isfile(cfg) else {}
    c.update({'schema': 'adp-setup/1', 'scope': scope, 'skill_root': HERE, 'skills': names,
              'version': {n: v for n in names if (v := ref_version(os.path.join(refs, n, 'SKILL.md')))}, 'at': now()})
    json.dump(c, open(cfg, 'w'), indent=1)
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
    cmds = {'export': adp_loop.export, 'classify': adp_loop.classify_cmd, 'propose': adp_loop.propose, 'ack': adp_loop.ack, 'gate': adp_loop.gate, 'new': new, 'take': take, 'pack': pack_cmd, 'unpack': unpack_cmd, 'import': import_cmd, 'hold': hold, 'record': record, 'config': config_cmd, 'requests': requests_cmd, 'pins': pins, 'site': site_cmd, 'suggest': suggest, 'kit': kit, 'apply': adp_loop.apply_cmd, 'setup': setup_cmd, 'init': init_cmd, 'log': log_cmd}
    if a and a[0] in cmds: return cmds[a[0]](a)
    if len(a) >= 2 and a[0] == 'files':
        since = opt(a, '--since'); n = int(opt(a, '--batch', LIMIT)); where = opt(a, '--out', a[1].rstrip('/') + '.adp')
        if is_live(a[1]) or is_packed(a[1]): sys.exit(live_line(a[1]) if is_live(a[1]) else f'files is the catalog site\'s own publish; {a[1]} is a page: adp.py pack {a[1]}')      # a files publish over a page replaces its loader (BUG-001)
        fresh = os.path.isfile(os.path.join(a[1], SEED)) and seed_file(a[1])    # edits after `new` change the hashes the seed carries
        if not since: return emit(batched(publish_args(a[1]), a[1], n, where))
        o = json.load(open(since)); o = manifest_of(o)
        nf = manifest_dir(a[1])['files']; of = o.get('files', {})
        changed = {p for p, h in nf.items() if of.get(p) != h and p != 'index.html'} | ({SEED, *read_seed(a[1])[0].get('packs', [])} if fresh else set())
        out = publish_args(a[1], changed); out['files'].update({p: None for p in of if p not in nf})
        out['page_changed'] = of.get('index.html') != nf.get('index.html')
        if not out['page_changed']: out['note'] = 'index.html is unchanged: publish with url and the changed files, still passing file_path (the tool requires it; the page is re-sent as is)'
        return emit(batched(out, a[1], n, where))
    if a and a[0] in ('check', 'manifest', 'diff-pages') and any(not os.path.isdir(x) for x in a[1:3]):
        sys.exit('adp/1 single-file pages are gone: adopt it into adp/2 (references/adopt.md)' if any(os.path.isfile(x) for x in a[1:3])
                 else f'usage: adp.py {a[0]} ' + ('OLD_DIR NEW_DIR' if a[0] == 'diff-pages' else 'DIR'))
    if len(a) >= 2 and a[0] == 'check':
        marked = load(a[1])[1]
        allt, bad, ids, rest, size = '\n'.join(marked.values()), [], {}, 0, 0
        for f, text in marked.items():
            parts, b = parse(text); pre = f'{f}: ' if len(marked) > 1 else ''
            bad += [pre + x for x in b]
            bad += [f'part {p} in {ids[p]} and {f}' for p in parts if p in ids]
            ids.update({p: f for p in parts})
            if not b: rest += len(norm(own(text, parts, ''))); size += len(norm(text))
        bad += [f'part {p}: no data-part="{p}" in the page' for p in ids
                if f'data-part="{p}"' not in allt and not p.startswith(('page.style', 'page.script'))]
        named = set(re.findall(r'data-part="(' + ID + r')"', '\n'.join(t for f, t in marked.items() if not f.startswith('kit/'))))      # a kit entry names parts of the page it is mounted in; only the page's own files must mark theirs
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
        print(json.dumps(manifest_dir(a[1]), indent=1)); return 0
    if len(a) == 3 and a[0] == 'diff':
        print(json.dumps(diff(*(json.load(open(x)) for x in a[1:])), indent=1)); return 0
    if len(a) >= 3 and a[0] == 'diff-pages':          # the diff plus what was added/removed in each deepest part
        def side(x):                                    # -> manifest, {part: own text}
            m, (_, marked) = manifest_dir(x), load(x)
            pa = {f: parse(t)[0] for f, t in marked.items()}
            return m, {**{p: own(marked[f], pa[f], p) for p, f in m['part_file'].items() if not p.startswith(REST)},
                       **{f'{REST}:{f}': own(t, pa[f], REST) for f, t in marked.items()}}
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
        code = main(argv)
        code = 0 if code is None else code
    except SystemExit as e:
        code = 0 if e.code is None else e.code if isinstance(e.code, int) else 1
        raise
    finally:
        log_line(argv, code, int((time.monotonic() - t0) * 1000))
    sys.exit(code)
