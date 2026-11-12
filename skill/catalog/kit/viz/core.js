/* part:page.script.kit.viz.core */
/* Kit visualization: chips, tallies and figures (Kit.viz core)    kit version 0.1.0
   What it is: the small marks every board view uses. Chip (a coloured label from an enum), Tally (counts per step in one strip, zero counts faint),
   Figures (a row of big numbers with their labels), and the helpers the other viz files share (clip, tone classes, kind and status lookups).
   Needs from the board:
     config  Chip({label, code, tone, title})                           tone: a pen name (ink red green amber blue violet) or a meaning (ok warn danger accent muted)
             KindChip({kind, code, kinds})   kinds {kind: {label, tone}}
             StatusChip({status, statuses})  statuses {status: tone}
             Tally({items: [{id, label, count, tone}], onClick, label})  onClick(id) optional: each count becomes a button
             Figures({items: [{value, label, tone}]})
     css     kit/viz/viz.css; custom properties --panel --ink --ink-2 --ink-3 --rule --rule-2 --sunk --accent --accent-soft --ok --warn --danger
             --f-ui --f-mono --f-display, and --c-<pen> for each pen tone used (Journey Whiteboard names; the ADR theme in this catalog maps its own)
     globals window.htmPreact (htm + preact standalone)
   db collections: none.
   Lifted from: Journey Whiteboard app.js (KindChip, StatusChip, EstChip, QueueStrip counts, the stats strip and pv-stats figures). */
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
