/* part:page.script.kit.viz.shelf */
/* Kit visualization: to-scale capacity shelf (Kit.shelf)    kit version 0.1.0
   What it is: one track per unit (a disk, a node, a quota) drawn on a shared scale: a unit twice as big has a track twice as long, and a track is cut into segments in proportion to their size.
   Inside a segment the used part is solid, the allocated but unused part is hatched, and an unallocated segment is an empty dashed outline, so the three read without colour. A flagged
   segment gets a --danger ring and a "!" in its label. Segments above a size threshold are named under the track; every segment has a tooltip and a keyboard stop. A unit can carry
   status chips (a mark and a word).
   API: Kit.shelf.mount(box, {units, unit, labelAbove, legend, label, caption, host}) -> {update(patch), destroy()}
     units       [{id, name, sub, capacity, segments: [{id, label, size, used, kind, tone, flag, note}], chips: [{text, tone}]}]
                 capacity is the track's full size (defaults to the sum of its segments); kind "alloc" (default) or "free"; used is a number from 0 to size; flag is a short reason or true
     unit        "GiB": printed after every figure
     labelAbove  smallest segment, as a share of the largest unit, that is named under the track (default 0.04); the rest are on hover and focus
     legend      false hides the key (default true)
   Needs from the board:
     requires kit.tooltip (Kit.tooltip.attach)
     css     kit/viz/shelf.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --ok --warn --danger --f-ui --f-mono, the pens --c-blue --c-amber --c-violet --c-green --c-red, optional --seam
     globals Kit.tooltip
   db collections: none.
   Lifted from: a disk-usage report's drive shelf (drawDrives: tracks to scale, hatched allocations with a solid used fill, dashed unallocated space, a ringed "only copy" segment, status chips). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const PENS = ['blue', 'amber', 'violet', 'red', 'green'], MEAN = ['ok', 'warn', 'danger', 'accent', 'muted'];
const toneOf = (t, i) => PENS.includes(t) || MEAN.includes(t) ? t : PENS[i % PENS.length];
const MARK = { ok: '✓', warn: '!', danger: '✕', accent: '•', muted: '–' };
const fmt = v => Number(v).toLocaleString('en-GB', { maximumFractionDigits: 1 });

function mount(box, opts) {
  const o = Object.assign({ units: [], unit: '', labelAbove: 0.04, legend: true }, opts); let segs = [];
  box.replaceChildren(); const root = el('div', 'kit-shelf'); root.setAttribute('role', 'group'); if (o.label) root.setAttribute('aria-label', o.label); box.append(root);
  const u = v => fmt(v) + (o.unit ? ' ' + o.unit : '');
  const tip = n => {
    const s = segs[+n.dataset.tipI], rows = [['Size', u(s.size)]];
    if (s.kind !== 'free') rows.push(['Used', s.used ? u(s.used) + ' (' + Math.round(s.used / s.size * 100) + '%)' : 'none']); else rows.push(['State', 'Unallocated']);
    if (s.flag) rows.push(['Flag', s.flag === true ? 'Flagged' : s.flag]); if (s.note) rows.push(['Note', s.note]);
    return { title: s.unitName + ': ' + s.label, rows };
  };
  function draw() {
    root.replaceChildren(); segs = [];
    const caps = o.units.map(d => d.capacity || d.segments.reduce((a, s) => a + s.size, 0)), max = Math.max.apply(null, caps.concat([1]));
    o.units.forEach((d, ui) => {
      const row = el('div', 'kit-shelf-unit'), id = el('div', 'kit-shelf-id'); id.append(el('b', null, d.name)); if (d.sub) id.append(el('span', null, d.sub)); id.append(el('span', 'kit-shelf-cap', u(caps[ui])));
      const body = el('div', 'kit-shelf-body'), track = el('div', 'kit-shelf-track'), bar = el('div', 'kit-shelf-bar'); bar.style.width = (caps[ui] / max * 100) + '%';
      const names = el('div', 'kit-shelf-names');
      d.segments.forEach((s, si) => {
        const kind = s.kind === 'free' ? 'free' : 'alloc', seg = Object.assign({}, s, { kind, unitName: d.name }); segs.push(seg);
        const b = el('div', 'kit-shelf-seg kit-t-' + toneOf(s.tone, 0) + ' is-' + kind + (s.flag ? ' is-flag' : '')); b.style.flex = s.size + ' 1 0'; b.dataset.tipI = segs.length - 1;
        b.setAttribute('aria-label', d.name + ', ' + s.label + ': ' + u(s.size) + (kind === 'free' ? ', unallocated' : s.used ? ', ' + u(s.used) + ' used' : '') + (s.flag ? ', flagged' + (s.flag === true ? '' : ': ' + s.flag) : ''));
        if (kind === 'alloc' && s.used) { const f = el('span', 'kit-shelf-fill'); f.style.width = Math.min(100, s.used / s.size * 100) + '%'; b.append(f); }
        bar.append(b);
        if (s.size / max >= o.labelAbove) { const n = el('span', s.flag ? 'is-flag' : null); n.append(el('b', null, (s.flag ? '! ' : '') + s.label), document.createTextNode(' ' + u(s.size) + (kind === 'alloc' && s.used ? ' (' + fmt(s.used) + ' used)' : kind === 'free' ? ' (unallocated)' : ''))); names.append(n); }
      });
      track.append(bar); body.append(track, names);
      if (d.chips && d.chips.length) { const ch = el('div', 'kit-shelf-chips'); d.chips.forEach(c => { const t = MEAN.includes(c.tone) ? c.tone : 'muted', s = el('span', 'kit-shelf-chip kit-t-' + t); s.append(el('i', null, MARK[t] || '•'), document.createTextNode(c.text)); ch.append(s); }); body.append(ch); }
      row.append(id, body); root.append(row);
    });
    if (o.legend) {
      const lg = el('ul', 'kit-shelf-legend'), add = (cls, text) => { const li = el('li'), sw = el('span', 'kit-shelf-sw ' + cls); sw.setAttribute('aria-hidden', 'true'); li.append(sw, document.createTextNode(text)); lg.append(li); };
      add('used', 'Used'); add('alloc', 'Allocated, not used'); add('free', 'Unallocated'); add('flag', 'Flagged'); root.append(lg);
    }
    root.append(el('p', 'kit-shelf-cap2', 'Track length is size on one scale' + (o.units.length > 1 ? ' across all units' : '') + '. Segments under ' + Math.round(o.labelAbove * 100) + '% of the largest unit are named on hover or focus.'));
    if (o.caption) root.append(el('p', 'kit-shelf-cap2', o.caption));
  }
  draw();
  const th = Kit.tooltip ? Kit.tooltip.attach(root, { host: o.host || document.body, selector: '[data-tip-i]', content: tip }) : null;
  return { update(p) { Object.assign(o, p); draw(); if (th) th.refresh(); }, destroy() { if (th) th.destroy(); root.remove(); } };
}
Kit.shelf = Object.freeze({ mount });
})();
/* /part:page.script.kit.viz.shelf */
