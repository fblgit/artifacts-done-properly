/* part:page.script.kit.viz.bars */
/**
 * Bars to scale
 * Kit.bars draws five bar forms on one rule: a length is linear from zero. split cuts one bar in proportion to its parts, with a key above; score is a row of equal cells painted by level, with a legend that counts them; hbars gives each row a track as long as its total and a fill as long as the part carried, with ticks at the foot; ladder lists options with a strength bar on one scale; columns draws vertical columns, one or more series per category, with gridlines, value labels, a legend and a table view, and redraws when its box changes width. A series is never told apart by colour alone: each has a pen colour, a fill pattern and a word in the key, and every mark has a tooltip (Kit.tooltip) and a keyboard stop.
 *
 * API (each returns {update(patch), destroy()}; everything is written with textContent):
 *   Kit.bars.split(box,   {items: [{id, label, value, tone, note}], unit, total, restLabel, caption, label, host})
 *                         total larger than the sum adds a dashed "rest" part; tone is a pen (blue amber violet green red ink) or a meaning (ok warn danger accent muted); default by position
 *   Kit.bars.score(box,   {items: [{id, label, level}], levels: [{id, label, tone}], label, host})
 *   Kit.bars.hbars(box,   {rows: [{id, label, value, total, note, tone}], unit, max, ticks, decimals, valueWord, totalWord, label, host})
 *   Kit.bars.ladder(box,  {items: [{id, label, value, text, tag, tone}], max, unit, label, host})
 *   Kit.bars.columns(box, {categories: [{id, label}], series: [{id, label, values, tone}], max, ticks, unit, decimals, yLabel, height, valueLabels, highlight, table, label, caption, host})
 *                         highlight: a category id, ringed in --seam and set in bold under its label; max defaults to the next round number above the largest value
 *   Kit.bars.swatch(i, tone) -> a legend swatch element;  Kit.bars.niceTicks(max, n) -> [0, …]
 * host is the element the tooltip is appended to: pass the themed element when the board sets its tokens on an element instead of :root.
 *
 * @id        viz.bars
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Proportional split bar, equal-weight score bar, carried-against-total bars, an option ladder and grouped columns, every length linear from zero.
 * @tags      bars, chart, split, proportion, score, columns, ladder, scale, legend, table view, pattern
 * @requires  kit.tooltip
 * @files     kit/viz/bars.css, kit/samples/bars.json
 * @provides  Kit.bars.split, Kit.bars.score, Kit.bars.hbars, Kit.bars.ladder, Kit.bars.columns, Kit.bars.swatch, Kit.bars.niceTicks
 * @config    Kit.bars.split(box, opts) | items [{id, label, value, tone, note}], unit, total, restLabel, caption, label, host
 * @config    Kit.bars.score(box, opts) | items [{id, label, level}], levels [{id, label, tone}], label, host
 * @config    Kit.bars.hbars(box, opts) | rows [{id, label, value, total, note, tone}], unit, max, ticks, decimals, valueWord, totalWord, label, host
 * @config    Kit.bars.ladder(box, opts) | items [{id, label, value, text, tag, tone}], max, unit, label, host
 * @config    Kit.bars.columns(box, opts) | categories [{id, label}], series [{id, label, values, tone}], max, ticks, unit, decimals, yLabel, height, valueLabels, highlight, table, label, caption, host
 * @config    host | the element the tooltip is appended to: the themed element when the board sets tokens on an element
 * @config    requires | kit.tooltip: Kit.tooltip.attach and its css
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --f-ui --f-mono --accent --ok --warn --danger --c-blue --c-amber --c-violet --c-green --c-red --c-ink? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a disk-usage report, index.html | the proportional verdict split bar
 * @source    Catalog harvest, 2026-10-25 | a review page, index.html | the equal-weight score bar and legend, and the carried-against-total family bars with their scale
 * @source    Catalog harvest, 2026-10-25 | an options page, index.html | the ladder with a strength bar
 * @preview   {"render": "viz.bars", "samples": ["kit/samples/bars.json"]}
 * @changed   Every length is linear from zero: the source scaled a mini-bar by a square root, which made small items look larger than they were.
 * @changed   Series carry a fill pattern and a word as well as a colour; segments and cells have tooltips and keyboard stops.
 * @changed   Columns are new: grouped series, gridlines at round ticks, a highlighted category and a table view.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
const PENS = ['blue', 'amber', 'violet', 'red', 'green'];
const KNOWN = PENS.concat(['ink', 'ok', 'warn', 'danger', 'accent', 'muted']);
const toneOf = (t, i) => KNOWN.includes(t) ? t : PENS[i % PENS.length];
const pat = i => 'p' + (i % 5);
const fmt = (v, d) => Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 1 : d });
const pct = (v, t) => t > 0 ? v / t * 100 : 0;
const withUnit = (v, unit, d) => fmt(v, d) + (unit ? ' ' + unit : '');

function niceTicks(max, n) {
  n = n || 4; if (!(max > 0)) return [0, 1];
  const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const out = []; for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(10));
  return out;
}
function swatch(i, tone) { const s = el('span', 'kit-bars-sw kit-t-' + toneOf(tone, i) + ' kit-' + pat(i)); s.setAttribute('aria-hidden', 'true'); return s; }
function tips(root, host, content) {
  if (!Kit.tooltip) return { destroy() {}, refresh() {} };
  return Kit.tooltip.attach(root, { host: host || document.body, selector: '[data-tip-i]', content });
}
function shell(box, label, cls) {
  box.replaceChildren(); const r = el('div', 'kit-bars ' + cls); r.setAttribute('role', 'group'); if (label) r.setAttribute('aria-label', label); box.append(r); return r;
}
function handle(root, redraw, extra) {
  let th = null;
  return {
    update(p) { redraw(p || {}); if (th) th.refresh(); },
    destroy() { if (th) th.destroy(); if (extra) extra(); root.remove(); },
    setTips(t) { th = t; }, refreshTips() { if (th) th.refresh(); },
  };
}

/* ---- split */
function split(box, opts) {
  const o = Object.assign({ items: [], unit: '' }, opts); const root = shell(box, o.label, 'kit-bars-split'); let items = [];
  const tip = n => {
    const it = items[+n.dataset.tipI], rows = [['Share', fmt(pct(it.value, it.sum), 1) + '%'], ['Value', withUnit(it.value, o.unit)]];
    if (it.note) rows.push(['Note', it.note]); return { title: it.label, rows };
  };
  function draw() {
    root.replaceChildren();
    const sum = o.items.reduce((a, b) => a + Math.max(0, b.value), 0), tot = Math.max(o.total || 0, sum);
    items = o.items.map((it, i) => Object.assign({}, it, { i, sum: tot }));
    if (tot > sum) items.push({ id: '_rest', label: o.restLabel || 'Rest', value: tot - sum, rest: true, sum: tot, i: -1 });
    const keys = el('ul', 'kit-bars-keys'), bar = el('div', 'kit-bars-bar'); bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', (o.label ? o.label + ': ' : '') + items.map(it => it.label + ' ' + withUnit(it.value, o.unit) + ', ' + Math.round(pct(it.value, tot)) + '%').join('; '));
    items.forEach((it, k) => {
      const tn = it.rest ? 'rest' : toneOf(it.tone, it.i), li = el('li', 'kit-bars-key kit-t-' + tn);
      let sw; if (it.rest) { sw = el('span', 'kit-bars-sw kit-rest'); sw.setAttribute('aria-hidden', 'true'); } else sw = swatch(it.i, it.tone);
      li.append(sw, el('b', null, withUnit(it.value, o.unit)), el('span', null, it.label + ', ' + Math.round(pct(it.value, tot)) + '%')); keys.append(li);
      const seg = el('div', 'kit-bars-seg kit-t-' + tn + (it.rest ? ' kit-rest' : ' kit-' + pat(it.i))); seg.style.flex = Math.max(it.value, 0) + ' 1 0'; seg.dataset.tipI = k; bar.append(seg);
    });
    root.append(keys, bar); if (o.caption) root.append(el('p', 'kit-bars-cap', o.caption));
  }
  draw(); const h = handle(root, p => { Object.assign(o, p); draw(); }); h.setTips(tips(root, o.host, tip)); return h;
}

