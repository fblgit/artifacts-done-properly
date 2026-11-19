# The assist

The assist is the part of ADP by which a page works with Claude. A person points at a block of the page, says what they want, and either a Claude Code session that watches the artifact does it and reports back on the page, or the page asks Claude at once and changes nothing. Everything the page and the session share is a document in the artifact's db; the page is the record.

This file states what the code does. It is read by a maintainer and by a model that must implement or operate it. Every name below (collection, field, lane, status, number) is taken from the files cited next to it. Where a comment in the code and the code disagree, this file says what the code does.

Sources: `plugins/artifacts-done-properly/skills/adp/catalog/kit/patterns/assist.js` (the engine), `assist-panel.js`, `block-picker.js`, `request-card.js`, `presence.js`, `inbox.js` (all under `plugins/artifacts-done-properly/skills/adp/catalog/kit/patterns/`), `plugins/artifacts-done-properly/skills/adp/assets/adp.js` (the runtime, the "What changed" panel), `plugins/artifacts-done-properly/skills/adp/templates/assistant/` (the template that wires them), `plugins/artifacts-done-properly/skills/adp/scripts/adp.py` (`requests_cmd`) and `plugins/artifacts-done-properly/skills/adp/scripts/adp_loop.py` (`export`, `propose`, `ack`, `gate`).

## Contract numbers

The contracts are numbered across `docs/architecture.md` and this file. The code cites them by number.

| No. | Where | One line |
| --- | --- | --- |
| 1, 2 | `docs/architecture.md` | The state, the registry and the nested repository (`adp_loop.py`, section "state, the registry and the nested repository (contracts 1 and 2)"). |
| 3 | this file | The `incoming/<pid>` proposal document an agent writes. |
| 4 | `docs/architecture.md` | The classification of parts and files (`adp.py classify`, `ADP.classify` in `adp.js`). |
| 5 | this file | What the page does with a proposal: classify on open, hold, Apply, Decline, and the wake-up. |
| 6 | `docs/architecture.md` | Cited by `adp.js` together with 4 for "the classification"; not described here. |
| 7 | `docs/architecture.md` | The gate, `adp.py gate` (`adp_loop.py`, section "gate (contract 7)"). |

The request loop (sections 1 to 9 below) carries no contract number in the code.

## 1. What the assist is

Two entry points, one engine.

| Way | What happens | Needs |
| --- | --- | --- |
| Send to a session | The engine writes `requests/<rid>` and sends a comment (`comments.sendToClaude`) that wakes the Claude Code sessions watching the artifact. A session moves the request forward in the db. | `db`, `comments` |
| Ask now | The engine asks Claude through the `sample` capability, streams the answer, and stores the conversation in `conversations/`. The page cannot change; the framing text tells Claude so. | `sample` |

The engine is `Kit.assist.start({db, user, agent, sample, config, page, project, now, titles, manifest, words, frame, onPick, shortcut, pingTimeout, seed})` in `assist.js`. `agent` is the host's agent handle (`ADP.agent()`: `label`, `canSend`, `send`, `anchorFor`) and `sample` the `ADP.ask()` handle; both default to the page's host. The old `comments` option (a Claude `sendToClaude` object) is gone: a Claude-shaped object is no longer taken for an agent. The engine also answers `delivery(rid)` (`queued`, `accepted`, `unknown` or empty: what the host said when it took the request; `unknown` keeps the saved request and is never retried), `agentLabel()` (the name the UI shows, `Agent` without a handle) and `agentWhere()` (where a person starts the agent, `your agent` without one). It draws nothing. The views are `Kit.assistPanel` (composer and feed), `Kit.requestCard` (one request), `Kit.presence` (the "is a session watching" line) and `Kit.blockPicker` (the picker), each built over the engine's API.

### People side

1. Open the pane (the "Work with Claude" button in the template, id `assistBtn`) or press the shortcut (section 9).
2. Pick a block. `engine.pick()` resolves `{id, label, hash, quote, el}` or `null`. `quote` is the block text, whitespace collapsed, at most 600 characters. Without a block the request is about the whole page (`scope.kind` `page`).
3. Choose a lane (section 3), write the words (the textarea has `maxLength` 3000), send with the button or Ctrl or Cmd plus Enter.
4. Follow the request as a card: four stations, Queued, Seen, Working, Done (`request-card.js`). Once the agent has answered, the card shows a reply box (also on a host whose `can().send` is `queued`; not when it is `off` or `no_session`); a reply reopens the request.

### Session side

A Claude Code session is told to `watch the artifact <url>` (the text `presence.js` offers with a Copy button). The comment that wakes it carries the instruction `instruction()` in `assist.js` builds: read `requests/<rid>` only if the comment text was cut; do the work as the adp skill describes if it is installed; answer with one update, `status` `"done"` and `response` (Markdown, for the person who asked; a question needing their choice goes there and the session stops), with `if_version` 1 on a new request; on long work first write `state` `"working"` with `progress` `[{text}]`, and after a page change add `changed` (part ids) and `version`; a reply reopens the request and is answered as a new `requests/<rid>/turns/<n>` `{by: "claude", text}` with `response` left as it was; write no timestamps. `adp.py requests` writes them too, with times and `presence/<name>` (section 6). The code that edits and publishes the page is the loop of `docs/architecture.md`; the assist only defines the request documents.

