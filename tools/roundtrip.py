#!/usr/bin/env python3
"""Roundtrip checks of the ADP catalog and its tooling (repo-only: it checks the catalog, it is not part of the skill).

  python3 -I tools/roundtrip.py [SKILL_DIR] [--require-node] [--only 1,2,8]

SKILL_DIR holds scripts/ and catalog/ (default: the adp skill of this repo, plugins/artifacts-done-properly/skills/adp). Read-only on it: everything the checks write goes to a temp folder
that is removed at the end. Exit 0 when no check failed. A check that needs node (3 and 6) is skipped without it, and fails with
--require-node or when the CI environment variable is set. It needs no git history.

  1 headers -> index -> headers    build twice into a copy: the bytes of catalog.json on disk; every index field equals its header
  2 index -> files                 every listed file: on disk, size, sha256, role, entry hash; no orphan files; what index.html loads exists
  3 python <-> js header parity    adp_lib and the page's parts/files.js read every header the same (node)
  4 take (files map)               take for every entry: the requires closure, files exist and carry the index sha256, within 255/256
  5 kit show/describe + suggest    every entry's about comes from its header; suggest finds an entry by words of its own summary
  6 seed (new --data -> loader)    adp.py new + --data, then the real seedFromFile of adp.js against a stub db writes exactly the source docs (node)
  7 previews: sample references    every @preview sample resolves: a file, or a key of a bundle; no bundle key left unreferenced
  8 take: owned samples            @samples keys exist and are owned; take gives an entry its bundle by reference and names only its own path#key
"""
import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import traceback

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://claude.ai/artifact/roundtrip-test'
NODE = shutil.which('node')
PY = sys.executable
SKILL = SCRIPTS = CAT = CATJSON = WORK = None
REQUIRE_NODE = False
lib = adp = None


def setup(skill):
    """Point the module at a skill folder, a temp work folder and an empty ADP_HOME (adp.py reads ~/.adp), and import its scripts."""
    global SKILL, SCRIPTS, CAT, CATJSON, WORK, lib, adp
    SKILL = os.path.abspath(skill)
    SCRIPTS, CAT = os.path.join(SKILL, 'scripts'), os.path.join(SKILL, 'catalog')
    CATJSON = os.path.join(CAT, 'catalog.json')
    if not os.path.isdir(os.path.join(CAT, 'kit')) or not os.path.isfile(CATJSON): sys.exit(f'roundtrip: {SKILL} has no scripts/ and catalog/kit/ with a catalog.json')
    WORK = tempfile.mkdtemp(prefix='adp-roundtrip-')
    os.makedirs(os.path.join(WORK, 'home'))
    os.environ['ADP_HOME'] = os.path.join(WORK, 'home')
    sys.dont_write_bytecode = True
    sys.path.insert(0, SCRIPTS)
    import adp_lib
    import adp as adp_cmd
    lib, adp = adp_lib, adp_cmd


def load_index():
    with open(CATJSON, encoding='utf-8') as f:
        return json.load(f)


def read(p):
    with open(p, encoding='utf-8', errors='replace') as f:
        return f.read()


def call(fn, args):
    """Run an adp.py command in-process: (exit code or message, stdout text, stderr text)."""
    out, err, code = io.StringIO(), io.StringIO(), 0
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            r = fn(args)
            code = r or 0
        except SystemExit as e:
            code = e.code if e.code is not None else 0
    return code, out.getvalue(), err.getvalue()


def last_json(text):
    lines = [x for x in text.splitlines() if x.strip()]
    return json.loads(lines[-1]) if lines else None


def sh(cmd, cwd=None, env=None):
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def header_of(e):
    return lib.parse_header(read(os.path.join(CAT, e['main'])), e['main'])


def first(items, n=5):
    items = list(items)
    return ', '.join(map(str, items[:n])) + (f' ... (+{len(items) - n})' if len(items) > n else '')


def no_node(what):
    """(status, info, fails) for a check that needs node when there is none: a skip, or a failure when node is required."""
    return (False if REQUIRE_NODE else None), what, ([what] if REQUIRE_NODE else [])


