/* part:page.script.kit.store */
/**
 * Store and db layer
 * The base every other kit file stands on. Kit.store.create gives S, set, emit, useS and ls (localStorage under a prefix). Kit.db.create gives per-document write queues (one chain per path, so writes to one doc never race), localSet and localPatch for optimistic paint, writeOne with backoff on rate limits, typed toasts for refusals and full storage, and connect(), which resolves db and user first and the optional capabilities after. Kit.util holds the small helpers (clip, merge, sortEntries, ago, isTyping).
 *
 * What it is: small helpers, an rAF-batched global state object with a subscribe hook, and a queued write layer over the claude.ai db capability
 * (put/upd/del per document, local optimistic patches, a retrying writer, the connect sequence for db/user and optional capabilities).
 * config  Kit.store.create({lsPrefix, state})                      lsPrefix names the localStorage keys, state is the board's initial state object
 *         Kit.db.create({store, toast, pathTemplate, scopeSlot, words, caps})
 *           pathTemplate  "s/{scope}/{name}" : where a collection lives; {name} is the collection, {scope} the current scope id (omit {scope} for flat collections)
 *           scopeSlot     the state slot that holds the current scope id (default "scopeId")
 *           words         {refused, full, busy, failed, lost} toast texts (neutral defaults)
 *           caps          capability names the page may use besides db and user, e.g. ["sample","comments"]
 * state   S.canWrite, S.conn, S.me, S.connMsg are written by Kit.db.connect; for each collection the board keeps a slot S[name] with the same name (localSet/localPatch use it)
 *
 * @id        kit.store
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Board state in one object with a subscribe hook, and a queued write layer over the db capability: put, update, delete, optimistic local patches, retries, the connect sequence.
 * @tags      state, store, db, data layer, writes, optimistic, connect, capabilities, localstorage, util
 * @requires  none
 * @files     kit/samples/kit.json
 * @provides  Kit.util, Kit.store.create, Kit.db.create
 * @config    Kit.store.create({lsPrefix, state}) | lsPrefix names the localStorage keys; state is the board’s initial state object
 * @config    Kit.db.create({store, toast, pathTemplate, scopeSlot, words, caps}) | pathTemplate "s/{scope}/{name}" says where a collection lives; caps are the capabilities besides db and user
 * @config    state slots | S.canWrite, S.conn, S.me, S.connMsg (written by connect); one slot S[name] per collection the board keeps
 * @tokens    none
 * @globals   htm-preact
 * @db        note Reads and writes whatever collections the board names, at pathTemplate; it has none of its own.
 * @source    Journey Whiteboard | app.js | store, data layer, utils
 * @source    ADR Drafting Table | core.js, data.js | the same shapes with another path
 * @preview   {"render": "kit.store", "samples": ["kit/samples/kit.json#store"]}
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };

// ---------------------------------------------------------------- util
const now = () => Date.now();
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...(isObj(a) ? a : {}) }; for (const k in b) o[k] = isObj(b[k]) && isObj(o[k]) ? merge(o[k], b[k]) : b[k]; return o; };
const nul = o => { const r = {}; for (const k in o) r[k] = o[k] === undefined ? null : o[k]; return r; };
const ord = o => (o.order ?? o.created ?? 0);
const sortEntries = obj => Object.entries(obj).sort((a, b) => ord(a[1]) - ord(b[1]));
const isTyping = t => t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
function hashText(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
const ago = t => { const m = Math.max(0, Math.round((now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
Kit.util = Object.freeze({ now, clip, isObj, merge, nul, ord, sortEntries, isTyping, hashText, ago });

// ---------------------------------------------------------------- store
Kit.store = Object.freeze({
  create({ lsPrefix = 'kit', state = {} } = {}) {
    const { useReducer, useRef, useEffect } = window.htmPreact;
    const ls = {
      get(k, d) { try { const v = localStorage.getItem(lsPrefix + ':' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
      set(k, v) { try { localStorage.setItem(lsPrefix + ':' + k, JSON.stringify(v)); } catch (_) {} },
    };
    const S = typeof state === 'function' ? state(ls) : state;
    const listeners = new Set();
    let frame = 0, version = 0;
    function emit() { version++; if (frame) return; frame = requestAnimationFrame(() => { frame = 0; listeners.forEach(f => f()); }); }
    function set(p) { Object.assign(S, p); emit(); }
    // subscribe after mount, then catch up on anything emitted between the render and the subscription
    function useS() {
      const [, force] = useReducer(x => x + 1, 0);
      const seen = useRef(version); seen.current = version;
      useEffect(() => { listeners.add(force); if (seen.current !== version) force(); return () => listeners.delete(force); }, []);
      return S;
    }
    return { S, set, emit, useS, ls, listeners };
  },
});

// ---------------------------------------------------------------- db write layer
const WORDS = {
  refused: 'That change was refused. You may only have read access here.',
  full: 'Storage is full. Delete some data to add more.',
  busy: 'Too many changes at once. Slow down a moment.',
  failed: 'A change did not save. Try again in a moment.',
  lost: 'Lost the live connection. Reload to reconnect.',
};
Kit.db = Object.freeze({
  create({ store, toast, pathTemplate = '{name}', scopeSlot = 'scopeId', words = {}, caps = [] }) {
    const { S, emit } = store;
    const W = { ...WORDS, ...words };
    const C = { db: null, user: null }; for (const c of caps) C[c] = null;
    const path = (name, sp) => pathTemplate.replace('{scope}', sp || S[scopeSlot]).replace('{name}', name);
    const col = (name, sp) => C.db.collection(path(name, sp));
    const chains = new Map();
    function dbErr(e) {
      const code = e && e.code;
      if (code === 'invalid_argument') { if (!S.canWrite) return; toast(W.refused, 'warn'); }
      else if (code === 'quota_exceeded') toast(W.full, 'warn');
      else if (code === 'resource_exhausted') toast(W.busy, 'warn');
      else toast(W.failed, 'warn');
    }
    function subErr(e) { store.set({ conn: 'lost' }); if (e && e.code !== 'revoked') toast(W.lost, 'warn'); }
    function queue(key, fn) { const next = (chains.get(key) || Promise.resolve()).then(fn).catch(dbErr); chains.set(key, next); return next; }
    function put(name, id, data, sp) { const ref = col(name, sp).doc(id); return queue(ref.path, () => ref.set(data)); }
    function upd(name, id, data, sp) { const ref = col(name, sp).doc(id); return queue(ref.path, () => ref.update(data)); }
    function del(name, id, sp) { const ref = col(name, sp).doc(id); return queue(ref.path, () => ref.delete()); }
    function newId(name, sp) { return col(name, sp).doc().id; }
    function localSet(name, id, data) { if (S[name]) { S[name][id] = data; emit(); } }
    function localPatch(name, id, data) { if (S[name] && S[name][id]) { S[name][id] = Kit.util.merge(S[name][id], data); emit(); } }
    async function writeOne(fn) {
      for (let i = 0; i < 4; i++) {
        try { return await fn(); }
        catch (e) { if (e && (e.code === 'resource_exhausted' || e.code === 'unavailable')) await new Promise(r => setTimeout(r, 600 * (i + 1) + Math.random() * 300)); else throw e; }
      }
      return fn();
    }
    // The connect sequence: db and user first, then the optional capabilities in the background.
    // optional: {name: fn(namespace)} runs when that capability resolves (the namespace is already stored in C[name]).
    async function connect({ none = 'Open this page on claude.ai to use the shared data.', noDb = 'The shared data is not available in this view. Sign in on claude.ai to use it.', optional = {} } = {}) {
      if (!window.claude || typeof window.claude.use !== 'function') { store.set({ conn: 'none', connMsg: none }); return false; }
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db) { store.set({ conn: 'none', connMsg: noDb }); return false; }
      C.db = db; C.user = user;
      let me = null, canWrite = true;
      if (user) { try { me = await user.id(); } catch (_) {} try { const c = await user.can('data.write'); canWrite = c !== false; } catch (_) {} }
      store.set({ me, canWrite, conn: 'live' });
      for (const name of caps) window.claude.use(name).then(x => { C[name] = x; if (optional[name]) optional[name](x); else emit(); });
      return true;
    }
    return { C, path, col, queue, put, upd, del, newId, localSet, localPatch, writeOne, dbErr, subErr, connect };
  },
});
})();
/* /part:page.script.kit.store */
