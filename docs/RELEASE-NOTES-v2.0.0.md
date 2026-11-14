# ADP v2.0.0 (draft)

First public release of Artifacts Done Properly (ADP): a Claude skill for claude.ai Artifacts that several agents or sessions work on.

## What is in the bundle

`adp.skill` is a zip of the skill folder `adp/` (measured on a local build of `main`, not yet on the published asset):

- Size 1,164,716 bytes (3,372,488 bytes unpacked), 410 files.
- SHA-256 `d4c8e25a5560504c4767fbf4620820d51503f9cfcf10e2be43ef6ba034924957` (the release page carries the authoritative value).
- `SKILL.md` (metadata.version 2.0.0), `scripts/adp.py` and `scripts/adp_loop.py` (Python 3, standard library only, as observed from imports).
- Four road skills: `adp-new`, `adp-edit`, `adp-adopt`, `adp-catalog`.
- Three templates: `starter`, `assistant` and `default` (the assistant plus every theme, the canvas, 3D and the approved kits).
- A base catalog of 138 entries in 391 files (`catalog/`), with the catalog page `catalog/index.html`.
- `assets/adp.js`, the page runtime.

## Install

1. Download `adp.skill` and `adp.skill.sha256` from this release.
2. Verify: `sha256sum -c adp.skill.sha256` (macOS: `shasum -a 256 -c adp.skill.sha256`).
3. Install `adp.skill` as a skill (unzip it so the `adp/` folder sits in your skills folder).
4. Run `python3 -I adp/scripts/adp.py setup --dry-run`, then `setup --scope user|project|local`. Setup copies the four road skills into `.claude/skills` (replacing an older or edited copy) and writes a config; it only prints the CLAUDE.md lines unless you pass `--yes`.

## Commands

- `setup`, `init [DIR]`, `projects`, `log [-n N]`: onboarding and history. `init` and `setup --scope project|local` register the project in `~/.adp/projects/`; every command appends a line to `log.jsonl`.
- `--project NAME|PATH`: optional, never a default; uses that project root (a directory or a registered project name) instead of the current directory.
- `templates`, `new (TEMPLATE | --tier minimal|default|full) DIR`: `minimal` is `starter`, `default` is `default`. `new` writes the template files without their `.txt` suffix and follows the template's base chain.
- Also: `check`, `manifest`, `diff`, `diff-pages`, `files`, `pins`, `catalog`, `take`, `seed`, `suggest`, `kit list|show|describe`, `export`, `classify`, `propose`, `ack`, `gate`, `hold`, `record`, `config`, `requests`. Run `adp.py` with no arguments for the full list.

## Known gaps

- `--tier full` is not available yet (`adp.py new --tier full` says so); the full tier is meant to be the published catalog, later.
- No catalog entry-add command: adding an entry means editing files under `catalog/kit/` and `catalog.json` by hand (stated in `adp-catalog`).
- All 138 catalog entries carry a header in the format of `docs/catalog-header.md`. `catalog.json` is still the full index, not yet generated from the headers.
- The catalog page loads marked, DOMPurify and htm/preact from public CDNs, and fonts from Google Fonts.
- No license file in this draft: the owner must add one before publishing.
