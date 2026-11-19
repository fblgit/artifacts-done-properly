from pathlib import Path
import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts'))
import adp_lib as ch  # noqa: E402

GOOD = """/* part:page.script.kit.demo */
/**
 * Demo table
 * A table from rows and columns.
 *
 * @id        kit.demo
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-25
 * @summary   A demo entry.
 * @tags      table, data
 * @requires  none
 * @files     kit/demo.css, kit/samples/demo.json
 * @provides  Kit.demo.render, Kit.demo.fmt
 * @config    Kit.demo.render(box, opts) | columns, rows,
 *            group
 * @tokens    --panel --ink
 * @globals   none
 * @db        none
 */
(function () {})();
"""


def header(**over):
    """GOOD with tags replaced (value None removes the tag line)."""
    out = []
    for line in GOOD.split('\n'):
        for k, v in over.items():
            if line.startswith(f' * @{k} '):
                line = None if v is None else f' * @{k:<9s} {v}'
                break
        if line is not None:
            out.append(line)
    return '\n'.join(out)


class Base(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.root, 'kit'))
        self.entries = [
            {'id': 'kit.demo', 'files': [{'path': 'kit/demo.js', 'role': 'script'}, {'path': 'kit/demo.css', 'role': 'style'}, {'path': 'kit/samples/demo.json', 'role': 'sample'}]},
            {'id': 'kit.other', 'files': [{'path': 'kit/other.js', 'role': 'script'}]},
            {'id': 'template.t', 'files': [{'path': 'kit/t.html.txt', 'role': 'template'}, {'path': 'kit/t.css', 'role': 'style'}]},
        ]
        Path(os.path.join(self.root, 'catalog.json')).write_text(json.dumps({'entries': self.entries}))

    def write(self, rel, text):
        p = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        Path(p).write_text(text, encoding='utf-8')
        return p

    def rules(self, text, rel='kit/demo.js'):
        p = self.write(rel, text)
        (_, state, issues), = ch.check(self.root, [p])[0]
        return state, sorted({r for r, _ in issues})


