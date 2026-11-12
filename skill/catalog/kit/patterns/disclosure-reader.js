/* part:page.script.kit.patterns.disclosure-reader */
/* Kit pattern: reference reader (Kit.disclosureReader)    kit version 0.1.0    EXTENDS pattern.disclosure (disclosure.js and disclosure.css stay as they are; this is a new file beside them)
   What it is: the chrome around a long list of disclosure cards. A row of glance tiles (how many sections, how many open, anything the page counts), a filter box that says "3 of 9 sections" and shows a
   designed empty state when nothing matches, and an index of the sections that follows the one in view. The cards stay Kit.disclosure's details elements; this file only hides the ones the filter drops,
   adds ids where they are missing, and builds the tiles and the index. Plain DOM; every text is set with textContent. Without IntersectionObserver the index still works, it just does not follow.
   API:
     Kit.disclosureReader.mount(root, {cards, titleOf, textOf, tiles, filter, index, indexLabel, scroller, hash, words, onFilter}) -> {setFilter(q), current(), refresh(), destroy()}
       root      the element that holds the cards (a Kit.disclosure.render box, or any list of details)
       cards     selector for the cards inside root (default "details.kit-dis")
       titleOf   (card) -> the title for the index (default the text of .kit-dis-t, else the summary)        textOf  (card) -> the text the filter searches (default the card's text)
       tiles     [{label, value}] extra tiles after the two it counts itself (Sections, Open); false for none
       filter    true (default) shows the filter box          index  true (default) shows the index
       scroller  the scrolling element when it is not the page (a framed preview)
       hash      true writes the section id to the page's #anchor on a press (default false: the index scrolls and focuses the section and leaves the address alone)
       words     {sections, open, filter, placeholder, count(n, m), empty, emptyHint, clear, index}
       onFilter  (query, shown, total) after every change
     The index is a nav of buttons (links when hash is true). The section in view gets aria-current="location". A press scrolls the section to the top, opens it and moves focus to its summary.
   Needs from the board:
     css     kit/patterns/disclosure.css (the cards) and kit/patterns/disclosure-reader.css; custom properties --bg --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --f-ui --f-mono --f-display, optional --seam --kit-topbar-h
     globals none
   db collections: none.
   Lifted from: an earlier board's reference page (a filter with an "n of m sections" count and an empty state, an "On this page" index that follows the section in view, glance tiles).
   Changed: the filter hides by the card's own text, not by a hub field; the tiles count what the page has, not what the board holds; the index is a list of buttons by default so a press never changes the page's address. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const WORDS = { sections: 'Sections', open: 'Open', filter: 'Filter the sections', placeholder: 'Filter sections', count: (n, m) => n + ' of ' + m + ' sections', empty: 'No section matches',
  emptyHint: 'Try another word, or clear the filter.', clear: 'Clear filter', index: 'On this page' };
let uid = 0;
function mount(root, o) {
  o = Object.assign({ cards: 'details.kit-dis', filter: true, index: true, hash: false }, o); const W = Object.assign({}, WORDS, o.words), n = ++uid;
  const all = () => [...root.querySelectorAll(o.cards)];
  const titleOf = o.titleOf || (c => { const t = c.querySelector('.kit-dis-t') || c.querySelector('summary'); return (t ? t.textContent : c.id).trim(); });
  const textOf = o.textOf || (c => c.textContent);
  all().forEach((c, i) => { if (!c.id) c.id = 'kit-rdr' + n + '-' + i; });
  const shell = el('div', 'kit-rdr'); const main = el('div', 'kit-rdr-main'); const side = el('nav', 'kit-rdr-index'); side.setAttribute('aria-label', W.index);
  const tilesBox = el('ul', 'kit-rdr-tiles'); tilesBox.setAttribute('aria-label', 'At a glance');
  const bar = el('div', 'kit-rdr-bar'); const lab = el('label', 'kit-rdr-search'); const sr = el('span', 'kit-rdr-sr', W.filter); const input = el('input'); input.type = 'search'; input.id = 'kit-rdr-q' + n;
  input.placeholder = W.placeholder; input.autocomplete = 'off'; lab.htmlFor = input.id; lab.append(sr, input);
  const count = el('span', 'kit-rdr-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const clear = el('button', 'kit-rdr-clear', W.clear); clear.type = 'button'; clear.hidden = true; bar.append(lab, count, clear);
  const empty = el('div', 'kit-rdr-empty'); empty.hidden = true; empty.append(el('b', null, W.empty), el('span', null, W.emptyHint));
  // move the cards into the main column, keeping their order
  const parent = root; const kids = [...parent.childNodes];
  if (o.tiles !== false) main.append(tilesBox);
  if (o.filter) main.append(bar);
  const holder = el('div', 'kit-rdr-cards'); kids.forEach(k => holder.append(k)); main.append(holder, empty);
  if (o.index) shell.append(side); shell.append(main); parent.append(shell);
  let q = '', active = null, io = null;
  const shown = () => all().filter(c => !c.hidden);
  function tiles() {
    tilesBox.replaceChildren(); if (o.tiles === false) return;
    const list = [{ label: W.sections, value: all().length }, { label: W.open, value: all().filter(c => c.open).length }].concat(o.tiles || []);
    list.forEach(t => { const li = el('li', 'kit-rdr-tile'); li.append(el('b', null, String(t.value)), el('span', null, t.label)); tilesBox.append(li); });
  }
  function indexDraw() {
    side.replaceChildren(); if (!o.index) return; side.append(el('p', 'kit-rdr-index-h', W.index)); const ul = el('ul'); side.append(ul);
    shown().forEach(c => {
      const li = el('li'); const a = el(o.hash ? 'a' : 'button', 'kit-rdr-item', titleOf(c)); a.dataset.for = c.id; if (o.hash) a.href = '#' + c.id; else a.type = 'button';
      a.addEventListener('click', e => go(c, e)); if (c.id === active) a.setAttribute('aria-current', 'location'); li.append(a); ul.append(li);
    });
  }
  function go(c, e) {
    if (!o.hash && e) e.preventDefault(); c.open = true; tiles();
    const sc = o.scroller; const top = (sc ? sc.getBoundingClientRect().top : 0);
    const off = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kit-topbar-h')) || 0;
    const y = c.getBoundingClientRect().top - top - (sc ? 8 : off + 8);
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    (sc || window).scrollBy({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    const s = c.querySelector('summary'); if (s) s.focus({ preventScroll: true }); setActive(c.id);
  }
  function setActive(id) {
    if (active === id) return; active = id;
    side.querySelectorAll('.kit-rdr-item').forEach(a => { if (a.dataset.for === id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  function apply() {
    const t = q.trim().toLowerCase(), cs = all(); let k = 0;
    cs.forEach(c => { const hit = !t || textOf(c).toLowerCase().includes(t) || titleOf(c).toLowerCase().includes(t); c.hidden = !hit; if (hit) k++; });
    count.textContent = t ? W.count(k, cs.length) : ''; clear.hidden = !t; empty.hidden = !(t && !k);
    tiles(); indexDraw(); watch(); if (o.onFilter) o.onFilter(q, k, cs.length);
  }
  function watch() {
    if (io) io.disconnect(); if (!('IntersectionObserver' in window) || !o.index) return;
    io = new IntersectionObserver(es => {
      const seen = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (seen) setActive(seen.target.id);
    }, { root: o.scroller || null, rootMargin: '-8% 0px -70% 0px' });
    shown().forEach(c => io.observe(c)); if (!active && shown()[0]) setActive(shown()[0].id);
  }
  const onInput = () => { q = input.value; apply(); };
  const onClear = () => { input.value = ''; q = ''; apply(); input.focus(); };
  const onToggle = () => tiles();
  input.addEventListener('input', onInput); clear.addEventListener('click', onClear); holder.addEventListener('toggle', onToggle, true);
  tiles(); indexDraw(); watch(); if (shown()[0]) setActive(shown()[0].id);
  return {
    setFilter(s) { input.value = s; q = s; apply(); }, current: () => active, refresh() { all().forEach((c, i) => { if (!c.id) c.id = 'kit-rdr' + n + '-' + i; }); apply(); },
    destroy() { if (io) io.disconnect(); input.removeEventListener('input', onInput); clear.removeEventListener('click', onClear); holder.removeEventListener('toggle', onToggle, true); [...holder.childNodes].forEach(k => parent.append(k)); shell.remove(); all().forEach(c => { c.hidden = false; }); },
  };
}
Kit.disclosureReader = Object.freeze({ mount });
})();
/* /part:page.script.kit.patterns.disclosure-reader */
