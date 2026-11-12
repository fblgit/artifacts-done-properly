---
name: adp-adopt
description: Put an existing claude.ai Artifact on ADP: add part ids and hashes, declare the db, seed the records, or move a single-file page to the multi-file adp/2 layout. Load it when the user wants an artifact they already have to be shared, commented on, edited by several agents, or converted to ADP or adp/2, before touching its source.
metadata:
  version: "2.0.0"
---

# Adopt an existing artifact

Why: a page without part ids has no stable anchors, and its history lives only in versions. Adoption adds the dataplane without changing how the page looks or behaves.

`ADP` means `python3 -I <adp skill folder>/scripts/adp.py`. Read the artifact's latest version first (Artifact `read`), save it to a folder, and tell the owner what you are about to do.

## Step A: adp/1 (markers on the existing page)

1. Wrap every view and its main sections in markers `<!-- part:view.section -->` ... `<!-- /part:view.section -->` (ids lowercase kebab, dot-separated, never changed later; styles and shared scripts become parts `page.style`, `page.script`). Add `data-part="<id>" data-comment-target` and a heading to each rendered root.
2. `ADP check DIR` passes. Note: `adp.py` accepts only the adp/2 directory layout and refuses a single .html page, so a one-file page must reach Step B's layout before it can be checked or recorded: UNVERIFIED how to check a single-file adp/1 page with this tool version.
3. Publish with `capabilities: {db: {rules: [{path: "", read: "view", write: "admin"}]}, user: {}}` and a `label`.
4. Seed the db in pinned batches (see `adp-edit`): `manifest/current`, `parts/*`, `changes/000001` (summary "adp/1 adopted"), `decisions/*` (owner decisions so far, quoted verbatim) and `threads/*` (open threads). Tell the owner in one line.

## Step B: move to adp/2

1. Split the page into files: a thin `index.html` shell, `adp.js`, `content.js`, `styles/*`, `parts/*`. Take the shared runtime and shell template from the catalog by reference (`adp-catalog`: entry `runtime.adp`, template `adp2-shell`).
2. Move copy into `content/<part id>` docs with `content.js` as the fallback.
3. Declare `comments: {customAnchors: true}` (full form) and map the old CSS-path threads in the page's `legacy {css anchor: part id}`.
4. Prove parity: render old and new in a headless browser, compare every element's computed style and box in every view and state, at the widths and themes in use. Mutate the new build once to show the comparison catches a difference. No parity proof, no publish.
5. Publish with a label. Record in pinned batches, retire the old part ids (delete their `parts/` docs and list them as removed in `changes/`).
6. Ask the owner to open the page and enter comment mode once, then read `checks/latest` (`anchors.unknown` lists unmapped old threads).

## Rules

- Never rename a published part id.
- Do not change the page's look while adopting; restyling is a separate change under `adp-edit`.
- Untested on other hosts: customAnchors, db rules, `if_version`, server-side file copy. Check each before relying on it outside claude.ai.