# ------------------------------------------------------------------------------------------------------------------------ 1
def c1():
    idx = load_index(); fails, info = [], []
    tmp = os.path.join(WORK, 'c1'); shutil.copytree(CAT, tmp, ignore=shutil.ignore_patterns('__pycache__'))
    with open(CATJSON, 'rb') as f: orig = f.read()
    runs = []
    for n in (1, 2):
        rc, so, se = sh([PY, '-I', os.path.join(SCRIPTS, 'adp_catalog.py'), 'build', tmp])
        if rc:
            return False, f'build #{n} failed (exit {rc})', [(so + se).strip()[-600:]]
        with open(os.path.join(tmp, 'catalog.json'), 'rb') as f: runs.append(f.read())
    if runs[0] != orig:
        d = lib.differences(json.loads(orig), json.loads(runs[0]))
        fails.append(f'build output differs from the catalog.json on disk ({len(runs[0])} vs {len(orig)} bytes): ' + first(d, 4))
    if runs[1] != runs[0]:
        fails.append('a second build changed the bytes of the first')
    info.append(f'build x2 into a temp copy: {"identical to disk" if runs[0] == orig else "DIFFERS from disk"}; second == first: {runs[1] == runs[0]}')
    want_keys = {'id', 'kind', 'group', 'name', 'summary', 'tags', 'status', 'version', 'requires', 'globals', 'provides', 'main', 'files', 'hash'}
    bad = {}
    for e in idx['entries']:
        h = header_of(e); miss = []
        exp = {'id': h.get('id'), 'kind': h.get('kind', ''), 'group': h.get('group', ''), 'name': h.get('name', ''), 'summary': h.get('summary', ''),
               'tags': h.get('tags', []), 'status': h.get('status', ''), 'version': h.get('version', ''), 'requires': h.get('requires', []),
               'globals': h.get('globals', []), 'provides': h.get('provides', [])}
        for k in ('fonts', 'extends'):
            if h.get(k): exp[k] = h[k]
        miss += [k for k, v in exp.items() if e.get(k) != v]
        extra = set(e) - want_keys - {'fonts', 'extends'}
        miss += ['unexpected key ' + k for k in sorted(extra)]
        paths = [e['main']] + [lib._inside(g) for g in h.get('files', [])]
        if [f['path'] for f in e['files']] != paths: miss.append('files')
        if miss: bad[e['id']] = miss
    if bad: fails.append(f'{len(bad)} entries whose index fields differ from their header: ' + first(f'{i}[{",".join(m)}]' for i, m in bad.items()))
    info.append(f'{len(idx["entries"])} entries compared field by field with their main-file header')
    return not fails, '; '.join(info), fails


# ------------------------------------------------------------------------------------------------------------------------ 2
def c2():
    idx = load_index(); fails, listed = [], {}
    for e in idx['entries']:
        if not e['files'] or e['files'][0]['path'] != e['main']: fails.append(f"{e['id']}: main is not files[0]")
        for f in e['files']:
            p = os.path.join(CAT, f['path'])
            if not os.path.isfile(p): fails.append(f"{e['id']}: {f['path']} is not on disk"); continue
            if os.path.getsize(p) != f['bytes']: fails.append(f"{e['id']}: {f['path']} bytes {os.path.getsize(p)} != {f['bytes']}")
            if lib.sha256(p) != f['sha256']: fails.append(f"{e['id']}: {f['path']} sha256 differs")
            if lib._role(f['path']) != f['role']: fails.append(f"{e['id']}: {f['path']} role {f['role']} != {lib._role(f['path'])}")
            listed.setdefault(f['path'], set()).add(f['sha256'])
        if lib.entry_hash(e['files']) != e['hash']: fails.append(f"{e['id']}: entry hash differs")
    twice = [p for p, s in listed.items() if len(s) > 1]
    if twice: fails.append('listed with different hashes: ' + first(twice))
    tree = sorted(os.path.relpath(os.path.join(d_, n), CAT).replace(os.sep, '/') for d_, ds, ns in os.walk(CAT) for n in ns
                  if not n.startswith('.') and '__pycache__' not in d_)
    page = read(os.path.join(CAT, 'index.html'))
    loaded = {m for m in re.findall(r'<(?:script|link)\b[^>]*?(?:src|href)="([^"#?:]+)"', page) if '//' not in m}        # what the page itself loads (scripts and stylesheets; a plain link, as About ADP, is optional)
    missing = sorted(p for p in loaded if not os.path.isfile(os.path.join(CAT, p)))
    if missing: fails.append('index.html loads files that are not there: ' + first(missing))
    orphans = sorted(set(tree) - set(listed) - loaded - {'index.html', 'catalog.json'})
    if orphans: fails.append(f'{len(orphans)} files in the tree that no entry lists and index.html does not load: ' + first(orphans))
    rc, so, se = sh([PY, '-I', os.path.join(SCRIPTS, 'adp_catalog.py'), CAT])
    tail = (so + se).strip().splitlines()[-1:] or ['']
    if rc: fails.append(f'adp_catalog.py check exits {rc}: ' + first((so + se).strip().splitlines(), 3))
    total = sum(len(e['files']) for e in idx['entries'])
    info = f'{len(idx["entries"])} entries, {total} entry files ({len(listed)} unique paths), tree {len(tree)} files ({len(loaded)} loaded by index.html); adp_catalog check: {tail[0][:110]}'
    return not fails, info, fails


