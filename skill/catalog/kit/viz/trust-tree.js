/* part:page.script.kit.viz.trust-tree */
/**
 * Trust tree
 * A family tree for anything that signs something else: a root, the authorities it signed, and what they signed. Each authority is a medallion (a lit disc, a gold rim, a ring that is the life it has left); what it signed hangs beneath in fans of seven, grouped by kind, each kind a shape (dot, ring, square, diamond) so colour stays for state. Hover, focus or pick a medallion and its chain up to the root lights: the seams on the chain thicken and glow, everything else dims, and a caption narrates it in a sentence. The keyboard model is a roving tab stop (arrows move, Up goes to the parent, Down to the first child, Enter opens). A stand-alone authority with no parent sits on the second row under a dotted ghost. Around the tree, each part optional and driven by the data: the hardware keys that hold the authorities (slot buttons light their authority), the 'who may sign what' buttons, a card of limits for each kind, and subject lanes that light everything one thing holds. handle.chainEl(id) is the breadcrumb of hops from a medallion to the root; handle.detailEl(id) is the content for the host's drawer (facts tagged read, inferred or by design keep what was read apart from what was worked out). Under 640px the drawing is replaced by a nested list. Every name is data: the sample is a made-up company.
 *
 * API:
 *   Kit.trustTree.mount(box, opts) -> handle
 *     opts   { authorities, leaves, kinds, groups, holders, enum: "life", perRow: 7, gap: 44, compact: "auto" | true | false, compactBelow: 640, sections, titles, captions, legend: true,
 *              label, host, onOpen(id, opener) }
 *              authorities  [{id, name, parent, sub, glyph, state, life, left, ghost, r, x, y, facts, chips, caps}]
 *                             parent is an authority id or null; the first parentless authority is the root, later ones are stand-alone. state is a value of the enum (default "life"); life
 *                             (0 to 1) is the ring; left is the text for the time left ("5 years left"); glyph a Kit.vocab glyph for the medallion; r, x, y override the layout
 *              leaves       [{id, authority, kind, label, state, life, left, short, subject, group, facts, chips, caps}]   short: true draws a dashed disc with no ring (ends by design)
 *              kinds        {key: {label, short, plural, mark: "dot" | "ring" | "square" | "diamond", authority, limits: [text], glyph}}   mark is the kind's shape on the leaf; authority is the id
 *                             that signs this kind (for the passes); the order of keys is the drawing order
 *              groups       [{id, label, sub, glyph}]   lanes; a leaf names its group and its subject (the pill's text)
 *              holders      [{id, label, serial, slots: [{authority, slot}]}], holdersNote
 *              sections     which parts to draw, default ["holders","tree","passes","limits","lanes"] (a part with no data is left out)
 *              titles       {holders: {title, lede}, tree: …, limits: …, lanes: …}
 *              captions     {idle, authority(a), leaf(l, chain), kind(k, n), subject(name, n), cap(c)} each returns a sentence; defaults narrate the chain
 *              onOpen       called with the id and the element that opened it (a medallion, a slot, a list button); the host opens its drawer (kit.drawer) with handle.detailEl(id)
 *     handle   { light(spec), clear(), pin(id|null), focus(id), chainOf(id) -> [id], chainEl(id) -> Element, detailEl(id, {onAction}) -> Element, update(patch), destroy() }
 *              light({id} | {ids:[…]} | {kind} | {subject: [leaf ids], label} | {cap: key}) lights without opening; clear() removes it; pin(id) holds a chain lit (pin(null) when the host's
 *              drawer closes); focus(id) moves keyboard focus to a medallion
 *   Kit.trustTree.chainEl(id) -> Element   the chain breadcrumb of the last mounted tree (see handle.chainEl)
 *     The chain: one row for each step (root last), each a button, joined by a gold hop; the first is marked "this one".
 *   detailEl(id) builds the detail for a drawer: head, state pill and time left, the chain, the facts as a list (each fact [label, value, tag]; tag read | inferred | design draws a .kit-mark
 *     so what was read and what was worked out stay apart), and a button to light everything the authority signs.
 * Layout rule: the tree is laid out from the data (override with x, y, r). Fans of perRow leaves, gap apart, rows 60 apart, grouped by kind; rows grow the viewBox. Between a parent and a
 * child: a seam that leaves the parent downward and enters the child from above. The tree needs about 760px; narrower, it scrolls inside its own box, or (compact) shows the nested list.
 *
 * Also load kit/vocab.css, kit/glaze-surfaces.css and kit/callout.css.
 * Also needs kit.drawer (the host's detail drawer; optional at run time).
 *
 * @id        viz.trust-tree
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A signing hierarchy drawn as porcelain medallions on gold seams: pick or hover one and the chain up to the root lights; arrow keys walk it; phones get a nested list.
 * @tags      trust, tree, hierarchy, certificate, authority, signing, chain, medallion, seam, keyboard, porcelain
 * @requires  viz.seal, kit.vocab, kit.callout, kit.glaze-surfaces, theme.glaze-depth
 * @files     kit/viz/trust-tree.css, kit/samples/viz.json
 * @provides  Kit.trustTree.mount, Kit.trustTree.chainEl
 * @config    Kit.trustTree.mount(box, {authorities, leaves, kinds, groups, holders, captions, onOpen}) | authorities [{id, name, parent, sub, glyph, state, life, left, ghost, caps, facts}], leaves [{id, authority, kind, label, state, life, left, short, subject, group, facts}], kinds {key: {label, short, plural, mark, authority, limits}}; layout is computed (override with x, y, r)
 * @config    onOpen(id, opener) | the host opens its detail (kit.drawer) with handle.detailEl(id); handle.pin(null) when it closes
 * @config    states | values of the Kit.vocab enum 'life' (viz.seal defines it): ok, soon, urgent, expired, revoked, ended, replaced, unknown
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --accent-ink --f-display? --f-mono --seam? --seam-<n>? --pebble-hi? --rim? --pool? --ink-3 --glz-r-l? --glz-r-m? --glz-sh-1? --hi? --shade? --sunk-2?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's certificate trust page | the medallion family tree with gold seams, the lit chain, the roving-focus keyboard, the phone stack
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's certificate trust page | hardware-key holders, who may sign what, subject lanes, limits pebbles, the chain breadcrumb with hops, the detail content
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's trust page stylesheet | tree, medallions, seams, stack, lanes, passes
 * @preview   {"render": "viz.trust-tree", "samples": ["kit/samples/viz.json#trust-tree"], "uses": ["viz.capability-wheel", "kit.drawer"]}
 * @changed   Authorities, kinds, groups, holders and every sentence are config; the source had its own hierarchy, names and name-matching rules built in.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
let uid = 0, last = null;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
const r1 = n => Math.round(n * 10) / 10;
const DEF = { authorities: [], leaves: [], kinds: {}, groups: [], holders: [], enum: 'life', perRow: 7, gap: 44, compact: 'auto', compactBelow: 640, legend: true, label: 'Family tree of signing authorities',
  sections: ['holders', 'tree', 'passes', 'limits', 'lanes'], titles: {}, captions: {} };
const TITLES = { holders: { title: 'Where the keys live' }, tree: { title: 'The family tree' }, limits: { title: 'Who may sign what' }, lanes: { title: 'Who and what holds them' } };

function mount(box, opts) {
  let o = Object.assign({}, DEF, opts), alive = true, ro = null;
  const st = { filter: null, pinned: null, hover: null, subj: null, subjKey: null, subjLabel: '', cap: null };
  let auth = {}, leaves = [], byId = new Map(), els = new Map(), order = [], kids = {}, treeSvg = null, tipEl = null, caption = null, scroll = null, stack = null, keysEl = null;
  let passBtns = [], laneBtns = [], root = null, geom = null;

  const V = () => Kit.vocab;
  const rowOf = x => { const v = V(); return (v && v.get(o.enum, x.state)) || null; };
  const wordOf = x => { const r = rowOf(x); return r ? r.word : String(x.state || ''); };
  const kindOf = l => o.kinds[l.kind] || { label: l.kind, short: l.kind, plural: l.kind + 's', mark: 'dot' };
  const nameOf = id => (auth[id] ? auth[id].name : byId.get(id) ? byId.get(id).label : id);
  const glyphOf = x => x.glyph || (x.authority ? (kindOf(x).glyph || null) : null) || 'diamond';

  /* ---- data */
  function prepare() {
    auth = {}; kids = {};
    o.authorities.forEach(a => { auth[a.id] = Object.assign({ r: null }, a); kids[a.id] = []; });
    Object.values(auth).forEach(a => { if (a.parent && auth[a.parent]) kids[a.parent].push(a.id); });
    leaves = o.leaves.map(l => Object.assign({}, l)); byId = new Map(leaves.map(l => [l.id, l]));
  }
  function chainOf(id) {
    if (auth[id]) { const out = [id]; let p = auth[id].parent; while (p && auth[p]) { out.push(p); p = auth[p].parent; } return out; }
    const l = byId.get(id); return l ? [id].concat(chainOf(l.authority)) : [id];
  }
  const rootIds = () => Object.values(auth).filter(a => !a.parent || !auth[a.parent]).map(a => a.id);

  /* ---- layout */
  function layout() {
    const per = o.perRow, gap = o.gap, kindKeys = Object.keys(o.kinds);
    const leavesOf = id => leaves.filter(l => l.authority === id);
    const rowsOf = id => {
      const mine = leavesOf(id), by = {}; mine.forEach(l => { (by[l.kind] = by[l.kind] || []).push(l); });
      const keys = kindKeys.filter(k => by[k]).concat(Object.keys(by).filter(k => !kindKeys.includes(k))), rows = [];
      keys.forEach(k => { for (let i = 0; i < by[k].length; i += per) rows.push(by[k].slice(i, i + per)); }); return rows;
    };
    const roots = rootIds(), main = roots[0], rad = a => a.r || (a.id === main ? 50 : 38);
    const depth = {}; (function walk(id, d) { depth[id] = d; kids[id].forEach(k => walk(k, d + 1)); })(main, 0);
    roots.slice(1).forEach(id => (function walk(i, d) { depth[i] = d; kids[i].forEach(k => walk(k, d + 1)); })(id, 1));
    const maxD = Math.max(0, ...Object.values(depth)), Y = [];
    for (let d = 0; d <= maxD; d++) {
      if (d === 0) { Y[0] = 80; continue; }
      const above = Object.values(auth).filter(a => depth[a.id] === d - 1 && kids[a.id].length && leavesOf(a.id).length);
      const extra = above.length ? 60 * Math.max(...above.map(a => rowsOf(a.id).length)) + 20 : 0;
      Y[d] = Y[d - 1] + 172 + extra;
    }
    const W = {};
    (function size(id) { const a = auth[id], fan = Math.min(per, Math.max(0, ...rowsOf(id).map(r => r.length), 0)) * gap + 40, ch = kids[id].map(size).reduce((n, w) => n + w, 0); W[id] = Math.max(fan, ch, 300); return W[id]; })(main);
    roots.slice(1).forEach(function size(id) { const fan = Math.min(per, Math.max(0, ...rowsOf(id).map(r => r.length), 0)) * gap + 40, ch = kids[id].map(size).reduce((n, w) => n + w, 0); W[id] = Math.max(fan, ch, 300); return W[id]; });
    let cursor = 0;
    const place = (id, left) => {
      const a = auth[id]; let x;
      if (kids[id].length) { let l = left; const xs = kids[id].map(k => { const px = place(k, l); l += W[k]; return px; }); x = (xs[0] + xs[xs.length - 1]) / 2; }
      else x = left + W[id] / 2;
      a._x = x; a._y = Y[depth[id]]; a._r = rad(a); return x;
    };
    place(main, cursor); cursor += W[main];
    roots.slice(1).forEach(id => { place(id, cursor); cursor += W[id]; });
    Object.values(auth).forEach(a => { if (a.x != null) a._x = a.x; if (a.y != null) a._y = a.y; });
    let maxY = 0, maxX = 0, minX = 1e9;
    Object.values(auth).forEach(a => { maxX = Math.max(maxX, a._x + a._r + 14 + 190); minX = Math.min(minX, a._x - a._r); maxY = Math.max(maxY, a._y + a._r); });
    Object.values(auth).forEach(a => {
      rowsOf(a.id).forEach((row, ri) => row.forEach((l, i) => { l._x = a._x + (i - (row.length - 1) / 2) * gap; l._y = a._y + a._r + 82 + ri * 60; maxY = Math.max(maxY, l._y); minX = Math.min(minX, l._x - 20); maxX = Math.max(maxX, l._x + 20); }));
    });
    geom = { roots, main, depth, minX: minX - 16, w: Math.max(760, maxX - minX + 32), h: maxY + 96 };
  }

  /* ---- paint: what is lit */
  function idsFor(spec) {
    if (!spec) return null;
    if (spec.kind) { const k = o.kinds[spec.kind]; if (!k) return null; const out = new Set(); if (k.authority && auth[k.authority]) chainOf(k.authority).forEach(x => out.add(x)); leaves.filter(l => l.kind === spec.kind).forEach(l => out.add(l.id)); return out; }
    if (spec.ids) { const out = new Set(); spec.ids.forEach(id => chainOf(id).forEach(x => out.add(x))); return out; }
    if (spec.cap) { const out = new Set(); Object.values(auth).filter(a => (a.caps || []).includes(spec.cap)).forEach(a => chainOf(a.id).forEach(x => out.add(x))); leaves.filter(l => (l.caps || []).includes(spec.cap)).forEach(l => chainOf(l.id).forEach(x => out.add(x))); return out; }
    if (spec.id) return new Set(chainOf(spec.id));
    return null;
  }
  const curSpec = () => st.hover ? { id: st.hover } : st.pinned ? { id: st.pinned } : st.subj ? { ids: st.subj, label: st.subjLabel } : st.cap ? { cap: st.cap } : st.filter ? { kind: st.filter } : null;
  function paint() {
    if (!treeSvg) return;
    const spec = curSpec(), lit = idsFor(spec);
    treeSvg.classList.toggle('is-lit', !!lit);
    els.forEach((x, id) => { const on = !!lit && lit.has(id); x.g.classList.toggle('on', on); if (x.seam) x.seam.classList.toggle('on', on); if (x.label) x.label.classList.toggle('on', on); });
    if (keysEl) keysEl.querySelectorAll('[data-ca]').forEach(b => b.classList.toggle('on', !!lit && lit.has(b.dataset.ca)));
    passBtns.forEach(b => b.setAttribute('aria-pressed', String(st.filter === b.dataset.kind)));
    laneBtns.forEach(b => b.setAttribute('aria-pressed', String(!!st.subj && b.dataset.key === st.subjKey)));
    if (caption) caption.textContent = sentence(spec);
    const l = spec && spec.id && byId.get(spec.id);
    if (tipEl) {
      tipEl.classList.toggle('show', !!l);
      if (l) { const txt = tipEl.querySelector('text'), rc = tipEl.querySelector('rect'), t = l.label + ', ' + wordOf(l); txt.textContent = t; const w = Math.round(t.length * 7.2 + 24); rc.setAttribute('width', w); rc.setAttribute('x', -w / 2);
        const x = Math.max(geom.minX + w / 2 + 4, Math.min(geom.minX + geom.w - w / 2 - 4, l._x)); tipEl.setAttribute('transform', 'translate(' + r1(x) + ' ' + (l._y + 24) + ')'); }
    }
  }
  function sentence(spec) {
    const C = o.captions || {};
    if (spec && spec.id) {
      const a = auth[spec.id], l = byId.get(spec.id);
      if (a) return C.authority ? C.authority(a) : a.name + (a.sub ? '. ' + a.sub + '.' : '.');
      if (l) { const ch = chainOf(l.id).slice(1).map(nameOf); if (C.leaf) return C.leaf(l, ch);
        return l.label + ': ' + kindOf(l).short.toLowerCase() + (ch.length ? ', signed by ' + ch[0] + (ch.length > 1 ? ', which was signed by ' + ch.slice(1).join(', which was signed by ') : '') + '.' : '.'); }
    }
    if (spec && spec.kind) { const k = o.kinds[spec.kind], n = leaves.filter(l => l.kind === spec.kind).length; return C.kind ? C.kind(k, n) : (k.authority ? nameOf(k.authority) + ' may sign ' + (k.plural || k.short.toLowerCase() + 's').toLowerCase() + '. ' : '') + n + ' ' + (n === 1 ? 'is' : 'are') + ' drawn here.'; }
    if (spec && spec.ids) return C.subject ? C.subject(spec.label, spec.ids.length) : spec.label + ' holds ' + spec.ids.length + (spec.ids.length === 1 ? ' item.' : ' items.');
    if (spec && spec.cap) return C.cap ? C.cap(spec.cap) : 'Lit: every key and certificate that has this ability.';
    return C.idle || 'Hover or focus a medallion to follow its chain up to the root. Press Enter to open it.';
  }

  /* ---- the tree */
  function medallion(x, y, r, item, ca) {
    const row = rowOf(item), tone = row ? row.tone : 'neutral', circ = 2 * Math.PI * (r - 4), life = item.life == null ? null : Math.max(0, Math.min(1, item.life));
    const g = sv('g', { class: 'kit-tt-n ' + (ca ? 'kit-tt-ca' : 'kit-tt-leaf kit-tt-m-' + (kindOf(item).mark || 'dot')) + (item.short ? ' kit-tt-short' : ''), transform: 'translate(' + r1(x) + ' ' + r1(y) + ')', tabindex: -1, role: 'button', 'data-id': item.id, 'data-vo-tone': tone });
    const b = sv('g', { class: 'kit-tt-body' });
    b.append(sv('circle', { class: 'kit-tt-shadow', cx: 0, cy: r * .14, r }), sv('circle', { class: 'kit-tt-disc', r }));
    if (ca) b.append(sv('circle', { class: 'kit-tt-rim', r: r - 1 }));
    b.append(sv('circle', { class: 'kit-tt-track', r: r - 4 }));
    if (life != null && !item.short) b.append(sv('circle', { class: 'kit-tt-arc', r: r - 4, transform: 'rotate(-90)', 'stroke-dasharray': r1(circ * life) + ' ' + r1(circ) }));
    b.append(sv('circle', { class: 'kit-tt-shine', cx: -r * .3, cy: -r * .38, r: r * .26 }));
    g.append(b);
    return g;
  }
  function leafMark(g, l) {
    const m = kindOf(l).mark || 'dot';
    if (m === 'ring') g.append(sv('circle', { class: 'kit-tt-mk kit-tt-mk-ring', r: 4 }));
    else if (m === 'square') g.append(sv('rect', { class: 'kit-tt-mk', x: -3.6, y: -3.6, width: 7.2, height: 7.2, rx: 1.2 }));
    else if (m === 'diamond') g.append(sv('path', { class: 'kit-tt-mk', d: 'M0 -5L5 0L0 5L-5 0Z' }));
    else g.append(sv('circle', { class: 'kit-tt-mk', r: 3 }));
  }
  function buildTree() {
    els = new Map(); order = [];
    const W = geom.w, H = geom.h, id = 'kit-tt' + (++uid);
    const svg = sv('svg', { class: 'kit-tt-svg', viewBox: r1(geom.minX) + ' 0 ' + r1(W) + ' ' + r1(H), role: 'group', 'aria-label': o.label + '. Arrow keys move between medallions, Enter opens one.', focusable: 'false' });
    const stops = [0, 1, 2, 3, 4].map(i => '<stop offset="' + (i * 25) + '%" style="stop-color:var(--seam-' + i + ',var(--seam,var(--accent)))"/>').join('');
    svg.innerHTML = '<defs><linearGradient id="' + id + 's" gradientUnits="userSpaceOnUse" x1="' + geom.minX + '" y1="0" x2="' + (geom.minX + W) + '" y2="' + H + '">' + stops + '</linearGradient>'
      + '<radialGradient id="' + id + 'g" cx=".34" cy=".26" r=".95"><stop offset="0" style="stop-color:var(--pebble-hi,var(--panel))"/><stop offset=".55" style="stop-color:var(--panel)"/><stop offset="1" style="stop-color:var(--sunk)"/></radialGradient></defs>';
    svg.style.setProperty('--tt-seam', 'url(#' + id + 's)'); svg.style.setProperty('--tt-glaze', 'url(#' + id + 'g)');
    const seamLayer = sv('g', { class: 'kit-tt-seams' }), nodeLayer = sv('g', { class: 'kit-tt-nodes' }), labelLayer = sv('g', { class: 'kit-tt-labels' });
    svg.append(seamLayer);
    /* ghost parents of stand-alone authorities */
    geom.roots.slice(1).forEach(rid => {
      const a = auth[rid], gy = a._y - a._r - 86;
      const gg = sv('g', { class: 'kit-tt-ghost', transform: 'translate(' + r1(a._x) + ' ' + r1(gy + 28) + ')' }, null);
      gg.append(sv('circle', { class: 'kit-tt-ghost-ring', r: 28 }), sv('text', { class: 'kit-tt-sub', y: 4, 'text-anchor': 'middle' }, null, 'no parent'));
      if (a.ghost) gg.append(sv('text', { class: 'kit-tt-sub', y: 52, 'text-anchor': 'middle' }, null, a.ghost));
      seamLayer.append(sv('path', { class: 'kit-tt-seam kit-tt-ghost-seam', d: 'M' + r1(a._x) + ' ' + r1(gy + 56) + 'L' + r1(a._x) + ' ' + r1(a._y - a._r) }), gg);
    });
    const trunk = {};
    Object.values(auth).forEach(a => {
      if (!a.parent || !auth[a.parent]) return; const p = auth[a.parent], dy = a._y - p._y;
      const path = sv('path', { class: 'kit-tt-seam kit-tt-trunk', d: 'M' + r1(p._x) + ' ' + r1(p._y + p._r - 2) + 'C' + r1(p._x) + ' ' + r1(p._y + dy * .55) + ' ' + r1(a._x) + ' ' + r1(a._y - dy * .55) + ' ' + r1(a._x) + ' ' + r1(a._y - a._r + 2) });
      seamLayer.append(path); trunk[a.id] = path;
    });
    leaves.forEach(l => {
      const a = auth[l.authority]; if (!a || l._x == null) return;
      const p = sv('path', { class: 'kit-tt-seam kit-tt-twig', d: 'M' + r1(a._x) + ' ' + r1(a._y + a._r - 2) + 'C' + r1(a._x) + ' ' + r1((a._y + l._y) / 2 + 20) + ' ' + r1(l._x) + ' ' + r1((a._y + l._y) / 2 - 20) + ' ' + r1(l._x) + ' ' + r1(l._y - 17) });
      seamLayer.append(p); l._seam = p;
    });
    svg.append(nodeLayer, labelLayer);
    const dfs = []; (function walk(i) { dfs.push(i); kids[i].forEach(walk); })(geom.main); geom.roots.slice(1).forEach(function walk(i) { dfs.push(i); kids[i].forEach(walk); });
    dfs.forEach(aid => {
      const a = auth[aid], g = medallion(a._x, a._y, a._r, a, true), row = rowOf(a), label = a.name + (a.sub ? '. ' + a.sub + '.' : '') + (row ? ' ' + row.word + '.' : '');
      g.setAttribute('aria-label', label); g.append(sv('title', null, null, label));
      const gl = V() && V().glyphs.includes(glyphOf(a)) ? V().glyph(glyphOf(a)) : null;
      if (gl) { const s = a._r * .68; gl.setAttribute('x', r1(-s / 2)); gl.setAttribute('y', r1(-s / 2)); gl.setAttribute('width', r1(s)); gl.setAttribute('height', r1(s)); gl.classList.add('kit-tt-ico'); g.append(gl); }
      nodeLayer.append(g);
      const lg = sv('g', { class: 'kit-tt-lab', transform: 'translate(' + r1(a._x + a._r + 12) + ' ' + r1(a._y) + ')' });
      lg.append(sv('text', { class: 'kit-tt-name', x: 0, y: -4 }, null, a.name));
      if (a.sub) lg.append(sv('text', { class: 'kit-tt-sub', x: 0, y: 14 }, null, a.sub));
      if (a.left) lg.append(sv('text', { class: 'kit-tt-sub', x: 0, y: 30 }, null, a.left));
      labelLayer.append(lg);
      els.set(aid, { g, seam: trunk[aid] || null, label: lg }); order.push(aid);
    });
    leaves.forEach(l => {
      if (l._x == null) return; const k = kindOf(l), g = medallion(l._x, l._y, 17, l, false), row = rowOf(l), label = l.label + ', ' + k.short.toLowerCase() + (row ? ', ' + row.word : '') + (l.left ? ', ' + l.left : '');
      g.setAttribute('aria-label', label); g.append(sv('title', null, null, label)); leafMark(g, l); nodeLayer.append(g); els.set(l.id, { g, seam: l._seam || null, label: null }); order.push(l.id);
    });
    /* family captions: what hangs under each authority, in words */
    Object.values(auth).forEach(a => {
      const mine = leaves.filter(l => l.authority === a.id); if (!mine.length) return;
      const by = {}; mine.forEach(l => { by[l.kind] = (by[l.kind] || 0) + 1; });
      const txt = Object.keys(by).map(k => by[k] + ' ' + (by[k] === 1 ? (o.kinds[k] ? o.kinds[k].short : k) : (o.kinds[k] && o.kinds[k].plural) || ((o.kinds[k] ? o.kinds[k].short : k) + 's')).toLowerCase()).join(', ');
      svg.append(sv('text', { class: 'kit-tt-fam', x: r1(a._x), y: geom.h - 30, 'text-anchor': 'middle' }, null, txt.charAt(0).toUpperCase() + txt.slice(1)));
    });
    tipEl = sv('g', { class: 'kit-tt-tag', 'aria-hidden': 'true' }); tipEl.append(sv('rect', { rx: 12, height: 24 }), sv('text', { y: 16, 'text-anchor': 'middle' })); svg.append(tipEl);

    const nodes = () => order.map(i => els.get(i).g), rove = to => nodes().forEach(n => n.setAttribute('tabindex', n === to ? '0' : '-1'));
    rove(els.get(geom.main).g);
    svg.addEventListener('pointerover', e => { const n = e.target.closest('.kit-tt-n'); if (n) { st.hover = n.dataset.id; paint(); } });
    svg.addEventListener('pointerout', e => { const n = e.target.closest('.kit-tt-n'); if (n && !n.contains(e.relatedTarget)) { st.hover = null; paint(); } });
    svg.addEventListener('focusin', e => { const n = e.target.closest('.kit-tt-n'); if (n) { rove(n); st.hover = n.dataset.id; paint(); } });
    svg.addEventListener('focusout', e => { if (!svg.contains(e.relatedTarget)) { st.hover = null; paint(); } });
    svg.addEventListener('click', e => { const n = e.target.closest('.kit-tt-n'); if (n) open(n.dataset.id, n); });
    svg.addEventListener('keydown', e => {
      const n = e.target.closest('.kit-tt-n'); if (!n) return; const id = n.dataset.id;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id, n); return; }
      if (e.key === 'Escape') { st.pinned = null; paint(); return; }
      const i = order.indexOf(id), l = byId.get(id); let to = null;
      if (e.key === 'ArrowRight') to = order[Math.min(order.length - 1, i + 1)]; else if (e.key === 'ArrowLeft') to = order[Math.max(0, i - 1)];
      else if (e.key === 'Home') to = order[0]; else if (e.key === 'End') to = order[order.length - 1];
      else if (e.key === 'ArrowUp') to = l ? l.authority : auth[id].parent;
      else if (e.key === 'ArrowDown') to = l ? null : (kids[id][0] || (leaves.find(x => x.authority === id) || {}).id || null);
      if (to && els.get(to)) { e.preventDefault(); els.get(to).g.focus(); }
    });
    treeSvg = svg; return svg;
  }

  /* ---- the phone list */
  function buildStack() {
    const wrap = el('div', 'kit-tt-stack'); wrap.setAttribute('aria-label', o.label + ', as a list');
    const walk = (id, d) => {
      const a = auth[id], sec = el('div', 'kit-tt-stack-ca'); sec.style.setProperty('--d', d);
      const head = el('button', 'kit-row kit-tt-stack-head ' + toneCls(a)); head.type = 'button'; head.dataset.open = id;
      const ava = el('span', 'kit-ava'); ava.append(glyphIco(glyphOf(a))); const txt = el('span'); txt.append(el('b', 't', a.name)); if (a.sub) txt.append(el('span', 's', a.sub)); head.append(ava, txt);
      sec.append(head); const mine = leaves.filter(l => l.authority === id);
      if (mine.length) { const k = el('div', 'kit-tt-stack-kids'); mine.forEach(l => { const b = el('button', 'kit-tt-stack-leaf'); b.type = 'button'; b.dataset.open = l.id; b.dataset.voTone = (rowOf(l) || { tone: 'neutral' }).tone;
        const v = V(); const row = rowOf(l); if (row && v) b.append(v.orb(o.enum, l.state, { size: 'sm' })); b.append(el('span', 'kit-tt-stack-n', l.label)); if (row) b.append(el('span', 'kit-tt-stack-w', row.short)); k.append(b); }); sec.append(k); }
      wrap.append(sec); kids[id].forEach(c => walk(c, d + 1));
    };
    walk(geom.main, 0); geom.roots.slice(1).forEach(r => walk(r, 1));
    wrap.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) open(b.dataset.open, b); });
    return wrap;
  }
  const toneCls = x => { const r = rowOf(x); const t = r ? r.tone : 'neutral'; return t === 'success' ? 'kit-is-ok' : t === 'attention' ? 'kit-is-warn' : t === 'danger' ? 'kit-is-bad' : t === 'info' || t === 'active' ? 'kit-is-info' : t === 'review' ? 'kit-is-wait' : 'kit-is-idle'; };
  function glyphIco(name) { const v = V(); const g = v && v.glyphs.includes(name) ? v.glyph(name) : sv('svg', { viewBox: '0 0 24 24' }); g.setAttribute('class', 'kit-gz-ico'); return g; }

  /* ---- chain, detail */
  function chainEl(id) {
    const wrap = el('div', 'kit-tt-chain'); const ids = chainOf(id);
    ids.forEach((cid, i) => {
      const a = auth[cid], l = byId.get(cid), x = a || l, row = el('button', 'kit-row kit-tt-chain-row ' + toneCls(x)); row.type = 'button'; row.dataset.go = cid;
      const ava = el('span', 'kit-ava'); ava.append(glyphIco(a ? glyphOf(a) : (kindOf(l).glyph || 'ring'))); const t = el('span'); t.append(el('b', 't', a ? a.name : l.label));
      t.append(el('span', 's', a ? (a.sub || (a.parent ? 'Authority' : 'Root')) : kindOf(l).short)); row.append(ava, t);
      if (i === 0 && ids.length > 1) row.append(el('span', 'kit-chip kit-plain', 'this one'));
      wrap.append(row);
      if (i < ids.length - 1) { const hop = sv('svg', { class: 'kit-tt-hop', viewBox: '0 0 24 26', 'aria-hidden': 'true' }); hop.append(sv('path', { d: 'M12 0C12 9 12 17 12 26' }), sv('circle', { cx: 12, cy: 13, r: 3.4 })); wrap.append(hop); }
    });
    wrap.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) open(b.dataset.go, b); });
    return wrap;
  }
  function detailEl(id, dopts) {
    const a = auth[id], l = byId.get(id), x = a || l; if (!x) return el('div');
    const box = el('div', 'kit-tt-detail'), row = rowOf(x), v = V();
    const head = el('div', 'kit-tt-dhead'); const ava = el('span', 'kit-ava ' + toneCls(x)); ava.append(glyphIco(a ? glyphOf(a) : (kindOf(l).glyph || 'ring')));
    const ht = el('div'); ht.append(el('h3', 'kit-tt-dt', a ? a.name : l.label), el('p', 'kit-tt-ds', a ? (a.sub || '') : kindOf(l).short)); head.append(ava, ht); box.append(head);
    const chips = el('div', 'kit-tt-chips'); if (row && v) chips.append(v.pill(o.enum, x.state)); if (x.left) chips.append(el('span', 'kit-chip kit-plain kit-is-idle', x.left)); (x.chips || []).forEach(c => chips.append(el('span', 'kit-chip kit-plain kit-is-idle', c))); box.append(chips);
    const h4 = t => el('h4', 'kit-tt-dh', t); box.append(h4('Who vouches for it'), chainEl(id));
    if ((x.facts || []).length) {
      const dl = el('dl', 'kit-facts');
      x.facts.forEach(f => { const w = el('div'), dd = el('dd', f[3] ? 'kit-mono' : null, f[1]); if (f[2]) { const m = el('span', 'kit-mark ' + 'kit-tt-tagm', f[2] === 'read' ? 'read' : f[2] === 'inferred' ? 'inferred' : 'by design'); m.dataset.mark = f[2] === 'read' ? 'verified' : f[2] === 'inferred' ? 'inference' : 'estimate'; dd.append(' ', m); } w.append(el('dt', null, f[0]), dd); dl.append(w); });
      box.append(h4('What is known'), dl);
    }
    const kind = a ? Object.keys(o.kinds).find(k => o.kinds[k].authority === id) : l.kind;
    if (kind) { const bt = el('button', 'kit-btn kit-sm', 'Show everything this ' + (a ? 'signs' : 'kind covers')); bt.type = 'button'; bt.addEventListener('click', () => { pass(kind); if (dopts && dopts.onShowKind) dopts.onShowKind(kind); }); const r = el('div', 'kit-btn-row'); r.append(bt); box.append(r); }
    ((x.actions || [])).forEach(ac => { const bt = el('button', 'kit-btn kit-sm', ac.label); bt.type = 'button'; bt.addEventListener('click', () => dopts && dopts.onAction && dopts.onAction(ac.key, id)); box.append(bt); });
    return box;
  }
  function open(id, opener) { st.pinned = id; paint(); if (o.onOpen) o.onOpen(id, opener); }
  function pass(kind) { st.filter = st.filter === kind ? null : kind; st.subj = null; st.cap = null; paint(); }

  /* ---- the parts around the tree */
  function head(t, d) { const h = el('header', 'kit-tt-head'); h.append(el('h3', 'kit-tt-h', t)); if (d) h.append(el('p', 'kit-tt-lede', d)); return h; }
  const title = k => Object.assign({}, TITLES[k], (o.titles || {})[k]);
  function buildKeys() {
    const wrap = el('div', 'kit-tt-keys');
    o.holders.forEach(h => {
      const key = el('div', 'kit-tt-key'); key.setAttribute('role', 'group'); key.setAttribute('aria-label', h.label + (h.serial ? ' ' + h.serial : ''));
      const idr = el('div', 'kit-tt-key-id'), t = el('span'); t.append(el('b', null, h.label)); if (h.serial) t.append(el('span', 'kit-tt-serial', h.serial)); idr.append(t); key.append(idr);
      const slots = el('div', 'kit-tt-slots');
      (h.slots || []).forEach(s => {
        const a = auth[s.authority]; if (!a) return; const b = el('button', 'kit-tt-slot'); b.type = 'button'; b.dataset.ca = s.authority; b.title = a.name + (s.slot ? ', slot ' + s.slot : '');
        b.append(el('i', 'kit-tt-bead'), el('span', 'kit-tt-slot-t', a.short || a.name), s.slot ? el('span', 'kit-tt-slot-n', s.slot) : '');
        b.addEventListener('pointerenter', () => { st.hover = s.authority; paint(); }); b.addEventListener('pointerleave', () => { st.hover = null; paint(); });
        b.addEventListener('focus', () => { st.hover = s.authority; paint(); }); b.addEventListener('blur', () => { st.hover = null; paint(); }); b.addEventListener('click', () => open(s.authority, b)); slots.append(b);
      });
      key.append(slots); wrap.append(key);
    });
    if (o.holdersNote) wrap.append(el('p', 'kit-tt-note', o.holdersNote));
    keysEl = wrap; return wrap;
  }
  function buildPasses() {
    passBtns = []; const wrap = el('div', 'kit-tt-passes'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Who may sign what');
    Object.keys(o.kinds).forEach(k => {
      const K = o.kinds[k], n = leaves.filter(l => l.kind === k).length; const b = el('button', 'kit-tt-pass'); b.type = 'button'; b.dataset.kind = k; b.setAttribute('aria-pressed', 'false');
      const ava = el('span', 'kit-ava'); ava.append(glyphIco(K.glyph || 'ring')); const t = el('span', 'kit-tt-pass-t'); t.append(el('b', null, K.label), el('span', null, (K.authority ? nameOf(K.authority) + ', ' : '') + n + ' drawn'));
      b.append(ava, t); b.addEventListener('click', () => pass(k)); passBtns.push(b); wrap.append(b);
    });
    return wrap;
  }
  function buildLimits() {
    const wrap = el('div', 'kit-tt-limits');
    Object.keys(o.kinds).forEach(k => { const K = o.kinds[k]; if (!(K.limits || []).length) return; const c = el('div', 'kit-tt-limit'); c.append(el('h4', null, (K.plural || K.short + 's').replace(/^./, m => m.toUpperCase())));
      if (K.authority) c.append(el('p', null, 'Only ' + nameOf(K.authority) + ' may sign them')); const p = el('div', 'kit-tt-pebbles'); K.limits.forEach(t => p.append(el('span', 'kit-tt-peb', t))); c.append(p); wrap.append(c); });
    return wrap;
  }
  function buildLanes() {
    laneBtns = []; const wrap = el('div', 'kit-tt-lanes');
    o.groups.forEach(g => {
      const members = leaves.filter(l => l.group === g.id); if (!members.length) return; const subs = [...new Set(members.map(l => l.subject || l.label))];
      const lane = el('div', 'kit-tt-lane'); lane.setAttribute('role', 'group'); lane.setAttribute('aria-label', g.label);
      const hd = el('div', 'kit-tt-lane-head'), ava = el('span', 'kit-ava'); ava.append(glyphIco(g.glyph || 'ring')); const t = el('div'); t.append(el('h4', null, g.label)); if (g.sub) t.append(el('p', null, g.sub)); hd.append(ava, t); lane.append(hd);
      const pills = el('div', 'kit-tt-subjects');
      subs.forEach(name => {
        const mine = members.filter(l => (l.subject || l.label) === name), kinds = new Set(mine.map(l => l.kind)); const b = el('button', 'kit-tt-subj'); b.type = 'button'; b.dataset.key = g.id + ':' + name; b.setAttribute('aria-pressed', 'false');
        b.append(el('span', 'kit-tt-subj-n', name)); const kg = el('span', 'kit-tt-subj-k'); kg.setAttribute('aria-hidden', 'true');
        Object.keys(o.kinds).filter(k => kinds.has(k)).forEach(k => kg.append(kindDot(k))); b.append(kg);
        b.append(el('span', 'kit-tt-sr', mine.length + (mine.length === 1 ? ' item: ' : ' items: ') + [...kinds].map(k => (o.kinds[k] ? o.kinds[k].short : k).toLowerCase()).join(', ')));
        let prev = null;
        const on = v => { if (v) { prev = [st.subj, st.subjKey, st.subjLabel]; st.subj = mine.map(l => l.id); st.subjKey = b.dataset.key; st.subjLabel = name; st.cap = null; } else { const p = prev || []; st.subj = p[0] || null; st.subjKey = p[1] || null; st.subjLabel = p[2] || ''; } paint(); };
        b.addEventListener('pointerenter', () => { st.hover = null; on(true); }); b.addEventListener('pointerleave', () => on(false)); b.addEventListener('focus', () => on(true)); b.addEventListener('blur', () => on(false));
        b.addEventListener('click', () => { if (mine.length === 1) open(mine[0].id, b); else { prev = null; st.subj = mine.map(l => l.id); st.subjKey = b.dataset.key; st.subjLabel = name; paint(); } });
        laneBtns.push(b); pills.append(b);
      });
      lane.append(pills); wrap.append(lane);
    });
    return wrap;
  }
  function kindDot(k) {
    const s = sv('svg', { class: 'kit-tt-kd', viewBox: '0 0 22 22', focusable: 'false' }); s.append(sv('circle', { class: 'kit-tt-kd-bg', cx: 11, cy: 11, r: 10 }));
    const m = (o.kinds[k] || {}).mark || 'dot', c = 'kit-tt-mk' + (m === 'ring' ? ' kit-tt-mk-ring' : '');
    if (m === 'ring') s.append(sv('circle', { class: c, cx: 11, cy: 11, r: 4 })); else if (m === 'square') s.append(sv('rect', { class: c, x: 7.4, y: 7.4, width: 7.2, height: 7.2, rx: 1.2 }));
    else if (m === 'diamond') s.append(sv('path', { class: c, d: 'M11 6L16 11L11 16L6 11Z' })); else s.append(sv('circle', { class: c, cx: 11, cy: 11, r: 3 }));
    const t = sv('title', null, null, (o.kinds[k] || {}).short || k); s.append(t); return s;
  }
  function buildLegend() {
    const lg = el('div', 'kit-tt-legend'); const mk = (i, t) => { const s = el('span'); s.append(i, document.createTextNode(t)); return s; };
    lg.append(mk(el('i', 'kit-tt-lg kit-tt-lg-seam'), 'Gold seam: this one signed that one'), mk(el('i', 'kit-tt-lg kit-tt-lg-ring'), 'Ring: life left'), mk(el('i', 'kit-tt-lg kit-tt-lg-short'), 'Dashed: short-lived, ends by design'));
    Object.keys(o.kinds).forEach(k => lg.append(mk(kindDot(k), o.kinds[k].short)));
    return lg;
  }

  function build() {
    prepare(); layout(); root = el('div', 'kit-tt'); box.replaceChildren(root); passBtns = []; laneBtns = []; keysEl = null; treeSvg = null; tipEl = null; caption = null;
    const want = s => (o.sections || []).includes(s);
    if (want('holders') && o.holders.length) { const t = title('holders'); root.append(head(t.title, t.lede), buildKeys()); }
    if (want('tree') && o.authorities.length) {
      const t = title('tree'); root.append(head(t.title, t.lede));
      const card = el('div', 'kit-tt-card');
      if (want('passes') && Object.keys(o.kinds).some(k => o.kinds[k].authority)) { const ask = el('div', 'kit-tt-ask'); ask.append(el('h4', null, 'Show me'), buildPasses()); card.append(ask); }
      scroll = el('div', 'kit-tt-scroll'); scroll.tabIndex = -1; scroll.append(buildTree()); stack = buildStack(); card.append(scroll, stack);
      caption = el('p', 'kit-tt-caption'); caption.setAttribute('aria-live', 'polite'); card.append(caption); if (o.legend) card.append(buildLegend()); root.append(card);
    }
    if (want('limits') && Object.values(o.kinds).some(k => (k.limits || []).length)) { const t = title('limits'); root.append(head(t.title, t.lede), buildLimits()); }
    if (want('lanes') && o.groups.length) { const t = title('lanes'); root.append(head(t.title, t.lede), buildLanes()); }
    fit(); paint();
  }
  function fit() { const narrow = o.compact === true || (o.compact === 'auto' && box.clientWidth > 0 && box.clientWidth < o.compactBelow); if (root) root.dataset.compact = String(!!narrow); }

  build();
  if (o.compact === 'auto' && window.ResizeObserver) { ro = new ResizeObserver(() => { if (alive) fit(); }); ro.observe(box); }
  const handle = {
    light(spec) { st.hover = null; st.pinned = null; st.subj = null; st.cap = null; st.filter = null;
      if (spec && spec.kind) st.filter = spec.kind; else if (spec && spec.cap) st.cap = spec.cap; else if (spec && spec.subject) { st.subj = spec.subject; st.subjLabel = spec.label || ''; } else if (spec && spec.ids) { st.subj = spec.ids; st.subjLabel = spec.label || ''; } else if (spec && spec.id) st.pinned = spec.id;
      paint(); },
    clear() { st.hover = null; st.pinned = null; st.subj = null; st.cap = null; st.filter = null; paint(); },
    pin(id) { st.pinned = id || null; paint(); },
    focus(id) { const x = els.get(id); if (x) x.g.focus(); },
    chainOf, chainEl, detailEl,
    update(patch) { if (!alive) return; o = Object.assign(o, patch); build(); },
    destroy() { alive = false; if (ro) ro.disconnect(); box.replaceChildren(); if (last === handle) last = null; },
  };
  last = handle; return handle;
}

Kit.trustTree = Object.freeze({ mount, chainEl: id => (last ? last.chainEl(id) : null) });
})();
/* /part:page.script.kit.viz.trust-tree */