The comment is only the wake-up. The record is `requests/<rid>`.

## 2. The db documents

IDs: a request id is `'r-' + Date.now() + '-' + 4 random characters of [a-z0-9]`; a conversation id is `'c-'` + the same; turn and message ids are four digits, zero-padded, starting at `0001` (the next one is the highest numeric id plus one).

### `requests/<rid>`

Written by the page (`engine.send`) with exactly these fields:

| Field | Value at creation | Moved by |
| --- | --- | --- |
| `lane` | `task`, `fix`, `design` or `ping` (section 3) | never |
| `scope` | `{kind, id, label, hash}`; `kind` is `part` or `page`; `id` capped at 200 characters, `label` at 120; `hash` is the block's content hash when the page knows it, else `''` | never |
| `project` | the `project` option, else `''` | never |
| `text` | the person's words, trimmed | never |
| `quote` | the block's text, whitespace collapsed, at most 600 characters | never |
| `by` | the viewer's user id, else `'page'` | never |
| `at` | ISO time of sending | never |
| `status` | `'open'` | session: `'done'`. Page reply: back to `'open'`. |
| `state` | `null` | session: `'ack'`, then `'working'`. Page reply: back to `null`. |
| `ackBy`, `ackAt` | `''`, `''` | session on `--ack` |
| `progress` | `[]` | session appends `{at, text}` on `--progress` |
| `response` | `''` | session on `--done` (Markdown), unless it answers a reply (see turns) |
| `doneAt` | `''` | session on `--done` |
| `changed` | `[]` | session on `--done`: part ids |
| `version` | `''` | session on `--done`: the published version, `''` if none |
| `estimate` | `null` (or the `estimate` the caller passes) | nothing in this repo writes it after creation |
| `actual` | `null` | nothing in this repo writes it |

Derived state (`state()` in `assist.js`, `rstate()` in `adp.py`, `stateOf()` in `request-card.js`; the same rule in all three): `status === 'done'` is `done`; else `state === 'working'` is `working`; else `state` of `ack` or `seen` is `ack` (shown as "Seen"); anything else is `queue`. A reply sets `status` `'open'` and `state` `null`, so a reopened request reads `queue` again. It keeps `response`, `doneAt`, `ackBy` and the rest from the earlier round.

Stuck: a request in state `queue` older than 180000 ms (three minutes) by `at` is flagged `stuck`; the card says "Queued for more than three minutes. Nothing failed: it waits for a session to pick it up." and the station word reads "Still queued".

### `requests/<rid>/turns/<n>`

`{by, at, text}`. The page writes one per reply (`engine.reply`): `by` is the viewer's id, `at` the time, `text` the reply. A session answers in the next turn with `{by: 'claude', text}` (section 6, `--turns`).

### `conversations/<cid>` and `conversations/<cid>/messages/<n>`

Written only by Ask now (`engine.ask`). The conversation: `{title, by, at, scope, project}`, where `title` is the first question cut to 80 characters and `scope` is the `{kind, id, label, hash}` of section 2. Each message: `{role, by, at, text}` plus `quote` on a user message that carried one. A user message has `role: 'user'`; Claude's answer has `role: 'assistant'`, `by: 'claude'`, and the id after the user message.

### `presence/<name>`

Written by the sessions, never by the page (`assist.js` header, `@db`). `adp.py requests` writes `{at, doing, session}` under the name given by `--by` (default `agent`) with every request write: `doing` is `'<rid> (<lane>)'` on `--ack` and `--progress` and `''` on `--done`. The engine reads `at`, `doing` and `session` (the doc id when `session` is missing). `kit.claude-lane` reads `presence/<presenceKey>` (default `claude-code`), else the freshest presence doc, and takes `at` in ISO or ms.

Fresh means `now - at` is less than the watching window, which is the switch `assist.presence-minutes`: an enum of `2`, `5` or `15`, default `5`. So with the default, a doc five minutes old no longer counts. The list `engine.presence()` yields `{watching, native, busy, sessions: [{session, at, doing, fresh}]}`. `watching` is true when any session is fresh, or when none is fresh but the platform itself says a watching session would be woken (`comments.canSendToClaude()` answers `available`, re-checked every 30 s); `native` is true in that second case. A session that watches and has not acted for a while is still watching, and its presence doc is written only when it acts, so the doc alone would read it as gone. `busy` is true when a fresh session has a non-empty `doing`. A viewer who cannot send gets `writers_only` from the platform, so for them only a fresh doc reads as watching.

No session is asked to write `presence/<name>`: `adp.py` writes it only as part of a `requests` write.

### Written next to them

| Document | Written by | When |
| --- | --- | --- |
| `changes/d-<ms>` | the engine (`log()`) | each send, reply and new conversation: `{version: '', at, by, summary, parts: [], threads: [], data: [{doc}]}` with summary `Request <rid> sent`, `Reply on <rid>`, `Conversation <cid> started`. Skipped when the switch `log.data-changes` is `false`, and in the in-memory path. A failed write is swallowed. |
| `incoming/<pid>`, `manifest/current`, `parts/<id>`, `content/<id>`, `changes/<seq>` | the inbox and `adp.py propose` | sections 10 and 11 |

