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
built catalog folder that holds the entry.

## Push

ArtifactData batches: every doc of each pack, in file order, as `{op: "set", collection, doc_id: <id>, data}`. Several kits fit one batch (at most 50 writes and 1 MiB).

The catalog does the rest while an editor has it open: the inbox publishes the files and records it in `What changed`, then the page adds
`entry` to its own `catalog.json` through the same inbox. Nobody sends `catalog.json`. A catalog whose page predates this (`parts/catalog.js`)
publishes the files and never lists the kit.
