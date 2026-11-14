"""Black-box tests of the adp.py commands no other test ran (found with coverage plus a grep of tests/ for each command name):
`pins`, `suggest`, `kit list|show|describe`, `classify` (CLI), `diff`, `diff-pages`, `files --batch` and `new --content`.
Same style as test_commands.py: the real script in a subprocess, a throwaway project, no network. The catalog is a small local
catalog.json written here, so nothing drifts with the shipped one."""
import json, os, re, shutil, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_commands import Cmd

CATALOG = {'schema': 'kit-catalog/1', 'ver': '', 'built': '2026-01-01T00:00:00Z', 'entries': [
    {'id': 'viz.chips', 'name': 'Chips and tallies', 'summary': 'Status chips and a tally strip of counts.', 'tags': ['chip', 'status', 'tally'],
     'files': [{'path': 'kit/viz/chips.js', 'role': 'script'}, {'path': 'kit/viz/chips.css', 'role': 'style'}, {'path': 'kit/samples/chips.json', 'role': 'sample'}],
     'requires': [], 'provides': ['Chip', 'Tally'], 'globals': ['ADP'], 'about': 'Colour labels from an enum value.'},
    {'id': 'viz.timeline', 'name': 'Timeline', 'summary': 'Events along a time axis.', 'tags': ['time', 'events'],
     'files': [{'path': 'kit/viz/timeline.js', 'role': 'script'}], 'requires': ['viz.chips'], 'provides': ['Timeline']},
    {'id': 'theme.paper', 'name': 'Paper', 'summary': 'A warm paper theme.', 'tags': ['theme', 'warm'],
     'files': [{'path': 'kit/themes/paper.css', 'role': 'style'}], 'requires': []}]}


class Untested(Cmd):
    def catalog(self):
        return self.write_json('catalog.json', CATALOG)

    def fails(self, *args, code=1):
        r = self.run_adp(*args)
        self.assertEqual(r.returncode, code, r.stdout + r.stderr)
        return r

    def lines(self, r):
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return [json.loads(x) for x in r.stdout.splitlines() if x.strip()]


class Pins(Untested):
    def test_maps_every_path_of_each_batch_to_its_version_and_writes_vermap(self):
        a = self.write_json('b/publish-1.json', {'index.html': 'h1', 'a.js': 'h2'})
        b = self.write_json('b/publish-2.json', {'kit/x.css': 'h3'})
        out = self.ok('pins', f'{a}=v1', f'{b}=v2', '--out', self.p('vm.json'))
        self.assertEqual(out['pinned'], 3)
        self.assertEqual(out['vermap'], self.p('vm.json'))
        self.assertEqual(json.load(open(self.p('vm.json'))), {'index.html': 'v1', 'a.js': 'v1', 'kit/x.css': 'v2'})
        self.assertEqual(set(out), {'pinned', 'vermap'})

    def test_default_output_is_vermap_json_next_to_the_first_batch(self):
        a = self.write_json('b/publish-1.json', {'p.js': 'h'})
        out = self.ok('pins', f'{a}=v9')
        self.assertEqual(out['vermap'], self.p('b', 'vermap.json'))
        self.assertEqual(json.load(open(out['vermap'])), {'p.js': 'v9'})

    def test_without_pairs_prints_usage_and_exits_1(self):
        r = self.fails('pins')
        self.assertIn('usage: adp.py pins publish-1.json=VERSION_ID', r.stderr)


