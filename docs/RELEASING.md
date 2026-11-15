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

The catalog is a published artifact, and its URL is what every ADP page and `adp.py take` copies files from. Treat it as production.

- **Never experiment on the live catalog.** No test publish, republish "to see", db access or file listing. An experiment goes to a scratch artifact on a new link, deleted afterwards; a journey or test that needs a catalog uses a scratch copy.
- **One publish, then hands off.** Whoever tests a published artifact is the only one touching it until they say the test is done.
- **A published page runs its own bootstrap.** A client set to open a page on publish opens it as an editor at once, and that open starts it (step 5). While it runs, every Apply is a new live version, so a publish over the artifact is refused: publish nothing else until it has finished.
- **The live catalog changes by proposal.** The page applies the proposals (`Kit.inbox`): a file that moved since the proposal is held, never overwritten, and `What changed` records each Apply with its real version. `plan` makes new-file proposals (`ifMatch` empty) and `update` the day-2 ones (below). Prove any plan on a scratch artifact first.

A fresh catalog, as a new artifact:

1. Pre-flight: a clean commit, then `python3 -I skill/scripts/adp_catalog.py skill/catalog`, `python3 -I tools/roundtrip.py --require-node`, `python3 -m unittest discover -s tests` and `python3 tools/package.py --check`.
2. Rehearse offline: `python3 -I tools/publish_catalog.py plan --url https://claude.ai/artifact/LOCAL --out <scratch>`, then `python3 -I skill/scripts/adp.py dev serve <scratch>/tree --no-fallback` and open it. The emulator stands in for the db, user, comments and `artifact.publish`, so the whole bootstrap runs without claude.ai.
3. Get the URL: `python3 -I tools/publish_catalog.py welcome --out <dir>` renders one About ADP page. Publish its `publish.json` as a new artifact, declaring the capabilities it lists (comments, db, user, artifact).
4. Publish the catalog once into that artifact: `python3 -I tools/publish_catalog.py plan --url <url> --out <dir>`, then its `publish.json` with the Artifact tool and `url` set to the artifact. `--url` is stamped into the staged `catalog.json` and `index.html` only; `welcome.html` goes in beside them and the catalog header links it as About ADP. `index.html` replaces the welcome page.
5. Hands off. The editor's open writes the page's record, applies the proposals one at a time (a failed one is retried once) and reloads; a proposal it applied itself sends no wake-up comment. Wait until the page has reloaded, Incoming is empty and `What changed` lists each proposal. A held or failed proposal makes the panel warn and the page stay put: press Apply on it.
6. Verify with a scratch `ADP_HOME`: `adp.py catalog <url>` and the reads it prints, until it says `complete: true`; every file's sha256 equals the repo's.
7. Share: the owner shares the artifact (view) from its Share menu. Claude cannot, and until then nobody else can take from it.
8. `python3 -I tools/publish_catalog.py set-url <url>` stamps the repo's `catalog.json` and the `index.html` comment, `check <url>` compares them, then commit and give out the URL. A fresh install learns where the catalog is from the shipped `catalog.json`.

Updating the live catalog (day 2), never by a publish over it:

1. Pre-flight as step 1 above, and rehearse on the emulator or a scratch artifact.
2. `adp.py catalog <url>` and the reads it prints, until `complete: true`: `~/.adp/catalog` now holds the live files.
3. `python3 -I tools/publish_catalog.py update --url <url> --out <dir>` compares the repo with that copy and writes `<dir>/update-NN.json`: one proposal per kit folder for the changed files (`ifMatch` is the live sha), the new ones and the removed ones, and for `catalog.json` when it changed. Without a copy of the live catalog it stops.
4. Write each `update-NN.json` in order as an ArtifactData batch (`adp.py dev send` does it on the emulator). The catalog page applies them while an editor has it open; a file that moved since is held and the panel warns.
5. Verify as step 6 above, then commit.

Known gaps: `update` does not cover the page's own files (`index.html`, `adp.js`, `parts/`, `styles/`, `welcome.html`: their live shas are not in the index); two editor tabs open at once could both auto-apply (no lock); the size limit of one Apply is unknown (a real publish of 100 files / 900 KB went through; proposals stay at 60 files / 600 KB); closing the tab mid-bootstrap stops it, and the next editor open resumes it.
