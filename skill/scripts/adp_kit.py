#!/usr/bin/env python3
"""ADP kit registry: schema validation, discovery, `kit check`, the Merkle hashes. Stdlib only.
Contracts: the record (schema/registry-item.schema.json), the hash rule (canon, item/category/root), the check report.
Layout: <site>/kit/<name>/registry-item.json is an item. kit check (no name) also runs the conformance rules
(references to the old structure, stories against their declarations, files used, registry shape; see conformance_report)."""
import datetime, glob, hashlib, json, math, os, re, subprocess, sys
from decimal import Decimal

SCHEMA_REL = os.path.join('schema', 'registry-item.schema.json')
RECORD = 'registry-item.json'
RUNTIME_EXCEPTION = ('runtime.adp', 'adp.js')   # the one file allowed outside its folder
GLOBALS = {'htmPreact': 'htm-preact', 'marked': 'marked', 'DOMPurify': 'dompurify'}


# ---------------------------------------------------------------- hashes (contract 2)
NUM_MAX, NUM_MIN = 1e21, 1e-6   # exponent forms are refused: Python prints 1e+16 and 1e-05 where JavaScript prints 10000000000000000 and 0.00001


def num_ok(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and abs(x) < NUM_MAX and (x == 0 or abs(x) >= NUM_MIN)


def num_text(x):
    """A number printed as JavaScript prints it (String(x)): the same text in adp.js canon. Refuses what has no such form."""
    if not num_ok(x): raise ValueError('canon: number out of range (no exponent forms): %r' % (x,))
    if isinstance(x, int) and abs(x) <= 2 ** 53: return str(x)
    x = float(x)                      # JavaScript holds every number as a double: a bigger int is the double it rounds to
    if x == 0: return '0'             # String(-0) is '0'
    s = format(Decimal(repr(x)), 'f')   # repr is the shortest round-trip digits, as String(x) uses; 'f' writes them out with zeros
    return s.rstrip('0').rstrip('.') if '.' in s else s


def _js_order(k):
    """JavaScript's .sort() order: UTF-16 code units (big-endian bytes compare the same), not code points"""
    return k.encode('utf-16-be', 'surrogatepass')


def _canon(v):
    if v is None: return 'null'
    if v is True: return 'true'
    if v is False: return 'false'
    if isinstance(v, (int, float)): return num_text(v)
    if isinstance(v, str): return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)): return '[' + ','.join(_canon(x) for x in v) + ']'
    if isinstance(v, dict): return '{' + ','.join(json.dumps(k, ensure_ascii=False) + ':' + _canon(v[k]) for k in sorted(v, key=_js_order)) + '}'
    raise TypeError('canon: unsupported ' + type(v).__name__)


def canon(obj):
    return _canon(obj)


def sha(text):
    return hashlib.sha256((text if isinstance(text, bytes) else text.encode('utf-8'))).hexdigest()


def item_hash(record, file_hashes):
    rec = {k: v for k, v in record.items() if k != 'hash'}
    return sha(canon(rec) + '\n' + '\n'.join(file_hashes[f['path']] for f in record['files']))


def category_hash(cat, item_hashes):
    c = {k: v for k, v in cat.items() if k != 'hash'}
    return sha(canon(c) + '\n' + '\n'.join(item_hashes[n] for n in sorted(item_hashes)))


def root_hash(self_doc, cat_hashes):
    s = {k: v for k, v in self_doc.items() if k not in ('categories', 'root')}
    return sha(canon(s) + '\n' + '\n'.join(cat_hashes))


# ---------------------------------------------------------------- schema validation (the subset the schema uses)
SCHEMA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'schema')   # the repo's schema/ (load_schema repoints it)
_EXT = {}


def _ext(name):
    """schema/<name>.schema.json, for a reference of the form <name>#/path"""
    if name not in _EXT:
        with open(os.path.join(SCHEMA_DIR, name + '.schema.json'), encoding='utf-8') as f: _EXT[name] = json.load(f)
    return _EXT[name]


