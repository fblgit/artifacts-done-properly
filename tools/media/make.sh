#!/usr/bin/env bash
# Builds the site's media into assets/media/ from the repo with Playwright: page scenes are recorded against the `adp.py dev serve`
# emulator, terminal scenes run the real commands and animate their output (scenes/term.mjs). Needs ffmpeg and gifski;
# `npm install` once in tools/media. (VHS is not used: it needs Chrome's remote debugging, which a managed Mac may disable by policy.)
# Usage: tools/media/make.sh j1 | j3 | all
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=assets/media; mkdir -p "$OUT"

j1() { local tmp; tmp=$(mktemp -d); node tools/media/scenes/j1-setup.mjs "$tmp/video"; encode "$tmp/video"/*.webm j1-setup; rm -rf "$tmp"; }

j3() {
  local tmp srv pid; tmp=$(mktemp -d); srv=$tmp/catalog; mkdir "$srv"; cp -R skill/catalog/. "$srv"/
  python3 -I skill/scripts/adp.py dev serve "$srv" --port 8799 >"$tmp/serve.log" 2>&1 & pid=$!
  trap 'kill $pid 2>/dev/null; rm -rf "$tmp"' RETURN
  until curl -sf -o /dev/null http://127.0.0.1:8799/; do sleep 0.5; done
  node tools/media/scenes/j3-catalog-road.mjs "$tmp/video" http://127.0.0.1:8799/
  encode "$tmp/video"/*.webm j3-catalog-road
}

# encode IN.webm NAME -> OUT/NAME.mp4 (h264, web friendly) and OUT/NAME.gif (gifski, 960 px, 10 fps)
encode() {
  local in=$1 name=$2 frames; frames=$(mktemp -d)
  ffmpeg -loglevel error -y -i "$in" -vf "scale=1280:-2,fps=30" -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart "$OUT/$name.mp4"
  ffmpeg -loglevel error -y -i "$in" -vf "fps=10,scale=960:-1" "$frames/%04d.png"
  gifski --quiet --fps 10 --width 960 --quality 80 -o "$OUT/$name.gif" "$frames"/*.png
  rm -rf "$frames"
}

case "${1:-all}" in
  j1) j1 ;;
  j3) j3 ;;
  all) j1; j3 ;;
  *) sed -n 2,4p "$0"; exit 2 ;;
esac
ls -l "$OUT"
