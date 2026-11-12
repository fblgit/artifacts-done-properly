---
name: adp-new
description: Create a brand new claude.ai Artifact on ADP (adp/2): a page, board, tracker, assistant or record page that people and Claude will keep editing. Load it whenever the user asks for a new artifact that should be shared, commented on, built from catalog parts or edited by more than one agent, before writing any HTML. Covers the starter and assistant templates, taking a theme from the catalog, the first publish, and the one-time editor open that seeds the database.
metadata:
  version: "2.0.0"
---

# New ADP artifact

Start on adp/2, not a single index.html: a one-file page cannot give per-file hashes, content as data or part-id comment anchors.

`ADP` below means `python3 -I <adp skill folder>/scripts/adp.py` (the folder of the `adp` skill). `ADP templates` lists the templates `new` can start from: `starter`, `assistant` and `default`.

## 1. Choose a tier

| Start | Command | What you get |
|---|---|---|
| minimal | `ADP new --tier minimal DIR` (the same as `ADP new starter DIR`) | blank page, welcome view, settings view, the catalog page's look as the starting look |
| assistant | `ADP new assistant DIR --theme theme.glaze --catalog CATALOG` | the starter plus Claude pane, requests, presence, with the `glaze` theme taken from the catalog |
| default | `ADP new --tier default DIR` | the assistant plus every theme, the canvas, 3D and the most useful common kits |
| full | `ADP new --tier full DIR` | not available yet: it exits with that message |

Default to the assistant when people and Claude use the page together. Ask the user only if the purpose is unclear. `--theme` and `--layout` take a catalog entry ID in full (`theme.glaze`, `layout.topbar`), not a short name; `ADP kit list CATALOG --kind theme` shows the themes. CATALOG is the catalog url (its fetched index), `-` for the saved catalog, or `skill/catalog/catalog.json`; see `adp-catalog`. A local catalog.json is a build, not the live catalog, and prints a warning: do not publish from it.

## 2. Create the project

1. Run `ADP new assistant DIR --title "<name>" --by <your session name> --theme theme.glaze --catalog CATALOG` (`--slug`, `--content FILE`, `--data FILE|DIR` are optional). It writes the page into DIR (`index.html`, `content.js`, `parts/`, `styles/`; the template's `.txt` suffix is dropped) plus `seed.json` and `seed/`, and prints ONE publish object (`files` already carries the taken kit entries), the `take` list, a `design` note and the ordered `next` steps. Follow `next`.
2. Change the look and copy for the user's content: write `styles/page.css` and the views (`design` says what to keep: the token names, the part markers, the selectors `adp.js` relies on). The starting look is the catalog page's shell; two pages must not ship looking the same. `--content FILE` builds the views from a content file.
3. `ADP check DIR` must pass: markers balance, ids valid and unique, every part has `data-part`.

## 3. Publish

- Run the Artifact tool with the `publish` object `new` printed (`file_path`, `root`, `files`, `capabilities`); add a `label` of at most 60 characters and, on the first publish, an `icon`. Re-run `ADP files DIR` for the arguments after you changed files.
- Over 250 files `files` becomes `batches`: publish the page with the first and send the rest to the same url.
- Record the publish result with `ADP ack DIR --result FILE` (or on stdin) once the page has been exported (road `adp-edit`).

## 4. The one-time editor open (seeds the database)

The page expands `seed.json` and `seed/` into the database itself, and only when an editor opens it. After the first publish tell the user in one line: "Open the artifact once as the editor." Only when nobody can open it: `ADP seed DIR --batches` prints the ArtifactData batches to write yourself. Without either the db stays empty: not a failure, only unseeded.

## Rules

- Part ids never change after publishing; add a new id instead.
- Never build a new part by hand when a catalog entry exists: use `adp-catalog`.
- Hand the user the link and what to do next; do not paste the URL list.
