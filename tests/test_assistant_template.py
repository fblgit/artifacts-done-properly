"""The assistant template (and `default`, which inherits it) with its Canvas tab: what it takes, what its index.html loads, what the publish map holds."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import re
import sys
import unittest

from test_default_template import CDN, TPL, load, tags, take_of

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
        take = take_of('assistant')
        self.assertEqual(len(take), len(set(take)))
        for i in ('kit.store', 'kit.chrome', 'kit.canvas'):
            self.assertIn(i, take)
        # every entry the taken ones require is taken too: nothing is loaded that is not listed, nothing is missing
        for i in take:
            self.assertEqual([r for r in self.cat[i].get('requires') or [] if r not in take], [], i)

    def test_every_theme_and_the_switch_are_taken(self):
        # the page carries every theme of the catalog it is built against and the kit that wears them; the list is the catalog's, not the template's
        self.assertIn('theme.*', self.t['take'])
        self.assertIn('kit.skins', self.t['take'])
        self.assertEqual([i for i in self.cat if i.startswith('theme.')], [i for i in take_of('assistant') if i.startswith('theme.')])

    def test_default_starts_with_assistant_take(self):
        d = load(os.path.join(TPL, 'default', 'template.json'))['take']
        self.assertEqual(d[:len(self.t['take'])], self.t['take'])

    def test_shared_namespace_is_writable_by_interact(self):
        rules = {r['path']: r for r in self.t['capabilities']['db']['rules']}
        self.assertEqual((rules['ns/shared']['read'], rules['ns/shared']['write']), ('view', 'interact'))
        self.assertEqual(rules['']['write'], 'admin')
        meta = re.search(r"<meta name=\"adp:db-rules\" content='([^']*)'>", Path(os.path.join(TPL, 'assistant', 'index.html.txt')).read_text(encoding='utf-8'))
        self.assertEqual(json.loads(meta.group(1)), self.t['capabilities']['db']['rules'])


class Loader(unittest.TestCase):
    """The generated index.html loads every style and script of every taken entry once, in dependency order (the default's test, for both)."""
    def check(self, name):
        d, out = generate(name)
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
        for i in take_of(name):
            visit(i)
        self.assertEqual(out['take'], take_of(name))      # theme.* expanded; theme.default, worn when --theme names no other, is one of them
        for role, found in (('style', styles), ('script', scripts)):
            want = [f['path'] for i in order for f in cat[i]['files'] if f['role'] == role and not f['path'].startswith('kit/themes/')]
            for p in want:
                self.assertEqual(found.count(p), 1, f'{name}: {p}')
            # nothing under kit/ is loaded that no taken entry owns; of the themes only the one the page wears, right after the page's own stylesheet
            self.assertEqual([p for p in found if p.startswith('kit/') and p not in want], ['kit/themes/default.css'] if role == 'style' else [], name)
        self.assertEqual(styles[1], 'kit/themes/default.css')
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
        app = Path(os.path.join(TPL, 'assistant', 'parts', 'app.js.txt')).read_text(encoding='utf-8')
        self.assertIn("pathTemplate: 'ns/shared/{name}'", app)
        for call in ('Kit.store.create', 'Kit.db.create', 'Kit.chrome.create', 'Kit.canvas.create'):
            self.assertIn(call, app)
        self.assertNotIn('theme.journey-whiteboard', Path(os.path.join(TPL, 'assistant', 'template.json')).read_text(encoding='utf-8'))

    def test_canvas_tokens_are_defined_in_light_and_both_dark_blocks(self):
        css = Path(os.path.join(TPL, 'assistant', 'styles', 'canvas.css.txt')).read_text(encoding='utf-8')
        need = ['--canvas', '--dot', '--sticky-ink', '--f-hand'] + [f'--c-{c}' for c in ('ink', 'blue', 'red', 'green', 'amber', 'violet')]
        for tok in need:
            self.assertIn(tok + ':', css, tok)
        self.assertIn('@media (prefers-color-scheme:dark){:where(:root:not([data-theme="light"])){', css)
        self.assertIn(':where(:root[data-theme="dark"]){', css)
        for tint in ('yellow', 'blue', 'pink', 'green'):
            self.assertIn(f'.canvas-view .tint-{tint}{{', css)
        # fallbacks under :where(), which weighs nothing: the theme the page wears wins. No token is declared on a bare :root or the page
        self.assertEqual([l for l in css.splitlines() if l.startswith(':root{') or l.startswith('body')], [])


class HomeExamplesAndMindMap(unittest.TestCase):
    APP = os.path.join(TPL, 'assistant', 'parts', 'app.js.txt')

    def app(self):
        return Path(self.APP).read_text(encoding='utf-8')

    def test_mind_map_is_taken_and_loaded_by_assistant_and_default(self):
        for t in ('assistant', 'default'):
            self.assertIn('pattern.mindmap', load(os.path.join(TPL, t, 'template.json'))['take'], t)
        for name in ARGS:
            d, _ = generate(name)
            html = read(d, 'index.html')
            self.assertEqual(html.count('kit/patterns/mindmap.js'), 1, name)
            self.assertEqual(html.count('kit/patterns/mindmap.css'), 1, name)

    def test_mind_map_is_a_canvas_mode_saved_on_the_shared_namespace(self):
        app = self.app()
        self.assertIn("{id: 'mindmap', label: 'Mind map', mount: mountMind}", app)
        self.assertIn("ADP.ns('shared').doc('mindmaps/main')", app)
        self.assertIn('Kit.mindmap.mount', app)

    def test_home_has_the_examples_part_and_every_example_goes_through_the_engine(self):
        app = self.app()
        self.assertIn('<!-- part:home.examples -->', app)
        self.assertIn("'home.examples': 'Examples'", app)
        self.assertIn('engine.send({lane: \'task\'', app)
        for i in ('kanban', 'calendar', 'drafting', 'canvas', 'mindmap', 'rearrange', 'change', 'adopt'):
            self.assertIn(f"{{id: '{i}'", app, i)

    def test_an_example_opens_an_editable_request_and_sends_only_on_submit(self):
        app = self.app()
        self.assertIn('<textarea', app)
        self.assertIn("form.addEventListener('submit'", app)
        self.assertEqual(app.count("engine.send({lane: 'task'"), 1)      # one send, from the form: no tile or language button sends by itself
        for i in ('kanban', 'calendar', 'drafting', 'canvas', 'mindmap', 'rearrange', 'change', 'adopt', 'translate'):
            self.assertIn(i + ': \'', app, i)                            # each has an icon

    @unittest.skipUnless(shutil.which('node'), 'node is not installed')
    def test_the_page_script_parses(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'app.js')
            with open(f, 'w', encoding='utf-8') as out:
                out.write(self.app())
            r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_header_has_a_theme_switch_and_its_popovers_fold_on_an_outside_press(self):
        app = self.app()
        with open(os.path.join(TPL, 'assistant', 'index.html.txt'), encoding='utf-8') as f:
            html = f.read()
        self.assertIn('id="themeBtn"', html)
        for needle in ("'adp-theme'", "light: 'dark'", "addEventListener('pointerdown', foldPopovers)", "e.key === 'Escape'", "look.mode", "adp-look-mode", "MutationObserver(applyTheme)"):
            self.assertIn(needle, app, needle)
        # the theme picker beside it: a labelled native select, the same rule (Settings value, the viewer's own pick over it), worn by kit.skins without its light and dark
        self.assertIn('<select id="skinSel" aria-label="Theme">', html)
        for needle in ("'adp-skin'", "'adp-look-theme'", "ADP.config.on('look.theme'", "fetch('installed.json')", "Kit0.skins.init(", "modes: []", "persist: false"):
            self.assertIn(needle, app, needle)

    def test_ideas_are_grouped_into_kinds_with_a_recommended_one_and_an_icon_each(self):
        app = self.app()
        ids = re.findall(r"\{id: '([a-z]+)', cat: '([a-z]+)'", app)
        self.assertEqual(len({i for i, _ in ids}), len(ids))                              # ids are unique
        cats = re.search(r"const CATS = \[(.*?)\];", app).group(1)
        for c in re.findall(r"\['([a-z]+)', '", cats):
            if c != 'rec':
                self.assertGreaterEqual(sum(1 for _, k in ids if k == c), 2, c)
        self.assertGreaterEqual(len(re.findall(r"rec: true", app)), 4)                       # the Recommended group
        icons = re.search(r"const ICONS = \{(.*?)\n\};", app, re.S).group(1)
        for i in re.findall(r"icon: '([a-z]+)'", app):
            self.assertIn('  ' + i + ": '", icons, i)

    def test_prompts_fit_the_comment_limit_and_name_only_real_catalog_ids(self):
        app = self.app()
        texts = re.findall(r"text: '((?:[^'\\]|\\.)*)'", app)
        self.assertGreaterEqual(len(texts), 8)
        for t in texts:
            self.assertLess(len(t) + 300, 3000)       # the comment carries the instruction and trailer too, under 4000 bytes
        cat = {e['id'] for e in load(CATALOG)['entries']}
        for i in re.findall(r'\b((?:kit|pattern|viz|theme|template)\.[a-z0-9-]+)\b', ' '.join(texts)):
            self.assertIn(i, cat, i)

    def test_translate_table_has_flags_and_sets_the_language_setting(self):
        app = self.app()
        self.assertGreaterEqual(len(re.findall(r"\['[\U0001F1E6-\U0001F1FF]{2}', '[A-Za-z]+', '[A-Z]{2}'\]", app)), 10)
        self.assertIn('page.language', app)

    def test_language_setting_is_declared_with_default_english_in_both_templates(self):
        for t in ('starter', 'assistant'):
            src = Path(os.path.join(TPL, t, 'parts', 'app.js.txt')).read_text(encoding='utf-8')
            self.assertIn("language: {type: 'text', default: 'English', label: 'Language'", src, t)


class Installed(unittest.TestCase):
    def take_closure(self, name):
        cat = {e['id']: e for e in load(CATALOG)['entries']}
        out, seen = [], set()

        def visit(i):
            if i in seen:
                return
            seen.add(i)
            for r in cat[i].get('requires') or []:
                visit(r)
            out.append(i)
        for i in take_of(name):
            visit(i)
        return out

    def take_closure_ids_only(self):
        # with no catalog the requires are unknown and `theme.*` names nothing, so the list is the template's own take without it
        return [i for i in load(os.path.join(TPL, 'assistant', 'template.json'))['take'] if not i.endswith('.*')]

    def test_new_writes_what_is_installed_in_load_order_and_publishes_it(self):
        for name, tpl in (('assistant', 'assistant'), ('default', 'default')):
            d, out = generate(name)
            ix = json.loads(read(d, 'installed.json'))
            self.assertEqual(ix['schema'], 'installed/1')
            self.assertEqual([e['id'] for e in ix['entries']], self.take_closure(tpl))
            self.assertLess(len(ix['entries']), len(load(CATALOG)['entries']))      # what is installed, not the whole catalog
            self.assertTrue(all(e.get('name') and e.get('summary') for e in ix['entries']))
            self.assertIn('installed.json', out['publish']['files'], name)
            self.assertFalse(os.path.exists(os.path.join(d, 'my-catalog.json')))

    def test_without_a_catalog_on_disk_the_list_is_ids_only_and_check_is_ok(self):
        d = os.path.join(tempfile.mkdtemp(), 'out')
        env = dict(os.environ, ADP_HOME=tempfile.mkdtemp())
        r = subprocess.run([sys.executable, ADP, 'new', 'assistant', d], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        ix = json.loads(read(d, 'installed.json'))
        self.assertEqual([e['id'] for e in ix['entries']], self.take_closure_ids_only())
        self.assertEqual(set(ix['entries'][0]), {'id'})
        c = subprocess.run([sys.executable, ADP, 'check', d], capture_output=True, text=True, env=env)
        self.assertEqual(c.returncode, 0, c.stdout + c.stderr)

    def test_starter_does_not_get_it(self):
        d = os.path.join(tempfile.mkdtemp(), 'out')
        r = subprocess.run([sys.executable, ADP, 'new', 'starter', d, '--catalog', CATALOG, '--url', URL], capture_output=True, text=True, env=dict(os.environ, ADP_HOME=tempfile.mkdtemp()))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(os.path.exists(os.path.join(d, 'installed.json')))

    def test_the_view_its_parts_and_the_places_it_points_to_exist(self):
        app = Path(os.path.join(TPL, 'assistant', 'parts', 'app.js.txt')).read_text(encoding='utf-8')
        for p in ('mycatalog', 'mycatalog.intro', 'mycatalog.list'):
            self.assertIn(f'data-part="{p}"', app, p)
        self.assertIn("fetch('installed.json')", app)
        take = load(os.path.join(TPL, 'assistant', 'template.json'))['take']
        titles = set(re.findall(r"'([a-z.]+)': '", app.split('const TITLES = ')[1].split('};')[0])) | set(re.findall(r"(?:^|\s)([a-z]+): '", app.split('const TITLES = ')[1].split('};')[0]))
        at = re.search(r"const INSTALLED_AT = \{(.*?)\};", app, re.S).group(1)
        for eid, parts in re.findall(r"'([a-z.-]+)': \[([^\]]*)\]", at):
            self.assertIn(eid, take, eid)       # only entries the assistant really takes
            for part in re.findall(r"'([a-z.]+)'", parts):
                self.assertIn(part, titles, part)       # and only blocks that exist on the page
                self.assertIn(f'data-part="{part}"', app + Path(os.path.join(TPL, 'assistant', 'index.html.txt')).read_text(encoding='utf-8'), part)


if __name__ == '__main__':
    unittest.main()


class Capabilities(unittest.TestCase):
    def test_published_indicator_tracks_manifest_and_read_errors(self):
        app = read(os.path.join(TPL, 'assistant'), 'parts/app.js.txt')
        source = re.search(r'function mountPublishedStatus\(.*?\n}', app, re.S)
        self.assertIsNotNone(source, 'Missing live publication indicator')
        script = source.group(0) + """
const assert = require('node:assert/strict'), node = {}; let next, fail;
const db = {collection(c){assert.equal(c,'manifest');return {doc(id){assert.equal(id,'current');return {onSnapshot(n,e){next=n;fail=e;}};}};}};
mountPublishedStatus(node, db);
next({exists:false}); assert.equal(node.textContent,'Last published: not recorded');
next({exists:true,data:()=>({version:'native-v1'})}); assert.equal(node.textContent,'Last published: native-v1');
next({exists:true,data:()=>({version:'native-v2'})}); assert.equal(node.textContent,'Last published: native-v2');
fail(); assert.equal(node.textContent,'Last published: unavailable');
"""
        subprocess.run(['node', '-e', script], check=True, timeout=3)
        self.assertIn('mountPublishedStatus(published, ADP.db)', app)
        self.assertIn('id="lastPublished"', read(os.path.join(TPL, 'assistant'), 'index.html.txt'))

    def test_no_template_declares_downloads_or_a_status_rule(self):
        for t in ('starter', 'assistant', 'default'):
            m = load(os.path.join(TPL, t, 'template.json'))
            self.assertNotIn('downloads', m['capabilities'], t)
            self.assertEqual([r['path'] for r in m['capabilities']['db']['rules'] if r['path'] == 'status'], [], t)
            html = Path(os.path.join(TPL, t, 'index.html.txt')).read_text(encoding='utf-8')
            self.assertEqual(json.loads(re.search(r"adp:db-rules\" content='([^']+)'", html).group(1)), m['capabilities']['db']['rules'], t)
        self.assertNotIn('downloads', Path(os.path.join(TPL, 'assistant', 'parts', 'app.js.txt')).read_text(encoding='utf-8'))
