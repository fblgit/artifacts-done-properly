"""Every ADP page carries the info dot: a small green dot at the top left that opens a panel with three tabs, About, Help and Status. It is plain visible
HTML and says what ADP is and how to install it; it tells a model nothing to do. The three templates carry one block that `adp.py new` fills in (the skill's
version, the sha256 of the page's adp.js, the catalog, the components table as built). The catalog page carries its own, with fixed values that these tests keep true."""
import hashlib
import os
import re
import unittest

from test_commands import Cmd, ADP

SKILL = os.path.join(os.path.dirname(ADP), '..')
TPL = os.path.join(SKILL, 'templates')
URL = 'https://claude.ai/artifact/abc123'
PANEL = re.compile(r'<aside id="adp-info".*?</aside>', re.S)
CATALOG_PAGE = os.path.join(SKILL, 'catalog', 'index.html')
INSTALL = 'https://github.com/fblgit/artifacts-done-properly#install'
HINTS = ('READ THIS FIRST', 'adp-readme', 'tell your user', 'ask whether', 'we ask', 'TAKE what', 'MODIFY', 'DO NOT FORGET', 'SUBSCRIBE', 'second life',
         'we encourage', 'Please ', 'before your user says yes')      # a note that asks a model to say or do something is not what this panel is


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def panel_of(text):
    m = PANEL.search(text)
    return m.group(0) if m else None


def sha256_of(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def skill_version():
    return re.search(r'^\s+version:\s*"([^"]+)"', read(os.path.join(SKILL, 'SKILL.md')), re.M).group(1)


def pane(panel, name):
    return re.search(r'<section class="ai-p ai-%s">(.*?)</section>' % name, panel, re.S).group(1)


class Shared:
    """What every panel says, whichever page carries it."""

    def check_panel(self, panel):
        self.assertIsNotNone(panel)
        self.assertNotIn('hidden', panel)            # it is visible: nothing about it is hidden from the page's viewer or from an agent reading the source
        self.assertNotIn('aria-hidden', panel)
        self.assertNotIn('<!--', panel)
        self.assertNotIn('<script', panel)           # no script: a click on the dot and the tabs work as plain HTML
        self.assertIn('<summary aria-label="ADP info: about, help, status">', panel)
        for tab in ('About', 'Help', 'Status'):
            self.assertIn('<label for="ai-t-%s">%s</label>' % (tab.lower(), tab), panel)
        about = pane(panel, 'about')
        for needle in ('Artifacts Done Properly', 'not the Artifact Data Protocol', 'https://github.com/fblgit/artifacts-done-properly', 'Juanako.ai', 'Apache-2.0'):
            self.assertIn(needle, about)
        self.assertIn(INSTALL, pane(panel, 'help'))
        self.assertIn('releases/latest', pane(panel, 'help'))
        for gone in HINTS:
            self.assertNotIn(gone, panel)
        self.assertIn('Runtime', pane(panel, 'status'))


class Panel(Cmd, Shared):
    def test_the_three_templates_carry_one_panel(self):
        found = {}
        for t in ('starter', 'assistant', 'default'):
            found[t] = panel_of(read(os.path.join(TPL, t, 'index.html.txt')))
            self.check_panel(found[t])
        self.assertEqual(len(set(found.values())), 1)

    def test_template_panel_has_its_blanks(self):
        panel = panel_of(read(os.path.join(TPL, 'starter', 'index.html.txt')))
        for blank in ('{{adp_version}}', '{{adp_sha}}', '{{adp_sha12}}', '{{adp_catalog}}', '{{adp_components}}'):
            self.assertIn(blank, panel)
        self.assertNotIn('Clone this artifact', panel)       # a page made from a template is not the catalog: no clone step

    def test_the_catalog_page_carries_its_own(self):
        text = read(CATALOG_PAGE)
        panel = panel_of(text)
        self.check_panel(panel)
        self.assertIn('Artifacts Done Properly %s ' % skill_version(), pane(panel, 'about'))      # the version it names is the skill's
        help_ = pane(panel, 'help')
        self.assertLess(help_.index('Clone this artifact and make it yours.'), help_.index(INSTALL))      # the journey: clone first, then install, then point ADP at the copy
        self.assertLess(help_.index(INSTALL), help_.index('scripts/adp.py catalog'))
        sha = sha256_of(os.path.join(SKILL, 'catalog', 'adp.js'))
        self.assertIn(sha, pane(panel, 'status'))             # the hash it shows is the hash of the runtime the page loads
        self.assertEqual(len(re.findall(r"This artifact's own URL is the catalog URL: \S+$", text, re.M)), 1)      # publish_catalog.py set-url stamps this line
        self.assertNotIn('id="adp-readme"', text)
        self.assertNotIn('READ THIS FIRST', text)

    def test_generated_pages_carry_it_filled_in_and_keep_check_ok(self):
        for t in ('starter', 'assistant'):
            self.ok('new', t, t + '-p')
            d = self.p(t + '-p')
            text = read(os.path.join(d, 'index.html'))
            self.assertNotIn('{{', text)
            self.assertNotIn('READ THIS FIRST', text)
            panel = panel_of(text)
            self.check_panel(panel)
            self.assertIn('Artifacts Done Properly %s ' % skill_version(), pane(panel, 'about'))
            self.assertIn(sha256_of(os.path.join(d, 'adp.js')), pane(panel, 'status'))
            self.assertIn('none saved yet', pane(panel, 'status'))
            r = self.run_adp('check', d)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_default_tier_page_too(self):
        self.ok('new', '--tier', 'default', 'dflt')
        panel = panel_of(read(self.p('dflt', 'index.html')))
        self.check_panel(panel)
        self.assertNotIn('{{', panel)

    def test_saved_catalog_url_is_filled_in(self):
        self.ok('catalog', URL)
        self.ok('new', 'starter', 'saved')
        status = pane(panel_of(read(self.p('saved', 'index.html'))), 'status')
        self.assertIn(URL, status)
        self.assertNotIn('none saved yet', status)

    def test_catalog_option_wins_over_nothing(self):
        r = self.run_adp('new', 'starter', 'opt', '--catalog', URL)
        self.assertIn(r.returncode, (0, 2), r.stderr)            # no fetched index for that url: the take list is printed or refused, the panel is still written
        if os.path.isfile(self.p('opt', 'index.html')):
            self.assertIn(URL, pane(panel_of(read(self.p('opt', 'index.html'))), 'status'))

    def test_a_taken_entry_is_a_row_of_the_components_table(self):
        self.ok('new', 'starter', 'rows')
        status = pane(panel_of(read(self.p('rows', 'index.html'))), 'status')
        rows = re.findall(r'<tr><td>([^<]*)</td><td>([^<]*)</td><td>([^<]*)</td></tr>', status)
        self.assertTrue(rows or 'none taken' in status, status)
        for entry_id, _, _ in rows:
            self.assertRegex(entry_id, r'^[a-z0-9.-]+$')


if __name__ == '__main__':
    unittest.main()
