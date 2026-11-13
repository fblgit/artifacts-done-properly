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

ADP ships as one file, `adp.skill` (a zip whose root folder is `adp/`). Get it from the
[latest release](https://github.com/fblgit/artifacts-done-properly/releases/latest), or build it
from a clone with `python3 tools/package.py` (output: `dist/adp.skill`). Then pick the path that
matches where you run Claude.

### Claude desktop app (Mac, Windows)

1. Open `adp.skill` with the Claude desktop app (double-click it, or drag it onto the app).
2. Review the contents in the **Add "adp" to your library?** dialog and click **Add to library**.

### Claude Code in a terminal (CLI)

The CLI loads skills from folders, not from a `.skill` zip, so you must unpack it yourself.

1. Copy `adp.skill` into your skills folder, then unzip it so that `~/.claude/skills/adp/SKILL.md` exists:

       mkdir -p ~/.claude/skills
       unzip adp.skill -d ~/.claude/skills
       # no unzip (stock Windows, minimal images):
       python3 -m zipfile -e adp.skill ~/.claude/skills

2. In your Claude Code session run `/reload-skills`. **This step is required.** A session that
   was already open does not see the new skill until you reload, so skipping it looks like a failed install.
3. Check it loaded: `adp` should be in the skill list.

### First run (all paths)

Ask your agent to set ADP up. It runs `python3 -I <skill folder>/scripts/adp.py setup --dry-run`,
asks you which scope you want (`user`, `project` or `local`), then runs `setup --scope <answer>`.
Setup copies the four road skills (`adp-new`, `adp-catalog`, `adp-edit`, `adp-adopt`) and writes
`~/.adp/config.json`. It only prints the line it would add to your `CLAUDE.md`; nothing is added
unless you agree. Python 3 is the only requirement; there is no pip or npm step.

To verify a download, see "Verify a download" in `docs/RELEASING.md`.

## Development

`pip install pre-commit && pre-commit install` runs ruff (pyflakes errors), SKILL.md frontmatter validation and the catalog sha256 check on every commit, and gitleaks (secrets, whole history) on every push. CI runs the same checks, plus the unit tests and the bundle build. See `docs/RELEASING.md` for releases.

## License

Apache License 2.0, see `LICENSE`. Redistributions keep `NOTICE`; the `adp.skill` bundle carries both files.

## Citing

`CITATION.cff` has the citation (GitHub shows it as "Cite this repository").
