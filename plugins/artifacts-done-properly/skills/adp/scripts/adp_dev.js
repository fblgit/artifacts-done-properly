/* adp.py dev: a stand-in for the claude.ai viewer's window.claude (db, user, comments, artifact.publish), served at /__adp/shim.js by `adp.py dev serve`,
   which prepends window.__ADP_DEV = {user}. use(name) resolves later, memoized, and null for anything not stood in here.
   Live updates: the server's event stream names the changed docs; the page then re-reads the db and fires the listeners whose result changed.
   Snapshots follow what the live viewer sends (docs/claude-host-adapter.md): a query listener sees a new document written here at once (pending), echoed
   from cache, modified by the acknowledgement, then settled; after a reload its first snapshot is the persisted result (fromCache, stale documents included) and the
   next one corrects it with removed/added. Everything else stays settled-only (updates, deletes, document listeners, concurrent writers: not measured). */
(function () {
'use strict';
const USER = (window.__ADP_DEV || {}).user;
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then(r => r.json(), () => ({ error: { code: 'unavailable', message: 'the dev server did not answer' } }))
  .then(j => { if (j.error) throw j.error; return j; });
function check(path, doc) {
  const s = String(path).split('/');
  if (s.length > 16 || s.some(x => !SEG.test(x) || x === '.' || x === '..') || (s.length % 2 === 0) !== doc)
    throw new TypeError(`bad ${doc ? 'document' : 'collection'} path "${path}"`);
  return s.join('/');
}

let docs = {}, canSend = 'no_session', loaded = null, pending = Promise.resolve();
const subs = new Set();
const SETTLED = { fromCache: false, hasPendingWrites: false }, CACHED = { fromCache: true, hasPendingWrites: false };
let META = SETTLED, FORCE = false;      // what the snapshots built right now carry; FORCE delivers a no-change snapshot
const notify = (m, force) => { META = m; FORCE = !!force; subs.forEach(f => f()); META = SETTLED; FORCE = false; };
function refresh(meta) {
  return fetch('/__adp/db').then(r => r.json()).then(j => {
    const changed = JSON.stringify(j.docs) !== JSON.stringify(docs);
    docs = j.docs; canSend = j.canSend;
    if (changed) notify(meta || SETTLED);
  }).catch(() => {});
}
const load = () => loaded || (loaded = refresh().then(() => { new EventSource('/__adp/events').onmessage = () => refresh(); }));
const STORE = (window.__ADP_DEV || {}).store;      // the dev server's identity for this artifact: the cache is per artifact, and absent without one
const cacheGet = k => { try { return STORE ? JSON.parse(localStorage.getItem(k)) : null; } catch (e) { return null; } };      // the persisted result of a query, across page loads
const cacheSet = (k, v) => { try { if (STORE) localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage: no cache-first snapshot */ } };
const snap = (p, m = META) => ({ id: p.split('/').pop(), exists: !!docs[p], data: () => docs[p] ? clone(docs[p].data) : undefined, metadata: m });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const OPS = {
  '==': eq, '!=': (a, b) => !eq(a, b), '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b,
  'in': (a, b) => b.some(x => eq(a, x)), 'not-in': (a, b) => !b.some(x => eq(a, x)), 'array-contains': (a, b) => Array.isArray(a) && a.some(x => eq(x, b)),
};
function rows(c, q) {
  const n = c.split('/').length + 1;
  let l = Object.keys(docs).filter(p => p.startsWith(c + '/') && p.split('/').length === n).sort();
  for (const [f, op, v] of q.where) l = l.filter(p => f in docs[p].data && OPS[op](docs[p].data[f], v));
  if (q.order) {
    const [f, s] = [q.order[0], q.order[1] === 'desc' ? -1 : 1], val = p => docs[p].data[f];
    const lt = (x, y) => x === null ? y !== null : y === null ? false : x < y;      // as the live viewer: null is the lowest value, a missing field sorts last either way
    l.sort((a, b) => val(a) === val(b) ? 0 : val(a) === undefined ? 1 : val(b) === undefined ? -1 : lt(val(a), val(b)) ? -s : s);
  }
  return q.limit ? l.slice(0, q.limit) : l;
}
function qsnap(l, was, m = META) {
  const ch = [];
  was.forEach(([p], i) => { if (!l.includes(p)) ch.push({ type: 'removed', doc: snap(p, m), oldIndex: i, newIndex: -1 }); });
  l.forEach((p, i) => {
    const o = was.findIndex(([x]) => x === p);
    if (o < 0) ch.push({ type: 'added', doc: snap(p, m), oldIndex: -1, newIndex: i });
    else if (was[o][1] !== JSON.stringify(docs[p])) ch.push({ type: 'modified', doc: snap(p, m), oldIndex: o, newIndex: i });
  });
  const d = l.map(p => snap(p, m));
  return { docs: d, size: d.length, empty: !d.length, docChanges: () => ch, metadata: m };
}
function csnap(old) {      // the persisted result, as a first snapshot: every document added, straight from the cache (stale ones included)
  const d = old.map(([p, j]) => ({ id: p.split('/').pop(), exists: true, data: () => clone(JSON.parse(j).data), metadata: CACHED }));
  return { docs: d, size: d.length, empty: !d.length, docChanges: () => d.map((doc, i) => ({ type: 'added', doc, oldIndex: -1, newIndex: i })), metadata: CACHED };
}
function listen(fire) {
  let on = true;
  const f = () => on && fire();
  load().then(() => { if (on) { subs.add(f); fire(); } });
  return () => { on = false; subs.delete(f); };
}
function write(op, path, data) {      // in order, and before any sendToClaude that follows
  const fresh = op === 'set' && !docs[path];      // the live viewer, for a new document: shown at once (pending), echoed from cache, modified by the ack, settled
  if (fresh) { docs[path] = { data: clone(data), version: 0 }; notify({ fromCache: false, hasPendingWrites: true }); notify({ fromCache: true, hasPendingWrites: true }, true); }
  const w = pending.then(() => post('/__adp/db', { op, path, data: clone(data) })).then(() => refresh(fresh ? { fromCache: true, hasPendingWrites: false } : SETTLED))
    .then(() => { if (fresh) notify(SETTLED, true); }, e => { if (fresh) refresh(); throw e; });
  pending = w.catch(() => {});
  return w;
}
function docRef(path) {
  path = check(path, true);
  return Object.freeze({
    id: path.split('/').pop(), path,
    get: () => load().then(() => snap(path, SETTLED)),
    set: d => write('set', path, d), update: d => write('update', path, d), delete: () => write('delete', path),
    onSnapshot: next => { let last; return listen(() => { const k = JSON.stringify(docs[path] || null); if (META === SETTLED && k !== last) { last = k; next(snap(path, SETTLED)); } }); },      // not measured: settled only
    collection: c => colRef(path + '/' + c),
  });
}
function query(c, q) {
  return {
    where: (f, op, v) => { if (!OPS[op]) throw new TypeError(`unknown operator ${op}`); return query(c, { ...q, where: [...q.where, [f, op, v]] }); },
    orderBy: (f, dir) => query(c, { ...q, order: [f, dir] }),
    limit: n => query(c, { ...q, limit: n }),
    get: () => load().then(() => qsnap(rows(c, q), [], SETTLED)),
    onSnapshot: next => {
      let was = null; const key = 'adp-dev:' + STORE + ':' + c + '|' + JSON.stringify(q);
      return listen(() => {
        const l = rows(c, q), cur = l.map(p => [p, JSON.stringify(docs[p])]);
        if (was === null) { const old = cacheGet(key); if (old) { was = old; next(csnap(old)); } }      // a reload: the persisted result first, as measured
        if (was && eq(was, cur) && !FORCE) return;
        const s = qsnap(l, was || []); was = cur; if (META === SETTLED) cacheSet(key, cur); next(s);
      });
    },
  };
}
function colRef(path) {
  path = check(path, false);
  const r = Object.assign(query(path, { where: [], order: null, limit: 0 }), {
    path, doc: id => docRef(path + '/' + (id || Date.now().toString(36) + Math.random().toString(36).slice(2, 10))),
    add: async d => { const ref = r.doc(); await ref.set(d); return ref; },
  });
  return Object.freeze(r);
}
const db = Object.freeze({ doc: docRef, collection: colRef });

const user = Object.freeze({ id: async () => USER, canEdit: async () => true, can: async name => name === 'data.write', isOwner: async () => true,
  me: async () => ({ id: USER, name: '', avatarUrl: '', color: '', email: null, isOwner: true, canEdit: true }) });      // the key set the live viewer returned

const comments = Object.freeze({
  canSendToClaude: async () => { await refresh(); return canSend; },
  sendToClaude: t => pending.then(() => post('/__adp/inbox', { anchor: t.anchor || null, text: t.text })),
  anchorFor: async () => ({ path: 'body', x: 0, y: 0 }),
});

const artifact = Object.freeze({ publish: files => post('/__adp/publish', { files }) });      // writes the files into the served folder: {version, shas}; an ifMatch that moved rejects {code: 'conflict', paths}

const NS = { db: () => load().then(() => db), user: () => user, comments: () => comments, artifact: () => artifact };
const memo = new Map();
const use = name => {
  if (!memo.has(name)) memo.set(name, Promise.resolve().then(() => NS[name] ? NS[name]() : null));
  return memo.get(name);
};
window.claude = Object.freeze({ use });
})();
