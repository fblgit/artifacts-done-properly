# Codex/Sites localhost host

```sh
# Node 22+ with node:sqlite (Node 24 recommended), no npm dependencies
node skill/scripts/adp_sites_dev.mjs --state /tmp/adp-codex-demo
```

Open the printed `http://127.0.0.1:8788` URL. The default page is the disposable
Sites transport fixture: read, save, reopen and try a stale revision. Use a stable
`--state` directory to preserve records across server restarts. Stop with Ctrl-C.

```sh
# Serve your own artifact with fallback runtime/adapter assets
node skill/scripts/adp_sites_dev.mjs --dir ./my-artifact --state /tmp/adp-codex-demo
# Test read-only behavior against the same records
node skill/scripts/adp_sites_dev.mjs --state /tmp/adp-codex-demo --read-only
# A separate process/port can observe the same SQLite state
node skill/scripts/adp_sites_dev.mjs --state /tmp/adp-codex-demo --port 8789
```

Custom artifacts use the `ADPOpenAIHost` + `ADPOpenAISites` script setup from
[the transport guide](openai-sites-transport.md); the default fixture already does.
This server does not install `window.claude` or silently substitute Claude methods.
The existing `adp.py dev serve` remains the separate Claude-oriented emulator.

## Interface fidelity

The localhost server imports **the same `worker.mjs` request handler** used for
Sites, and serves **the same browser bridge**. HTTP paths, JSON validation,
membership checks, query semantics, record revisions, conflicts and MCP methods
therefore have one implementation, not two separately maintained mocks.

| Layer | Localhost | Hosted Sites | Verification status |
| --- | --- | --- | --- |
| ADP browser bridge | Same source | Same source | Local Node tests + localhost HTTP |
| ADP HTTP/MCP API | Same Worker handler | Same Worker handler | Local HTTP and deployed private Site browser/MCP flows verified |
| Storage interface | SQLite adapter implementing only used `prepare/bind/first/all/run` operations | Native D1 binding | Live create/read/update, guarded conflicts and reload persistence observed; full D1 parity not claimed |
| Authentication | Fixed `--user` simulated by the local process | Sites Dispatch identity | Live owner/editor flow observed; separate Sites reader/anonymous rejection not verified |
| Networking/execution | Node on loopback | Cloudflare Worker | Latency, limits, failures and isolation differ |
| Publishing | None | Native Sites deployment | Not emulated |

The D1 methods consumed by the Worker match the documented
[prepared statement API](https://developers.cloudflare.com/d1/worker-api/prepared-statements/):
parameter binding, first-row reads, `results` arrays, and `meta.changes` for writes.
The local adapter is not a complete D1 emulator and does not reproduce all D1
metadata, failure modes or distributed behavior. Passing localhost tests cannot
certify production D1 or Sites Dispatch. Live runs cover shell import,
repeat no-op, stale-write rejection and return, and browser editing/reload persistence.
These establish those scenarios, not complete platform parity.

## Local security boundaries

- Binds only to `127.0.0.1`, validates Host to resist DNS rebinding, rejects
  cross-origin JSON calls through the production handler.
- Ignores incoming `oai-*` headers and fixes identity at process startup. It cannot
  simulate real sign-in; `--user` does not authenticate a person.
- Everyone/process with access to this loopback service has the configured local
  role. Do not run it on a shared/untrusted workstation or expose it through a tunnel.
- Static paths reject hidden files and symlinks escaping the artifact directory.
  The SQLite state is never served, including through aliases into that directory.
- No local identity bypass is included in the deployed Worker. **Never deploy this
  development server.**

## Agent I/O over the same API

The server exposes the same stateless `/mcp` handler as Sites. For example:

```sh
curl http://127.0.0.1:8788/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{
    "name":"adp_read", "arguments":{
      "artifact":"host-check", "path":"ns/host-check/context/current"
    }
  }
}'
```

Use `tools/list` to see the identity and three record tools. Writes require the current revision
from a read. This localhost endpoint is usable by a local agent's HTTP tooling;
it does not automatically install a Codex plugin or claim native tool discovery.
Hosted Sites uses its native private plugin publication/connection flow.

For local agent-to-agent coordination and delivery to an existing Codex chat,
use the separate [local bus guide](../skill/refs/local-bus.md). It owns the
commands, diagrams and tests. The bus does not replace this record server or
automatically watch its records.

## Automated evidence

`tests/openai_sites_localhost.mjs` starts real HTTP servers, writes through the
production Worker, restarts against the same disk SQLite database, and verifies
readback, MCP reads, reader rejection, stale rejection, Origin/Host checks, header
impersonation resistance and static path isolation. It does not run a browser or
Claude. `test_openai_sites_localhost.py` integrates this into the unittest suite.

For the two-agent handoff and live result comment format, use
[host-live-test-protocol.md](host-live-test-protocol.md). Neither local green tests
nor the existence of both adapters satisfies the required live cross-host round trip.
