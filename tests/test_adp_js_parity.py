"""plugins/artifacts-done-properly/skills/adp/assets/adp.js and plugins/artifacts-done-properly/skills/adp/scripts/adp.py compute the same part hashes and the same classification.
adp.js runs in a node vm with stub globals; the page hash and every part hash are compared with `adp.py manifest` on the same text,
and ADP.classify with adp_loop.classify on a handful of manifests. Skipped when node is not on PATH."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADP_JS = os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'assets', 'adp.js')
ADP_PY = os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts', 'adp.py')
sys.path.insert(0, os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts'))

HARNESS = r"""
const vm = require('vm'), fs = require('fs'), noop = () => {};
const el = new Proxy(function(){}, {get: (t, k) => k === Symbol.toPrimitive ? () => '' : el, apply: () => el, set: () => true});
const win = {addEventListener: noop, document: {querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, readyState: 'loading',
  documentElement: el, head: el, body: el, createElement: () => el}, crypto: require('crypto').webcrypto, TextEncoder, MutationObserver: class { observe(){} disconnect(){} },
  location: {href: 'https://x/', search: '', hash: ''}, navigator: {}, console, setTimeout, clearTimeout};
win.window = win; win.self = win; win.globalThis = win;
vm.createContext(win); vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), win);
const job = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => console.log(JSON.stringify({hash: await win.ADP.hash(job.text, job.files), classify: job.classify.map(c => win.ADP.classify(...c))})))();
"""

PAGE = ('<!doctype html><html><head><title>Página ñ</title><style>/* part:css */a{content:"é"}/* /part:css */</style></head><body>\n'
        '<!-- part:home -->\n<h1>Bienvenido, 日本語 ✓ 😀</h1>\n<!-- part:home.card -->\n  <p>naïve   café —  <b>x</b></p>\n'
        '  <!-- part:home.card.note -->nested\tdeeper\n<!-- /part:home.card.note -->\n<!-- /part:home.card -->\n<!-- /part:home -->\n'
        '<!-- part:about -->Ünïcödé about<!-- /part:about -->\n<footer>outside every part</footer></body></html>\n')

M = lambda parts, files=None, **kw: {'parts': parts, 'files': files or {}, **kw}
CLASSIFY = [
    (M({'a': '1', 'b': '2'}), M({'a': '1', 'b': '2'}), M({'a': '9', 'b': '2'})),                     # ours
    (M({'a': '1'}), M({'a': '5'}), M({'a': '1'})),                                                     # theirs
    (M({'a': '1'}), M({'a': '5'}), M({'a': '9'})),                                                     # held
    (M({'a': '1'}), M({'a': '5'}), M({'a': '5'})),                                                     # applied
    (M({}), M({}), M({'n': '1'}, {'f.css': 'abc'})),                                                   # new
    (M({'a': '1', 'b': '1'}), M({'a': '1', 'b': '1'}), M({'a': '1'})),                                 # an unretired delete: held
    (M({'a': '1', 'b': '1'}), M({'a': '1', 'b': '1'}), M({'a': '1'}, retired={'b': 'gone'})),          # retired
    (M({'p': '1', 'p.c': '1'}, parents={'p.c': 'p'}), M({'p': '2', 'p.c': '1'}), M({'p': '3', 'p.c': '9'}, parents={'p.c': 'p'})),   # a held parent holds its child
    (M({'x': '1', 'y': '1'}), M({'x': '1', 'y': '2'}), M({'x': '3', 'y': '1'}, requires={'comp': ['x']})),
    (M({'a': '1'}, {'f': 's'}), M({'a': '1'}, {'f': 't'}), M({'a': '1'}, {'f': 's'})),                  # files take part too
]


@unittest.skipUnless(shutil.which('node'), 'node is not on PATH')
class Parity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def js(self, text, files=None, classify=()):
        h = os.path.join(self.tmp, 'h.js')
        with open(h, 'w') as f: f.write(HARNESS)
        r = subprocess.run(['node', h, ADP_JS], input=json.dumps({'text': text, 'files': files or {}, 'classify': [list(c) for c in classify]}),
                           capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def py_manifest(self, text, files=None):
        p = os.path.join(self.tmp, 'page.html')
        with open(p, 'w', encoding='utf-8') as f: f.write(text)
        extra = ['--file'] + [f'{k}={v}' for k, v in (files or {}).items()] if files else []     # NAME=PATH: adp.py hashes the file
        r = subprocess.run([sys.executable, '-I', ADP_PY, 'manifest', p, *extra], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def test_page_and_part_hashes(self):
        j, m = self.js(PAGE)['hash'], self.py_manifest(PAGE)
        self.assertEqual(j['bad'], [])
        self.assertEqual(j['parts'], m['parts'])
        # observed divergence, not a hash: adp.py lists '_rest' in parents (with ''), adp.js leaves it out; every real part agrees
        self.assertEqual(j['parents'], {k: v for k, v in m['parents'].items() if k != '_rest'})
        self.assertEqual(j['page_hash'], m['page_hash'])
        self.assertGreaterEqual(len(m['parts']), 6)       # the nested parts and the rest are all in the comparison

    def test_page_hash_with_files(self):
        paths, shas = {}, {}
        for name, body in (('styles/a.css', 'a{color:red}\n'), ('app.js', 'var é = 1;\n')):
            paths[name] = os.path.join(self.tmp, name.replace('/', '_'))
            with open(paths[name], 'wb') as f: f.write(body.encode('utf-8'))
            shas[name] = hashlib.sha256(body.encode('utf-8')).hexdigest()[:12]
        self.assertEqual(self.js(PAGE, shas)['hash']['page_hash'], self.py_manifest(PAGE, paths)['page_hash'])

    def test_classify(self):
        import adp_loop
        got = self.js('', classify=CLASSIFY)['classify']
        for i, (b, l, n) in enumerate(CLASSIFY):
            want = adp_loop.classify(b, l, n)
            norm = lambda o: {k: sorted(o[k], key=lambda x: x['id'] if isinstance(x, dict) else x) for k in o}
            self.assertEqual(norm(got[i]), norm(want), f'fixture {i}')


if __name__ == '__main__':
    unittest.main()
