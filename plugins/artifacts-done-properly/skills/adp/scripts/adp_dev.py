"""adp.py dev: a local stand-in for the claude.ai viewer, so a page can be tried offline (docs/assist.md "Local emulator").
Imported by adp.py, which sets A to itself. Stdlib only.

  dev serve DIR [--port 8787] [--user ID] [--no-fallback]
                                            serve DIR (missing paths from the skill's catalog/, unless --no-fallback) with window.claude
                                            stood in: db, user, comments and artifact.publish (it writes files into DIR; an ifMatch that
                                            is not the file's sha256 is a conflict)
  dev watch DIR                             runs until stopped: prints each message the page sends, one JSON line, and moves its file
                                            to inbox/done/; keeps watch.beat fresh, so the page reads a session as listening
  dev send DIR FILE                         POST the batches a command printed (adp.py requests) to the server: applied as ArtifactData
                                            (FILE's file_path entries are read by this command; the server itself reads only files inside DIR or its state)
                                            would (if_version pinned, each batch all or nothing) and pushed to the page; prints
                                            each doc written as {collection, id, data, version}, the dump of the next step

State lives in DIR/.adp-dev/: db/<collection, / as ~>.json {doc_id: {data, version}}, inbox/<ns>.jsonl, inbox/done/, watch.beat, server.json."""
from pathlib import Path
import contextlib, copy, hashlib, http.server, json, mimetypes, os, queue, re, sys, threading, time, types, urllib.request

A: types.ModuleType = types.ModuleType('adp')      # the adp module, set by adp.py at import
SHIM = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'adp_dev.js')
SEG = r'[A-Za-z0-9_\-.~:@+]{1,200}'
DOC = re.compile(rf'{SEG}/{SEG}(/{SEG}/{SEG}){{0,7}}')      # a document path: an even number of segments, at most 16
BEAT_FRESH = 15                 # seconds: a watcher that touched watch.beat this recently is listening


def fail(code, msg):
    return {'error': {'code': code, 'message': msg}}


def merge(a, b):
    """update(): nested objects merge recursively, anything else replaces the field. As measured live, {"__delete__": true}
    alone removes the field at any depth; with other keys it is refused."""
    o = copy.deepcopy(a)
    for k, v in b.items():
        if isinstance(v, dict) and '__delete__' in v:
            if v != {'__delete__': True}: raise ValueError(f'{k}: __delete__ must stand alone as true')
            o.pop(k, None)
        else: o[k] = merge(o[k], v) if isinstance(v, dict) and isinstance(o.get(k), dict) else v
    return o


