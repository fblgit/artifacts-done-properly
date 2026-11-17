# Artifacts Done Properly (ADP) v2.1

**Great work deserves a second life.**
The iteration ends. The value stays.

Your next project starts further ahead.

**Try it:** [ADP: Catalog v2.1.1](https://claude.ai/artifact/F3Do218c6gJXcvV5FkxGhZ) · [ADP: Assistant v2.1.1](https://claude.ai/artifact/F42c7ZcRDKptdaTA5TAqZB) (claude.ai artifacts; the owner shares them for view).

## What ADP is

ADP is a framework and shared library for reusable claude.ai Artifacts. It installs as a Claude skill.

Good work gets a home in a project. Its reusable pieces go into a catalog as kits, each with an interface, declared dependencies and examples. The next page takes them by reference and starts from your best version.

Underneath, every piece of a page is a part with a stable id and a content hash, and one database layout records every change. `adp.py` prints the exact Artifact and ArtifactData calls to make, so nothing is retyped by hand.

- **4** road skills: new, edit, adopt, catalog
- **3** templates: starter, assistant, default
- **141** entries in the base catalog

## 01 / Bring it in: give good work a home

Bring interfaces, records, and artifacts into a project with your agents. Make the useful parts discoverable instead of burying them in a chat.

**Every piece gets an address.** On ADP, every piece of a page is a part: a block with a stable id, such as `triage.keys-table`, and a hash of its content. The id never changes once the page is published, so anything that points at it keeps pointing at the right place. That is what makes the page a place to work in rather than a file to replace. A comment anchors to a part id, not to a position on the screen. A change shows up on the part it touched and on every part that contains it.

**Every change goes on the record.** One ArtifactData layout records every change under a read, hold, publish, record protocol. Before anyone edits, they read the latest version, because a copy from an earlier session may predate other people's work. After they publish, the change is recorded with who made it, the parts it touched and a summary. The page shows the newest of those in its What changed panel.

**Your agents work in it with you.** The assistant template adds a Work with Claude pane. Pick a block, say what you want (a change, a fix, a design note or a question) and send it. The request is a record on the page, so you can follow it on Requests: queued, seen, working, done. A line in the header says whether a Claude Code session is watching. Without one, Ask now still answers straight away, and anything you send waits in the queue.

**Start new, or bring in what you have.** A new page starts from a template:

    python3 -I <adp skill folder>/scripts/adp.py new assistant my-page

An artifact you already have goes through the `adp-adopt` road. It wraps each view and section in part markers, checks them, and seeds the record, without changing how the page looks or behaves. That first step alone gives the page part ids and comment anchors.

## 02 / Make it reusable: keep the mechanics

A kit carries more than pixels: an interface, declared dependencies, and examples another agent can inspect and compose.

**More than pixels.** Copying a component's look is easy. What gets lost is how it works: what you call, what it needs and how it is meant to be used. On ADP, a kit keeps all three:

- An interface: the functions it provides and how to configure them.
- Declared dependencies: the other entries it requires, plus the design tokens and data it reads.
- Examples: sample files that show it in use.

**Every entry describes itself.** Each catalog entry carries one comment at the top of its main file. The first line is its name, the next paragraph says what it is, and tags give the facts. This is the real header of the data table kit, trimmed (`kit/table.js`):

    /**
     * Data table
     * ...
     * @id        kit.table
     * @group     Board kit
     * @version   0.1.0
     * @summary   A table in its own scroll frame with a sticky head, numeric columns, ...
     * @requires  none
     * @provides  Kit.table.render, Kit.table.fmt
     * @config    Kit.table.render(box, opts) | columns [...], rows, group, ...
     */

The entry also lists its files with a role each: here a script, a style and a sample.

**Another agent can inspect it.** An agent does not have to read the source to use a kit. It can ask:

    adp.py kit show kit.table       # name, summary, about, tags, files, requires, provides
    adp.py kit describe kit.table   # the mount signature: needs, provides, requires, files, sample

**And compose it, by reference.** `adp.py take` resolves the entries you name and everything they require, dependencies first and each once. It prints a files map that goes straight into the Artifact publish call, and the server copies the files across. Nothing is downloaded, retyped or pasted.

    adp.py take CATALOG kit.table

Components use design tokens only, so a theme changes the look without touching the kit files.

## 03 / Keep the gain: build on your best version

A growing catalog gives you more to start from. Refinement becomes an investment you can carry across pages and projects.

**More to start from.** A page built with ADP does not start from a blank file. The base catalog has 141 entries: components, patterns, charts, layouts, themes, templates and guides. Each one is versioned and hashed file by file. By kind: 53 patterns, 30 charts and visualisations, 27 kit components, 14 themes, 9 layouts, 5 templates, 2 guides and the runtime.

**Templates that stack.** The three templates build on each other. `starter` is the shell, the runtime, a welcome view, settings and the What changed panel. `assistant` adds the Work with Claude pane, the Requests view and presence. `default` adds every theme, the canvas, 3D and the common kits, taken by reference.

**Find it before you rebuild it.** Before building something by hand, ask the catalog:

    adp.py suggest CATALOG --for "budget table with totals"

It ranks entries by how well they match on tags, name, summary and what they provide, and says why each matched. No model call is involved.

**Refinement becomes an investment.** When a component has been through rounds of refinement, that work does not have to stay in one page. Once it is in the catalog, the next page takes it by reference and starts from your best version, across pages and projects.

Not there yet: `adp.py new --tier full`, the tier meant to start a page from the published catalog (it exits with "not available yet"), and a command to add catalog entries. For now, an entry is added by editing files under `catalog/kit/` and then running `adp_catalog.py build`.

## Journeys

Eight real runs with Claude, from setting up ADP to remaking an existing artifact on it. Each one shows a beat of the pitch.

1. **Zero to setup.** An agent opens an ADP page and finds the note its authors left in the source. It tells its user the page was built with ADP and asks if they want it. Only after their yes is ADP installed, on a fresh machine. *Bring it in.*
2. **New artifact.** A new multi-view page composed from the catalog, then pushed through two rounds of "is this the best you can ship?". *Keep the gain.*
3. **Catalog road.** Planning a page: which catalog parts fit, what they need, and the exact way to take them. Nothing is built. *Make it reusable.*
4. **Edit protocol.** Renaming a column on a page other sessions also edit, the safe way: read, hold, publish, record. *Bring it in.*
5. **Adopt road.** A plain reading list with search, filters, notes and its own data, put on ADP without changing its look. *Bring it in.*
6. **Finesse rounds.** Requests sent from the page's Work with Claude pane, one round each: structure and type, themes with a live switcher, surfaces and colour, motion and states, interaction, and the last 1%. *Keep the gain.*
7. **Harvest into the catalog.** The reusable parts of an existing artifact become catalog entries, then a fresh page takes one of them by reference. *Make it reusable and Keep the gain.*
8. **Remake on ADP.** An existing plan reimagined as a new ADP page that drives the initiative to completion, while the original stays untouched. *Keep the gain.*

## Install

ADP comes in two forms:

- **The plugin `artifacts-done-properly`** (recommended), for Claude Code: the CLI, and the Code tab
  of the desktop app. A marketplace installs it and brings its updates.
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
3. Type `/adp setup` and answer the scope question (`user`, `project` or `local`). In the plugin,
   `setup` copies no skills (the plugin serves them) and writes the config. See "First run" below.

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
existing `adp/2` records from runtime host capabilities: records, viewer, comments and the host's
`agent`, `publish` and `ask` handles (`ADP.agent()`, `ADP.publish()`, `ADP.ask()`). Claude remains the default;
other hosts require an explicit adapter, and OpenAI Sites has one ([docs/openai-host-adapter.md](docs/openai-host-adapter.md)).
A page's records move between Claude and Sites with the shared records shell
(`adp.py bundle`, `import-plan`, `import-ack`; [docs/adp-export-import.md](docs/adp-export-import.md)): it prints the
native calls and an authorized agent runs them, nothing syncs by itself. Live runs on both hosts are recorded on PR #81;
native Space Page integration is not implemented. The opt-in
[Claude adapter](docs/claude-host-adapter.md) lists what it does, what was observed live and what it does not cover.
