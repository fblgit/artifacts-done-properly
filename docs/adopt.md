# Adopt: turning an artifact into catalog kits

Adoption takes a finished artifact (the subject) and extracts its reusable parts as catalog entries. It is a loop a person and Claude run together, one component at a time, so that a finished component never waits for the rest.

    analyze -> select -> visualize -> work -> preview -> ready | keep working | discard -> pack

Analyze is the only phase that reads the subject's code, and its output is one file, `candidates.json` (the contract below). Anything can produce it: `adp.py extract` is the deterministic baseline (separate script and style files, a shared global namespace), and an agent that has read the artifact and the contract can produce it for an artifact of any shape (one file, ES modules, components in one script). `adp.py candidates FILE --subject DIR` checks either one before the board loads it.

## States

One record per candidate, `candidates/<cid>` in the adopter's db.

| State | Meaning | Moves to |
| --- | --- | --- |
| `detected` | the analysis found it; nobody looked | `selected`, `discarded` |
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

## The baseline analyzer (`adp.py extract DIR`)

The baseline is static and deterministic; it never judges meaning, an agent does. For each script under `parts/` (and `kit/` files that are not in the catalog) it finds:

- the unit: the script plus the stylesheet with the same stem, plus other stylesheets whose class names the script uses;
- `provides`: names it assigns on a global namespace (`Hue.picker = ...`, `window.X = ...`);
- `needs`: names it reads that another unit provides (these are the edges), `Kit.*` names the catalog already provides, and CDN globals;
- `domain`: names on the subject's own namespace that no unit in the candidate provides back, a measure of how tied it is to the subject (`coupling`);
- `similar`: catalog entries whose `provides`, tags or name overlap, so `dial` is flagged against `kit.dial` before it is duplicated.

Output is `adopt-candidates/1` JSON (`candidates.json`).

## The analysis contract (`adopt-candidates/1`)

`{schema: "adopt-candidates/1", subject: {name}, candidates: [...]}`, plus any other keys `extract` writes (`namespace`, `shared_css`, `base`, `taken`; the page ignores them). Each candidate:

| Field | Required | What it drives |
| --- | --- | --- |
| `id` | yes | the key of the person's decision (`ns/shared/adopt/state`) and of the pack. Unique, lowercase, `[a-z0-9._-]`. Never change it once decisions exist. |
| `name` | yes | the word on the map node |
| `files` | yes | `[{path, sha256?, bytes?}]`, paths inside the subject. The pack's source; `sha256` lets `candidates --subject` notice the subject changed since the analysis. |
| `state` | no | one of `detected` (default), `selected`, `working`, `preview`, `ready`, `discarded`; the person's own state in the db wins |
| `provides` | no | what it offers, as names (`Hue.picker`); shown in the panel |
| `needs` | no | ids of other candidates it depends on: each is an edge, and the layer is the longest chain of them. An id that is not a candidate draws nothing. |
| `classes`, `ids` | no, but see below | the CSS classes and DOM ids this candidate draws. The inspector resolves a clicked element to the nearest ancestor whose class or id is listed. A candidate with neither can never be picked by clicking, only from the map. A class shared by two candidates goes to the first. |
| `suggested_id` | no | the catalog id it would become: `kind.name`, kind one of `kit layout pattern viz theme runtime template guide` |
| `summary`, `part`, `kind_hint`, `similar`, `coupling`, `standalone`, `needed_by`, `regions`, `tokens`, `kit_uses`, `globals`, `bytes` | no | shown or kept for the work request; `similar` is `[{id, score}]` of catalog entries it overlaps |

An agent writing the file should: split the artifact into components a person would want as one kit each; list for each the files (or, for one big file, the file and a `regions` entry saying which lines); say what it needs from the others; and list the classes and ids it draws, including ones defined in a stylesheet the whole page shares. It then runs `adp.py candidates FILE --subject DIR` and fixes every error. Warnings are worth reading: a candidate nobody can pick, a class two candidates claim, a file in two candidates, a cycle.

## The pack (`.adp.json`)

A ready candidate becomes one portable file, `adp-pack/1`: JSON with the entry id, kind and version, every file with `sha256` and text, the provenance (subject url, version, source paths and hashes), and `patch`, a unified diff that `git apply` accepts at the root of an ADP repo checkout (paths `skill/catalog/kit/...`). `adp.py unpack X.adp.json` verifies the hashes and the patch; `--to DIR` writes the files; `--apply` runs `git apply` on a checkout. The file is `<entry id>.adp.json`: plain JSON, so an artifact serves it and a browser downloads it as it is. (`.adp` alone is not a web media type, and `DIR.adp/` is already the state folder of `adp.py export`.)

## What ships

| Piece | Entry |
| --- | --- |
| `adp.py extract`, `candidates`, `pack`, `unpack` | scripts |
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

The page keeps the person's decisions on the server, so a refresh forgets nothing: `ns/shared/adopt/state` (`{items: [{id, state, notes, at}]}`, a list because ids hold dots), `ns/shared/adopt/view` (`{selected, at}`, the candidate shown last), and a candidate's pack in `ns/shared/adopt/packs/<id>`. The board's status line says Saved, Restored or Not saved. A request sent from the board names both, so the session that does the work records where the result went.

Tested under Node: the engine (`tests/adopt_engine.js`), and with jsdom the board, the inspector over a stand-in frame and the template's `parts/adopt.js` against an in-memory database (`tests/adopt_dom.js`, `tests/adopt_glue.js`; run by `tests/test_adopt_js.py`, which needs `ADOPT_JSDOM_DIR` to hold `node_modules/jsdom` and is skipped without it). Not tested in a real browser or against claude.ai's database: the look of the page, the sandbox of the preview frame, and the db handle's exact behaviour.

## Rules

- The subject is never changed by adoption. Its parts keep their ids.
- A pack never contains the subject's data or secrets: `extract` skips `data/` and `sample` files unless a candidate lists one as its sample.
- Nothing publishes to a catalog others use without the owner's say-so.
