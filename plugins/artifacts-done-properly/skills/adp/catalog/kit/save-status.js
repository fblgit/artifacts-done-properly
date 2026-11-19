/* part:page.script.kit.save-status */
/**
 * Save status line
 * Kit.saveStatus.create({el, lsKey, doc, db, path}) shows where the viewer's changes are kept and runs the save behind it. persist(data) writes to localStorage at once, then to one db doc after a pause, one write at a time; a change made while a write is in flight is written next; a remote update never overwrites changes that have not been written. States, in words: loading, saving, saved with this artifact, saved in this browser only, offline (kept in the browser, saved when the connection returns) and refused (the db said no; the browser keeps it). connect(db, path) can be called later, once the capability resolves, and writes whatever was changed before it. An upgrade of kit.store as a new file: store.js is unchanged.
 *
 * What it is: one line that tells the viewer where their changes are kept: saving, saved with the artifact (the db), saved in this browser only
 * (no db, or the db refused the write), offline (kept in the browser, saved when the connection returns). Behind the line it runs the save
 * itself: every change goes to localStorage at once, then to one db doc after a short pause, one write at a time, and a change made while a write
 * was in flight is written next. A remote update never overwrites changes that have not been written. Plain DOM, no framework.
 * API (small and stable):
 *   Kit.saveStatus.create({el, lsKey, doc, db, debounce, words, normalize, onRemote}) -> {persist(data), flush(), get(), connect(db, path), state(), destroy()}
 *     el          the element that shows the line (it gets role="status", aria-live="polite" and data-state)
 *     lsKey       localStorage key for the browser copy (omit to keep none);  doc  initial data, used when the browser has no copy
 *     db, path    a db handle (ADP.db on any host, or claude.use("db") on Claude) and the doc that holds the data, e.g. "board/state"; or call connect(db, path) once the capability resolves
 *                 (changes made before that are kept in the browser and written when it connects)
 *     debounce    ms to wait after the last change before writing (default 500)
 *     normalize(x) -> data     shapes whatever came from storage (default: identity)
 *     onRemote(data)           called when another viewer's write arrives and there is nothing unwritten here
 *     words       texts that replace the defaults (keys: loading saving shared local offline refused)
 *   data is whatever the board keeps (one JSON-able object); persist(data) is called after each change.
 *   state() is one of loading, saving, shared, local, offline, refused. The same word is el.dataset.state, so a board can style it.
 *
 * The db capability is optional: one doc at the path. Without it the line says "Saved in this browser only" and the page still works.
 *
 * @id        kit.save-status
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   One line that says saved, saving, offline or local only, with the browser fallback, offline queue and refusal handled.
 * @tags      save, status, persist, autosave, offline, localstorage, fallback, db, debounce
 * @requires  none
 * @files     kit/save-status.css, kit/samples/kit.json
 * @provides  Kit.saveStatus.create
 * @extends   kit.store
 * @config    Kit.saveStatus.create({el, lsKey, doc, db, path, debounce, words, normalize, onRemote}) | el shows the line; lsKey names the browser copy; db and path are the capability and the doc, or call connect(db, path) later
 * @config    persist(data) | call after each change with the board's whole small state
 * @config    onRemote(data) | another viewer's write arrived and nothing here is unwritten: repaint from data
 * @tokens    --ink-2 --ink-3 --ok --warn --ink --f-ui?
 * @globals   none
 * @db        reads the doc at path, through onSnapshot / writes the doc at path (set), debounced, one write in flight / note A real artifact declares the db capability and keeps its small state in one doc (for example board/state). Without the capability the line says saved in this browser only and the page still works. It extends kit.store (same habit: localStorage first, then the db) but does not call it, so requires is empty.
 * @source    Catalog harvest, 2026-10-25 | a session board's index.html | setSave, persist, flush and initState: localStorage first, db after a pause, refusal falls back to the browser
 * @preview   {"render": "kit.save-status", "samples": ["kit/samples/kit.json#save-status"]}
 * @samples   save-status
 * @changed   New file kit/save-status.js beside kit/store.js; store.js is unchanged.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const WORDS = {
  loading: 'Loading saved state…', saving: 'Saving…', shared: 'Saved with this artifact', local: 'Saved in this browser only',
  offline: 'Offline. Saved in this browser; it saves to the artifact when you are back online.',
  refused: code => 'Saved in this browser only (the artifact refused the save: ' + code + ')',
};

Kit.saveStatus = Object.freeze({
  create(o) {
    const W = Object.assign({}, WORDS, o.words), debounce = o.debounce == null ? 500 : o.debounce, norm = o.normalize || (x => x);
    const el = o.el; if (el) { el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.classList.add('kit-save'); }
    let data = o.doc, ref = null, mode = 'ls', timer = 0, writing = false, dirty = false, unsynced = false, st = 'local', code = '', dead = false, off = false;
    const ls = {
      get() { if (!o.lsKey) return undefined; try { const v = localStorage.getItem(o.lsKey); return v == null ? undefined : JSON.parse(v); } catch (_) { return undefined; } },
      set(v) { if (!o.lsKey) return; try { localStorage.setItem(o.lsKey, JSON.stringify(v)); } catch (_) {} },
    };
    function show(s, c) {
      st = s; code = c || '';
      if (!el) return;
      el.dataset.state = s;
      el.replaceChildren(Object.assign(document.createElement('i'), { className: 'kit-save-dot' }), document.createTextNode(s === 'refused' ? W.refused(code || 'error') : W[s]));
    }
    const local = ls.get(); if (local !== undefined) data = norm(local);
    show(o.db ? 'loading' : 'local');
    function idleState() { return off ? 'offline' : mode === 'db' ? 'shared' : 'local'; }
    function persist(next) {
      data = next; ls.set(data); dirty = true; clearTimeout(timer);
      if (mode !== 'db' || !ref) { dirty = false; unsynced = true; show(off ? 'offline' : st === 'refused' ? 'refused' : 'local', code); return; }
      show(off ? 'offline' : 'saving');
      if (!off) timer = setTimeout(flush, debounce);
    }
    function flush() {
      clearTimeout(timer);
      if (dead || mode !== 'db' || !ref) { dirty = false; show(st === 'refused' ? 'refused' : 'local', code); return Promise.resolve(); }
      if (off) { show('offline'); return Promise.resolve(); }
      if (writing) { timer = setTimeout(flush, 300); return Promise.resolve(); }
      writing = true; const snap = JSON.stringify(data);
      return Promise.resolve().then(() => ref.set(JSON.parse(snap))).then(() => {
        writing = false;
        if (JSON.stringify(data) === snap) { dirty = false; show('shared'); } else flush();
      }, e => {
        writing = false; dirty = false; mode = 'ls';
        show(e && (e.code === 'unavailable' || e.code === 'network') ? 'offline' : 'refused', (e && e.code) || 'error');
        if (st === 'offline') mode = 'db';
      });
    }
    function connect(db, path) {
      if (!db) { mode = 'ls'; show('local'); return; }
      ref = db.doc(path); mode = 'db'; if (!unsynced) show('loading');
      ref.onSnapshot(snap => {
        if (unsynced) { unsynced = false; dirty = true; flush(); return; }
        if (!dirty && !writing && snap.exists) { data = norm(snap.data()); ls.set(data); if (o.onRemote) o.onRemote(data); }
        if (st === 'loading' || st === 'shared' || st === 'local') show(idleState());
      }, () => { mode = 'ls'; show('local'); });
    }
    const goOffline = () => { off = true; if (mode === 'db') show('offline'); };
    const goOnline = () => { off = false; if (mode === 'db') { if (dirty) { show('saving'); flush(); } else show('shared'); } };
    window.addEventListener('offline', goOffline); window.addEventListener('online', goOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) off = true;
    if (o.db && o.path) connect(o.db, o.path);
    return {
      persist, flush, connect, get: () => data, state: () => st,
      destroy() { dead = true; clearTimeout(timer); window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); if (el) el.replaceChildren(); },
    };
  },
});
})();
/* /part:page.script.kit.save-status */
