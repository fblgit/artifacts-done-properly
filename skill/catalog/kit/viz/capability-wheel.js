/* part:page.script.kit.viz.capability-wheel */
/* Kit visualization: capability wheel (Kit.capabilityWheel)    kit version 0.1.0
   What it is: a ring of beads round a core, one bead for each thing something may do. A lit bead (allowed) is solid, ticked and joined to the core by a gold seam; an unlit one is dashed,
   unticked and joined by a dotted line, so the difference is shape and not only colour. Labels sit by the bead (right, left, above or below, by angle). The drawing is an image whose name
   lists what is allowed, and the card form also prints that list. A button bar lights, among several wheels, every one that has a chosen ability.
   API:
     Kit.capabilityWheel.make(caps, allowed, opts) -> SVGElement
       caps     [{key, label, hint}]  3 to 12 abilities, in drawing order (the first at twelve o'clock, clockwise); hint is the longer sentence for the title
       allowed  an array or Set of keys that are lit
       opts     { name: "Server CA", glyph: "diamond" (a Kit.vocab glyph for the core, optional), small: false }
       The svg has role="img" and aria-label "<name> may: Sign CAs, Servers" (or "may do nothing"); data-lit lists the lit keys.
     Kit.capabilityWheel.bar(box, caps, opts) -> {get(), set(key|null), destroy()}   a toggle group of buttons (aria-pressed), one chosen at a time; choosing it again clears
       opts   { label: "Light up by ability", value, onChange(key|null), labels: {key: text} }
     Kit.capabilityWheel.mount(box, {caps, wheels, bar, cardColumns, name}) -> {set(key|null), destroy()}   cards of wheels with the bar above; choosing an ability dims the wheels that lack it
       wheels   [{id, name, sub, allowed, glyph}]
       Each card prints "May: …" under the wheel, and a dimmed card says "No <ability>" in words.
   Needs from the board:
     requires kit.tokens
     css     kit/viz/capability-wheel.css; custom properties --panel --sunk --ink --ink-2 --ink-3 --rule --accent --f-ui --f-display, optional --seam --edge-gold --rim --pool --glz-r-l --glz-sh-1
     globals Kit.vocab is used when it is present (the core's glyph); the wheel works without it
   db collections: none.
   Lifted from: a network-ops console's capability wheels (eight beads round a core, lit beads joined by a gold seam) and the ability buttons that light every key that has one.
   Changed: the count is any number from 3 to 12, the abilities and the lit set are config, and an unlit bead is a different shape instead of a paler one. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
const r1 = n => Math.round(n * 10) / 10;
let uid = 0;

function make(caps, allowed, opts) {
  const o = opts || {}, set = new Set(allowed || []), n = Math.max(3, Math.min(12, caps.length));
  const list = caps.slice(0, n), W = 420, H = 290, cx = W / 2, cy = H / 2, RX = 78, RY = 64, id = 'kit-cw' + (++uid);
  const lit = list.filter(c => set.has(c.key));
  const s = sv('svg', { class: 'kit-cw' + (o.small ? ' kit-cw-sm' : ''), viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': (o.name || 'This') + ' may ' + (lit.length ? ': ' + lit.map(c => c.label).join(', ') : 'do nothing') });
  s.dataset.lit = lit.map(c => c.key).join(' ');
  s.append(sv('title', null, null, (o.name || 'This') + (lit.length ? ' may: ' + lit.map(c => c.label).join(', ') : ' may do nothing')));
  list.forEach((c, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n, x = cx + Math.cos(a) * RX, y = cy + Math.sin(a) * RY, on = set.has(c.key);
    const g = sv('g', { class: 'kit-cw-p' + (on ? ' on' : ''), 'data-key': c.key });
    g.append(sv('path', { class: 'kit-cw-seam', d: 'M' + cx + ' ' + cy + 'Q' + r1((cx + x) / 2 + (y - cy) * .12) + ' ' + r1((cy + y) / 2 - (x - cx) * .12) + ' ' + r1(x) + ' ' + r1(y) }));
    g.append(sv('circle', { class: 'kit-cw-bead', cx: r1(x), cy: r1(y), r: 14 }));
    if (on) g.append(sv('path', { class: 'kit-cw-tick', d: 'M' + r1(x - 5.5) + ' ' + r1(y) + 'l3.8 3.8 6.5-7.6' }));
    const right = Math.cos(a) > .3, left = Math.cos(a) < -.3;
    const tx = x + (right ? 22 : left ? -22 : 0), ty = y + (right || left ? 4.5 : Math.sin(a) < 0 ? -22 : 31);
    const t = sv('text', { class: 'kit-cw-label', x: r1(tx), y: r1(ty), 'text-anchor': right ? 'start' : left ? 'end' : 'middle' }, null, c.label);
    if (c.hint) t.append(sv('title', null, null, c.hint));
    g.append(t); s.append(g);
  });
  s.append(sv('circle', { class: 'kit-cw-core', cx, cy, r: 27 }));
  if (o.glyph && Kit.vocab && Kit.vocab.glyphs.includes(o.glyph)) {
    const gl = Kit.vocab.glyph(o.glyph); gl.setAttribute('x', cx - 12); gl.setAttribute('y', cy - 12); gl.setAttribute('width', 24); gl.setAttribute('height', 24); gl.classList.add('kit-cw-ico'); s.append(gl);
  } else s.append(sv('circle', { class: 'kit-cw-dot', cx, cy, r: 4 }));
  return s;
}

function bar(box, caps, opts) {
  const o = opts || {}; let cur = o.value || null;
  box.replaceChildren(); box.classList.add('kit-cw-bar'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', o.label || 'Light up by ability');
  const btns = caps.map(c => {
    const b = el('button', 'kit-cw-b', (o.labels && o.labels[c.key]) || c.label); b.type = 'button'; b.dataset.key = c.key; b.setAttribute('aria-pressed', String(cur === c.key));
    if (c.hint) b.title = c.hint;
    b.addEventListener('click', () => set(cur === c.key ? null : c.key, true)); box.append(b); return b;
  });
  function set(k, fire) { cur = k; btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.key === k))); if (fire && o.onChange) o.onChange(k); }
  return { get: () => cur, set: k => set(k, false), destroy() { box.replaceChildren(); } };
}

function mount(box, cfg) {
  const caps = cfg.caps, wheels = cfg.wheels || [];
  box.replaceChildren(); const root = el('div', 'kit-cw-wrap'); box.append(root);
  const barBox = el('div'); if (cfg.bar !== false) root.append(barBox);
  const grid = el('div', 'kit-cw-grid'); root.append(grid);
  const cards = wheels.map(w => {
    const card = el('div', 'kit-cw-card'); card.dataset.id = w.id;
    card.append(el('h3', 'kit-cw-h', w.name)); if (w.sub) card.append(el('p', 'kit-cw-sub', w.sub));
    card.append(make(caps, w.allowed, { name: w.name, glyph: w.glyph, small: true }));
    const allowed = new Set(w.allowed || []), names = caps.filter(c => allowed.has(c.key)).map(c => c.label);
    card.append(el('p', 'kit-cw-may', 'May: ' + (names.length ? names.join(', ') : 'nothing')));
    const no = el('p', 'kit-cw-no'); no.hidden = true; card.append(no);
    grid.append(card); return { card, w, no, allowed };
  });
  function apply(k) {
    const cap = caps.find(c => c.key === k);
    cards.forEach(c => {
      const miss = !!k && !c.allowed.has(k);
      c.card.dataset.dim = miss ? 'true' : 'false'; c.card.dataset.on = k && !miss ? 'true' : 'false';
      c.no.hidden = !miss; c.no.textContent = miss ? 'No ' + (cap ? cap.label.toLowerCase() : k) : '';
    });
  }
  const b = cfg.bar === false ? null : bar(barBox, caps, { label: cfg.barLabel, onChange: apply });
  return { set(k) { if (b) b.set(k); apply(k); }, destroy() { box.replaceChildren(); } };
}

Kit.capabilityWheel = Object.freeze({ make, bar, mount });
})();
/* /part:page.script.kit.viz.capability-wheel */
