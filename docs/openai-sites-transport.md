# OpenAI Sites transport (experimental)

This implements the OpenAI side using **Sites' existing Worker + D1 hosting**.
It does not require a separately purchased backend or invent an OpenAI browser SDK.
It is a working transport implementation, not yet a live-host certification.

For a ready-to-run local server, see [Codex/Sites localhost](openai-localhost.md).

## Anchored requests and identity

Load `openai-sites-comments.js` before connecting and pass `comments: true` to
`ADPOpenAISites.create` to enable application-owned anchored feedback. Its
`customAnchors` controller implements the ADP runtime's mode, thread, compose,
reveal and placement flow. Feedback uses existing `requests/` and numbered
`requests/<id>/turns/` records, with part scope, native revision guards and
authoritative readback. Resolution of a thread does not assert that an agent
completed the request. Saves are queued, never labelled delivered to an agent.
Unknown writes and failed readbacks require inspection before another send;
partially saved replies are reported separately from request reopening.

The Sites identity exposes `id`, `canEdit`, `can('data.write')`, `isOwner` and
`me`. Ownership comes from explicit `ADP_OWNERS`, not editor membership.
Unavailable profile fields are empty/null. The Worker continues to enforce
membership and editor writes independently of these UI hints. Nested
`doc.collection` and guarded `collection.add` support the existing kit's turns.

These capabilities are undergoing live verification on PR #81; application-owned
feedback must not be described as a native Sites comment service.

## Components

- `skill/assets/adapters/openai-sites.js`: same-origin HTTP bridge implementing
  the runtime document/query interface, with serialized snapshot polling (2s default,
  configurable >=1s), change events, unsubscribe and explicit transport errors.
- `skill/assets/hosts/openai-sites/worker.mjs`: Worker handler for the HTTP API and
  Site MCP tools (`adp_session`, `adp_read`, `adp_query`, `adp_write`).
- `schema.sql`: bounded, schema-only D1 migration. Records are keyed by artifact
  and path, preserving nested `ns/<name>/...` namespaces.
- `fixture.html` and `tools/build_sites_fixture.py`: disposable browser fixture,
  including the actual ADP runtime, not a production editor.

```html
<script src="adapters/openai.js"></script>
<script src="adapters/openai-sites.js"></script>
<script>
window.ADP_HOST = ADPOpenAIHost.create({
  profile: 'sites',
  bridge: ADPOpenAISites.create({endpoint: '/api/adp/my-artifact'})
});
</script>
<script src="adp.js"></script>
```

The same `artifact` identifier must be used by browser endpoints and MCP calls.
It is a local storage namespace, not a global cross-host identity.

## Host integration

1. Use a **private test Site** and its normal server-backed build workflow. Route
   `/api/adp/*` and `/mcp` to the supplied Worker handler; preserve other routes.
2. Declare a D1 binding named `DB` with the supported Sites hosting manifest and
   incorporate `schema.sql` into that Site's generated schema migration history.
   Never create tables on requests or replay an applied migration. Sites provisions
   the D1 resource. Existing Sites must preserve their migrations and bindings.
3. Configure `ADP_EDITORS` and optionally `ADP_READERS` as comma-separated, exact
   **Site-scoped user IDs** in server runtime configuration. Empty lists deny all.
   The authenticated `session` endpoint and `adp_session` tool return the caller's own ID for setup,
   but grants no record access before membership is configured.
   These members can access every artifact namespace in this Site. Use separate
   Sites or add narrower membership rules if artifacts need different audiences.
4. Declare `mcp` in the Site's `capabilities`. Its normal publication flow creates
   the private plugin; do not create a second generic MCP plugin. Connect the Site
   plugin and verify `adp_read` from the agent, not just from browser JavaScript.
5. Publish only under the owner's authorization. No Site was registered or deployed
   by this repository change. Source version, deployed version and record revision
   remain separate.

The fixture builder accepts an empty output directory:

```sh
python3 tools/build_sites_fixture.py /tmp/adp-site-fixture
```

It embeds the HTML/runtime/adapter assets in a self-contained Worker at
`dist/server/index.js` and copies the schema. It deliberately does **not** generate
Site identity, register resources, apply migrations, set memberships or deploy.
Integrate the output through the current Sites tooling; do not guess a project ID.

## Security boundary

`oai-authenticated-user-id` is trusted **only behind Sites Dispatch**, which
establishes the caller's identity. Never expose this handler directly on an
untrusted Worker endpoint that accepts spoofed headers. A test's injected header
is not evidence that production authentication passed. No development identity
bypass is included. A service access token is not a user identity and alone does
not grant access to these endpoints.

