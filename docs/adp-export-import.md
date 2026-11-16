# Shared ADP shell and host adapters

PR #81 implements one host-neutral record export/import shell in `adp.py`, with
Claude and Sites adapters. The shell owns bundles, classification and provenance;
adapters translate native reads, guarded writes and receipts. Agents execute the
emitted calls with their authorized host tools. There is no automatic sync.

## Bundle and provenance

A bundle reuses `adp-seed/2`: `seed.json` indexes `seed/pack-N.json`, each containing
`docs: [{collection, id, data}]`. Additive `source` metadata identifies the source
host, artifact, publication version, export time, author and bundle hash. The
index's `revisions` map records source-native revisions as evidence; these are
never destination guards. The earlier receipt label `adp-seed-pack/1` is not a
separate supported format.

Export covers manifest, parts, content, changes, decisions, config, agents,
incoming, requests, and each request’s nested `turns` collection. Raw exports
request the nested reads after discovering request IDs; append those results and
retry to preserve replies. Pass `--collections` for additional namespaces containing
artifact knowledge. Transient status/presence and the shell's imports records
are excluded. Raw exports refuse missing required collection reads. A normalized
DOCS file is an agent-supplied assertion; use raw tool envelopes for checked
coverage.

## Export through the adapter

```sh
python3 -I skill/scripts/adp.py bundle --host claude --artifact SOURCE
# Execute the emitted reads and save [{call, result}] as source-reads.json.
python3 -I skill/scripts/adp.py bundle source-reads.json bundle-dir \
  --host claude --artifact SOURCE --version PUBLICATION_VERSION --raw
```

Use `--host sites` with the Site artifact namespace to select the Sites adapter.
Use `--collections ns/host-check/context` where that namespace holds fixture
context. Host identities and artifact locators remain distinct.

## Plan and apply an import

```sh
python3 -I skill/scripts/adp.py import-plan bundle-dir \
  --host sites --artifact TARGET
# Execute every emitted read; save [{call, result}] as target-reads.json.
python3 -I skill/scripts/adp.py import-plan bundle-dir target-reads.json \
  --host sites --artifact TARGET --raw --out plan.json
```

Planning reuses `adp_loop.classify3` on canonical record hashes. Its base is the
last imported hash in `imports/<source>`, live is the current target, and incoming
is the bundle. New records create, source-only changes replace, equal records
skip, target-only changes remain, and competing changes hold. A hold exits 2
and emits no write calls. Records absent from the bundle are untouched; imports
do not delete records or discard opaque fields from the supplied record bodies.

Run the plan's calls in order. Sites reads each named record, retaining native
revisions even for absent/tombstoned records; replacement and creation use those
fresh guards. Sites calls are not atomic. Stop on rejection or an unknown result,
and do not write `manifest/current` until earlier required records succeed.
Claude uses its native guarded batch semantics. Source revisions never authorize
target writes.

## Read back and acknowledge

Save execution envelopes as `[{call, result, readback}]`. Sites write descriptors
include the authoritative `adp_read` to execute afterward. The Sites adapter only
reports applied when both the write result and that readback match the intended
record and native revision. A lost response remains unknown; read authoritative
state before replanning rather than blindly retrying. Claude's adapter parses
its native per-record committed batch outcomes.

Sites also accepts grouped readback as `{call: <adp_query descriptor>, result}`
inside an execution envelope's `readback`. It checks the Site artifact namespace,
collection, document ID, exact data and native revision for each intended write.
These remain query receipts; they are not presented as individual document reads.

```sh
python3 -I skill/scripts/adp.py import-ack plan.json results.json \
  --host sites --raw
```

This emits guarded provenance and, for confirmed mutations, a `changes/` entry.
Execute and verify these calls too: printing an acknowledgement is not persisting
one. Rejected and unknown operations are listed as unfinished; prior base hashes
are retained. Re-read before retrying. Repeat imports of unchanged records emit
no content writes.

For a first return to the originating artifact, pass
`--base ORIGINAL_BUNDLE_DIR` to `import-plan` to name the known common ancestor.
Otherwise a changed record with no prior import is held. Recorded import hashes
take precedence over this optional base; fresh destination revisions still guard
every write. `--raw` is a no-value switch and may precede `--by` or other options.

## Scope and acceptance

The shell transfers records, not source files. Publish page files through the
existing `adp.py files` and host publication workflow; source revision, publication
version, deployment version and record revisions are separate evidence. Imported
manifest records alone do not establish destination file/hash integrity.

Live record-store receipts now cover a minimal real adp/2 artifact moving Claude
to Sites to the original Claude artifact through these commands and adapters,
with manifest, parts, history, guarded writes and readback. Sites verified repeat
no-op and stale-destination rejection; Claude's receipt reports the corresponding
return-side checks passed too. Claude's live phase durations were not recorded.
The earlier OpenAI browser/agent/browser receipt
is separate from this record-store shell run. The deployed Sites shell now renders
the imported records, context, provenance and history. Direct browser observations
in PR comments 6914883927 and 6914915590 verify the owner's subsequent intro edit
at revision 3 and its persistence after reload. That newer edit has not been
returned to Claude. Claude browser rendering after the return and source-file/hash
integrity are not established by these receipts.
Local tests are not live-host certification. PR #81 remains draft until its
agreed acceptance gate is met.
