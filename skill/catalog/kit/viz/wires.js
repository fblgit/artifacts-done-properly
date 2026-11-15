/* part:page.script.kit.viz.wires */
/**
 * Swimlane schematic with dependency wires
 * Kit.wires.mount(box, {lanes, phases, nodes}) draws a grid of lanes (rows) by phases (columns) with one node per item and a wire from each dependency to the item that waits on it. Wires leave the right edge of the dependency and arrive at the left edge of the item with an arrowhead; a dependency that is done draws green, and one that sits to the right loops round. A filter (a list of states or a function) dims what it does not match and keeps the shape of the plan. Hover or focus a node to light its wires. Each node is a button (or a link when it has an href) whose accessible name says its state, lane, phase and what it waits on, so the schematic is readable without seeing the wires. The wires are measured from the real boxes and redrawn when the box, the fonts or the theme change. Wide schematics scroll sideways inside their own box.
 *
 * API (small and stable):
 *   Kit.wires.mount(box, {lanes, phases, nodes, label, filter, stateEnum, doneStates, onSelect}) -> {update(opts), setFilter(f), destroy()}
 *     lanes     [{id, label, sub}]          one row each (sub is a small line under the label, for example a role)
 *     phases    [{id, label}]               one column each, left to right
 *     nodes     [{id, title, lane, phase, state, after: [id], href}]   state is a value of stateEnum in Kit.vocab; href makes the node a link, otherwise it is a button
 *     filter    null | [state values to keep lit] | (node) -> boolean   what is false dims; the node stays, wires to a dimmed node dim with it
 *     stateEnum the Kit.vocab enum the states come from (default "state"); a state the table does not know is drawn neutral with its raw word
 *     doneStates [state values]             states whose outgoing wires draw as done (default ["done"])
 *     onSelect  (node, event)               a node was chosen with a click or Enter
 *   Dimmed nodes keep their keyboard stop; each node says its state, its lane and phase and what it waits on in its accessible name.
 *
 * Uses ResizeObserver; without it the wires redraw on window resize only.
 *
 * @id        viz.wires
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Items as nodes on lanes by phases, joined by orthogonal wires drawn from their dependencies; a filter dims, never hides.
 * @tags      wires, dependencies, swimlane, schematic, lanes, phases, graph, after, filter, dim
 * @requires  kit.tokens, kit.vocab
 * @files     kit/viz/wires.css, kit/samples/viz.json
 * @provides  Kit.wires.mount
 * @config    Kit.wires.mount(box, {lanes, phases, nodes, label, filter, stateEnum, doneStates, onSelect}) | lanes [{id, label, sub}], phases [{id, label}], nodes [{id, title, lane, phase, state, after: [id], href}]; returns {update(opts), setFilter(f), destroy()}
 * @config    Kit.vocab | node states come from a Kit.vocab enum (default 'state'); load kit/vocab.js and kit/vocab.css first
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --ok --f-ui --f-mono --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's blueprint skin | the lanes by phases schematic and the wires between its components
 * @preview   {"render": "viz.wires", "samples": ["kit/samples/viz.json#viz-wires"], "uses": ["kit.vocab"]}
 * @samples   viz-wires
 * @changed   Generalised from one skin's task list to any items with lanes, phases and dependencies; the state word and tone come from the vocabulary instead of a task status.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const rowOf = (en, v) => { const g = Kit.vocab && Kit.vocab.get && Kit.vocab.get(en, v); return g || { word: String(v == null ? 'none' : v), tone: 'neutral' }; };

function mount(box, opts) {
  const o = Object.assign({ lanes: [], phases: [], nodes: [], label: 'Dependency schematic', stateEnum: 'state', doneStates: ['done'], filter: null }, opts);
  box.textContent = ''; box.classList.add('kit-wr');
  const scroll = el('div', 'kit-wr-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
  const grid = el('div', 'kit-wr-grid'); const svg = sv('svg', { class: 'kit-wr-svg', 'aria-hidden': 'true', focusable: 'false' });
  grid.append(svg); scroll.append(grid); box.append(scroll);
  let raf = 0, ro = null, hot = null; const nodeEls = new Map();

  function lit(n) {
    const f = o.filter; if (f == null) return true;
    return Array.isArray(f) ? f.includes(n.state) : !!f(n);
  }
  function build() {
    scroll.setAttribute('aria-label', o.label);
    [...grid.children].forEach(n => { if (n !== svg) n.remove(); });
    nodeEls.clear(); grid.style.setProperty('--kit-wr-cols', String(o.phases.length));
    const fed = new Set(); o.nodes.forEach(n => (n.after || []).forEach(id => fed.add(id)));
    const corner = el('div', 'kit-wr-corner'); corner.append(el('span', null, 'Lane'), el('span', null, 'Phase')); grid.append(corner);
    o.phases.forEach((p, i) => { const h = el('div', 'kit-wr-head'); h.append(el('span', 'kit-wr-pn', 'P' + (i + 1)), el('b', null, p.label)); grid.append(h); });
    o.lanes.forEach(l => {
      const lh = el('div', 'kit-wr-lane'); lh.append(el('b', null, l.label)); if (l.sub) lh.append(el('small', null, l.sub)); grid.append(lh);
      o.phases.forEach(p => {
        const c = el('div', 'kit-wr-cell');
        o.nodes.filter(n => n.lane === l.id && n.phase === p.id).forEach(n => {
          const r = rowOf(o.stateEnum, n.state), a = n.href ? el('a', 'kit-wr-node') : el('button', 'kit-wr-node');
          if (n.href) a.href = n.href; else a.type = 'button';
          a.dataset.node = n.id; a.setAttribute('data-vo-tone', r.tone);
          if ((n.after || []).length) a.classList.add('kit-wr-in'); if (fed.has(n.id)) a.classList.add('kit-wr-out');
          const top = el('span', 'kit-wr-top'); top.append(el('span', 'kit-wr-id', n.id), el('span', 'kit-wr-st', r.word));
          a.append(top, el('span', 'kit-wr-t', n.title));
          const waits = (n.after || []).join(', ');
          a.setAttribute('aria-label', n.id + ', ' + n.title + ', ' + r.word + ', lane ' + l.label + ', phase ' + p.label + (waits ? ', after ' + waits : ''));
          a.addEventListener('click', e => { if (o.onSelect) o.onSelect(n, e); });
          const on = () => { hot = n.id; paint(); }, off = () => { hot = null; paint(); };
          a.addEventListener('pointerenter', on); a.addEventListener('pointerleave', off); a.addEventListener('focus', on); a.addEventListener('blur', off);
          c.append(a); nodeEls.set(n.id, a);
        });
        grid.append(c);
      });
    });
    shade(); sched();
  }
  function shade() { o.nodes.forEach(n => { const a = nodeEls.get(n.id); if (a) a.classList.toggle('kit-wr-dim', !lit(n)); }); }
  function paint() { svg.querySelectorAll('[data-from]').forEach(p => p.classList.toggle('kit-wr-hot', !!hot && (p.dataset.from === hot || p.dataset.to === hot))); }
  function draw() {
    raf = 0; const B = grid.getBoundingClientRect(); if (!B.width) return;
    svg.setAttribute('width', B.width); svg.setAttribute('height', B.height); svg.setAttribute('viewBox', '0 0 ' + B.width + ' ' + B.height); svg.textContent = '';
    const byId = new Map(o.nodes.map(n => [n.id, n]));
    o.nodes.forEach(t => {
      const tn = nodeEls.get(t.id); if (!tn || !(t.after || []).length) return; const T = tn.getBoundingClientRect();
      t.after.forEach(id => {
        const sn = nodeEls.get(id), s = byId.get(id); if (!sn || !s) return; const R = sn.getBoundingClientRect();
        const x1 = R.right - B.left, y1 = R.top - B.top + R.height / 2, x2 = T.left - B.left, y2 = T.top - B.top + T.height / 2;
        let d, head;
        if (x2 > x1 + 16) { d = 'M' + x1 + ' ' + y1 + 'H' + (x2 - 13) + 'V' + y2 + 'H' + (x2 - 6); head = 'M' + x2 + ' ' + y2 + 'l-7 -4v8z'; }
        else { const xr = Math.max(x1, T.right - B.left) + 12; d = 'M' + x1 + ' ' + y1 + 'H' + xr + 'V' + y2 + 'H' + (T.right - B.left + 6); head = 'M' + (T.right - B.left) + ' ' + y2 + 'l7 -4v8z'; }
        const done = o.doneStates.includes(s.state), dim = !lit(s) || !lit(t);
        const cls = (done ? ' kit-wr-ok' : '') + (dim ? ' kit-wr-dimw' : ''), tag = { 'data-from': id, 'data-to': t.id };
        svg.append(sv('path', Object.assign({ class: 'kit-wr-w' + cls, d }, tag)), sv('path', Object.assign({ class: 'kit-wr-h' + cls, d: head }, tag)), sv('circle', Object.assign({ class: 'kit-wr-j' + cls, cx: x1, cy: y1, r: 2.5 }, tag)));
      });
    });
    paint();
  }
  function sched() { if (!raf) raf = requestAnimationFrame(draw); }
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(sched); ro.observe(grid); }
  window.addEventListener('resize', sched);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sched).catch(() => {});
  build();
  return {
    update(next) { Object.assign(o, next); build(); },
    setFilter(f) { o.filter = f; shade(); sched(); },
    destroy() { if (ro) ro.disconnect(); window.removeEventListener('resize', sched); cancelAnimationFrame(raf); box.textContent = ''; box.classList.remove('kit-wr'); },
  };
}
Kit.wires = Object.freeze({ mount });
})();
/* /part:page.script.kit.viz.wires */
