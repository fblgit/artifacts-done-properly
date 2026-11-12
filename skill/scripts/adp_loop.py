"""The loop (0.3.0): export, classify, propose, ack, gate. docs/architecture.md "The loop" holds the contracts (1, 2, 4, 7).
Imported by adp.py, which sets A to itself, so the helpers (opt, bare, emit, H, manifest_dir, Batch, ...) are reused, not copied."""
import base64, datetime, hashlib, json, os, random, re, shutil, subprocess, sys, time

A = None      # the adp module, set by adp.py at import
CLASSES = ('new', 'ours', 'theirs', 'applied', 'held', 'retired')
CANON = ('manifest', 'parts', 'content', 'changes', 'config', 'requests', 'presence', 'agents', 'decisions', 'incoming', 'files')      # files: a settled page's own files (the loader's records)


def classify3(b, l, i):
    """contract 4: one id -> (class or None, needs a retire). Absent is None."""
    if b is None:
        if l is None: return 'new' if i is not None else None
        if i is None: return 'theirs'
        return 'applied' if i == l else 'held'
    if i is None: return 'applied' if l is None else 'retired'
    if l == b: return 'ours' if i != b else None
    if i == b: return 'theirs'
    return 'applied' if i == l else 'held'


def touches(x, y, parents, requires):
    if parents.get(x) == y or parents.get(y) == x: return True
    comp = lambda f, p: any(f in fs and (p == c or p.startswith(c + '.')) for c, fs in requires.items())
    return comp(x, y) or comp(y, x)


def classify(base, live, inc):
    """Three manifests {parts: {id: hash}, files: {path: sha}} (+ optional parents, requires {component: [paths]},
    retired {id: reason} on the incoming one) -> {new, ours, theirs, applied, held: [{id, base, live, incoming}], retired}."""
    out = {k: [] for k in CLASSES}; vals = {}
    retire = inc.get('retired') or {}
    retire = {k: '' for k in retire} if isinstance(retire, list) else retire
    walk = descend(base, live, inc)
    for key in ('parts', 'files', 'items'):
        bs, ls, js = (m.get(key) or {} for m in (base, live, inc))
        for x in sorted(set(bs) | set(ls) | set(js)):
            if key == 'items':
                if not walk['open'](x): continue
                x, b, l, i = 'entries/' + x, bs.get(x), ls.get(x), js.get(x)
            else: b, l, i = bs.get(x), ls.get(x), js.get(x)
            vals[x] = (b, l, i)
            c = classify3(b, l, i)
            if c == 'retired' and x not in retire: c = 'held'
            if c: out[c].append(x)
    parents = {**(base.get('parents') or {}), **(live.get('parents') or {}), **(inc.get('parents') or {})}
    requires = {**(base.get('requires') or {}), **(live.get('requires') or {}), **(inc.get('requires') or {})}
    moved = True
    while moved:      # a merge of x is held while anything it touches is held
        moved = False
        for c in ('new', 'ours', 'retired'):
            for x in list(out[c]):
                if any(touches(x, y, parents, requires) for y in out['held']):
                    out[c].remove(x); out['held'].append(x); moved = True
    out['held'] = [{'id': x, 'base': vals[x][0], 'live': vals[x][1], 'incoming': vals[x][2]} for x in sorted(out['held'])]
    if walk['tiered']: out['descent'] = walk['report']
    return out


def descend(base, live, inc):
    """ADR-001 step 4: manifests that carry the Merkle tiers (root, categories {name: hash}, items {name: hash}, item_category {name: category})
    are compared root first: equal roots on all three sides walk nothing; otherwise only the categories whose hash differs are opened and
    only their items compared. -> {tiered, open(name) -> bool, report}. Without tiers every item is compared, as before."""
    ms = (base, live, inc)
    if not any(m.get('items') for m in ms): return {'tiered': False, 'open': lambda n: True, 'report': {}}
    roots = [m.get('root') for m in ms]
    same_root = all(roots) and len(set(roots)) == 1
    cats = [m.get('categories') or {} for m in ms]
    opened = sorted({c for c in set().union(*cats) if len({x.get(c) for x in cats}) > 1}) if not same_root else []
    cat_of = {}
    for m in ms: cat_of.update(m.get('item_category') or {})
    can_skip = same_root or bool(cat_of) and all(m.get('categories') for m in ms)
    def is_open(n):
        if same_root: return False
        return not can_skip or cat_of.get(n) is None or cat_of[n] in opened
    names = set().union(*[set(m.get('items') or {}) for m in ms])
    return {'tiered': True, 'open': is_open,
            'report': {'root_equal': same_root, 'categories_opened': opened, 'items_compared': sum(1 for n in names if is_open(n)), 'items_total': len(names)}}


def classify_cmd(a):
    pos = A.bare(a[1:])
    if len(pos) != 3: sys.exit('usage: adp.py classify BASE.json LIVE.json INCOMING.json')
    ms = []
    for p in pos:
        m = json.load(open(p)); ms.append(A.manifest_of(m))
    return A.emit(classify(*ms))


# ---- apply: RFC 7396 merge patches on registry records (ADR-001 step 4) ----

def patch_diff(base, target):
    """RFC 7396: the merge patch that turns base into target. Objects recurse; arrays and scalars are replaced whole; a removed key is null."""
    if not isinstance(base, dict) or not isinstance(target, dict): return target
    out = {k: patch_diff(base[k], v) for k, v in target.items() if k not in base or base[k] != v}
    out.update({k: None for k in base if k not in target})
    return out


def patch_apply(doc, patch):
    """RFC 7396 MergePatch(doc, patch); the doc is not changed."""
    if not isinstance(patch, dict): return patch
    out = dict(doc) if isinstance(doc, dict) else {}
    for k, v in patch.items():
        if v is None: out.pop(k, None)
        else: out[k] = patch_apply(out.get(k), v)
    return out


def three_way(base, repo, artifact, path=''):
    """-> (merged, conflicts [{path, base, repo, artifact}]). A field changed on one side only takes that side; changed on both to
    different values is a conflict, kept at the repo value, never overwritten. Objects descend; arrays and scalars are atomic."""
    if repo == artifact: return repo, []
    if artifact == base: return repo, []
    if repo == base: return artifact, []
    if isinstance(base, dict) and isinstance(repo, dict) and isinstance(artifact, dict):
        merged, conflicts = {}, []
        for k in sorted(set(base) | set(repo) | set(artifact)):
            m, c = three_way(base.get(k), repo.get(k), artifact.get(k), f'{path}/{k}')
            conflicts += c
            if m is not None: merged[k] = m
        return merged, conflicts
    return repo, [{'path': path or '/', 'base': base, 'repo': repo, 'artifact': artifact}]


def apply_cmd(a):
    """adp.py apply NAME --base B.json --repo R.json --artifact A.json [--write]: the artifact's edit of a record as a merge patch on the
    repo's. Prints the patch (artifact against base), the conflicts and the merged record. With --write and no conflict the merged record
    replaces R.json (a working-tree diff). Never writes the artifact, never commits."""
    pos = A.bare(a[1:]); fb, fr, fa = A.opt(a, '--base'), A.opt(a, '--repo'), A.opt(a, '--artifact')
    if len(pos) != 1 or not (fb and fr and fa): sys.exit('usage: adp.py apply NAME --base B.json --repo R.json --artifact A.json [--write]')
    base, repo, art = (json.load(open(f, encoding='utf-8')) for f in (fb, fr, fa))
    merged, conflicts = three_way(base, repo, art)
    rep = {'name': pos[0], 'patch': patch_diff(base, art), 'conflicts': conflicts, 'merged': merged if not conflicts else None,
           'written': False}
    if conflicts: rep['held'] = 'a field changed on both sides is held for the owner, not overwritten'
    elif '--write' in a and merged != repo:
        json.dump(merged, open(fr, 'w', encoding='utf-8'), ensure_ascii=False, indent=2, sort_keys=False); open(fr, 'a').write('\n'); rep['written'] = True
    A.emit(rep)
    return 2 if conflicts else 0


