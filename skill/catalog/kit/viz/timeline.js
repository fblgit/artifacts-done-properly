/* part:page.script.kit.viz.timeline */
/* Kit visualization: vertical timeline and phase roadmap (Kit.timeline)    kit version 0.1.0
   What it is: two forms of "what happened, in order".
     mount   an event timeline: a rail down the left, a dot per event, and a card with the time, the title, the status word and a line of text. The dot holds a glyph (check, bang, cross, hollow,
             dash), so a status never rides on colour alone. An event can name other things by id (links): hovering or focusing it lights them, and pressing it holds the light until it is
             pressed again. A line of {marker: "Today"} between events draws a labelled divider.
     phases  a roadmap: numbered phases (the order is the point), each with its dates, a state word (done, now, next) and a list.
   API: Kit.timeline.mount(box, {events, statuses, targets, onHighlight, label, caption}) -> {highlight(ids), clear(), update(patch), destroy()}
          events      [{id, when, title, text, status, links: [ids]} | {marker}]   when is shown as given; status is a key of statuses
          statuses    {key: {label, tone, glyph}}   tone ok warn danger accent muted; glyph defaults by tone (check, bang, cross, bullet, dash)
          targets     an element (or elements) holding the things the events point at; any [data-id] inside whose value is in links gets the class kit-hl while lit
          onHighlight (ids) after a change; ids is [] when cleared
        Kit.timeline.phases(box, {phases, label}) -> {destroy()}
          phases      [{name, when, state: "done" | "now" | "next", text, items: [string]}]
   Needs from the board:
     css     kit/viz/timeline.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --ok --warn --danger --f-ui --f-mono, optional --seam
     globals none
   db collections: none.
   Lifted from: a change report's event timeline (applied, dry-run and superseded dots), a decisions board's timeline that lights its cards, a roadmap's numbered phases, and a dated table with
   a marked row. Changed: status is a glyph and a word as well as a colour, and the light follows keyboard focus as well as the pointer. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const GLYPH = { ok: '✓', warn: '!', danger: '✕', accent: '•', muted: '–' };

function mount(box, opts) {
  const o = Object.assign({ events: [], statuses: {}, targets: null }, opts);
  box.replaceChildren(); const root = el('div', 'kit-tl'); box.append(root);
  let held = null, hover = null, lit = [];
  const scopes = () => [].concat(o.targets || []).map(t => typeof t === 'string' ? document.querySelector(t) : t).filter(Boolean);
  function light(ids) {
    scopes().forEach(s => s.querySelectorAll('.kit-hl').forEach(n => n.classList.remove('kit-hl')));
    lit = ids || []; if (lit.length) scopes().forEach(s => s.querySelectorAll('[data-id]').forEach(n => { if (lit.includes(n.dataset.id)) n.classList.add('kit-hl'); }));
    root.querySelectorAll('.kit-tl-card').forEach(c => c.classList.toggle('is-lit', c.dataset.id === (hover || held)));
    if (o.onHighlight) o.onHighlight(lit.slice());
  }
  const idsOf = id => { const e = o.events.find(x => x.id === id); return e && e.links ? e.links : []; };
  const sync = () => { const id = hover || held; light(id ? idsOf(id) : []); };
  function draw() {
    root.replaceChildren(); const ol = el('ol', 'kit-tl-list'); ol.setAttribute('aria-label', o.label || 'Timeline');
    o.events.forEach(ev => {
      const li = el('li', ev.marker ? 'kit-tl-marker' : 'kit-tl-ev');
      if (ev.marker) { li.append(el('span', null, ev.marker)); ol.append(li); return; }
      const st = o.statuses[ev.status] || { label: ev.status || '', tone: 'muted' }, tone = GLYPH[st.tone] ? st.tone : 'muted';
      const dot = el('span', 'kit-tl-dot is-' + tone, st.glyph || GLYPH[tone]); dot.setAttribute('aria-hidden', 'true');
      const interactive = !!(ev.links && ev.links.length), card = el(interactive ? 'button' : 'div', 'kit-tl-card' + (interactive ? ' is-link' : '')); card.dataset.id = ev.id;
      if (interactive) { card.type = 'button'; card.setAttribute('aria-pressed', String(held === ev.id)); }
      const head = el('div', 'kit-tl-head'); head.append(el('time', 'kit-tl-when', ev.when || ''), el('b', null, ev.title)); if (st.label) head.append(el('span', 'kit-tl-st is-' + tone, st.label));
      card.append(head); if (ev.text) card.append(el('span', 'kit-tl-text', ev.text));
      if (interactive) card.append(el('span', 'kit-tl-hint', 'Lights ' + ev.links.length + (ev.links.length === 1 ? ' item' : ' items')));
      li.append(dot, card); ol.append(li);
    });
    root.append(ol); if (o.caption) root.append(el('p', 'kit-tl-cap', o.caption));
  }
  const cardOf = t => t.closest && t.closest('.kit-tl-card.is-link');
  root.addEventListener('pointerover', e => { const c = cardOf(e.target); if (c && hover !== c.dataset.id) { hover = c.dataset.id; sync(); } });
  root.addEventListener('pointerout', e => { const c = cardOf(e.target); if (c && !c.contains(e.relatedTarget)) { hover = null; sync(); } });
  root.addEventListener('focusin', e => { const c = cardOf(e.target); if (c) { hover = c.dataset.id; sync(); } });
  root.addEventListener('focusout', e => { if (cardOf(e.target)) { hover = null; sync(); } });
  root.addEventListener('click', e => { const c = cardOf(e.target); if (!c) return; held = held === c.dataset.id ? null : c.dataset.id; root.querySelectorAll('.kit-tl-card.is-link').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.id === held))); sync(); });
  draw();
  return {
    highlight(ids) { light(ids); }, clear() { held = hover = null; draw(); light([]); },
    update(p) { Object.assign(o, p); draw(); sync(); }, destroy() { light([]); root.remove(); },
  };
}

function phases(box, opts) {
  const o = Object.assign({ phases: [] }, opts); box.replaceChildren(); const root = el('ol', 'kit-ph'); if (o.label) root.setAttribute('aria-label', o.label);
  const WORD = { done: 'Done', now: 'Now', next: 'Next' }, MARK = { done: '✓', now: '●', next: '○' };
  o.phases.forEach((p, i) => {
    const li = el('li', 'kit-ph-item is-' + (p.state || 'next')), no = el('span', 'kit-ph-no', String(i + 1)); no.setAttribute('aria-hidden', 'true');
    const body = el('div', 'kit-ph-body'), head = el('div', 'kit-ph-head'); head.append(el('b', null, p.name), el('span', 'kit-ph-when', p.when || ''), el('span', 'kit-ph-st', (MARK[p.state] || MARK.next) + ' ' + (WORD[p.state] || WORD.next)));
    body.append(head); if (p.text) body.append(el('p', null, p.text)); if (p.items && p.items.length) { const ul = el('ul'); p.items.forEach(t => ul.append(el('li', null, t))); body.append(ul); }
    li.append(no, body); root.append(li);
  });
  box.append(root); return { destroy() { root.remove(); } };
}
Kit.timeline = Object.freeze({ mount, phases });
})();
/* /part:page.script.kit.viz.timeline */
