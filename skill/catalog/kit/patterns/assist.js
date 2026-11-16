/* part:page.script.kit.assist */
/**
 * Assist engine
 * Kit.assist.start({db, user, agent, sample, config, page, project}) is the engine docs/assist.md describes, with no view of its own. agent is the host's agent handle (ADP.agent(): label, canSend, send, anchorFor; default page.agent()). send({lane, scope, text, quote}) writes requests/<rid> and hands the request to the agent (on Claude: wakes the sessions watching the artifact with comments.sendToClaude), whose text ends in a trailer the session parses (· adp request {rid} · lane · scope); a session answers the request with done (response, changed parts, version), after working (progress lines) if long, and the page only creates it or, with reply(rid, text), appends a turn and reopens it. ask(cid, text, {onText}) asks Claude at once through sample, with the page's framing and the last twenty messages, streams the answer and stores both messages in conversations/<cid>/messages. ping() resolves pong or, after 90 s, timeout. requests(), conversations(), messages(cid), thread(rid) and presence() are live lists ({on, get}) with the state derived (queue, ack, working, done; a request queued over three minutes reads stuck) and presence fresh within assist.presence-minutes. can() says whether sending is available, writers_only, no_session, off or none, re-checked every 30 s, and whether Ask now is possible. pick() dims the page and rings the [data-part] under the pointer with its title; the arrow keys move between blocks, Enter or a click picks, Esc leaves, and the pick returns {id, label, hash, quote, el}, the quote being at most 600 characters (Kit.blockPicker dresses it when loaded). The shortcut (assist.shortcut, Mod+Shift+K: Cmd on a Mac, Ctrl elsewhere) is ignored while typing in a field. Every write appends a changes/d-<ms> data change unless log.data-changes is off. Without a db it keeps everything in memory. It draws no panel, card or presence line: those are the assist views.
 *
 * The engine behind a page that works with Claude out of the box (docs/assist.md is the contract, word for word). People pick a block, say what they want, and
 * either send it to a Claude Code session watching the artifact (a request doc plus a comment that wakes the session) or ask Claude at once through `sample` (a stored
 * conversation). The page is the record of every request; the comment is only the wake-up. No views here: the panel, the request card, the picker's dressing and the
 * presence line are other entries built over this API only.
 *
 * API:
 *   Kit.assist.start({db, user, agent, sample, config, page, project, now, titles, manifest, words, frame, onPick, shortcut, pingTimeout, seed}) -> engine
 *     every handle optional and may be a promise (claude.use(...) as it is); page = window.ADP (db, user, config); titles {part id: title} and manifest
 *     (manifest/current: parts {id: hash}) name and hash picked blocks; words {lane: word}; frame replaces the Ask now framing; onPick(pick) after the shortcut;
 *     shortcut false turns the key off; no db -> an in-memory store (seed {path: doc}), nothing leaves the page.
 *   engine.ready                  Promise, resolved once the handles are in and the lists are subscribed
 *   engine.can()                  {send: 'available'|'writers_only'|'no_session'|'off'|'none', ask: bool}; re-checked every 30 s
 *   engine.watch(fn) -> off       fn(can()) whenever it changes
 *   engine.pick()                 Promise<{id, label, hash, quote, el} | null>: Kit.blockPicker.open when that entry is loaded, else the built-in dim layer
 *   engine.send({lane, scope: {kind, id, label, hash}, text, quote, project}) -> Promise<rid>; rejects with the capability's code (no_session, claude_unavailable, ...)
 *   engine.reply(rid, text)       Promise: a turn, the request reopened, a comment
 *   engine.ask(cid | null, text, {scope, quote, onText, signal, project}) -> Promise<{cid, text}>: sample, both messages stored
 *   engine.ping()                 Promise<'pong' | 'timeout'> (90 s)
 *   engine.requests({project, open}) / engine.conversations({project}) / engine.messages(cid) / engine.presence() / engine.thread(rid): live {on(fn) -> off, get()}
 *     requests: [{id, ...doc, state (derived), stuck}] newest first, ping excluded; thread: {id, req, state, stuck, text, response, turns [{id, by, at, text}]} or null
 *     presence: {watching, native, busy, sessions [{session, at, doing, fresh}]} (watching: a fresh presence doc, or native: the agent handle's canSend answers available); messages: [{id, role, by, at, text, quote?}]
 *   engine.me()                   the viewer's uid ('' when unknown), so a view can say You
 *   engine.state(req)             'queue' | 'ack' | 'working' | 'done';  engine.lanes() the offered lanes;  engine.word(lane);  engine.destroy()
 *   Kit.assist.memory(seed) -> a db-shaped in-memory handle;  Kit.assist.parseShortcut('Mod+Shift+K');  Kit.assist.state(req)
 *
 * Keeps: the switches (ADP.config.define('assist', ...) when the runtime exists), canSend re-checked every 30 s, the comment text within 4000 bytes with its trailer last,
 * a failed send deleting its request doc, every write logged as changes/d-<ms> unless log.data-changes is off (not in the memory path), the shortcut ignored while typing.
 *
 * The picker: the page dims, the [data-part] under the pointer is ringed with its title, arrows move between blocks, Enter or a click picks, Esc leaves; announced through role=status.
 *
 * @id        pattern.assist
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.2.1
 * @updated   2026-11-16
 * @summary   The engine of a page that works with Claude: pick a block, send it as a request a watching Claude Code session does and reports on, or ask Claude at once; requests, turns, conversations and presence live in the db.
 * @tags      assist, claude, requests, sendtoclaude, sample, chat, presence, ping, block picker, shortcut, engine
 * @requires  kit.tokens, kit.dom
 * @files     kit/samples/patterns.json
 * @provides  Kit.assist.start, Kit.assist.memory, Kit.assist.parseShortcut, Kit.assist.matches, Kit.assist.state
 * @related   pattern.assist-panel, pattern.request-card, pattern.answer-queue, pattern.questions
 * @config    Kit.assist.start(opts) | db, user, agent (default page.agent()), sample (default page.ask()), config (handles or promises of them), page (window.ADP), project, now, titles {part id: title}, manifest (for hashes), words {lane: word}, frame (the Ask now framing), onPick(pick) after the shortcut, shortcut false, pingTimeout, seed (the memory store); returns the engine
 * @config    assist.enabled | switch, bool, default true: the lane exists on the page (button, shortcut, panel)
 * @config    assist.lanes | switch, list, default ask, task, fix, design: the lanes the composer offers
 * @config    assist.ask-now | switch, bool, default true: offer sample when granted
 * @config    assist.presence-minutes | switch, enum 2 | 5 | 15, default 5: how fresh a presence doc must be to read watching
 * @config    assist.shortcut | switch, text, default Mod+Shift+K: the picker's key combination
 * @config    capabilities | db with requests/, conversations/ and presence/ writable at edit, user, comments {customAnchors: true}, sample (docs/assist.md)
 * @tokens    --ink --panel --rule --accent --accent-ink --f-ui --seam? --radius? --shadow?
 * @globals   none
 * @db        reads requests; requests/<rid>/turns; conversations; conversations/<cid>/messages; presence; config/current / writes requests; requests/<rid>/turns; conversations; conversations/<cid>/messages; changes / note presence/<session> is never written by the page, nor asked of a session. The page creates a request and reopens it on a reply; only a session moves it forward. Each send and reply also appends changes/d-<ms> unless log.data-changes is off.
 * @source    Catalog batch 16, 2026-10-26 | kit/patterns/assist.js 0.1.0 | requests with a scope and a quote, turns, Ask now, presence, ping, the block picker and the shortcut
 * @source    Catalog batch 16, 2026-10-26 | a drafting-table board's request engine | the request doc and its trailer comment, the queue, ack, working and done states, stuck after three minutes, ping with its 90 s nudge
 * @preview   {"render": "pattern.assist", "samples": ["kit/samples/patterns.json#assist"]}
 * @samples   assist
 * @changed   presence() also reads watching from the platform's own answer (canSendToClaude available), so a session that watches and has not acted lately is not shown as gone.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const WORDS = { ask: 'Question', task: 'Task', fix: 'Fix', design: 'Design', ping: 'Ping' };
const LANES = ['ask', 'task', 'fix', 'design'];
const CAN = ['available', 'queued', 'writers_only', 'no_session', 'off'];      // queued: the host keeps the request durably for an agent that picks it up later
const DEAD = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
const STUCK = 180000, RECHECK = 30000;
const clone = x => x === undefined ? x : JSON.parse(JSON.stringify(x));
const fail = (code, message) => { const e = new Error(message || code); e.code = code; return e; };
const rnd = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const pad = n => String(n).padStart(4, '0');
const squash = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const bytes = s => new TextEncoder().encode(s).length;
const byAt = (a, b) => String(b.at || '').localeCompare(String(a.at || ''));
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const el = Kit.dom.el;
const settle = async x => { try { return await x; } catch (e) { return null; } };
/* the host's agent handle {label, canSend, send, anchorFor}; null when it is not one */
const agentOf = c => c && typeof c.send === 'function' && typeof c.canSend === 'function' ? c : null;
function fit(s, max) {
  if (bytes(s) <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bytes(s.slice(0, m)) + 3 <= max) lo = m; else hi = m - 1; }
  return s.slice(0, lo) + '…';
}
const state = r => { r = r || {}; return r.status === 'done' ? 'done' : r.state === 'working' ? 'working' : r.state === 'ack' || r.state === 'seen' ? 'ack' : 'queue'; };
const rows = snap => (snap && snap.docs || []).filter(d => d.exists !== false).map(d => Object.assign({ id: d.id }, d.data() || {}));
const nextId = list => pad(list.reduce((m, d) => Math.max(m, parseInt(d.id, 10) || 0), 0) + 1);

