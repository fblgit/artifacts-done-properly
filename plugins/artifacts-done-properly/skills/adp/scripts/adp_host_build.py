"""Host builders for `adp.py files DIR --host H`: sites packages assets with the canonical Sites API (no deploy or record writes);
single packs the folder into ONE self-contained index.html (and `unpack` returns it, byte for byte)."""
import base64
import hashlib
import json
import mimetypes
import os
import re
from pathlib import Path
from urllib.parse import quote


HOST = Path(__file__).resolve().parents[1] / 'assets/hosts/openai-sites'
SINGLE = Path(__file__).resolve().parents[1] / 'assets/hosts/single'

SAFE = re.compile(r'[A-Za-z0-9._/@+-]+')
BLOCK = re.compile(r'<script type="application/adp-file" data-adp-file="([^"]+)" data-type="([^"]+)" data-enc="(utf8|b64)" data-sha256="([0-9a-f]{64})" data-bytes="(\d+)">(.*?)</script>', re.S)
ATTR = re.compile(r'([\w:-]+)(?:\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+))?')
PAGE_LIMIT = 16 * 1024 * 1024
TYPES = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.txt': 'text/plain'}


def render_worker(assets):
    """assets maps URL paths to (MIME type, bytes). Also used by host fixtures."""
    import json
    encoded = {url: [mime, base64.b64encode(data).decode('ascii')]
               for url, (mime, data) in assets.items()}
    source = (HOST / 'worker.mjs').read_text()
    if source.count('export default {') != 1:
        raise ValueError('Sites handler export changed; cannot embed safely')
    source = source.replace('export default {', 'const api = {', 1)
    return source + '\nconst assets = ' + json.dumps(encoded) + ';\n' + """export default {async fetch(request, env) {
 const path=new URL(request.url).pathname;
 const asset=Object.hasOwn(assets,path)?assets[path]:null;
 if(asset && path!=='/mcp' && !path.startsWith('/api/adp/') && (request.method==='GET'||request.method==='HEAD')) {
  const bytes=Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0));
  return new Response(request.method==='HEAD'?null:bytes,{headers:{
   'Content-Type':asset[0],'Content-Length':String(bytes.length),
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 return api.fetch(request,env);
}};
"""


def build(directory, output, payload):
    """Use adp.py's existing file selection; require catalog refs materialized first."""
    root = Path(directory).resolve()
    target = Path(output).resolve()
    if target == root or root in target.parents:
        raise ValueError('Sites output must be outside the asset directory')
    if isinstance(payload.get('kit_refs'), dict) or any(not isinstance(v, str) for v in payload['files'].values()):
        raise ValueError('Materialize catalog references before building for Sites')
    assets = {}
    names = ['index.html', *payload['files']]
    for name in names:
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Unsafe asset path: ' + name)
        if any(part.startswith('.') for part in relative.parts):
            continue
        source = root / relative
        if any(p.is_symlink() for p in [source, *source.parents] if p != root and root in p.parents):
            raise ValueError('Symlink asset refused: ' + name)
        if not source.is_file() or root not in source.resolve().parents:
            raise ValueError('Missing or unsafe asset: ' + name)
        mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        if mime.startswith('text/') or mime in ('application/json', 'application/javascript', 'image/svg+xml'):
            mime += '; charset=utf-8'
        assets['/' + quote(relative.as_posix(), safe='/')] = (mime, source.read_bytes())
    assets['/'] = assets['/index.html']
    worker = target / 'dist/server/index.js'
    if any(p.is_symlink() for p in [worker, *worker.parents] if p != target and target in p.parents):
        raise ValueError('Symlink output refused')
    worker.parent.mkdir(parents=True, exist_ok=True)
    # Replace only the generated Worker, preserving hosting identity and migrations.
    import os
    import tempfile
    fd, temporary = tempfile.mkstemp(dir=worker.parent, prefix='.adp-build-')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(render_worker(assets))
        os.replace(temporary, worker)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {'host': 'sites', 'worker': str(worker), 'assets': len(assets) - 1,
            'required_binding': 'DB', 'schema_source': str(HOST / 'schema.sql')}


def _shim():
    return '<script>' + (SINGLE / 'shim.js').read_text().rstrip() + '</script>'


def attrs(text):
    return {k.lower(): (v or '').strip('"\'') for k, v in ATTR.findall(text)}


def pack_tree(src):
    out = {}
    for root, dirs, names in os.walk(src):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        for n in sorted(names):
            full = os.path.join(root, n)
            if n.startswith('.'): continue
            if os.path.islink(full): raise ValueError('Symlinks are not packed: ' + full)
            rel = os.path.relpath(full, src).replace(os.sep, '/')
            if not SAFE.fullmatch(rel): raise ValueError('Unsupported file name (use A-Z a-z 0-9 . _ / @ + -): ' + rel)
            with open(full, 'rb') as fh: out[rel] = fh.read()
    return out


def block(path, data):
    try:
        text = data.decode('utf-8')
        plain = not re.search(r'\r|\0|</script|<!--', text, re.I)
    except UnicodeDecodeError:
        plain = False
    mime = TYPES.get(os.path.splitext(path)[1].lower()) or mimetypes.guess_type(path)[0] or 'application/octet-stream'
    body = text if plain else base64.b64encode(data).decode('ascii')
    return '<script type="application/adp-file" data-adp-file="%s" data-type="%s" data-enc="%s" data-sha256="%s" data-bytes="%d">%s</script>' % (
        path, mime, 'utf8' if plain else 'b64', hashlib.sha256(data).hexdigest(), len(data), body)