class Suggest(Untested):
    def test_ranks_by_overlap_and_says_why(self):
        out = self.ok('suggest', self.catalog(), '--for', 'status chips')
        self.assertEqual(out[0]['id'], 'viz.chips')
        self.assertEqual(out[0]['kind'], 'viz')
        self.assertIn('tags: chip, status', out[0]['why'])
        self.assertEqual(out[0]['takes'], 2)                 # the sample file is not taken
        self.assertNotIn('theme.paper', [x['id'] for x in out])

    def test_kind_filter_and_n(self):
        out = self.ok('suggest', self.catalog(), '--for', 'warm events chips', '--kind', 'viz', '--n', '1')
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['kind'], 'viz')

    def test_no_match_is_an_empty_list(self):
        self.assertEqual(self.ok('suggest', self.catalog(), '--for', 'zzzz qqqq'), [])

    def test_local_index_warns_on_stderr(self):
        r = self.run_adp('suggest', self.catalog(), '--for', 'timeline')
        self.assertIn('warning: a local index is a build', r.stderr)

    def test_usage_without_for(self):
        self.assertIn('usage: adp.py suggest CATALOG --for', self.fails('suggest', self.catalog()).stderr)

    def test_not_a_catalog(self):
        self.assertIn('is neither a catalog url nor a catalog.json', self.fails('suggest', self.p('nope.json'), '--for', 'x').stderr)

    def test_unfetched_catalog_url_exits_2_with_the_fetch_call(self):
        r = self.fails('suggest', 'https://claude.ai/artifact/abc123', '--for', 'x', code=2)
        out = json.loads(r.stdout)
        self.assertEqual(out['error'], 'index not fetched')
        self.assertEqual(out['catalog'], 'https://claude.ai/artifact/abc123')


class Kit(Untested):
    def test_list_emits_one_json_line_per_entry(self):
        lines = self.lines(self.run_adp('kit', 'list', self.catalog()))
        self.assertEqual([x['id'] for x in lines], ['viz.chips', 'viz.timeline', 'theme.paper'])
        self.assertEqual(lines[0], {'id': 'viz.chips', 'kind': 'viz', 'name': 'Chips and tallies', 'summary': CATALOG['entries'][0]['summary'],
                                    'tags': ['chip', 'status', 'tally']})

    def test_list_filters_by_kind_and_tag(self):
        self.assertEqual([x['id'] for x in self.lines(self.run_adp('kit', 'list', self.catalog(), '--kind', 'theme'))], ['theme.paper'])
        self.assertEqual([x['id'] for x in self.lines(self.run_adp('kit', 'list', self.catalog(), '--tag', 'events'))], ['viz.timeline'])

    def test_show(self):
        out = self.ok('kit', 'show', 'viz.chips', self.catalog())
        self.assertEqual(out['files'], ['kit/viz/chips.js', 'kit/viz/chips.css', 'kit/samples/chips.json'])
        self.assertEqual(out['about'], 'Colour labels from an enum value.')
        self.assertEqual(out['provides'], ['Chip', 'Tally'])

    def test_describe_is_the_mount_signature(self):
        out = self.ok('kit', 'describe', 'viz.chips', self.catalog())
        self.assertEqual(out, {'id': 'viz.chips', 'needs': ['ADP'], 'optional': [], 'provides': ['Chip', 'Tally'], 'requires': [],
                               'files': ['kit/viz/chips.js', 'kit/viz/chips.css'], 'sample': 'kit/samples/chips.json'})
        self.assertIsNone(self.ok('kit', 'describe', 'viz.timeline', self.catalog())['sample'])

    def test_unknown_entry_and_bad_usage(self):
        self.assertIn('no entry viz.nope in the catalog', self.fails('kit', 'show', 'viz.nope', self.catalog()).stderr)
        self.assertIn('usage: adp.py kit list', self.fails('kit', 'bogus').stderr)
        self.assertIn('usage: adp.py kit list', self.fails('kit', 'show').stderr)

    def test_saved_catalog_default_needs_one(self):
        self.assertIn('no saved catalog', self.fails('kit', 'list').stderr)