## 3. Lanes

`LANES` in `assist.js`: `ask`, `task`, `fix`, `design`; plus `ping`, which only the engine uses. The lanes the composer offers are the switch `assist.lanes` (default those four); the panel removes `ping`, and removes `ask` when `assist.ask-now` is `false`.

| Lane | Word | Where it goes | What the panel says |
| --- | --- | --- | --- |
| `ask` | Question / "Ask now" | Ask now (`engine.ask`), no request doc, no session | "Claude answers here straight away. Nothing on the page changes." |
| `task` | Task | a session, as `requests/<rid>` | "A Claude Code session does it, publishes and says what changed." |
| `fix` | Fix | a session | "Say what is wrong here. A session fixes it and tells you what it did." |
| `design` | Design note | a session | "Say how this should look or read. A session changes the design." |
| `ping` | Ping | a session | not offered. `engine.ping()` sends a `ping` request (scope `page`, text `Are you there?`); the instruction asks the session to write `status` `"done"` with `if_version` 1. `ping()` resolves `'pong'` when `status` is `done` and `'timeout'` after 90000 ms (`pingTimeout` overrides). |

A `ping` request is hidden from `engine.requests()`. `adp.py requests` does not filter it out (section 6).

The panel's send button reads `Ask now`, `Send to a session`, `Send the fix`, `Send the note` for the four lanes. After a send it says "<lane word> sent. It waits in the queue until a session picks it up." Words can be replaced through the `words` options.

## 4. How a request is answered

### Ask now

`engine.ask(cid | null, text, {scope, quote, onText, signal, project})`:

1. Refuses with code `invalid_request` on empty text and with `not_granted` (a handle exists) or `none` (no handle) when `can().ask` is false.
2. With no `cid`, creates `conversations/<cid>`; stores the user message.
3. Calls the `sample` handle with a first user message holding the framing, then the last 20 messages of the conversation (`slice(-20)`), options `{cache: false, onText, signal}`. The default framing says the reader asks about the page (titled by `document.title`), to answer in a few short paragraphs of Markdown, that Claude cannot change the page, and that a change can be sent to a Claude Code session from the page. A block adds its label, part id and quote. `frame` replaces the default text.
4. Stores Claude's answer as the next message.

If `sample` fails with `not_granted`, `sampling_disabled`, `not_declared`, `capability_disabled` or `capability_removed`, the engine sets `askDead` and `can().ask` stays false until the page is reloaded.

`can().ask` is true when a `sample` function was obtained, it has not died, `assist.enabled` is not `false`, and `assist.ask-now` is not `false`. It does not need a watching session or `comments`.

In the panel, after an Ask now answer, a button "Send this to a session" appears when `can().send` is `available` or `queued`; it sends the last user question as a `task`.

### Send to a session (the queue)

`engine.send({lane, scope, text, quote, project})`:

1. Refuses empty text (`invalid`). Runs `gate()`: rechecks the agent handle's `canSend()` (on Claude: `comments.canSendToClaude()`); anything but `available` or `queued` rejects with that value as the error code (`none` says "This page cannot send to <label> here."; the others "Sending to <label> is not possible right now: <value>.", the label being `agent.label`, "Claude" without one).
2. Writes `requests/<rid>` (section 2).
3. Calls the agent handle's `send({anchor, text})` (on Claude: `comments.sendToClaude`). The anchor is `anchorFor(el)` of the `[data-part]` element named by `scope.id`, else of `document.body`. The returned `threadId` is kept in memory only (a page reload forgets it).
4. On failure it deletes the request doc, rechecks if the code was `claude_unavailable`, and rejects.
5. Logs `changes/d-<ms>`.

The comment text is `<Word>: <text>`, then `> <quote>` when there is one, then a blank line, the `instruction()` sentence, and a last trailer line `· adp request {<rid>} · lane <lane> · scope part:<id>` (`scope page` for a page scope). The whole text is at most 4000 bytes: the head and quote are cut with an ellipsis to fit, the instruction and trailer are never cut. The request doc keeps the full text. A `ping` instruction replaces the normal one.

Replying (`engine.reply(rid, text)`): runs `gate()`, writes the next `turns/<n>`, sets the request `status` `'open'`, `state` `null`, then sends a comment (into the remembered thread when it has one, else a new anchored comment) headed `Reply <n> on <lane> request <rid>: <text>` with the instruction and trailer after it. On failure it deletes the turn and restores the previous `status` and `state`. When an agent has claimed the request (`execution`, see `adp.py work` below), the reply also clears the claim and bumps `workGeneration`, so a lease from before the reply cannot go on working; a failed send restores both.

`can().send` (re-checked every 30 s, on a config change, and before every send):

