# ADP v2.0.0 (draft)

First public release of Artifacts Done Properly (ADP): a Claude skill for claude.ai Artifacts that several agents or sessions work on.

## What is in the bundle

`adp.skill` is a zip of the skill folder `adp/` (measured on a local dry run, not yet on the published asset):

- Size 1,162,163 bytes (3,364,418 bytes unpacked), 409 files.
- SHA-256 `e65251fd73176d81d49eb35be49c2b6fe4042a704a5e558e69eb52dbaf8e77b7` (the release page carries the authoritative value).
- `SKILL.md` (metadata.version 2.0.0), `scripts/adp.py` and `scripts/adp_loop.py` (Python 3, standard library only, as observed from imports).
- Four road skills: `adp-new`, `adp-edit`, `adp-adopt`, `adp-catalog`.
- Two templates: `starter` and `assistant`.
- A base catalog of 138 entries in 391 files (`catalog/`), with the catalog page `catalog/index.html`.
- `assets/adp.js`, the page runtime.

## Install

1. Download `adp.skill` and `adp.skill.sha256` from this release.
2. Verify: `sha256sum -c adp.skill.sha256` (macOS: `shasum -a 256 -c adp.skill.sha256`).
3. Install `adp.skill` as a skill (unzip it so the `adp/` folder sits in your skills folder).
4. Run `python3 -I adp/scripts/adp.py setup --dry-run`, then `setup --scope user|project|local`. Setup copies the four road skills into `.claude/skills` and writes a config; it only prints the CLAUDE.md lines unless you pass `--yes`.

## Known gaps

- No `full` starter tier: `adp.py templates` lists only `starter` and `assistant`.
- `adp.py new` leaves a `.txt` suffix on the template files it creates (for example `index.html.txt`, `content.js.txt`).
- No catalog entry-add command: adding an entry means editing files under `catalog/kit/` and `catalog.json` by hand (stated in `adp-catalog`).
- The catalog page loads marked, DOMPurify, htm/preact and Google Fonts from public CDNs.
- No license file in this draft: the owner must add one before publishing.
