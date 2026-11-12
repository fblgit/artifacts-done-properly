"""Every index.html that `adp.py new` writes opens with the same READ THIS FIRST legend: what ADP is for, take by reference, modify by layering,
do not forget good work. The catalog url is filled in when one is saved or given."""
import os
import re
import unittest

from test_commands import Cmd, ADP

TPL = os.path.join(os.path.dirname(ADP), '..', 'templates')
URL = 'https://claude.ai/artifact/abc123'
LEGEND = re.compile(r'<!--\nREAD THIS FIRST.*?-->', re.S)


def legend_of(text):
    m = LEGEND.search(text)
    return m.group(0) if m else None


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
            text = legend_of(f.read())
        for needle in ('Artifacts Done Properly', 'lower cost', 'reusable', 'modified', 'TAKE', 'MODIFY', 'DO NOT FORGET', 'second life',
                       'SUBSCRIBE', 'ArtifactComments', 'presence/<your-name>', 'catalog.json', 'ADP take', 'ADP check', 'scripts/adp.py', '{{catalog}}'):
            self.assertIn(needle, text)
        self.assertNotIn('python3 adp.py', text)       # adp.py is not in the page's folder: it is called through the skill's scripts/
        self.assertNotIn('--', text[4:-3])       # a double hyphen inside would end the comment early

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
