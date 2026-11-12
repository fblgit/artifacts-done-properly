"""The code index of a board's records (the board's record reader, fault map, function ruler and Fix check read it).

A record that cites `path:lines` points into a git repo. build() reads that repo and returns the two docs adp.py propose carries in the
proposal, so no step is manual: `codemap/code` and `codemap/trace`.
  code  {rev, tag, files: {cited path: {src, n, syms: [[name, first, last, depth]]}}, unresolved: [paths], over: ["N3 path:900 > 800"]}
        length and outline of every cited file at the audited commit (BASE).
  trace {to, chain: [{c, tag, subject}], merge, records: {"N<n>": [{f, lo, hi, to: [lo, hi], gone, fn, fn_to, v, steps}]},
         files: {path: {n, syms, hunks: [[old_start, old_len, new_start, new_len]]}}}
        every cited range carried one commit at a time from BASE to HEAD with `git diff -U0`; v is lines | function | file | none.
BASE is --code-rev, else the last commit at or before the earliest record's `at` on HEAD's history (the code the records were written against);
HEAD is the repo's HEAD. BASE == HEAD gives code only. No git repo, or no record cites a file git knows: build() returns None.
Pure git reads: nothing here writes to the repo."""
import json, re, subprocess

EXT = r'(?:py|json|js|mjs|md|css|html|sh|toml|ya?ml)'
FILE = re.compile(r'((?:[\w.-]+/)*[\w-][\w.-]*\.' + EXT + r'(?![\w])|Makefile)')
TOK = re.compile(r'(?:(?<=[\s(`])|^)(:\d+(?:-\d+)?)(?=[\s).,;`]|$)|((?:[\w.-]+/)*[\w-][\w.-]*\.' + EXT + r'(?![\w])|Makefile)(?::(\d+(?:-\d+)?(?:,\s?\d+(?:-\d+)?)*))?')
MAX_CHAIN = 8        # commits between BASE and HEAD that are walked one by one; more are thinned (BASE and HEAD always stay)


def git(root, *a):
    try: return subprocess.run(['git', '-C', root, *a], capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, OSError): return None


def toplevel(path):
    out = git(path, 'rev-parse', '--show-toplevel')
    return out.strip() if out else None


def _close(syms, lines):
    for i, s in enumerate(syms):
        nxt = [t for t in syms[i + 1:] if t[3] <= s[3]]
        s[2] = (nxt[0][1] - 1) if nxt else len(lines)
        while s[2] > s[1] and lines[s[2] - 1].strip() == '': s[2] -= 1
    return syms


