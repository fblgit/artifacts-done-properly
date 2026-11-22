"""Black-box tests of the adp.py commands no other test ran (found with coverage plus a grep of tests/ for each command name):
`pins`, `suggest`, `kit list|show|describe`, `classify` (CLI), `diff`, `diff-pages`, `files --batch` and `new --content`.
Same style as test_commands.py: the real script in a subprocess, a throwaway project, no network. The catalog is a small local
catalog.json written here, so nothing drifts with the shipped one."""
from pathlib import Path
import hashlib, json, os, re, shutil, sys, unittest

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
        self.assertEqual(json.loads(Path(self.p('vm.json')).read_text()), {'index.html': 'v1', 'a.js': 'v1', 'kit/x.css': 'v2'})
        self.assertIn(self.p('vm.json'), out['next'])

    def test_default_output_is_vermap_json_next_to_the_first_batch(self):
        a = self.write_json('b/publish-1.json', {'p.js': 'h'})
        out = self.ok('pins', f'{a}=v9')
        self.assertEqual(out['vermap'], self.p('b', 'vermap.json'))
        self.assertEqual(json.loads(Path(out['vermap']).read_text()), {'p.js': 'v9'})

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


HEADER = '/**\nChips\nColour labels drawn from an enum, a quartz glaze.\n\n@id viz.chips\n@db reads none / note keeps nothing\n@status stable\n@version 1.0.0\n*/\nwindow.X=1;\n'
SLIM = {'schema': 'kit-catalog/2', 'ver': '', 'built': '', 'entries': [
    {'id': 'viz.chips', 'name': 'Chips', 'summary': 'Status chips.', 'tags': ['chip'], 'main': 'kit/viz/chips.js', 'requires': [], 'provides': ['Chip'],
     'globals': [], 'files': [{'path': 'kit/viz/chips.js', 'role': 'script'}]},
    {'id': 'viz.timeline', 'name': 'Timeline', 'summary': 'Events.', 'tags': ['time'], 'main': 'kit/viz/timeline.js', 'requires': [], 'provides': [],
     'globals': [], 'files': [{'path': 'kit/viz/timeline.js', 'role': 'script'}]}]}


