---
name: adp-edit
description: Edit, publish or answer comments on an ADP artifact that more than one agent or session works on. Load it before ANY edit, publish or comment reply on an artifact that has a manifest or db (adp/2), or when the user says several agents are editing, a comment was sent to Claude, or asks what changed. Gives the export, hold, publish, record protocol with version pins so a stale copy never overwrites newer work.
metadata:
  version: "2.0.0"
---

# Edit an ADP artifact (read, hold, publish, record)

Why: several agents change the page over many versions. The only lock is the `if_version` pin on a db write; a refused write means someone wrote first. Full text: `catalog/kit/guides/artifact-dataplane.md` in the adp skill's folder, read only if this road leaves a question open.

`ADP` means `python3 -I <adp skill folder>/scripts/adp.py`. DIR is the artifact laid out at its published paths and must hold EVERY published file. Batches are written to files (`--out`, default `DIR.adp/`) and printed as `writes` lists whose entries carry `file_path`. P.json maps `"collection/doc"` to the version you read, e.g. `{"manifest/current": 4, "parts/home": 2}`.

## Docs (ArtifactData)

`manifest/current`, `parts/<id>`, `content/<id>`, `changes/<NNNNNN>` (append-only), `agents/<name>`, `config/current`, `incoming/<pid>`, `requests/`, `presence/`. Every doc read returns `version`; every write to an existing doc needs `if_version`.

## Protocol

1. **Export (read).** `ADP export DIR --url URL` without its inputs prints the Artifact and ArtifactData reads and exits 2. Run them, save the results, run it again with `--files-listing F.json --docs D.json [--version V]`. It builds `DIR.adp/` (`incoming/`, `state.json`, base/live/work, `report.json`) and merges live into work when nothing is held. `ADP classify BASE.json LIVE.json INCOMING.json` sorts parts and files into new, ours, theirs, applied, held, retired.
2. **Hold.** `ADP hold DIR ID ... --by <you> [--hours H] [--pins P.json]` prints one pinned batch for the parts you will touch. A refused batch: export again. Someone else's live hold means hands off.
3. **Edit** in DIR. Keep every marker and `data-part`; add both for a new part; never reuse a retired id.
4. **Check.** `ADP check DIR`, `ADP manifest DIR`, then `ADP diff OLD.json NEW.json` or `ADP diff-pages OLD NEW` for the changed lines.
5. **Publish** to the same URL with `ADP files DIR [--since MANIFEST.json]` (only changed files; null removes one) and a `label` of at most 60 characters. On a conflict, merge onto the newer version; never force. Over 250 files use the printed batches.
6. **Record.** `ADP record OLD.json DIR --seq N --by <you> --summary "<what>" [--version V] [--threads T,..] [--pins P.json]` prints the batch (OLD.json is `manifest/current` as read; at most 50 writes, `manifest/current` last). Then `ADP ack DIR --result FILE` for the publish result.
7. **By proposal** (a DIR with `.adp/state.json` from export): `ADP propose DIR --by <you> --summary S [--retire ID --reason R]` writes `incoming/<pid>` and its batch; exit 2 lists what is held, unretired or missing an export. Resolve it, do not bypass it. `ADP ack DIR --proposal PID` moves base once applied.

`ADP config DIR` shows the switches. If `edit.locked` is true, stop and tell the user who locked it; `ADP config set KEY VALUE` changes one.

## Wording fixes need no publish

Copy lives in `content/<part id>`. Change it with an ArtifactData update with `if_version`, then record a change.

## Comments and requests

1. When a thread is sent to you, note the part its anchor sits in (anchors are part ids). Do not promise work in the thread.
2. The holder of that part makes the change and publishes.
3. Reply after the publish naming the version and the part ids.
4. A page with the Work with Claude pane keeps `requests/`: `ADP requests DUMP.json` lists the open ones; `--ack RID --by NAME`, `--progress RID --text T`, `--done RID --response FILE` write the pinned update.

## Other

- Agents cannot join a room; they learn of changes from comment watches, the newer-version notice on an Artifact result, and `agents/`. `ADP log -n 20` shows what the tool did.
- UNVERIFIED: `ADP gate` (the PreToolUse hook decision) reads a hook input on stdin and was not run here.
