# OpenAI host adapter: explicit bridge, not an invented SDK

`skill/assets/adapters/openai.js` implements the `adp-host/1` runtime boundary
for an **integrator-supplied bridge**. It does not turn a ChatGPT subscription
into a database connection, discover tools, install a plugin, or deploy a Site.
The tests exercise a fake bridge, not a live ChatGPT/Codex integration.

## Use

Package the adapter with your page and load it before the ADP runtime:

```html
<script src="adapters/openai.js"></script>
<script>
// myAuthorizedBridge is implemented by your application, not supplied by OpenAI.
window.ADP_HOST = ADPOpenAIHost.create({
  profile: 'sites',
  bridge: myAuthorizedBridge,
  seedFiles: false
});
</script>
<script src="adp.js"></script>
```

The second supported profile is `codex-preview`: a preview with an explicitly
supplied backend. Codex itself is not the storage transport. These names identify
integration intent; they are not platform detection or certification.

`bridge.connect()` must resolve to a session with these optional fields:

- `db`: the complete document/collection/query/snapshot profile used by `adp.js`.
  The factory validates entry points, not every operation. It passes the object
  through, preserving method receivers. A bare SQL database, MCP tool object,
  `localStorage`, or widget state object is **not** a compatible implementation.
- `user`: async `id()` and `canEdit()` methods. Missing identity means anonymous,
  read-only. Edit permission requires a nonempty string identity and literal
  `true`; truthy strings and objects never grant permission.
- `comments`: optional `customAnchors()` implementation matching the runtime's
  callbacks/controller contract. Omit it if unavailable. Native text comments
  are not automatically DOM anchors.

Connection and malformed-session errors propagate. There is no fallback to a
second host. Missing records/comments remain unavailable, not fake successes.
`seedFiles` defaults to false; explicitly enable it only with same-origin seed
files packaged for the current runtime. Options are captured at creation.

## Sites implementation boundary

A server-backed Site can supply an authenticated HTTP bridge and implement the
record profile using durable storage. This PR does **not** include that server,
its schema, query engine, snapshot delivery, or deployment wiring. The server
must authorize every operation, including writes attempted by read-only pages.
The JavaScript `canEdit` result is UI gating, not a security boundary.

Keep credentials out of the page. Scope identities to their issuing host/site;
do not infer cross-site identity or permissions from matching IDs. Anonymous
public access must not imply write access. Service access and a signed-in viewer
are different principals.

A transport must explicitly implement polling or subscriptions. Do not describe
an initial fetch as a live subscription. Do not promise conditional writes,
atomic multi-record updates, agent wakeups, or model calls without implementing
and testing those capabilities. Current runtime read/modify/write configuration
updates do not establish compare-and-swap safety.

Agent-side publication is separate from browser data access. Track source
revision, deployed version, and record revision independently. A merged proposal
is not proof of deployment; a deployment failure is not proof that no data or
schema change occurred. Reconcile uncertain outcomes before retrying.

## Spaces are a separate adapter surface

Native text Pages have their own identity, block/comment anchors, guarded edits,
and change receipts. Their host adapter belongs on the agent side; it should map
ADP logical part IDs to native blocks and reconcile partial/unknown outcomes.
A Page visualization is not a general-purpose durable document database.
Consequently this factory intentionally rejects a `spaces` profile rather than
pretending that the HTML runtime's record API maps to native Page operations.

## Verification

Run `python3 -m unittest discover -s tests -p test_openai_host_adapter.py -v`.
Coverage includes explicit setup, missing/malformed sessions, anonymous and
strict edit permission, optional capabilities, error propagation, and profile
selection. A real bridge still needs integration tests for server authorization,
query/snapshot behavior, identity scoping, disconnect/reconnect, concurrency,
comment anchoring, and publication receipts before claiming production support.
