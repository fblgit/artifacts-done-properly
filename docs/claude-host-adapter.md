# Claude host adapter (`adp-host/1`)

`skill/assets/adapters/claude.js` is an explicit `adp-host/1` provider over the claude.ai
viewer's `window.claude.use('db'|'user'|'comments')`. It does what the runtime's built-in
Claude default does (same capabilities, same `claude` host id, seed files on), so existing
`adp/2` records, part ids, hashes and classification are untouched. The default is
unchanged: pages with no `ADP_HOST` still use the built-in bridge. The adapter is opt-in:

```html
<script src="adapters/claude.js"></script>
<script>window.ADP_HOST = ADPClaudeHost.create();</script>
<script src="adp.js"></script>
```

Without `window.claude` the adapter's `connect()` throws: `ADP.host.status` is `failed`,
not `static`. It never falls back to another host.

## Verified, and how

| Behaviour | Evidence |
| --- | --- |
| Adapter and built-in default give the same `ADP.host` (except `comments`), `ADP.db`, `ADP.ns`, `ADP.user` and `claude.use` calls | `tests/test_host_connection.py` (Node, fake `window.claude`, real `adp.js`) |
| Slow or never-settling `comments` does not hold `connect()` or page startup | same, plus adapter unit test |
| `user` passes through unchanged; no coercion into edit rights | adapter unit test |
| Missing `window.claude` fails closed | both |

All of it runs against fakes. **No live claude.ai viewer, publish or Claude session was
tested**, and no cross-host (Claude to OpenAI) flow was tested.

## Not supported by the contract (gaps, proposals)

The adapter stays inside `adp-host/1` as written. These Claude behaviours cannot be
expressed by it today; the proposals are for the contract owners and are **not** applied.

1. **`artifact.publish`** (files map, `ifMatch`, `null` delete, all-or-nothing, `{version, shas}`,
   `conflict` rejection with paths): no connection slot. Used by the inbox Apply, the tester
   template and docs-to-files. *Proposal:* optional `publish` capability with a receipt of
   source version and per-path outcomes.
2. **Request delivery** (`comments.canSendToClaude`, `sendToClaude`, `anchorFor`): the contract has only
   `customAnchors`, and rightly says saving is not waking an agent. Assist, inbox and
   `claude-lane` need it. *Proposal:* optional host-neutral `notify` with delivered/queued/unknown states.
3. **Late-bound capabilities.** `connect()` must settle but Claude's `comments` can be slow; the runtime
   solves this with an undocumented `legacyComments` field. The adapter uses a lazy wrapper, so
   `ADP.host.comments` is `true` even if the viewer later grants none (anchoring then reports
   `not registered: unavailable`). *Proposal:* let `comments` be a promise, or add a settled-later status.
4. **Db profile is narrower than use.** The kit's assist pattern calls `doc.delete()`; the contract profile
   lists only `get/set/update/onSnapshot` plus queries. The live 0.2.96 types also give `doc.collection`,
   `collection.add`, `query.get` and `doc.acquire` (a lease: `{holder, ttlMs, data}` to `{acquired, version,
   expiresAt, holder}`). Nothing in this repo calls `acquire`. *Proposal:* list the exact operations and run
   one conformance suite against the dev shim.
5. **Kit bypasses `ADP.host`.** `store.js`, `inbox.js`, `assist.js`, `claude-lane.js`, `catalog.js`, the assistant
   template and `tester.js` call `window.claude` directly. With an explicit non-Claude provider and
   `window.claude` both present they would still reach Claude, against the no-fallback rule.
   *Proposal:* expose granted capabilities through `ADP.host`, then move the kit onto it.
6. **No record version token.** Agent writes pin `if_version` per doc and publishes carry an artifact version;
   the contract's receipt says only "native version(s)". *Proposal:* name `source` and `record` tokens.
   Claude has no separate deployment version.