class Headers(Untested):
    """The slim index keeps no about text: kit show|describe and suggest read it from each entry's main-file header, on disk."""
    URL = 'https://claude.ai/artifact/abc123'

    def local(self):
        self.write_json('cat/catalog.json', SLIM)
        os.makedirs(self.p('cat', 'kit', 'viz'))
        with open(self.p('cat', 'kit', 'viz', 'chips.js'), 'w') as f: f.write(HEADER)
        return self.p('cat', 'catalog.json')

    def fetched(self):
        d = os.path.join(self.home, '.adp', 'catalogs', 'abc123')
        os.makedirs(os.path.join(d, 'kit', 'viz'))
        Path(os.path.join(d, 'catalog.json')).write_text(json.dumps(SLIM))
        return d

    def test_show_reads_about_and_header_fields_from_the_main_file(self):
        out = self.ok('kit', 'show', 'viz.chips', self.local())
        self.assertEqual(out['about'], 'Colour labels drawn from an enum, a quartz glaze.')
        self.assertEqual(out['status'], 'stable')
        self.assertEqual(out['db']['note'], 'keeps nothing')

    def bundled(self):
        """viz.chips owns kit/samples/viz.json, a bundle: its @preview names the key viz-chips; viz.timeline requires viz.chips."""
        cat = json.loads(json.dumps(SLIM))
        cat['entries'][0]['files'].append({'path': 'kit/samples/viz.json', 'role': 'sample'})
        cat['entries'][1]['requires'] = ['viz.chips']
        for e in cat['entries']:
            for f in e['files']:
                f['sha256'] = 'x'          # take prints each file's sha256
        self.write_json('bun/catalog.json', cat)
        os.makedirs(self.p('bun', 'kit', 'viz'))
        with open(self.p('bun', 'kit', 'viz', 'chips.js'), 'w') as f:
            f.write(HEADER.replace('@version 1.0.0\n', '@version 1.0.0\n@preview {"render": "viz.chips", "samples": ["kit/samples/viz.json#viz-chips"]}\n@samples viz-chips\n'))
        os.makedirs(self.p('bun', 'kit', 'samples'))
        with open(self.p('bun', 'kit', 'samples', 'viz.json'), 'w') as f:
            json.dump({'viz-chips': {'note': 'Invented.', 'chips': [{'id': 'é', 'n': 1}]}, 'viz-other': {'x': 1}}, f)
        return self.p('bun', 'catalog.json')

    def test_sites_catalog_take_map_uses_https_sources_not_artifact_references(self):
        from test_host_connection import run_node
        script = """const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync('plugins/artifacts-done-properly/skills/adp/catalog/parts/catalog.js','utf8');
const takeFiles=()=>[{entry:{},f:{path:'kit/demo.js',sha256:'abc'}}];
eval(src.slice(src.indexOf('function takeRef('),src.indexOf('function Take(')));
assert.deepEqual(JSON.parse(takeRef({},true,{self:{url:'https://catalog.example.chatgpt.site'}})),{'kit/demo.js':{url:'https://catalog.example.chatgpt.site/kit/demo.js',sha256:'abc'}});
assert.equal(JSON.parse(takeRef({},true,{self:{url:'https://claude.ai/artifact/demo'}}))['kit/demo.js'].artifact,'https://claude.ai/artifact/demo');"""
        result = run_node(['-e', script], cwd=os.path.dirname(os.path.dirname(__file__)))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_sites_take_materializes_verified_dependencies_and_refuses_drift(self):
        url = 'https://catalog.example.chatgpt.site'
        plan = self.ok('catalog', url)
        self.assertEqual(plan['fetch']['transport'], 'https')
        self.assertEqual(plan['fetch']['url'], url + '/catalog.json')
        source = self.bundled(); root = os.path.dirname(source)
        with open(os.path.join(root, 'kit/viz/timeline.js'), 'w') as f: f.write('window.timeline = true;')
        cat = json.loads(Path(source).read_text()); cat['url'] = url
        for e in cat['entries']:
            for f in e['files']: f['sha256'] = hashlib.sha256(Path(os.path.join(root, f['path'])).read_bytes()).hexdigest()
        target = os.path.dirname(plan['index']); shutil.copytree(root, target)
        Path(plan['index']).write_text(json.dumps(cat))
        reads = self.fails('take', url, 'viz.timeline', code=2)
        self.assertNotIn('files', json.loads(reads.stdout))
        dest = self.p('taken')
        out = self.ok('take', url, 'viz.timeline', '--materialize', dest)
        self.assertEqual(out['entries'], ['viz.chips', 'viz.timeline'])
        self.assertEqual(out['materialized'], ['kit/viz/chips.js', 'kit/viz/timeline.js'])
        for name in out['materialized']:
            self.assertEqual(Path(os.path.join(dest, name)).read_bytes(), Path(os.path.join(root, name)).read_bytes())
        Path(os.path.join(target, 'kit/viz/chips.js')).write_text('changed')
        self.fails('take', url, 'viz.timeline', '--materialize', self.p('rejected'))
        self.assertFalse(os.path.exists(self.p('rejected')))

    def test_describe_names_the_bundle_and_the_key_of_the_sample(self):
        out = self.ok('kit', 'describe', 'viz.chips', self.bundled())
        self.assertEqual((out['sample'], out['sample_key']), ('kit/samples/viz.json', 'viz-chips'))
        self.assertNotIn('sample_key', self.ok('kit', 'describe', 'viz.chips', self.local()))      # no @preview key, no sample_key

    def test_take_of_an_entry_asked_for_takes_its_bundle_by_reference_and_names_only_its_own_key(self):
        out = self.ok('take', self.bundled(), 'viz.chips', '--url', self.URL)
        self.assertEqual(out['files']['kit/samples/viz.json'], {'artifact': self.URL, 'path': 'kit/samples/viz.json'})      # the whole bundle, copied by the server
        self.assertEqual(out['samples'], {'viz.chips': ['kit/samples/viz.json#viz-chips']})      # the output names its own key, never the other samples
        self.assertNotIn('viz-other', json.dumps(out))

    def test_a_preview_file_is_never_taken(self):      # docs/kit-json.md: the catalog page loads it; take, describe and suggest leave it out
        cat = json.loads(json.dumps(SLIM)); cat['entries'][0]['files'].append({'path': 'kit/previews/chips.js', 'role': 'preview'})
        src = self.write_json('pv/catalog.json', cat)
        self.assertEqual(list(self.ok('take', src, 'viz.chips', '--url', self.URL)['files']), ['kit/viz/chips.js'])
        self.assertEqual(self.ok('kit', 'describe', 'viz.chips', src)['files'], ['kit/viz/chips.js'])
        self.assertEqual(self.ok('suggest', src, '--for', 'chips')[0]['takes'], 1)

    def test_take_of_an_entry_that_owns_no_sample_names_none(self):
        out = self.ok('take', self.bundled(), 'viz.timeline', '--url', self.URL)
        self.assertEqual([p for p in out['files'] if p.startswith('kit/samples/')], [])
        self.assertNotIn('samples', out)

    def test_take_of_a_dependency_leaves_the_bundle_out(self):
        out = self.ok('take', self.bundled(), 'viz.timeline', '--url', self.URL)
        self.assertEqual(out['entries'], ['viz.chips', 'viz.timeline'])
        self.assertNotIn('kit/samples/viz.json', out['files'])
        self.assertNotIn('samples', out)

    def test_take_prints_the_files_map_by_reference_dependencies_first_each_once_and_warns_on_a_local_index(self):
        out = self.ok('take', self.bundled(), 'viz.timeline', 'viz.chips', '--url', self.URL)
        self.assertEqual(out['entries'], ['viz.chips', 'viz.timeline'])
        self.assertEqual(out['files'], {p: {'artifact': self.URL, 'path': p} for p in ('kit/viz/chips.js', 'kit/viz/timeline.js', 'kit/samples/viz.json')})
        self.assertEqual(out['sha256'], {p: 'x' for p in out['files']})
        self.assertFalse(out['catalog']['live'])
        self.assertIn('a local index is a build', out['catalog']['warning'])

    def test_take_of_an_index_without_hashes_names_none(self):
        self.assertEqual(self.ok('take', self.local(), 'viz.chips', '--url', self.URL)['sha256'], {})

    def test_take_refuses_an_unknown_id_a_missing_url_and_a_missing_saved_catalog(self):
        src = self.bundled()
        self.assertIn('no entry viz.nope', self.fails('take', src, 'viz.nope', '--url', self.URL).stderr)
        self.assertIn('no catalog url', self.fails('take', src, 'viz.chips').stderr)
        self.assertIn('no saved catalog', self.fails('take', '-', 'viz.chips').stderr)
        self.assertIn('neither a catalog url', self.fails('take', self.p('none.json'), 'viz.chips').stderr)

    def test_take_takes_the_url_from_the_config_and_prints_the_fetch_for_an_index_not_fetched(self):
        cfg = self.write_json('cfg.json', {'values': {'links.catalog': self.URL}})
        self.assertEqual(self.ok('take', self.bundled(), 'viz.chips', '--config', cfg)['files']['kit/viz/chips.js']['artifact'], self.URL)
        out = json.loads(self.fails('take', self.URL, 'viz.chips', code=2).stdout)
        self.assertEqual((out['error'], out['catalog']), ('index not fetched', self.URL))
        self.assertIn('fetch', out)

    def test_suggest_searches_the_about_text_of_the_header(self):
        out = self.ok('suggest', self.local(), '--for', 'quartz glaze')
        self.assertEqual([x['id'] for x in out], ['viz.chips'])
        self.assertIn('about: glaze, quartz', out[0]['why'])

    def test_suggest_notes_a_header_missing_on_a_local_catalog(self):
        r = self.run_adp('suggest', self.local(), '--for', 'chip')
        self.assertIn('note: 1 main-file headers are not on disk', r.stderr)

    def test_show_of_a_fetched_catalog_prints_the_read_call_for_the_missing_header(self):
        self.fetched()
        out = self.ok('kit', 'show', 'viz.chips', self.URL)
        call = out['fetch'][0]
        self.assertEqual((call['action'], call['url'], call['paths']), ('read', self.URL, ['kit/viz/chips.js']))
        self.assertEqual(call['out_dir'], os.path.join(self.home, '.adp', 'catalogs', 'abc123'))
        self.assertEqual(out['about'], '')

    def test_once_the_header_is_on_disk_the_next_run_reads_it(self):
        d = self.fetched()
        with open(os.path.join(d, 'kit', 'viz', 'chips.js'), 'w') as f: f.write(HEADER)
        out = self.ok('kit', 'show', 'viz.chips', self.URL)
        self.assertNotIn('fetch', out)
        self.assertIn('quartz', out['about'])

    def test_suggest_splits_the_missing_paths_in_reads_of_at_most_256(self):
        d = self.fetched()
        many = {**SLIM, 'entries': [{**SLIM['entries'][0], 'id': f'viz.e{i}', 'main': f'kit/viz/e{i}.js'} for i in range(300)]}
        Path(os.path.join(d, 'catalog.json')).write_text(json.dumps(many))
        r = self.run_adp('suggest', self.URL, '--for', 'chip')
        calls = [json.loads(x) for x in r.stderr.splitlines() if x.startswith('{')]
        self.assertEqual([len(c['paths']) for c in calls], [256, 44])
        self.assertIn('note: 300 main-file headers', r.stderr)


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
        Path(old).write_text(self._page('<p>one</p>'))
        Path(new).write_text(self._page('<p>two</p>'))
        out = self.ok('diff-pages', old, new)
        self.assertEqual(out['changed'], ['p'])
        self.assertEqual(out['deepest'], ['p'])
        detail = ' '.join(out['detail']['p'])
        self.assertIn('-one', detail)
        self.assertIn('+two', detail)

    def test_diff_pages_of_identical_pages_is_empty(self):
        old = self.p('old.html')
        Path(old).write_text(self._page('x'))
        out = self.ok('diff-pages', old, old)
        self.assertEqual((out['added'], out['removed'], out['changed'], out['deepest']), ([], [], [], []))

    def test_diff_pages_of_two_projects(self):
        d = self.new_project('one')
        shutil.copytree(d, self.p('two'))
        self.edit(self.p('two'))
        out = self.ok('diff-pages', d, self.p('two'))
        self.assertEqual(out['deepest'], ['home.welcome'])
        self.assertTrue(any(x.startswith('+') and 'EDITED' in x for x in out['detail']['home.welcome']))

    def test_a_page_inside_the_artifact_skeleton_is_the_same_page(self):
        d = self.new_project('one'); shutil.copytree(d, self.p('two')); ix = os.path.join(self.p('two'), 'index.html')
        Path(ix).write_text('<!doctype html><html><head><meta charset=utf8><style>*{margin:0}</style></head><body>\n' + Path(ix).read_text() + '\n</body></html>')
        out = self.ok('diff-pages', d, self.p('two'))
        self.assertEqual((out['added'], out['removed'], out['changed'], out['files'], out['page_hash'][0]), ([], [], [], {}, out['page_hash'][1]))


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
            self.assertEqual(json.loads(Path(f).read_text()), b)
        deps = [r for r in re.findall(r'(?:src|href)="([^"]+)"', Path(os.path.join(d, 'index.html')).read_text()) if r in out['batches'][0] or os.path.isfile(os.path.join(d, r))]
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
        self.assertEqual(set(json.loads(Path(self.p('vm.json')).read_text())), {p for b in out['batches'] for p in b})

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
        Path(f).write_text(self.CONTENT if text is None else text)
        return self.run_adp('new', 'starter', 'cproj', '--content', f)

    def test_builds_views_and_sections_verbatim(self):
        r = self.build()
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout)
        nbytes = len('<p>Hello <b>world</b></p>') + len('<ul><li>one</li></ul>') + len('<p>deep</p>')
        self.assertEqual(out['built'], {'views': 2, 'sections': 3, 'parts': 5, 'bytes': nbytes})
        d = self.p('cproj')
        cj = Path(os.path.join(d, 'content.js')).read_text()
        self.assertIn('<p>Hello <b>world</b></p>', cj)
        self.assertIn('A lead for the page.', cj)
        self.assertNotIn('home.welcome', cj)
        js = Path(os.path.join(d, 'parts', 'app.js')).read_text()
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


