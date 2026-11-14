/* part:page.script.kit.viz.topology */
/**
 * Clickable topology
 * Kit.topology.mount draws nodes in zones, joined by straight links (or a polyline you give) with optional arrows and labels, beside a detail panel. A node is a button: Tab to it, Enter or Space picks it, aria-pressed says which is picked, and hover or focus shows a one-line tooltip. Positions are config; the drawing scales to its box but never narrower than minWidth, below which the figure scrolls inside its own frame so the text stays readable on a phone. A node can carry a state mark (check, bang, cross). The detail panel is a callback that returns rows, lists and tags.
 *
 * API: Kit.topology.mount(box, {width, height, minWidth, zones, nodes, links, notes, detail, selected, onSelect, empty, label, caption, host}) -> {select(id), update(patch), destroy()}
 *   width, height   the viewBox size (default 640 by 360)
 *   zones           [{id, x, y, w, h, title, sub, kind}]   kind "outline" draws a heavier perimeter instead of a filled area
 *   nodes           [{id, x, y, w, h, title, sub, state, tip}]   state {tone: ok | warn | danger, label} adds a round mark with a glyph (check, bang, cross) and the word in the tooltip
 *   links           [{from, to, points, label, dashed, arrow}]   from and to are node ids; points [[x, y], …] replaces the straight line; arrow "to" (default none), "both"; label sits at the middle
 *   notes           [{x, y, text, anchor}]   free text in the drawing
 *   detail          (node) => {kicker, title, sub, rows: [[label, value]], lists: [{title, items}], tags: [{text, on}]} | Node | null, called on each pick
 *   onSelect        (id | null) after a pick; picking the picked node again clears it
 *
 * @id        viz.topology
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   SVG node diagram in zones with links; picking a node fills a detail panel.
 * @tags      topology, network, nodes, diagram, svg, detail, zones, links
 * @requires  kit.tooltip
 * @files     kit/viz/topology.css, kit/samples/topology.json
 * @provides  Kit.topology.mount
 * @config    Kit.topology.mount(box, opts) | width, height, minWidth, zones, nodes, links, notes, detail(node), selected, onSelect, empty, label, caption, host
 * @config    requires | kit.tooltip
 * @tokens    --panel --sunk --ink --ink-2 --rule --f-ui --f-mono --accent --accent-ink --ok --warn --danger --seam? --f-display?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network report, index.html | topoSVG with zones and links, the .tn nodes as buttons, showNode filling a detail panel
 * @preview   {"render": "viz.topology", "samples": ["kit/samples/topology.json"]}
 * @changed   Positions, names and text are config and the detail panel is a callback; the source hard-coded one network.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
const GLYPH = { ok: '✓', warn: '!', danger: '✕' };

function edgePoint(n, tx, ty) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const k = Math.min(dx ? (n.w / 2) / Math.abs(dx) : Infinity, dy ? (n.h / 2) / Math.abs(dy) : Infinity);
  return [cx + dx * k, cy + dy * k];
}

function mount(box, opts) {
  const o = Object.assign({ width: 640, height: 360, minWidth: 560, zones: [], nodes: [], links: [], notes: [], empty: 'Pick a node to see its details.' }, opts);
  let sel = o.selected || null; const id = 'kt' + (++uid);
  box.replaceChildren(); const root = el('div', 'kit-topo'), fig = el('div', 'kit-topo-fig'), side = el('aside', 'kit-topo-side'); side.setAttribute('aria-live', 'polite'); side.setAttribute('aria-label', 'Details');
  fig.tabIndex = 0; fig.setAttribute('role', 'group'); fig.setAttribute('aria-label', (o.label || 'Topology') + '. Use Tab to move between nodes.'); root.append(fig, side); box.append(root);
  if (o.caption) box.append(el('p', 'kit-topo-cap', o.caption));
  const byId = () => Object.fromEntries(o.nodes.map(n => [n.id, n]));
  const tip = n => { const d = o.nodes.find(x => x.id === n.dataset.id); const rows = d.state ? [['State', d.state.label || d.state.tone]] : undefined; return { title: d.title, text: d.tip || d.sub || '', rows }; };

  function drawDetail() {
    side.replaceChildren(); const n = o.nodes.find(x => x.id === sel);
    if (!n) { side.append(el('p', 'kit-topo-empty', o.empty)); return; }
    let d = o.detail ? o.detail(n) : { title: n.title, sub: n.sub };
    if (d instanceof Node) { side.append(d); return; } if (!d) d = { title: n.title, sub: n.sub };
    if (d.kicker) side.append(el('span', 'kit-topo-kick', d.kicker));
    side.append(el('h4', null, d.title || n.title)); if (d.sub) side.append(el('p', 'kit-topo-sub', d.sub));
    if (d.rows && d.rows.length) { const dl = el('dl'); d.rows.forEach(([k, v]) => { dl.append(el('dt', null, k), el('dd', null, v)); }); side.append(dl); }
    (d.lists || []).forEach(l => { side.append(el('h5', null, l.title)); const ul = el('ul'); l.items.forEach(i => ul.append(el('li', null, i))); side.append(ul); });
    if (d.tags && d.tags.length) { const t = el('div', 'kit-topo-tags'); d.tags.forEach(g => t.append(el('span', g.on ? 'on' : null, g.text))); side.append(t); }
  }
  function draw() {
    fig.replaceChildren(); const nb = byId();
    const svg = sv('svg', { viewBox: '0 0 ' + o.width + ' ' + o.height, role: 'presentation' }); svg.style.minWidth = o.minWidth + 'px';
    const defs = sv('defs'), mk = sv('marker', { id: id + 'a', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' }); mk.append(sv('path', { d: 'M0 0L10 5L0 10z' }, 'kit-topo-arrow')); defs.append(mk); svg.append(defs);
    o.zones.forEach(z => {
      svg.append(sv('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: z.kind === 'outline' ? 22 : 14 }, 'kit-topo-zone' + (z.kind === 'outline' ? ' outline' : '')));
      if (z.title) svg.append(sv('text', { x: z.x + 14, y: z.y + 22 }, 'kit-topo-zt', z.title));
      if (z.sub) svg.append(sv('text', { x: z.x + z.w - 14, y: z.y + 22, 'text-anchor': 'end' }, 'kit-topo-zs', z.sub));
    });
    o.links.forEach(l => {
      const a = nb[l.from], b = nb[l.to]; let pts = l.points;
      if (!pts && a && b) { const ca = [a.x + a.w / 2, a.y + a.h / 2], cb = [b.x + b.w / 2, b.y + b.h / 2]; pts = [edgePoint(a, cb[0], cb[1]), edgePoint(b, ca[0], ca[1])]; }
      if (!pts) return;
      const p = sv('path', { d: 'M' + pts.map(q => q[0] + ' ' + q[1]).join('L') }, 'kit-topo-link' + (l.dashed ? ' dashed' : ''));
      if (l.arrow === 'to' || l.arrow === 'both') p.setAttribute('marker-end', 'url(#' + id + 'a)'); if (l.arrow === 'both') p.setAttribute('marker-start', 'url(#' + id + 'a)'); svg.append(p);
      if (l.label) { const m = pts[Math.floor((pts.length - 1) / 2)], m2 = pts[Math.floor((pts.length - 1) / 2) + 1] || m; svg.append(sv('text', { x: (m[0] + m2[0]) / 2, y: (m[1] + m2[1]) / 2 - 6, 'text-anchor': 'middle' }, 'kit-topo-ll', l.label)); }
    });
    o.notes.forEach(t => svg.append(sv('text', { x: t.x, y: t.y, 'text-anchor': t.anchor || 'start' }, 'kit-topo-note', t.text)));
    o.nodes.forEach(n => {
      const g = sv('g', { class: 'kit-topo-node', tabindex: 0, role: 'button', 'aria-pressed': String(n.id === sel), 'data-id': n.id, 'aria-label': n.title + (n.sub ? ', ' + n.sub : '') + (n.state ? ', ' + (n.state.label || n.state.tone) : '') });
      g.append(sv('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 12 }, 'b'), sv('text', { x: n.x + 12, y: n.y + (n.sub ? n.h / 2 - 2 : n.h / 2 + 5) }, 'n', n.title));
      if (n.sub) g.append(sv('text', { x: n.x + 12, y: n.y + n.h / 2 + 15 }, 's', n.sub));
      if (n.id === sel) g.append(sv('text', { x: n.x + n.w - 12, y: n.y + n.h - 10, 'text-anchor': 'end' }, 'kit-topo-picked', '●'));
      if (n.state) { const c = sv('g', { class: 'kit-topo-state kit-topo-s-' + n.state.tone }); c.append(sv('circle', { cx: n.x + n.w - 4, cy: n.y + 4, r: 9 }), sv('text', { x: n.x + n.w - 4, y: n.y + 8, 'text-anchor': 'middle' }, null, GLYPH[n.state.tone] || '•')); g.append(c); }
      svg.append(g);
    });
    fig.append(svg);
  }
  function pick(nid) { sel = (sel === nid) ? null : nid; draw(); drawDetail(); if (th) th.refresh(); const g = fig.querySelector('[data-id="' + sel + '"]'); if (g) g.focus(); if (o.onSelect) o.onSelect(sel); }
  fig.addEventListener('click', e => { const g = e.target.closest('.kit-topo-node'); if (g) pick(g.dataset.id); });
  fig.addEventListener('keydown', e => { const g = e.target.closest && e.target.closest('.kit-topo-node'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(g.dataset.id); } });
  draw(); drawDetail();
  const th = Kit.tooltip ? Kit.tooltip.attach(fig, { host: o.host || document.body, selector: '.kit-topo-node', content: tip, focusable: false }) : null;
  return {
    select(nid) { sel = nid || null; draw(); drawDetail(); if (th) th.refresh(); },
    update(p) { Object.assign(o, p); draw(); drawDetail(); if (th) th.refresh(); },
    destroy() { if (th) th.destroy(); root.remove(); },
  };
}
Kit.topology = Object.freeze({ mount });
})();
/* /part:page.script.kit.viz.topology */
