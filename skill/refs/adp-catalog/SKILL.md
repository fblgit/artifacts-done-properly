---
name: adp-catalog
description: Find, use and add components, themes, templates and guides from the ADP catalog (the shared library of reusable artifact parts). Load it whenever an artifact needs a component, theme, template or pattern that may already exist, when the user says take, reuse, catalog, kit or theme, or when a new reusable piece should be added. Covers search, taking entries by reference with the files map, sha256 checks and the catalog rules.
metadata:
  version: "2.0.0"
---

# ADP catalog

The catalog is a published artifact whose files are kit entries. Taking an entry by reference means the server copies the files into your artifact: nothing is downloaded, retyped or pasted, and the sha256 proves the copy.

`ADP` means `python3 -I <adp skill folder>/scripts/adp.py`. A SITE is the catalog artifact url, `-` for the saved catalog, or a local `adp.json`. The base catalog ships in the adp skill's `catalog/`.

## Find

- `ADP suggest SITE --for "free words" [--n 3] [--kind K]`: ranked by keyword overlap, no model call.
- `ADP kit list [SITE] [--kind K] [--tag T]`: one JSON line per entry. Kinds include component, theme, template, guide.
- `ADP kit show ID [SITE]` and `ADP kit describe ID [SITE]`: description, files, registryDependencies and the mount signature.
- `ADP site URL` saves the user's own catalog in `~/.adp/config.json`; run `ADP site` alone for the Artifact read that fetches its index. Without the saved index suggest and show read only the local base catalog.

## Take by reference

1. Run `ADP take SITE ID ...` (dependencies come first). It prints a publish whose `files` map has entries in this form, to pass to the Artifact tool unchanged:
   `"kit/x.css": {"artifact": "<catalog url>", "path": "<its published path>", "ver": "<version id>"}`
2. Pin `ver` so a later catalog change cannot alter your page. A `warning` in the output means the SITE was a local `adp.json`, not the live catalog: do not publish from it.
3. Publish with that `files` map, then `ADP check DIR` so the new parts are counted.
4. Alternative for text into a local folder: `ADP take DIR ID ...` does one Artifact read into `DIR/kit`, then `ADP propose DIR --by <you>` sends it (road `adp-edit`).

## Check

Every file has a sha256. Read the file with the Artifact tool (`read` with `path`) and compare with the entry's recorded hash; `ADP kit check [NAME]` recomputes a local entry and exits 1 on a mismatch. Do not use an entry whose hash fails.

## Rules

- Templates are stored as `.html.txt` (and `.js.txt`, `.css.txt`): the platform serves HTML only as the page, and HTML CANNOT be copied server-side. To use a template, read it and write it to your project dropping the `.txt` suffix, or take it as shipped files for a new project through `adp-new`.
- Files an artifact does not serve (archives, `.py`) also use a `.txt` suffix.
- Never copy a kit file by retyping it; take it, or a hash will not match.
- An entry's `registryDependencies` must be taken with it; `take` orders them.

## Add an entry

1. Create `kit/<name>/registry-item.json` (name, title, description, keywords, files, registryDependencies, exports) next to its files.
2. `ADP kit check <name>` must report it as declared, not failing.
3. Publish the catalog site with `ADP files DIR` (it prints the publish arguments; over 250 files it splits into batches, publish the first and send the rest to the same url). Pin versions with `ADP pins publish-1.json=VERSION_ID ... --out vermap.json`.
4. To hand an entry to another catalog: `ADP kit consume PACK [--site DIR]` verifies and imports an exported entry.
5. Ask the user before publishing a catalog others use.
