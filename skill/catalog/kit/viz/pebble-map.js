/* part:page.script.kit.viz.pebble-map */
/**
 * Pebble map
 * Machines (or services, or sites) drawn as glazed pebbles on gold seams, laid out for you. A seam shows how its link is: up (beads of light flow along it), cut (dashed and dimmed, with a cross badge in the middle), connecting (a turning ring in the middle) or idle (a plain seam). A pebble shows its state as a ring, a badge glyph and a word, never colour alone. Three layouts, each with a wide and a tall drawing that the map picks from its own width: estate (a hub with its holders and the nodes in two chained rows), fan (a primary and the copies it feeds) and ring (peers on a circle). Hover or focus a seam and its words show on the map and in a caption line; every seam is an image with the same words as its name. Pebbles are links or buttons by config. Differs from viz.topology: positions are computed and the links have states.
 *
 * API:
 *   Kit.pebbleMap.mount(box, opts) -> {setLayout(name), update(patch), destroy()}
 *     opts   { layout: "estate", nodes, hub, holders, source, label, compact: "auto" | true | false, compactBelow: 720, flow: true, caption: true, enum: "node", linkEnum: "link", onPick(node), host }
 *              nodes    [{id, label, sub, state, glyph, href, link: {state, words}}]  state is a value of the enum (healthy, look, down, checking, waiting, standby, primary: defined here when the
 *                       board has not defined "node"); sub defaults to the state's word; glyph defaults to the state's glyph; href makes the pebble a link, onPick a button;
 *                       link.state is up | cut | connecting | idle (the "link" enum), link.words the sentence for the seam ("depot: link up, 12 ms")
 *              hub      {id, label, sub, state, glyph}  estate: the pebble the seams start from;  fan: not used (use source)
 *              holders  [{id, label, sub, state, glyph}]  estate: up to two pebbles joined to the hub
 *              source   {id, label, sub, state, glyph}  fan: the pebble the copies start from;  ring: not used
 *     update(patch) redraws with the changed options. "compact: auto" switches to the tall drawing under compactBelow px of width, and back.
 *   Kit.pebbleMap.states -> {node: [value], link: [value]}   the values this file defines in Kit.vocab
 *   Kit.pebbleMap.mid(p0, p1, p2, p3) -> [x, y]   the point half way along a cubic bezier, (P0 + 3 P1 + 3 P2 + P3) / 8, where a seam's badge and words sit
 *
 * Also load kit/vocab.css and kit/glaze-surfaces.css.
 *
 * @id        viz.pebble-map
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Machines as glazed pebbles joined by gold seams; a seam flows while its link is up, breaks with a badge when it is down and shows a ring while connecting; a wide layout and a phone layout.
 * @tags      map, network, nodes, links, pebbles, estate, replication, ring, status
 * @requires  kit.vocab, kit.glaze-surfaces, theme.glaze-depth
 * @files     kit/viz/pebble-map.css, kit/samples/viz.json
 * @provides  Kit.pebbleMap.mount, Kit.pebbleMap.mid, Kit.pebbleMap.states
 * @config    Kit.pebbleMap.mount(box, {layout, nodes, hub, holders, source, compact, compactBelow, flow, caption, onPick}) | nodes [{id, label, sub, state, glyph, href, link: {state, words}}]; layout estate | fan | ring; the seam that ends at a node carries that node's link
 * @config    states | values of the Kit.vocab enums 'node' (healthy, look, down, checking, waiting, standby, primary) and 'link' (up, cut, connecting, idle); defined here unless the board defines its own
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --ink-3 --seam? --seam-<n>? --pebble-hi? --rim? --pool? --on-state? --danger --warn --glz-r-l? --hi? --wait?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's overview page | the estate map: pebbles, the wide and tall layouts, the seam that carries each node's tunnel
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's services page | the primary and standby pebbles and the ring of peers
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's stylesheets | the link, halo, ring and badge, the flowing beads, the cut seam and the connecting ring
 * @preview   {"render": "viz.pebble-map", "samples": ["kit/samples/viz.json#pebble-map"]}
 * @changed   Positions are computed from the node count; the node and link states are vocab tables; the words of every seam are also a caption line.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const r1 = n => Math.round(n * 10) / 10;

const NODE = {
  healthy: { word: 'Healthy', short: 'healthy', glyph: 'check', tone: 'success', motion: 'none' },
  look: { word: 'Needs a look', short: 'look', glyph: 'eye', tone: 'attention', motion: 'none' },
  down: { word: 'Does not answer', short: 'down', glyph: 'cross', tone: 'danger', motion: 'none' },
  checking: { word: 'Checking', short: 'checking', glyph: 'ring', tone: 'neutral', motion: 'none' },
  waiting: { word: 'Waiting for you', short: 'waiting', glyph: 'hand', tone: 'attention', motion: 'turn' },
  standby: { word: 'Standby', short: 'standby', glyph: 'pause', tone: 'neutral', motion: 'none' },
  primary: { word: 'Primary', short: 'primary', glyph: 'diamond', tone: 'active', motion: 'none' },
};
const LINK = {
  up: { word: 'Link up', short: 'up', glyph: 'pulse', tone: 'success', motion: 'none' },
  cut: { word: 'Link down', short: 'down', glyph: 'cross', tone: 'danger', motion: 'none' },
  connecting: { word: 'Connecting', short: 'connecting', glyph: 'ring', tone: 'attention', motion: 'none' },
  idle: { word: 'No link in use', short: 'idle', glyph: 'dot', tone: 'neutral', motion: 'none' },
};
function ensure() { const V = Kit.vocab; if (!V) return; if (V.get('node', 'healthy') === undefined) V.define({ node: NODE }); if (V.get('link', 'up') === undefined) V.define({ link: LINK }); }
const rowOf = (en, v) => { const V = Kit.vocab; return V ? V.get(en, v) : null; };
const mid = (a, b, c, d) => [(a[0] + 3 * b[0] + 3 * c[0] + d[0]) / 8, (a[1] + 3 * b[1] + 3 * c[1] + d[1]) / 8];
const cub = c => 'M' + r1(c[0][0]) + ' ' + r1(c[0][1]) + ' C ' + r1(c[1][0]) + ' ' + r1(c[1][1]) + ', ' + r1(c[2][0]) + ' ' + r1(c[2][1]) + ', ' + r1(c[3][0]) + ' ' + r1(c[3][1]);
const DEF = { layout: 'estate', nodes: [], holders: [], hub: null, source: null, label: 'Machines and the links between them', compact: 'auto', compactBelow: 720, flow: true, caption: true, enum: 'node', linkEnum: 'link' };

/* ---- the models: where each pebble and each seam goes */
function modelEstate(o, tall) {
  const n = o.nodes.length, R = 36, HR = 40, KR = 26, pebbles = [], seams = [], idx = new Map();
  let W, H, hub, keys, rows;
  if (!tall) {
    const top = Math.ceil(n / 2), bot = n - top, x0 = 420, x1 = 930, step = top > 1 ? (x1 - x0) / (top - 1 + (bot === top ? .5 : 0)) : 0;
    rows = [[], []]; for (let i = 0; i < top; i++) rows[0].push({ i, x: Math.round(x0 + i * step), y: 130, place: 'above' }); for (let i = 0; i < bot; i++) rows[1].push({ i: top + i, x: Math.round(x0 + (i + .5) * step), y: 330, place: 'below' });
    W = 1000; H = 450; hub = { x: 210, y: 230 }; keys = [{ x: 70, y: 110 }, { x: 70, y: 350 }];
  } else {
    const rn = Math.ceil(n / 2); rows = [[], []];
    for (let i = 0; i < n; i++) rows[i % 2].push({ i, x: i % 2 ? 290 : 110, y: 250 + Math.floor(i / 2) * 160, place: 'below' });
    W = 400; H = 250 + (rn - 1) * 160 + 110; hub = { x: 200, y: 90 }; keys = [{ x: 56, y: 90 }, { x: 344, y: 90 }];
  }
  if (o.hub) pebbles.push(Object.assign({ node: o.hub, r: HR, place: 'below', role: 'hub' }, hub));
  (o.holders || []).slice(0, 2).forEach((h, i) => {
    const k = keys[i]; pebbles.push({ node: h, r: KR, place: 'below', role: 'holder', x: k.x, y: k.y });
    const d = !tall ? [[k.x + KR, k.y], [k.x + 80, k.y], [hub.x - 60, hub.y], [hub.x - HR, hub.y]] : [[k.x + (i ? -KR : KR), k.y], [k.x + (i ? -KR : KR) * 2, k.y], [hub.x + (i ? HR : -HR) * 2, hub.y], [hub.x + (i ? HR : -HR), hub.y]];
    seams.push({ d, link: { state: 'idle' }, label: h.label + ' to ' + (o.hub ? o.hub.label : 'the hub'), plain: true });
  });
  rows.forEach(row => {
    let prev = null;
    row.forEach(p => {
      const node = o.nodes[p.i]; pebbles.push({ node, r: R, place: p.place, x: p.x, y: p.y, role: 'node' });
      let c;
      if (!prev) c = !tall ? [[hub.x + HR, hub.y], [hub.x + 120, hub.y], [p.x - 130, p.y], [p.x - R, p.y]] : [[hub.x, hub.y + HR], [hub.x, hub.y + 90], [p.x, p.y - 110], [p.x, p.y - R]];
      else if (!tall) c = [[prev.x + R, prev.y], [prev.x + 70, prev.y], [p.x - 70, p.y], [p.x - R, p.y]];
      else { const out = p.x < 200 ? -1 : 1, ox = p.x + out * 70; c = [[prev.x + out * R * .7, prev.y + R * .7], [ox, prev.y + 60], [ox, p.y - 60], [p.x + out * R * .7, p.y - R * .7]]; }
      seams.push({ d: c, link: node.link || { state: 'idle' }, label: node.label, node }); prev = p; void idx;
    });
  });
  return { W, H, pebbles, seams };
}
function modelFan(o, tall) {
  const n = o.nodes.length, pebbles = [], seams = [], SR = 40, R = 34; let W, H;
  if (!tall) {
    const gap = 124; W = 1000; H = Math.max(300, n * gap + 40); const sx = 170, sy = H / 2, tx = 660;
    pebbles.push({ node: o.source, r: SR, place: 'below', x: sx, y: sy, role: 'hub' });
    o.nodes.forEach((nd, i) => {
      const ty = H / 2 + (i - (n - 1) / 2) * gap; pebbles.push({ node: nd, r: R, place: 'right', x: tx, y: ty, role: 'node' });
      seams.push({ d: [[sx + SR, sy], [sx + 200, sy], [tx - 200, ty], [tx - R, ty]], link: nd.link || { state: 'idle' }, label: nd.label, node: nd });
    });
  } else {
    W = 400; const gap = n > 1 ? Math.min(150, (W - 100) / (n - 1)) : 0, sx = W / 2, sy = 90, ty = 300; H = 400;
    pebbles.push({ node: o.source, r: SR, place: 'above', x: sx, y: sy, role: 'hub' });
    o.nodes.forEach((nd, i) => {
      const tx = W / 2 + (i - (n - 1) / 2) * gap; pebbles.push({ node: nd, r: R, place: 'below', x: tx, y: ty, role: 'node' });
      seams.push({ d: [[sx, sy + SR], [sx, sy + 110], [tx, ty - 120], [tx, ty - R]], link: nd.link || { state: 'idle' }, label: nd.label, node: nd });
    });
  }
  return { W, H, pebbles, seams };
}
function modelRing(o, tall) {
  const n = o.nodes.length, pebbles = [], seams = [], R = 34; const W = tall ? 400 : 640, H = tall ? 440 : 500, cx = W / 2, cy = H / 2 + 6, RR = tall ? 112 : 170;
  const pos = o.nodes.map((nd, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return { nd, a, x: cx + Math.cos(a) * RR, y: cy + Math.sin(a) * RR }; });
  pos.forEach((p, i) => {
    const s = Math.sin(p.a), c = Math.cos(p.a), place = s < -.5 ? 'above' : s > .5 ? 'below' : c > 0 ? 'right' : 'left';
    pebbles.push({ node: p.nd, r: R, place, x: p.x, y: p.y, role: 'node' });
    if (n > 1) {
      const q = pos[(i + 1) % n], to = (i + 1) % n, m = [(p.x + q.x) / 2, (p.y + q.y) / 2], C = [cx + (m[0] - cx) * 1.3, cy + (m[1] - cy) * 1.3];
      const ang = Math.atan2(q.y - p.y, q.x - p.x), sx = p.x + Math.cos(ang) * R * .9, sy = p.y + Math.sin(ang) * R * .9, ex = q.x - Math.cos(ang) * R * .9, ey = q.y - Math.sin(ang) * R * .9;
      const c1 = [sx + (C[0] - sx) * 2 / 3, sy + (C[1] - sy) * 2 / 3], c2 = [ex + (C[0] - ex) * 2 / 3, ey + (C[1] - ey) * 2 / 3];
      const lk = o.nodes[to].link || { state: 'idle' };
      if (n > 2 || i === 0) seams.push({ d: [[sx, sy], c1, c2, [ex, ey]], link: lk, label: o.nodes[to].label, node: o.nodes[to] });
    }
  });
  return { W, H, pebbles, seams };
}
const MODELS = { estate: modelEstate, fan: modelFan, ring: modelRing };