/* ---------- the in-memory store: the no-db path and the previews ---------- */
function memory(seed) {
  const docs = new Map(), subs = new Set();
  Object.keys(seed || {}).forEach(p => docs.set(p, clone(seed[p])));
  const fire = () => setTimeout(() => subs.forEach(f => f()), 0);
  const snap = p => { const d = docs.get(p); return { id: p.split('/').pop(), exists: docs.has(p), data: () => clone(d) }; };
  const kids = c => [...docs.keys()].filter(p => p.indexOf(c + '/') === 0 && p.split('/').length === c.split('/').length + 1).sort().map(snap);
  const qs = l => ({ docs: l, size: l.length, empty: !l.length, docChanges: () => l.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })) });
  const sub = f => { subs.add(f); setTimeout(() => subs.has(f) && f(), 0); return () => subs.delete(f); };
  const doc = p => ({
    id: p.split('/').pop(), path: p,
    get: () => Promise.resolve(snap(p)),
    set: d => { docs.set(p, clone(d)); fire(); return Promise.resolve(); },
    update: d => docs.has(p) ? (docs.set(p, Object.assign(docs.get(p), clone(d))), fire(), Promise.resolve()) : Promise.reject(fail('invalid_argument', 'document does not exist')),
    delete: () => { docs.delete(p); fire(); return Promise.resolve(); },
    onSnapshot: n => sub(() => n(snap(p))),
    collection: c => col(p + '/' + c)
  });
  const col = c => {
    const q = { path: c, doc: id => doc(c + '/' + (id || rnd(10))), get: () => Promise.resolve(qs(kids(c))), onSnapshot: n => sub(() => n(qs(kids(c)))) };
    q.add = d => { const r = q.doc(); return r.set(d).then(() => r); };
    q.where = q.orderBy = q.limit = () => q;      // the engine filters itself; these keep other callers working
    return q;
  };
  return Object.freeze({ doc, collection: col, memory: true });
}

