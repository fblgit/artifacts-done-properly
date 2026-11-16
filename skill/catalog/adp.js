/**
 * ADP runtime
 * The adp/2 page runtime. Load it before the page's own scripts, then call ADP.page({view, expected, titles, legacy, all, reveal}) once the views exist. It paints content/<part id> docs live, lists changes/ and active decisions/ in the What changed panel, shows proposals in incoming/, anchors comments to [data-part] elements, hashes the page's parts at open and compares them with manifest/current (integrity), and writes checks/latest when the viewer can edit. It also carries ADP.config (switches in the db doc config/current), ADP.user, ADP.db and ADP.ns(name), and expands the seed packs published beside the page on first open.
 *
 * --accent is the comment highlight.
 *
 * @id        runtime.adp
 * @kind      component
 * @group     Runtime
 * @status    stable
 * @version   2.1.0
 * @updated   2026-11-16
 * @summary   The adp/2 page runtime: the What changed panel, content as data, part-id comment anchors, page integrity, settings (ADP.config), the viewer (ADP.user), namespaced data (ADP.ns), seeding on first open and the page self-check.
 * @tags      adp, dataplane, runtime, comments, anchors, content, self-check, what changed, config, integrity, seed
 * @requires  none
 * @files     none
 * @provides  window.ADP.host, window.ADP.page, window.ADP.content, window.ADP.config, window.ADP.user, window.ADP.ns, window.ADP.classify, window.ADP.hash, window.ADP.build, window.ADP.integrity, window.ADP.seeded, window.ADP.db, window.ADP_CHECK, window.ADP_SEED
 * @config    <meta name="adp:build"> | the build number, before the script
 * @config    window.ADP_CONTENT | content.js: the baseline copy of the parts
 * @config    page.header, page.tabs, page.changes | parts the page must render; #wc, #wcN, #wcChanges, #wcDecisions for the panel
 * @config    ADP.page(cfg) | {view(), expected(view), titles, legacy, all, reveal(id, key)}
 * @tokens    --accent? --accent-soft? --f-ui? --ink? --ink-3? --panel? --rule? --sunk? --warn?
 * @globals   none
 * @db        reads content; changes; decisions; incoming; manifest/current; config/current / writes status/integrity (attempted for any viewer with a db: it lands only where the db rules allow); checks/latest (editors only); config/current and a changes/d-<time> record when a setting is saved; the seed docs on first open
 * @source    this repository | skill/assets/adp.js | the same bytes
 * @preview   {"render": "runtime.adp", "samples": []}
 * @changed   Adds an explicit host connection boundary while preserving the legacy Claude default.
 */
