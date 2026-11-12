/* part:page.script.kit.viz.sparkline */
/* Kit visualization: sparkline, bar sparkline and waveform (Kit.sparkline)    kit version 0.1.0
   What it is: three small marks that fit in a line of text or a table cell and still tell the truth.
     line   a line over a short series with an optional area, an emphasised last point and hollow low and high points. The vertical range is the data's own (a line shows shape, not size) and
            the text under it says the low, the high and the last value, so the range is never hidden. Hover or arrow keys scrub the points; each one reads out in the tooltip.
     bars   one bar per value, drawn from zero on a linear scale, so the heights compare.
     wave   a waveform: one mirrored bar per sample, a played part in the accent and the rest quiet, with marked windows (a hatched band, a word and a keyboard stop each). With onSeek it is a
            slider: click, drag or use the arrow keys, Home and End.
   All three draw at the pixel width of their box (and again when it changes), use tokens for every colour and never use colour alone: the last point is a ring, the marked windows are hatched.
   API (each returns {update(patch), destroy()}):
     Kit.sparkline.line(box, {values, labels, unit, decimals, height, area, tone, caption, label, host})
     Kit.sparkline.bars(box, {values, labels, unit, decimals, height, tone, highlight, caption, label, host})   highlight: the index drawn in full colour while the others are quieter
     Kit.sparkline.wave(box, {values, marks, progress, height, onSeek, caption, label, host})   values 0 to 1; marks [{from, to, label, tone}] in 0 to 1; progress 0 to 1
     tone    a pen (blue amber violet green red) or a meaning (ok warn danger accent); default blue
   Needs from the board:
     requires kit.tooltip (Kit.tooltip.show/hide/attach)
     css     kit/viz/sparkline.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --ok --warn --danger --f-ui --f-mono, the pens --c-blue --c-amber --c-violet --c-green --c-red, optional --seam
     globals Kit.tooltip
   db collections: none.
   Lifted from: a secret-scan report (a per-line entropy sparkline under a character sweep) and a music-library page (the waveform with window marks and a played part). Changed: the sweep animation
   is dropped; the line says its range in words; the waveform is a slider. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
const PENS = ['blue', 'amber', 'violet', 'red', 'green'], MEAN = ['ok', 'warn', 'danger', 'accent'];
const toneOf = t => PENS.includes(t) || MEAN.includes(t) ? t : 'blue';
const fmt = (v, d) => Number(v).toLocaleString('en-GB', { maximumFractionDigits: d == null ? 1 : d });
const u = (v, unit, d) => fmt(v, d) + (unit ? ' ' + unit : '');

/* a box that redraws at its own width */
function fit(box, cls, label, draw) {
  box.replaceChildren(); const root = el('div', 'kit-sp ' + cls), plot = el('div', 'kit-sp-plot'), cap = el('p', 'kit-sp-cap'); root.append(plot, cap); box.append(root);
  if (label) root.setAttribute('aria-label', label); let ro = null, w = 0, raf = 0;
  const run = () => { w = Math.max(60, Math.floor(plot.clientWidth || box.clientWidth || 160)); plot.replaceChildren(); cap.hidden = !draw(plot, cap, w); };
  run(); if (window.ResizeObserver) { ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const nw = Math.floor(plot.clientWidth); if (nw && Math.abs(nw - w) > 1) run(); }); }); ro.observe(box); }
  return { root, plot, redraw: run, destroy() { if (ro) ro.disconnect(); cancelAnimationFrame(raf); root.remove(); } };
}

