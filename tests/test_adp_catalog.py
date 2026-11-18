from pathlib import Path
import contextlib
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'skill', 'scripts'))
import adp_catalog as cc  # noqa: E402
from test_adp_lib import GOOD, Base, header  # noqa: E402

HEADER = """/**
 * Demo
 * A demo entry.
 *
 * @id        kit.demo
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-25
 * @summary   A demo entry.
 * @tags      demo
 * @requires  none
 * @files     none
 * @provides  Kit.demo
 * @globals   none
 * @db        none
 */
(function () {})();
"""


class CheckCatalog(unittest.TestCase):
    def make(self, text, entry_files=None):
        """A catalog folder holding kit/demo.js, with a hand-made catalog.json (old shape) listing it."""
        root = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, 'kit'))
        data = text.encode('utf-8')
        Path(os.path.join(root, 'kit', 'demo.js')).write_bytes(data)
        sha = hashlib.sha256(data).hexdigest()
        files = entry_files if entry_files is not None else [{'path': 'kit/demo.js', 'role': 'script', 'sha256': sha, 'bytes': len(data)}]
        h = hashlib.sha256('\n'.join(f"{f['path']}={f['sha256']}" for f in files).encode()).hexdigest()[:12]
        Path(os.path.join(root, 'catalog.json')).write_text(json.dumps({'entries': [{'id': 'kit.demo', 'files': files, 'hash': h}]}))
        return root

    def cmd(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = cc.main(list(argv))
        return code, out.getvalue() + err.getvalue()

    def run_check(self, text, entry_files=None, built=False):
        root = self.make(text, entry_files)
        if built:
            self.assertEqual(self.cmd('build', root)[0], 0)
        return self.cmd(root)

    def test_valid_header_passes(self):
        code, out = self.run_check(HEADER, built=True)
        self.assertEqual((code, out.startswith('OK')), (0, True), out)
        self.assertIn('1 valid headers', out)

    def test_more_entries_than_one_read_holds_fail(self):
        root = self.make(HEADER)
        self.cmd('build', root)
        with mock.patch.object(cc.lib, 'READ_MAX', 0):
            code, out = self.cmd(root)
        self.assertEqual(code, 1)
        self.assertIn('do not fit one Artifact read (0 paths at most)', out)
        self.assertEqual(self.cmd(root)[0], 0)

    def test_build_writes_the_index_from_the_header(self):
        root = self.make(HEADER)
        code, out = self.cmd('build', root)
        self.assertEqual(code, 0, out)
        e, = json.loads(Path(os.path.join(root, 'catalog.json')).read_text())['entries']
        self.assertEqual((e['id'], e['main'], e['name'], e['provides']), ('kit.demo', 'kit/demo.js', 'Demo', ['Kit.demo']))
        self.assertNotIn('about', e)
        self.assertIn('unchanged', self.cmd('build', root)[1])

    def test_build_refuses_a_broken_header_and_writes_nothing(self):
        root = self.make(HEADER.replace(' * @db        none', ' * @bogus     x'))
        before = Path(os.path.join(root, 'catalog.json')).read_text()
        code, out = self.cmd('build', root)
        self.assertEqual(code, 1)
        self.assertIn('[unknown-tag]', out)
        self.assertEqual(Path(os.path.join(root, 'catalog.json')).read_text(), before)

    def test_check_fails_when_catalog_json_is_not_what_the_headers_build(self):
        root = self.make(HEADER)
        self.cmd('build', root)
        Path(os.path.join(root, 'kit', 'demo.js')).write_text(HEADER.replace('Demo\n', 'Demo two\n', 1))
        code, out = self.cmd(root)
        self.assertEqual(code, 1)
        self.assertIn('catalog.json: kit.demo.', out)

    def test_the_shipped_catalog_keeps_its_url(self):
        # build keeps the url already in catalog.json, so a rebuild from a blank one stays blank and `adp.py new --catalog` then refuses it
        with open(os.path.join(ROOT, 'skill', 'catalog', 'catalog.json')) as f:
            self.assertTrue(json.load(f)['url'].startswith('https://'))

    def test_no_header_fails(self):
        code, out = self.run_check('(function () {})();\n')
        self.assertEqual(code, 1)
        self.assertIn('[legacy]', out)

    def test_unknown_and_missing_tags_fail(self):
        code, out = self.run_check(HEADER.replace(' * @db        none', ' * @bogus     x'))
        self.assertEqual(code, 1)
        self.assertIn('[unknown-tag]', out)
        self.assertIn('[missing-tag]', out)

    def test_entry_without_a_file_for_its_header_fails(self):
        code, out = self.run_check(HEADER, [{'path': 'kit/demo.js', 'role': 'sample', 'sha256': hashlib.sha256(HEADER.encode()).hexdigest(), 'bytes': len(HEADER)}])
        self.assertEqual(code, 1)
        self.assertIn('no script, style, template or doc file', out)


class HeadersCommand(Base):
    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = cc.main(['headers', '--root', self.root, *args])
        return code, out.getvalue(), err.getvalue()

    def test_exit_codes(self):
        p = self.write('kit/demo.js', GOOD)
        self.assertEqual(self.run_main(p)[0], 0)
        p = self.write('kit/demo.js', header(status='beta'))
        code, out, _ = self.run_main(p)
        self.assertEqual(code, 1)
        self.assertIn('[status]', out)

    def test_report_counts_and_exits_zero(self):
        self.write('kit/demo.js', GOOD)
        self.write('kit/other.js', '/* old */')
        self.write('kit/t.html.txt', '<!-- old -->')
        code, out, _ = self.run_main('--report')
        self.assertEqual(code, 0)
        self.assertIn('kit', out)
        self.assertIn('rule legacy: 2', out)


DRIFT_HDR = """/**
 * Demo
 * Renders gorgeous colourful sparkling widgets for dashboards.
 *
 * @id        kit.a
 * @version   %s
 * @provides  Kit.a.One, Kit.a.Two
 * @tokens    --ink --panel --c-<pen>
 * @db        none
 */
(function () {})();
"""


def drift_entry(i, files, **kw):
    e = {'id': i, 'version': '1.0.0', 'about': 'Renders gorgeous colourful sparkling widgets.', 'provides': ['Kit.a.One', 'Kit.a.Two'],
         'files': files, 'needs': {'tokens': ['--ink', '--panel'], 'db': {'reads': [], 'writes': []}}}
    e.update(kw)
    return e


class Drift(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.entries = []

    def js(self, name, text, role='script'):
        Path(os.path.join(self.d, name)).write_text(text, encoding='utf-8')
        return [{'path': name, 'role': role}]

    def run_tool(self, *args):
        Path(os.path.join(self.d, 'catalog.json')).write_text(json.dumps({'entries': self.entries}))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cc.main(['drift', '--catalog-dir', self.d, *args])
        return code, out.getvalue()

    def test_match(self):
        self.entries = [drift_entry('ok', self.js('a.js', DRIFT_HDR % '1.0.0'))]
        code, out = self.run_tool('--strict')
        self.assertEqual(code, 0, out)
        self.assertNotIn('ok version', out)
        self.assertIn('version', out)

    def test_version_drift_and_strict(self):
        self.entries = [drift_entry('v', self.js('a.js', DRIFT_HDR % '1.0.1'))]
        code, out = self.run_tool()
        self.assertEqual(code, 0)
        self.assertIn('v version: header=1.0.1 catalog=1.0.0', out)
        self.assertEqual(self.run_tool('--strict')[0], 1)

    def test_provides_drift(self):
        self.entries = [drift_entry('p', self.js('a.js', DRIFT_HDR % '1.0.0'), provides=['Kit.a.One'])]
        code, out = self.run_tool('--strict')
        self.assertIn('p provides:', out)
        self.assertEqual(code, 1)

    def test_wildcards_listed_not_compared(self):
        self.entries = [drift_entry('w', self.js('a.js', DRIFT_HDR % '1.0.0'))]
        out = self.run_tool()[1]
        self.assertNotIn('w tokens', out)
        self.assertIn('wildcard tokens (not compared): w --c-<pen>', out)

    def test_missing_header(self):
        self.entries = [drift_entry('n', self.js('a.js', '/* nothing */\n'))]
        code, out = self.run_tool('--strict')
        self.assertEqual(code, 0)
        self.assertIn('entries without a header: n', out)

    def test_every_kind_of_main_file_is_read(self):
        self.entries = [drift_entry('c', self.js('a.css', DRIFT_HDR.replace('(function () {})();', 'a{}') % '1.0.0', 'style'))]
        code, out = self.run_tool('--strict')
        self.assertEqual(code, 0, out)
        self.assertIn('0 without a header', out)

    def test_field_filter(self):
        self.entries = [drift_entry('f', self.js('a.js', DRIFT_HDR % '9.9.9'), provides=['x'])]
        out = self.run_tool('--field', 'provides')[1]
        self.assertIn('f provides:', out)
        self.assertNotIn('f version', out)
        self.assertEqual(self.run_tool('--field', 'about', '--strict')[0], 0)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            self.run_tool('--field', 'bogus')

    def test_real_catalog_smoke(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cc.main(['drift'])
        self.assertEqual(code, 0)
        self.assertIn('no header', out.getvalue())
        self.assertIn('equal', out.getvalue())


class SampleBundles(unittest.TestCase):
    """A bundle is one JSON file of samples (kit/samples/kit.json): its keys are the samples, an entry names one as path#key in its @preview."""
    BUNDLE = 'kit/samples/kit.json'

    def head(self, name, files, samples, owns=None):
        """owns: the keys @samples lists; by default the keys the @preview names in a bundle of the entry's own @files."""
        pv = json.dumps({'render': 'kit.' + name, 'samples': samples})
        if owns is None:
            owns = [s.split('#')[1] for s in samples if '#' in s and s.split('#')[0] in files]
        own = (' * @samples   ' + ', '.join(owns) + '\n') if owns else ''
        return ('/**\n * Entry ' + name + '\n * An entry.\n *\n * @id        kit.' + name + '\n * @kind      component\n * @group     Board kit\n'
                ' * @status    new\n * @version   0.1.0\n * @updated   2026-11-15\n * @summary   An entry.\n * @tags      demo\n * @requires  none\n'
                ' * @files     ' + files + '\n * @provides  Kit.' + name + '\n * @globals   none\n * @db        none\n * @preview   ' + pv + '\n' + own + ' */\n(function () {})();\n')

    def put(self, root, rel, text):
        with open(os.path.join(root, rel), 'w', encoding='utf-8') as f:
            f.write(text)

    def make(self, bundle, *entries, extra=()):
        root = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, 'kit', 'samples'))
        for name, files, samples, *owns in entries:
            self.put(root, f'kit/{name}.js', self.head(name, files, samples, *owns))
        self.put(root, self.BUNDLE, json.dumps(bundle))
        for rel, data in extra:
            self.put(root, rel, json.dumps(data))
        return root

    def cmd(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = cc.main(list(argv))
        return code, out.getvalue() + err.getvalue()

    def two(self, bundle=None, **over):
        b = self.BUNDLE
        return self.make(bundle if bundle is not None else {'a': {'x': 1}, 'b': {'y': 2}},
                         ('a', over.get('af', b), over.get('as', [b + '#a']), over.get('ao')), ('b', over.get('bf', b), over.get('bs', [b + '#b']), over.get('bo')),
                         extra=over.get('extra', ()))

    def test_two_entries_share_a_bundle(self):
        root = self.two()
        self.assertEqual(self.cmd('build', root)[0], 0)
        code, out = self.cmd(root)
        self.assertEqual((code, out[:2]), (0, 'OK'), out)
        with open(os.path.join(root, 'catalog.json'), encoding='utf-8') as f:
            idx = json.load(f)
        self.assertEqual([[f['path'] for f in e['files']] for e in idx['entries']], [['kit/a.js', self.BUNDLE], ['kit/b.js', self.BUNDLE]])
        self.assertEqual({f['role'] for e in idx['entries'] for f in e['files'] if f['path'] == self.BUNDLE}, {'sample'})

    def test_a_key_that_is_not_in_the_bundle_fails_the_build(self):
        code, out = self.cmd('build', self.two(**{'as': [self.BUNDLE + '#zzz']}))
        self.assertEqual(code, 1)
        self.assertIn('kit/samples/kit.json has no key zzz', out)

    def test_a_key_no_entry_names_fails(self):
        code, out = self.cmd('build', self.two({'a': {}, 'b': {}, 'c': {}}))
        self.assertEqual(code, 1)
        self.assertIn('the key c is named by no entry', out)

    def test_an_entry_that_lists_the_bundle_names_a_key_of_it(self):
        code, out = self.cmd('build', self.two(bs=[]))
        self.assertEqual(code, 1)
        self.assertIn('kit.b: @files lists the sample bundle kit/samples/kit.json, but its @preview names no key of it', out)
        self.assertIn('the key b is named by no entry', out)

    def test_an_entry_on_another_folders_samples_lists_that_bundle_too(self):
        root = self.make({'a': {}}, ('a', self.BUNDLE, [self.BUNDLE + '#a']), ('c', self.BUNDLE, [self.BUNDLE + '#a']))
        self.assertEqual(self.cmd('build', root)[0], 0)
        self.assertEqual(self.cmd(root)[0], 0)

    def test_a_bundle_that_is_not_in_the_files_of_the_entry_fails(self):
        code, out = self.cmd('build', self.make({'a': {}}, ('a', self.BUNDLE, [self.BUNDLE + '#a']), ('c', 'none', [self.BUNDLE + '#a'])))
        self.assertEqual(code, 1)
        self.assertIn('kit.c: @preview names kit/samples/kit.json#a, but kit/samples/kit.json is not a sample file in its @files', out)
        code, out = self.cmd('build', self.two(**{'as': ['kit/samples/other.json#a']}))
        self.assertEqual(code, 1)
        self.assertIn('kit/samples/other.json is not a sample file in its @files', out)

    def test_a_samples_key_must_be_in_a_bundle_of_the_entrys_files(self):
        code, out = self.cmd('build', self.two(ao=['a', 'zzz']))
        self.assertEqual(code, 1)
        self.assertIn('kit.a: @samples names zzz, which is a key of no sample bundle in its @files', out)
        code, out = self.cmd('build', self.two(af='none', ao=['a'], **{'as': []}))      # a lists no bundle: its @samples key a is in none of its files
        self.assertEqual(code, 1)
        self.assertIn('kit.a: @samples names a, which is a key of no sample bundle in its @files', out)

    def test_a_key_no_entry_owns_fails(self):
        code, out = self.cmd('build', self.two(ao=[]))
        self.assertEqual(code, 1)
        self.assertIn("kit/samples/kit.json: the key a is owned by no entry's @samples", out)
        self.assertNotIn('the key b is owned', out)

    def test_a_key_may_have_several_owners(self):
        root = self.make({'a': {}}, ('a', self.BUNDLE, [self.BUNDLE + '#a']), ('c', self.BUNDLE, [self.BUNDLE + '#a']))
        self.assertEqual(self.cmd('build', root)[0], 0)

    def test_a_plain_sample_file_is_not_a_bundle(self):
        root = self.make({'a': {}}, ('a', self.BUNDLE, [self.BUNDLE + '#a']), ('d', 'kit/samples/d.json', ['kit/samples/d.json']), extra=[('kit/samples/d.json', {'z': 1})])
        self.assertEqual(self.cmd('build', root)[0], 0)
        self.assertEqual(self.cmd(root)[0], 0)

    def test_check_fails_when_a_bundle_loses_a_key_after_the_build(self):
        root = self.two()
        self.cmd('build', root)
        self.put(root, self.BUNDLE, json.dumps({'a': {}}))
        code, out = self.cmd(root)
        self.assertEqual(code, 1)
        self.assertIn('has no key b', out)


if __name__ == '__main__':
    unittest.main()
