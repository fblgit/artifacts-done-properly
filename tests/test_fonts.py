"""Fonts stay homogeneous: the page's own and the kit's stylesheets take every font from the three tokens
(--f-ui, --f-display, --f-mono, and --f-hand for the canvas) or inherit it, and the kit's controls inherit the page font (native buttons and
fields otherwise draw in the system font, which showed as Arial next to the page's own)."""
from pathlib import Path
import glob
import json
import os
import re
import sys
import unittest
from urllib.parse import unquote_plus

ROOT = os.path.join(os.path.dirname(__file__), '..', 'plugins', 'artifacts-done-properly', 'skills', 'adp')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts'))
import adp_lib  # noqa: E402
FILES = sorted(glob.glob(os.path.join(ROOT, 'templates', '*', 'styles', '*.txt'))
               + glob.glob(os.path.join(ROOT, 'catalog', 'kit', '*.css'))
               + glob.glob(os.path.join(ROOT, 'catalog', 'kit', 'patterns', '*.css')))
DECL = re.compile(r'font(-family)?\s*:\s*([^;}]*)')
OK = re.compile(r'var\(--f-(ui|display|mono|hand)\b|\binherit\b')


class Fonts(unittest.TestCase):
    def test_every_font_declaration_takes_a_token_or_inherits(self):
        bad = []
        for p in FILES:
            css = re.sub(r'/\*.*?\*/', '', Path(p).read_text(encoding='utf-8'), flags=re.S)
            for m in DECL.finditer(css):
                v = m.group(2)
                family = bool(m.group(1)) or re.search(r'[A-Za-z"\']{3,}\s*(,|$)', v.split('/')[-1]) or re.search(r'\d(px|rem|em|%)?\s+[A-Za-z"\']', v)
                if family and not OK.search(v) and not re.fullmatch(r'\s*(\d+(\.\d+)?(px|rem|em|%)?(/[\d.]+(px|rem|em)?)?\s*)+\s*', v):
                    bad.append(os.path.relpath(p, ROOT) + ': ' + m.group(0).strip())
        self.assertEqual(bad, [])

    def test_kit_controls_inherit_the_page_font(self):
        css = Path(os.path.join(ROOT, 'catalog', 'kit', 'chrome.css')).read_text(encoding='utf-8')
        for sel in ('.btn {', '.input, .select, .textarea {'):
            rule = css[css.index(sel):].split('}')[0]
            self.assertIn('font-family: inherit', rule, sel)



class TemplateWearsTheTheme(unittest.TestCase):
    """The templates' styles read the theme instead of fixing a look of their own: headings at weights every theme family ships (700; Fredoka,
    Space Grotesk and Familjen Grotesk stop there, so 750 and 800 were synthesized bold) with no variation axes tuned for one family,
    native controls in the page font, and corners, edges, heading case and text size from the theme's feel tokens with the old values as fallbacks."""
    def setUp(self):
        self.page = re.sub(r'/\*.*?\*/', '', Path(os.path.join(ROOT, 'templates', 'starter', 'styles', 'page.css.txt')).read_text(encoding='utf-8'), flags=re.S)
        self.assist = Path(os.path.join(ROOT, 'templates', 'assistant', 'styles', 'assist.css.txt')).read_text(encoding='utf-8')

    def test_headings_stay_within_the_weights_themes_ship(self):
        for sel, body in re.findall(r'(h[1-3])\{([^}]*)\}', self.page):
            with self.subTest(sel=sel):
                self.assertNotIn('font-variation-settings', body)
                for w in re.findall(r'font-weight:(\d+)', body): self.assertLessEqual(int(w), 700)

    def test_native_controls_take_the_page_font(self):
        self.assertIn('button,input,select,textarea{font-family:inherit}', self.page)

    def test_the_feel_tokens_are_read(self):
        for tok in ('var(--radius-lg,14px)', 'var(--edge-w,1px)', 'var(--outline,var(--rule))', 'var(--head-case,none)', 'var(--text-size,15px)', 'var(--leading,1.55)', 'var(--bg-image,none)'):
            with self.subTest(tok=tok): self.assertIn(tok, self.page)
        self.assertEqual(re.findall(r'border-radius:(?:1[246]|20)px', self.assist), [])


