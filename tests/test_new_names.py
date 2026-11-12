import os, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADP = os.path.join(ROOT, 'skill', 'scripts', 'adp.py')
sys.path.insert(0, os.path.join(ROOT, 'skill', 'scripts'))
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
        import json
        out = json.loads(run('new', 'starter', d).stdout)
        self.assertTrue(os.path.isfile(out['publish']['file_path']))
        for p in out['publish']['files']:
            self.assertTrue(os.path.isfile(os.path.join(d, p)), p)


if __name__ == '__main__':
    unittest.main()