class Validate(Base):
    def test_valid_header(self):
        self.assertEqual(self.rules(GOOD), ('header', []))

    def test_missing_required_tag(self):
        for tag in ('id', 'kind', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'files', 'globals', 'db', 'provides', 'tokens'):
            s, r = self.rules(header(**{tag: None}) if tag != 'id' else GOOD.replace(' * @id        kit.demo\n', ' * @provides  x\n'))
            if tag == 'id':
                self.assertEqual(s, 'legacy')
            else:
                self.assertIn('missing-tag', r, tag)

    def test_bad_values(self):
        cases = {'id': ('id', 'Kit_demo'), 'status': ('status', 'beta'), 'version': ('version', '0.1'), 'updated': ('updated', '25 Oct 2026'),
                 'tags': ('tags', 'Table, table'), 'requires': ('requires', 'kit.nothing'), 'provides': ('provides', 'Kit demo'),
                 'tokens': ('tokens', 'ink'), 'globals': ('globals', 'jquery'), 'kind': ('kind', 'widget'), 'files': ('files', 'kit/x.js'),
                 'db': ('db', 'Reads x')}
        for tag, (rule, v) in cases.items():
            s, r = self.rules(header(**{tag: v}))
            self.assertIn(rule if tag != 'id' else 'id', r, tag)

    def test_id_must_match_catalog(self):
        self.assertIn('id-mismatch', self.rules(header(id='kit.other'))[1])

    def test_unknown_and_duplicate_tag(self):
        self.assertIn('unknown-tag', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @bogus     x'))[1])
        self.assertIn('duplicate-tag', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @db        none'))[1])

    def test_preview_is_json(self):
        self.assertEqual(self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @preview   {"render": "kit.demo"}'))[1], [])
        self.assertIn('preview', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @preview   {'))[1])

    def test_preview_samples_are_paths_or_path_hash_key(self):
        def preview(v):
            return self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @preview   ' + v))[1]
        self.assertEqual(preview('{"render": "kit.demo", "samples": ["kit/samples/a.json", "kit/samples/b.json#viz-tree", "kit/templates/t.html.txt"]}'), [])
        for bad in ('"kit/samples/b.json#"', '"kit/samples/b.json#a b"', '"#key"', '7'):
            self.assertEqual(preview('{"render": "kit.demo", "samples": [' + bad + ']}'), ['preview'], bad)

    def test_samples_is_a_comma_list_of_keys(self):
        def samples(v):
            return self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @samples   ' + v))[1]
        self.assertEqual(samples('tabs, viz-tree, a.b_c'), [])
        for bad in ('a b', 'a, a', 'a/b', 'a,, #'):
            self.assertEqual(samples(bad), ['samples'], bad)

    def test_samples_is_a_list_in_the_header_dict(self):
        h = ch.parse_header(GOOD.replace(' * @db        none', ' * @db        none\n * @samples   tabs, viz-tree'), 'kit/demo.js')
        self.assertEqual(h['samples'], ['tabs', 'viz-tree'])

    def test_split_ref(self):
        self.assertEqual(ch.split_ref('kit/samples/viz.json#viz-tree'), ('kit/samples/viz.json', 'viz-tree'))
        self.assertEqual(ch.split_ref('kit/samples/viz.json'), ('kit/samples/viz.json', None))

    def test_source_repeats_and_changed_is_one(self):
        two = GOOD.replace(' * @db        none', ' * @db        none\n * @source    Board | app.js | what\n * @source    Other | b.js | more')
        self.assertEqual(self.rules(two)[1], [])
        self.assertIn('source', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @source    x'))[1])
        self.assertEqual(self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @changed   0.1.0: one'))[1], [])
        self.assertIn('changed', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @changed   a\n * @changed   b'))[1])

    def test_config_needs_separator(self):
        self.assertIn('config', self.rules(GOOD.replace('Kit.demo.render(box, opts) | columns', 'Kit.demo.render(box, opts) columns'))[1])

    def test_config_repeats(self):
        self.assertEqual(self.rules(GOOD.replace(' * @tokens', ' * @config    markup | div.kit-demo\n * @tokens'))[1], [])

    def test_optional_token_marker(self):
        self.assertEqual(self.rules(header(tokens='--panel --seam?'))[1], [])
        self.assertIn('tokens', self.rules(header(tokens='--panel (optional)'))[1])

    def test_tokens_only_required_with_a_style_file(self):
        t = header(id='kit.other', tokens=None, files='none')
        self.assertEqual(self.rules(t, 'kit/other.js'), ('header', []))

    def test_provides_only_required_for_js(self):
        t = '<!--\nTemplate\nA shell.\n@id template.t\n@kind template\n@group Templates\n@status new\n@version 0.1.0\n@updated 2026-10-25\n@summary s\n@tags shell\n@requires none\n@files kit/t.css\n@tokens none\n@globals none\n@db none\n-->\n'
        self.assertEqual(self.rules(t, 'kit/t.html.txt'), ('header', []))

    def test_notes_paragraphs_are_not_about(self):
        text = GOOD.replace(' * A table from rows and columns.\n', ' * A table from rows and columns.\n *\n * API: render(box, opts) draws it.\n * More notes.\n')
        title, about, tags = ch.parse(ch.comment_of(text, 'x.js'))
        self.assertEqual((title, about), ('Demo table', 'A table from rows and columns.'))
        self.assertEqual(self.rules(text), ('header', []))

    def test_summary_length_and_title_and_about(self):
        self.assertIn('summary', self.rules(header(summary='x' * 300))[1])
        self.assertIn('title', self.rules('/**\n * @id kit.demo\n */\n')[1])
        self.assertIn('about', self.rules(GOOD.replace(' * A table from rows and columns.\n', ''))[1])


class Gate(Base):
    def test_header_less_main_file_fails(self):
        self.assertEqual(self.rules('/* old comment */\n'), ('legacy', ['legacy']))

    def test_other_files_are_skipped(self):
        for rel in ('kit/demo.css', 'kit/samples/demo.json', 'kit/unknown.js'):
            p = self.write(rel, 'x')
            self.assertEqual(ch.check(self.root, [p])[0][0][1], 'skipped')

    def test_no_files_checks_every_main_file(self):
        self.write('kit/demo.js', GOOD)
        results, _ = ch.check(self.root)
        self.assertEqual(sorted(p for p, _, _ in results), ['kit/demo.js', 'kit/other.js', 'kit/t.html.txt'])

    def test_missing_main_file_is_reported(self):
        self.write('kit/demo.js', GOOD)
        issues = {p: [r for r, _ in i] for p, _, i in ch.check(self.root)[0]}
        self.assertEqual(issues['kit/other.js'], ['missing-file'])
        self.assertEqual(issues['kit/demo.js'], [])


if __name__ == '__main__':
    unittest.main()
