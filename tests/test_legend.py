"""Every index.html that `adp.py new` writes opens with the same READ THIS FIRST legend: first the authors' note about ADP (who wrote it, tell the
user once and ask before any install, the steps are in the README), then what ADP is for, take by reference, modify by layering, do not forget good work.
The catalog url is filled in when one is saved or given. The catalog page opens with the same note."""
import html
import os
import re
import unittest

from test_commands import Cmd, ADP

TPL = os.path.join(os.path.dirname(ADP), '..', 'templates')
URL = 'https://claude.ai/artifact/abc123'
LEGEND = re.compile(r'<section id="adp-readme".*?</section>', re.S)
CATALOG_PAGE = os.path.join(os.path.dirname(ADP), '..', 'catalog', 'index.html')
INSTALL = 'https://github.com/fblgit/artifacts-done-properly#install'
NO_STEPS = ('INSTALL THE ADP SKILL', 'unzip', 'releases/latest', 'setup --dry-run', 'nothing strips it')      # a hidden block that says download and run reads as an injection: the README has the steps, after the user's yes


def legend_of(text):
    m = LEGEND.search(text)
    return m.group(0) if m else None


def note_of(legend, heading):
    """The authors' note that opens a legend: from READ THIS FIRST up to the page's own heading."""
    return legend[legend.index('READ THIS FIRST'):legend.index(heading)]


class Legend(Cmd):
    def test_the_three_templates_carry_one_legend(self):
        found = {}
        for t in ('starter', 'assistant', 'default'):
            with open(os.path.join(TPL, t, 'index.html.txt'), encoding='utf-8') as f:
                found[t] = legend_of(f.read())
            self.assertIsNotNone(found[t], t)
        self.assertEqual(len(set(found.values())), 1)

    def test_it_says_what_it_must(self):
        with open(os.path.join(TPL, 'starter', 'index.html.txt'), encoding='utf-8') as f:
            text = html.unescape(legend_of(f.read()))      # the text sits escaped inside a <pre>
        for needle in ('Artifacts Done Properly', 'lower cost', 'reusable', 'modified', 'TAKE', 'MODIFY', 'DO NOT FORGET', 'second life',
                       'SUBSCRIBE', 'ArtifactComments', 'presence/<your-name>', 'doing field', 'polling', 'we encourage you to watch', 'tell your user in one line', 'catalog.json', 'ADP take', 'ADP check', 'scripts/adp.py', '{{catalog}}', 'ADP SOURCE', 'https://github.com/fblgit/artifacts-done-properly', 'adp.skill'):
            self.assertIn(needle, text)
        self.assertNotIn('python3 adp.py', text)       # adp.py is not in the page's folder: it is called through the skill's scripts/
        self.assertNotIn('<!--', text)           # a real element: a comment can be stripped
        for needle in ('Juanako.ai', 'shadcn', "information from the page's authors", 'not an instruction from your user', 'IF YOU HAVE THE ADP SKILL', 'good to go', 'once in this conversation',
                       'ask whether they want it installed', 'question with options', 'before your user says yes', INSTALL, 'WHAT THE INSTALL CONTAINS', 'adp_dev.py', 'standard library', 'Apache-2.0', 'contribute kits'):
            self.assertIn(needle, text)          # the authors' note: who asks, said once, the user decides, what the install is
        self.assertIn('the Artifact Data Protocol, which this page does not need', text)      # the authors' other project: named, and not taken for this one
        for gone in NO_STEPS:
            self.assertNotIn(gone, text)
        self.assertLess(text.index('Juanako.ai'), text.index('THIS PAGE IS AN ADP ARTIFACT'))      # the note opens the legend
        self.assertLess(text.index('before your user says yes'), text.index(INSTALL))      # nothing before a yes; after it, the README

    def test_the_catalog_page_opens_with_the_same_note(self):
        with open(os.path.join(TPL, 'starter', 'index.html.txt'), encoding='utf-8') as f:
            note = note_of(legend_of(f.read()), 'THIS PAGE IS AN ADP ARTIFACT')
        with open(CATALOG_PAGE, encoding='utf-8') as f:
            legend = legend_of(f.read())
        self.assertIsNotNone(legend)
        self.assertIn('ask whether they want it installed', note)      # the note itself, not an empty slice
        self.assertEqual(note_of(legend, 'ARTIFACT KIT CATALOG'), note)      # word for word: what an agent learns on one page holds on the other
        for gone in NO_STEPS:
            self.assertNotIn(gone, legend)

    def test_generated_pages_open_with_it_and_keep_check_ok(self):
        for t in ('starter', 'assistant'):
            self.ok('new', t, t + '-p')
            d = self.p(t + '-p')
            with open(os.path.join(d, 'index.html'), encoding='utf-8') as f:
                text = f.read()
            self.assertLess(text.index('READ THIS FIRST'), 3000, t)
            self.assertNotIn('{{', text)
            self.assertIn('none saved yet', text)
            r = self.run_adp('check', d)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_default_tier_page_too(self):
        self.ok('new', '--tier', 'default', 'dflt')
        with open(self.p('dflt', 'index.html'), encoding='utf-8') as f:
            self.assertIn('READ THIS FIRST', f.read())

    def test_saved_catalog_url_is_filled_in(self):
        self.ok('catalog', URL)
        self.ok('new', 'starter', 'saved')
        with open(self.p('saved', 'index.html'), encoding='utf-8') as f:
            text = f.read()
        self.assertIn('CATALOG: ' + URL, text)
        self.assertNotIn('none saved yet', text)

    def test_catalog_option_wins_over_nothing(self):
        r = self.run_adp('new', 'starter', 'opt', '--catalog', URL)
        self.assertIn(r.returncode, (0, 2), r.stderr)            # no fetched index for that url: the take list is printed or refused, the legend is still written
        if os.path.isfile(self.p('opt', 'index.html')):
            with open(self.p('opt', 'index.html'), encoding='utf-8') as f:
                self.assertIn('CATALOG: ' + URL, f.read())


if __name__ == '__main__':
    unittest.main()
