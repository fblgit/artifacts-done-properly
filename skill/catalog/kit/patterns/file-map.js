/* part:page.script.kit.file-map */
/**
 * File map
 * Kit.fileMap.mount(root, {manifest, sizes, parts, changes, threads, since, measure, selected, onSelect}) draws a squarified map: a block per folder, a tile per file, its area its share of the bytes (or, with the Bytes and Parts toggle, of the parts; a file without parts counts as one). A tile changed after the chosen version is hatched and carries a diamond, a held one a dashed edge and a lock, a stale hold a dotted edge and an open lock, and open comments a count; a legend names each mark. A line of text gives the totals and the largest file with its share, for anyone who does not read the map. Tiles are buttons with a full description as their name: arrow keys move to the nearest tile in that direction, Home and End to the ends, Enter selects, and the selected tile and its folder are ringed by the seam. The map redraws to its width (taller than wide below 520 px). Pair it with layout.file-browser: each one's onSelect calls the other's select().
 *
 * Every published file of an ADP artifact at once, as a map whose areas are true to scale: each folder is a block and each file a tile, its area its share of the bytes (or of
 * the parts, switched by a toggle). A tile changed after the chosen version is hatched and carries a diamond, a held one a lock, a stale hold an open lock, and open comments a count, so a
 * reader sees where the weight sits and where the work is before opening anything. The largest file and the totals are said in a line of text, for anyone who does not read the map.
 * Tiles are buttons: arrow keys move to the nearest tile in that direction, Home and End to the first and last, Enter or Space selects. The selected tile is ringed by the seam.
 *
 * API:
 *   Kit.fileMap.mount(root, opts) -> {select(path), update(data), setSince(version), setMeasure("bytes"|"parts"), destroy()}
 *     manifest   {files: {path: hash}, part_file: {id: path}, parents}     sizes  {path: bytes}; a file without a size counts as 0 bytes, and the line says how many have none
 *     parts      the parts/<id> docs ({id: doc} or [{id, ...}]) for holder and hold_until     changes  the changes/ docs [{version, at, parts: [{id}]}]
 *     threads    the threads/ docs {id: {part, status}}     since  the version after which changes are marked (default: the one before the latest; "" marks every change)
 *     measure    "bytes" (default) or "parts" (a file without parts counts as one)     selected  a path     now  ISO or Date for holds     label  the map's name (default "File map")
 *     onSelect(path)  called when the reader picks a tile; select() never calls it
 * Methods of what Kit.fileMap.mount returns: select(path), update(data), setSince(version), setMeasure(measure)
 *
 * @id        pattern.file-map
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   Every published file at once, its area true to its share of the bytes or the parts, with changed, held and commented files marked, so the weight and the work show before anything is opened.
 * @tags      files, treemap, map, bytes, size, parts, holds, changed, adp/2, overview
 * @requires  kit.tokens, kit.dom
 * @files     kit/patterns/file-map.css, kit/samples/file-browser.json
 * @provides  Kit.fileMap.mount
 * @related   layout.file-browser
 * @config    Kit.fileMap.mount(root, opts) | manifest {files, part_file}, sizes {path: bytes}, parts {id: parts doc}, changes [changes docs], threads {id: threads doc}, since ("" marks every change), measure bytes | parts, selected, now, label, onSelect(path); returns {select, update, setSince, setMeasure, destroy}
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-soft --warn --danger --f-ui --f-mono --seam? --radius?
 * @globals   none
 * @db        reads manifest/current; parts; changes; threads / note The pattern does not read the db itself: the page passes the docs in.
 * @source    Catalog batch 15, 2026-10-26 | the size view of a disk usage tool | nested rectangles whose area is the bytes
 * @source    Catalog batch 15, 2026-10-26 | skills/artifact-dataplane/scripts/adp.py manifest() and diff() | the adp/2 manifest the tree is drawn from, and added, changed, removed
 * @preview   {"render": "pattern.file-map", "samples": ["kit/samples/file-browser.json"]}
 * @changed   Areas use the squarified layout so tiles stay near square.
 * @changed   Marks are shapes and words as well as colour.
 * @changed   The map is walked by direction with the arrow keys.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const el = Kit.dom.el;
const G = {
  changed: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" fill="currentColor"/>',
  held: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  stale: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.8"/>',
  talk: '<path d="M4.5 5.5h15v10.5h-9l-4.5 3.5v-3.5H4.5z"/>',
};
function glyph(name) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.setAttribute('class', 'kit-fm-g'); s.innerHTML = G[name]; return s; }
const size = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(1) + ' MB';
const pct = f => f >= 0.995 ? '100%' : f >= 0.095 ? Math.round(f * 100) + '%' : f >= 0.001 ? (f * 100).toFixed(1) + '%' : 'under 0.1%';
const asMap = x => Array.isArray(x) ? x.reduce((m, d) => { if (d && d.id) m[d.id] = d; return m; }, {}) : (x || {});
const plural = (n, one) => n + ' ' + (n === 1 ? one : one + 's');
let uid = 0;

function squarify(items, x, y, w, h) {
  const out = [], total = items.reduce((s, i) => s + i.w, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = w * h / total; let rest = items.filter(i => i.w > 0).map(i => ({ i, a: i.w * scale }));
  const worst = (row, side) => { let s = 0, mx = 0, mn = Infinity; row.forEach(r => { s += r.a; mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); }); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
  while (rest.length) {
    const side = Math.min(w, h); let k = 1;
    while (k < rest.length && worst(rest.slice(0, k + 1), side) <= worst(rest.slice(0, k), side)) k++;
    const row = rest.slice(0, k), s = row.reduce((t, r) => t + r.a, 0), th = s / side;
    if (w >= h) { let yy = y; row.forEach(r => { const hh = r.a / th; out.push({ item: r.i, x, y: yy, w: th, h: hh }); yy += hh; }); x += th; w -= th; }
    else { let xx = x; row.forEach(r => { const ww = r.a / th; out.push({ item: r.i, x: xx, y, w: ww, h: th }); xx += ww; }); y += th; h -= th; }
    rest = rest.slice(k);
  }
  return out;
}

function model(o) {
  const m = o.manifest || {}, files = m.files || {}, pf = m.part_file || {}, pdocs = asMap(o.parts), threads = asMap(o.threads);
  const now = o.now ? new Date(o.now).getTime() : Date.now();
  const versions = (o.changes || []).filter(c => c && c.version).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const vi = {}; versions.forEach((c, i) => { vi[c.version] = i; });
  const sinceI = o.since === '' ? -1 : o.since != null && o.since in vi ? vi[o.since] : versions.length - 2;
  const fileOf = id => pf[id] || (pdocs[id] && pdocs[id].file) || (id.indexOf('_rest:') === 0 ? id.slice(6) : '');
  const recent = new Set(); versions.forEach((c, i) => { if (i > sinceI) (c.parts || []).forEach(x => { const f = fileOf(x.id); if (f) recent.add(f); }); });
  const count = {}, held = {}, stale = {}, talk = {};
  Object.keys(pf).forEach(id => { if (id.indexOf('_rest:') !== 0) count[pf[id]] = (count[pf[id]] || 0) + 1; });
  Object.keys(pdocs).forEach(id => { const d = pdocs[id], f = fileOf(id); if (!d || !d.holder || !f) return; const t = d.hold_until ? new Date(d.hold_until).getTime() : Infinity; if (t > now) held[f] = (held[f] || 0) + 1; else stale[f] = (stale[f] || 0) + 1; });
  Object.keys(threads).forEach(t => { const d = threads[t]; if (d && d.part && d.status !== 'done') { const f = fileOf(d.part); if (f) talk[f] = (talk[f] || 0) + 1; } });
  const rows = Object.keys(files).sort().map(path => ({ path, dir: path.lastIndexOf('/') < 0 ? '' : path.slice(0, path.lastIndexOf('/')), bytes: o.sizes && o.sizes[path] != null ? o.sizes[path] : null,
    parts: count[path] || 0, recent: recent.has(path), held: held[path] || 0, stale: stale[path] || 0, talk: talk[path] || 0 }));
  return { rows, versions, sinceI };
}

function mount(root, opts) {
  let o = Object.assign({ label: 'File map', measure: 'bytes' }, opts);
  const n = ++uid; let md = model(o), sel = o.selected || null, rects = [];
  root.textContent = ''; root.classList.add('kit-fm');
  const head = el('div', 'kit-fm-head'), h = el('p', 'kit-fm-h', o.label); h.id = 'kit-fm-h' + n;
  const seg = el('div', 'kit-fm-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Area shows');
  const mb = [['bytes', 'Bytes'], ['parts', 'Parts']].map(([k, t]) => { const b = el('button', 'kit-fm-sb', t); b.type = 'button'; b.dataset.k = k; b.addEventListener('click', () => { setMeasure(k, true); }); seg.append(b); return b; });
  head.append(h, seg);
  const line = el('p', 'kit-fm-line'); line.id = 'kit-fm-l' + n;
  const box = el('div', 'kit-fm-box'); box.setAttribute('role', 'group'); box.setAttribute('aria-labelledby', h.id); box.setAttribute('aria-describedby', line.id);
  const legend = el('ul', 'kit-fm-legend'); legend.setAttribute('aria-label', 'Marks on the map');
  const live = el('p', 'kit-fm-live'); live.setAttribute('role', 'status');
  root.append(head, line, box, legend, live);
  let sayT = 0; const say = t => { clearTimeout(sayT); live.textContent = ''; sayT = setTimeout(() => { live.textContent = t; }, 40); };
  const weight = r => o.measure === 'parts' ? Math.max(1, r.parts) : (r.bytes || 0);
  function drawLegend() {
    legend.textContent = '';
    const add = (cls, g, t) => { const li = el('li'), sw = el('span', 'kit-fm-sw ' + cls); if (g) sw.append(glyph(g)); li.append(sw, el('span', null, t)); legend.append(li); };
    const since = md.sinceI >= md.versions.length - 1 ? '' : md.sinceI < 0 ? 'the start' : md.versions[md.sinceI].version;
    add('kit-fm-sw-ch', 'changed', since ? 'changed after ' + since : 'no changes marked');
    add('kit-fm-sw-hd', 'held', 'held by an agent'); add('kit-fm-sw-st', 'stale', 'hold ran out'); add('kit-fm-sw-tk', 'talk', 'open comments'); add('kit-fm-sw-on', null, 'selected');
  }
  function draw() {
    box.textContent = ''; rects = [];
    mb.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === o.measure)));
    const rows = md.rows, total = rows.reduce((s, r) => s + weight(r), 0);
    const totalBytes = rows.reduce((s, r) => s + (r.bytes || 0), 0), noSize = rows.filter(r => r.bytes == null).length;
    if (!rows.length || !total) { line.textContent = rows.length ? 'No file has a size yet, so the map has nothing to draw. Switch to Parts, or pass sizes.' : 'The manifest lists no files yet.'; box.classList.add('kit-fm-box-empty'); box.style.height = ''; return; }
    box.classList.remove('kit-fm-box-empty');
    const big = rows.slice().sort((a, b) => weight(b) - weight(a))[0];
    line.textContent = plural(rows.length, 'file') + ', ' + size(totalBytes) + (o.measure === 'parts' ? ', ' + plural(rows.reduce((s, r) => s + r.parts, 0), 'part') : '') + '. Largest: ' + big.path + ', ' + pct(weight(big) / total) + ' of the ' + (o.measure === 'parts' ? 'parts' : 'bytes') + '.' + (noSize && o.measure === 'bytes' ? ' ' + plural(noSize, 'file') + ' without a size are left out.' : '');
    const W = box.clientWidth || 600, H = Math.round(Math.max(240, Math.min(560, W < 520 ? W * 1.5 : W * 0.52)));
    box.style.height = H + 'px';
    const dirs = new Map(); rows.forEach(r => { if (!dirs.has(r.dir)) dirs.set(r.dir, []); dirs.get(r.dir).push(r); });
    const blocks = [...dirs.entries()].map(([d, rs]) => ({ d, rs, w: rs.reduce((s, r) => s + weight(r), 0) })).sort((a, b) => b.w - a.w || a.d.localeCompare(b.d));
    squarify(blocks, 0, 0, W, H).forEach(b => {
      const pad = 3, lab = b.w > 70 && b.h > 56 ? 20 : 0;
      const f = el('div', 'kit-fm-dir' + (sel && (sel.lastIndexOf('/') < 0 ? '' : sel.slice(0, sel.lastIndexOf('/'))) === b.item.d ? ' kit-fm-dir-on' : ''));
      f.dataset.dir = b.item.d; Object.assign(f.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
      if (lab) { const fl = el('span', 'kit-fm-dl', (b.item.d || 'top level') + (b.item.d ? '/' : '')); fl.setAttribute('aria-hidden', 'true'); f.append(fl); }
      box.append(f);
      const items = b.item.rs.map(r => ({ r, w: weight(r) })).sort((a, c) => c.w - a.w || a.r.path.localeCompare(c.r.path));
      squarify(items, b.x + pad, b.y + pad + lab, b.w - 2 * pad, b.h - 2 * pad - lab).forEach(t => {
        const r = t.item.r, tile = el('button', 'kit-fm-t' + (r.recent ? ' kit-fm-t-ch' : '') + (r.held ? ' kit-fm-t-hd' : r.stale ? ' kit-fm-t-st' : ''));
        tile.type = 'button'; tile.dataset.path = r.path; tile.tabIndex = -1;
        const g = 1.5; Object.assign(tile.style, { left: (t.x + g) + 'px', top: (t.y + g) + 'px', width: Math.max(2, t.w - 2 * g) + 'px', height: Math.max(2, t.h - 2 * g) + 'px' });
        if (r.path === sel) tile.setAttribute('aria-current', 'true');
        const share = pct(weight(r) / total);
        tile.setAttribute('aria-label', r.path + ', ' + (r.bytes != null ? size(r.bytes) : 'no size') + ', ' + share + ' of the ' + (o.measure === 'parts' ? 'parts' : 'bytes') + ', ' + (r.parts ? plural(r.parts, 'part') : 'no parts')
          + (r.recent ? ', changed' : '') + (r.held ? ', held' : r.stale ? ', stale hold' : '') + (r.talk ? ', ' + plural(r.talk, 'open comment') : ''));
        tile.title = r.path + '\n' + (r.bytes != null ? size(r.bytes) + ', ' : '') + share;
        const big = t.w > 64 && t.h > 34, mid = t.w > 30 && t.h > 22;
        if (big) { tile.append(el('span', 'kit-fm-tn', r.path.split('/').pop())); if (t.h > 52) tile.append(el('span', 'kit-fm-ts', o.measure === 'parts' ? (r.parts ? plural(r.parts, 'part') : 'no parts') : (r.bytes != null ? size(r.bytes) : '') + ', ' + share)); }
        if (mid) {
          const mk = el('span', 'kit-fm-mk');
          if (r.recent) mk.append(glyph('changed'));
          if (r.held) mk.append(glyph('held')); else if (r.stale) mk.append(glyph('stale'));
          if (r.talk) { const s = el('span', 'kit-fm-tk'); s.append(glyph('talk'), el('span', null, String(r.talk))); mk.append(s); }
          if (mk.childNodes.length) tile.append(mk);
        }
        tile.addEventListener('click', () => pick(r.path, true));
        box.append(tile); rects.push({ path: r.path, el: tile, cx: t.x + t.w / 2, cy: t.y + t.h / 2 });
      });
    });
    roving();
  }
  function roving(focus) { const cur = rects.find(r => r.path === sel) || rects[0]; rects.forEach(r => { r.el.tabIndex = r === cur ? 0 : -1; }); if (focus && cur) cur.el.focus(); }
  function pick(path, user) {
    if (!md.rows.some(r => r.path === path)) return;
    sel = path; rects.forEach(r => { if (r.path === path) r.el.setAttribute('aria-current', 'true'); else r.el.removeAttribute('aria-current'); });
    const d = path.lastIndexOf('/') < 0 ? '' : path.slice(0, path.lastIndexOf('/'));
    [...box.querySelectorAll('.kit-fm-dir')].forEach(f => f.classList.toggle('kit-fm-dir-on', f.dataset.dir === d));
    roving();
    if (user) { say('Selected ' + path); if (o.onSelect) o.onSelect(path); }
  }
  box.addEventListener('keydown', e => {
    const i = rects.findIndex(r => r.el === document.activeElement); if (i < 0) return;
    const c = rects[i]; let best = null, bd = Infinity;
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); best = e.key === 'Home' ? rects[0] : rects[rects.length - 1]; }
    else if (dir) {
      e.preventDefault();
      rects.forEach(r => { if (r === c) return; const dx = r.cx - c.cx, dy = r.cy - c.cy, along = dx * dir[0] + dy * dir[1]; if (along <= 1) return; const off = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]); const d = along + off * 2; if (d < bd) { bd = d; best = r; } });
    } else return;
    if (best) { rects.forEach(r => { r.el.tabIndex = r === best ? 0 : -1; }); best.el.focus(); }
  });
  function setMeasure(k, user) { if (k !== 'bytes' && k !== 'parts') return; o.measure = k; const f = box.contains(document.activeElement); draw(); if (f) roving(true); if (user) say('Area shows ' + (k === 'parts' ? 'parts' : 'bytes')); }
  let lastW = 0;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const w = box.clientWidth; if (Math.abs(w - lastW) > 1) { lastW = w; const f = box.contains(document.activeElement); draw(); if (f) roving(true); } }) : null;
  if (ro) ro.observe(box);
  drawLegend(); draw();
  return {
    select(path) { pick(path, false); },
    update(data) { o = Object.assign({}, o, data || {}); md = model(o); if (sel && !md.rows.some(r => r.path === sel)) sel = null; drawLegend(); draw(); },
    setSince(v) { o.since = v == null ? '' : v; md = model(o); drawLegend(); draw(); },
    setMeasure(k) { setMeasure(k, false); },
    destroy() { if (ro) ro.disconnect(); clearTimeout(sayT); root.textContent = ''; root.classList.remove('kit-fm'); },
  };
}
Kit.fileMap = Object.freeze({ mount });
})();
/* /part:page.script.kit.file-map */
