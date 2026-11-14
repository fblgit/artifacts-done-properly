# Artifacts Done Properly (ADP) v2.0

**Great work deserves a second life.**
The iteration ends. The value stays.

Your next project starts further ahead.

## 01 / Bring it in: give good work a home

Bring interfaces, records, and artifacts into a project with your agents. Make the useful parts discoverable instead of burying them in a chat.

## 02 / Make it reusable: keep the mechanics

A kit carries more than pixels: an interface, declared dependencies, and examples another agent can inspect and compose.

## 03 / Keep the gain: build on your best version

A growing catalog gives you more to start from. Refinement becomes an investment you can carry across pages and projects.

**Great work deserves a second life.**

Your next project starts further ahead. The iteration ends. The value stays.

**01 / Bring it in. Give good work a home.**
Bring interfaces, records, and artifacts into a project with your agents. Make the useful parts discoverable instead of burying them in a chat.

**02 / Make it reusable. Keep the mechanics.**
A kit carries more than pixels: an interface, declared dependencies, and examples another agent can inspect and compose.

**03 / Keep the gain. Build on your best version.**
A growing catalog gives you more to start from. Refinement becomes an investment you can carry across pages and projects.

## Install

ADP ships as `adp.skill`, a zip whose root folder is `adp/`. Get it from the
[latest release](https://github.com/fblgit/artifacts-done-properly/releases/latest), or build it in a clone:
`python3 tools/package.py` writes `dist/adp.skill`. If the release page shows 404, no release is published yet: build it.
Python 3 is the only requirement.

**Do not trust the `/reload-skills` message.** It can say "none added or removed" when skills were
added. After every reload, check the skill list instead: the agent lists the skills named `adp*`.

### Claude desktop app

1. Open `adp.skill` with the app (double-click or drag it on).
   You should see the dialog **Add "adp" to your library?**
2. Click **Add to library**.
   You should see `adp` in the skill list. If not, start a new session and check again.
3. Go to "First run" below. Whether `setup` finds the library copy's `scripts/adp.py` is UNVERIFIED.

### Claude Code (CLI)

The CLI needs the unpacked folder. Loading the zip directly is UNVERIFIED; do not rely on it.

1. Unpack it so that `~/.claude/skills/adp/SKILL.md` exists:

       mkdir -p ~/.claude/skills
       unzip adp.skill -d ~/.claude/skills
       # no unzip (stock Windows, minimal images); Python expands `~`, the shell may not. UNVERIFIED on Windows:
       python3 -c "import os,zipfile; zipfile.ZipFile('adp.skill').extractall(os.path.expanduser('~/.claude/skills'))"

2. Run `/reload-skills` (required; an open session does not see new skills otherwise).
   You should see `adp` in the skill list.
3. Go to "First run" below.

### First run (both)

1. Ask your agent to set ADP up. It runs `python3 -I <skill folder>/scripts/adp.py setup --dry-run`
   and asks you ONE question: scope `user`, `project` or `local`.
2. Answer. It runs `setup --scope <answer>`, which copies four road skills
   (`adp-new`, `adp-catalog`, `adp-edit`, `adp-adopt`) and writes `~/.adp/config.json`.
   It adds its line to your `CLAUDE.md` only if you agree.
3. CLI only: run `/reload-skills` again (required; the road skills are new).
   You should see all four `adp-*` road skills plus `adp` in the skill list.

`setup` does not record a catalog URL. If `~/.adp/config.json` already existed before your first
`setup` (an earlier ADP run, for example), it may point at someone else's catalog. Check it with
`cat ~/.adp/config.json`. If it has a `catalog` you did not choose, move the folder aside, do not
delete it: `mv ~/.adp ~/.adp.bak`. `setup` uses a `~/.adp/` that is already there and never
overwrites a value in an existing config: it only adds the keys the config lacks.

To update, install the newer `adp.skill` over the old one and run `setup --scope <the same scope>`
again. It replaces each road skill folder that differs from the packaged one (an older release or
your own edits) and says which. `setup` without `--scope`, or with `--help`, prints its usage and
sets nothing up.

To verify a download, see "Verify a download" in `docs/RELEASING.md`.

## Development

`pip install pre-commit && pre-commit install` runs ruff (pyflakes errors), SKILL.md frontmatter validation and the catalog sha256 check on every commit, and gitleaks (secrets, whole history) on every push. CI runs the same checks, plus the unit tests and the bundle build. See `docs/RELEASING.md` for releases.

## License

Apache License 2.0, see `LICENSE`. Redistributions keep `NOTICE`; the `adp.skill` bundle carries both files.

## Citing

`CITATION.cff` has the citation (GitHub shows it as "Cite this repository").
