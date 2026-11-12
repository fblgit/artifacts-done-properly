---
name: adp
description: ADP (Artifacts Done Properly) is the standard for claude.ai Artifacts that several agents or sessions work on, take comments over many versions, or are built from shared catalog components. Load it FIRST whenever the task is a new artifact page, board, tracker or record, using or adding catalog components, themes or templates, editing or publishing an artifact more than one agent touches, answering artifact comments, or putting an existing artifact on ADP. Also load it for the first-run setup of ADP. Skipping it risks a stale copy overwriting other versions.
metadata:
  version: "2.0.0"
---

# ADP: Artifacts Done Properly

ADP makes a shared Artifact safe to edit: every piece of the page is a part with a stable id and a content hash, comments anchor to part ids, and one ArtifactData layout records every change under a read, hold, publish, record protocol. New artifacts use the adp/2 layout (a thin shell plus files per part, copy stored as data). `adp.py` computes hashes and diffs and prints the exact Artifact and ArtifactData calls, so nothing is retyped by hand.

## Run the tool

`adp.py` lives in `scripts/` of THIS skill's folder. Run it as:

`python3 -I <this skill's folder>/scripts/adp.py <subcommand>`

Use `--help` or a subcommand with no arguments to see its usage; never guess a subcommand.

## First run: check before anything else

1. Is `~/.adp/config.json` or `./.adp/config.json` present? If yes, ADP is set up: go to the table.
2. If not, run `adp.py setup --dry-run`, then ask the user ONE question: which scope (`user`, `project` or `local`). Run `adp.py setup --scope <answer>`. It copies the four road skills into the skills folder and writes the config. It only prints the lines it would add to CLAUDE.md; add them with `--yes` only if the user agrees.
3. To onboard just a project folder, run `adp.py init [DIR]`.

## Which road

| The user wants | Load skill |
|---|---|
| a new artifact page, board, tracker, assistant or record | `adp-new` |
| to find, use, take or add a catalog component, theme or template | `adp-catalog` |
| to edit or publish an artifact others also work on, or answer its comments | `adp-edit` |
| an existing artifact put on ADP (adopt it, move it to adp/2) | `adp-adopt` |

If a road skill is not installed yet, run setup first. Each road is complete on its own; the full standard is `catalog/kit/guides/artifact-dataplane.md` in this skill's folder (read it only when a road leaves a question open). Run `adp.py` with no arguments for the real command list; if a road names a command it does not list, the command does not exist.

## Log

Every `adp.py` command appends one JSON line to `log.jsonl`: in `./.adp/` when a project config exists, else in `~/.adp/`. Show recent lines with `adp.py log -n 20`. Read it first when asked what was done or why something failed.

## Always

- Read the latest version of an artifact before touching it; a local copy from an earlier session is never the source.
- Anything not confirmed by a command or a read is marked UNVERIFIED in what you tell the user.
