# Changelog

What each release of Artifacts Done Properly (ADP) brings, newest first. The release page of each version carries `adp.skill` and its SHA-256.

## v2.3.0

Minor release on v2.2.0. Install and verify as before; `adp.skill.sha256` on the release page is the authoritative hash.

### Added

- **Extra kits.** `extras/<id>.json` holds a catalog entry kept outside the base catalog, as a seed pack with one inbox proposal. Pushed as one ArtifactData batch, the catalog page applies its files and adds its record to its own `catalog.json`; nobody sends `catalog.json` (`docs/kit-json.md`). Nine kits: camera capture, combobox, date picker, evidence checklist, QR code, redline, signature pad, signing track and split pane. `publish_catalog.py kit pack` writes a pack and refuses one over a batch (50 writes / 700 KB). A kit may bring its own catalog preview (`kit/previews/`, role `preview`): the page loads it; `take`, `kit describe` and `suggest` leave it out (#109).
- **The adp skill opens with what ADP is**, how it runs, and where each change goes.

### Changed

- **The catalog page indexes a kit only on evidence.** A record is added only when its proposal delivered every file it lists, with the same sha256, and only from the current `catalog.json` once nothing is pending. When it does not index, the Incoming panel says why. "New entries" lists only kits the catalog still holds.
- **`pattern.inbox` 0.2.5.** Apply refuses a file whose delivered text does not match the sha256 its proposal states.
- **`publish_catalog.py update`** keeps an entry only the live catalog holds (an extra kit), its files and its record; `--remove ID` removes one on purpose.
- **`adp.py record`** clears only the recording agent's own holds (`--holds`, or the parts it edited); a parent that changed only through a child keeps its holder (#108).
- **`layout.margin-notes` 0.2.0:** review notes on a clause (severity, highlighted words, a suggestion, `onAction`) and printed section and clause numbers.
- **Docs and catalog text.** Host-adapter and transport docs tightened; a local path and project names removed from guides, a template header and viz samples (#107, #108).

### Known gaps

- An installed extra kit has no update path yet: a pack proposes new files (`ifMatch: null`), so a new version is held.

## v2.2.0

Minor release on v2.1.2. Install and verify as before; `adp.skill.sha256` on the release page is the authoritative hash.

### Changed

- **Plugin directory layout.** The plugin is the folder `plugins/artifacts-done-properly/` in the standard layout: `.claude-plugin/plugin.json`, `skills/adp` and one sibling skill for each road (`adp-new`, `adp-catalog`, `adp-edit`, `adp-adopt`), with its own README, LICENSE, NOTICE and icon. The repository root carries `.claude-plugin/marketplace.json` (`fblgit-adp`): `/plugin marketplace add fblgit/artifacts-done-properly`, then `/plugin install artifacts-done-properly@fblgit-adp`. The plugin version is ADP's version, and `tools/package.py --check` fails when they differ. `adp.skill` is built from that folder and `adp.py setup` finds the road skills in either layout (#101, #105).
- **README and docs.** The README holds only the install (the plugin marketplace or `adp.skill`); the manual steps and Python commands are in `docs/installation.md`. Skill frontmatter descriptions are quoted.
- **No `.toml` in the repository.** The gitleaks config is the `GITLEAKS_CONFIG_TOML` env in `ci.yml` and inline in the pre-push hook.

### Security

- **Dev emulator.** `adp.py dev serve` keeps every collection file inside its `db/` folder, reads a batch's `file_path` only inside the artifact folder or its state, and strips line breaks from a content type before it reaches a header. `adp.py dev send` reads the `file_path` files itself, so `--out` can still point anywhere.
- **Catalog page.** The three CDN scripts carry `integrity` and `crossorigin`; the script-tag regexes accept `</script >`.

### CI

- `claude plugin validate` runs on the plugin folder (directory profile, strict) and on the repository (marketplace). CodeQL runs as GitHub's default setup. Dependabot keeps the actions (grouped) and the pre-commit hooks current; `ruff` in `ci.yml` follows the hook version.

## v2.1.2

Patch release on v2.1.1. Install and verify as before; `adp.skill.sha256` on the release page is the authoritative hash.

### Changed

- **New published catalog and assistant.** ADP: Catalog v2.1.1 (`https://claude.ai/artifact/F3Do218c6gJXcvV5FkxGhZ`) and ADP: Assistant v2.1.1 (`https://claude.ai/artifact/F42c7ZcRDKptdaTA5TAqZB`). The shipped `catalog.json` and the catalog page carry the new catalog URL (#94).
- **README rewritten.** What ADP is, the three beats (bring it in, make it reusable, keep the gain), the eight journeys, and the plugin as the recommended install: after the install, `/adp setup`. The CLI-without-plugin route is gone (#94).
- **Docs and skills state what ADP does.** Status notes and pull-request references are removed from the README, the docs and the road skills (#94).
- **`CHANGELOG.md`** replaces the per-version release notes and the v2.0.0 checklist; `docs/RELEASING.md` adds it to the release steps (#94).

## v2.1.1

Patch release on v2.1.0. Install and verify as before; `adp.skill.sha256` on the release page is the authoritative hash.

### Added

- **One-file pages.** `adp.py files DIR --host single [--out index.html] [--fragment]` packs a page folder into one self-contained `index.html`, for tools that publish a single file (the Claude chat Artifact tool). A small shim serves relative scripts, styles and `fetch()` from embedded, sha256-checked files, using only inline scripts and styles. `--fragment` omits doctype/html/head/body, and a page that is already a fragment (the starter and assistant templates) packs as all body.
- **`adp.py unpack PACK DEST`.** Writes the files back byte for byte from a packed page or from a `catalog-pack-NN.json`; `DEST` must be new or empty. `setup` reads the shipped catalog through the same reader and writer.

### Changed

- `adp_sites_build.py` is now `adp_host_build.py` (hosts: sites, single). Scripts that imported the old name must follow.
- `docs/architecture.md` documents the one-file host.

### Limits

- Module scripts, relative images and CSS `url()` are not rewritten, and the packed page must stay under 16 MB.
- A packed page does not expand itself into real files.

## v2.1.0

Minor release on v2.0.0 (106 commits, PRs #79–#91). Install and verify as in v2.0.0; `adp.skill.sha256` on the release page is the authoritative hash.

### Added

- **Host adapter contract (#81).** Pages reach records, viewer identity and comments through an explicit provider, `adp-host/1`: the Claude adapter, and an OpenAI Sites transport (experimental, see `docs/openai-sites-transport.md`). Hosts without a native feature get an agent or application workflow where one exists; remaining gaps are named in `docs/host-adapters.md`. The agent, publish and ask handles are host-neutral, and queued hosts can send and reply.
- **Shared records shell (#81).** `bundle`, `import-plan` and `import-ack` move intent, decisions, feedback, provenance and history between hosts as `adp-seed/2`, with `import-plan --base` for a return trip and `--only` to import named collections.
- **Guarded agent work (#81).** Claims are bound to their destination, a reply ends a claim on Claude, and `adp.py requests` shows the recorded lease and host.
- **Sites catalogs as a take source (#83).** `adp.py take` accepts Sites catalog URLs, plans authenticated HTTPS reads for the entries and their dependencies, writes bytes only after the full SHA-256 verifies, and refuses mismatched or conflicting files. Take instructions are host-specific.
- **Sites builds (#88).** `adp.py files ASSETS --host sites --out SITE_PROJECT` builds a Sites project from ADP files, and the base, new and edit skills route to one Sites guide.
- **Local agent bus (#86).** `skill/scripts/adp_bus.py`: HTTP over `.adp/bus.sock`, an append-only `.adp/bus.jsonl` transcript, snapshots, broadcasts, file sends and search. `--subscribe NAME --thread ID` queues `[ADP-BUS]` / `[ADP-MSG]` events into an existing Codex chat. A subscriber does not see its own messages.
- **Source coverage (#90).** `adp.py source-drift` reports which KnowledgeBase chapters a source change affects, from local Git and JSON only, with review pins and a full-inventory coverage payload. New CI/CD & Repository chapter.

### Changed

- README lists requirements: Python 3 (standard library only) runs ADP; Node.js is needed only to work on ADP itself (#79).
- Docs and the `adp-edit` skill follow what #81 built (#82).
- `tests/test_setup.py` closes its files; the suite runs clean under `-W error::ResourceWarning`.
- A Claude PR assistant workflow was added to CI (#91).

### Limits

- `adp.py new --tier full` (the published catalog) is not available, and there is no catalog entry-add command.

## v2.0.0

First public release of Artifacts Done Properly (ADP): a Claude skill for claude.ai Artifacts that several agents or sessions work on.

### What is in the bundle

`adp.skill` is a zip of the skill folder `adp/`:

- `SKILL.md` (metadata.version 2.0.0), `scripts/adp.py` and `scripts/adp_loop.py` (Python 3, standard library only).
- Four road skills: `adp-new`, `adp-edit`, `adp-adopt`, `adp-catalog`.
- Three templates: `starter`, `assistant` and `default` (the assistant plus every theme, the canvas, 3D and the approved kits).
- A base catalog of 138 entries in 391 files (`catalog/`), with the catalog page `catalog/index.html`.
- `assets/adp.js`, the page runtime.

### Install

Claude Code: install the plugin, and its marketplace brings the updates. Run `/plugin marketplace add fblgit/fblgit-claude-marketplace`, then `/plugin install artifacts-done-properly@fblgit-claude-marketplace`, then follow "First run" in the README. In the plugin, `setup` copies no road skill, because the plugin serves them.

The Claude desktop app's skill library, or a manual install:

1. Download `adp.skill` and `adp.skill.sha256` from this release.
2. Verify: `sha256sum -c adp.skill.sha256` (macOS: `shasum -a 256 -c adp.skill.sha256`).
3. Install `adp.skill` as a skill (unzip it so the `adp/` folder sits in your skills folder).
4. Run `python3 -I adp/scripts/adp.py setup --dry-run`, then `setup --scope user|project|local`. Setup copies the four road skills into `.claude/skills` (replacing an older or edited copy) and writes a config; it only prints the CLAUDE.md lines unless you pass `--yes`.

### Commands

- `setup`, `init [DIR]`, `projects`, `log [-n N]`: onboarding and history. `init` and `setup --scope project|local` register the project in `~/.adp/projects/`; every command appends a line to `log.jsonl`.
- `--project NAME|PATH`: optional, never a default; uses that project root (a directory or a registered project name) instead of the current directory.
- `templates`, `new (TEMPLATE | --tier minimal|default|full) DIR`: `minimal` is `starter`, `default` is `default`. `new` writes the template files without their `.txt` suffix and follows the template's base chain.
- Also: `check`, `manifest`, `diff`, `diff-pages`, `files`, `pins`, `catalog`, `take`, `seed`, `suggest`, `kit list|show|describe`, `export`, `classify`, `propose`, `ack`, `gate`, `hold`, `record`, `config`, `requests`. Run `adp.py` with no arguments for the full list.

### Limits

- `--tier full` is not available yet (`adp.py new --tier full` says so); the full tier is meant to be the published catalog, later.
- No catalog entry-add command: adding an entry means writing its files under `catalog/kit/` with a header, then running `adp_catalog.py build`, which writes `catalog.json` (stated in `adp-catalog`).
- All 141 catalog entries carry a header in the format of `docs/catalog-header.md`, and `catalog.json` (`kit-catalog/2`) is generated from those headers by `adp_catalog.py build`.
- The catalog page loads marked, DOMPurify and htm/preact from public CDNs, and fonts from Google Fonts.