# ------------------------------------------------------------------------------------------------------------------------ 3
PARITY_JS = r"""
const fs = require('fs'), path = require('path');
const [root, mainsFile, outFile, filesJs] = process.argv.slice(2);
global.window = {}; global.document = {};
global.fetch = async p => { const f = path.join(root, p); if (!fs.existsSync(f)) return {ok: false, status: 404, text: async () => ''};
  return {ok: true, status: 200, text: async () => fs.readFileSync(f, 'utf8')}; };
require(filesJs);
(async () => { const mains = JSON.parse(fs.readFileSync(mainsFile, 'utf8')), out = {};
  for (const [id, p] of Object.entries(mains)) out[id] = await window.CatalogFiles.header(p);
  fs.writeFileSync(outFile, JSON.stringify(out)); })().catch(e => { console.error(e); process.exit(1); });
"""


def c3():
    if not NODE: return no_node('node is not installed: not run')
    filesjs = os.path.join(CAT, 'parts', 'files.js')
    if not os.path.isfile(filesjs): return False, 'catalog/parts/files.js not found', ['catalog/parts/files.js not found']
    idx = load_index(); w = os.path.join(WORK, 'c3'); os.makedirs(w)
    with open(os.path.join(w, 'mains.json'), 'w') as f: json.dump({e['id']: e['main'] for e in idx['entries']}, f)
    with open(os.path.join(w, 'parity.js'), 'w') as f: f.write(PARITY_JS)
    rc, so, se = sh([NODE, os.path.join(w, 'parity.js'), CAT, os.path.join(w, 'mains.json'), os.path.join(w, 'js.json'), filesjs])
    if rc: return False, 'node failed', [se.strip()[-500:]]
    with open(os.path.join(w, 'js.json'), encoding='utf-8') as f: js = json.load(f)
    keys = ('about', 'globals', 'source', 'changed', 'preview', 'updated'); per = {k: [] for k in keys}; other = {}; fails = []
    for e in idx['entries']:
        py = json.loads(json.dumps(header_of(e))); j = js.get(e['id'], {})
        for k in sorted(set(py) | set(j)):
            if py.get(k) != j.get(k):
                (per[k] if k in per else other.setdefault(k, [])).append(e['id'])
    for k in keys:
        if per[k]: fails.append(f'{k}: {len(per[k])} differ ({first(per[k], 3)})')
    for k, v in other.items(): fails.append(f'{k}: {len(v)} differ ({first(v, 3)})')
    return not fails, f'{len(idx["entries"])} headers parsed by adp_lib and by files.js; compared every key (incl. {", ".join(keys)}; globals is the page\'s "needs")', fails