class Store:
    """The db as files under state/db; the server is its only writer, under one lock."""
    def __init__(self, state, roots=()):
        self.db, self.mu = os.path.join(state, 'db'), threading.Lock()
        self.roots = [os.path.realpath(r) for r in roots]      # the folders a batch's file_path may name
        os.makedirs(self.db, exist_ok=True)

    def file(self, coll):
        """The file of a collection. A name that would leave the db folder (a drive, a backslash, a dot component) raises ValueError."""
        base = os.path.realpath(self.db)
        p = os.path.realpath(os.path.join(base, coll.replace('/', '~') + '.json'))
        if not p.startswith(base + os.sep) or os.path.dirname(p) != base: raise ValueError(f'{coll!r} is not a collection name')
        return p

    def readable(self, path):
        """A batch's file_path as a checked real path: a file inside the artifact folder or the dev state, else None (the emulator reads no other file)."""
        if not isinstance(path, str) or not path or len(path) > 4096:
            return None
        if '\x00' in path or any(ord(c) < 32 for c in path):
            return None
        try:
            cand = Path(path).resolve(strict=True)
        except (OSError, RuntimeError, ValueError):
            return None
        if not cand.is_file():
            return None
        for r in self.roots:
            try:
                root = Path(r).resolve(strict=True)
                cand.relative_to(root)
                return str(cand)
            except (OSError, RuntimeError, ValueError):
                continue
        return None

    def coll(self, coll):
        p = self.file(coll)
        return json.loads(Path(p).read_text(encoding='utf-8')) if os.path.isfile(p) else {}

    def all(self):
        return {f'{n[:-5].replace("~", "/")}/{i}': d for n in sorted(os.listdir(self.db)) if n.endswith('.json') and not self.name_error(n[:-5].replace('~', '/'))
                for i, d in self.coll(n[:-5].replace('~', '/')).items()}      # a file that is a link out of db/ is not a collection

    def write(self, op, path, data=None):
        """One write, under the lock. -> error or None"""
        c, i = path.rsplit('/', 1)
        try: self.file(c)
        except ValueError as e: return fail('invalid_argument', str(e))
        docs = self.coll(c); cur = docs.get(i)
        if op == 'delete': docs.pop(i, None)
        elif not isinstance(data, dict): return fail('invalid_argument', 'a document body is a JSON object')
        elif op == 'update' and cur is None: return fail('invalid_argument', f'{path}: update needs an existing document')
        elif op in ('set', 'update'):
            try: docs[i] = {'data': merge(cur['data'], data) if op == 'update' and cur else data, 'version': (cur or {}).get('version', 0) + 1}
            except ValueError as e: return fail('invalid_argument', str(e))
        else: return fail('invalid_argument', f'unknown op {op}')
        tmp = self.file(c) + '.tmp'
        json.dump(docs, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); os.replace(tmp, self.file(c))
        return None

    def name_error(self, coll):
        try: self.file(coll)
        except ValueError as e: return str(e)
        return None

    def apply(self, batches):
        """ArtifactData batches [[{op, collection, doc_id, file_path|data, if_version}]]: each batch all or nothing."""
        out = []
        for b in batches:
            docs = self.all(); key = lambda w: f"{w['collection']}/{w['doc_id']}"
            bad = next((f'{key(w)}: stale if_version {w["if_version"]}' for w in b
                        if 'if_version' in w and (docs.get(key(w)) or {}).get('version') != w['if_version']), None)
            bad = bad or next((f'{key(w)}: update needs an existing document' for w in b if w['op'] == 'update' and key(w) not in docs), None)
            bad = bad or next((f'{key(w)}: {e}' for w in b for e in [self.name_error(key(w).rsplit('/', 1)[0])] if e), None)
            bad = bad or next((f'{key(w)}: file_path must be a file inside the artifact folder or the dev state' for w in b
                               if w.get('data') is None and w.get('file_path') and self.readable(w['file_path']) is None), None)
            if bad: out.append({'ok': False, **fail('conflict' if 'stale' in bad else 'invalid_argument', bad)}); continue
            for w in b:
                data = w.get('data')
                if data is None and w.get('file_path'): data = json.loads(Path(self.readable(w['file_path'])).read_text(encoding='utf-8'))
                self.write(w['op'], key(w), data)
            now = self.all()      # the docs as written, so the next step needs no read
            out.append({'ok': True, 'docs': [{'collection': w['collection'], 'id': w['doc_id'], **now[key(w)]} for w in b if key(w) in now]})
        return out


def listening(state):
    p = os.path.join(state, 'watch.beat')
    return os.path.isfile(p) and time.time() - os.path.getmtime(p) < BEAT_FRESH


def inject(html):
    """The shim goes first in <head>, so window.claude exists before any page script (as the platform's does)."""
    tag = '<script src="/__adp/shim.js"></script>'
    m = re.search(r'<head[^>]*>', html, re.I)
    if m: return html[:m.end()] + tag + html[m.end():]
    return ('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' + tag +
            '</head><body>' + html + '</body></html>')      # the skeleton the platform wraps a head-less page in


def publish(d, state, files):
    """claude.use('artifact').publish(files) against DIR: {path: text | {content, contentType, ifMatch} | {delete, ifMatch} | null}. All or nothing:
    an ifMatch that is not the sha256 of the file now is a conflict naming the paths that moved (an empty ifMatch asks for nothing). -> {version, shas}"""
    base, plan, moved = os.path.normpath(d), {}, []
    for rel, v in files.items():
        p = os.path.normpath(os.path.join(base, rel))
        if not isinstance(rel, str) or rel.startswith('/') or not p.startswith(base + os.sep) or os.sep + '.adp-dev' + os.sep in p:
            return fail('invalid_argument', f'bad path {rel}')
        v = v if isinstance(v, dict) else {'content': v}
        cur = hashlib.sha256(Path(p).read_bytes()).hexdigest() if os.path.isfile(p) else None
        if v.get('ifMatch') and v['ifMatch'] != cur: moved.append({'path': rel, 'expected': v['ifMatch'], 'actual': cur})
        plan[rel] = (p, None if v.get('delete') or v.get('content') is None else v['content'])
    n = os.path.join(state, 'publish.n'); k = int(Path(n).read_text() or 0) if os.path.isfile(n) else 0
    if moved: return {'error': {'code': 'conflict', 'message': 'files moved since they were read', 'paths': moved, 'live': f'dev-{k}', 'changed': []}}
    shas = {}
    for rel, (p, text) in plan.items():
        if text is None:
            if os.path.isfile(p): os.remove(p)
            shas[rel] = None; continue
        os.makedirs(os.path.dirname(p), exist_ok=True); b = text.encode('utf-8'); Path(p).write_bytes(b); shas[rel] = hashlib.sha256(b).hexdigest()
    k += 1; Path(n).write_text(str(k))
    return {'version': f'dev-{k}', 'shas': shas}


