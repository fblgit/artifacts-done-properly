from pathlib import Path
import json, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_setup import Base


class TierTests(Base):
    def setUp(self):
        super().setUp()
        os.makedirs(os.path.join(self.root, 'assets')); Path(os.path.join(self.root, 'assets', 'adp.js')).write_text('//adp\n')

    def fake(self, name):
        d = os.path.join(self.root, 'templates', name); os.makedirs(d, exist_ok=True)
        Path(os.path.join(d, 'template.json')).write_text(json.dumps({'summary': 'fake', 'use_when': 'tests'}))
        Path(os.path.join(d, 'index.html')).write_text(f'<!doctype html><title>{name}</title>\n')

    def build(self, *args):
        return self.run_adp('new', *args, os.path.join(self.tmp, 'out'))

    def test_minimal_uses_starter(self):
        self.fake('starter')
        r = self.build('--tier', 'minimal')
        self.assertEqual(r.returncode, 0, r.stderr); self.assertTrue(os.path.isfile(os.path.join(self.tmp, 'out', 'index.html')))

    def test_default_with_fake_default(self):
        self.fake('default')
        r = self.build('--tier', 'default')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('default', Path(os.path.join(self.tmp, 'out', 'index.html')).read_text())

    def test_default_missing(self):
        r = self.build('--tier', 'default')
        self.assertEqual((r.returncode, r.stderr.strip()), (1, "tier default: template 'default' not found"))

    def test_full_refused(self):
        r = self.build('--tier', 'full')
        self.assertEqual((r.returncode, r.stderr.strip()), (1, 'tier full is not available yet'))

    def test_both_and_unknown_refused(self):
        for args in (('starter', '--tier', 'minimal'), ('--tier', 'huge')):
            r = self.build(*args)
            self.assertEqual(r.returncode, 1); self.assertTrue(r.stderr.startswith('usage: adp.py new'))
            self.assertEqual(len(r.stderr.strip().split('\n')), 1)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, 'out')))


if __name__ == '__main__':
    unittest.main()
