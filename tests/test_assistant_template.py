"""The assistant template (and `default`, which inherits it) with its Canvas tab: what it takes, what its index.html loads, what the publish map holds."""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

from test_default_template import CDN, TPL, load, tags

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADP = os.path.join(ROOT, 'skill', 'scripts', 'adp.py')
CATALOG = os.path.join(ROOT, 'skill', 'catalog', 'catalog.json')
URL = 'https://example.invalid/catalog'
ARGS = {'assistant': ('assistant',), 'default': ('--tier', 'default')}
CANVAS_PARTS = ('canvas', 'canvas.intro', 'canvas.board')


def generate(name):
    """-> (dir, the `new` output) of a project generated with the local catalog index, in a scratch ADP_HOME."""
    d = os.path.join(tempfile.mkdtemp(), 'out')
    r = subprocess.run([sys.executable, ADP, 'new', *ARGS[name], d, '--catalog', CATALOG, '--url', URL],
                       capture_output=True, text=True, env=dict(os.environ, ADP_HOME=tempfile.mkdtemp()))
    if r.returncode:
        raise AssertionError(r.stderr)
    return d, json.loads(r.stdout)


def read(d, p):
    with open(os.path.join(d, p), encoding='utf-8') as f:
        return f.read()


class AssistantTake(unittest.TestCase):
    def setUp(self):
        self.t = load(os.path.join(TPL, 'assistant', 'template.json'))
        self.cat = {e['id']: e for e in load(CATALOG)['entries']}

    def test_canvas_and_what_it_requires_are_taken(self):
        take = self.t['take']
        self.assertEqual(len(take), len(set(take)))
        for i in ('kit.store', 'kit.chrome', 'kit.canvas'):
            self.assertIn(i, take)
        # every entry the taken ones require is taken too: nothing is loaded that is not listed, nothing is missing
        for i in take:
            self.assertEqual([r for r in self.cat[i].get('requires') or [] if r not in take], [], i)

    def test_no_theme_is_taken(self):
        # a theme would replace the page's tokens; the canvas gets its own in styles/canvas.css
        self.assertEqual([i for i in self.t['take'] if i.startswith('theme.')], [])

    def test_default_starts_with_assistant_take(self):
        d = load(os.path.join(TPL, 'default', 'template.json'))['take']
        self.assertEqual(d[:len(self.t['take'])], self.t['take'])

    def test_shared_namespace_is_writable_by_interact(self):
        rules = {r['path']: r for r in self.t['capabilities']['db']['rules']}
        self.assertEqual((rules['ns/shared']['read'], rules['ns/shared']['write']), ('view', 'interact'))
        self.assertEqual(rules['']['write'], 'admin')
        meta = re.search(r"<meta name=\"adp:db-rules\" content='([^']*)'>", open(os.path.join(TPL, 'assistant', 'index.html.txt'), encoding='utf-8').read())
        self.assertEqual(json.loads(meta.group(1)), self.t['capabilities']['db']['rules'])


