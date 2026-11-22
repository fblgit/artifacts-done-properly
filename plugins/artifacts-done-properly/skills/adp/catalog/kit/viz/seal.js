/* part:page.script.kit.viz.seal */
/**
 * Lifetime seal
 * A porcelain seal for anything with an end: the ring is the fraction of life left, the number and its unit sit in the display serif, and a crackle spreads over the glaze as the end nears (more cracks, each a little stronger, growing outward from a point that is the same for the same item). Ended items say so in words: expired, revoked, ended, replaced, end date unknown. Round action buttons fan out above the seal on hover or focus (2 to 5, 29 degrees apart); under 480px and on touch they sit in a row beneath. The mini seal is the same ring at 40px for a row. The file also defines the Kit.vocab enum 'life' (ok, soon, urgent, expired, revoked, ended, replaced, unknown) that the other batch 9 pieces read, unless the board has defined its own. The unit comes from a callback (days by default, hours under a day, years from 730 days). A small API for other entries: Kit.seal.make, mini, parts, text, stateOf.
 *
 * Batch 10 calls this file: the API below is small and stable, extend it only by adding options.
 * The life enum: this file defines the enum "life" in Kit.vocab (only when the board has not defined its own): ok, soon, urgent, expired, revoked, ended, replaced, unknown. The words,
 * glyphs and tones come from that table, so a board renames or recolours a state once. The ring and the crackle follow the state's tone (data-vo-tone).
 * API:
 *   Kit.seal.make(item, opts) -> Element   a .kit-sl-wrap (seal, label, actions); append it anywhere
 *     item   { id, label, left, life, total, state, actions }
 *              left    time left in days (a number; 0 or less is over; null or undefined means the end is not known)
 *              life    the fraction of the whole life still left, 0 to 1 (a ring needs it; with total instead, it is left / total; with neither, no arc is drawn, never a guess)
 *              state   one of Kit.seal.states, or leave it out and it is worked out from left (<= urgentDays urgent, <= soonDays soon, <= 0 expired, null unknown)
 *              actions  this item's own action list (instead of opts.actions)
 *     opts   { size: 124 (px, 80 to 180), soonDays: 60, urgentDays: 14, unitOf(left, state) -> {big, unit}, actions: [{key, label, icon, danger}], onAction(key, item, event),
 *              onOpen(item, event), labelHidden: false, crackle: true }
 *              icon    a name from Kit.seal.icons (refresh, pulse, box, ban, open, key, bell, copy), an svg path string (24 grid, stroke only), or a Node
 *              onOpen  makes the seal a button (Enter and Space work); without it and without actions the seal is a plain image
 *     The seal's accessible name is "<label>, <text>", e.g. "shop, 9 days left".
 *   Kit.seal.mini(item, opts) -> Element   a 40px ring with a short number, for rows; aria-hidden (put the item's text beside it)
 *   Kit.seal.parts(item, opts) -> {state, frac, big, unit, text, row}   the pure part: what the seal says (row is the Kit.vocab row of the state)
 *   Kit.seal.text(item, opts) -> string    "9 days left", "Revoked", "End date unknown"
 *   Kit.seal.stateOf(item, opts) -> state  the state a seal will show
 *   Kit.seal.states -> [state]             the values of the life enum
 *   Kit.seal.icons -> {name: path markup}
 * Unit rule (replace it with opts.unitOf): over one day left, whole days; 730 days and more, years to one decimal; under one day, hours (at least one).
 *
 * Also load kit/vocab.css.
 *
 * @id        viz.seal
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.1
 * @updated   2026-11-23
 * @summary   A medallion whose ring is the time left, with the number in serif and a crackle that spreads over the glaze as the end nears; round action buttons fan out on hover or focus.
 * @tags      seal, ring, countdown, lifetime, expiry, medallion, crackle, actions, porcelain
 * @requires  kit.vocab
 * @files     kit/viz/seal.css, kit/samples/viz.json
 * @provides  Kit.seal.make, Kit.seal.mini, Kit.seal.parts, Kit.seal.text, Kit.seal.stateOf, Kit.seal.states, Kit.seal.icons
 * @config    Kit.seal.make(item, {size, soonDays, urgentDays, unitOf, actions, onAction, onOpen}) | item {id, label, left (days), life (0 to 1) or total, state, actions}; actions [{key, label, icon, danger}]; a ring needs life or total, with neither no arc is drawn
 * @config    Kit.seal.parts(item) -> {state, frac, big, unit, text, row} | the pure part, for a board that draws its own
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --ink-3 --f-display? --pebble-hi? --rim? --pool? --glz-sh-1? --danger --danger-ink? --danger-soft? --edge? --edge-gold? --glz-sh-2? --seam? --shade? --sunk-2?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's certificate page | sealParts, sealSVG, miniSeal, arcAngles and the ring arithmetic (r 44, circumference 276.46)
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's stylesheet | the .seal medallion, the crackle path and the quick-action arc
 * @preview   {"render": "viz.seal", "samples": ["kit/samples/viz.json#seal"]}
 * @samples   seal
 * @changed   Requires no theme: theme.glaze-depth is deleted, so every depth token takes its flat fallback on every theme, Glaze included.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const CIRC = 276.46; // 2 * PI * 44
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const LIFE = {
  ok: { word: 'Fine', short: 'fine', glyph: 'check', tone: 'success', motion: 'none' },
  soon: { word: 'Ends soon', short: 'ends soon', glyph: 'hourglass', tone: 'attention', motion: 'none' },
  urgent: { word: 'Urgent', short: 'urgent', glyph: 'hourglass', tone: 'danger', motion: 'none' },
  expired: { word: 'Expired', short: 'expired', glyph: 'cross', tone: 'danger', motion: 'none' },
  revoked: { word: 'Revoked', short: 'revoked', glyph: 'stop', tone: 'ended', motion: 'none' },
  ended: { word: 'Ended', short: 'ended', glyph: 'moon', tone: 'ended', motion: 'none' },
  replaced: { word: 'Replaced', short: 'replaced', glyph: 'reply', tone: 'ended', motion: 'none' },
  unknown: { word: 'End date unknown', short: 'end unknown', glyph: 'question', tone: 'neutral', motion: 'none' },
};
const STATES = Object.keys(LIFE);
const LIVE = { ok: 1, soon: 1, urgent: 1 };
const BIG = { expired: '0', revoked: '0', ended: '0', replaced: '–', unknown: '?' };
const ICONS = {
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.5l2-2.5"/><path d="M20 20v-5h-5"/>',
  pulse: '<polyline points="3 12 8 12 10.5 6 14 18 16.5 12 21 12"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  ban: '<circle cx="12" cy="12" r="8"/><path d="M6.3 6.3l11.4 11.4"/>',
  open: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5H5V6h5"/>',
  key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M20 12v2"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 16V5a1 1 0 0 1 1-1h9"/>',
};

function ensureVocab() {
  const V = Kit.vocab;
  if (V && V.get('life', 'ok') === undefined) V.define({ life: LIFE });
  return V;
}
function rowOf(state) { const V = ensureVocab(); const r = V && V.get('life', state); return r || { word: LIFE[state] ? LIFE[state].word : String(state), short: LIFE[state] ? LIFE[state].short : String(state), tone: 'neutral', glyph: 'dot' }; }

function stateOf(item, o) {
  o = o || {};
  if (item.state && (STATES.includes(item.state) || (Kit.vocab && Kit.vocab.get('life', item.state)))) return item.state;
  if (item.left == null || Number.isNaN(+item.left)) return 'unknown';
  if (item.left <= 0) return 'expired';
  if (item.left <= (o.urgentDays == null ? 14 : o.urgentDays)) return 'urgent';
  if (item.left <= (o.soonDays == null ? 60 : o.soonDays)) return 'soon';
  return 'ok';
}
function fracOf(item) {
  if (item.life != null) return clamp(+item.life, 0, 1);
  if (item.total) return clamp(item.left / item.total, 0, 1);
  return null;
}
function defaultUnit(left) {
  if (left < 1) return { big: String(Math.max(1, Math.round(left * 24))), unit: Math.max(1, Math.round(left * 24)) === 1 ? 'hour' : 'hours' };
  if (left >= 730) return { big: (left / 365).toFixed(1), unit: 'years' };
  const d = Math.round(left); return { big: String(d), unit: d === 1 ? 'day' : 'days' };
}
function parts(item, o) {
  o = o || {};
  const state = stateOf(item, o), row = rowOf(state);
  if (!LIVE[state]) return { state, frac: 0, big: BIG[state] || '·', unit: row.short, text: row.word, row, live: false };
  const u = (o.unitOf || defaultUnit)(item.left, state);
  return { state, frac: fracOf(item), big: u.big, unit: u.unit, text: u.big + ' ' + u.unit + ' left', row, live: true };
}
const text = (item, o) => parts(item, o).text;

/* the crackle: a network of short cracks from jittered points, ordered outward from a start point, so the same item always cracks the same way and more cracks show with age */
function hash(s) { let x = 7; s = String(s); for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const crackCache = new Map();
function cracks(seed) {
  if (crackCache.has(seed)) return crackCache.get(seed);
  const r = rng(hash(seed)), pts = [];
  for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) pts.push([14 + gx * 18 + (r() - .5) * 13, 14 + gy * 18 + (r() - .5) * 13]);
  const seen = new Set(), edges = [];
  pts.forEach((p, i) => {
    pts.map((q, j) => [Math.hypot(p[0] - q[0], p[1] - q[1]), j]).filter(x => x[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, 2).forEach(([, j]) => {
      const k = i < j ? i + '-' + j : j + '-' + i; if (seen.has(k)) return; seen.add(k); edges.push([pts[i][0], pts[i][1], pts[j][0], pts[j][1]]);
    });
  });
  const o = [10 + r() * 80, 10 + r() * 80];
  edges.sort((a, b) => Math.hypot((a[0] + a[2]) / 2 - o[0], (a[1] + a[3]) / 2 - o[1]) - Math.hypot((b[0] + b[2]) / 2 - o[0], (b[1] + b[3]) / 2 - o[1]));
  const f = v => v.toFixed(1), d = edges.map(e => 'M' + f(e[0]) + ' ' + f(e[1]) + 'L' + f(e[2]) + ' ' + f(e[3]));
  crackCache.set(seed, d); return d;
}

function ring(item, p, o) {
  const id = 'kit-sl-c' + (++uid);
  const s = sv('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  s.append(sv('circle', { class: 'kit-sl-track', cx: 50, cy: 50, r: 44 }));
  if (p.live && p.frac != null && p.frac > 0) s.append(sv('circle', { class: 'kit-sl-arc', cx: 50, cy: 50, r: 44, 'stroke-dasharray': (p.frac * CIRC).toFixed(1) + ' 277' }));
  if (o.crackle !== false) {
    const age = p.live ? (p.frac == null ? 0 : 1 - p.frac) : 1, all = cracks(item.id || item.label || 'x');
    const n = p.live ? Math.round(all.length * (0.1 + 0.9 * age)) : all.length;
    if (n > 0) {
      const cp = sv('clipPath', { id }); cp.append(sv('circle', { cx: 50, cy: 50, r: 38 })); s.append(cp);
      const g = sv('g', { class: 'kit-sl-crk', 'clip-path': 'url(#' + id + ')', opacity: Math.min(0.5, 0.04 + 0.5 * age).toFixed(2) });
      g.append(sv('path', { d: all.slice(0, n).join('') })); s.append(g);
    }
  }
  return s;
}

function make(item, opts) {
  const o = Object.assign({ size: 124, actions: null }, opts), p = parts(item, o);
  const acts = item.actions || o.actions || [];
  const wrap = el('div', 'kit-sl-wrap'); wrap.dataset.voTone = p.row.tone; wrap.dataset.state = p.state;
  wrap.style.setProperty('--kit-sl-size', clamp(o.size, 80, 180) + 'px');
  wrap.dataset.acts = String(Math.min(acts.length, 5));
  const name = (item.label ? item.label + ', ' : '') + p.text;
  const interactive = !!o.onOpen;
  const body = interactive ? el('button', 'kit-sl') : el('div', 'kit-sl');
  if (interactive) { body.type = 'button'; body.addEventListener('click', e => o.onOpen(item, e)); } else body.setAttribute('role', 'img');
  body.setAttribute('aria-label', name);
  const num = el('span', 'kit-sl-t'); num.append(el('span', 'kit-sl-d', p.big), el('span', 'kit-sl-u', p.unit));
  body.append(ring(item, p, o), num); wrap.append(body);
  if (item.label && !o.labelHidden) wrap.append(el('div', 'kit-sl-label', item.label));
  if (acts.length) {
    const arc = el('div', 'kit-sl-arc-box'); arc.setAttribute('role', 'group'); arc.setAttribute('aria-label', 'Actions' + (item.label ? ' for ' + item.label : ''));
    const list = acts.slice(0, 5), n = list.length;
    list.forEach((a, i) => {
      const b = el('button', 'kit-sl-q' + (a.danger ? ' kit-bad' : '')); b.type = 'button'; b.dataset.key = a.key;
      b.style.setProperty('--a', (270 + (i - (n - 1) / 2) * 29) + 'deg'); b.style.setProperty('--i', i);
      b.setAttribute('aria-label', a.label + (item.label ? ' ' + item.label : '')); b.title = a.label;
      b.append(icon(a.icon || 'open')); b.addEventListener('click', e => o.onAction && o.onAction(a.key, item, e));
      arc.append(b);
    });
    wrap.append(arc);
  }
  return wrap;
}
function icon(i) {
  if (i instanceof Node) return i;
  const s = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, 'kit-sl-ico'); s.innerHTML = ICONS[i] || i; return s;
}

function mini(item, opts) {
  const o = opts || {}, p = parts(item, o), r = 17, c = 2 * Math.PI * r;
  const box = el('span', 'kit-sl-mini'); box.dataset.voTone = p.row.tone; box.setAttribute('aria-hidden', 'true');
  const s = sv('svg', { viewBox: '0 0 40 40', focusable: 'false' });
  s.append(sv('circle', { class: 'kit-sl-track', cx: 20, cy: 20, r }));
  if (p.live && p.frac) s.append(sv('circle', { class: 'kit-sl-arc', cx: 20, cy: 20, r, 'stroke-dasharray': (p.frac * c).toFixed(1) + ' ' + c.toFixed(1) }));
  const short = p.live && p.unit === 'years' ? Math.round(+p.big) + 'y' : p.big;
  box.append(s, el('b', null, short)); return box;
}

Kit.seal = Object.freeze({ make, mini, parts, text, stateOf, states: STATES.slice(), icons: Object.assign({}, ICONS) });
ensureVocab();
})();
/* /part:page.script.kit.viz.seal */
