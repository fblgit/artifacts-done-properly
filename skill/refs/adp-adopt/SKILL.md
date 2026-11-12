---
name: adp-adopt
description: Put an existing claude.ai Artifact on ADP: add part ids and hashes, declare the db, seed the records, or move a single-file page to the multi-file adp/2 layout. Load it when the user wants an artifact they already have to be shared, commented on, edited by several agents, or converted to ADP or adp/2, before touching its source.
metadata:
  version: "2.0.0"
---

# Adopt an existing artifact

Why: a page without part ids has no stable anchors, and its history lives only in versions. Adoption adds the part ids and the db without changing how the page looks or behaves.

`ADP` means `python3 -I <adp skill folder>/scripts/adp.py`. Read the artifact's latest version first (Artifact `read`), save it into a folder, and tell the owner what you are about to do.

## Step A: markers on the existing page

1. Wrap every view and its main sections in markers `<!-- part:view.section -->` ... `<!-- /part:view.section -->` (ids lowercase kebab, dot-separated, never changed later; styles and shared scripts become parts such as `page.style`, `page.script`). Add `data-part="<id>"` and `data-comment-target` to each rendered root.
2. `ADP check PAGE|DIR` takes a single page or a folder: it must pass. `ADP manifest PAGE|DIR` prints the part hashes.
3. Publish with `capabilities: {db: {rules: [{path: "", read: "view", write: "admin"}]}, user: {}}` and a `label`.
4. Seed the database: `ADP seed DIR --by <you> --data FILE|DIR` writes `seed.json` and `seed/` for the page to expand on its first open by an editor; `--batches` prints ArtifactData batches instead. Tell the owner in one line. UNVERIFIED: `seed` on a single-file page was not run here.

## Step B: move to the multi-file layout

1. Start a reference project with `ADP new starter REF --catalog CATALOG` and copy its shell, `adp.js` and `content.js` structure: a thin `index.html`, `adp.js`, `content.js`, `styles/*`, `parts/*`.
2. Move the page's own copy and views into those files; use `ADP new starter DIR --content FILE` to build views from a content file, then `--data` for records.
3. Prove parity: render old and new in a headless browser and compare every element's computed style and box in every view and state, at the widths and themes in use. No parity proof, no publish.
4. `ADP check DIR`, publish with `ADP files DIR`, then `ADP export` and `ADP record` (road `adp-edit`).
5. Ask the owner to open the page once as an editor so the seed expands.

## Rules

- Never rename a published part id.
- Do not change the page's look while adopting; restyling is a separate change under `adp-edit`.
- UNVERIFIED on other hosts: db rules, `if_version`, server-side file copy.