/* ---- line */
function line(box, opts) {
  const o = Object.assign({ values: [], height: 44, area: true, unit: '' }, opts); let cur = -1, svgEl = null, geo = null;
  const name = i => (o.labels && o.labels[i] != null ? o.labels[i] : 'Point ' + (i + 1));
  const show = (i, cx, cy) => {
    cur = i; if (!Kit.tooltip || !geo) return; const r = svgEl.getBoundingClientRect();
    Kit.tooltip.show(svgEl, { title: name(i), rows: [['Value', u(o.values[i], o.unit, o.decimals)]] }, { x: r.left + geo.x(i), y: r.top + geo.y(o.values[i]), host: o.host });
    svgEl.querySelectorAll('.kit-sp-cur').forEach(n => n.remove()); const c = sv('circle', { cx: geo.x(i), cy: geo.y(o.values[i]), r: 4 }, 'kit-sp-cur'); svgEl.append(c);
  };
  const clear = () => { cur = -1; if (Kit.tooltip) Kit.tooltip.hide(); if (svgEl) svgEl.querySelectorAll('.kit-sp-cur').forEach(n => n.remove()); };
  const f = fit(box, 'is-line is-' + toneOf(o.tone), o.label, (plot, cap, W) => {
    const v = o.values; if (!v.length) { plot.append(el('span', 'kit-sp-none', 'No data')); return false; }
    const H = o.height, P = 6, lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = hi - lo || 1, n = v.length;
    const x = i => P + (n === 1 ? (W - 2 * P) / 2 : i / (n - 1) * (W - 2 * P)), y = val => H - P - (val - lo) / span * (H - 2 * P);
    geo = { x, y }; svgEl = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, tabindex: 0, role: 'img', 'aria-label': (o.label || 'Sparkline') + ', ' + n + ' values, from ' + u(v[0], o.unit, o.decimals) + ' to ' + u(v[n - 1], o.unit, o.decimals) + '. Arrow keys read each value.' });
    const pts = v.map((val, i) => x(i) + ' ' + y(val));
    if (o.area && n > 1) svgEl.append(sv('path', { d: 'M' + pts.join('L') + 'L' + x(n - 1) + ' ' + (H - P) + 'L' + x(0) + ' ' + (H - P) + 'Z' }, 'kit-sp-area'));
    svgEl.append(sv('path', { d: 'M' + pts.join('L') }, 'kit-sp-line'));
    const imin = v.indexOf(lo), imax = v.indexOf(hi);
    if (n > 2) { [imin, imax].forEach(i => { if (i !== n - 1) svgEl.append(sv('circle', { cx: x(i), cy: y(v[i]), r: 3 }, 'kit-sp-ext')); }); }
    svgEl.append(sv('circle', { cx: x(n - 1), cy: y(v[n - 1]), r: 4.5 }, 'kit-sp-end'));
    svgEl.addEventListener('pointermove', e => { const r = svgEl.getBoundingClientRect(), px = e.clientX - r.left; let b = 0, bd = 1e9; v.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; b = i; } }); show(b); });
    svgEl.addEventListener('pointerleave', () => { if (!svgEl.matches(':focus-visible')) clear(); });
    svgEl.addEventListener('focus', () => { if (svgEl.matches(':focus-visible')) show(cur < 0 ? n - 1 : cur); });
    svgEl.addEventListener('blur', clear);
    svgEl.addEventListener('keydown', e => { const k = e.key; let i = cur < 0 ? n - 1 : cur; if (k === 'ArrowLeft') i--; else if (k === 'ArrowRight') i++; else if (k === 'Home') i = 0; else if (k === 'End') i = n - 1; else return; e.preventDefault(); show(Math.max(0, Math.min(n - 1, i))); });
    plot.append(svgEl);
    cap.textContent = o.caption || 'Low ' + u(lo, o.unit, o.decimals) + ', high ' + u(hi, o.unit, o.decimals) + ', last ' + u(v[n - 1], o.unit, o.decimals) + '. The range is the data’s own, not zero.'; return true;
  });
  return { update(p) { Object.assign(o, p); f.redraw(); }, destroy() { clear(); f.destroy(); } };
}