/* ---- score */
function score(box, opts) {
  const o = Object.assign({ items: [], levels: [] }, opts); const root = shell(box, o.label, 'kit-bars-score');
  const lv = id => { const i = o.levels.findIndex(l => l.id === id); return { i: Math.max(0, i), l: o.levels[i] || { id, label: id } }; };
  const tip = n => { const it = o.items[+n.dataset.tipI]; return { title: it.label, text: lv(it.level).l.label }; };
  function draw() {
    root.replaceChildren(); const bar = el('ol', 'kit-bars-cells');
    o.items.forEach((it, k) => {
      const { i, l } = lv(it.level), c = el('li', 'kit-bars-cell kit-t-' + toneOf(l.tone, i) + ' kit-' + pat(i)); c.dataset.tipI = k; c.setAttribute('aria-label', it.label + ': ' + l.label); bar.append(c);
    });
    const leg = el('ul', 'kit-bars-legend');
    o.levels.forEach((l, i) => { const n = o.items.filter(it => it.level === l.id).length, li = el('li', 'kit-t-' + toneOf(l.tone, i)); li.append(swatch(i, l.tone), el('b', null, String(n)), el('span', null, l.label)); leg.append(li); });
    root.append(bar, leg);
  }
  draw(); const h = handle(root, p => { Object.assign(o, p); draw(); }); h.setTips(tips(root, o.host, tip)); return h;
}

