/* part:page.script.kit.viz.tree */
/**
 * Lineage tree
 * The Journey Whiteboard's tree view as a component. Root kinds open their own bands; nodes without a parent gather in a last band. Select a node and every ancestor and descendant lights up while the rest dims. Branches fold with a count of what they hide; the view zooms and pans. Marks paint a proposal onto it: new, change, loss, good. layoutTree and lineage are exported as pure functions.
 *
 * Config:
 * Tree({nodes, kinds, statuses, rank, rootKinds, selected, onPick, marks, words, legend, bar, banner, height, zoom})
 *   nodes     [{id, label, kind, status, code, chips: [text], bucket, parents: [id], order, shape: "card" | "pill", state: "chosen" | "closed" | "open"}]
 *             parents[0] is the preferred parent; order sorts siblings and decides who claims a node first (creation time works)
 *   kinds     {kind: {label, tone}}   statuses {status: tone}   rank {kind: n}: sibling order by kind (pills first, unknown kinds 5)
 *   rootKinds kinds whose parentless nodes open their own band (others go to the last band, titled words.loose)
 *   selected / onPick(id)   controlled selection; without onPick the tree keeps its own
 *   marks     {id: "new" | "change" | "loss" | "good"}
 *   legend    [[style, text]] with style solid | dash | new | change | loss
 *   bar, banner  optional vnodes drawn in the toolbar (a Replay scrubber) and above the tree (a PreviewBanner)
 *   height    css height of the scroll box (default 460px)
 * layoutTree(nodes, {rank, rootKinds, collapsed}) and lineage(layout, id) are the pure parts, usable without the component.
 *
 * The board maps its own records to nodes (the Journey Whiteboard: problems, solves, about, from, paths, page sources).
 * Tone colours: --c-<pen> for each pen tone used.
 *
 * @id        viz.tree
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Records as a left-to-right tree: each drawn once under its first parent, other parents as dashed edges, the selected node's whole lineage lit.
 * @tags      tree, lineage, graph, hierarchy, outline, journey, dag, diagram
 * @requires  viz.core
 * @provides  Kit.viz.Tree, Kit.viz.layoutTree, Kit.viz.lineage
 * @config    nodes | [{id, label, kind, status, code, chips, bucket, parents: [id], order, shape: card | pill, state}]
 * @config    kinds / statuses | {kind: {label, tone}} / {status: tone}
 * @config    rank | {kind: n}: sibling order
 * @config    rootKinds | kinds whose roots open a band
 * @config    selected, onPick | controlled selection (optional)
 * @config    marks | {id: new | change | loss | good}
 * @config    bar, banner | vnodes for the toolbar and above the tree (a Replay, a PreviewBanner)
 * @config    legend, words, height | [[style, text]], {loose, empty}, css height
 * @globals   htm-preact
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit;
const { html, useState, useRef, useEffect } = window.htmPreact;
const { clip, cx, tone, kindOf, statusTone } = Kit.viz.util;
const COLW = 268, ROWH = 74, PILLH = 52, W = 236, PAD = 20;

function layoutTree(list, { rank = {}, rootKinds = [], collapsed = new Set() } = {}) {
  const nodes = {}, kids = {}, parents = {}, cross = [], primary = {};
  for (const n of list || []) { nodes[n.id] = n; kids[n.id] = []; }
  for (const n of list || []) parents[n.id] = (n.parents || []).filter(p => p !== n.id && nodes[p]);
  const reaches = (from, target) => { const seen = new Set(); let x = from; while (x && !seen.has(x)) { if (x === target) return true; seen.add(x); x = primary[x]; } return false; };
  const order = Object.keys(nodes).sort((a, b) => (nodes[a].order || 0) - (nodes[b].order || 0));
  for (const id of order) {
    const ps = parents[id];
    const first = ps.find(p => !reaches(p, id));
    if (first) { primary[id] = first; kids[first].push(id); }
    for (const p of ps) if (p !== first) cross.push({ from: p, to: id });
  }
  const r = n => n.shape === 'pill' ? -1 : (rank[n.kind] != null ? rank[n.kind] : 5);
  const sortKids = l => l.sort((a, b) => { const na = nodes[a], nb = nodes[b]; if (na.shape === 'pill' && nb.shape === 'pill') return 0; return r(na) - r(nb) || (na.order || 0) - (nb.order || 0); });
  for (const k in kids) sortKids(kids[k]);
  const roots = sortKids(Object.keys(nodes).filter(id => !primary[id]));
  const heads = roots.filter(id => rootKinds.includes(nodes[id].kind));
  const loose = roots.filter(id => !heads.includes(id));
  let y = 0; const pos = {}, seq = [];
  const place = (id, depth) => {
    const n = nodes[id], h = n.shape === 'pill' ? PILLH : ROWH;
    seq.push(id);
    const ch = collapsed.has(id) ? [] : kids[id];
    if (!ch.length) { pos[id] = { x: depth * COLW, y, h }; y += h; return pos[id]; }
    const ps = ch.map(c => place(c, depth + 1));
    const a = ps[0], z = ps[ps.length - 1];
    pos[id] = { x: depth * COLW, y: (a.y + a.h / 2 + z.y + z.h / 2) / 2 - h / 2, h };
    return { x: pos[id].x, y: Math.min(pos[id].y, a.y), h: Math.max(z.y + z.h, pos[id].y + h) - Math.min(pos[id].y, a.y) };
  };
  const groups = [];
  for (const id of heads) { const y0 = y; place(id, 0); y += 14; groups.push({ id, y0, y1: y }); }
  if (loose.length) { y += 26; const y0 = y; for (const id of loose) place(id, 0); groups.push({ id: '', y0, y1: y, loose: true }); }
  const descendants = id => { const out = new Set(); const walk = x => { for (const c of kids[x] || []) if (!out.has(c)) { out.add(c); walk(c); } }; walk(id); return out; };
  const maxX = Math.max(0, ...Object.values(pos).map(p => p.x));
  return { nodes, kids, parents, primary, cross, pos, seq, groups, descendants, width: maxX + COLW, height: y + 20 };
}

function lineage(t, id) {
  if (!id || !t.nodes[id]) return null;
  const s = new Set([id]);
  const up = x => { for (const p of t.parents[x] || []) if (!s.has(p)) { s.add(p); up(p); } };
  up(id);
  const below = {};
  for (const [c, ps] of Object.entries(t.parents)) for (const p of ps) (below[p] = below[p] || []).push(c);
  const down = x => { for (const c of below[x] || []) if (!s.has(c)) { s.add(c); down(c); } };
  down(id);
  return s;
}

const MARK = { new: 'm-new', change: 'm-chg', loss: 'm-neg', good: 'm-good' };
function Node({ n, kinds, statuses, sel, dim, mark, onPick }) {
  if (n.shape === 'pill') return html`<button type="button" class=${cx('kv-tn', 'pill', n.state, dim && 'dim', sel && 'sel', MARK[mark])} onClick=${() => onPick(n.id)}
      aria-pressed=${sel} aria-label=${n.label + (n.state === 'chosen' ? ', chosen' : n.state === 'closed' ? ', not taken' : ', open')}>
    <span class="kv-pl" aria-hidden="true">${n.state === 'chosen' ? '✓' : n.state === 'closed' ? '·' : '◇'}</span><span class="kv-pt">${clip(n.label, 70)}</span></button>`;
  const k = kindOf(kinds, n.kind);
  const many = (n.parents || []).length > 1 && n.kind !== 'page';
  return html`<button type="button" class=${cx('kv-tn', tone(k.tone), 'st-' + n.status, dim && 'dim', sel && 'sel', MARK[mark])} onClick=${() => onPick(n.id)} aria-pressed=${sel}>
    <span class="kv-tm">
      <span class=${cx('kv-chip', tone(k.tone))}>${mark === 'new' ? '+ ' : n.code ? html`<b>${n.code}</b>` : ''}${k.label}</span>
      ${n.status ? html`<span class=${cx('kv-chip', tone(statusTone(statuses, n.status)))}>${n.status}</span>` : ''}
      ${n.bucket ? html`<span class="kv-chip">${n.bucket}</span>` : ''}
      ${(n.chips || []).filter(Boolean).map(c => html`<span class="kv-chip">${c}</span>`)}
      ${many ? html`<span class="kv-chip kv-t-ok" title=${'hangs under ' + n.parents.length}>×${n.parents.length}</span>` : ''}
    </span>
    <span class="kv-tt">${clip(n.label || 'Untitled', 90)}</span>
  </button>`;
}

function Tree({ nodes, kinds, statuses, rank, rootKinds, selected, onPick, marks, words = {}, legend, bar, banner, height = '460px', zoom = 1 }) {
  const [own, setOwn] = useState(null);
  const [folded, setFolded] = useState(() => new Set());
  const [k, setK] = useState(zoom);
  const wrap = useRef(null);
  const sel = onPick ? selected : own;
  const pick = id => (onPick ? onPick(id) : setOwn(own === id ? null : id));
  const t = layoutTree(nodes, { rank, rootKinds, collapsed: folded });
  const lin = lineage(t, sel && t.nodes[sel] ? sel : null);
  const M = marks || {};
  const fold = id => { const n = new Set(folded); n.has(id) ? n.delete(id) : n.add(id); setFolded(n); };
  const z = v => setK(Math.max(.45, Math.min(1.3, Math.round(v * 100) / 100)));
  useEffect(() => {
    if (!sel || !wrap.current || !t.pos[sel]) return;
    const el = wrap.current, p = t.pos[sel], x = (p.x + PAD) * k, y = (p.y + PAD) * k;
    if (x < el.scrollLeft || x + W * k > el.scrollLeft + el.clientWidth || y < el.scrollTop || y + p.h * k > el.scrollTop + el.clientHeight)
      el.scrollTo({ left: Math.max(0, x - 40), top: Math.max(0, y - el.clientHeight / 3), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [sel]);
  const panStart = e => {
    if (e.pointerType !== 'mouse' || e.button > 0 || e.target.closest('button, input, select, a')) return;
    const el = wrap.current; if (!el) return;
    const x0 = e.clientX, y0 = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
    const mv = ev => { el.scrollLeft = sl - (ev.clientX - x0); el.scrollTop = st - (ev.clientY - y0); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); el.classList.remove('panning'); };
    el.classList.add('panning'); addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  const ey = id => t.pos[id].y + t.pos[id].h / 2 - 5;
  const curve = (a, b) => { const x1 = t.pos[a].x + W, y1 = ey(a), x2 = t.pos[b].x, y2 = ey(b), mx = (x1 + x2) / 2; return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`; };
  const crossCurve = (a, b) => { const x1 = t.pos[a].x + W, y1 = ey(a), x2 = t.pos[b].x, y2 = ey(b), dx = Math.max(60, Math.abs(x2 - x1) / 2); return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`; };
  const on = (a, b) => lin ? (lin.has(a) && lin.has(b) ? ' on' : ' off') : '';
  const shown = id => !!t.pos[id];
  if (!(nodes || []).length) return html`<div class="kv-tree"><div class="kv-empty">${words.empty || 'Nothing to draw yet.'}</div></div>`;
  return html`<div class="kv-tree">
    <div class="kv-tree-bar">
      ${bar || ''}
      <span class="kv-spacer"></span>
      <span class="kv-zoom" role="group" aria-label="Zoom">
        <button type="button" class="kv-btn" aria-label="Zoom out" onClick=${() => z(k - .1)}>−</button><span class="kv-num">${Math.round(k * 100)}%</span><button type="button" class="kv-btn" aria-label="Zoom in" onClick=${() => z(k + .1)}>+</button>
      </span>
      <button type="button" class="kv-btn" disabled=${!folded.size} onClick=${() => setFolded(new Set())}>Expand all</button>
    </div>
    ${banner || ''}
    <div class="kv-tree-wrap" ref=${wrap} onPointerDown=${panStart} style=${'height:' + height}>
      <div class="kv-tree-canvas" style=${`width:${(t.width + 40) * k}px;height:${(t.height + 40) * k}px`}>
        <div class="kv-tree-inner" style=${`transform:scale(${k});width:${t.width + 40}px;height:${t.height + 40}px`}>
          ${t.groups.map(g => html`<div class=${cx('kv-tree-group', g.loose && 'loose')} style=${`top:${g.y0 - 6}px;height:${g.y1 - g.y0 - 2}px;width:${t.width}px`}>${g.loose ? html`<span>${words.loose || 'Not linked yet'}</span>` : ''}</div>`)}
          <svg class="kv-tree-edges" width=${t.width + 40} height=${t.height + 40} aria-hidden="true">
            ${Object.entries(t.primary).filter(([c, p]) => shown(c) && shown(p)).map(([c, p]) => html`<path d=${curve(p, c)} class=${'e' + (t.nodes[c].shape === 'pill' ? ' e-pill' : '') + (t.nodes[c].state === 'closed' ? ' e-closed' : '') + on(c, p) + (M[c] === 'new' ? ' m-new' : '')}/>`)}
            ${t.cross.filter(e => shown(e.from) && shown(e.to)).map(e => html`<path d=${crossCurve(e.from, e.to)} class=${'e e-cross' + on(e.from, e.to)}/>`)}
          </svg>
          ${t.seq.filter(shown).map(id => { const p = t.pos[id], n = t.nodes[id], ch = t.kids[id].length && n.shape !== 'pill';
            return html`<div class="kv-tn-pos" key=${id} style=${`left:${p.x}px;top:${p.y}px;width:${W}px`}>
              <${Node} n=${n} kinds=${kinds} statuses=${statuses} sel=${id === sel} dim=${lin && !lin.has(id)} mark=${M[id]} onPick=${pick}/>
              ${ch ? html`<button type="button" class="kv-fold" aria-expanded=${!folded.has(id)} aria-label=${folded.has(id) ? 'Expand branch, ' + t.descendants(id).size + ' hidden' : 'Collapse branch'} onClick=${() => fold(id)}>${folded.has(id) ? '+' + t.descendants(id).size : '–'}</button>` : ''}
            </div>`; })}
        </div>
      </div>
    </div>
    ${legend && legend.length ? html`<div class="kv-legend">${legend.map(([s, txt]) => html`<span><i class=${'kv-lg ' + s}></i>${txt}</span>`)}</div>` : ''}
  </div>`;
}

Object.assign(Kit.viz, { Tree, layoutTree, lineage });
})();
/* /part:page.script.kit.viz.tree */
