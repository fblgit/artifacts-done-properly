# Adopt: turning an artifact into catalog kits

Adoption takes a finished artifact (the subject) and extracts its reusable parts as catalog entries. It is a loop a person and Claude run together, one component at a time, so that a finished component never waits for the rest.

    detect -> select -> visualize -> work -> preview -> ready | keep working | discard -> pack

## States

One record per candidate, `candidates/<cid>` in the adopter's db.

| State | Meaning | Moves to |
| --- | --- | --- |
| `detected` | `adp.py extract` found it; nobody looked | `selected`, `discarded` |
| `selected` | the person wants it as a kit | `working`, `discarded` |
| `working` | a request to Claude is open (rewrite, rename, strip the subject's names, write the header, write a sample) | `preview` |
| `preview` | Claude's result renders in the preview beside the original | `working` (more changes), `ready`, `discarded` |
| `ready` | accepted; the pack is built | `working` (reopened) |
| `discarded` | not worth a kit; kept so it is not detected again | `detected` (restore) |

Any state can reach `discarded`, and `discarded` can be restored. `ready` is the only state that makes a pack. Moves are the person's, except `working` -> `preview`, which Claude makes when it answers.

## The three views

1. **Map.** The candidates as a graph: a node per candidate, an edge per dependency (A needs something B provides), colour by state, size by bytes. A candidate that overlaps a catalog entry shows that entry's id. This is the canvas/mind-map.
2. **Inspector.** The subject runs live in an iframe. The adopter serves a copy of the subject's files on its own origin, so the iframe is same-origin and the page can look inside. Hover outlines the element under the pointer; a click resolves it to a candidate by `data-part`, by the CSS file that defines its classes, or by the script that provides its `window` namespace, and selects that node on the map. This is the dev-tools picker.
3. **Work.** The selected candidate: files, what it provides, what it needs, notes, and the request lane to Claude ("make this generic", "split this", "write the header"). A reply puts the candidate in `preview`.

## Detection (`adp.py extract DIR`)

Static and deterministic; it never judges meaning, Claude does. For each script under `parts/` (and `kit/` files that are not in the catalog) it finds:

- the unit: the script plus the stylesheet with the same stem, plus other stylesheets whose class names the script uses;
- `provides`: names it assigns on a global namespace (`Hue.picker = ...`, `window.X = ...`);
- `needs`: names it reads that another unit provides (these are the edges), `Kit.*` names the catalog already provides, and CDN globals;
- `domain`: names on the subject's own namespace that no unit in the candidate provides back, a measure of how tied it is to the subject (`coupling`);
- `similar`: catalog entries whose `provides`, tags or name overlap, so `dial` is flagged against `kit.dial` before it is duplicated.

Output is `adopt-candidates/1` JSON (`candidates.json`).

## The pack (`.adp.json`)

A ready candidate becomes one portable file, `adp-pack/1`: JSON with the entry id, kind and version, every file with `sha256` and text, the provenance (subject url, version, source paths and hashes), and `patch`, a unified diff that `git apply` accepts at the root of an ADP repo checkout (paths `skill/catalog/kit/...`). `adp.py unpack X.adp.json` verifies the hashes and the patch; `--to DIR` writes the files; `--apply` runs `git apply` on a checkout. The file is `<entry id>.adp.json`: plain JSON, so an artifact serves it and a browser downloads it as it is. (`.adp` alone is not a web media type, and `DIR.adp/` is already the state folder of `adp.py export`.)

## What ships

| Piece | Entry |
| --- | --- |
| `adp.py extract`, `pack`, `unpack` | scripts |
| `kit.adopt` | candidate schema, the state machine, owner resolution, pack validation (no DOM) |
| `pattern.adopt-map` | the Map view |
| `pattern.adopt-inspector` | the Inspector view |
| `pattern.adopt-work` | the Work view, with the pack and download |
| `template.adopter` | the assistant template wired to the three views and `candidates.json` |

## Minimum for use

Open the adopter on a subject, see every candidate, pick one in the preview or the map, send work to Claude, accept or discard, download the `.adp`. Not in the first cut: splitting a candidate inside a file, editing files in the page, diffing a candidate against the catalog entry it overlaps.

## Run it

    ADP=skill/scripts/adp.py
    python3 -I $ADP new adopter ADOPTER --title "Adopt <name>"      # the assistant page plus the Adopt view
    python3 -I $ADP extract SUBJECT --catalog - --into ADOPTER      # SUBJECT: the artifact's files, fetched with Artifact read
    python3 -I $ADP check ADOPTER                                   # files under subject/ are copied, never read for parts
    # publish ADOPTER (adp.py files), open it, then work candidate by candidate
    python3 -I $ADP pack kit.picker STAGING --candidates ADOPTER/subject/candidates.json --cid c.picker
    python3 -I $ADP unpack kit.picker.adp.json --apply CATALOG_CHECKOUT

The page keeps the person's decisions in one db doc, `ns/shared/adopt/state` (`{candidate id: {state, notes, at}}`), and a candidate's pack in `ns/shared/adopt/packs/<id>`. A request sent from the board names both, so the session that does the work records where the result went.

Not run in a browser when this was written (no Node or browser available): `kit.adopt`, `pattern.adopt-board`, `pattern.adopt-inspector` and the template's `parts/adopt.js`. The Python side and the template's build are covered by `tests/test_adopt.py`.

## Rules

- The subject is never changed by adoption. Its parts keep their ids.
- A pack never contains the subject's data or secrets: `extract` skips `data/` and `sample` files unless a candidate lists one as its sample.
- Nothing publishes to a catalog others use without the owner's say-so.