(function(){
'use strict';
const meta = document.querySelector('meta[name="adp:build"]');
const BUILD = meta ? meta.content : '';
const ID = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const live = {}, errors = [], stats = {anchors: 'not started', threads: 0, placed: 0, unknown: []};
const user = {canEdit: false, id: ''};
/* Host connection is a capability boundary, not a persistence/authorization guarantee.
   Explicit providers never fall back to another host on error. See docs/host-adapters.md. */
let host = Object.freeze({protocol: 'adp-host/1', id: '', status: 'connecting'}), hostComments = null;
async function connectHost(){
  const explicit = Object.prototype.hasOwnProperty.call(window, 'ADP_HOST');
  let connection;
  if (explicit) {
    const provider = window.ADP_HOST;
    if (!provider || provider.protocol !== 'adp-host/1' || typeof provider.connect !== 'function') throw new Error('Invalid ADP_HOST provider');
    connection = await provider.connect();
  } else if (window.claude && typeof window.claude.use === 'function') {
    const use = name => Promise.resolve().then(() => window.claude.use(name)).catch(() => null);
    const comments = use('comments');
    const [db, user] = await Promise.all(['db', 'user'].map(use));
    connection = {id: 'claude', db, user, legacyComments: comments, seedFiles: true};
  } else return {id: 'static'};
  if (!connection || typeof connection.id !== 'string' || !connection.id.trim()) throw new Error('Host connection needs an id');
  if (connection.db && (typeof connection.db.doc !== 'function' || typeof connection.db.collection !== 'function')) throw new Error('Host database needs the document-store profile');
  if (connection.user && (typeof connection.user.canEdit !== 'function' || typeof connection.user.id !== 'function')) throw new Error('Invalid host user capability');
  return connection;
}
let PAGE = null, db = null, canEdit = false, probe = '', ctl = null, cmode = false, list = [], hlEl = null;

/* ---------- pure: the part hash (adp.py manifest's rule) and the classification (architecture.md, contracts 4 and 6) ---------- */
const MARK = /(?:<!--|\/\*)\s*(\/?)part:([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)\s*(?:-->|\*\/)/g, REST = '_rest';
const norm = s => s.replace(/\s+/g, ' ').trim();
async function H(s){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }
function markers(text){
  const stack = [], parts = {}, bad = [];
  for (const m of text.matchAll(MARK)) {
    const close = m[1] === '/', pid = m[2], end = m.index + m[0].length;
    if (!close) { if (parts[pid] || stack.some(x => x[0] === pid)) bad.push('part ' + pid + ' opened twice'); stack.push([pid, end]); }
    else if (!stack.length || stack[stack.length - 1][0] !== pid) bad.push('/part:' + pid + ' closes ' + (stack.length ? stack[stack.length - 1][0] : 'nothing'));
    else { const [, start] = stack.pop(); parts[pid] = [start, m.index, stack.length ? stack[stack.length - 1][0] : '']; }
  }
  stack.forEach(x => bad.push('part ' + x[0] + ' never closed'));
  return {parts, bad};
}
function restOf(text, parts){
  let out = '', i = 0;
  Object.values(parts).filter(p => p[2] === '').map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0]).forEach(([cs, ce]) => { out += text.slice(i, cs); i = ce; });
  return (out + text.slice(i)).replace(MARK, '');
}
/* text -> {parts: {id: hash12}, parents, page_hash, bad}; files {path: sha12} join page_hash when known */
async function hashText(text, files){
  const {parts, bad} = markers(text), hp = {};
  for (const id of Object.keys(parts)) hp[id] = await H(norm(text.slice(parts[id][0], parts[id][1])));
  hp[REST] = await H(norm(restOf(text, parts)));
  const lines = Object.keys(hp).map(k => k + '=' + hp[k]).sort().concat(Object.keys(files || {}).map(k => 'file:' + k + '=' + files[k]).sort());
  const parents = {}; Object.keys(parts).forEach(k => { parents[k] = parts[k][2]; });
  return {parts: hp, parents, page_hash: await H(lines.join('\n')), bad};
}
/* three manifests {parts, files, parents?, requires?, retired?} -> {new, ours, theirs, applied, held, retired} */
function classify(base, live, inc){
  const flat = m => Object.assign({}, m && m.parts, m && m.files);
  const B = flat(base), L = flat(live), I = flat(inc), retiredOk = (inc && inc.retired) || {};
  const out = {new: [], ours: [], theirs: [], applied: [], held: [], retired: []}, cls = {};
  const ids = [...new Set([...Object.keys(B), ...Object.keys(L), ...Object.keys(I)])].sort();
  const v = (m, x) => x in m ? m[x] : null;
  ids.forEach(x => {
    const b = v(B, x), l = v(L, x), i = v(I, x);
    if (b === null) cls[x] = l === null ? (i === null ? null : 'new') : i === null ? 'theirs' : i === l ? 'applied' : 'held';
    else if (i === null) cls[x] = l === null ? 'applied' : (Array.isArray(retiredOk) ? retiredOk.includes(x) : x in retiredOk) ? 'retired' : 'held';
    else if (l === b) cls[x] = i === b ? null : 'ours';
    else cls[x] = i === b ? 'theirs' : i === l ? 'applied' : 'held';
  });
  const near = {}, link = (a, b) => { if (a && b && a !== b) { (near[a] = near[a] || new Set()).add(b); (near[b] = near[b] || new Set()).add(a); } };
  [base, live, inc].forEach(m => {
    Object.entries((m && m.parents) || {}).forEach(([k, p]) => link(k, p));
  });
  const req = Object.assign({}, base && base.requires, live && live.requires, inc && inc.requires);
  Object.entries(req).forEach(([comp, fs]) => (fs || []).forEach(f => ids.forEach(y => { if (y === comp || y.startsWith(comp + '.')) link(f, y); })));
  const merges = new Set(['new', 'ours', 'retired']);
  for (let again = true; again;) {
    again = false;
    ids.forEach(x => { if (merges.has(cls[x]) && [...(near[x] || [])].some(y => cls[y] === 'held')) { cls[x] = 'held'; again = true; } });
  }
  ids.forEach(x => { const c = cls[x]; if (!c) return; if (c === 'held') out.held.push({id: x, base: v(B, x), live: v(L, x), incoming: v(I, x)}); else out[c].push(x); });
  return out;
}
/* ---------- /pure ---------- */

/* ---------- errors: script errors, failed loads, rejections ---------- */
const pushErr = m => { m = String(m).slice(0, 300); if (errors.length < 20 && !errors.includes(m)) { errors.push(m); later(); } };
addEventListener('error', e => {
  const t = e.target;
  if (t && t !== window && (t.src || t.href)) pushErr('load failed: ' + String(t.src || t.href).split('/').slice(-2).join('/'));
  else pushErr((e.message || 'error') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''));
}, true);
addEventListener('unhandledrejection', e => { const r = e.reason; pushErr('unhandled: ' + (r && (r.code || r.message) || r)); });

/* ---------- content as data: content.js is the baseline, db content/<part id> overrides it live ---------- */
const base = () => window.ADP_CONTENT || {};
function content(id){
  const d = live[id] || base()[id];
  if (!d || typeof d.html !== 'string') { pushErr('content missing: ' + id); return ''; }
  return d.html;
}
const when = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); };
const sel = id => '[data-part="' + id + '"]';
function paint(id){ const h = content(id); document.querySelectorAll(sel(id)).forEach(el => { if (el.innerHTML !== h) el.innerHTML = h; }); }
function watchContent(){
  db.collection('content').onSnapshot(snap => {
    const touched = [];
    snap.docChanges().forEach(c => {
      const id = c.doc.id, v = c.type === 'removed' ? null : c.doc.data();
      if (!ID.test(id)) return;
      if (v && typeof v.html === 'string') live[id] = v; else delete live[id];
      touched.push(id);
    });
    touched.forEach(paint);
  }, e => pushErr('content snapshot: ' + (e && e.code)));
}

