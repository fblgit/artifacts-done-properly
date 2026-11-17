# ADP v2.1.1

Patch release on v2.1.0. Install and verify as before; `adp.skill.sha256` on the release page is the authoritative hash.

## Added

- **One-file pages.** `adp.py files DIR --host single [--out index.html] [--fragment]` packs a page folder into one self-contained `index.html`, for tools that publish a single file (the Claude chat Artifact tool). A small shim serves relative scripts, styles and `fetch()` from embedded, sha256-checked files, using only inline scripts and styles. `--fragment` omits doctype/html/head/body, and a page that is already a fragment (the starter and assistant templates) packs as all body.
- **`adp.py unpack PACK DEST`.** Writes the files back byte for byte from a packed page or from a `catalog-pack-NN.json`; `DEST` must be new or empty. `setup` reads the shipped catalog through the same reader and writer.

## Changed

- `adp_sites_build.py` is now `adp_host_build.py` (hosts: sites, single). Scripts that imported the old name must follow.
- `docs/architecture.md` documents the one-file host.

## Limits

- Module scripts, relative images and CSS `url()` are not rewritten, and the packed page must stay under 16 MB.
- A packed page does not expand itself into real files.