# ------------------------------------------------------------------------------------------------------------------------ 4
def c4():
    idx = load_index(); by = {e['id']: e for e in idx['entries']}; fails, sizes, flags = [], {}, []
    cj = CATJSON

    def closure(i, seen=None):
        seen = {} if seen is None else seen
        if i in seen: return seen
        seen[i] = True
        for r in by[i].get('requires', []): closure(r, seen)
        return seen
    for i in by:
        code, out, err = call(adp.take, ['take', cj, i, '--url', URL])
        if code: fails.append(f'{i}: take exits {code}: {out.strip()[:120] or err.strip()[:120]}'); continue
        t = last_json(out); ents, files = t['entries'], t['files']
        want = set(closure(i))
        if len(ents) != len(set(ents)): fails.append(f'{i}: an entry listed twice in take')
        if set(ents) != want: fails.append(f'{i}: take entries {sorted(set(ents) ^ want)[:4]} differ from the requires closure')
        pos = {x: n for n, x in enumerate(ents)}
        if any(r not in pos or pos[r] > pos[x] for x in ents for r in by[x].get('requires', [])): fails.append(f'{i}: a requirement comes after what needs it')
        exp = {}
        for d in want:
            for f in by[d]['files']:
                if f['role'] == 'sample': continue            # the samples an entry owns are check 8's
                if f['path'] in exp and exp[f['path']] != f['sha256']: fails.append(f'{i}: {f["path"]} listed with two hashes in the closure')
                exp[f['path']] = f['sha256']
        files = {p: v for p, v in files.items() if not p.startswith('kit/samples/')}
        if set(files) != set(exp): fails.append(f'{i}: files map {sorted(set(files) ^ set(exp))[:3]} differs from the closure files')
        for p in files:
            if not os.path.isfile(os.path.join(CAT, p)): fails.append(f'{i}: {p} not on disk')
            if files[p] != {'artifact': URL, 'path': p}: fails.append(f'{i}: {p} reference is {files[p]}')
            if t['sha256'].get(p) != exp.get(p): fails.append(f'{i}: sha256 of {p} differs from the index')
        sizes[i] = len(files)
        if len(files) > 255: fails.append(f'{i}: files map has {len(files)} entries (a publish takes 255)')
        if len(files) > lib.READ_MAX: fails.append(f'{i}: {len(files)} paths to read (a read takes {lib.READ_MAX})')
    code, out, err = call(adp.take, ['take', cj, *by, '--url', URL])
    allm = last_json(out)['files'] if not code else {}
    mains = len({e['main'] for e in idx['entries']})
    flags.append(f'ALL {len(by)} ids in one take: {len(allm)} files ({"over" if len(allm) > 255 else "within"} the 255 of one publish, {"over" if len(allm) > lib.READ_MAX else "within"} the {lib.READ_MAX} of one read)')
    flags.append(f'the {mains} main files (their headers) in one read: {"within" if mains <= lib.READ_MAX else "OVER"} {lib.READ_MAX}')
    if mains > lib.READ_MAX: fails.append(f'{mains} main files exceed {lib.READ_MAX} paths of one read')
    top = sorted(sizes.items(), key=lambda x: -x[1])[:3]
    return not fails, f'take run for {len(sizes)} entries; largest: ' + ', '.join(f'{i}={n}' for i, n in top) + ' | ' + ' | '.join(flags), fails


# ------------------------------------------------------------------------------------------------------------------------ 5
def c5():
    idx = load_index(); fails = []; skipped = 0; m1, m10, first2 = [], [], []
    df = {}
    for e in idx['entries']:
        for w in set(adp.WORD.findall(e['summary'].lower())): df[w] = df.get(w, 0) + 1
    for e in idx['entries']:
        i, h = e['id'], header_of(e)
        code, out, err = call(adp.kit, ['kit', 'show', i, CATJSON])
        s = last_json(out) if not code else None
        if not s: fails.append(f'{i}: kit show failed ({code})'); continue
        if not s.get('about'): fails.append(f'{i}: kit show has no about')
        elif s['about'] != h.get('about'): fails.append(f'{i}: kit show about differs from its header')
        for k in ('status', 'version'):
            if s.get(k) != h.get(k): fails.append(f'{i}: kit show {k} {s.get(k)!r} != header {h.get(k)!r}')
        if s['files'] != [f['path'] for f in e['files']]: fails.append(f'{i}: kit show files differ from the index')
        if 'note' in s or 'fetch' in s: fails.append(f'{i}: kit show asks for a fetch of a header that is on disk')
        code, out, err = call(adp.kit, ['kit', 'describe', i, CATJSON])
        d = last_json(out) if not code else None
        if not d: fails.append(f'{i}: kit describe failed ({code})'); continue
        nons = [f['path'] for f in e['files'] if f['role'] != 'sample']; smp = [f['path'] for f in e['files'] if f['role'] == 'sample']
        if d['files'] != nons: fails.append(f'{i}: kit describe files differ from the index')
        if d['sample'] != (smp[0] if smp else None): fails.append(f'{i}: kit describe sample {d["sample"]!r}')
        if d['requires'] != e['requires'] or d['provides'] != e['provides'] or d['needs'] != e['globals']: fails.append(f'{i}: kit describe requires/provides/needs differ')
        if h.get('db') and d.get('db') != h['db']: fails.append(f'{i}: kit describe db differs from its header')
        ws = list(dict.fromkeys(w for w in adp.WORD.findall(e['summary'].lower()) if w not in adp.STOP and len(w) >= 4))
        if len(ws) < 2: skipped += 1; continue
        naive = ws[:2]
        ws = sorted(ws, key=lambda w: (df.get(w, 0), ws.index(w)))[:2]      # its two rarest summary words in the catalog
        code, out, err = call(adp.suggest, ['suggest', CATJSON, '--for', ' '.join(naive), '--n', '3'])
        if i not in [x['id'] for x in (last_json(out) if not code else []) or []]: first2.append(i)
        for n, lst in ((3, m1), (10, m10)):
            code, out, err = call(adp.suggest, ['suggest', CATJSON, '--for', ' '.join(ws), '--n', str(n)])
            r = last_json(out) if not code else []
            if i not in [x['id'] for x in r or []]: lst.append(f'{i}({" ".join(ws)})')
    if m1: fails.append(f'suggest --for <2 words of its own summary> (--n 3) does not return {len(m1)} entries: ' + first(m1))
    n = len(idx['entries'])
    return not fails, f'{n} x kit show + kit describe against headers; suggest by its 2 rarest summary words: found {n - skipped - len(m1)}/{n - skipped} at --n 3, {n - skipped - len(m10)}/{n - skipped} at --n 10 ({skipped} summaries with <2 usable words skipped); for the record, the first 2 words of the summary find {n - skipped - len(first2)}/{n - skipped} at --n 3', fails


