/* part:page.script.kit.viz.slider-chart */
/* Kit visualization: what-if slider chart (Kit.sliderChart)    kit version 0.1.0
   What it is: one or more sliders that redraw a column chart and a row of readout tiles from a model you write. Move a slider and the chart, the figures and the sentence under them change at
   once; the sliders are native range inputs, so they work with the keyboard, touch and a screen reader, and a polite live line says what changed. The chart is Kit.bars.columns, so it starts
   at zero, has a legend and patterns when there are two series (two scenarios side by side), and a table view. The model is a function; the component has no opinion about the subject.
   API: Kit.sliderChart.mount(box, {inputs, model, chart, title, label, host}) -> {values(), set(id, value), update(patch), destroy()}
     inputs    [{id, label, min, max, step, value, unit, format(v)}]   one slider each
     model     (values {id: number}) => {categories: [{id, label}], series: [{id, label, values, tone}], readouts: [{label, value, note}], note, highlight}
               highlight is a category id; the readouts and the note are plain text; the model is called on every move
     chart     {unit, yLabel, max, ticks, height, decimals, valueLabels, table}   passed to Kit.bars.columns; give max when the scale should not change as the slider moves
   Needs from the board:
     requires viz.bars (Kit.bars.columns and its css), kit.tooltip
     css     kit/viz/slider-chart.css and kit/viz/bars.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono, the pens, optional --seam
     globals Kit.bars, Kit.tooltip
   db collections: none.
   Lifted from: a cluster-sizing page's quorum slider (voters against failures tolerated), its endurance calculator (two scenarios drawn side by side) and its readout tiles. Changed: the model is a
   callback so the shell serves any what-if, the scale can be pinned so the bars do not rescale under the pointer, and the chart reuses the shared bars. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function mount(box, opts) {
  const o = Object.assign({ inputs: [], chart: {} }, opts); const id = 'ksc' + (++uid); box.replaceChildren();
  const root = el('div', 'kit-sc'); root.setAttribute('role', 'group'); if (o.label || o.title) root.setAttribute('aria-label', o.label || o.title);
  const ctl = el('div', 'kit-sc-ctl'), ro = el('dl', 'kit-sc-read'), chartBox = el('div', 'kit-sc-chart'), note = el('p', 'kit-sc-note'); note.setAttribute('aria-live', 'polite');
  if (o.title) root.append(el('h4', 'kit-sc-title', o.title)); root.append(ctl, ro, chartBox, note); box.append(root);
  const vals = {}, outs = {}; let bars = null;
  o.inputs.forEach(inp => {
    vals[inp.id] = inp.value; const row = el('div', 'kit-sc-in'), lab = el('label', null, inp.label), r = el('input'), out = el('output'); r.type = 'range'; r.min = inp.min; r.max = inp.max; r.step = inp.step || 1; r.value = inp.value; r.id = id + inp.id; lab.htmlFor = r.id;
    out.htmlFor = r.id; outs[inp.id] = out; const show = () => { out.textContent = (inp.format ? inp.format(vals[inp.id]) : vals[inp.id]) + (inp.unit ? ' ' + inp.unit : ''); r.setAttribute('aria-valuetext', out.textContent); };
    show(); r.addEventListener('input', () => { vals[inp.id] = +r.value; show(); run(); }); row.append(lab, r, out); ctl.append(row); inp._r = r; inp._show = show;
  });
  function run() {
    const m = o.model(Object.assign({}, vals)); ro.replaceChildren();
    (m.readouts || []).forEach(t => { const d = el('div', 'kit-sc-tile'); d.append(el('dt', null, t.label), el('dd', null, String(t.value))); if (t.note) d.append(el('dd', 'kit-sc-sub', t.note)); ro.append(d); });
    ro.hidden = !(m.readouts && m.readouts.length);
    const cfg = Object.assign({}, o.chart, { categories: m.categories, series: m.series, highlight: m.highlight, label: o.chart.label || (o.title ? o.title + ', chart' : 'Chart'), host: o.host });
    if (bars) bars.update(cfg); else if (Kit.bars) bars = Kit.bars.columns(chartBox, cfg);
    note.textContent = m.note || ''; note.hidden = !m.note;
  }
  run();
  return {
    values: () => Object.assign({}, vals),
    set(k, v) { const inp = o.inputs.find(x => x.id === k); if (!inp) return; vals[k] = v; inp._r.value = v; inp._show(); run(); },
    update(p) { Object.assign(o, p); run(); }, destroy() { if (bars) bars.destroy(); root.remove(); },
  };
}
Kit.sliderChart = Object.freeze({ mount });
})();
/* /part:page.script.kit.viz.slider-chart */
