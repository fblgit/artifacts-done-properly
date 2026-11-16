"""Records export/import (docs/adp-export-import.md): bundle, import-plan, import-ack. Host-neutral: a host adapter (adp_<host>_adapter.py:
read_calls, parse_reads, write_calls, parse_receipt) only reads and writes natively. Imported by adp.py, which sets A to itself."""
import hashlib, importlib, json, os, re, sys

import adp_loop

A = None      # the adp module, set by adp.py at import
SKIP = ('status', 'presence', 'imports')      # never exported: written by the page, transient, or this shell's own record
READ = ('manifest', 'parts', 'content', 'changes', 'decisions', 'config', 'agents', 'incoming', 'requests', 'imports')
PLAN = 'adp-import-plan/1'


def chash(x): return 'sha256:' + hashlib.sha256(json.dumps(x, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def adapter(a):
    host = A.opt(a, '--host') or sys.exit('--host names the adapter (adp_<host>_adapter.py)')
    try: return importlib.import_module(f'adp_{host}_adapter')
    except ImportError: sys.exit(f'no adapter for host {host!r}: adp_{host}_adapter.py')


def docs_in(a, path):
    """[{collection, id, data, revision?}] from a normalized file, or from raw host results with --raw (an incomplete read is refused)."""
    f = json.load(open(path, encoding='utf-8'))
    if '--raw' in a:
        f = adapter(a).parse_reads(f)
        if not f.get('complete'): sys.exit(f'{path}: the read is incomplete ({"; ".join(f.get("warnings") or []) or "no detail"}): read again before planning')
    return [x for x in (f.get('docs') if isinstance(f, dict) else f) or [] if isinstance(x.get('collection'), str) and isinstance(x.get('id'), str) and isinstance(x.get('data'), dict)]


def reads(a, ad, artifact, collections):
    print(json.dumps({'reads': ad.read_calls(artifact, collections)}, indent=1)); return 2


def bundle(a):
    """adp.py bundle [DOCS.json OUT_DIR] --host H --artifact ID [--version V] [--by NAME] [--collections c,ns/x/y] [--raw]: DOCS.json is what the source's
    reads returned; without it, print the reads to run (exit 2). OUT_DIR gets an adp-seed/2 seed.json + seed/ with `source` and `revisions` added."""
    pos, ad, art = A.bare(a[1:]), adapter(a), A.opt(a, '--artifact') or sys.exit('--artifact names the source artifact')
    if not pos: return reads(a, ad, art, list(READ[:-1]) + (A.opt(a, '--collections') or '').split(',') * bool(A.opt(a, '--collections')))
    if len(pos) != 2: sys.exit('usage: adp.py bundle [DOCS.json OUT_DIR] --host H --artifact ID [--version V] [--by NAME] [--collections ...] [--raw]')
    docs = sorted((x for x in docs_in(a, pos[0]) if x['collection'].split('/')[0] not in SKIP), key=lambda x: (x['collection'], x['id']))
    at, counts, packs, cur, size = A.opt(a, '--at') or A.now(), {}, [], [], 0
    bid = 'b-' + chash([[x['collection'], x['id'], x['data']] for x in docs])[7:19]
    for x in docs:
        d = {'collection': x['collection'], 'id': x['id'], 'data': x['data']}; n = len(json.dumps(d, ensure_ascii=False).encode()); counts[d['collection']] = counts.get(d['collection'], 0) + 1
        if cur and size + n > A.PACK: packs.append(cur); cur, size = [], 0
        cur.append(d); size += n
    if cur: packs.append(cur)
    os.makedirs(os.path.join(pos[1], A.SEED_DIR), exist_ok=True); names = []
    for k, pk in enumerate(packs, 1):
        names.append(f'{A.SEED_DIR}/pack-{k:03d}.json')
        json.dump({'schema': 'adp-seed/2', 'pack': k, 'of': len(packs), 'docs': pk}, open(os.path.join(pos[1], names[-1]), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    src = {'id': bid, 'host': ad.HOST, 'artifact': art, 'version': A.opt(a, '--version', ''), 'exportedAt': at, 'by': A.opt(a, '--by', 'adp')}
    idx = {'schema': 'adp-seed/2', 'version': src['version'] or '1', 'by': src['by'], 'at': at, 'docs': len(docs), 'collections': counts, 'packs': names, 'overrides': [], 'source': src,
           'revisions': {f"{x['collection']}/{x['id']}": x['revision'] for x in docs if x.get('revision') is not None}}
    json.dump(idx, open(os.path.join(pos[1], A.SEED), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'bundle': bid, 'docs': len(docs), 'dir': pos[1]})); return 0


def plan(a):
    """adp.py import-plan BUNDLE_DIR [TARGET_DOCS.json] --host H --artifact ID [--out PLAN.json] [--raw]: classify each bundle record against the target's fresh read
    with adp_loop.classify3 (base = the hash recorded by the last import, live = the target, incoming = the bundle). Without the read, print the reads (exit 2); with a held
    record, write nothing to do and exit 2."""
    pos, ad, art = A.bare(a[1:]), adapter(a), A.opt(a, '--artifact') or sys.exit('--artifact names the target artifact')
    if not pos: sys.exit('usage: adp.py import-plan BUNDLE_DIR [TARGET_DOCS.json] --host H --artifact ID [--out PLAN.json] [--raw]')
    idx, inc = A.read_seed(pos[0])
    if idx.get('schema') != 'adp-seed/2' or not idx.get('source'): sys.exit(f'{pos[0]} is not a bundle (adp.py bundle writes one)')
    if len(pos) < 2: return reads(a, ad, art, sorted(set(idx.get('collections') or {}) | {'imports'}))
    tgt = {f"{x['collection']}/{x['id']}": x for x in docs_in(a, pos[1])}; sk = re.sub(r'[^A-Za-z0-9_.~:@+-]+', '-', f"{idx['source']['host']}-{idx['source']['artifact']}")[:120]
    prior = tgt.get(f'imports/{sk}') or {}; base = (prior.get('data') or {}).get('records') or {}; ops, held = [], []
    for c, i, data in sorted(inc):
        k, live = f'{c}/{i}', tgt.get(f'{c}/{i}'); ih, lh, bh = chash(data), chash(live['data']) if live else None, (base.get(f'{c}/{i}') or {}).get('hash')
        cls = adp_loop.classify3(bh, lh, ih) or 'applied'
        act = {'new': 'create', 'ours': 'replace', 'applied': 'skip', 'theirs': 'skip'}.get(cls, 'hold')
        why = 'target has no revision to guard the write with' if act == 'replace' and (live or {}).get('revision') is None else ''
        if why: act = 'hold'
        op = {'key': k, 'class': cls, 'action': act, 'baseHash': bh, 'liveHash': lh, 'incomingHash': ih, 'guard': (live or {}).get('revision')}
        if act in ('create', 'replace'): op.update({'op': act, 'collection': c, 'id': i, 'data': data})
        if act == 'hold': held.append(k); op['why'] = why or 'both sides changed, or the target differs and no import was recorded'
        ops.append(op)
    out = {'schema': PLAN, 'bundle': {'id': idx['source']['id'], 'schema': idx['schema'], 'docs': len(inc), 'source': idx['source']}, 'target': {'host': ad.HOST, 'artifact': art, 'readAt': A.now()},
           'ops': ops, 'held': held, 'counts': {n: sum(o['action'] == n for o in ops) for n in ('create', 'replace', 'skip', 'hold')},
           'provenance': {'collection': 'imports', 'id': sk, 'guard': prior.get('revision'), 'exists': bool(prior), 'records': base}}
    if not held: out['calls'] = ad.write_calls(art, [o for o in ops if o['action'] in ('create', 'replace')]) if out['counts']['create'] + out['counts']['replace'] else []
    text = json.dumps(out, indent=1, ensure_ascii=False)
    if A.opt(a, '--out'): open(A.opt(a, '--out'), 'w', encoding='utf-8').write(text)
    print(text); return 2 if held else 0


def ack(a):
    """adp.py import-ack PLAN.json RESULTS.json --host H [--raw]: the host's receipts -> the `imports/<source>` record, written ONLY from confirmed outcomes. A rejected or unknown
    record is listed, not recorded; the next plan re-derives it."""
    pos, ad = A.bare(a[1:]), adapter(a)
    if len(pos) != 2: sys.exit('usage: adp.py import-ack PLAN.json RESULTS.json --host H [--raw]')
    p, res = json.load(open(pos[0], encoding='utf-8')), json.load(open(pos[1], encoding='utf-8'))
    got = {f"{r['collection']}/{r['id']}": r for r in (ad.parse_receipt(res) if '--raw' in a else res)}
    pv, recs, failed = p['provenance'], dict(p['provenance']['records']), []
    for o in p['ops']:
        r = got.get(o['key'])
        if o['action'] in ('create', 'replace'):
            if r and r['outcome'] == 'applied': recs[o['key']] = {'hash': o['incomingHash'], 'revision': r.get('revision')}
            else: failed.append({'key': o['key'], 'outcome': (r or {}).get('outcome', 'unknown'), 'error': (r or {}).get('error')})
        elif o['class'] == 'applied': recs[o['key']] = {'hash': o['incomingHash'], 'revision': None}      # observed equal at read time, not written
    doc = {'schema': 'adp-import/1', 'source': p['bundle']['source'], 'bundle': p['bundle']['id'], 'at': A.now(), 'target': p['target'], 'records': recs}
    op = {'op': 'replace' if pv['exists'] else 'create', 'collection': pv['collection'], 'id': pv['id'], 'data': doc, 'guard': pv['guard']}
    print(json.dumps({'applied': sum(1 for o in p['ops'] if o['key'] in recs and o['action'] in ('create', 'replace')), 'failed': failed, 'record': ad.write_calls(p['target']['artifact'], [op])}, indent=1))
    return 2 if failed else 0
