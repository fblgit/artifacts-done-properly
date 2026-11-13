"""`adp.py dev`: the server a page runs against, and the session side: watch (messages in) and send (batches out)."""
import glob, json, os, subprocess, sys, time, urllib.request

from test_setup import Base


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
        self.assertIn('window.__ADP_DEV={"user": "ann"}', self.get('__adp/shim.js'))
        self.assertEqual(self.post('/__adp/db', {'op': 'update', 'path': 'a/b', 'data': {}})['error']['code'], 'invalid_argument')
        self.assertEqual(self.post('/__adp/inbox', {'text': 'hi'})['error']['code'], 'claude_unavailable')      # nobody watches

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
