import contextlib
import io
import json
import os
import re
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import check_headers as ch  # noqa: E402

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
 * @provides  Kit.demo.render, Kit.demo.fmt
 * @config    Kit.demo.render(box, opts) | columns, rows,
 *            group
 * @tokens    --panel --ink
 * @globals   none
 * @db        none
 * @files     kit/demo.css, kit/samples/demo.json
 */
(function () { Kit.demo = {render: 0, fmt: 0}; })();
"""
CSS = '.kit-demo{background:var(--panel);color:var(--ink);border-color:var(--seam, gray)}\n'


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
            {'id': 'kit.demo', 'main': 'kit/demo.js', 'files': [{'path': 'kit/demo.js', 'role': 'script'}, {'path': 'kit/demo.css', 'role': 'style'}, {'path': 'kit/samples/demo.json', 'role': 'sample'}]},
            {'id': 'kit.other', 'main': 'kit/other.js', 'files': [{'path': 'kit/other.js', 'role': 'script'}]},
            {'id': 'template.t', 'main': 'kit/templates/t.html.txt', 'files': [{'path': 'kit/templates/t.html.txt', 'role': 'template'}, {'path': 'kit/templates/t.css', 'role': 'style'}]},
        ]
        self.index()
        self.write('kit/demo.css', CSS)
        self.write('kit/samples/demo.json', '{}')

    def index(self):
        json.dump({'entries': self.entries}, open(os.path.join(self.root, 'catalog.json'), 'w'))

    def built(self):
        """Write catalog.json as `adp.py index` does, from the headers in the tree; -> the index."""
        cat = ch.adp_index.build_index(self.root)
        json.dump(cat, open(os.path.join(self.root, 'catalog.json'), 'w'))
        return cat

    def write(self, rel, text):
        p = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(text)
        return p

    def rules(self, text, rel='kit/demo.js'):
        p = self.write(rel, text)
        (_, state, issues), = ch.check(self.root, [p])[0]
        return state, sorted({r for r, _ in issues})


class Validate(Base):
    def test_valid_header(self):
        self.assertEqual(self.rules(GOOD), ('header', []))

    def test_missing_required_tag(self):
        for tag in ('id', 'kind', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'globals', 'db', 'files', 'provides', 'tokens'):
            s, r = self.rules(header(**{tag: None}) if tag != 'id' else GOOD.replace(' * @id        kit.demo\n', ' * @provides  x\n'))
            if tag == 'id':
                self.assertEqual(s, 'legacy')
            else:
                self.assertIn('missing-tag', r, tag)

    def test_bad_values(self):
        cases = (('id', 'Kit_demo'), ('status', 'beta'), ('version', '0.1'), ('updated', '25 Oct 2026'), ('tags', 'Table, data'), ('tags', 'table, table'),
                 ('requires', 'kit.nothing'), ('provides', 'Kit demo'), ('tokens', 'ink'), ('tokens', '--panel, --ink'), ('globals', 'jquery'),
                 ('db', 'board/x'))      # tokens: spaces, not commas; db: a section without its keyword
        for tag, v in cases:
            self.assertIn(tag, self.rules(header(**{tag: v}))[1], (tag, v))

    def test_kind_is_one_the_page_shows(self):
        page = open(os.path.join(ROOT, 'skill', 'catalog', 'parts', 'catalog.js'), encoding='utf-8').read()
        self.assertEqual(re.findall(r'(\w+): \'', re.search(r'const KIND = \{(.*?)\}', page).group(1)), list(ch.PAGE_KINDS))
        self.assertIn('kind', self.rules(header(kind='compnent'))[1])      # it builds, and the page would drop the entry

    def test_id_must_match_the_path(self):
        self.assertIn('id-path', self.rules(header(id='kit.other'))[1])             # the file is named demo
        self.assertIn('id-path', self.rules(header(id='viz.demo'))[1])              # kit/demo.js is a kit file

    def test_provides_must_be_defined_by_the_script(self):
        self.assertIn('provides-code', self.rules(header(provides='Kit.demo.render, Kit.demo.gone'))[1])

    def test_unknown_and_duplicate_tag(self):
        self.assertIn('unknown-tag', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @bogus     x'))[1])
        self.assertIn('duplicate-tag', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @db        none'))[1])

    def test_config_needs_separator(self):
        self.assertIn('config', self.rules(GOOD.replace('Kit.demo.render(box, opts) | columns', 'Kit.demo.render(box, opts) columns'))[1])
        self.assertIn('config', self.rules(GOOD.replace(' * @tokens', ' * @config    none\n * @tokens'))[1])      # nothing to say: no line

    def test_config_repeats(self):
        self.assertEqual(self.rules(GOOD.replace(' * @tokens', ' * @config    markup | div.kit-demo\n * @tokens'))[1], [])

    def test_optional_token_marker(self):
        self.assertEqual(self.rules(header(tokens='--panel --ink --seam?'))[1], [])
        self.assertIn('tokens', self.rules(header(tokens='--panel (optional)'))[1])

    def test_tokens_against_the_files(self):
        for tokens, rule in (('--panel --ink --gone', 'tokens-unread'), ('--panel', 'tokens-undeclared'), ('--panel --ink?', 'tokens-optional')):
            self.assertEqual(self.rules(header(tokens=tokens))[1], [rule], tokens)

    def test_a_required_theme_supplies_tokens_and_a_required_entry_owns_them(self):
        for i, p in (('theme.t', 'kit/themes/t.css'), ('kit.base', 'kit/base.css')):
            self.entries.append({'id': i, 'main': p, 'files': [{'path': p, 'role': 'style'}]})
            self.write(p, ':root{--panel:#fff}\n')
        self.index()
        self.assertEqual(self.rules(header(requires='theme.t'))[1], [])
        self.assertEqual(self.rules(header(requires='kit.base'))[1], ['tokens-own'])

    def test_tokens_only_required_with_a_style_file(self):
        t = header(id='kit.other', tokens=None, files='none')
        self.assertEqual(self.rules(t, 'kit/other.js'), ('header', []))

    def test_provides_only_required_for_js(self):
        t = '<!--\nTemplate\nA shell.\n@id template.t\n@kind template\n@group Templates\n@status new\n@version 0.1.0\n@updated 2026-10-25\n@summary s\n@tags shell\n@requires none\n@tokens none\n@globals none\n@db none\n@files kit/templates/t.css\n-->\n'
        self.assertEqual(self.rules(t, 'kit/templates/t.html.txt'), ('header', []))

    def test_notes_paragraphs_are_not_about(self):
        text = GOOD.replace(' * A table from rows and columns.\n', ' * A table from rows and columns.\n *\n * API: render(box, opts) draws it.\n * More notes.\n')
        h = ch.header_of(text, 'x.js')
        self.assertEqual((h['name'], h['about']), ('Demo table', 'A table from rows and columns.'))
        self.assertEqual(self.rules(text), ('header', []))

    def test_summary_length_and_title_and_about(self):
        self.assertIn('summary', self.rules(header(summary='x' * 300))[1])
        self.assertIn('title', self.rules('/**\n * @id kit.demo\n */\n')[1])
        self.assertIn('about', self.rules(GOOD.replace(' * A table from rows and columns.\n', ''))[1])


class Gate(Base):
    def test_header_less_main_file_fails(self):
        self.assertEqual(self.rules('/* old comment */\n'), ('legacy', ['legacy']))

    def test_a_header_past_the_window_is_cut(self):
        long = '@changed   ' + 'x' * ch.adp_index.HEAD
        self.assertEqual(self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * ' + long)), ('legacy', ['header-cut']))
        t = '---\ntitle: t\n---\n<!--\nTemplate\n@id template.t\n%s\n-->\n' % long                 # after front matter
        self.assertEqual(self.rules(t, 'kit/templates/t.html.txt'), ('legacy', ['header-cut']))

    def test_other_files_are_skipped(self):
        for rel in ('kit/demo.css', 'kit/samples/demo.json', 'kit/unknown.js'):
            p = self.write(rel, 'x')
            self.assertEqual(ch.check(self.root, [p])[0][0][1], 'skipped')

    def test_no_files_checks_every_main_file(self):
        self.write('kit/demo.js', GOOD)
        results, _ = ch.check(self.root)
        self.assertEqual(sorted(p for p, _, _ in results), ['kit/demo.js', 'kit/other.js', 'kit/templates/t.html.txt'])

    def test_missing_main_file_is_reported(self):
        self.write('kit/demo.js', GOOD)
        issues = {p: [r for r, _ in i] for p, _, i in ch.check(self.root)[0]}
        self.assertEqual(issues['kit/other.js'], ['missing-file'])
        self.assertEqual(issues['kit/demo.js'], [])


class Index(Base):
    """catalog.json is the index the headers build: no key the header already says, no kept key that differs from it."""
    def rules_of(self, change):
        self.write('kit/demo.js', GOOD)
        cat = self.built()
        change(cat['entries'][0])
        json.dump(cat, open(os.path.join(self.root, 'catalog.json'), 'w'))
        return sorted({r for r, _ in ch.index_issues(self.root)})

    def test_a_key_outside_the_slim_set_fails(self):
        self.assertEqual(self.rules_of(lambda e: None), [])
        for k in ('about', 'needs', 'source', 'changed', 'preview', 'at', 'by'):
            self.assertEqual(self.rules_of(lambda e: e.update({k: 'x'})), ['index'], k)

    def test_a_kept_key_that_differs_from_the_header_fails(self):
        for k, v in (('summary', 'Another.'), ('tags', ['table']), ('main', 'kit/demo.css'), ('hash', '0')):
            self.assertEqual(self.rules_of(lambda e: e.update({k: v})), ['index'], k)


class Cli(Base):
    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = ch.main(['--root', self.root, *args])
        return code, out.getvalue(), err.getvalue()

    def test_exit_codes(self):
        p = self.write('kit/demo.js', GOOD)
        self.assertEqual(self.run_main(p)[0], 1)                     # the header is valid; catalog.json is not what it builds
        self.built()
        self.assertEqual(self.run_main(p)[0], 0)
        p = self.write('kit/demo.js', header(status='beta'))
        code, out, _ = self.run_main(p)
        self.assertEqual(code, 1)
        self.assertIn('[status]', out)

    def test_report_counts_and_exits_zero(self):
        self.write('kit/demo.js', GOOD)
        self.write('kit/other.js', '/* old */')
        self.write('kit/templates/t.html.txt', '<!-- old -->')
        code, out, _ = self.run_main('--report')
        self.assertEqual(code, 0)
        self.assertIn('kit', out)
        self.assertIn('rule legacy: 2', out)


if __name__ == '__main__':
    unittest.main()
