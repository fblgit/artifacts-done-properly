"""Build an embedded Worker fixture; registration/migrations/deploy are separate."""
import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'skill/scripts'))
from adp_sites_build import render_worker


def assistant(output, namespace):
    """Use the shared assistant and current PR catalog, with the Sites adapter."""
    directory = output / "assistant"
    with tempfile.TemporaryDirectory(prefix="adp-sites-build-") as home:
        env = {**os.environ, "ADP_HOME": home}
        command = [sys.executable, "-I", str(ROOT / "skill/scripts/adp.py")]
        made = subprocess.run(command + ["new", "assistant", str(directory), "--title", "ADP Assistant", "--by", "sites-builder",
                                         "--theme", "default", "--catalog", str(ROOT / "skill/catalog/catalog.json")],
                              env=env, check=True, capture_output=True, text=True)
        for name, value in json.loads(made.stdout)["publish"]["files"].items():
            if isinstance(value, dict):
                target = directory / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / "skill/catalog" / value["path"], target)
        bridge = []
        for name in ("openai-sites-comments.js", "openai-sites.js", "openai.js"):
            target = directory / "adapters" / name
            target.parent.mkdir(exist_ok=True)
            shutil.copyfile(ROOT / "skill/assets/adapters" / name, target)
            bridge.append('<script src="adapters/' + name + '"></script>')
        endpoint = json.dumps("/api/adp/" + namespace)
        bridge.append('<script>window.ADP_HOST=window.ADPOpenAIHost.create({profile:"sites",seedFiles:true,bridge:window.ADPOpenAISites.create({endpoint:' + endpoint + ',comments:true})});</script>')
        page = directory / "index.html"
        page.write_text(page.read_text().replace('<script src="adp.js"></script>', '\n'.join(bridge) + '\n<script src="adp.js"></script>'))
        app = directory / "parts/app.js"
        app.write_text(app.read_text().replace('Kit.inbox.mount(ib, {})',
            'Kit.inbox.mount(ib, {requestPublish: pid => window.ADP_HOST.connect().then(host => host.comments.requestPublication(pid))})'))
        subprocess.run(command + ["seed", str(directory), "--by", "sites-builder"], env=env, check=True, capture_output=True)
    assets = {"/assistant/" + p.relative_to(directory).as_posix():
              [mimetypes.guess_type(p.name)[0] or "text/plain", p.read_bytes()]
              for p in directory.rglob("*") if p.is_file()}
    assets["/assistant/"] = assets["/assistant/index.html"]
    return assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Empty output directory, outside repository")
    parser.add_argument("--assistant", action="store_true", help="Include the shared ADP assistant at /assistant/")
    parser.add_argument("--namespace", default="sites-assistant", help="Assistant record namespace")
    args = parser.parse_args()
    if not args.namespace or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for c in args.namespace):
        parser.error("namespace must contain letters, digits, underscore or hyphen")
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("output must be empty")
    files = {
        "/": ("skill/assets/hosts/openai-sites/fixture.html", "text/html; charset=utf-8"),
        "/adp.js": ("skill/assets/adp.js", "text/javascript; charset=utf-8"),
        "/openai.js": ("skill/assets/adapters/openai.js", "text/javascript; charset=utf-8"),
        "/openai-sites.js": ("skill/assets/adapters/openai-sites.js", "text/javascript; charset=utf-8"),
        "/openai-sites-comments.js": ("skill/assets/adapters/openai-sites-comments.js", "text/javascript; charset=utf-8"),
    }
    assets = {url: [mime, (ROOT / filename).read_bytes()] for url, (filename, mime) in files.items()}
    if args.assistant:
        assets.update(assistant(args.output, args.namespace))
    target = args.output / "dist/server/index.js"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render_worker(assets))
    (args.output / "schema.sql").write_text((ROOT / "skill/assets/hosts/openai-sites/schema.sql").read_text())
    print(target)


if __name__ == "__main__":
    main()
