/* part:page.script.kit.viz.replay */
/**
 * Replay scrubber
 * The replay controls from the Journey Whiteboard's tree, now usable with any view. Play, pause or drag through the steps; the last position means now. The tick strip is drawn to scale, so bursts of work and long gaps show as they happened. cutAt gives the ids present at a step, so the board draws its view with only those.
 *
 * Config:
 * Replay({events, step, onStep, interval, kinds, words})
 *   events  [{id, t, label, kind}] sorted or not (timeline() sorts by t); t in ms since the epoch
 *   step    null for "now", or n: the board after its first n events; onStep(step | null) is called on every change
 *   interval ms between steps while playing (default 650); words {now, play, pause, steps}
 * timeline(events) -> sorted copy; cutAt(events, step) -> Set of the ids present at that step (all ids when step is null)
 *
 * The board passes creation stamps it already has (items.created, pages.created in the Journey Whiteboard).
 * Tone colours: --c-<pen> for each pen tone used.
 * Tokens: no file of this entry reads a custom property. Its rules are the "replay" section of kit/viz/viz.css (entry viz.core, which it requires); they read --accent --f-mono --f-ui --ink --ink-2 --ink-3; and with a fallback --kv-c.
 *
 * @id        viz.replay
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Step through a board's history in creation order, with ticks placed to scale on the real time axis.
 * @tags      timeline, replay, history, scrubber, time, slider
 * @requires  viz.core
 * @files     kit/samples/viz-replay.json
 * @provides  Kit.viz.Replay, Kit.viz.timeline, Kit.viz.cutAt
 * @config    events | [{id, t, label, kind}]: t in ms
 * @config    step, onStep | null for now, or n; onStep(step | null)
 * @config    playing, onPlaying | controlled play state
 * @config    interval | ms per step (650)
 * @config    kinds, words | {kind: {label, tone}}, {now, play, pause, steps}
 * @tokens    none
 * @globals   htm-preact
 * @db        note The board passes creation stamps it already has.
 * @source    Journey Whiteboard | app.js | timeline, the Replay button, range and label inside TreeView
 * @preview   {"render": "viz.replay", "samples": ["kit/samples/viz-replay.json"]}
 * @changed   A component of its own instead of part of the tree.
 */
(function () {
'use strict';
const Kit = window.Kit;
const { html, useEffect } = window.htmPreact;
const { clip, tone, kindOf, cx } = Kit.viz.util;

const timeline = ev => [...(ev || [])].sort((a, b) => (a.t || 0) - (b.t || 0));
const cutAt = (ev, step) => { const l = timeline(ev); return new Set((step == null ? l : l.slice(0, step)).map(e => e.id)); };
const day = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

function Replay({ events, step = null, onStep, interval = 650, kinds, words = {}, playing, onPlaying }) {
  const l = timeline(events), n = l.length;
  const w = Object.assign({ now: 'now', play: 'Replay', pause: 'Pause', steps: 'steps' }, words);
  const go = s => onStep && onStep(s == null || s >= n ? null : Math.max(0, s));
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => { const nx = (step == null ? 0 : step) + 1; if (nx >= n) { onPlaying && onPlaying(false); go(null); } else go(nx); }, interval);
    return () => clearInterval(id);
  }, [playing, step, n]);
  const ev = step != null ? l[step - 1] : null;
  const t0 = n ? l[0].t : 0, t1 = n ? l[n - 1].t : 1, span = Math.max(1, t1 - t0);
  const at = step == null ? n : step;
  return html`<div class="kv-replay">
    <button type="button" class="kv-btn" disabled=${!n} aria-pressed=${!!playing}
      onClick=${() => { if (playing) onPlaying && onPlaying(false); else { if (step == null || step >= n) go(1); onPlaying && onPlaying(true); } }}>${playing ? w.pause : w.play}</button>
    <div class="kv-replay-axis">
      <input type="range" min="0" max=${n} value=${at} aria-label="Replay step by step" aria-valuetext=${step == null ? w.now : 'step ' + step + ' of ' + n}
        onInput=${e => { onPlaying && onPlaying(false); go(+e.target.value); }}/>
      <div class="kv-ticks" aria-hidden="true">${l.map((e, i) => html`<i key=${e.id} class=${cx(tone(kindOf(kinds, e.kind).tone), i < at && 'in')} style=${'left:' + ((e.t - t0) / span * 100).toFixed(2) + '%'} title=${clip(e.label, 60)}></i>`)}</div>
      <div class="kv-replay-ends" aria-hidden="true"><span>${day(t0)}</span><span>${day(t1)}</span></div>
    </div>
    <span class="kv-replay-l" aria-live="polite">${step == null ? html`<b>${w.now}</b> · ${n} ${w.steps}` : html`<b>${step}/${n}</b>${ev ? html` · ${day(ev.t)} · +${kindOf(kinds, ev.kind).label} “${clip(ev.label, 40)}”` : ''}`}</span>
  </div>`;
}

Object.assign(Kit.viz, { Replay, timeline, cutAt });
})();
/* /part:page.script.kit.viz.replay */