/* ---------- what changed: latest changes/ and active decisions/ ---------- */
function changesPanel(){
  const el = document.getElementById('wc'); if (!el) return;
  el.hidden = hideChanges();
  const $ = id => document.getElementById(id);
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = String(txt); return n; };
  const note = (box, t) => box.replaceChildren(mk('li', 'wc-empty', t));
  const partsOf = a => { const w = mk('div', 'wc-parts'); (Array.isArray(a) ? a : []).slice(0, 12).forEach(x => { const id = typeof x === 'string' ? x : (x && x.id); if (id) w.append(mk('code', '', id)); }); return w.childNodes.length ? w : null; };
  note($('wcChanges'), 'Loading…'); note($('wcDecisions'), 'Loading…');
  try {
    db.collection('changes').orderBy('at', 'desc').limit(10).onSnapshot(snap => {
      const docs = snap.docs.filter(d => d.exists), box = $('wcChanges');
      $('wcN').textContent = docs.length ? String(docs.length) : '';
      if (!docs.length) return note(box, 'Nothing recorded yet.');
      box.replaceChildren(...docs.map(d => { const c = d.data() || {}, li = mk('li'), h = mk('div', 'wc-h');
        h.append(mk('b', '', c.version ? 'Version ' + c.version : Array.isArray(c.parts) && !c.parts.length ? 'Data change' : d.id), mk('span', '', [when(c.at), c.by].filter(Boolean).join(' · ')));
        li.append(h, mk('p', '', c.summary || '')); const p = partsOf(c.parts); if (p) li.append(p); return li; }));
    }, () => note($('wcChanges'), 'Changes could not be read.'));
    db.collection('decisions').where('status', '==', 'active').onSnapshot(snap => {
      const docs = snap.docs.filter(d => d.exists), box = $('wcDecisions');
      if (!docs.length) return note(box, 'None recorded yet.');
      box.replaceChildren(...docs.map(d => { const c = d.data() || {}, li = mk('li');
        li.append(mk('blockquote', '', c.quote || d.id), mk('div', 'wc-h', when(c.at))); const p = partsOf(c.parts); if (p) li.append(p); return li; }));
    }, () => note($('wcDecisions'), 'Decisions could not be read.'));
    /* Incoming: proposals in incoming/ (docs/assist.md, contract 5); merged means recorded in the db, files not yet published */
    if (!$('wcIncoming')) { const b = el.querySelector('.wc-body') || el, s = mk('section'); s.append(mk('h3', '', 'Incoming'), Object.assign(mk('ol', 'wc-list'), {id: 'wcIncoming'})); b.prepend(s); }
    note($('wcIncoming'), 'Loading…');
    db.collection('incoming').onSnapshot(snap => {
      const docs = snap.docs.filter(d => d.exists).map(d => Object.assign({pid: d.id}, d.data())).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 10), box = $('wcIncoming');
      if (!docs.length) return note(box, 'Nothing proposed.');
      const say = {new: 'arrived', merged: 'merged, not yet published', held: 'held', applied: 'applied', declined: 'declined'};
      box.replaceChildren(...docs.map(c => { const li = mk('li'), h = mk('div', 'wc-h'), st = c.status || 'new';
        h.append(mk('b', '', say[st] || st), mk('span', '', [when(c.at), c.by].filter(Boolean).join(' · ')));
        li.append(h, mk('p', '', (c.summary || c.pid) + (st === 'held' && c.classified ? ': held on ' + (c.classified.held || []).map(x => x.id).join(', ') : st === 'declined' && c.decided ? ': ' + (c.decided.reason || '') : '')));
        const p = partsOf((c.parts || []).map(x => x.id)); if (p) li.append(p); return li; }));
    }, () => note($('wcIncoming'), 'Incoming could not be read.'));
  } catch (e) { el.hidden = true; }
}

/* ---------- comment anchors are part ids: "<id>" or "<id>:<data-part-key>" ---------- */
const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
function parse(a){
  const leg = PAGE && PAGE.legacy ? (PAGE.legacy[a] || Object.keys(PAGE.legacy).filter(k => a.startsWith(k)).map(k => PAGE.legacy[k])[0]) : null;
  const s = leg || a, i = s.indexOf(':'), pid = i < 0 ? s : s.slice(0, i), key = i < 0 ? '' : s.slice(i + 1);
  return ID.test(pid) ? {pid, key, legacy: !!leg} : null;
}
function resolve(a){
  const p = parse(a); if (!p) return null;
  const els = [...document.querySelectorAll(sel(p.pid))].filter(visible);
  return (p.key && els.find(e => e.dataset.partKey === p.key)) || els[0] || null;
}
function place(){
  if (!ctl) return;
  const m = {}, unknown = [];
  list.forEach(t => {
    const el = resolve(t.anchor);
    if (el) { const r = el.getBoundingClientRect(); m[t.id] = {x: Math.round(Math.max(r.left + 12, r.right - 16) + scrollX), y: Math.round(r.top + 14 + scrollY)}; }
    else if (!parse(t.anchor)) unknown.push(t.anchor.slice(0, 160));
  });
  try { ctl.placed(m); } catch (e) {}
  if (list.length) { stats.threads = list.length; stats.placed = Object.keys(m).length; stats.unknown = unknown.slice(0, 8); }
}
const target = n => { const el = n && n.closest ? n.closest('[data-part]') : null; return el && !el.closest('[data-uncommentable]') ? el : null; };
const anchorOf = el => el.dataset.part + (el.dataset.partKey ? ':' + el.dataset.partKey : '');
function label(el){
  const t = PAGE && PAGE.titles ? PAGE.titles[el.dataset.part] : '';
  const s = ((t || el.getAttribute('aria-label') || el.dataset.part) + (el.dataset.partKey ? ', ' + el.dataset.partKey : '')).slice(0, 120);
  return partLocked(el.dataset.part) ? '\u{1F512} locked: ' + s : s;
}
function hl(el){ if (hlEl === el) return; if (hlEl) hlEl.classList.remove('adp-hl'); hlEl = el; if (el) el.classList.add('adp-hl'); }
const swallow = e => { if (!e.isTrusted || !cmode || !ctl || !target(e.target)) return; e.preventDefault(); e.stopPropagation(); };
async function anchors(){
  const cm = hostComments;
  if (!cm || typeof cm.customAnchors !== 'function') { stats.anchors = 'comments unavailable'; return later(); }
  const st = document.createElement('style');
  st.textContent = '.adp-cmode [data-part]{cursor:crosshair}.adp-hl{outline:2px solid var(--accent,#9A5406)!important;outline-offset:-2px}';
  document.head.append(st);
  try {
    ctl = await cm.customAnchors({
      mode: on => { cmode = on; document.documentElement.classList.toggle('adp-cmode', on); if (!on) { list = []; hl(null); } },
      threads: l => { list = Array.isArray(l) ? l : []; place(); later(); },
      reveal: id => { reveal(id); },
      composing: () => {}
    });
  } catch (e) { stats.anchors = 'not registered: ' + (e && e.code || e); return later(); }
  stats.anchors = 'registered';
  ['pointerdown', 'mousedown', 'mouseup', 'dragstart'].forEach(t => document.addEventListener(t, swallow, true));
  document.addEventListener('click', e => {
    if (!cmode || !e.isTrusted) return; const el = target(e.target); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    ctl.compose(anchorOf(el), el, {label: label(el)}).catch(err => pushErr('compose: ' + (err && err.code)));
  }, true);
  document.addEventListener('pointermove', e => { if (cmode) hl(target(e.target)); }, true);
  place(); later();
}
async function reveal(h){
  const t = list.find(x => x.id === h); if (!t) return;
  let el = resolve(t.anchor); const p = parse(t.anchor);
  if (el && p && p.key && el.dataset.partKey !== p.key) el = null;
  if (!el && p && PAGE && PAGE.reveal) { await PAGE.reveal(p.pid, p.key); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); el = resolve(t.anchor); }
  if (el) el.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  place();
}

