/* part:page.script.kit.explorer-shell */
/* Kit layout: explorer shell (Kit.explorer)    kit version 0.1.0
   What it is: a page framed like a code editor. A sidebar lists the page's sections as a file tree (groups, a name, an extension badge for the kind of section); the main area holds
   a pipeline of phases across its top and then the sections; a status bar along the bottom carries live counts and a note. The file whose section is in view is marked as you scroll, and a click
   scrolls to its section. Plain DOM; every text is set with textContent. Narrow boxes turn the tree into a row of file chips above the main area.
   API (small and stable):
     Kit.explorer.mount(root, {groups, pipeline, sections, status, height, label, treeLabel}) -> {select(id), current(), setStatus(status), setPipeline(pipeline), destroy()}
       groups    [{label, files: [{id, name, ext}]}]       each file's id is the id of a section; ext is the kind badge (md, csv, sh, log ...)
       pipeline  {label, stages: [{id, name, state}], words}   state is a value of the Kit.vocab "state" enum (queued, running, done, failed, blocked ...); words {state: "passed"} renames a state
       sections  [{id, title, render(body) | node}]          the main area, in reading order; render fills the section body
       status    {items: [{label, count, tone}], note}       tone is a Kit.vocab tone (attention, danger, success ...); a count of 0 is left out
       height    css length of the whole shell (default "min(36rem, 100dvh)"); give "100dvh" for a full page
     The tree is a nav; the file in view has aria-current="location". The status bar is a labelled region, not a live one: call setStatus when counts change and announce it yourself if it matters.
   Made for the Kanban theme (a blue status bar, a dense tool look) and fine under any other.
   Needs from the board:
     css     kit/layout/explorer-shell.css; custom properties --bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --accent-soft --f-ui --f-mono, optional --seam --radius
     kit     kit/vocab.js and kit/vocab.css (the pipeline's state glyph and word), kit.tokens
     globals IntersectionObserver (without it the first file stays marked until a click)
   db collections: none.
   Lifted from: an earlier board's kanban skin (the file-tree sidebar, the pipeline of phases, the status bar with counts, the section in view marked in the tree). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rowOf = (en, v) => { const g = Kit.vocab && Kit.vocab.get && Kit.vocab.get(en, v); return g || { word: String(v == null ? '' : v), tone: 'neutral', glyph: 'dot' }; };
const FILE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

function mount(root, o) {
  o = Object.assign({ groups: [], sections: [], label: 'Explorer', treeLabel: 'Sections', height: 'min(36rem, 100dvh)' }, o);
  root.textContent = ''; root.classList.add('kit-ex');
  const frame = el('div', 'kit-ex-frame'); frame.style.setProperty('--kit-ex-h', o.height); root.append(frame);
  const tree = el('nav', 'kit-ex-tree'); tree.setAttribute('aria-label', o.treeLabel);
  const main = el('div', 'kit-ex-main'); main.tabIndex = 0; main.setAttribute('role', 'region'); main.setAttribute('aria-label', o.label);
  const pipe = el('div', 'kit-ex-pipe'), secs = el('div', 'kit-ex-secs'), bar = el('div', 'kit-ex-status');
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Status');
  main.append(pipe, secs); frame.append(tree, main, bar);
  let cur = null, io = null; const files = new Map(), bodies = new Map();

  function setCurrent(id) { cur = id; files.forEach((a, k) => { if (k === id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); }); }
  function select(id) {
    const s = bodies.get(id); if (!s) return; setCurrent(id);
    main.scrollTo({ top: Math.max(0, s.offsetTop - secs.offsetTop - 4), behavior: reduced() ? 'auto' : 'smooth' });
    const h = s.querySelector('.kit-ex-st'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  o.groups.forEach(g => {
    const grp = el('div', 'kit-ex-grp'); grp.append(el('span', 'kit-ex-gl', g.label));
    g.files.forEach(f => {
      const a = el('a', 'kit-ex-file'); a.href = '#' + f.id; a.dataset.sec = f.id;
      const ic = el('span', 'kit-ex-ico'); ic.setAttribute('aria-hidden', 'true'); ic.innerHTML = FILE;
      a.append(ic, el('span', 'kit-ex-fn', f.name), el('span', 'kit-ex-fx', '.' + f.ext));
      a.addEventListener('click', e => { e.preventDefault(); select(f.id); }); grp.append(a); files.set(f.id, a);
    });
    tree.append(grp);
  });
  o.sections.forEach((s, i) => {
    const sec = el('section', 'kit-ex-sec'); sec.id = 'kit-ex-' + s.id; const hid = sec.id + '-h'; sec.setAttribute('aria-labelledby', hid);
    const h = el('h2', 'kit-ex-st', s.title || s.id); h.id = hid; const body = el('div', 'kit-ex-sb');
    if (typeof s.render === 'function') s.render(body, i); else if (s.node instanceof Node) body.append(s.node);
    sec.append(h, body); secs.append(sec); bodies.set(s.id, sec);
  });
  function setPipeline(p) {
    pipe.textContent = ''; pipe.hidden = !p || !(p.stages || []).length; if (pipe.hidden) return;
    const words = p.words || {}, ol = el('ol', 'kit-ex-stages'); ol.setAttribute('aria-label', p.label || 'Pipeline');
    p.stages.forEach(s => {
      const r = rowOf('state', s.state), li = el('li', 'kit-ex-stage'); li.setAttribute('data-vo-tone', r.tone); li.dataset.state = s.state;
      const g = el('span', 'kit-ex-sg'); g.setAttribute('aria-hidden', 'true'); if (Kit.vocab && Kit.vocab.glyph && r.glyph) g.append(Kit.vocab.glyph(r.glyph)); else g.textContent = '•';
      li.append(g, el('b', null, s.name), el('span', 'kit-ex-sw', words[s.state] || r.word)); ol.append(li);
    });
    pipe.append(ol);
  }
  function setStatus(s) {
    bar.textContent = ''; s = s || {}; const left = el('div', 'kit-ex-sl');
    (s.items || []).filter(x => x.count).forEach(x => {
      const c = el('span', 'kit-ex-sbc'); if (x.tone) c.setAttribute('data-vo-tone', x.tone); c.append(el('b', null, String(x.count)), document.createTextNode(' ' + x.label)); left.append(c);
    });
    if (!left.children.length) left.append(el('span', 'kit-ex-sbc', 'nothing open'));
    bar.append(left); if (s.note) bar.append(el('span', 'kit-ex-note', s.note));
  }
  setPipeline(o.pipeline); setStatus(o.status);
  const first = o.sections[0] && o.sections[0].id; if (first) setCurrent(first);
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { const id = [...bodies].find(([, s]) => s === e.target); if (id) setCurrent(id[0]); } }); }, { root: main, rootMargin: '-10% 0px -70% 0px' });
    bodies.forEach(s => io.observe(s));
  }
  return { select, current: () => cur, setStatus, setPipeline, destroy() { if (io) io.disconnect(); root.textContent = ''; root.classList.remove('kit-ex'); } };
}
Kit.explorer = Object.freeze({ mount });
})();
/* /part:page.script.kit.explorer-shell */