# ---- state, the registry and the nested repository (contracts 1 and 2) ----

adir = lambda d: d.rstrip('/') + '.adp'
VOLATILE = ('at', 'last_seen', 'hold_until', 'exported_at', 'version')
PART_KEYS = ('hash',)     # the one parts/<id> field the tree carries: the record's other fields are derivable and would only make the merge argue


def reg_path():
    return os.path.join(A.ADP_HOME, 'artifacts.json')


def registry():
    p = reg_path()
    return json.load(open(p)) if os.path.isfile(p) else {}


def register(url, d, name):
    r = registry(); r[url.rstrip('/')] = {'dir': os.path.abspath(d), 'name': name}
    os.makedirs(A.ADP_HOME, exist_ok=True); json.dump(r, open(reg_path(), 'w'), indent=1, sort_keys=True)


def load_state(d):
    p = os.path.join(adir(d), 'state.json')
    return json.load(open(p)) if os.path.isfile(p) else None


def save_state(d, s):
    json.dump(s, open(os.path.join(adir(d), 'state.json'), 'w'), indent=1, sort_keys=True)


def git(repo, *args, check=True):
    r = subprocess.run(['git', '-C', repo, '-c', 'user.name=adp', '-c', 'user.email=adp', '-c', 'commit.gpgsign=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', *args],   # no detached gc: it repacks and rewrites info/ after the caller is done
                       capture_output=True, text=True)
    if check and r.returncode: sys.exit(f'git {" ".join(args)}: {r.stderr.strip() or r.stdout.strip()}')
    return r


def repo_init(d):
    repo = os.path.join(adir(d), 'repo')
    if not os.path.isdir(os.path.join(repo, '.git')):
        os.makedirs(repo, exist_ok=True)
        git(repo, 'init', '-q', '-b', 'base'); git(repo, 'commit', '-q', '--allow-empty', '-m', 'adp: root')
        git(repo, 'branch', 'live'); git(repo, 'branch', 'work')
    return repo


def commit_tree(repo, branch, tree, msg, db_from=None):
    """Check out branch, replace its tree with {relpath: bytes}, commit. db_from names a branch whose db/ records are taken first
    (the work side never edits records: they come from live, and the tree overwrites only the parts docs it regenerates)."""
    git(repo, 'checkout', '-q', '-f', branch)
    for p in filter(None, git(repo, 'ls-files', '-z').stdout.split('\0')): os.remove(os.path.join(repo, p))      # -z: raw names, never git's quoted form
    if db_from: git(repo, 'checkout', db_from, '--', 'db', check=False)
    for p, b in tree.items():
        f = os.path.join(repo, p); os.makedirs(os.path.dirname(f), exist_ok=True); open(f, 'wb').write(b)
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '--allow-empty', '-m', msg)
    return git(repo, 'rev-parse', 'HEAD').stdout.strip()


def merge3(repo, base, ours, theirs):
    """A three-way merge with the base the loop names (the last import or apply), not the one git would guess: -> (tree, conflict lines)."""
    r = git(repo, 'merge-tree', '--write-tree', f'--merge-base={base}', ours, theirs, check=False)
    lines = r.stdout.splitlines()
    return (lines[0] if lines else ''), ([] if r.returncode == 0 else [l for l in lines[1:] if l.startswith('CONFLICT')] or [r.stderr.strip() or 'merge failed'])


def jb(o):
    return (json.dumps(o, ensure_ascii=False, indent=1, sort_keys=True) + '\n').encode()


def strip(coll, data):
    if coll == 'parts': return {k: data.get(k, '') for k in PART_KEYS}
    return {k: v for k, v in data.items() if k not in VOLATILE}


def dump_docs(path):
    """D.json: {collection: [docs as ArtifactData returns them]} or {collection: {id: doc}} -> {coll: {id: (data, version)}}"""
    raw = json.load(open(path)); out = {}
    for coll, docs in raw.items():
        items = docs.items() if isinstance(docs, dict) else [(x.get('id') or x.get('doc_id') or '', x) for x in docs if isinstance(x, dict)]
        for k, x in items:
            k = str(k).split('/')[-1]
            if isinstance(x.get('data'), dict): out.setdefault(coll, {})[k] = (x['data'], x.get('version'))
            elif isinstance(docs, dict): out.setdefault(coll, {})[k] = (x, None)      # {id: data}, as unpack writes docs.json: the data whole (manifest/current carries its own `version`)
            else: out.setdefault(coll, {})[k] = ({f: v for f, v in x.items() if f not in ('id', 'doc_id', 'version')}, x.get('version'))
    return out


def listing(path):
    raw = json.load(open(path)); raw = raw.get('files', raw) if isinstance(raw, dict) else raw
    return [{'path': x['path'], 'sha256': x.get('sha256') or x.get('sha') or '', 'bytes': x.get('bytes') or x.get('size') or 0,
             'ref': {'artifact': x['artifact'], 'ver': x.get('ver', '')} if x.get('artifact') else None} for x in raw
            if not A.is_seed(x['path'])]   # the seed (seed.json, seed/) is read once by an empty db, never a part of the page: not in the manifest, not in the loop


SKELETON = re.compile(rb'^<!doctype html><html><head><meta charset=utf8>.*?</style></head><body>(.*)</body></html>\s*$', re.S | re.I)


def unwrap(b):
    """the page as published carries the Artifact tool's document skeleton around it; the folder holds it bare"""
    m = SKELETON.match(b)
    if not m: return b
    b = m.group(1)                                         # the wrapper puts one newline after <body> and one before </body>
    if b.startswith(b'\n'): b = b[1:]
    if b.endswith(b'\n'): b = b[:-1]
    return b


def fragments(d):
    """{part id: html}: DIR/content/<id>.html when present, else split out of content.js"""
    cd = os.path.join(d, 'content')
    if os.path.isdir(cd) and any(n.endswith('.html') for n in os.listdir(cd)):
        return {n[:-5]: open(os.path.join(cd, n), encoding='utf-8').read() for n in sorted(os.listdir(cd)) if n.endswith('.html')}
    return {k: v.get('html', '') for k, v in A.content_of(d).items()}


def work_tree(d, refs):
    m = A.manifest_dir(d); tree = {}
    for p in A.tree(d):
        if p.startswith('.') or '/.' in p or p in refs or A.is_seed(p) or p.startswith('content/') and p.endswith('.html'): continue
        tree['files/' + p] = open(os.path.join(d, p), 'rb').read()
    for k, h in fragments(d).items(): tree[f'content/{k}.html'] = h.encode()
    for p in m['parts']:
        if not p.startswith(A.REST): tree[f'db/parts/{p}.json'] = jb({'hash': m['parts'][p]})
    return m, tree


def cmanifest(m, files=None):
    """a manifest reduced to what classify reads"""
    return {'parts': dict(m.get('parts') or {}), 'files': {k: v[:12] for k, v in (files if files is not None else m.get('files') or {}).items()},
            'parents': dict(m.get('parents') or {}),
            **{k: m[k] for k in ('root', 'categories', 'items', 'item_category') if m.get(k)}}


def work_manifest(d, refs):
    m = A.manifest_dir(d)
    return {**cmanifest(m), 'files': {k: v for k, v in m['files'].items() if k not in refs and not k.startswith('content/')}}