/* ---- bars */
function bars(box, opts) {
  const o = Object.assign({ values: [], height: 44, unit: '' }, opts); let svgEl = null;
  const f = fit(box, 'is-bars is-' + toneOf(o.tone), o.label, (plot, cap, W) => {
    const v = o.values; if (!v.length) { plot.append(el('span', 'kit-sp-none', 'No data')); return false; }
    const H = o.height, hi = Math.max.apply(null, v.concat([0])) || 1, n = v.length, g = n > 40 ? 0 : 2, bw = Math.max(1, (W - g * (n - 1)) / n);
    svgEl = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': (o.label || 'Bar sparkline') + ', ' + n + ' bars from zero' });
    svgEl.append(sv('line', { x1: 0, x2: W, y1: H - .5, y2: H - .5 }, 'kit-sp-base'));
    v.forEach((val, i) => {
      const h = Math.max(val > 0 ? 2 : 0, Math.max(0, val) / hi * (H - 3)), b = sv('rect', { x: i * (bw + g), y: H - 1 - h, width: bw, height: h, rx: Math.min(2, bw / 2) }, 'kit-sp-bar' + (o.highlight === i ? ' on' : o.highlight != null ? ' dim' : ''));
      b.dataset.tipI = i; b.setAttribute('aria-label', (o.labels && o.labels[i] != null ? o.labels[i] : 'Bar ' + (i + 1)) + ': ' + u(val, o.unit, o.decimals)); svgEl.append(b);
    });
    plot.append(svgEl); cap.textContent = o.caption || 'Bars start at zero; the tallest is ' + u(hi, o.unit, o.decimals) + '.'; return true;
  });
  const th = Kit.tooltip ? Kit.tooltip.attach(f.root, { host: o.host || document.body, selector: '[data-tip-i]', content: n => { const i = +n.dataset.tipI; return { title: o.labels && o.labels[i] != null ? o.labels[i] : 'Bar ' + (i + 1), rows: [['Value', u(o.values[i], o.unit, o.decimals)]] }; } }) : null;
  return { update(p) { Object.assign(o, p); f.redraw(); if (th) th.refresh(); }, destroy() { if (th) th.destroy(); f.destroy(); } };
}

