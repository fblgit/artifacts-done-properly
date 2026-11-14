#!/usr/bin/env python3
"""adp_shell.py: build the catalog as it is published: a thin shell, seed packs and kit packs, with no kit/ file sent.
`adp.py new catalog OUT_DIR [--by NAME]` calls build_catalog(CATALOG_DIR, OUT_DIR).

OUT_DIR receives
  index.html adp.js content.js parts/ styles/   the shell, copied from CATALOG_DIR; index.html's note to agents loses its url (OWN_URL)
  catalog.json                                  the index (kit-catalog/2), built by adp_index.build_index, its `url` and `ver` empty
  search.json                                   [{id, about, source}], one per index entry, from the header of its main file: what
                                                the page's search matches and the index lacks; source is its @source lines as text
  kit.json kitpack/pack-NNN.json                adp-kit/1: every file under CATALOG_DIR/kit as {path, text}, in sorted path order,
                                                in packs of adp.PACK bytes, then kit/_stamp.json = {"stamp": S} as the last file of
                                                the last pack. S names this kit: 16 hex of the sha256 over its `path=sha256` lines.
                                                kit.json is {schema, files: N (the stamp file not counted), probe: "kit/_stamp.json",
                                                stamp: S, packs: [...]}. The page publishes kit/ itself from the packs when an editor
                                                asks it to (the `artifact` capability). It fetches the probe: the kit is unpacked
                                                when that answers with this stamp
  seed.json seed/pack-NNN.json                  adp-seed/2, written by adp.seed_file: one entries/<id> doc per index record, then
                                                the page's own first docs (parts, content, changes, agents, manifest/current last)
and never a kit/ folder, and no kit file in the database. Stdout gets one line of JSON, the Artifact publish call itself
(file_path, root, files, capabilities, icon, description): a new artifact every time, so it carries no url. Stderr gets one line
of JSON with the counts (files, bytes, entries, kit files, docs, packs) and what to do next. Stdlib only.
"""
import hashlib, json, os, re, shutil, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)

SHELL_FILES = ('index.html', 'adp.js', 'content.js')    # catalog.json is written from the index, not copied
SHELL_DIRS = ('parts', 'styles')
# the line of index.html's note to agents that names the catalog's url: (the words)(the url). The repo's copy records the last publish there
OWN_URL = re.compile(r"(This artifact's own URL is the catalog URL: )(\S+)[ \t]*$", re.M)
SEARCH = 'search.json'    # at OUT_DIR's root: see the module text
KIT = 'kit.json'          # at OUT_DIR's root: the index of the kit packs
KIT_DIR = 'kitpack'       # OUT_DIR/kitpack/pack-NNN.json: the kit files themselves
KIT_SCHEMA = 'adp-kit/1'
STAMP = 'kit/_stamp.json'  # the last packed file, written here and in no index entry: {"stamp": the kit's stamp}
MAX_FILE, MAX_TOTAL = 16 * 1024 * 1024, 64 * 1024 * 1024      # bytes: one published file, one publish
CAPABILITIES = {'artifact': {}, 'comments': {'customAnchors': True}, 'db': {'rules': [{'path': '', 'read': 'view', 'write': 'admin'}]}, 'user': {}}
ICON = 'catalog'
DESCRIPTION = 'The kit catalog: every component, layout, theme and guide an ADP page can take, with its files, previews and history.'


def _size(x):
    return len(json.dumps(x, ensure_ascii=False).encode())


def kit_files(catalog_dir):
    """Every file under CATALOG_DIR/kit as [{path, text}], sorted by path (kit/...); dotfiles and __pycache__ are not kit files."""
    root, out = os.path.join(catalog_dir, 'kit'), []
    for d, dirs, names in os.walk(root):
        dirs[:] = [x for x in dirs if not x.startswith('.') and x != '__pycache__']
        for n in names:
            if n.startswith('.'): continue
            p = os.path.relpath(os.path.join(d, n), catalog_dir).replace(os.sep, '/')
            try:
                with open(os.path.join(d, n), encoding='utf-8', newline='') as f: out.append({'path': p, 'text': f.read()})
            except UnicodeDecodeError:
                raise SystemExit(f'adp_shell: {p} is not UTF-8 text: a kit pack carries text only')
    return sorted(out, key=lambda x: x['path'])


