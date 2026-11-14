/* part:page.script.kit.viz.impact */
/**
 * Impact preview
 * impactOf compares two snapshots of records in the terms people care about. ImpactList shows the answer as marked rows (+ new, ~ change, − loss, ✓ gain); PreviewBanner is the one-line summary with Keep and Stop that sits above a previewed view. With the tree's marks the same answer paints onto the tree.
 *
 * Config:
 * impactOf(before, after, {fields, linkField, target, live, negative})
 *   before, after  {id: {kind, status, label, code, <fields>, <linkField>: [id]}}
 *   fields     the fields compared (default ["status", "label"]); linkField the array field that links a record to targets (optional)
 *   target     the kind that gets covered (optional); live {kind: [statuses]}: only these records count as a live cover (all when omitted)
 *   negative   statuses that read as a loss (default ["rejected", "dropped", "superseded"])
 * ImpactList({impact, after, kinds, words})          after is the same "after" map, for names
 * PreviewBanner({impact, label, after, onKeep, onStop, canKeep})
 *
 * The board builds the "after" snapshot (the Journey Whiteboard projects Claude's proposed actions onto a copy).
 * Tokens: no file of this entry reads a custom property. Its rules are the "impact" section of kit/viz/viz.css (entry viz.core, which it requires); they read --accent --accent-soft --danger --f-mono --f-ui --ink --ink-2 --ok --rule-2 --sunk --warn; and with a fallback --c-amber.
 *
 * @id        viz.impact
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   What a change does before anyone applies it: new, changed, lost, and which targets gain or lose their last cover.
 * @tags      impact, diff, preview, dry run, proposal, changes, coverage
 * @requires  viz.core
 * @files     kit/samples/viz-impact.json
 * @provides  Kit.viz.impactOf, Kit.viz.ImpactList, Kit.viz.PreviewBanner
 * @config    impactOf(before, after, options) | snapshots {id: {kind, status, label, code, ...}}; options {fields, linkField, target, live, negative}
 * @config    ImpactList | {impact, after, kinds, words}
 * @config    PreviewBanner | {impact, label, after, onKeep, onStop, canKeep}
 * @tokens    none
 * @globals   htm-preact
 * @db        note The board builds the after snapshot (the Journey Whiteboard projects Claude's proposed actions onto a copy).
 * @source    Journey Whiteboard | app.js | coverage, impactOf, ImpactList, PreviewBanner
 * @preview   {"render": "viz.impact", "samples": ["kit/samples/viz-impact.json", "kit/samples/viz-tree.json"], "uses": ["viz.tree"]}
 * @changed   Kinds, the link field, live statuses and compared fields come from the board.
 * @changed   Removed records and removed links are reported, not only additions.
 * @changed   Gains and losses carry a side stripe as well as the sign, and a hidden word for screen readers.
 */