/* ---- hbars */
function hbars(box, opts) {
  const o = Object.assign({ rows: [], unit: '', ticks: 4, valueWord: 'Carried', totalWord: 'Total' }, opts); const root = shell(box, o.label, 'kit-bars-h');
  const tip = n => {
    const r = o.rows[+n.dataset.tipI], rows = [[o.valueWord, withUnit(r.value, o.unit, o.decimals)]];
    if (r.total != null) rows.push([o.totalWord, withUnit(r.total, o.unit, o.decimals)], ['Share', Math.round(pct(r.value, r.total)) + '%']);
    if (r.note) rows.push(['Note', r.note]); return { title: r.label, rows };
  };
  function draw() {
    root.replaceChildren();
    const mx = o.max || Math.max.apply(null, o.rows.map(r => Math.max(r.total || 0, r.value || 0)).concat([0])), ticks = niceTicks(mx, o.ticks), top = ticks[ticks.length - 1] || 1;
    const rule = 'linear-gradient(to right,' + ticks.map(t => { const x = pct(t, top); return 'transparent calc(' + x + '% - .5px),var(--rule-2) calc(' + x + '% - .5px),var(--rule-2) calc(' + x + '% + .5px),transparent calc(' + x + '% + .5px)'; }).join(',') + ')';
    const grid = el('div', 'kit-bars-hgrid');
    o.rows.forEach((r, i) => {
      const row = el('div', 'kit-bars-hrow kit-t-' + toneOf(r.tone, 0)), plot = el('div', 'kit-bars-hplot'); plot.dataset.tipI = i; plot.style.backgroundImage = rule;
      if (r.total != null) { const t = el('i', 'kit-bars-htotal'); t.style.width = pct(r.total, top) + '%'; plot.append(t); }
      const v = el('i', 'kit-bars-hval'); v.style.width = pct(r.value, top) + '%'; plot.append(v);
      plot.setAttribute('aria-label', r.label + ': ' + fmt(r.value, o.decimals) + (r.total != null ? ' of ' + fmt(r.total, o.decimals) : '') + (o.unit ? ' ' + o.unit : ''));
      row.append(el('span', 'kit-bars-hlab', r.label), plot, el('span', 'kit-bars-hnum', fmt(r.value, o.decimals) + (r.total != null ? ' / ' + fmt(r.total, o.decimals) : '') + (o.unit ? ' ' + o.unit : ''))); grid.append(row);
    });
    const ax = el('div', 'kit-bars-hrow kit-bars-haxis'), axp = el('div', 'kit-bars-hplot kit-bars-hticks'); axp.setAttribute('aria-hidden', 'true');
    ticks.forEach((t, i) => { const s = el('span', i === ticks.length - 1 ? 'last' : null, fmt(t, o.decimals)); s.style.left = pct(t, top) + '%'; axp.append(s); });
    ax.append(el('span', 'kit-bars-hlab'), axp, el('span', 'kit-bars-hnum', o.unit)); grid.append(ax); root.append(grid);
    const lg = el('ul', 'kit-bars-legend'), a = el('li'), s1 = el('span', 'kit-bars-sw kit-hv'); s1.setAttribute('aria-hidden', 'true'); a.append(s1, el('span', null, o.valueWord)); lg.append(a);
    if (o.rows.some(r => r.total != null)) { const b = el('li'), s2 = el('span', 'kit-bars-sw kit-ht'); s2.setAttribute('aria-hidden', 'true'); b.append(s2, el('span', null, o.totalWord)); lg.append(b); }
    root.append(lg);
  }
  draw(); const h = handle(root, p => { Object.assign(o, p); draw(); }); h.setTips(tips(root, o.host, tip)); return h;
}

