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
  `skill/refs/*/SKILL.md`), `tools/check_catalog.py`, then a build uploaded as an
  artifact. The release workflow repeats tests and checks.

Build locally with `python3 tools/package.py` (output in `dist/`).

## Verify a download

Put `adp.skill` and `adp.skill.sha256` in one folder, then run:

    sha256sum -c adp.skill.sha256        # macOS: shasum -a 256 -c adp.skill.sha256

It prints `adp.skill: OK` when the file matches the published hash.
