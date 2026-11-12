/* adp.js: adp/2 page runtime. What changed panel, content as data, part-id comment anchors, page self-check.
   Load it before the page's own scripts. The page calls ADP.page({...}) once its views exist. */
(function(){
'use strict';
const meta = document.querySelector('meta[name="adp:build"]');
const BUILD = meta ? meta.content : '';
const ID = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const live = {}, errors = [], stats = {anchors: 'not started', threads: 0, placed: 0, unknown: []};
let PAGE = null, db = null, canEdit = false, probe = '', ctl = null, cmode = false, list = [], hlEl = null;

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
  el.hidden = false;
  const $ = id => document.getElementById(id);
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = String(txt); return n; };
  const when = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); };
  const note = (box, t) => box.replaceChildren(mk('li', 'wc-empty', t));
  const partsOf = a => { const w = mk('div', 'wc-parts'); (Array.isArray(a) ? a : []).slice(0, 12).forEach(x => { const id = typeof x === 'string' ? x : (x && x.id); if (id) w.append(mk('code', '', id)); }); return w.childNodes.length ? w : null; };
  note($('wcChanges'), 'Loading…'); note($('wcDecisions'), 'Loading…');
  try {
    db.collection('changes').orderBy('at', 'desc').limit(10).onSnapshot(snap => {
      const docs = snap.docs.filter(d => d.exists), box = $('wcChanges');
      $('wcN').textContent = docs.length ? String(docs.length) : '';
      if (!docs.length) return note(box, 'Nothing recorded yet.');
      box.replaceChildren(...docs.map(d => { const c = d.data() || {}, li = mk('li'), h = mk('div', 'wc-h');
        h.append(mk('b', '', c.version ? 'Version ' + c.version : d.id), mk('span', '', [when(c.at), c.by].filter(Boolean).join(' · ')));
        li.append(h, mk('p', '', c.summary || '')); const p = partsOf(c.parts); if (p) li.append(p); return li; }));
    }, () => note($('wcChanges'), 'Changes could not be read.'));
    db.collection('decisions').where('status', '==', 'active').onSnapshot(snap => {
      const docs = snap.docs.filter(d => d.exists), box = $('wcDecisions');
      if (!docs.length) return note(box, 'None recorded yet.');
      box.replaceChildren(...docs.map(d => { const c = d.data() || {}, li = mk('li');
        li.append(mk('blockquote', '', c.quote || d.id), mk('div', 'wc-h', when(c.at))); const p = partsOf(c.parts); if (p) li.append(p); return li; }));
    }, () => note($('wcDecisions'), 'Decisions could not be read.'));
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
  return ((t || el.getAttribute('aria-label') || el.dataset.part) + (el.dataset.partKey ? ', ' + el.dataset.partKey : '')).slice(0, 120);
}
function hl(el){ if (hlEl === el) return; if (hlEl) hlEl.classList.remove('adp-hl'); hlEl = el; if (el) el.classList.add('adp-hl'); }
const swallow = e => { if (!e.isTrusted || !cmode || !ctl || !target(e.target)) return; e.preventDefault(); e.stopPropagation(); };
async function anchors(){
  const cm = await claude.use('comments').catch(() => null);
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
  window.ADP_CHECK = {build: BUILD, view, ok, missing, unmarked, overflow_x: over, errors: errors.slice(), anchors: Object.assign({}, stats), probe};
  if (!db || !canEdit || sending) return;
  const body = {build: BUILD, view, ok, missing, unmarked, overflow_x: over, width: innerWidth, errors: errors.slice(),
    content: {source: Object.keys(live).length ? 'db' : 'file', db_docs: Object.keys(live).length, file_docs: Object.keys(base()).length},
    fetch_sibling: probe, anchors: Object.assign({}, stats), views: viewsSeen};
  const key = JSON.stringify(body); if (key === lastSent) return;
  sending = true;
  const ref = db.doc('checks/latest'), data = Object.assign({at: new Date().toISOString()}, body);
  try { await ref.update(data); lastSent = key; }
  catch (e) { try { await ref.set(data); lastSent = key; } catch (e2) { errors.length < 20 && errors.push('check write: ' + (e2 && e2.code)); } }
  sending = false;
}

/* ---------- boot ---------- */
let tPlace = 0;
new MutationObserver(() => { cancelAnimationFrame(tPlace); tPlace = requestAnimationFrame(() => { place(); later(); }); })
  .observe(document.documentElement, {childList: true, subtree: true});
addEventListener('resize', () => { place(); later(); });
(async () => {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  anchors();
  const [d, u] = await Promise.all([claude.use('db').catch(() => null), claude.use('user').catch(() => null)]);
  db = d;
  if (db) { changesPanel(); watchContent(); }
  canEdit = u && typeof u.canEdit === 'function' ? await u.canEdit().catch(() => false) : false;
  if (db && canEdit) {
    try { const r = await fetch('content.js', {cache: 'no-store'}); probe = (r.ok ? 'ok ' : 'http ') + r.status + ', ' + (r.headers.get('content-type') || '?') + ', ' + (await r.text()).length + ' chars'; }
    catch (e) { probe = 'failed: ' + (e && e.message || e); }
  }
  later();
})();

window.ADP = Object.freeze({build: BUILD, content, page: cfg => { PAGE = cfg; later(); }});
})();