def write_kit(out_dir, files, pack):
    """OUT_DIR/kit.json and OUT_DIR/kitpack/pack-NNN.json from [{path, text}] in the order given (kit_files sorts by path), cut at
    `pack` bytes of JSON, with the stamp file after them -> the kit.json object. The stamp file is last, so when the page must
    publish pack by pack the stamp is served only when every file is. Its path is one the shell does not publish."""
    sha = lambda t: hashlib.sha256(t.encode('utf-8')).hexdigest()
    stamp = sha('\n'.join(sorted(f"{x['path']}={sha(x['text'])}" for x in files)))[:16]
    count, files = len(files), files + [{'path': STAMP, 'text': json.dumps({'stamp': stamp})}]
    packs, cur, size = [], [], 0
    for x in files:
        n = _size(x)
        if cur and size + n > pack: packs.append(cur); cur, size = [], 0
        cur.append(x); size += n
    if cur: packs.append(cur)
    os.makedirs(os.path.join(out_dir, KIT_DIR), exist_ok=True); names = []
    for k, pk in enumerate(packs, 1):
        name = f'{KIT_DIR}/pack-{k:03d}.json'; names.append(name)
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
            json.dump({'schema': KIT_SCHEMA, 'pack': k, 'of': len(packs), 'files': pk}, f, ensure_ascii=False, indent=0)
    idx = {'schema': KIT_SCHEMA, 'files': count, 'probe': STAMP, 'stamp': stamp, 'packs': names}
    with open(os.path.join(out_dir, KIT), 'w', encoding='utf-8') as f: json.dump(idx, f, ensure_ascii=False, indent=1)
    return idx