THEMES = os.path.join(ROOT, 'catalog', 'kit', 'themes')
FONT_TOKENS = ('--f-display', '--f-ui', '--f-mono', '--f-hand')
GENERIC = re.compile(r'^(ui-|system-ui$|serif$|sans-serif$|monospace$|cursive$)')


def families(url):
    """the family names a Google Fonts css2 url loads"""
    return {unquote_plus(f).split(':')[0] for f in re.findall(r'[?&]family=([^&]+)', url)}


def first_family(v):
    return v.split(',')[0].strip().strip('"\'')


def css_tokens(css):
    """the --f-* values a theme css sets in its plain :root blocks (light, the default), with var(--x) resolved among them"""
    root = ''.join(body for sel, body in re.findall(r'([^{}]*)\{([^{}]*)\}', re.sub(r'/\*.*?\*/', '', css, flags=re.S)) if sel.strip() == ':root')
    toks = dict((k, v.strip()) for k, v in re.findall(r'(--f-[\w-]+)\s*:\s*([^;]+);', root))
    for k, v in toks.items():
        m = re.fullmatch(r'var\((--f-[\w-]+)\)', v)
        if m: toks[k] = toks.get(m.group(1), v)
    return toks


class ThemeFonts(unittest.TestCase):
    """Every theme says which web fonts its --f-* families need (`fonts` in its json and in its catalog entry, the same url), and that url
    loads every family the theme names first; `adp.py new --theme` and `take` read it from the entry (test_eval_fixes.ThemeTags)."""
    def setUp(self):
        self.cat = {e['id']: e for e in json.loads(Path(os.path.join(ROOT, 'catalog', 'catalog.json')).read_text(encoding='utf-8'))['entries']}
        self.themes = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(THEMES, '*.json')))

    def test_every_theme_is_a_catalog_entry_with_its_json_fonts(self):
        self.assertEqual({'theme.' + t for t in self.themes}, {i for i in self.cat if i.startswith('theme.')})      # the files and the catalog name the same themes; no count to keep up
        for t in self.themes:
            with self.subTest(theme=t):
                j = json.loads(Path(os.path.join(THEMES, t + '.json')).read_text(encoding='utf-8'))
                self.assertTrue(j.get('fonts', '').startswith('https://fonts.googleapis.com/css2?'), t)
                self.assertIn('display=swap', j['fonts'])
                self.assertEqual(self.cat['theme.' + t].get('fonts'), j['fonts'])

    def test_the_default_theme_is_the_templates_starting_look(self):
        """theme.default states the look the templates carry: every token their own stylesheets set (page.css on the page, the assistant's canvas.css
        on the Canvas view) has the same value in the theme, light and dark, and the font link is the theme's. So a page that wears it and one with
        no theme file linked look the same. --r is page.css's own shorthand for the theme's corner, not a theme token."""
        norm = lambda v: re.sub(r'\s+', '', v)
        read = lambda t, f: re.sub(r'/\*.*?\*/', '', Path(os.path.join(ROOT, 'templates', t, 'styles', f)).read_text(encoding='utf-8'), flags=re.S)
        j = json.loads(Path(os.path.join(THEMES, 'default.json')).read_text(encoding='utf-8'))
        for css, light, dark in ((read('starter', 'page.css.txt'), ':root{', ':root[data-theme="dark"]{'),
                                 (read('assistant', 'canvas.css.txt'), ':where(:root){', ':where(:root[data-theme="dark"]){')):
            for sel, theme in ((light, j['light']), (dark, j['dark'])):
                have = dict(re.findall(r'(--[\w-]+):([^;}]+)', css.split(sel, 1)[1].split('}', 1)[0]))
                have.pop('--r', None)
                self.assertTrue(have, sel)
                self.assertEqual({k: norm(v) for k, v in have.items()}, {k: norm(theme.get(k, '')) for k in have}, sel)
        for t in ('starter', 'assistant', 'default'):
            self.assertIn('href="%s"' % j['fonts'], Path(os.path.join(ROOT, 'templates', t, 'index.html.txt')).read_text(encoding='utf-8'), t)

    def test_the_fonts_url_loads_every_family_the_theme_names_first(self):
        for t in self.themes:
            j = json.loads(Path(os.path.join(THEMES, t + '.json')).read_text(encoding='utf-8'))
            css = css_tokens(Path(os.path.join(THEMES, t + '.css')).read_text(encoding='utf-8'))
            have = families(j['fonts'])
            for where, toks in (('json light', j['light']), ('json dark', j.get('dark', {})), ('css', css)):
                for k in FONT_TOKENS:
                    stack = [f.strip().strip('"\'') for f in toks.get(k, '').split(',')]
                    if k == '--f-hand' and k in toks and not set(stack) & have:      # a handwriting stack left to the machine on purpose (theme.default: the assistant's canvas): no web font, a generic last
                        with self.subTest(theme=t, where=where, token=k):
                            self.assertTrue(GENERIC.match(stack[-1]), stack)
                        continue
                    if k in toks and not GENERIC.match(first_family(toks[k])):
                        with self.subTest(theme=t, where=where, token=k):
                            self.assertIn(first_family(toks[k]), have)

    def test_the_ui_display_and_mono_families_are_requested_bold(self):
        """pages set headings and labels at 600 to 800, and the kit sets mono ids and labels at 600 to 800 too: a family requested only
        up to 500 or 600 is drawn as synthesized bold (DM Mono stopped at 500 in classic and journal), and a mono left to the system
        stack draws in another face on every machine (adr-drafting-table, notebook)"""
        kit_mono_bold = any(re.search(r'font(?:-weight)?\s*:\s*(?:italic\s+)?[6-9]00\b', body) for p in FILES
                            for body in re.findall(r'\{([^{}]*var\(--f-mono[^{}]*)\}', Path(p).read_text(encoding='utf-8')))
        self.assertTrue(kit_mono_bold)
        for t in self.themes:
            j = json.loads(Path(os.path.join(THEMES, t + '.json')).read_text(encoding='utf-8'))
            req = {unquote_plus(f).split(':')[0]: unquote_plus(f) for f in re.findall(r'[?&]family=([^&]+)', j['fonts'])}
            for k in ('--f-display', '--f-ui', '--f-mono'):
                fam = first_family(j['light'][k])
                with self.subTest(theme=t, family=fam):
                    if GENERIC.match(fam):
                        self.assertNotEqual(k, '--f-mono', t + ' has no mono web font')
                        continue
                    spec = req[fam].partition('@')[2]
                    axes = req[fam].partition(':')[2].partition('@')[0].split(',')
                    ws = [t.split(',')[axes.index('wght')] for t in spec.split(';')] if spec else ['400']
                    self.assertGreaterEqual(max(float(w.split('..')[-1]) for w in ws), 700)

    def test_css_and_json_agree_on_the_font_tokens(self):
        for t in self.themes:
            j = json.loads(Path(os.path.join(THEMES, t + '.json')).read_text(encoding='utf-8'))['light']
            css = css_tokens(Path(os.path.join(THEMES, t + '.css')).read_text(encoding='utf-8'))
            with self.subTest(theme=t):
                if not css:         # a layer over another theme (glaze-depth over glaze) wears that theme's fonts
                    base = [r for r in self.cat['theme.' + t]['requires'] if r.startswith('theme.')]
                    self.assertTrue(base, t + ' sets no --f-* token and requires no theme')
                    self.assertEqual(self.cat[base[0]]['fonts'], self.cat['theme.' + t]['fonts'])
                    continue
                self.assertEqual({k: css[k] for k in FONT_TOKENS if k in css}, {k: j[k] for k in FONT_TOKENS if k in j})

    def test_every_theme_sets_the_one_convention(self):
        """The viewer switches themes at run time, so every theme sets the same names, and the convention has one source: theme.default.
        It sets every custom property a kit entry's header says it reads (@tokens: a trailing ? marks an optional one, and a <placeholder>
        is a family, not a name), and every other theme sets every name it sets: in light, and in dark wherever the default's dark map has it
        (the colours and shadows). A theme may set more; the default sets nothing that is not shared."""
        root = os.path.join(ROOT, 'catalog')
        need = {}
        for path, e in adp_lib.load(root)[1].items():
            tags = dict(adp_lib.parse(adp_lib.comment_of(Path(os.path.join(root, path)).read_text(encoding='utf-8'), path) or '')[2])
            for tok in adp_lib.split(tags.get('tokens', ''), spaces=True):
                if tok.startswith('--') and not tok.endswith('?') and '<' not in tok:
                    need.setdefault(tok, e['id'])
        self.assertGreater(len(need), 20)
        ref = json.loads(Path(os.path.join(THEMES, 'default.json')).read_text(encoding='utf-8'))
        self.assertEqual({k: who for k, who in need.items() if k not in ref['light']}, {}, 'theme.default lacks a token a kit entry requires')
        gaps = {}
        for t in self.themes:
            j = json.loads(Path(os.path.join(THEMES, t + '.json')).read_text(encoding='utf-8'))
            miss = [k for k in ref['light'] if k not in j['light']] + [k + ' (dark)' for k in ref['dark'] if k not in j['dark']]
            if miss:
                gaps[t] = miss
        self.assertEqual(gaps, {}, 'a theme lacks tokens theme.default sets')

    def test_every_theme_file_the_skill_names_exists(self):
        named = set()
        for p in glob.glob(os.path.join(ROOT, '**', '*'), recursive=True):
            if os.path.isfile(p) and p.endswith(('.js', '.json', '.css', '.md', '.txt', '.html')):
                named |= set(re.findall(r'kit/themes/[a-z0-9-]+\.(?:css|json)', Path(p).read_text(encoding='utf-8')))
        self.assertEqual(sorted(n for n in named if not os.path.isfile(os.path.join(ROOT, 'catalog', n))), [])



