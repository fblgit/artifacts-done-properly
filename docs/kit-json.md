# Extra kits

`extras/<entry id>.json` holds one catalog entry kept outside the base catalog. It is a seed pack (`adp-seed/2`, the format `adp.js` expands)
with one inbox proposal: the kit's files as chunk docs, then the proposal doc, which carries the entry's index record.

```json
{
 "schema": "adp-seed/2", "pack": 1, "of": 1,
 "docs": [
  { "collection": "incoming/<pid>/chunks", "id": "0", "data": { "path": "kit/qr-code.js", "n": 0, "of": 1, "content": "…the text…" } },
  { "collection": "incoming", "id": "<pid>", "data": { "status": "new", "files": [{ "path": "kit/qr-code.js", "ifMatch": null, "sha256": "…", "…": "…" }], "entry": { "id": "kit.qr-code", "…": "…" }, "…": "…" } }
 ]
}
```

## What a kit holds

Its own files only, all text under `kit/`, at most 60 files and 600 KB. No file another entry lists: not the shared sample bundles
(`kit/samples/kit.json`), not the page's preview files (`parts/previews-*.js`). `requires` names entries the catalog must already hold.

| File | Path | Role | Notes |
|---|---|---|---|
| main script | `kit/<name>.js` | `script` | required; carries the header ([catalog-header.md](catalog-header.md)) |
| styles | `kit/<name>.css` | `style` | |
| sample | `kit/samples/<name>.json` | `sample` | its own file, named in `@preview` as a path (no `#key`); no `@samples` line |
| preview | `kit/previews/<name>.js` | `preview` | registers `window.CatalogPreviews['<render>']`; the catalog page loads it, `adp.py take` and the page's Take list leave it out |
| more scripts, styles, docs | under `kit/` | by extension | listed in `@files` like any entry |

## Pack

`python3 -I <adp skill folder>/scripts/publish_catalog.py kit pack ID ... [--catalog-dir D] [--out extras]` writes `<out>/<ID>.json` from a
built catalog folder that holds the entry, and prints its writes. A pack over one batch (50 writes or 700 KB: each file is one chunk doc
per 100 KB, plus the proposal doc) is refused.

## Push

ArtifactData batches: every doc of each pack, in file order, as `{op: "set", collection, doc_id: <id>, data}`. One kit is one batch; several kits
fit one while their writes total 50 or fewer and 1 MiB.

The catalog does the rest while an editor has it open: the inbox publishes the files and records it in `What changed`, then the page adds
`entry` to its own `catalog.json` through the same inbox. Nobody sends `catalog.json`. A catalog whose page predates this (`parts/catalog.js`)
publishes the files and never lists the kit. The page indexes a record only when its proposal lists every file the record lists, with
the same sha256, and the inbox publishes a file only when its delivered text matches that sha256; when it does not index, the Incoming panel says why.

## Update

None yet. A pack proposes new files (`ifMatch: null`), so a new version of an installed kit is held, never applied. `publish_catalog.py update`
leaves an installed kit alone, its files and its record, because the base catalog does not hold it; `--remove ID` removes it on purpose.