Authenticated tool discovery and own-ID lookup work before membership; neither grants data access.
Every record operation checks membership server-side. Readers cannot write even to
`status/integrity`. Browser requests pin the connection's identity with
`x-adp-user`; a changed session is rejected until reload. JSON requests are bounded
at 256KiB and cross-origin browser requests are rejected. SQL parameters are bound;
no secrets or identity credentials go into the browser bundle.

MCP tools expose record operations only, not source deployment. The write tool
requires an expected revision; the agent must read first and reconcile a conflict
or uncertain result before retrying. Tool availability is not permission to write:
the calling agent still follows its user's authorized scope.

## Semantics and limits

- Record `get()` snapshots expose `revision`. `set`, `update`, `delete` accept an
  optional second/options argument `{expectedRevision}`. A stale guard returns 409.
  The MCP write tool always requires the guard. Deletions retain tombstones so
  delete/recreate cannot reset a revision and admit an old write.
- Existing runtime writes that do not pass a guard remain last-writer-wins. This
  does **not** upgrade ADP's overall configuration editing to conflict-safe.
- `update()` recursively merges objects, replaces arrays/scalars, preserves explicit
  nulls and treats dotted keys literally, matching Claude's live `claude-r1` receipt
  in PR #81. A nested `{__delete__: true}` removes that field. Marker objects with
  additional keys are rejected until their live semantics are established. Updating
  a missing document fails. No atomic batch writes. Sites keeps its explicit HTTP
  error codes; it does not pretend to be Claude's native API.
- Document paths have even segment counts and collection paths odd counts. The
  adapter accepts the ASCII record-ID punctuation used by ADP seed packs, including
  `~`, `:`, `@` and `+`, with a 512-character path limit. This does not certify every
  native Claude path/limit.
- Equality filters support JSON scalar operands; ordered fields should have
  consistent scalar types. Queries fail explicitly if a collection exceeds 1,000
  live records or 1MiB of stored JSON; no silent truncation of the source collection. Partition large
  collections before using this experimental profile at scale.
- Polling is not real-time push. Failure callbacks are delivered, polling resumes,
  and subscriptions can be canceled. Writes with an unknown response must be read
  back before retrying; automatic mutation retries are not implemented.
- Native Sites comments and automatic agent wakeups are not provided by this
  transport. Anchored requests use the application-owned controller above.
  Record import/export is implemented by the shared shell. Source publication
  uses the agent workflow below; native Space Pages remain a separate host.

## Source lifecycle through an agent

The browser cannot publish Site source. An authorized agent uses the same ADP
export, hold, propose, record and ack commands with native Sites publication:

1. Open the existing Site source through the Sites source helper. Read deployed
   files and native records. Normalize Sites `revision` to the shared shell's
   `version` field without treating it as a publication version. Keep raw reads.
2. Compare deployed files with the pinned source checkout. Sites may append a
   script to HTML: retain the raw response and normalize only a verified host
   addition around the exact source bytes. Never trim arbitrary differing HTML
   merely to make hashes match. Feed the verified source listing and records to
   `adp.py export`; reconcile conflicts before editing.
3. Read affected part and agent revisions, generate holds, and apply each through
   the native revision guard. Read them back and ack their new revisions. Propose
   the source change through `incoming`, retaining its base hashes and history.
4. Run `adp.py files` to refresh seed hashes. Package and publish the exact source
   through the native Sites source helper and deployment tools. This path uses
   source-repository guards; a record revision cannot guard a source deployment.
5. Read deployed bytes back before `record`. Use the successful deployment ID as
   the publication version, native record revisions as write pins, and record the
   source commit in the change summary. Apply the generated writes with the
   manifest last, read back every result, then ack and mark the proposal applied.
6. Export again and ack the applied proposal before beginning the next edit, so
   the shared shell's base includes the publication it just verified.

These are sequential native operations, not one transaction across source and
records. If publication succeeds but recording fails, report that partial state;
reread the affected records and reconcile without republishing blindly. A lost
deployment response likewise requires inspecting the saved version/deployment.
The inbox's disabled Apply button is not a successful publication receipt.

## Evidence

`test_openai_sites_bridge.py` tests browser transport behavior and polling.
`test_openai_sites_server.py` runs the actual SQL against Node SQLite, the actual
Worker request handler and browser bridge code **executed in Node, not a browser**: permissions, namespace
isolation, revisions/conflicts, concurrent guarded writes, tombstones, query
filter/order/limit, body limits, a second browser connection, and MCP read/write.
Node 22+ with `node:sqlite` is needed for SQL tests; older Node skips that suite
explicitly. These are local integration tests with injected identity, **not**
proof of hosted Dispatch, deployed D1 persistence or plugin discovery.

Use [the live test protocol](host-live-test-protocol.md) to record those results
at an exact commit in the PR. Sites passing does not certify Spaces or Claude.