/* ---- wave */
function wave(box, opts) {
  const o = Object.assign({ values: [], marks: [], progress: 0, height: 56 }, opts); const id = 'ksp' + (++uid); let svgEl = null, wvs = [], head = null, nbar = 1;
  const pctText = () => Math.round(o.progress * 100) + ' per cent';
  const paint = () => {
    wvs.forEach((r, i) => r.classList.toggle('on', (i + .5) / nbar <= o.progress));
    if (head) { head.setAttribute('x1', o.progress * svgW); head.setAttribute('x2', o.progress * svgW); head.style.display = o.progress > 0 ? '' : 'none'; }
    if (svgEl && o.onSeek) { svgEl.setAttribute('aria-valuenow', Math.round(o.progress * 100)); svgEl.setAttribute('aria-valuetext', pctText()); }
  };
  let svgW = 1;
  const seek = p => { o.progress = Math.max(0, Math.min(1, p)); paint(); if (o.onSeek) o.onSeek(o.progress); };
  const f = fit(box, 'is-wave', o.label, (plot, cap, W) => {
    const v = o.values; if (!v.length) { plot.append(el('span', 'kit-sp-none', 'No data')); return false; }
    const H = o.height, mid = H / 2, n = Math.max(8, Math.min(v.length, Math.floor(W / 4))), bw = W / n, step = v.length / n; svgW = W; nbar = n; wvs = [];
    svgEl = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: o.onSeek ? 'slider' : 'img', 'aria-label': o.label || 'Waveform' });
    if (o.onSeek) { svgEl.setAttribute('tabindex', 0); svgEl.setAttribute('aria-valuemin', 0); svgEl.setAttribute('aria-valuemax', 100); svgEl.setAttribute('aria-valuenow', Math.round(o.progress * 100)); svgEl.setAttribute('aria-valuetext', pctText()); }
    const defs = sv('defs'); o.marks.forEach((m, i) => { const pt = sv('pattern', { id: id + 'h' + i, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, 'kit-sp-t-' + toneOf(m.tone || PENS[(i + 1) % 5])); pt.append(sv('line', { x1: 0, y1: 0, x2: 0, y2: 6, 'stroke-width': 2 }, 'kit-sp-hline')); defs.append(pt); }); svgEl.append(defs);
    o.marks.forEach((m, i) => {
      const x0 = m.from * W, x1 = Math.max(x0 + 3, m.to * W), r = sv('rect', { x: x0, y: 0, width: x1 - x0, height: H, fill: 'url(#' + id + 'h' + i + ')' }, 'kit-sp-mark kit-sp-t-' + toneOf(m.tone || PENS[(i + 1) % 5]));
      r.dataset.tipI = i; r.setAttribute('tabindex', 0); r.setAttribute('role', 'img'); r.setAttribute('aria-label', (m.label || 'Window ' + (i + 1)) + ', from ' + Math.round(m.from * 100) + ' to ' + Math.round(m.to * 100) + ' per cent'); svgEl.append(r);
      svgEl.append(sv('line', { x1: x0 + .75, x2: x0 + .75, y1: 0, y2: H }, 'kit-sp-mline kit-sp-t-' + toneOf(m.tone || PENS[(i + 1) % 5])));
    });
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0; for (let k = Math.floor(i * step); k < Math.max(Math.floor(i * step) + 1, Math.floor((i + 1) * step)); k++) { s = Math.max(s, v[k] || 0); c++; }
      const h = Math.max(2, s * (H - 6)), played = (i + .5) / n <= o.progress;
      const r = sv('rect', { x: i * bw + bw * .18, y: mid - h / 2, width: Math.max(1.5, bw * .64), height: h, rx: 1 }, 'kit-sp-wv' + (played ? ' on' : '')); wvs.push(r); svgEl.append(r);
    }
    head = sv('line', { x1: o.progress * W, x2: o.progress * W, y1: 0, y2: H }, 'kit-sp-head'); head.style.display = o.progress > 0 ? '' : 'none'; svgEl.append(head);
    if (o.onSeek) {
      let drag = false; const at = e => { const r = svgEl.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
      svgEl.addEventListener('pointerdown', e => { drag = true; try { svgEl.setPointerCapture(e.pointerId); } catch (_) {} seek(at(e)); });
      svgEl.addEventListener('pointermove', e => { if (drag) seek(at(e)); }); svgEl.addEventListener('pointerup', () => { drag = false; });
      svgEl.addEventListener('keydown', e => { const k = e.key, st = e.shiftKey ? .1 : .02; let p = o.progress; if (k === 'ArrowRight' || k === 'ArrowUp') p += st; else if (k === 'ArrowLeft' || k === 'ArrowDown') p -= st; else if (k === 'Home') p = 0; else if (k === 'End') p = 1; else return; e.preventDefault(); seek(p); });
    }
    plot.append(svgEl);
    cap.textContent = o.caption || (o.marks.length ? o.marks.length + ' marked window' + (o.marks.length === 1 ? '' : 's') + ': ' + o.marks.map(m => m.label).join(', ') + '.' : ''); return !!cap.textContent;
  });
  const th = Kit.tooltip ? Kit.tooltip.attach(f.root, { host: o.host || document.body, selector: '.kit-sp-mark', focusable: false, content: n => { const m = o.marks[+n.dataset.tipI]; return { title: m.label, rows: [['From', Math.round(m.from * 100) + '%'], ['To', Math.round(m.to * 100) + '%']].concat(m.note ? [['Note', m.note]] : []) }; } }) : null;
  return { update(p) { Object.assign(o, p); f.redraw(); if (th) th.refresh(); }, destroy() { if (th) th.destroy(); f.destroy(); } };
}
Kit.sparkline = Object.freeze({ line, bars, wave });
})();
/* /part:page.script.kit.viz.sparkline */