/* ---------- shortcut strings: "Mod+Shift+K", Mod = Cmd on a Mac, Ctrl elsewhere ---------- */
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
function parseShortcut(s) {
  const t = String(s || '').split('+').map(x => x.trim()).filter(Boolean);
  if (!t.length) return null;
  const k = { key: t.pop().toLowerCase(), mod: false, shift: false, alt: false, ctrl: false, meta: false };
  t.forEach(x => {
    x = x.toLowerCase();
    if (x === 'mod') k.mod = true; else if (x === 'shift') k.shift = true; else if (x === 'alt' || x === 'option') k.alt = true;
    else if (x === 'ctrl' || x === 'control') k.ctrl = true; else if (x === 'cmd' || x === 'meta' || x === 'command') k.meta = true;
  });
  return k;
}
function matches(e, k) {
  if (!k) return false;
  const ctrl = k.ctrl || (k.mod && !MAC), meta = k.meta || (k.mod && MAC), key = String(e.key || '').toLowerCase(), code = String(e.code || '').toLowerCase();
  return e.ctrlKey === ctrl && e.metaKey === meta && e.shiftKey === k.shift && e.altKey === k.alt && (key === k.key || code === 'key' + k.key || code === 'digit' + k.key);
}
const typing = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));

/* ---------- the built-in picker's rules (tokens only) ---------- */
function css() {
  if (document.getElementById('kit-assist-css')) return;
  const s = el('style'); s.id = 'kit-assist-css';
  s.textContent = '.kit-assist-dim{position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:var(--ink);opacity:.28}'
    + '.kit-assist-ring{position:fixed;z-index:2147483001;pointer-events:none;box-sizing:border-box;outline:3px solid var(--seam,var(--accent));outline-offset:2px;border-radius:var(--radius,6px)}'
    + '.kit-assist-tag{position:absolute;left:0;bottom:100%;margin-bottom:6px;max-width:min(32rem,calc(100vw - 32px));padding:3px 8px;border-radius:6px;background:var(--accent);color:var(--accent-ink);font:600 12px/1.4 var(--f-ui);overflow-wrap:anywhere}'
    + '.kit-assist-ring.kit-assist-in .kit-assist-tag{bottom:auto;top:4px;left:4px}'
    + '.kit-assist-hint{position:fixed;z-index:2147483002;left:16px;right:16px;top:12px;margin:0 auto;width:fit-content;max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px 14px;border-radius:999px;border:1px solid var(--rule);background:var(--panel);color:var(--ink);font:14px/1.4 var(--f-ui);pointer-events:none;box-shadow:var(--shadow,none)}'
    + '.kit-assist-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
  document.head.append(s);
}