| Value | Where it comes from |
| --- | --- |
| `available` | the agent handle's `canSend()` said so (on Claude: a session is watching), and `assist.enabled` is not `false` |
| `queued` | `canSend()` said so: the host keeps the request durably for an agent that picks it up later (Sites). Sending, replying and "Send this to a session" work as for `available`; a send may resolve delivery `unknown`, which the panel says as "saved, delivery not confirmed" |
| `writers_only` | `canSend()` said so; the panel says "Only people who can edit this artifact can send to a session." |
| `no_session` | `canSend()` said so; "No <agent> session is listening, so the request cannot be sent yet. Start one (see above), then send." |
| `off` | `canSend()` said so, returned any other value, or threw; or `assist.enabled` is `false`. "Sending to a session is turned off for this artifact." |
| `none` | no agent handle (or one without `canSend` and `send`). "This page cannot reach a session." |

The agent's name in these texts is the handle's `label` ("Claude" on Claude, "Codex" on Sites, "Agent" without a handle): the panel, request cards, inbox and template fill it in, and `words` can still override them.

### The header line

The line at the top of the page (`#presence` in the template, `Kit.presence` in compact mode) is one of three states, from `engine.presence()`. The state is a bead, a word and a sentence.

| State | Word | Sentence |
| --- | --- | --- |
| busy | "A session is working" | `<session>: <doing>`, `(+N more)` when several |
| watching | "A session is watching" | `<session>, seen <time ago>`, or "It is woken when you send a request." when the platform says so and no presence doc is fresh (`native`) |
| away | "No session is watching" | `Last seen <time ago> (<session>)`, or "None has been seen on this artifact yet." |

Busy wins over watching. When the state is away, or after a ping times out, the compact line offers "How to start one": the sentence "Open Claude Code on your computer and tell it:" and the line `watch the artifact <link>` with a Copy button (the template passes no `artifactUrl`, so the link reads `<this artifact's link>`). It adds "Requests you send now wait in the queue and are picked up when a session starts watching." only while sending is `available`, and "Ask now still answers straight away; it needs no session." when Ask now is possible. The template mounts the header line with `canPing: false`; the panel's own presence line has a Ping button.

## 5. The panel and the request card

- Composer: the lane radios, the block chip (name, id, quote, Change, Clear), the textarea, a character count `n / 3000`, the send button, and a reason line when the chosen way is unavailable. The draft and the chosen lane are kept in `sessionStorage` under `kit-ap:draft:<project>` and `kit-ap:draft:<project>:lane`. With neither Ask now nor a session possible (`ask` false and `send` neither `available` nor `no_session`) a "Copy for Claude" button copies `About "<label>" (<id>)`, the quote and the words.
- Feed: tabs "Requests" (with the number open) and "Conversation"; a filter "Show open only" / "Show all"; earlier conversations can be continued; "New conversation".
- Card (`request-card.js`): lane pill, "About <block>" (a button that shows the block when `onReveal` is given), time sent; the track (`queue`, `ack`, `working`, `done`, words Queued, Seen, Working, Done); "Seen by <ackBy>, <time ago>." while in `ack`; the conversation in order (`text`, `response`, then each turn); the quote as sent; the last six `progress` lines (open while `working`); `changed` as block buttons plus `version`. The reply box appears when the state is `done`, sending is `available`, and the lane is not `ping`.
- The template (`parts/app.js.txt`) opens the pane in a side pane on a wide screen and a sheet on a phone (`assist.css.txt`), keeps the open state in `sessionStorage` key `assist-open`, and has a Requests view that mounts one card per request.

## 6. The session side: `adp.py requests`

```
adp.py requests DUMP.json [--ack RID --by NAME | --progress RID --text T [--by NAME] |
                           --done RID --response FILE [--changed a,b] [--version V] [--turns TURNS.json] [--by NAME]]
                          [--pins P.json] [--out DIR]
```

`DUMP.json` is the `requests` collection as `ArtifactData` lists it: a list of `{id|doc_id, data, version}`, a `{documents|docs: [...]}` wrapper, or an `{id: doc}` map. A doc with no `data` wrapper is read bare and has no version.

| Form | Does |
| --- | --- |
| no action | Prints `{open, count, trailer}` and writes nothing. `open` lists every request whose `status` is not `done`, oldest first by `at`, each as `{id, lane, state, scope, project, text, quote, by, at, last_progress, reopened}`; `state` is the derived state, `last_progress` the last progress line's text, `reopened` true when the doc has a `response` or `doneAt`. Pings are listed. |
| `--ack RID` | Patch `{state: 'ack', ackBy: NAME, ackAt: now}`. |
| `--progress RID --text T` | Patch `{state: 'working', progress: <old list> + [{at: now, text: T}]}`. Needs `--text`. |
| `--done RID --response FILE` | Patch `{status: 'done', doneAt: now, changed: [...from --changed], version: <--version or ''>}`; the file's Markdown becomes `response`. Needs `--response`. |
| `--done ... --turns TURNS.json` | The request was reopened by a reply: the Markdown is written as a new `requests/<rid>/turns/<n>` doc `{by: 'claude', at, text}`, `n` being the highest numeric id in `TURNS.json` plus one, four digits; `response` is left as it was. Without `--turns`, `--done` overwrites `response`. |

Only one of `--ack`, `--progress`, `--done` per call; a missing id or a `RID` not in the dump exits with an error. `--by` defaults to `agent`.

