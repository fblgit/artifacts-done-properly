/* part:page.script.kit.viz.phase-strip */
/**
 * Phase strip
 * Kit.phaseStrip.mount(box, {phases, form}) draws the same list of phases as a gauge (a card per phase with one segment per unit of work), a flow (boxes joined by arrows with a progress bar), an itinerary (stops down a route, with a 'You are here' stop, a dot per unit and what ends the phase), contents lines (numeral, name, dotted leader, count, state) or divider tabs with counts that filter a list below. setForm switches without redrawing the data. A phase's state is a word and a glyph as well as a colour (the 'phase' enum this file adds to Kit.vocab: done, doing, next, todo, later), and a segment's state also shows by its fill pattern. The first phase that is not done is marked as current unless you name one.
 *
 * API (small and stable):
 *   Kit.phaseStrip.mount(box, {phases, form, current, selected, allLabel, label, unitEnum, onSelect}) -> {setForm(f), update(opts), select(id), destroy()}
 *     phases    [{id, name, state, what, exit, after, units: [{title, state}] , done, total}]
 *               state is one of done, doing, next, todo, later (the "phase" enum this file adds to Kit.vocab; yours can replace it);
 *               units give the segments, dots and counts; without units, done and total give the counts alone
 *     form      "gauge" | "flow" | "itinerary" | "contents" | "tabs" (default "gauge")
 *     current   the id of the phase to mark as the one you are in (default: the first phase that is not done)
 *     selected  tabs only: the selected phase id, or "all" (default "all" when allLabel is set)
 *     allLabel  tabs only: text of the leading tab that clears the filter (default none)
 *     unitEnum  the Kit.vocab enum of a unit's state (default "state")
 *     onSelect  (id) after a tab or a stop is chosen (id "all" for the leading tab)
 *   Kit.phaseStrip.FORMS -> the five form names;  Kit.phaseStrip.phaseEnum -> "phase"
 * --vo-c is not in @tokens: kit/vocab.css (kit.vocab, required) sets it through [data-vo-tone].
 *
 * @id        viz.phase-strip
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   One phase list in five forms: segmented gauge, flow boxes, itinerary, contents lines and divider tabs.
 * @tags      phases, progress, gauge, flow, itinerary, contents, tabs, stepper, roadmap
 * @requires  kit.tokens, kit.vocab
 * @files     kit/viz/phase-strip.css, kit/samples/viz-phase-strip.json
 * @provides  Kit.phaseStrip.mount, Kit.phaseStrip.FORMS, Kit.phaseStrip.phaseEnum
 * @config    Kit.phaseStrip.mount(box, {phases, form, current, selected, allLabel, label, unitEnum, onSelect}) | phases [{id, name, state, what, exit, after, units: [{title, state}], done, total, waiting}]; returns {setForm(f), update(opts), select(id), destroy()}
 * @config    Kit.vocab | the file adds a 'phase' enum to Kit.vocab when none is defined; unit states use the 'state' enum
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-soft --accent-ink --ok --warn --f-ui --f-mono --seam? --f-display? --warn-soft?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's console skin | segmented phase gauges
 * @source    Catalog harvest, 2026-10-25 | an earlier board's blueprint skin | the process flow of phases
 * @source    Catalog harvest, 2026-10-25 | an earlier board's journal skin | the itinerary of phases
 * @source    Catalog harvest, 2026-10-25 | an earlier board's manuscript skin | contents lines with leaders
 * @source    Catalog harvest, 2026-10-25 | an earlier board's notebook skin | divider tabs with counts and a waiting dot
 * @preview   {"render": "viz.phase-strip", "samples": ["kit/samples/viz-phase-strip.json"], "uses": ["kit.vocab"]}
 * @changed   Five skins' phase strips became one component with five forms; the data is one list, so a page can offer a choice of form.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const FORMS = ['gauge', 'flow', 'itinerary', 'contents', 'tabs'];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const roman = i => ROMAN[i] || String(i + 1);
const two = n => String(n).padStart(2, '0');
const ensure = () => { if (Kit.vocab && Kit.vocab.define && !Kit.vocab.get('phase', 'done')) Kit.vocab.define({ phase: {
  done: { word: 'Done', short: 'done', glyph: 'check', tone: 'success' },
  doing: { word: 'In progress', short: 'now', glyph: 'pulse', tone: 'active' },
  next: { word: 'Next', short: 'next', glyph: 'ring', tone: 'info' },
  todo: { word: 'Not started', short: 'todo', glyph: 'ring', tone: 'neutral' },
  later: { word: 'Later', short: 'later', glyph: 'moon', tone: 'ended' },
} }); };
ensure();
const rowOf = (en, v) => { const g = Kit.vocab && Kit.vocab.get && Kit.vocab.get(en, v); return g || { word: String(v == null ? '' : v), tone: 'neutral', glyph: 'dot' }; };

function counts(p) {
  const u = p.units || []; const total = u.length || p.total || 0;
  const done = u.length ? u.filter(x => x.state === 'done').length : (p.done || 0);
  return { done, total, pct: total ? Math.round(done / total * 100) : (p.state === 'done' ? 100 : 0) };
}
function stateMark(p) {
  const r = rowOf('phase', p.state); const s = el('span', 'kit-ps-state'); s.setAttribute('data-vo-tone', r.tone);
  if (Kit.vocab && Kit.vocab.glyph && r.glyph) s.append(Kit.vocab.glyph(r.glyph));
  s.append(el('span', null, r.word)); return s;
}
function mount(box, opts) {
  ensure();
  const o = Object.assign({ phases: [], form: 'gauge', unitEnum: 'state', label: 'Phases' }, opts);
  let sel = o.selected != null ? o.selected : (o.allLabel ? 'all' : null);
  box.textContent = ''; box.classList.add('kit-ps');
  const cur = () => { if (o.current != null) return o.current; const p = o.phases.find(x => x.state !== 'done'); return p ? p.id : null; };
  const pick = id => { sel = id; draw(); if (o.onSelect) o.onSelect(id); };

  function seg(u) {
    const r = rowOf(o.unitEnum, u.state), s = el('i', 'kit-ps-seg'); s.setAttribute('data-vo-tone', r.tone); s.dataset.st = u.state; s.title = u.title + ': ' + r.word; return s;
  }
  function progress(p, c) {
    const d = el('div', 'kit-ps-prog'); d.setAttribute('role', 'img'); d.setAttribute('aria-label', c.done + ' of ' + c.total + ' done');
    d.append(el('span', 'kit-ps-bar')); d.firstChild.append(el('i')); d.firstChild.firstChild.style.width = c.pct + '%'; d.append(el('b', null, c.done + '/' + c.total)); return d;
  }
  const head = (p, i, big) => { const h = el('div', 'kit-ps-h'); h.append(el('span', 'kit-ps-n', big ? two(i + 1) : 'P' + (i + 1)), el('b', 'kit-ps-name', p.name), stateMark(p)); return h; };

  function gauge() {
    const ol = el('ol', 'kit-ps-gauges'); ol.setAttribute('aria-label', o.label);
    o.phases.forEach((p, i) => {
      const c = counts(p), li = el('li', 'kit-ps-gauge'); if (p.id === cur()) { li.classList.add('kit-ps-cur'); li.setAttribute('aria-current', 'step'); }
      const segs = el('div', 'kit-ps-segs'); segs.setAttribute('role', 'img'); segs.setAttribute('aria-label', c.done + ' of ' + c.total + ' done');
      (p.units || []).forEach(u => segs.append(seg(u))); if (!(p.units || []).length) segs.append(el('i', 'kit-ps-seg kit-ps-none'));
      const foot = el('div', 'kit-ps-foot'); foot.append(el('span', null, c.done + '/' + c.total), el('span', null, c.pct + '%'));
      li.append(head(p, i, true), segs, foot); ol.append(li);
    });
    return ol;
  }
  function flow() {
    const ol = el('ol', 'kit-ps-flow'); ol.setAttribute('aria-label', o.label);
    o.phases.forEach((p, i) => {
      const c = counts(p), li = el('li', 'kit-ps-box'); li.dataset.state = p.state; if (p.id === cur()) { li.classList.add('kit-ps-cur'); li.setAttribute('aria-current', 'step'); }
      li.append(head(p, i, false));
      if (p.after) li.append(el('span', 'kit-ps-dep', 'after ' + p.after));
      li.append(progress(p, c)); ol.append(li);
    });
    return ol;
  }
  function itinerary() {
    const ol = el('ol', 'kit-ps-route'); ol.setAttribute('aria-label', o.label);
    o.phases.forEach((p, i) => {
      const c = counts(p), here = p.id === cur(), li = el('li', 'kit-ps-stop'); li.dataset.state = p.state; if (here) { li.classList.add('kit-ps-cur'); li.setAttribute('aria-current', 'step'); }
      li.append(el('span', 'kit-ps-pin', two(i + 1)));
      const b = el('div', 'kit-ps-stopb'), h = el('div', 'kit-ps-h'); h.append(el('b', 'kit-ps-name', p.name), here ? el('span', 'kit-ps-here', 'You are here') : stateMark(p)); b.append(h);
      if (p.what) b.append(el('p', 'kit-ps-what', p.what));
      if (p.exit) { const e = el('p', 'kit-ps-exit'); e.append(el('span', null, 'Done when'), document.createTextNode(' ' + p.exit)); b.append(e); }
      const dots = el('div', 'kit-ps-dots'); const units = p.units || [];
      if (units.length) { const d = el('span', 'kit-ps-dotrow'); d.setAttribute('role', 'img'); d.setAttribute('aria-label', c.done + ' of ' + c.total + ' done'); units.forEach(u => { const x = el('i'); x.setAttribute('data-vo-tone', rowOf(o.unitEnum, u.state).tone); x.dataset.st = u.state; d.append(x); }); dots.append(d, el('span', 'kit-ps-cnt', c.done + '/' + c.total)); }
      else dots.append(el('span', 'kit-ps-cnt', 'nothing booked yet'));
      if (p.after) dots.append(el('span', 'kit-ps-dep', 'after ' + p.after));
      b.append(dots); li.append(b); ol.append(li);
    });
    return ol;
  }
  function contents() {
    const ol = el('ol', 'kit-ps-toc'); ol.setAttribute('aria-label', o.label);
    o.phases.forEach((p, i) => {
      const c = counts(p), li = el('li', 'kit-ps-line'); li.dataset.state = p.state; if (p.id === cur()) { li.classList.add('kit-ps-cur'); li.setAttribute('aria-current', 'step'); }
      li.append(el('span', 'kit-ps-num', roman(i)), el('span', 'kit-ps-lt', p.name), el('span', 'kit-ps-lead'), el('span', 'kit-ps-lc', c.done + '/' + c.total), stateMark(p)); ol.append(li);
    });
    return ol;
  }
  function tabs() {
    const wrap = el('div', 'kit-ps-tabs'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', o.label);
    const add = (id, name, c, wait) => {
      const b = el('button', 'kit-ps-tab'); b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', String(sel === id));
      b.append(el('span', 'kit-ps-tn', name), el('span', 'kit-ps-tc', c)); if (wait) { const w = el('span', 'kit-ps-wait', String(wait)); w.setAttribute('aria-label', wait + ' waiting on you'); b.append(w); }
      b.addEventListener('click', () => pick(id)); wrap.append(b);
    };
    if (o.allLabel) { const all = o.phases.reduce((a, p) => { const c = counts(p); return [a[0] + c.done, a[1] + c.total]; }, [0, 0]); add('all', o.allLabel, all[0] + '/' + all[1]); }
    o.phases.forEach(p => { const c = counts(p); add(p.id, p.name, c.done + '/' + c.total, p.waiting || 0); });
    return wrap;
  }
  function draw() {
    box.textContent = ''; box.dataset.form = o.form;
    box.append({ gauge, flow, itinerary, contents, tabs }[o.form] ? { gauge, flow, itinerary, contents, tabs }[o.form]() : gauge());
  }
  draw();
  return {
    setForm(f) { if (FORMS.includes(f)) { o.form = f; draw(); } },
    update(next) { Object.assign(o, next); draw(); },
    select(id) { sel = id; draw(); },
    destroy() { box.textContent = ''; box.classList.remove('kit-ps'); delete box.dataset.form; },
  };
}
Kit.phaseStrip = Object.freeze({ mount, FORMS: FORMS.slice(), phaseEnum: 'phase' });
})();
/* /part:page.script.kit.viz.phase-strip */
