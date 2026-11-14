#!/usr/bin/env python3
"""What every theme, catalog entry and page declares, reads and hard-codes (stdlib only). Prints one JSON, the same on every run.

  adp_inventory.py [--root DIR]     DIR is the skill directory (default skill): its catalog/ and templates/ are read

The JSON (schema adp-inventory/1); paths are relative to the directory that holds DIR, tokens are CSS custom properties:
  convention    the names theme.default's json sets, light and dark: what every theme must set
  coverage      files (all of catalog/ and templates/) = scanned + theme (the themes' css and json) + the files of unread
                unread      [{file, why, names}] the files there that hold no styles: why is the role an entry lists it under (sample,
                            doc, …), index for catalog.json, else unlisted; names is every -- name in its text (a command's option
                            reads the same)
                outside     [{file, copy_of, names}] the script, style and markup files elsewhere under DIR, not scanned: copy_of is the
                            scanned file with the same bytes, else null
  themes{id}    blocks      each rule of the css: selector, scheme (light, dark-media, dark-attr, other), line, tokens (how many),
                            color-scheme (null when absent), other (declarations that are neither)
                declares    {token: {light, dark}} from the css: light is every :root rule, dark the [data-theme="dark"] rule; dark_via
                            names the tokens with a dark value that a light-only value reads (it changes with them)
                media_differs  tokens whose value in the prefers-color-scheme rule is not the one in the [data-theme="dark"] rule
                uses        {token a value reads through var(): {by: the tokens whose value reads it, declared: the theme sets it}}
                json        the css against the json, light and dark: only_css, only_json, differ (json scale counts as light; a token
                            that follows another through var() or dark_via is compared by the value it ends up with)
                convention  the json against the convention, light and dark: missing, extra
  entries{id}   every other catalog entry: kind (the first part of the id), files (the ones scanned),
                declares    the @tokens tag of its main file: required, optional (a trailing ?), patterns (a <placeholder>); null without
                            the tag
                uses        {token: {n: reads (a var(), or getPropertyValue('--x')), bare: reads with no fallback, in_fallback: reads
                            inside another var()'s fallback, fallbacks: the distinct fallback texts, files: {path: n}}}
                sets        {token: n} custom properties the entry assigns: a declaration, or setProperty('--x', …); removeProperty
                            counts as nothing
                named       {token: n} script strings that are only token names ('--x'): how each is used is not resolved
                dynamic     [{file, line, how, pattern}] a name built at run time, * for the built part; how is read (in var() or
                            getPropertyValue), set (a declaration or setProperty) or name (a string that is only the name; one that
                            ends in -, such as '--f-', is the start of a name)
                colour_strings  [{file, line, value}] script strings that are only a hex or a colour function ('#888'): where each is
                            used is not resolved, so look does not count them
                undeclared  read, but not in the tag (its patterns included) and not set by the entry
                unused      in the tag, but never read or named, and no run-time pattern of the entry matches it (* alone matches all)
                look        the hard-coded look, by class (below); empty classes are left out
  units{id}     the same without declares, for what is not a catalog entry: catalog.page (the files of catalog/ no entry lists) and
                base.<name> (templates/<name>/)
  tokens{name}  themes (css and json, light and dark: the themes that set it; css dark includes dark_via, json is its light and dark
                maps: scale and aliases are not counted), convention (light, dark),
                declared (required, optional: the entries), read {entry or unit: n}, read_in_themes {theme: declarations},
                set {entry or unit: n}, named {entry or unit: n}, dynamic (the run-time names that fit it, each with in: its entry
                or unit; never counted in read; a pattern that fits every name, * or --*, is left with its entry)

What is read. A .css file or <style>: every declaration, comments dropped, a var() inside a css string not read. A .js file: every
string and template literal, joined across + and ${} with * for the part computed at run time; comments and regex literals are dropped;
a string with a tag in it is markup (its reads are those of the whole string), any other is css. An .html file: <style>, <script> and
attribute values; comments and the text between tags are not read. A .txt file is read as the type before .txt. Values are printed with
their spacing made uniform.

look counts each declaration's value as literal (no var() in it), token (the value is one var(): counted under its name) or mixed
(anything else: a var() among other parts, or a part computed at run time):
  radius    border-radius and the four corner longhands
  case      text-transform
  tracking  letter-spacing
  family    font-family, and the part of font after the size (the whole value when font is one word, such as inherit)
  edge      border-width and its longhands, and the width of a border shorthand (border, border-top, border-inline-start, …): the length,
            else a var() written before the style keyword, else none for a shorthand that is only none or hidden; a shorthand with no
            width counts nothing
  shadow    box-shadow
  ring      outline, the whole value (outline-color and outline-offset are not counted)
  colour    literal only, in a property that takes a colour (a custom property, any *color, background, border and outline shorthands,
            shadows, filters, fill, stroke): each hex, each rgb()/hsl()/hwb()/lab()/lch()/oklab()/oklch()/color() with no var() inside,
            and each named or system colour; in markup also fill, stroke, stop-color, flood-color and color attributes. Not counted:
            transparent, currentColor, inherit, a colour in a css string or url(), a mask's #000 (see colour_strings for scripts)
"""
import bisect
import collections
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'skill', 'scripts'))     # python3 -I leaves every directory off the path
import adp_index  # noqa: E402