class KitV2(Untested):
    """A kit-catalog/2 index keeps about and optional in the header of the entry's main file, read beside the index."""
    def setUp(self):
        super().setUp()
        from pathlib import Path
        from test_index import make_catalog
        make_catalog(Path(self.p('cat')))
        self.assertEqual(self.run_adp('index', self.p('cat')).returncode, 0)
        self.idx = self.p('cat', 'catalog.json')

    def test_show_takes_about_from_the_header_or_says_why_not(self):
        out = self.ok('kit', 'show', 'kit.box', self.idx)
        self.assertEqual((out['about'], 'about_from' in out), ('What it is, in two lines.', False))
        os.remove(self.p('cat', 'kit', 'box.js'))
        out = self.ok('kit', 'show', 'kit.box', self.idx)
        self.assertEqual((out['about'], out['about_from']), ('', 'not local'))

    def test_describe_takes_optional_from_the_header(self):
        self.assertEqual(self.ok('kit', 'describe', 'kit.box', self.idx)['optional'], ['Kit.y'])

    def test_suggest_counts_about_and_warns_when_it_cannot(self):
        r = self.run_adp('suggest', self.idx, '--for', 'lines')          # a word of the about only
        self.assertEqual(([x['id'] for x in json.loads(r.stdout)], 'about not counted' in r.stderr), (['guide.note', 'kit.box', 'template.page'], False))
        self.assertIn('about: lines', json.loads(r.stdout)[0]['why'])
        os.remove(self.p('cat', 'kit', 'box.js'))
        r = self.run_adp('suggest', self.idx, '--for', 'lines')
        self.assertEqual([x['id'] for x in json.loads(r.stdout)], ['guide.note', 'template.page'])
        self.assertIn('warning: about not counted for 1 entries', r.stderr)



class Classify(Untested):
    def test_cli_classifies_parts_and_files_into_the_contract_classes(self):
        base = {'parts': {'a': 'h1', 'b': 'h1', 'c': 'h1', 'd': 'h1'}, 'files': {'f.js': 's1'}}
        live = {'parts': {'a': 'h1', 'b': 'h2', 'c': 'h1', 'd': 'h2'}, 'files': {'f.js': 's1'}}
        inc = {'parts': {'a': 'h2', 'b': 'h3', 'c': 'h1', 'd': 'h1', 'n': 'h9'}, 'files': {'f.js': 's1'}}
        out = self.ok('classify', self.write_json('b.json', base), self.write_json('l.json', live), self.write_json('i.json', inc))
        self.assertEqual(out['ours'], ['a'])                          # only the incoming side changed it
        self.assertEqual(out['theirs'], ['d'])                        # only the live side changed it
        self.assertEqual(out['new'], ['n'])
        self.assertEqual(out['held'], [{'id': 'b', 'base': 'h1', 'live': 'h2', 'incoming': 'h3'}])
        self.assertEqual(out['retired'], [])

    def test_accepts_an_artifactdata_wrapped_manifest(self):
        m = {'data': {'parts': {'a': 'h'}, 'files': {}}}
        out = self.ok('classify', self.write_json('b.json', m), self.write_json('l.json', m), self.write_json('i.json', m))
        self.assertEqual(out['held'], [])

    def test_a_deletion_needs_a_retire_reason(self):
        base = {'parts': {'a': 'h'}}
        b, l = self.write_json('b.json', base), self.write_json('l.json', base)
        self.assertEqual(self.ok('classify', b, l, self.write_json('i.json', {'parts': {}}))['held'][0]['id'], 'a')
        out = self.ok('classify', b, l, self.write_json('i2.json', {'parts': {}, 'retired': {'a': 'gone'}}))
        self.assertEqual(out['retired'], ['a'])
        self.assertEqual(out['held'], [])

    def test_usage(self):
        self.assertIn('usage: adp.py classify BASE.json LIVE.json INCOMING.json', self.fails('classify', 'x.json').stderr)


