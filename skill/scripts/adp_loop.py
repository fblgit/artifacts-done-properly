"""The loop (0.3.0): export, classify, propose, ack, gate. docs/architecture.md "The loop" holds the contracts (1, 2, 4, 7).
Imported by adp.py, which sets A to itself, so the helpers (opt, bare, emit, H, manifest_dir, Batch, ...) are reused, not copied."""
import base64, datetime, hashlib, json, os, random, re, shutil, subprocess, sys, time

A = None      # the adp module, set by adp.py at import
CLASSES = ('new', 'ours', 'theirs', 'applied', 'held', 'retired')
CANON = ('manifest', 'parts', 'content', 'changes', 'config', 'requests', 'presence', 'agents', 'decisions', 'incoming')


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
    for key in ('parts', 'files'):
        bs, ls, js = (m.get(key) or {} for m in (base, live, inc))
        for x in sorted(set(bs) | set(ls) | set(js)):
            b, l, i = bs.get(x), ls.get(x), js.get(x); vals[x] = (b, l, i)
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
    return out


def classify_cmd(a):
    pos = A.bare(a[1:])
    if len(pos) != 3: sys.exit('usage: adp.py classify BASE.json LIVE.json INCOMING.json')
    ms = []
    for p in pos:
        m = json.load(open(p)); ms.append(m.get('data', m) if 'parts' not in m and 'files' not in m else m)
    return A.emit(classify(*ms))


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
    r = subprocess.run(['git', '-C', repo, '-c', 'user.name=adp', '-c', 'user.email=adp', '-c', 'commit.gpgsign=false', *args],
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
    for p in git(repo, 'ls-files').stdout.splitlines(): os.remove(os.path.join(repo, p))
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
            'parents': dict(m.get('parents') or {})}


def work_manifest(d, refs):
    m = A.manifest_dir(d)
    return {**cmanifest(m), 'files': {k: v for k, v in m['files'].items() if k not in refs and not k.startswith('content/')}}


# ---- export ----

def export(a):
    pos = A.bare(a[1:]); url = A.opt(a, '--url')
    if len(pos) != 1 or not url: sys.exit('usage: adp.py export DIR --url URL [--files-listing F.json] [--docs D.json] [--version V]')
    d = pos[0]; ad = adir(d); inc = os.path.join(ad, 'incoming'); os.makedirs(inc, exist_ok=True)
    fl, dd = A.opt(a, '--files-listing', os.path.join(ad, 'listing.json')), A.opt(a, '--docs', os.path.join(ad, 'docs.json'))
    if not os.path.isfile(fl):
        print(json.dumps({'reads': [{'tool': 'Artifact', 'action': 'list', 'scope': 'files', 'url': url, 'save_to': os.path.abspath(fl)}],
                          'then': f'adp.py export {d} --url {url} --files-listing {fl}'}, indent=1)); return 2
    files = listing(fl)
    if not os.path.isfile(dd):
        calls = [{'tool': 'Artifact', 'action': 'read', 'url': url, 'paths': [f['path'] for f in files if not f['ref']], 'out_dir': os.path.abspath(os.path.join(inc, 'files'))}]
        calls += [{'tool': 'ArtifactData', 'action': 'list', 'url': url, 'collection': c} for c in CANON]
        print(json.dumps({'reads': calls, 'save_docs_to': os.path.abspath(dd), 'docs_shape': '{collection: [{id, data, version}, ...]}',
                          'then': f'adp.py export {d} --url {url} --files-listing {fl} --docs {dd}'}, indent=1)); return 2
    docs = dump_docs(dd); prev = load_state(d) or {}
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
        for k, (data, _) in ds.items():
            if coll == 'content':
                p = os.path.join(inc, 'content', k + '.html'); os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, 'w', encoding='utf-8').write(data.get('html', '')); live_tree[f'content/{k}.html'] = data.get('html', '').encode()
                continue
            p = os.path.join(inc, 'db', coll, k + '.json'); os.makedirs(os.path.dirname(p), exist_ok=True)
            json.dump(data, open(p, 'w'), ensure_ascii=False, indent=1)
            if coll not in ('presence', 'agents'): live_tree[f'db/{coll}/{k}.json'] = jb(strip(coll, data))
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
    pending = sorted(k for k, (x, _) in docs.get('requests', {}).items() if x.get('status') != 'done' and x.get('state') not in ('ack', 'seen', 'working'))
    name = prev.get('name') or A.slugify(os.path.basename(os.path.abspath(d)))
    state = {'schema': 'adp-state/1', 'url': url.rstrip('/'), 'name': name, 'capabilities': prev.get('capabilities') or {},
             'live': {'version': version, 'at': A.now()},
             'docs': {f'{c}/{k}': v for c, ds in docs.items() for k, (_, v) in ds.items() if isinstance(v, int)},
             'files': {f['path']: f['sha256'] for f in files if not f['ref']}, 'refs': refs, 'base': base, 'exported_at': A.now(),
             'catalog': prev.get('catalog') or {'url': A.saved_catalog() or '', 'vermap': {}},
             'incoming': {'held': [h['id'] for h in rep['held']], 'unacked': unacked, 'pending_replies': pending, 'proposed': proposed, 'acked': acked},
             'commits': {'live': lsha, 'work': merged or git(repo, 'rev-parse', 'work').stdout.strip()}}
    save_state(d, state); register(url, d, name)
    local = rep['new'] + rep['ours'] + rep['retired']
    nxt = (f'held: {len(rep["held"])}; show both versions to the owner, nobody writes' if rep['held'] else
           f'adp.py propose {d} --by NAME --summary S' if local else 'clean: nothing to send')
    return A.emit({'report': rep, 'merged': bool(merged), 'state': os.path.abspath(os.path.join(ad, 'state.json')), 'next': nxt})