class CatalogStageFonts(unittest.TestCase):
    """The catalog page's own type (--cat-f-*) stops at the preview stage: a chrome rule that sets a --cat-f font on a bare element
    (h3, code...) under the stage's ancestors would tie or beat a preview's own rule, and the preview would show the catalog's
    font instead of the theme's (warroom's sample heading drew in Bricolage Grotesque, not Barlow Condensed)."""
    ANCESTORS = {'stage-wrap', 'pv-wrap', 'panel', 'sheet', 'shell', 'wrap'}

    def test_no_catalog_font_rule_reaches_into_the_stage(self):
        css = re.sub(r'/\*.*?\*/', '', Path(os.path.join(ROOT, 'catalog', 'styles', 'catalog.css')).read_text(encoding='utf-8'), flags=re.S)
        leaks = []
        for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
            font = ' '.join(re.findall(r'font(?:-family)?\s*:([^;]*)', body))
            if 'var(--cat-f-' not in font or 'var(--f-' in font: continue       # the theme's token first, the catalog's as its fallback, is fine
            for s in (x.strip() for x in sel.split(',')):
                if s in ('body', 'html') or ':not(.stage *)' in s: continue
                *anc, last = s.split()
                bare = re.fullmatch(r'[a-z][a-z0-9]*(\[[^\]]*\])?(:[\w-]+)*', last)
                if bare and (not anc or any(c in self.ANCESTORS for a in anc for c in re.findall(r'\.([\w-]+)', a))):
                    leaks.append(s)
        self.assertEqual(leaks, [])


if __name__ == '__main__':
    unittest.main()