DEFAULT_ROOT = os.path.join(os.path.dirname(HERE), 'skill')
W = '\x00'                                              # the part of a string computed at run time; printed as *
NAME = re.compile(r'--[A-Za-z0-9_-]*[A-Za-z0-9_]')     # a name does not end in -: '--f-' is the start of one
IN_TEXT = re.compile(r'(?<![\w-])--[A-Za-z]([A-Za-z0-9_-]*[A-Za-z0-9_])?(?![\w<-])')       # a name in prose or data
NAMEW = re.compile(r'--[\w%s-]+' % W)                   # a name that may hold a run-time part
VAR = re.compile(r'(?<![\w-])var\(')
DECL = re.compile(r'\s*([-\w%s]+)\s*:(.*)' % W, re.S)
TAG = re.compile(r'<[A-Za-z][^<>]*>')
ATTR = re.compile(r'([\w:-]+)\s*=\s*("[^"]*"|\'[^\']*\')')
WORD = re.compile(r'[A-Za-z_$][\w$]*|\d[\w.]*')
BEFORE_REGEX = {'return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await'}
OPERAND_ENDS, ARG_ENDS = set('+,;?:=|&<>)]}'), set(',)')
CALLS = {'getPropertyValue': 'read', 'setProperty': 'set', 'removeProperty': None}
CLASSES = ('radius', 'case', 'tracking', 'family', 'edge', 'shadow', 'ring', 'colour')
WHOLE = {'text-transform': 'case', 'letter-spacing': 'tracking', 'font-family': 'family', 'box-shadow': 'shadow', 'outline': 'ring'}
SIDE = r'border(-(top|right|bottom|left|inline|block)(-(start|end))?)?'
RADIUS = re.compile(r'border(-(top|bottom|start|end)-(left|right|start|end))?-radius')
EDGE, BORDER = re.compile(SIDE + '-width'), re.compile(SIDE)
STYLES = {'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'}
MATH = r'(calc|min|max|clamp)\(.*\)'
LENGTH = re.compile(r'[+-]?(\d+\.?\d*|\.\d+)[a-z%]*|thin|medium|thick|' + MATH)
SIZE = re.compile(r'(\d+\.?\d*|\.\d+)([a-z]+|%)|(xx?-)?(small|large)|xxx-large|medium|larger|smaller|' + MATH)
PAINT = {'fill', 'stroke', 'stop-color', 'flood-color', 'color'}
TAKES_COLOUR = re.compile(r'--.*|.*color|background(-image)?|' + SIDE + r'|border-image(-source)?|outline|(box|text)-shadow|fill|stroke|'
                          r'text-decoration|column-rule|(backdrop-)?filter')
FUNC = re.compile(r'(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(', re.I)
HEX = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])')
COLOUR_WORD = re.compile(r'(?<![\w#.-])[A-Za-z]+(?![\w(-])')
NAMED = set('''aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue
chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise
darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod
gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey
lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive
olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext selecteditem
selecteditemtext mark marktext graytext accentcolor accentcolortext'''.split())


def norm(v):
    """A value as it is printed and counted: one space between parts and after a comma, none inside brackets, * for a run-time part."""
    return re.sub(r'\(\s+|\s+(?=\))', lambda m: m.group(0).strip(), re.sub(r'\s*,\s*', ', ', ' '.join(v.replace(W, '*').split())))


def blank(chars, a, b):
    for k in range(a, b):
        if chars[k] != '\n':
            chars[k] = ' '


def skip_string(t, i):
    """The index after the string that opens at t[i] (it ends at the line's end when it never closes)."""
    j, n = i + 1, len(t)
    while j < n and t[j] != t[i] and t[j] != '\n':
        j += 2 if t[j] == '\\' else 1
    return min(j + 1, n)


