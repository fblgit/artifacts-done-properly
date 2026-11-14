# ADP architecture

This document describes what the code in this repository does. Each claim names the file and function (or the section of a file) where it can be checked; line numbers are not used because they move. Where a comment and the code disagree, this document states what the code does.

Related documents: `docs/themes.md` (themes, their fonts and changing the look), `docs/assist.md` (the page that works with Claude: contracts 3 and 5), `docs/config.md` (the switches in `config/current`), `docs/catalog-header.md` (the header every catalog entry carries).

Contents: 1 What ADP is, 2 The adp/2 artifact layout, 3 Parts and hashes, 4 The manifest and the database, 5 The runtime, 6 The loop, 7 The catalog and reuse, 8 Where things live.

## 1. What ADP is

ADP (Artifacts Done Properly) is a standard for claude.ai Artifacts that several agents or sessions work on (`skill/SKILL.md`). Every piece of the page is a *part* with a stable id and a content hash; comments anchor to part ids; one ArtifactData layout records every change under a read, hold, publish, record protocol (`skill/catalog/kit/guides/artifact-dataplane.md`, sections 1 to 4). New artifacts use the adp/2 layout: a thin shell plus files per part, with the page's copy stored as data. `skill/scripts/adp.py` computes hashes and diffs and prints the exact `Artifact` and `ArtifactData` calls to make; it does not call them itself. `skill/assets/adp.js` is the runtime that runs in the page.

The repository ships one skill, `adp` (`skill/SKILL.md`), and four road skills under `skill/refs/`: `adp-new`, `adp-catalog`, `adp-edit`, `adp-adopt`. `adp.py setup` copies the four into a skills folder (`setup_cmd` in `adp.py`), except in a plugin install: the repository is also the Claude Code plugin `artifacts-done-properly` (`.claude-plugin/plugin.json`), which serves all five skills itself, so setup copies none.

## 2. The adp/2 artifact layout

`adp.py new` builds this layout in a directory (DIR) at its published paths (`new`, `base_chain`, `real_name`, `seed_file` in `adp.py`):

| Path in DIR | What it is | Source |
|---|---|---|
| `index.html` | The thin shell: `page.header` (with `page.lead` and the What changed panel `page.changes`), `page.tabs`, an empty `<main id="views">`, `<script>` tags. Stored bare; the published page carries the Artifact tool's document skeleton (`unwrap` in `adp_loop.py` strips it on export). | the template's `index.html.txt` |
| `adp.js` | The runtime (section 5). Always copied from `skill/assets/adp.js`, not from a template, and not passed through `{{title}}` substitution. | `skill/assets/adp.js` |
| `content.js` | `window.ADP_CONTENT = {<part id>: {part, title, html}, ...}`: the baseline copy of the parts. The db overrides it live (section 5). `content_of` in `adp.py` reads it with a regex over `window.ADP_CONTENT = {...};`. | the template's `content.js.txt` |
| `parts/*.js` | Page code, one file per part family (the starter has `parts/app.js`). | the template |
| `styles/*.css` | Page styles (the starter has `styles/page.css`; the assistant adds `styles/assist.css`). | the template |
| `seed.json`, `seed/pack-NNN.json` | The first database docs (section 5, Seeding). Written by `adp.py new` and `adp.py seed`. Published with the page but never in the manifest (`is_seed`). | `seed_file` |

Files from the kit (`kit/...`) are not copied into DIR. A template's `take` list names catalog entries; `new` merges them into its publish object as by-reference entries when a catalog index is available (section 7). They are therefore not part of `manifest_dir(DIR)`.

**Template layers.** `base_chain(name)` returns the template and its `base` chain, base first; each layer overrides files of the same name. `default` is based on `assistant`, which is based on `starter` (`skill/templates/*/template.json`). Template files carry a `.txt` suffix; `real_name` drops it when the remaining name still has an extension (`index.html.txt` becomes `index.html`; a file such as `notes.txt` keeps its name). `{{title}}` and `{{slug}}` are substituted in every copied file except `adp.js`.

