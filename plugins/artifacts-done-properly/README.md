# ADP: Artifacts Done Properly

ADP is a standard and a shared component catalog for claude.ai Artifacts and Sites pages that people and several agents keep editing.
This plugin gives Claude five skills: `adp` (the base skill, with the `adp.py` command line, templates and the catalog) and the four road
skills `adp-new`, `adp-catalog`, `adp-edit` and `adp-adopt`.

## Install

In Claude Code:

    /plugin marketplace add fblgit/artifacts-done-properly
    /plugin install artifacts-done-properly@fblgit-adp
    /adp setup

`/adp setup` asks for a scope (`user`, `project` or `local`), writes `~/.adp/config.json` and puts the shipped catalog in `~/.adp/catalog`.
It needs Python 3 and nothing else: ADP uses only the standard library.

For the Claude desktop app, take `adp.skill` from the [latest release](https://github.com/fblgit/artifacts-done-properly/releases/latest).
The full guide, the project README and the development docs are in the
[repository](https://github.com/fblgit/artifacts-done-properly).
