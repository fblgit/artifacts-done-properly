import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(ROOT, 'skill', 'templates')


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


class DefaultTemplate(unittest.TestCase):
    def setUp(self):
        self.t = load(os.path.join(TPL, 'default', 'template.json'))
        self.cat = {e['id']: e for e in load(os.path.join(ROOT, 'skill', 'catalog', 'catalog.json'))['entries']}

    def test_name_and_base(self):
        self.assertEqual(self.t['name'], 'default')
        self.assertTrue(os.path.isfile(os.path.join(TPL, self.t['base'], 'template.json')))

    def test_take_exists_no_duplicates(self):
        take = self.t['take']
        self.assertEqual(len(take), len(set(take)))
        self.assertEqual([i for i in take if i not in self.cat], [])

    def test_capabilities_equal_assistant(self):
        self.assertEqual(self.t['capabilities'], load(os.path.join(TPL, 'assistant', 'template.json'))['capabilities'])

    def test_assistant_take_leads(self):
        a = load(os.path.join(TPL, 'assistant', 'template.json'))['take']
        self.assertEqual(self.t['take'][:len(a)], a)

    def test_all_themes(self):
        themes = {i for i in self.cat if i.startswith('theme.')}
        self.assertEqual(len(themes), 13)
        self.assertLessEqual(themes, set(self.t['take']))

    def test_requires_closure_in_catalog(self):
        seen, todo = set(), list(self.t['take'])
        while todo:
            i = todo.pop()
            if i in seen:
                continue
            seen.add(i)
            self.assertIn(i, self.cat)
            todo += self.cat[i].get('requires') or []


CDN = {
    'htm-preact': 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.umd.js',
    'marked': 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js',
    'dompurify': 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js',
}


def tags(text):
    """(styles, scripts) hrefs and srcs in document order; the Google Fonts links are not files of the page."""
    styles = [h for h in re.findall(r'<link rel="stylesheet" href="([^"]+)">', text) if not h.startswith('https://fonts.googleapis.com/')]
    return (styles, re.findall(r'<script src="([^"]+)"></script>', text))


class DefaultLoader(unittest.TestCase):
    def setUp(self):
        self.t = load(os.path.join(TPL, 'default', 'template.json'))
        self.cat = {e['id']: e for e in load(os.path.join(ROOT, 'skill', 'catalog', 'catalog.json'))['entries']}
        with open(os.path.join(TPL, 'default', 'index.html.txt'), encoding='utf-8') as f:
            self.text = f.read()
        self.styles, self.scripts = tags(self.text)
        order, seen = [], set()

        def visit(i):
            if i in seen:
                return
            seen.add(i)
            for r in self.cat[i].get('requires') or []:
                visit(r)
            order.append(i)
        for i in self.t['take']:
            visit(i)
        self.order = order

    def files(self, role):
        return [f['path'] for i in self.order for f in self.cat[i]['files'] if f['role'] == role and not f['path'].startswith('kit/themes/')]

    def test_every_style_and_script_once(self):
        for role, found in (('style', self.styles), ('script', self.scripts)):
            want = self.files(role)
            self.assertEqual(len(want), len(set(want)))
            for p in want:
                self.assertEqual(found.count(p), 1, p)

    def test_no_theme_stylesheet(self):
        self.assertEqual([p for p in self.styles if p.startswith('kit/themes/')], [])

    def test_frame_files(self):
        self.assertEqual((self.styles[0], self.styles[-1]), ('styles/page.css', 'styles/assist.css'))
        self.assertEqual(self.scripts[:2], ['adp.js', 'content.js'])
        self.assertEqual(self.scripts[-1], 'parts/app.js')

    def first_script(self, i):
        idx = [self.scripts.index(f['path']) for f in self.cat[i]['files'] if f['role'] == 'script']
        return min(idx) if idx else None

    def test_requires_before_dependents(self):
        for i in self.order:
            mine = [self.scripts.index(f['path']) for f in self.cat[i]['files'] if f['role'] == 'script']
            for r in self.cat[i].get('requires') or []:
                for f in self.cat[r]['files']:
                    if f['role'] == 'script' and mine:
                        self.assertLess(self.scripts.index(f['path']), min(mine), f'{r} before {i}')
                    if f['role'] == 'style' and not f['path'].startswith('kit/themes/'):
                        for g in self.cat[i]['files']:
                            if g['role'] == 'style':
                                self.assertLess(self.styles.index(f['path']), self.styles.index(g['path']), f'{r} before {i}')

    def test_globals_before_first_kit_script(self):
        for i in self.order:
            first = self.first_script(i)
            for g in self.cat[i].get('globals') or []:
                self.assertIn(CDN[g], self.scripts, g)
                if first is not None:
                    self.assertLess(self.scripts.index(CDN[g]), first, f'{g} before {i}')

    def test_new_writes_index_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'p')
            r = subprocess.run([sys.executable, os.path.join(ROOT, 'skill', 'scripts', 'adp.py'), 'new', '--tier', 'default', out],
                               capture_output=True, text=True, cwd=tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertFalse(os.path.exists(os.path.join(out, 'index.html.txt')))
            with open(os.path.join(out, 'index.html'), encoding='utf-8') as f:
                got = tags(f.read())
            self.assertEqual(got, (self.styles, self.scripts))


if __name__ == '__main__':
    unittest.main()