class Loader(unittest.TestCase):
    """The generated index.html loads every style and script of every taken entry once, in dependency order (the default's test, for both)."""
    def check(self, name):
        d, out = generate(name)
        t = load(os.path.join(TPL, name, 'template.json'))
        cat = {e['id']: e for e in load(CATALOG)['entries']}
        styles, scripts = tags(read(d, 'index.html'))
        order, seen = [], set()

        def visit(i):
            if i in seen:
                return
            seen.add(i)
            for r in cat[i].get('requires') or []:
                visit(r)
            order.append(i)
        for i in t['take']:
            visit(i)
        self.assertEqual(out['take'], t['take'])
        for role, found in (('style', styles), ('script', scripts)):
            want = [f['path'] for i in order for f in cat[i]['files'] if f['role'] == role and not f['path'].startswith('kit/themes/')]
            for p in want:
                self.assertEqual(found.count(p), 1, f'{name}: {p}')
            # nothing under kit/ is loaded that no taken entry owns
            self.assertEqual([p for p in found if p.startswith('kit/') and p not in want], [], name)
        self.assertEqual((styles[0], styles[-1]), ('styles/page.css', 'styles/assist.css'))
        self.assertEqual(scripts[:2], ['adp.js', 'content.js'])
        self.assertEqual(scripts[-1], 'parts/app.js')
        # the canvas styles come after the kit's canvas.css and before the assistant's
        self.assertLess(styles.index('kit/canvas.css'), styles.index('styles/canvas.css'))
        self.assertLess(styles.index('styles/canvas.css'), styles.index('styles/assist.css'))
        for i in order:
            mine = [scripts.index(f['path']) for f in cat[i]['files'] if f['role'] == 'script']
            for r in cat[i].get('requires') or []:
                for f in cat[r]['files']:
                    if f['role'] == 'script' and mine:
                        self.assertLess(scripts.index(f['path']), min(mine), f'{name}: {r} before {i}')
                    if f['role'] == 'style' and not f['path'].startswith('kit/themes/'):
                        for g in cat[i]['files']:
                            if g['role'] == 'style':
                                self.assertLess(styles.index(f['path']), styles.index(g['path']), f'{name}: {r} before {i}')
            first = min(mine) if mine else None
            for g in cat[i].get('globals') or []:
                self.assertIn(CDN[g], scripts, f'{name}: {g} for {i}')
                if first is not None:
                    self.assertLess(scripts.index(CDN[g]), first, f'{name}: {g} before {i}')
        return d, out, styles, scripts

    def test_assistant(self):
        self.check('assistant')

    def test_default(self):
        self.check('default')

    def test_every_loaded_file_is_in_the_publish_map(self):
        for name in ARGS:
            d, out, styles, scripts = self.check(name)
            files = out['publish']['files']
            for p in styles + scripts:
                if p.startswith('https://'):
                    continue
                self.assertIn(p, files, f'{name}: {p} is loaded by index.html but is not in the publish map')
                if p.startswith('kit/'):
                    self.assertEqual(files[p], {'artifact': URL, 'path': p}, f'{name}: {p}')
                else:
                    self.assertTrue(os.path.isfile(os.path.join(d, p)), f'{name}: {p} is a project file but is not in the project')
            for p in ('kit/canvas.js', 'kit/canvas.css', 'kit/store.js', 'kit/chrome.js', 'kit/chrome.css', 'styles/canvas.css'):
                self.assertIn(p, files, name)


class CanvasTab(unittest.TestCase):
    def test_generated_projects_pass_check(self):
        for name in ARGS:
            d, _ = generate(name)
            r = subprocess.run([sys.executable, ADP, 'check', d], capture_output=True, text=True, env=dict(os.environ, ADP_HOME=tempfile.mkdtemp()))
            self.assertEqual(r.returncode, 0, name + r.stdout + r.stderr)
            self.assertIn(', ok;', r.stdout)

    def test_part_ids_are_in_the_generated_content_and_view(self):
        for name in ARGS:
            d, _ = generate(name)
            content = read(d, 'content.js')
            self.assertIn('"canvas.intro"', content, name)
            app = read(d, 'parts/app.js')
            for p in CANVAS_PARTS:
                self.assertIn(f'<!-- part:{p} -->' if p != 'canvas' else '/* part:canvas */', app, f'{name}: {p}')
                self.assertIn(f'data-part="{p}"', app, f'{name}: {p}')
            self.assertEqual(app.count('data-part="canvas.board" data-comment-target'), 1)
            self.assertIn("canvas: 'Canvas', 'canvas.intro': 'Canvas intro', 'canvas.board': 'Canvas board'", app)
            self.assertIn('part:page.style.canvas', read(d, 'styles/canvas.css'))

    def test_canvas_is_wired_by_reference_on_the_shared_namespace(self):
        app = open(os.path.join(TPL, 'assistant', 'parts', 'app.js.txt'), encoding='utf-8').read()
        self.assertIn("pathTemplate: 'ns/shared/{name}'", app)
        for call in ('Kit.store.create', 'Kit.db.create', 'Kit.chrome.create', 'Kit.canvas.create'):
            self.assertIn(call, app)
        self.assertNotIn('theme.journey-whiteboard', open(os.path.join(TPL, 'assistant', 'template.json'), encoding='utf-8').read())

    def test_canvas_tokens_are_defined_in_light_and_both_dark_blocks(self):
        css = open(os.path.join(TPL, 'assistant', 'styles', 'canvas.css.txt'), encoding='utf-8').read()
        need = ['--canvas', '--dot', '--sticky-ink', '--f-hand'] + [f'--c-{c}' for c in ('ink', 'blue', 'red', 'green', 'amber', 'violet')]
        for tok in need:
            self.assertIn(tok + ':', css, tok)
        self.assertIn('@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .canvas-view{', css)
        self.assertIn(':root[data-theme="dark"] .canvas-view{', css)
        for tint in ('yellow', 'blue', 'pink', 'green'):
            self.assertIn(f'.canvas-view .tint-{tint}{{', css)
        # scoped: no token is declared on :root or the page
        self.assertEqual([l for l in css.splitlines() if l.startswith(':root{') or l.startswith('body')], [])


if __name__ == '__main__':
    unittest.main()
