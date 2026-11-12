# Catalog entry header

Every catalog entry describes itself in one comment at the top of its main file. `catalog.json` is built from these headers, so the header is the only place the entry's facts are written.

## Main file

The file that carries the header:

- a template or guide: its file with role `template` or `doc`;
- everything else: the first file with role `script`, otherwise the first with role `style`.

Other files of the entry (a stylesheet beside its script, samples) have no header.

## Comment

- `.js` and `.css`: the first `/** ... */` block. Leading `*` on each line is ignored.
- anything else (`.txt` templates, `.md`): the first `<!-- ... -->` block.

Inside it, the first line is the entry name and the first paragraph after it is the `about` text. Further paragraphs before the first tag are notes (the API reference worth keeping next to the code); they are not read into the catalog. The tags follow. A tag line starts with `@name`; a line that does not start with `@` continues the tag above it.

```
/**
 * Data table
 * A table from rows and columns inside its own scroll frame, with numeric columns,
 * group rows with subtotals and signed figures.
 *
 * @id        kit.table
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-25
 * @summary   A table in its own scroll frame with a sticky head and numeric columns.
 * @tags      table, data, numbers
 * @requires  none
 * @provides  Kit.table.render, Kit.table.fmt
 * @config    Kit.table.render(box, opts) | columns [{key, label, num}], rows, group
 * @config    markup | div.kit-table-box > table.kit-table
 * @tokens    --panel --ink --rule
 * @globals   none
 * @db        none
 */
```

## Tags

| Tag | Required | Value |
|---|---|---|
| `@id` | always | `kind.name`; kind is one of `kit`, `layout`, `pattern`, `viz`, `theme`, `runtime`, `template`, `guide`. Must be the entry that lists this file in `catalog.json`. |
| `@group` | always | the catalog group, for example `Board kit`, `Patterns` |
| `@status` | always | `new` or `stable` |
| `@version` | always | `major.minor.patch` |
| `@updated` | always | `YYYY-MM-DD`; drives "Latest entries" |
| `@summary` | always | one sentence, at most 260 characters |
| `@tags` | always | comma list, lowercase, no repeats |
| `@requires` | always | `none` or a comma list of entry ids |
| `@provides` | in a `.js` main file | `none` or a comma list of dotted JS names (`Kit.table.render`); methods of what it returns and CSS classes belong in the notes |
| `@config` | optional, repeats | `signature | what it takes`: what the page passes in |
| `@tokens` | when the entry has a style file | `none` or custom properties, comma or space separated; a trailing `?` marks an optional one (`--seam?`) |
| `@globals` | always | `none` or CDN scripts the page must load: `htm-preact`, `marked`, `dompurify` |
| `@db` | always | `none`, or the collections read and written, in words |

No other tag is allowed, and no tag appears twice except `@config`.

## Checking

`python3 tools/check_headers.py [FILES...]` validates headers. A main file without a valid header fails, so a catalog file can only be committed once its header is complete. The pre-commit hook `catalog-headers` runs it on the staged files of `skill/catalog/`. With no file arguments it checks every main file; `--report` counts conformance per kind and per rule and always exits 0.