def handler(d, state, user, fallback=True):
    store, subs = Store(state, roots=(d, state)), []
    ident = hashlib.sha256(os.path.abspath(d).encode()).hexdigest()[:16]      # which artifact this is: the shim scopes the browser's cached query results to it
    inbox = os.path.join(state, 'inbox'); os.makedirs(inbox, exist_ok=True)

    def push(paths):
        for q in list(subs): q.put(paths)

    def named(text, docs):
        """the doc a message is about: one whose path, else whose id, its text names (the page writes the doc before it sends)"""
        return next((p for p in docs if p in text), None) or \
            next((p for p in docs if re.search(rf'(?<![\w-]){re.escape(p.rsplit("/", 1)[1])}(?![\w-])', text)), None)

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args): pass

        def send(self, body, ctype='application/json', code=200):
            ctype = ctype.replace('\r', '').replace('\n', '')      # a header value holds no CR or LF
            b = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
            self.send_response(code); self.send_header('content-type', ctype); self.send_header('content-length', str(len(b)))
            self.send_header('cache-control', 'no-store'); self.end_headers(); self.wfile.write(b)

        def do_GET(self):
            path = self.path.split('?')[0]
            if path == '/__adp/shim.js':
                js = f'window.__ADP_DEV={json.dumps({"user": user, "store": ident})};\n' + Path(SHIM).read_text(encoding='utf-8')
                return self.send(js.encode(), 'text/javascript; charset=utf-8')
            if path == '/__adp/db': return self.send({'docs': store.all(), 'canSend': 'available' if listening(state) else 'no_session'})
            if path == '/__adp/events': return self.events()
            rel = path.lstrip('/') or 'index.html'
            f = next((p for base in ((d, os.path.join(A.HERE, 'catalog')) if fallback else (d,)) for p in [os.path.normpath(os.path.join(base, rel))]
                      if p.startswith(os.path.normpath(base) + os.sep) and os.path.isfile(p)), None)
            if not f: return self.send(fail('not_found', rel), code=404)
            b, ctype = Path(f).read_bytes(), mimetypes.guess_type(f)[0] or 'application/octet-stream'
            if ctype == 'text/html': b = inject(b.decode('utf-8')).encode()
            self.send(b, ctype + ('; charset=utf-8' if ctype.startswith('text/') or ctype.endswith('javascript') else ''))

        def events(self):
            """SSE: one `data: [paths]` per change; a comment line every 10 s finds a closed tab"""
            q = queue.Queue(); subs.append(q)
            self.send_response(200); self.send_header('content-type', 'text/event-stream'); self.send_header('cache-control', 'no-store'); self.end_headers()
            try:
                while True:
                    try: self.wfile.write(f'data: {json.dumps(q.get(timeout=10))}\n\n'.encode())
                    except queue.Empty: self.wfile.write(b': beat\n\n')
                    self.wfile.flush()
            except OSError: pass
            finally: subs.remove(q); self.close_connection = True

        def do_POST(self):
            try: b = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
            except ValueError: return self.send(fail('invalid_argument', 'body is not JSON'))
            path = self.path.split('?')[0]
            if path == '/__adp/db':
                if not DOC.fullmatch(b.get('path') or ''): return self.send(fail('invalid_argument', f'bad document path {b.get("path")}'))
                with store.mu: err = store.write(b.get('op'), b.get('path', ''), b.get('data'))
                if not err: push([b.get('path')])
                return self.send(err or {'ok': True})
            if path == '/__adp/publish':
                with store.mu: return self.send(publish(d, state, b.get('files') or {}))
            if path == '/__adp/outbox':
                batches = (b.get('batches') or ([b['writes']] if 'writes' in b else None)) if isinstance(b, dict) else b      # {batches: [[w]]}, [[w]], or one ArtifactData batch call {writes: [w]}
                if batches and isinstance(batches[0], dict): batches = [batches]
                with store.mu: res = store.apply(batches or [])
                push([f"{x['collection']}/{x['id']}" for r in res if r['ok'] for x in r['docs']])
                return self.send({'results': res})
            if path == '/__adp/inbox':
                if not listening(state): return self.send(fail('claude_unavailable', 'no session is watching: run adp.py dev watch DIR'))
                tid, text, docs = 't%x' % time.time_ns(), b.get('text', ''), store.all()
                p = named(text, docs)
                msg = {'threadId': tid, 'by': user, 'anchor': b.get('anchor'), 'text': text,
                       'doc': p and {'collection': p.rsplit('/', 1)[0], 'id': p.rsplit('/', 1)[1], 'data': docs[p]['data'], 'version': docs[p]['version']}}
                tmp = os.path.join(inbox, f'.{tid}')
                with open(tmp, 'w', encoding='utf-8') as f: f.write(json.dumps(msg, ensure_ascii=False) + '\n')
                os.replace(tmp, os.path.join(inbox, f'{time.time_ns()}.jsonl'))      # one file per message, whole when it appears
                return self.send({'threadId': tid, 'commentId': tid})
            self.send(fail('not_found', path), code=404)
    return H