def css_clean(t):
    """t with its comments blanked: the same length and the same lines."""
    out, i, n = list(t), 0, len(t)
    while i < n:
        if t[i] in '"\'':
            i = skip_string(t, i)
        elif t.startswith('/*', i):
            j = t.find('*/', i + 2)
            j = n if j < 0 else j + 2
            blank(out, i, j)
            i = j
        else:
            i += 1
    return ''.join(out)


def close(t, i):
    """The index of the ) that closes the ( just before t[i]; len(t) when nothing closes it."""
    d, n = 1, len(t)
    while i < n:
        if t[i] in '"\'':
            i = skip_string(t, i)
            continue
        d += (t[i] == '(') - (t[i] == ')')
        if not d:
            return i
        i += 1
    return n


def split_top(v, seps):
    """v cut at every character of seps that is outside brackets and strings."""
    out, d, a, i, n = [], 0, 0, 0, len(v)
    while i < n:
        c = v[i]
        if c in '"\'':
            i = skip_string(v, i)
            continue
        if c in '([':
            d += 1
        elif c in ')]':
            d -= 1
        elif d <= 0 and c in seps:
            out.append(v[a:i])
            a = i + 1
        i += 1
    return out + [v[a:]]


def var_reads(t, off=0, depth=0):
    """[(name, fallback or None, depth, position)] for every var() of t; depth is how many fallbacks it sits inside."""
    out, i = [], 0
    while True:
        m = VAR.search(t, i)
        if not m:
            return out
        j = close(t, m.end())
        inner = t[m.end():j]
        head = split_top(inner, ',')[0]
        fb = inner[len(head) + 1:] if len(head) < len(inner) else None
        out.append((head.strip(), fb if fb is None else norm(fb), depth, off + m.start()))
        if fb:
            out += var_reads(fb, off + m.end() + len(head) + 1, depth + 1)
        i = j + 1


def css_decls(t):
    """[(rules, property, value, position)] for every declaration of t, comments already blanked; rules is the ((prelude, position), …)
    of the rules it sits in, outermost first."""
    out, stack, a, i, d, n = [], [], 0, 0, 0, len(t)

    def decl(b):
        m = DECL.fullmatch(t[a:b])
        if m:
            p = m.group(1)
            out.append((tuple(stack), p if p.startswith('--') else p.lower(), m.group(2).strip(), a + m.start(1)))
    while i < n:
        c = t[i]
        if c in '"\'':
            i = skip_string(t, i)
            continue
        if c == '(':
            d += 1
        elif c == ')':
            d = max(0, d - 1)
        elif d == 0 and c in '{;}':
            if c == '{':
                stack.append((' '.join(t[a:i].split()), i))
            else:
                decl(i)
                if c == '}' and stack:
                    stack.pop()
            a = i + 1
        i += 1
    decl(n)
    return out


def unesc(s):
    """A script string with each escape made harmless, at the same length."""
    return re.sub(r'\\(.)', lambda m: ' ' + (' ' if m.group(1) in 'nrt' else m.group(1)), s, flags=re.S)


def js_lex(t, i=0, inner=False):
    """(tokens, end). A token is [kind, value, position]: s a string (its text), t a template literal (its parts: an s token, or ('x',
    tokens) for a ${}), w a word, p one punctuation character, r a regex literal. Comments are dropped. inner: stop after the } of a ${}."""
    toks, n, d = [], len(t), 0
    while i < n:
        c = t[i]
        if c.isspace():
            i += 1
        elif t.startswith('//', i):
            j = t.find('\n', i)
            i = n if j < 0 else j
        elif t.startswith('/*', i):
            j = t.find('*/', i + 2)
            i = n if j < 0 else j + 2
        elif c in '"\'':
            j = skip_string(t, i)
            toks.append(['s', unesc(t[i + 1:j - 1]), i + 1])
            i = j
        elif c == '`':
            parts, j, a = [], i + 1, i + 1
            while j < n and t[j] != '`':
                if t[j] == '\\':
                    j += 2
                elif t.startswith('${', j):
                    parts.append(['s', unesc(t[a:j]), a])
                    sub, j = js_lex(t, j + 2, True)
                    parts.append(('x', sub))
                    a = j
                else:
                    j += 1
            parts.append(['s', unesc(t[a:j]), a])
            toks.append(['t', parts, i])
            i = j + 1
        elif c == '/' and (not toks or toks[-1][0] == 'p' and toks[-1][1] not in ')]' or toks[-1][0] == 'w' and toks[-1][1] in BEFORE_REGEX):
            j, cls = i + 1, False
            while j < n and t[j] != '\n' and (cls or t[j] != '/'):
                if t[j] == '\\':
                    j += 1
                elif t[j] in '[]':
                    cls = t[j] == '['
                j += 1
            toks.append(['r', '', i])
            i = j + 1
        else:
            m = WORD.match(t, i)
            if m:
                toks.append(['w', m.group(0), i])
                i = m.end()
                continue
            if inner and c == '}' and d == 0:
                return toks, i + 1
            d += (c == '{') - (c == '}')
            toks.append(['p', c, i])
            i += 1
    return toks, n