/* ---------- seed from file: an empty db and an editor at the page -> the docs in seed.json (adp-seed/2: an index of packs under seed/,
   written by adp.py new and seed; adp-seed/1 held the docs inline), manifest/current last. The agent publishes once; whoever is admin
   opens the page, a person or Claude's own session, and the page expands the packs itself. While it does, a first-open sheet says what
   is happening and what ADP is (the tour below): the one moment a reader is certain to be looking. ---------- */
let seeded = null;
const TOUR = [
  ['Files are parts', 'Every file of this artifact is cut into named parts (a part:id marker around each). A part has a hash; the manifest lists them all. The agent published those files once, as one artifact.'],
  ['Copy is data', 'The text on the page is not in the files: it lives in content docs, one per part. Editing a sentence is a database write, not a republish.'],
  ['The database is the record', 'parts/, content/, changes/ and agents/ say what is live, who changed it and when; manifest/current is the truth the agents read first. That record is being written now, from the seed packs published beside the page.'],
  ['What changed, and Settings', 'The "What changed" panel in the header reads changes/ live. Settings (the gear) holds the switches, "Incoming", where an agent\'s proposal is applied or declined by an editor, and who may write where.'],
  ['From here', 'Agents export, edit and propose; an editor applies. Nothing lands on this page without a record, and every version stays readable.']
];
function tour(f){
  if (!document.body) return {step(){}, progress(){}, done(){}, fail(){}};
  const st = document.createElement('style');
  st.textContent = '.adp-seed{position:fixed;inset:auto 16px 16px 16px;z-index:9999;max-width:560px;max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;margin:0 auto;padding:16px 18px;border-radius:12px;background:var(--panel,#fff);color:var(--ink,#1c1917);border:1px solid var(--rule,#e7e5e4);box-shadow:0 12px 40px rgba(0,0,0,.18);font:14px/1.45 var(--f-ui,system-ui,sans-serif)}'
    + '.adp-seed h2{margin:0 0 4px;font-size:16px}.adp-seed p{margin:0 0 8px}.adp-seed .adp-sd-bar{height:6px;border-radius:3px;background:var(--sunk,#f5f5f4);overflow:hidden;margin:8px 0}.adp-seed .adp-sd-bar i{display:block;height:100%;width:0;background:var(--accent,#9A5406);transition:width .2s}'
    + '.adp-seed ol{margin:8px 0;padding-left:20px}.adp-seed li{margin:0 0 6px;opacity:.45;transition:opacity .3s}.adp-seed li.on{opacity:1}.adp-seed li b{display:block}.adp-seed .adp-sd-meta{font-size:12px;color:var(--ink-3,#78716c)}'
    + '.adp-seed button{margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid var(--rule,#e7e5e4);background:var(--panel,#fff);color:inherit;cursor:pointer}'
    + '@media(prefers-reduced-motion:reduce){.adp-seed li,.adp-seed .adp-sd-bar i{transition:none}}';
  document.head.append(st);
  const box = document.createElement('aside'); box.className = 'adp-seed'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); box.setAttribute('aria-label', 'First open');
  const h = document.createElement('h2'); h.textContent = 'First open: this page is writing its own record';
  const line = document.createElement('p'); line.textContent = 'Reading the seed…';
  const bar = document.createElement('div'); bar.className = 'adp-sd-bar'; const fill = document.createElement('i'); bar.append(fill);
  const ol = document.createElement('ol'); const lis = TOUR.map(([t, d]) => { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = t; li.append(b, document.createTextNode(d)); ol.append(li); return li; });
  const meta = document.createElement('p'); meta.className = 'adp-sd-meta'; meta.textContent = (f.by ? 'Seeded by ' + f.by + '. ' : '') + (f.docs ? f.docs + ' docs in ' + (f.packs || []).length + ' pack' + ((f.packs || []).length === 1 ? '' : 's') + '.' : '');
  box.append(h, line, bar, ol, meta); document.body.append(box);
  const t0 = Date.now(), counts = {}; let step = -1, closed = false;
  const light = i => { if (i === step || closed) return; step = i; lis.forEach((li, k) => li.classList.toggle('on', k <= i)); };
  const close = () => { if (closed) return; closed = true; box.remove(); };
  const btn = () => { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Close'; b.addEventListener('click', close); box.append(b); b.focus(); };
  return {
    step(k, n, path){ light(0); line.textContent = 'Fetching pack ' + k + ' of ' + n + ' (' + path + ')'; },
    progress(done, total, x){
      counts[x.collection] = (counts[x.collection] || 0) + 1; fill.style.width = Math.round(100 * done / total) + '%';
      light(done < total / 3 ? 1 : done < total ? 2 : 3);
      line.textContent = 'Writing ' + done + ' of ' + total + ': ' + Object.keys(counts).map(c => c + ' ' + counts[c]).join(' · ');
    },
    done(why){
      light(4); fill.style.width = '100%';
      line.textContent = why ? why : 'Done: the record is written (' + Math.round((Date.now() - t0) / 100) / 10 + ' s). Reload any other open view of this page.';
      btn(); setTimeout(close, 60000);
    },
    fail(why){ line.textContent = 'Seeding stopped: ' + why + '. Reload to try again; nothing is half-written as truth, manifest/current goes last.'; btn(); }
  };
}
async function seedFromFile(d){
  let t = null;
  try {
    const has = async () => { const c = await d.doc('manifest/current').get().catch(() => null); return !!(c && c.exists); };
    if (await has()) return;
    const r = await fetch('seed.json', {cache: 'no-store'}); if (!r.ok) return;
    const f = await r.json();
    const v1 = f && f.schema === 'adp-seed/1' && Array.isArray(f.docs), v2 = f && f.schema === 'adp-seed/2' && Array.isArray(f.packs);
    if (!v1 && !v2) return pushErr('seed.json: not adp-seed/1 or adp-seed/2');
    t = tour(f);
    let docs = v1 ? f.docs.slice() : [];
    for (let k = 0; k < (f.packs || []).length; k++) {        // every pack first, then the writes: a missing pack stops before anything lands
      const path = String(f.packs[k]); t.step(k + 1, f.packs.length, path);
      const pr = await fetch(path, {cache: 'no-store'});
      if (!pr.ok) { t.fail('pack ' + path + ' is not published (' + pr.status + ')'); return pushErr('seed: ' + path + ' ' + pr.status); }
      const pk = await pr.json(); docs = docs.concat(Array.isArray(pk && pk.docs) ? pk.docs : []);
    }
    docs = docs.filter(x => x && typeof x.collection === 'string' && typeof x.id === 'string' && x.data && typeof x.data === 'object');
    if (await has()) return t.done('Another editor was first: the record is already written.');   // another editor was first
    const rest = docs.filter(x => !(x.collection === 'manifest' && x.id === 'current')), man = docs.find(x => x.collection === 'manifest' && x.id === 'current');
    const total = rest.length + (man ? 1 : 0), at0 = new Date().toISOString(); let done = 0;
    const write = async x => { await d.doc(x.collection + '/' + x.id).set(x.data); done++; t.progress(done, total, x);
      if (done % 25 === 0) await d.doc('status/seed').set({state: 'seeding', done, total, from: 'seed.json', opened_by: user.id || 'editor', at: at0}).catch(() => {}); };
    for (let i = 0; i < rest.length; i += 6) await Promise.all(rest.slice(i, i + 6).map(write));   // six at a time; manifest/current alone, last
    if (man) await write(man);
    const at = new Date().toISOString();
    seeded = {state: 'done', from: 'seed.json', version: String(f.version || ''), by: f.by || '', opened_by: user.id || 'editor', docs: docs.length, packs: (f.packs || []).length, at};
    await d.doc('status/seed').set(seeded).catch(() => {});
    window.ADP_SEED = seeded; t.done();
  } catch (e) { const m = e && (e.code || e.message) || e; pushErr('seed: ' + m); if (t) t.fail(String(m)); }
}

