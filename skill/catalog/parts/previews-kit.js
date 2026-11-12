/* part:page.script.previews.kit */
/* Live previews of the Board kit. Each runs the kit file on its own sample against a sandbox db held in memory: nothing reaches this catalog's db or Claude. */
(function () {
'use strict';
const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const LS = 'catalog-preview';

// ---------------------------------------------------------------- sandbox db: the db capability's shape, in memory
function sandbox() {
  const docs = new Map(); const subs = new Set(); const watchers = new Set(); let idn = 0;
  const parent = p => p.slice(0, p.lastIndexOf('/'));
  const snapDoc = p => ({ id: p.split('/').pop(), exists: docs.has(p), data: () => clone(docs.get(p)) });
  const test = ([f, op, v], d) => op === '==' ? d[f] === v : op === '!=' ? d[f] !== v : op === 'in' ? (v || []).includes(d[f]) : true;
  function list(q) {
    let out = [...docs.entries()].filter(([p, d]) => parent(p) === q.path && (q.f || []).every(c => test(c, d)));
    if (q.o) { const [f, dir] = q.o; out.sort((a, b) => (a[1][f] > b[1][f] ? 1 : a[1][f] < b[1][f] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
    return q.l ? out.slice(0, q.l) : out;
  }
  const snapOf = l => ({ docs: l.map(([p]) => snapDoc(p)), size: l.length, empty: !l.length });
  function query(q) {
    return {
      where: (f, op, v) => query(Object.assign({}, q, { f: [...(q.f || []), [f, op, v]] })),
      orderBy: (f, dir) => query(Object.assign({}, q, { o: [f, dir || 'asc'] })),
      limit: n => query(Object.assign({}, q, { l: n })),
      get: async () => snapOf(list(q)),
      onSnapshot(cb) {
        const s = { prev: new Map() };
        s.fire = initial => {
          const l = list(q); const now = new Map(l.map(([p, d]) => [p, JSON.stringify(d)])); const ch = [];
          for (const [p, j] of now) if (!s.prev.has(p)) ch.push({ type: 'added', doc: snapDoc(p) }); else if (s.prev.get(p) !== j) ch.push({ type: 'modified', doc: snapDoc(p) });
          for (const p of s.prev.keys()) if (!now.has(p)) ch.push({ type: 'removed', doc: { id: p.split('/').pop(), exists: false, data: () => ({}) } });
          s.prev = now; if (!ch.length && !initial) return;
          cb(Object.assign(snapOf(l), { docChanges: () => ch }));
        };
        subs.add(s); setTimeout(() => s.fire(true), 0);
        return () => subs.delete(s);
      },
    };
  }
  const notify = () => setTimeout(() => { subs.forEach(s => s.fire(false)); watchers.forEach(f => f()); }, 0);
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      set: async d => { docs.set(path, clone(d)); notify(); },
      update: async d => { if (!docs.has(path)) { const e = new Error('not found'); e.code = 'not_found'; throw e; } docs.set(path, Object.assign({}, docs.get(path), clone(d))); notify(); },
      delete: async () => { docs.delete(path); notify(); },
      get: async () => snapDoc(path),
    };
  }
  const db = {
    collection: path => Object.assign(query({ path }), { path, doc: id => docRef(path + '/' + (id || 'sb' + (++idn).toString(36).padStart(4, '0'))) }),
    doc: path => docRef(path),
  };
  return { db, docs, seed(path, d) { docs.set(path, clone(d)); }, watch(f) { watchers.add(f); return () => watchers.delete(f); } };
}
function useSandbox(sb) { const [, f] = useState(0); useEffect(() => sb.watch(() => f(x => x + 1)), [sb]); return sb.docs; }
const Json = ({ value, label }) => html`<pre class="pv-json" tabindex="0" aria-label=${label}>${JSON.stringify(value, null, 1)}</pre>`;
const Sim = ({ children }) => html`<p class="pv-sim"><b>Sandbox</b> ${children}</p>`;

// ---------------------------------------------------------------- store
P['kit.store'] = ({ samples }) => {
  const d = first(samples, 'store');
  const x = useMemo(() => {
    const sb = sandbox(); const log = [];
    const store = K().store.create({ lsPrefix: LS, state: clone(d.store.state) });
    const db = K().db.create(Object.assign({ store, toast: t => { log.push(t); store.emit(); } }, d.db)); db.C.db = sb.db;
    store.set({ conn: 'live' });
    return { sb, store, db, log };
  }, [d]);
  const S = x.store.useS(); const docs = useSandbox(x.sb);
  const [text, setText] = useState('hello');
  const notes = Object.entries(S.notes || {});
  const add = () => { const id = x.db.newId('notes'); const doc = { text: text || 'hello', created: Date.now() }; x.db.localSet('notes', id, doc); x.db.put('notes', id, doc); };
  const edit = id => { const p = { text: S.notes[id].text + '!' }; x.db.localPatch('notes', id, p); x.db.upd('notes', id, p); };
  const drop = id => { delete S.notes[id]; x.store.emit(); x.db.del('notes', id); };
  return html`<div class="pv-stack">
    <${Sim}>writes go to an in-memory db with the capability’s shape, at <code>${d.db.pathTemplate}</code> with scope <code>${S[d.db.scopeSlot]}</code>.<//>
    <form class="pv-row" onSubmit=${ev => { ev.preventDefault(); add(); }}>
      <label class="pv-field"><span>Note text</span><input value=${text} onInput=${ev => setText(ev.target.value)}/></label>
      <button class="pv-btn pri" type="submit">put + localSet</button>
    </form>
    <ul class="pv-list">${notes.map(([id, n]) => html`<li class="pv-rec" key=${id}><code>${id}</code><span>${n.text}</span>
      <button class="pv-btn" type="button" onClick=${() => edit(id)}>upd + localPatch</button><button class="pv-btn" type="button" onClick=${() => drop(id)}>del</button></li>`)}</ul>
    <div class="pv-two">
      <section><p class="pv-label">S.notes (what the page paints)</p><${Json} value=${S.notes} label="State"/></section>
      <section><p class="pv-label">The db (what was written)</p><${Json} value=${Object.fromEntries(docs)} label="Sandbox db"/></section>
    </div>
  </div>`;
};

// ---------------------------------------------------------------- tokens
const FONT = n => n.startsWith('--f-'); const SHADOW = n => n === '--shadow';
P['kit.tokens'] = ({ samples, theme }) => {
  const d = first(samples, 'tokens'); const T = K().tokens;
  const ref = useRef(null); const [fit, setFit] = useState(null);
  const contract = T.contract();
  useEffect(() => { const cs = getComputedStyle(ref.current); const out = {};
    for (const [p, names] of Object.entries(contract)) out[p] = names.filter(n => !cs.getPropertyValue(n).trim());
    setFit(out); }, [theme]);
  const css = T.themeCss(d.themeCss);
  return html`<div class="pv-stack" ref=${ref}>
    <p class="pv-label">The contract, resolved in ${theme ? theme.name : 'this theme'}</p>
    ${Object.entries(contract).map(([p, names]) => html`<section class="pv-contract" key=${p}>
      <h4><code>${p}</code> <span class=${'pv-fit ' + (fit && fit[p].length ? 'miss' : 'ok')}>${fit ? (fit[p].length ? fit[p].length + ' missing' : 'all ' + names.length + ' defined') : '…'}</span></h4>
      <ul class="pv-tokens">${names.map(n => html`<li key=${n} class=${fit && fit[p].includes(n) ? 'miss' : ''}>
        ${FONT(n) ? html`<i class="tk-font" style=${'font-family:var(' + n + ')'}>Aa</i>` : SHADOW(n) ? html`<i class="tk-shadow" style=${'box-shadow:var(' + n + ')'}></i>` : html`<i class="tk-sw" style=${'background:var(' + n + ')'}></i>`}
        <code>${n}</code></li>`)}</ul></section>`)}
    <p class="pv-label">themeCss() on the sample’s two maps</p>
    <pre class="pv-json" tabindex="0">${css}</pre>
  </div>`;
};

// ---------------------------------------------------------------- chrome
P['kit.chrome'] = ({ samples }) => {
  const d = first(samples, 'chrome');
  const x = useMemo(() => {
    const store = K().store.create({ lsPrefix: LS, state: clone(d.store.state) });
    const chrome = K().chrome.create(Object.assign({ store }, d.chrome));
    return { store, chrome };
  }, [d]);
  const { chrome } = x; const S = x.store.useS();
  const dialog = () => chrome.openModal(Object.assign({}, d.open, { onOk: v => { chrome.toast('Saved: ' + (v.name || '(no name)') + (v.pin ? ', pinned' : '') + '.'); } }));
  useEffect(() => { dialog(); }, []);
  const busy = () => chrome.step('Copying five things', 5, async tick => { for (let i = 1; i <= 5; i++) { await new Promise(r => setTimeout(r, 380)); tick(i); } });
  const { Modal, Toast, Busy, ArmedButton, AutoText } = chrome;
  const [note, setNote] = useState('A field that grows as you type.\nTry a third line.');
  return html`<div class="pv-stack">
    <div class="pv-row">
      <button class="pv-btn pri" type="button" onClick=${dialog}>Open the dialog</button>
      <button class="pv-btn" type="button" onClick=${() => chrome.toast('Saved a copy.')}>Toast</button>
      <button class="pv-btn" type="button" onClick=${() => chrome.toast('Moved to the archive.', '', { label: 'Undo', fn: () => chrome.toast('Back where it was.') })}>Toast with an action</button>
      <button class="pv-btn" type="button" onClick=${busy}>Busy with progress</button>
      <${ArmedButton} label="Delete" armedLabel="Click again to delete" onConfirm=${() => chrome.toast('Deleted (in the preview only).')}/>
    </div>
    <label class="pv-field"><span>AutoText (commits on blur)</span><${AutoText} value=${note} onCommit=${setNote}/></label>
    <p class="pv-label">Kit.icons</p>
    <ul class="pv-icons">${Object.entries(K().icons).map(([n, svg]) => html`<li key=${n}><span aria-hidden="true">${svg}</span><code>${n}</code></li>`)}</ul>
    <div class="pv-frame" aria-label="Overlay area"><p class="pv-frame-note">${S.modal ? '' : 'The dialog, toast and busy bar render here.'}</p><${Modal}/><${Toast}/><${Busy}/></div>
  </div>`;
};

// ---------------------------------------------------------------- md
P['kit.md'] = ({ samples }) => {
  const d = first(samples, 'md');
  const md = useMemo(() => K().md.create(d.md), [d]);
  const [src, setSrc] = useState(d.input + '\n> A quote, `code` and a table:\n\n| step | state |\n|---|---|\n| queue | waiting |\n| done | answered |\n\nA [script link](javascript:alert(1)) loses its href, and <b onclick="alert(1)">this onclick</b> is dropped.\n');
  return html`<div class="pv-two">
    <label class="pv-field"><span>Markdown in</span><textarea rows="14" value=${src} onInput=${ev => setSrc(ev.target.value)}></textarea></label>
    <section><p class="pv-label">Sanitized HTML out</p><div class="md" dangerouslySetInnerHTML=${{ __html: md(src) }}></div></section>
  </div>`;
};

// ---------------------------------------------------------------- Claude lane
P['kit.claude-lane'] = ({ samples }) => {
  const d = first(samples, 'claude-lane');
  const x = useMemo(() => {
    const sb = sandbox();
    const state = clone(d.store.state);
    const reqs = state.requests || {}; const last = Math.max(0, ...Object.values(reqs).map(r => r.created || 0));
    const shift = Date.now() - 4 * 60000 - last;   // the sample's stamps are relative: the newest request lands four minutes ago
    for (const r of Object.values(reqs)) { if (r.created) r.created += shift; (r.progress || []).forEach(g => { if (g.at) g.at += shift; }); }
    const store = K().store.create({ lsPrefix: LS, state });
    const chrome = K().chrome.create({ store });
    const db = K().db.create(Object.assign({ store, toast: chrome.toast }, d.db)); db.C.db = sb.db;
    for (const [id, r] of Object.entries(reqs)) sb.seed('requests/' + id, r);
    const lane = K().claudeLane.create(Object.assign({ store, db, chrome }, d.lane));
    return { sb, store, chrome, db, lane };
  }, [d]);
  const S = x.store.useS(); const { lane, chrome } = x;
  const [text, setText] = useState('Compare the two canvases and say which one to keep.');
  const rec = d.props.ReqList.recordId;
  const open = Object.entries(S.requests).filter(([, r]) => r.status !== 'done').sort((a, b) => (a[1].created || 0) - (b[1].created || 0));
  const [rid, r] = open[0] || [];
  const play = () => {
    if (!rid) return; const st = lane.reqState(r); const at = Date.now();
    if (st === 'queue') lane.updateRequest(rid, { state: 'ack', ackBy: 'claude-code', ackAt: at, delivered: true });
    else if (st === 'ack') lane.updateRequest(rid, { state: 'working', progress: [...(r.progress || []), { at, text: 'Reading the request' }] });
    else if (st === 'pending') { const done = { status: 'done', response: 'Done in the preview: nothing left this page.' }; lane.updateRequest(rid, done); lane.answerArrived(rid, Object.assign({}, r, done)); }
  };
  const next = r ? { queue: 'Acknowledge it', ack: 'Start working', pending: 'Answer it' }[lane.reqState(r)] : null;
  return html`<div class="pv-stack">
    <${Sim}>this preview has no comments capability, so <code>sendRequest</code> queues every request and nothing reaches Claude. The second button plays the session’s side of the protocol on the oldest open request. The sample’s times are moved so its newest request reads as four minutes old.<//>
    <div class="pv-row"><span class="pv-label">Is a session listening?</span>
      <span class="c-seg" role="group" aria-label="Listening">${[['available', 'Listening'], ['none', 'Nobody']].map(([v, l]) => html`<button type="button" key=${v} aria-pressed=${(S.listen === 'available') === (v === 'available')} onClick=${() => x.store.set({ listen: v })}>${l}</button>`)}</span></div>
    <${lane.ListenHint}/>
    <${lane.QueueStrip}/>
    <form class="pv-row" onSubmit=${ev => { ev.preventDefault(); if (text.trim()) lane.sendRequest(text.trim(), null, rec); }}>
      <label class="pv-field grow"><span>Request</span><input value=${text} onInput=${ev => setText(ev.target.value)}/></label>
      <button class="pv-btn pri" type="submit">Send</button>
      <button class="pv-btn" type="button" disabled=${!next} onClick=${play}>${next ? 'Session: ' + next.toLowerCase() : 'Nothing open'}</button>
    </form>
    <${lane.ReqList} recordId=${rec} max=${6}/>
    <div class="pv-frame short"><${chrome.Toast}/></div>
  </div>`;
};

// ---------------------------------------------------------------- canvas
P['kit.canvas'] = ({ samples }) => {
  const d = first(samples, 'canvas');
  const x = useMemo(() => {
    const sb = sandbox();
    const store = K().store.create({ lsPrefix: LS, state: Object.assign(clone(d.store.state), K().canvas.slots(d.canvas), { modal: null, toast: null, busy: null }) });
    const chrome = K().chrome.create({ store });
    const db = K().db.create(Object.assign({ store, toast: chrome.toast }, d.db)); db.C.db = sb.db;
    const scope = d.store.state[d.db.scopeSlot || 'scopeId'];
    for (const [coll, all] of Object.entries(d.data)) for (const [id, doc] of Object.entries(all)) sb.seed(d.db.pathTemplate.replace('{scope}', scope).replace('{name}', coll) + '/' + id, doc);
    for (const [id, c] of Object.entries(d.data.canvases)) store.S.canvases[id] = clone(c);
    const cv = K().canvas.create(Object.assign({ store, db, chrome, applySnap(name, snap) {
      for (const ch of snap.docChanges()) { if (ch.type === 'removed') delete store.S[name][ch.doc.id]; else store.S[name][ch.doc.id] = ch.doc.data(); }
      store.emit(); } }, d.canvas));
    return { store, chrome, cv };
  }, [d]);
  const { cv, chrome } = x;
  return html`<div class="pv-stack">
    <${Sim}>draw, drag, connect and undo freely: the canvas writes to an in-memory db and forgets on reload. Keys work while the pointer is on the page.<//>
    <div class="pv-canvas pv-frame tall"><${cv.CanvasView}/><${chrome.Modal}/><${chrome.Toast}/><${chrome.Busy}/></div>
  </div>`;
};
})();
/* /part:page.script.previews.kit */
