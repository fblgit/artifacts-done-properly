# Claude host adapter (`adp-host/1`)

`plugins/artifacts-done-properly/skills/adp/assets/adapters/claude.js` is an explicit `adp-host/1` provider over the claude.ai
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

## Tests

| Behaviour | Evidence |
| --- | --- |
| Adapter and built-in default give the same `ADP.host` (except `comments`), `ADP.db`, `ADP.ns`, `ADP.user` and `claude.use` calls | `tests/test_host_connection.py` (Node, fake `window.claude`, real `adp.js`) |
| Slow or never-settling `comments` does not hold `connect()` or page startup | same, plus adapter unit test |
| `user`: `canEdit` stays the viewer's own answer (the runtime still requires literal `true`); `id()` falls back to `''` when the page did not declare the `user` capability, so a missing `id()` does not fail the host | adapter unit test, `test_a_claude_user_without_id_still_connects` |
| `agent`, `publish` and `ask` are mapped from `comments.sendToClaude`, `artifact.publish` and `sample`, forward only what the native call takes, and are `null` when the viewer did not grant the capability | adapter contract test |
| Missing `window.claude` fails closed | both |

The rows above run against fakes.

Records move between hosts through the shared records shell (`adp.py bundle`, `import-plan`, `import-ack`; see `docs/adp-export-import.md`) with this
repo's Claude and Sites adapters. Applying is done by an agent running the printed calls, and no automatic cross-host sync exists.

## Not supported by the contract (gaps, proposals)

The adapter stays inside `adp-host/1` as written. These Claude behaviours cannot be
expressed by it today; the proposals are for the contract owners and are **not** applied.

1. **`artifact.publish`** (files map, `ifMatch`, `null` delete, all-or-nothing, `{version, shas}`,
   `conflict` rejection with paths): **now the optional `publish.files(files, opts)` handle** (`ADP.publish()`), used by
   the inbox Apply. Still Claude-only: the tester template and docs-to-files call `claude.use('artifact')` directly.
   A per-path receipt beyond `{version, shas}` is not in the contract.
2. **Request delivery** (`comments.canSendToClaude`, `sendToClaude`, `anchorFor`): **now the optional `agent` handle**
   (`ADP.agent()`: `label`, `canSend`, `send` → `{threadId, delivery}`, `anchorFor`), used by `Kit.assist` and
   `Kit.inbox`; `sample` is the separate `ask` handle. `claude-lane` still reaches the comments handle through
   `kit/store.js` and stays Claude-only. See `docs/host-adapters.md`.
3. **Late-bound capabilities.** `connect()` must settle but Claude's `comments` can be slow; the runtime
   solves this with an internal field of the built-in default (`commentsReady`). The adapter uses a lazy wrapper, so
   `ADP.host.comments` is `true` even if the viewer later grants none (anchoring then reports
   `not registered: unavailable`). *Proposal:* let `comments` be a promise, or add a settled-later status.
4. **Db profile is narrower than use.** The kit's assist pattern calls `doc.delete()`; the contract profile
   lists only `get/set/update/onSnapshot` plus queries. The host's own types also give `doc.collection`,
   `collection.add`, `query.get` and `doc.acquire` (a lease: `{holder, ttlMs, data}` to `{acquired, version,
   expiresAt, holder}`). Nothing in this repo calls `acquire`. *Proposal:* list the exact operations and run
   one conformance suite against the dev shim.
5. **Kit and `window.claude`.** `store.js` (the adp/1 board store), `claude-lane.js`, `tester.js` and the catalog page's `parts/catalog.js` still call `window.claude` directly and are Claude-only by design; they say so. `inbox.js`, `assist.js`, `assist-panel.js`, `request-card.js`, `presence.js` and the assistant template no longer do: they take `ADP.db`, `ADP.user` (with `can(name)`), `ADP.agent()`, `ADP.publish()` and `ADP.ask()`, so with an explicit non-Claude provider and `window.claude` both present they stay on the provider. *Proposal:* move `claude-lane` onto `pattern.assist` and retire it.
6. **No record version token.** Agent writes pin `if_version` per doc and publishes carry an artifact version;
   the contract's receipt says only "native version(s)". *Proposal:* name `source` and `record` tokens.
   Claude has no separate deployment version.
7. **No host attribution.** Records carry `by = user.id` only, so a later session on another host cannot
   tell which host wrote a change. *Proposal:* an additive `host` field (schema decision, not a bug fix).

