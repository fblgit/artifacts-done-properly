/* part:page.script.kit.viz.stepper */
/* Kit visualization: stepper (Kit.viz.StepTrack, Kit.viz.Stages)    kit version 0.1.0
   What it is: two ways to show where something is in an ordered process.
     StepTrack: a compact rail for one request or job (queue, ack, pending, done): passed steps filled, the current one marked and named,
                a hint per step, and a done state that turns the whole rail to the "ok" colour.
     Stages:    the numbered stage list of a guided flow, with a tick and a count per stage, the current stage marked (aria-current="step"),
                each stage a button when the board passes onPick.
   Needs from the board:
     config  StepTrack({steps: [id], at: id, labels: {id: text}, hints: {id: text}, busy: bool, meta, label})
               steps   the ordered step ids; at the current one; labels default to the ids; meta an optional trailing note (text or vnode)
               busy    true while work runs on the current step: its node pulses (not under prefers-reduced-motion)
             Stages({steps: [{id, label, count, done}], current: id, onPick(id), compact})
               done defaults to count > 0; count is shown when it is a number
     css     kit/viz/viz.css; custom properties --panel --ink --ink-2 --ink-3 --rule --sunk --accent --accent-soft --ok --f-mono
     needs   kit/viz/core.js loaded first
   db collections: none (the Claude lane in kit/claude-lane.js reads the request docs and can pass their state here).
   Lifted from: Journey Whiteboard app.js (REQ_STEPS, REQ_HINT and the rail in ReqLine; GuideSteps). */
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
