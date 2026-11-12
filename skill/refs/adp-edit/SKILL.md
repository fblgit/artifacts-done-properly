---
name: adp-edit
description: Edit, publish or answer comments on an ADP artifact that more than one agent or session works on. Load it before ANY edit, publish or comment reply on an artifact that has a manifest or db (adp/1 or adp/2), or when the user says several agents are editing, a comment was sent to Claude, or asks what changed. Gives the read, hold, publish, record protocol with version pins so a stale copy never overwrites newer work.
metadata:
  version: "2.0.0"
---

# Edit an ADP artifact (read, hold, publish, record)

Why: several agents change the page over many versions. The only lock is the `if_version` pin on a db write; a refused write means someone wrote first. Full text: `catalog/kit/guides/artifact-dataplane.md` in the adp skill's folder, read only if this road leaves a question open.

`ADP` means `python3 -I <adp skill folder>/scripts/adp.py`. DIR is the artifact laid out at its published paths; it must hold EVERY published file, images included.

## Docs you write (ArtifactData)

`manifest/current` (page_hash, parts, files), `parts/<id>`, `changes/<NNNNNN>` (append-only), `decisions/<slug>` (owner words, verbatim), `threads/<id>`, `agents/<name>`. Every doc read returns `version`; every write to an existing doc needs `if_version`.

## Protocol

1. **Read.** Artifact `read` of the latest version (never a local copy), then ArtifactData get `manifest/current` and list `parts`, `decisions`, `threads`, `agents`. Keep each doc's version. Run `ADP manifest DIR`: if its `page_hash` differs from `manifest/current.page_hash`, someone published without recording. Diff, record a `changes/` entry for the gap (`by: "unrecorded"`), then continue. With the export flow: `ADP export DIR --url URL` runs this read (run the asks it lists, then run it again).
2. **Hold.** `ADP hold DIR ID ... --by <you> [--hours H] [--pins P.json]` prints one pinned batch setting `holder` and `hold_until` (at most 2 h) on the parts you will touch. P.json maps `"collection/doc"` to the version you read. A refused batch: read again. Someone else's live hold means hands off.
3. **Edit.** Keep every marker and `data-part`; add both for a new part; never reuse a retired id. A new owner decision is written to `decisions/` first, quoted. Read active decisions before acting on one.
4. **Check.** `ADP check DIR`, then `ADP manifest DIR` and `ADP diff old-manifest.json new-manifest.json` (or `ADP diff-pages OLD_DIR NEW_DIR` for changed lines). Mark any unmarked new piece.
5. **Publish** to the same URL with a `label` (at most 60 characters). On a conflict, merge onto the newer version; never force.
6. **Record**, in one ArtifactData batch (at most 50 writes; split and put `manifest/current` last), every existing doc pinned: `ADP record OLD.json DIR --seq N --by <you> --summary "<what>" [--version V] [--threads T,..] [--pins P.json]` prints it. OLD.json is `manifest/current` as read. Then `ADP ack DIR --result FILE` for the publish result.
7. Pages that take changes by proposal (an exported DIR with `.adp/state.json`): `ADP propose DIR --by <you> --summary S` instead of publishing; exit 2 lists what is held or stale. Resolve it, do not bypass it.

If `ADP config DIR` shows `edit.locked`, stop and tell the user who locked it.

## Wording fixes need no publish

Copy lives in `content/<part id>`. Change it with an ArtifactData `str_replace` on field `html` with `if_version`, then record a `changes/` entry (`parts: []` if data only).

## Comments

1. When a thread is sent to you, record `threads/<id>` with `status: working` and the part its anchor sits in (anchors are part ids). Do not promise work in the thread.
2. The holder of that part makes the change and publishes.
3. Reply after the publish naming the version and the part ids, then set the thread `done` with `done_in`, and resolve it.

## Other

- Agents cannot join a room. They learn of changes from comment watches, the newer-version notice on an Artifact result, and `agents/`. The db is the record.
- After a publish, once someone has opened the page, read `checks/latest`: `missing`, `unmarked` or `overflow_x` non-empty means fix it.
- Roll old `changes/` into `changes/archive-<n>` past a few hundred.