function mount(box, opts) {
  ensure();
  let o = Object.assign({}, DEF, opts), alive = true, ro = null, lastTall = null, gid = '';
  const root = el('div', 'kit-pm'), fig = el('div', 'kit-pm-fig'), cap = el('div', 'kit-pm-cap'); cap.setAttribute('aria-live', 'polite');
  root.append(fig); if (o.caption) root.append(cap); box.replaceChildren(root);
  const isTall = () => o.compact === true || (o.compact === 'auto' && box.clientWidth > 0 && box.clientWidth < o.compactBelow);
  const hint = () => { cap.replaceChildren(el('span', 'kit-pm-hint', 'Hover or focus a seam to read how its link is.')); };
  const TONE = { up: 'kit-is-ok', cut: 'kit-is-bad', connecting: 'kit-is-wait', idle: 'kit-is-idle' };
  const say = (words, st) => { const c = el('span', 'kit-chip ' + (TONE[st] || 'kit-is-idle')); c.append(el('i', 'kit-orb'), document.createTextNode(words)); cap.replaceChildren(c); };

  function pebble(p) {
    const nd = p.node, row = rowOf(o.enum, nd.state), tone = row ? row.tone : 'neutral', word = row ? row.word : (nd.state ? String(nd.state) : '');
    const sub = nd.sub != null ? nd.sub : word, r = p.r, V = Kit.vocab;
    const g = sv('g', { class: 'kit-pm-n kit-pm-' + p.role, 'data-vo-tone': tone, 'data-vo-motion': row ? row.motion : 'none' });
    const body = sv('circle', { class: 'kit-pm-body', cx: p.x, cy: p.y, r }); body.style.fill = 'url(#' + gid + '-p) var(--panel)';
    g.append(sv('circle', { class: 'kit-pm-halo', cx: p.x, cy: p.y, r: r + 16 }), body, sv('circle', { class: 'kit-pm-ring', cx: p.x, cy: p.y, r }));
    const gname = nd.glyph || (row && row.glyph);
    if (V && gname && V.glyphs.includes(gname)) { const s = r * .66, gl = V.glyph(gname); gl.setAttribute('x', r1(p.x - s / 2)); gl.setAttribute('y', r1(p.y - s / 2)); gl.setAttribute('width', r1(s)); gl.setAttribute('height', r1(s)); gl.classList.add('kit-pm-gl'); g.append(gl); }
    let lx = p.x, ly, anchor = 'middle';
    if (p.place === 'above') ly = p.y - r - 34; else if (p.place === 'below') ly = p.y + r + 40;
    else { lx = p.x + (p.place === 'right' ? r + 16 : -(r + 16)); ly = p.y - 1; anchor = p.place === 'right' ? 'start' : 'end'; }
    g.append(sv('text', { class: 'kit-pm-t', x: r1(lx), y: r1(ly), 'text-anchor': anchor }, null, nd.label));
    if (sub) g.append(sv('text', { class: 'kit-pm-t kit-pm-sub', x: r1(lx), y: r1(ly + 18), 'text-anchor': anchor }, null, sub));
    if (row && V && nd.badge !== false) {
      const b = sv('g', { class: 'kit-pm-badge', transform: 'translate(' + Math.round(p.x + r * .72) + ' ' + Math.round(p.y - r * .72) + ')' }); b.append(sv('circle', { r: 11 }));
      const gl = V.glyph(row.glyph); gl.setAttribute('x', -6.5); gl.setAttribute('y', -6.5); gl.setAttribute('width', 13); gl.setAttribute('height', 13); b.append(gl); g.append(b);
    }
    const label = nd.label + (sub ? ': ' + sub : '');
    if (nd.href) { const a = sv('a', { href: nd.href, class: 'kit-pm-act' }); a.append(sv('title', null, null, label), g); a.setAttribute('aria-label', label); return a; }
    if (o.onPick) { const b = sv('g', { class: 'kit-pm-act', tabindex: 0, role: 'button', 'aria-label': label }); b.append(sv('title', null, null, label), g);
      b.addEventListener('click', () => o.onPick(nd)); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onPick(nd); } }); return b; }
    const i = sv('g', { class: 'kit-pm-act kit-pm-still', role: 'img', 'aria-label': label }); i.append(sv('title', null, null, label), g); return i;
  }
  function seam(s, id, labels) {
    const st = (s.link && s.link.state) || 'idle', lrow = rowOf(o.linkEnum, st), words = (s.link && s.link.words) || (s.label + ': ' + (lrow ? lrow.word.toLowerCase() : st));
    const d = cub(s.d), m = mid(s.d[0], s.d[1], s.d[2], s.d[3]);
    const g = sv('g', { class: 'kit-pm-seam is-' + st, 'data-vo-tone': lrow ? lrow.tone : 'neutral', 'data-state': st });
    if (!s.plain) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', words); g.append(sv('title', null, null, words)); } else g.setAttribute('aria-hidden', 'true');
    g.append(sv('path', { class: 'kit-pm-hit', d }), sv('path', { class: 'kit-pm-link', d, stroke: 'url(#' + id + ')' }));
    if (st === 'up' && o.flow && !s.plain) g.append(sv('path', { class: 'kit-pm-beads', d }));
    if (st === 'cut') { const b = sv('g', { class: 'kit-pm-cutb', transform: 'translate(' + r1(m[0]) + ' ' + r1(m[1]) + ')' }); b.append(sv('circle', { r: 11 })); const V = Kit.vocab; if (V) { const gl = V.glyph('cross'); gl.setAttribute('x', -6); gl.setAttribute('y', -6); gl.setAttribute('width', 12); gl.setAttribute('height', 12); b.append(gl); } g.append(b); }
    if (st === 'connecting') g.append(sv('circle', { class: 'kit-pm-conn', cx: r1(m[0]), cy: r1(m[1]), r: 8 }));
    if (!s.plain) {
      const t = sv('text', { class: 'kit-pm-slab', x: r1(m[0]), y: r1(m[1] - 16), 'text-anchor': 'middle' }, null, words); labels.append(t);
      const on = v => () => { t.classList.toggle('on', v); if (o.caption) { if (v) say(words, st); else hint(); } };
      g.addEventListener('pointerenter', on(true)); g.addEventListener('pointerleave', on(false)); g.addEventListener('focus', on(true)); g.addEventListener('blur', on(false));
    }
    return g;
  }
  function draw() {
    if (!o.nodes.length) { fig.replaceChildren(el('p', 'kit-pm-empty', 'No machines to draw yet.')); return; }
    const tall = isTall(), lay = MODELS[o.layout] || MODELS.estate, M = lay(o, tall), id = gid = 'kit-pm' + (++uid); lastTall = tall;
    const svg = sv('svg', { class: 'kit-pm-svg' + (tall ? ' kit-pm-tall' : ' kit-pm-wide'), viewBox: '0 0 ' + M.W + ' ' + M.H, role: 'group', 'aria-label': o.label, focusable: 'false' });
    const stops = [0, 1, 2, 3, 4].map(i => '<stop offset="' + (i * 25) + '%" style="stop-color:var(--seam-' + i + ',var(--seam,var(--accent)))"/>').join('');
    svg.innerHTML = '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + M.W + '" y2="' + M.H + '">' + stops + '</linearGradient>'
      + '<radialGradient id="' + id + '-p" cx="34%" cy="26%" r="80%"><stop offset="0%" style="stop-color:var(--pebble-hi,var(--panel))"/><stop offset="55%" style="stop-color:var(--panel)"/><stop offset="100%" style="stop-color:var(--sunk)"/></radialGradient></defs>';
    const links = sv('g'), pebs = sv('g'), labels = sv('g', { class: 'kit-pm-labels', 'aria-hidden': 'true' });
    M.seams.forEach(s => links.append(seam(s, id, labels))); M.pebbles.forEach(p => pebs.append(pebble(p)));
    svg.append(links, pebs, labels); fig.replaceChildren(svg); if (o.caption) hint();
  }
  draw();
  if (o.compact === 'auto' && window.ResizeObserver) { ro = new ResizeObserver(() => { if (alive && isTall() !== lastTall) draw(); }); ro.observe(box); }
  return {
    setLayout(n) { if (alive) { o.layout = n; draw(); } },
    update(patch) { if (alive) { o = Object.assign(o, patch); draw(); } },
    destroy() { alive = false; if (ro) ro.disconnect(); box.replaceChildren(); },
  };
}

Kit.pebbleMap = Object.freeze({ mount, mid, states: { node: Object.keys(NODE), link: Object.keys(LINK) } });
})();
/* /part:page.script.kit.viz.pebble-map */
