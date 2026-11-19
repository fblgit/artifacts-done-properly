/* part:page.script.kit.viz.buckets */
/**
 * Bucket board
 * The Journey Whiteboard's MoSCoW board with buckets from config. A mouse drags a card anywhere; touch drags it by its grip. Every card also has a Move to menu, so moving never needs a drag. Buckets show their count, hint and the sum of a numeric field; kind toggles filter the cards.
 *
 * Config:
 * Buckets({buckets, cards, onMove, onOpen, canEdit, kinds, statuses, filterKinds, sumLabel, title, words})
 *   buckets [{id, label, hint, tone}]  ("" is a valid id: the unsorted bucket)
 *   cards   [{id, bucket, order, label, code, kind, status, chips: [text], value}]   value: the number summed per bucket (optional)
 *   onMove(id, bucket, order)  the board writes the card's bucket and order (order lands between its new neighbours)
 *   onOpen(id)  optional: a card title click opens the record
 *   filterKinds kinds offered as toggles (default: every kind on the cards); sumLabel e.g. "d estimated"
 *
 * The board writes the bucket and order fields (the Journey Whiteboard: items/<id>.moscow and .order).
 * Tokens: no file of this entry reads a custom property. Its rules are the "buckets" section of kit/viz/viz.css (entry viz.core, which it requires); they read --accent --accent-soft --f-display --f-mono --f-ui --ink --ink-2 --ink-3 --panel --rule --shadow --sunk; and with a fallback --kv-c --kv-col-h --n.
 *
 * @id        viz.buckets
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Cards sorted into ordered buckets (MoSCoW, now/next/later): drag with a drop line, or use each card's Move to menu.
 * @tags      kanban, moscow, buckets, columns, drag and drop, priority, board
 * @requires  viz.core
 * @files     kit/samples/viz.json
 * @provides  Kit.viz.Buckets
 * @config    buckets | [{id, label, hint, tone}]
 * @config    cards | [{id, bucket, order, label, code, kind, status, chips, value}]
 * @config    onMove | (id, bucket, order): the board writes both fields
 * @config    onOpen | (id) optional
 * @config    options | canEdit, filterKinds, sumLabel, title, words
 * @tokens    none
 * @globals   htm-preact
 * @db        note The board writes the bucket and order fields (Journey Whiteboard: items/<id>.moscow and .order).
 * @source    Journey Whiteboard | app.js | BUCKETS, MoscowView, moveBucket
 * @preview   {"render": "viz.buckets", "samples": ["kit/samples/viz.json#viz-buckets"]}
 * @samples   viz-buckets
 * @changed   Buckets, kinds and the summed field come from config; the background estimate stays board code (call it from onMove).
 */
