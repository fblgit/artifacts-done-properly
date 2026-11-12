import contextlib
import io
import json
import os
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
        json.dump({'entries': self.entries}, open(os.path.join(self.root, 'catalog.json'), 'w'))

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
        for tag in ('id', 'group', 'status', 'version', 'updated', 'summary', 'tags', 'requires', 'globals', 'db', 'provides', 'tokens'):
            s, r = self.rules(header(**{tag: None}) if tag != 'id' else GOOD.replace(' * @id        kit.demo\n', ' * @provides  x\n'))
            if tag == 'id':
                self.assertEqual(s, 'legacy')
            else:
                self.assertIn('missing-tag', r, tag)

    def test_bad_values(self):
        cases = {'id': ('id', 'Kit_demo'), 'status': ('status', 'beta'), 'version': ('version', '0.1'), 'updated': ('updated', '25 Oct 2026'),
                 'tags': ('tags', 'Table, table'), 'requires': ('requires', 'kit.nothing'), 'provides': ('provides', 'Kit demo'),
                 'tokens': ('tokens', 'ink'), 'globals': ('globals', 'jquery')}
        for tag, (rule, v) in cases.items():
            s, r = self.rules(header(**{tag: v}))
            self.assertIn(rule if tag != 'id' else 'id', r, tag)

    def test_id_must_match_catalog(self):
        self.assertIn('id-mismatch', self.rules(header(id='kit.other'))[1])

    def test_unknown_and_duplicate_tag(self):
        self.assertIn('unknown-tag', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @source    x'))[1])
        self.assertIn('duplicate-tag', self.rules(GOOD.replace(' * @db        none', ' * @db        none\n * @db        none'))[1])

    def test_config_needs_separator(self):
        self.assertIn('config', self.rules(GOOD.replace('Kit.demo.render(box, opts) | columns', 'Kit.demo.render(box, opts) columns'))[1])

    def test_config_repeats(self):
        self.assertEqual(self.rules(GOOD.replace(' * @tokens', ' * @config    markup | div.kit-demo\n * @tokens'))[1], [])

    def test_tokens_only_required_with_a_style_file(self):
        t = header(id='kit.other', tokens=None)
        self.assertEqual(self.rules(t, 'kit/other.js'), ('header', []))

    def test_provides_only_required_for_js(self):
        t = '<!--\nTemplate\nA shell.\n@id template.t\n@group Templates\n@status new\n@version 0.1.0\n@updated 2026-10-25\n@summary s\n@tags shell\n@requires none\n@tokens none\n@globals none\n@db none\n-->\n'
        self.assertEqual(self.rules(t, 'kit/t.html.txt'), ('header', []))

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


class Cli(Base):
    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = ch.main(['--root', self.root, *args])
        return code, out.getvalue(), err.getvalue()

    def test_exit_codes(self):
        p = self.write('kit/demo.js', GOOD)
        self.assertEqual(self.run_main(p)[0], 0)
        p = self.write('kit/demo.js', header(status='beta'))
        code, out, _ = self.run_main(p)
        self.assertEqual(code, 1)
        self.assertIn('[status]', out)

    def test_report_counts_and_exits_zero(self):
        self.write('kit/demo.js', GOOD)
        self.write('kit/other.js', '/* old */')
        self.write('kit/t.html.txt', '<!-- old -->')
        code, out, _ = self.run_main('--report')
        self.assertEqual(code, 0)
        self.assertIn('kit', out)
        self.assertIn('rule legacy: 2', out)


if __name__ == '__main__':
    unittest.main()