# ---- propose (contract 3) ----

CHUNK = 200 * 1024
CTYPE = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
         '.svg': 'image/svg+xml', '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv'}


def propose(a):
    pos = A.bare(a[1:]); by, summary = A.opt(a, '--by'), A.opt(a, '--summary')
    if len(pos) != 1 or not by or not summary: sys.exit('usage: adp.py propose DIR --by NAME --summary S [--retire ID --reason R ...]')
    d = pos[0]; ad = adir(d); st = load_state(d)
    if not st: print(json.dumps({'error': 'no export yet', 'next': f'adp.py export {d} --url URL'})); return 2
    repo = repo_init(d); refs = st.get('refs') or {}
    _, wtree = work_tree(d, refs)
    wsha = commit_tree(repo, 'work', wtree, f'propose: {summary}', db_from='live')
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
    if stop: print(json.dumps({'refused': stop}, indent=1)); return 2
    st.setdefault('incoming', {})['held'] = []               # a deletion the export held is retired here, so the gate opens
    send = rep['new'] + rep['ours']
    if not send and not rep['retired']: return A.emit({'nothing': 'work equals live', 'report': rep})
    ms = int(time.time() * 1000); pid = f'p-{ms}-{"".join(random.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(4))}'
    frag = fragments(d); at = A.now()
    parts = [{'id': x, 'from': live_m['parts'].get(x), 'to': wman['parts'][x], 'html': frag.get(x, ''), 'retired': False, 'reason': ''}
             for x in send if x in wman['parts']]
    parts += [{'id': x, 'from': live_m['parts'].get(x), 'to': None, 'html': '', 'retired': True, 'reason': retire.get(x, '')}
              for x in rep['retired'] if x in live_m['parts']]
    for k, h in sorted(frag.items()):                      # copy that moved: the content/<id> doc the page keeps over content.js
        lp = os.path.join(ad, 'incoming', 'content', k + '.html')
        lh = open(lp, encoding='utf-8').read() if os.path.isfile(lp) else None
        if lh == h or (lh is None and 'content.js' not in send): continue
        parts.append({'id': k, 'kind': 'content', 'from': A.H(lh) if lh is not None else None, 'to': A.H(h), 'html': h, 'retired': False, 'reason': ''})
    files, chunks = [], []
    for x in send + rep['retired']:
        if x not in wman['files'] and x not in live_m['files']: continue
        e = {'path': x, 'ifMatch': (st.get('files') or {}).get(x), 'contentType': CTYPE.get(os.path.splitext(x)[1].lower(), 'application/octet-stream')}
        if x not in wman['files']: e['content'] = None; e['reason'] = retire.get(x, ''); files.append(e); continue
        b = open(os.path.join(d, x), 'rb').read()
        try: text = b.decode('utf-8')
        except UnicodeDecodeError: text = base64.b64encode(b).decode(); e['encoding'] = 'base64'
        if len(text.encode()) > CHUNK:
            parts_ = [text[i:i + CHUNK // 2] for i in range(0, len(text), CHUNK // 2)]
            chunks += [{'path': x, 'n': n, 'of': len(parts_), 'content': c} for n, c in enumerate(parts_)]
        else: e['content'] = text
        files.append(e)
    live_files = dict(st.get('files') or {})                   # the listing's shas (what ifMatch compares), the page bare as the record hashes it
    bare = os.path.join(ad, 'incoming', 'files', 'index.html')
    if 'index.html' in live_files and os.path.isfile(bare): live_files['index.html'] = hashlib.sha256(open(bare, 'rb').read()).hexdigest()
    doc = {'by': by, 'at': at, 'summary': summary, 'threads': [],
           'base': {'version': st['live']['version'], 'page_hash': live_m.get('page_hash', ''), 'docs': st.get('docs') or {}},
           'parts': parts, 'files': files, 'live_files': live_files, 'classified': rep, 'status': 'new',
           'decided': {'by': '', 'at': '', 'reason': ''}, 'applied': {'version': '', 'at': ''}}
    p = os.path.join(ad, f'propose-{pid}.json'); json.dump(doc, open(p, 'w'), ensure_ascii=False, indent=1)
    b = A.Batch(os.path.join(ad, f'propose-{pid}'), {})
    for i, c in enumerate(chunks): b.put('set', f'incoming/{pid}/chunks', str(i), c)
    b.w.append({'op': 'set', 'collection': 'incoming', 'doc_id': pid, 'file_path': os.path.abspath(p)})
    b.put('set', 'changes', f'd-{ms}', {'version': '', 'at': at, 'by': by, 'summary': f'Proposal {pid}: {summary}', 'parts': [], 'threads': [],
                                         'data': [{'doc': f'incoming/{pid}'}]})
    st.setdefault('incoming', {}).setdefault('proposed', {})[pid] = {'work': wsha, 'manifest': {k: wman[k] for k in ('parts', 'files', 'parents')}}
    save_state(d, st)
    return b.emit((), {'proposal': pid, 'doc': os.path.abspath(p), 'parts': len(parts), 'files': len(files), 'chunks': len(chunks),
                       'next': 'run the ArtifactData batch, then adp.py ack with its result; an editor applies it on the page'})


# ---- ack ----

def hook_url(ti):
    return (ti or {}).get('url') or ''


def ack(a):
    pos = A.bare(a[1:]); src = A.opt(a, '--result')
    raw = json.load(open(src)) if src else {}
    if not src and not A.opt(a, '--proposal') and not sys.stdin.isatty():    # a result on stdin; --proposal alone reads nothing, so a piped shell does not hang
        raw = json.loads(sys.stdin.read() or '{}')
    if 'tool_input' in raw or '--hook' in a:                                  # the PostToolUse hook's stdin
        url = hook_url(raw.get('tool_input')); res = raw.get('tool_response') or raw.get('tool_result') or {}
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
        d, res = pos[0], raw
    st = load_state(d)
    if not st: print(json.dumps({'error': 'no export yet', 'next': f'adp.py export {d} --url URL'})); return 2
    inc, done = st.setdefault('incoming', {}), []
    ver = res.get('version') or res.get('version_id') or res.get('versionId')
    if res.get('shas'):                                      # an Artifact publish result
        st['files'].update(res['shas']); done.append('files')
        if ver: st['live']['version'] = ver
    writes = res.get('results') or res.get('writes') or (res if isinstance(res, list) else [])
    for w in writes if isinstance(writes, list) else []:
        k = f"{w.get('collection')}/{w.get('doc_id') or w.get('id')}"
        if isinstance(w.get('version'), int): st['docs'][k] = w['version']; done.append(k)
    pid = A.opt(a, '--proposal')
    if pid:
        pdoc = os.path.join(adir(d), 'incoming', 'db', 'incoming', pid + '.json')
        status = (json.load(open(pdoc)) if os.path.isfile(pdoc) else {}).get('status')
        if status not in ('applied', 'declined'): sys.exit(f'{pid}: status {status or "unknown"} in the last export; ack it once applied or declined')
        prop = (inc.get('proposed') or {}).get(pid)
        if status == 'applied' and prop:
            git(repo_init(d), 'branch', '-f', 'base', prop['work'])
            v = json.load(open(pdoc)).get('applied', {}).get('version', '')
            st['base'] = {'version': v, 'manifest': prop['manifest']}
            if v: st['live']['version'] = v
        inc['unacked'] = [x for x in inc.get('unacked', []) if x != pid]
        inc['acked'] = sorted(set(inc.get('acked', [])) | {pid}); done.append(f'incoming/{pid} {status}')
    save_state(d, st); register(st['url'], d, st.get('name', ''))
    return A.emit({'ack': done, 'live': st['live'], 'incoming': {k: inc.get(k, []) for k in ('held', 'unacked', 'pending_replies')}})


# ---- gate (contract 7) ----

def decide(kind, why):
    """deny carries a decision; everything else only a note, so Claude Code's own permission prompt still runs"""
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
    answering = writes and all(str(w.get('collection', '')).split('/')[0] in ('requests', 'presence') for w in writes)
    block = {k: inc.get(k) for k in ('held', 'unacked') + (() if answering else ('pending_replies',)) if inc.get(k)}
    if block:
        return A.emit(decide('deny', 'adp: the inbox has ' + '; '.join(f'{k}: {", ".join(v)}' for k, v in block.items()) +
                             f'. Run adp.py export {ent["dir"]} --url {url} and resolve them first'))
    bad = []
    for w in writes if isinstance(writes, list) else []:
        k = f"{w.get('collection')}/{w.get('doc_id')}"
        if 'if_version' in w and k in st['docs'] and w['if_version'] != st['docs'][k]: bad.append(f"{k} pinned at {w['if_version']}, read at {st['docs'][k]}")
    if bad: return A.emit(decide('deny', 'adp: a batch not derived from the last export: ' + '; '.join(bad) + '. Re-export, then rebuild it'))
    return A.emit(decide('allow', 'adp: inbox clear'))
