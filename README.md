# Artifacts Done Properly (ADP) v2.1

**Great work deserves a second life.**
The iteration ends. The value stays.

Your next project starts further ahead.

**Try it:** [ADP: Catalog v2.1.1](https://claude.ai/artifact/F3Do218c6gJXcvV5FkxGhZ) · [ADP: Assistant v2.1.1](https://claude.ai/artifact/F42c7ZcRDKptdaTA5TAqZB) (claude.ai artifacts).

**KnowledgeBase:** [ADP: KnowledgeBase v2.1.1](https://claude.ai/artifact/RTYshZxMp1x97a7paUGBX1) · [codex version](https://adp-knowledgebase.primmaple1.chatgpt.site/).

**Get it now!**: Install the plugin, your AI agent will take care of it.

```
/plugin marketplace add fblgit/artifacts-done-properly
/plugin install artifacts-done-properly@fblgit-adp
/adp setup
```

Once is setup, we suggest that you publish the catalog under your own account. After that, a good starting point is the `assistant` template. It includes agent capabilities that allow you to build your app or artifact from the inside, adopt existing artifacts or websites. It is the ideal starting point for a web-application and is the reccomended path. 

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

- **The plugin `artifacts-done-properly`** (recommended), for Claude Code (the CLI and the Code tab of the desktop app):

      /plugin marketplace add fblgit/artifacts-done-properly
      /plugin install artifacts-done-properly@fblgit-adp
      /adp setup

- **`adp.skill`**, a zip, for the Claude desktop app's skill library: take it from the
  [latest release](https://github.com/fblgit/artifacts-done-properly/releases/latest), open it with the app and click **Add to library**, then ask your agent to set ADP up.

Requirements, manual steps, the `python3` commands, first run, the catalog and updates are in [docs/installation.md](docs/installation.md).

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
native calls and an authorized agent runs them, nothing syncs by itself. The opt-in
[Claude adapter](docs/claude-host-adapter.md) lists what it does and what it does not cover.