/* ---- ladder */
function ladder(box, opts) {
  const o = Object.assign({ items: [], unit: '' }, opts); const root = shell(box, o.label, 'kit-bars-ladder');
  const top = () => o.max || Math.max.apply(null, o.items.map(i => i.value).concat([1]));
  const tip = n => { const it = o.items[+n.dataset.tipI]; return { title: it.label, rows: [['Strength', withUnit(it.value, o.unit) + ' of ' + withUnit(top(), o.unit)]] }; };
  function draw() {
    root.replaceChildren(); const mx = top(), ol = el('ol', 'kit-bars-rungs');
    o.items.forEach((it, i) => {
      const li = el('li', 'kit-bars-rung kit-t-' + toneOf(it.tone, 0)), head = el('div', 'kit-bars-rhead'); head.append(el('b', null, it.label)); if (it.tag) head.append(el('span', 'kit-bars-tag', it.tag));
      const tr = el('div', 'kit-bars-rtrack'); tr.dataset.tipI = i; tr.setAttribute('aria-label', it.label + ', strength ' + fmt(it.value) + ' of ' + fmt(mx));
      const f = el('i', 'kit-bars-rfill'); f.style.width = pct(it.value, mx) + '%'; tr.append(f);
      const row = el('div', 'kit-bars-rline'); row.append(tr, el('span', 'kit-bars-hnum', withUnit(it.value, o.unit)));
      li.append(head, row); if (it.text) li.append(el('p', 'kit-bars-rtext', it.text)); ol.append(li);
    });
    root.append(ol);
  }
  draw(); const h = handle(root, p => { Object.assign(o, p); draw(); }); h.setTips(tips(root, o.host, tip)); return h;
}

