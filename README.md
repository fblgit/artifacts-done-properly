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

ADP comes in two forms:

- **The plugin `artifacts-done-properly`**, for Claude Code: the CLI, and the Code tab of the
  desktop app. A marketplace installs it and brings its updates.
- **`adp.skill`**, a zip, for the Claude desktop app's skill library or a manual install.

### Requirements

- **Python 3** runs ADP. Check it with `python3 --version`. ADP uses only its standard library: no pip, no npm.
- **Node.js** is not needed to use ADP. It is needed to work on ADP itself: `tools/roundtrip.py` and the `adp.js` parity tests run `node` (CI requires it; without it those checks are skipped). Use the current LTS release.

Install Node.js with nvm (macOS, Linux, WSL):

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

Open a new terminal, then:

    nvm install --lts
    node --version

On Windows, use [nvm-windows](https://github.com/coreybutler/nvm-windows) or the installer from <https://nodejs.org>.

### Claude Code: the plugin

1. Add the marketplace, then install the plugin from it:

       /plugin marketplace add fblgit/fblgit-claude-marketplace
       /plugin install artifacts-done-properly@fblgit-claude-marketplace

   The name is `artifacts-done-properly`, not `adp`: the plugin named `adp` is another project
   (the Artifact Data Protocol).
2. You should see five skills, each named with the plugin in front: `artifacts-done-properly:adp`
   and the four road skills `artifacts-done-properly:adp-new`, `artifacts-done-properly:adp-catalog`,
   `artifacts-done-properly:adp-edit` and `artifacts-done-properly:adp-adopt`.
   If not, run `/reload-plugins` or start a new session and check again.
3. Go to "First run" below.

The marketplace route (install and updates) is UNVERIFIED end to end: the listing is not published
yet. If the install does not find the plugin, load it from a clone instead, with no marketplace:

    claude --plugin-dir /path/to/artifacts-done-properly

That loads the plugin for that session only.

The Code tab of the desktop app reads the same settings as the CLI, so a plugin installed for your
user in one shows in the other. That is from the Claude Code docs and UNVERIFIED here.

Updates come through the marketplace. The plugin sets no version, so Claude Code takes the commit
as the version: an update brings whatever is on the repository's default branch.

- `claude plugin update artifacts-done-properly@fblgit-claude-marketplace` updates the plugin.
  Start a new session to load the new version.
- Inside a session, `/plugin marketplace update fblgit-claude-marketplace` refreshes the
  marketplace's listing.
- Background auto-update is off by default for a third-party marketplace. Turn it on under
  `/plugin` > Marketplaces > this marketplace > Enable auto-update.

If you had the zip install before, delete `~/.claude/skills/adp` and the four `adp-*` road skill
folders beside it (in the project's `.claude/skills` when `setup` ran with scope `project` or
`local`): otherwise the old copies can be loaded instead of the plugin's.

### The `adp.skill` zip

`adp.skill` is a zip whose root folder is `adp/`. It holds under 200 files, the most a skill upload
takes: the catalog's kit travels in it as a few JSON packs (`catalog-pack-NN.json`; a zip may not
hold a zip), which `setup` unpacks (see "First
run"). It holds exactly one `SKILL.md`, the most an upload takes: the four road skills are
`refs/<road>/road.md` in it, and `setup` installs them as `SKILL.md`. Get it from the
[latest release](https://github.com/fblgit/artifacts-done-properly/releases/latest), or build it in a clone:
`python3 tools/package.py` writes `dist/adp.skill`. If the release page shows 404, no release is published yet: build it.
The two routes below use it.

**Do not trust the `/reload-skills` message.** It can say "none added or removed" when skills were
added. After every reload, check the skill list instead: the agent lists the skills named `adp*`.

### Claude desktop app (skill library)

1. Open `adp.skill` with the app (double-click or drag it on).
   You should see the dialog **Add "adp" to your library?**
2. Click **Add to library**.
   You should see `adp` in the skill list. If not, start a new session and check again.
3. Go to "First run" below. Whether `setup` finds the library copy's `scripts/adp.py` is UNVERIFIED.

### Claude Code (CLI) without the plugin

The alternative to the plugin: you unpack the zip yourself and update it yourself.
The CLI needs the unpacked folder. Loading the zip directly is UNVERIFIED; do not rely on it.

1. Unpack it so that `~/.claude/skills/adp/SKILL.md` exists:

       mkdir -p ~/.claude/skills
       unzip adp.skill -d ~/.claude/skills
       # no unzip (stock Windows, minimal images); Python expands `~`, the shell may not. UNVERIFIED on Windows:
       python3 -c "import os,zipfile; zipfile.ZipFile('adp.skill').extractall(os.path.expanduser('~/.claude/skills'))"

2. Run `/reload-skills` (required; an open session does not see new skills otherwise).
   You should see `adp` in the skill list.
3. Go to "First run" below.

### First run (all routes)

1. Ask your agent to set ADP up. It runs `python3 -I <skill folder>/scripts/adp.py setup --dry-run`
   and asks you ONE question: scope `user`, `project` or `local`.
2. Answer. It runs `setup --scope <answer>`, which writes `~/.adp/config.json` and puts the kit the
   skill ships into `~/.adp/catalog` (My Own Kit; a file already there is left as it is). From the zip it
   also copies four road skills (`adp-new`, `adp-catalog`, `adp-edit`, `adp-adopt`). In the plugin
   it copies none: the plugin already serves them, and its updates reach them.
   It adds its line to your `CLAUDE.md` only if you agree.
3. CLI without the plugin only: run `/reload-skills` again (required; the road skills are new).
   You should see all four `adp-*` road skills plus `adp` in the skill list.

`setup` does not record a catalog URL. If `~/.adp/config.json` already existed before your first
`setup` (an earlier ADP run, for example), it may point at someone else's catalog. Check it with
`cat ~/.adp/config.json`. If it has a `catalog` you did not choose, move the folder aside, do not
delete it: `mv ~/.adp ~/.adp.bak`. `setup` uses a `~/.adp/` that is already there and never
overwrites a value in an existing config: it only adds the keys the config lacks.

### The catalog

The kit catalog is a published claude.ai artifact: 141 entries (components, themes, page templates,
guides), each with a preview, what it needs and the exact line to take it. Its page, About ADP, is
at <https://claude.ai/artifact/RmnRdmAHDrr4kMsqkEt6Pu> (the owner shares the artifact for view;
until then only they can open it).

1. Point your ADP at it: `python3 -I <skill folder>/scripts/adp.py catalog https://claude.ai/artifact/RmnRdmAHDrr4kMsqkEt6Pu`.
   This saves the URL in `~/.adp/config.json`. `setup` already put the shipped kit into
   `~/.adp/catalog` (My Own Kit), so the command prints Artifact reads only for files that differ
   from the live catalog. Make those reads, then run the same command again: it says
   `complete: true` when every file is local.
2. From then on the agent works from that local copy: `adp.py kit list`, `kit show ID`, `kit describe ID`
   and `suggest` read the entries' headers on disk, and `adp.py take` gives a files map that takes
   an entry by reference, so a taken part costs a few tokens and a written one costs thousands.
3. To update, run `adp.py catalog` again: it lists only what changed.

Maintainers publish and update the catalog as `docs/RELEASING.md` describes ("Publish the catalog").

To update a zip install, install the newer `adp.skill` over the old one and run
`setup --scope <the same scope>` again. It replaces each road skill folder that differs from the
packaged one (an older release or your own edits) and says which. The plugin needs neither: its
updates come through the marketplace (above). `setup` without `--scope`, or with `--help`, prints
its usage and sets nothing up.

To verify a download, see "Verify a download" in `docs/RELEASING.md`.

## Development

`pip install pre-commit && pre-commit install` runs ruff (pyflakes errors), SKILL.md frontmatter validation and the catalog sha256 check on every commit, and gitleaks (secrets, whole history) on every push. CI runs the same checks, plus the unit tests and the bundle build. See `docs/RELEASING.md` for releases.

## License

Apache License 2.0, see `LICENSE`. Redistributions keep `NOTICE`; the `adp.skill` bundle carries both files.

## Citing

`CITATION.cff` has the citation (GitHub shows it as "Cite this repository").

## Host adapter work

The experimental [host adapter contract](docs/host-adapters.md) separates the
existing `adp/2` records from runtime host capabilities. Claude remains the default;
other hosts require an explicit adapter. Agent publishing and native Space Page
integration are separate from the browser connection.
