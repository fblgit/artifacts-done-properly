"""`adp.py dev`: the server a page runs against, and the session side: watch (messages in) and send (batches out)."""
import glob, hashlib, json, os, subprocess, sys, time, urllib.error, urllib.request

from test_host_connection import HARNESS, run_node
from test_setup import Base

SEQUENCES = r'''
const assert = require('assert/strict'), [ADPJS, SHIM] = process.argv.slice(1), store = new Map(), SRC = fs.readFileSync(SHIM, 'utf8'), tick = () => new Promise(r => setImmediate(r));
const page = async (server, id = 's1') => {      // one page load of the shim over a stub server; the store outlives it, as the viewer's cache does; id = the dev server's store identity
  const w = {__ADP_DEV: {user: 'u', store: id}, JSON, Promise, EventSource: class {}, localStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)},
    fetch: async (url, o) => { if (o) { const b = JSON.parse(o.body); server[b.path] = {data: b.data, version: (server[b.path] || {version: 0}).version + 1}; } return {json: async () => ({docs: JSON.parse(JSON.stringify(server)), canSend: 'no_session'})}; }};
  w.window = w; vm.createContext(w); vm.runInContext(SRC, w); return w.claude.use('db');
};
const rec = (t, s) => t.push([s.docChanges().map(c => '+~-'['amr'.indexOf(c.type[0])] + c.doc.id).join(' '), s.size, +s.metadata.fromCache, +s.metadata.hasPendingWrites]);
(async () => {
  const ta = [], dbA = await page({'c/0added': {data: {n: 1}, version: 1}, 'c/a': {data: {n: 1}, version: 1}});
  dbA.collection('c').onSnapshot(s => { rec(ta, s); if (ta.length === 1) dbA.doc('c/b').set({n: 2}); }); await tick();
  assert.deepEqual(ta, [['+0added +a', 2, 0, 0], ['+b', 3, 0, 1], ['', 3, 1, 1], ['~b', 3, 1, 0], ['', 3, 0, 0]]);      // measured live: a new document written from the first callback
  (await page({'r/a': {data: {n: 1}, version: 1}, 'r/old': {data: {n: 1}, version: 1}})).collection('r').onSnapshot(() => {}); await tick();      // load 1 settles and is persisted
  const tb = [], dbB = await page({'r/a': {data: {n: 1}, version: 1}, 'r/new': {data: {n: 1}, version: 1}});
  dbB.collection('r').onSnapshot(s => rec(tb, s)); await tick();
  assert.deepEqual(tb, [['+a +old', 2, 1, 0], ['-old +new', 2, 0, 0]]);      // measured live: the persisted result first, the stale document included, then corrected
  const tc = [], dbC = await page({'r/a': {data: {n: 1}, version: 1}, 'r/other': {data: {n: 1}, version: 1}}, 's2');      // another artifact on the same origin never sees s1's cached result
  dbC.collection('r').onSnapshot(s => rec(tc, s)); await tick();
  assert.deepEqual(tc, [['+a +other', 2, 0, 0]]);
  const tn = [[], []];
  for (const t of tn) { (await page({'r/a': {data: {n: 1}, version: 1}}, null)).collection('r').onSnapshot(s => rec(t, s)); await tick(); }      // no store identity: nothing is persisted, so the second load has no cache-first snapshot
  assert.deepEqual(tn[1], [['+a', 1, 0, 0]]);
  const LIVE = [[[['added', 'stale'], ['added', 'a'], ['added', 'b']], ['stale', 'a', 'b'], 1, 0], [[], ['stale', 'a', 'b'], 1, 1], [[['removed', 'stale'], ['added', 'cur']], ['a', 'b', 'cur'], 0, 1],
    [[['removed', 'b']], ['a', 'cur'], 0, 0], [[], ['a', 'cur'], 0, 0], [[['added', 'b'], ['modified', 'a']], ['a', 'b', 'cur'], 0, 0]];      // recorded live after a reload, with a write in the first callback
  const states = [], part = id => ({id, exists: true, data: () => ({html: '<p>' + id + '</p>'})});
  const replay = next => LIVE.forEach(([ch, ids, fc, pw]) => { next({docs: ids.map(part), size: ids.length, empty: !ids.length, metadata: {fromCache: !!fc, hasPendingWrites: !!pw}, docChanges: () => ch.map(([type, id]) => ({type, doc: part(id), oldIndex: 0, newIndex: 0}))}); states.push(['stale', 'b'].map(id => win.ADP.content(id) !== '')); });
  win.ADP_HOST = {protocol: 'adp-host/1', connect: async () => ({id: 'replay', db: {doc: db.doc, collection: n => n === 'content' ? {onSnapshot: replay} : db.collection(n)}, user})};
  vm.createContext(win); vm.runInContext(fs.readFileSync(ADPJS, 'utf8'), win); await tick(); await tick();
  assert.deepEqual(states, [[true, true], [true, true], [false, true], [false, false], [false, false], [false, true]]);      // the real adp.js follows it: stale gone, b dropped and back
})().catch(e => { console.error(e); process.exitCode = 1; });
'''


