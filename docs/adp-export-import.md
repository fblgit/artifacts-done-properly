# ADP export/import (proposal, not implemented)

**Status:** design proposal for PR #81. Nothing here is built. It extends a shared format, so it needs the
owner's and Codex's agreement first (see "Decisions needed").

## Why

PR #81's acceptance gate is a successful exchange between two hosts, and `docs/host-live-test-protocol.md`
(scenario 8) says cross-host handoff counts only once export/import is implemented. Neither host provides it:
no platform API offers one, Claude's side has none, and `docs/openai-sites-transport.md` lists cross-host
import/export as outside the Sites implementation. The `claude-r2` and Sites receipts moved a synthetic
pack through PR comments, each agent applying it with its own host's guards. That is an agent-mediated
transfer, not this. ADP can supply export/import itself, without any platform API, as part of its shell.

## What already exists

- **Pack format:** `adp-seed/2`: `seed.json` index plus `seed/pack-N.json` with
  `docs: [{collection, id, data}]` (`docs/architecture.md`, `adp.py seed`). The synthetic pack in the receipts is
  this `docs` shape; its `format: "adp-seed-pack/1"` label is not defined anywhere in the repo.
- **Import today:** the `adp.js` `seedFromFile` loader expands a pack only into an **empty** database (it stops
  if `manifest/current` exists), once, with unguarded `set`.
- **Agent side:** `adp.py export`, `propose`, `ack` and `record` use a three-way base/live/incoming
  classification with holds, over **parts and files**, and print Artifact/ArtifactData calls.

## Missing

Export of a live artifact's **records**, and import into a **non-empty** target with a per-record decision, the
target's own guards, and a durable link back to the source.

## Proposed shape (smallest change)

1. **Bundle = `adp-seed/2` plus an optional `source` block**, so existing loaders keep working:
   `{host, artifact, exportedAt, sourceVersion, by}` and a per-doc `sourceRevision` map. Source revisions are
   evidence only, never a guard on the target.
2. **`adp.py bundle`:** input is the docs a host adapter read (like `export --docs D.json`), output is the
   bundle. Host-neutral because the reads arrive as data.
3. **`adp.py import-plan BUNDLE TARGET_DOCS.json`:** classifies each record against the target's freshly read
   docs: `create`, `identical` (skip), `update` (field-level diff using the measured update semantics: nested
   merge, whole-array replace, `null` kept, bare `__delete__` removes), or `held`/`conflict` where the target
   changed since the last import. Three-way for records: base = the last imported source doc (kept in an
   `imports/<bundle id>` doc), live = target, incoming = bundle. The output is a **plan**, not a write.
4. **Host apply adapters** print the host's own calls from the plan: Claude = one pinned ArtifactData batch
   (`if_version` from fresh reads); OpenAI Sites = `adp_write` with target revisions. Only these differ per host.
5. **Provenance in the target:** an `imports/<bundle id>` doc (source host, artifact, version, per-doc source
   revisions, applied or failed per record) plus the existing `changes/` record. This links a copy's identity
   and history to its source.

The apply step stays agent-executed and guarded by the target. No live sync is claimed.

## Decisions needed

1. **Format:** extend `adp-seed/2` with `source` (proposed), or a new schema name? If `adp-seed-pack/1` is to stay,
   both must be mapped.
2. **Record classification:** extend contract 4 to records as above, or treat `import-plan` as
   create/identical/update only (smaller, no three-way).
3. **Division:** Claude builds `bundle`, `import-plan` and the Claude apply printer; Codex builds the Sites apply
   printer against the same plan format. The plan and bundle formats are the shared contract and need the
   owner's sign-off.
4. **Acceptance:** whether a round trip through `bundle` and `import-plan`, each host applying its own printed
   steps, satisfies protocol scenario 8. That is the owner's call.

## Test plan if approved

Red then green on the existing three-record pack: new target (all `create`), repeat (all `identical`, zero
writes), target edited meanwhile (`held`), source edited (`update` preserving opaque fields), array replace,
`__delete__`, and a record absent from the bundle left untouched. Unit and local only, tests no longer than the
code; live evidence stays the existing receipts plus one fresh round trip.