Three behaviour changes sit in the shared runtime on the existing Claude path, not in this adapter (the third is `user` being wrapped, above):
`canEdit` now requires literal `true` (it accepted any truthy value; the live type is `Promise<boolean>`,
so the strict check matches the contract), and `anchors()` starts only
after `db` and `user` resolve (before, in parallel).

## Claude host behaviour the stand-in follows

`plugins/artifacts-done-properly/skills/adp/scripts/adp_dev.js` / `adp_dev.py` is the stand-in the tests and `adp.py dev` use for `window.claude`. It follows the
host's type definitions and the behaviour below. It is host behaviour, not a promise of the contract.

- Matches: `canEdit()` resolves a boolean; `canSendToClaude()` resolves `available`; `set` resolves `undefined`; snapshots carry
  `data/exists/id/metadata`; `update` merges; a missing doc reads `exists: false`; a stale `ifMatch` publish rejects `conflict` with
  `paths: [{path, expected, actual}]`.
- Followed in the stand-in (`tests/test_dev.py` checks the marker and the conflict): a publish conflict's `live` is the current version id and it
  carries `changed: []`; `update` removes a field for a bare `{__delete__: true}` and refuses the marker with other keys (`invalid_argument`);
  `orderBy` puts `null` lowest and a missing field last in both directions; `user.isOwner()` and `user.me()` exist.
- Not in the stand-in, because only the names or the uncontended shape are known: the top-level db path methods `get/set/update/delete/query/subscribe/
  unsubscribe/acquire` (the types list only `doc`/`collection`); `comments.create/delete/reply/resolve`; `user.profiles/search`; `doc.acquire`, which
  resolves `{acquired, expiresAt, holder, version}` uncontended (contention is not known, so it is not faked).
