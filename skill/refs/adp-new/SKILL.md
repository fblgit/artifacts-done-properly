---
name: adp-new
description: Create a brand new claude.ai Artifact on ADP (adp/2): a page, board, tracker, assistant or record page that people and Claude will keep editing. Load it whenever the user asks for a new artifact that should be shared, commented on, built from catalog parts or edited by more than one agent, before writing any HTML. Covers the three starter tiers (basic, recommended, full), the first publish, and the one-time editor open that seeds the database.
metadata:
  version: "2.0.0"
---

# New ADP artifact

Start on adp/2, not a single index.html: a one-file page cannot give per-file hashes, content as data or part-id comment anchors, and converting later costs a full parity proof.

`ADP` below means `python3 -I <adp skill folder>/scripts/adp.py` (the folder of the `adp` skill).

## 1. Choose a tier

| Tier | What it is | Status |
|---|---|---|
| basic | the `starter` template: blank page, welcome view, settings view, placeholder look | available |
| recommended | the `assistant` template (starter plus Claude pane, requests, presence) with the `glaze` theme taken from the catalog | available |
| full | recommended plus a records board | NOT AVAILABLE YET: say so, offer recommended and add board parts later through `adp-catalog` |

Default to recommended when the page is used by people and Claude together. Ask the user only if the purpose is unclear. Templates are in `catalog/` and `templates/{starter,assistant}/` in the adp skill's folder.

## 2. Create the project

1. Run `ADP new PROJECT --title "<name>" --by <your session name>`. It creates `PROJECT/.adp`, the starter page, the kit, the seed and the packed first publish, and prints the ordered list of calls to make (check, pack, publish, open, seed, export). Follow that list in order.
2. For `recommended`: UNVERIFIED whether `new` selects a template. If PROJECT does not already hold the assistant files, copy `templates/assistant/` from the adp skill's folder into PROJECT (manual step), then take the theme: `ADP take - theme.glaze` or `ADP take SITE theme.glaze` (see `adp-catalog`).
3. Replace the placeholder content (`content.js`) with the user's real copy. A starter's placeholder look must not ship.
4. `ADP check PROJECT` must pass: markers balance, ids valid and unique, every part has `data-part`.

## 3. Publish

- Run the Artifact tool exactly as `new` and `pack` printed it: `capabilities` with `db` (read for all, write admin only) and `user`, a `label` of at most 60 characters, an `icon` on the first publish.
- Use `ADP pack PROJECT` only for the FIRST publish. Once `PROJECT/.adp/state.json` exists it refuses: use `export`, edit, `propose` (road `adp-edit`).
- Record the publish result with `ADP ack PROJECT --result <file>` (or on stdin).

## 4. The one-time editor open (seeds the database)

The database seed and the page self-check are written by the page itself, and only when an editor has the page open. After the first publish tell the user in one line: "Open the artifact once as the editor and enter comment mode." Then run `ADP export PROJECT --url <artifact url>`, which prints an export ask; run what it lists and run the same export again. Read `checks/latest` in the db afterwards. Without that open the db stays empty: not a failure, only unseeded.

## Rules

- Part ids never change after publishing; add a new id instead.
- Keep copy as data (`content/<part id>`) so wording fixes need no republish.
- Never build a new part by hand when a catalog entry exists: use `adp-catalog`.
- Hand the user the link and what to do next; do not paste the URL list.
