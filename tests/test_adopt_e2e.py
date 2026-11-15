"""The adopter page in a real Chromium, against `adp.py dev serve` (the local stand-in for claude.ai's database and sessions).
These are the failures a person met in the published page, none of which jsdom showed: after a refresh with the Adopt tab open nothing was kept (the runtime has not
connected to the database yet when the page mounts), stored previews were ignored, the build button did nothing, and the element picker did not select.

Skipped unless Playwright with a Chromium is available: ADOPT_E2E_DIR holds node_modules/playwright (`npm install playwright`), and PLAYWRIGHT_BROWSERS_PATH points at its browsers
(`npx playwright install chromium`)."""
import glob, json, os, shutil, socket, subprocess, sys, tempfile, time, unittest, urllib.request

from test_adopt import FILES
from test_adopt_js import node

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ADP = os.path.join(ROOT, 'skill', 'scripts', 'adp.py')
CATALOG = os.path.join(ROOT, 'skill', 'catalog', 'catalog.json')
JOB = os.path.join(os.environ.get('CLAUDE_JOB_DIR', ''), 'tmp')
PAGE = ('<!doctype html><html><head><title>Toy</title><link rel="stylesheet" href="styles/wheel.css"><link rel="stylesheet" href="styles/dial.css"></head><body>'
        '<div class="wheel-ring wheel-knob">ring</div><svg class="dial-thumb dial-track" width="60" height="60"><circle cx="30" cy="30" r="20"/></svg><p class="plain">nobody owns this</p></body></html>')


def e2e_dir():
    for d in (os.environ.get('ADOPT_E2E_DIR'), os.path.join(JOB, 'jsd')):
        if d and os.path.isdir(os.path.join(d, 'node_modules', 'playwright')): return d
    return None


def browsers():
    return os.environ.get('PLAYWRIGHT_BROWSERS_PATH') or (os.path.join(JOB, 'pw-browsers') if os.path.isdir(os.path.join(JOB, 'pw-browsers')) else None)


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


@unittest.skipUnless(node() and e2e_dir(), 'node with playwright (ADOPT_E2E_DIR) is not available')
class RealBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(); sub, cls.ad = os.path.join(cls.tmp, 'subject'), os.path.join(cls.tmp, 'adopter')
        for rel, text in dict(FILES, **{'index.html': PAGE}).items():
            p = os.path.join(sub, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, 'w') as f: f.write(text)
        env = {k: v for k, v in os.environ.items() if k != 'ADP_HOME'}; env['HOME'] = cls.tmp
        run = lambda *a: subprocess.run([sys.executable, '-I', ADP, *a], capture_output=True, text=True, env=env, check=True)
        run('new', 'adopter', cls.ad, '--catalog', CATALOG, '--url', 'https://claude.ai/artifact/test-catalog'); run('extract', sub, '--into', cls.ad)
        if os.environ.get('ADOPT_GLUE_OVERRIDE'): shutil.copyfile(os.environ['ADOPT_GLUE_OVERRIDE'], os.path.join(cls.ad, 'parts', 'adopt.js'))      # to run the test against an older page and see it fail
        db = os.path.join(cls.ad, '.adp-dev', 'db'); os.makedirs(db)
        with open(os.path.join(db, 'ns~shared~previews.json'), 'w') as f:       # a preview Claude built earlier, already in the database
            json.dump({'c.wheel': {'data': {'html': '<!doctype html><div id="x"><p>the wheel preview</p></div>', 'by': 'claude'}, 'version': 1}}, f)
        port = free_port(); cls.procs = [subprocess.Popen([sys.executable, '-I', ADP, 'dev', 'serve', cls.ad, '--port', str(port)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
                                          subprocess.Popen([sys.executable, '-I', ADP, 'dev', 'watch', cls.ad], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
        for _ in range(100):
            try: urllib.request.urlopen('http://127.0.0.1:%d/' % port, timeout=1); break
            except Exception: time.sleep(0.1)
        penv = dict(os.environ)
        if browsers(): penv['PLAYWRIGHT_BROWSERS_PATH'] = browsers()
        r = subprocess.run([node(), os.path.join(HERE, 'e2e_adopt.js'), e2e_dir(), 'http://127.0.0.1:%d/' % port, cls.ad], capture_output=True, text=True, env=penv, timeout=240)
        assert r.returncode == 0, r.stdout + r.stderr
        cls.o = json.loads(r.stdout)

    @classmethod
    def tearDownClass(cls):
        for p in cls.procs: p.terminate()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_first_visit_shows_every_candidate_and_the_map_fits(self):
        f = self.o['first']; self.assertEqual(f['nodes'], 4); self.assertEqual(f['status'], 'Nothing saved on the server yet.'); self.assertLessEqual(f['overflow'], 0)

    def test_a_stored_preview_loads_when_the_candidate_is_selected(self):
        s = self.o['stored']; self.assertTrue(s['pv']); self.assertIn('Component: wheel', s['head']); self.assertEqual(s['btn'], 'Ask Claude to change this preview')

    def test_decisions_and_the_selection_reach_the_server(self):
        d = self.o['decided']; self.assertEqual(d['states'], {'c.wheel': 'selected', 'c.dial': 'discarded'}); self.assertEqual(d['pressed'], 'c.wheel')
        self.assertEqual(d['lit'], 2)                                                  # the selected one's paths to what it needs are lit
        self.assertEqual(self.o['server'], {'state': [['c.wheel', 'selected'], ['c.dial', 'discarded']], 'view': 'c.wheel'})

    def test_a_refresh_with_the_adopt_tab_open_forgets_nothing(self):
        r = self.o['reloaded']
        self.assertEqual(r['states'], {'c.wheel': 'selected', 'c.dial': 'discarded'}); self.assertEqual(r['pressed'], 'c.wheel')
        self.assertTrue(r['pv']); self.assertTrue(r['status'].startswith('Restored 2 decisions')); self.assertEqual(r['lit'], 2)      # and the stored preview is back without regenerating

    def test_the_build_button_sends_a_request_that_reaches_the_server_and_the_session(self):
        o = self.o
        self.assertFalse(o['noPreview']['pv']); self.assertEqual(o['noPreview']['btn'], 'Ask Claude to build a preview')
        self.assertEqual(o['afterBuild']['btn'], 'Asked. The preview appears here when Claude has written it.')
        self.assertEqual(o['requests'], [{'scope': 'adopt.inspect', 'label': 'Preview of c.dial', 'status': 'open', 'mentions': True}])
        self.assertGreaterEqual(o['delivered'], 1)

    def test_the_picker_selects_an_svg_block_and_offers_to_assign_an_unowned_one(self):
        o = self.o
        self.assertIn('c.dial (class dial-thumb)', o['hoverOwned']); self.assertEqual(o['pickedOwned']['pressed'], 'c.dial'); self.assertEqual(o['pickedOwned']['pickerOn'], 'false')
        u = o['pickedUnowned']; self.assertEqual(u['head'], 'Nobody owns p.plain'); self.assertEqual(u['assign'], 1); self.assertEqual(u['pickerOn'], 'false')
        self.assertEqual(o['assigned'], ['plain'])                                     # kept on the server
        self.assertEqual(o['afterAssignAndReload']['pressed'], 'c.wheel')              # and after a refresh the same click selects it

    def test_nothing_was_thrown_anywhere(self):
        self.assertEqual(self.o['errors'], [])


if __name__ == '__main__':
    unittest.main()
