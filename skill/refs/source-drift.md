# Source review drift

Use `adp.py source-drift` when a page explains a repository and needs to show which
sections require review after source changes. It runs local Git and compares paths;
it calls no model, network service or agent. It does not review prose for correctness.

This differs from `adp_catalog.py drift` (entry headers versus catalog index),
runtime integrity and `pattern.integrity` (published files versus records/holds),
and `viz.impact` (changes between supplied record snapshots). Reuse those catalog
components for their existing purposes; this command supplies repository-to-section
review evidence without adding another integrity panel.

## Declare the review map

Save JSON with schema `adp-source-map/1`:

```json
{
  "schema": "adp-source-map/1",
  "title": "Project handbook",
  "sourceCommit": "<full reviewed Git commit ID>",
  "basis": "Reviewed local source; deployed publication not verified",
  "sections": [
    {"id": "architecture", "title": "Architecture",
     "sources": ["docs/architecture.md", {"path": "src/"}]}
  ]
}
```

Sections can be chapters, parts or any stable content IDs. Paths are exact files,
or recursive directory prefixes ending in `/`, relative to the repository root.
Both string paths and `{path, label}` source entries are accepted. Globs, external
URLs and traversal paths are not source dependencies. Each source must exist at
its reviewed commit; a typo must not produce a clean verdict. A section may override
`sourceCommit` with its own full reviewed commit. The top-level pin remains the
baseline for reporting unmapped changes across the repository.

## Run and display

```sh
python3 -I <adp skill folder>/scripts/adp.py source-drift sources.json --repo PROJECT --head origin/main --out report.json
python3 -I <adp skill folder>/scripts/adp.py source-drift sources.json --repo PROJECT --head origin/main --format markdown --out report.md
python3 -I <adp skill folder>/scripts/adp.py source-drift sources.json --repo PROJECT --head origin/main --format coverage --out SITE_ASSETS/coverage.json
```

`-` instead of a map filename reads JSON from stdin. Fetch refs separately when
needed; the command never fetches or inspects uncommitted work. It resolves the
checked ref to a commit and requires review commits to be available ancestors.
Git must support [`--no-lazy-fetch`](https://git-scm.com/docs/git): missing partial-clone
objects produce an error instead of an implicit remote fetch.
Use a full-history CI checkout. Missing/shallow history, unknown pins and invalid
maps produce `status: error`, exit 1. Valid reports exit 0; `--strict` exits 2 if
sections or unmapped changes need review. No review pin is written or advanced.

JSON includes `sections[]` with IDs, titles, reviewed commits, status and exact
`changes[]` (`path`, Git `status`). `unmappedChanges` lists changed paths with no
section dependency. Renames appear as deletion plus addition so both paths remain
visible, including when a file moves out of a mapped directory. `changedFiles`
lists all changes against the top-level review baseline. A page can read this
static JSON to show its own chapter badges; Markdown supplies the full human report.

`current` means only that declared sources match the checked committed snapshot.
It does not prove complete dependency mapping, factual correctness, or deployed
freshness. Maintain mappings when adding new chapters or source dependencies;
unmapped changes make omissions visible. Review affected claims before moving a
section pin. For a report about a deployed KB, promote the reviewed map only with
the verified publication receipt; a local build or a stale context record is not
deployment evidence. The report retains the map's `basis` qualification.

## Coverage payload for a page

`--format coverage` emits `adp-source-coverage/1`: the full tracked-file inventory,
chapter mappings, reviewed/checked commits, per-source statuses/changes, file and
chapter counts, and every unmapped file, including unchanged files. Serve it as a
normal JSON asset. A last-page coverage map can render it
with the catalog's `pattern.expand-card` using custom states and one dimension.

- **Healthy:** a tracked file has a chapter mapping and is unchanged from its review pin.
- **Stale:** a mapped source changed; its chapter needs review. A removed mapped
  source makes the chapter stale because its documentation still refers to it.
- **Missing:** a tracked repository file has no chapter mapping, whether or not it changed.

`files[]` carries path, status and owning chapter IDs; `missingFiles` lists every
uncovered tracked path. `summary` counts files; `chapterSummary` counts chapters.
Missing outranks stale, then healthy. Invalid mappings or unavailable review
history emit an error payload and exit 1: unavailable evidence is an error,
not missing KB coverage. An absent/invalid fetched payload must show an unavailable
message and no healthy verdict. The payload is a
snapshot of its checked commit; republish or refresh it after repository updates
to change the Site's display. CI emits `*.coverage.json` beside the drift report;
deployment uses the Site's existing guarded source-publication workflow.

## GitHub detection

This repository's `.github/workflows/source-drift.yml` checks every map in
`docs/source-maps/*.json` on pushes to `main`, pull requests and manual dispatch.
Each run publishes JSON/Markdown artifacts and puts chapter/file reports in the
job summary. It executes Python and Git, without inference or agent wakeups.
Review findings are informational; invalid evidence fails the job. Other projects
can run the same commands in their existing CI or watcher, with their own maps.

The included KnowledgeBase map is exported from its local source metadata and
explicitly marks deployed publication as unverified. Keep that distinction until
the corresponding live source and publication receipt have been checked.