def state_of(d):
    s = os.path.join(d, '.adp-dev'); os.makedirs(s, exist_ok=True); return s


def serve(a, d):
    if not os.path.isfile(os.path.join(d, 'index.html')): sys.exit(f'{d}: no index.html')
    s = state_of(d)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', int(A.opt(a, '--port', 8787))), handler(d, s, A.opt(a, '--user', 'dev-user'), '--no-fallback' not in a))
    srv.daemon_threads = True
    Path(os.path.join(s, 'server.json')).write_text(json.dumps({'port': srv.server_port}))
    A.emit({'url': f'http://127.0.0.1:{srv.server_port}/', 'state': os.path.abspath(s)}); sys.stdout.flush()
    with contextlib.suppress(KeyboardInterrupt): srv.serve_forever()
    return 0


def watch(d):
    s = state_of(d); inbox, done = os.path.join(s, 'inbox'), os.path.join(s, 'inbox', 'done')
    os.makedirs(done, exist_ok=True)
    while True:
        open(os.path.join(s, 'watch.beat'), 'w').close()
        for n in sorted(os.listdir(inbox)):
            f = os.path.join(inbox, n)
            if n.endswith('.jsonl') and time.time() - os.path.getmtime(f) >= 1:      # settled for a second
                sys.stdout.write(Path(f).read_text(encoding='utf-8')); sys.stdout.flush()
                os.replace(f, os.path.join(done, n))
        time.sleep(0.5)


def inline(x):
    """The batches with each write's file_path read into its data: the one who runs `dev send` is the one who names the files, so the client reads them
    (wherever --out put them) and the server never reads a path a request names."""
    if isinstance(x, list): return [inline(i) for i in x]
    if not isinstance(x, dict): return x
    if 'op' in x and 'data' not in x and x.get('file_path'):
        return {**{k: v for k, v in x.items() if k != 'file_path'}, 'data': json.loads(Path(x['file_path']).read_text(encoding='utf-8'))}
    return {k: inline(v) for k, v in x.items()}


def send(d, path):
    try: url = f"http://127.0.0.1:{json.loads(Path(os.path.join(d, '.adp-dev', 'server.json')).read_text())['port']}/__adp/outbox"
    except (OSError, ValueError, KeyError) as e: sys.exit(f'dev send: no server for {d} ({e}); run adp.py dev serve {d}')
    try: body = inline(A.read_json(path, 'FILE'))
    except (OSError, ValueError) as e: sys.exit(f"dev send: cannot read a write's file_path ({e})")
    try:
        req = urllib.request.Request(url, json.dumps(body).encode(), {'content-type': 'application/json'})
        res = json.loads(urllib.request.urlopen(req, timeout=10).read())['results']
    except (OSError, ValueError, KeyError) as e: sys.exit(f'dev send: no server for {d} ({e}); run adp.py dev serve {d}')
    A.emit({'results': res})
    return 3 if not res or any(not r['ok'] for r in res) else 0


def main(a):
    use = 'usage: adp.py dev serve DIR [--port N] [--user ID] | watch DIR | send DIR FILE   (adp.py dev help)'
    pos = A.bare(a[1:])
    if pos[:1] == ['help']: print(__doc__); return 0
    if pos[:1] == ['serve'] and len(pos) == 2: return serve(a, pos[1])
    if pos[:1] == ['watch'] and len(pos) == 2: return watch(pos[1])
    if pos[:1] == ['send'] and len(pos) == 3: return send(pos[1], pos[2])
    sys.exit(use)
