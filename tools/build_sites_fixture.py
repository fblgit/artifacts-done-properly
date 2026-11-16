"""Build an embedded Worker fixture; registration/migrations/deploy are separate."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Empty output directory, outside repository")
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("output must be empty")
    files = {
        "/": ("skill/assets/hosts/openai-sites/fixture.html", "text/html; charset=utf-8"),
        "/adp.js": ("skill/assets/adp.js", "text/javascript; charset=utf-8"),
        "/openai.js": ("skill/assets/adapters/openai.js", "text/javascript; charset=utf-8"),
        "/openai-sites.js": ("skill/assets/adapters/openai-sites.js", "text/javascript; charset=utf-8"),
        "/openai-sites-comments.js": ("skill/assets/adapters/openai-sites-comments.js", "text/javascript; charset=utf-8"),
    }
    assets = {url: [mime, (ROOT / filename).read_text()] for url, (filename, mime) in files.items()}
    source = (ROOT / "skill/assets/hosts/openai-sites/worker.mjs").read_text()
    source = source.replace("export default {", "const api = {")
    source += "\nconst assets = " + json.dumps(assets) + ";\n"
    source += """export default {async fetch(request, env) {
 const asset=assets[new URL(request.url).pathname];
 if(asset && request.method==='GET')return new Response(asset[1],{headers:{'Content-Type':asset[0],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return api.fetch(request,env);
}};
"""
    target = args.output / "dist/server/index.js"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source)
    (args.output / "schema.sql").write_text((ROOT / "skill/assets/hosts/openai-sites/schema.sql").read_text())
    print(target)


if __name__ == "__main__":
    main()
