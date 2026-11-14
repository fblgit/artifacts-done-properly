/* part:page.script.kit.viz.slider-chart */
/**
 * What-if slider chart
 * Kit.sliderChart.mount takes native range inputs and a model function. Move a slider and the readout tiles, the column chart and a polite live sentence change together. The chart is Kit.bars.columns, so it starts at zero, has a legend and fill patterns when there are two series (two scenarios side by side), and offers a table view; pin its max so the bars do not rescale under the pointer. The component has no opinion about the subject: the quorum example (panel size against absences tolerated) and the two-scenario wear example in the preview are both just models.
 *
 * API: Kit.sliderChart.mount(box, {inputs, model, chart, title, label, host}) -> {values(), set(id, value), update(patch), destroy()}
 *   inputs    [{id, label, min, max, step, value, unit, format(v)}]   one slider each
 *   model     (values {id: number}) => {categories: [{id, label}], series: [{id, label, values, tone}], readouts: [{label, value, note}], note, highlight}
 *             highlight is a category id; the readouts and the note are plain text; the model is called on every move
 *   chart     {unit, yLabel, max, ticks, height, decimals, valueLabels, table}   passed to Kit.bars.columns; give max when the scale should not change as the slider moves
 *
 * @id        viz.slider-chart
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Sliders that redraw a column chart, readout tiles and a sentence from a model you write.
 * @tags      slider, what-if, calculator, scenario, readout, chart, model, interactive
 * @requires  viz.bars, kit.tooltip
 * @files     kit/viz/slider-chart.css, kit/samples/slider-chart.json
 * @provides  Kit.sliderChart.mount
 * @config    Kit.sliderChart.mount(box, opts) | inputs [{id, label, min, max, step, value, unit, format}], model(values) => {categories, series, readouts [{label, value, note}], note, highlight}, chart {unit, yLabel, max, ticks, height, decimals, valueLabels, table}, title, label, host
 * @config    requires | viz.bars (Kit.bars.columns and bars.css), kit.tooltip
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --f-ui --f-mono --accent --seam? --f-display?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a cluster-sizing page, index.html | the quorum slider with its bar chart, the endurance calculator with two scenarios, and the readout tiles
 * @preview   {"render": "viz.slider-chart", "samples": ["kit/samples/slider-chart.json"]}
 * @changed   The model is a callback so the shell serves any what-if.
 */
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