def outline(path, text):
    """[[name, first line, last line, depth]]: Python def/class (methods as Class.m(), nested as outer › inner(), command branches of main()),
    JS functions and const arrows, markdown headings. Anything else: no outline."""
    lines = text.split('\n'); out = []
    if path.endswith('.py'):
        cls = ''
        for i, l in enumerate(lines, 1):
            m = re.match(r'^(\s*)(def|class)\s+(\w+)', l)
            if m:
                d = len(m.group(1)) // 4
                if m.group(2) == 'class' and d == 0: cls = m.group(3)
                elif d == 0: cls = ''
                name = m.group(3) + ('()' if m.group(2) == 'def' else '')
                if d == 1 and cls: name = cls + '.' + name
                elif d >= 1:
                    par = next((t[0] for t in reversed(out) if t[3] < d), '')
                    if par: name = par.replace('()', '') + ' › ' + name
                out.append([name, i, 0, d]); continue
            m = re.match(r'^    (?:el)?if .*\ba\[0\] == \'([\w-]+)\'', l)
            top = next((s[0] for s in reversed(out) if s[3] == 0), '')
            if m and top == 'main()': out.append(['main › ' + m.group(1), i, 0, 1])
    elif re.search(r'\.m?js$', path):
        for i, l in enumerate(lines, 1):
            m = re.match(r'^(\s*)(?:async\s+)?function\*?\s+(\w+)|^(\s*)(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|\w+\s*=>)', l)
            if m:
                ind = len(m.group(1) if m.group(1) is not None else m.group(3)); name = (m.group(2) or m.group(4)) + '()'
                if ind <= 4: out.append([name, i, 0, ind // 2])
    elif path.endswith('.md'):
        fence = False
        for i, l in enumerate(lines, 1):
            if l.startswith('```'): fence = not fence
            m = None if fence else re.match(r'^(#{1,3})\s+(.+)', l)
            if m: out.append([m.group(2).strip()[:48], i, 0, len(m.group(1)) - 1])
    return _close(out, lines)


def hunks(root, a, b, path):
    """[(old_start, old_len, new_start, new_len)] of path between commits a and b"""
    out = []
    for l in (git(root, 'diff', '-U0', '--no-color', a, b, '--', path) or '').split('\n'):
        m = re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', l)
        if m: out.append((int(m[1]), int(m[2] or 1), int(m[3]), int(m[4] or 1)))
    return out


def touches(H, lo, hi):
    for os_, ol, ns, nl in H:
        if ol == 0:
            if lo <= os_ < hi: return True        # a pure insertion between lines os_ and os_+1, inside the range
        elif os_ <= hi and os_ + ol - 1 >= lo: return True
    return False


def mapline(H, x):
    """old line x -> (new line, deleted?)"""
    d = 0
    for os_, ol, ns, nl in H:
        if ol and os_ <= x < os_ + ol: return ns + min(x - os_, max(nl - 1, 0)), nl == 0 or x - os_ >= nl
        if (ol and x >= os_ + ol) or (not ol and x > os_): d += nl - ol
    return x + d, False


def _count(text): return text.count('\n') + (0 if text.endswith('\n') else 1)


def _resolve(p, tree):
    if p in tree: return p
    hits = [t for t in tree if t.endswith('/' + p)]
    return hits[0] if len(hits) == 1 else None


def cites(body, known):
    """[(path, lo, hi)] the ranges a record's text names; a bare `:123` belongs to the file named before it. Only paths in known."""
    out, last = [], None
    for line in (body or '').split('\n'):
        for m in TOK.finditer(line):
            if m[2]: last = m[2]
            spec = m[3] if m[2] else (m[1][1:] if last else None)
            if not spec or not last or last not in known: continue
            for part in re.split(r',\s?', spec):
                lo, hi = (int(x) for x in (part.split('-') + [part])[:2])
                out.append((last, lo, hi))
    return out


def _base(root, recs, rev):
    if rev: return (git(root, 'rev-parse', '--verify', '--quiet', rev + '^{commit}') or '').strip() or None
    ats = sorted(r['at'] for r in recs if isinstance(r.get('at'), str) and r['at'])
    if not ats: return None
    return (git(root, 'rev-list', '-1', '--first-parent', f'--before={ats[0]}', 'HEAD') or '').strip() or None


def _chain(root, base, head):
    cs = [base] + (git(root, 'rev-list', '--first-parent', '--reverse', f'{base}..{head}') or '').split()
    if cs[-1] != head: cs.append(head)
    if len(cs) > MAX_CHAIN + 1:
        step = (len(cs) - 1) / MAX_CHAIN; cs = [cs[round(i * step)] for i in range(MAX_CHAIN)] + [cs[-1]]
    out = []
    for c in dict.fromkeys(cs):
        tag = (git(root, 'describe', '--tags', '--always', c) or c).strip()
        out.append({'c': c[:7], 'full': c, 'tag': tag, 'subject': (git(root, 'log', '-1', '--format=%s', c) or '').strip()})
    return out


def build(records, repo, rev=None):
    """records: [{n, body, at}] -> {'code': {...}, 'trace': {...} | None} or None. repo: any directory inside the git repo the records cite."""
    root = toplevel(repo) if repo else None
    if not root: return None
    head = (git(root, 'rev-parse', 'HEAD') or '').strip()
    recs = [r for r in records if isinstance(r, dict) and isinstance(r.get('body'), str) and isinstance(r.get('n'), int)]
    base = _base(root, recs, rev) or head
    if not head or not base: return None
    tree = (git(root, 'ls-tree', '-r', '--name-only', '-z', base) or '').split('\0')      # -z: raw names, never git's quoted form
    cited = sorted({m.group(1) for r in recs for m in FILE.finditer(r['body'])})
    files, miss = {}, []
    for p in cited:
        if re.match(r'^(DIR|fix\d)', p): continue
        src = _resolve(p, tree)
        text = git(root, 'show', f'{base}:{src}') if src else None
        if text is None: miss.append(p); continue
        files[p] = {'src': src, 'n': _count(text), 'syms': outline(src, text)}
    if not files: return None
    over = []
    for r in recs:
        for f, lo, hi in cites(r['body'], files):
            if hi > files[f]['n']: over.append(f"N{r['n']} {f}:{lo}-{hi} > {files[f]['n']}")
    code = {'rev': base[:7], 'tag': (git(root, 'describe', '--tags', '--always', base) or base).strip(), 'files': files, 'unresolved': miss, 'over': over}
    if base == head: return {'code': code, 'trace': None}
    chain = _chain(root, base, head); fulls = [c['full'] for c in chain]
    def fn_at(path, lo):
        hit = [s for s in files[path]['syms'] if s[1] <= lo <= s[2]]
        return max(hit, key=lambda s: (s[3], s[1])) if hit else None
    recs_out = {}
    for r in recs:
        res = []
        for f, lo, hi in cites(r['body'], files):
            src = files[f]['src']; fn = fn_at(f, lo); flo, fhi = (fn[1], fn[2]) if fn else (lo, hi)
            steps, clo, chi, cflo, cfhi, gone = [], lo, hi, flo, fhi, False
            for a, b in zip(fulls, fulls[1:]):
                H = hunks(root, a, b, src)
                steps.append({'c': b[:7], 'lines': touches(H, clo, chi), 'fn': touches(H, cflo, cfhi), 'file': bool(H), 'hunks': len(H)})
                (clo, d1), (chi, d2) = mapline(H, clo), mapline(H, chi); cflo, _ = mapline(H, cflo); cfhi, _ = mapline(H, cfhi)
                gone = gone or (d1 and d2)
            v = 'lines' if any(s['lines'] for s in steps) else 'function' if any(s['fn'] for s in steps) else 'file' if any(s['file'] for s in steps) else 'none'
            res.append({'f': f, 'lo': lo, 'hi': hi, 'to': [clo, chi], 'gone': gone, 'fn': fn[0] if fn else '', 'fn_to': [cflo, cfhi] if fn else None, 'v': v, 'steps': steps})
        if res: recs_out['N%d' % r['n']] = res
    tfiles = {}
    for f, v in files.items():
        text = git(root, 'show', f'{head}:{v["src"]}')
        if text is None: continue
        tfiles[f] = {'n': _count(text), 'syms': outline(v['src'], text), 'hunks': hunks(root, base, head, v['src'])}
    trace = {'to': chain[-1]['tag'], 'chain': [{k: c[k] for k in ('c', 'tag', 'subject')} for c in chain], 'merge': '', 'records': recs_out, 'files': tfiles}
    return {'code': code, 'trace': trace}


def docs(records, repo, rev=None, limit=None):
    """the proposal docs: [('codemap', 'code' | 'trace', data)]. limit (bytes): the trace, then the code, is left out when the docs would not fit."""
    b = build(records, repo, rev)
    if not b: return []
    out = [('codemap', 'code', b['code'])] + ([('codemap', 'trace', b['trace'])] if b['trace'] else [])
    while limit and len(json.dumps([d[2] for d in out], ensure_ascii=False, separators=(',', ':')).encode()) > limit and out: out.pop()
    return out