def operand(toks, i, ends=OPERAND_ENDS):
    """The index where the operand that starts at toks[i] ends: the first character of ends outside brackets."""
    d = 0
    while i < len(toks):
        k, v = toks[i][0], toks[i][1]
        if k == 'p':
            if v in '([{':
                d += 1
            elif d == 0 and v in ends:
                break
            elif v in ')]}':
                d -= 1
        i += 1
    return i


def pieces(tok):
    """A string or template token as ([(text, position)], [the token lists of its ${} parts]); each ${} is (W, position)."""
    if tok[0] == 's':
        return [(tok[1], tok[2])], []
    return [(p[1], p[2]) if p[0] == 's' else (W, tok[2]) for p in tok[1]], [p[1] for p in tok[1] if p[0] == 'x']


def units(toks):
    """Every string of a script as [(text, position), …], joined across + and ${}; the strings inside a run-time part come after it,
    on their own."""
    i, n = 0, len(toks)
    while i < n:
        if toks[i][0] not in 'st':
            i += 1
            continue
        out, subs = pieces(toks[i])
        i += 1
        while i < n and toks[i][:2] == ['p', '+']:
            e = operand(toks, i + 1)
            op = toks[i + 1:e]
            if not op:
                break
            if len(op) == 1 and op[0][0] in 'st':
                a, b = pieces(op[0])
                out, subs = out + a, subs + b
            else:
                out.append((W, op[0][2]))
                subs.append(op)
            i = e
        yield out
        for s in subs:
            yield from units(s)


def colours(prop, v):
    """The literal colours in one value of a property that takes a colour: lower case, no spaces."""
    if not TAKES_COLOUR.fullmatch(prop):
        return []
    v = re.sub(r'"[^"]*"|\'[^\']*\'|url\([^)]*\)', ' ', v)
    out = []
    for m in FUNC.finditer(v):
        s = v[m.start():close(v, m.end()) + 1]
        if 'var(' not in s and '*' not in s:
            out.append(s.replace(' ', '').lower())
    return out + [m.group(0).lower() for m in HEX.finditer(v)] + [w.lower() for w in COLOUR_WORD.findall(v) if w.lower() in NAMED]


def bucket(v):
    """(literal, the value), (token, its name) when the value is one var(), else (mixed, the value)."""
    if 'var(' not in v and '*' not in v:
        return 'literal', v
    if v.startswith('var(') and close(v, 4) == len(v) - 1 and NAME.fullmatch(var_reads(v)[0][0]):
        return 'token', var_reads(v)[0][0]
    return 'mixed', v


def edge_of(c):
    """The width a border shorthand sets, from its parts; None when it sets none."""
    w = [x for x in c if LENGTH.fullmatch(x)]
    if w:
        return w[0]
    if c[0].startswith('var(') and (len(c) == 1 or any(x in STYLES for x in c[1:])):
        return c[0]
    return 'none' if len(c) == 1 and c[0] in ('none', 'hidden') else None


def family_of(c):
    """The family a font shorthand sets, from its parts: what follows the size."""
    for i, x in enumerate(c):
        if SIZE.fullmatch(x.lower()) or len(split_top(x, '/')) > 1:
            return ' '.join(c[i + 1:]) or None
    return c[0] if len(c) == 1 else None


def look(prop, value):
    """[(class, bucket, key)]: what one declaration adds to the look."""
    v = norm(value.replace('!important', ''))
    out = [('colour', 'literal', c) for c in colours(prop, v)]
    if not v or prop.startswith('--'):
        return out
    cls, part = WHOLE.get(prop), v if prop == 'font-family' else v.lower()
    if RADIUS.fullmatch(prop):
        cls = 'radius'
    elif EDGE.fullmatch(prop):
        cls = 'edge'
    elif BORDER.fullmatch(prop):
        cls, part = 'edge', edge_of([x for x in split_top(v.lower(), ' ') if x])
    elif prop == 'font':
        cls, part = 'family', family_of([x for x in split_top(v, ' ') if x])
    if cls and part:
        out.append((cls,) + bucket(part))
    return out