class DevTests(Base):
    def setUp(self):
        super().setUp()
        self.d = os.path.join(self.cwd, 'page'); os.makedirs(self.d)
        with open(os.path.join(self.d, 'index.html'), 'w') as f: f.write('<html><head><title>t</title></head><body>hi</body></html>')
        self.url = json.loads(self.spawn('serve', self.d, '--port', '0', '--user', 'ann').readline())['url']

    def spawn(self, *args):
        """a long-running `adp.py dev` command, stopped at cleanup -> its stdout"""
        p = subprocess.Popen([sys.executable, '-I', self.adp, 'dev', *args], stdout=subprocess.PIPE, text=True, env={**os.environ, 'HOME': self.home})
        out = p.stdout
        assert out is not None
        self.addCleanup(out.close); self.addCleanup(p.wait); self.addCleanup(p.kill)
        return out

    def get(self, p):
        return urllib.request.urlopen(self.url + p).read().decode()

    def post(self, p, body):
        return json.loads(urllib.request.urlopen(urllib.request.Request(self.url + p, json.dumps(body).encode())).read())

    def test_serve_injects_shim_and_falls_back_to_catalog(self):
        os.makedirs(os.path.join(self.root, 'catalog', 'kit'))
        with open(os.path.join(self.root, 'catalog', 'kit', 'x.js'), 'w') as f: f.write('KIT')
        self.assertIn('<head><script src="/__adp/shim.js"></script><title>', self.get(''))
        self.assertEqual(self.get('kit/x.js'), 'KIT')
        self.assertIn('window.__ADP_DEV={"user": "ann", "store": "' + hashlib.sha256(os.path.abspath(self.d).encode()).hexdigest()[:16] + '"}', self.get('__adp/shim.js'))      # the folder served is the store's identity
        self.assertEqual(self.post('/__adp/db', {'op': 'update', 'path': 'a/b', 'data': {}})['error']['code'], 'invalid_argument')
        self.assertEqual(self.post('/__adp/db', {'op': 'set', 'path': 'a', 'data': {}})['error']['code'], 'invalid_argument')
        self.assertEqual(self.post('/__adp/inbox', {'text': 'hi'})['error']['code'], 'claude_unavailable')      # nobody watches
        raw = urllib.request.Request(self.url + '__adp/db', b'{not json')
        self.assertEqual(json.loads(urllib.request.urlopen(raw).read())['error']['code'], 'invalid_argument')
        with self.assertRaises(urllib.error.HTTPError) as e: self.post('/__adp/nope', {})
        self.assertEqual(e.exception.code, 404)
        lost = os.path.join(self.cwd, 'lost'); os.makedirs(lost)      # a folder no server runs for
        r = self.run_adp('dev', 'send', lost, os.devnull)
        self.assertNotEqual(r.returncode, 0); self.assertIn('run adp.py dev serve', r.stderr)
        self.assertIn('usage: adp.py dev', self.run_adp('dev', 'bogus').stderr)

    def test_artifact_publish_writes_files_and_an_ifmatch_that_moved_is_a_conflict(self):
        r = self.post('/__adp/publish', {'files': {'kit/a.js': {'content': 'A', 'contentType': 'text/javascript', 'ifMatch': None}, 'b.txt': 'B'}})
        self.assertEqual((r['version'], sorted(r['shas'])), ('dev-1', ['b.txt', 'kit/a.js']))
        self.assertEqual(self.get('kit/a.js'), 'A')
        sha = r['shas']['kit/a.js']
        bad = self.post('/__adp/publish', {'files': {'kit/a.js': {'content': 'A2', 'ifMatch': 'f' * 64}, 'new.js': 'N'}})['error']
        self.assertEqual((bad['code'], bad['paths'][0]['path'], bad['paths'][0]['actual']), ('conflict', 'kit/a.js', sha))
        self.assertEqual((bad['live'], bad['changed']), ('dev-1', []))      # as the live viewer: the current version id, and a changed list
        self.assertEqual(self.get('kit/a.js'), 'A')      # nothing was written, new.js either
        with self.assertRaises(urllib.error.HTTPError): self.get('new.js')
        self.assertEqual(self.post('/__adp/publish', {'files': {'kit/a.js': {'content': 'A2', 'ifMatch': sha}, 'b.txt': None}})['version'], 'dev-2')
        self.assertEqual(self.get('kit/a.js'), 'A2')
        self.assertEqual(self.post('/__adp/publish', {'files': {'../x': 'x'}})['error']['code'], 'invalid_argument')
        self.assertIn('artifact', self.get('__adp/shim.js'))

    def test_stand_in_sends_the_measured_snapshot_sequences_and_the_real_consumer_converges(self):      # live traces and their limits: docs/claude-host-adapter.md
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        r = run_node(['-e', HARNESS.split('const mode')[0] + SEQUENCES, os.path.join(root, 'skill/assets/adp.js'), os.path.join(root, 'skill/scripts/adp_dev.js')])
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_update_marker_removes_a_field_and_one_with_other_keys_is_refused(self):      # both as measured on the live viewer
        db = lambda op, data: self.post('/__adp/db', {'op': op, 'path': 'a/b', 'data': data})
        db('set', {'x': {'p': 1}, 'y': 2})
        self.assertEqual(db('update', {'x': {'__delete__': True, 'z': 1}})['error']['code'], 'invalid_argument')
        db('update', {'y': {'__delete__': True}})
        self.assertEqual(json.loads(self.get('__adp/db'))['docs']['a/b']['data'], {'x': {'p': 1}})

    def test_outbox_takes_one_artifactdata_batch_call_as_writes(self):
        res = self.post('/__adp/outbox', {'url': 'x', 'action': 'batch', 'writes': [{'op': 'set', 'collection': 'a', 'doc_id': 'b', 'data': {'v': 1}}]})
        self.assertTrue(res['results'][0]['ok'])
        self.assertEqual(json.loads(self.get('__adp/db'))['docs']['a/b']['data'], {'v': 1})

    def test_no_fallback_leaves_the_catalog_files_missing(self):
        os.makedirs(os.path.join(self.root, 'catalog', 'kit'))
        with open(os.path.join(self.root, 'catalog', 'kit', 'x.js'), 'w') as f: f.write('KIT')
        url = json.loads(self.spawn('serve', self.d, '--port', '0', '--no-fallback').readline())['url']
        with self.assertRaises(urllib.error.HTTPError) as e: urllib.request.urlopen(url + 'kit/x.js')
        self.assertEqual(e.exception.code, 404)

    def test_request_goes_through_watch_and_its_answer_through_send(self):
        req = {'lane': 'task', 'text': 'fix', 'at': '2026-01-01T00:00:00Z', 'status': 'open'}
        self.post('/__adp/db', {'op': 'set', 'path': 'requests/r-1', 'data': req})
        watch = self.spawn('watch', self.d)
        while json.loads(self.get('__adp/db'))['canSend'] != 'available': time.sleep(0.1)
        tid = self.post('/__adp/inbox', {'text': 'fix\n\n— request r-1'})['threadId']
        inbox = os.path.join(self.d, '.adp-dev', 'inbox')
        self.assertEqual(len(glob.glob(os.path.join(inbox, '*.jsonl'))), 1)      # one file per message
        msg = json.loads(watch.readline())
        self.assertEqual((msg['threadId'], msg['by'], msg['doc']), (tid, 'ann', {'collection': 'requests', 'id': 'r-1', 'data': req, 'version': 1}))
        self.assertEqual((glob.glob(os.path.join(inbox, '*.jsonl')), len(glob.glob(os.path.join(inbox, 'done', '*.jsonl')))), ([], 1))

        dump, out = os.path.join(self.tmp, 'dump.json'), os.path.join(self.tmp, 'ack.json')
        with open(dump, 'w') as f: json.dump([msg['doc']], f)
        with open(out, 'w') as f: f.write(self.run_adp('requests', dump, '--ack', 'r-1', '--out', os.path.join(self.tmp, 'req')).stdout)
        events = urllib.request.urlopen(self.url + '__adp/events')
        sent = self.run_adp('dev', 'send', self.d, out)
        self.assertEqual(json.loads(sent.stdout)['results'][0]['docs'][0]['version'], 2)      # the next step's dump
        self.assertEqual(json.loads(events.readline().decode()[6:]), ['requests/r-1', 'presence/agent'])      # pushed to the page
        events.close()
        docs = json.loads(self.get('__adp/db'))['docs']
        self.assertEqual((docs['requests/r-1']['data']['state'], docs['requests/r-1']['version']), ('ack', 2))
        # kit.claude-lane reads this presence doc: any id when presence/claude-code is missing, at in ISO
        self.assertEqual(docs['presence/agent']['data']['at'][-1], 'Z')
        with open(os.path.join(os.path.dirname(__file__), '..', 'skill', 'catalog', 'kit', 'claude-lane.js')) as f: lane = f.read()
        self.assertIn('all[presenceKey] || Object.values(all)', lane); self.assertIn('Date.parse(t)', lane)
        r = self.run_adp('dev', 'send', self.d, out)      # the same batch again: its if_version is stale now
        self.assertEqual((r.returncode, json.loads(r.stdout)['results'][0]['error']['code']), (3, 'conflict'))
        self.assertEqual(json.loads(self.get('__adp/db'))['docs']['requests/r-1']['version'], 2)      # refused whole: nothing written

        def step(*flags):      # the rest of the card's life: each step's dump is the previous send's output
            with open(dump, 'w') as f: json.dump(json.loads(sent.stdout)['results'][0]['docs'][:1], f)
            with open(out, 'w') as f: f.write(self.run_adp('requests', dump, *flags, '--out', os.path.join(self.tmp, 'req')).stdout)
            return self.run_adp('dev', 'send', self.d, out)
        sent = step('--progress', 'r-1', '--text', 'halfway')
        self.assertEqual(json.loads(self.get('__adp/db'))['docs']['requests/r-1']['data']['state'], 'working')
        resp = os.path.join(self.tmp, 'resp.md')
        with open(resp, 'w') as f: f.write('Fixed.')
        sent = step('--done', 'r-1', '--response', resp)
        r1 = json.loads(self.get('__adp/db'))['docs']['requests/r-1']
        self.assertEqual((sent.returncode, r1['data']['status'], r1['data']['response'], r1['version']), (0, 'done', 'Fixed.', 4))

        with open(out, 'w') as f: json.dump([{'op': 'set', 'collection': 'notes', 'doc_id': 'n1', 'data': {'x': 1}},
                                             {'op': 'update', 'collection': 'notes', 'doc_id': 'gone', 'data': {'x': 2}}], f)
        r = self.run_adp('dev', 'send', self.d, out)      # one bad write fails its whole batch
        self.assertEqual((r.returncode, json.loads(r.stdout)['results'][0]['error']['code']), (3, 'invalid_argument'))
        self.assertNotIn('notes/n1', json.loads(self.get('__adp/db'))['docs'])
