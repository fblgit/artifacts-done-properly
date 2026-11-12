/* part:page.script.kit.patterns.findings */
/* Kit pattern: finding cards (Kit.findings)    kit version 0.1.0
   What it is: review findings as cards. Each has a severity chip (a glyph and a word), an optional kind tag (conflict, noise, unclear), a title, the evidence in a sentence, a row of
   where/what pairs and a fix. Sorted worst first. Plain DOM; every string is set with textContent, so a finding can quote text from anywhere.
   API (small and stable):
     Kit.findings.render(box, {items, sort, summary, cols, label}) -> {count(), update(items)}
       item     {severity: "crit" | "high" | "med" | "low" | "ok", tag, title, body, evidence: [[key, value], ...], fix}
       sort     true (default) orders crit, high, med, low, ok; items of one level keep their order
       summary  true (default) puts a line above the list: "3 findings: 1 critical, 1 high, 1 medium"
       cols     2 lays the cards in two columns from 760px up
     Kit.findings.chip(severity, label?) -> HTMLElement   the severity chip alone (for a table cell or a heading)
     Kit.findings.LEVELS -> [{id, word, plural}]
   Needs from the board:
     css     kit/patterns/findings.css; custom properties --panel --sunk --ink --ink-2 --rule --danger --warn --ok --accent --f-ui --f-mono --f-display, optional --info, --seam
     globals none
   db collections: none.
   Lifted from: four documents' finding cards (a contract review's strongest-to-curable cards with citations, an icon-and-title pair, a triage card with a kind tag and a fix, the severity chip with an icon). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const LEVELS = Object.freeze([
  { id: 'crit', word: 'Critical', plural: 'critical' },
  { id: 'high', word: 'High', plural: 'high' },
  { id: 'med', word: 'Medium', plural: 'medium' },
  { id: 'low', word: 'Low', plural: 'low' },
  { id: 'ok', word: 'Clear', plural: 'clear' },
]);
const GLYPH = {
  crit: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17h.01"/>',
  high: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 16h.01"/>',
  med: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12h7"/>',
  low: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  ok: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.4 2.7 2.7 5-5.6"/>',
};
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const level = id => LEVELS.find(l => l.id === id) || LEVELS[3];
function icon(id) {
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2.2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = GLYPH[level(id).id]; return s;
}
function chip(sev, label) { const l = level(sev); const c = el('span', 'kit-sev'); c.dataset.sev = l.id; c.style.setProperty('--tone', 'var(--' + ({ crit: 'danger', high: 'warn', med: 'info, var(--accent)', low: 'ink-2', ok: 'ok' }[l.id]) + ')'); c.append(icon(l.id), document.createTextNode(label || l.word)); return c; }
function card(it) {
  const l = level(it.severity);
  const a = el('article', 'kit-finding'); a.dataset.sev = l.id;
  const top = el('header', 'kit-finding-top'); top.append(chip(l.id, it.label)); if (it.tag) top.append(el('span', 'kit-finding-kind', it.tag));
  top.append(el('h4', 'kit-finding-t', it.title)); a.append(top);
  if (it.body) a.append(el('p', 'kit-finding-body', it.body));
  if (it.evidence && it.evidence.length) { const dl = el('dl', 'kit-finding-ev'); it.evidence.forEach(([k, v]) => { const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); dl.append(d); }); a.append(dl); }
  if (it.fix) { const p = el('p', 'kit-finding-fix'); p.append(el('b', null, 'Fix'), document.createTextNode(it.fix)); a.append(p); }
  return a;
}
function render(box, opts) {
  const o = Object.assign({ sort: true, summary: true }, opts);
  const list = el('div', 'kit-findings'); if (o.cols) list.dataset.cols = String(o.cols);
  list.setAttribute('role', 'list'); if (o.label) list.setAttribute('aria-label', o.label);
  const sum = el('p', 'kit-findings-sum');
  let items = [];
  function paint(src) {
    items = (src || []).slice();
    if (o.sort) items = items.map((x, i) => [x, i]).sort((a, b) => LEVELS.indexOf(level(a[0].severity)) - LEVELS.indexOf(level(b[0].severity)) || a[1] - b[1]).map(p => p[0]);
    list.replaceChildren(...items.map(it => { const c = card(it); c.setAttribute('role', 'listitem'); return c; }));
    const counts = LEVELS.map(l => [l, items.filter(x => level(x.severity).id === l.id).length]).filter(p => p[1]);
    sum.replaceChildren();
    sum.append(el('b', null, items.length + (items.length === 1 ? ' finding' : ' findings') + (counts.length ? ': ' : '')));
    counts.forEach(([l, n], i) => { const c = chip(l.id, n + ' ' + l.plural); sum.append(c); });
  }
  paint(o.items);
  box.replaceChildren(...(o.summary ? [sum, list] : [list]));
  return { count: () => items.length, update: paint };
}
Kit.findings = Object.freeze({ render, chip, LEVELS });
})();
/* /part:page.script.kit.patterns.findings */