# ---- export ----

def from_pack(pk, ad, inc):
    """an unpacked export (adp.py unpack OUT) stands in for the live artifact: its files are the listing, its docs.json the database.
    A bundle that left the manifest out gets it rebuilt from the files, which is where it comes from anyway."""
    shutil.rmtree(os.path.join(inc, 'files'), ignore_errors=True); items = []
    for root, _, fs in os.walk(pk):
        for f in sorted(fs):
            rel = os.path.relpath(os.path.join(root, f), pk).replace(os.sep, '/')
            if rel in ('docs.json', 'bundle.json') or A.is_seed(rel): continue
            b = open(os.path.join(root, f), 'rb').read(); dst = os.path.join(inc, 'files', rel); os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, 'wb').write(b); items.append({'path': rel, 'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b)})
    dj = os.path.join(pk, 'docs.json'); docs = json.load(open(dj, encoding='utf-8')) if os.path.isfile(dj) else {}
    try: bj = json.load(open(os.path.join(pk, 'bundle.json'), encoding='utf-8'))
    except (OSError, ValueError): bj = {}
    page = bj.get('page', '')
    if page in ('records', 'pack'):      # the bundle came from a settled (or settling) page: its files stand as the `files` records, as the loader serves them
        texts = {x['path']: open(os.path.join(inc, 'files', x['path']), encoding='utf-8', newline='').read() for x in items}
        docs['files'] = {re.sub(r'[^A-Za-z0-9_.\-]', lambda m: '~%x~' % ord(m.group()), p): {'path': p, 'c': 0, 'n': 1, 'text': t, 'sha': hashlib.sha256(t.encode('utf-8')).hexdigest()} for p, t in texts.items()}
        if page == 'pack':      # still serving pack.json: export says page: pack, and propose waits until an editor's open settles it
            b = json.dumps(texts).encode('utf-8'); open(os.path.join(inc, 'files', 'pack.json'), 'wb').write(b)
            items.append({'path': 'pack.json', 'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b)})
    if 'current' not in (docs.get('manifest') or {}):
        tmp = os.path.join(ad, 'pack-tree'); shutil.rmtree(tmp, ignore_errors=True); shutil.copytree(os.path.join(inc, 'files'), tmp)
        try: docs['manifest'] = {'current': {k: v for k, v in A.manifest_dir(tmp).items() if k != 'files'}}
        finally: shutil.rmtree(tmp, ignore_errors=True)
    fl, dd = os.path.join(ad, 'listing.json'), os.path.join(ad, 'docs.json')
    json.dump(items, open(fl, 'w'), indent=1); json.dump(docs, open(dd, 'w'), ensure_ascii=False, indent=1)
    return fl, dd, {'at': bj.get('at', ''), 'dir': os.path.abspath(pk)}      # the next export asks for a delta since this bundle, over this unpack


RESERVED = ('status', 'files', 'manifest', 'parts', 'content', 'changes', 'incoming', 'agents', 'presence', 'requests', 'conversations',
            'config', 'decisions', 'checks', 'kit')      # protocol state: never a proposed doc (a forged status/files could blank the page)
SEG = re.compile(r'[A-Za-z0-9_.~-]+')


def declared_collections(d, dd):
    """the page's own collections: DIR's seed index declares them, and the unpacked bundle's docs.json
    holds them (every collection in it that is neither protocol state nor not-a-name). The first export of a board reads its board."""
    out = set()
    try: out |= set(A.read_seed(d)[0].get('collections') or {})
    except (OSError, ValueError): pass
    if os.path.isfile(dd):
        try: out |= set(json.load(open(dd, encoding='utf-8')))
        except (OSError, ValueError): pass
    return sorted(c for c in out if c not in RESERVED and c not in CANON and c != 'codemap' and SEG.fullmatch(c))


def doc_hash(data):
    """the pin a proposed doc carries: sha256 of its canon (adp_kit.canon = ADP.merkle.canon), so the page compares it with what it holds"""
    import adp_kit
    return hashlib.sha256(adp_kit.canon(data).encode('utf-8')).hexdigest()


def page_files(d, files, docs, inc):
    """A packed or settled page: its url lists only the loader (and pack.json until it settles). The page itself is pack.json, else the
    `files` records (the loader writes {path, c, n, text, sha}, chunked); both are expanded into incoming/files and stand in for the
    listing, as the loader does in the browser: the pack wins while it is served (a delta pack, `$base: records`, lies over the
    records). A loose page (no pack, no records) is returned as is.
    The kit the pack carries beside the page (build_pack adds every catalog file DIR lacks) is not the page: a file DIR lacks whose text is
    the plugin's own copy or DIR/kit/all.json's is left out of the listing, so it is neither `theirs` nor held."""
    names = {f['path'] for f in files if not f['ref']}
    pk = os.path.join(inc, 'files', 'pack.json'); P, src, R = None, None, None
    if 'pack.json' in names and os.path.isfile(pk):
        raw = open(pk, 'rb').read(); P, src = json.loads(raw), 'pack'
    if docs.get('files') and (P is None or P.get('$base') == 'records'):
        by = {}
        for _, (x, _) in docs['files'].items():
            if isinstance(x, dict) and 'path' in x: by.setdefault(x['path'], []).append(x)
        R = {}
        for path, xs in by.items():
            xs.sort(key=lambda x: x.get('c', 0)); n = xs[0].get('n', 1)
            if len(xs) != n: sys.exit(f'export: the files records for {path} hold {len(xs)} of {n} chunks')
            t = ''.join(x.get('text', '') for x in xs); sha = next((x['sha'] for x in xs if x.get('sha')), '')
            if sha and hashlib.sha256(t.encode('utf-8')).hexdigest() != sha: sys.exit(f'export: the files record for {path} does not match its sha256')
            R[path] = t
    if P is not None and P.get('$base') == 'records':      # a delta pack (an applied proposal, not yet settled): over the records, as the loader does
        if R is None: sys.exit('export: pack.json is a delta over the files records, and the docs hold no `files`')
        for k in P.get('$removed') or []: R.pop(k, None)
        R.update({k: v for k, v in P.items() if not k.startswith('$')}); P = R
    elif P is None and R is not None: P, src = R, 'records'
    if P is None: return files, None
    try: kit = json.load(open(os.path.join(d, 'kit', 'all.json'), encoding='utf-8'))
    except (OSError, ValueError): kit = {}
    def carried(p, t):
        if os.path.exists(os.path.join(d, p)): return False
        if kit.get(p) == t: return True
        q = os.path.join(A.SITE, p)
        try: return os.path.isfile(q) and open(q, encoding='utf-8').read() == t
        except (OSError, UnicodeDecodeError): return False
    shutil.rmtree(os.path.join(inc, 'files'), ignore_errors=True); out = []
    if src == 'pack': os.makedirs(os.path.dirname(pk)); open(pk, 'wb').write(raw)      # kept as read: a second export of the same reads finds it
    for path, t in sorted(P.items()):
        if A.is_seed(path) or not isinstance(t, str) or carried(path, t): continue
        if path.startswith('/') or '..' in path.split('/'): sys.exit(f'export: refusing the path {path}')
        b = t.encode('utf-8'); dst = os.path.join(inc, 'files', path); os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(b)
        out.append({'path': path, 'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b), 'ref': None})
    return out + [f for f in files if f['ref']], src


def outbox_road(d, url, ad, full):
    """The one road in (kit pattern.outbox): ask the page for a bundle, list outbox/, unpack it, export --pack. A delta since the last
    bundle when its unpack is still there (it lays over it in place); a full one on the first export or with --full."""
    last = dict((load_state(d) or {}).get('bundle') or {}); u = last.get('dir') or os.path.abspath(os.path.join(ad, 'bundle'))
    if not last.get('at'):      # no export yet: the bundle `pack` baked (DIR.adp/bundle) is the base, the ask is a delta since the seed version
        try: last['at'] = json.load(open(os.path.join(u, 'bundle.json'), encoding='utf-8')).get('at', '')
        except (OSError, ValueError): pass
    delta = not full and bool(last.get('at')) and os.path.isfile(os.path.join(u, 'docs.json'))
    at = A.now(); ask = {'kind': 'delta', 'since': last['at']} if delta else {'kind': 'full'}; ask.update(by='agent', at=at, state='asked')
    shutil.rmtree(os.path.join(ad, 'outbox'), ignore_errors=True)       # the list below writes it: no chunk of an earlier list stays
    json.dump({'at': at, 'out': u, 'over': u if delta else ''}, open(os.path.join(ad, 'ask.json'), 'w'))      # the next export folds the unpack: it knows this ask
    print(json.dumps({'run': 'every call and command below, in this order, exactly as printed (exit 2 = this list, not an error)',
                      'calls': [{'tool': 'ArtifactData', 'action': 'set', 'url': url, 'collection': 'requests', 'doc_id': 'export', 'data': ask},
                                {'tool': 'ArtifactData', 'action': 'list', 'url': url, 'collection': 'outbox', 'out_dir': os.path.abspath(ad)}],
                      'then': [f'adp.py export {d} --url {url}'],
                      'note': 'an editor\'s open page answers the ask; until then export stops with "has not answered"'},
                     indent=1)); return 2


def export(a):
    pos = A.bare(a[1:]); url = A.opt(a, '--url')
    if len(pos) != 1 or not url: sys.exit('usage: adp.py export DIR --url URL [--full] [--version V]   (run what it prints; --pack appears there, last)')
    d = pos[0]; ad = adir(d); inc = os.path.join(ad, 'incoming'); os.makedirs(inc, exist_ok=True)
    pk = A.opt(a, '--pack')
    if not pk:
        ask = os.path.join(ad, 'ask.json'); box = os.path.join(ad, 'outbox')
        if '--full' in a or not os.path.isfile(ask) or not os.path.isdir(box): return outbox_road(d, url, ad, '--full' in a)
        k = json.load(open(ask)); pk = k['out']
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()): A.unpack_cmd(['unpack', box, pk, '--request', k['at']] + (['--over', k['over']] if k.get('over') else []))      # exits with its own message while the page has not answered
        os.remove(ask)
    if not os.path.isfile(os.path.join(pk, 'docs.json')): sys.exit(f'export: {pk} is not an unpack output (no docs.json). Run adp.py export {d} --url {url} and every call and command it prints, from the first.')
    fl, dd, bun = from_pack(pk, ad, inc)
    prev = load_state(d) or {}
    cols = sorted(set(prev.get('collections') or []) | set(declared_collections(d, dd)))      # the page's own data (a board's records, projects): what the bundle carries
    if 'records' in cols and 'codemap' not in cols: cols.append('codemap')       # the code index propose derives from git (adp_code.py): its pin is the live one
    files = listing(fl)
    docs = dump_docs(dd)
    files, packed = page_files(d, files, docs, inc)
    for sub in ('content', 'db'): shutil.rmtree(os.path.join(inc, sub), ignore_errors=True)
    json.dump(files, open(os.path.join(inc, 'files.json'), 'w'), indent=1)
    live_tree, refs = {}, {f['path']: f['ref'] for f in files if f['ref']}
    live_sha = {f['path']: f['sha256'] for f in files if not f['ref']}
    for f in files:
        src = os.path.join(inc, 'files', f['path'])
        if not f['ref'] and os.path.isfile(src):
            b = open(src, 'rb').read()
            if f['path'] == 'index.html':                          # stored and hashed bare, so it compares with the folder's
                if unwrap(b) != b: b = unwrap(b); open(src, 'wb').write(b)
                live_sha['index.html'] = hashlib.sha256(b).hexdigest()   # also when an earlier export already stored it bare
            live_tree['files/' + f['path']] = b
    for coll, ds in docs.items():
        if coll == 'files': continue                       # the page's own files, expanded above: not data
        for k, (data, _) in ds.items():
            if coll == 'content':
                p = os.path.join(inc, 'content', k + '.html'); os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, 'w', encoding='utf-8').write(data.get('html', '')); live_tree[f'content/{k}.html'] = data.get('html', '').encode()
                continue
            p = os.path.join(inc, 'db', coll, k + '.json'); os.makedirs(os.path.dirname(p), exist_ok=True)
            json.dump(data, open(p, 'w'), ensure_ascii=False, indent=1)
            if coll not in ('presence', 'agents'): live_tree[f'db/{coll}/{k}.json'] = jb(strip(coll, data))
    if not os.path.isdir(d) or not os.listdir(d):
        # the first export into a DIR that is missing or empty creates it from what the url serves (else every live file reads as deleted locally and holds)
        for f in files:
            src = os.path.join(inc, 'files', f['path'])
            if not f['ref'] and os.path.isfile(src):
                os.makedirs(os.path.dirname(os.path.join(d, f['path'])) or d, exist_ok=True); shutil.copyfile(src, os.path.join(d, f['path']))
    man = (docs.get('manifest', {}).get('current') or ({}, None))[0]
    version = A.opt(a, '--version') or man.get('version') or (prev.get('live') or {}).get('version', '')
    live_m = cmanifest(man, live_sha)
    base = prev.get('base') or {'version': version, 'manifest': live_m}
    json.dump({**live_m, 'page_hash': man.get('page_hash', '')}, open(os.path.join(inc, 'live-manifest.json'), 'w'), indent=1)
    repo = repo_init(d)
    lsha = commit_tree(repo, 'live', live_tree, f'export {version}')
    root = git(repo, 'rev-list', '--max-parents=0', 'live').stdout.split()
    if not prev.get('base') or git(repo, 'merge-base', 'work', 'live', check=False).stdout.strip() in root:
        # the first export is the import: work and base start from live, so live is their ancestor (a work grown from
        # the empty root, as an older export left it, would meet live as add/add on every file)
        git(repo, 'branch', '-f', 'work', lsha); git(repo, 'branch', '-f', 'base', lsha)
    wm, wtree = work_tree(d, refs)
    commit_tree(repo, 'work', wtree, 'work', db_from='live')
    wman = work_manifest(d, refs)
    rep = classify(cmanifest(base['manifest']), live_m, wman)
    merged = None
    if not rep['held']:
        tree, conflicts = merge3(repo, 'base', 'work', 'live')
        if conflicts:
            rep['merge_conflict'] = conflicts[-3:]
            rep['held'] += [{'id': x, 'base': None, 'live': None, 'incoming': None}
                            for x in re.findall(r'CONFLICT \([^)]*\): (?:Merge conflict in )?(\S+)', '\n'.join(conflicts))]
        else:
            merged = git(repo, 'commit-tree', tree, '-p', 'work', '-p', 'live', '-m', f'merge live {version}').stdout.strip()
            git(repo, 'checkout', '-q', '-f', 'work'); git(repo, 'reset', '-q', '--hard', merged)
            for x in rep['theirs']:                       # the live side lands in the project folder
                b, l, _ = (cmanifest(base['manifest']).get('files') or {}).get(x), live_m['files'].get(x), None
                src = os.path.join(inc, 'files', x)
                if x in live_m['files'] and os.path.isfile(src):
                    os.makedirs(os.path.dirname(os.path.join(d, x)) or d, exist_ok=True); shutil.copyfile(src, os.path.join(d, x))
                elif x in live_m['parts'] and os.path.isdir(os.path.join(d, 'content')) and os.path.isfile(os.path.join(inc, 'content', x + '.html')):
                    shutil.copyfile(os.path.join(inc, 'content', x + '.html'), os.path.join(d, 'content', x + '.html'))
            git(repo, 'branch', '-f', 'base', 'live'); base = {'version': version, 'manifest': live_m}
    json.dump(rep, open(os.path.join(inc, 'report.json'), 'w'), indent=1)
    pi = prev.get('incoming') or {}
    proposed, acked = pi.get('proposed') or {}, pi.get('acked') or []
    unacked = sorted(k for k, (x, _) in docs.get('incoming', {}).items() if k in proposed and k not in acked and x.get('status') in ('applied', 'declined'))
    pending = sorted(k for k, (x, _) in docs.get('requests', {}).items() if x.get('status') != 'done' and x.get('state') not in ('ack', 'seen', 'working', 'done'))
    name = prev.get('name') or A.slugify(os.path.basename(os.path.abspath(d)))
    state = {'schema': 'adp-state/1', 'url': url.rstrip('/'), 'name': name, 'capabilities': prev.get('capabilities') or {},
             **({'collections': cols} if cols else {}), 'bundle': bun,
             'live': {'version': version, 'at': A.now()},
             'docs': {f'{c}/{k}': v for c, ds in docs.items() if c != 'files' for k, (_, v) in ds.items() if isinstance(v, int)},
             'known': sorted(f'{c}/{k}' for c, ds in docs.items() if c != 'files' for k in ds),
             **({'page': packed} if packed else {}),      # pack | records: the url serves a loader, so `files` prints the pack road
             'files': {f['path']: f['sha256'] for f in files if not f['ref']}, 'refs': refs, 'base': base, 'exported_at': A.now(),
             'site': prev.get('site') or {'url': A.saved_site() or '', 'vermap': {}},
             'incoming': {'held': [h['id'] for h in rep['held']], 'unacked': unacked, 'pending_replies': pending, 'proposed': proposed, 'acked': acked},
             'commits': {'live': lsha, 'work': merged or git(repo, 'rev-parse', 'work').stdout.strip()}}
    save_state(d, state); register(url, d, name)
    alias = ((docs.get('status', {}).get('page') or ({},))[0] or {}).get('url', '')      # the link the page shows (adp.js status/page): the same folder
    if re.fullmatch(r'https://claude\.ai/code/artifact/[0-9a-f-]{36}', alias or ''): register(alias, d, name)
    local = rep['new'] + rep['ours'] + rep['retired']
    nxt = (f'held: {len(rep["held"])}; show both versions to the owner, nobody writes' if rep['held'] else
           f'adp.py propose {d} --by NAME' if local else 'clean: nothing to send')
    if unacked: nxt = '; '.join(f'adp.py ack {d} --proposal {k}' for k in unacked) + '; then ' + nxt      # an applied or declined proposal is acked before anything else is sent
    return A.emit({'report': rep, 'merged': bool(merged), **({'page': packed} if packed else {}), 'state': os.path.abspath(os.path.join(ad, 'state.json')), 'next': nxt})


# ---- propose (contract 3) ----

CHUNK = 200 * 1024
CTYPE = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
         '.svg': 'image/svg+xml', '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv'}


def chunk_text(text, n):
    """text cut into pieces of at most n UTF-8 bytes (the doc limit is bytes: n characters of CJK or emoji are 3-4 times that), never inside a character"""
    b, out, i = text.encode(), [], 0
    while i < len(b):
        j = min(i + n, len(b))
        while j < len(b) and (b[j] & 0xC0) == 0x80: j -= 1      # a continuation byte: the cut would split a character
        out.append(b[i:j].decode()); i = j
    return out


EDIT_LINE, EDIT_HUNKS, EDIT_HUNK_LINES, EDIT_BUDGET = 300, 40, 80, 80_000


def line_edits(old, new, budget):
    """The unified hunks that turn old text into new: {add, del, hunks: [{old, at, lines: [' ctx' | '-gone' | '+new'], more}], cut}.
    Two lines of context a side; changes under 5 lines apart share a hunk. add/del always count every changed line; the hunks are capped
    (a line EDIT_LINE chars, a hunk EDIT_HUNK_LINES lines, EDIT_HUNKS hunks) and by `budget` ([bytes left], shared by the whole proposal):
    over it the entry keeps its counts, carries no hunks and says cut, so the page can say the lines were not carried instead of guessing."""
    import difflib
    a, b = old.splitlines(), new.splitlines()
    s = 0
    while s < len(a) and s < len(b) and a[s] == b[s]: s += 1
    ea, eb = len(a), len(b)
    while ea > s and eb > s and a[ea - 1] == b[eb - 1]: ea -= 1; eb -= 1
    ops = [(t, i1 + s, i2 + s, j1 + s, j2 + s) for t, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a[s:ea], b[s:eb], autojunk=False).get_opcodes() if t != 'equal']
    groups = []
    for op in ops:
        if groups and op[1] - groups[-1][-1][2] <= 4: groups[-1].append(op)
        else: groups.append([op])
    out = {'add': sum(o[4] - o[3] for o in ops), 'del': sum(o[2] - o[1] for o in ops), 'hunks': [], 'cut': False}
    for g in groups:
        i0, i_end = max(0, g[0][1] - 2), min(len(a), g[-1][2] + 2)
        lines, i = [], i0
        for _, i1, i2, j1, j2 in g:
            lines += [' ' + x for x in a[i:i1]] + ['-' + x for x in a[i1:i2]] + ['+' + x for x in b[j1:j2]]; i = i2
        lines += [' ' + x for x in a[i:i_end]]
        more = max(0, len(lines) - EDIT_HUNK_LINES)
        h = {'old': i0 + 1, 'at': g[0][3] - (g[0][1] - i0) + 1, 'lines': [x[:EDIT_LINE] for x in lines[:EDIT_HUNK_LINES]], 'more': more}
        size = len(json.dumps(h, ensure_ascii=False).encode())
        if len(out['hunks']) >= EDIT_HUNKS or size > budget[0]: out['cut'] = True; break
        budget[0] -= size; out['hunks'].append(h)
    return out


def code_docs(d, ad, a, pdocs, cols):
    """A board whose records cite files: the code index (codemap/code, codemap/trace) read from the git repo the records cite, carried in the same proposal.
    Automatic: no flag asks for it. --repo DIR (else the current directory's repo), --code-rev REV (the audited commit), --no-code to leave it out.
    Records = the live export's, with this proposal's own record docs over them. A directory outside git, or records citing no file git knows, add nothing."""
    if 'records' not in cols or '--no-code' in a: return []
    import adp_code
    recs = {}
    rd = os.path.join(ad, 'incoming', 'db', 'records')
    if os.path.isdir(rd):
        for f in sorted(os.listdir(rd)):
            if f.endswith('.json'):
                try: recs[f[:-5]] = json.load(open(os.path.join(rd, f), encoding='utf-8'))
                except (OSError, ValueError): pass
    for x in pdocs:
        if x['collection'] == 'records':
            if x['data'] is None: recs.pop(x['id'], None)
            else: recs[x['id']] = x['data']
    used = len(json.dumps(pdocs, ensure_ascii=False).encode())
    out = []
    for c, i, data in adp_code.docs(list(recs.values()), A.opt(a, '--repo') or os.getcwd(), A.opt(a, '--code-rev'), max(0, CHUNK - used)):
        lp = os.path.join(ad, 'incoming', 'db', c, i + '.json')
        live = json.load(open(lp, encoding='utf-8')) if os.path.isfile(lp) else None
        if live == data: continue
        out.append({'collection': c, 'id': i, 'from': doc_hash(live) if live is not None else None, 'data': data, 'reason': 'derived from git by adp.py propose'})
    return out


def stale_msg(st):
    s = st.get('stale') or {}
    return f'the page moved at {s.get("version") or s.get("at") or "?"}: export first'


def derive_summary(rep, retire, pdocs):
    """the one line when --summary is absent: what the export report says is ours/new/retired, and the data docs carried"""
    bits = []
    for k, ids in (('changed', rep['ours']), ('new', rep['new']), ('retired', sorted(set(rep['retired']) | set(retire)))):
        if ids: bits.append(f'{k} {", ".join(ids[:4])}' + (f' +{len(ids) - 4}' if len(ids) > 4 else ''))
    if pdocs: bits.append(f'{len(pdocs)} data doc' + ('s' if len(pdocs) > 1 else ''))
    return '; '.join(bits) or 'work'


def propose(a, documents=()):
    pos = A.bare(a[1:]); by, summary = A.opt(a, '--by'), A.opt(a, '--summary')
    if len(pos) != 1 or not by: sys.exit('usage: adp.py propose DIR --by NAME [--summary S] [--retire ID --reason R ...]')
    d = pos[0]; ad = adir(d); st = load_state(d)
    if not st: print(json.dumps({'error': 'no export yet', 'next': f'adp.py export {d} --url URL'})); return 2
    if st.get('stale'): print(json.dumps({'refused': [{'error': stale_msg(st), 'next': f'adp.py export {d} --url {st["url"]}'}]}, indent=1)); return 2
    repo = repo_init(d); refs = st.get('refs') or {}
    _, wtree = work_tree(d, refs)
    wsha = commit_tree(repo, 'work', wtree, f'propose: {summary or by}', db_from='live')
    _, conflicts = merge3(repo, 'base', 'work', 'live')
    conflict = bool(conflicts)
    retire = dict(zip(A.optall(a, '--retire'), A.optall(a, '--reason') + [''] * len(A.optall(a, '--retire'))))
    wman = {**work_manifest(d, refs), 'retired': {k: v for k, v in retire.items() if v}}
    base = cmanifest(st['base']['manifest'])
    live_m = json.load(open(os.path.join(ad, 'incoming', 'live-manifest.json'))) if os.path.isfile(os.path.join(ad, 'incoming', 'live-manifest.json')) else base
    rep = classify(base, live_m, wman)
    stop = []
    if conflict: stop.append({'error': 'merge conflict with live', 'detail': conflicts[-5:]})
    if rep['held']: stop.append({'error': 'held', 'held': rep['held']})
    gone = [x for x in rep['held'] if x['incoming'] is None]
    if gone: stop.append({'error': 'deleted without --retire ID --reason R', 'ids': [x['id'] for x in gone]})
    unreasoned = [k for k, v in retire.items() if not v]
    if unreasoned: stop.append({'error': '--retire needs --reason', 'ids': unreasoned})
    cols = set(st.get('collections') or [])
    pdocs = list(documents)
    supplied = {(x['collection'], x['id']) for x in pdocs}
    pdocs += [x for x in code_docs(d, ad, a, pdocs, cols) if (x['collection'], x['id']) not in supplied]
    summary = summary or derive_summary(rep, retire, pdocs)
    if len(json.dumps(pdocs, ensure_ascii=False).encode()) > CHUNK: stop.append({'error': f'the docs exceed {CHUNK} bytes in one proposal: split them over several'})
    if st.get('page') == 'pack': stop.append({'error': 'the url still serves pack.json (not settled yet)', 'next': f'open the url once as an editor (the loader settles it), then adp.py export {d} --url URL again'})
    if stop: print(json.dumps({'refused': stop}, indent=1)); return 2
    st.setdefault('incoming', {})['held'] = []               # a deletion the export held is retired here, so the gate opens
    send = rep['new'] + rep['ours']
    if not send and not rep['retired'] and not pdocs: return A.emit({'nothing': 'work equals live', 'report': rep})
    ms = int(time.time() * 1000); pid = f'p-{ms}-{"".join(random.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(4))}'
    frag = fragments(d); at = A.now()
    # what each part's own text did (children excluded), from the live files and the work files: the page proves a region verdict with it, no base pack needed
    wfull = A.manifest_dir(d); wown = A.own_hashes(d); lown = A.own_hashes(os.path.join(ad, 'incoming', 'files'))
    parts = [{'id': x, 'from': live_m['parts'].get(x), 'to': wman['parts'][x], 'html': frag.get(x, ''), 'retired': False, 'reason': '',
              'own': [lown.get(x), wown.get(x)], 'file': wfull['part_file'].get(x, ''), 'parent': wfull['parents'].get(x, '')}
             for x in send if x in wman['parts']]
    parts += [{'id': x, 'from': live_m['parts'].get(x), 'to': None, 'html': '', 'retired': True, 'reason': retire.get(x, ''),
               'own': [lown.get(x), None], 'file': '', 'parent': ''}
              for x in rep['retired'] if x in live_m['parts']]
    # the lines behind each changed own hash, and behind each changed file with no markers (kit files, adp.js): unified hunks against the live text exported
    budget = [EDIT_BUDGET]; ltxt, wtxt = A.own_texts(os.path.join(ad, 'incoming', 'files')), A.own_texts(d)
    for x in parts:
        o = x.get('own') or []
        if len(o) == 2 and o[0] and o[1] and o[0] != o[1] and x['id'] in ltxt and x['id'] in wtxt: x['edits'] = line_edits(ltxt[x['id']], wtxt[x['id']], budget)
    marked, edits = set(wfull['part_file'].values()), {}
    for x in send:
        lp, wp = os.path.join(ad, 'incoming', 'files', x), os.path.join(d, x)
        if x in marked or x not in wman['files'] or not os.path.isfile(lp) or not os.path.isfile(wp): continue
        try: lt, wt = open(lp, encoding='utf-8').read(), open(wp, encoding='utf-8').read()
        except UnicodeDecodeError: continue
        if lt != wt: edits[x] = line_edits(lt, wt, budget)
    for k, h in sorted(frag.items()):                      # copy that moved: the content/<id> doc the page keeps over content.js
        lp = os.path.join(ad, 'incoming', 'content', k + '.html')
        lh = open(lp, encoding='utf-8').read() if os.path.isfile(lp) else None
        if lh == h or (lh is None and 'content.js' not in send): continue
        parts.append({'id': k, 'kind': 'content', 'from': A.H(lh) if lh is not None else None, 'to': A.H(h), 'html': h, 'retired': False, 'reason': ''})
    files, chunks = [], []
    if st.get('page') == 'records':      # settled: the url serves only the loader. The files go as ONE delta pack.json over the records (BUG-001);
        delta, gone = {'$base': 'records'}, []      # a loose file would be shadowed by its record, and index.html would replace the loader
        for x in send + rep['retired']:
            if x not in wman['files'] and x not in live_m['files']: continue
            if x not in wman['files']: gone.append(x); continue
            try: delta[x] = open(os.path.join(d, x), encoding='utf-8').read()
            except UnicodeDecodeError: print(json.dumps({'refused': [{'error': 'a settled page holds text files only', 'path': x}]}, indent=1)); return 2
        if gone: delta['$removed'] = sorted(gone)
        if len(delta) > 1 or gone:
            text = json.dumps(delta, ensure_ascii=False, separators=(',', ':')); e = {'path': 'pack.json', 'if_match': None, 'content_type': 'application/json'}
            if len(text.encode()) > CHUNK:
                parts_ = chunk_text(text, CHUNK // 2); chunks += [{'path': 'pack.json', 'n': n, 'of': len(parts_), 'content': c} for n, c in enumerate(parts_)]
            else: e['content'] = text
            files.append(e)
    for x in ([] if st.get('page') == 'records' else send + rep['retired']):
        if x not in wman['files'] and x not in live_m['files']: continue
        e = {'path': x, 'if_match': (st.get('files') or {}).get(x), 'content_type': CTYPE.get(os.path.splitext(x)[1].lower(), 'application/octet-stream')}
        if x not in wman['files']: e['content'] = None; e['reason'] = retire.get(x, ''); files.append(e); continue
        b = open(os.path.join(d, x), 'rb').read()
        try: text = b.decode('utf-8')
        except UnicodeDecodeError: text = base64.b64encode(b).decode(); e['encoding'] = 'base64'
        if len(text.encode()) > CHUNK:
            parts_ = chunk_text(text, CHUNK // 2)
            chunks += [{'path': x, 'n': n, 'of': len(parts_), 'content': c} for n, c in enumerate(parts_)]
        else: e['content'] = text
        files.append(e)
    live_files = dict(st.get('files') or {})                   # the listing's shas (what if_match compares), the page bare as the record hashes it
    bare = os.path.join(ad, 'incoming', 'files', 'index.html')
    if 'index.html' in live_files and os.path.isfile(bare): live_files['index.html'] = hashlib.sha256(open(bare, 'rb').read()).hexdigest()
    # only what this proposal touches and what had drifted at export (listing != record, read at the same moment): Apply writes these
    # to manifest.files, and a stale copy of an untouched file would undo another Apply's hash and hold the next proposal for nothing
    mp = os.path.join(ad, 'incoming', 'db', 'manifest', 'current.json')      # the record as exported (live_m's files are the listing)
    rec = json.load(open(mp, encoding='utf-8')) if os.path.isfile(mp) else {}
    rec = {k: str(v)[:12] for k, v in (A.manifest_of(rec) or {}).get('files', {}).items()}
    touched = set(send) | set(rep['retired'])
    live_files = {k: v for k, v in live_files.items() if k in touched or str(v)[:12] != rec.get(k)}
    doc = {'by': by, 'at': at, 'summary': summary, 'threads': [],
           'base': {'version': st['live']['version'], 'page_hash': live_m.get('page_hash', ''), 'docs': st.get('docs') or {}},
           'parts': parts, 'files': files, 'edits': edits, 'docs': pdocs, 'live_files': live_files, 'classified': rep, 'status': 'new',
           'decided': {}, 'applied': {}}      # not decided / applied yet: the fields are absent, Apply and Decline set them
    p = os.path.join(ad, f'propose-{pid}.json'); json.dump(doc, open(p, 'w'), ensure_ascii=False, indent=1)
    b = A.Batch(os.path.join(ad, f'propose-{pid}'), {})
    projs = {x['data'].get('project') for x in pdocs if x['collection'] == 'records' and isinstance(x['data'], dict)} - {None, ''}      # records of one project: the change names it
    for i, c in enumerate(chunks): b.put('set', f'incoming/{pid}/chunks', str(i), c)
    b.w.append({'op': 'set', 'collection': 'incoming', 'doc_id': pid, 'file_path': os.path.abspath(p)})
    b.put('set', 'changes', f'd-{ms}', {'version': '', 'at': at, 'by': by, 'summary': f'Proposal {pid}: {summary}', 'parts': [], 'threads': [],
                                         'data': [{'doc': f'incoming/{pid}'}], **({'project': projs.pop()} if len(projs) == 1 else {})})
    st.setdefault('incoming', {}).setdefault('proposed', {})[pid] = {'work': wsha, 'manifest': {k: wman[k] for k in ('parts', 'files', 'parents')}}
    save_state(d, st)
    return b.emit((), {'proposal': pid, 'doc': os.path.abspath(p), 'parts': len(parts), 'files': len(files), 'docs': len(pdocs), 'chunks': len(chunks),
                       'next': 'run the ArtifactData batch, then adp.py ack with its result; an editor applies it on the page'})


# ---- ack ----

def hook_url(ti):
    return (ti or {}).get('url') or ''


def sent_writes(ti):
    return [w for w in (ti.get('writes') or ([ti] if ti.get('collection') else [])) if isinstance(w, dict)]


def reconcile(d, st, ti, res, ver, done):
    """what the PostToolUse hook saw written: own data docs land as the page's copy (DIR.adp/incoming/db/<c>/<id>.json, version into state.docs);
    a framework write that is not ours (not the proposal batch, not an answer) marks the page stale until the next export"""
    ws = sent_writes(ti); inc = st.get('incoming') or {}; prop = inc.get('proposed') or {}
    pids = {str(w.get('doc_id')) if w.get('collection') == 'incoming' else str(w.get('collection')).split('/')[1] for w in ws
            if str(w.get('collection')).split('/')[0] == 'incoming' and (w.get('doc_id') or '/' in str(w.get('collection')))}
    own_batch = bool(pids & set(prop))      # the proposal batch: its incoming doc and chunks, and the changes entry beside them
    for w in ws:
        c, i = str(w.get('collection', '')), str(w.get('doc_id') or '')
        root = c.split('/')[0]; k = f'{c}/{i}'
        if root not in RESERVED:
            v = st['docs'].get(k)
            if not (isinstance(v, int) and i): continue
            data = w.get('data')
            if data is None and w.get('file_path') and os.path.isfile(w['file_path']):
                try: data = json.load(open(w['file_path'], encoding='utf-8'))
                except ValueError: data = None
            if data is None: continue
            p = os.path.join(adir(d), 'incoming', 'db', c, i + '.json'); os.makedirs(os.path.dirname(p), exist_ok=True)
            json.dump(data, open(p, 'w'), ensure_ascii=False, indent=1); done.append(f'db/{k}')
        elif root in ('requests', 'presence') or (root in ('incoming', 'changes') and own_batch): continue
        else: st['stale'] = {'at': A.now(), 'version': ver or '', 'by': k}; done.append(f'stale {k}')


def ack(a):
    pos = A.bare(a[1:]); src = A.opt(a, '--result')
    raw = json.load(open(src)) if src else {}
    if not src and not A.opt(a, '--proposal') and not sys.stdin.isatty():    # a result on stdin; --proposal alone reads nothing, so a piped shell does not hang
        raw = json.loads(sys.stdin.read() or '{}')
    if 'tool_input' in raw or '--hook' in a:                                  # the PostToolUse hook's stdin
        ti = raw.get('tool_input') or {}; hooked = True
        url = hook_url(ti); res = raw.get('tool_response') or raw.get('tool_result') or {}
        if isinstance(res, list):                            # content blocks: the text of the first that parses
            res = next((x.get('text') for x in res if isinstance(x, dict) and x.get('text')), '{}')
        if isinstance(res, str):
            try: res = json.loads(res)
            except ValueError: res = {}
        if not isinstance(res, dict): res = {}
        ent = registry().get(url.rstrip('/'))
        if not ent: return A.emit({'ack': None, 'note': 'not an artifact ADP manages'})
        d = ent['dir']
    else:
        if not pos: sys.exit('usage: adp.py ack DIR [--result FILE | stdin] [--proposal PID]')
        d, res, ti, hooked = pos[0], raw, {}, False
    st = load_state(d)
    if not st: print(json.dumps({'error': 'no export yet', 'next': f'adp.py export {d} --url URL'})); return 2
    inc, done = st.setdefault('incoming', {}), []
    ver = res.get('version') or res.get('version_id') or res.get('versionId')
    if res.get('shas'):                                      # an Artifact publish result
        st['files'].update(res['shas']); done.append('files')
        if ver: st['live']['version'] = ver
    writes = res.get('results') or res.get('writes') or (res if isinstance(res, list) else [])
    if hooked and not writes and ver and len(sent_writes(ti)) == 1:      # a single set answers with its version only
        w0 = sent_writes(ti)[0]; writes = [{'collection': w0.get('collection'), 'doc_id': w0.get('doc_id'), 'version': ver}]
    for w in writes if isinstance(writes, list) else []:
        k = f"{w.get('collection')}/{w.get('doc_id') or w.get('id')}"
        if isinstance(w.get('version'), int): st['docs'][k] = w['version']; done.append(k)
        if w.get('collection') == 'requests':      # the agent wrote to the request (ack, working or done): it is answered, not pending
            inc['pending_replies'] = [x for x in inc.get('pending_replies', []) if x != (w.get('doc_id') or w.get('id'))]
    if hooked: reconcile(d, st, ti, res, ver, done)
    pid = A.opt(a, '--proposal')
    if pid:
        pdoc = os.path.join(adir(d), 'incoming', 'db', 'incoming', pid + '.json')
        status = (json.load(open(pdoc)) if os.path.isfile(pdoc) else {}).get('status')
        if status not in ('applied', 'declined'): sys.exit(f'{pid}: status {status or "unknown"} in the last export; ack it once applied or declined')
        prop = (inc.get('proposed') or {}).get(pid)
        repo = repo_init(d)
        if status == 'applied' and prop:
            base = git(repo, 'rev-parse', '--verify', 'refs/heads/base^{commit}').stdout.strip()
            work = git(repo, 'rev-parse', '--verify', prop['work'] + '^{commit}').stdout.strip()
            def ancestor(older, newer):
                r = git(repo, 'merge-base', '--is-ancestor', older, newer, check=False)
                if r.returncode not in (0, 1):
                    sys.exit(f'{pid}: cannot reconcile ack history: {r.stderr.strip() or r.stdout.strip() or "git ancestry check failed"}; proposal remains unacked')
                return r.returncode == 0
            if not ancestor(work, base):      # already-contained older proposals never reset base (BUG-037)
                if not ancestor(base, work):
                    # Export advances base along the independent live branch. An applied
                    # proposal can therefore be its sibling, with the exact same physical
                    # manifest. Only that reconciled export and an actual work ancestor
                    # authorize adopting the proposal commit; unrelated histories refuse.
                    same_payload = all(cmanifest(st['base']['manifest'])[k] == cmanifest(prop['manifest'])[k]
                                       for k in ('parts', 'files'))
                    live = git(repo, 'rev-parse', '--verify', 'refs/heads/live^{commit}').stdout.strip()
                    if not (base == live and same_payload and ancestor(work, 'work')):
                        sys.exit(f'{pid}: divergent ack history; export and reconcile before ack; proposal remains unacked')
                v = json.load(open(pdoc)).get('applied', {}).get('version', '')
                next_base = {'version': v, 'manifest': prop['manifest']}
                # Move only from the base we checked; a concurrent change must not be overwritten.
                git(repo, 'update-ref', 'refs/heads/base', work, base)
                st['base'] = next_base
                if v: st['live']['version'] = v
        inc['unacked'] = [x for x in inc.get('unacked', []) if x != pid]
        inc['acked'] = sorted(set(inc.get('acked', [])) | {pid}); done.append(f'incoming/{pid} {status}')
    save_state(d, st); register(st['url'], d, st.get('name', ''))
    return A.emit({'ack': done, 'live': st['live'], 'incoming': {k: inc.get(k, []) for k in ('held', 'unacked', 'pending_replies')}})


# ---- gate (contract 7) ----

def decide(kind, why):
    """deny and pass carry a decision; everything else only a note, so Claude Code's own permission prompt still runs"""
    if kind == 'pass': return {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'allow', 'permissionDecisionReason': why}}      # the data road: no prompt
    if kind != 'deny': return {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'additionalContext': why}}
    return {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': kind, 'permissionDecisionReason': why}}


def gate(a):
    src = A.opt(a, '--input')
    raw = json.load(open(src)) if src else json.load(sys.stdin)
    tool, ti = raw.get('tool_name', ''), raw.get('tool_input') or {}
    url = hook_url(ti)
    act = ti.get('action') or ('publish' if tool.endswith('Artifact') else '')
    if not url or tool.endswith('Artifact') and act != 'publish' or act in ('get', 'list', 'query', 'read'):
        return A.emit(decide('allow', 'adp: not a write onto an existing artifact'))
    ent = registry().get(url.rstrip('/')); st = load_state(ent['dir']) if ent else None
    if not st: return A.emit(decide('allow', 'adp: no state for this url, an artifact ADP does not manage'))
    inc = st.get('incoming') or {}
    writes = ti.get('writes') or ([ti] if ti.get('collection') else [])
    if writes and all(f"{w.get('collection')}/{w.get('doc_id')}" == 'requests/export' for w in writes):
        return A.emit(decide('allow', 'adp: the export ask, first call of the one read of the page'))
    answering = writes and all(str(w.get('collection', '')).split('/')[0] in ('requests', 'presence') for w in writes)
    roots = [str(w.get('collection', '')).split('/')[0] for w in writes] if isinstance(writes, list) else []
    foreign = sorted({r for r in roots if r in RESERVED and r not in ('requests', 'presence', 'incoming', 'changes')})      # the proposal batch (incoming, changes) and the answers are the framework writes an agent may make
    if foreign: return A.emit(decide('deny', f'adp: {", ".join(foreign)} is framework: framework changes go through adp.py propose {ent["dir"]} --by NAME'))
    pinned = bool(writes) and all(isinstance(w, dict) and 'if_version' in w and w.get('collection') for w in writes)
    if pinned and not any(r in RESERVED for r in roots) and not any(w['if_version'] != st['docs'].get(f"{w.get('collection')}/{w.get('doc_id')}", w['if_version']) for w in writes):
        return A.emit(decide('pass', 'adp: a pinned data write (vanilla if_version); no export needed'))
    if st.get('stale'): return A.emit(decide('deny', f'adp: {stale_msg(st)}. Run adp.py export {ent["dir"]} --url {url} and every call and command it prints'))
    block = {k: inc.get(k) for k in ('held', 'unacked') + (() if answering else ('pending_replies',)) if inc.get(k)}
    if block:
        return A.emit(decide('deny', 'adp: the inbox has ' + '; '.join(f'{k}: {", ".join(v)}' for k, v in block.items()) +
                             f'. Run adp.py export {ent["dir"]} --url {url} and every call and command it prints, then resolve them'))
    bad, known = [], set(st.get('known') or [])      # known: the docs the last bundle carried (it has no versions, so a write to one must pin)
    for w in writes if isinstance(writes, list) else []:
        k = f"{w.get('collection')}/{w.get('doc_id')}"
        if 'if_version' in w and k in st['docs'] and w['if_version'] != st['docs'][k]: bad.append(f"{k} pinned at {w['if_version']}, read at {st['docs'][k]}")
        elif 'if_version' not in w and k in known and k.split('/')[0] not in ('requests', 'presence'):      # answering writes pin from `adp.py requests` (its dump carries the versions)
            bad.append(f"{k} is on the page: the write needs if_version: the version from your ArtifactData get")
    if bad: return A.emit(decide('deny', 'adp: a batch not derived from the last export: ' + '; '.join(bad) + f'. Run adp.py export {ent["dir"]} --url {url} and its calls, then rebuild the batch'))
    return A.emit(decide('allow', 'adp: inbox clear'))