# ------------------------------------------------------------------------------------------------------------------------ 6
LOADER_JS = r"""
const fs = require('fs'), path = require('path');
const [dir, adpjs, outFile, preseed] = process.argv.slice(2);
const store = new Map(), order = [], errs = []; const user = {id: 'rt'}; const window = {};
if (preseed === '1') store.set('manifest/current', {already: true});
global.fetch = async p => { const f = path.join(dir, p); if (!fs.existsSync(f)) return {ok: false, status: 404, json: async () => null, text: async () => ''};
  return {ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')), text: async () => fs.readFileSync(f, 'utf8')}; };
const pushErr = m => errs.push(String(m));
const tour = () => ({step() {}, progress() {}, done() {}, fail(w) { errs.push('tour fail: ' + w); }});
const d = {doc: p => ({get: async () => ({exists: store.has(p)}), set: async data => { order.push(p); store.set(p, JSON.parse(JSON.stringify(data))); }})};
const src = fs.readFileSync(adpjs, 'utf8'), a = src.indexOf('async function seedFromFile(d){'), b = src.indexOf('/* ---------- page self-check');
if (a < 0 || b < a) { console.error('seedFromFile not found in adp.js'); process.exit(1); }
const AF = Object.getPrototypeOf(async function () {}).constructor;
const fn = new AF('d', 'fetch', 'pushErr', 'tour', 'user', 'window', 'let seeded = null;\n' + src.slice(a, b) + '\nawait seedFromFile(d); return seeded;');
fn(d, global.fetch, pushErr, tour, user, window).then(seeded => {
  fs.writeFileSync(outFile, JSON.stringify({docs: [...store], order, errs, seeded, adp_seed: window.ADP_SEED || null}));
}).catch(e => { console.error(e); process.exit(1); });
"""