/* ---------- page self-check: writes checks/latest when the viewer can edit ---------- */
let tCheck = 0, lastSent = '', sending = false, viewsSeen = {};
function later(){ clearTimeout(tCheck); tCheck = setTimeout(check, 1500); }
async function check(){
  if (!PAGE) return;
  const view = PAGE.view(), exp = ['page.header', 'page.tabs', 'page.changes'].concat(PAGE.expected(view) || []);
  const missing = exp.filter(id => !document.querySelector(sel(id)));
  const known = new Set(PAGE.all || []);
  const unmarked = [...new Set([...document.querySelectorAll('[data-part]')].map(e => e.dataset.part))].filter(id => !known.has(id));
  const over = Math.max(0, document.documentElement.scrollWidth - innerWidth);
  const ok = !missing.length && !unmarked.length && !over && !errors.length;
  viewsSeen[view] = {ok, missing, overflow_x: over, width: innerWidth};
  window.ADP_CHECK = {build: BUILD, view, ok, missing, unmarked, overflow_x: over, errors: errors.slice(), anchors: Object.assign({}, stats), probe, integrity};
  integrityAt();
  if (!db || !canEdit || sending) return;
  const body = {build: BUILD, view, ok, missing, unmarked, overflow_x: over, width: innerWidth, errors: errors.slice(),
    content: {source: Object.keys(live).length ? 'db' : 'file', db_docs: Object.keys(live).length, file_docs: Object.keys(base()).length},
    locked: !!get('edit.locked'), config_at: cdoc ? cdoc.at : '', fetch_sibling: probe, anchors: Object.assign({}, stats), views: viewsSeen, seeded,
    integrity: integrity ? {verdict: integrity.verdict, page_hash: integrity.page_hash, drift: integrity.drift, written: integrity.written} : null};
  const key = JSON.stringify(body); if (key === lastSent) return;
  sending = true;
  const ref = db.doc('checks/latest'), data = Object.assign({at: new Date().toISOString()}, body);
  try { await ref.update(data); lastSent = key; }
  catch (e) { try { await ref.set(data); lastSent = key; } catch (e2) { errors.length < 20 && errors.push('check write: ' + (e2 && e2.code)); } }
  sending = false;
}

