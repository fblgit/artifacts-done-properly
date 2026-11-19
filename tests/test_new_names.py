from pathlib import Path
import json, os, re, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADP = os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts', 'adp.py')
sys.path.insert(0, os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts'))
import adp  # noqa: E402


def run(*args):
    env = dict(os.environ, ADP_HOME=tempfile.mkdtemp())
    return subprocess.run([sys.executable, ADP, *args], capture_output=True, text=True, env=env)


class RealName(unittest.TestCase):
    def test_strips_txt_after_another_extension(self):
        for p, want in (('index.html.txt', 'index.html'), ('parts/app.js.txt', 'parts/app.js'), ('styles/a.css.txt', 'styles/a.css')):
            self.assertEqual(adp.real_name(p), want)

    def test_keeps_plain_txt_and_other_names(self):
        for p in ('notes.txt', 'dir/README.txt', 'seed.json', 'adp.js'):
            self.assertEqual(adp.real_name(p), p)


class NewWritesRealNames(unittest.TestCase):
    def check_template(self, *args):
        d = os.path.join(tempfile.mkdtemp(), 'out')
        r = run('new', *args, d)
        self.assertEqual(r.returncode, 0, r.stderr)
        files = [os.path.relpath(os.path.join(b, n), d) for b, _, ns in os.walk(d) for n in ns]
        self.assertEqual([f for f in files if f.endswith('.txt')], [])
        self.assertTrue(os.path.isfile(os.path.join(d, 'index.html')))
        c = run('check', d)
        self.assertEqual(c.returncode, 0, c.stdout + c.stderr)
        return d

    def test_starter(self):
        self.check_template('starter')

    def test_assistant(self):
        self.check_template('assistant')

    def test_default_tier(self):
        self.check_template('--tier', 'default')

    def test_publish_points_at_files_that_exist(self):
        d = os.path.join(tempfile.mkdtemp(), 'out')
        out = json.loads(run('new', 'starter', d).stdout)
        self.assertTrue(os.path.isfile(out['publish']['file_path']))
        for p in out['publish']['files']:
            self.assertTrue(os.path.isfile(os.path.join(d, p)), p)


class BaseChain(unittest.TestCase):
    def test_chain_is_base_first(self):
        self.assertEqual(adp.base_chain('default'), ['starter', 'assistant', 'default'])
        self.assertEqual(adp.base_chain('starter'), ['starter'])

    def test_loop_refused(self):
        old = adp.tmeta
        adp.tmeta = lambda n: {'base': 'b' if n == 'a' else 'a'}
        try:
            with self.assertRaises(SystemExit):
                adp.base_chain('a')
        finally:
            adp.tmeta = old


class ProjectIsComplete(unittest.TestCase):
    def files(self, *args):
        d = os.path.join(tempfile.mkdtemp(), 'out')
        r = run('new', *args, d)
        self.assertEqual(r.returncode, 0, r.stderr)
        return d, {os.path.relpath(os.path.join(b, n), d) for b, _, ns in os.walk(d) for n in ns}

    def test_default_has_every_file_of_assistant(self):
        _, a = self.files('assistant')
        _, dflt = self.files('--tier', 'default')
        self.assertEqual(sorted(a - dflt), [])

    def test_local_files_index_links_exist(self):
        # kit/ files come from the catalog by reference; every other file the page links is the project's own
        for args in (('starter',), ('assistant',), ('--tier', 'default')):
            d, _ = self.files(*args)
            html = Path(os.path.join(d, 'index.html')).read_text(encoding='utf-8')
            refs = [r for r in re.findall(r'(?:src|href)="([^"]+)"', html) if not re.match(r'(?:[a-z]+:|#|//)', r) and not r.startswith('kit/')]
            self.assertEqual([r for r in refs if not os.path.isfile(os.path.join(d, r))], [], args)


if __name__ == '__main__':
    unittest.main()