class Unit:
    """What one entry or page reads, sets and hard-codes."""

    def __init__(self):
        self.files, self.uses, self.dynamic, self.strings = [], {}, [], []
        self.sets, self.named = collections.Counter(), collections.Counter()
        self.look = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))

    def read(self, name, fb, depth, path):
        u = self.uses.setdefault(name, {'n': 0, 'bare': 0, 'in_fallback': 0, 'fallbacks': set(), 'files': collections.Counter()})
        u['n'] += 1
        u['bare'] += fb is None
        u['in_fallback'] += depth > 0
        u['files'][path] += 1
        if fb is not None:
            u['fallbacks'].add(fb)

    def built(self, how, name, path, line):
        p = norm(name)
        self.dynamic.append({'file': path, 'line': line, 'how': how, 'pattern': p if '*' in p else p + '*'})

    def text(self, t, path, line, css=False):
        """The var() reads of one piece of text; line(position) is the line in the file. css: a var() inside a css string is text."""
        quoted, i = [], 0
        while css and i < len(t):
            j = skip_string(t, i) if t[i] in '"\'' else i + 1
            quoted += [(i, j)] if j > i + 1 else []
            i = j
        for name, fb, depth, pos in var_reads(t):
            if any(a < pos < b for a, b in quoted):
                continue
            if NAME.fullmatch(name):
                self.read(name, fb, depth, path)
            else:
                self.built('read', name, path, line(pos))

    def css(self, t, path, line, reads=True):
        """A stylesheet or a declaration list: its reads, the custom properties it assigns and its look."""
        t = css_clean(t)
        if reads:
            self.text(t, path, line, True)
        for _rules, prop, value, pos in css_decls(t):
            if NAME.fullmatch(prop):
                self.sets[prop] += 1
            elif prop.startswith('--'):
                self.built('set', prop, path, line(pos))
            for cls, b, key in look(prop, value):
                self.look[cls][b][key] += 1

    def markup(self, t, path, line, whole=False):
        """Markup: <script> as script, <style> as css, each attribute value (style as declarations). whole (a script string, which may
        be a fragment of a tag): the reads are those of the whole text."""
        chars = list(t)
        for m in re.finditer(r'<!--.*?-->', t, re.S):
            blank(chars, *m.span())
        t = ''.join(chars)
        if whole:
            self.text(t, path, line)
        for tag, scan in (('script', lambda s, at: self.script(js_lex(s)[0], path, at)), ('style', lambda s, at: self.css(s, path, at, not whole))):
            for m in re.finditer(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), t, re.S | re.I):
                scan(m.group(1), lambda p, o=m.start(1): line(o + p))
                blank(chars, m.start(1), m.end(1))
            t = ''.join(chars)
        for tag in TAG.finditer(t):
            for a in ATTR.finditer(tag.group(0)):
                v, at = a.group(2)[1:-1], lambda p, o=tag.start() + a.start(2) + 1: line(o + p)
                if a.group(1).lower() == 'style':
                    self.css(v, path, at, not whole)
                    continue
                if not whole:
                    self.text(v, path, at)
                if a.group(1).lower() in PAINT:
                    for c in colours('fill', norm(v)):
                        self.look['colour']['literal'][c] += 1

    def calls(self, toks, path, line):
        """getPropertyValue('--x') is a read and setProperty('--x', …) a set (removeProperty is neither); a name that is not one string
        is built at run time. The strings of a name are counted here and read no further."""
        for i, k in enumerate(toks):
            if k[0] == 't':
                for p in k[1]:
                    if p[0] == 'x':
                        self.calls(p[1], path, line)
            elif k[0] == 'w' and k[1] in CALLS and toks[i + 1:i + 2] and toks[i + 1][1] == '(':
                arg, how = toks[i + 2:operand(toks, i + 2, ARG_ENDS)], CALLS[k[1]]
                parts = [''.join(s for s, _ in pieces(a)[0]) if a[0] in 'st' else W for a in arg if a[:2] != ['p', '+']]
                name = re.sub(W + '+', W, ''.join(parts)).strip()
                if not name.startswith(('--', W)):
                    continue                            # an ordinary property
                if how == 'set' and NAME.fullmatch(name):
                    self.sets[name] += 1
                elif how and NAME.fullmatch(name):
                    self.read(name, None, 0, path)
                elif how:
                    self.built(how, name, path, line(k[2]))
                for a in arg:
                    if a[0] in 'st':
                        a[0] = 'w'

    def script(self, toks, path, line):
        """A script: the property calls, then every string: token names, markup (a tag in it) or css."""
        self.calls(toks, path, line)
        for ps in units(toks):
            text, starts, o = ''.join(p[0] for p in ps), [], 0
            for s, pos in ps:
                starts.append((o, pos))
                o += len(s)

            def at(p, starts=starts):
                a, b = starts[bisect.bisect_right(starts, (p, float('inf'))) - 1]
                return line(b + p - a)
            names = text.replace(',', ' ').split()
            if names and all(NAMEW.fullmatch(x) for x in names):
                for x in names:
                    if NAME.fullmatch(x):
                        self.named[x] += 1
                    else:
                        self.built('name', x, path, at(0))
            elif re.search(r'<[A-Za-z/!]', text):
                self.markup(text, path, at, True)
            else:
                self.css(text, path, at)
                c = norm(text).lower().replace(' ', '')
                if colours('color', c) == [c] and c not in NAMED:
                    self.strings.append({'file': path, 'line': at(0), 'value': c})

    def file(self, base, rel):
        """Scan one file by the type its name carries (a .txt file: the type before .txt). False for a type that holds no styles."""
        kind = kind_of(rel)
        if not kind:
            return False
        t = open(os.path.join(base, rel), encoding='utf-8').read()
        line = line_of(t)
        if kind == '.css':
            self.css(t, rel, line)
        elif kind == '.js':
            self.script(js_lex(t)[0], rel, line)
        else:
            self.markup(t, rel, line)
        self.files.append(rel)
        return True

    def out(self):
        uses = {k: dict(u, fallbacks=sorted(u['fallbacks']), files=dict(u['files'])) for k, u in self.uses.items()}
        return {'files': sorted(self.files), 'uses': uses, 'sets': dict(self.sets), 'named': dict(self.named),
                'dynamic': sorted(self.dynamic, key=lambda d: (d['file'], d['line'], d['how'], d['pattern'])),
                'colour_strings': sorted(self.strings, key=lambda d: (d['file'], d['line'], d['value'])),
                'look': {c: {b: dict(v) for b, v in self.look[c].items()} for c in CLASSES if c in self.look}}


