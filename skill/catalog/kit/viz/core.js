/* part:page.script.kit.viz.core */
/**
 * Chips, tallies and figures
 * Chip turns an enum value into a coloured label; the colour comes from a tone (a pen or a meaning) that each theme defines. Tally shows counts per step with zero counts faint, the way the Journey Whiteboard's queue strip does. Figures is the row of big numbers with labels. This file also carries the helpers the other visualizations share, so load it first.
 *
 * Config:
 * Chip({label, code, tone, title})                           tone: a pen name (ink red green amber blue violet) or a meaning (ok warn danger accent muted)
 * KindChip({kind, code, kinds})   kinds {kind: {label, tone}}
 * StatusChip({status, statuses})  statuses {status: tone}
 * Tally({items: [{id, label, count, tone}], onClick, label})  onClick(id) optional: each count becomes a button
 * Figures({items: [{value, label, tone}]})
 *
 * Tone colours: --c-<pen> for each pen tone used.
 * Not listed in @tokens: --kv-c, set by the tone classes (.kv-t-<tone>), and --n, the column count viz.buckets sets on .kv-cols.
 *
 * @id        viz.core
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   The small marks every board view uses: kind and status chips, a tally strip of counts per step, a row of big figures.
 * @tags      chip, badge, status, tally, counts, stats, figures, kpi
 * @requires  none
 * @files     kit/viz/viz.css, kit/samples/viz.json
 * @provides  Kit.viz.Chip, Kit.viz.KindChip, Kit.viz.StatusChip, Kit.viz.Tally, Kit.viz.Figures, Kit.viz.mount, Kit.viz.util
 * @config    Chip | {label, code, tone, title}: tone is a pen (ink red green amber blue violet) or a meaning (ok warn danger accent muted)
 * @config    KindChip | {kind, code, kinds}: kinds {kind: {label, tone}}
 * @config    StatusChip | {status, statuses}: statuses {status: tone}
 * @config    Tally | {items: [{id, label, count, tone}], onClick(id)}
 * @config    Figures | {items: [{value, label, tone}]}
 * @tokens    --panel --ink --ink-2 --ink-3 --rule --rule-2 --sunk --accent --accent-soft --ok --warn --danger --f-ui --f-mono --f-display --c-ink? --c-red --c-green --c-amber --c-blue --c-violet --accent-ink --shadow --canvas? --dot? --kv-col-h?
 * @globals   htm-preact
 * @db        none
 * @source    Journey Whiteboard | app.js | KindChip, StatusChip, EstChip, QueueStrip counts, the stats strip, pv-stats
 * @preview   {"render": "viz.core", "samples": ["kit/samples/viz.json#viz-chips"]}
 * @changed   Tones replace the board's fixed kind and status classes, so any enum maps to a colour by config.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const { html } = window.htmPreact;
const PENS = ['ink', 'red', 'green', 'amber', 'blue', 'violet'];
const MEANINGS = ['ok', 'warn', 'danger', 'accent', 'muted'];
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const tone = t => (PENS.includes(t) || MEANINGS.includes(t)) ? 'kv-t-' + t : '';
const kindOf = (kinds, k) => (kinds && kinds[k]) || { label: k || '', tone: '' };
const statusTone = (statuses, s) => (statuses && statuses[s]) || 'muted';
const cx = (...a) => a.filter(Boolean).join(' ');

function Chip({ label, code, tone: t, title, solid }) {
  return html`<span class=${cx('kv-chip', tone(t), solid && 'solid')} title=${title || null}>${code ? html`<b>${code}</b>` : ''}${label}</span>`;
}
function KindChip({ kind, code, kinds }) { const k = kindOf(kinds, kind); return html`<${Chip} label=${k.label} code=${code} tone=${k.tone}/>`; }
function StatusChip({ status, statuses }) { return status ? html`<${Chip} label=${status} tone=${statusTone(statuses, status)}/>` : null; }

function Tally({ items, onClick, label }) {
  const list = items || [];
  const Tag = onClick ? 'button' : 'span';
  return html`<div class="kv-tally" role=${onClick ? null : 'list'} aria-label=${label || 'Counts'}>
    ${list.map(it => html`<${Tag} type=${onClick ? 'button' : null} role=${onClick ? null : 'listitem'} key=${it.id}
      class=${cx('kv-tally-i', tone(it.tone), it.count ? 'has' : 'zero')} onClick=${onClick ? () => onClick(it.id) : null}>
      <b>${it.count}</b><span>${it.label}</span><//>`)}
  </div>`;
}
function Figures({ items }) {
  return html`<dl class="kv-figures">${(items || []).map(it => html`<div class=${cx('kv-fig', tone(it.tone))} key=${it.label}>
    <dt>${it.label}</dt><dd>${it.value}</dd></div>`)}</dl>`;
}

const viz = Kit.viz = Kit.viz || {};
viz.util = Object.freeze({ clip, tone, kindOf, statusTone, cx, PENS, MEANINGS });
Object.assign(viz, { Chip, KindChip, StatusChip, Tally, Figures });
// mount any viz component into a plain element: Kit.viz.mount(el, Kit.viz.Matrix, props) -> {update(props), unmount()}
viz.mount = function (el, C, props) {
  const { render } = window.htmPreact;
  const draw = p => render(html`<${C} ...${p}/>`, el);
  draw(props || {});
  return { update: draw, unmount: () => render(null, el) };
};
})();
/* /part:page.script.kit.viz.core */