class MyOwnKit(Untested):
    """`adp.py catalog URL` brings the whole kit to ~/.adp/catalog: it prints the reads (256 paths at most each, folders kept together) and says
    `complete` once every file the index lists is there with its sha256. An older ~/.adp/catalogs/<id>/ copy still counts."""
    URL = 'https://claude.ai/artifact/abc123'

    def kit(self, folders, **put):
        """An index of folders {name: count}: one entry per file name, written to ~/.adp/catalog when put['write'] is not False."""
        entries, root = [], os.path.join(self.home, '.adp', 'catalog')
        for folder, n in folders.items():
            for i in range(n):
                path, body = f'kit/{folder}/f{i:03d}.js', f'/* {folder} {i} */\n'
                entries.append({'id': f'{folder}.f{i:03d}', 'name': 'n', 'summary': 's', 'tags': [], 'main': path, 'requires': [], 'provides': [], 'globals': [],
                                'files': [{'path': path, 'role': 'script', 'sha256': hashlib.sha256(body.encode()).hexdigest(), 'bytes': len(body)}]})
                if put.get('write', True):
                    os.makedirs(os.path.dirname(os.path.join(root, path)), exist_ok=True)
                    with open(os.path.join(root, path), 'w') as f: f.write(body)
        os.makedirs(root, exist_ok=True)
        Path(os.path.join(root, 'catalog.json')).write_text(json.dumps({'schema': 'kit-catalog/2', 'ver': '', 'built': 'x', 'entries': entries}))
        return root

    def test_an_unfetched_kit_prints_the_index_read_into_the_kit_folder(self):
        out = self.ok('catalog', self.URL)
        self.assertFalse(out['fetched'])
        self.assertEqual(out['fetch']['out_dir'], os.path.join(self.home, '.adp', 'catalog'))

    def test_a_kit_with_its_files_is_complete_and_prints_no_reads(self):
        root = self.kit({'viz': 3})
        out = self.ok('catalog', self.URL)
        self.assertEqual((out['kit'], out['files'], out['missing'], out['complete']), (root, 3, 0, True))
        self.assertNotIn('reads', out)

    def test_missing_and_changed_files_come_back_as_reads(self):
        root = self.kit({'viz': 3})
        os.remove(os.path.join(root, 'kit', 'viz', 'f000.js'))
        with open(os.path.join(root, 'kit', 'viz', 'f001.js'), 'w') as f: f.write('changed')
        out = self.ok('catalog', self.URL)
        self.assertEqual((out['missing'], out['complete'], out['calls']), (2, False, 1))
        call = out['reads'][0]
        self.assertEqual((call['action'], call['url'], call['out_dir']), ('read', self.URL, root))
        self.assertEqual(call['paths'], ['kit/viz/f000.js', 'kit/viz/f001.js'])

    def test_reads_hold_at_most_256_paths_and_keep_a_folder_together(self):
        self.kit({'a': 200, 'b': 100}, write=False)
        out = self.ok('catalog', self.URL)
        self.assertEqual((out['files'], out['missing'], out['calls'], out['per_call']), (300, 300, 2, [200, 100]))
        self.assertTrue(all(p.startswith('kit/a/') for p in out['reads'][0]['paths']))

    def test_a_folder_over_256_is_split_into_plain_chunks(self):
        self.kit({'a': 300}, write=False)
        self.assertEqual(self.ok('catalog', self.URL)['per_call'], [256, 44])

    def test_an_older_catalogs_copy_still_counts_until_the_new_folder_has_an_index(self):
        d = os.path.join(self.home, '.adp', 'catalogs', 'abc123'); os.makedirs(d)
        Path(os.path.join(d, 'catalog.json')).write_text(json.dumps({'schema': 'kit-catalog/2', 'entries': []}))
        self.assertEqual(self.ok('catalog', self.URL)['kit'], d)
        self.kit({'viz': 1})
        self.assertEqual(self.ok('catalog', self.URL)['kit'], os.path.join(self.home, '.adp', 'catalog'))


if __name__ == '__main__':
    unittest.main()
