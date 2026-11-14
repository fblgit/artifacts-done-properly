/* part:page.script.kit.viz.stepper */
/**
 * Step track and stages
 * StepTrack is the rail from the Journey Whiteboard's request line: passed steps filled, the current one marked and named, its hint beside it, and the whole rail green once done. Stages is the guide's stage list with ticks and counts, the current stage marked as the current step.
 *
 * Config:
 * StepTrack({steps: [id], at: id, labels: {id: text}, hints: {id: text}, busy: bool, meta, label})
 *   steps   the ordered step ids; at the current one; labels default to the ids; meta an optional trailing note (text or vnode)
 *   busy    true while work runs on the current step: its node pulses (not under prefers-reduced-motion)
 * Stages({steps: [{id, label, count, done}], current: id, onPick(id), compact})
 *   done defaults to count > 0; count is shown when it is a number
 *
 * The Claude lane in kit/claude-lane.js reads the request docs and can pass their state here.
 * Tokens: no file of this entry reads a custom property. Its rules are the "step track" and "stages" sections of kit/viz/viz.css (entry viz.core, which it requires); they read --accent --accent-soft --f-mono --f-ui --ink --ink-2 --ok --panel --rule --sunk.
 *
 * @id        viz.stepper
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Where something is in an ordered process: a compact rail for one request, and the numbered stage list of a guided flow.
 * @tags      stepper, progress, steps, request, queue, stages, wizard, claude lane
 * @requires  viz.core
 * @files     kit/samples/viz-stepper.json
 * @provides  Kit.viz.StepTrack, Kit.viz.Stages
 * @config    StepTrack | {steps: [id], at: id, labels, hints, busy, meta, label}
 * @config    Stages | {steps: [{id, label, count, done}], current, onPick(id), compact}
 * @tokens    none
 * @globals   htm-preact
 * @db        none
 * @source    Journey Whiteboard | app.js | REQ_STEPS, REQ_HINT, the rail in ReqLine, GuideSteps
 * @preview   {"render": "viz.stepper", "samples": ["kit/samples/viz-stepper.json"]}
 * @changed   The rail announces itself as one image: step n of m, its name and hint.
 * @changed   The current node is a dot on the rail, and it pulses only while busy and only without reduced motion.
 * @changed   Stages work without click handlers (plain list) or with them (buttons).
 */
(function () {
'use strict';
const Kit = window.Kit;
const { html } = window.htmPreact;
const { cx } = Kit.viz.util;

function StepTrack({ steps, at, labels, hints, busy, meta, label }) {
  const list = steps || [];
  const i = Math.max(0, list.indexOf(at));
  const done = i === list.length - 1;
  const name = id => (labels && labels[id]) || id;
  const hint = hints && hints[at];
  return html`<div class=${cx('kv-track', done && 'is-done', busy && 'is-busy')}
      role="img" aria-label=${(label ? label + ': ' : '') + 'step ' + (i + 1) + ' of ' + list.length + ', ' + name(at) + (hint ? ', ' + hint : '')}>
    <ol class="kv-track-rail" aria-hidden="true">${list.map((s, k) => html`<li key=${s} class=${k < i ? 'past' : k === i ? 'now' : ''} title=${name(s) + (hints && hints[s] ? ': ' + hints[s] : '')}></li>`)}</ol>
    <b class="kv-track-at">${name(at)}</b>
    ${hint ? html`<span class="kv-track-hint">${hint}</span>` : ''}
    ${meta ? html`<span class="kv-track-meta">${meta}</span>` : ''}
  </div>`;
}

function Stages({ steps, current, onPick, compact }) {
  const list = steps || [];
  return html`<ol class=${cx('kv-stages', compact && 'compact')} aria-label="Stages">${list.map((g, i) => {
    const done = g.done != null ? g.done : g.count > 0;
    const cur = g.id === current;
    const inner = html`<span class="kv-sn" aria-hidden="true">${done ? '✓' : i + 1}</span><span class="kv-st">${g.label}</span>${typeof g.count === 'number' ? html`<span class="kv-sc">${g.count}</span>` : ''}${done ? html`<span class="kv-sr">, done</span>` : ''}`;
    return html`<li key=${g.id}>${onPick
      ? html`<button type="button" class=${cx(done && 'done', cur && 'cur')} aria-current=${cur ? 'step' : null} onClick=${() => onPick(g.id)}>${inner}</button>`
      : html`<span class=${cx('kv-stage', done && 'done', cur && 'cur')} aria-current=${cur ? 'step' : null}>${inner}</span>`}</li>`;
  })}</ol>`;
}

Object.assign(Kit.viz, { StepTrack, Stages });
})();
/* /part:page.script.kit.viz.stepper */
