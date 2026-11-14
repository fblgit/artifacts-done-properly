"""Two behaviours a fresh agent hit when it built a page by the skill's own steps:
`files` returns the kit references beside the local files (the map `new` printed), and `export` takes the `Artifact list` result as
the tool prints it (text rows), not only JSON. Same style as test_commands.py: the real script, a throwaway project, no network."""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_commands import Cmd, URL

KITURL = 'https://claude.ai/artifact/KitCatalog1'
CATALOG = {'schema': 'kit-catalog/1', 'url': KITURL, 'ver': '', 'built': '2026-01-01T00:00:00Z', 'entries': [
    {'id': 'kit.a', 'name': 'A', 'summary': 's', 'files': [{'path': 'kit/a.js', 'role': 'script', 'sha256': 'x', 'bytes': 1}, {'path': 'kit/samples/a.json', 'role': 'sample', 'sha256': 'x', 'bytes': 1}], 'requires': []},
    {'id': 'pattern.b', 'name': 'B', 'summary': 's', 'files': [{'path': 'kit/b.js', 'role': 'script', 'sha256': 'x', 'bytes': 1}, {'path': 'kit/samples/b.json', 'role': 'sample', 'sha256': 'x', 'bytes': 1}], 'requires': ['kit.a']}]}


class EvalFixes(Cmd):
    def installed(self, d, take, fetched=True):
        entries = [{'id': 'kit.a', 'requires': []}, {'id': 'pattern.b', 'requires': ['kit.a']}]
        json.dump({'schema': 'installed/1', 'url': KITURL, 'entries': entries, 'take': take}, open(os.path.join(d, 'installed.json'), 'w'))
        if fetched:
            cd = os.path.join(self.home, '.adp', 'catalogs', 'KitCatalog1'); os.makedirs(cd)
            json.dump(CATALOG, open(os.path.join(cd, 'catalog.json'), 'w'))

    def test_files_carries_the_kit_references(self):
        d = self.new_project()
        self.installed(d, ['pattern.b'])
        out = self.ok('files', d)
        self.assertEqual(out['files']['kit/a.js'], {'artifact': KITURL, 'path': 'kit/a.js'})
        self.assertEqual(out['files']['kit/b.js'], {'artifact': KITURL, 'path': 'kit/b.js'})
        self.assertIn('kit/samples/b.json', out['files'])             # the entry the page took keeps its sample, as `new` printed
        self.assertNotIn('kit/samples/a.json', out['files'])          # an entry only required does not
        self.assertEqual(out['kit_refs'], 3)

    def test_files_without_the_index_says_why(self):
        d = self.new_project()
        self.installed(d, ['pattern.b'], fetched=False)
        out = self.ok('files', d)
        self.assertEqual(out['kit_refs']['error'], 'index not fetched')
        self.assertNotIn('kit/a.js', out['files'])

    def test_files_without_installed_json_is_unchanged(self):
        d = self.new_project()
        out = self.ok('files', d)
        self.assertNotIn('kit_refs', out)

    def test_export_reads_the_list_result_as_text(self):
        d = self.exported()
        ad = d + '.adp'
        rows = json.load(open(os.path.join(ad, 'listing.json')))
        text = 'Published files of https://claude.ai/artifact/test-artifact (version 1-abcd), %d files by path:\n' % len(rows)
        text += ''.join('- "%s"  text/plain  %d bytes\n' % (r['path'], r['bytes']) for r in rows)
        text += '[Stored for the live version: contract 0.2.96]\n'
        open(os.path.join(ad, 'listing.json'), 'w').write(text)
        out = self.ok('export', d, '--url', URL)
        self.assertEqual(out['next'], 'clean: nothing to send')

    def test_export_into_an_empty_folder_imports_the_live_files(self):
        """a new session edits a page it did not build: no project folder, no docs yet; nothing is held, the folder is filled"""
        import shutil
        d = self.exported()
        ad = d + '.adp'
        for sub in ('state.json', 'repo'):
            q = os.path.join(ad, sub)
            shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)
        shutil.rmtree(d)
        json.dump({}, open(os.path.join(ad, 'docs.json'), 'w'))
        out = self.ok('export', d, '--url', URL)
        self.assertEqual(out['report']['held'], [])
        self.assertTrue(os.path.isfile(os.path.join(d, 'index.html')))
        self.assertTrue(os.path.isfile(os.path.join(d, 'parts', 'app.js')))

    def test_export_refuses_a_listing_with_no_rows(self):
        d = self.exported()
        open(os.path.join(d + '.adp', 'listing.json'), 'w').write('nothing here')
        r = self.run_adp('export', d, '--url', URL)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('no file rows', r.stdout + r.stderr)

    def test_content_builds_only_the_starter(self):
        content = self.p('c.md')
        open(content, 'w').write('## Lead\nL\n\n## View: A (id: a)\n### Section a.one - One\n```html\n<p>x</p>\n```\n')
        r = self.run_adp('new', 'assistant', self.p('pg'), '--content', content)
        self.assertEqual(r.returncode, 1)
        self.assertIn('use it with the starter', r.stdout + r.stderr)
        self.assertFalse(os.path.exists(self.p('pg')))             # nothing half-written
        self.ok('new', 'starter', self.p('ok'), '--content', content)
        self.assertEqual(self.run_adp('check', self.p('ok')).returncode, 0)

    def test_check_ignores_a_data_part_selector_in_a_script(self):
        d = self.new_project()
        f = os.path.join(d, 'parts', 'app.js')
        open(f, 'a').write('\nconst gone = document.querySelector(\'[data-part="ghost.part"]\');\n')
        r = self.run_adp('check', d)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        open(f, 'a').write('\nconst el = \'<div data-part="ghost.part"></div>\';\n')       # an element that names a part nobody marked still fails
        r = self.run_adp('check', d)
        self.assertEqual(r.returncode, 1)
        self.assertIn('ghost.part', r.stdout + r.stderr)