function start(o) {
  o = o || {};
  const page = o.page || null;
  const H = { db: null, user: null, agent: null, sample: null, config: o.config || (page && page.config) || null, memory: false };
  const offs = [], timers = [], lives = new Set(), cache = {}, tids = {}, deliveries = {}, watchers = new Set();
  let dead = false, canSend = 'none', askDead = false, uid = '', reqs = [], pres = [], convs = [], picking = null, closePick = null;
  const clock = () => { const n = typeof o.now === 'function' ? o.now() : o.now; const t = n == null ? Date.now() : new Date(n).getTime(); return isNaN(t) ? Date.now() : t; };
  const iso = () => new Date(clock()).toISOString();
  const by = () => uid || 'page';
  const cfg = (k, d) => { let v; try { v = H.config && H.config.get ? H.config.get(k) : undefined; } catch (e) {} return v === undefined ? d : v; };
  const enabled = () => cfg('assist.enabled', true) !== false;
  if (H.config && typeof H.config.define === 'function') {
    try {
      H.config.define('assist', {
        enabled: { type: 'bool', default: true, label: 'Assist', help: 'The lane to the agent exists on the page: button, shortcut, panel.' },
        lanes: { type: 'list', default: LANES.slice(), label: 'Lanes', help: 'Which lanes the composer offers.' },
        'ask-now': { type: 'bool', default: true, label: 'Ask now', help: 'Offer an immediate answer from the model when the page may ask it.' },
        'presence-minutes': { type: 'enum', options: ['2', '5', '15'], default: '5', label: 'Watching window (minutes)', help: 'How fresh a session’s presence doc must be to read watching.' },
        shortcut: { type: 'text', default: 'Mod+Shift+K', label: 'Picker shortcut', help: 'The key combination that opens the block picker.' }
      });
    } catch (e) { console.warn('assist: switches not declared: ' + (e && e.message)); }
  }
  const stuck = r => state(r) === 'queue' && clock() - new Date(r.at).getTime() > STUCK;
  const deco = r => Object.assign({}, r, { state: state(r), stuck: stuck(r) });
  function live(compute) {
    const fns = new Set(); let val = compute();
    const l = {
      on(fn) { fns.add(fn); Promise.resolve().then(() => fns.has(fn) && fn(val)); return () => fns.delete(fn); },
      get: () => val,
      emit() { val = compute(); fns.forEach(f => { try { f(val); } catch (e) { console.error(e); } }); }
    };
    lives.add(l); return l;
  }
  const emitAll = () => lives.forEach(l => l.emit());
  const notify = () => { const c = can(); watchers.forEach(f => { try { f(c); } catch (e) { console.error(e); } }); };
  function sub(ref, fn) {
    try { offs.push(ref.onSnapshot(fn, e => console.warn('assist: snapshot ' + (e && e.code)))); } catch (e) { console.warn('assist: subscribe ' + (e && e.message)); }
  }
  async function recheck() {
    const c = H.agent; let v = 'none';
    if (c) { try { v = await c.canSend(); } catch (e) { v = 'off'; } if (CAN.indexOf(v) < 0) v = 'off'; }
    if (!enabled()) v = 'off';
    if (v !== canSend) { canSend = v; notify(); if (cache.p) cache.p.emit(); }      // presence() reads canSend too
    return v;
  }
  const can = () => ({ send: canSend, ask: !!H.sample && !askDead && enabled() && cfg('assist.ask-now', true) !== false });

  const ready = (async () => {
    if (page && page.config && page.config.ready) await settle(page.config.ready);
    // agent: the option, else the page's host (ADP.agent()); sample likewise falls back to ADP.ask()
    const got = await Promise.all([o.db, o.user, o.agent !== undefined ? o.agent : page && page.agent ? page.agent() : null, o.sample !== undefined ? o.sample : page && page.ask ? page.ask() : null].map(settle));
    const db = got[0] || (page && page.db) || null;
    H.db = db || memory(o.seed); H.memory = !db;
    H.user = got[1]; H.agent = agentOf(got[2]); H.sample = typeof got[3] === 'function' ? got[3] : null;
    const u = H.user;
    uid = String((u && typeof u.id === 'function' ? await settle(u.id()) : u && u.id) || (page && page.user && page.user.id) || '');
    if (dead) return;
    sub(H.db.collection('requests'), s => { reqs = rows(s); emitAll(); });
    sub(H.db.collection('presence'), s => { pres = rows(s); emitAll(); });
    sub(H.db.collection('conversations'), s => { convs = rows(s); emitAll(); });
    if (H.config && typeof H.config.on === 'function') offs.push(H.config.on('*', () => { recheck(); notify(); emitAll(); }));
    await recheck(); notify();
    timers.push(setInterval(() => { recheck(); emitAll(); }, RECHECK));
  })();

  /* ---------- live lists ---------- */
  const proj = q => q && q.project !== undefined ? q.project : o.project;
  const inProj = (x, p) => p == null || (x.project || '') === p;
  function requests(q) {
    q = q || {}; const k = 'r' + JSON.stringify([proj(q), !!q.open]);
    return cache[k] || (cache[k] = live(() => reqs.filter(r => r.lane !== 'ping' && inProj(r, proj(q)) && (!q.open || r.status !== 'done')).map(deco).sort(byAt)));
  }
  function conversations(q) {
    const k = 'c' + JSON.stringify([proj(q)]);
    return cache[k] || (cache[k] = live(() => convs.filter(c => inProj(c, proj(q))).sort(byAt)));
  }
  function presence() {
    return cache.p || (cache.p = live(() => {
      const win = (Number(cfg('assist.presence-minutes', '5')) || 5) * 60000;
      const s = pres.map(p => ({ session: p.session || p.id, at: p.at || '', doing: p.doing || '', fresh: clock() - new Date(p.at).getTime() < win })).sort(byAt);
      // native: the platform itself says a watching session would be woken (the agent handle's canSend), though no fresh presence doc names it.
      // A session that watches and has not acted for a while is still watching: its presence doc is written only when it acts.
      const f = s.filter(x => x.fresh), native = !f.length && canSend === 'available';
      return { watching: f.length > 0 || native, native, busy: f.some(x => !!x.doing), sessions: s };
    }));
  }
  function thread(rid) {
    const k = 't' + rid; if (cache[k]) return cache[k];
    let req = null, turns = [], loaded = false;
    const l = cache[k] = live(() => !loaded || !req ? null : { id: rid, req: deco(req), state: state(req), stuck: stuck(req), text: req.text || '', response: req.response || '', turns });
    ready.then(() => {
      if (dead) return; const ref = H.db.doc('requests/' + rid);
      sub(ref, s => { loaded = true; req = s.exists ? Object.assign({ id: rid }, s.data()) : null; l.emit(); });
      sub(ref.collection('turns'), s => { turns = rows(s).sort(byId); l.emit(); });
    });
    return l;
  }
  function messages(cid) {
    const k = 'm' + cid; if (cache[k]) return cache[k];
    let list = [];
    const l = cache[k] = live(() => list);
    ready.then(() => { if (!dead) sub(H.db.doc('conversations/' + cid).collection('messages'), s => { list = rows(s).sort(byId); l.emit(); }); });
    return l;
  }

  /* ---------- writes ---------- */
  function log(summary, docs) {
    if (H.memory || cfg('log.data-changes', true) === false) return Promise.resolve();
    return H.db.doc('changes/d-' + Date.now()).set({ version: '', at: iso(), by: by(), summary, parts: [], threads: [], data: docs.map(d => ({ doc: d })) }).catch(() => {});
  }
  const who = () => H.agent && H.agent.label || 'Agent';
  const word = l => (o.words && o.words[l]) || WORDS[l] || l;
  const lanes = () => { const v = cfg('assist.lanes', LANES); return Array.isArray(v) && v.length ? v.slice() : LANES.slice(); };
  const scopeOf = s => { s = s || {}; const id = squash(s.id, 200); return { kind: s.kind || (id ? 'part' : 'page'), id, label: squash(s.label, 120), hash: String(s.hash || '') }; };
  const isPart = s => s && s.kind === 'part' && s.id;
  function instruction(rid, lane, s, project) {
    if (lane === 'ping') return 'Request requests/' + rid + ' on this artifact is a ping: update it with status "done" and if_version 1. Nothing else is asked.';
    return 'A person on this artifact asked for request requests/' + rid + ' (scope ' + (isPart(s) ? 'part ' + s.id : 'page') + ', project ' + JSON.stringify(project || '') + '). If the text above ends in …, it was cut: read requests/' + rid + '. Do the work as the adp skill describes, if it is installed. Answer with one ArtifactData update of requests/' + rid + ', which the page shows at once: status "done" and response, if_version 1 (the document is new; a refusal names the right one). Write the response in Markdown for the person who asked: what you did, or what you could not do and why; if you need their choice, ask it there and stop. On long work, first write state "working" with progress [{text}]; after a page change, add changed [part ids] and version. A comment that starts "Reply n" reopened the request: read it for its version, write your answer as requests/' + rid + '/turns/<n+1, four digits> {by "claude", text}, set status "done" and leave response as it was. Write no timestamps.';
  }
  const trailer = (rid, lane, s) => '· adp request {' + rid + '} · lane ' + lane + ' · scope ' + (isPart(s) ? 'part:' + s.id : 'page');
  function commentText(head, quote, rid, lane, s, project) {
    const tail = '\n\n' + instruction(rid, lane, s, project) + '\n' + trailer(rid, lane, s);
    return fit(head + (quote ? '\n\n> ' + quote : ''), 4000 - bytes(tail)) + tail;
  }
  function anchorOf(s, elx) {
    const e = elx || (isPart(s) && document.querySelector('[data-part="' + s.id.replace(/"/g, '') + '"]')) || document.body;
    return H.agent.anchorFor(e);
  }
  const asErr = e => e && e.code ? e : fail('upstream_error', String(e && e.message || e));
  async function gate() {
    await ready;
    const v = await recheck();
    const who = H.agent && H.agent.label || 'Agent';
    if (v !== 'available' && v !== 'queued') throw fail(v, v === 'none' ? 'This page cannot send to ' + who + ' here.' : 'Sending to ' + who + ' is not possible right now: ' + v + '.');
  }
  async function send(a) {
    a = a || {};
    const text = String(a.text || '').trim(), lane = String(a.lane || 'task');
    if (!text) throw fail('invalid', 'Say what you want first.');
    await gate();
    const s = scopeOf(a.scope), project = a.project !== undefined ? a.project : (o.project || ''), quote = squash(a.quote, 600);
    const rid = 'r-' + Date.now() + '-' + rnd(4), ref = H.db.doc('requests/' + rid);
    await ref.set({ lane, scope: s, project, text, quote, by: by(), at: iso(), status: 'open', state: null, ackBy: '', ackAt: '', progress: [],
      response: '', doneAt: '', changed: [], version: '', estimate: a.estimate == null ? null : a.estimate, actual: null });
    try {
      const r = await H.agent.send({ anchor: await anchorOf(s, a.scope && a.scope.el), text: commentText(word(lane) + ': ' + text, quote, rid, lane, s, project), requestId: rid });      // requestId: the request is already stored; a host that keeps its own record must not create another
      if (r && r.threadId) tids[rid] = r.threadId;
      if (r && r.delivery) deliveries[rid] = r.delivery;      // 'unknown': the host kept the request but could not confirm the handoff; the record stays, nothing is retried
    } catch (e) {
      ref.delete().catch(() => {});
      if (e && e.code === 'claude_unavailable') recheck();
      throw asErr(e);
    }
    log('Request ' + rid + (deliveries[rid] === 'unknown' ? ' saved; delivery to ' + who() + ' unconfirmed' : ' sent'), ['requests/' + rid]);
    if (deliveries[rid] === 'unknown') notify();
    return rid;
  }
  async function reply(rid, text) {
    text = String(text || '').trim();
    if (!text) throw fail('invalid', 'Write the reply first.');
    await gate();
    const ref = H.db.doc('requests/' + rid), snap = await ref.get();
    if (!snap.exists) throw fail('not_found', 'No request ' + rid);
    const req = snap.data() || {}, tid = nextId(rows(await ref.collection('turns').get())), tref = ref.collection('turns').doc(tid);
    await tref.set({ by: by(), at: iso(), text });
    await ref.update({ status: 'open', state: null, ...(req.execution ? { execution: null, workGeneration: (req.workGeneration || 0) + 1 } : {}) });      // a reply ends an agent's claim (Sites' reply does the same)
    try {
      const head = 'Reply ' + parseInt(tid, 10) + ' on ' + word(req.lane).toLowerCase() + ' request ' + rid + ': ' + text + '\n\nRead the whole conversation on requests/' + rid + ' (text, response, then turns).';
      const body = commentText(head, '', rid, req.lane, req.scope, req.project);
      await H.agent.send(Object.assign(tids[rid] ? { threadId: tids[rid], text: body } : { anchor: await anchorOf(req.scope), text: body }, { requestId: rid, turnId: tid }));      // the reply turn is already stored
    } catch (e) {
      tref.delete().catch(() => {});
      ref.update({ status: req.status || 'open', state: req.state == null ? null : req.state, ...(req.execution ? { execution: req.execution, workGeneration: req.workGeneration == null ? null : req.workGeneration } : {}) }).catch(() => {});
      throw asErr(e);
    }
    log('Reply on ' + rid, ['requests/' + rid, 'requests/' + rid + '/turns/' + tid]);
  }
  function framing(s, quote) {
    const t = o.frame || 'A person reading the page "' + (document.title || 'untitled') + '" asks you something. Answer in a few short paragraphs of Markdown. You cannot change the page; if they want a change, say they can send it to a Claude Code session from the page.';
    return t + (isPart(s) ? '\n\nThe question is about the block "' + (s.label || s.id) + '" (part ' + s.id + ').' : '') + (quote ? '\n\nThe block reads:\n> ' + quote : '');
  }
  async function ask(cid, text, x) {
    x = x || {}; text = String(text || '').trim();
    if (!text) throw fail('invalid_request', 'Write the question first.');
    await ready;
    if (!can().ask) throw fail(H.sample ? 'not_granted' : 'none', 'Asking a model from this page is not possible here.');
    const cref = id => H.db.doc('conversations/' + id);
    let conv;
    if (!cid) {
      cid = 'c-' + Date.now() + '-' + rnd(4);
      conv = { title: squash(text, 80), by: by(), at: iso(), scope: scopeOf(x.scope), project: x.project !== undefined ? x.project : (o.project || '') };
      await cref(cid).set(conv);
      log('Conversation ' + cid + ' started', ['conversations/' + cid]);
    } else { const s = await cref(cid).get(); conv = s.exists ? s.data() || {} : {}; }
    const mcol = cref(cid).collection('messages'), prior = rows(await mcol.get()).sort(byId), mid = nextId(prior);
    const quote = squash(x.quote, 600) || (prior.filter(m => m.quote).pop() || {}).quote || '';
    const um = { role: 'user', by: by(), at: iso(), text }; if (x.quote) um.quote = squash(x.quote, 600);
    await mcol.doc(mid).set(um);
    const turns = prior.concat([um]).slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text || '').trim() || '…' }));
    const opt = { cache: false }; if (typeof x.onText === 'function') opt.onText = x.onText; if (x.signal) opt.signal = x.signal;
    let res;
    try { res = await H.sample([{ role: 'user', content: framing(x.scope ? scopeOf(x.scope) : conv.scope, quote) }].concat(turns), opt); }
    catch (e) { if (e && DEAD.indexOf(e.code) >= 0) { askDead = true; notify(); } throw e; }
    await mcol.doc(pad(parseInt(mid, 10) + 1)).set({ role: 'assistant', by: 'claude', at: iso(), text: res.text });
    return { cid, text: res.text };
  }
  async function ping() {
    const rid = await send({ lane: 'ping', scope: { kind: 'page' }, text: 'Are you there?' });
    return new Promise(res => {
      let off = null;
      const tm = setTimeout(() => { if (off) off(); res('timeout'); }, o.pingTimeout || 90000);
      timers.push(tm);
      off = thread(rid).on(v => { if (v && v.req.status === 'done') { clearTimeout(tm); off(); res('pong'); } });
    });
  }

  /* ---------- the block picker ---------- */
  const titles = () => o.titles || (page && page.titles) || {};
  function hashOf(e) {
    const m = o.manifest || (page && page.manifest), id = e && e.dataset ? e.dataset.part : '';
    const h = m && m.parts ? m.parts[id] : null;
    return String((h && typeof h === 'object' ? h.hash : h) || (e && e.dataset && e.dataset.hash) || '');
  }
  const label = e => squash(titles()[e.dataset.part] || e.getAttribute('aria-label') || e.dataset.title || e.dataset.part, 120);
  const result = e => e ? { id: e.dataset.part, label: label(e), hash: hashOf(e), quote: squash(e.innerText || e.textContent, 600), el: e } : null;
  function pick() {
    if (picking) return picking;
    if (Kit.blockPicker && typeof Kit.blockPicker.open === 'function') {
      picking = Promise.resolve(Kit.blockPicker.open({ titles: titles(), hashOf, quoteMax: 600, root: document }));
      picking.then(() => { picking = null; }, () => { picking = null; });
      return picking;
    }
    css();
    picking = new Promise(res => {
      const dim = el('div', 'kit-assist-dim'), ring = el('div', 'kit-assist-ring'), tag = el('span', 'kit-assist-tag');
      const hint = el('p', 'kit-assist-hint', o.pickHint || 'Pick a block: point and click, or use the arrow keys and Enter. Esc leaves.'), sr = el('p', 'kit-assist-sr');
      sr.setAttribute('role', 'status'); ring.append(tag); ring.hidden = true; dim.setAttribute('aria-hidden', 'true');
      document.body.append(dim, ring, hint, sr);
      const back = document.activeElement;
      const parts = () => [...document.querySelectorAll('[data-part]')].filter(e => !e.closest('[data-uncommentable], [data-assist-ui]') && (e.offsetWidth || e.offsetHeight));
      const under = n => { const p = n && n.closest ? n.closest('[data-part]') : null; return p && !p.closest('[data-uncommentable], [data-assist-ui]') ? p : null; };
      let cur = null;
      const show = e => {
        cur = e; if (!e) { ring.hidden = true; return; }
        const r = e.getBoundingClientRect();
        Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        ring.classList.toggle('kit-assist-in', r.top < 34); ring.hidden = false;
        if (tag.textContent !== label(e)) { tag.textContent = label(e); sr.textContent = label(e); }
      };
      const swallow = e => { if (under(e.target)) { e.preventDefault(); e.stopPropagation(); } };
      const onMove = e => show(under(e.target));
      const onClick = e => { const p = under(e.target); e.preventDefault(); e.stopPropagation(); done(p); };
      const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (cur) done(cur); }
        else if (/^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
          e.preventDefault(); e.stopPropagation();
          const l = parts(); if (!l.length) return;
          const i = l.indexOf(cur), fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
          const n = l[i < 0 ? 0 : fwd ? Math.min(l.length - 1, i + 1) : Math.max(0, i - 1)];
          n.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' }); show(n);
        }
      };
      const onFlow = () => { if (cur) show(cur); };
      const L = [['pointermove', onMove], ['pointerdown', swallow], ['mousedown', swallow], ['click', onClick], ['keydown', onKey], ['scroll', onFlow]];
      L.forEach(x => document.addEventListener(x[0], x[1], true)); addEventListener('resize', onFlow);
      function done(p) {
        L.forEach(x => document.removeEventListener(x[0], x[1], true)); removeEventListener('resize', onFlow);
        [dim, ring, hint, sr].forEach(n => n.remove()); picking = null; closePick = null;
        if (back && back.focus && back !== document.body) { try { back.focus({ preventScroll: true }); } catch (e) {} }
        res(result(p));
      }
      closePick = () => done(null);
      show(under(document.activeElement));
    });
    return picking;
  }
  const onShortcut = e => {
    if (o.shortcut === false || dead || picking || !enabled() || typing(e.target)) return;
    if (!matches(e, parseShortcut(cfg('assist.shortcut', o.shortcut || 'Mod+Shift+K')))) return;
    e.preventDefault();
    pick().then(p => { if (p && typeof o.onPick === 'function') o.onPick(p); });
  };
  document.addEventListener('keydown', onShortcut);

  function destroy() {
    dead = true; offs.forEach(f => { try { f(); } catch (e) {} }); timers.forEach(t => { clearInterval(t); clearTimeout(t); });
    document.removeEventListener('keydown', onShortcut); if (closePick) closePick(); watchers.clear(); lives.clear();
  }
  return {
    ready, can, delivery: rid => deliveries[rid] || '', agentLabel: who, agentWhere: () => H.agent && H.agent.where || 'your agent', me: () => uid, watch: fn => { watchers.add(fn); return () => watchers.delete(fn); }, pick, send, reply, ask, ping,
    requests, conversations, messages, presence, thread, state, lanes, word, destroy
  };
}

Kit.assist = { start, memory, parseShortcut, matches, state };
})();
/* /part:page.script.kit.assist */
