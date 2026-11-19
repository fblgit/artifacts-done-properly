/* part:page.script.kit.patterns.steps-owners */
/**
 * Steps with owners, failure lines and a seam
 * Kit.stepsOwners.render(box, {intro, actors, steps, seam, current}) draws a legend of owners and one card per step. Each owner keeps the same tone and the same shape (disc, diamond, square) on every card, so who acts never rides on colour alone. A card says what done looks like, the fact the step emits (shown in mono) and, in a tinted line, what to do when it fails. A dashed seam column after a step marks where the seat changes hands. The current step is ringed, says Now and carries aria-current; the steps before it say Passed. The rail scrolls sideways inside its own box and stacks under 640px. pattern.steps stays the tick-list with phases and saved checkboxes; this is a new file beside it.
 *
 * EXTENDS pattern.steps (kit/patterns/steps.js and steps.css stay as they are; this is a new file beside them)
 * What it is: a procedure drawn as a rail of step cards. Each card says who acts (an owner chip whose tone is fixed by the owner's place in the legend, so the same person looks the same on every card),
 * when the step is done, the fact it emits (the line a machine or a person can check), and what happens when it fails. A seam column marks where the seat changes hands. One step can be
 * marked as the current one: it is ringed, carries the word Now and aria-current="step"; steps before it say Passed. Plain DOM; every text is set with textContent.
 * pattern.steps stays the tick-list with phases and saved checkboxes; use this one to show a procedure with more than one owner.
 *
 * API:
 *   Kit.stepsOwners.render(box, {intro, actors, steps, seam, current, label, words}) -> {setCurrent(id|null), destroy()}
 *     intro    a line above the legend
 *     actors   [{id, label}]   the legend; the first three get distinct tones and shapes, later ones share the plain tone. Order is the key: keep it stable.
 *     steps    [{id, name, who: [actor id], done, fact, fail}]   id is a short code shown before the name; fact is shown in mono; fail is the failure line
 *     seam     {after: step id, label}   a dashed column after that step: "the seat changes hands"
 *     current  step id
 *     words    {done: "Done when", fact: "Emits", fail: "If it fails", now: "Now", passed: "Passed", who: "Who acts", seat: "The seat changes hands"}
 *   Kit.stepsOwners.toneOf(actors, id) -> 0 | 1 | 2 | -1   the pure part
 *
 * CSS classes: .kit-so
 *
 * @id        pattern.steps-owners
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   An upgrade of pattern.steps: a rail of step cards with who acts (stable tone and shape per owner), when it is done, the fact it emits, a failure line, a seam where the seat changes hands and a current-step ring.
 * @tags      steps, owners, actors, procedure, failure, handoff, seam, runbook, rail
 * @requires  kit.tokens
 * @files     kit/patterns/steps-owners.css, kit/samples/patterns.json
 * @provides  Kit.stepsOwners.render, Kit.stepsOwners.toneOf
 * @extends   pattern.steps
 * @config    Kit.stepsOwners.render(box, opts) | intro, actors [{id, label}], steps [{id, name, who, done, fact, fail}], seam {after, label}, current, label, words; returns {setCurrent(id), destroy()}
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --accent-ink --f-ui --f-mono --danger --warn --info? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's section rail | owners per step with stable tones and a legend, the failure line, the emitted fact, the seam, the current-step ring
 * @preview   {"render": "pattern.steps-owners", "samples": ["kit/samples/patterns.json#steps-owners"]}
 * @samples   steps-owners
 * @changed   Extends pattern.steps as new files; steps.js and steps.css are unchanged.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const WORDS = { done: 'Done when', fact: 'Emits', fail: 'If it fails', now: 'Now', passed: 'Passed', who: 'Who acts', seat: 'The seat changes hands' };
const toneOf = (actors, id) => { const i = (actors || []).findIndex(a => a && a.id === id); return i < 0 ? -1 : i % 3; };
const labelOf = (actors, id) => { const a = (actors || []).find(x => x && x.id === id); return a && a.label != null ? a.label : id; };
function actor(actors, id) { const t = toneOf(actors, id); const s = el('span', 'kit-so-actor', labelOf(actors, id)); if (t >= 0) s.dataset.t = String(t); return s; }

function render(box, o) {
  o = o || {}; const W = Object.assign({}, WORDS, o.words), actors = (o.actors || []).filter(a => a && a.id != null);
  const steps = (o.steps || []).filter(s => s && (s.id != null || s.name != null)); let cur = o.current == null ? null : o.current;
  const root = el('div', 'kit-so'); box.replaceChildren(root);
  if (o.intro) root.append(el('p', 'kit-so-lede', o.intro));
  if (actors.length) { const ul = el('ul', 'kit-so-legend'); ul.setAttribute('aria-label', W.who); actors.forEach(a => { const li = el('li'); li.append(actor(actors, a.id)); ul.append(li); }); root.append(ul); }
  const track = el('div', 'kit-so-track'); track.tabIndex = 0; track.setAttribute('role', 'region'); track.setAttribute('aria-label', o.label || 'Procedure'); root.append(track);
  const list = el('ol', 'kit-so-list'); track.append(list);
  function draw() {
    const at = steps.findIndex(s => s.id === cur); list.replaceChildren();
    steps.forEach((s, i) => {
      const li = el('li', 'kit-so-state'); li.dataset.step = s.id;
      if (at >= 0 && i < at) li.classList.add('is-past');
      if (i === at) { li.classList.add('is-current'); li.setAttribute('aria-current', 'step'); }
      const head = el('div', 'kit-so-head'); if (s.id != null) head.append(el('span', 'kit-so-id', s.id)); head.append(el('span', 'kit-so-name', s.name != null ? s.name : s.id));
      if (i === at) head.append(el('span', 'kit-so-flag', W.now)); else if (at >= 0 && i < at) head.append(el('span', 'kit-so-flag is-quiet', W.passed));
      li.append(head);
      if ((s.who || []).length) { const w = el('div', 'kit-so-who'); s.who.forEach(id => w.append(actor(actors, id))); li.append(w); }
      if (s.done != null) { const d = el('div', 'kit-so-done'); d.append(el('span', 'kit-so-k', W.done), el('span', null, s.done)); li.append(d); }
      if (s.fact != null) { const f = el('div', 'kit-so-fact'); f.append(el('span', 'kit-so-k', W.fact), el('code', null, s.fact)); li.append(f); }
      if (s.fail != null) { const f = el('div', 'kit-so-fail'); f.append(el('span', 'kit-so-k', W.fail), el('span', null, s.fail)); li.append(f); }
      list.append(li);
      if (o.seam && o.seam.after === s.id) { const sm = el('li', 'kit-so-seam'); sm.append(el('span', 'kit-so-seam-t', o.seam.label != null ? o.seam.label : W.seat)); list.append(sm); }
    });
  }
  draw();
  return { setCurrent(id) { cur = id; draw(); }, destroy() { box.replaceChildren(); } };
}
Kit.stepsOwners = Object.freeze({ render, toneOf });
})();
/* /part:page.script.kit.patterns.steps-owners */
