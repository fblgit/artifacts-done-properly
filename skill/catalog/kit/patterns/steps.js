/* part:page.script.kit.patterns.steps */
/**
 * Numbered steps
 * A step list where the order is the markup's: the number is a CSS counter in the display face. A step can carry an id chip (T1.2), a 'Done when' line and the Gate mark for a check that stops the line. Phases group steps under a header with 'n of m done' and a thin bar. Each step can have a checkbox kept in localStorage (try/catch, memory-only when the frame refuses); Clear ticks resets them. Works as plain CSS on hand-written markup, and Kit.steps.mount enhances it.
 *
 * What it is: a numbered step list with "done when" lines, id chips and gate steps, grouped in phases that count their own progress. Each step can carry a checkbox whose state is kept in this
 * browser (localStorage, keyed by the list and the step id); nothing is sent anywhere. Plain DOM; every string is set with textContent.
 *
 * API (small and stable):
 *   Kit.steps.render(box, {phases, steps, key, persist, reset, onChange}) -> {progress(), clear(), refresh(), destroy()}
 *     phases   [{id, title, note, steps}]            or steps: [...] for one list without a header
 *     step     {id, title, body, done, ids: ["T1.2"], gate: true, details: ["a line", ...]}
 *              id is a bare token (it names the saved checkbox); body and done are plain text; done becomes the "Done when" line; gate marks a check that stops the line
 *     key      the list's name in storage (default "steps"); persist false keeps the checkboxes in memory only
 *     reset    true adds a "Clear ticks" button
 *     onChange ({done, total, phase}) after every tick
 *   Kit.steps.mount(root, {key, persist, onChange}) -> same handle; enhances markup that already exists (.kit-step[data-step]): adds the checkbox and the phase counts
 *
 * Markup and classes: see kit/patterns/steps.css. Progress is announced in a polite live region on each phase header.
 *
 * storage localStorage when the frame allows it (every read and write is in try/catch; without it the ticks last until the page closes)
 *
 * CSS classes: .kit-steps .kit-step .kit-steps-phase
 *
 * @id        pattern.steps
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Big-number step list with done-when lines, id chips, gate steps and phases that count their own progress; the ticks stay in the browser.
 * @tags      steps, checklist, runbook, progress, done when, gate, numbered list, phases
 * @requires  none
 * @files     kit/patterns/steps.css, kit/samples/steps.json
 * @provides  Kit.steps.render, Kit.steps.mount
 * @config    Kit.steps.render(box, opts) | phases [{id, title, note, steps}] or steps; step {id, title, body, done, ids, gate, details}; key, persist, reset, onChange
 * @config    markup | ol.kit-steps > li.kit-step[data-step] > div.kit-step-body, for Kit.steps.mount or no script at all
 * @config    storage | localStorage key kit-steps:<key>:<step id>; every access is in try/catch
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono --f-display --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 6 artifacts' index.html | big-number steps, numbered steps with a done-when line, steps with id chips, a persistent checklist with per-phase progress, and runbook step cards with gates and saved ticks
 * @preview   {"render": "pattern.steps", "samples": ["kit/samples/steps.json"]}
 * @changed   The gate is a ringed word and an underlined number, not a coloured card edge.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const store = {
  get(k) { try { return localStorage.getItem(k) === '1'; } catch (_) { return false; } },
  set(k, v) { try { if (v) localStorage.setItem(k, '1'); else localStorage.removeItem(k); } catch (_) {} },
};
let seq = 0;
function buildStep(s) {
  const li = el('li', 'kit-step'); li.dataset.step = s.id; if (s.gate) li.dataset.gate = '';
  const body = el('div', 'kit-step-body'); li.append(body);
  const h = el('h4', 'kit-step-t'); const t = el('span', 'kit-step-title', s.title); h.append(t);
  if (s.gate) h.append(el('span', 'kit-step-gate', 'Gate'));
  if (s.ids && s.ids.length) { const ids = el('span', 'kit-step-ids'); s.ids.forEach(i => ids.append(el('code', null, i))); h.append(ids); }
  body.append(h);
  if (s.body) body.append(el('p', null, s.body));
  if (s.details && s.details.length) { const ul = el('ul'); ul.style.cssText = 'margin:0;padding-left:1.2em;color:var(--ink-2);font:14.5px/1.55 var(--f-ui)'; s.details.forEach(d => ul.append(el('li', null, d))); body.append(ul); }
  if (s.done) { const p = el('p', 'kit-step-done'); p.append(el('b', null, 'Done when'), document.createTextNode(s.done)); body.append(p); }
  return li;
}
function build(box, o) {
  box.replaceChildren();
  const groups = o.phases && o.phases.length ? o.phases : [{ steps: o.steps || [] }];
  groups.forEach((g, gi) => {
    const wrap = el('section', 'kit-steps-phase'); wrap.dataset.phase = g.id || 'p' + gi;
    if (g.title) {
      const hd = el('header', 'kit-phase-h'); hd.append(el('h3', null, g.title));
      if (g.note) hd.append(el('span', 'kit-phase-t', g.note));
      const pr = el('span', 'kit-progress'); pr.setAttribute('role', 'status'); hd.append(pr);
      const bar = el('div', 'kit-progress-bar'); bar.setAttribute('aria-hidden', 'true'); bar.append(el('i')); hd.append(bar);
      wrap.append(hd);
    } else wrap.style.cssText = 'padding:0;border:0;background:none';
    const ol = el('ol', 'kit-steps'); (g.steps || []).forEach(s => ol.append(buildStep(s))); wrap.append(ol);
    box.append(wrap);
  });
  if (o.reset) { const t = el('div', 'kit-steps-tools'); const b = el('button', 'kit-steps-reset', 'Clear ticks'); b.type = 'button'; t.append(b); box.append(t); }
}
function mount(root, opts) {
  const o = Object.assign({ key: 'steps', persist: true }, opts);
  const n = ++seq;
  const stepsAll = () => [...root.querySelectorAll('.kit-step[data-step]')];
  const keyOf = li => 'kit-steps:' + o.key + ':' + li.dataset.step;
  const mem = new Map();
  const get = li => o.persist ? store.get(keyOf(li)) : !!mem.get(li.dataset.step);
  const put = (li, v) => { if (o.persist) store.set(keyOf(li), v); else mem.set(li.dataset.step, v); };
  const scopes = () => { const ph = [...root.querySelectorAll('.kit-steps-phase')]; return ph.length ? ph : [root]; };
  function paint() {
    scopes().forEach(sc => {
      const all = [...sc.querySelectorAll('.kit-step[data-step]')]; const done = all.filter(li => li.classList.contains('is-done')).length;
      const pr = sc.querySelector('.kit-progress'); if (pr) pr.textContent = done + ' of ' + all.length + ' done';
      const bar = sc.querySelector('.kit-progress-bar > i'); if (bar) bar.style.setProperty('--p', (all.length ? Math.round(100 * done / all.length) : 0) + '%');
    });
  }
  function wire(li, i) {
    const body = li.querySelector('.kit-step-body') || li;
    let cb = li.querySelector('input.kit-step-cb');
    if (!cb) {
      const lab = el('label', 'kit-step-chk'); cb = el('input'); cb.type = 'checkbox'; cb.className = 'kit-step-cb'; cb.id = 'kit-st' + n + '-' + i;
      lab.htmlFor = cb.id; lab.append(cb, el('span', null, 'Done')); body.append(lab);
      const title = li.querySelector('.kit-step-title, .kit-step-t'); cb.setAttribute('aria-label', 'Done: ' + (title ? title.textContent.trim() : 'step ' + (i + 1)));
    }
    cb.checked = get(li); li.classList.toggle('is-done', cb.checked);
    cb.addEventListener('change', () => {
      li.classList.toggle('is-done', cb.checked); put(li, cb.checked); paint();
      const sc = li.closest('.kit-steps-phase') || root; const all = [...sc.querySelectorAll('.kit-step[data-step]')];
      if (o.onChange) o.onChange({ done: all.filter(x => x.classList.contains('is-done')).length, total: all.length, phase: sc.dataset ? sc.dataset.phase || null : null });
    });
  }
  stepsAll().forEach(wire); paint();
  const rb = root.querySelector('.kit-steps-reset');
  const clear = () => { stepsAll().forEach(li => { put(li, false); li.classList.remove('is-done'); const cb = li.querySelector('input.kit-step-cb'); if (cb) cb.checked = false; }); paint(); };
  if (rb) rb.addEventListener('click', clear);
  return {
    progress: () => { const all = stepsAll(); return { done: all.filter(li => li.classList.contains('is-done')).length, total: all.length }; },
    clear, refresh() { stepsAll().forEach(li => { const cb = li.querySelector('input.kit-step-cb'); if (cb) { cb.checked = get(li); li.classList.toggle('is-done', cb.checked); } }); paint(); },
    destroy() { if (rb) rb.removeEventListener('click', clear); },
  };
}
function render(box, opts) {
  const o = Object.assign({ key: 'steps', persist: true }, opts);
  build(box, o);
  return mount(box, o);
}
Kit.steps = Object.freeze({ render, mount });
})();
/* /part:page.script.kit.patterns.steps */