def kind_of(path):
    """The type a file is read as (.css, .js or .html; a .txt file: the type before .txt), None for any other."""
    kind = os.path.splitext(path[:-4] if path.endswith('.txt') else path)[1]
    return kind if kind in ('.css', '.js', '.html') else None


def line_of(t):
    """A function from a position in t to its line."""
    ends = [m.start() for m in re.finditer('\n', t)]
    return lambda p: bisect.bisect_left(ends, p) + 1


def glob(pattern):
    """A name pattern (* for a run-time part, <word> for a placeholder) as a regex."""
    return re.compile(re.sub(r'\\\*|<[^>]*>', r'[\\w-]*', re.escape(pattern)))


def canon(v):
    return re.sub(r'\s*([,()/])\s*', r'\1', norm(v or '')).lower()


def scheme_of(rules):
    sel = rules[-1][0] if rules else ''
    if len(rules) == 1:
        return 'light' if sel == ':root' else 'dark-attr' if re.fullmatch(r':root\[data-theme=["\']?dark["\']?\]', sel) else 'other'
    dark = len(rules) == 2 and re.match(r'@media\b.*prefers-color-scheme\s*:\s*dark', rules[0][0]) and sel.startswith(':root')
    return 'dark-media' if dark else 'other'


def theme(base, css, data, ref):
    """One theme: its css rule by rule, what it declares and reads, the css against the json, the json against the convention ref.
    Returns it with the json as read."""
    t = css_clean(open(os.path.join(base, css), encoding='utf-8').read())
    line, blocks, maps = line_of(t), {}, {'light': {}, 'dark-attr': {}, 'dark-media': {}, 'other': {}}
    for rules, prop, value, pos in css_decls(t):
        at = rules[-1][1] if rules else 0
        b = blocks.setdefault(at, {'selector': ' '.join(r[0] for r in rules), 'scheme': scheme_of(rules), 'line': line(at),
                                   'tokens': 0, 'color-scheme': None, 'other': []})
        if prop.startswith('--'):
            b['tokens'] += 1
            maps[b['scheme']][prop] = norm(value)
        elif prop == 'color-scheme':
            b['color-scheme'] = norm(value)
        else:
            b['other'].append({'property': prop, 'value': norm(value), 'line': line(pos)})
    light, dark = maps['light'], maps['dark-attr']
    reads = {k: sorted({r[0] for v in (light.get(k), dark.get(k)) if v for r in var_reads(v)}) for k in set(light) | set(dark)}

    def via(k, seen=()):
        """The tokens with a dark value that the light-only token k reads, directly or through another light-only token."""
        return sorted({d for r in reads[k] if r in reads and r not in seen for d in ([r] if r in dark else via(r, seen + (k,)))})
    declares = {k: dict({'light': light.get(k), 'dark': dark.get(k)}, **({'dark_via': via(k)} if k not in dark and via(k) else {}))
                for k in reads}
    uses = collections.defaultdict(set)
    for k, names in reads.items():
        for r in names:
            uses[r].add(k)
    j = json.load(open(os.path.join(base, data), encoding='utf-8'))

    def end(m, alt, k, seen=()):
        """The value token k ends up with in map m (alt: the map behind it), following a value that is one var()."""
        v = m.get(k, alt.get(k))
        r = re.fullmatch(r'var\(\s*(--[\w-]+)\s*\)', v or '')
        go = r and r.group(1) not in seen and (r.group(1) in m or r.group(1) in alt)
        return end(m, alt, r.group(1), seen + (k,)) if go else canon(v)
    sides = {}
    for s, cm, calt, jm, jalt in (('light', light, {}, dict(j.get('scale', {}), **j['light']), {}), ('dark', dark, light, j['dark'], j['light'])):
        mine = set(cm) | {k for k in declares if s == 'dark' and 'dark_via' in declares[k]}      # a dark_via token needs no dark value of its own
        sides[s] = {'only_css': sorted(set(cm) - set(jm)), 'only_json': sorted(set(jm) - mine),
                    'differ': sorted(k for k in mine & set(jm) if canon(cm.get(k, calt.get(k))) != canon(jm[k]) and end(cm, calt, k) != end(jm, jalt, k))}
    conv = {s: {'missing': sorted(set(ref[s]) - set(j[s])), 'extra': sorted(set(j[s]) - set(ref[s]))} for s in ('light', 'dark')} if ref else None
    return {'files': {'css': css, 'json': data}, 'blocks': sorted(blocks.values(), key=lambda b: b['line']), 'declares': declares,
            'media_differs': sorted(k for k in set(dark) | set(maps['dark-media']) if dark.get(k) != maps['dark-media'].get(k)),
            'uses': {r: {'by': sorted(by), 'declared': r in reads} for r, by in uses.items()}, 'json': sides, 'convention': conv}, j