(function () {
'use strict';
const Kit = window.Kit;
const { html, useState } = window.htmPreact;
const { cx, tone, kindOf, statusTone } = Kit.viz.util;
const grip = html`<svg viewBox="0 0 16 16" width="12" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>`;

function Buckets({ buckets, cards, onMove, onOpen, canEdit, kinds, statuses, filterKinds, sumLabel, title, words = {} }) {
  const all = cards || [];
  const offer = filterKinds || [...new Set(all.map(c => c.kind).filter(Boolean))];
  const [shown, setShown] = useState(offer);
  const [drag, setDrag] = useState(null);
  const ord = c => c.order || 0;
  const list = all.filter(c => !c.kind || shown.includes(c.kind));
  const colOf = b => list.filter(c => (c.bucket || '') === b).sort((a, z) => ord(a) - ord(z));
  const toggle = k => setShown(shown.includes(k) ? shown.filter(x => x !== k) : [...shown, k]);
  const locate = (x, y, id, root) => {
    const el = document.elementFromPoint(x, y), col = el && el.closest('[data-bucket]');
    if (!col || !root.contains(col)) return null;
    const cs = [...col.querySelectorAll('[data-card]')].filter(c => c.dataset.card !== id);
    let index = cs.length; for (let i = 0; i < cs.length; i++) { const r = cs[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
    return { bucket: col.dataset.bucket, index };
  };
  const drop = (id, over) => {
    const l = colOf(over.bucket).filter(c => c.id !== id), a = l[over.index - 1], z = l[over.index];
    const order = a && z ? (ord(a) + ord(z)) / 2 : a ? ord(a) + 1000 : z ? ord(z) - 1000 : Date.now();
    onMove && onMove(id, over.bucket, order);
  };
  const start = (e, id) => {
    if (!canEdit || e.button > 0 || e.target.closest('select, button, a, input')) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.kv-grip')) return;
    const card = e.currentTarget, root = card.closest('.kv-buckets'), r = card.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY, off = { x: x0 - r.left, y: y0 - r.top }; let active = false;
    const move = ev => { if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; active = true; ev.preventDefault();
      setDrag({ id, x: ev.clientX - off.x, y: ev.clientY - off.y, w: r.width, over: locate(ev.clientX, ev.clientY, id, root) }); };
    const up = ev => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!active) return; const over = ev.type === 'pointerup' ? locate(ev.clientX, ev.clientY, id, root) : null; setDrag(null); if (over) drop(id, over); };
    addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  const Card = (c, ghost) => { const k = kindOf(kinds, c.kind);
    return html`<div key=${c.id} class=${cx('kv-bcard', tone(k.tone), drag && drag.id === c.id && !ghost && 'ghosting')} data-card=${ghost ? null : c.id} onPointerDown=${ghost ? null : e => start(e, c.id)}>
      <span class="kv-grip" aria-hidden="true">${grip}</span>
      <span class="kv-row"><span class=${cx('kv-chip', tone(k.tone))}>${c.code ? html`<b>${c.code}</b>` : ''}${k.label}</span>${c.status ? html`<span class=${cx('kv-chip', tone(statusTone(statuses, c.status)))}>${c.status}</span>` : ''}</span>
      ${onOpen ? html`<button type="button" class="kv-bt" onClick=${() => onOpen(c.id)}>${c.label || 'Untitled'}</button>` : html`<span class="kv-bt">${c.label || 'Untitled'}</span>`}
      <span class="kv-row">${(c.chips || []).map(x => html`<span class="kv-chip">${x}</span>`)}${c.value ? html`<span class="kv-chip kv-t-accent">${c.value}</span>` : ''}
        <span class="kv-spacer"></span>
        <label class="kv-sr" for=${'mv-' + c.id}>Move ${c.code || c.label} to</label>
        <select id=${'mv-' + c.id} disabled=${!canEdit} value=${c.bucket || ''} onChange=${e => onMove && onMove(c.id, e.target.value, Date.now())}>${(buckets || []).map(b => html`<option value=${b.id}>${b.label}</option>`)}</select></span>
    </div>`; };
  return html`<div class="kv-buckets">
    <div class="kv-buckets-bar">
      ${title ? html`<h3>${title}</h3>` : ''}
      <span class="kv-faint">${canEdit ? (words.hint || 'Drag cards between columns; on touch, drag by the dots. Each card also has a Move to menu.') : (words.readOnly || 'Read only.')}</span>
      <span class="kv-spacer"></span>
      ${offer.length > 1 ? offer.map(k => html`<button type="button" key=${k} class=${cx('kv-toggle', tone(kindOf(kinds, k).tone))} aria-pressed=${shown.includes(k)} onClick=${() => toggle(k)}>${kindOf(kinds, k).label}s</button>`) : ''}
    </div>
    <div class="kv-cols" style=${'--n:' + (buckets || []).length}>
      ${(buckets || []).map(b => { const l = colOf(b.id), over = drag && drag.over && drag.over.bucket === b.id;
        const sum = l.reduce((a, c) => a + (+c.value || 0), 0);
        const rest = l.filter(c => !drag || c.id !== drag.id);
        return html`<section key=${b.id} class=${cx('kv-col', tone(b.tone), over && 'over')} data-bucket=${b.id} aria-label=${b.label}>
          <header><h4>${b.label} <span class="kv-num">${l.length}</span></h4><span class="kv-hint">${b.hint || ''}${sum ? ` · ${Math.round(sum * 10) / 10}${sumLabel ? ' ' + sumLabel : ''}` : ''}</span></header>
          <div class="kv-col-list">
            ${l.map((c, i) => html`${over && drag.over.index === rest.indexOf(c) && c.id !== drag.id ? html`<div class="kv-drop"></div>` : ''}${Card(c)}`)}
            ${over && drag.over.index >= rest.length ? html`<div class="kv-drop"></div>` : ''}
            ${!l.length && !over ? html`<div class="kv-empty sm">${words.empty || 'Drop cards here.'}</div>` : ''}
          </div>
        </section>`; })}
    </div>
    ${drag && all.find(c => c.id === drag.id) ? html`<div class="kv-bghost" style=${`left:${drag.x}px;top:${drag.y}px;width:${drag.w}px`}>${Card(all.find(c => c.id === drag.id), true)}</div>` : ''}
  </div>`;
}

Kit.viz.Buckets = Buckets;
})();
/* /part:page.script.kit.viz.buckets */
