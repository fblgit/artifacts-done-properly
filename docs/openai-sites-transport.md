# OpenAI Sites transport (experimental)

This implements the OpenAI side using **Sites' existing Worker + D1 hosting**.
It does not require a separately purchased backend or invent an OpenAI browser SDK.
It is a working transport implementation, not yet a live-host certification.

## Components

- `skill/assets/adapters/openai-sites.js`: same-origin HTTP bridge implementing
  the runtime document/query interface, with serialized snapshot polling (2s default,
  configurable >=1s), change events, unsubscribe and explicit transport errors.
- `skill/assets/hosts/openai-sites/worker.mjs`: Worker handler for the HTTP API and
  three Site MCP tools (`adp_read`, `adp_query`, `adp_write`).
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
   The authenticated `session` endpoint returns the caller's own ID for setup,
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
- `update()` shallow-merges top-level fields, preserves explicit nulls and fails
  for a missing document. No dotted-field mutation syntax or atomic batch writes.
- Equality filters support JSON scalar operands; ordered fields should have
  consistent scalar types. Queries fail explicitly if a collection exceeds 1,000
  live records or 1MiB of stored JSON; no silent truncation of the source collection. Partition large
  collections before using this experimental profile at scale.
- Polling is not real-time push. Failure callbacks are delivered, polling resumes,
  and subscriptions can be canceled. Writes with an unknown response must be read
  back before retrying; automatic mutation retries are not implemented.
- Native anchored comments, source publication, cross-host import/export, automatic
  agent wakeups, legacy Claude-only assist/inbox/catalog paths, and native Space
  Pages remain outside this implementation. Persisting ordinary feedback records
  does not mean native comment UI works.

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
