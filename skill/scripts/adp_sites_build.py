"""Package prepared assets with the canonical Sites API; no deploy or record writes."""
import base64
import mimetypes
from pathlib import Path
from urllib.parse import quote


HOST = Path(__file__).resolve().parents[1] / 'assets/hosts/openai-sites'


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