def c6():
    if not NODE: return no_node('node is not installed: not run')
    idx = load_index(); fails = []
    t = next((e for e in idx['entries'] if e['id'] == 'template.tester'), None)
    cand = [f['path'] for f in (t or {}).get('files', []) if f['path'].endswith('tester.json')]
    if not cand: return False, 'no tester.json among the files of template.tester', ['template.tester or its tester.json sample is missing']
    data = os.path.join(CAT, cand[0]); page = os.path.join(WORK, 'page')
    env = dict(os.environ, ADP_HOME=os.path.join(WORK, 'home'))
    rc, so, se = sh([PY, '-I', os.path.join(SCRIPTS, 'adp.py'), 'new', '--tier', 'minimal', page, '--title', 'Roundtrip', '--theme', 'default',
                     '--catalog', CATJSON, '--data', data, '--by', 'roundtrip'], env=env)
    if rc: return False, f'adp.py new exits {rc}', [(so + se).strip()[-700:]]
    rc, so, se = sh([PY, '-I', os.path.join(SCRIPTS, 'adp.py'), 'check', page], env=env)
    if rc: fails.append(f'adp.py check on the new page exits {rc}: ' + (so + se).strip()[-300:])
    # the source of truth, read here without adp.py's own helpers
    MARK = re.compile(r'(?:<!--|/\*)\s*(/?)part:([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)\s*(?:-->|\*/)')
    opened, closed = set(), set()
    for d_, _, names in os.walk(page):
        if os.path.relpath(d_, page).split(os.sep)[0] in ('seed', '.adp-dev'): continue
        for n in names:
            if n.endswith(('.html', '.js', '.mjs', '.css')) and n != 'adp.js':
                for m in MARK.finditer(read(os.path.join(d_, n))): (closed if m.group(1) else opened).add(m.group(2))
    parts = opened & closed
    cm = re.search(r'window\.ADP_CONTENT\s*=\s*(\{.*\})\s*;', read(os.path.join(page, 'content.js')), re.S)
    content = json.loads(cm.group(1)) if cm else {}
    with open(data, encoding='utf-8') as f: given = json.load(f)
    given = given.get('docs', given) if isinstance(given, dict) else given
    with open(os.path.join(page, 'seed.json'), encoding='utf-8') as f: seed = json.load(f)
    packs = []
    for p in seed['packs']:
        with open(os.path.join(page, p), encoding='utf-8') as f: packs.append(json.load(f))
    flat = [x for pk in packs for x in pk['docs']]
    keys = [(x['collection'], x['id']) for x in flat]
    if keys[-1] != ('manifest', 'current'): fails.append(f'the last doc of the last pack is {keys[-1]}, not manifest/current')
    if len(keys) != len(set(keys)): fails.append('a doc appears twice in the packs')
    if seed['docs'] != len(flat): fails.append(f'seed.json says {seed["docs"]} docs, the packs hold {len(flat)}')
    # run the real seedFromFile from the page's own adp.js against the page folder
    w = os.path.join(WORK, 'c6'); os.makedirs(w)
    with open(os.path.join(w, 'loader.js'), 'w') as f: f.write(LOADER_JS)
    res = {}
    for tag, pre in (('empty db', '0'), ('db with a manifest', '1')):
        out = os.path.join(w, f'out{pre}.json')
        rc, so, se = sh([NODE, os.path.join(w, 'loader.js'), page, os.path.join(page, 'adp.js'), out, pre])
        if rc: return False, 'the loader harness failed', [se.strip()[-600:]]
        with open(out, encoding='utf-8') as f: res[tag] = json.load(f)
    r = res['empty db']; store = {k: v for k, v in r['docs'] if k != 'status/seed'}
    if r['errs']: fails.append('loader reported: ' + first(r['errs'], 3))
    expect = {'changes/000001', 'manifest/current', 'agents/roundtrip'} | {f'parts/{p}' for p in parts} | {f'content/{k}' for k, v in content.items() if v.get('html', '')} \
        | {f'{x["collection"]}/{x["id"]}' for x in given}
    if set(store) != expect: fails.append('docs written != docs in source: ' + first(sorted(set(store) ^ expect), 5))
    writes = [p for p in r['order'] if p != 'status/seed'] or ['(nothing)']
    if writes[-1] != 'manifest/current' or writes.count('manifest/current') != 1: fails.append('manifest/current is not written exactly once, last')
    for x in given:
        if store.get(f'{x["collection"]}/{x["id"]}') != x['data']: fails.append(f'--data doc {x["collection"]}/{x["id"]} was not written as given')
    for k, v in content.items():
        d_ = store.get(f'content/{k}')
        if v.get('html', '') and (d_ is None or any(d_.get(f) != v[f] for f in v)): fails.append(f'content/{k} differs from content.js')
    man = store.get('manifest/current', {})
    pids = {p for p in parts if f'parts/{p}' in store}
    if set(man.get('parts', {})) - {p for p in man.get('parts', {}) if p.startswith('_rest')} != pids: fails.append('manifest.parts != the parts docs: ' + first(sorted(set(man.get('parts', {})) ^ pids), 4))
    for p in pids:
        if store[f'parts/{p}']['hash'] != man.get('parts', {}).get(p): fails.append(f'parts/{p}: hash differs from the manifest'); break
    ch = {x['id'] for x in store.get('changes/000001', {}).get('parts', [])}
    if ch != pids: fails.append('changes/000001 parts != parts docs')
    if set(man.get('content', {})) != set(content): fails.append('manifest.content != content.js ids')
    st = r['seeded'] or {}
    if st.get('state') != 'done' or st.get('docs') != len(flat) or st.get('packs') != len(packs): fails.append(f'status/seed {st}')
    r2 = res['db with a manifest']
    if r2['order'] or r2['errs']: fails.append(f'with a manifest in the db the loader still wrote {len(r2["order"])} docs / errors {r2["errs"][:1]}')
    cols = {}
    for c, _ in keys: cols[c] = cols.get(c, 0) + 1
    return not fails, f'adp.py new --tier minimal + theme default + --data {cand[0]}: {len(flat)} docs in {len(packs)} pack(s) {cols}; loader run from adp.js against a stub db (empty / already seeded); adp.py check rc={rc}', fails


