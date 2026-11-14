# Catalog entry header

Every catalog entry describes itself in one comment in its main file. That header is the only description of the entry. `skill/catalog/catalog.json` is an index built from the headers; nobody edits it by hand.

The parser is `parse_header` in `skill/scripts/adp_index.py`; the rules are in `tools/check_headers.py`.

## Main file

The main file is the one file of the entry whose header carries its `@id`: a file under `kit/` (not under `kit/samples/`), or one at the top of the catalog folder such as `adp.js`. The entry's other files are named in `@files`; they carry no header.

## Comment

- `.js`, `.css`, `.js.txt`, `.css.txt`: the first `/** ... */` block. A leading `*` on each line is ignored.
- `.md`, `.html.txt`, `.txt`: the first `<!-- ... -->` block. It may follow front matter.

The block must end within the first 20000 characters of the file. No other file has a header.

Inside it:

- the first line is the entry name;
- the paragraph after it is the `about` text; a blank line ends it;
- what follows, up to the first tag, is notes: free prose for people reading the file (the API reference worth keeping next to the code). It is not read;
- the tags come last, one per line: `@tag value`. `none` means empty. A line between tags that is not a tag is not read.

Escapes: `*\/` reads as `*/`; `\,` is a comma inside one item of a comma list; `\|` is a bar inside one piece of `@config` or `@source`.

```
/**
 * Data table
 * A table from rows and columns inside its own scroll frame, with numeric columns,
 * group rows with subtotals and signed figures.
 *
 * Kit.table.render(box, {columns, rows, group}) -> {update(rows), table}
 *   box   an element; it becomes the scroll frame
 *
 * @id        kit.table
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-25
 * @summary   A table in its own scroll frame with a sticky head and numeric columns.
 * @tags      table, data, numbers
 * @requires  none
 * @files     kit/table.css, kit/samples/table.json
 * @provides  Kit.table.render, Kit.table.fmt
 * @config    Kit.table.render(box, opts) | columns [{key, label, num}], rows, group
 * @tokens    --panel --ink --rule --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 5 artifacts' index.html | a scroll-framed table
 * @preview   {"render": "kit.table", "samples": ["kit/samples/table.json"]}
 * @changed   The sticky head needs the frame to scroll vertically.
 */
```

## Tags

The name and the `about` paragraph are required too.

| Tag | Required | Value |
|---|---|---|
| `@id` | always | `kind.name`; kind is one of `kit`, `layout`, `pattern`, `viz`, `theme`, `runtime`, `template`, `guide` and must match the folder: `kit/` is `kit`, `kit/viz/` `viz`, `kit/patterns/` `pattern`, `kit/layout/` `layout`, `kit/themes/` `theme`, `kit/templates/` `template`, `kit/guides/` `guide`, `adp.js` `runtime`. The file's stem (its name up to the first dot) is the name, or one of the two starts with the other plus `-`. |
| `@kind` | always | one of `component`, `theme`, `template`, `guide`: the kinds the catalog page shows |
| `@group` | always | the catalog group, for example `Board kit`, `Patterns` |
| `@status` | always | `new` or `stable` |
| `@version` | always | `major.minor.patch` |
| `@summary` | always | at most 260 characters |
| `@files` | always | comma list: the entry's other files, as paths from the catalog folder, in order; `none` when the main file is the only one. The entry's files are the main file, then these. A path may be in the `@files` of several entries (a shared sample); a file with a header of its own is an entry and goes in `@requires`. Every file under `kit/` must be named by an entry. |
| `@updated` | always | `YYYY-MM-DD` |
| `@tags` | always | comma list, lowercase, no repeats |
| `@requires` | always | `none` or a comma list of entry ids |
| `@provides` | in a `.js` main file | comma list of dotted names (`Kit.table.render`): every global the main file defines for others, not a subset (not machine-checked); `none` when it defines none. A name that starts with `Kit.` or `window.` must be defined in the entry's scripts. Methods of a returned handle and CSS classes belong in the notes. |
| `@config` | optional, repeats | `what | detail`, cut at the first ` | `: an API signature and what it takes, or a fact such as `fonts | <families>` on a theme. Both parts are required; when there is nothing to say, no `@config` line (`@config none` fails). |
| `@tokens` | when a file of the entry reads a custom property | the custom properties the theme must supply, separated by spaces; `none` when it supplies none. `--x?` is optional: every read of it has a fallback. A family whose names are built at run time is written with a placeholder (`--c-<pen>`). See below. |
| `@globals` | always | `none` or a comma list of the CDN scripts the page must load: `htm-preact`, `marked`, `dompurify` |
| `@db` | always | `none`, or sections separated by ` / `, each starting with a lowercase keyword and a space: `reads a; b / writes c; d / note free text`. A section without its keyword fails. |
| `@source` | optional, repeats | `board | file | what`, all three: where the entry came from |
| `@preview` | optional | one line of JSON |
| `@changed` | optional, repeats | one change, in one line; newest first (not machine-checked) |
| `@fonts` | optional | a theme's Google Fonts url (`docs/themes.md`) |
| `@extends` | optional | text |
| `@related`, `@optional` | optional | comma lists |

