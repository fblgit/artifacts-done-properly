"""Pack a page folder into ONE index.html (embedded files + a small shim) and unpack it again, byte for byte.

The shim uses only inline <script>/<style> and a patched fetch: no blob:, eval or modules.
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import sys

SAFE = re.compile(r'[A-Za-z0-9._/@+-]+')
BLOCK = re.compile(r'<script type="application/adp-file" data-adp-file="([^"]+)" data-type="([^"]+)" data-enc="(utf8|b64)" data-sha256="([0-9a-f]{64})" data-bytes="(\d+)">(.*?)</script>', re.S)
ATTR = re.compile(r'([\w:-]+)(?:\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+))?')
LIMIT = 16 * 1024 * 1024
TYPES = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.txt': 'text/plain'}

# Runs after the blocks. css(p)/js(p) insert the file's text where the call stands; fetch() answers relative reads from the blocks.
SHIM = """<script>(function(){var B={};document.querySelectorAll('script[data-adp-file]').forEach(function(s){B[s.getAttribute('data-adp-file')]=s});
function raw(p){var s=B[p];if(!s)throw new Error('adp-pack: no file '+p);if(s.dataset.enc==='utf8')return new TextEncoder().encode(s.textContent);var b=atob(s.textContent),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
function text(p){var s=B[p];return s.dataset.enc==='utf8'?s.textContent:new TextDecoder().decode(raw(p))}
function put(tag,p,t){var e=document.createElement(tag);e.textContent=t;var c=document.currentScript;c.parentNode.insertBefore(e,c)}
window.ADPPACK={files:B,css:function(p){put('style',p,text(p))},js:function(p){put('script',p,text(p)+'\\n//# sourceURL='+p)}};
var f=window.fetch,base=new URL('.',document.baseURI).href;
window.fetch=function(u,o){var a=String(u&&u.url||u),m=((o&&o.method)||(u&&u.method)||'GET').toUpperCase();
 try{a=new URL(a,document.baseURI).href}catch(e){}
 var p=a.indexOf(base)===0?a.slice(base.length).split(/[?#]/)[0]:null;
 if(p&&B[p]&&(m==='GET'||m==='HEAD'))return Promise.resolve(new Response(m==='HEAD'?null:raw(p),{status:200,headers:{'content-type':B[p].dataset.type}}));
 return f.apply(this,arguments)}})()</script>"""


def attrs(text):
    return {k.lower(): (v or '').strip('"\'') for k, v in ATTR.findall(text)}


def tree(src):
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
    files = tree(src)
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
    def rewrite(html): return re.sub(r'<link\b([^>]*)>', link, re.sub(r'<script\b([^>]*)>\s*</script>', script, html, flags=re.I), flags=re.I)

    head, body = rewrite(head), rewrite(bd)
    title = re.search(r'<title>.*?</title>', head, re.S | re.I)
    head = re.sub(r'<title>.*?</title>|<meta\s+charset[^>]*>', '', head, flags=re.S | re.I)
    top = (title.group(0) if title else '<title>Page</title>') + ''.join(block(p, files[p]) for p in files) + SHIM + head
    tail = body + ''.join(deferred)
    out = top + tail if fragment else '<!doctype html>\n<html%s><head><meta charset="utf-8">%s</head><body%s>%s</body></html>\n' % (
        htm.group(1) if htm else '', top, battrs, tail)
    if len(out.encode('utf-8')) > LIMIT: raise ValueError('The packed page is over the 16 MB page limit')
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


def main(argv):
    ap = argparse.ArgumentParser(prog='adp.py ' + argv[0], description=__doc__)
    ap.add_argument('src', help='DIR to pack, or the packed index.html to unpack')
    ap.add_argument('dest', nargs='?', help='unpack: the folder to write (must be new or empty)')
    ap.add_argument('--out', help='pack: the file to write (default: print the summary only)')
    ap.add_argument('--fragment', action='store_true', help='pack: no doctype/html/head/body tags, for the Artifact tool (it adds them)')
    args = ap.parse_args(argv[1:])
    try:
        if argv[0] == 'pack':
            out, files = pack(args.src, args.fragment)
            if args.out:
                with open(args.out, 'w', encoding='utf-8', newline='') as fh: fh.write(out)
            print(json.dumps({'out': args.out, 'files': len(files), 'bytes': len(out.encode('utf-8')), 'fragment': args.fragment}))
        else:
            if not args.dest: ap.error('unpack needs DEST')
            if os.path.isdir(args.dest) and os.listdir(args.dest): raise ValueError('Destination is not empty: ' + args.dest)
            with open(args.src, encoding='utf-8', newline='') as fh: got = unpack(fh.read())
            for path, data in got.items():
                full = os.path.join(args.dest, *path.split('/')); os.makedirs(os.path.dirname(full), exist_ok=True)
                with open(full, 'wb') as fh: fh.write(data)
            print(json.dumps({'dest': args.dest, 'files': len(got), 'bytes': sum(map(len, got.values()))}))
    except (OSError, ValueError) as error:
        print('adp.py %s: %s' % (argv[0], error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