def local(ref, files):
    ref = (ref or '').split('?')[0].split('#')[0]
    return ref if ref in files else None


def pack(src, fragment=False):
    files = pack_tree(src)
    if 'index.html' not in files: raise ValueError('The folder needs an index.html')
    page = files['index.html'].decode('utf-8')
    parts = {k: re.search(r'<%s\b([^>]*)>(.*)</%s\s*>' % (k, k), page, re.S | re.I) for k in ('head', 'body')}
    htm = re.search(r'<html\b([^>]*)>', page, re.I)
    # an index.html that is already a fragment (no <head>/<body>, as the starter and assistant templates are) is all body
    hd, bd, battrs = (parts['head'].group(2), parts['body'].group(2), parts['body'].group(1)) if all(parts.values()) else ('', page, '')
    head, deferred = hd, []

    def script(m):
        a = attrs(m.group(1)); p = local(a.get('src'), files)
        if not p or a.get('type', '').lower() == 'module': return m.group(0)
        call = '<script>ADPPACK.js(%s)</script>' % json.dumps(p)
        if 'defer' in a: deferred.append(call); return ''
        return call
    def link(m):
        a = attrs(m.group(1)); p = local(a.get('href'), files)
        return '<script>ADPPACK.css(%s)</script>' % json.dumps(p) if p and a.get('rel', '').lower() == 'stylesheet' else m.group(0)
    def rewrite(html): return re.sub(r'<link\b([^>]*)>', link, re.sub(r'<script\b([^>]*)>\s*</script\s*>', script, html, flags=re.I), flags=re.I)

    head, body = rewrite(head), rewrite(bd)
    title = re.search(r'<title>.*?</title>', head, re.S | re.I)
    head = re.sub(r'<title>.*?</title>|<meta\s+charset[^>]*>', '', head, flags=re.S | re.I)
    top = (title.group(0) if title else '<title>Page</title>') + ''.join(block(p, files[p]) for p in files) + _shim() + head
    tail = body + ''.join(deferred)
    out = top + tail if fragment else '<!doctype html>\n<html%s><head><meta charset="utf-8">%s</head><body%s>%s</body></html>\n' % (
        htm.group(1) if htm else '', top, battrs, tail)
    if len(out.encode('utf-8')) > PAGE_LIMIT: raise ValueError('The packed page is over the 16 MB page limit')
    return out, files


def unpack(page):
    got = {}
    for path, _, enc, sha, size, text in BLOCK.findall(page):
        data = base64.b64decode(text) if enc == 'b64' else text.encode('utf-8')
        if hashlib.sha256(data).hexdigest() != sha or len(data) != int(size): raise ValueError('Checksum mismatch: ' + path)
        if not SAFE.fullmatch(path) or path.startswith('/') or '..' in path.split('/'): raise ValueError('Unsafe path: ' + path)
        got[path] = data
    if not got: raise ValueError('No packed files found')
    return got


def pack_cmd(directory, out=None, fragment=False):
    """`adp.py files DIR --host single [--out index.html] [--fragment]`: the summary, and the page written to out."""
    try:
        page, files = pack(directory, fragment)
        if out:
            with open(out, 'w', encoding='utf-8', newline='') as stream:
                stream.write(page)
    except (OSError, ValueError) as error:
        raise SystemExit('adp.py files --host single: %s' % error)
    return {'host': 'single', 'out': out, 'files': len(files), 'bytes': len(page.encode('utf-8')), 'fragment': fragment}


def read_pack(text):
    """{relative path: bytes} of a pack: a packed page (embedded blocks, sha256 checked) or a catalog-pack-NN.json (adp-catalog-pack/1)."""
    if not text.lstrip().startswith('{'):
        return unpack(text)
    pack = json.loads(text)
    if not isinstance(pack, dict) or pack.get('schema') != 'adp-catalog-pack/1' or not isinstance(pack.get('files'), dict):
        raise ValueError('Not an ADP pack')
    return {k: v.encode('utf-8') for k, v in pack['files'].items() if isinstance(v, str) and not os.path.isabs(k) and '..' not in k.split('/')}


def write_files(files, dest, keep=False):
    """Write {path: bytes} under dest and return the paths written; keep leaves a file that is already there."""
    written = []
    for path, data in files.items():
        if os.path.isabs(path) or '..' in path.split('/'):
            raise ValueError('Unsafe path: ' + path)
        full = os.path.join(dest, *path.split('/'))
        if keep and os.path.isfile(full):
            continue
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'wb') as stream:
            stream.write(data)
        written.append(path)
    return written


def unpack_cmd(a):
    """`adp.py unpack PACK DEST`: PACK is a packed index.html or a catalog-pack-NN.json; DEST must be new or empty."""
    if len(a) != 3:
        raise SystemExit('usage: adp.py unpack PACK DEST')
    try:
        if os.path.isdir(a[2]) and os.listdir(a[2]):
            raise ValueError('Destination is not empty: ' + a[2])
        with open(a[1], encoding='utf-8', newline='') as stream:
            got = read_pack(stream.read())
        write_files(got, a[2])
    except (OSError, ValueError) as error:
        raise SystemExit('adp.py unpack: %s' % error)
    print(json.dumps({'dest': a[2], 'files': len(got), 'bytes': sum(map(len, got.values()))}))
    return 0
