"""Adopt (docs/adopt.md): extract candidate kits from an artifact, pack a ready one as a portable .adp file, unpack it.
Imported by adp.py, which sets A to itself, so the helpers (opt, bare, emit) are reused, not copied. Static and deterministic: no model call."""
import datetime, hashlib, json, os, re, subprocess, sys, tempfile

A = None      # the adp module, set by adp.py at import
CAND, PACK = 'adopt-candidates/1', 'adp-pack/1'
SKIP_DIRS = ('data', 'samples')
BASE = ('adp.js', 'content.js')
STOP = set('the a an and or of to in for with on by is are as at from this that it its into over one more use used new add set get list item items view views data state page part parts kit hue'.split())
sha = lambda b: hashlib.sha256(b).hexdigest()
words = lambda s: {w for w in re.findall(r'[a-z]{3,}', s.lower()) if w not in STOP}
strip_js = lambda t: re.sub(r'/\*.*?\*/|(?<![:\'"`])//[^\n]*', '', t, flags=re.S)


def walk(d):
    out = {}
    for root, _, fs in os.walk(d):
        for f in fs:
            p = os.path.join(root, f); rel = os.path.relpath(p, d).replace(os.sep, '/')
            if rel.startswith('.') or '/.' in rel: continue
            out[rel] = open(p, 'rb').read()
    return out


def namespace(scripts):
    """The subject's own global: the name most often written as window.X = window.X || {}."""
    n = {}
    for t in scripts.values():
        for m in re.finditer(r'window\.(\w+)\s*=\s*window\.\1\s*\|\|', t): n[m.group(1)] = n.get(m.group(1), 0) + 1
    return max(n, key=n.get) if n else None


def provides_of(t, ns):
    out = set()
    for m in re.finditer(r'(?<![\w.])(?:window\.)?%s\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?\s*=(?!=)' % re.escape(ns or '\0'), t):
        out.add('%s.%s' % (ns, m.group(1)))
    for m in re.finditer(r'window\.([A-Za-z_]\w*)\s*=(?!=)(?!\s*window\.\1\s*\|\|)', t):
        if m.group(1) != ns: out.add(m.group(1))
    return out


def aliases(t, ns):
    """const A = Hue.app, B = Hue.bridge -> {A: 'app', B: 'bridge'}"""
    return {m.group(1): m.group(2) for m in re.finditer(r'(?<![\w.])(\w+)\s*=\s*(?:window\.)?%s\.([A-Za-z_]\w*)\s*[,;\n)]' % re.escape(ns or '\0'), t)}