DATE_TIME = re.compile(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$')


def schema_file(name):
    """schema/<name>.schema.json parsed (cached by _ext), or None"""
    return _ext(name) if os.path.isfile(os.path.join(SCHEMA_DIR, name + '.schema.json')) else None


def collection_map():
    """{doc-path key: schema file stem}, derived from each schema's title "ADP <path>" (the one source). A <placeholder> segment becomes *, a
    trailing * (the id) is dropped: agents/<agent_name> -> agents; requests/<request_id>/turns/<nnnn> -> requests/*/turns; a literal last
    segment is one doc: checks/latest, requests/export, site/self, ns/shared/board-theme. defs is not a collection."""
    out = {}
    for p in sorted(glob.glob(os.path.join(SCHEMA_DIR, '*.schema.json'))):
        stem = os.path.basename(p)[:-len('.schema.json')]; t = _json(p).get('title', '')
        if stem == 'defs' or not t.startswith('ADP '): continue
        seg = ['*' if x.startswith('<') else x for x in re.sub(r'<[^>]*>(\[[^\]]*\])?', '<>', t[4:]).split('/')]
        if seg[-1] == '*': seg.pop()
        out['/'.join(seg)] = stem
    return out


def collection_key(coll):
    return re.sub(r'^([a-z][a-z0-9_-]*)/[^/]+/([a-z][a-z0-9_-]*)$', r'\1/*/\2', coll)


def collection_schema(coll, doc_id=None):
    """the schema of a doc (entries -> registry-item, site/self -> adp-self, requests/<rid>/turns -> requests-turns, checks/bench ->
    checks-bench): the literal doc path first, then the collection; None = no schema"""
    m = collection_map(); stem = (m.get('%s/%s' % (coll, doc_id)) if doc_id is not None else None) or m.get(collection_key(coll))
    if not stem:    # a doc under a per-viewer path (ns/users/<uid>/page): the key whose * segments match the doc path
        c = coll.split('/'); cands = ([c + [doc_id]] if doc_id is not None else []) + [c]      # the doc path, then its collection (ns/users/*/bench/* types every piece of a draft)
        stem = next((s for cc in cands for k, s in m.items() if '*' in k and len(k.split('/')) == len(cc) and all(a in ('*', b) for a, b in zip(k.split('/'), cc))), None)
    return schema_file(stem) if stem else None


ENVELOPE = ('hash', 'at', 'by')    # an entries/<name> doc is its registry-item record plus these three (adp/tools/build.py:18)
ENVELOPE_SCHEMA = {'type': 'object', 'properties': {'hash': {'$ref': 'defs#/$defs/hash64'}, 'at': {'$ref': 'defs#/$defs/at'}, 'by': {'$ref': 'defs#/$defs/by'}}}


def validate_doc(collection, data, partial=False, doc_id=None):
    """The one doc check: findings of data against its collection's schema ([] = valid, or the collection has no schema). entries/<name> is
    split into record (registry-item schema) and envelope (hash, at, by, typed from defs). partial: an update patch, `required` not demanded."""
    sc = collection_schema(collection, doc_id) if isinstance(data, dict) else None
    if sc is None: return []
    if partial: sc = dict(sc, required=[])
    if collection == 'entries':
        return validate({k: v for k, v in data.items() if k in ENVELOPE}, ENVELOPE_SCHEMA) + validate({k: v for k, v in data.items() if k not in ENVELOPE}, sc)
    return validate(data, sc)


# The one list of JSON Schema keywords validate() enforces; the rest of a schema must be annotation (or x-*), else unsupported_keywords() names it.
ENFORCED = ('type', 'enum', 'const', 'pattern', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'uniqueItems', 'minLength',
            'maxLength', 'minimum', 'oneOf', 'format', '$ref', '$defs')
ANNOTATION = ('$schema', '$id', 'title', 'description', 'deprecated', 'examples')


def unsupported_keywords(schema, path=''):
    """[path.keyword] a schema uses that validate() does not enforce (a decoration that looks like a rule); x-* keys are free annotations"""
    out = []
    if isinstance(schema, dict):
        for k, v in schema.items():
            if k in ('properties', '$defs'):
                for n, x in (v or {}).items(): out += unsupported_keywords(x, '%s.%s.%s' % (path, k, n))
            elif k in ('const', 'enum', 'required', 'examples') or k.startswith('x-'): continue
            elif k in ('items', 'additionalProperties'): out += unsupported_keywords(v, '%s.%s' % (path, k)) if isinstance(v, dict) else []
            elif k == 'oneOf':
                for i, x in enumerate(v): out += unsupported_keywords(x, '%s.oneOf[%d]' % (path, i))
            elif k not in ENFORCED and k not in ANNOTATION: out.append('%s.%s' % (path, k))
    return out


def _resolve(schema, node):
    """(root, node) after following $ref: '#/a/b' inside the current file, 'file#/a/b' into schema/file.schema.json (defs#/$defs/at)"""
    while '$ref' in node:
        f, _, ptr = node['$ref'].partition('#')
        if f: schema = schema_file(f) or sys.exit('adp: $ref to schema/%s.schema.json, which does not exist' % f)
        cur = schema
        for part in [x for x in ptr.split('/') if x]: cur = cur[part]
        node = cur
    return schema, node


def _ref(schema, node):
    return _resolve(schema, node)[1]


def _date_time(v):
    m = DATE_TIME.match(v)
    if not m: return False
    try: datetime.datetime(*map(int, m.groups()))
    except ValueError: return False
    return True


def _type_ok(t, v):
    if isinstance(t, list): return any(_type_ok(x, v) for x in t)
    return {'object': isinstance(v, dict), 'array': isinstance(v, list), 'string': isinstance(v, str),
            'boolean': isinstance(v, bool), 'integer': isinstance(v, int) and not isinstance(v, bool),
            'number': isinstance(v, (int, float)) and not isinstance(v, bool), 'null': v is None}[t]


def validate(value, schema, node=None, path=''):
    """Returns [{'field', 'expected', 'found'}] (empty = valid). Supports type, enum, const, pattern, required, properties,
    additionalProperties (false or a schema), items, minItems, uniqueItems, minLength, minimum, oneOf, format date-time, $ref (also across schema/ files)."""
    schema, node = _resolve(schema, node if node is not None else schema); out = []

    def bad(exp, found=value): out.append({'field': path or '$', 'expected': exp, 'found': found})
    if isinstance(value, (int, float)) and not isinstance(value, bool) and not num_ok(value):
        bad('a decimal number (|x| < 1e21 and not 0 < |x| < 1e-6: no exponent forms)'); return out
    if 'oneOf' in node:
        hits = [n for n in node['oneOf'] if not validate(value, schema, n, path)]
        if len(hits) != 1: bad('exactly one of the %d forms' % len(node['oneOf']), '%d match' % len(hits))
        return out
    if 'type' in node and not _type_ok(node['type'], value): bad(node['type'], type(value).__name__); return out
    if 'const' in node and value != node['const']: bad('const ' + json.dumps(node['const']))
    if 'enum' in node and value not in node['enum']: bad('one of ' + '|'.join(x if isinstance(x, str) else json.dumps(x) for x in node['enum']))
    if isinstance(value, str):
        if 'pattern' in node and not re.search(node['pattern'], value): bad('match ' + node['pattern'])
        if len(value) < node.get('minLength', 0): bad('minLength %d' % node['minLength'])
        if len(value) > node.get('maxLength', len(value)): bad('maxLength %d' % node['maxLength'])
        if node.get('format') == 'date-time' and not _date_time(value): bad('an ISO 8601 date-time (2026-10-31T12:00:00Z or with an offset)')
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value < node.get('minimum', value): bad('minimum %s' % node['minimum'])
    if isinstance(value, list):
        if len(value) < node.get('minItems', 0): bad('at least %d items' % node['minItems'], len(value))
        if node.get('uniqueItems') and len({canon(x) for x in value}) != len(value): bad('unique items')
        for i, x in enumerate(value): out += validate(x, schema, node.get('items', {}), '%s[%d]' % (path, i))
    if isinstance(value, dict):
        for r in node.get('required', []):
            if r not in value: out.append({'field': (path + '.' if path else '') + r, 'expected': 'present', 'found': None})
        props = node.get('properties', {})
        for k, v in value.items():
            p = (path + '.' if path else '') + k
            if k in props: out += validate(v, schema, props[k], p)
            elif node.get('additionalProperties') is False: out.append({'field': p, 'expected': 'a field of the schema', 'found': 'unknown'})
            elif isinstance(node.get('additionalProperties'), dict): out += validate(v, schema, node['additionalProperties'], p)
            else: out += validate(v, schema, {}, p)   # free-form value: still checked for number range
    return out


# typed id (defs name) -> the collection its values name
TARGET = {'project_id': 'projects', 'record_id': 'records', 'thread_id': 'threads', 'request_id': 'requests', 'proposal_id': 'incoming',
          'agent_name': 'agents', 'entry_name': 'entries', 'part_id': 'parts'}


def refs_ok(docs_by_collection):
    """Referential integrity: {collection: {id: doc}} -> [{'doc','field','expected','found'}]. Every value a schema types as a defs id
    (project_id, record_id, thread_id, request_id, proposal_id, agent_name, entry_name, part_id, doc_path) must name a doc that exists in
    the collection it targets; a target collection not in the input is not checked. changes/ is history: only its doc_path is checked."""
    out = []

    def walk(coll, did, v, root, node, path):
        name = None
        if isinstance(node, dict) and '$ref' in node:
            if node['$ref'].startswith('defs#/$defs/'): name = node['$ref'].rsplit('/', 1)[1]
            root, node = _resolve(root, node)
        if not isinstance(node, dict): return
        if name and isinstance(v, str) and (name == 'doc_path' or (name in TARGET and coll != 'changes')):
            tc, ti = v.split('/', 1) if name == 'doc_path' and '/' in v else (TARGET.get(name), v)
            if name == 'doc_path' and tc == 'records' and ti.count('/') == 2 and ti.split('/')[1] in ('sections', 'canvases', 'els'):
                ti = ti.split('/', 1)[0]   # a record's sub-collection doc: its parent record must exist
            if tc in docs_by_collection and ti not in docs_by_collection[tc]:
                out.append({'doc': '%s/%s' % (coll, did), 'field': path, 'expected': 'an existing %s/<id>' % tc, 'found': v})
        if 'oneOf' in node:
            for n in node['oneOf']:
                if not validate(v, root, n): walk(coll, did, v, root, n, path)
        if isinstance(v, list):
            for i, x in enumerate(v): walk(coll, did, x, root, node.get('items', {}), '%s[%d]' % (path, i))
        if isinstance(v, dict):
            for k, x in v.items():
                if k in node.get('properties', {}): walk(coll, did, x, root, node['properties'][k], (path + '.' if path else '') + k)
    for coll, docs in docs_by_collection.items():
        for did, d in docs.items():
            sc = collection_schema(coll, did)
            if sc is not None: walk(coll, did, d, sc, sc, '')
    return out


def _json(p):
    with open(p, encoding='utf-8') as f: return json.load(f)


def load_schema(repo):
    global SCHEMA_DIR; SCHEMA_DIR = os.path.join(repo, 'schema'); _EXT.clear()
    return _json(os.path.join(repo, SCHEMA_REL))


# ---------------------------------------------------------------- discovery
def _balanced(text, i):
    """text[i] == '{': return the index of the matching '}' (strings and comments skipped crudely)."""
    depth = 0; n = len(text); j = i
    while j < n:
        c = text[j]
        if c in '\'"`':
            q = c; j += 1
            while j < n and text[j] != q:
                j += 2 if text[j] == '\\' else 1
        elif text.startswith('//', j): j = text.find('\n', j); j = n if j < 0 else j
        elif text.startswith('/*', j): j = text.find('*/', j); j = n if j < 0 else j + 1
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return j
        j += 1
    return n - 1


def _keys(body):
    """Top-level keys of an object literal body: `a: x`, shorthand `a,`, methods `a(...) {`."""
    out, depth, i, n, start = [], 0, 0, len(body), 0
    chunks = []
    while i < n:
        c = body[i]
        if c in '\'"`':
            q = c; i += 1
            while i < n and body[i] != q: i += 2 if body[i] == '\\' else 1
        elif body.startswith('//', i): i = body.find('\n', i); i = n if i < 0 else i
        elif body.startswith('/*', i): i = body.find('*/', i); i = n if i < 0 else i + 1
        elif c in '{[(': depth += 1
        elif c in '}])': depth -= 1
        elif c == ',' and depth == 0: chunks.append(body[start:i]); start = i + 1
        i += 1
    chunks.append(body[start:])
    for ch in chunks:
        ch = re.sub(r'/\*.*?\*/|//[^\n]*', '', ch, flags=re.S).strip()
        m = re.match(r'(?:(?:async|get|set|static)\s+)?([A-Za-z_$][\w$]*)\s*(?::|\(|$)', ch)
        if m: out.append(m.group(1))
    return out


_RE_BEFORE = set('(,=:[!&|?{};+-*%<>~^') | {''}


def strip_js(text):
    """The code of a script with comments removed and string / template / regex literal contents emptied ('' stays as '', `${expr}` code is kept).
    Discovery of globals and exports reads this, so a word in a message or a comment is not code."""
    out, i, n = [], 0, len(text)
    last = ''   # last significant char, to tell a regex literal from a division

    def tmpl(i):
        out.append('`')
        while i < n and text[i] != '`':
            if text[i] == '\\': i += 2; continue
            if text.startswith('${', i):
                out.append('${')
                inner = strip_js(text[i + 2:_tmpl_end(text, i + 2)])
                out.append(inner + '}'); i = _tmpl_end(text, i + 2) + 1; continue
            i += 1
        out.append('`')
        return i + 1
    while i < n:
        c = text[i]
        if text.startswith('//', i): j = text.find('\n', i); i = n if j < 0 else j; continue
        if text.startswith('/*', i): j = text.find('*/', i); i = n if j < 0 else j + 2; out.append(' '); continue
        if c in '\'"':
            q = c; i += 1
            j = i
            while i < n and text[i] != q and text[i] != '\n': i += 2 if text[i] == '\\' else 1
            body = text[j:i]; i += 1
            # `Kit['status-pill']` names an export (a kebab slug is no identifier): keep the key
            keep = re.fullmatch(r'[\w-]+', body) and text[i:i + 1] == ']' and re.search(r'\bKit\s*\[\s*$', ''.join(out[-12:]))
            out.append(q + (body if keep else '') + q); last = q; continue
        if c == '`': i = tmpl(i + 1); last = '`'; continue
        if c == '/' and (last in _RE_BEFORE or re.search(r'(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw)\s*$', ''.join(out[-12:]))):
            j = i + 1; cls = False
            while j < n and text[j] != '\n':
                if text[j] == '\\': j += 2; continue
                if text[j] == '[': cls = True
                elif text[j] == ']': cls = False
                elif text[j] == '/' and not cls: break
                j += 1
            if j < n and text[j] == '/':
                j += 1
                while j < n and (text[j].isalpha()): j += 1
                out.append('/r/'); i = j; last = ')'; continue
        out.append(c)
        if not c.isspace(): last = c
        i += 1
    return ''.join(out)


def _tmpl_end(text, i):
    """Index of the `}` that closes a `${` whose body starts at i (strings, nested templates skipped)."""
    depth = 1; n = len(text)
    while i < n:
        c = text[i]
        if c in '\'"':
            q = c; i += 1
            while i < n and text[i] != q: i += 2 if text[i] == '\\' else 1
        elif c == '`':
            i += 1
            while i < n and text[i] != '`':
                if text.startswith('${', i): i = _tmpl_end(text, i + 2)
                i += 2 if text[i] == '\\' else 1
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if not depth: return i
        i += 1
    return n - 1


def discover_exports(text):
    """Names assigned on window.Kit: Kit.x.Y = ..., alias.Y = ... (alias = Kit.x = ...), Kit.x = {..} / Object.freeze({..}) / Object.assign(Kit.x, {..}),
    getters (`get Y() {}` in such an object) and Object.defineProperty(Kit.x, 'Y', ...). Comments and string contents are not code."""
    raw = text; text = re.sub(r'\bKit\s*\[\s*([\'"])([\w-]+)\1\s*\]', r'Kit.\2', strip_js(text))   # Kit['x-y'] reads as Kit.x-y
    ex = set(); alias = {}
    for m in re.finditer(r'(?:\b(\w+)\s*=\s*)?\bKit\.([\w-]+)\s*=\s*(?!=)', text):
        if m.group(1): alias[m.group(1)] = m.group(2)
        ns = m.group(2); rest = text[m.end():m.end() + 200]
        b = re.match(r'(?:Object\.freeze\(\s*)?(?:\w+\s*\|\|\s*)?(?:Kit\.\w+\s*\|\|\s*)?(\{)', rest)
        if b:
            i = m.end() + b.start(1); ex.add('Kit.' + ns)
            for k in _keys(text[i + 1:_balanced(text, i)]): ex.add('Kit.%s.%s' % (ns, k))
        else: ex.add('Kit.' + ns)
    for m in re.finditer(r'Object\.assign\(\s*(?:Kit\.([\w-]+)|(\w+))\s*,\s*\{', text):
        ns = m.group(1) or alias.get(m.group(2))
        if ns:
            i = m.end() - 1
            for k in _keys(text[i + 1:_balanced(text, i)]): ex.add('Kit.%s.%s' % (ns, k))
    for m in re.finditer(r'\bKit\.([\w-]+)\.([A-Za-z_$][\w$]*)\s*=\s*(?!=)', text): ex.add('Kit.%s.%s' % m.groups())
    for a, ns in alias.items():
        for m in re.finditer(r'(?<![\w.$])%s\.([A-Za-z_$][\w$]*)\s*=\s*(?!=)' % re.escape(a), text): ex.add('Kit.%s.%s' % (ns, m.group(1)))
    for m in re.finditer(r'Object\.defineProperty\(\s*(?:Kit\.([\w-]+)|(\w+))\s*,\s*[\'"]([A-Za-z_$][\w$]*)[\'"]', raw):
        ns = m.group(1) or alias.get(m.group(2))
        if ns: ex.add('Kit.%s.%s' % (ns, m.group(3)))
    return ex


def discover_adp_exports(text):
    """Names on window.ADP (the runtime): `window.ADP = Object.freeze({a, b: x, get c() {}})` or `ADP.x = ...`."""
    text = strip_js(text); ex = set()
    for m in re.finditer(r'\bwindow\.ADP\s*=\s*(?:Object\.freeze\(\s*)?(\{)', text):
        i = m.start(1); ex.add('ADP')
        for k in _keys(text[i + 1:_balanced(text, i)]): ex.add('ADP.' + k)
    for m in re.finditer(r'\b(?:window\.)?ADP\.([A-Za-z_$][\w$]*)\s*=\s*(?!=)', text): ex.add('ADP.' + m.group(1))
    return ex


def discover_tokens(text):
    return set(re.findall(r'var\(\s*(--[\w-]+)', text))


def discover_defined(text):
    return set(re.findall(r'(?<![\w-])(--[\w-]+)\s*:', text))


def discover_globals(text):
    t = strip_js(text)
    return {v for k, v in GLOBALS.items() if re.search(r'(?<![\w$.])%s\b|window\.%s\b' % (k, k), t)}


# ---------------------------------------------------------------- discovery of items on disk
def folders(site):
    kit = os.path.join(site, 'kit')
    if not os.path.isdir(kit): return []
    return sorted(d for d in os.listdir(kit) if os.path.isfile(os.path.join(kit, d, RECORD)))


def _read(site, rel):
    p = os.path.join(site, rel)
    if not os.path.isfile(p): return None
    with open(p, encoding='utf-8') as f: return f.read()


def load_item(site, name):
    return _json(os.path.join(site, 'kit', name, RECORD))


def tree(site, repo=None, self_doc=None):
    """{'items': {name: {record, files: {path: hex}, hash}}, 'cats': {category: {name: hash}}, 'categories': {category: hash}, 'root'}.
    `self_doc` (site/self, categories[{name,title}]) is needed for category and root hashes; without it those are None."""
    repo = repo or os.path.dirname(os.path.dirname(os.path.abspath(site)))
    items = {}
    for n in folders(site):
        rec = load_item(site, n); fh = {}
        for f in rec.get('files', []):
            t = _read(site, f['path'])
            if t is not None: fh[f['path']] = sha(t)
        ok = all(f['path'] in fh for f in rec.get('files', []))
        items[n] = {'record': rec, 'files': fh, 'hash': item_hash(rec, fh) if ok else None}
    cats = {}
    for n, it in items.items():
        if it['hash']: cats.setdefault((it['record'].get('categories') or [''])[0], {})[n] = it['hash']
    out = {'items': items, 'cats': cats, 'categories': None, 'root': None}
    if self_doc:
        ch = {c['name']: category_hash({k: v for k, v in c.items() if k != 'hash'}, cats.get(c['name'], {})) for c in self_doc.get('categories', [])}
        out['categories'] = ch; out['root'] = root_hash(self_doc, [ch[c['name']] for c in self_doc.get('categories', [])])
    return out


# ---------------------------------------------------------------- kit check (contract 3)
def _theme_tokens(site, theme):
    for rel in ('kit/theme.%s/%s.json' % (theme, theme), 'kit/themes/%s.json' % theme):
        t = _read(site, rel)
        if t:
            d = json.loads(t); return set(d.get('light', {})) | set(d.get('dark', {}))
    return None


def _item_fields(site, repo, name, schema, registry, ctx=None, warnings=None):
    """Field disagreements of one item folder."""
    F = []
    def add(field, expected, found=None, rule=None):
        if any(x['field'] == field and (rule or '').endswith('export-undeclared') for x in F): return
        F.append({'field': field, 'expected': expected, 'found': found, **({'rule': rule} if rule else {})})
    try: rec = load_item(site, name)
    except Exception as e: return [{'field': RECORD, 'expected': 'valid JSON', 'found': str(e)[:80]}]
    for f in validate(rec, schema): F.append(f)
    for r in rec.get('reads', []) if isinstance(rec.get('reads'), list) else []:
        if not isinstance(r, str) or not os.path.isfile(os.path.join(repo, 'schema', r + '.schema.json')): add('reads', 'a schema id: schema/<id>.schema.json exists', r)
    ctx = ctx or Ctx(site, repo)
    if rec.get('name') != name: add('name', name, rec.get('name'))
    scripts, own, texts = [], set(), {}
    for f in rec.get('files', []):
        if not isinstance(f, dict) or 'path' not in f: continue
        p = f['path']; own_dir = 'kit/%s/' % name
        if not p.startswith(own_dir) and (name, p) != RUNTIME_EXCEPTION: add('files.' + p, 'path under ' + own_dir, p)
        t = _read(site, p)
        if t is None: add('files.' + p, 'file exists', 'missing'); continue
        texts[p] = t; ty = f.get('type')
        ext = os.path.splitext(p)[1]
        if ty == 'kit:script' and ext != '.js': add('files.' + p, '.js for kit:script', ext)
        if ty == 'kit:style' and ext != '.css': add('files.' + p, '.css for kit:style', ext)
        if ty == 'kit:script' and name != RUNTIME_EXCEPTION[0]:
            head = t.split('(function', 1)[0] if '(function' in t else t[:t.find('\n') if '\n' in t else None]
            if re.search(r'/\*|//|Needs from the board:', re.sub(r"^\s*(?:'use strict'|\"use strict\");?", '', head)): add('files.' + p, 'no header comment before the code', 'header comment')
            scripts.append(p)
        if ty == 'kit:style' and re.match(r'\s*/\*', t): add('files.' + p, 'no header comment', 'header comment')
        if registry and 'files' in registry:
            want = registry['files'].get(p)
            if want and want != sha(t): add('files.%s.sha256' % p, sha(t), want)
    exports = set()
    for p in scripts: exports |= discover_exports(texts[p])
    if name == RUNTIME_EXCEPTION[0]:
        for p in [f['path'] for f in rec.get('files', []) if isinstance(f, dict) and f.get('type') == 'kit:script' and 'path' in f]: exports |= discover_adp_exports(texts.get(p, ''))
    mods = {e['name'] for m in rec.get('modules', []) if isinstance(m, dict) for e in m.get('exports', []) if isinstance(e, dict) and 'name' in e}
    for e in sorted(mods - exports):
        if e.startswith('ADP') and name != RUNTIME_EXCEPTION[0]: add('modules.exports.' + e, 'window.ADP exports belong to runtime.adp only', e, 'registry.adp-export')
        elif scripts or e.startswith('ADP'): add('modules.exports.' + e, 'assigned on %s in %s' % ('window.ADP' if e.startswith('ADP') else 'window.Kit', ', '.join(scripts) or 'a script'), 'not found')
    for e in sorted(mods):
        if e.startswith('ADP') and name != RUNTIME_EXCEPTION[0] and e in exports: add('modules.exports.' + e, 'window.ADP exports belong to runtime.adp only', e, 'registry.adp-export')
    dep_exports = set()
    for d in rec.get('registryDependencies', []) if isinstance(rec.get('registryDependencies'), list) else []:
        if os.path.isfile(os.path.join(site, 'kit', d, RECORD)):
            try:
                for f in load_item(site, d).get('files', []):
                    if f.get('type') == 'kit:script': dep_exports |= discover_exports(_read(site, f['path']) or '')
            except Exception: pass
    for i, s in enumerate(rec.get('stories', []) if isinstance(rec.get('stories'), list) else []):
        if not isinstance(s, dict): continue
        ex = s.get('export')
        if ex and ex not in exports | mods | dep_exports and not any(x.startswith(ex + '.') for x in exports | dep_exports):
            add('stories[%d].export' % i, 'one of the exports of this item or of a registryDependency', ex)
        for t in (s.get('parameters') or {}).get('themes', []):
            if _theme_tokens(site, t) is None and os.path.isdir(os.path.join(site, 'kit')): add('stories[%d].parameters.themes' % i, 'a theme item', t)
    code = {p: t for p, t in texts.items() if p.endswith(('.js', '.css'))}
    used = set(); defined = set()
    for t in code.values(): used |= discover_tokens(t); defined |= discover_defined(t)
    used -= defined
    decl = set((rec.get('meta') or {}).get('tokens', [])) if isinstance(rec.get('meta'), dict) else set()
    if code and used != decl: add('meta.tokens', sorted(used), sorted(decl))
    themes = {t for s in rec.get('stories', []) if isinstance(s, dict) for t in (s.get('parameters') or {}).get('themes', [])}
    for t in sorted(themes):
        tk = _theme_tokens(site, t)
        if tk is not None and decl - tk - defined: add('meta.tokens@' + t, 'defined by theme ' + t, sorted(decl - tk))
    dg = set(rec.get('dependencies', [])) if isinstance(rec.get('dependencies'), list) else set()
    found = set()
    for p in scripts: found |= discover_globals(texts[p])
    if scripts and found != dg: add('dependencies', sorted(found), sorted(dg))
    if registry and 'entries' in registry and registry['entries'].get(name):
        fh = {p: sha(t) for p, t in texts.items()}
        if all(f['path'] in fh for f in rec.get('files', [])):
            calc = item_hash(rec, fh)
            if calc != registry['entries'][name]: add('hash', calc, registry['entries'][name])
    conform_item(ctx, name, rec, add, lambda f, e, fnd: warnings.append({'name': name, 'field': f, 'expected': e, 'found': fnd}) if warnings is not None else None)
    return F


def _cycles(graph):
    state, out = {}, []
    def go(n, stack):
        state[n] = 1
        for m in graph.get(n, []):
            if state.get(m) == 1: out.append(stack[stack.index(m):] + [m] if m in stack else [n, m])
            elif m in graph and state.get(m) is None: go(m, stack + [m])
        state[n] = 2
    for n in graph:
        if n not in state: go(n, [n])
    return out


def check(site, name=None, registry=None, repo=None, conformance=True):
    """check_(...) with K.SCHEMA_DIR restored afterwards: load_schema repoints it at the checked repo, and that must not leak to the next caller."""
    global SCHEMA_DIR
    keep = SCHEMA_DIR
    try: return _check(site, name, registry, repo, conformance)
    finally: SCHEMA_DIR = keep; _EXT.clear()


def _check(site, name=None, registry=None, repo=None, conformance=True):
    """The report: summary, items (each with every failing field and its rule), unresolved, warnings, and - for the whole kit (no name) -
    `registry` (folders, orphan files, shared files) and `repo` (references to the old structure in tracked text) findings."""
    repo = repo or os.path.dirname(os.path.dirname(os.path.abspath(site)))
    _REF_CACHE.clear()
    schema = load_schema(repo); have = folders(site)
    names = [name] if name else sorted(have)
    items, unresolved, warnings = [], [], []
    ctx = Ctx(site, repo)
    for n in names:
        if n in have:
            F = _item_fields(site, repo, n, schema, registry, ctx, warnings)
            items.append({'name': n, 'state': 'failing' if F else 'declared', 'fields': F})
        else: items.append({'name': n, 'state': 'failing', 'fields': [{'field': 'name', 'expected': 'a folder kit/%s/%s' % (n, RECORD), 'found': 'none'}]})
    reg, repo_f = [], []
    if not name:
        graph, by = {}, {}
        for n in have:
            try: deps = load_item(site, n).get('registryDependencies', [])
            except Exception: deps = []
            graph[n] = deps if isinstance(deps, list) else []
            for d in graph[n]: by.setdefault(d, []).append(n)
        for d in sorted(by):
            if d not in have: unresolved.append({'name': d, 'named_by': sorted(by[d])})
        for cyc in _cycles(graph):
            it = next(x for x in items if x['name'] == cyc[0]); it['state'] = 'failing'
            it['fields'].append({'field': 'registryDependencies', 'expected': 'no cycle', 'found': ' -> '.join(cyc)})
        if conformance:
            reg = registry_findings(site, ctx); repo_f = scan_repo(repo) + legacy_files(repo)
    root = None
    if registry and registry.get('self'):
        try: root = tree(site, repo, registry['self'])['root']
        except Exception: root = None
    s = {'declared': sum(i['state'] == 'declared' for i in items), 'failing': sum(i['state'] == 'failing' for i in items),
         'root': root}
    return {'summary': s, 'items': items, 'unresolved': unresolved, 'registry': reg, 'repo': repo_f, 'warnings': warnings}


def check_exit(report):
    return 1 if report['summary']['failing'] or report['unresolved'] or report.get('registry') or report.get('repo') else 0


# ---------------------------------------------------------------- conformance: types, signatures, stories (the stage calling convention, out/S4.md)
TONES = ['ok', 'warn', 'danger', 'info', 'neutral', 'accent']
DOM_TYPES = {'Element', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'File', 'Blob', 'DocumentFragment', 'SVGElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLCanvasElement'}
STAGE_TYPES = {'Element', 'HTMLElement', 'Node'}   # a parameter of one of these types receives the stage element


def _split_top(text, seps):
    """Split text at top-level separator characters (outside (), [], {}, <> and quotes; `=>` is not a bracket)."""
    out, depth, start, i, n = [], 0, 0, 0, len(text)
    while i < n:
        c = text[i]
        if c in '\'"`':
            q = c; i += 1
            while i < n and text[i] != q: i += 2 if text[i] == '\\' else 1
        elif c in '([{<': depth += 1
        elif c in ')]}' or (c == '>' and text[i - 1:i] != '='): depth -= 1
        elif c in seps and depth == 0: out.append(text[start:i]); start = i + 1
        i += 1
    out.append(text[start:])
    return [x.strip() for x in out if x.strip()]


def _has_top(text, token):
    depth = 0; i = 0; n = len(text)
    while i < n:
        c = text[i]
        if c in '\'"`':
            q = c; i += 1
            while i < n and text[i] != q: i += 2 if text[i] == '\\' else 1
        elif c in '([{<': depth += 1
        elif c in ')]}' or (c == '>' and text[i - 1:i] != '='): depth -= 1
        elif depth == 0 and text.startswith(token, i): return True
        i += 1
    return False


def parse_fields(text):
    """`{a: string, b?: number, [k: string]: any, onX?: (x) => void}` -> ({name: (type, optional)}, has_index) or None when it is not an object type."""
    t = text.strip()
    if not (t.startswith('{') and t.endswith('}')): return None
    fields, index = {}, None
    for piece in _split_top(t[1:-1], ',;'):
        m = re.match(r'(?:readonly\s+)?\[\s*[\w$]+\s*:\s*[^\]]+\]\s*:\s*(.+)$', piece, re.S)
        if m: index = m.group(1).strip(); continue
        m = re.match(r'(?:readonly\s+)?([\w$]+|\'[^\']*\'|"[^"]*")(\?)?\s*:\s*(.+)$', piece, re.S)
        if m: fields[m.group(1).strip('\'"')] = (m.group(3).strip(), bool(m.group(2))); continue
        m = re.match(r'([\w$]+)(\?)?\s*\(.*\)\s*(?::\s*.+)?$', piece, re.S)
        if m: fields[m.group(1)] = ('() => any', bool(m.group(2))); continue
        return None
    return fields, index


def is_fn_type(t):
    t = t.strip()
    return _has_top(t, '=>') or t in ('Function', 'function')


def type_ok(t, v, path='value', out=None):
    """Does the JSON value v plausibly fit the TypeScript-ish type text t? Returns a list of mismatches [(path, expected, found)] (empty = fits or unknown)."""
    out = [] if out is None else out
    t = t.strip()
    while t.startswith('(') and t.endswith(')') and not _has_top(t, '=>') and len(_split_top(t, '|')) == 1: t = t[1:-1].strip()
    alts = _split_top(t, '|')
    if len(alts) > 1:
        for a in alts:
            if not type_ok(a, v, path, []): return out
        out.append((path, t, _show(v))); return out
    if t == '': return out
    if is_fn_type(t):
        if not (isinstance(v, dict) and set(v) == {'$ref'} and isinstance(v['$ref'], str)): out.append((path, 'a function: {"$ref": "Kit.ns.X"}', _show(v)))
        return out
    lit = re.fullmatch(r'\'([^\']*)\'|"([^"]*)"', t)
    if lit: ok = v == (lit.group(1) if lit.group(1) is not None else lit.group(2))
    elif re.fullmatch(r'-?\d+(\.\d+)?', t): ok = isinstance(v, (int, float)) and not isinstance(v, bool) and v == float(t)
    elif t in ('true', 'false'): ok = v is (t == 'true')
    elif t == 'string': ok = isinstance(v, str)
    elif t == 'number': ok = isinstance(v, (int, float)) and not isinstance(v, bool)
    elif t == 'boolean': ok = isinstance(v, bool)
    elif t == 'null': ok = v is None
    elif t == 'undefined' or t == 'void': ok = False
    elif t in ('any', 'unknown'): ok = True
    elif t == 'Tone': ok = v in TONES
    elif t in ('object', 'Object'): ok = isinstance(v, dict)
    elif t in DOM_TYPES: ok = False; out.append((path, t + ' (a DOM object cannot be a story arg)', _show(v))); return out
    elif t.endswith('[]') or re.match(r'(?:readonly\s+)?(?:Array|ReadonlyArray)<', t):
        inner = t[:-2] if t.endswith('[]') else t[t.index('<') + 1:t.rindex('>')]
        if inner.startswith('readonly '): inner = inner[9:]
        if not isinstance(v, list): out.append((path, t, _show(v))); return out
        for i, x in enumerate(v): type_ok(inner, x, '%s[%d]' % (path, i), out)
        return out
    elif t.startswith('[') and t.endswith(']'):
        parts = _split_top(t[1:-1], ',')
        if not isinstance(v, list): out.append((path, t, _show(v))); return out
        for i, (pt, x) in enumerate(zip(parts, v)): type_ok(re.sub(r'^[\w$]+\??\s*:\s*', '', pt), x, '%s[%d]' % (path, i), out)
        return out
    elif t.startswith('{'):
        pf = parse_fields(t)
        if not isinstance(v, dict): out.append((path, 'object', _show(v))); return out
        if pf is None: return out
        fields, index = pf
        for k, x in v.items():
            if k in fields: type_ok(fields[k][0], x, path + '.' + k, out)
            elif index is not None: type_ok(index, x, path + '.' + k, out)
            else: pass   # an object type names what the code reads; extra keys inside a nested value are data, not props
        for k, (ft, opt) in fields.items():
            if not opt and k not in v and not is_fn_type(ft) and 'undefined' not in ft: out.append((path + '.' + k, 'present (required)', 'missing'))
        return out
    elif re.match(r'(?:Record|Map)<', t):
        parts = _split_top(t[t.index('<') + 1:t.rindex('>')], ',')
        if not isinstance(v, dict): out.append((path, t, _show(v))); return out
        if len(parts) == 2:
            for k, x in v.items(): type_ok(parts[1], x, path + '.' + k, out)
        return out
    else: return out   # an alias or a library type: unknown, taken as plausible
    if not ok: out.append((path, t, _show(v)))
    return out


def _show(v):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return s if len(s) <= 60 else s[:57] + '...'


def signature(rec, export, closure_recs):
    """The props a story may give an export, from its declaration, by the stage calling convention.
    -> {'open': bool, 'props': {name: type}, 'required': set, 'index': type|None, 'found': bool, 'why': str}"""
    for r in [rec] + closure_recs:
        for m in r.get('modules', []) if isinstance(r.get('modules'), list) else []:
            for e in m.get('exports', []) or []:
                if e.get('name') != export: continue
                dn = (e.get('declaration') or {}).get('name') or export.rsplit('.', 1)[-1]
                for d in m.get('declarations', []) or []:
                    if d.get('name') == dn:
                        return _sig_of(d)
                return {'found': False, 'why': 'export %s names declaration %s, which the module does not declare' % (export, dn)}
    return {'found': False, 'why': 'no modules[].exports entry named ' + export}


def _sig_of(d):
    ps = d.get('parameters', [])
    props, required, index, open_, why = {}, set(), None, False, ''
    if len(ps) == 1 and ps[0].get('name') == 'props':
        txt = (ps[0].get('type') or {}).get('text', '')
        pf = parse_fields(txt)
        if pf is None: return {'found': True, 'open': True, 'props': {}, 'required': set(), 'index': None, 'bad': 'props type text is not an object type' if txt else ''}
        props = {k: v[0] for k, v in pf[0].items()}; required = {k for k, v in pf[0].items() if not v[1]}; index = pf[1]
        return {'found': True, 'open': False, 'props': props, 'required': required, 'index': index, 'bad': ''}
    bad = ''
    for p in ps:
        txt = (p.get('type') or {}).get('text', '')
        if txt in STAGE_TYPES or re.fullmatch(r'HTML\w*Element|SVG\w*Element', txt or ''): continue
        pf = parse_fields(txt) if txt.startswith('{') and txt.endswith('}') else None
        if pf is not None:
            props.update({k: v[0] for k, v in pf[0].items()}); required |= {k for k, v in pf[0].items() if not v[1]}
            if pf[1] is not None: index = pf[1]
        elif txt.startswith('{') and txt.endswith('}'): bad = 'type text of parameter %s is not a parsable object type' % p.get('name')
        else:
            props[p['name']] = txt
            if not p.get('optional') and 'default' not in p and 'undefined' not in txt and not is_fn_type(txt): required.add(p['name'])
    return {'found': True, 'open': False, 'props': props, 'required': required, 'index': index, 'bad': bad}


def walk_stage(v, path=''):
    """Every {"$stage": true} in a JSON value -> [(path, True)]."""
    if isinstance(v, dict):
        if v == {'$stage': True}: return [(path or '$', True)]
        return [y for k, x in v.items() for y in walk_stage(x, path + '.' + k if path else k)]
    if isinstance(v, list): return [y for i, x in enumerate(v) for y in walk_stage(x, '%s[%d]' % (path, i))]
    return []


def walk_refs(v, path=''):
    """Every {"$ref": X} in a JSON value -> [(path, X)]."""
    out = []
    if isinstance(v, dict):
        if '$ref' in v: out.append((path or '$', v['$ref']))
        for k, x in v.items():
            if k != '$ref': out += walk_refs(x, path + '.' + k if path else k)
    elif isinstance(v, list):
        for i, x in enumerate(v): out += walk_refs(x, '%s[%d]' % (path, i))
    return out


# ---------------------------------------------------------------- conformance: the item context and the per-item rules
class Ctx:
    """What the rules need about the whole kit: every record, every script's discovered exports and stripped code, dependency closures."""
    def __init__(self, site, repo):
        self.site, self.repo = site, repo; self.rec, self.bad, self._text, self._strip, self._ex = {}, {}, {}, {}, {}
        for n in folders(site):
            try: self.rec[n] = load_item(site, n)
            except Exception as e: self.bad[n] = str(e)[:80]
        self._decl, self._by_path = {}, {}
        for n, r in self.rec.items():
            for f in r.get('files', []) if isinstance(r.get('files'), list) else []:
                if isinstance(f, dict) and 'path' in f: self._by_path.setdefault(f['path'], []).append(n)

    def text(self, p):
        if p not in self._text: self._text[p] = _read(self.site, p)
        return self._text[p]

    def code(self, p):
        if p not in self._strip:
            t = self.text(p); self._strip[p] = strip_js(t) if t is not None and p.endswith('.js') else (t or '')
        return self._strip[p]

    def scripts(self, n):
        return [f['path'] for f in self.rec.get(n, {}).get('files', []) if isinstance(f, dict) and f.get('type') == 'kit:script' and 'path' in f]

    def declared(self, n):
        """Names in modules[].exports of item n."""
        if n not in self._decl:
            r = self.rec.get(n, {})
            self._decl[n] = {e['name'] for m in r.get('modules', []) if isinstance(m, dict) for e in m.get('exports', []) or [] if isinstance(e, dict) and 'name' in e}
        return self._decl[n]

    def closure(self, n):
        seen, todo = [], list(self.rec.get(n, {}).get('registryDependencies', []) or [])
        while todo:
            d = todo.pop(0)
            if d in seen or d == n or d not in self.rec: continue
            seen.append(d); todo += self.rec[d].get('registryDependencies', []) or []
        return seen

    def all_scripts_text(self, names):
        return '\n'.join(self.code(p) for n in names for p in self.scripts(n))


DOC_PATH = re.compile(r'(?<![\w:/.-])(?:kit/[\w.\-/]+|[\w.-]+/[\w.-]+\.(?:js|css|json|md|html|txt|py)\b)')
STOP = set('a an the of for and or to in on with by from at as is are it its this that one each your you'.split())


def _words(t): return [w for w in re.findall(r'[a-z0-9]+', t.lower()) if w not in STOP]


def conform_item(ctx, name, rec, add, warn):
    """The conformance rules of one record: stories against their declarations, play, refs, files used, docs, keywords, description."""
    if not isinstance(rec, dict): return
    clos = ctx.closure(name); crecs = [ctx.rec[d] for d in clos]
    own_declared = ctx.declared(name); clos_declared = set(own_declared)
    stories = rec.get('stories') if isinstance(rec.get('stories'), list) else []
    # parameters.uses: items a story feeds (a drawing item for data an export returns); loaded by the stage, not dependencies, so no cycle
    uses = []
    for i, s in enumerate(stories):
        u = (s.get('parameters') or {}).get('uses', []) if isinstance(s, dict) and isinstance(s.get('parameters'), dict) else []
        for x in u:
            if x not in ctx.rec: add('stories[%d].parameters.uses' % i, 'an item of the catalog', x, 'story.uses')
            elif x != name and x not in uses: uses += [x] + [y for y in ctx.closure(x) if y not in uses]
    # a uses item the item's own code calls is a real dependency hiding from the cycle rule: it must be a registryDependency
    own_text = ctx.all_scripts_text([name])
    for u in uses:
        if u in clos: continue
        hit = sorted(x for x in ctx.declared(u) if re.search(r'(?<![\w$])%s\b' % re.escape(x), own_text))
        if hit: add('stories.parameters.uses', 'only items the stories feed; the code of %s calls %s, so it is a registryDependency' % (name, ', '.join(hit[:3])), u, 'story.uses-is-dependency')
    for d in clos + uses: clos_declared |= ctx.declared(d)
    code_names = [name] + clos + [u for u in uses if u not in clos]
    files = [f for f in rec.get('files', []) if isinstance(f, dict) and 'path' in f] if isinstance(rec.get('files'), list) else []
    if not rec.get('keywords'): add('keywords', 'a non-empty list', rec.get('keywords'), 'item.keywords')
    docs = rec.get('docs')
    if isinstance(docs, str):
        d2 = re.sub(r'https?://\S+', '', docs); hits = DOC_PATH.findall(d2)
        base = [os.path.basename(f['path']) for f in files if os.path.basename(f['path']) != RECORD]
        hits += [b for b in base if re.search(r'(?<![\w.-])%s(?![\w-])' % re.escape(b), d2)]
        if hits: add('docs', 'prose that names no file path', sorted(set(hits))[:4], 'item.docs-path')
    desc, title = rec.get('description') or '', rec.get('title') or ''
    dw, tw = _words(desc), set(_words(title)) | set(_words(re.sub(r'[.-]', ' ', name.split('.', 1)[-1])))
    if isinstance(desc, str) and dw and (set(dw) <= tw or (len(set(dw) & tw) / len(set(dw)) >= 0.8 and len(dw) <= 6)): warn('description', 'says more than the title and the name', desc)
    # story rules
    for i, s in enumerate(stories):
        if not isinstance(s, dict): continue
        ex = s.get('export'); pre = 'stories[%d]' % i
        args = s.get('args') if isinstance(s.get('args'), dict) else {}
        if ex and ex in clos_declared:
            sig = signature(rec, ex, crecs)
            if not sig['found']: add(pre + '.export', 'an export with a declaration (modules[].declarations) so the stage can call it', sig['why'], 'story.no-declaration')
            elif sig.get('bad'): add(pre + '.export', 'a parsable type.text', sig['bad'], 'story.type-unparsable')
            elif not sig['open']:
                for k in args:
                    if k not in sig['props'] and sig['index'] is None: add('%s.args.%s' % (pre, k), 'a declared prop of ' + ex + ': ' + ', '.join(sorted(sig['props'])) , 'unknown', 'story.unknown-prop')
                for k in sorted(sig['required']):
                    if k not in args and not (k.startswith('on') and is_fn_type(sig['props'][k])): add('%s.args.%s' % (pre, k), 'present (a required prop of ' + ex + ')', 'missing', 'story.missing-prop')
                for k, v in args.items():
                    t = sig['props'].get(k, sig['index'])
                    if t is None: continue
                    for pth, exp, found in type_ok(t, v, '%s.args.%s' % (pre, k)): add(pth, exp, found, 'story.type')
            elif sig['open'] and args and not sig['props']:
                add(pre + '.args', 'props typed by the declaration (an object type) so the keys can be checked', sorted(args), 'story.props-untyped')
        elif ex and ex not in clos_declared and not any(x.startswith(ex + '.') for x in clos_declared):
            add(pre + '.export', 'a declared export (modules[].exports) of this item or of a registryDependency', ex, 'story.export-undeclared')
        for pth, ref in walk_refs(args, pre + '.args') + walk_refs(s.get('play', []), pre + '.play'):
            if ref not in clos_declared: add(pth, 'a $ref naming a declared export of this item or a registryDependency', ref, 'story.ref')
        cl = (s.get('parameters') or {}).get('cleanup') if isinstance(s.get('parameters'), dict) else None
        if cl is not None and cl not in clos_declared: add(pre + '.parameters.cleanup', 'a declared export of this item or a registryDependency', cl, 'story.cleanup')
        if any(pth.startswith(pre + '.args') for pth, _ in walk_stage(args, pre + '.args')): add(pre + '.args', 'no {"$stage": true} outside play', '$stage', 'story.stage')
        play = s.get('play')
        if play is not None:
            if not isinstance(play, list): add(pre + '.play', 'array', type(play).__name__, 'story.play')
            else:
                mtext = ctx.all_scripts_text(code_names)
                for j, st in enumerate(play):
                    if not isinstance(st, dict): continue
                    c = st.get('call')
                    if c is None: continue
                    pp = '%s.play[%d].call' % (pre, j)
                    if c.startswith('$.'):
                        mem = c.split('.')[1]
                        if not re.search(r'(?<![\w$])%s\b' % re.escape(mem), mtext): add(pp, '$.member named in the code of this item or its dependencies', c, 'story.play-call')
                    elif c.startswith('Kit.'):
                        if c not in clos_declared: add(pp, 'a declared export of this item or a registryDependency', c, 'story.play-call')
                    else: add(pp, '$.member or Kit.ns.X', c, 'story.play-call')
                    if not isinstance(st.get('args', []), list): add(pp + '.args', 'array', type(st['args']).__name__, 'story.play')
    # files used
    scripts = [f['path'] for f in files if f.get('type') == 'kit:script']
    mods = {m.get('path'): m for m in rec.get('modules', []) if isinstance(m, dict)} if isinstance(rec.get('modules'), list) else {}
    story_exports = {s.get('export') for s in stories if isinstance(s, dict)}
    for f in files:
        p, ty = f['path'], f.get('type'); text = ctx.text(p)
        if text is None or p == 'adp.js' or p.endswith('/' + RECORD): continue
        if ty == 'kit:script':
            m = mods.get(p); ex = [e.get('name') for e in (m or {}).get('exports', []) or [] if isinstance(e, dict)]
            if not ex: add('files.' + p, 'a script that exports something declared (modules[].exports)', 'no declared export', 'file.unused-script')
        elif ty == 'kit:style':
            cls = set(re.findall(r'\.(-?[A-Za-z_][\w-]*)', re.sub(r'/\*.*?\*/|\{[^{}]*\}|"[^"]*"|\'[^\']*\'', lambda m_: '{}' if m_.group(0).startswith('{') else '', text, flags=re.S)))
            blob = '\n'.join(ctx.text(q) or '' for n2 in code_names for q in ctx.scripts(n2)) + json.dumps(stories)
            blob = re.sub(r'\s+', ' ', blob)
            if cls and not any(c in blob for c in cls) and not any(c.rsplit('-', 1)[0] + '-' in blob for c in cls if '-' in c):
                add('files.' + p, 'a style whose classes a script of this item or its dependencies (or a story) uses', 'no class used', 'file.unused-style')
            elif not cls and not discover_defined(text) and not discover_tokens(text): add('files.' + p, 'a style that defines something', 'empty', 'file.unused-style')
        elif ty == 'kit:data':
            base = os.path.basename(p); stem = os.path.splitext(base)[0]
            theme_json = rec.get('type') == 'kit:theme' and name.startswith('theme.') and base == name.split('.', 1)[1] + '.json'   # read by kit check and the stage through the theme name
            if not theme_json and not _referenced(ctx, p, base, name): add('files.' + p, 'a data file some code reads (its name appears in a script, template or tool)', 'no reader', 'file.unused-data')
    # a file that exists only to serve stories: a script, after the first, whose exports nothing but this item's stories reach
    if len(scripts) > 1:
        others_text = '\n'.join(ctx.code(q) for n2 in ctx.rec for q in ctx.scripts(n2) if q not in scripts[1:])
        for p in scripts[1:]:
            m = mods.get(p); ex = [e.get('name') for e in (m or {}).get('exports', []) or [] if isinstance(e, dict)]
            if ex and any(e in story_exports for e in ex) and not any(re.search(r'(?<![\w$])(?:Kit\.)?%s\b' % re.escape('.'.join(e.split('.')[1:])), others_text) for e in ex) \
               and not any(re.search(r'(?<![\w$])(?:Kit\.)?%s\b' % re.escape('.'.join(e.split('.')[1:])), ctx.code(q)) for q in scripts[1:] if q != p):
                add('files.' + p, 'a file the component or another item uses, not one that only serves stories', 'only stories reach ' + ', '.join(e for e in ex if e in story_exports), 'file.story-only')
    # a theme item's style is loaded by a story that names the theme
    if rec.get('type') == 'kit:theme' and any(f.get('type') in ('kit:theme', 'kit:style') for f in files):
        tid = name.split('.', 1)[1]
        if not any(tid in ((s.get('parameters') or {}).get('themes') or []) for s in stories if isinstance(s, dict)):
            add('stories', 'a story under the theme ' + tid + ' (parameters.themes) so its style is loaded', 'none', 'file.unused-style')


_REF_CACHE = {}


def _repo_corpus(ctx):
    key = (ctx.site, ctx.repo)
    if key not in _REF_CACHE:
        texts = {}
        for rel in tracked_text(ctx.repo):
            if rel.endswith('/' + RECORD) or '/kit/' in '/' + rel and rel.endswith('.json') and rel.count('/') >= 4: continue
            if os.path.splitext(rel)[1] in ('.js', '.py', '.html', '.mjs') or rel == 'Makefile':   # code reads data; prose and records do not
                try: texts[rel] = open(os.path.join(ctx.repo, rel), encoding='utf-8').read()
                except Exception: pass
        _REF_CACHE[key] = texts
    return _REF_CACHE[key]


def _referenced(ctx, path, base, owner):
    """Is a data file read? Its basename or site path appears in a script (any item), in the page, a tool, a template or a test; its own record does not count."""
    for rel, t in _repo_corpus(ctx).items():
        if rel.replace('\\', '/').endswith('/' + path) or rel == path or rel == 'skills/artifact-dataplane/scripts/adp_kit.py': continue
        if base in t or path in t: return True
    for n, r in ctx.rec.items():
        for q in ctx.scripts(n):
            if q != path and base in (ctx.text(q) or ''): return True
    return False


# ---------------------------------------------------------------- conformance: the old structure, anywhere in tracked text
TEXT_EXT = ('.py', '.js', '.mjs', '.html', '.css', '.md', '.json', '.txt', '.yml', '.yaml', '.toml', '.cff', '.sh', '.adp', '.txt', '.cfg')
SKIP_DIRS = {'.git', 'node_modules', 'dist', '__pycache__', '.claude', '.claude-plugin'}
HISTORY = ('CHANGELOG.md',)   # old names are allowed only here and in docs/proposal-*.md
GENERATED = ('adp/site/adp.json', 'adp/site/seed.json', 'adp/site/content.js', 'adp/tools/out/', 'adp/site/seed/')   # written by build.py / seed.py from what is scanned
# sync.py copies these from skills/ into the site: the source is scanned, the copy is not (make check keeps them equal)
SYNCED = ('adp/site/adp.js',)


def _scaffold(repo, rel):
    """True under a page adp.py new wrote (its kit/all.json marks it): a copy of the kit, not a source."""
    parts = rel.split('/')
    return any(os.path.isfile(os.path.join(repo, *parts[:i], 'kit', 'all.json')) for i in range(len(parts)))


def tracked_text(repo):
    """Relative paths of the repository's text files: git's tracked and not-ignored files that exist, else a walk; pages adp.py new wrote are skipped."""
    try:
        r = subprocess.run(['git', '-C', repo, 'ls-files', '-co', '--exclude-standard'], capture_output=True, text=True, timeout=60)
        if r.returncode == 0 and r.stdout.strip():
            out = [x for x in r.stdout.split('\n') if x and os.path.isfile(os.path.join(repo, x)) and x.split('/')[0] not in SKIP_DIRS and not _scaffold(repo, x)]
            return sorted(x for x in out if x.endswith(TEXT_EXT) or os.path.basename(x) in ('Makefile', 'LICENSE', 'NOTICE'))
    except Exception: pass
    out = []
    for dp, dn, fs in os.walk(repo):
        dn[:] = [d for d in dn if d not in SKIP_DIRS and not os.path.isfile(os.path.join(dp, d, 'kit', 'all.json'))]
        for f in fs:
            rel = os.path.relpath(os.path.join(dp, f), repo).replace(os.sep, '/')
            if rel.endswith(TEXT_EXT) or f in ('Makefile',): out.append(rel)
    return sorted(out)


def _j(*a): return ''.join(a)


# the patterns are built from pieces so this file does not match itself
OLD = [
    ('old.entries-batch', re.compile(_j('entries', r'-b\d+'))),
    ('old.entries-rows', re.compile(_j(r'entries[\w-]*\.js', 'on'))),
    ('old.details', re.compile(_j(r'(?<![\w/-])det', r'ails(?:-[\w]+)?\.js', 'on'))),
    ('old.previews-file', re.compile(_j(r'preview', r's(?:-[\w]+)?\.js\b'))),
    ('old.previews-global', re.compile(_j('Catalog', 'Previews'))),
    ('old.preview-fn', re.compile(_j(r'\bP\[[\'"]'))),
    ('old.preview-render', re.compile(_j(r'preview\.', r'(?:render|samples|uses)\b'))),
    ('old.kit-dir', re.compile(_j(r'(?<![\w.-])kit/(?:templates|guides|skills|patterns|viz|themes|layout|samples)/'))),
]
LEGACY_CODE = ('.py', '.js', '.mjs', '.html')
FIELD = [   # legacy entry fields read by live code: the row's `requires`, `globals`, `summary`, `group`
    ('old.field-requires', re.compile(_j(r'(?:\.requires\b|[\'"]requires[\'"]|\brequires\s*:)'))),
    ('old.field-globals', re.compile(_j(r'(?:\.globals\b|[\'"]globals[\'"]|\bglobals\s*:)'))),
    ('old.field-summary', re.compile(_j(r'(?:\b(?:e|en|ent|entry|x|it|item|row|r|d|v)\.summary\b|[\'"]summary[\'"]\s*:)'))),
    ('old.field-group', re.compile(_j(r'(?:\b(?:e|en|ent|entry|x|it|item|row|r|d|v)\.group\b|[\'"]group[\'"]\s*:|\bgroup\s*:)'))),
]
KITPATH = re.compile(r'(?<![\w.$-])kit/([A-Za-z0-9_.\-/]+)')
PATH_FIXTURE = ('tests/kitfix.py', 'tests/test_kit_check.py', 'tests/test_registry_schema.py', 'tests/test_merkle.py', 'tests/test_conformance.py', 'tests/test_apply.py', 'tests/test_settle.py', 'tests/test_suggest_kit.py', 'tests/fixtures/')


RULE_FILES = ('skills/artifact-dataplane/scripts/adp_kit.py', 'tests/test_conformance.py', 'tests/kitfix.py', 'tests/test_kit_check.py', 'tests/test_entries.py', 'tests/test_site.py')   # they define or exercise the rules, so they must name what the rules refuse


def _allowed(rel):
    return rel in HISTORY or rel in RULE_FILES or (rel.startswith('docs/proposal-') and rel.endswith('.md'))


def _kit_path_exists(repo, rest, text_before, text_after=''):
    """Does `kit/<rest>` name something that exists (under the site, or under the repo)?"""
    rest = rest.rstrip('/')
    if not rest or rest.endswith('-') or '..' in rest: return True
    if rest == 'all.json': return True   # the packed kit adp.py new writes into a scaffold, not a repo file
    if text_after[:1] in ('{', '<', '*', '$'): return True   # a template path: the placeholder follows what the scan read
    for base in (os.path.join(repo, 'adp', 'site', 'kit'), os.path.join(repo, 'kit')):
        if os.path.exists(os.path.join(base, rest)): return True
    return False


def scan_repo(repo):
    """Findings [{rule, file, line, found}] for references to the old structure in tracked text (CHANGELOG and docs/proposal-*.md exempt)."""
    out = []
    for rel in tracked_text(repo):
        if _allowed(rel) or rel.startswith(GENERATED) or rel in SYNCED: continue
        if rel.startswith('adp/site/kit/') and (rel.split('/')[3].startswith(('template.', 'guide.'))) and not rel.endswith('registry-item.json'): continue   # copies sync.py writes from skills/
        try: text = open(os.path.join(repo, rel), encoding='utf-8').read()
        except Exception: continue
        ext = os.path.splitext(rel)[1]
        for ln, line in enumerate(text.split('\n'), 1):
            for rule, rx in OLD:
                m = rx.search(line)
                if m and not (rel.startswith('tests/fixtures/') and rule == 'old.preview-fn'): out.append({'rule': rule, 'file': rel, 'line': ln, 'found': line.strip()[:120]})
            if ext in LEGACY_CODE and not rel.startswith('adp/site/kit/') and rel not in ('skills/artifact-dataplane/scripts/adp_kit.py', 'skills/artifact-dataplane/assets/adp.js', 'skills/artifact-dataplane/scripts/adp_loop.py'):
                for rule, rx in FIELD:
                    if rule in ('old.field-summary', 'old.field-group') and not rel.startswith('adp/'): continue   # elsewhere they mean a change summary or a board's own group
                    if rx.search(line): out.append({'rule': rule, 'file': rel, 'line': ln, 'found': line.strip()[:120]})
            if not rel.startswith(PATH_FIXTURE) and 'kit/' in line:
                for m in KITPATH.finditer(line):
                    rest = m.group(1)
                    if re.search(r'[<>*{}$%\\]|\.\.\.|^\w+$', rest) and not '/' in rest and not '.' in rest: continue
                    if re.search(r'[<>*{}$%]|\.\.\.', rest): continue
                    rest = rest.rstrip('.,;:)]\'"`')
                    if '/' not in rest and not re.search(r'\.[a-z]{2,4}$', rest): continue   # prose: "kit/guide" is not a path
                    if not _kit_path_exists(repo, rest, line[:m.start()], line[m.end():]): out.append({'rule': 'old.kit-path', 'file': rel, 'line': ln, 'found': 'kit/' + rest})
    return out


def legacy_files(repo):
    """Legacy files still on disk: rows, details, previews."""
    out = []
    for rel in tracked_text(repo):
        b = os.path.basename(rel)
        if re.fullmatch(r'entries(-[\w]+)?\.json', b) and 'adp/tools' in rel or re.fullmatch(r'details(-[\w]+)?\.json', b) or re.fullmatch(r'previews(-[\w]+)?\.js', b):
            out.append({'rule': 'old.file', 'file': rel, 'line': 0, 'found': 'legacy file exists'})
    return out


# ---------------------------------------------------------------- conformance: the registry
def registry_findings(site, ctx):
    out = []
    kit = os.path.join(site, 'kit')
    if not os.path.isdir(kit): return out
    for d in sorted(os.listdir(kit)):
        p = os.path.join(kit, d)
        if os.path.isfile(p): out.append({'rule': 'registry.flat-file', 'path': 'kit/' + d, 'expected': 'no file outside an item folder', 'found': 'file'}); continue
        listed = {f['path'] for f in ctx.rec.get(d, {}).get('files', []) if isinstance(f, dict) and 'path' in f}
        present = [os.path.relpath(os.path.join(dp, f), site).replace(os.sep, '/') for dp, _, fs in os.walk(p) for f in fs]
        if d not in ctx.rec and d not in ctx.bad:
            if present: out.append({'rule': 'registry.not-an-item', 'path': 'kit/' + d, 'expected': 'a folder with a registry-item.json', 'found': '%d file(s), no record' % len(present)})
            continue
        for rel in present:
            if rel not in listed and not rel.endswith('/' + RECORD): out.append({'rule': 'registry.orphan-file', 'path': rel, 'expected': 'listed in kit/%s/registry-item.json files[]' % d, 'found': 'nothing references it'})
    for pth, owners in sorted(ctx._by_path.items()):
        if len(owners) > 1: out.append({'rule': 'registry.shared-file', 'path': pth, 'expected': 'one owner', 'found': ', '.join(owners)})
    for n, r in ctx.rec.items():
        meta = r.get('meta') if isinstance(r.get('meta'), dict) else {}
        for k in ('related',):
            for x in meta.get(k, []) if isinstance(meta.get(k), list) else []:
                if x not in ctx.rec: out.append({'rule': 'registry.unresolved', 'path': n + '.meta.' + k, 'expected': 'an item name', 'found': x})
        if isinstance(meta.get('extends'), str) and meta['extends'] not in ctx.rec: out.append({'rule': 'registry.unresolved', 'path': n + '.meta.extends', 'expected': 'an item name', 'found': meta['extends']})
    return out