**What is served.** `SERVED` in `adp.py` is the set of extensions the artifact service serves: `.html .css .js .mjs .wasm .json .map .geojson .webmanifest .txt .md .csv .xml .svg .png .jpg .jpeg .gif .webp .avif .ico .woff .woff2 .ttf .otf .mp3 .wav .ogg .mp4 .webm .pdf`. `publish_args` maps every file of DIR whose extension is in `SERVED` (paths starting with `.` excluded, `index.html` being the page itself) to itself in the `files` map of the publish call, and lists the others under `skipped`. `adp.py files` splits a publish over 250 files (`LIMIT`) into `batches`, each also written to `DIR.adp/publish-N.json`.

## 3. Parts and hashes

Contract 6 of this document: the part hash and the page hash are computed identically by `adp.py` and `adp.js`.

**Markers.** A part is the text between two comment markers, in the comment syntax of the spot:

```
<!-- part:ID -->  ...  <!-- /part:ID -->
/* part:ID */     ...  /* /part:ID */
```

The marker pattern is `MARK` in `adp.py` and in the pure section of `adp.js`: `<!--` or `/*`, optional whitespace, optional `/`, `part:`, the id, optional whitespace, `-->` or `*/`.

**Id grammar.** `ID` in `adp.py`: dot-separated segments, each `[a-z0-9][a-z0-9-]*` (for example `triage.keys-table`). Ids are unique across the files of one DIR (`manifest_dir` exits on a duplicate).

**Nesting.** Parts may nest and must balance within one file. `parse` (`adp.py`) and `markers` (`adp.js`) keep a stack; they report `opened twice`, a close that does not match the innermost open part, and `never closed`. A part's recorded parent is the part enclosing it, or `''` for a top-level part.

**data-part.** The root element a part renders carries `data-part="<id>"` (and `data-comment-target`, which `check` only warns about). `adp.py check` fails when a part has no `data-part="<id>"` in the page (ids starting `page.style` or `page.script` are exempt) and when a `data-part` value has no markers.

**The `_rest` bucket.** Text outside every top-level part, with the markers removed, is hashed as the pseudo-part `_rest` (`own(text, parts, '')` in `adp.py`, `restOf` in `adp.js`). In a DIR, each file with markers has its own, named `_rest:<path>` (`manifest_dir`). A file without markers has no parts and no `_rest`.

**Part hash.** `H(norm(text between the markers))` where `norm` collapses every whitespace run to one space and trims, and `H` is the first 12 hex characters of the SHA-256 of the UTF-8 text (`H`, `norm` in `adp.py`; `H`, `norm` in `adp.js`). The text between a parent's markers includes its children and their marker comments, so a change shows on the part and on every ancestor.