class Diffs(Untested):
    OLD = {'page_hash': 'p1', 'parts': {'a': 'h1', 'a.b': 'h1', 'c': 'h1'}, 'parents': {'a.b': 'a'}, 'elements': {'a': 2}, 'files': {'x.js': 's1', 'y.js': 's1'}}
    NEW = {'page_hash': 'p2', 'parts': {'a': 'h2', 'a.b': 'h2', 'd': 'h1'}, 'parents': {'a.b': 'a'}, 'elements': {'a': 3}, 'files': {'x.js': 's2', 'y.js': 's1'}}

    def test_diff_of_two_manifests(self):
        out = self.ok('diff', self.write_json('o.json', self.OLD), self.write_json('n.json', self.NEW))
        self.assertEqual(out['page_hash'], ['p1', 'p2'])
        self.assertEqual((out['added'], out['removed']), (['d'], ['c']))
        self.assertEqual(out['changed'], ['a.b', 'a'])               # deepest first
        self.assertEqual(out['deepest'], ['a.b', 'c', 'd'])           # a is not deepest: its child a.b changed
        self.assertEqual(out['elements'], {'a': '+1'})
        self.assertEqual(out['files'], {'x.js': ['s1', 's2']})

    def test_diff_wants_exactly_two_files(self):
        self.assertEqual(self.run_adp('diff', self.write_json('o.json', self.OLD)).returncode, 2)

    def _page(self, body):
        return '<!-- part:p -->\n<div data-part="p" data-comment-target>' + body + '</div>\n<!-- /part:p -->\n'

    def test_diff_pages_shows_the_changed_lines_per_deepest_part(self):
        old, new = self.p('old.html'), self.p('new.html')
        open(old, 'w').write(self._page('<p>one</p>'))
        open(new, 'w').write(self._page('<p>two</p>'))
        out = self.ok('diff-pages', old, new)
        self.assertEqual(out['changed'], ['p'])
        self.assertEqual(out['deepest'], ['p'])
        detail = ' '.join(out['detail']['p'])
        self.assertIn('-one', detail)
        self.assertIn('+two', detail)

    def test_diff_pages_of_identical_pages_is_empty(self):
        old = self.p('old.html')
        open(old, 'w').write(self._page('x'))
        out = self.ok('diff-pages', old, old)
        self.assertEqual((out['added'], out['removed'], out['changed'], out['deepest']), ([], [], [], []))

    def test_diff_pages_of_two_projects(self):
        d = self.new_project('one')
        shutil.copytree(d, self.p('two'))
        self.edit(self.p('two'))
        out = self.ok('diff-pages', d, self.p('two'))
        self.assertEqual(out['deepest'], ['home.welcome'])
        self.assertTrue(any(x.startswith('+') and 'EDITED' in x for x in out['detail']['home.welcome']))


class FilesBatches(Untested):
    def test_over_n_files_becomes_batches_written_to_disk_page_first(self):
        d = self.new_project('proj')
        total = len(self.ok('files', d)['files'])
        self.assertGreater(total, 3)
        out = self.ok('files', d, '--batch', '3')
        self.assertNotIn('files', out)
        self.assertEqual(sum(len(b) for b in out['batches']), total)
        self.assertTrue(all(len(b) <= 3 for b in out['batches']))
        self.assertEqual(len(out['batch_files']), len(out['batches']))
        for i, (b, f) in enumerate(zip(out['batches'], out['batch_files']), 1):
            self.assertEqual(f, os.path.join(d + '.adp', f'publish-{i}.json'))
            self.assertEqual(json.load(open(f)), b)
        deps = [r for r in re.findall(r'(?:src|href)="([^"]+)"', open(os.path.join(d, 'index.html')).read()) if r in out['batches'][0] or os.path.isfile(os.path.join(d, r))]
        self.assertTrue(deps)
        order = [p for b in out['batches'] for p in b]
        self.assertEqual(order[:len(deps)], deps)                     # what the page loads goes up first, in page order
        self.assertIn('note', out)

    def test_batch_files_feed_pins(self):
        d = self.new_project('proj')
        out = self.ok('files', d, '--batch', '4', '--out', self.p('bx'))
        pairs = [f'{f}=ver{i}' for i, f in enumerate(out['batch_files'], 1)]
        pinned = self.ok('pins', *pairs, '--out', self.p('vm.json'))
        self.assertEqual(pinned['pinned'], sum(len(b) for b in out['batches']))
        self.assertEqual(set(json.load(open(self.p('vm.json')))), {p for b in out['batches'] for p in b})

    def test_under_n_stays_one_files_map(self):
        out = self.ok('files', self.new_project('proj'), '--batch', '1000')
        self.assertIn('files', out)
        self.assertNotIn('batches', out)