# ------------------------------------------------------------------------------------------------------------------------ 7
def c7():
    idx = load_index(); fails = []; old = new = plain = 0; cache = {}; borrowed = {}
    listed = {f['path'] for e in idx['entries'] for f in e['files']}
    for e in idx['entries']:
        pv = header_of(e).get('preview')
        if pv is None: continue
        if not isinstance(pv, dict): fails.append(f"{e['id']}: @preview is not a JSON object"); continue
        own = {f['path'] for f in e['files']}
        for ref in pv.get('samples') or []:
            if '#' in ref:
                new += 1; b, k = ref.split('#', 1)
                if b not in listed: fails.append(f"{e['id']}: {ref}: bundle is not listed by any entry"); continue
                if b not in own: borrowed.setdefault(e['id'], []).append(ref)
                p = os.path.join(CAT, b)
                if not os.path.isfile(p): fails.append(f"{e['id']}: {ref}: bundle not on disk"); continue
                if b not in cache:
                    try:
                        with open(p, encoding='utf-8') as f: cache[b] = json.load(f)
                    except ValueError: cache[b] = None
                if not isinstance(cache[b], dict): fails.append(f"{e['id']}: {b} is not a JSON object")
                elif k not in cache[b]: fails.append(f"{e['id']}: {ref}: no key {k!r} in the bundle")
            else:
                old += 1
                if ref not in listed: fails.append(f"{e['id']}: {ref}: not listed by any entry")
                elif not os.path.isfile(os.path.join(CAT, ref)): fails.append(f"{e['id']}: {ref}: not on disk")
                else:
                    if ref not in own: borrowed.setdefault(e['id'], []).append(ref)
                    if ref.endswith('.json'):
                        try:
                            with open(os.path.join(CAT, ref), encoding='utf-8') as f: json.load(f)
                        except ValueError: fails.append(f"{e['id']}: {ref}: not valid JSON")
        if not pv.get('samples'): plain += 1
    if new:        # a bundle key nothing refers to
        refd = {(r.split('#')[0], r.split('#')[1]) for e in idx['entries'] for r in (header_of(e).get('preview') or {}).get('samples', []) if '#' in r}
        for b, d in cache.items():
            if isinstance(d, dict):
                dead = [k for k in d if (b, k) not in refd]
                if dead: fails.append(f'{b}: keys no header refers to: ' + first(dead))
    bor = sum(len(v) for v in borrowed.values())
    return not fails, f'sample references: {old} by path (old form), {new} by bundle#key (new form); {plain} previews with no sample; {bor} references to a sample that is not in the entry\'s own @files ({len(borrowed)} entries: {first(sorted(borrowed), 4)})', fails


