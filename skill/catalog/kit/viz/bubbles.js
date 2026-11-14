/* part:page.script.kit.viz.bubbles */
/**
 * Bubble pictures
 * One set of records, two pictures. Clusters: a disc for each group, its records packed inside as bubbles by sunflower packing, a dotted gold ring round each disc. Lanes: one lane for each group, each record strung on a gold seam at its value on a square-root axis, bubbles that would overlap stepping up and down (never more than 48 units sideways). The axis is honest: its ticks use the same function as the bubbles and it names its scale in words. A lens line under the picture shows the record in focus with its facts and actions (it keeps the record until another is chosen, so its actions can be reached). Records the filter leaves out dim; they do not disappear, so counts stay honest. Orbits (a third picture, one orbit for each group) is behind a flag and unfinished, as in its source.
 *
 * API:
 *   Kit.bubbles.mount(box, opts) -> {setLayout(name), setFilter(fn|null), select(id|null), update(patch), destroy()}
 *     opts   { records, groups, layout: "clusters", enum: "life", scale, filter, width: 1000, lens, onPick(rec), onAction(key, rec), label, host, orbits: false, emptyLens }
 *              records   [{id, group, value, state, glyph, label, sub, ring}]  value is a number from 0 up (days left, say); state a value of the enum (draws the ring colour, the small mark and the
 *                        word in the lens); glyph a Kit.vocab glyph name drawn inside; label and sub name it; ring (orbits only) is the kind that picks the ring
 *              groups    [{key, label}] in drawing order; a group a record names that is not listed is added, labelled by its key
 *              scale     { name: "square-root", f: Math.sqrt, ticks: [[30, "30 days"], [90, "3 months"], [365, "1 year"]], max, nowLabel: "now" }  the lanes' axis. f must be increasing; ticks are
 *                        drawn at f(value), so they cannot disagree with the bubbles. Records at 0 or less sit at "now".
 *              filter    (rec) => boolean, true means the record matches
 *              lens      (rec) => {title, sub, actions: [{key, label}]}  the lens line's text; the default shows label, sub and the state word
 *     onPick fires on a click, Enter or Space (the bubble is a button); onAction on one of the lens line's actions.
 *     setLayout("clusters" | "lanes" | "orbits"), setFilter(fn) and select(id) change the picture without remounting.
 *   Kit.bubbles.packing(n, c) -> [[x, y]]   the sunflower positions of n bubbles for a spacing c (angle i * 2.399963, radius c * sqrt(i + 0.5)); pure, for a board's own picture
 * Each bubble has a name ("label, group, state, value") and a tip (Kit.tooltip); Tab visits them in group order; the lens line is a live region.
 *
 * Also load kit/vocab.css.
 *
 * @id        viz.bubbles
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   The same records drawn as clusters of packed bubbles in a seam ring, or as strips on a square-root time axis that keeps overlapping items apart, with a lens line for the one in focus.
 * @tags      bubbles, clusters, lanes, scale, square root, sunflower, lens, records, inventory
 * @requires  viz.seal, kit.vocab, kit.tooltip
 * @files     kit/viz/bubbles.css, kit/samples/bubbles.json
 * @provides  Kit.bubbles.mount, Kit.bubbles.packing
 * @config    Kit.bubbles.mount(box, {records, groups, layout, scale, filter, lens, onPick, onAction, orbits}) | records [{id, group, value, state, glyph, label, sub, ring}], groups [{key, label}], scale {name, f, ticks, max, nowLabel}; layout clusters | lanes (| orbits with orbits: true)
 * @config    handle | {setLayout(name), setFilter(fn), select(id), update(patch), destroy()}
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --ink-3 --seam? --seam-<n>? --hi? --pebble-hi? --rim? --pool? --sunk-2? --danger --danger-ink? --edge? --edge-gold? --glz-r-l? --glz-r-m? --on-state?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's certificate page | the bubble mark, the cluster, lane and orbit pictures and the lens line
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's stylesheet | the pool, seam ring, halo and gloss
 * @preview   {"render": "viz.bubbles", "samples": ["kit/samples/bubbles.json"]}
 * @changed   Groups, state words, the scale and its ticks are config; the axis names its scale and places its ticks with the same function as the bubbles.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
const hash = s => { let x = 7; s = String(s); for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; };
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const DEF = { records: [], groups: [], layout: 'clusters', enum: 'life', width: 1000, orbits: false, label: 'Records as bubbles',
  scale: { name: 'square-root', f: Math.sqrt, ticks: [[30, '30 days'], [90, '3 months'], [365, '1 year'], [730, '2 years'], [1825, '5 years']], nowLabel: 'now' } };

function packing(n, c) { const out = []; for (let i = 0; i < n; i++) { const r = c * Math.sqrt(i + 0.5), t = i * 2.399963; out.push([r * Math.cos(t), r * Math.sin(t)]); } return out; }

function mount(box, opts) {
  let o = Object.assign({}, DEF, opts); o.scale = Object.assign({}, DEF.scale, (opts && opts.scale) || {});
  let alive = true, layout = o.layout, filter = o.filter || null, picked = null, tipH = null, curRec = null;
  const V = () => Kit.vocab;
  const root = el('div', 'kit-bb'), fig = el('div', 'kit-bb-fig'), lens = el('div', 'kit-bb-lens'); lens.setAttribute('aria-live', 'polite');
  root.append(fig, lens); box.replaceChildren(root);
  const groupsOf = () => {
    const gs = o.groups.map(g => ({ key: g.key, label: g.label || g.key, items: [] })), by = Object.fromEntries(gs.map(g => [g.key, g]));
    o.records.forEach(r => { let g = by[r.group]; if (!g) { g = by[r.group] = { key: r.group, label: String(r.group), items: [] }; gs.push(g); } g.items.push(r); });
    return gs.filter(g => g.items.length);
  };
  const rowOf = r => { const v = V(); return v ? v.get(o.enum, r.state) : null; };
  const matches = r => !filter || filter(r);
  const groupLabel = r => { const g = o.groups.find(x => x.key === r.group); return g ? g.label || g.key : String(r.group); };
  const valueText = r => r.value == null ? '' : String(r.value);

  function bubble(rec, x, y, rad, svg) {
    const row = rowOf(rec), tone = row ? row.tone : 'neutral', on = matches(rec);
    const g = sv('g', { class: 'kit-bb-b' + (on ? '' : ' dim') + (picked === rec.id ? ' sel' : ''), tabindex: on ? 0 : -1, role: 'button', 'data-id': rec.id, 'data-vo-tone': tone, transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')',
      'aria-label': [rec.label || rec.id, groupLabel(rec), row ? row.word : rec.state, !on ? 'filtered out' : ''].filter(Boolean).join(', ') });
    if (!on) g.setAttribute('aria-disabled', 'true');
    g._rec = rec;
    g.append(sv('circle', { class: 'kit-bb-halo', r: rad + 5 }), sv('circle', { class: 'kit-bb-bub', r: rad }), sv('ellipse', { class: 'kit-bb-gloss', cx: -rad * .28, cy: -rad * .4, rx: rad * .38, ry: rad * .2 }));
    const v = V();
    if (rec.glyph && v && v.glyphs.includes(rec.glyph)) { const s = rad > 16 ? 20 : 15, gl = v.glyph(rec.glyph); gl.setAttribute('x', -s / 2); gl.setAttribute('y', -s / 2); gl.setAttribute('width', s); gl.setAttribute('height', s); gl.classList.add('kit-bb-gl'); g.append(gl); }
    if (row && v && rad >= 12) {
      const m = sv('g', { class: 'kit-bb-mk', transform: 'translate(' + (rad * .72).toFixed(1) + ' ' + (rad * .72).toFixed(1) + ')' }); m.append(sv('circle', { r: 6 }));
      const gl = v.glyph(row.glyph); gl.setAttribute('x', -4); gl.setAttribute('y', -4); gl.setAttribute('width', 8); gl.setAttribute('height', 8); m.append(gl); g.append(m);
    }
    g.addEventListener('mouseenter', () => showLens(rec)); g.addEventListener('focus', () => showLens(rec));
    const pick = () => { if (!on) return; picked = rec.id; markSel(); showLens(rec); if (o.onPick) o.onPick(rec); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    return g;
  }
  function markSel() { fig.querySelectorAll('.kit-bb-b').forEach(g => g.classList.toggle('sel', g._rec && g._rec.id === picked)); }

  function showLens(rec) {
    curRec = rec; const row = rowOf(rec), d = o.lens ? o.lens(rec) : { title: rec.label || rec.id, sub: [groupLabel(rec), valueText(rec) && 'value ' + valueText(rec), row && row.word].filter(Boolean).join(', ') };
    lens.replaceChildren(); lens.dataset.voTone = row ? row.tone : 'neutral';
    const v = V(); if (row && v) lens.append(v.orb(o.enum, rec.state, { size: 'md', label: true }));
    const t = el('span', 'kit-bb-lt'); t.append(el('b', null, d.title)); t.append(el('span', 'kit-bb-ls', d.sub || '')); lens.append(t);
    if (d.actions && d.actions.length) { const a = el('span', 'kit-bb-la'); d.actions.forEach(x => { const b = el('button', 'kit-bb-act' + (x.danger ? ' kit-bad' : ''), x.label); b.type = 'button'; b.addEventListener('click', e => o.onAction && o.onAction(x.key, rec, e)); a.append(b); }); lens.append(a); }
  }
  function emptyLens() { curRec = null; lens.replaceChildren(el('span', 'kit-bb-hint', o.emptyLens || 'Hover or focus a bubble to see it here.')); delete lens.dataset.voTone; }

  /* ---- clusters */
  function clusters(svg, gs) {
    const W = o.width, b = gs.length <= 5 ? 21 : gs.length <= 9 ? 17 : 14, c = b * 1.32, gap = 28;
    const cells = gs.map(g => ({ g, R: Math.max(40, c * Math.sqrt(g.items.length) + b + 12) })), rows = [[]]; let x = 0;
    cells.forEach(cell => { const d = cell.R * 2; if (x + d > W && rows[rows.length - 1].length) { x = 0; rows.push([]); } rows[rows.length - 1].push(cell); x += d + gap; });
    let yy = 16;
    rows.forEach(row => {
      const rw = row.reduce((n, cl) => n + cl.R * 2, 0) + gap * (row.length - 1), rowH = Math.max(...row.map(cl => cl.R * 2)); let xx = (W - rw) / 2;
      row.forEach(cl => {
        const cx = xx + cl.R, cy = yy + rowH / 2, gEl = sv('g', { class: 'kit-bb-grp', role: 'group', 'aria-label': cl.g.label + ', ' + plural(cl.g.items.length, 'record', 'records') });
        gEl.append(sv('circle', { class: 'kit-bb-pool', cx, cy, r: cl.R }), sv('circle', { class: 'kit-bb-ring', cx, cy, r: cl.R - 3 }));
        const pos = packing(cl.g.items.length, c); cl.g.items.forEach((rec, i) => gEl.append(bubble(rec, cx + pos[i][0], cy + pos[i][1], b, svg)));
        svg.append(gEl, sv('text', { class: 'kit-bb-gl-t', x: cx, y: cy + cl.R + 20, 'text-anchor': 'middle' }, null, cl.g.label), sv('text', { class: 'kit-bb-gl-t kit-bb-sub', x: cx, y: cy + cl.R + 36, 'text-anchor': 'middle' }, null, plural(cl.g.items.length, 'record', 'records')));
        xx += cl.R * 2 + gap;
      });
      yy += rowH + 54;
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + yy);
  }

  /* ---- lanes on a scaled axis */
  function lanes(svg, gs, id) {
    const W = o.width, X0 = 190, X1 = W - 40, f = o.scale.f, vals = o.records.map(r => r.value).filter(v => v != null && v > 0);
    const max = o.scale.max != null ? o.scale.max : Math.max(60, ...vals), xOf = v => (v <= 0 ? X0 - 40 : X0 + (f(v) / f(max)) * (X1 - X0));
    const ticks = (o.scale.ticks || []).filter(t => t[0] <= max * 1.05);
    let y = 44; const L = [];
    gs.forEach(g => {
      const rowsEnd = {}, order = [0, 1, -1, 2, -2, 3, -3];
      const placed = g.items.slice().sort((a, b) => (a.value == null ? 1e9 : a.value) - (b.value == null ? 1e9 : b.value)).map(rec => {
        const x0 = xOf(rec.value == null ? 0 : rec.value); let r = 0, best = 1e9, bx = x0, found = false;
        for (const k of order) { const nx = Math.max(x0, rowsEnd[k] === undefined ? x0 : rowsEnd[k] + 29), shift = nx - x0; if (shift <= 48) { r = k; bx = nx; found = true; break; } if (shift < best) { best = shift; r = k; bx = nx; } }
        void found; rowsEnd[r] = bx; return { rec, x: bx, r };
      });
      const lo = Math.min(0, ...placed.map(p => p.r)), hi = Math.max(0, ...placed.map(p => p.r)), top = y + (-lo) * 30 + 30, bot = top + hi * 30;
      L.push({ g, placed, cy: top, y0: top + lo * 30 - 22, y1: bot + 22 }); y = bot + 56;
    });
    const stops = [0, 1, 2, 3, 4].map(i => '<stop offset="' + (i * 25) + '%" style="stop-color:var(--seam-' + i + ',var(--seam,var(--accent)))"/>').join('');
    svg.insertAdjacentHTML('afterbegin', '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + W + '" y2="0">' + stops + '</linearGradient></defs>');
    L.forEach(l => {
      svg.append(sv('rect', { class: 'kit-bb-pool', x: 8, y: l.y0, width: W - 16, height: l.y1 - l.y0, rx: 30 }),
        sv('path', { class: 'kit-bb-seam', d: 'M' + (X0 - 70) + ' ' + l.cy + ' C ' + (X0 + 160) + ' ' + (l.cy - 6) + ', ' + (X0 + 360) + ' ' + (l.cy + 6) + ', ' + (X1 + 10) + ' ' + l.cy, stroke: 'url(#' + id + ')' }),
        sv('text', { class: 'kit-bb-gl-t kit-bb-lane', x: 28, y: l.cy - 2 }, null, l.g.label), sv('text', { class: 'kit-bb-gl-t kit-bb-sub kit-bb-lane', x: 28, y: l.cy + 16 }, null, plural(l.g.items.length, 'record', 'records')));
      const grp = sv('g', { class: 'kit-bb-grp', role: 'group', 'aria-label': l.g.label + ', ' + plural(l.g.items.length, 'record', 'records') });
      l.placed.forEach(p => grp.append(bubble(p.rec, p.x, l.cy + p.r * 30, 13, svg))); svg.append(grp);
    });
    ticks.forEach(t => { const x = xOf(t[0]); svg.append(sv('circle', { class: 'kit-bb-tick', cx: x, cy: 14, r: 3.2 }), sv('text', { class: 'kit-bb-gl-t kit-bb-sub', x, y: 33, 'text-anchor': 'middle' }, null, t[1])); });
    svg.append(sv('text', { class: 'kit-bb-gl-t kit-bb-sub', x: X0 - 40, y: 33, 'text-anchor': 'middle' }, null, o.scale.nowLabel));
    svg.append(sv('text', { class: 'kit-bb-gl-t kit-bb-sub kit-bb-axis', x: W - 12, y: 33, 'text-anchor': 'end' }, null, o.scale.name + ' scale'));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + y);
  }

  /* ---- orbits (draft) */
  function orbits(svg, gs) {
    const W = o.width, cols = Math.min(4, Math.max(1, gs.length)), cw = W / cols, ch = 250;
    gs.forEach((g, i) => {
      const cx = (i % cols) * cw + cw / 2, cy = Math.floor(i / cols) * ch + 112, rings = [...new Set(g.items.map(r => r.ring || ''))];
      const gEl = sv('g', { class: 'kit-bb-grp', role: 'group', 'aria-label': g.label + ', ' + plural(g.items.length, 'record', 'records') });
      rings.forEach((rk, ri) => {
        const rr = 40 + ri * 19, mine = g.items.filter(r => (r.ring || '') === rk); gEl.append(sv('circle', { class: 'kit-bb-ring kit-bb-orb', cx, cy, r: rr }));
        mine.forEach((rec, j) => { const a = ((j / mine.length) * 360 + (hash(g.key + rk) % 90) - 90) * Math.PI / 180; gEl.append(bubble(rec, cx + rr * Math.cos(a), cy + rr * Math.sin(a), 11.5, svg)); });
      });
      gEl.append(sv('circle', { class: 'kit-bb-core', cx, cy, r: 24 }), sv('text', { class: 'kit-bb-core-t', x: cx, y: cy + 4.5, 'text-anchor': 'middle' }, null, String(g.items.length)));
      svg.append(gEl, sv('text', { class: 'kit-bb-gl-t', x: cx, y: cy + 128, 'text-anchor': 'middle' }, null, g.label), sv('text', { class: 'kit-bb-gl-t kit-bb-sub', x: cx, y: cy + 144, 'text-anchor': 'middle' }, null, plural(g.items.length, 'record', 'records')));
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (Math.ceil(gs.length / cols) * ch + 10));
  }

  function draw() {
    if (tipH) { tipH.destroy(); tipH = null; }
    fig.replaceChildren();
    const svg = sv('svg', { class: 'kit-bb-svg', role: 'group', 'aria-label': o.label + ', ' + (layout === 'lanes' ? 'in lanes by value on a ' + o.scale.name + ' scale' : layout === 'orbits' ? 'as orbits' : 'as clusters'), focusable: 'false' });
    const gs = groupsOf(), id = 'kit-bb' + (++uid);
    if (layout === 'lanes') lanes(svg, gs, id); else if (layout === 'orbits' && o.orbits) orbits(svg, gs); else clusters(svg, gs);
    fig.append(svg);
    tipH = Kit.tooltip ? Kit.tooltip.attach(svg, { selector: '.kit-bb-b', host: o.host || null, focusable: false, content: n => {
      const r = n._rec, row = rowOf(r); return { title: r.label || r.id, text: r.sub || '', rows: [['Group', groupLabel(r)], ['State', row ? row.word : String(r.state || '')], ['Value', valueText(r)]].filter(x => x[1]) }; } }) : null;
    if (curRec) { const again = o.records.find(r => r.id === curRec.id); if (again) showLens(again); else emptyLens(); } else emptyLens();
  }
  draw();
  return {
    setLayout(n) { if (!alive) return; layout = n; draw(); },
    setFilter(fn) { if (!alive) return; filter = fn || null; draw(); },
    select(id) { picked = id; markSel(); const r = o.records.find(x => x.id === id); if (r) showLens(r); },
    update(patch) { if (!alive) return; if (patch && patch.layout) layout = patch.layout; if (patch && 'filter' in patch) filter = patch.filter; o = Object.assign(o, patch); if (patch && patch.scale) o.scale = Object.assign({}, DEF.scale, patch.scale); draw(); },
    destroy() { alive = false; if (tipH) tipH.destroy(); box.replaceChildren(); },
  };
}

Kit.bubbles = Object.freeze({ mount, packing });
})();
/* /part:page.script.kit.viz.bubbles */
