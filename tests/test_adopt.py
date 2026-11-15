"""Black-box tests of `extract`, `pack` and `unpack` (docs/adopt.md) on a small made-up subject: a namespace, a logic script, two UI scripts
with their stylesheets, a stylesheet every script shares, and a data file that must not become a candidate."""
import json, os, subprocess, unittest

from test_commands import Cmd

FILES = {
    'index.html': '<!doctype html><title>Toy</title>',
    'adp.js': '/* runtime */',
    'data/sample.js': 'window.TOY_SAMPLE = {};',
    'parts/color.js': "/* part:page.script.color */\n/* Colour maths. */\n(function () {\nconst Toy = window.Toy = window.Toy || {};\nToy.color = { hex: v => '#' + v };\n})();\n",
    'parts/app.js': "/* part:page.script.app */\n(function () {\nconst Toy = window.Toy = window.Toy || {};\nToy.app = { view: 'a' };\n})();\n",
    'parts/wheel.js': "/* part:page.script.wheel */\n/* A colour wheel. */\n(function () {\nconst Toy = window.Toy = window.Toy || {}, A = Toy.app;\n"
                      "Toy.wheel = { open() { const e = document.createElement('div'); e.className = 'wheel-ring wheel-knob'; return Toy.color.hex(A.view); } };\n})();\n",
    'parts/dial.js': "(function () {\nconst Toy = window.Toy = window.Toy || {};\nToy.dial = { make() { return document.createElement('i').className = 'dial-thumb dial-track'; } };\n})();\n",
    'styles/wheel.css': '.wheel-ring { color: var(--ink); }\n.wheel-knob { margin: 0; }\n',
    'styles/dial.css': '.dial-thumb { color: var(--ink); }\n.dial-track { margin: 0; }\n',
}


class Adopt(Cmd):
    def subject(self):
        d = self.p('toy')
        for rel, t in FILES.items():
            os.makedirs(os.path.dirname(os.path.join(d, rel)), exist_ok=True)
            open(os.path.join(d, rel), 'w').write(t)
        return d

    def cands(self, **kw):
        out = self.ok('extract', self.subject())
        return out, {c['id']: c for c in out['candidates']}

    def test_candidates_provides_needs_and_css(self):
        out, c = self.cands()
        self.assertEqual(out['schema'], 'adopt-candidates/1'); self.assertEqual(out['namespace'], 'Toy')
        self.assertEqual(sorted(c), ['c.app', 'c.color', 'c.dial', 'c.wheel'])        # adp.js, data/ and the page are not candidates
        w = c['c.wheel']
        self.assertEqual(w['provides'], ['Toy.wheel']); self.assertEqual(w['needs'], ['c.app', 'c.color'])
        self.assertEqual([f['path'] for f in w['files']], ['parts/wheel.js', 'styles/wheel.css'])
        self.assertEqual(w['part'], 'page.script.wheel'); self.assertEqual(w['state'], 'detected'); self.assertEqual(w['kind_hint'], 'ui')
        self.assertEqual(w['classes'], ['wheel-knob', 'wheel-ring']); self.assertEqual(w['tokens'], ['--ink'])
        self.assertEqual(c['c.color']['needed_by'], ['c.wheel']); self.assertTrue(c['c.color']['standalone']); self.assertEqual(c['c.color']['kind_hint'], 'logic')
        self.assertEqual(c['c.color']['suggested_id'], 'kit.color'); self.assertEqual(c['c.color']['summary'], 'Colour maths.')
        self.assertFalse(c['c.dial']['needs'])

    def test_out_writes_a_file_and_a_catalog_marks_overlap(self):
        d = self.subject(); cat = self.write_json('cat.json', {'entries': [{'id': 'kit.color-wheel', 'name': 'Colour wheel', 'tags': ['wheel', 'colour'], 'provides': ['Kit.wheel'], 'files': []}]})
        r = self.ok('extract', d, '--catalog', cat, '--out', self.p('c.json'))
        self.assertEqual(r['candidates'], 4)
        w = [x for x in json.load(open(self.p('c.json')))['candidates'] if x['id'] == 'c.wheel'][0]
        self.assertEqual(w['similar'][0]['id'], 'kit.color-wheel')

    def pack(self):
        st = self.p('stage'); os.makedirs(os.path.join(st, 'kit'))
        open(os.path.join(st, 'kit', 'wheel.js'), 'w').write('/**\n * Wheel\n *\n * @id kit.wheel\n */\nKit.wheel = {};\n')
        open(os.path.join(st, 'kit', 'wheel.css'), 'w').write('.kit-wheel { margin: 0 }')      # no trailing newline
        c = self.p('c.json'); self.ok('extract', self.subject(), '--out', c)
        return self.ok('pack', 'kit.wheel', st, '--candidates', c, '--cid', 'c.wheel', '--out', self.p('kit.wheel.adp'))

    def test_pack_unpack_roundtrip_and_apply(self):
        r = self.pack()
        self.assertTrue(r['header']); self.assertEqual(r['files'], 2)
        pk = json.load(open(self.p('kit.wheel.adp')))
        self.assertEqual(pk['schema'], 'adp-pack/1'); self.assertEqual(pk['provenance']['candidate'], 'c.wheel'); self.assertEqual(pk['provenance']['subject'], 'toy')
        self.assertEqual([x['path'] for x in pk['provenance']['from']], ['parts/wheel.js', 'styles/wheel.css'])
        self.assertTrue(self.ok('unpack', self.p('kit.wheel.adp'))['ok'])
        self.ok('unpack', self.p('kit.wheel.adp'), '--to', self.p('out'))
        self.assertEqual(open(self.p('out', 'kit', 'wheel.css')).read(), '.kit-wheel { margin: 0 }')
        repo = self.p('repo'); os.makedirs(os.path.join(repo, 'skill', 'catalog')); subprocess.run(['git', 'init', '-q', repo], check=True)
        a = self.ok('unpack', self.p('kit.wheel.adp'), '--apply', repo)
        self.assertEqual(a['applied'], repo)
        self.assertEqual(open(os.path.join(repo, 'skill', 'catalog', 'kit', 'wheel.js')).read(), pk['files'][1]['text'])
        self.assertEqual(open(os.path.join(repo, 'skill', 'catalog', 'kit', 'wheel.css')).read(), '.kit-wheel { margin: 0 }')

    def test_tampered_pack_is_refused(self):
        self.pack(); pk = json.load(open(self.p('kit.wheel.adp'))); pk['files'][0]['text'] += 'x'; json.dump(pk, open(self.p('bad.adp'), 'w'))
        r = self.run_adp('unpack', self.p('bad.adp'))
        self.assertEqual(r.returncode, 1); self.assertIn('mismatch', r.stdout)

    def test_pack_refuses_missing_header_note_and_non_utf8(self):
        st = self.p('stage'); os.makedirs(st); open(os.path.join(st, 'a.js'), 'w').write('x')
        r = self.ok('pack', 'kit.a', st, '--out', self.p('a.adp')); self.assertFalse(r['header']); self.assertIn('@id kit.a', r['next'])
        open(os.path.join(st, 'b.bin'), 'wb').write(b'\xff\xfe')
        self.assertNotEqual(self.run_adp('pack', 'kit.a', st).returncode, 0)


CATALOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'skill', 'catalog', 'catalog.json')


class Adopter(Cmd):
    subject = Adopt.subject

    def test_into_copies_the_subject_and_writes_candidates(self):
        d, into = self.subject(), self.p('adopter')
        r = self.ok('extract', d, '--into', into)
        self.assertEqual(r['candidates'], 4); self.assertNotIn('schema', r)       # a summary, not the whole index
        self.assertEqual(r['wrote'], os.path.join(into, 'subject', 'candidates.json'))
        self.assertEqual(open(os.path.join(into, 'subject', 'parts', 'wheel.js')).read(), FILES['parts/wheel.js'])
        self.assertEqual(json.load(open(os.path.join(into, 'subject', 'candidates.json')))['namespace'], 'Toy')

    def test_the_adopter_template_takes_the_adopt_kits_and_loads_them_before_app(self):
        d = self.p('ad')
        r = self.ok('new', 'adopter', d, '--catalog', CATALOG, '--url', 'https://claude.ai/artifact/test-catalog')
        for i in ('kit.adopt', 'pattern.adopt-board', 'pattern.adopt-inspector', 'pattern.mindmap', 'pattern.assist'):
            self.assertIn(i, r['take'])
        for f in ('parts/adopt.js', 'styles/adopt.css', 'parts/app.js', 'index.html'):
            self.assertTrue(os.path.isfile(os.path.join(d, f)), f)
        page = open(os.path.join(d, 'index.html')).read()
        order = [page.index('src="%s"' % s) for s in ('kit/adopt.js', 'kit/patterns/adopt-board.js', 'kit/patterns/adopt-inspector.js', 'parts/adopt.js', 'parts/app.js')]
        self.assertEqual(order, sorted(order))
        self.assertIn('ADP_VIEWS', open(os.path.join(d, 'parts', 'app.js')).read())
        for k in ('kit/adopt.js', 'kit/patterns/adopt-board.js', 'kit/patterns/adopt-inspector.js'):
            self.assertIn(k, r['publish']['files'])
        self.assertEqual(self.run_adp('check', d).returncode, 0)

    def test_a_subject_copy_with_the_same_part_ids_does_not_break_check(self):
        d = self.p('ad'); self.ok('new', 'adopter', d, '--catalog', CATALOG, '--url', 'https://claude.ai/artifact/test-catalog')
        s = self.subject(); open(os.path.join(s, 'index.html'), 'w').write('<!-- part:page.lead --><p data-part="page.lead">x</p><!-- /part:page.lead -->')
        self.ok('extract', s, '--into', d)
        r = self.run_adp('check', d)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('subject/index.html', self.ok('files', d)['files'])         # still published


if __name__ == '__main__':
    unittest.main()
