/* part:page.script.kit.disclosure */
/**
 * Disclosure cards and reader bar
 * Kit.disclosure.render(box, {items, variant, bar, label, printOpen, onToggle}) builds details cards: a title and a cadence or date on one line, a body of paragraphs, numbered steps and labelled fields. The letter look spells Expand or Collapse at the end of the summary; the clause look keeps the numbered norm visible and folds the reasoning into a smaller disclosure. The sticky reader bar opens or closes everything and says "2 of 5 open". Every card opens before the browser prints. Kit.disclosure.bind(root) wires the same bar to hand-written markup.
 *
 * Native details cards with a one-line summary (a title, a cadence or date on the right, an optional number) and a reader bar that opens or closes all of them and says how many are
 * open. Three looks share one script: "card" (a task or runbook row), "letter" (the summary says expand or collapse) and "clause" (a numbered article with its norm always visible and the
 * reasoning in a smaller disclosure). The cards are details elements, so they work without script, open with the keyboard and can be opened before printing (printOpen).
 * Plain DOM; text is set with textContent unless a body is a Node.
 *
 * API:
 *   Kit.disclosure.render(box, {items, variant, bar, label, printOpen, onToggle}) -> {expandAll(), collapseAll(), openCount(), update(items), destroy()}
 *     items     [{id, title, when, num, norm, body, steps, fields, open}]
 *                 when    the cadence or date on the right of the summary ("weekly")
 *                 num     a number or reference shown before the title (clause: before the norm)
 *                 norm    clause only: the sentence that stays visible above the disclosure
 *                 body    string | string[] (paragraphs) | Node   the opened content
 *                 steps   string[]   an ordered list inside the body
 *                 fields  [{label, text}]   labelled lines inside the body (why, prevents, practice)
 *     variant   "card" (default) | "letter" | "clause"
 *     bar       true (default) shows the reader bar: Expand all, Collapse all and "2 of 5 open"
 *     printOpen true (default) opens every card before the browser prints
 *   Kit.disclosure.bind(root, {printOpen}) wires the same bar behaviour to hand-written details.kit-dis markup and returns the same handle (no bar is added; use .kit-dis-bar yourself)
 *
 * @id        pattern.disclosure
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Native details cards with a summary line (cadence or date) and an expand-all and collapse-all bar; task, letter and numbered-clause looks.
 * @tags      accordion, details, disclosure, expand all, collapse all, runbook, tasks, cadence, letter, clause, reader
 * @requires  none
 * @files     kit/patterns/disclosure.css, kit/samples/patterns.json
 * @provides  Kit.disclosure.render, Kit.disclosure.bind
 * @config    Kit.disclosure.render(box, opts) | items [{id, title, when, num, norm, body, steps, fields, open}], variant card | letter | clause, bar, label, printOpen, onToggle(id, open); returns {expandAll, collapseAll, openCount, update, destroy}
 * @config    --kit-topbar-h | optional: the reader bar sticks below it
 * @tokens    --bg? --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --f-ui --f-mono --f-display --kit-topbar-h? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 4 artifacts' index.html | two runbooks' task cards with a cadence, a policy reader's expand-all bar and clause reasoning, and a letter archive's expand and collapse cards
 * @preview   {"render": "pattern.disclosure", "samples": ["kit/samples/patterns.json#disclosure"]}
 * @samples   disclosure
 * @changed   One component for the five looks; the looks differ in css, not in behaviour.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function bodyOf(it) {
  const box = el('div', 'kit-dis-body');
  const b = it.body;
  if (b instanceof Node) box.append(b);
  else if (Array.isArray(b)) b.forEach(p => box.append(el('p', null, p)));
  else if (b) box.append(el('p', null, b));
  if (it.steps && it.steps.length) { const ol = el('ol', 'kit-dis-steps'); it.steps.forEach(s => ol.append(el('li', null, s))); box.append(ol); }
  if (it.fields && it.fields.length) { const dl = el('dl', 'kit-dis-fields'); it.fields.forEach(f => { const r = el('div'); r.append(el('dt', null, f.label), el('dd', null, f.text)); dl.append(r); }); box.append(dl); }
  return box;
}
function wire(root, bar, o) {
  const all = () => [...root.querySelectorAll('details.kit-dis, details.kit-dis-more')];
  const status = bar && bar.querySelector('.kit-dis-status');
  const upd = () => { if (status) { const d = all(); status.textContent = d.filter(x => x.open).length + ' of ' + d.length + ' open'; } };
  const set = on => { all().forEach(d => { d.open = on; }); upd(); };
  root.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details')) { upd(); if (o.onToggle) { const d = e.target; o.onToggle(d.dataset.id || null, d.open); } } }, true);
  if (bar) { const x = bar.querySelector('[data-act="expand"]'), c = bar.querySelector('[data-act="collapse"]'); if (x) x.addEventListener('click', () => set(true)); if (c) c.addEventListener('click', () => set(false)); }
  const before = () => { if (o.printOpen !== false) set(true); };
  window.addEventListener('beforeprint', before); upd();
  return { expandAll: () => set(true), collapseAll: () => set(false), openCount: () => all().filter(d => d.open).length, off: () => window.removeEventListener('beforeprint', before) };
}
function render(box, opts) {
  const o = Object.assign({ items: [], variant: 'card', bar: true, label: 'Details', printOpen: true, onToggle: null }, opts);
  const id = 'kit-dis-' + (++uid);
  let h = null;
  function build() {
    if (h) h.off();
    box.classList.add('kit-dis-root'); box.replaceChildren();
    let bar = null;
    if (o.bar) {
      bar = el('div', 'kit-dis-bar'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', o.label);
      const st = el('span', 'kit-dis-status'); st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
      const mk = (t, a) => { const b = el('button', 'kit-dis-btn', t); b.type = 'button'; b.dataset.act = a; return b; };
      bar.append(st, mk('Expand all', 'expand'), mk('Collapse all', 'collapse')); box.append(bar);
    }
    const list = el('div', 'kit-dis-list'); list.setAttribute('role', 'list'); list.setAttribute('aria-label', o.label);
    o.items.forEach((it, i) => {
      const wrap = el('div'); wrap.setAttribute('role', 'listitem');
      if (o.variant === 'clause') {
        const art = el('article', 'kit-dis-clause'); art.id = id + '-' + i;
        const head = el('div', 'kit-dis-chead'); head.append(el('span', 'kit-dis-num', it.num == null ? String(i + 1) : String(it.num)), el('p', 'kit-dis-norm', it.norm || it.title));
        const d = el('details', 'kit-dis-more'); if (it.open) d.open = true; d.dataset.id = it.id || '';
        d.append(el('summary', null, it.title && it.norm ? it.title : 'Reasoning'), bodyOf(it)); art.append(head, d); wrap.append(art);
      } else {
        const d = el('details', 'kit-dis'); d.dataset.variant = o.variant; if (it.open) d.open = true; d.dataset.id = it.id || '';
        const s = el('summary'); if (it.num != null) s.append(el('span', 'kit-dis-num', String(it.num)));
        s.append(el('span', 'kit-dis-t', it.title)); if (it.when) s.append(el('span', 'kit-dis-when', it.when));
        d.append(s, bodyOf(it)); wrap.append(d);
      }
      list.append(wrap);
    });
    box.append(list); h = wire(box, bar, o);
  }
  build();
  return {
    expandAll: () => h.expandAll(), collapseAll: () => h.collapseAll(), openCount: () => h.openCount(),
    update(items) { o.items = items; build(); },
    destroy() { h.off(); box.replaceChildren(); box.classList.remove('kit-dis-root'); },
  };
}
function bind(root, opts) {
  const o = Object.assign({ printOpen: true, onToggle: null }, opts);
  return wire(root, root.querySelector('.kit-dis-bar'), o);
}
Kit.disclosure = Object.freeze({ render, bind });
})();
/* /part:page.script.kit.disclosure */