/* ---- columns */
function patternFor(id, s, i) {
  const k = i % 5, p = sv('pattern', { id: id + 'p' + i, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(' + (k === 1 ? 45 : k === 4 ? 0 : 0) + ')' }, 'kit-t-' + toneOf(s.tone, i));
  const bg = () => sv('rect', { width: 6, height: 6 }, 'kit-bars-pbg'), ln = (x1, y1, x2, y2, w) => sv('line', { x1, y1, x2, y2, 'stroke-width': w }, 'kit-bars-pl');
  if (k === 0) p.append(sv('rect', { width: 6, height: 6 }, 'kit-bars-pf'));
  else if (k === 1) p.append(bg(), ln(0, 0, 0, 6, 2.4));
  else if (k === 2) p.append(bg(), ln(0, 0, 0, 6, 1.6), ln(0, 3, 6, 3, 1.6));
  else if (k === 3) p.append(bg(), sv('circle', { cx: 3, cy: 3, r: 1.6 }, 'kit-bars-pf'));
  else p.append(bg(), ln(0, 3, 6, 3, 2));
  return p;
}
function columns(box, opts) {
  const o = Object.assign({ categories: [], series: [], unit: '', height: 220, valueLabels: true, ticks: 4 }, opts);
  const root = shell(box, o.label, 'kit-bars-cols'), id = 'kb' + (++uid), plotBox = el('div', 'kit-bars-plot'); let ro = null, lastW = 0;
  const tip = n => { const ci = +n.dataset.c; return { title: o.categories[ci].label, rows: o.series.map(s => [s.label, withUnit(s.values[ci], o.unit, o.decimals)]) }; };
  function draw() {
    root.replaceChildren(); plotBox.replaceChildren(); root.append(plotBox);
    const vals = [].concat.apply([], o.series.map(s => s.values)), dmax = Math.max.apply(null, vals.concat([0]));
    const ticks = niceTicks(o.max || dmax, o.ticks), top = o.max ? Math.max(o.max, ticks[ticks.length - 1]) : ticks[ticks.length - 1] || 1;
    const W = Math.max(220, Math.floor(plotBox.clientWidth || box.clientWidth || 360)), H = o.height, L = 44, R = 8, T = o.yLabel ? 28 : 16, B = 30, pw = W - L - R, ph = H - T - B;
    const n = Math.max(1, o.categories.length), gw = pw / n, ns = Math.max(1, o.series.length), gap = ns > 1 ? 2 : 0, inner = gw * 0.72, bw = Math.max(3, Math.min(48, (inner - gap * (ns - 1)) / ns));
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': (o.label || 'Columns') + (o.yLabel ? ', ' + o.yLabel : '') });
    const defs = sv('defs'); o.series.forEach((s, i) => defs.append(patternFor(id, s, i))); svg.append(defs);
    const y = v => T + ph - v / top * ph;
    ticks.forEach(t => {
      const yy = y(t); svg.append(sv('line', { x1: L, x2: W - R, y1: yy, y2: yy }, t === 0 ? 'kit-bars-axis' : 'kit-bars-grid'));
      const tx = sv('text', { x: L - 6, y: yy + 4, 'text-anchor': 'end' }, 'kit-bars-tick'); tx.textContent = fmt(t, o.decimals); svg.append(tx);
    });
    const step = gw < 44 ? Math.ceil(44 / gw) : 1;
    o.categories.forEach((c, ci) => {
      const gx = L + ci * gw + (gw - (bw * ns + gap * (ns - 1))) / 2, on = o.highlight != null && o.highlight === c.id;
      if (on) svg.append(sv('rect', { x: L + ci * gw + 2, y: T - 4, width: gw - 4, height: ph + 4, rx: 5 }, 'kit-bars-hl'));
      o.series.forEach((s, si) => {
        const v = Math.max(0, s.values[ci] || 0), hh = v / top * ph, x = gx + si * (bw + gap), yy = T + ph - hh, r = Math.min(4, bw / 2, hh);
        const d = hh <= 0 ? 'M' + x + ' ' + (T + ph) + 'h' + bw + 'v-1h-' + bw + 'z' : 'M' + x + ' ' + (T + ph) + 'V' + (yy + r) + 'Q' + x + ' ' + yy + ' ' + (x + r) + ' ' + yy + 'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + yy + ' ' + (x + bw) + ' ' + (yy + r) + 'V' + (T + ph) + 'Z';
        const m = sv('path', { d, fill: 'url(#' + id + 'p' + si + ')' }, 'kit-bars-col kit-t-' + toneOf(s.tone, si)); m.dataset.tipI = ci + '-' + si; m.dataset.c = ci;
        m.setAttribute('aria-label', c.label + ', ' + s.label + ': ' + withUnit(v, o.unit, o.decimals)); svg.append(m);
        if (o.valueLabels && bw >= 12) { const t = sv('text', { x: x + bw / 2, y: yy - 4, 'text-anchor': 'middle' }, 'kit-bars-val'); t.textContent = fmt(v, o.decimals); svg.append(t); }
      });
      if (ci % step === 0) { const t = sv('text', { x: L + ci * gw + gw / 2, y: H - 10, 'text-anchor': 'middle' }, 'kit-bars-cat' + (on ? ' on' : '')); t.textContent = c.label; svg.append(t); }
    });
    if (o.yLabel) { const t = sv('text', { x: 2, y: 10 }, 'kit-bars-ylab'); t.textContent = o.yLabel; svg.append(t); }
    plotBox.append(svg);
    if (o.series.length > 1) { const lg = el('ul', 'kit-bars-legend'); o.series.forEach((s, i) => { const li = el('li', 'kit-t-' + toneOf(s.tone, i)); li.append(swatch(i, s.tone), el('span', null, s.label)); lg.append(li); }); root.append(lg); }
    if (o.caption) root.append(el('p', 'kit-bars-cap', o.caption));
    if (o.table) {
      const d = el('details', 'kit-bars-table'); d.append(el('summary', null, 'Show as a table'));
      const t = el('table'), hr = el('tr'), th = el('thead'); hr.append(el('th', null, o.yLabel || '')); o.series.forEach(s => hr.append(el('th', null, s.label))); th.append(hr); t.append(th);
      const tb = el('tbody'); o.categories.forEach((c, ci) => { const r = el('tr'); r.append(el('th', null, c.label)); o.series.forEach(s => r.append(el('td', null, withUnit(s.values[ci], o.unit, o.decimals)))); tb.append(r); }); t.append(tb);
      const w = el('div', 'kit-bars-twrap'); w.append(t); d.append(w); root.append(d);
    }
    lastW = W;
  }
  draw();
  const h = handle(root, p => { Object.assign(o, p); draw(); }, () => ro && ro.disconnect());
  if (window.ResizeObserver) {
    let raf = 0; ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const w = Math.floor(plotBox.clientWidth || 0); if (w && Math.abs(w - lastW) > 1) { draw(); h.refreshTips(); } }); }); ro.observe(box);
  }
  h.setTips(tips(root, o.host, tip)); return h;
}

Kit.bars = Object.freeze({ split, score, hbars, ladder, columns, swatch, niceTicks });
})();
/* /part:page.script.kit.viz.bars */
