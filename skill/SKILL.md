---
name: adp
description: "ADP (Artifacts Done Properly) is the standard for shared Claude Artifacts and Sites pages that collect comments or requests from people, or that are built from shared catalog components. Load it FIRST, before writing any HTML and before calling the Artifact or ArtifactData tools, whenever the user wants a new artifact page, board, tracker, dashboard, assistant or record that will be kept, shared or edited again; wants to edit, republish or answer comments on an artifact that already exists or that another session touched; says ADP, adp.py, catalog, kit, theme, template, part id, watch the artifact, requests or presence; wants an existing artifact put on ADP; or is setting ADP up for the first time. Skipping it risks a stale copy overwriting newer versions and rebuilding by hand what the catalog already has."
license: Apache-2.0
metadata:
  version: "2.1.2"
---

# ADP: Artifacts Done Properly

ADP makes a shared Artifact safe to edit: every piece of the page is a part with a stable id and a content hash, comments anchor to part ids, and one ArtifactData layout records every change under a read, hold, publish, record protocol. New artifacts use the adp/2 layout (a thin shell plus files per part, copy stored as data). `adp.py` computes hashes and diffs and prints the exact Artifact and ArtifactData calls, so nothing is retyped by hand.

## Run the tool

`adp.py` lives in `scripts/` of THIS skill's folder. Run it as:

`python3 -I <this skill's folder>/scripts/adp.py <subcommand>`

Use `--help` or a subcommand with no arguments to see its usage; do not guess a subcommand, a guessed one does not exist and costs a turn.

For local Claude/Codex messages, presence and Codex chat delivery, read
[the local bus guide](refs/local-bus.md). Its commands, diagrams and verification
limits are maintained there; run the separate `scripts/adp_bus.py` helper.

## First run: check before anything else

1. Is `~/.adp/config.json` or `./.adp/config.json` present? If yes, ADP is set up: go to the table.
2. If not, run `adp.py setup --dry-run`, then ask the user ONE question: which scope (`user`, `project` or `local`). Run `adp.py setup --scope <answer>`. When nobody can answer (an unattended session), use `user` and say so in your report. It copies the four road skills into the skills folder, writes the config and puts the shipped catalog into `~/.adp/catalog` (never overwriting a file that is there); a road skill folder already there that differs (an older release, or local edits) is replaced by the packaged one, so run it again after installing a newer `adp.skill`. In a plugin install (this skill is listed as `artifacts-done-properly:adp`) it copies none: the plugin serves the road skills itself, so they follow its updates and a copy would only go stale. A config that already exists is kept: setup only adds the keys it lacks and overwrites no value. A real run needs `--scope`: without it, or with `--help`, setup prints its usage and sets nothing up. It only prints the lines it would add to CLAUDE.md; add them with `--yes` only if the user agrees.
3. To onboard just a project folder, run `adp.py init [DIR]`. `init` and `setup --scope project|local` also register the project (name, scope, absolute path) in `~/.adp/projects/<name>/config.json`; `adp.py projects` lists the registered projects, so a project is found from any folder.

## Which road

Choose the host as well as the road. For a Sites page, read [ADP on Sites](refs/sites.md)
before creating, editing or publishing. That guide applies to both Claude and Codex;
use native Sites source/record tools in place of the roads' Claude host calls.

| The user wants | Load skill |
|---|---|
| a new artifact page, board, tracker, assistant or record | `adp-new` |
| to find, use, take or add a catalog component, theme or template | `adp-catalog` |
| to edit or publish an artifact others also work on, or answer its comments | `adp-edit` |
| an existing artifact put on ADP (adopt it, move it to adp/2) | `adp-adopt` |

In a plugin install the road names carry the plugin's prefix, for example `artifacts-done-properly:adp-new`. Each road is also a plain file in this skill's folder, `refs/<road>/SKILL.md` (`refs/<road>/road.md` in a zip install; for example `refs/adp-new/SKILL.md`): when the Skill tool does not know a road, read that file; setup is not needed for it. Each road is complete on its own; the full standard is `~/.adp/catalog/kit/guides/artifact-dataplane.md` (setup puts it there; read it only when a road leaves a question open). Run `adp.py` with no arguments for the real command list; if a road names a command it does not list, the command does not exist.

When a page documents a repository, [source review drift](refs/source-drift.md)
maps committed file changes to affected chapters/parts without model calls.
Use it to report review needs; catalog header drift and runtime integrity check
different boundaries.

## Log

Every `adp.py` command appends one JSON line to `log.jsonl`: in `./.adp/` when a project config exists, else in `~/.adp/`. Show recent lines with `adp.py log -n 20`. Read it first when asked what was done or why something failed.

## Always

- Read the latest version of an artifact before touching it; a local copy from an earlier session may predate other people's work, and publishing from it overwrites theirs.
- Say what a command or a read did not confirm when you tell the user, so they know what to check; this includes whether this session is watching an artifact (only the publish result or the ArtifactComments tool says so). A publish result that says live subscription is not supported from this session means you are not watching: tell the owner in one line, read `requests/` when they say go, and carry on.