def build_catalog(catalog_dir, out_dir, by=None, at=None):
    """Build OUT_DIR from CATALOG_DIR (see the module text); print the publish object (stdout, one line) and return it; the counts
    go to stderr. Headers with problems, and two kit paths that differ only in case or in Unicode form, are refused before
    any write. OUT_DIR is rebuilt: everything this module writes there is replaced, anything else there is refused."""
    import adp, adp_index       # here, not at the top: adp.py may import this module
    catalog_dir, out_dir = os.path.abspath(catalog_dir), os.path.abspath(out_dir)
    if not os.path.isfile(os.path.join(catalog_dir, 'index.html')): raise SystemExit(f'adp_shell: no index.html in {catalog_dir}')
    if not os.path.isdir(os.path.join(catalog_dir, 'kit')): raise SystemExit(f'adp_shell: no kit/ in {catalog_dir}')
    if out_dir == catalog_dir or out_dir.startswith(catalog_dir + os.sep): raise SystemExit('adp_shell: OUT_DIR must be outside CATALOG_DIR')
    files = kit_files(catalog_dir)
    if not files: raise SystemExit(f'adp_shell: {catalog_dir}/kit holds no file')      # before any write
    issues = adp_index.problems(catalog_dir)
    if issues: raise SystemExit('adp_shell: the headers have problems, nothing is built:\n  ' + '\n  '.join(issues))
    folded = {}
    for x in files:
        k = unicodedata.normalize('NFC', x['path']).casefold()
        if k in folded: raise SystemExit(f"adp_shell: {folded[k]} and {x['path']} differ only in case or Unicode form: one path where they are published")
        folded[k] = x['path']
    ours = set(SHELL_FILES) | set(SHELL_DIRS) | {'catalog.json', SEARCH, adp.SEED, adp.SEED_DIR, KIT, KIT_DIR}
    if os.path.isdir(out_dir):
        other = sorted(n for n in os.listdir(out_dir) if n not in ours)
        if other: raise SystemExit(f'adp_shell: {out_dir} holds files that are not a catalog shell: {", ".join(other[:5])}')
        for n in os.listdir(out_dir):       # rebuilt from nothing: a doc or a pack of something that is gone must not stay
            p = os.path.join(out_dir, n)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(out_dir, exist_ok=True)
    for n in SHELL_FILES:
        src = os.path.join(catalog_dir, n)
        if not os.path.isfile(src): raise SystemExit(f'adp_shell: {catalog_dir} has no {n}')
        shutil.copyfile(src, os.path.join(out_dir, n))
    for n in SHELL_DIRS:
        src = os.path.join(catalog_dir, n)
        if os.path.isdir(src): shutil.copytree(src, os.path.join(out_dir, n), ignore=shutil.ignore_patterns('__pycache__', '.*'))
    page = os.path.join(out_dir, 'index.html')        # shipped without its url, as catalog.json is: that url is the catalog before this one
    with open(page, encoding='utf-8', newline='') as f: html = f.read()
    with open(page, 'w', encoding='utf-8', newline='') as f: f.write(OWN_URL.sub("This artifact's own URL is the catalog URL.", html))

    index = adp_index.build_index(catalog_dir)
    # the shipped copy carries no link: this publish is a new artifact, and the index's url is the one before it
    with open(os.path.join(out_dir, 'catalog.json'), 'w', encoding='utf-8') as f: json.dump(dict(index, url='', ver=''), f, ensure_ascii=False, indent=1)
    search = []
    for e in index['entries']:
        with open(os.path.join(catalog_dir, e['main']), encoding='utf-8') as f: h = adp_index.parse_header(f.read(), e['main'])
        search.append({'id': e['id'], 'about': h['about'], 'source': ' '.join(f"{x['board']} {x['file']} {x['what']}" for x in h.get('source', []))})
    with open(os.path.join(out_dir, SEARCH), 'w', encoding='utf-8') as f: json.dump(search, f, ensure_ascii=False, separators=(',', ':'))

    kit = write_kit(out_dir, files, adp.PACK)         # before the seed: manifest/current then covers kit.json and the packs
    on_disk = sum(1 for p in adp.tree(os.path.join(catalog_dir, 'kit')) if not any(s.startswith('.') for s in p.split('/')))
    packed = [x['path'] for pk in kit['packs'] for x in json.load(open(os.path.join(out_dir, pk), encoding='utf-8'))['files']]
    if packed[-1] != STAMP or not (kit['files'] == on_disk == len(packed) - 1 == len(set(packed)) - 1):
        raise SystemExit(f'adp_shell: kit.json says {kit["files"]} files, the packs hold {len(packed) - 1} and {STAMP}, {catalog_dir}/kit has {on_disk}')
    adp.seed_file(out_dir, by or 'adp', at=at, data=[('entries', e['id'], e) for e in index['entries']], summary='catalog shell: first build')
    seed = adp.read_seed(out_dir)[0]

    pub = adp.publish_args(out_dir)
    if pub.get('skipped'): raise SystemExit(f'adp_shell: files the artifact service does not serve: {", ".join(pub["skipped"])}')
    if len(pub['files']) > adp.LIMIT: raise SystemExit(f'adp_shell: {len(pub["files"])} files, over {adp.LIMIT} in one publish')
    size = {p: os.path.getsize(os.path.join(out_dir, p)) for p in adp.tree(out_dir)}
    big = sorted(p for p, n in size.items() if n > MAX_FILE)
    if big: raise SystemExit(f'adp_shell: over {MAX_FILE} bytes, more than one published file holds: {", ".join(big)}')
    if sum(size.values()) > MAX_TOTAL: raise SystemExit(f'adp_shell: {sum(size.values())} bytes, over {MAX_TOTAL} in one publish')
    pub.update(capabilities=json.loads(json.dumps(CAPABILITIES)), icon=ICON, description=DESCRIPTION)

    largest = lambda names: max(size[p] for p in names)
    cat_json = os.path.join(catalog_dir, 'catalog.json'); stale = None
    if os.path.isfile(cat_json):
        try: old = json.load(open(cat_json, encoding='utf-8'))
        except ValueError: old = {}
        stale = old.get('schema') != index.get('schema') or old.get('entries') != index.get('entries')
    out = {'files': len(size), 'bytes': sum(size.values()), 'entries': len(index['entries']),
           'kit': {'files': kit['files'], 'packs': len(kit['packs']), 'largest_pack': largest(kit['packs'])},
           'seed': {'docs': seed['docs'], 'packs': len(seed['packs']), 'largest_pack': largest(seed['packs'])},
           'next': ['Artifact publish with the object on stdout, as it is: a new artifact. Published to an existing url instead, the '
                    'page asks to unpack again when the kit changed; files gone from the kit stay served, and the database '
                    'keeps the entries it has (the seed fills an empty one only)',
                    'Open the page as its owner: it fills its database from seed.json and seed/. Press "Unpack the kit" there: '
                    'that publishes kit/ from kit.json and kitpack/',
                    'Write the database doc catalog/self = {"url": "<the new url>"}: the Take tab prints it. `ver` stays empty: '
                    'the published version has no kit/, the page makes a new one when it unpacks']}
    if stale: out['index_stale'] = f'{cat_json} differs from the index built now: run adp.py index'
    print(json.dumps(pub, ensure_ascii=False, separators=(',', ':')))
    sys.stderr.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    return pub