# ------------------------------------------------------------------------------------------------------------------------ 8
def c8():
    """@samples names the keys an entry owns. Every key is in a bundle of the entry's own @files, every bundle key has an owner, and `take ID`
    puts the entry's bundle in the files map by reference only when the entry owns a key in it, names exactly its own path#key and nothing
    else, gives an entry that owns none no bundle and no `samples`, and leaves a plain (non-bundle) sample file as it was."""
    idx = load_index(); by = {e['id']: e for e in idx['entries']}
    heads = {i: header_of(e) for i, e in by.items()}
    bundles = {lib.split_ref(s)[0] for h in heads.values() for s in ((h.get('preview') or {}).get('samples') or [])
               if isinstance(s, str) and lib.split_ref(s)[1] is not None}
    fails, data = [], {}
    for b in sorted(bundles):
        try:
            with open(os.path.join(CAT, b), encoding='utf-8') as f: data[b] = json.load(f)
        except (OSError, ValueError): fails.append(f'{b}: not readable as JSON')
        else:
            if not isinstance(data[b], dict): fails.append(f'{b}: not a JSON object'); del data[b]
    owned, want = {}, {}
    for i, e in by.items():
        mine = [f['path'] for f in e['files'] if f['path'] in data]
        refs = []
        for k in heads[i].get('samples') or []:
            home = [b for b in mine if k in data[b]]
            if not home: fails.append(f'{i}: @samples {k} is in no bundle of its own @files'); continue
            refs.append(f'{home[0]}#{k}'); owned.setdefault((home[0], k), []).append(i)
        want[i] = sorted(refs)
    for b, d in data.items():
        dead = [k for k in d if (b, k) not in owned]
        if dead: fails.append(f'{b}: keys no entry owns (@samples): ' + first(dead))
    owners = plain = 0
    for i, e in by.items():
        code, out, err = call(adp.take, ['take', CATJSON, i, '--url', URL])
        if code: fails.append(f'{i}: take exits {code}'); continue
        res = last_json(out); files = res['files']
        got = sorted(p for p in files if p.startswith('kit/samples/'))
        plain_want = sorted(f['path'] for f in e['files'] if f['role'] == 'sample' and f['path'] not in bundles)
        expect = sorted({lib.split_ref(s)[0] for s in want[i]} | set(plain_want))
        if got != expect: fails.append(f'{i}: take gives sample files {first(got)}; expected {first(expect)}'); continue
        named = res.get('samples') or {}
        if set(named) - {i}: fails.append(f'{i}: take names samples of {sorted(set(named) - {i})}')
        if sorted(named.get(i, [])) != want[i]: fails.append(f'{i}: take names {named.get(i)}; expected {want[i]}')
        if not want[i] and 'samples' in res: fails.append(f'{i}: take has a samples field but the entry owns none')
        for p in got:
            if files[p] != {'artifact': URL, 'path': p}: fails.append(f'{i}: {p} reference is {files[p]}')
        owners += bool(want[i]); plain += len(plain_want)
    return not fails, f'{owners} entries own samples in {len(data)} bundles: take gives each its bundle by reference and names exactly its own path#key; the others get no bundle; {plain} plain sample files by reference', fails


CHECKS = [(1, 'headers -> index -> headers', c1), (2, 'index -> files', c2), (3, 'python <-> js header parity', c3), (4, 'take (files map)', c4),
          (5, 'kit show/describe + suggest', c5), (6, 'seed (new --data -> loader)', c6), (7, 'previews: sample references', c7), (8, 'take: owned samples', c8)]


def main(argv):
    global REQUIRE_NODE
    args = list(argv); only = None
    REQUIRE_NODE = '--require-node' in args or os.environ.get('CI', '').lower() in ('1', 'true', 'yes')
    if '--only' in args:
        i = args.index('--only')
        try: only = {int(x) for x in args[i + 1].split(',')}
        except (IndexError, ValueError): sys.exit('roundtrip: --only takes check numbers, e.g. --only 2,8')
        del args[i:i + 2]
    pos = [a for a in args if not a.startswith('--')]
    if len(pos) > 1 or any(a.startswith('--') and a != '--require-node' for a in args): sys.exit(__doc__)
    setup(pos[0] if pos else os.path.join(REPO, 'plugins', 'artifacts-done-properly', 'skills', 'adp'))
    rows, bad = [], False
    try:
        for n, name, fn in CHECKS:
            if only is not None and n not in only: continue
            try: ok, info, fails = fn()
            except Exception:
                ok, info, fails = False, 'the check itself crashed', [traceback.format_exc().strip().splitlines()[-1]]
            status = 'SKIP' if ok is None else 'PASS' if ok else 'FAIL'
            bad = bad or status == 'FAIL'
            rows.append((n, name, status, info, fails))
        print(f'roundtrip on {SKILL}  (entries: {len(load_index()["entries"])})\n')
        for n, name, status, info, fails in rows:
            print(f'{n}  {status}  {name}\n      {info}')
            for f in fails[:6]: print('      - ' + f[:300])
            if len(fails) > 6: print(f'      ... {len(fails) - 6} more')
        print('\n' + ('roundtrip FAILED' if bad else 'roundtrip ok: ' + ', '.join(f'{n} {s}' for n, _, s, _, _ in rows)))
    finally:
        shutil.rmtree(WORK, ignore_errors=True)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
