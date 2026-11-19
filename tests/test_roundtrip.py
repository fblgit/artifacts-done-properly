import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, 'tools', 'roundtrip.py')


def roundtrip(*args, env=None):
    e = dict(os.environ if env is None else env); e.pop('CI', None)
    p = subprocess.run([sys.executable, '-I', TOOL, *args], capture_output=True, text=True, env=e)
    return p.returncode, p.stdout + p.stderr


class Roundtrip(unittest.TestCase):
    def copy(self):
        d = tempfile.mkdtemp(); self.addCleanup(shutil.rmtree, d, True)
        shutil.copytree(os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp'), os.path.join(d, 'skill'), ignore=shutil.ignore_patterns('__pycache__'))
        return os.path.join(d, 'skill')

    @unittest.skipIf(os.environ.get('CI'), 'CI runs tools/roundtrip.py on the whole catalog in its own step (the skill job)')
    def test_the_repos_catalog_passes_every_check(self):
        code, out = roundtrip()
        self.assertEqual(code, 0, out[-1500:])
        for n in range(1, 9): self.assertRegex(out, rf'(?m)^{n}  (PASS|SKIP)  ')
        self.assertNotIn('FAIL', out)

    def test_a_changed_byte_in_a_listed_file_fails_check_2(self):
        skill = self.copy()
        with open(os.path.join(skill, 'catalog', 'kit', 'dom.js'), 'a', encoding='utf-8') as f: f.write(' ')
        code, out = roundtrip(skill, '--only', '2')
        self.assertEqual(code, 1)
        self.assertRegex(out, r'(?m)^2  FAIL  index -> files')
        self.assertIn('kit/dom.js sha256 differs', out)

    def test_a_removed_bundle_key_fails_checks_7_and_8(self):
        skill = self.copy(); p = os.path.join(skill, 'catalog', 'kit', 'samples', 'kit.json')
        with open(p, encoding='utf-8') as f: d = json.load(f)
        del d['tabs']
        with open(p, 'w', encoding='utf-8') as f: json.dump(d, f)
        code, out = roundtrip(skill, '--only', '7,8')
        self.assertEqual(code, 1)
        self.assertRegex(out, r'(?m)^7  FAIL  ')
        self.assertRegex(out, r'(?m)^8  FAIL  ')
        self.assertIn("no key 'tabs' in the bundle", out)
        self.assertIn('@samples tabs is in no bundle of its own @files', out)

    def test_a_bundle_key_no_entry_owns_fails_check_8(self):
        skill = self.copy(); p = os.path.join(skill, 'catalog', 'kit', 'samples', 'kit.json')
        with open(p, encoding='utf-8') as f: d = json.load(f)
        d['stray'] = {'x': 1}
        with open(p, 'w', encoding='utf-8') as f: json.dump(d, f)
        code, out = roundtrip(skill, '--only', '8')
        self.assertEqual(code, 1)
        self.assertIn('keys no entry owns (@samples): stray', out)

    def test_without_node_a_check_that_needs_it_skips_and_fails_when_node_is_required(self):
        env = dict(os.environ, PATH='/nonexistent')       # python is started by its absolute path; `node` is not found
        code, out = roundtrip('--only', '3', env=env)
        self.assertEqual(code, 0, out); self.assertRegex(out, r'(?m)^3  SKIP  ')
        code, out = roundtrip('--only', '3', '--require-node', env=env)
        self.assertEqual(code, 1, out); self.assertRegex(out, r'(?m)^3  FAIL  ')
        env['CI'] = 'true'
        p = subprocess.run([sys.executable, '-I', TOOL, '--only', '3'], capture_output=True, text=True, env=env)
        self.assertEqual(p.returncode, 1, p.stdout)       # CI sets it: node is required without the flag


if __name__ == '__main__':
    unittest.main()