def declared(cat, e):
    """What the @tokens tag of the entry's main file declares; None without the tag."""
    main = e.get('main')
    v = adp_index.parse_header(open(os.path.join(cat, main), encoding='utf-8').read(), main).get('tokens') if main else None
    if v is None:
        return None
    d = {'required': [], 'optional': [], 'patterns': []}
    for tok in v:
        d['patterns' if '<' in tok else 'optional' if tok.endswith('?') else 'required'].append(tok.rstrip('?'))
    return {k: sorted(x) for k, x in d.items()}


def inventory(root):
    root = os.path.abspath(root)
    base, cat, tpl = os.path.dirname(root), os.path.join(root, 'catalog'), os.path.join(root, 'templates')

    def rel(*p):
        return os.path.relpath(os.path.join(*p), base).replace(os.sep, '/')

    def paths(e, role=None):
        return [rel(cat, f['path']) for f in e['files'] if role in (None, f['role'])]
    entries = sorted(json.load(open(os.path.join(cat, 'catalog.json'), encoding='utf-8'))['entries'], key=lambda e: e['id'])
    found = sorted(rel(d, f) for top in (cat, tpl) for d, _, fs in os.walk(top) for f in fs)
    themes = [e for e in entries if e['id'].startswith('theme.')]
    themed, listed = {p for e in themes for p in paths(e)}, {p for e in entries for p in paths(e)}
    default = next((e for e in themes if e['id'] == 'theme.default'), None)
    ref = json.load(open(os.path.join(base, paths(default, 'data')[0]), encoding='utf-8')) if default else None
    out = {'schema': 'adp-inventory/1', 'themes': {}, 'entries': {}, 'units': {},
           'convention': {s: sorted(ref[s]) for s in ('light', 'dark')} if ref else None}
    data, scanned = {}, set()
    for e in themes:
        out['themes'][e['id']], data[e['id']] = theme(base, paths(e, 'style')[0], paths(e, 'data')[0], ref)

    def unit(files, extra):
        u = Unit()
        scanned.update(p for p in files if u.file(base, p))
        return dict(extra, **u.out())
    for e in entries:
        if e in themes:
            continue
        d = declared(cat, e)
        x = unit(paths(e), {'kind': e['id'].split('.')[0], 'declares': d})
        known = d['required'] + d['optional'] if d else []
        pats, built = [glob(p) for p in (d['patterns'] if d else [])], [glob(y['pattern']) for y in x['dynamic']]
        x['undeclared'] = sorted(k for k in x['uses'] if k not in known and k not in x['sets'] and not any(p.fullmatch(k) for p in pats))
        x['unused'] = sorted(k for k in known if k not in x['uses'] and k not in x['named'] and not any(p.fullmatch(k) for p in built))
        out['entries'][e['id']] = x
    out['units']['catalog.page'] = unit([p for p in found if p.startswith(rel(cat) + '/') and p not in listed and p != rel(cat, 'catalog.json')], {})
    for name in sorted(os.listdir(tpl)) if os.path.isdir(tpl) else []:
        if os.path.isdir(os.path.join(tpl, name)):
            out['units']['base.' + name] = unit([p for p in found if p.startswith(rel(tpl, name) + '/')], {})
    role, same = collections.defaultdict(set), {}
    for e in entries:
        for f in e['files']:
            role[rel(cat, f['path'])].add(f['role'])
    for p in sorted(scanned):
        same.setdefault(open(os.path.join(base, p), 'rb').read(), p)

    def names(p):
        return sorted({m.group(0) for m in IN_TEXT.finditer(open(os.path.join(base, p), encoding='utf-8', errors='replace').read())})
    unread = [{'file': p, 'why': 'index' if p == rel(cat, 'catalog.json') else '+'.join(sorted(role[p])) if p in role else 'unlisted',
               'names': names(p)} for p in found if p not in scanned and p not in themed]
    beyond = sorted(rel(d, f) for d, _, fs in os.walk(root) for f in fs if kind_of(f) and rel(d, f) not in found)
    outside = [{'file': p, 'copy_of': same.get(open(os.path.join(base, p), 'rb').read()), 'names': names(p)} for p in beyond]
    out['coverage'] = {'files': len(found), 'scanned': len(scanned), 'theme': len(themed), 'unread': unread, 'outside': outside}
    tok = collections.defaultdict(lambda: {'themes': {'css': {'light': [], 'dark': []}, 'json': {'light': [], 'dark': []}},
                                           'convention': {'light': False, 'dark': False}, 'declared': {'required': [], 'optional': []},
                                           'read': {}, 'read_in_themes': {}, 'set': {}, 'named': {}, 'dynamic': []})
    for i, t in out['themes'].items():
        for k, v in t['declares'].items():
            for s in ('light', 'dark'):
                if v[s] is not None or s == 'dark' and 'dark_via' in v:
                    tok[k]['themes']['css'][s].append(i)
        for s in ('light', 'dark'):
            for k in data[i][s]:
                tok[k]['themes']['json'][s].append(i)
            for k in ref[s] if i == 'theme.default' else []:
                tok[k]['convention'][s] = True
        for k, v in t['uses'].items():
            tok[k]['read_in_themes'][i] = len(v['by'])
    for i, x in list(out['entries'].items()) + list(out['units'].items()):
        for s in ('required', 'optional'):
            for k in (x.get('declares') or {}).get(s, []):
                tok[k]['declared'][s].append(i)
        for k, u in x['uses'].items():
            tok[k]['read'][i] = u['n']
        for field, into in (('sets', 'set'), ('named', 'named')):
            for k, n in x[field].items():
                tok[k][into][i] = n
    for i, x in list(out['entries'].items()) + list(out['units'].items()):
        for y in x['dynamic']:
            if y['pattern'].replace('*', '').strip('-'):     # * and --* fit every name: they stay with their entry
                for k in [k for k in tok if glob(y['pattern']).fullmatch(k)]:
                    tok[k]['dynamic'].append(dict(y, **{'in': i}))
    out['tokens'] = dict(tok)
    return out


def main(argv):
    root, a = DEFAULT_ROOT, list(argv)
    while a:
        x = a.pop(0)
        if x == '--root' and a:
            root = a.pop(0)
        else:
            sys.exit(f'unknown option {x}')
    try:
        out = inventory(root)
    except (OSError, ValueError, KeyError) as e:
        print(f'FAIL: {e!r}', file=sys.stderr)
        return 1
    print(json.dumps(out, indent=1, sort_keys=True, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
