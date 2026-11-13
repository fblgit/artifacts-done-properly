"""Fonts stay homogeneous: the page's own and the kit's stylesheets take every font from the three tokens
(--f-ui, --f-display, --f-mono, and --f-hand for the canvas) or inherit it, and the kit's controls inherit the page font (native buttons and
fields otherwise draw in the system font, which showed as Arial next to the page's own)."""
import glob
import os
import re
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..', 'skill')
FILES = sorted(glob.glob(os.path.join(ROOT, 'templates', '*', 'styles', '*.txt'))
               + glob.glob(os.path.join(ROOT, 'catalog', 'kit', '*.css'))
               + glob.glob(os.path.join(ROOT, 'catalog', 'kit', 'patterns', '*.css')))
DECL = re.compile(r'font(-family)?\s*:\s*([^;}]*)')
OK = re.compile(r'var\(--f-(ui|display|mono|hand)\b|\binherit\b')


class Fonts(unittest.TestCase):
    def test_every_font_declaration_takes_a_token_or_inherits(self):
        bad = []
        for p in FILES:
            css = re.sub(r'/\*.*?\*/', '', open(p, encoding='utf-8').read(), flags=re.S)
            for m in DECL.finditer(css):
                v = m.group(2)
                family = bool(m.group(1)) or re.search(r'[A-Za-z"\']{3,}\s*(,|$)', v.split('/')[-1]) or re.search(r'\d(px|rem|em|%)?\s+[A-Za-z"\']', v)
                if family and not OK.search(v) and not re.fullmatch(r'\s*(\d+(\.\d+)?(px|rem|em|%)?(/[\d.]+(px|rem|em)?)?\s*)+\s*', v):
                    bad.append(os.path.relpath(p, ROOT) + ': ' + m.group(0).strip())
        self.assertEqual(bad, [])

    def test_kit_controls_inherit_the_page_font(self):
        css = open(os.path.join(ROOT, 'catalog', 'kit', 'chrome.css'), encoding='utf-8').read()
        for sel in ('.btn {', '.input, .select, .textarea {'):
            rule = css[css.index(sel):].split('}')[0]
            self.assertIn('font-family: inherit', rule, sel)


if __name__ == '__main__':
    unittest.main()