(function () {
'use strict';
const Kit = window.Kit;
const { html } = window.htmPreact;
const { clip, kindOf } = Kit.viz.util;
const NEG = ['rejected', 'dropped', 'superseded'];

function impactOf(before, after, o = {}) {
  const B = before || {}, A = after || {};
  const fields = o.fields || ['status', 'label'], neg = o.negative || NEG, lf = o.linkField;
  const cover = snap => {
    if (!o.target || !lf) return {};
    const out = {};
    for (const [id, r] of Object.entries(snap)) if (r.kind === o.target)
      out[id] = Object.entries(snap).filter(([, x]) => (!o.live || (o.live[x.kind] || []).includes(x.status)) && (x[lf] || []).includes(id)).map(([x]) => x);
    return out;
  };
  const cb = cover(B), ca = cover(A);
  const added = Object.keys(A).filter(id => !B[id]);
  const removed = Object.keys(B).filter(id => !A[id]);
  const changed = [];
  for (const [id, b] of Object.entries(B)) {
    const a = A[id]; if (!a) continue;
    const f = [];
    for (const k of fields) if ((a[k] == null ? null : a[k]) !== (b[k] == null ? null : b[k])) f.push([k, b[k], a[k]]);
    if (lf) { const nl = (a[lf] || []).filter(x => !(b[lf] || []).includes(x)), gone = (b[lf] || []).filter(x => !(a[lf] || []).includes(x)); if (nl.length) f.push([lf, '', nl]); if (gone.length) f.push([lf, gone, '']); }
    if (f.length) changed.push({ id, fields: f, loss: f.some(x => x[0] === 'status' && neg.includes(x[2])) });
  }
  const t = Object.keys(ca);
  return {
    added, removed, changed,
    covered: t.filter(p => ca[p].length && !(cb[p] || []).length),
    uncovered: t.filter(p => !ca[p].length && (cb[p] || []).length),
    open: t.filter(p => !ca[p].length && !(cb[p] || []).length),
    targetsAdded: added.filter(id => A[id].kind === o.target),
  };
}

const nameOf = (A, kinds, id) => { const r = A[id]; if (!r) return id; return (r.code || 'new ' + kindOf(kinds, r.kind).label.toLowerCase()) + ' “' + clip(r.label, 60) + '”'; };
const codeOf = (A, id) => (A[id] && A[id].code) || 'new';

function ImpactList({ impact, after, kinds, words = {} }) {
  if (!impact) return null;
  const A = after || {}, rows = [];
  for (const id of impact.added) rows.push(['new', html`Adds ${nameOf(A, kinds, id)}`]);
  for (const id of impact.removed || []) rows.push(['neg', html`Removes ${id}`]);
  for (const c of impact.changed) rows.push([c.loss ? 'neg' : 'chg', html`${nameOf(A, kinds, c.id)}: ${c.fields.map(f => Array.isArray(f[2]) ? `${f[0]} +${f[2].map(x => codeOf(A, x)).join(' ')}` : Array.isArray(f[1]) ? `${f[0]} −${f[1].map(x => codeOf(A, x)).join(' ')}` : `${f[0]} ${f[1] == null ? '–' : f[1]} → ${f[2] == null ? '–' : f[2]}`).join('; ')}`]);
  for (const id of impact.covered) rows.push(['good', html`${nameOf(A, kinds, id)} gets its first live ${words.cover || 'cover'}`]);
  for (const id of impact.uncovered) rows.push(['neg', html`${nameOf(A, kinds, id)} is left without a live ${words.cover || 'cover'}`]);
  if (!rows.length) return html`<div class="kv-empty">No change to the board.</div>`;
  return html`<ul class="kv-impact">${rows.map(([k, r], i) => html`<li key=${i} class=${'i-' + k}><span class="kv-sr">${{ new: 'New: ', chg: 'Change: ', neg: 'Loss: ', good: 'Gain: ' }[k]}</span>${r}</li>`)}</ul>`;
}

function PreviewBanner({ impact, label, after, onKeep, onStop, canKeep = true }) {
  if (!impact) return null;
  const A = after || {}, n = impact.added.length + impact.changed.length + (impact.removed || []).length;
  return html`<div class="kv-banner" role="status">
    <b>Previewing ${n} change${n === 1 ? '' : 's'}${label ? ': ' + label : ''}</b>
    <span class="kv-banner-sum">
      <span>${impact.added.length} new</span><span>${impact.changed.length} changed</span>
      ${impact.covered.length ? html`<span class="kv-good">covers ${impact.covered.map(id => codeOf(A, id)).join(' ')}</span>` : ''}
      ${impact.uncovered.length ? html`<span class="kv-bad">leaves ${impact.uncovered.map(id => codeOf(A, id)).join(' ')} uncovered</span>` : ''}
      ${impact.open.length ? html`<span>still open ${impact.open.map(id => codeOf(A, id)).join(' ')}</span>` : ''}
    </span>
    <span class="kv-spacer"></span>
    ${onKeep && canKeep ? html`<button type="button" class="kv-btn primary" onClick=${onKeep}>Keep it</button>` : ''}
    ${onStop ? html`<button type="button" class="kv-btn" onClick=${onStop}>Stop previewing</button>` : ''}
  </div>`;
}

Object.assign(Kit.viz, { impactOf, ImpactList, PreviewBanner });
})();
/* /part:page.script.kit.viz.impact */
