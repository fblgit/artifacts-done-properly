/* part:page.script.kit.viz.dial-meter */
/**
 * Dial meter
 * A tile with a 270 degree dial (the gap at the bottom), a big number with its unit, a title and a caption. Three variants of the dial: value (an arc with a gold bead at its end), segments (the arc split by kind, 6 degrees apart, colours from --kind-1..4, counts named under the dial), and drain (a ring that empties as a count-down, warning in its last 20 seconds; the sealed-vault ring). When the tile has actions they take the caption's place on hover or focus; on touch and under 480px both show. The number is real text, and the tile's accessible name repeats it with unit and caption. Kit.dialMeter.make, dial and drain are the small API other entries call; arcPath is the pure arc geometry.
 *
 * Batch 10 calls this file: the API below is small and stable, extend it only by adding options.
 * API:
 *   Kit.dialMeter.make(opts) -> {el, update(patch), destroy()}    a tile
 *     opts   { title, value, unit, frac, tone, segments, caption, actions, onAction(key, event), ariaLabel, kindLabels }
 *              value     the big number as text ("34", "1,284", "98%"); long values shrink
 *              unit      the small word under it ("certificates", "days")
 *              frac      0 to 1, how much of the arc is filled (value variant). Nothing is drawn beyond the number: no frac, no arc, no bead
 *              tone      ok | warn | bad | idle, or any Kit.vocab tone (success, attention, danger, ended, neutral, active, info, review); colours the arc, never the number
 *              segments  [{v, kind, label}]  the segmented variant: v the count, kind 1 to 4 (the arc colour --kind-N), label for the key line; zero counts are left out
 *              actions   [{key, label, icon, danger}]  icon is a Kit.vocab glyph name, svg path markup (24 grid, stroke only) or a Node; onAction gets the key
 *     update(patch) redraws with the changed options; destroy() removes the tile
 *   Kit.dialMeter.dial(opts) -> Element    only the dial with its number (value, unit, frac, tone, segments), no tile
 *   Kit.dialMeter.drain(opts) -> {el, remaining(), reset(seconds), pause(), resume(), destroy()}    a draining ring, the sealed-vault count-down
 *     opts   { title, total (seconds), remaining (seconds), warnAt: 20, caption, actions, onAction, onTick(seconds), onEnd(), word(seconds) -> {value, unit, spoken} }
 *              the default word gives 1:12 min under an hour, 59 s under a minute; spoken is the sentence assistive tech reads ("1 minute 12 seconds left"), refreshed every 5 s and at the warning
 *   Kit.dialMeter.arcPath(cx, cy, r, a0, a1) -> "M… A…"  an svg arc path in degrees (0 is three o'clock, clockwise), for a board's own dial
 * Tone: [data-vo-tone] on the tile sets --vo-c (kit/vocab.css); the arc takes it. The bead is the gold seam. Text is --ink and --ink-2 on the panel.
 *
 * Also load kit/vocab.css.
 *
 * @id        viz.dial-meter
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A 270 degree dial tile with a gold bead at the end of its arc, a big number and a unit; segments can split the arc by kind; the caption gives way to action buttons on hover or focus.
 * @tags      dial, meter, gauge, arc, tile, countdown, drain, segments, kpi
 * @requires  kit.vocab
 * @files     kit/viz/dial-meter.css, kit/samples/viz.json
 * @provides  Kit.dialMeter.make, Kit.dialMeter.dial, Kit.dialMeter.drain, Kit.dialMeter.arcPath
 * @config    Kit.dialMeter.make({title, value, unit, frac, tone, segments, caption, actions, onAction}) | returns {el, update(patch), destroy()}; tone is ok | warn | bad | idle or a Kit.vocab tone; no frac means no arc
 * @config    Kit.dialMeter.drain({title, total, remaining, warnAt, caption, actions, onTick, onEnd, word}) | returns {el, remaining(), reset(seconds), pause(), resume(), destroy()}
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --f-display? --seam? --kind-1? --kind-2? --kind-3? --kind-4? --rim? --pool? --glz-r-l? --danger --ink-3 --danger-ink? --danger-soft? --edge? --edge-gold? --glz-sh-1? --glz-sh-2? --sunk-2?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's certificate page | arcPath, the dial with a gold bead, the meter tile and its swapping caption
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's vault page | the ring that drains while the vault is open
 * @preview   {"render": "viz.dial-meter", "samples": ["kit/samples/viz.json#dial-meter"]}
 * @samples   dial-meter
 * @changed   The number, unit, caption and actions are config; the draining ring is a component with its own clock and a spoken form of the time left.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const R = 46, A0 = 135, SPAN = 270;
const SHORT = { ok: 'success', warn: 'attention', bad: 'danger', idle: 'ended' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function arcPath(cx, cy, r, a0, a1) {
  const p = a => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
}
const toneOf = t => SHORT[t] || t || 'neutral';

function dial(o) {
  o = o || {};
  const box = el('div', 'kit-dm-dial'); box.dataset.voTone = toneOf(o.tone);
  const s = sv('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  s.append(sv('path', { class: 'kit-dm-track', d: arcPath(50, 50, R, A0, A0 + SPAN) }));
  const segs = (o.segments || []).filter(g => g.v > 0);
  if (o.segments) {
    const tot = segs.reduce((n, g) => n + g.v, 0) || 1, room = SPAN - 6 * Math.max(0, segs.length - 1);
    let a = A0;
    segs.forEach(g => { const w = g.v / tot * room; s.append(sv('path', { class: 'kit-dm-seg kit-dm-k' + clamp(g.kind || 1, 1, 4), d: arcPath(50, 50, R, a, a + Math.max(w, 0.5)) })); a += w + 6; });
  } else if (o.frac != null) {
    const f = clamp(o.frac, 0, 1);
    if (f > 0.004) s.append(sv('path', { class: 'kit-dm-val', d: arcPath(50, 50, R, A0, A0 + SPAN * f) }));
    if (!o.noBead) { const ea = (A0 + SPAN * f) * Math.PI / 180; s.append(sv('circle', { class: 'kit-dm-bead', cx: (50 + R * Math.cos(ea)).toFixed(2), cy: (50 + R * Math.sin(ea)).toFixed(2), r: 4.6 })); }
  }
  const num = el('div', 'kit-dm-num'); const v = String(o.value == null ? '' : o.value);
  const b = el('b', null, v); b.dataset.len = v.length > 5 ? 'xl' : v.length > 3 ? 'l' : 's'; num.append(b);
  if (o.unit) num.append(el('small', null, o.unit));
  box.append(s, num); return box;
}

function glyph(i) {
  if (i instanceof Node) return i;
  if (Kit.vocab && Kit.vocab.glyphs.includes(i)) return Kit.vocab.glyph(i);
  const s = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, 'kit-vo-g'); s.innerHTML = i || ''; return s;
}
function segLine(o) {
  const segs = (o.segments || []).filter(g => g.v > 0); if (!segs.length) return '';
  return segs.map(g => g.v + ' ' + (g.label || ('kind ' + (g.kind || 1)))).join(', ');
}
function nameOf(o) {
  const val = o.spoken || ([o.value, o.unit].filter(x => x != null && x !== '').join(' ') + (o.segments ? ' (' + segLine(o) + ')' : ''));
  return [o.title, val, o.caption].filter(Boolean).join('. ');
}

function make(opts) {
  let o = Object.assign({}, opts), tile = el('div', 'kit-dm'), alive = true;
  function draw() {
    tile.replaceChildren(); tile.dataset.voTone = toneOf(o.tone);
    const acts = o.actions || [];
    tile.tabIndex = acts.length ? 0 : -1; if (!acts.length) tile.removeAttribute('tabindex');
    tile.setAttribute('role', 'group'); tile.setAttribute('aria-label', o.ariaLabel || nameOf(o));
    tile.append(dial(o));
    if (o.title) tile.append(el('b', 'kit-dm-title', o.title));
    const swap = el('div', 'kit-dm-swap');
    const cap = el('div', 'kit-dm-cap'); if (o.caption) cap.append(el('span', null, o.caption));
    if (o.segments) { const ln = segLine(o); if (ln) { const k = el('ul', 'kit-dm-key'); o.segments.filter(g => g.v > 0).forEach(g => { const li = el('li'); const dot = el('i', 'kit-dm-sw kit-dm-k' + clamp(g.kind || 1, 1, 4)); dot.setAttribute('aria-hidden', 'true'); li.append(dot, document.createTextNode(g.v + ' ' + (g.label || ''))); k.append(li); }); cap.append(k); } }
    swap.append(cap);
    if (acts.length) {
      const box = el('div', 'kit-dm-acts');
      acts.forEach(a => {
        const bt = el('button', 'kit-dm-act' + (a.danger ? ' kit-bad' : '')); bt.type = 'button'; bt.dataset.key = a.key;
        if (a.icon) bt.append(glyph(a.icon)); bt.append(el('span', null, a.label));
        bt.addEventListener('click', e => o.onAction && o.onAction(a.key, e)); box.append(bt);
      });
      swap.append(box); tile.dataset.hasActs = '';
    } else delete tile.dataset.hasActs;
    tile.append(swap);
  }
  draw();
  return { el: tile, update(patch) { if (!alive) return; o = Object.assign(o, patch); draw(); }, destroy() { alive = false; tile.remove(); } };
}

function defaultWord(sec) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec >= 3600) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return { value: h + ':' + String(m).padStart(2, '0'), unit: 'hours', spoken: h + (h === 1 ? ' hour ' : ' hours ') + m + (m === 1 ? ' minute' : ' minutes') + ' left' }; }
  if (sec >= 60) { const m = Math.floor(sec / 60), s = sec % 60; return { value: m + ':' + String(s).padStart(2, '0'), unit: 'min', spoken: m + (m === 1 ? ' minute ' : ' minutes ') + s + (s === 1 ? ' second' : ' seconds') + ' left' }; }
  return { value: String(sec), unit: 's', spoken: sec + (sec === 1 ? ' second' : ' seconds') + ' left' };
}
function drain(opts) {
  const o = Object.assign({ warnAt: 20, word: defaultWord }, opts);
  let end = Date.now() + (o.remaining != null ? o.remaining : o.total) * 1000, paused = null, timer = null, last = -1, spokeAt = 0, wasWarn = false, seen = false;
  const m = make({ title: o.title, caption: o.caption, actions: o.actions, onAction: o.onAction, tone: 'info', value: '', frac: 1, noBead: true });
  m.el.classList.add('kit-dm-drain');
  const left = () => paused != null ? paused : Math.max(0, (end - Date.now()) / 1000);
  function paint() {
    const r = left(), sec = Math.ceil(r), w = o.word(r), warn = r > 0 && r <= o.warnAt, over = r <= 0;
    if (sec === last && warn === wasWarn) return; last = sec;
    const tone = over ? 'ended' : warn ? 'attention' : 'info';
    const say = over ? 'Time is up' : w.spoken || (w.value + ' ' + w.unit);
    const speak = over || warn !== wasWarn || Math.abs(sec - spokeAt) >= 5 || !spokeAt; if (speak) spokeAt = sec; wasWarn = warn;
    const d = { value: over ? '0' : w.value, unit: over ? 's' : w.unit, frac: o.total ? clamp(r / o.total, 0, 1) : 0, tone, noBead: true };
    const old = m.el.querySelector('.kit-dm-dial'); if (old) old.replaceWith(dial(d));
    m.el.dataset.voTone = toneOf(tone); m.el.dataset.warn = warn ? 'true' : 'false';
    if (speak) m.el.setAttribute('aria-label', nameOf({ title: o.title, value: d.value, unit: d.unit, spoken: say, caption: o.caption }));
    if (o.onTick) o.onTick(r);
    if (over) { stop(); if (o.onEnd) o.onEnd(); }
  }
  function tick() { if (m.el.isConnected) seen = true; else if (seen) return stop(); paint(); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function go() { stop(); timer = setInterval(tick, 250); }
  paint(); go();
  return {
    el: m.el, remaining: left,
    reset(sec) { end = Date.now() + sec * 1000; paused = null; last = -1; spokeAt = 0; wasWarn = false; paint(); go(); },
    pause() { if (paused == null) { paused = left(); stop(); } },
    resume() { if (paused != null) { end = Date.now() + paused * 1000; paused = null; go(); } },
    destroy() { stop(); m.destroy(); },
  };
}

Kit.dialMeter = Object.freeze({ make, dial, drain, arcPath });
})();
/* /part:page.script.kit.viz.dial-meter */