No other tag is allowed, and only `@config`, `@source` and `@changed` may appear twice.

`@tokens` is checked against the entry's files:

- a listed token must be written in a file of the entry, or match a name a file builds at run time;
- a property read as `var(--x)` with no fallback must be listed, and not as `--x?`;
- a property the entry's own files set, or the stylesheet of a required entry sets, is not listed. The walk through `@requires` stops at a theme: an entry made for one theme still lists what it reads of it.

## The index

`python3 -I skill/scripts/adp.py index [DIR]` writes `DIR/catalog.json` (schema `kit-catalog/2`) from the headers; DIR defaults to `skill/catalog`. When the headers or the tree have a problem it lists each one, writes nothing and exits 1. `--check` never writes: it exits 1 with each difference between the file and what the headers build, and each such problem.

- top level: `schema`, `url`, `ver`, `built`, `entries`, sorted by the path of the main file. Only `url`, `ver` and `built` are read from the file already there (`built` is kept when nothing else changed).
- an entry: `id`, `kind`, `group`, `name`, `summary`, `tags`, `status`, `version`, `requires`, `globals`, `provides`, `main`, `files`, `hash`, and `fonts`, `extends` when the header has them.
- a file: `path`, `role`, `sha256`, `bytes`. `role` comes from the path: `sample` under `kit/samples/`, else `template` (`.html.txt`, `.txt`), `script` (`.js`), `style` (`.css`), `doc` (`.md`), else `data`.

Everything else (`about`, `@config`, `@tokens`, `@db`, `@source`, `@changed`, `@preview`, `@updated`, `@related`, `@optional`) stays in the header.

## Add or change an entry

1. Write or edit the files under `skill/catalog/kit/`. The header goes in the main file; name every other file in `@files`. After a change, raise `@version` and add a `@changed` line (not machine-checked).
2. Run `python3 -I skill/scripts/adp.py index`.
3. Run the checks below and commit the files with `catalog.json`.

## Checking

- `python3 tools/check_headers.py [FILES...]` checks each header against the rules above and against the entry's files, except those marked "not machine-checked"; every rule it checks is an error. It also fails, under the rule `index`, on each difference between `catalog.json` and what the headers build. With no file arguments it checks every main file; `--report` counts per kind and per rule and always exits 0. The pre-commit hook `catalog-headers` runs it on the staged files of `skill/catalog/`.
- `python3 tools/check_catalog.py` fails on every difference and problem `adp.py index --check` lists, when a file in the tree belongs to no entry and is not one of the page's own (`catalog.json`, `index.html`, `adp.js`, `content.js`, `parts/`, `styles/`), or when `skill/catalog/adp.js` differs from `skill/assets/adp.js`. The pre-commit hook `catalog-check` and CI run it.
- `python3 -I skill/scripts/adp.py index --check`: CI and the release workflow run it.