/* ---------- integrity at open: the parts hashed as adp.py does, compared with manifest/current and the content baseline;
   status/integrity is written when the db rule allows, else kept here and shown by the integrity badge ---------- */
let integrity = null, integrityRun = null;
function integrityAt(){
  if (integrityRun || !db) return;
  integrityRun = (async () => {
    const page = await hashText(document.documentElement.outerHTML);
    let rec = null;
    try { const s = await db.doc('manifest/current').get(); rec = s && s.exists ? s.data() || null : null; } catch (e) {}
    const mp = rec && (rec.parts || (rec.data && rec.data.parts)) || {};
    const edited = Object.keys(live).filter(id => base()[id] && live[id].html !== base()[id].html);
    const filesAhead = Object.keys(page.parts).filter(id => id in mp && mp[id] !== page.parts[id] && !edited.includes(id));
    const v = !filesAhead.length && !edited.length ? 'consistent' : !edited.length ? 'files_ahead' : !filesAhead.length ? 'record_ahead' : 'mixed';
    integrity = {at: new Date().toISOString(), by: 'page', page_hash: page.page_hash, parts: page.parts, verdict: rec ? v : (edited.length ? 'record_ahead' : 'consistent'),
      drift: [...new Set(filesAhead.concat(edited))].sort(), written: false};
    if (window.ADP_CHECK) window.ADP_CHECK.integrity = integrity;
    try { const d = Object.assign({}, integrity); delete d.written; await db.doc('status/integrity').set(d); integrity.written = true; }
    catch (e) { integrity.write_error = String(e && e.code || e); }
    badge(); later();
  })().catch(e => pushErr('integrity: ' + (e && e.message || e)));
}
function badge(){
  const m = get('panel.checks'); if (!integrity || m === 'off' || (m === 'editors' && !canEdit)) return;
  document.querySelectorAll('[data-adp-integrity]').forEach(el => {
    el.textContent = integrity.verdict === 'consistent' ? 'Consistent' : integrity.verdict.replace('_', ' ') + ': ' + integrity.drift.slice(0, 6).join(', ');
    el.dataset.verdict = integrity.verdict; el.title = 'page ' + integrity.page_hash + (integrity.written ? ', recorded in status/integrity' : ', kept in memory');
  });
}

