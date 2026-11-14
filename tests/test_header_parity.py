"""The catalog page (skill/catalog/parts/files.js, parseHeader) and adp_index.parse_header read a header the same way.
files.js runs in node with stub globals; parseHeader is not exported, so the test adds it to the object the file exports.
Skipped when node is not on PATH."""
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, 'skill', 'catalog')
sys.path.insert(0, os.path.join(ROOT, 'skill', 'scripts'))
import adp_index  # noqa: E402

EXPORT = 'window.CatalogFiles = Object.freeze({'
HARNESS = r"""
const job = JSON.parse(require('fs').readFileSync(0, 'utf8'));
global.window = {}; global.document = {}; global.sessionStorage = {getItem: () => null, setItem() {}}; global.fetch = () => Promise.reject(new Error('no network'));
(0, eval)(job.src);
console.log(JSON.stringify(job.cases.map(([p, t]) => window.CatalogFiles.parseHeader(p, t))));
"""
TAGS = r"""
Name here
About one
still one.

Notes with *\/ inside.
@id x.y
@tags a, b\, c , ,d
@files kit/a.js, kit/b\,c.css
@requires none
@config f(a \| b) | what it \| does | more
@config none
@config g()
@source B \| b | f.js | w | z
@source none
@changed one *\/ two
@tokens --a --b?, --c
@fonts https://x/y?family=A,B&display=swap
@db reads a; b / writes c / Writes d / note Reads e
@preview {"render": "x", "samples": ["kit/samples/a.json"]}
not a tag
@summary first
@summary second
@preview2 {not json
"""
STAR = '/**' + TAGS.replace('\n', '\n * ') + '\n */\ncode'
CASES = [['a.js', STAR], ['a.css.txt', STAR], ['A.JS', STAR], ['a.md', '---\ntitle: t\n---\n<!--' + TAGS + '-->\n# t'], ['t.html.txt', '<!doctype html><!--' + TAGS + '-->'],
         ['bad.js', '/** N\n * @id x\n * @preview {not json\n */'], ['late.js', STAR.replace('@id x.y', '@changed ' + 'x' * adp_index.HEAD)],
         ['n.js', 'var x = 1;'], ['e.js', '/** */'], ['x.json', '{"header": {"id": "t"}}'], ['o.yaml', '<!-- T\n@id t -->']]


@unittest.skipUnless(shutil.which('node'), 'node is not on PATH')
class Parity(unittest.TestCase):
    def test_the_page_and_python_parse_the_same(self):
        src = open(os.path.join(CATALOG, 'parts', 'files.js'), encoding='utf-8').read()
        self.assertEqual(src.count(EXPORT), 1)
        mains = [e['main'] for e in json.load(open(os.path.join(CATALOG, 'catalog.json'), encoding='utf-8'))['entries']]
        cases = CASES + [[p, open(os.path.join(CATALOG, p), encoding='utf-8', newline='').read()] for p in mains]
        r = subprocess.run(['node', '-e', HARNESS], input=json.dumps({'src': src.replace(EXPORT, EXPORT + ' parseHeader,'), 'cases': cases}),
                           capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stderr)
        py = [json.loads(json.dumps(adp_index.parse_header(t, p))) for p, t in cases]
        self.assertEqual(len([h for h in py if h.get('id')]), len(cases) - 5)          # every real main file and six hand cases have a header
        for (p, _t), js, want in zip(cases, json.loads(r.stdout), py):
            self.assertEqual(js, want, p)


if __name__ == '__main__':
    unittest.main()
