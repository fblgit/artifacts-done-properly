/* part:page.script.kit.viz.runway */
/**
 * Expiry runway
 * A run of months along a wavy gold seam, one lane for each kind, and a bubble where things end: its area follows the count, its ring and small mark are the worst state in it, its number is the count. A last slot (Later) holds what ends past the run. Pick a bubble (click, Enter, Space) and the board hears the ids. Different from viz.timeline, which draws events down a page: this one answers when the next lot runs out and of which kind. Months, lane height, lanes and the Later cut are options; month names follow the viewer's locale with the year under January. Each bubble is a button with a name that says count, lane, month and worst state, a tip listing the first six names, and arrow-key movement along and between lanes.
 *
 * API:
 *   Kit.runway.mount(box, opts) -> {select(ids), update(patch), destroy()}
 *     opts   { items, lanes, months: 12, laneHeight: 74, laterAfter: months * 30.44 (days), now: Date | ms, locale, enum: "life", skip, severity, selected, label, host, minWidth: 720,
 *              laterLabel: "Later", onPick(ids, info) }
 *              items     [{id, lane, daysLeft, state, label}]  lane is a lane key; daysLeft counts from now (0 or less lands in the first month, "Now"); label names the item in the tooltip
 *              lanes     [{key, label}]  top to bottom
 *              skip      states left off the run (default revoked, ended, replaced, unknown: they do not end later)
 *              severity  states from least to worst; the bubble shows the worst present (default ok, soon, urgent, expired); a state not in the list counts as least
 *              enum      the Kit.vocab enum the states are read from (default "life", the one viz.seal defines; define your own with Kit.vocab.define)
 *              onPick    gets the ids in the bubble and {lane, bin, count, state}
 *     select(ids) marks the bubbles that hold those ids; update(patch) redraws with new options.
 *     Binning: bin = floor(daysLeft / 30.44); a bubble's radius is 13 + sqrt(count) * 5.5. Month names follow the viewer's locale, with the year under January and under "Now".
 *   Kit.runway.bins(items, opts) -> [{lane, bin, ids, state, count}]   the pure part, for a board that draws its own
 * Each bubble is a button (Tab to it; arrows move along and between lanes) with a name that says count, lane, month and the worst state, and a tip (Kit.tooltip) listing the first six labels.
 *
 * Also load kit/vocab.css.
 *
 * @id        viz.runway
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Twelve months along a gold seam, one lane per kind, bubbles sized by how many end that month and coloured by the worst state among them; a Later slot closes the row.
 * @tags      runway, expiry, months, lanes, bubbles, calendar, forecast, bins
 * @requires  viz.seal, kit.vocab, kit.tooltip
 * @files     kit/viz/runway.css, kit/samples/viz.json
 * @provides  Kit.runway.mount, Kit.runway.bins
 * @config    Kit.runway.mount(box, {items, lanes, months, laneHeight, laterAfter, now, locale, enum, skip, severity, selected, onPick}) | items [{id, lane, daysLeft, state, label}], lanes [{key, label}]; onPick(ids, {lane, bin, count, state})
 * @config    states | values of the Kit.vocab enum named by opts.enum (default 'life', defined by viz.seal)
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --seam? --seam-<n>? --glz-r-l? --on-state? --pool? --rim?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's certificate page | runway(): twelve months, lanes, bubbles binned by days left, the Later slot
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's stylesheet | the month labels, the gold axis and the now bead
 * @preview   {"render": "viz.runway", "samples": ["kit/samples/viz.json#runway"]}
 * @changed   Months, lane height, lanes and the Later cut are options; the states and their words are the vocab's.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const DAY = 30.44;
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
const DEF = { items: [], lanes: [], months: 12, laneHeight: 74, now: null, locale: undefined, enum: 'life', skip: ['revoked', 'ended', 'replaced', 'unknown'], severity: ['ok', 'soon', 'urgent', 'expired'], selected: [], label: 'When things end', minWidth: 720, laterLabel: 'Later' };

function bins(items, o) {
  o = Object.assign({}, DEF, o);
  const later = o.laterAfter != null ? o.laterAfter : o.months * DAY, out = new Map(), sev = s => Math.max(0, o.severity.indexOf(s));
  items.forEach(it => {
    if (o.skip.includes(it.state) || it.daysLeft == null) return;
    const bin = it.daysLeft >= later ? o.months : Math.max(0, Math.min(o.months - 1, Math.floor(it.daysLeft / DAY)));
    const k = it.lane + '|' + bin; let b = out.get(k); if (!b) out.set(k, b = { lane: it.lane, bin, ids: [], items: [], state: it.state, count: 0 });
    b.ids.push(it.id); b.items.push(it); b.count++; if (sev(it.state) > sev(b.state)) b.state = it.state;
  });
  return [...out.values()];
}

function mount(box, opts) {
  let o = Object.assign({}, DEF, opts), alive = true, tipH = null, sel = new Set(o.selected || []);
  const root = el('div', 'kit-rw'); box.replaceChildren(root);
  function draw() {
    if (tipH) { tipH.destroy(); tipH = null; }
    root.replaceChildren();
    const W = 1000, X0 = 190, X1 = 880, LATER = 940, LH = o.laneHeight, top = 44, lanes = o.lanes, months = o.months;
    const H = top + lanes.length * LH + 54, step = (X1 - X0) / months, id = 'kit-rw' + (++uid);
    const scroll = el('div', 'kit-rw-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'group'); scroll.setAttribute('aria-label', o.label + '. Tab to a bubble to hear it; arrow keys move between bubbles.');
    const svg = sv('svg', { class: 'kit-rw-svg', viewBox: '0 0 ' + W + ' ' + H, focusable: 'false' }); svg.style.minWidth = o.minWidth + 'px';
    const stops = [0, 1, 2, 3, 4].map(i => '<stop offset="' + (i * 25) + '%" style="stop-color:var(--seam-' + i + ',var(--seam,var(--accent)))"/>').join('');
    svg.innerHTML = '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + W + '" y2="0">' + stops + '</linearGradient></defs>';
    const now = o.now != null ? new Date(+o.now) : new Date();
    for (let m = 0; m < months; m++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1)), cx = X0 + step * (m + .5);
      svg.append(sv('text', { class: 'kit-rw-month', x: cx, y: H - 30, 'text-anchor': 'middle' }, null, m === 0 ? 'Now' : d.toLocaleDateString(o.locale, { month: 'short', timeZone: 'UTC' })));
      if (m === 0 || d.getUTCMonth() === 0) svg.append(sv('text', { class: 'kit-rw-month kit-rw-yr', x: cx, y: H - 12, 'text-anchor': 'middle' }, null, String(d.getUTCFullYear())));
    }
    svg.append(sv('text', { class: 'kit-rw-month', x: LATER, y: H - 30, 'text-anchor': 'middle' }, null, o.laterLabel));
    const all = bins(o.items, o), btns = [];
    const V = Kit.vocab;
    lanes.forEach((ln, li) => {
      const y = top + li * LH + LH / 2;
      svg.append(sv('path', { class: 'kit-rw-seam', d: 'M' + (X0 - 30) + ' ' + y + ' Q ' + (X0 + 120) + ' ' + (y - 9) + ' ' + (X0 + 280) + ' ' + y + ' T ' + (X0 + 600) + ' ' + y + ' T ' + (LATER + 30) + ' ' + y, stroke: 'url(#' + id + ')' }),
        sv('circle', { class: 'kit-rw-now', cx: X0 - 30, cy: y, r: 5.5 }), sv('text', { class: 'kit-rw-lane', x: 10, y: y + 5 }, null, ln.label));
      all.filter(b => b.lane === ln.key).forEach(b => {
        const cx = b.bin === months ? LATER : X0 + step * (b.bin + .5), r = 13 + Math.sqrt(b.count) * 5.5, row = V ? V.get(o.enum, b.state) : null;
        const tone = row ? row.tone : 'neutral', word = row ? row.word : String(b.state);
        const when = b.bin === months ? o.laterLabel.toLowerCase() : b.bin === 0 ? 'now' : 'in month ' + (b.bin + 1);
        const g = sv('g', { class: 'kit-rw-b', tabindex: 0, role: 'button', 'data-lane': ln.key, 'data-bin': b.bin, 'data-vo-tone': tone, 'data-cx': cx,
          'aria-label': b.count + ' ' + ln.label + ' ending ' + when + ', worst: ' + word });
        g.dataset.ids = b.ids.join('|'); g._bin = b;
        g.append(sv('circle', { class: 'kit-rw-halo', cx, cy: y, r: r + 6 }), sv('circle', { class: 'kit-rw-bub', cx, cy: y, r }), sv('text', { class: 'kit-rw-n', x: cx, y: y + 5, 'text-anchor': 'middle' }, null, String(b.count)));
        if (row && V) {
          const m = sv('g', { class: 'kit-rw-mk', transform: 'translate(' + (cx + r * .72).toFixed(1) + ' ' + (y - r * .72).toFixed(1) + ')' });
          m.append(sv('circle', { r: 8.5 })); const gl = V.glyph(row.glyph); gl.setAttribute('x', -5.5); gl.setAttribute('y', -5.5); gl.setAttribute('width', 11); gl.setAttribute('height', 11); m.append(gl); g.append(m);
        }
        if (b.ids.some(x => sel.has(x))) g.classList.add('sel');
        const go = () => { if (o.onPick) o.onPick(b.ids.slice(), { lane: ln.key, bin: b.bin, count: b.count, state: b.state }); };
        g.addEventListener('click', go);
        g.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); return; }
          const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0; if (!dx && !dy) return;
          e.preventDefault(); const li2 = lanes.findIndex(l => l.key === ln.key) + dy; const mine = +g.dataset.cx;
          const pool = btns.filter(x => x.dataset.lane === (dy ? (lanes[li2] || {}).key : ln.key) && x !== g);
          const pick = dx ? pool.filter(x => (+x.dataset.cx - mine) * dx > 0).sort((p, q) => Math.abs(p.dataset.cx - mine) - Math.abs(q.dataset.cx - mine))[0]
            : pool.sort((p, q) => Math.abs(p.dataset.cx - mine) - Math.abs(q.dataset.cx - mine))[0];
          if (pick) pick.focus();
        });
        btns.push(g); svg.append(g);
      });
    });
    scroll.append(svg); root.append(scroll);
    tipH = Kit.tooltip ? Kit.tooltip.attach(svg, { selector: '.kit-rw-b', host: o.host || null, focusable: false, content: n => {
      const b = n._bin, lane = lanes.find(l => l.key === b.lane), row = V ? V.get(o.enum, b.state) : null, names = b.items.map(i => i.label || i.id);
      return { title: b.count + (b.count === 1 ? ' ends ' : ' end ') + (b.bin === months ? o.laterLabel.toLowerCase() : b.bin === 0 ? 'now' : 'in month ' + (b.bin + 1)) + ', ' + (lane ? lane.label : b.lane),
        text: names.slice(0, 6).join(', ') + (names.length > 6 ? ' and ' + (names.length - 6) + ' more' : ''), rows: row ? [['Worst', row.word]] : undefined }; } }) : null;
  }
  draw();
  return {
    select(ids) { sel = new Set(ids || []); root.querySelectorAll('.kit-rw-b').forEach(g => g.classList.toggle('sel', g.dataset.ids.split('|').some(x => sel.has(x)))); },
    update(patch) { if (!alive) return; o = Object.assign(o, patch); if (patch && patch.selected) sel = new Set(patch.selected); draw(); },
    destroy() { alive = false; if (tipH) tipH.destroy(); box.replaceChildren(); },
  };
}

Kit.runway = Object.freeze({ mount, bins });
})();
/* /part:page.script.kit.viz.runway */
