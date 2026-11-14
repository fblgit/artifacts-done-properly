/* part:page.script.kit.vocab */
/**
 * State vocabulary and marks
 * The foundation for anything that shows a state. A table maps {enum: {value: {word, short, glyph, tone, motion}}}; Kit.vocab.pill, chip, orb, tile, head and key draw from it, so the same state looks the same in every card, pill and lane. The eight tones (neutral, active, review, attention, info, danger, success, ended) map to theme tokens, and [data-vo-tone] sets --vo-c and --vo-soft on any element so a whole card can follow its state. A state is never colour alone: it has a word and a glyph, and a person-wait state has its own motion (a slowly turning hand). A value the table leaves null is silent and draws nothing; a value the table does not know draws a dashed unknown mark instead of hiding. Glyphs are the file's own (check, hourglass, cross, pulse, hand, moon, ring, dot, eye, pause, stop, info, question, reply, diamond, play); registerGlyph adds more. A generic built-in enum 'state' (queued, running, waiting, review, blocked, done, failed, paused, ended) works out of the box.
 *
 * API (small and stable):
 *   Kit.vocab.define(table, {replace})      merge a table of enums into the vocabulary (replace: true starts over); returns Kit.vocab
 *   Kit.vocab.get(enum, value) -> row | null | undefined     row {word, short, glyph, tone, motion, char}; null = silent; undefined = the table does not know it
 *   Kit.vocab.values(enum) -> [value]       the values of an enum in table order, silent ones included
 *   Kit.vocab.pill(enum, value, {short, glyph:true})   -> Element | null      a word on a tinted pill with its glyph
 *   Kit.vocab.chip(enum, value)             -> Element | null      the short word, small, for dense rows
 *   Kit.vocab.orb(enum, value, {size:"sm"|"md"|"lg", label})  -> Element | null   a glazed bead with the glyph; a label makes it an image for assistive tech
 *   Kit.vocab.tile(enum, value, {style:"box"|"text"})  -> Element | null   a hand-drawn checkbox frame (or a terminal character) over the short word
 *   Kit.vocab.head(enum, value, {count})    -> Element | null      a lane head: orb, word and a count
 *   Kit.vocab.key(box, {enum, values, mark:"pill"|"chip"|"tile"}) -> {destroy()}   a legend of the values (silent ones are left out and counted in the box's data-silent)
 *   Kit.vocab.glyph(name, {size}) -> SVGElement     one glyph; Kit.vocab.glyphs -> [name]; Kit.vocab.registerGlyph({name: "<svg path markup, 24 grid, stroke only>"})
 *   Kit.vocab.tones -> [tone];  Kit.vocab.on(fn) -> off   fn runs after define()
 *   Every drawing method takes {unknown:"flag"|"skip"} (default "flag"): flag draws a dashed mark that shows the raw value and says "unknown".
 * The tone cascade: every mark sets data-vo-tone; the css turns that into --vo-c (the colour), --vo-soft (a tint) on the element, so any element inside a [data-vo-tone] can
 * read them: border-left: 3px solid var(--vo-c). Put data-vo-tone on a card to tint a whole card by its state.
 * Built-in enum "state" (generic, replaceable): queued running waiting review blocked done failed paused ended quiet(silent).
 *
 * Optional custom properties: --info --wait (cobalt and peach in Glaze; other themes fall back to --accent and --warn), and the glaze depth tokens --hi --lo --glyph-drop --on-state.
 *
 * Also provides (not globals): the attribute [data-vo-tone], which sets the custom properties --vo-c and --vo-soft.
 *
 * @id        kit.vocab
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   One table gives every state its word, short word, glyph, tone and motion; pills, chips, orbs, checkbox tiles, lane heads and a key all read it, and a silent value draws nothing.
 * @tags      state, status, vocabulary, pill, chip, orb, glyph, tone, lane head, legend, checkbox, silent
 * @requires  kit.tokens
 * @files     kit/vocab.css, kit/samples/kit.json
 * @provides  Kit.vocab.define, Kit.vocab.get, Kit.vocab.pill, Kit.vocab.chip, Kit.vocab.orb, Kit.vocab.tile, Kit.vocab.head, Kit.vocab.key, Kit.vocab.glyph, Kit.vocab.registerGlyph, Kit.vocab.tones, Kit.vocab.motions, Kit.vocab.glyphs, Kit.vocab.values, Kit.vocab.enums, Kit.vocab.on
 * @config    Kit.vocab.define({enum: {value: {word, short, glyph, tone, motion}}}) | the state table; null for a silent value; tone is one of Kit.vocab.tones, glyph one of Kit.vocab.glyphs, motion none | breathe | turn | nudge
 * @config    Kit.vocab.pill(enum, value, {short, glyph}) / chip / orb(…, {size, label}) / tile(…, {style}) / head(…, {count}) | each returns an Element, or null for a silent value; {unknown: 'skip'} hides unknown values instead of flagging them
 * @config    Kit.vocab.key(box, {enum, values, mark}) | a legend of the values; silent values are left out and counted in data-silent
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --accent --ok --warn --danger --info? --wait? --f-ui --f-mono --hi? --lo? --glyph-drop? --on-state? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's state pill, source chip, tag and vocabulary table | the word, short word, icon and signal per enum value; a silent row draws nothing
 * @source    Catalog harvest, 2026-10-25 | an earlier board's blueprint and console skins | a hand-drawn checkbox frame with a mark, and terminal characters with short words
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's design system | state orbs with a glyph, the cascade of colour variables, a person-wait state with its own motion
 * @preview   {"render": "kit.vocab", "samples": ["kit/samples/kit.json#vocab"]}
 * @samples   vocab
 * @changed   Rebuilt as plain DOM over a table the page supplies; no enum, name or colour is built in, and the table is data so a theme can swap glyphs.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const SVGNS = 'http://www.w3.org/2000/svg';
const TONES = ['neutral', 'active', 'review', 'attention', 'info', 'danger', 'success', 'ended'];
const MOTIONS = ['none', 'breathe', 'turn', 'nudge'];
const GLYPHS = {
  check: '<polyline points="5 12.5 10 17.5 19 7"/>',
  hourglass: '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 5 8 5 8 9s-8 4-8 9"/><path d="M16 3c0 5-8 5-8 9s8 4 8 9" opacity=".55"/>',
  cross: '<path d="M6 6l5 5-2.5 2.5L12 18"/><path d="M18 6l-4.5 4.5M13 14l5 4"/>',
  pulse: '<polyline points="3 12 8 12 10.5 6 14 18 16.5 12 21 12"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10.5V7a1.5 1.5 0 0 1 3 0v6.5c0 4-2.6 7-6 7-2.4 0-3.8-1.2-5-3.2L4 13.5a1.5 1.5 0 0 1 2.4-1.7L8 14"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  ring: '<circle cx="12" cy="12" r="6.5"/>',
  dot: '<circle cx="12" cy="12" r="2.2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  info: '<path d="M12 11v6"/><path d="M12 7.2v.1"/>',
  question: '<path d="M9 9.2a3 3 0 1 1 4.4 2.6c-.9.6-1.4 1.1-1.4 2.2"/><path d="M12 17.4v.1"/>',
  reply: '<polyline points="10 6 4 12 10 18"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',
  diamond: '<path d="M12 4l7 8-7 8-7-8z"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
};
const CHARS = { check: '✓', cross: '✕', ring: '○', dot: '•', question: '?', reply: '»', diamond: '◆', play: '▶', pause: '‖', stop: '■', hourglass: '⧗', pulse: '≈', hand: '☝', moon: '☾', eye: '◎', info: 'i' };
const FRAME = '<path d="M4.2 4.6c5.1-.7 10.6-.9 15.7-.3.5 5.2.6 10.4.2 15.6-5.3.5-10.6.6-15.8.1-.5-5.1-.6-10.3-.1-15.4z"/>';

const BUILTIN = {
  state: {
    queued: { word: 'Queued', short: 'queued', glyph: 'ring', tone: 'neutral', motion: 'none' },
    running: { word: 'Running', short: 'run', glyph: 'pulse', tone: 'active', motion: 'breathe' },
    waiting: { word: 'Waiting for you', short: 'wait', glyph: 'hand', tone: 'attention', motion: 'turn' },
    review: { word: 'In review', short: 'review', glyph: 'eye', tone: 'review', motion: 'none' },
    blocked: { word: 'Blocked', short: 'blocked', glyph: 'stop', tone: 'danger', motion: 'none' },
    done: { word: 'Done', short: 'done', glyph: 'check', tone: 'success', motion: 'none' },
    failed: { word: 'Failed', short: 'failed', glyph: 'cross', tone: 'danger', motion: 'none' },
    paused: { word: 'Paused', short: 'paused', glyph: 'pause', tone: 'neutral', motion: 'none' },
    ended: { word: 'Ended', short: 'ended', glyph: 'moon', tone: 'ended', motion: 'none' },
    quiet: null,
  },
};
let table = {}; const watchers = [];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function normalise(row) {
  if (row == null || !row.word) return null;
  const tone = TONES.includes(row.tone) ? row.tone : 'neutral';
  const glyph = GLYPHS[row.glyph] ? row.glyph : 'dot';
  return { word: String(row.word), short: String(row.short || row.word), glyph, tone, motion: MOTIONS.includes(row.motion) ? row.motion : 'none', char: row.char || CHARS[glyph] || '•' };
}
function define(t, o) {
  if (o && o.replace) table = {};
  for (const [en, rows] of Object.entries(t || {})) {
    const cur = table[en] = table[en] || { order: [], rows: {} };
    for (const [v, r] of Object.entries(rows || {})) { if (!(v in cur.rows)) cur.order.push(v); cur.rows[v] = normalise(r); }
  }
  watchers.slice().forEach(f => { try { f(); } catch (_) {} });
  return Kit.vocab;
}
function get(en, v) { const e = table[en]; if (!e || !(v in e.rows)) return undefined; return e.rows[v]; }
function glyph(name, o) {
  o = o || {}; const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'kit-vo-g'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  if (o.size) { s.setAttribute('width', o.size); s.setAttribute('height', o.size); }
  s.innerHTML = GLYPHS[name] || GLYPHS.dot; return s;
}
// resolves a (enum, value) to {row} | null (silent, draw nothing) | {unknown}
function resolve(en, v, o) {
  const r = get(en, v);
  if (r === null) return null;
  if (r === undefined) return (o && o.unknown === 'skip') ? null : { unknown: true };
  return { row: r };
}
function unknownMark(cls, en, v) {
  const e = el('span', 'kit-vo ' + cls + ' kit-vo-unknown', ''); e.setAttribute('data-vo-tone', 'neutral'); e.title = 'Not in the vocabulary: ' + en + ' / ' + v;
  e.append(glyph('question'), el('span', 'kit-vo-w', String(v)), el('span', 'kit-vo-q', 'unknown')); return e;
}
function base(cls, r, en, v) {
  const e = el('span', 'kit-vo ' + cls); e.setAttribute('data-vo-tone', r.tone); e.setAttribute('data-vo-motion', r.motion); e.dataset.voEnum = en; e.dataset.voValue = v; return e;
}
function pill(en, v, o) {
  o = o || {}; const x = resolve(en, v, o); if (!x) return null; if (x.unknown) return unknownMark('kit-vo-pill', en, v);
  const e = base('kit-vo-pill', x.row, en, v);
  if (o.glyph !== false) e.append(glyph(x.row.glyph));
  e.append(el('span', 'kit-vo-w', o.short ? x.row.short : x.row.word)); return e;
}
function chip(en, v, o) {
  const x = resolve(en, v, o); if (!x) return null; if (x.unknown) return unknownMark('kit-vo-chip', en, v);
  const e = base('kit-vo-chip', x.row, en, v); e.append(glyph(x.row.glyph), el('span', 'kit-vo-w', x.row.short)); return e;
}
function orb(en, v, o) {
  o = o || {}; const x = resolve(en, v, o); if (!x) return null; if (x.unknown) return unknownMark('kit-vo-chip', en, v);
  const e = base('kit-vo-orb kit-vo-' + (o.size || 'md'), x.row, en, v); e.append(glyph(x.row.glyph));
  if (o.label) { e.setAttribute('role', 'img'); e.setAttribute('aria-label', o.label === true ? x.row.word : o.label); }
  return e;
}
function tile(en, v, o) {
  o = o || {}; const x = resolve(en, v, o); if (!x) return null; if (x.unknown) return unknownMark('kit-vo-chip', en, v);
  const e = base('kit-vo-tile', x.row, en, v);
  if ((o.style || 'box') === 'text') { const c = el('span', 'kit-vo-char', x.row.char); c.setAttribute('aria-hidden', 'true'); e.append(c); }
  else {
    const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'kit-vo-box'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.innerHTML = '<g class="kit-vo-fr">' + FRAME + '</g><g class="kit-vo-mk" transform="translate(4.8 4.8) scale(.6)">' + GLYPHS[x.row.glyph] + '</g>'; e.append(s);
  }
  e.append(el('span', 'kit-vo-w', x.row.short)); return e;
}
function head(en, v, o) {
  o = o || {}; const x = resolve(en, v, o); if (!x) return null; if (x.unknown) return unknownMark('kit-vo-pill', en, v);
  const e = base('kit-vo-head', x.row, en, v); const ob = orb(en, v, { size: 'sm' });
  e.append(ob, el('span', 'kit-vo-w', x.row.word)); if (o.count != null) e.append(el('b', 'kit-vo-n', String(o.count))); return e;
}
const MAKE = { pill, chip, tile };
function key(box, o) {
  o = o || {}; const en = o.enum; const mk = MAKE[o.mark] || pill;
  const draw = () => {
    box.textContent = ''; box.classList.add('kit-vo-key'); let silent = 0;
    for (const v of o.values || (table[en] ? table[en].order : [])) {
      const m = mk(en, v, { unknown: 'skip' }); if (!m) { silent++; continue; }
      const li = el('div', 'kit-vo-key-i'); li.append(m);
      const r = get(en, v); if (r && o.say !== false) li.append(el('span', 'kit-vo-key-t', r.word === r.short ? '' : r.word));
      box.append(li);
    }
    box.dataset.silent = String(silent);
  };
  draw(); watchers.push(draw);
  return { destroy() { const i = watchers.indexOf(draw); if (i >= 0) watchers.splice(i, 1); box.textContent = ''; } };
}

Kit.vocab = Object.freeze({
  tones: TONES.slice(), motions: MOTIONS.slice(),
  get glyphs() { return Object.keys(GLYPHS); },
  define, get, glyph, pill, chip, orb, tile, head, key,
  values: en => (table[en] ? table[en].order.slice() : []),
  enums: () => Object.keys(table),
  registerGlyph(m) { Object.assign(GLYPHS, m); },
  on(fn) { watchers.push(fn); return () => { const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); }; },
});
define(BUILTIN);
})();
/* /part:page.script.kit.vocab */