7. **No host attribution.** Records carry `by = user.id` only, so a later session on another host cannot
   tell which host wrote a change. *Proposal:* an additive `host` field (schema decision, not a bug fix).

Two behaviour changes sit in the shared runtime on the existing Claude path, not in this adapter:
`canEdit` now requires literal `true` (it accepted any truthy value; the live type is `Promise<boolean>`,
so the strict check matches the contract, though no live call was observed), and `anchors()` starts only
after `db` and `user` resolve (before, in parallel).

## Test interfaces against the live types

Two sources, in decreasing weight. **Observed live** (2026-11-16, one claude.ai viewer, runtime contract
0.2.96, a private disposable probe page with synthetic data; it exercised the viewer's own `window.claude`,
not `adapters/claude.js` itself): and the platform's type definitions for that contract. Differences in
`skill/scripts/adp_dev.js` / `adp_dev.py`, the stand-in the tests and `adp.py dev` use:

- Observed, matches: `canEdit()` resolves a boolean; `canSendToClaude()` resolves `available`; `set` resolves
  `undefined`; snapshots carry `data/exists/id/metadata`; `update` merges; a missing doc reads
  `exists: false`; a stale `ifMatch` publish rejects `conflict` with `paths: [{path, expected, actual}]`.
- Observed, the dev stand-in lacks it: the top-level db also has path methods `get/set/update/delete/query/
  subscribe/unsubscribe/acquire` (the types list only `doc`/`collection`); `comments` also has `create/delete/
  reply/resolve`; `user` has `isOwner/me/profiles/search`; `doc.acquire` resolves
  `{acquired, expiresAt, holder, version}`; a conflict's `live` is the current version id and `changed` is
  present (the stand-in sends `live: ''`).
- Observed, snapshot behaviour a host or fake must tolerate: a local write fires the listener with
  `hasPendingWrites: true`, then an empty-changes snapshot (`fromCache: true`), then a `modified` change for
  the doc it just added, then a settled snapshot. The stand-in's metadata is constant and fires once.
- Observed, errors: `db.doc()` with an odd segment count throws synchronously with no `code`; an invalid query
  operator rejects `invalid_argument`. Not observed: the stand-in's `invalid_argument` from publish; the types
  do not list it as a publish code.
- Observed, timing: the db capability took 1.3 s to resolve; `use()` of an unknown name resolved `null` at once.
- The fakes in `tests/test_host_connection.py` are shape stubs (`doc()`/`collection()` entry points and
  canned snapshots), deliberately not behavioural, and do not reproduce the snapshot sequence above.
- Still UNVERIFIED: consent prompts, the 10 s `use()` timeout, rate limits, live reload after a successful
  publish, read-only viewers (a write attempted `as_level: view` is blocked by the agent tool before it is
  sent, so it proves nothing about server rejection), and `adapters/claude.js` itself in a live viewer.

## Agent side (not implemented here)

`adp.py` prints Artifact and ArtifactData calls; nothing here changes it. Mapped to the contract's
operations by reading the existing `adp-edit` protocol: Discover/Read = `Artifact read` + ArtifactData reads
(each carries `version`); Propose = `adp.py propose` (`incoming/`); Publish = `Artifact publish` to the same
url plus pinned ArtifactData writes; Verify = re-read; Acknowledge = `adp.py record`.

Observed live through ArtifactData on the probe artifact (same run, synthetic records at `content/intro`,
`decisions/keep-intent`, `ns/host-check/context/current`, which is collection `ns/host-check/context`, doc
`current`): a 3-write `batch` reported "committed atomically" with per-doc `version` 1; an `update` pinned
`if_version: 1` committed and returned version 2 (top-level fields merge, unknown fields survive, an array
field is replaced whole); a second write pinned to version 1 was refused `version_mismatch` naming version 2,
and wrote nothing; read-back matched. These versions are Claude doc revisions and are not tokens for another
host. Not observed: partial batch failure, a lost write response, or the rendered page reflecting the edit.
