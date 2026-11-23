/* part:page.script.catalog */
/* The catalog: entries from the db (entries/*, live) or catalog.json (the index published with the page), search and filters,
   one specimen sheet at a time, the proofing stage, the take reference, file hashes checked in the browser.
   The index is short: what an entry is about, what it needs, where it came from and how it previews are read from the
   header comment of its main file (CatalogFiles, parts/files.js) when the entry is opened. */
(function () {
'use strict';
const { html, render, useState, useEffect, useRef, Component } = window.htmPreact;
const F = window.CatalogFiles;
const $ = s => document.querySelector(s);
const CDN = {
  'htm-preact': { label: 'htm and preact (standalone)', tag: '<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.umd.js"></script>' },
  'marked': { label: 'marked 12.0.2', tag: '<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>' },
  'dompurify': { label: 'DOMPurify 3.1.6', tag: '<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>' },
};
const KIND = { component: 'Component', theme: 'Theme', template: 'Template', guide: 'Guide' };
const GROUPS = ['Board kit', 'Layouts', 'Patterns', 'Visualizations', 'Runtime', 'Themes', 'Templates', 'Guides'];
const TABS = [['preview', 'Preview'], ['needs', 'What it needs'], ['take', 'Take it'], ['files', 'Files'], ['origin', 'Origin']];
const ls = { get(k, d) { try { const v = localStorage.getItem('kitcat:' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('kitcat:' + k, JSON.stringify(v)); } catch (_) {} } };

// ---------------------------------------------------------------- state
const S = { entries: [], added: [], src: 'loading', self: { url: '', ver: '' }, q: '', group: 'all', sel: null, tab: 'preview',
  theme: ls.get('theme', 'theme.journey-whiteboard'), mode: ls.get('mode', 'page'), err: '' };
const subs = new Set(); let raf = 0, ver = 0;
const set = p => { Object.assign(S, p); ver++; if (!raf) raf = requestAnimationFrame(() => { raf = 0; subs.forEach(f => f()); }); };
// a component subscribes after its first paint: if the state moved in between, it renders again at once
function useS() { const [, f] = useState(0); const seen = ver;
  useEffect(() => { const g = () => f(x => x + 1); subs.add(g); if (ver !== seen) g(); return () => subs.delete(g); }, []); return S; }

const ID = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
function clean(list) {
  return (list || []).filter(e => e && ID.test(e.id || '') && KIND[e.kind]).map(e => Object.assign({ files: [], requires: [], globals: [], provides: [], tags: [] }, e));
}
// The index record plus what only the header of the entry's main file says: about, needs (config, tokens, db), source,
// changed, preview, updated. These are never read from the record.
function withHeader(e, h) {
  h = h || {};
  return Object.assign({}, e, { about: h.about || '', needs: { config: h.config || [], tokens: h.tokens || [], db: h.db || {} }, source: h.source || [], changed: h.changed || [], preview: h.preview || null, updated: h.updated || '' });
}
// { e: null } while the header is read, then { e: the full entry }, with err when the header could not be read
function useFull(e) {
  const [st, setSt] = useState({ e: null });
  useEffect(() => {
    let off = false; const m = F.main(e);
    setSt({ e: null });
    (m ? F.header(m) : Promise.reject(new Error('the entry names no main file')))
      .then(h => { if (!off) setSt({ e: withHeader(e, h) }); }, err => { if (!off) setSt({ e: withHeader(e), err: (err && err.message) || String(err) }); });
    return () => { off = true; };
  }, [e.id, e.hash]);
  return st;
}
const byId = id => S.entries.find(e => e.id === id);
function closure(e) {
  const out = [], seen = new Set();
  const walk = x => { if (!x || seen.has(x.id)) return; seen.add(x.id); (x.requires || []).forEach(r => walk(byId(r))); out.push(x); };
  walk(e); return out;
}
const kb = n => n >= 1024 ? (n / 1024).toFixed(1) + ' kB' : n + ' B';
const short = h => (h || '').slice(0, 12);

// the About ADP page (welcome.html) is published beside the catalog; the link shows only when it is there
const about = $('#aboutAdp'); if (about) fetch('welcome.html', { method: 'HEAD' }).then(r => { if (r.ok) about.hidden = false; }, () => {});

// ---------------------------------------------------------------- data: catalog.json first, then the db when it answers
fetch('catalog.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
  .then(d => { if (S.src === 'db') return; set({ entries: clean(d.entries), src: 'file', self: { url: d.url || '', ver: d.ver || '' } }); })
  .catch(e => { if (S.src !== 'db') set({ src: 'none', err: 'catalog.json could not be read (' + e.message + ').' }); });
(async () => {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  const db = await window.claude.use('db').catch(() => null);
  if (!db) return;
  db.collection('entries').onSnapshot(snap => {
    const docs = snap.docs.filter(d => d.exists).map(d => Object.assign({}, d.data(), { id: d.id }));
    if (docs.length) set({ entries: clean(docs), src: 'db' });
  }, () => {});
  db.doc('catalog/self').onSnapshot(d => { if (d.exists) { const v = d.data() || {}; set({ self: { url: v.url || S.self.url, ver: v.ver || S.self.ver } }); } }, () => {});
  // the packed catalog's kit files wait in proposals (incoming/); an editor applies them here, with the inbox every ADP page has
  // mounted once status/seed says done: on a first open the seed is still writing the proposals, and the inbox reads incoming/ when it mounts
  const box = $('#incomingBox'), sec = $('#incoming'); let inbox = false;
  if (box && sec && window.Kit && Kit.inbox) db.doc('status/seed').onSnapshot(d => {
    if (inbox || !d.exists || (d.data() || {}).state !== 'done') return;
    inbox = true; sec.hidden = false;
    // bootstrap: the packed catalog's kit folders are applied by the page itself, then it reloads to load them
    Kit.inbox.mount(box, { db, autoApply: true, onAutoApplied: () => setTimeout(() => location.reload(), 1500) });
  }, () => {});
  // an extra kit (docs/kit-json.md) arrives as a proposal that carries its index record (entry). Once its files are applied the page proposes
  // catalog.json with that record, and the inbox applies it like any file: What changed and the manifest follow. It is computed once nothing is pending, on the merged catalog.json.
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  let indexing = false;
  const note = (...m) => {      // why the index did not change, in the Incoming panel: an editor's tab only (a viewer never writes)
    m = m.filter(Boolean).join(' · ');
    if (!sec || !(window.ADP && ADP.user && ADP.user.canEdit)) return;
    let p = sec.querySelector('.index-note');
    if (!p) { p = document.createElement('p'); p.className = 'index-note'; p.setAttribute('role', 'status'); sec.prepend(p); }
    p.textContent = m; p.hidden = !m; if (m) sec.hidden = false;
  };
  // a record is indexed only when the proposal delivered every file it lists, with the same sha256
  const delivered = d => (d.entry.files || []).every(f => (d.files || []).some(x => x.path === f.path && x.sha256 === f.sha256));
  db.collection('incoming').onSnapshot(async snap => {
    const docs = snap.docs.filter(d => d.exists).map(d => Object.assign({}, d.data(), { pid: d.id })), kits = {};
    // each kit proposal is indexed once: a later removal or update of that kit is never undone from its old record
    const due = docs.filter(d => d.status === 'applied' && !d.indexed && d.entry && ID.test(d.entry.id || ''));
    const bad = due.filter(d => !delivered(d)), warn = bad.length ? 'index not updated for ' + bad.map(d => d.entry.id).join(', ') + ': its record lists files or hashes its proposal did not deliver' : '';
    const todo = due.filter(delivered).sort((a, b) => ((a.applied || {}).at > (b.applied || {}).at ? 1 : -1));
    todo.forEach(d => { kits[d.entry.id] = d.entry; });      // the newest applied record of each kit
    const at = d => (d.applied || {}).at || '';      // Landing's "New entries": the applied kits, newest first
    set({ added: docs.filter(d => d.status === 'applied' && d.entry && ID.test(d.entry.id || '')).sort((a, b) => (at(a) < at(b) ? 1 : -1)).map(d => d.entry).filter((e, i, l) => l.findIndex(x => x.id === e.id) === i).slice(0, 20) });
    if (!indexing) note(warn);
    if (indexing || !Object.keys(kits).length || docs.some(d => d.status === 'new' || d.status === 'merged')) return;      // the index is computed after every pending proposal is merged
    indexing = true;
    try {
      const text = await (await fetch('catalog.json', { cache: 'no-store' })).text(), cat = JSON.parse(text), base = await sha(text);
      const mr = await db.doc('manifest/current').get(), mv = (mr.exists && mr.data()) || {}, rec = ((mv.data && !mv.parts ? mv.data : mv).files || {})['catalog.json'];
      if (rec && base.slice(0, 12) !== rec) return note(warn, 'index not updated: this tab reads an older catalog.json, reload it');      // this tab reads an older catalog.json than the record holds: a current tab proposes
      const add = Object.values(kits).filter(e => !cat.entries.some(x => x.id === e.id && x.hash === e.hash));
      // settled: the index holds the record, or a newer proposal of the same kit replaced it. A held index proposal leaves its kit to be proposed again
      const settled = todo.filter(d => kits[d.entry.id] !== d.entry || !add.includes(d.entry));
      cat.entries = cat.entries.filter(x => !add.some(e => e.id === x.id)).concat(add);
      const content = JSON.stringify(cat, null, 1) + '\n', pid = 'p-index-' + (await sha(base + content)).slice(0, 8), N = 100000, n = Math.ceil(content.length / N);
      if (add.length && !docs.some(d => d.pid === pid)) {      // a held or declined index proposal is a person's to settle; the id covers the base, so a stale one never blocks a current one
        for (let i = 0; i < n; i++) await db.doc('incoming/' + pid + '/chunks/' + i).set({ path: 'catalog.json', n: i, of: n, content: content.slice(i * N, (i + 1) * N) });
        await db.doc('incoming/' + pid).set({ by: 'catalog', at: new Date().toISOString(), summary: 'Catalog index: ' + add.map(e => e.id).join(', '), threads: [], parts: [], live_files: {}, status: 'new',
          files: [{ path: 'catalog.json', ifMatch: base, contentType: 'application/json', sha256: await sha(content), size: new TextEncoder().encode(content).length, chunks: n }] });
      }
      for (const d of settled) await db.doc('incoming/' + d.pid).update({ indexed: true });
    } catch (err) { note(warn, 'index not updated (' + ((err && err.message) || err) + '): reload this tab'); } finally { indexing = false; }      // a viewer cannot write: an editor's tab does it
  }, () => {});
})();

// ---------------------------------------------------------------- routing: #<entry id>
function fromHash() { const h = decodeURIComponent((location.hash || '').slice(1)); set({ sel: ID.test(h) ? h : null }); }
addEventListener('hashchange', fromHash); fromHash();
function open(id) {
  if (id) { if (location.hash !== '#' + id) location.hash = id; set({ sel: id }); }
  else { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { location.hash = ''; } set({ sel: null }); }
  const sh = $('.sheet'); if (sh && innerWidth <= 860) sh.scrollIntoView({ block: 'start' });
}

// ---------------------------------------------------------------- search
// The index has no about or source text: both are in the header of an entry's main file. On the first keystroke the
// main file of every entry is read (6 at a time, each once; CatalogFiles keeps the text) and its header's about and
// source are matched with the index fields. Until an entry's header is in, or when it cannot be read, that entry
// matches on its index fields alone.
const heads = {}, seen = new Set(), queue = []; let busy = 0;
function pump() {
  while (busy < 6 && queue.length) {
    const e = queue.shift(); busy++;
    F.header(F.main(e)).then(h => { heads[e.id] = { about: h.about || '', source: (h.source || []).map(s => s.board + ' ' + s.file + ' ' + s.what).join(' ') }; set({}); }, () => {})
      .then(() => { busy--; pump(); });
  }
}
function readHeads() {
  for (const e of S.entries) if (F.main(e) && !seen.has(e.id)) { seen.add(e.id); queue.push(e); }
  pump();
}
function terms(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
function score(e, ts) {
  if (!ts.length) return 1;
  const m = heads[e.id] || {};
  const f = [[e.name, 6], [e.id, 4], [(e.tags || []).join(' '), 3], [e.group + ' ' + KIND[e.kind], 2], [e.summary, 2], [m.about, 1],
    [(e.provides || []).join(' '), 1], [m.source, 1]].map(([t, w]) => [String(t || '').toLowerCase(), w]);
  let s = 0;
  for (const t of ts) { const hit = f.filter(([x]) => x.includes(t)); if (!hit.length) return 0; s += Math.max(...hit.map(([, w]) => w)); }
  return s;
}
function Hl({ text, q }) {
  const ts = terms(q); const s = String(text || ''); if (!ts.length) return s;
  const low = s.toLowerCase(), marks = [];
  for (const t of ts) { let i = low.indexOf(t); while (i >= 0) { marks.push([i, i + t.length]); i = low.indexOf(t, i + t.length); } }
  if (!marks.length) return s;
  marks.sort((a, b) => a[0] - b[0]); const out = []; let at = 0;
  for (const [a, b] of marks) { if (a < at) continue; out.push(s.slice(at, a), html`<mark>${s.slice(a, b)}</mark>`); at = b; }
  out.push(s.slice(at)); return out;
}

// ---------------------------------------------------------------- small pieces
function Glyph({ kind }) {
  const p = { component: html`<rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/>`,
    theme: html`<circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2.8a5.2 5.2 0 010 10.4z" fill="currentColor"/>`,
    template: html`<rect x="2.8" y="2.8" width="10.4" height="10.4" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.8 6h10.4" stroke="currentColor" stroke-width="1.5"/>`,
    guide: html`<path d="M3.5 4h9M3.5 7h9M3.5 10h6.5M3.5 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` }[kind];
  return html`<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">${p}</svg>`;
}
function Copy({ text, label = 'Copy', pre, cls, onFail }) {
  const [st, setSt] = useState('');
  const go = () => {
    const done = ok => { setSt(ok ? 'Copied' : 'Selected: press Ctrl+C or ⌘C'); setTimeout(() => setSt(''), 2400); };
    const sel = () => { if (onFail) { onFail(); return; } const el = pre && pre.current; if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } done(false); };
    try { navigator.clipboard.writeText(text).then(() => done(true), sel); } catch (_) { sel(); }
  };
  return html`<button type="button" class=${'copy' + (cls ? ' ' + cls : '') + (st === 'Copied' ? ' done' : '')} onClick=${go} aria-live="polite">${st || label}</button>`;
}
function Code({ text, label }) {
  const pre = useRef(null);
  return html`<div class="code"><pre ref=${pre} tabindex="0" aria-label=${label || 'Code'}>${text}</pre><${Copy} text=${text} pre=${pre}/></div>`;
}

// ---------------------------------------------------------------- tabs (page.tabs) and header meta
function Tabs() {
  const s = useS();
  const n = g => g === 'all' ? s.entries.length : s.entries.filter(e => e.group === g).length;
  const groups = ['all', ...GROUPS.filter(g => n(g)), ...[...new Set(s.entries.map(e => e.group))].filter(g => !GROUPS.includes(g))];
  const home = () => { open(null); set({ group: 'all', q: '' }); scrollTo(0, 0); };
  return [html`<button type="button" class="tab tab-home" aria-pressed=${!s.sel} aria-label="Home: the catalog's start page" onClick=${home}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>Home</button>`]
    .concat(groups.map(g => html`<button type="button" class="tab" aria-pressed=${s.sel ? false : s.group === g} onClick=${() => { if (s.sel) open(null); set({ group: g }); }}>${g === 'all' ? 'All' : g}<span class="c-n">${n(g)}</span></button>`));
}
function Meta() {
  const s = useS();
  if (s.src === 'loading') return 'Opening the catalog…';
  const k = Object.keys(KIND).map(x => [x, s.entries.filter(e => e.kind === x).length]).filter(([, c]) => c);
  return html`<b>${s.entries.length}</b> entries · ${k.map(([x, c], i) => html`${i ? ', ' : ''}${c} ${KIND[x].toLowerCase()}${c > 1 ? 's' : ''}`)} · ${s.src === 'db' ? 'live from the database' : s.src === 'file' ? 'from catalog.json' : 'nothing loaded'}`;
}

// ---------------------------------------------------------------- index
/* part:catalog.index */
function Index() {
  const s = useS();
  const inp = useRef(null);
  useEffect(() => {
    const k = e => { if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); inp.current && inp.current.focus(); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  const ts = terms(s.q);
  const list = s.entries.filter(e => s.group === 'all' || e.group === s.group).map(e => [e, score(e, ts)]).filter(([, x]) => x > 0);
  if (ts.length) list.sort((a, b) => b[1] - a[1]);
  const order = g => { const i = GROUPS.indexOf(g); return i < 0 ? 99 : i; };
  const groups = ts.length ? [['Matches', list.map(([e]) => e)]]
    : [...new Set(list.map(([e]) => e.group))].sort((a, b) => order(a) - order(b)).map(g => [g, list.filter(([e]) => e.group === g).map(([e]) => e)]);
  const first = list[0] && list[0][0];
  return html`<aside class="index" data-part="catalog.index" data-comment-target aria-label="Entries">
    <form class="search" role="search" onSubmit=${e => { e.preventDefault(); if (first) { open(first.id); setTimeout(() => { const h = document.getElementById('sheetName'); if (h) h.focus({ preventScroll: false }); }, 60); } }}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5l3.3 3.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <label class="sr" for="q">Search the catalog</label>
      <input id="q" ref=${inp} type="search" autocomplete="off" placeholder="Search: canvas, tree, tokens…" value=${s.q}
        onInput=${e => { set({ q: e.target.value }); readHeads(); }} onKeyDown=${e => { if (e.key === 'Escape') set({ q: '' }); }}/>
      ${s.q ? '' : html`<kbd aria-hidden="true">/</kbd>`}
    </form>
    <p class="count" aria-live="polite">${s.src === 'loading' ? 'Loading…' : ts.length ? `${list.length} ${list.length === 1 ? 'match' : 'matches'} for “${s.q}”` : `${list.length} entries`}</p>
    ${s.err && !s.entries.length ? html`<div class="empty">${s.err} Reload the page; if it stays empty, the catalog has no published snapshot yet.</div>` : ''}
    ${!list.length && s.src !== 'loading' && !s.err ? html`<div class="empty">Nothing matches “${s.q}”. Try a kind (theme, guide), a board (journey, adr) or a part (chip, matrix).
      <button type="button" class="copy" style="justify-self:start" onClick=${() => set({ q: '', group: 'all' })}>Clear the search</button></div>` : ''}
    ${groups.map(([g, l]) => html`<div class="group" key=${g}>
      <div class="group-h"><span>${g}</span><span>${l.length}</span></div>
      ${l.map(e => html`<button type="button" key=${e.id} class="irow" aria-current=${s.sel === e.id ? 'true' : null} onClick=${() => open(e.id)}>
        <${Glyph} kind=${e.kind}/><span class="row-n"><${Hl} text=${e.name} q=${s.q}/></span><span class="row-v">${e.version}</span>
        <span class="row-s"><${Hl} text=${e.summary} q=${s.q}/></span></button>`)}
    </div>`)}
  </aside>`;
}

/* /part:catalog.index */
// ---------------------------------------------------------------- landing
/* part:catalog.howto */
function Howto() {
  const s = useS(), h = (window.ADP && window.ADP.content) ? window.ADP.content('catalog.howto') : '';
  const text = t => new DOMParser().parseFromString(t, 'text/html').documentElement.textContent.replace(/\{\{catalog\}\}/g, s.self.url || "this page's link");
  // a <pre><code> block in the copy becomes a Code block with its Copy button; the rest stays the copy's own HTML
  return html`<div class="howto" data-part="catalog.howto" data-comment-target>${h.split(/<pre><code>([\s\S]*?)<\/code><\/pre>/).map((x, i) =>
    i % 2 ? html`<${Code} text=${text(x)}/>` : html`<div style="display:contents" dangerouslySetInnerHTML=${{ __html: x }}></div>`)}</div>`;
}
/* /part:catalog.howto */
/* part:catalog.landing */
function Landing() {
  const s = useS();
  const k = Object.keys(KIND).map(x => [x, s.entries.filter(e => e.kind === x)]).filter(([, l]) => l.length);
  const fresh = s.added.map(e => byId(e.id)).filter(Boolean);      // the kits applied through the inbox that the catalog still holds, newest first
  return html`<section class="sheet" data-part="catalog.landing" data-comment-target aria-label="Catalog">
    <div class="land">
      <h2>Take a part instead of rebuilding it</h2>
      <div class="land-kinds">${k.map(([x, l]) => html`<button type="button" class="kcard" onClick=${() => open(l[0].id)}><b>${l.length}</b><span><${Glyph} kind=${x}/>${KIND[x]}${l.length > 1 ? 's' : ''}</span></button>`)}</div>
      <${Howto}/>
      ${fresh.length ? html`<div class="recent"><h3>New entries</h3>${fresh.map(e => html`<button type="button" class="irow" onClick=${() => open(e.id)}><${Glyph} kind=${e.kind}/><span class="row-n">${e.name}</span><span class="row-v">${e.version}</span><span class="row-s">${e.summary}</span></button>`)}</div>` : ''}
    </div>
  </section>`;
}

/* /part:catalog.landing */
// ---------------------------------------------------------------- the stage: theme and mode
const themeCache = {};
function themeOf(id) {
  const e = byId(id); if (!e) return Promise.resolve(null);
  const f = (e.files || []).find(x => x.path.endsWith('.json')); if (!f) return Promise.resolve(null);
  return themeCache[id] = themeCache[id] || fetch(f.path).then(r => r.ok ? r.json() : null).catch(() => null);
}
function pageDark() { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); }
function useDark(mode) {
  const [d, setD] = useState(pageDark());
  useEffect(() => {
    const f = () => setD(pageDark()); const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', f); const mo = new MutationObserver(f); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', f); mo.disconnect(); };
  }, []);
  return mode === 'dark' || (mode === 'page' && d);
}
const styleOf = (t, dark) => { if (!t) return ''; const m = Object.assign({}, t.light, dark ? t.dark : {}); return Object.entries(m).map(([k, v]) => k + ':' + v).join(';'); };

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  componentDidCatch(err) { this.setState({ err }); }
  render() { return this.state.err ? html`<div class="stage-err">The preview stopped: ${String(this.state.err && this.state.err.message || this.state.err)}</div>` : this.props.children; }
}

const loaded = {};
function loadFile(path) {
  if (loaded[path]) return loaded[path];
  let p;
  if (document.querySelector((path.endsWith('.css') ? 'link[href="' : 'script[src="') + path + '"]')) return loaded[path] = Promise.resolve();      // the page already loads it (the inbox's own files)
  if (path.endsWith('.css')) p = new Promise((res, rej) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = path; l.onload = res; l.onerror = () => rej(new Error('could not load ' + path)); document.head.append(l); });
  else if (path.endsWith('.js')) p = new Promise((res, rej) => { const s = document.createElement('script'); s.src = path; s.async = false; s.onload = res; s.onerror = () => rej(new Error('could not load ' + path)); document.head.append(s); });
  else p = fetch(path).then(r => { if (!r.ok) throw new Error(path + ': HTTP ' + r.status); return path.endsWith('.json') ? r.json() : r.text(); });
  loaded[path] = p; p.catch(() => { delete loaded[path]; });
  return p;
}
async function prepare(e) {
  const chain = closure(e).concat((e.preview && e.preview.uses || []).flatMap(u => closure(byId(u) || {})).filter(Boolean));
  for (const x of chain) for (const f of x.files || []) if (f.role === 'style' && f.path.endsWith('.css') && x.kind !== 'theme') await loadFile(f.path);
  for (const x of chain) for (const f of x.files || []) if (f.role === 'script' && x.id !== 'runtime.adp') await loadFile(f.path);
  for (const f of e.files || []) if (f.role === 'preview') await loadFile(f.path);      // a kit that brings its own preview (docs/kit-json.md)
  const samples = {};
  for (const p of (e.preview && e.preview.samples) || []) {
    const at = p.indexOf('#');
    if (at < 0) { samples[p] = await loadFile(p); continue; }
    // path#key: one sample out of a bundle (the bundle is fetched once). The previews read it as kit/samples/<key>.json, as before the bundles.
    const file = p.slice(0, at), key = p.slice(at + 1), bundle = await loadFile(file);
    if (!bundle || typeof bundle !== 'object' || !(key in bundle)) throw new Error(file + ' has no sample ' + key);
    samples['kit/samples/' + key + '.json'] = bundle[key];
  }
  return samples;
}

function Stage({ e }) {
  const s = useS();
  const [st, setSt] = useState({ loading: true });
  const [theme, setTheme] = useState(null);
  const own = e.kind === 'theme' ? e.id : null;
  const tid = own || s.theme;
  const dark = useDark(s.mode);
  const R = window.CatalogPreviews || {};
  const r = e.preview && R[e.preview.render];
  const plain = e.kind === 'guide' || e.kind === 'template' || e.id === 'runtime.adp';
  useEffect(() => { let off = false; setSt({ loading: true });
    prepare(e).then(samples => { if (!off) setSt({ samples }); }, err => { if (!off) setSt({ err: err.message || String(err) }); });
    return () => { off = true; }; }, [e.id, e.hash]);
  useEffect(() => { let off = false; themeOf(tid).then(t => { if (!off) setTheme(t); }); return () => { off = true; }; }, [tid, s.entries.length]);
  const themes = s.entries.filter(x => x.kind === 'theme');
  const body = st.err ? html`<div class="stage-err">The preview could not start: ${st.err}</div>`
    : st.loading ? html`<div class="stage-load">Loading ${(e.files || []).filter(f => f.role === 'script').map(f => f.path).join(', ') || 'the entry'}…</div>`
    : !r ? html`<div class="stage-load">This entry has no live preview yet. Its files and reference are in the other tabs.</div>`
    : html`<${Boundary} key=${e.id + tid + dark}><${r} e=${e} samples=${st.samples} theme=${theme} dark=${dark} entries=${s.entries}/><//>`;
  if (plain) return html`<div class="pv-plain">${body}</div>`;
  return html`<div class="pv-wrap" style="display:grid;gap:12px">
    <div class="stage-bar">
      <span class="lbl" id="lblTheme">Theme</span>
      <span class="c-seg" role="group" aria-labelledby="lblTheme">${own ? html`<button type="button" aria-pressed="true" disabled>${e.name}</button>`
        : themes.map(t => html`<button type="button" key=${t.id} aria-pressed=${tid === t.id} onClick=${() => { set({ theme: t.id }); ls.set('theme', t.id); }}>${t.name}</button>`)}</span>
      <span class="lbl" id="lblMode">Light or dark</span>
      <span class="c-seg" role="group" aria-labelledby="lblMode">${[['page', 'Like the page'], ['light', 'Light'], ['dark', 'Dark']].map(([m, l]) => html`<button type="button" key=${m} aria-pressed=${s.mode === m} onClick=${() => { set({ mode: m }); ls.set('mode', m); }}>${l}</button>`)}</span>
    </div>
    <div class="stage-wrap"><div class=${'stage' + (dark ? ' dark' : '')} style=${styleOf(theme, dark)} data-uncommentable><i class="crop" aria-hidden="true"></i>${theme || e.kind === 'theme' ? body : html`<div class="stage-load">Loading the theme…</div>`}</div></div>
    <p class="caption">${captionOf(e)}</p>
  </div>`;
}
function captionOf(e) {
  const scripts = (e.files || []).filter(f => f.role === 'script').map(f => f.path);
  const smp = (e.preview && e.preview.samples) || [];
  const real = smp.some(p => /samples\/viz-|#viz-/.test(p));
  if (e.kind === 'theme') return html`Drawn from <code>${(e.files.find(f => f.path.endsWith('.json')) || {}).path}</code>, with the kit’s own files on the Journey Whiteboard sample.`;
  return html`Running ${scripts.length ? scripts.map((p, i) => html`${i ? ', ' : ''}<code>${p}</code>`) : 'the entry'}${smp.length ? html` on ${smp.map((p, i) => html`${i ? ', ' : ''}<code>${p}</code>`)}` : ''}.${real ? ' The sample is real: the Journey Whiteboard’s own journey, as cached on 2026-10-20.' : ''} What you change here stays in this preview.`;
}

// ---------------------------------------------------------------- panels
/* part:entry.needs */
// does a theme define the token? `--c-<pen>` names a family: any property that fits the name with the placeholder filled
function defines(have, token) {
  if (!token.includes('<')) return token in have;
  const fit = new RegExp('^' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/<[^>]*>/g, '[A-Za-z0-9_-]+') + '$');
  return Object.keys(have).some(k => fit.test(k));
}
function Needs({ e }) {
  const n = e.needs || {}, dbn = n.db || {};
  const [fit, setFit] = useState(null);
  const themes = S.entries.filter(x => x.kind === 'theme');
  useEffect(() => { let off = false; Promise.all(themes.map(t => themeOf(t.id).then(j => [t, j]))).then(l => { if (!off) setFit(l); }); return () => { off = true; }; }, [e.id]);
  const req = closure(e).filter(x => x.id !== e.id);
  return html`<div class="panel" data-part="entry.needs" data-part-key=${e.id} data-comment-target role="tabpanel" aria-label="What it needs">
    ${(n.config || []).length ? html`<h3>Configuration the board passes</h3>
      <dl class="dl">${n.config.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v || ''}</dd></div>`)}</dl>` : html`<p class="about">Nothing to configure.</p>`}
    <h3>Database</h3>
    <dl class="dl">
      <div><dt>reads</dt><dd>${(dbn.reads || []).length ? html`<span class="chips">${dbn.reads.map(x => html`<code class="tok">${x}</code>`)}</span>` : 'nothing of its own'}</dd></div>
      <div><dt>writes</dt><dd>${(dbn.writes || []).length ? html`<span class="chips">${dbn.writes.map(x => html`<code class="tok">${x}</code>`)}</span>` : 'nothing of its own'}</dd></div>
      ${dbn.note ? html`<div><dt>note</dt><dd>${dbn.note}</dd></div>` : ''}
    </dl>
    ${(req.length || (e.globals || []).length) ? html`<h3>Loads first</h3>
      <dl class="dl">${req.map(x => html`<div><dt><a href=${'#' + x.id}>${x.id}</a></dt><dd>${x.name}: ${(x.files || []).filter(f => f.role === 'script' || f.role === 'style').map(f => f.path).join(', ')}</dd></div>`)}
        ${(e.globals || []).map(g => html`<div><dt>${g}</dt><dd>${(CDN[g] || {}).label || g}, from the CDN</dd></div>`)}</dl>` : ''}
    ${(n.tokens || []).length ? html`<h3>Theme tokens it reads</h3>
      <div class="chips">${n.tokens.map(t => html`<code class="tok">${t}</code>`)}</div>
      <div class="fit">${!fit ? html`<span class="c-faint">Checking the themes…</span>` : fit.map(([t, j]) => { const have = j ? Object.assign({}, j.light) : {};
        const miss = n.tokens.filter(x => !x.endsWith('?') && !defines(have, x));      // `--x?` is optional
        return html`<span>${t.name}: ${miss.length ? html`<span class="no">missing ${miss.join(', ')}</span>` : html`<span class="ok">defines all of them</span>`}</span>`; })}</div>` : ''}
  </div>`;
}

/* /part:entry.needs */
/* part:entry.take */
function takeFiles(e, withReq) {
  const chain = withReq ? closure(e) : [e];
  const out = [];
  for (const x of chain) for (const f of x.files || []) {
    if (x.id !== e.id && f.role === 'sample') continue;
    if (f.role === 'template' || f.role === 'preview') continue;
    out.push({ entry: x, f });
  }
  return out;
}
function takeRef(e, withReq, s) {
  const url = s.self.url || '<catalog url>'; const ref = {};
  const sites = /^https:\/\/[^/]+\.chatgpt\.site\/?$/.test(url);
  for (const { f } of takeFiles(e, withReq)) {
    if (sites) ref[f.path] = {url: url.replace(/\/$/, '') + '/' + f.path, sha256: f.sha256};
    else { const r = {artifact: url, path: f.path}; const v = f.ver || s.self.ver; if (v) r.ver = v; ref[f.path] = r; }
  }
  return JSON.stringify(ref, null, 2);
}
function Take({ e }) {
  const s = useS();
  const [withReq, setWithReq] = useState(true);
  const list = takeFiles(e, withReq);
  const tmpl = e.kind === 'template';
  const refText = takeRef(e, withReq, s);
  const sites = /^https:\/\/[^/]+\.chatgpt\.site\/?$/.test(s.self.url || '');
  const glob = [...new Set(closure(e).flatMap(x => x.globals || []))].map(g => (CDN[g] || {}).tag).filter(Boolean);
  const load = glob.concat(list.filter(x => x.f.role === 'style').map(x => `<link rel="stylesheet" href="${x.f.path}">`), list.filter(x => x.f.role === 'script').map(x => `<script src="${x.f.path}"></script>`)).join('\n');
  const reqd = closure(e).filter(x => x.id !== e.id);
  const [text, setText] = useState(null);
  const shell = (e.files || []).find(f => f.role === 'template') || (e.files || [])[0];
  useEffect(() => { if (!tmpl || !shell) return; let off = false; loadFile(shell.path).then(t => { if (!off) setText(t); }, () => {}); return () => { off = true; }; }, [e.id]);
  return html`<div class="panel" data-part="entry.take" data-part-key=${e.id} data-comment-target role="tabpanel" aria-label="Take it">
    ${!s.self.url ? html`<p class="note">The catalog’s own link and version come from its database. Open the catalog signed in to see them filled in; until then the reference shows <code>${'<catalog url>'}</code>.</p>` : ''}
    ${sites ? html`<ol class="steps">
      <li><h4>Read from Sites, then publish on the destination host</h4><p>Give your agent this catalog URL and entry ID. Private catalogs require an authorized Sites session. These are HTTPS source URLs and hashes, not Claude Artifact references.</p>
        <${Code} text=${`python3 -I skill/scripts/adp.py catalog ${s.self.url}\npython3 -I skill/scripts/adp.py take ${s.self.url} ${e.id}\npython3 -I skill/scripts/adp.py take ${s.self.url} ${e.id} --materialize ./taken`} label="agent commands"/>
        <p>The offline shell prints the reads to execute. Save the exact response bytes at its specified paths, then rerun take. It verifies every selected file against the catalog SHA-256 before copying; missing or changed files stop the operation.</p>
        <${Code} text=${refText} label="authenticated source reads"/></li>
      <li><h4>Publish the verified files</h4><p>Merge the copied files into your artifact, then use its host’s native publication tool. Load dependencies first and compare destination file hashes with this catalog.</p><${Code} text=${load || '(read as data)'} label="tags"/></li>
      ${tmpl ? html`<li><h4>Use the template text</h4><p>Save this as index.html and adapt its content.</p>${text != null ? html`<${Code} text=${text} label=${shell.path}/>` : 'Loading…'}</li>` : ''}
    </ol>` : tmpl ? html`<ol class="steps">
      <li><h4>Copy the template’s text</h4><p>A page cannot be copied between artifacts server-side, so this template is taken as text. Save it as your artifact’s <code>index.html</code>: it already holds the tags that load what it needs. Then make its title and content your own.</p>${text != null ? html`<${Code} text=${text} label=${shell.path}/>` : html`<p class="c-faint">Loading the text…</p>`}</li>
      ${list.length ? html`<li><h4>Add the files it loads to your artifact’s publish</h4>
        <p>Put this map in the <code>files</code> of the same publish. The server copies each file from this catalog at the pinned version.</p>
        ${reqd.length ? html`<label class="check" for="withReq"><input id="withReq" type="checkbox" checked=${withReq} onChange=${ev => setWithReq(ev.target.checked)}/> Include the entries it is built from (${reqd.map(x => x.name).join(', ')})</label>` : ''}
        <${Code} text=${refText} label="files map"/></li>` : ''}
    </ol>` : html`<ol class="steps">
      <li><h4>Add the files to your artifact’s publish</h4>
        <p>Put this map in the <code>files</code> of an Artifact publish. The server copies each file from this catalog at the pinned version, so nothing is downloaded or pasted.</p>
        ${reqd.length ? html`<label class="check" for="withReq"><input id="withReq" type="checkbox" checked=${withReq} onChange=${ev => setWithReq(ev.target.checked)}/> Include what it loads first (${reqd.map(x => x.name).join(', ')})</label>` : ''}
        <${Code} text=${refText} label="files map"/></li>
      <li><h4>Load them in this order</h4><p>Put these tags in your page, before your own scripts.</p><${Code} text=${load || '(nothing to load: the file is read as data)'} label="tags"/></li>
      <li><h4>Check the copy</h4><p>Read each file back from your artifact (Artifact read with its path). Its sha256 must match the one under Files here; the catalog shows <code>${short(e.hash)}</code> for the entry as a whole.</p></li>
    </ol>`}
    <h3>For programs</h3>
    ${sites ? html`<p>Read <code>catalog.json</code> over authenticated HTTPS for entries and source hashes. Native Sites records use the catalog namespace and destination revision guards.</p>` : html`<dl class="dl">
      <div><dt>this entry as data</dt><dd>ArtifactData get <code>entries/${e.id}</code> on ${s.self.url || 'the catalog'}</dd></div>
      <div><dt>every entry</dt><dd>ArtifactData list <code>entries</code>, or Artifact read path <code>catalog.json</code> (the snapshot published with the page)</dd></div>
      <div><dt>add an entry</dt><dd>one ArtifactData set of <code>entries/&lt;id&gt;</code>: the page shows it live, with no republish</dd></div>
    </dl>`}
  </div>`;
}

/* /part:entry.take */
/* part:entry.files */
async function sha256(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const checked = {};
function Files({ e }) {
  const [res, setRes] = useState({});
  const [show, setShow] = useState(null);
  const [txt, setTxt] = useState({});
  useEffect(() => { let off = false;
    (e.files || []).forEach(f => {
      const k = f.path + '@' + f.sha256;
      (checked[k] = checked[k] || fetch(f.path, { cache: 'no-store' }).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(b => crypto.subtle.digest('SHA-256', b)).then(d => [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('')))
        .then(h => { if (!off) setRes(r => Object.assign({}, r, { [f.path]: h })); }, err => { if (!off) setRes(r => Object.assign({}, r, { [f.path]: 'error: ' + err.message })); });
    });
    return () => { off = true; }; }, [e.id, e.hash]);
  const view = p => { setShow(show === p ? null : p); if (!txt[p]) fetch(p).then(r => r.text()).then(t => setTxt(x => Object.assign({}, x, { [p]: t }))); };
  return html`<div class="panel" data-part="entry.files" data-part-key=${e.id} data-comment-target role="tabpanel" aria-label="Files">
    <p class="about">Each file at its published path in this catalog. The sha256 recorded in the entry is checked here against the file the catalog serves now.</p>
    <div class="files-wrap"><table class="files">
      <thead><tr><th>Path</th><th class="hide-sm">Role</th><th class="hide-sm">Size</th><th>sha256</th><th>In this browser</th><th><span class="sr">Actions</span></th></tr></thead>
      <tbody>${(e.files || []).map(f => { const h = res[f.path]; const ok = h && h === f.sha256;
        return html`<tr key=${f.path}><td class="mono">${f.path}</td><td class="hide-sm">${f.role}</td><td class="hide-sm mono">${f.bytes != null ? kb(f.bytes) : ''}</td>
          <td class="mono" title=${f.sha256 || ''}>${short(f.sha256) || '–'}</td>
          <td class="mono">${!h ? html`<span class="c-faint">checking</span>` : ok ? html`<span style="color:var(--cat-ok)">matches</span>` : html`<span style="color:var(--cat-bad)" title=${h}>${h.startsWith('error') ? h : 'differs: ' + short(h)}</span>`}</td>
          <td><span class="act"><${Copy} text=${f.sha256 || ''} label="Copy sha"/><button type="button" class="copy" aria-expanded=${show === f.path} onClick=${() => view(f.path)}>${show === f.path ? 'Hide text' : 'Show text'}</button></span></td></tr>`; })}</tbody>
    </table></div>
    ${show ? html`${txt[show] == null ? html`<p class="c-faint">Loading ${show}…</p>` : html`<${Code} text=${txt[show]} label=${show}/>`}` : ''}
  </div>`;
}

/* /part:entry.files */
/* part:entry.origin */
function Origin({ e }) {
  return html`<div class="panel" data-part="entry.origin" data-part-key=${e.id} data-comment-target role="tabpanel" aria-label="Origin">
    <h3>Where it came from</h3>
    <ul class="src">${(e.source || []).map(x => html`<li><b>${x.board}</b> · <code>${x.file}</code>${x.what ? ': ' + x.what : ''}</li>`)}</ul>
    ${(e.changed || []).length ? html`<h3>What changed on the way</h3><ul class="changed">${e.changed.map(c => html`<li>${c}</li>`)}</ul>` : ''}
    <dl class="dl">
      <div><dt>version</dt><dd>${e.version}</dd></div>
      <div><dt>content hash</dt><dd><code>${e.hash || '–'}</code>: sha256 over the sorted <code>path=sha256</code> lines of its files</dd></div>
      ${e.updated ? html`<div><dt>updated</dt><dd>${e.updated}</dd></div>` : ''}
    </dl>
  </div>`;
}

/* /part:entry.origin */
/* part:entry.preview */
function PreviewPanel({ e }) {
  return html`<div class="panel" data-part="entry.preview" data-part-key=${e.id} data-comment-target role="tabpanel" aria-labelledby="st-preview">
    <${Stage} e=${e}/><p class="about">${e.about}</p></div>`;
}
/* /part:entry.preview */
/* part:entry.sheet */
function Sheet({ e }) {
  const s = useS();
  const full = useFull(e), fe = full.e;
  const bytes = (e.files || []).reduce((a, f) => a + (f.bytes || 0), 0);
  const tab = TABS.some(([t]) => t === s.tab) ? s.tab : 'preview';
  const tabKey = ev => { const i = TABS.findIndex(([t]) => t === tab); const d = { ArrowRight: 1, ArrowLeft: -1 }[ev.key]; if (!d) return; ev.preventDefault();
    const n = TABS[(i + d + TABS.length) % TABS.length][0]; set({ tab: n }); requestAnimationFrame(() => { const b = document.getElementById('st-' + n); b && b.focus(); }); };
  return html`<section class="sheet" data-part="entry.sheet" data-part-key=${e.id} data-comment-target aria-labelledby="sheetName">
    <div class="sheet-h">
      <button type="button" class="back" onClick=${() => open(null)}>← All entries</button>
      <div class="kindline"><${Glyph} kind=${e.kind}/><span>${KIND[e.kind]} · ${e.group}</span><span class=${'pill ' + (e.status || '')}>${e.status === 'new' ? 'new' : e.status || ''}</span></div>
      <h2 id="sheetName" tabindex="-1">${e.name}</h2>
      <p class="sum">${e.summary}</p>
      <div class="quick">${e.kind === 'template' ? '' : html`<${Copy} text=${takeRef(e, true, s)} label="Copy the files map" cls="pri" onFail=${() => set({ tab: 'take' })}/>`}
        <button type="button" class="quick-link" onClick=${() => { set({ tab: 'take' }); requestAnimationFrame(() => { const b = document.getElementById('st-take'); b && b.focus(); }); }}>${e.kind === 'template' ? 'How to take the shell' : 'How taking works'} →</button></div>
      <dl class="c-meta">
        <div><dt>Version</dt><dd>${e.version}</dd></div>
        <div><dt>Content hash</dt><dd title=${e.hash || ''}>${short(e.hash) || '–'}</dd></div>
        <div><dt>Files</dt><dd>${(e.files || []).length} · ${kb(bytes)}</dd></div>
        <div><dt>From</dt><dd>${!fe ? '…' : (fe.source || []).map(x => x.board).filter((x, i, a) => a.indexOf(x) === i).join(', ') || '–'}</dd></div>
      </dl>
    </div>
    <div class="stabs" role="tablist" aria-label="About this entry" onKeyDown=${tabKey}>${TABS.map(([t, l]) => html`<button type="button" class="stab" role="tab" id=${'st-' + t} aria-selected=${tab === t} tabindex=${tab === t ? 0 : -1} onClick=${() => set({ tab: t })}>${l}</button>`)}</div>
    ${full.err ? html`<p class="note">The header of <code>${F.main(e) || 'the main file'}</code> could not be read (${full.err}), so the description, the needs, the origin and the preview of this entry are missing here.</p>` : ''}
    ${tab === 'take' ? html`<${Take} e=${e} key=${e.id}/>` : tab === 'files' ? html`<${Files} e=${e} key=${e.id}/>`
      : !fe ? html`<div class="panel" data-part=${'entry.' + tab} data-part-key=${e.id} role="tabpanel" aria-busy="true"><div class="stage-load">Reading the header of ${F.main(e)}…</div></div>`
      : tab === 'preview' ? html`<${PreviewPanel} e=${fe} key=${e.id}/>`
      : tab === 'needs' ? html`<${Needs} e=${fe} key=${e.id}/>` : html`<${Origin} e=${fe}/>`}
  </section>`;
}

/* /part:entry.sheet */
function App() {
  const s = useS();
  const e = s.sel ? byId(s.sel) : null;
  useEffect(() => { document.title = e ? e.name + ' · Artifact Kit Catalog' : 'Artifact Kit Catalog'; }, [e && e.id]);
  return html`<div class=${'shell' + (e ? ' has-entry' : '')}>
    <${Index}/>
    ${e ? html`<${Sheet} e=${e} key=${e.id}/>` : s.sel && s.src !== 'loading' ? html`<section class="sheet" data-part="catalog.landing" data-comment-target><div class="land"><h2>No entry called “${s.sel}”</h2>
        <p class="c-muted">It may have been renamed or not added yet. Search for it, or <a href="#" onClick=${ev => { ev.preventDefault(); open(null); }}>go back to the catalog</a>.</p></div></section>`
      : html`<${Landing}/>`}
  </div>`;
}

// ---------------------------------------------------------------- mount
const lead = $('[data-part="catalog.lead"]'); if (lead && window.ADP) lead.innerHTML = window.ADP.content('catalog.lead');
render(html`<${App}/>`, $('#app'));
render(html`<${Tabs}/>`, $('#tabs'));
render(html`<${Meta}/>`, $('#topMeta'));

const PARTS = ['page.header', 'page.tabs', 'page.changes', 'catalog.incoming', 'catalog.lead', 'catalog.index', 'catalog.landing', 'catalog.howto', 'entry.sheet', 'entry.preview', 'entry.needs', 'entry.take', 'entry.files', 'entry.origin'];
const TITLES = { 'page.header': 'Header', 'page.tabs': 'Kinds of entry', 'page.changes': 'What changed', 'catalog.incoming': 'Incoming', 'catalog.lead': 'Catalog description', 'catalog.index': 'Entry index and search',
  'catalog.landing': 'Catalog landing', 'catalog.howto': 'How taking works', 'entry.sheet': 'Entry sheet', 'entry.preview': 'Preview', 'entry.needs': 'What it needs', 'entry.take': 'Take it', 'entry.files': 'Files', 'entry.origin': 'Origin' };
if (window.ADP) window.ADP.page({
  view: () => S.sel && byId(S.sel) ? 'entry.' + S.tab : 'landing',
  expected: v => v === 'landing' ? ['catalog.lead', 'catalog.index', 'catalog.landing'] : ['catalog.lead', 'catalog.index', 'entry.sheet', v],
  titles: TITLES, legacy: {}, all: PARTS,
  reveal: (id, key) => {
    if (key && byId(key) && S.sel !== key) open(key);
    if (id === 'catalog.landing' || id === 'catalog.howto') { if (!key) open(null); }
    else if (id.startsWith('entry.') && id !== 'entry.sheet') set({ tab: id.slice(6) });
    return new Promise(r => setTimeout(r, 160));
  },
});
window.KitCatalog = Object.freeze({ get entries() { return S.entries.slice(); }, get source() { return S.src; }, open, find: q => S.entries.filter(e => score(e, terms(q)) > 0).map(e => e.id) });
})();
/* /part:page.script.catalog */
