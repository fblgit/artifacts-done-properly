# Releasing

The repo ships one artifact: `adp.skill`, a zip of `skill/` with the top-level
folder `adp/`. The build is deterministic, so the same tree gives the same bytes.

## Cut a release

1. Set `metadata.version` in `skill/SKILL.md` (for example `"1.2.0"`) and merge to `main`.
2. Tag the merge commit with `v` plus that version and push the tag:
   `git tag v1.2.0 && git push origin v1.2.0`
3. The `release` workflow builds the bundle and publishes a GitHub release with
   `adp.skill` and `adp.skill.sha256`; the notes include the SHA-256.

If the tag and `metadata.version` differ, the workflow fails before publishing.

The plugin `artifacts-done-properly` is listed in `fblgit/fblgit-claude-marketplace` by repository
URL, and `.claude-plugin/plugin.json` sets no `version` on purpose (a test keeps it that way).
Claude Code then takes the commit as the plugin's version, so every commit on `main` is an update
for plugin installs and a release needs no change for the plugin. The tag and `adp.skill` are for
the zip install.

## What CI checks

- `secrets`: gitleaks over the full history.
- `tests`: `python3 -m unittest discover -s tests -v`.
- `skill`: `tools/package.py --check` (frontmatter of `skill/SKILL.md` and every
  `skill/refs/*/SKILL.md`), `skill/scripts/adp_catalog.py`, then a build uploaded as an
  artifact. The release workflow repeats tests and checks.

Build locally with `python3 tools/package.py` (output in `dist/`).

## Verify a download

Put `adp.skill` and `adp.skill.sha256` in one folder, then run:

    sha256sum -c adp.skill.sha256        # macOS: shasum -a 256 -c adp.skill.sha256

It prints `adp.skill: OK` when the file matches the published hash.

## Publish the catalog

The catalog is a published artifact, and its URL is what every ADP page and `adp.py take` copies files from (`catalog.json` `url`, the comment in `skill/catalog/index.html`, and each user's saved `catalog`). Treat it as production.

- **Never experiment on the live catalog.** No test publish, no republish "to see", no db read or write, no file listing. An experiment goes to a scratch artifact on a new link, deleted afterwards. A journey or test that needs a catalog uses a scratch copy.
- **One publish, then hands off.** The person testing a published artifact is the only one touching it until they say the test is done. Nobody publishes over it meanwhile.
- **The live catalog changes by proposal.** New files arrive as proposals that an editor applies in its Incoming panel: a file that moved since the proposal is held, never overwritten, and `What changed` records each Apply with its real version. Prove the same plan on a scratch copy first. `plan` makes new-file proposals (`ifMatch` empty); a plan that carries the live shas for an update does not exist yet.

A fresh catalog, as a new artifact:

1. Work from a clean commit and run the checks: `python3 -I skill/scripts/adp_catalog.py skill/catalog`, `python3 -I tools/roundtrip.py --require-node`, `python3 -m unittest discover -s tests` and `python3 tools/package.py --check`.
2. `python3 -I tools/publish_catalog.py plan --out <dir>`, then publish `<dir>/publish.json` once with the Artifact tool, as a new artifact.
3. Before anyone opens it: `publish_catalog.py set-url <url>`, plan again, republish once, then `publish_catalog.py check <url>`.
4. The owner opens it as an editor and presses Apply on each proposal.
5. Verify the whole kit: `adp.py catalog <url>` and the reads it prints, until it says `complete: true`; every file's sha256 equals the repo's.
6. Commit the stamped `catalog.json` and `index.html`, then give out the URL.
