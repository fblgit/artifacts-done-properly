/* part:page.script.kit.viz.focus */
/**
 * Record focus
 * The Journey Whiteboard's move preview without the board's actions. Parents show as small cards (a path parent shows its question and the path taken), then the record, then its children grouped by kind with counts. A path node shows its question, whether it was chosen, and the other paths. Every card refocuses the pane.
 *
 * Config:
 * Focus({id, nodes, kinds, statuses, onPick, words, extra})
 *   id      the focused node id; nodes the same list the Tree takes (parents[], shape, state, body)
 *   onPick(id) refocus; words {under, below, nothing, paths, chosen, notTaken, open}; extra an optional vnode drawn under the record
 * MiniCard({n, kinds, note, onClick})
 *
 * Tone colours: --c-<pen> for each pen tone used.
 * Tokens: no file of this entry reads a custom property. Its rules are the "focus" section of kit/viz/viz.css (entry viz.core, which it requires); they read --accent --f-display --f-mono --f-ui --ink --ink-2 --panel --rule; and with a fallback --kv-c.
 *
 * @id        viz.focus
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   The side pane for one node of a tree: what it hangs under, the record itself, and what hangs under it, grouped by kind.
 * @tags      inspector, detail, side pane, preview, focus, record card
 * @requires  viz.core
 * @files     kit/samples/viz.json
 * @provides  Kit.viz.Focus, Kit.viz.MiniCard
 * @config    id | the focused node id
 * @config    nodes | the same list the Tree takes
 * @config    onPick | (id): refocus
 * @config    extra | a vnode under the record for the board's own actions
 * @config    words | {under, below, nothing, paths, chosen, notTaken, open, top}
 * @tokens    none
 * @globals   htm-preact
 * @db        none
 * @source    Journey Whiteboard | app.js | MovePreview, MiniCard
 * @preview   {"render": "viz.focus", "samples": ["kit/samples/viz.json#viz-tree"]}
 * @changed   Board actions (open panel, propose a move, alternatives) moved out; the board passes them in as extra.
 */
(function () {
'use strict';
const Kit = window.Kit;
const { html } = window.htmPreact;
const { clip, cx, tone, kindOf, statusTone } = Kit.viz.util;

function MiniCard({ n, kinds, note, onClick }) {
  const k = kindOf(kinds, n.kind);
  return html`<button type="button" class=${cx('kv-mini', tone(k.tone), n.shape === 'pill' && 'pill')} onClick=${onClick}>
    ${n.shape === 'pill' ? '' : html`<span class=${cx('kv-chip', tone(k.tone))}>${n.code ? html`<b>${n.code}</b>` : ''}${k.label}</span>`}
    <span class="kv-mt">${n.shape === 'pill' ? (n.state === 'chosen' ? '✓ ' : '◇ ') : ''}${clip(n.label, 90)}</span>
    ${note ? html`<span class="kv-mn">${note}</span>` : ''}
  </button>`;
}

function Focus({ id, nodes, kinds, statuses, onPick, words = {}, extra }) {
  const w = Object.assign({ under: 'Hangs under', below: 'Under it', nothing: 'Nothing hangs under it yet.', paths: 'The other paths', chosen: 'chosen', notTaken: 'not taken', open: 'open path', top: 'A root: nothing above it.' }, words);
  const by = {}; for (const n of nodes || []) by[n.id] = n;
  const n = by[id];
  if (!n) return html`<div class="kv-focus"><div class="kv-empty">${words.none || 'Pick a node to see where it sits.'}</div></div>`;
  const go = x => onPick && onPick(x);
  const kids = (nodes || []).filter(x => (x.parents || []).includes(id));
  const ups = (n.parents || []).map(p => by[p]).filter(Boolean);
  const k = kindOf(kinds, n.kind);
  if (n.shape === 'pill') {
    const q = ups[0], sib = q ? (nodes || []).filter(x => x.shape === 'pill' && (x.parents || [])[0] === q.id && x.id !== id) : [];
    return html`<div class="kv-focus">
      ${q ? html`<section><h4>${w.under}</h4><${MiniCard} n=${q} kinds=${kinds} onClick=${() => go(q.id)}/></section>` : ''}
      <article class=${cx('kv-rec', n.state === 'chosen' && 'kv-t-ok')}>
        <span class=${cx('kv-chip', n.state === 'chosen' ? 'kv-t-ok' : n.state === 'closed' ? 'kv-t-muted' : 'kv-t-warn')}>${n.state === 'chosen' ? w.chosen : n.state === 'closed' ? w.notTaken : w.open}</span>
        <h3>${n.label}</h3>${n.body ? html`<p>${clip(n.body, 600)}</p>` : ''}
      </article>
      ${kids.length ? html`<section><h4>${w.below}</h4>${kids.map(c => html`<${MiniCard} key=${c.id} n=${c} kinds=${kinds} onClick=${() => go(c.id)}/>`)}</section>` : ''}
      ${sib.length ? html`<section><h4>${w.paths}</h4>${sib.map(s => html`<${MiniCard} key=${s.id} n=${s} kinds=${kinds} note=${clip(s.body, 120)} onClick=${() => go(s.id)}/>`)}</section>` : ''}
    </div>`;
  }
  const groups = {};
  for (const c of kids) { const g = c.shape === 'pill' ? '·paths' : c.kind || ''; (groups[g] = groups[g] || []).push(c); }
  return html`<div class="kv-focus">
    <section><h4>${w.under}</h4>${ups.length ? ups.map(u => { const real = u.shape === 'pill' ? by[(u.parents || [])[0]] : null;
      return html`<${MiniCard} key=${u.id} n=${real || u} kinds=${kinds} note=${real ? 'via “' + clip(u.label, 60) + '”' : ''} onClick=${() => go(u.id)}/>`; }) : html`<p class="kv-faint">${w.top}</p>`}</section>
    <article class=${cx('kv-rec', tone(k.tone))}>
      <div class="kv-row">
        <span class=${cx('kv-chip', tone(k.tone))}>${n.code ? html`<b>${n.code}</b>` : ''}${k.label}</span>
        ${n.status ? html`<span class=${cx('kv-chip', tone(statusTone(statuses, n.status)))}>${n.status}</span>` : ''}
        ${n.bucket ? html`<span class="kv-chip">${n.bucket}</span>` : ''}
        ${(n.chips || []).filter(Boolean).map(c => html`<span class="kv-chip">${c}</span>`)}
      </div>
      <h3>${n.label}</h3>
      ${n.body ? html`<p>${clip(n.body, 700)}</p>` : ''}
      ${extra || ''}
    </article>
    <section><h4>${w.below} <span class="kv-num">${kids.length}</span></h4>
      ${kids.length ? Object.entries(groups).map(([g, l]) => html`<div class="kv-group" key=${g}>
        <span class="kv-group-h">${g === '·paths' ? 'Paths' : kindOf(kinds, g).label + (l.length > 1 ? 's' : '')} <span class="kv-num">${l.length}</span></span>
        ${l.slice(0, 5).map(c => html`<${MiniCard} key=${c.id} n=${c} kinds=${kinds} onClick=${() => go(c.id)}/>`)}
        ${l.length > 5 ? html`<span class="kv-faint">and ${l.length - 5} more</span>` : ''}
      </div>`) : html`<p class="kv-faint">${w.nothing}</p>`}
    </section>
  </div>`;
}

Object.assign(Kit.viz, { Focus, MiniCard });
})();
/* /part:page.script.kit.viz.focus */
