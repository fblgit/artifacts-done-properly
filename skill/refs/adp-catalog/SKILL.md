---
name: adp-catalog
description: Find, use and add components, themes, layouts and guides from the ADP catalog (the shared library of reusable artifact parts). Load it whenever an artifact needs a component, theme, layout or pattern that may already exist, when the user says take, reuse, catalog, kit or theme, or when a new reusable piece should be added. Covers search, taking entries by reference with the files map, and the catalog rules.
metadata:
  version: "2.0.0"
---

# ADP catalog

The catalog is a published artifact whose files are kit entries, listed in its `catalog.json` (schema `kit-catalog/2`, generated from the header of each entry's main file). Taking an entry by reference means the server copies the files into your artifact: nothing is downloaded, retyped or pasted.

`ADP` means `python3 -I <adp skill folder>/scripts/adp.py`. CATALOG is the catalog url (its fetched index is the live one), `-` for the saved catalog, or a local `catalog.json` (the shipped build is `~/.adp/catalog/catalog.json` after setup: not the live catalog).

## Save and fetch the user's catalog (My Own Kit)

The user's whole catalog lives on disk in `~/.adp/catalog/`: get it first. Setup already put the shipped copy there, so `ADP catalog URL` then only lists what differs. `ADP catalog URL` saves the url in `~/.adp/config.json` and prints the Artifact `read` of its `catalog.json` into `~/.adp/catalog/`. Make that read, then run the command again: it prints `fetched: true`, the build date, the entry count and, for every file the index lists that is not on disk yet, `read` calls with `paths` (at most 256 each, `out_dir` `~/.adp/catalog/`). Make them all, run the command once more, and it prints `complete: true`. `take`, `kit` and `suggest` read from that folder (an older `~/.adp/catalogs/<id>/` copy still counts); `adp.py` stays offline, it only prints the calls. `ver` is empty until the catalog's owner sets one, so compare the build date. `ADP catalog` alone shows the saved one. Never assume a catalog.

## Find

- `ADP suggest CATALOG --for "free words" [--n 3] [--kind K]`: ranked by overlap with tags, name, summary, id, provides and about (the `why` field says which matched), no model call. `--n` counts per kind (viz, theme, pattern...), so it can print more than N lines; `takes` is how many files the entry brings.
- `ADP kit list [CATALOG] [--kind K] [--tag T]`: one JSON line per entry. The kind is the id prefix (`viz`, `theme`, `layout`, `kit`, `pattern`, `runtime`, `template`, `guide`).
- `ADP kit show ID [CATALOG]`: name, summary, about, tags, files, requires, provides, and what the entry's header says (status, version, config, db, source, changed); `about` and those fields are read from the main file in the local kit.
- `ADP kit describe ID [CATALOG]`: the mount signature: needs, provides, requires, file paths, the sample path.

## Take by reference

1. Run `ADP take CATALOG ID ...`. Dependencies (`requires`) come first. It prints the `catalog` used, the `entries` taken and a `files` map to pass to the Artifact tool unchanged:
   `"kit/themes/glaze.css": {"artifact": "<catalog url>", "path": "kit/themes/glaze.css"}`
   An entry you name that owns a sample also brings its sample bundle (`kit/samples/<folder>.json`, by reference), and `samples` names only that entry's own `path#key`; dependencies bring none.
2. A `warning` in the output means CATALOG was a local `catalog.json`, not the live catalog: do not publish from it. Local catalogs need `--url URL` to name the catalog artifact; `--config C.json` is accepted too.
3. Publish with that `files` map (merge it into the page's own `files`), then `ADP check DIR`.
4. A taken file is served, not loaded: in the page's `index.html` add a `<link rel="stylesheet">` for each taken `.css` and a `<script src>` for each taken `.js`, in the order of `entries` (requires first), the scripts before `parts/app.js`; the globals an entry `provides` (for example `Kit.timeline`) exist only after its script loaded. Stylesheets: the entries' own in `entries` order, then the page's `styles/page.css`, then the theme last (a theme is tokens only, so it wins over the starter's placeholder tokens and leaves the page's rules alone). A theme also needs its web fonts: `take` prints them as `fonts` (`{id: url}`); add `<link rel="stylesheet" href="<url>">` for each before `styles/page.css`, or its families fall back to system fonts. `ADP new --theme`/`--layout` writes these tags for you. Switching a page's theme later means replacing both its theme link and its font link (`docs/themes.md` in the repo). `ADP check` does not verify the loading.
5. Besides what its tier already takes (adp-new, section 1), `ADP new` takes only the theme and a layout for you: `--theme NAME` (`default` when left out), `--layout ID` and `--catalog CATALOG` put them (and what they require) into its publish object and its index.html. Any other entry: `ADP take`, merge its `files`, add the tags of step 4.

## Rules

- Templates and files an artifact does not serve are kept with a `.txt` suffix; HTML cannot be copied server-side. Read such a file and write it to your project without the `.txt`.
- Never copy a kit file by retyping it; take it.
- UNVERIFIED: no sha256 check command exists in `adp.py`; `scripts/adp_catalog.py` (next to `adp.py`; run `python3 -I <adp skill folder>/scripts/adp_catalog.py [catalog dir]`) verifies sizes and hashes of the local catalog build only, and also checks the headers.

## Add or update entries

No `adp.py` command adds an entry. An entry is files under `catalog/kit/`, the main one with a header comment (id, kind, group, status, version, updated, summary, tags, requires, files and the rest: the format is the repo's `docs/catalog-header.md`; a theme also `@fonts`, the url in its json). `python3 -I <adp skill folder>/scripts/adp_catalog.py build` writes the entry's record into `catalog.json` from that header, and `python3 -I <adp skill folder>/scripts/adp_catalog.py` must pass. The catalog artifact is planned by `python3 -I <adp skill folder>/scripts/publish_catalog.py` (the steps are in the repo's `docs/RELEASING.md`, "Publish the catalog"). Never publish over, test on or republish a catalog others use: ask the user first, and try anything on a scratch artifact.