- Snapshots a host or fake must tolerate: a local write fires the listener with `hasPendingWrites: true`, then an empty-changes snapshot
  (`fromCache: true`), then a `modified` change for the doc it just added, then a settled snapshot. The first snapshot of a new listener is the
  viewer's last cached result for the query: it can hold documents deleted since and lack ones added since, and a later snapshot corrects it with
  `removed`/`added`. `adp.js` handles `removed` for `content/`.
  - **Modelled (query `onSnapshot` only), one case:** a document newly `set` in a collection that already holds two documents produces five snapshots
    (`+existing`, `+new` pending, an empty cache echo, `~new` from cache, a settled empty one), and a reload produces the persisted result first
    (`fromCache`, stale documents included) and then the corrected one with `removed`/`added`. The persisted result is the page's `localStorage`,
    standing in for the viewer's cache, keyed by the artifact: the server sends a store identity (a hash of the folder it serves) with the shim, so
    another artifact on the same localhost origin never sees it; without an identity nothing is kept. `tests/test_dev.py` runs the real shim in Node and
    asserts both traces.
  - **Replayed, not modelled:** a recorded six-snapshot reload (stale cache, pending echo, `-stale +added`, `-b`, empty, `+b ~a`, which includes another
    client's changes) is fed to the real `adp.js` content watcher through the host contract; the part texts follow it. A mutation that ignores `removed`
    fails that check.
  - **Differs from the stand-in:** the same write against an *empty* collection gives four snapshots with `fromCache` false throughout (`none`, `+new`
    pending, `none` pending, `~new` settled), so the stand-in's echo and acknowledgement flags are right only for a collection that already holds
    documents. A non-empty collection does not always give cache-flagged echo rows either.
  - **Not modelled:** updates, deletes, document-level `onSnapshot` (settled only), concurrent writers, the extra pending steps a reload shows around the
    first write, and query listeners already open when a write lands. The stand-in's persisted result survives only as long as the page's `localStorage`.
  - Nothing shipped reads `hasPendingWrites` or `fromCache`; a page that shows a "saving" state from them, or counts notifications per write, is not
    covered by these traces.
- Errors: `db.doc()` with an odd segment count throws synchronously with no `code`; an invalid query operator rejects `invalid_argument`. The types do
  not list `invalid_argument` as a publish code, which the stand-in returns.
- A viewer with view-only access: `use('db')` resolves and reads work, but `use('user')`, `use('comments')` and `use('artifact')` resolve `null`, and every
  write (set, update, delete, add, `acquire`, a nested `ns/` update) rejects `invalid_argument` ("The request was malformed or exceeds a limit"). A
  refusal is therefore indistinguishable from a malformed request or a missing document: there is no permission-specific code.
- `doc.update`: nested objects merge recursively (`{a:{x:1,y:2}}` + `{a:{y:9,z:3}}` gives `{a:{x:1,y:9,z:3}}`); arrays and scalars replace; an explicit
  `null` is stored as `null`; `{a:{__delete__:true}}` removes `a`; a dotted key such as `'a.x'` is stored as a literal key, not a path; updating a missing
  document rejects `invalid_argument`; `set` drops an `undefined` field. `orderBy('n')` also returns a document with no `n`, so a fake must not assume
  Firestore's exclusion.
- Timing: the db capability can take over a second to resolve cold and a few milliseconds warm; `use()` of an unknown name resolves `null` at once.
- The fakes in `tests/test_host_connection.py` are shape stubs (`doc()`/`collection()` entry points and canned snapshots), deliberately not behavioural,
  and do not reproduce the snapshot sequences above.

## Claude-only handles in shared code

`db` and `user` reach the kit through `ADP.db` and `ADP.user`, so an explicit host (Sites included) is honoured.
Claude's `artifact.publish`, `comments.sendToClaude` / `canSendToClaude` / `anchorFor` and `sample` reach shared
code as the host-neutral `agent`, `publish` and `ask` handles (`ADP.agent()`, `ADP.publish()`, `ADP.ask()`; see
`docs/host-adapters.md`): `Kit.assist`, `Kit.inbox` and the assistant template use them, and the Claude adapter and
built-in default are the only places those Claude names are mapped. `ADP.claude(name)` stays for pages that already
call it: it waits for the connection and calls `window.claude.use(name)` **only when the connected host's id is
`claude`**; on any other host it resolves `null` without touching `window.claude`. On a
non-Claude host without a publish handle the inbox disables Apply and says "Apply publishes this page's files, which only a Claude host can
do; this host does not provide it.". The assistant panel already
says "This page cannot reach a session." and "Ask now is not available on this page."


**Outside this surface:** `kit/store.js` is the adp/1 board store. It connects only through `window.claude.use('db')`
and `('user')` and says "Open this page on claude.ai" when that is absent, so a board built on it is Claude-only; it
is not part of the adp/2 host contract and is left unchanged. `kit/templates/tester.js` is a Claude capability tester
and is Claude-only by design, as are `claude-lane.js` and the catalog page's `parts/catalog.js`.

## Agent side

`plugins/artifacts-done-properly/skills/adp/scripts/adp_claude_adapter.py` is the Claude half of the shared records shell. It prints ArtifactData
`list` calls to read, one atomic `batch` (at most 50 writes, 1 MiB) to write, and parses the result text the agent
saves, wrapped as `[{call, result}]`. The adapter relies on this: a collection `list` shows each doc's native
`version`; a batch result names every committed doc with its new version; a refused batch starts "db batch
write failed (version_mismatch)", says nothing was written and names the first stale entry; an update that
rewrites the same text still bumps the version. A `set` over an existing doc is refused unless pinned, which is what makes an unpinned create safe. A batch is all or nothing,
so `parse_receipt` never reports part of one as applied. The adapter needs no
separate readback: the batch result is the authority. Claude's page files are not part of the shell (use
`adp.py files` plus a publish).

`adp.py work --host claude` (the work planner, `plugins/artifacts-done-properly/skills/adp/scripts/adp_work.py`) prints one guarded `set` for a request claim, progress, checkpoint, block or completion. Each is one pinned `ArtifactData` batch, read back after it runs. Put a large planned document in a file and reference it with `file_path` in the batch rather than pasting it.

Mapped to the contract's
operations by reading the existing `adp-edit` protocol: Discover/Read = `Artifact read` + ArtifactData reads
(each carries `version`); Propose = `adp.py propose` (`incoming/`); Publish = `Artifact publish` to the same
url plus pinned ArtifactData writes; Verify = re-read; Acknowledge = `adp.py record`.

An ArtifactData `batch` of three writes reports "committed atomically" with each doc at `version` 1; an `update` pinned `if_version: 1` commits and returns
version 2 (top-level fields merge, unknown fields survive, an array field is replaced whole); a second write pinned to version 1 is refused
`version_mismatch` naming version 2, and writes nothing. These versions are Claude doc revisions and are not tokens for another host.