**Page hash.** `H` of the lines `<id>=<hash>` (every part and `_rest`), sorted, followed by the lines `file:<path>=<first 12 hex of the file's SHA-256>`, sorted, joined with `\n`. In a DIR, `files` covers every file except dotfiles, the root `seed.json` and `seed/` (`load`, `manifest_dir`). Single-file form: `manifest` in `adp.py` (schema `adp/1`); directory form: `manifest_dir` (schema `adp/2`, which adds `part_file {id: path}`). Both also emit `elements` (the count of opening tags in a part's own text, children excluded) and `parents`.

**Mirror in the runtime.** `skill/assets/adp.js` re-implements the same rule in its pure section: `MARK`, `norm`, `H`, `markers`, `restOf`, `hashText`, exported as `ADP.hash`. The runtime names the page's own `_rest` just `_rest`, and does not compute `elements`.

The two implementations must agree, because the page hashes itself at open and compares with the manifest `adp.py` wrote (section 5, Integrity). No file in `tests/` executes `adp.js` (the test suite is Python only), so nothing in CI checks that agreement. `tools/check_catalog.py` checks only that the catalog's copy of `adp.js` is byte-identical to `skill/assets/adp.js`.

## 4. The manifest and the database

The record of a page is a set of ArtifactData collections. `adp.py` prints writes as batches of at most 50 docs (`Batch.emit`), each doc in its own file, with `if_version` for every doc whose version was passed in `--pins` (`Batch.put`). `manifest/current` goes last (`Batch.emit(last=('manifest',))`).

`manifest/current` fields (`man_doc` in `adp.py`): `schema`, `version`, `page_hash`, `parts {id: hash}`, `elements`, `files {path: first 12 hex}`, `part_file`, `content {part id: H(html) of the content.js entry}` (hashed raw, without `norm`), `at`, `by`.

| Collection / doc | Written by | Read by | Fields (from the code) |
|---|---|---|---|
| `manifest/current` | `adp.py seed` (last doc), `adp.py record` | `adp.js` integrity; `adp.py export` (`version`, `page_hash`) | see above |
| `parts/<id>` | `seed`, `record` (set when added, update when changed, delete when removed), `hold` (`holder`, `hold_until`) | `adp.py export` | `title`, `parent`, `hash`, `version`, `at`, `by`, `summary`, `holder`, `hold_until`, `file` |
| `content/<part id>` | `seed` (from `content.js`; an empty `html` gets no doc); later edits are ArtifactData writes by agents (guide section 7) | `adp.js` (`watchContent`, field `html`); `export` | `part`, `title`, `html`, `at`, `by`, `since` |
| `changes/<id>` | `seed` (`000001`), `record` (`<seq>` zero-padded to 6), `config set` and `propose` and `adp.js` when it saves a setting (`d-<ms>`) | `adp.js` (newest 10 by `at`); `export` | `version`, `at`, `by`, `summary`, `parts [{id, from, to}]`, `threads`, and `data [{doc}]` on data changes |
| `decisions/<slug>` | not written by `adp.py` or `adp.js` | `adp.js` (`status == 'active'`: `quote`, `at`, `parts`); `export` | per the guide, section 3 |
| `threads/<id>` | `record --threads` updates `status: done`, `holder: ''`, `done_in` | no code in this repo reads it | `status`, `holder`, `done_in` |
| `agents/<id>` | `seed` (`role`, `session`, `last_seen`, `holds`), `hold`, `record`; `<id>` is `agent_id(--by)` | `export` | `role`, `session`, `last_seen`, `holds` |
| `incoming/<pid>` | `adp.py propose` (status `new`); the page's Incoming flow (`docs/assist.md`) changes the status | `adp.js` Incoming list; `export`; `ack --proposal` | `by`, `at`, `summary`, `threads`, `base {version, page_hash, docs}`, `parts`, `files`, `live_files`, `classified`, `status`, `decided {by, at, reason}`, `applied {version, at}` |
| `incoming/<pid>/chunks/<n>` | `propose`, for a file over `CHUNK` (200 KiB) | the page's apply flow | `path`, `n`, `of`, `content` |
| `config/current` | `adp.py config set`; `adp.js` (`ADP.config.set`, `reset`) | `adp.js`; `adp.py config` (from a saved copy) | `schema: 'adp-config/1'`, `at`, `by`, `values`, `changed` |
| `checks/latest` | `adp.js`, only when the viewer can edit | no code in this repo reads it (the guide, section 7, says to read it after a publish) | section 5 |
| `status/integrity` | `adp.js` at open | no code in this repo reads it | section 5 |
| `status/seed` | `adp.js` while and after seeding | no code in this repo reads it | while seeding: `state: 'seeding'`, `done`, `total`, `from`, `opened_by`, `at`; at the end: `state: 'done'`, `from`, `version`, `by`, `opened_by`, `docs`, `packs`, `at` |
| `requests/<rid>`, `requests/<rid>/turns/<NNNN>`, `presence/<name>` | the page (`docs/assist.md`); `adp.py requests` writes the replies | `export` (pending replies); `adp.py requests` | `docs/assist.md` |
| `conversations` | declared in the `assistant` and `default` rules only; neither `adp.py` nor `adp.js` touches it | | `docs/assist.md` |
| `ns/<name>/...` | page code through `ADP.ns(name)`, which returns `{doc, collection}` under the prefix `ns/<name>/` | | the page's own |

`adp.py export` asks for these collections (`CANON` in `adp_loop.py`): `manifest`, `parts`, `content`, `changes`, `config`, `requests`, `presence`, `agents`, `decisions`, `incoming`.

**Database rules the templates declare** (`capabilities.db.rules` in `skill/templates/*/template.json`; the same list is embedded in each `index.html` as `<meta name="adp:db-rules">`, which `kit/patterns/namespaces.js` reads):

| Path | `read` | `write` | starter | assistant, default |
|---|---|---|---|---|
| `""` (everything) | view | admin | yes | yes |
| `ns/shared` | view | interact | yes | yes |
| `ns/users/{self}` | view | interact | yes | yes |
| `requests` | view | interact | no | yes |
| `conversations` | view | interact | no | yes |
| `presence` | view | interact | no | yes |

The templates also declare `user: {}`, `comments: {customAnchors: true}` and `artifact: {}`; `assistant` and `default` add `sample: {}`. `adp-adopt` suggests `{path: "", read: "view", write: "admin"}` alone for a page without the assistant (`skill/refs/adp-adopt/SKILL.md`).

## 5. The runtime

`skill/assets/adp.js` is one script, loaded after `<meta name="adp:build" content="<n>">` and before the page's own scripts. The page calls `ADP.page({view, expected, titles, legacy, all, reveal})` once its views exist; this stores the config and schedules the self-check (`later`). Everything else starts at load, in the boot block at the end of the file. When `window.claude.use` is missing the runtime only resolves the config as ready.

**Content as data.** `ADP.content(id)` returns the `html` of `content/<id>` from the db if present, else from `window.ADP_CONTENT` (`content.js`), else records `content missing: <id>`. `watchContent` subscribes to the `content` collection; on a change it repaints every `[data-part="<id>"]` element's `innerHTML`.

**What changed panel.** `changesPanel` fills `#wcChanges` from `changes` (newest 10 by `at`), `#wcDecisions` from `decisions` where `status == 'active'`, and adds an Incoming list (`#wcIncoming`, created if absent) from `incoming`: the newest 10 by `at`, with the status labels `new`, `merged`, `held`, `applied`, `declined`. The panel hides per the `panel.changes` switch (`hideChanges`).

**Comment anchors.** An anchor is `<part id>` or `<part id>:<data-part-key>` (`parse`). `anchors()` registers `comments.customAnchors` handlers: a click in comment mode on the nearest `[data-part]` ancestor (not inside `[data-uncommentable]`) calls `compose(anchorOf(el), el, {label})`; the thread list is placed on the matching visible element (`place`); `reveal` asks `PAGE.reveal(id, key)` to open the view that holds the part. `PAGE.legacy` maps old anchor strings to part ids. A part under a `parts.locked` prefix is labelled locked in the composer.

**Integrity at open.** `integrityAt` hashes `document.documentElement.outerHTML` with `hashText`, reads `manifest/current`, and compares the hashes of the parts present in both (the page's `_rest` is named `_rest`, a DIR manifest names it `_rest:<path>`, so it is never compared). A part is *edited* when `content/<id>` in the db differs from the `content.js` baseline; *files ahead* when the page's hash differs from the manifest's and the part is not edited. Verdicts: `consistent`, `files_ahead`, `record_ahead`, `mixed` (with no manifest: `record_ahead` when there are edited parts, else `consistent`). The result `{at, by: 'page', page_hash, parts, verdict, drift}` is written to `status/integrity`; if the write is refused it is kept in memory and shown by the badge (`[data-adp-integrity]`, switch `panel.checks`).

**Self-check.** `check` runs 1.5 s after the last trigger (`later`). It sets `window.ADP_CHECK` and, when the viewer can edit and a db exists, writes `checks/latest` (`update`, falling back to `set`) only when the body changed. Body fields: `build`, `view`, `ok`, `missing` (expected parts with no `[data-part]` element; `page.header`, `page.tabs`, `page.changes` plus `PAGE.expected(view)`), `unmarked` (`[data-part]` values not in `PAGE.all`), `overflow_x`, `width`, `errors`, `content {source: 'db'|'file', db_docs, file_docs}`, `locked`, `config_at`, `fetch_sibling` (a probe fetch of `content.js`), `anchors {anchors, threads, placed, unknown}`, `views`, `seeded`, `integrity`, and `at`.

**Seeding on first open.** When a db exists and the viewer can edit, `seedFromFile` runs before anything reads the record. If `manifest/current` exists it does nothing. Otherwise it fetches `seed.json` (schema `adp-seed/2`: `packs` lists `seed/pack-NNN.json`; `adp-seed/1` held the docs inline in `docs`), fetches every pack first, filters to docs with a string `collection`, a string `id` and an object `data`, writes them six at a time, and writes `manifest/current` last, then `status/seed`. While it runs it shows a first-open sheet. `adp.py` side (`seed_file`): the index holds `schema`, `version`, `by`, `at`, `docs`, `collections` (a count per collection), `packs`, `overrides` (read by `adp.py` only), and optionally `role` and `summary`; a pack is `{schema: 'adp-seed/2', pack, of, docs: [{collection, id, data}]}`; packs hold up to `PACK` bytes of JSON each (default 1,500,000; environment `ADP_PACK`); the generated docs are `parts`, `content`, `changes/000001`, `agents`, then `manifest/current`, preceded by any `--data` docs for collections `adp.py` does not generate; a `--data` doc for a generated collection merges into the generated doc (`seed_docs`). `adp.py seed --batches` prints the same docs as ArtifactData batches instead.

**Settings.** `ADP.config` carries the switches in `config/current` (groups `edit`, `parts`, `comments`, `panel`, `playground`, `look`, `links`, `log`); see `docs/config.md`. `adp.py` keeps a mirror (`CORE`) for `config` and for the locks `hold` and `record` honour.

**Public surface** (`Object.freeze` at the end of `adp.js`): `ADP.build`, `ADP.content(id)`, `ADP.page(cfg)`, `ADP.config` (itself frozen: `define`, `get`, `all`, `on`, `set`, `reset`, `ready`, `doc`), `ADP.user` (`{canEdit, id}`), `ADP.ns(name)`, `ADP.classify(base, live, incoming)`, `ADP.hash(text, files)`, and the getters `ADP.integrity`, `ADP.seeded`, `ADP.db`. It also sets `window.ADP_CHECK` and `window.ADP_SEED`.

**One runtime.** `skill/catalog/adp.js` (catalog entry `runtime.adp`) is byte-identical to `skill/assets/adp.js`; `tools/check_catalog.py` fails when they differ.

## 6. The loop

The loop moves an agent's local copy of a page and the live page toward each other without overwriting either: `export` (live to local), `classify`, `propose` (local to live), `ack`, and `gate` (a hook that blocks writes while something is unresolved). Commands are in `skill/scripts/adp_loop.py`, imported by `adp.py`. Each reads what the model fetched from files (or a hook input on stdin); none calls a tool. This section holds the contracts the code cites by number.

| # | Contract | Where it is implemented |
|---|---|---|
| 1 | The state file | `load_state`, `save_state`, `export`, `propose`, `ack` |
| 2 | The registry and the nested repository | `registry`, `register`, `repo_init`, `commit_tree`, `merge3` |
| 3 | Propose: the `incoming/<pid>` doc and its batch | `propose`; the document is `docs/assist.md` |
| 4 | Classify: the table of section 6.3 | `classify3`, `classify` in `adp_loop.py`; `classify` in `adp.js`; `adp.py classify` |
| 5 | The page end: an editor applies or declines a proposal in `incoming/` | `docs/assist.md`; `adp.js` lists it; `ack --proposal` consumes `applied` or `declined` |
| 6 | The part and page hash | section 3 |
| 7 | The gate | `gate`, `decide` |

The numbering is this document's. The code cites it as follows: `adp_loop.py` ("contracts 1 and 2" for the block on state, registry and nested repository, "contract 3" at `propose`, "contract 4" at `classify3`, "contract 7" at `gate`); `adp.js` ("contracts 4 and 6" over the pure section that holds the part hash and the classification, "contract 5" at the Incoming list); `kit/patterns/inbox.js` ("contract 4", "contracts 3 and 5").

### 6.1 Where state lives

| Place | Contents | Written by |
|---|---|---|
| `DIR.adp/` (a sibling folder of DIR: DIR with `.adp` appended, `adir`) | `state.json`; `listing.json` and `docs.json` (default inputs of `export`); `incoming/`; `repo/`; `propose-<pid>.json` and its batch files; `publish-N.json`; the default `--out` of `hold`, `record`, `seed --batches` | `export`, `propose`, `ack`, `files`, `hold`, `record`, `seed` |
| `DIR.adp/incoming/` | `files.json`, `files/` (live files as read), `content/<id>.html`, `db/<collection>/<id>.json`, `live-manifest.json`, `report.json` | `export` |
| `~/.adp/` (`ADP_HOME`, overridable by the environment variable `ADP_HOME`) | `artifacts.json` (the registry), `config.json` (setup, and the saved `catalog`), `catalogs/<id>/catalog.json`, `projects/<name>/config.json`, `log.jsonl` when no project `.adp/` is found | `export`/`ack` (registry), `setup`, `catalog`, `init` |
| `<project>/.adp/` | `config.json` (`adp.py init`), `log.jsonl` (every command appends one line) | `init` and `setup --scope project\|local` (`config.json`), every command (`log.jsonl`) |

**Contract 1: the state file**, `DIR.adp/state.json`, schema `adp-state/1`. Fields written by `export`: `schema`, `url`, `name`, `capabilities`, `live {version, at}`, `docs {"<collection>/<id>": version}` (integer versions only, used for pins), `files {path: sha256}` (the listing's hashes, files taken by reference excluded), `refs` (files taken by reference: `{path: {artifact, ver}}`), `base {version, manifest}`, `exported_at`, `catalog {url, vermap}`, `incoming {held, unacked, pending_replies, proposed, acked}`, `commits {live, work}`. `propose` adds an entry to `incoming.proposed[<pid>]` (`work` commit and `manifest`); `ack` updates `files`, `docs`, `live`, `base`, `incoming`. `incoming.held` lists ids the export held; `unacked` lists proposals recorded in `incoming.proposed` whose `incoming/<pid>` status is `applied` or `declined` and that were not acked; `pending_replies` lists `requests/` docs not `done` and not in state `ack`, `seen` or `working`.

**Contract 2: the registry and the nested repository.** The registry, `~/.adp/artifacts.json`, maps an artifact url (trailing slash removed) to `{dir, name}`; `gate` and `ack` (hook form) use it to find DIR from a url. The nested repository, `DIR.adp/repo`, is a git repository created by `repo_init` with an empty root commit and three branches: `base` (the last import or applied proposal), `live` (the last export), `work` (the local copy). Trees hold `files/<path>`, `content/<id>.html` and `db/<collection>/<id>.json`; records are stripped of the volatile fields `at`, `last_seen`, `hold_until`, `exported_at`, `version`, `parts/<id>` is reduced to `{hash}`, and `presence` and `agents` are left out (`strip`, `PART_KEYS`, `VOLATILE`). Merges use `git merge-tree --write-tree --merge-base=<base>`, so the base is the one the loop names, not the one git would guess (`merge3`). Git is invoked with a fixed identity (`adp`) and no signing.

### 6.2 The commands

| Command | What it does (`adp_loop.py`) |
|---|---|
| `adp.py export DIR --url URL [--files-listing F.json] [--docs D.json] [--version V]` | Two-step. Without the files listing, or without the docs dump, it prints the reads to make (an `Artifact` list or read, `ArtifactData` lists of the `CANON` collections) and exits 2. With both it stores live in `DIR.adp/incoming/`, commits `live` and `work`, classifies base, live and work (section 6.3) into `report.json`, and when nothing is held and git reports no conflict it merges live into work (a merge commit with parents `work` and `live`), copies live-side changes (`theirs`) into DIR, and moves `base` to `live`. Writes `state.json`, updates the registry, and prints `{report, merged, state, next}`. On the first export (the import), work and base start from live. |
| `adp.py classify BASE.json LIVE.json INCOMING.json` | Prints the classification of three manifests (`classify_cmd`). A manifest may be wrapped in `data`. |
| `adp.py propose DIR --by NAME --summary S [--retire ID --reason R ...]` | Commits `work`, classifies base, live and work. Exits 2 with `refused` when git reports a conflict with live, when anything is held, when a part id or file was deleted without its own `--retire ID --reason R` pair, or when `--retire` has no reason; exits 2 with an error when no export exists; prints `nothing` when work equals live. Otherwise builds the `incoming/<pid>` doc (`pid` is `p-<ms>-<4 chars>`) and one ArtifactData batch: the doc, any `incoming/<pid>/chunks/<n>` docs, and a `changes/d-<ms>` record. Contract 3 is described in `docs/assist.md`. |
| `adp.py ack DIR [--result FILE \| stdin] [--proposal PID]` | Folds a publish result (`shas`, `version`) or a batch result (`results` or `writes` with integer `version`) into `state.json`. Also accepts a PostToolUse hook input (`tool_input.url`, `tool_response`; DIR found through the registry). `--proposal PID` requires that the last export saw its status as `applied` or `declined`; when `applied` it moves `base` (branch and manifest) to the proposal's work; it then records the pid in `incoming.acked`. |
| `adp.py gate [--input FILE \| stdin]` | The PreToolUse hook decision (section 6.4). |

The repository does not install the hooks: `setup_cmd` writes skills (none in a plugin install), `config.json`, a CLAUDE.md pointer and a `.gitignore` line, and no hook configuration.

### 6.3 Contract 4: the classification

Input: three manifests `{parts: {id: hash}, files: {path: sha}}`, optionally `parents`, `requires {component: [paths]}`, and on the incoming one `retired {id: reason}` (or a list of ids). The three are *base* (the last common state), *live* (the record) and *incoming* (the side being merged: the local work in `export` and `propose`). In `export`, file hashes are cut to 12 hex characters (`cmanifest`).

For each id, with b, l, i the hashes in base, live, incoming and `-` for absent (`classify3`):

| Class | Rule | Meaning |
|---|---|---|
| `new` | b `-`, l `-`, i present | only incoming has it |
| `ours` | b present, i present, l = b, i != b | incoming changed it, live did not |
| `theirs` | b `-`, l present, i `-`; or b present, i present, i = b, l != b (l may be `-`) | live changed it, incoming did not |
| `applied` | b `-`, l = i; or b present, i != b, l != b, i = l; or b present, i `-`, l `-` | both sides are already at the same state |
| `retired` | b present, i `-`, l present, and the id is in incoming's `retired` | incoming deletes it, with a reason |
| `held` | any other combination of changes, including b present, i `-`, l present with no `retired` entry | both sides changed it differently, or a deletion without a reason |
| none | b = l = i | unchanged |

Then a closure: `new`, `ours` and `retired` ids become `held` while anything they touch is held (`touches`). Two ids touch when one is the other's parent in `parents`, or when a file listed under `requires[component]` meets that component's id or one of its dotted descendants. It repeats until nothing moves. `held` entries are `{id, base, live, incoming}`.

`classify` in `adp.js` (exposed as `ADP.classify`) implements the same table and closure. Differences in the code: the Python lists `parts` ids first then `files` ids, each sorted, the JavaScript one sorted list; the Python merges the `parents` of the three manifests into one map (the later manifest wins per id), the JavaScript links every edge from all three. No test in `tests/` runs the JavaScript.

Users of the classification: `export` and `propose` (base, live, work), `adp.py classify`, and the page's inbox (`kit/patterns/inbox.js`, which builds live from the record, base from live with the proposal's `from` hashes, incoming from its `to` hashes).

### 6.4 Contract 7: the gate

`gate` reads a PreToolUse hook input (`tool_name`, `tool_input`) and prints a `hookSpecificOutput` decision (`decide`). Only `deny` carries `permissionDecision`; every other outcome is `additionalContext` only, so Claude Code's own permission prompt still runs.

| Decision | When |
|---|---|
| allow, with a note | input is not JSON; no url; an `Artifact` call whose action is not `publish`; an `ArtifactData` action `get`, `list`, `query` or `read`; a url with no registry entry or no state |
| deny | `state.incoming` has `held` ids, `unacked` proposals, or `pending_replies` (the third is ignored when every write targets `requests` or `presence`); the message names them and says to run `export` first |
| deny | a write carries `if_version` for `<collection>/<id>` and `state.docs` holds a different version for it |
| allow, `adp: inbox clear` | everything else |

## 7. The catalog and reuse

The catalog is a published artifact whose files are kit entries, indexed by `skill/catalog/catalog.json` (schema `kit-catalog/1`: `url`, `ver`, `built`, `entries`). Every entry has `id`, `kind` (`component`, `theme`, `template` or `guide`), `group`, `name`, `summary`, `about`, `version`, `status`, `tags`, `requires`, `globals`, `provides`, `needs`, `files`, `hash`, `source`, `changed`, `at`, `by`, and usually `preview`; some have `extends`, `related` or `optional`; a theme has `fonts`, the Google Fonts url its font tokens need (the same as in its json; `docs/themes.md`). A file is `{path, role, sha256, bytes}`; `take` copies a `ver` into the by-reference entry when the file has one. Roles in use are `script`, `style`, `sample`, `data`, `template`, `doc`. The entry `hash` is the first 12 hex of the SHA-256 of the sorted `path=sha256` lines joined with `\n` (`tools/check_catalog.py`). The id prefix is the kind that `kit list --kind` and `suggest --kind` filter on: `kit`, `layout`, `pattern`, `viz`, `theme`, `runtime`, `template`, `guide` (`tools/check_headers.py`). The header every entry carries in its main file, and the rules for it, are in `docs/catalog-header.md`.

**Take by reference.** `adp.py take CATALOG ID ... [--url URL] [--config C.json]` resolves the ids and their `requires` (dependencies first, each once), and prints a `files` map `{path: {artifact: <catalog url>, path, ver?}}` plus the `entries` taken, a `sha256` map and, when a taken entry has one, `fonts` (`{id: url}`). Files with role `sample` are included only for ids named on the command line. That map is the `files` argument of the `Artifact` publish call, which copies the files server side. CATALOG is the catalog url (its fetched index at `~/.adp/catalogs/<id>/catalog.json`; exit 2 with the read to make when it is not fetched), `-` (the saved catalog in `~/.adp/config.json`), or a local `catalog.json` (its url comes from `--url`, else `links.catalog` in `--config`, else the index's own `url`; it prints a warning). Related: `adp.py catalog`, `suggest`, `kit list|show|describe`, `pins`.

**Tiers of `adp.py new`** (`TIERS`): `--tier minimal` is the `starter` template, `--tier default` is `default`, `--tier full` exits with "not available yet". Alternatively `adp.py new TEMPLATE DIR` with `starter`, `assistant` or `default` (`adp.py templates` lists them). `new` also takes `--theme` and `--layout` ids; they join the template's `take` list. With a catalog index (`--catalog`, or the saved catalog when its index is fetched), `new` merges the taken entries into its publish object and links what `--theme` and `--layout` asked for in `index.html` (a theme's `fonts` before `styles/page.css`, its stylesheet after); otherwise it prints the `adp.py take` to run.

| Template | Base | Adds | `take` entries |
|---|---|---|---|
| `starter` | none | shell, runtime, one welcome view, settings view, What changed panel | 6 |
| `assistant` | `starter` | the Work with Claude pane, Requests view, presence; rules for `requests`, `conversations`, `presence` | 12 |
| `default` | `assistant` | every theme, canvas, 3D and common kits taken, nothing mounted beyond the assistant's views | 82 |

## 8. Where things live

| Path | What |
|---|---|
| `skill/SKILL.md`, `skill/refs/adp-*/SKILL.md` | the skill and its four road skills |
| `skill/scripts/adp.py`, `skill/scripts/adp_loop.py` | the command-line tool (stdlib only) and the loop |
| `skill/assets/adp.js` | the page runtime |
| `skill/templates/{starter,assistant,default}/` | the templates `adp.py new` builds from |
| `skill/catalog/` | the catalog: `catalog.json`, its own page files, `adp.js` (a copy), and `kit/` (components, patterns, layouts, themes, viz, guides, samples) |
| `tools/` | `package.py` (validate and build), `check_catalog.py`, `check_headers.py`, `catalog_drift.py`, `publish_catalog.py` |
| `tests/` | `unittest` suites for the commands, tiers, templates, packaging, setup and catalog tooling |
| `docs/` | this document, `assist.md`, `config.md`, `catalog-header.md`, `themes.md`, and the release documents (`RELEASING.md`, `RELEASE-CHECKLIST.md`, `RELEASE-NOTES-v2.0.0.md`) |
| `.github/workflows/` | `ci.yml`, `release.yml` |

**One bundle.** `tools/package.py` validates the `SKILL.md` frontmatter of the skill and of each `skill/refs/*` and builds `dist/adp.skill` with `dist/adp.skill.sha256`: a deterministic zip (fixed timestamps) whose entries are under `adp/`, excluding `__pycache__`, `node_modules`, `.DS_Store`, `*.pyc`, and a root `evals/` folder. CI (`ci.yml`) runs gitleaks, `ruff check .`, `python3 -m unittest discover -s tests -v`, then `package.py --check`, `check_catalog.py`, `package.py`, and uploads `dist/`. `release.yml` runs on a `v*` tag: the same checks, the build, a check that the tag equals `v` plus `metadata.version` in `skill/SKILL.md`, and a GitHub release with the bundle and its checksum (`docs/RELEASING.md`).