def css_classes(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return set(re.findall(r'\.([A-Za-z_][\w-]*)', re.sub(r'\{[^{}]*\}', '{}', t)))


def css_vars(t, kind):
    return set(re.findall(r'var\(\s*(--[\w-]+)' if kind == 'used' else r'(--[\w-]+)\s*:', t))


def dom_ids(body):
    return sorted({a or b for a, b in re.findall(r'getElementById\(\s*[\'"]([\w-]+)|querySelector\(\s*[\'"]#([\w-]+)', body)})[:50]


def header_of(t):
    m = re.match(r'\s*(?:/\*\s*part:[\w.-]+\s*\*/\s*)?/\*+\s*(.*?)\*/', t, re.S)
    return re.sub(r'\s+', ' ', m.group(1)).strip()[:300] if m else ''


def regions(t):
    return [{'name': m.group(1).strip(), 'line': t.count('\n', 0, m.start()) + 1} for m in re.finditer(r'^\s*(?:/\*|//)\s*-{2,}\s*([^-*\n][^\n]*?)\s*-{2,}', t, re.M)]


def load_catalog(path):
    if not path: return None
    path = os.path.expanduser('~/.adp/catalog/catalog.json') if path == '-' else path
    if not os.path.isfile(path): return None
    c = json.load(open(path)); return c.get('entries') or c.get('data', {}).get('entries') or []


def similar(name, prov, summary, entries):
    mine = words(name + ' ' + ' '.join(prov) + ' ' + summary); out = []
    for e in entries or []:
        theirs = words(' '.join([e.get('name', ''), e.get('id', ''), ' '.join(e.get('tags', [])), ' '.join(e.get('provides', []))]))
        n = len(mine & theirs)
        if n >= 2: out.append((n, e['id']))
    return [{'id': i, 'score': n} for n, i in sorted(out, key=lambda x: (-x[0], x[1]))[:3]]


def extract(a):
    pos = A.bare(a[1:])
    if len(pos) != 1 or not os.path.isdir(pos[0]): sys.exit('usage: adp.py extract DIR [--catalog -|catalog.json] [--ns NAME] [--out candidates.json] [--into ADOPTER_DIR]')
    d, files = pos[0], walk(pos[0]); entries = load_catalog(A.opt(a, '--catalog'))
    taken = {f for e in entries or [] for f in (x['path'] for x in e.get('files', []))}
    text = lambda p: files[p].decode('utf-8', 'replace')
    js = {p: text(p) for p in files if p.endswith('.js') and p not in BASE and p.split('/')[0] not in SKIP_DIRS and p not in taken and not p.startswith('kit/')}
    css = {p: text(p) for p in files if p.endswith('.css') and p not in taken and not p.startswith('kit/')}
    ns = A.opt(a, '--ns') or namespace(js)
    prov = {p: provides_of(strip_js(t), ns) for p, t in js.items()}
    owner = {}
    for p, s in prov.items():
        for n in s: owner.setdefault(n.split('.')[1] if ns and n.startswith(ns + '.') else n, p)
    cls = {p: css_classes(t) for p, t in css.items()}
    defined_in = {}
    for p, s in cls.items():
        for c in s: defined_in.setdefault(c, set()).add(p)
    stem = lambda p: os.path.splitext(os.path.basename(p))[0]
    cands, found = {}, {}
    for p, t in js.items():     # pass 1: which stylesheets each script seems to use; one used by more than two scripts, without a name match, is shared
        body = strip_js(t); w = set(re.findall(r'[A-Za-z][\w-]*', body))
        found[p] = [c for c, s in cls.items() if stem(c) == stem(p) or (not any(stem(c) == stem(q) for q in js) and len({x for x in s if defined_in[x] == {c} and (len(x) > 4 or '-' in x)} & w) >= 2)]
    shared_css = {c for c in css if not any(stem(c) == stem(q) for q in js) and sum(c in v for v in found.values()) > 2}
    claimed = set()
    for p, t in js.items():
        body, al = strip_js(t), aliases(strip_js(t), ns)
        need, members = {}, set()
        for name, o in owner.items():
            if o == p: continue
            hit = re.search(r'(?<![\w.])(?:window\.)?%s\.%s\b' % (re.escape(ns), re.escape(name)), body) if ns else None
            via = [k for k, v in al.items() if v == name and re.search(r'(?<![\w.])%s\.' % re.escape(k), body)]
            if hit or via or (not ns and re.search(r'\b%s\b' % re.escape(name), body)): need[o] = need.get(o, set()) | {name}
        for m in re.finditer(r'(?<![\w.])(?:window\.)?%s\.(\w+)\.(\w+)' % re.escape(ns or '\0'), body):
            if owner.get(m.group(1)) not in (None, p): members.add('%s.%s.%s' % (ns, m.group(1), m.group(2)))
        words_in = set(re.findall(r'[A-Za-z][\w-]*', body))
        mine_css = [c for c in found[p] if c not in shared_css]; claimed |= set(mine_css)
        kit = sorted({m.group(0) for m in re.finditer(r'\bKit\.\w+', body)})
        part = re.search(r'/\*\s*part:([\w.-]+)', t)
        dom = bool(re.search(r'document\.|createElement|querySelector|innerHTML|\.append\(', body)) or bool(mine_css)
        owned_cls = sorted({x for c in mine_css for x in cls[c] if defined_in[x] == {c}})
        tok_used = sorted({v for c in mine_css for v in css_vars(css[c], 'used')})
        fs = [p] + mine_css
        summ = header_of(t)
        cands[p] = {
            'id': 'c.' + stem(p), 'name': stem(p), 'kind_hint': 'ui' if dom else 'logic', 'suggested_id': ('pattern.' if dom else 'kit.') + stem(p),
            'state': 'detected', 'part': part.group(1) if part else '', 'summary': summ,
            'files': [{'path': f, 'sha256': sha(files[f]), 'bytes': len(files[f])} for f in fs], 'bytes': sum(len(files[f]) for f in fs),
            'provides': sorted(prov[p]), 'needs': sorted(need, key=str), '_need_names': {k: sorted(v) for k, v in need.items()},
            'kit_uses': kit, 'globals': sorted({g for g in re.findall(r'\b(?:marked|DOMPurify|mermaid|htmPreact)\b', body)}),
            'classes': owned_cls[:300], 'ids': dom_ids(body), 'tokens': tok_used, 'regions': regions(t),
            'coupling': len(members) + sum(len(v) for v in need.values()), 'standalone': not need and not members,
            'similar': similar(stem(p), prov[p], summ, entries),
        }
    byfile = {p: c['id'] for p, c in cands.items()}
    for p, c in cands.items():
        c['needs'] = sorted(byfile[o] for o in c['needs']); c['needs_names'] = c.pop('_need_names')
        c['needs_names'] = {byfile[k]: v for k, v in c['needs_names'].items()}
    ids = {c['id']: c for c in cands.values()}
    for c in ids.values(): c['needed_by'] = sorted(o['id'] for o in ids.values() if c['id'] in o['needs'])
    shared = [{'path': p, 'bytes': len(files[p]), 'used_by': sorted(byfile[q] for q, v in found.items() if p in v),
               'classes': len(cls[p]), 'tokens_defined': len(css_vars(css[p], 'def'))} for p in css if p not in claimed]
    out = {'schema': CAND, 'subject': {'dir': os.path.abspath(d), 'name': os.path.basename(os.path.abspath(d).rstrip('/')), 'files': len(files), 'bytes': sum(map(len, files.values()))},
           'namespace': ns, 'candidates': sorted(cands.values(), key=lambda c: -c['bytes']), 'shared_css': shared,
           'taken': sorted(p for p in files if p in taken or p.startswith('kit/')), 'base': sorted(p for p in files if p in BASE or p.split('/')[0] in SKIP_DIRS),
           'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    into = A.opt(a, '--into')
    if into:       # the adopter serves the subject's own files so its preview frame is same-origin (docs/adopt.md)
        for rel, b in files.items():
            dst = os.path.join(into, 'subject', rel); os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(b)
        json.dump(out, open(os.path.join(into, 'subject', 'candidates.json'), 'w'), indent=1)
    where = A.opt(a, '--out')
    if into and not where: where = os.path.join(into, 'subject', 'candidates.json')
    if where: json.dump(out, open(where, 'w'), indent=1); out = {'wrote': where, 'candidates': len(out['candidates']), 'namespace': ns, 'shared_css': len(shared)}
    return A.emit(out)


# ---- the contract: any analyzer (extract, or an agent that read the artifact) writes this file (docs/adopt.md, "The analysis contract") ----

STATES = ('detected', 'selected', 'working', 'preview', 'ready', 'discarded')
KIND_ID = re.compile(r'(kit|layout|pattern|viz|theme|runtime|template|guide)\.[a-z0-9][a-z0-9-]*')
CID = re.compile(r'[a-z0-9][a-z0-9._-]*')


def validate_candidates(doc, subject=None):
    """-> {errors, warnings}: what makes the board or the picker misbehave, each with the candidate and the field."""
    err, warn = [], []
    e = lambda c, f, m: err.append({'candidate': c, 'field': f, 'problem': m})
    w = lambda c, f, m: warn.append({'candidate': c, 'field': f, 'problem': m})
    if not isinstance(doc, dict) or doc.get('schema') != CAND: return {'errors': [{'candidate': None, 'field': 'schema', 'problem': 'must be "%s"' % CAND}], 'warnings': []}
    cs = doc.get('candidates')
    if not isinstance(cs, list) or not cs: return {'errors': [{'candidate': None, 'field': 'candidates', 'problem': 'a non-empty list'}], 'warnings': []}
    ids = [c.get('id') for c in cs if isinstance(c, dict)]
    owner_cls, owner_path = {}, {}
    for i, c in enumerate(cs):
        if not isinstance(c, dict): e(None, 'candidates[%d]' % i, 'not an object'); continue
        cid = c.get('id')
        if not isinstance(cid, str) or not CID.fullmatch(cid): e(cid, 'id', 'lowercase letters, digits, dot, dash or underscore'); continue
        if ids.count(cid) > 1: e(cid, 'id', 'appears more than once')
        if not c.get('name'): e(cid, 'name', 'required: the word on the node')
        if c.get('state', 'detected') not in STATES: e(cid, 'state', 'one of ' + ', '.join(STATES))
        if c.get('suggested_id') and not KIND_ID.fullmatch(c['suggested_id']): e(cid, 'suggested_id', 'kind.name, kind one of kit layout pattern viz theme runtime template guide')
        fs = c.get('files')
        if not isinstance(fs, list) or not fs: e(cid, 'files', 'a non-empty list of {path, sha256?, bytes?}')
        for f in fs if isinstance(fs, list) else []:
            p = f.get('path') if isinstance(f, dict) else None
            if not isinstance(p, str) or not safe(p): e(cid, 'files', 'unsafe or missing path %r' % (p,)); continue
            owner_path.setdefault(p, []).append(cid)
            if subject is not None:
                fp = os.path.join(subject, p)
                if not os.path.isfile(fp): e(cid, 'files', '%s is not in the subject folder' % p)
                elif f.get('sha256') and sha(open(fp, 'rb').read()) != f['sha256']: e(cid, 'files', '%s differs from its sha256: the subject changed since the analysis' % p)
        for k in ('provides', 'needs', 'classes', 'ids'):
            if k in c and not (isinstance(c[k], list) and all(isinstance(x, str) for x in c[k])): e(cid, k, 'a list of strings')
        for n in c.get('needs') or []:
            if n == cid: e(cid, 'needs', 'needs itself')
            elif n not in ids: e(cid, 'needs', '%s is not a candidate id (the map draws no edge to it)' % n)
        for k in c.get('classes') or []: owner_cls.setdefault(k, []).append(cid)
        if not (c.get('classes') or c.get('ids')): w(cid, 'classes', 'no classes or ids: the preview picker can never select this candidate by clicking')
    for k, o in owner_cls.items():
        if len(o) > 1: w(o[0], 'classes', 'class %s is listed by %s; the first one wins in the picker' % (k, ', '.join(o)))
    for p, o in owner_path.items():
        if len(o) > 1: w(o[0], 'files', '%s belongs to %s: it would be packed more than once' % (p, ', '.join(o)))
    seen, state = set(), {}
    by = {c['id']: c for c in cs if isinstance(c, dict) and isinstance(c.get('id'), str)}
    def dfs(x, trail):
        if state.get(x) == 2 or x in seen: return
        if state.get(x) == 1: w(x, 'needs', 'cycle: ' + ' -> '.join(trail + [x])); seen.add(x); return
        state[x] = 1
        for n in by.get(x, {}).get('needs') or []:
            if n in by: dfs(n, trail + [x])
        state[x] = 2
    for x in by: dfs(x, [])
    return {'errors': err, 'warnings': warn}


def candidates_cmd(a):
    pos = A.bare(a[1:])
    if len(pos) != 1 or not os.path.isfile(pos[0]): sys.exit('usage: adp.py candidates FILE [--subject DIR]   (checks an adopt-candidates/1 file, from extract or written by an agent)')
    sd = A.opt(a, '--subject')
    if sd and not os.path.isdir(sd): sys.exit('--subject: no folder ' + sd)
    try: doc = json.load(open(pos[0], encoding='utf-8'))
    except ValueError as x: A.emit({'ok': False, 'errors': [{'candidate': None, 'field': 'file', 'problem': 'not JSON: %s' % x}], 'warnings': []}); return 1
    r = validate_candidates(doc, sd); r['ok'] = not r['errors']; r['candidates'] = len(doc.get('candidates', [])) if isinstance(doc, dict) else 0
    r['checked_files'] = bool(sd)
    A.emit(r); return 0 if r['ok'] else 1


# ---- pack and unpack ----

def safe(p):
    return bool(p) and not p.startswith('/') and '..' not in p.split('/') and '\\' not in p


def new_file_patch(path, data, root):
    t = data.decode('utf-8'); lines = t.splitlines(keepends=True); n = len(lines)
    out = ['diff --git a/%s%s b/%s%s\n' % (root, path, root, path), 'new file mode 100644\n', '--- /dev/null\n', '+++ b/%s%s\n' % (root, path)]
    if n: out.append('@@ -0,0 +1,%d @@\n' % n)
    for i, l in enumerate(lines):
        out.append('+' + l if l.endswith('\n') else '+' + l + '\n\\ No newline at end of file\n')
    return ''.join(out)


def pack_cmd(a):
    pos = A.bare(a[1:])
    if len(pos) != 2 or not os.path.isdir(pos[1]): sys.exit('usage: adp.py pack ENTRY_ID STAGING_DIR [--candidates candidates.json --cid c.picker] [--version 0.1.0] [--requires id,id] [--out FILE.adp.json]\n  STAGING_DIR holds the entry files laid out as under skill/catalog/ (kit/patterns/x.js, ...)')
    eid, d = pos; files = walk(d)
    if not files: sys.exit('error: %s has no files' % d)
    bad = [p for p in files if not safe(p)]
    if bad: sys.exit('error: unsafe paths: ' + ', '.join(bad))
    rows = []
    for p in sorted(files):
        try: files[p].decode('utf-8')
        except UnicodeDecodeError: sys.exit('error: %s is not UTF-8 text' % p)
        rows.append({'path': p, 'sha256': sha(files[p]), 'bytes': len(files[p]), 'text': files[p].decode('utf-8')})
    header = any(re.search(r'@id\s+%s\b' % re.escape(eid), r['text']) for r in rows)
    prov = {'candidate': A.opt(a, '--cid', ''), 'subject': '', 'from': []}
    cp = A.opt(a, '--candidates')
    if cp:
        c = json.load(open(cp)); prov['subject'] = c.get('subject', {}).get('name', '')
        hit = [x for x in c.get('candidates', []) if x['id'] == prov['candidate']]
        if not hit: sys.exit('error: no candidate %s in %s' % (prov['candidate'], cp))
        prov['from'] = [{'path': f['path'], 'sha256': f['sha256']} for f in hit[0]['files']]
        if hit[0].get('state') not in ('ready', 'preview', 'working'): print('warning: candidate state is %s, not ready' % hit[0].get('state'), file=sys.stderr)
    root = 'skill/catalog/'
    pk = {'schema': PACK, 'id': eid, 'kind': eid.split('.')[0], 'version': A.opt(a, '--version', '0.1.0'),
          'requires': [x for x in (A.opt(a, '--requires', '') or '').split(',') if x], 'header': header,
          'files': rows, 'provenance': prov, 'patch': ''.join(new_file_patch(r['path'], files[r['path']], root) for r in rows),
          'created': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    where = A.opt(a, '--out') or eid + '.adp.json'
    json.dump(pk, open(where, 'w'), indent=1, ensure_ascii=False)
    return A.emit({'wrote': where, 'id': eid, 'files': len(rows), 'bytes': sum(r['bytes'] for r in rows), 'sha256': sha(open(where, 'rb').read()), 'header': header,
                   'next': None if header else 'the main file has no `@id %s` header comment (docs/catalog-header.md); add it before the pack goes into a catalog' % eid})


def read_pack(path):
    pk = json.load(open(path, encoding='utf-8'))
    if pk.get('schema') != PACK: sys.exit('error: %s is not an %s file' % (path, PACK))
    return pk


def verify(pk):
    probs = []
    for r in pk.get('files', []):
        if not safe(r.get('path', '')): probs.append('unsafe path ' + str(r.get('path'))); continue
        b = r.get('text', '').encode('utf-8')
        if sha(b) != r.get('sha256'): probs.append('sha256 mismatch ' + r['path'])
        if len(b) != r.get('bytes'): probs.append('size mismatch ' + r['path'])
    want = ''.join(new_file_patch(r['path'], r['text'].encode(), 'skill/catalog/') for r in pk.get('files', []) if safe(r.get('path', '')))
    if pk.get('patch') != want: probs.append('patch does not match the files')
    return probs


def unpack_cmd(a):
    pos = A.bare(a[1:])
    if len(pos) != 1 or not os.path.isfile(pos[0]): sys.exit('usage: adp.py unpack FILE.adp.json [--to DIR] [--apply REPO]   (without options: verify only)')
    pk = read_pack(pos[0]); probs = verify(pk); res = {'id': pk.get('id'), 'version': pk.get('version'), 'files': [r['path'] for r in pk.get('files', [])], 'ok': not probs, 'problems': probs}
    if probs: A.emit(res); return 1
    to, repo = A.opt(a, '--to'), A.opt(a, '--apply')
    if to:
        for r in pk['files']:
            p = os.path.join(to, r['path']); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w', encoding='utf-8', newline='').write(r['text'])
        res['wrote'] = to
    if repo:
        with tempfile.NamedTemporaryFile('w', suffix='.patch', delete=False, newline='') as f: f.write(pk['patch'])
        for flags in (['--check'], []):
            g = subprocess.run(['git', '-C', repo, 'apply'] + flags + [f.name], capture_output=True, text=True)
            if g.returncode: res['ok'] = False; res['problems'] = [g.stderr.strip()]; os.unlink(f.name); A.emit(res); return 1
        os.unlink(f.name); res['applied'] = repo
        res['next'] = 'python3 -I skill/scripts/adp_catalog.py build && python3 -I skill/scripts/adp_catalog.py'
    return A.emit(res)
