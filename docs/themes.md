# Themes and the look of a page

How a theme is made, how a page wears one (at `adp.py new`, later, or switched by the viewer), how to change the rest of the look, and how to add a theme to the catalog. `ADP` means `python3 -I <adp skill folder>/scripts/adp.py`; CATALOG is as in `skill/refs/adp-catalog/SKILL.md`.

## What a theme is

A theme is a catalog entry `theme.<id>` (kind `theme`, group `Themes`) with two files and one font url:

| Part | Where | What it holds |
|---|---|---|
| stylesheet | `kit/themes/<id>.css`, role `style` | Tokens only, in three blocks: light on `:root`; dark under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`; dark again under `:root[data-theme="dark"]`. The header follows `docs/catalog-header.md` and repeats the font url. |
| data | `kit/themes/<id>.json`, role `data` | `id`, `name`, `about`, `source`, `fonts`, `light`, `dark`, `aliases`, `scale`. The `light` and `dark` maps carry the same tokens as the css. The catalog previews, `kit.skins` (a `json` skin) and `pattern.playground` read this file. |
| fonts | `fonts` in the json and in the catalog entry (the same url) | One Google Fonts `css2` url with `display=swap` that loads the first family of each font token. `adp.py new --theme` and `adp.py take` read it from the entry. Without it the page falls back to system fonts. |

Tokens use the kit contract names, so kit files draw in the theme without aliases: `--bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink`, the meanings (`--ok --warn --danger …`) and the four font tokens `--f-display`, `--f-ui`, `--f-mono` and `--f-hand` (the canvas). `Kit.tokens.contract(part)` lists the names a kit file reads. A theme that keeps its own names maps them in a second `:root` block (`theme.adr-drafting-table` sets `--f-ui: var(--f-body)`).

A layer theme adds to another one: `theme.glaze-depth` requires `theme.glaze`, sets no font token and has the same `fonts` as Glaze.

`tests/test_fonts.py` checks every theme: the json `fonts` equals the entry `fonts`, the url loads the first family of every font token in the css and the json, and the css and json agree on the font tokens.

## Wear a theme

### At `adp.py new`

    ADP new TEMPLATE DIR --theme theme.<id> --catalog CATALOG

The publish object carries the theme's files by reference, and `index.html` gets two tags: the theme's font link before `styles/page.css`, and `kit/themes/<id>.css` after it (a theme is tokens only, so it overrides the template's placeholder tokens and leaves the page's rules alone). A theme that requires another (Glaze depth) brings that one's stylesheet too. The template's own font link stays.

The `default` template takes all 13 themes but loads none, so they are at hand. Pick the one it wears with `--theme`.

### Later: switch the theme of an existing page

1. `ADP take CATALOG theme.<new>` prints the `files` map and `fonts` (`{"theme.<new>": "<url>"}`).
2. In `index.html`, replace the old `kit/themes/<old>.css` link with the new one, still after `styles/page.css`, and replace the old theme's font link with the printed url, still before it.
3. Merge the `files` map into the page's publish, run `ADP check DIR` and publish.

### At runtime: let the viewer choose

`kit.skins` holds several looks in one page: `Kit.skins.init({skins: [{name, json: 'kit/themes/<id>.json'}, …]})`. A `json` skin uses the json's tokens and links its `fonts` when it is chosen. A skin given as `href` (a stylesheet) or `tokens` takes its font url as `fonts`. `pattern.playground` links the json's `fonts` when its stage wears a theme.

### Light and dark

These are separate from the theme. The `look.mode` setting (`auto`, `light`, `dark`) sets `data-theme` on `<html>` (`docs/config.md`), and the assistant's header button overrides it for one viewer. Each theme answers through its three blocks.

## Change the rest of the UI

- `styles/page.css` is the page's own look. Keep the token names, the three theme blocks and the selectors `adp.js` and the settings pattern rely on (`.wc*`, `.gear`, `.settings-view`, `.muted`). Write the layout, type scale and surfaces for the page's content.
- Every font declaration in a page or kit stylesheet takes `var(--f-ui)`, `var(--f-display)`, `var(--f-mono)` or `var(--f-hand)`, or `inherit`. Never a family name. That way a theme's fonts reach every element (`tests/test_fonts.py`).
- Layouts, patterns and components come from the catalog: use `--layout ID` at `new`, or `ADP take` plus the tags in step 4 of `skill/refs/adp-catalog/SKILL.md`.

## Add a theme to the catalog

1. Write `skill/catalog/kit/themes/<id>.css` (the three blocks, contract names, the header with `@id theme.<id>`, `@group Themes`, a `@config fonts` line and the font url) and `<id>.json` (the same tokens in `light` and `dark`, plus `fonts`).
2. Add its entry to `skill/catalog/catalog.json`: the fields every entry has (`docs/architecture.md`, section 7), `kind: "theme"`, both files with `sha256` and `bytes`, `fonts` (the json's url), `requires` (`[]`, or the base theme for a layer), `preview.render: "theme.<id>"` and the entry `hash`.
3. Add `theme.<id>` to the `take` list in `skill/templates/default/template.json`, and raise the theme count in the tests that pin it (`tests/test_default_template.py`, `tests/test_eval_fixes.py`, `tests/test_fonts.py`).
4. For the catalog page's preview, register `P['theme.<id>']` in `skill/catalog/parts/`. The list at the end of `previews-b8.js` gives a theme the shared preview, which also loads its fonts.
5. Run `python3 tools/check_catalog.py`, `python3 tools/check_headers.py` and `python3 -m unittest discover -s tests`.
6. Publishing the catalog artifact is the owner's step (`tools/publish_catalog.py plan` writes the publish batches). Pages built against the live catalog get the new entry, and its `fonts`, only after that publish.
