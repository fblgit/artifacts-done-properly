---
name: adp-catalog
description: Find, use and add components, themes, layouts and guides from the ADP catalog (the shared library of reusable artifact parts). Load it whenever an artifact needs a component, theme, layout or pattern that may already exist, when the user says take, reuse, catalog, kit or theme, or when a new reusable piece should be added. Covers search, taking entries by reference with the files map, and the catalog rules.
metadata:
  version: "2.0.0"
---

# ADP catalog

The catalog is a published artifact whose files are kit entries, listed in its `catalog.json` (schema `kit-catalog/1`). Taking an entry by reference means the server copies the files into your artifact: nothing is downloaded, retyped or pasted.

`ADP` means `python3 -I <adp skill folder>/scripts/adp.py`. CATALOG is the catalog url (its fetched index is the live one), `-` for the saved catalog, or a local `catalog.json` (the repo's build is `catalog/catalog.json` in the adp skill's folder: not the live catalog).

## Save and fetch the user's catalog

`ADP catalog URL` saves it in `~/.adp/config.json` and prints the Artifact `read` of its `catalog.json` into `~/.adp/catalogs/<id>/`. Make that read, then run the command again: it prints `fetched: true`, the build date and the entry count (`ver` is empty until the catalog's owner sets one, so compare the build date). `ADP catalog` alone shows the saved one. Never assume a catalog.

## Find

- `ADP suggest CATALOG --for "free words" [--n 3] [--kind K]`: ranked by overlap with tags, name, summary, id, provides and about (the `why` field says which matched), no model call. `--n` counts per kind (viz, theme, pattern...), so it can print more than N lines; `takes` is how many files the entry brings.
- `ADP kit list [CATALOG] [--kind K] [--tag T]`: one JSON line per entry. The kind is the id prefix (`viz`, `theme`, `layout`, `kit`, `pattern`, `runtime`, `template`, `guide`).
- `ADP kit show ID [CATALOG]`: name, summary, about, tags, files, requires, provides.
- `ADP kit describe ID [CATALOG]`: the mount signature: needs, provides, requires, file paths, the sample path.

## Take by reference

1. Run `ADP take CATALOG ID ...`. Dependencies (`requires`) come first. It prints the `catalog` used, the `entries` taken and a `files` map to pass to the Artifact tool unchanged:
   `"kit/themes/glaze.css": {"artifact": "<catalog url>", "path": "kit/themes/glaze.css"}`
2. A `warning` in the output means CATALOG was a local `catalog.json`, not the live catalog: do not publish from it. Local catalogs need `--url URL` to name the catalog artifact; `--config C.json` is accepted too.
3. Publish with that `files` map (merge it into the page's own `files`), then `ADP check DIR`.
4. A taken file is served, not loaded: in the page's `index.html` add a `<link rel="stylesheet">` for each taken `.css` and a `<script src>` for each taken `.js`, in the order of `entries` (requires first), the scripts before `parts/app.js`; the globals an entry `provides` (for example `Kit.timeline`) exist only after its script loaded. Stylesheets: the entries' own in `entries` order, then the page's `styles/page.css`, then the theme last (a theme is tokens only, so it wins over the starter's placeholder tokens and leaves the page's rules alone). A theme also needs its web fonts: `take` prints them as `fonts` (`{id: url}`); add `<link rel="stylesheet" href="<url>">` for each before `styles/page.css`, or its families fall back to system fonts. `ADP new --theme`/`--layout` writes these tags for you. Switching a page's theme later means replacing both its theme link and its font link (`docs/themes.md` in the repo). `ADP check` does not verify the loading.
5. Besides what its tier already takes (adp-new, section 1), `ADP new` takes only a theme and a layout for you: `--theme ID`, `--layout ID` and `--catalog CATALOG` put them (and what they require) into its publish object and its index.html. Any other entry: `ADP take`, merge its `files`, add the tags of step 4.

## Rules

- Templates and files an artifact does not serve are kept with a `.txt` suffix; HTML cannot be copied server-side. Read such a file and write it to your project without the `.txt`.
- Never copy a kit file by retyping it; take it.
- UNVERIFIED: no sha256 check command exists in `adp.py`; `tools/check_catalog.py` in the repo verifies sizes and hashes of the local catalog build only.

## Add or update entries

No `adp.py` command adds an entry. An entry is files under `catalog/kit/` plus its record in `catalog.json` (id, kind, name, summary, about, tags, files, requires, provides; a theme also `fonts`, the url in its json); `python3 tools/check_catalog.py` must pass. To publish the catalog artifact use `ADP files DIR` (over 250 files it splits into batches: publish the first, send the rest to the same url) and `ADP pins publish-1.json=VERSION_ID ... --out vermap.json`. Ask the user before publishing a catalog others use.