/* ---------- config: switches in config/current (docs/config.md). Soft layer; the db rules are the hard one. ---------- */
const REG = {}, lis = {}, SEG = /^[a-z0-9][a-z0-9-]*$/;
let vals = {}, changed = {}, cdoc = null, isReady = false, lockEl = null, resolveReady;
const readyP = new Promise(r => { resolveReady = r; });
const dflt = t => t === 'bool' ? false : t === 'list' ? [] : '';
function define(group, defs){
  if (!SEG.test(group)) throw new Error('bad config group: ' + group);
  Object.keys(defs || {}).forEach(n => {
    const d = defs[n] || {}; if (!SEG.test(n)) throw new Error('bad config name: ' + n);
    REG[group + '.' + n] = Object.assign({}, d, {group, name: n, type: d.type || 'text', level: d.level || 'page', default: 'default' in d ? d.default : dflt(d.type)});
  });
  if (isReady) effects();
}
const get = k => k in vals ? vals[k] : REG[k] ? REG[k].default : undefined;
function all(){
  const o = {};
  Object.keys(REG).forEach(k => { const d = REG[k]; (o[d.group] = o[d.group] || {})[d.name] = Object.assign({}, d, {value: get(k), changed: changed[k] || null}); });
  return o;
}
const fire = (k, only) => { (only ? [only] : (lis[k] || []).concat(lis['*'] || [])).forEach(fn => { try { fn(get(k), k); } catch (e) { pushErr('config listener: ' + (e && e.message)); } }); };
function on(k, fn){
  (lis[k] = lis[k] || []).push(fn);
  if (isReady) Promise.resolve().then(() => fire(k, fn));
  return () => { lis[k] = (lis[k] || []).filter(f => f !== fn); };
}
function check1(k, v){
  const d = REG[k]; if (!d) throw new Error('Unknown setting ' + k);
  const ok = d.type === 'bool' ? typeof v === 'boolean'
    : d.type === 'enum' ? (d.options || []).includes(v)
    : d.type === 'url' ? typeof v === 'string' && (v === '' || v.startsWith('https://'))
    : d.type === 'list' ? Array.isArray(v) && v.every(x => typeof x === 'string')
    : d.type === 'datetime' ? typeof v === 'string' && (v === '' || !isNaN(Date.parse(v)))
    : typeof v === 'string' && v.length <= 2000;
  if (!ok) throw new Error(k + ' needs ' + (d.type === 'enum' ? 'one of ' + (d.options || []).join(', ') : d.type === 'url' ? 'an https:// address or empty' : d.type === 'text' ? 'text up to 2000 characters' : 'a ' + d.type + ' value'));
}
/* The page's db handle returns no version, so the write is unpinned (last writer wins); the retry re-reads and merges once. */
async function write(edit, summary){
  await readyP;
  if (!db) throw new Error('Settings cannot be saved here: this page has no database.');
  if (!canEdit) throw new Error('Settings cannot be saved: you cannot edit this artifact.');
  const ref = db.doc('config/current'); let err;
  for (let i = 0; i < 2; i++) {
    try {
      const snap = await ref.get(), cur = snap && snap.exists ? snap.data() || {} : {}, by = user.id || 'page', at = new Date().toISOString();
      const v = Object.assign({}, cur.values), c = Object.assign({}, cur.changed); edit(v, c, {by, at});
      await ref.set({schema: 'adp-config/1', at, by, values: v, changed: c});
      if (get('log.data-changes') !== false) await db.doc('changes/d-' + Date.now()).set({version: '', at, by, summary, parts: [], threads: [], data: [{doc: 'config/current'}]}).catch(() => {});
      return;
    } catch (e) { err = e; }
  }
  throw err;
}
function set(k, v){
  try { check1(k, v); } catch (e) { return Promise.reject(e); }
  const same = JSON.stringify(v) === JSON.stringify(REG[k].default);
  return write((vals_, ch, m) => { if (same) delete vals_[k]; else vals_[k] = v; ch[k] = {by: m.by, at: m.at}; }, 'Set ' + k + ' = ' + JSON.stringify(v));
}
function reset(k){
  if (k !== undefined) return REG[k] ? set(k, REG[k].default) : Promise.reject(new Error('Unknown setting ' + k));
  return write((v, c, m) => { Object.keys(v).forEach(x => delete v[x]); Object.keys(c).forEach(x => delete c[x]); }, 'Reset all settings');
}
function watchConfig(){
  const ref = db.doc('config/current');
  const take = snap => {
    const first = !isReady, old = vals;
    cdoc = snap && snap.exists ? snap.data() || null : null;
    vals = cdoc && cdoc.values && typeof cdoc.values === 'object' ? cdoc.values : {}; changed = cdoc && cdoc.changed && typeof cdoc.changed === 'object' ? cdoc.changed : {};
    if (first) return ready();
    effects(); later();
    new Set(Object.keys(old).concat(Object.keys(vals))).forEach(k => { if (JSON.stringify(old[k]) !== JSON.stringify(vals[k])) fire(k); });
  };
  try { ref.onSnapshot(take, e => { pushErr('config snapshot: ' + (e && e.code)); ready(); }); }
  catch (e) { ref.get().then(take, () => ready()); }
}
function ready(){ if (isReady) return; isReady = true; effects(); Object.keys(lis).forEach(k => (lis[k] || []).forEach(fn => fire(k, fn))); resolveReady(); }
const partLocked = id => (get('parts.locked') || []).some(p => id === p || id.startsWith(p + '.'));
const hideChanges = () => { const m = get('panel.changes'); return m === 'off' || (m === 'editors' && !canEdit); };
function panels(){
  document.querySelectorAll('[data-part="page.changes"]').forEach(el => { const h = hideChanges(); if (h) { el.hidden = true; el.dataset.adpHid = '1'; } else if (el.dataset.adpHid) { el.hidden = false; delete el.dataset.adpHid; } });
}
function effects(){
  const h = document.documentElement, lk = !!get('edit.locked'), th = get('look.theme'), md = get('look.mode');
  h.toggleAttribute('data-adp-locked', lk);
  th ? h.setAttribute('data-adp-theme', th) : h.removeAttribute('data-adp-theme');
  get('look.density') ? h.setAttribute('data-adp-density', get('look.density')) : h.removeAttribute('data-adp-density');
  md === 'light' || md === 'dark' ? h.setAttribute('data-theme', md) : h.removeAttribute('data-theme');
  panels();
  if (!lk) { if (lockEl) lockEl.remove(); lockEl = null; return; }
  if (!document.body) return addEventListener('DOMContentLoaded', effects, {once: true});
  const by = (changed['edit.locked'] || {}).by, until = when(get('edit.until')), why = get('edit.reason');
  if (!lockEl) { lockEl = document.createElement('div'); lockEl.className = 'adp-lock'; lockEl.setAttribute('role', 'status'); }
  lockEl.textContent = 'Editing is paused' + (by ? ' by ' + by : '') + (until ? ' until ' + until : '') + (why ? ': ' + why : '');
  if (document.body.firstChild !== lockEl) document.body.prepend(lockEl);
}
{
  const st = document.createElement('style');
  st.textContent = 'html[data-adp-locked] [data-adp-edit]{pointer-events:none;opacity:.55}.adp-lock{padding:8px 16px;background:var(--accent-soft,#fef3c7);color:var(--ink,#1c1917);border-bottom:2px solid var(--warn,#b45309);font:13px/1.4 var(--f-ui,system-ui,sans-serif)}';
  (document.head || document.documentElement).append(st);
}
define('edit', {locked: {type: 'bool', label: 'Pause editing', help: 'Turns off pointer events on controls marked data-adp-edit (CSS only) and shows a banner; ADP.config.set ignores it.'}, until: {type: 'datetime', label: 'Paused until', help: 'Shown in the banner; nothing lifts the freeze by itself.'},
  reason: {type: 'text', label: 'Reason'}, 'require-hold': {type: 'bool', label: 'Require a hold', help: 'Only adp.py record --holds checks it: it refuses changed parts that already existed and that nobody holds (deepest parts only; hold_until is not checked).'}});
