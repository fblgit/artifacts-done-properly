/* part:page.script.kit.file-browser */
/* Kit layout: file browser (Kit.fileBrowser)    kit version 0.2.0
   What it is: the published files of an ADP artifact as a place to work in, drawn from manifest/current and the records beside it. Two panes. The tree on the left is a real tree (folders
   open and close, arrow keys walk it): each file shows its kind, how many parts it holds and three marks that carry a glyph and a word, never colour alone: changed after the chosen version,
   held by an agent, and open comments. The selected file's folders are traced by a seam down the tree. The sheet on the right names the file, gives its hash in groups of four with Copy,
   its size and when it last changed, a ribbon of every version with the ones that touched this file filled, the page's actions (Open, Compare and any related views), then two tabs:
   Parts (the file's parts as an outline, parents before children; each opens to its summary, full hash, last change, holder or stale hold, comments, and whether its copy lives in content/)
   and History (every version that touched the file, newest first: which parts were added, changed or removed with their hashes, and a Compare for that step). The text outside the parts
   ("_rest:<path>") is listed as such. A file with no parts says so, and its history comes from the version manifests when the page passes them.
   The toolbar filters by path or part id, picks the version after which changes are marked, and narrows to Changed, Held or Commented files, each with its count.
   Below 46rem the panes take turns: the tree, then the sheet with an "All files" button back. Plain DOM; every text is set with textContent. It reads nothing from the db and writes nothing.
   API:
     Kit.fileBrowser.mount(root, opts) -> {select(path), update(data), setSince(version), destroy()}
       manifest   {schema, page_hash, parts: {id: hash}, files: {path: hash}, parents: {id: parent}, part_file: {id: path}}   manifest/current (or adp.py manifest DIR)
       sizes      {path: bytes}                         parts     the parts/<id> docs as {id: doc} or [{id, ...}]: title, summary, version, at, by, holder, hold_until
       changes    the changes/ docs [{version, at, by, summary, parts: [{id, from, to}]}]; data-only ones (version "") are skipped
       manifests  optional {version: {files, parts}}: a file's own hash per version, so files without parts get a history too
       threads    the threads/ docs {id: {part, status, holder, note}}      content   the content/ docs {part id: doc} (or a list of part ids)
       since      the version after which changes are marked (default: the one before the latest)      selected   a path      now   ISO or Date for holds (default: the clock)
       views      [{id, label}] related views offered on the sheet           timeZone  for dates (default "UTC")     label  the tree's name (default "Published files")
       onSelect(path)   onOpen(path)   onCompare({path, from, to})   onPart(id, path)   onView(id, {path})      each button appears only when its callback is given
       onSince(version) the reader picked another version to mark from ("" for every change); setSince() never calls it
     update(data) takes any of the options above and redraws, keeping the selection, the open folders and the tab. select() never calls onSelect.
     Keyboard: the tree follows the WAI tree pattern (Up, Down, Left, Right, Home, End, Enter, a letter jumps); the tabs take Left and Right; changes are announced through role="status".
   Needs from the board:
     css     kit/layout/file-browser.css; custom properties --bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --accent-soft --ok --warn --danger --f-ui --f-mono,
             optional --f-display --seam --radius --shadow
     kit     kit.tokens
     globals none (navigator.clipboard for Copy when present, with a select-the-text fallback)
   db collections: none read here; a board reads manifest/current, parts, changes, threads and content and passes them in, then calls update() when they change.
   Lifted from: the first file browser of this kit (folders, an extension badge, the parts of a file) and adp.py manifest and diff (the shape of the manifest and of added, changed, removed).
   Changed: a tree with open and closed folders instead of flat groups; who holds what, comments and history per file; a version scale; the narrow layout takes turns instead of stacking. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const REST = '_rest:';
const el = Kit.dom.el;
const G = {
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  changed: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" fill="currentColor"/>',
  held: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  stale: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.8"/>',
  talk: '<path d="M4.5 5.5h15v10.5h-9l-4.5 3.5v-3.5H4.5z"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  db: '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
};
function glyph(name, cls) {
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.setAttribute('class', 'kit-fb-g' + (cls ? ' ' + cls : '')); s.innerHTML = G[name]; return s;
}
const extOf = p => { const m = /\.([A-Za-z0-9]+)$/.exec(p.split('/').pop()); return m ? m[1].toLowerCase() : 'file'; };
const size = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(1) + ' MB';
const grouped = h => String(h || '').replace(/(.{4})(?=.)/g, '$1 ');
const short = h => h ? String(h).slice(0, 8) : 'none';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
const asMap = (x, key) => Array.isArray(x) ? x.reduce((m, d) => { if (d && (d.id || d[key])) m[d.id || d[key]] = d; return m; }, {}) : (x || {});
let uid = 0;

function model(o) {
  const m = o.manifest || {}, files = m.files || {}, hashes = m.parts || {}, par = m.parents || {}, pf = m.part_file || {};
  const pdocs = asMap(o.parts, 'id'), threads = asMap(o.threads), content = Array.isArray(o.content) ? o.content.reduce((a, id) => (a[id] = {}, a), {}) : (o.content || {});
  const now = o.now ? new Date(o.now).getTime() : Date.now();
  const versions = (o.changes || []).filter(c => c && c.version).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const vIndex = {}; versions.forEach((c, i) => { vIndex[c.version] = i; });
  const sk = o.since, sinceI = sk === '__all' || sk === '' ? -1 : sk === '__none' ? versions.length - 1 : sk != null && sk in vIndex ? vIndex[sk] : versions.length - 2;
  const by = {}; Object.keys(pf).forEach(id => { (by[pf[id]] = by[pf[id]] || []).push(id); });
  const fileOfPart = id => pf[id] || (pdocs[id] && pdocs[id].file) || (id.startsWith(REST) ? id.slice(REST.length) : '');
  const hold = id => { const d = pdocs[id]; if (!d || !d.holder) return null; const t = d.hold_until ? new Date(d.hold_until).getTime() : Infinity; return { by: d.holder, until: d.hold_until || '', stale: t <= now }; };
  const talk = {}; Object.keys(threads).forEach(t => { const d = threads[t] || {}; if (d.part && d.status !== 'done') (talk[d.part] = talk[d.part] || []).push(Object.assign({ id: t }, d)); });
  const outline = ids => {
    const out = [], seen = new Set(), set = new Set(ids);
    const kids = p => ids.filter(i => par[i] === p && !i.startsWith(REST)).sort();
    const walk = (id, d) => { if (seen.has(id)) return; seen.add(id); out.push({ id, depth: d }); kids(id).forEach(c => walk(c, d + 1)); };
    ids.filter(i => !i.startsWith(REST) && !set.has(par[i])).sort().forEach(i => walk(i, 0));
    ids.filter(i => !i.startsWith(REST) && !seen.has(i)).sort().forEach(i => walk(i, 0));
    ids.filter(i => i.startsWith(REST)).forEach(i => out.push({ id: i, depth: 0, rest: true }));
    return out;
  };
  const rows = {};
  Object.keys(files).sort().forEach(path => {
    const parts = outline(by[path] || []);
    const hist = [];
    versions.forEach((c, i) => {
      const touched = (c.parts || []).filter(x => fileOfPart(x.id) === path).map(x => ({ id: x.id, from: x.from || '', to: x.to || '', kind: !x.from ? 'added' : !x.to ? 'removed' : 'changed' }));
      let fh = null;
      const mv = o.manifests && o.manifests[c.version], mp = i > 0 && o.manifests && o.manifests[versions[i - 1].version];
      if (mv && mv.files) { const a = mp && mp.files ? mp.files[path] || '' : '', b = mv.files[path] || ''; if (a !== b && (i > 0 || b)) fh = { from: a, to: b }; }
      if (touched.length || fh) hist.push({ version: c.version, at: c.at, by: c.by, summary: c.summary, i, parts: touched, file: fh });
    });
    const real = parts.filter(x => !x.rest);
    const holds = real.map(x => hold(x.id)).filter(Boolean);
    rows[path] = {
      path, hash: files[path], ext: extOf(path), size: o.sizes ? o.sizes[path] : null, parts, count: real.length, hist,
      recent: hist.some(h => h.i > sinceI), held: holds.filter(h => !h.stale).length, stale: holds.filter(h => h.stale).length,
      talk: real.reduce((n, x) => n + (talk[x.id] || []).length, 0),
    };
  });
  return { rows, hashes, pdocs, talk, content, hold, versions, sinceI, vIndex, page: m.page_hash || '' };
}

function treeOf(paths) {
  const root = { name: '', path: '', kids: new Map(), files: [] };
  paths.forEach(p => {
    const seg = p.split('/'); let n = root;
    for (let i = 0; i < seg.length - 1; i++) {
      const k = seg.slice(0, i + 1).join('/');
      if (!n.kids.has(seg[i])) n.kids.set(seg[i], { name: seg[i], path: k, kids: new Map(), files: [] });
      n = n.kids.get(seg[i]);
    }
    n.files.push(p);
  });
  return root;
}

function mount(root, opts) {
  let o = Object.assign({ label: 'Published files', timeZone: 'UTC', views: [] }, opts);
  const n = ++uid; let md = model(o), sel = o.selected && md.rows[o.selected] ? o.selected : null, q = '', only = '', tab = 'parts', open = new Set(), narrowSheet = false;
  const exp = new Set();
  const fmt = (iso, withYear) => { if (!iso) return ''; try { return new Intl.DateTimeFormat('en-GB', Object.assign({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }, withYear ? { year: 'numeric' } : {})).format(new Date(iso)); } catch (_) { return String(iso); } };
  const openAll = () => { Object.keys(md.rows).forEach(p => { const s = p.split('/'); for (let i = 1; i < s.length; i++) open.add(s.slice(0, i).join('/')); }); };
  openAll();
  root.textContent = ''; root.classList.add('kit-fb');
  // toolbar
  const bar = el('div', 'kit-fb-bar');
  const qBox = el('div', 'kit-fb-field'), ql = el('label', 'kit-fb-fl', 'Find a file or part'); ql.htmlFor = 'kit-fb-q' + n;
  const fi = el('input', 'kit-fb-q'); fi.id = 'kit-fb-q' + n; fi.type = 'search'; fi.autocomplete = 'off'; fi.spellcheck = false; fi.placeholder = 'tides.table or styles/';
  qBox.append(ql, fi);
  const sBox = el('div', 'kit-fb-field'), sl = el('label', 'kit-fb-fl', 'Mark changes made after'); sl.htmlFor = 'kit-fb-s' + n;
  const ss = el('select', 'kit-fb-sel'); ss.id = 'kit-fb-s' + n; sBox.append(sl, ss);
  const chips = el('div', 'kit-fb-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Show only');
  const CH = [['recent', 'changed', 'Changed'], ['held', 'held', 'Held'], ['talk', 'talk', 'Commented']];
  const chipBtns = CH.map(([k, g, t]) => { const b = el('button', 'kit-fb-chip'); b.type = 'button'; b.dataset.k = k; b.setAttribute('aria-pressed', 'false');
    b.append(glyph(g), el('span', null, t), el('span', 'kit-fb-cn')); b.addEventListener('click', () => { only = only === k ? '' : k; drawTree(); syncChips(); say(only ? countVisible() + ' files ' + t.toLowerCase() : 'Showing every file'); }); chips.append(b); return b; });
  bar.append(qBox, sBox, chips);
  const live = el('p', 'kit-fb-live'); live.setAttribute('role', 'status');
  const body = el('div', 'kit-fb-body');
  const treeBox = el('div', 'kit-fb-treebox'), treeHead = el('p', 'kit-fb-th'); treeHead.id = 'kit-fb-th' + n;
  const tree = el('ul', 'kit-fb-tree'); tree.setAttribute('role', 'tree'); tree.setAttribute('aria-labelledby', treeHead.id);
  const treeEmpty = el('div', 'kit-fb-empty'); treeEmpty.hidden = true;
  treeBox.append(treeHead, tree, treeEmpty);
  const sheet = el('section', 'kit-fb-sheet'); sheet.setAttribute('aria-label', 'File');
  body.append(treeBox, sheet); root.append(bar, live, body);
  let sayT = 0; const say = t => { clearTimeout(sayT); live.textContent = ''; sayT = setTimeout(() => { live.textContent = t; }, 40); };

  const versionLabel = i => { const c = md.versions[i]; return c ? c.version + ' (' + fmt(c.at) + ')' : ''; };
  function drawSince() {
    ss.textContent = '';
    if (!md.versions.length) { const op = el('option', null, 'No versions recorded'); op.value = ''; ss.append(op); ss.disabled = true; return; }
    ss.disabled = false;
    const none = el('option', null, 'Nothing, mark no changes'); none.value = '__none'; ss.append(none);
    md.versions.slice(0, -1).forEach((c, i) => { const op = el('option', null, versionLabel(i)); op.value = c.version; ss.append(op); });
    const zero = el('option', null, 'The start, mark every change'); zero.value = '__all'; ss.insertBefore(zero, none.nextSibling);
    ss.value = md.sinceI >= md.versions.length - 1 ? '__none' : md.sinceI < 0 ? '__all' : md.versions[md.sinceI].version;
  }
  const match = r => (!q || r.path.toLowerCase().includes(q) || r.parts.some(x => x.id.toLowerCase().includes(q) || ((md.pdocs[x.id] || {}).title || '').toLowerCase().includes(q)))
    && (!only || (only === 'recent' ? r.recent : only === 'held' ? r.held + r.stale > 0 : r.talk > 0));
  const countVisible = () => Object.values(md.rows).filter(match).length;
  function syncChips() {
    const all = Object.values(md.rows);
    const c = { recent: all.filter(r => r.recent).length, held: all.filter(r => r.held + r.stale).length, talk: all.filter(r => r.talk).length };
    chipBtns.forEach(b => { b.setAttribute('aria-pressed', String(only === b.dataset.k)); b.querySelector('.kit-fb-cn').textContent = String(c[b.dataset.k]); b.disabled = !c[b.dataset.k] && only !== b.dataset.k; });
  }
  function marks(r, compact) {
    const box = el('span', 'kit-fb-marks');
    const add = (g, word, cls) => { const s = el('span', 'kit-fb-mk ' + cls); s.append(glyph(g), el('span', compact ? 'kit-fb-vh' : 'kit-fb-mw', word)); box.append(s); };
    if (r.recent) add('changed', 'changed', 'kit-fb-mk-ch');
    if (r.held) add('held', r.held === 1 ? 'held' : r.held + ' held', 'kit-fb-mk-hd');
    else if (r.stale) add('stale', 'stale hold', 'kit-fb-mk-st');
    if (r.talk) { const s = el('span', 'kit-fb-mk kit-fb-mk-tk'); s.append(glyph('talk'), el('span', 'kit-fb-mn', String(r.talk)), el('span', 'kit-fb-vh', r.talk === 1 ? ' open comment' : ' open comments')); box.append(s); }
    return box;
  }
  // ---------------------------------------------------------------- tree
  function onPath(p) { return sel && (sel === p || sel.startsWith(p + '/')); }
  function drawTree() {
    tree.textContent = '';
    const all = Object.keys(md.rows), vis = all.filter(p => match(md.rows[p]));
    treeHead.textContent = o.label + ' ';
    treeHead.append(el('span', 'kit-fb-tc', vis.length === all.length ? plural(all.length, 'file') : vis.length + ' of ' + all.length + ' files'));
    treeEmpty.textContent = ''; treeEmpty.hidden = true; tree.hidden = false;
    if (!all.length) { tree.hidden = true; treeEmpty.hidden = false; treeEmpty.append(el('p', null, 'The manifest lists no files yet. Publish the artifact and record it, then the files appear here.')); return; }
    if (!vis.length) {
      tree.hidden = true; treeEmpty.hidden = false;
      treeEmpty.append(el('p', null, q ? 'No file or part matches "' + fi.value.trim() + '"' + (only ? ' among the files shown.' : '.') : 'No file is ' + ({ recent: 'changed after the chosen version', held: 'held', talk: 'commented' })[only] + '.'));
      const b = el('button', 'kit-fb-btn', 'Show every file'); b.type = 'button'; b.addEventListener('click', () => { q = ''; fi.value = ''; only = ''; drawTree(); syncChips(); focusItem(sel); }); treeEmpty.append(b); return;
    }
    const filtering = !!(q || only);
    const t = treeOf(vis);
    const walk = (node, ul, level) => {
      const folders = [...node.kids.values()].sort((a, b) => a.name.localeCompare(b.name)), files = node.files.slice().sort();
      const size = folders.length + files.length; let pos = 0;
      folders.forEach(f => {
        const li = el('li', 'kit-fb-ti kit-fb-dir'); li.setAttribute('role', 'treeitem'); li.dataset.dir = f.path; li.tabIndex = -1;
        const isOpen = filtering || open.has(f.path);
        li.setAttribute('aria-expanded', String(isOpen)); li.setAttribute('aria-level', String(level)); li.setAttribute('aria-setsize', String(size)); li.setAttribute('aria-posinset', String(++pos));
        if (onPath(f.path)) li.classList.add('kit-fb-on');
        const inner = [];
        const collect = x => { x.files.forEach(p => inner.push(md.rows[p])); x.kids.forEach(collect); }; collect(f);
        const row = el('div', 'kit-fb-row'); row.style.setProperty('--lv', level - 1);
        row.append(glyph('chev', 'kit-fb-chev'), glyph('folder', 'kit-fb-fold'), el('span', 'kit-fb-nm', f.name + '/'));
        const sum = el('span', 'kit-fb-sum', plural(inner.length, 'file'));
        const ch = inner.filter(r => r.recent).length; if (ch) sum.textContent += ', ' + ch + ' changed';
        row.append(sum);
        li.setAttribute('aria-label', f.name + ' folder, ' + sum.textContent);
        row.addEventListener('click', () => { toggle(f.path, li); });
        const g = el('ul', 'kit-fb-grp'); g.setAttribute('role', 'group'); g.hidden = !isOpen; g.style.setProperty('--lv', level - 1);
        li.append(row, g); ul.append(li); walk(f, g, level + 1);
      });
      files.forEach(p => {
        const r = md.rows[p], li = el('li', 'kit-fb-ti kit-fb-file'); li.setAttribute('role', 'treeitem'); li.dataset.path = p; li.tabIndex = -1;
        li.setAttribute('aria-level', String(level)); li.setAttribute('aria-setsize', String(size)); li.setAttribute('aria-posinset', String(++pos)); li.setAttribute('aria-selected', String(p === sel));
        const row = el('div', 'kit-fb-row'); row.style.setProperty('--lv', level - 1);
        const ext = el('span', 'kit-fb-ext kit-fb-ext-' + r.ext.replace(/[^a-z0-9]/g, ''), r.ext);
        const nm = el('span', 'kit-fb-nm', p.split('/').pop());
        const meta = el('span', 'kit-fb-meta', r.count ? plural(r.count, 'part') : 'no parts');
        row.append(ext, nm, marks(r, true), meta);
        li.setAttribute('aria-label', p.split('/').pop() + ', ' + meta.textContent + (r.recent ? ', changed' : '') + (r.held ? ', held' : r.stale ? ', stale hold' : '') + (r.talk ? ', ' + plural(r.talk, 'open comment') : ''));
        row.addEventListener('click', () => pick(p, true, true));
        li.append(row); ul.append(li);
      });
    };
    walk(t, tree, 1);
    roving(sel ? tree.querySelector('[data-path="' + cssEsc(sel) + '"]') : null);
  }
  const cssEsc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  const items = () => [...tree.querySelectorAll('[role="treeitem"]')].filter(li => !li.closest('[role="group"][hidden]'));
  function roving(cur) { const it = items(); const c = cur && it.includes(cur) ? cur : it[0]; it.forEach(li => { li.tabIndex = li === c ? 0 : -1; }); [...tree.querySelectorAll('[role="treeitem"]')].forEach(li => { if (!it.includes(li)) li.tabIndex = -1; }); return c; }
  function focusItem(path) { const li = path && tree.querySelector('[data-path="' + cssEsc(path) + '"]'); const c = roving(li); if (c) c.focus(); }
  function toggle(path, li, want) {
    const isOpen = li.getAttribute('aria-expanded') === 'true', next = want == null ? !isOpen : want;
    if (next === isOpen) return;
    if (next) open.add(path); else open.delete(path);
    li.setAttribute('aria-expanded', String(next)); li.querySelector(':scope > [role="group"]').hidden = !next;
    roving(li); li.focus();
  }
  tree.addEventListener('keydown', e => {
    const it = items(), cur = document.activeElement, i = it.indexOf(cur); if (i < 0) return;
    const go = li => { if (!li) return; e.preventDefault(); roving(li); li.focus(); };
    const dir = cur.dataset.dir;
    if (e.key === 'ArrowDown') go(it[i + 1]);
    else if (e.key === 'ArrowUp') go(it[i - 1]);
    else if (e.key === 'Home') go(it[0]);
    else if (e.key === 'End') go(it[it.length - 1]);
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (dir != null) { if (cur.getAttribute('aria-expanded') !== 'true') toggle(dir, cur, true); else go(it[i + 1]); } }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (dir != null && cur.getAttribute('aria-expanded') === 'true') toggle(dir, cur, false); else { const p = cur.parentElement.closest('[role="treeitem"]'); if (p) go(p); } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (dir != null) toggle(dir, cur); else pick(cur.dataset.path, true, true); }
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase(), name = li => (li.dataset.path || li.dataset.dir || '').split('/').pop().toLowerCase();
      const nx = it.slice(i + 1).concat(it.slice(0, i + 1)).find(li => name(li).startsWith(k)); if (nx) go(nx);
    }
  });
  // ---------------------------------------------------------------- the sheet
  function btn(text, fn, cls, g) { const b = el('button', 'kit-fb-btn' + (cls ? ' ' + cls : '')); b.type = 'button'; if (g) b.append(glyph(g)); b.append(el('span', null, text)); b.addEventListener('click', fn); return b; }
  function copy(text, b, what) {
    const done = () => say('Copied the ' + what + '.');
    const fallback = () => { const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;pointer-events:none'; document.body.append(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; } t.remove(); b.focus(); if (ok) done(); else say('Copying is blocked here. Select the ' + what + ' and copy it.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function hashLine(h, what) {
    const s = el('span', 'kit-fb-hash'); const c = el('code', 'kit-fb-hc', grouped(h)); c.title = h;
    s.append(c, btn('Copy', function () { copy(h, this, what); }, 'kit-fb-btn-q', 'copy')); return s;
  }
  function prevVersion(i) { return i > 0 ? md.versions[i - 1].version : ''; }
  function drawSheet() {
    sheet.textContent = '';
    const r = sel && md.rows[sel];
    if (!r) {
      const e = el('div', 'kit-fb-blank'); e.append(el('p', 'kit-fb-bt', Object.keys(md.rows).length ? 'Choose a file' : 'Nothing published yet'),
        el('p', null, Object.keys(md.rows).length ? 'Its parts, who holds them, its comments and every version that touched it show here.' : 'Once the first publish is recorded, its files and parts show here.'));
      sheet.append(e); return;
    }
    const head = el('header', 'kit-fb-head');
    if (root.classList.contains('kit-fb-narrow')) head.append(btn('All files', () => { narrowSheet = false; layout(); focusItem(sel); }, 'kit-fb-back', 'back'));
    const seg = r.path.split('/');
    if (seg.length > 1) { const cr = el('p', 'kit-fb-crumb'); seg.slice(0, -1).forEach(s => { cr.append(el('span', null, s), el('span', 'kit-fb-sep', '/')); }); head.append(cr); }
    const h = el('h3', 'kit-fb-title'); h.tabIndex = -1; h.append(el('span', 'kit-fb-tn', seg[seg.length - 1]), el('span', 'kit-fb-ext kit-fb-ext-' + r.ext.replace(/[^a-z0-9]/g, ''), r.ext));
    head.append(h, marks(r, false));
    sheet.append(head);
    const dl = el('dl', 'kit-fb-facts'), fact = (k, v) => { const w = el('div', 'kit-fb-fact'), d = el('dd'); d.append(v); w.append(el('dt', null, k), d); dl.append(w); };
    fact('Hash', hashLine(r.hash, 'file hash'));
    if (r.size != null) fact('Size', document.createTextNode(size(r.size)));
    fact('Parts', document.createTextNode(r.count ? plural(r.count, 'part') + (r.held ? ', ' + r.held + ' held' : '') + (r.stale ? ', ' + plural(r.stale, 'stale hold') : '') : 'none'));
    const lh = r.hist[r.hist.length - 1];
    fact('Last changed', document.createTextNode(lh ? lh.version + ', ' + fmt(lh.at) + ', by ' + lh.by : md.versions.length ? 'not in the recorded versions' : 'no versions recorded'));
    sheet.append(dl);
    // version scale
    if (md.versions.length) {
      const sc = el('div', 'kit-fb-scale'), sh = el('p', 'kit-fb-sh'); sh.id = 'kit-fb-sh' + n; sh.textContent = 'Versions that touched this file';
      const ol = el('ol', 'kit-fb-vs'); ol.setAttribute('aria-labelledby', sh.id);
      const hit = {}; r.hist.forEach(x => { hit[x.version] = x; });
      md.versions.forEach((c, i) => {
        const li = el('li', 'kit-fb-v' + (hit[c.version] ? ' kit-fb-v-hit' : '') + (i > md.sinceI ? ' kit-fb-v-new' : ''));
        const word = hit[c.version] ? (hit[c.version].parts.length ? plural(hit[c.version].parts.length, 'part') + ' changed' : 'file changed') : 'not touched';
        if (hit[c.version]) {
          const b = el('button', 'kit-fb-vb'); b.type = 'button'; b.setAttribute('aria-label', c.version + ', ' + fmt(c.at) + ', ' + word + (i > md.sinceI ? ', after the marked version' : '') + '. Show in History');
          b.append(el('span', 'kit-fb-dot'), el('span', 'kit-fb-vl', c.version));
          b.addEventListener('click', () => { tab = 'hist'; drawTabs(); const t = sheet.querySelector('[data-v="' + cssEsc(c.version) + '"]'); if (t) { t.focus(); } });
          li.append(b);
        } else { li.setAttribute('aria-label', c.version + ', ' + word); li.append(el('span', 'kit-fb-dot'), el('span', 'kit-fb-vl', c.version)); }
        li.title = c.version + ', ' + fmt(c.at) + ': ' + word;
        ol.append(li);
      });
      sc.append(sh, ol);
      const key = el('p', 'kit-fb-key');
      key.append(el('span', 'kit-fb-kd kit-fb-kd-hit'), document.createTextNode('touched this file  '), el('span', 'kit-fb-kd'), document.createTextNode('did not  '),
        el('span', 'kit-fb-kd kit-fb-kd-new'), document.createTextNode(md.sinceI >= md.versions.length - 1 ? 'no versions marked' : 'after ' + (md.sinceI < 0 ? 'the start' : md.versions[md.sinceI].version)));
      sc.append(key);
      sheet.append(sc);
    }
    // actions
    const act = el('div', 'kit-fb-act');
    if (o.onOpen) act.append(btn('Open file', () => o.onOpen(r.path), 'kit-fb-btn-p'));
    if (o.onCompare && lh && lh.i > 0) act.append(btn('Compare ' + prevVersion(lh.i) + ' with ' + lh.version, () => o.onCompare({ path: r.path, from: prevVersion(lh.i), to: lh.version })));
    (o.views || []).forEach(v => { if (o.onView) act.append(btn(v.label, () => o.onView(v.id, { path: r.path }), 'kit-fb-btn-v')); });
    if (act.childNodes.length) sheet.append(act);
    // tabs
    const tl = el('div', 'kit-fb-tabs'); tl.setAttribute('role', 'tablist'); tl.setAttribute('aria-label', 'About this file');
    const tabs = [['parts', 'Parts', r.count], ['hist', 'History', r.hist.length]].map(([k, t, c]) => {
      const b = el('button', 'kit-fb-tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'kit-fb-tab-' + k + n; b.setAttribute('aria-controls', 'kit-fb-pn-' + k + n); b.dataset.k = k;
      b.append(el('span', null, t), el('span', 'kit-fb-tcn', String(c))); b.addEventListener('click', () => { tab = k; drawTabs(); }); tl.append(b); return b;
    });
    tl.addEventListener('keydown', e => { const i = tabs.indexOf(document.activeElement); if (i < 0) return;
      const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (j < 0) return; e.preventDefault(); tab = tabs[j].dataset.k; drawTabs(); tabs[j].focus(); });
    const pp = el('div', 'kit-fb-pane'), ph = el('div', 'kit-fb-pane');
    pp.id = 'kit-fb-pn-parts' + n; ph.id = 'kit-fb-pn-hist' + n;
    [pp, ph].forEach((p, i) => { p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', tabs[i].id); p.tabIndex = 0; });
    drawParts(pp, r); drawHist(ph, r);
    sheet.append(tl, pp, ph);
    function drawTabs() { tabs.forEach(b => { const on = b.dataset.k === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); pp.hidden = tab !== 'parts'; ph.hidden = tab !== 'hist'; }
    drawTabs();
  }
  function drawParts(box, r) {
    if (!r.parts.length) {
      box.append(el('p', 'kit-fb-none', r.ext === 'png' || r.ext === 'jpg' || r.ext === 'svg' || r.ext === 'json' ? 'No parts. This file is published as it is; the manifest records its hash, so a change shows as a new hash and nothing finer.' : 'No parts are marked in this file. Mark them with part comments so a change can say where it happened.'));
      return;
    }
    const ul = el('ul', 'kit-fb-parts');
    r.parts.forEach(x => {
      const li = el('li', 'kit-fb-pt' + (x.rest ? ' kit-fb-pt-rest' : '') + (x.depth ? ' kit-fb-pt-sub' : '')); li.style.setProperty('--d', x.depth);
      const d = md.pdocs[x.id] || {}, hd = md.hold(x.id), tk = md.talk[x.id] || [], inDb = !x.rest && md.content[x.id];
      const lastI = md.vIndex[d.version];
      const b = el('button', 'kit-fb-pb'); b.type = 'button'; b.setAttribute('aria-expanded', String(exp.has(x.id))); b.setAttribute('aria-controls', 'kit-fb-pd-' + n + '-' + x.id.replace(/[^A-Za-z0-9_-]/g, '_'));
      b.append(glyph('chev', 'kit-fb-chev'));
      const nm = el('span', 'kit-fb-pnm');
      if (x.rest) nm.append(el('span', 'kit-fb-pt-t', 'Text outside the parts'));
      else { nm.append(el('code', 'kit-fb-pid', x.id)); if (d.title) nm.append(el('span', 'kit-fb-pt-t', d.title)); }
      b.append(nm);
      const mk = el('span', 'kit-fb-marks');
      const recent = lastI != null && lastI > md.sinceI;
      const add = (g, word, cls) => { const s = el('span', 'kit-fb-mk ' + cls); s.append(glyph(g), el('span', 'kit-fb-mw', word)); mk.append(s); };
      if (recent) add('changed', d.version, 'kit-fb-mk-ch');
      if (hd) add(hd.stale ? 'stale' : 'held', hd.stale ? 'stale' : hd.by, hd.stale ? 'kit-fb-mk-st' : 'kit-fb-mk-hd');
      if (tk.length) { const s = el('span', 'kit-fb-mk kit-fb-mk-tk'); s.append(glyph('talk'), el('span', 'kit-fb-mn', String(tk.length)), el('span', 'kit-fb-vh', tk.length === 1 ? ' open comment' : ' open comments')); mk.append(s); }
      if (inDb) { const s = el('span', 'kit-fb-mk kit-fb-mk-db'); s.append(glyph('db'), el('span', 'kit-fb-vh', ' copy in the database')); s.title = 'Copy lives in content/' + x.id; mk.append(s); }
      b.append(mk);
      const det = el('div', 'kit-fb-pdet'); det.id = b.getAttribute('aria-controls'); det.hidden = !exp.has(x.id);
      const dl = el('dl', 'kit-fb-pfacts'), f = (k, v) => { const w = el('div'); const dd = el('dd'); dd.append(v); w.append(el('dt', null, k), dd); dl.append(w); };
      if (x.rest) det.append(el('p', 'kit-fb-psum', 'Everything in this file outside every marked part, hashed as one. A change here still changes the page hash, but no part can say where.'));
      else if (d.summary) det.append(el('p', 'kit-fb-psum', d.summary));
      f('Hash', hashLine(md.hashes[x.id] || d.hash || '', 'part hash'));
      if (d.version) f('Last changed', document.createTextNode(d.version + ', ' + fmt(d.at) + (d.by ? ', by ' + d.by : '')));
      if (!x.rest && d.parent) f('Inside', el('code', null, d.parent));
      if (hd) f(hd.stale ? 'Stale hold' : 'Held by', document.createTextNode(hd.stale ? hd.by + ', ran out ' + fmt(hd.until) + '. Ask them, or the person who runs them, before you take it.' : hd.by + (hd.until ? ' until ' + fmt(hd.until) : '') + '. Hands off until it is released.'));
      if (inDb) f('Copy', document.createTextNode('In the database as content/' + x.id + '. A wording fix is a write there, with no republish.'));
      det.append(dl);
      if (tk.length) {
        const tl = el('ul', 'kit-fb-talk'); tl.setAttribute('aria-label', 'Open comments');
        tk.forEach(t => { const tli = el('li'); tli.append(el('span', 'kit-fb-tst kit-fb-tst-' + (t.status === 'working' ? 'w' : 'o'), t.status === 'working' ? 'Being worked on' + (t.holder ? ' by ' + t.holder : '') : 'Open'), el('span', null, t.note || t.id)); tl.append(tli); });
        det.append(tl);
      }
      if (o.onPart && !x.rest) { const pa = el('div', 'kit-fb-act'); pa.append(btn('Show on the page', () => o.onPart(x.id, r.path))); det.append(pa); }
      b.addEventListener('click', () => { const on = !exp.has(x.id); if (on) exp.add(x.id); else exp.delete(x.id); b.setAttribute('aria-expanded', String(on)); det.hidden = !on; });
      li.append(b, det); ul.append(li);
    });
    box.append(ul);
  }
  function drawHist(box, r) {
    if (!r.hist.length) {
      box.append(el('p', 'kit-fb-none', md.versions.length ? (r.count ? 'No recorded version touched this file.' : 'This file holds no parts, so changes/ cannot say when it changed. Pass the version manifests and its own hash per version shows here.') : 'No versions are recorded yet.'));
      return;
    }
    const ol = el('ol', 'kit-fb-hist');
    r.hist.slice().reverse().forEach(x => {
      const li = el('li', 'kit-fb-hi' + (x.i > md.sinceI ? ' kit-fb-hi-new' : '')); li.dataset.v = x.version; li.tabIndex = -1;
      const top = el('p', 'kit-fb-htop'); top.append(el('span', 'kit-fb-hv', x.version), el('span', 'kit-fb-hm', fmt(x.at, true) + (x.by ? ', ' + x.by : '')));
      if (x.i > md.sinceI) top.append(el('span', 'kit-fb-hn', 'after ' + (md.sinceI < 0 ? 'the start' : md.versions[md.sinceI].version)));
      li.append(top);
      if (x.summary) li.append(el('p', 'kit-fb-hs', x.summary));
      const ul = el('ul', 'kit-fb-hp');
      x.parts.forEach(p => {
        const pi = el('li', 'kit-fb-hk-' + p.kind);
        pi.append(el('span', 'kit-fb-hk', p.kind), p.id.startsWith(REST) ? el('span', 'kit-fb-pt-t', 'text outside the parts') : el('code', 'kit-fb-pid', p.id));
        const hs = el('span', 'kit-fb-hh'); hs.append(el('code', null, short(p.from)), el('span', 'kit-fb-ar', ' to '), el('code', null, short(p.to))); pi.append(hs); ul.append(pi);
      });
      if (x.file && !x.parts.length) { const pi = el('li', 'kit-fb-hk-changed'); pi.append(el('span', 'kit-fb-hk', x.file.from ? 'changed' : 'added'), el('span', 'kit-fb-pt-t', 'the file itself'));
        const hs = el('span', 'kit-fb-hh'); hs.append(el('code', null, short(x.file.from)), el('span', 'kit-fb-ar', ' to '), el('code', null, short(x.file.to))); pi.append(hs); ul.append(pi); }
      li.append(ul);
      if (o.onCompare && x.i > 0) { const a = el('div', 'kit-fb-act'); a.append(btn('Compare ' + prevVersion(x.i) + ' with ' + x.version, () => o.onCompare({ path: r.path, from: prevVersion(x.i), to: x.version }))); li.append(a); }
      ol.append(li);
    });
    box.append(ol);
  }
  // ---------------------------------------------------------------- select, layout
  function pick(path, user, focusSheet) {
    if (!md.rows[path]) return;
    const changed = sel !== path; sel = path;
    if (changed) { const s = path.split('/'); for (let i = 1; i < s.length; i++) open.add(s.slice(0, i).join('/')); }
    tree.querySelectorAll('[data-path]').forEach(li => li.setAttribute('aria-selected', String(li.dataset.path === path)));
    tree.querySelectorAll('[data-dir]').forEach(li => li.classList.toggle('kit-fb-on', onPath(li.dataset.dir)));
    if (changed) exp.clear();
    if (root.classList.contains('kit-fb-narrow') && focusSheet) narrowSheet = true;
    drawSheet(); layout();
    if (user) { say(path + ': ' + (md.rows[path].count ? plural(md.rows[path].count, 'part') : 'no parts')); if (o.onSelect) o.onSelect(path); }
    if (focusSheet && root.classList.contains('kit-fb-narrow')) { const h = sheet.querySelector('.kit-fb-title'); if (h) h.focus(); }
  }
  function layout() {
    const nw = root.classList.contains('kit-fb-narrow');
    treeBox.hidden = nw && narrowSheet && !!sel;
    sheet.hidden = nw && !(narrowSheet && sel);
  }
  fi.addEventListener('input', () => { q = fi.value.trim().toLowerCase(); drawTree(); say(countVisible() + ' of ' + Object.keys(md.rows).length + ' files shown'); });
  ss.addEventListener('change', () => { setSince(ss.value, true); if (o.onSince) o.onSince(ss.value === '__all' ? '' : ss.value === '__none' ? (md.versions[md.versions.length - 1] || {}).version || '' : ss.value); });
  function setSince(v, user) {
    o.since = v; md = model(o); drawSince(); drawTree(); syncChips(); drawSheet(); layout();
    if (user) { const c = Object.values(md.rows).filter(r => r.recent).length; say(c ? plural(c, 'file') + ' changed after ' + (md.sinceI < 0 ? 'the start' : md.versions[md.sinceI].version) : 'No changes marked'); }
  }
  let wasNarrow = null;
  const narrow = () => { const w = root.getBoundingClientRect().width, rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, nw = w > 0 && w < 46 * rem;
    if (nw === wasNarrow) return; wasNarrow = nw; root.classList.toggle('kit-fb-narrow', nw); drawSheet(); layout(); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(narrow) : null; if (ro) ro.observe(root);
  drawSince(); drawTree(); syncChips(); drawSheet(); narrow(); layout();
  return {
    select(path) { if (md.rows[path]) { pick(path, false, false); const li = tree.querySelector('[data-path="' + cssEsc(path) + '"]'); if (!li) drawTree(); else roving(li); } },
    update(data) {
      o = Object.assign({}, o, data || {}); md = model(o);
      if (sel && !md.rows[sel]) sel = null; drawSince(); drawTree(); syncChips(); drawSheet(); layout();
      say('Updated: ' + plural(Object.keys(md.rows).length, 'file'));
    },
    setSince(v) { setSince(v == null || v === '' ? '__all' : v === (md.versions[md.versions.length - 1] || {}).version ? '__none' : v, false); },
    destroy() { if (ro) ro.disconnect(); clearTimeout(sayT); root.textContent = ''; root.classList.remove('kit-fb', 'kit-fb-narrow'); },
  };
}
Kit.fileBrowser = Object.freeze({ mount });
})();
/* /part:page.script.kit.file-browser */