Every write action prints a `batches` list of ArtifactData writes (each doc is also saved as a file under `--out`, default `requests/` in the `.adp/` the log uses: the project's, else `~/.adp/`) and `{request, state}`. Each batch is the request update, then `set` of `presence/<NAME>` with `{at, doing, session: NAME}`.

`adp.py requests` rows also show `resolved` and, for a request an agent has claimed, `lease` (`{actor, state, until, attempt, host}`; the token is never printed). For hosts that need a guarded claim, `adp.py work DOCS.json --host claude|sites --artifact ID --path requests/ID --action claim|progress|checkpoint|block|complete --by NAME` prints one guarded write (a lease with a token, `attempt`, `inputHash`, a lease of 30 to 7200 seconds; `complete` needs `--receipt` with passing checks and `--token`). It reclaims a lease only after it expires, and a reply from the page ends a claim. Run on a Claude artifact: claim, reclaim after expiry and completion each committed as one pinned `ArtifactData` batch and read back (the probe's request `r-work-probe-1`). It plans only; the agent runs the printed call.

Pinning: the request update carries `if_version` when the dump gave that doc a version, or when `--pins P.json` names `requests/<rid>` (a pin passed in `--pins` is used; the dump's version is only a default). If neither supplies a version, the write has no `if_version` and the output carries `needs_pin: ['requests/<rid>']`: read the doc's version and pass `--pins`. The `presence` write is a `set` and is not pinned.

The gate (contract 7, `adp.py gate`) refuses other writes while a request awaits an answer (`pending_replies` in the export state: requests not `done` whose `state` is not `ack`, `seen` or `working`), but a batch made only of `requests` and `presence` writes is not blocked by `pending_replies` (held and unacked proposals still block it) (`adp_loop.py`, `export` and `gate`).

### What a watching session does, in order

1. Read the ask in the comment; read `requests/<rid>` only if it was cut.
2. Do the work; on long work write `state` `"working"` with `progress` first; edit, publish and record as `docs/architecture.md` describes.
3. One update: `status` `"done"`, `response`, and `changed`, `version` after a page change; `if_version` 1 if new.
4. Replies come as comments naming `requests/<rid>` and as new `turns/`; the answer is the next turn.

### Local emulator: `adp.py dev`

To try a page and this loop without claude.ai, `adp.py dev serve DIR [--port 8787] [--user ID]` serves `DIR` on 127.0.0.1 (paths missing from `DIR`, such as `kit/` or `adp.js`, come from the skill's `catalog/`) and injects `/__adp/shim.js` first in `<head>`. The shim stands in for `window.claude.use`: `db` (doc and collection refs, get, set, update, delete, add, onSnapshot, where, orderBy, limit; `update` of a missing doc rejects `invalid_argument`), `user` (`id`, `canEdit`, `can('data.write')`, all granted) and `comments` (`canSendToClaude`, `sendToClaude`); every other name resolves `null`. The server pushes each change over an event stream and the page re-reads the db. State lives in `DIR/.adp-dev/`: `db/<collection>.json`, `inbox/`, `watch.beat`, `server.json`.

The session side:

1. Run `adp.py dev watch DIR` in the background and read its output. It keeps `watch.beat` fresh, so `canSendToClaude` reads `available` while it runs (15 seconds) and `no_session` otherwise. Each `sendToClaude` lands as one file in `inbox/`; a second after it appears, `watch` prints it as one JSON line `{threadId, by, anchor, text, doc}` and moves it to `inbox/done/`. `doc` is `{collection, id, data, version}` of the doc the text names (by path, else by id), and `[doc]` saved as a file is a dump `adp.py requests` reads.
2. Answer with `adp.py requests ... --out DIR > OUT.json`, then `adp.py dev send DIR OUT.json`: the server applies the printed `batches` as ArtifactData does (each batch all or nothing, a stale `if_version` refused, exit 3) and pushes them to the page. It prints each doc written as `{collection, id, data, version}`, so the request's entry, in a list, is the dump for the next step (`--progress`, `--done`).

Not emulated: access rules and roles, sampling, `artifact.publish`, the comment UI and threads, and the platform's CDN rules.

## 7. Capabilities and rules the assist needs

`plugins/artifacts-done-properly/skills/adp/templates/assistant/template.json` declares:

```
db: rules
  ""                    read view   write admin
  ns/shared             read view   write interact
  ns/users/{self}       read view   write interact
  requests              read view   write interact
  conversations         read view   write interact
  presence              read view   write interact
user: {}   comments: {customAnchors: true}   artifact: {}   sample: {}
```

The same rules are in the `adp:db-rules` meta tag of `index.html.txt`. The levels are `view`, `interact`, `admin`, `owner` (`Kit.namespaces.levels`).

| Path | Why the page needs it at `interact` (what writes there, from the code) |
| --- | --- |
| `requests` | the engine writes `requests/<rid>` on send and updates `status`/`state` and `requests/<rid>/turns` on reply; the sessions write the progress fields |
| `conversations` | Ask now writes `conversations/<cid>` and `.../messages/<n>` |
| `presence` | declared at `interact`; the page never writes it, the sessions do. Nothing in the repo states why the level is `interact` rather than the root `admin`; it stays at `interact` because sessions write `presence/<name>` through ArtifactData as the person and nothing in the repo shows that person is always admin, so tightening it could stop a viewer-run session from reporting. |

`ns/shared` and `ns/users/{self}` belong to the namespaces pattern of the starter, not to the assist. The root rule is `write admin`: `changes/d-<ms>` (the engine's log) and `incoming`, `manifest`, `parts`, `content` fall under it. `changes` has no rule of its own, so for a viewer who is not an admin the engine's `changes/d-<ms>` write is refused and dropped silently (the engine catches the error); the request or reply itself is still written.

| Capability | Used by | When it is missing |
| --- | --- | --- |
| `db` | engine, inbox | The engine keeps everything in a memory store (`Kit.assist.memory`, optionally seeded with `seed`); nothing leaves the page and nothing is logged. A request written there is never seen by a session. The inbox says "The inbox needs the database." |
| `user` | engine (`uid`), inbox (`canEdit`, `id`) | `by` is `'page'`; `me()` is `''`. The inbox reads as no editor (read-only). |
| `comments` (`customAnchors: true`) | on Claude it is what the agent handle is built from (`canSend`, `anchorFor`, `send` over `canSendToClaude`, `anchorFor`, `sendToClaude`); inbox: wake-up | `can().send` is `none`: sending is refused with code `none`; the panel says "This page cannot reach a session." Ask now still works. What the runtime does without `customAnchors` is not in this repo; the engine calls `anchorFor(el)` and, if that throws, the send fails with `upstream_error` and the request doc is deleted. |
| `sample` | engine: Ask now | `can().ask` is false; "Ask now is not available on this page." |
| `artifact` | inbox: `Apply` (`artifact.publish`) | Apply is disabled with "Apply needs the artifact capability, which this page does not declare." |

When `ADP` or the assist kits are not on the page, the template hides the button and the Requests view says "Requests need the assist kit, and it is not available on this page." A failed engine start hides the button.

## 8. Switches

The engine declares them with `ADP.config.define('assist', ...)` when the runtime exists.

| Key | Type, default | Effect |
| --- | --- | --- |
| `assist.enabled` | bool, `true` | `false`: `can().send` is `off`, Ask now unavailable, the shortcut ignored |
| `assist.lanes` | list, `ask, task, fix, design` | the lanes the composer offers |
| `assist.ask-now` | bool, `true` | `false`: Ask now not offered |
| `assist.presence-minutes` | enum `2`, `5`, `15`; default `5` | the watching window |
| `assist.shortcut` | text, `Mod+Shift+K` | the picker's key |

## 9. The picker, the shortcut and the ring

Default shortcut `Mod+Shift+K` (`assist.shortcut`; `shortcut: false` in the engine options turns it off). `Mod` is Cmd on a Mac, iPad or iPhone (`/Mac|iPhone|iPad/` on `navigator.platform`), Ctrl elsewhere. Modifiers must match exactly. The key is ignored while focus is in an `input`, `textarea`, `select` or a content-editable element, while a pick is open, and when `assist.enabled` is `false`. In the template, a pick through the shortcut opens the pane and fills the composer (`onPick` calls `setScope`).

`engine.pick()` uses `Kit.blockPicker.open` when it is loaded (the template loads it): the page dims around one `[data-part]` block at a time and a bar at the bottom names it with its place (3 of 9) and has Previous, Next, Pick this block and Cancel. Arrows move, Home and End jump, Enter picks, Esc leaves; a click picks on a fine pointer, and on a touch screen the first tap moves the ring and Pick this block confirms. Blocks inside `[data-uncommentable]` or `[data-assist-ui]` are not offered. Without `Kit.blockPicker`, the engine's built-in layer rings the block under the pointer with a tag; arrows move, Enter or a click picks, Esc leaves; it skips `[data-uncommentable]` and `[data-assist-ui]`, as the block picker does. The pick is `{id, label, hash, quote, el}`; the id carries `:<partKey>` for a repeated item in the picker.

`[data-assist-ring]` is a separate thing: the template's `reveal(id)` (`parts/app.js.txt`), called by the "About <block>" and "Changed" buttons on a card, switches to the view that owns the block, scrolls the `[data-part]` into the centre, sets `data-assist-ring` on it and removes it after 1800 ms. `assist.css.txt` styles it: `outline: 3px solid var(--accent); outline-offset: 3px`.

## 10. Contract 3: the `incoming/<pid>` proposal document

Written by `adp.py propose` (`adp_loop.py`, `propose`), the local-to-remote half of the loop. `<pid>` is `p-<ms>-<4 characters>`. The document, in the order the code builds it:

| Field | Value |
| --- | --- |
| `by` | `--by NAME` |
| `at` | ISO time |
| `summary` | `--summary S` |
| `threads` | `[]` |
| `base` | `{version, page_hash, docs}`: the live version recorded by the last export, the live manifest's `page_hash`, and the `{collection/doc: version}` map of that export |
| `parts` | one entry per changed or new part: `{id, from, to, html, retired: false, reason: ''}` (`from` is the live hash or null, `to` the new hash, `html` the part's text); per retired part: `{id, from, to: null, html: '', retired: true, reason}`; per moved copy: `{id, kind: 'content', from, to, html, retired: false, reason: ''}` (the `content/<id>` doc, `from` null when none) |
| `files` | one entry per file: `{path, ifMatch, contentType, content}`; `ifMatch` is the live sha256 from the last export (null for a new file); `content` is the text, or the base64 text with `encoding: 'base64'` for binary, or absent when the file is chunked (over 200 KiB), or `null` with `reason` for a file the proposal removes |
| `live_files` | `{path: sha256}`, the live listing the agent exported |
| `classified` | the contract-4 report: `new`, `ours`, `theirs`, `applied`, `held`, `retired` |
| `status` | `'new'` |
| `decided` | `{by: '', at: '', reason: ''}` |
| `applied` | `{version: '', at: ''}` |

Chunked files (text over 200 KiB in bytes): `incoming/<pid>/chunks/<i>` with `{path, n, of, content}`, 100 * 1024 characters per chunk. The inbox joins a file's chunks by `path`, ordered by `n`.

`propose` also writes `changes/d-<ms>` (`summary: 'Proposal <pid>: <summary>'`, `data: [{doc: 'incoming/<pid>'}]`). It refuses (exit 2, nothing written) on a merge conflict with live, on a held item, on a deleted part or file with no `--retire ID --reason R`, or with no export. It prints the ArtifactData batch to run, then `adp.py ack`. The page's `Kit.inbox` then takes over (section 11).

`adp.py export` and `adp.py ack` are in `docs/architecture.md`; this file only adds what the page writes onto the same document.

## 11. Contract 5: what the page does with a proposal

`Kit.inbox.mount(root, {db, user, artifact, agent, config, url, classify, debounce, autoApply, onAutoApplied})` (`artifact` is a publish handle or `{publish}`, `agent` the agent handle; both default to `ADP.publish()` and `ADP.agent()`), in the template's Settings view under "Incoming" (`settings.inbox`). `autoApply: true` (default false) makes the page apply every proposal that classifies as merged itself, one at a time, and `onAutoApplied(n)` is called once when none is left open: the packed catalog ships its kit folders as proposals and reloads there.

### Statuses

| Status | Set by | Meaning |
| --- | --- | --- |
| `new` | `propose` | arrived, not yet classified. The inbox classifies it on open, and only for an editor (`canEdit`). |
| `merged` | the inbox, on open | the classification found nothing held: the proposal is recorded in the db; the files are not yet published. The card reads "merged, not yet published". |
| `held` | the inbox, on open, when the classification holds anything; or after an Apply that met a publish conflict | something needs a person's choice, or the files moved under the proposal. See below. |
| `applied` | the inbox, after Apply | `applied: {version, at}` set |
| `declined` | the inbox, after Decline | `decided: {by, at, reason}` set |

The inbox lists `new`, `merged` and `held` (a missing `status` counts as `new`), newest first by `at`. `adp.js` (the "What changed" panel, `Incoming`) lists the last ten proposals of any status, with the words arrived, merged not yet published, held, applied, declined.

Classification: `manifests(p)` builds three manifests (base: the live record with the proposal's `from` hashes over the ids it names; live: `manifest/current`; incoming: the live record with the proposal's `to` hashes, retired ids removed) and calls `ADP.classify(base, live, incoming)` (contract 4). A proposal whose base version is no longer live is classified against the live record and not refused. The result is written to `classified`, `status` becomes `held` if `classified.held` is non-empty and `merged` otherwise, and a `changes/d-<ms>` data change is added.

What `held` means: for each held id (`{id, base, live, incoming}`: the three hashes) the card shows both versions, the live copy and the proposed copy, as a line diff, and an editor presses "Keep live" or "Take the proposal". The choice is written to `incoming/<pid>.picks[<id>]` as `{take: 'live' | 'incoming', by, at}`, with a data change. A held status from a publish conflict instead writes `conflict: {live, paths: [{path, expected, actual}], at}`, and Apply stays off until the agent exports and proposes again on the live files.

### Apply

An editor presses Apply (disabled while the artifact capability is missing, a call is running, the status is `new`, a held item has no pick, or `conflict` is set; the reason shows beside the button). Presses within the debounce window (default 600 ms) fold into one call. Entries whose pick was `live` are dropped from the parts and files. Then, in this order:

1. `artifact.publish({<path>: {content, contentType, ifMatch}, ...})`: the files form with an `ifMatch` per file; a removed file is `{delete: true, ifMatch}`. Skipped when there are no files (a record-only proposal).
2. Per part: `content/<id>` set (`kind: 'content'`) or deleted (retired); `parts/<id>` set with the old fields and the new `hash`, `at`, `by`. A part id starting `_rest:` is skipped.
3. `changes/<seq>` (six-digit, one more than the highest of `manifest/current.seq` and the numbered changes) with `version`, `parts [{id, from, to}]`, `files [{path, from, to}]`, `threads`.
4. `manifest/current`, last: `parts`, `files` (the proposal's `live_files`, then the publish's `shas`), `content`, `seq`, `version`, `at`, `by`.
5. `incoming/<pid>`: `status: 'applied'`, `applied: {version, at}`. A data change follows.

On a conflict from `publish` (error code `conflict`), nothing after the publish runs; the proposal goes to `held` with `conflict` as above.

### Decline

An editor presses Decline, types a reason, and the inbox writes `status: 'declined'`, `decided: {by, at, reason}` and a data change.

### The wake-up

After a publish conflict, a hold on open, and Decline, the inbox sends a comment through the agent handle (on Claude: `comments.sendToClaude`) when its `canSend()` answers `available` (no wake-up on a successful Apply, none on `merged`, none otherwise). It is only the wake-up; the proposal doc is the record. The text is the event line, then "Proposal incoming/<pid> on this artifact was decided on the page. Export this artifact, then adp.py ack DIR --proposal <pid>; reply here with the version your record shows and resolve the thread.", then the trailer `· adp proposal {<pid>} · <status>`, where `<status>` is `held` or `declined`. The thread id is stored on the proposal as `wake: {thread, at}` and later events reply into that thread. Without a listening session the data change stands and the next `adp.py export` finds the status.

`adp.py ack DIR --proposal <pid>` is refused unless the last export shows the proposal `applied` or `declined`; for `applied` it moves the project's base to the proposed work (see `docs/architecture.md`).

### The handoff

When no `presence/*` doc is fresh and `canSendToClaude()` is not `available`, the inbox says "Nobody is watching. Paste this into any session:" and shows `watch the artifact <url>` (`(this artifact's link)` when no `url` is given), followed by ` — open requests: <ids>` when requests are open (status not `done` or `closed`), with a Copy button. When a presence doc is fresh it says `<name> is watching`; when `canSendToClaude()` is `available` it says a session is listening and will be woken when a proposal is held or declined. Freshness uses `last_seen` or `at`, and the name is `name` or the doc id, within `assist.presence-minutes`, or 5 minutes when that switch cannot be read (the same default as the engine's).

### Who can do what

Classifying, picking, Apply and Decline write only for an editor (`user.canEdit`). Others see the cards read-only.

## 12. The assistant template's Home examples

The `assistant` template (and `default`, which repeats its take list) shows how a request is made by sending real ones. `mountExamples()` in `plugins/artifacts-done-properly/skills/adp/templates/assistant/parts/app.js.txt` draws the `home.examples` part: the `EXAMPLES` list (a drag and drop board, a calendar, a drafting board, a canvas, a mind map, rearranging, changing, adopting) and a table of `LANGUAGES` with a flag each. A button calls `engine.send({lane: 'task', scope: null, text})`, so the request is the ordinary `requests/<rid>` document of section 3, about the whole page, and the page then opens the Requests view. Replies to it are turns, as in section 5.

- The buttons are disabled unless `engine.can().send` is `available` or `queued`; the line under the table says why when it is not (no engine, `writers_only`, `no_session`, or off). The check repeats every 30 seconds.
- Each prompt is written to fit the comment that wakes the session (4000 bytes with its instruction and trailer); `tests/test_assistant_template.py` checks the length and that every catalog id a prompt names exists.
- The prompts that build something say to check the catalog first and take what exists. The page does not know what the catalog has; the instruction and the catalog entry `pattern.mindmap` are what make a session take it.
- Translating is a request like the others. Its text asks for the whole page to be translated with every part id and class kept, then for the `page.language` switch (a text setting, default English, declared in `starter` and `assistant`) to be set to that language. Nothing in the page reads `page.language` yet; it records what Claude did.

The Canvas tab (`CANVAS_MODES`) has two modes. Paint is `kit.canvas` on `ns/shared/{name}`. Mind map is `Kit.mindmap` with its data in one document, `ns/shared/mindmaps/main`: the component hands the whole next map to `onChange`, the page writes it with `set`, and a snapshot from another viewer is drawn with `update()`. A viewer for whom `user.can('data.write')` is false gets the mind map read-only.

## 13. The assistant template's My catalog tab

The tab lists what the page has installed, not the whole catalog, and lets you go to each component on the page and work on it. The `assistant` and `default` templates carry `"installed": true` in `template.json`. For those, `adp.py new` calls `installed_index()` and writes `installed.json` beside the page: the entries of the page's take list plus everything they require (the files it loads), in load order, each cut to `id`, `name`, `kind`, `group`, `summary`, `version` and `requires`, plus the catalog's `url`, `ver` and `built`. The words come from the file or URL given to `--catalog`, else the catalog saved with `adp.py catalog <url>` and fetched into `~/.adp`; `--url` sets the link the tab shows. With no catalog on disk each entry is just its `id`, which is still the true list. `starter` does not get it.

`mountMyCatalog()` in `parts/app.js.txt` fetches `installed.json` (a file published beside the page, so a relative fetch works) and splits it with `INSTALLED_AT`, a table in the template from entry id to the part ids where that component shows on the page (for example `pattern.settings` to `settings.switches`, `kit.canvas` and `pattern.mindmap` to `canvas.board`). An entry with a place gets, per part, **Show it** (`reveal(part)`: the page goes to its view and rings the block) and **Work on it** (opens Work with Claude and calls `panel.setScope({id, label, hash: '', quote})` with the block's visible text, so the request is about that block). The rest are listed under "Libraries and helpers": no block of their own. Nothing is previewed a second time: the page is the render. `tests/test_assistant_template.py` checks that every entry in the table is in the take list and every part in it exists.

The list is a copy from the day the page was created; nothing refreshes it.