class ThemeTags(Cmd):
    def test_new_with_a_theme_links_it_after_the_page_css(self):
        real = os.path.join(os.path.dirname(self.adp), '..', 'catalog', 'catalog.json')
        self.ok('new', 'starter', 'pg', '--theme', 'glaze', '--catalog', real, '--url', KITURL)      # the short name; the entry id is used below
        html = open(self.p('pg', 'index.html'), encoding='utf-8').read()
        self.assertEqual(html.count('href="kit/themes/glaze.css"'), 1)
        self.assertLess(html.index('href="styles/page.css"'), html.index('href="kit/themes/glaze.css"'))
        self.assertNotIn('kit/themes/default.css', html)
        self.assertEqual(self.run_adp('check', self.p('pg')).returncode, 0)

    def test_new_without_a_theme_wears_the_default_and_an_unknown_one_is_refused_before_anything_is_written(self):
        real = os.path.join(os.path.dirname(self.adp), '..', 'catalog', 'catalog.json')
        a = self.ok('new', 'starter', 'plain', '--catalog', real, '--url', KITURL)
        b = self.ok('new', 'starter', 'named', '--theme', 'default', '--catalog', real, '--url', KITURL)
        self.assertEqual(a['take'][-1], 'theme.default')
        self.assertEqual(a['take'], b['take'])
        html = open(self.p('plain', 'index.html'), encoding='utf-8').read()
        self.assertLess(html.index('href="styles/page.css"'), html.index('href="kit/themes/default.css"'))
        self.assertEqual(html, open(self.p('named', 'index.html'), encoding='utf-8').read())       # both forms give the same page
        r = self.run_adp('new', 'starter', 'no', '--theme', 'nope', '--catalog', real, '--url', KITURL)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn('--theme nope: the catalog has no such theme. It has: ', r.stderr)
        self.assertIn('glaze-depth', r.stderr)      # the names it does have, short
        self.assertFalse(os.path.exists(self.p('no')))

    def test_new_with_any_theme_links_its_web_fonts_once_before_the_page_css(self):
        real = os.path.join(os.path.dirname(self.adp), '..', 'catalog', 'catalog.json')
        themes = [e for e in json.load(open(real, encoding='utf-8'))['entries'] if e['id'].startswith('theme.')]
        self.assertTrue(themes)
        for e in themes:
            with self.subTest(theme=e['id']):
                d = 'pg-' + e['id']
                self.ok('new', 'starter', d, '--theme', e['id'], '--catalog', real, '--url', KITURL)
                html = open(self.p(d, 'index.html'), encoding='utf-8').read()
                tag = f'<link rel="stylesheet" href="{e["fonts"]}">'
                self.assertEqual(html.count(tag), 1)
                self.assertLess(html.index(tag), html.index('href="styles/page.css"'))
                self.assertEqual(html.count('fonts.googleapis.com/css2'), 1)       # one font link, the theme's: the template's own is not left beside it (theme.default's is the same url)
                self.assertEqual(self.run_adp('check', self.p(d)).returncode, 0)

    def test_take_prints_the_fonts_of_the_themes_it_takes(self):
        real = os.path.join(os.path.dirname(self.adp), '..', 'catalog', 'catalog.json')
        by = {e['id']: e for e in json.load(open(real, encoding='utf-8'))['entries']}
        out = self.ok('take', real, 'theme.glaze-depth', '--url', KITURL)
        self.assertEqual(out['fonts'], {'theme.glaze': by['theme.glaze']['fonts'], 'theme.glaze-depth': by['theme.glaze-depth']['fonts']})
        self.assertNotIn('fonts', self.ok('take', real, 'kit.dom', '--url', KITURL))