define('parts', {locked: {type: 'list', label: 'Locked parts', help: 'Part-id prefixes that are frozen.'}});
define('comments', {enabled: {type: 'bool', default: true, label: 'Comment mode', help: 'Reserved: stored and shown, nothing reads it yet.'}});
define('panel', {changes: {type: 'enum', options: ['everyone', 'editors', 'off'], default: 'everyone', label: 'What changed panel'}, checks: {type: 'enum', options: ['everyone', 'editors', 'off'], default: 'editors', label: 'Integrity badge'}});
define('playground', {enabled: {type: 'bool', default: true, label: 'Playground'}});
/* look.theme: its default is the theme index.html links (kit/themes/<name>.css, written by adp.py new), else default. Here the only option is that one;
   a page that carries more themes and a switch (the assistant template) defines look.theme again with the themes it has installed, and wears the chosen one. */
const BUILT = (() => { const l = [...document.querySelectorAll('link[rel="stylesheet"][href^="kit/themes/"]')].pop(); return l ? l.getAttribute('href').slice(11, -4) : 'default'; })();
define('look', {theme: {type: 'enum', options: [BUILT], default: BUILT, label: 'Theme', help: 'The theme everyone sees. A page with a theme switch offers the themes it has installed and wears the chosen one; any other page offers only the theme it was built with. Also set as data-adp-theme on the page.'}, mode: {type: 'enum', options: ['auto', 'light', 'dark'], default: 'auto', label: 'Colour mode'}, density: {type: 'enum', options: ['comfortable', 'compact'], default: 'comfortable', label: 'Density', help: 'Sets data-adp-density on the page for your own CSS; the kit does not read it.'}});
define('links', {catalog: {type: 'url', label: 'Catalog', help: 'Reserved: stored and shown, nothing reads it yet.'}, board: {type: 'url', label: 'Board', help: 'Reserved: stored and shown, nothing reads it yet.'}, repo: {type: 'url', label: 'Repository', help: 'Reserved: stored and shown, nothing reads it yet.'}});
define('log', {'data-changes': {type: 'bool', default: true, label: 'Log data changes'}});

/* ---------- boot ---------- */
let tPlace = 0;
new MutationObserver(() => { cancelAnimationFrame(tPlace); tPlace = requestAnimationFrame(() => { place(); panels(); later(); }); })
  .observe(document.documentElement, {childList: true, subtree: true});
addEventListener('resize', () => { place(); later(); });
(async () => {
  let connection;
  try { connection = await connectHost(); }
  catch (e) { host = Object.freeze({protocol: 'adp-host/1', id: '', status: 'failed'}); pushErr('host connection failed'); ready(); return; }
  const d = connection.db || null, u = connection.user || null;
  hostComments = connection.comments || null;
  host = Object.freeze({protocol: 'adp-host/1', id: connection.id, status: 'connected', records: !!d,
    comments: !!(hostComments && typeof hostComments.customAnchors === 'function'), seedFiles: connection.seedFiles === true});
  if (connection.legacyComments) {
    connection.legacyComments.then(cm => {
      hostComments = cm;
      host = Object.freeze(Object.assign({}, host, {comments: !!(cm && typeof cm.customAnchors === 'function')}));
      return anchors();
    }).catch(() => pushErr('comments unavailable'));
  } else anchors().catch(() => pushErr('comments unavailable'));
  canEdit = u ? await Promise.resolve().then(() => u.canEdit()).then(v => v === true).catch(() => false) : false;
  user.canEdit = canEdit; user.id = u ? String(await Promise.resolve().then(() => u.id()).catch(() => '') || '') : '';
  if (d && canEdit && host.seedFiles) await seedFromFile(d);     // before anything reads the record: the first editor at an empty db writes it
  db = d;
  if (db) { changesPanel(); watchContent(); }
  if (db) watchConfig(); else ready();
  if (db && canEdit && host.seedFiles) {
    try { const r = await fetch('content.js', {cache: 'no-store'}); probe = (r.ok ? 'ok ' : 'http ') + r.status + ', ' + (r.headers.get('content-type') || '?') + ', ' + (await r.text()).length + ' chars'; }
    catch (e) { probe = 'failed: ' + (e && e.message || e); }
  }
  later();
})().catch(() => {
  db = null; canEdit = false; user.canEdit = false;
  host = Object.freeze({protocol: 'adp-host/1', id: host.id, status: 'failed'});
  pushErr('host initialization failed'); ready();
});

const config = Object.freeze({define, get, all, on, set, reset, ready: readyP, get doc(){ return cdoc; }});
const ns = name => { if (!db) throw new Error('ADP.ns needs a database'); const b = 'ns/' + name + '/'; return {doc: p => db.doc(b + p), collection: p => db.collection(b + p)}; };
window.ADP = Object.freeze({get host(){ return host; }, build: BUILD, content, page: cfg => { PAGE = cfg; later(); }, config, user, ns, classify, hash: hashText, get integrity(){ return integrity; }, get seeded(){ return seeded; }, get db(){ return db; }});
})();
