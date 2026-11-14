import json, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_setup import Base


class TierTests(Base):
    def setUp(self):
        super().setUp()
        os.makedirs(os.path.join(self.root, 'assets')); open(os.path.join(self.root, 'assets', 'adp.js'), 'w').write('//adp\n')

    def fake(self, name):
        d = os.path.join(self.root, 'templates', name); os.makedirs(d, exist_ok=True)
        json.dump({'summary': 'fake', 'use_when': 'tests'}, open(os.path.join(d, 'template.json'), 'w'))
        open(os.path.join(d, 'index.html'), 'w').write(f'<!doctype html><title>{name}</title>\n')

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
        self.assertIn('default', open(os.path.join(self.tmp, 'out', 'index.html')).read())

    def test_default_missing(self):
        r = self.build('--tier', 'default')
        self.assertEqual((r.returncode, r.stderr.strip()), (1, "tier default: template 'default' not found"))

    def test_full_is_the_catalog(self):
        from pathlib import Path
        from test_index import make_catalog
        make_catalog(Path(self.root) / 'catalog')          # the skill's own catalog folder: `new catalog DIR` and --tier full build from it
        r = self.build('--tier', 'full')
        self.assertEqual(r.returncode, 0, r.stderr)
        pub, out = json.loads(r.stdout), os.path.join(self.tmp, 'out')
        self.assertNotIn('url', pub)
        self.assertEqual((pub['files']['seed.json'], [p for p in pub['files'] if p.startswith('kit/')]), ('seed.json', []))
        self.assertEqual((os.path.isfile(os.path.join(out, 'catalog.json')), os.path.exists(os.path.join(out, 'kit'))), (True, False))

    def test_templates_lists_the_catalog_and_index_checks_it(self):
        from pathlib import Path
        from test_index import make_catalog
        self.fake('starter'); make_catalog(Path(self.root) / 'catalog')
        self.assertIn('\ncatalog    The catalog itself', '\n' + self.run_adp('templates').stdout)
        codes = [self.run_adp('index', *a).returncode for a in (('--check',), (), ('--check',))]       # no DIR: the skill's own catalog folder
        self.assertEqual(codes, [1, 0, 0])                                                              # no catalog.json yet; written; equal

    def test_both_and_unknown_refused(self):
        for args in (('starter', '--tier', 'minimal'), ('--tier', 'huge')):
            r = self.build(*args)
            self.assertEqual(r.returncode, 1); self.assertTrue(r.stderr.startswith('usage: adp.py new'))
            self.assertEqual(len(r.stderr.strip().split('\n')), 1)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, 'out')))


if __name__ == '__main__':
    unittest.main()