class NewContent(Untested):
    CONTENT = '''## Lead
A lead for the page.

## View: Overview (id: overview)
### Section intro - Introduction
```html
<p>Hello <b>world</b></p>
```
### Section facts - Facts
```html
<ul><li>one</li></ul>
```

## View: Details (id: details)
### Section deep
```html
<p>deep</p>
```
'''

    def build(self, text=None):
        f = self.p('content.md')
        open(f, 'w').write(self.CONTENT if text is None else text)
        return self.run_adp('new', 'starter', 'cproj', '--content', f)

    def test_builds_views_and_sections_verbatim(self):
        r = self.build()
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout)
        nbytes = len('<p>Hello <b>world</b></p>') + len('<ul><li>one</li></ul>') + len('<p>deep</p>')
        self.assertEqual(out['built'], {'views': 2, 'sections': 3, 'parts': 5, 'bytes': nbytes})
        d = self.p('cproj')
        cj = open(os.path.join(d, 'content.js')).read()
        self.assertIn('<p>Hello <b>world</b></p>', cj)
        self.assertIn('A lead for the page.', cj)
        self.assertNotIn('home.welcome', cj)
        js = open(os.path.join(d, 'parts', 'app.js')).read()
        for pid in ('overview', 'intro', 'facts', 'details', 'deep'):
            self.assertIn(f'data-part="{pid}"', js)
        self.assertNotIn('data-part="home.welcome"', js)
        chk = self.run_adp('check', d)
        self.assertEqual(chk.returncode, 0, chk.stdout + chk.stderr)

    def test_missing_content_file(self):
        r = self.run_adp('new', 'starter', 'cproj', '--content', self.p('none.md'))
        self.assertEqual(r.returncode, 1)
        self.assertIn('--content: no file', r.stderr)

    def test_malformed_files_exit_2_with_the_line_and_write_nothing(self):
        cases = {'## View: No id\n### Section a\n```html\nx\n```\n': ':1: view "No id" has no (id: <id>) with a valid id',
                 '## View: V (id: v)\n### Section a\n```html\nx\n': ':2: section a: the html block is not closed',
                 '## View: V (id: v)\n### Section a\n': ':2: section a has no ```html block'}
        for text, want in cases.items():
            r = self.build(text)
            self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
            self.assertIn('content.md' + want, r.stderr)
            self.assertFalse(os.path.exists(self.p('cproj')))

    def test_duplicate_ids_and_the_settings_id_are_refused(self):
        r = self.build('## View: V (id: v)\n### Section v\n```html\nx\n```\n')
        self.assertEqual(r.returncode, 2)
        self.assertIn('ids used twice, or taken by the settings view: v', r.stderr)
        shutil.rmtree(self.p('cproj'), True)
        r = self.build('## View: V (id: settings)\n### Section a\n```html\nx\n```\n')
        self.assertEqual(r.returncode, 2)
        self.assertIn('settings', r.stderr)

    def test_a_view_without_sections_is_an_error(self):
        r = self.build('## Lead\nonly a lead\n')
        self.assertEqual(r.returncode, 2)
        self.assertIn('no `## View: <label> (id: <id>)` with sections', r.stderr)


if __name__ == '__main__':
    unittest.main()
