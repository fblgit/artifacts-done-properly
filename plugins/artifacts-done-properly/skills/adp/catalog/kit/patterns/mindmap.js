/* part:page.script.kit.mindmap */
/**
 * Mind map
 * A mind-map you make and arrange with drag and drop: a tidy tree from left to right, the root at the left, pills for the nodes, smooth curves for the connectors. The component holds no storage: data goes in, every user change comes out whole through onChange, and the page saves it.
 *
 * API:
 *   Kit.mindmap.mount(root, opts) -> {update(next), destroy()}
 *     data      {nodes: [{id, text, parent, order, collapsed}]}   exactly one node has parent null (the root); order is a number that sorts siblings; collapsed is an optional boolean
 *     onChange  (next) => void    after every user change, with the whole next data: a new object, its nodes in outline order (the root, then each branch depth first, siblings by order), collapsed present only when true.
 *               A sibling set that changes is renumbered 0, 1, 2 ... in its new order. onChange is not called by update().
 *     readOnly  true draws no toolbar and allows no editing and no dragging; selecting and collapsing still work      label  the map's name for assistive tech
 *     update(next)  replaces the data (and cancels an edit, a drag or a menu in progress); destroy() empties root
 *   Malformed data (no root, several roots, an unknown parent, a cycle, a duplicate id, a missing text or order) draws one line that says why. Nothing throws.
 *
 * Making it: the toolbar acts on the selected node. Add child (Tab) and Add sibling (Enter) open a new node straight in edit mode; Escape on it removes it. Double-click or F2 edits the text
 * (Enter commits, Escape cancels). Delete removes a leaf at once; a node with children asks inline (Delete branch or Keep). The root cannot be deleted or moved. A node with children has a
 * toggle that collapses it; a collapsed node shows how many nodes it hides.
 *
 * Arranging it: drag a node (Pointer Events, mouse and touch, after 4 px of movement) and it moves with its subtree. Drop on a node and it becomes that node's last child; drop on the line
 * that shows between or after siblings and it takes that place. Onto itself or its own descendants shows no target. Escape cancels. The original stays dimmed and a ghost follows the pointer.
 * The way without a drag: Move to... (key M) lists every valid target as Make child of X, Move before Y, Move after Y. An aria-live line says what moved.
 *
 * Free placement: Kit.mindmap.mount(root, {layout: 'free'}). A node may carry x and y (px from the top left of the map). Nodes without them keep the tidy tree and each new node sits right of its parent;
 * the first drag pins every shown node where it is, then the dragged node moves with its subtree to wherever it is dropped (the root can move too). Dropping on a node no longer re-parents it:
 * Move to... still does. A child left of its parent is joined to its left side. Positions come out through onChange as x and y.
 *
 * Keys on the tree (role tree, treeitems with aria-expanded and aria-selected): Up and Down in reading order, Left to the parent or collapse, Right to the first child or expand.
 * The tree pans by scrolling and by dragging empty space, inside its own frame; the page never scrolls sideways. On touch, a node drags at once, and empty space scrolls.
 * Classes: .kit-mm (root), .kit-mm-bar, .kit-mm-scroll > .kit-mm-tree > .kit-mm-node[data-root] (.kit-mm-sel, .kit-mm-dim, .kit-mm-into) and svg.kit-mm-links, .kit-mm-drop, .kit-mm-menu, .kit-mm-ghost.
 * Methods of what Kit.mindmap.mount returns: update(next), destroy()
 *
 * @id        pattern.mindmap
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.1
 * @updated   2026-11-13
 * @summary   A mind-map you make and arrange with drag and drop: a tidy tree left to right, add, edit and delete nodes, drop on a node or on a line between siblings, and a Move to menu that does every drop from the keyboard.
 * @tags      mind map, tree, drag and drop, outline, hierarchy, move, keyboard, pointer events
 * @requires  kit.dom
 * @files     kit/patterns/mindmap.css, kit/samples/patterns.json
 * @provides  Kit.mindmap.mount
 * @config    Kit.mindmap.mount(root, opts) | data {nodes [{id, text, parent, order, collapsed, x?, y?}]}, onChange(next) with the whole next data, readOnly, label, layout 'tree' (default) or 'free'; returns {update(next), destroy()}
 * @tokens    --panel --sunk --ink --ink-3 --rule --rule-2 --accent --accent-ink --danger --f-ui --accent-soft? --shadow? --r?
 * @globals   none
 * @db        none
 * @source    Catalog, 2026-11-13 | viz.buckets (kit/viz/buckets.js) | the pointer drag with a drop line, and a Move to menu that does the same without a drag
 * @preview   {"render": "pattern.mindmap", "samples": ["kit/samples/patterns.json#mindmap"]}
 * @samples   mindmap
 * @changed   0.1.1: layout 'free': nodes can carry x and y and a drag drops a node, with its subtree, anywhere on the map; the default stays the tidy tree.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const PAD = 16, HGAP = 48, VGAP = 16, DRAG = 4, LINE_REACH = 11;
let uid = 0;

// ---------------------------------------------------------------- the data
function validate(data) {
  if (!data || !Array.isArray(data.nodes)) return 'The map needs data.nodes, a list of nodes.';
  const q = s => '"' + s + '"', byId = new Map();
  for (const n of data.nodes) {
    if (!n || typeof n !== 'object') return 'Every node must be an object {id, text, parent, order}.';
    if (typeof n.id !== 'string' || !n.id) return 'Every node needs a text id.';
    if (byId.has(n.id)) return 'Duplicate id ' + q(n.id) + '.';
    byId.set(n.id, n);
    if (typeof n.text !== 'string') return 'Node ' + q(n.id) + ' needs a text string.';
    if (typeof n.order !== 'number' || !isFinite(n.order)) return 'Node ' + q(n.id) + ' needs a numeric order.';
    if (n.parent !== null && typeof n.parent !== 'string') return 'Node ' + q(n.id) + ' needs parent null (the root) or the id of its parent.';
    for (const k of ['x', 'y']) if (n[k] !== undefined && (typeof n[k] !== 'number' || !isFinite(n[k]))) return 'Node ' + q(n.id) + ' has a ' + k + ' that is not a number.';
  }
  for (const n of data.nodes) if (n.parent !== null && !byId.has(n.parent)) return 'Node ' + q(n.id) + ' has an unknown parent ' + q(n.parent) + '.';
  for (const n of data.nodes) {
    const path = []; let cur = n;
    while (cur) {
      const i = path.indexOf(cur.id);
      if (i >= 0) return 'Cycle: ' + path.slice(i).concat(cur.id).map(q).join(' > ') + ' leads back to itself and never reaches the root.';
      path.push(cur.id); cur = cur.parent === null ? null : byId.get(cur.parent);
    }
  }
  const roots = data.nodes.filter(n => n.parent === null);
  if (roots.length === 0) return 'No root: exactly one node must have parent null.';
  if (roots.length > 1) return 'Several roots (' + roots.map(r => q(r.id)).join(', ') + '): exactly one node may have parent null.';
  return null;
}
function indexOf(nodes) {
  const byId = new Map(), kids = new Map();
  nodes.forEach(n => byId.set(n.id, n));
  nodes.forEach(n => { if (n.parent !== null) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); } });
  kids.forEach(l => l.sort((a, b) => a.order - b.order));
  return { byId, kids, root: nodes.find(n => n.parent === null) };
}

function mount(root, opts) {
  const o = Object.assign({ data: { nodes: [] }, readOnly: false, label: 'Mind map', layout: 'tree' }, opts);
  const free = () => o.layout === 'free', hasPos = n => Number.isFinite(n.x) && Number.isFinite(n.y);
  const { el, sv } = Kit.dom;
  const pills = new Map();
  let nodes = [], M = null, selected = null, editing = null, ask = null, menu = null, menuOpener = null, press = null, pan = null, built = false, flip = false;
  let geom = new Map(), bar, askBox, scroller, canvas, svg, lineEl, live, ghost = null;
  const btn = {};

  const load = data => { nodes = data.nodes.map(n => { const c = { id: n.id, text: n.text, parent: n.parent, order: n.order, collapsed: n.collapsed === true }; if (hasPos(n)) { c.x = n.x; c.y = n.y; } return c; }); reindex(); if (!selected || !M.byId.has(selected)) selected = M.root.id; };
  const reindex = () => { M = indexOf(nodes); };
  const kidsOf = id => M.kids.get(id) || [];
  const visKids = n => n.collapsed ? [] : kidsOf(n.id);
  function descendants(id) { const s = new Set([id]); (function w(i) { kidsOf(i).forEach(c => { s.add(c.id); w(c.id); }); })(id); return s; }
  function visibleList() { const out = []; (function w(n, d) { out.push({ n, d }); visKids(n).forEach(c => w(c, d + 1)); })(M.root, 0); return out; }
  function depthOf(id) { let d = 0, c = M.byId.get(id); while (c && c.parent !== null) { d++; c = M.byId.get(c.parent); } return d; }
  function snapshot() {
    const out = [];
    (function w(n) { if (!(editing && editing.isNew && editing.id === n.id)) { const c = { id: n.id, text: n.text, parent: n.parent, order: n.order }; if (n.collapsed) c.collapsed = true; if (hasPos(n)) { c.x = n.x; c.y = n.y; } out.push(c); kidsOf(n.id).forEach(w); } })(M.root);
    return { nodes: out };
  }
  const emit = () => { if (o.onChange) o.onChange(snapshot()); };
  function placeAt(n, parentId, index) {
    const list = nodes.filter(x => x.parent === parentId && x !== n).sort((a, b) => a.order - b.order);
    n.parent = parentId; list.splice(Math.max(0, Math.min(index, list.length)), 0, n); list.forEach((x, i) => { x.order = i; });
  }
  const renumber = pid => nodes.filter(x => x.parent === pid).sort((a, b) => a.order - b.order).forEach((x, i) => { x.order = i; });
  function announce(msg) { flip = !flip; live.textContent = msg + (flip ? ' ' : ''); }

  // ---------------------------------------------------------------- the frame
  function showError(msg) {
    cleanup(); built = false; pills.clear(); root.classList.add('kit-mm'); root.removeAttribute('data-ro');
    const p = el('p', 'kit-mm-err', 'This mind map cannot be drawn. ' + msg); p.setAttribute('role', 'alert'); root.replaceChildren(p);
  }
  function build() {
    pills.clear(); root.classList.add('kit-mm'); root.toggleAttribute('data-ro', !!o.readOnly); root.toggleAttribute('data-free', free()); root.replaceChildren();
    askBox = el('div', 'kit-mm-ask'); askBox.setAttribute('role', 'alert'); askBox.hidden = true;
    scroller = el('div', 'kit-mm-scroll'); canvas = el('div', 'kit-mm-tree'); canvas.setAttribute('role', 'tree'); canvas.setAttribute('aria-label', o.label);
    svg = sv('svg', { 'aria-hidden': 'true' }, 'kit-mm-links'); lineEl = el('div', 'kit-mm-drop'); lineEl.hidden = true; canvas.append(svg, lineEl); scroller.append(canvas);
    live = el('div', 'kit-mm-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    if (!o.readOnly) {
      bar = el('div', 'kit-mm-bar'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Edit ' + o.label);
      [['child', 'Add child', 'Tab', addChild], ['sibling', 'Add sibling', 'Enter', addSibling], ['move', 'Move to…', 'M', () => openMenu(btn.move)], ['del', 'Delete', 'Delete', requestDelete]].forEach(([k, label, key, fn]) => {
        const b = el('button', 'kit-mm-btn', label); b.type = 'button'; b.setAttribute('aria-keyshortcuts', key); b.title = label + ' (' + key + ')'; b.addEventListener('click', fn); btn[k] = b; bar.append(b);
      });
      root.append(bar);
    }
    root.append(askBox, scroller, live);
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('focusin', e => { const p = e.target.closest('.kit-mm-node'); if (p && !editing && p.dataset.id !== selected) select(p.dataset.id); });
    canvas.addEventListener('dblclick', e => { const p = e.target.closest('.kit-mm-node'); if (p && !e.target.closest('.kit-mm-tog, .kit-mm-input')) startEdit(p.dataset.id); });
    scroller.addEventListener('pointerdown', onDown);
    built = true;
  }

  // ---------------------------------------------------------------- drawing
  function makePill(id) {
    const p = el('div', 'kit-mm-node'); p.dataset.id = id; p.setAttribute('role', 'treeitem');
    p._text = el('span', 'kit-mm-text'); p.append(p._text); return p;
  }
  function updatePill(p, n, d) {
    const sibs = n.parent === null ? [n] : kidsOf(n.parent), ch = kidsOf(n.id), isEd = !!(editing && editing.id === n.id);
    p.setAttribute('aria-level', String(d + 1)); p.setAttribute('aria-posinset', String(sibs.indexOf(n) + 1)); p.setAttribute('aria-setsize', String(sibs.length));
    if (ch.length) p.setAttribute('aria-expanded', String(!n.collapsed)); else p.removeAttribute('aria-expanded');
    p.setAttribute('aria-selected', String(n.id === selected)); p.tabIndex = n.id === selected ? 0 : -1;
    p.classList.toggle('kit-mm-sel', n.id === selected); p.classList.toggle('kit-mm-editing', isEd); p.toggleAttribute('data-root', n.parent === null);
    p.setAttribute('aria-label', n.text || 'Untitled');
    if (isEd) {
      if (!p._input) {
        const inp = el('input', 'kit-mm-input'); inp.type = 'text'; inp.value = n.text; inp.setAttribute('aria-label', 'Text of the node'); p._input = inp; p._text.hidden = true; p._text.after(inp);
        inp.addEventListener('input', () => render());
        inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finishEdit(true, true); } else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false, true); } });
        inp.addEventListener('blur', () => finishEdit(true, false));
      }
      p._input.style.width = Math.min(26, Math.max(10, p._input.value.length + 2)) + 'ch';
    } else {
      if (p._input) { const i = p._input; p._input = null; i.remove(); p._text.hidden = false; }
      p._text.textContent = n.text;
    }
    if (ch.length) {
      if (!p._tog) {
        const t = el('button', 'kit-mm-tog'); t.type = 'button'; t.tabIndex = -1;
        t.addEventListener('click', e => { e.stopPropagation(); const id = p.dataset.id; select(id, { focus: true }); setCollapsed(id, !M.byId.get(id).collapsed); });
        p._tog = t; p.append(t);
      }
      const hidden = descendants(n.id).size - 1;
      p._tog.textContent = n.collapsed ? '+' + hidden : '−'; p._tog.setAttribute('aria-label', (n.collapsed ? 'Expand ' : 'Collapse ') + (n.text || 'Untitled') + (n.collapsed ? ', ' + hidden + ' hidden' : ''));
      p._tog.toggleAttribute('data-count', !!n.collapsed);
    } else if (p._tog) { p._tog.remove(); p._tog = null; }
  }
  function render() {
    if (!built) return;
    const list = visibleList(), ids = new Set(list.map(x => x.n.id));
    if (!ids.has(selected)) { let c = M.byId.get(selected); while (c && !ids.has(c.id)) c = M.byId.get(c.parent); selected = c ? c.id : M.root.id; }
    pills.forEach((p, id) => { if (!ids.has(id)) { p.remove(); pills.delete(id); } });
    list.forEach(({ n, d }) => { let p = pills.get(n.id); if (!p) { p = makePill(n.id); pills.set(n.id, p); canvas.append(p); } updatePill(p, n, d); });
    layout(list); chrome();
  }
  function layout(list) {
    const size = new Map(), cw = [];
    list.forEach(({ n, d }) => { const p = pills.get(n.id); size.set(n.id, { w: p.offsetWidth, h: p.offsetHeight }); cw[d] = Math.max(cw[d] || 0, p.offsetWidth); });
    const cx = [PAD]; cw.forEach((w, i) => { cx[i + 1] = cx[i] + w + HGAP; });
    const sub = new Map();
    const measure = n => { const h = size.get(n.id).h, ch = visKids(n); if (!ch.length) { sub.set(n.id, h); return h; } let t = VGAP * (ch.length - 1); ch.forEach(c => { t += measure(c); }); const H = Math.max(h, t); sub.set(n.id, H); return H; };
    geom = new Map();
    const put = (n, top, d) => {
      const s = size.get(n.id), H = sub.get(n.id), ch = visKids(n); let cy;
      if (!ch.length) cy = top + H / 2;
      else {
        let t = VGAP * (ch.length - 1); ch.forEach(c => { t += sub.get(c.id); });
        let y = top + (H - t) / 2; ch.forEach(c => { put(c, y, d + 1); y += sub.get(c.id) + VGAP; });
        const a = geom.get(ch[0].id), z = geom.get(ch[ch.length - 1].id); cy = (a.y + a.h / 2 + z.y + z.h / 2) / 2;
      }
      geom.set(n.id, { x: cx[d], y: cy - s.h / 2, w: s.w, h: s.h, d });
    };
    const total = measure(M.root); put(M.root, PAD, 0);
    let W = cx[cw.length] - HGAP + PAD, Hh = total + PAD * 2;
    if (free() && nodes.some(hasPos)) {
      // Free placement: a node with x and y sits there; one without sits right of its parent, one row per sibling; the root keeps its tidy place.
      const g2 = new Map();
      (function w(n) {
        const s = size.get(n.id), t = geom.get(n.id); let x = t.x, y = t.y;
        if (hasPos(n)) { x = n.x; y = n.y; }
        else if (n.parent !== null) { const a = g2.get(n.parent); x = a.x + a.w + HGAP; y = a.y + visKids(M.byId.get(n.parent)).indexOf(n) * (s.h + VGAP); }
        g2.set(n.id, { x, y, w: s.w, h: s.h, d: t.d }); visKids(n).forEach(w);
      })(M.root);
      geom = g2; W = PAD; Hh = PAD; geom.forEach(g => { W = Math.max(W, g.x + g.w + PAD); Hh = Math.max(Hh, g.y + g.h + PAD); });
    }
    canvas.style.width = W + 'px'; canvas.style.height = Hh + 'px'; svg.setAttribute('width', W); svg.setAttribute('height', Hh);
    geom.forEach((g, id) => { const p = pills.get(id); p.style.left = g.x + 'px'; p.style.top = g.y + 'px'; });
    drawLinks();
  }
  function drawLinks() {
    svg.replaceChildren();
    visibleList().forEach(({ n }) => visKids(n).forEach(c => {
      const a = geom.get(n.id), b = geom.get(c.id), left = free() && b.x + b.w < a.x;
      const x1 = left ? a.x : a.x + a.w, y1 = a.y + a.h / 2, x2 = left ? b.x + b.w : b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      svg.append(sv('path', { d: 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 }, 'kit-mm-link'));
    }));
  }
  function chrome() {
    if (btn.child) {
      const n = M.byId.get(selected), isRoot = !n || n.parent === null;
      btn.child.disabled = !n; btn.sibling.disabled = isRoot; btn.del.disabled = isRoot; btn.move.disabled = isRoot;
    }
    if (!ask) { askBox.hidden = true; askBox.dataset.id = ''; return; }
    askBox.hidden = false; if (askBox.dataset.id === ask.id) return; askBox.dataset.id = ask.id;
    const n = M.byId.get(ask.id), c = descendants(ask.id).size - 1;
    const yes = el('button', 'kit-mm-btn kit-mm-danger', 'Delete branch'), no = el('button', 'kit-mm-btn kit-mm-keep', 'Keep');
    yes.type = 'button'; no.type = 'button';
    yes.addEventListener('click', () => doDelete(ask.id)); no.addEventListener('click', () => { ask = null; render(); focusPill(selected); });
    askBox.replaceChildren(el('span', 'kit-mm-ask-msg', 'Delete “' + (n.text || 'Untitled') + '” and its ' + c + (c === 1 ? ' sub-node?' : ' sub-nodes?')), yes, no);
  }
  function ensureVisible(id) {
    const g = geom.get(id); if (!g) return; const s = scroller, m = 8;
    if (g.x < s.scrollLeft + m) s.scrollLeft = Math.max(0, g.x - PAD); else if (g.x + g.w > s.scrollLeft + s.clientWidth - m) s.scrollLeft = g.x + g.w - s.clientWidth + PAD;
    if (g.y < s.scrollTop + m) s.scrollTop = Math.max(0, g.y - PAD); else if (g.y + g.h > s.scrollTop + s.clientHeight - m) s.scrollTop = g.y + g.h - s.clientHeight + PAD;
  }
  function focusPill(id) { const p = pills.get(id); if (p) { p.focus({ preventScroll: true }); ensureVisible(id); } }
  function select(id, { focus = false } = {}) {
    if (!M.byId.has(id)) return;
    if (editing && editing.id !== id) finishEdit(true, false);
    if (ask && ask.id !== id) ask = null;
    closeMenu(false); selected = id; render(); if (focus) focusPill(id);
  }
  function setCollapsed(id, val) { const n = M.byId.get(id); if (!n || !kidsOf(id).length || n.collapsed === val) return; n.collapsed = val; render(); emit(); }

  // ---------------------------------------------------------------- making
  const clone = () => nodes.map(n => Object.assign({}, n));
  function startNew(parentId, index, back, snap) {
    const n = { id: 'n' + Date.now().toString(36) + (++uid).toString(36), text: '', parent: parentId, order: 0, collapsed: false };
    nodes.push(n); placeAt(n, parentId, index); reindex();
    ask = null; editing = { id: n.id, isNew: true, orig: '', back, snap }; selected = n.id; render(); focusInput(n.id);
  }
  function focusInput(id) { const p = pills.get(id); if (p && p._input) { p._input.focus(); p._input.select(); ensureVisible(id); } }
  function addChild() {
    if (o.readOnly || !selected) return; if (editing) finishEdit(true, false);
    const n = M.byId.get(selected); if (!n) return;
    const snap = clone(); n.collapsed = false; startNew(n.id, kidsOf(n.id).length, n.id, snap);
  }
  function addSibling() {
    if (o.readOnly || !selected) return; if (editing) finishEdit(true, false);
    const n = M.byId.get(selected); if (!n || n.parent === null) return;
    startNew(n.parent, kidsOf(n.parent).indexOf(n) + 1, n.id, clone());
  }
  function startEdit(id) {
    if (o.readOnly || !M.byId.has(id)) return;
    if (editing) finishEdit(true, false);
    ask = null; closeMenu(false); editing = { id, isNew: false, orig: M.byId.get(id).text }; selected = id; render(); focusInput(id);
  }
  function finishEdit(commit, refocus) {
    if (!editing) return;
    const e = editing, p = pills.get(e.id), n = M.byId.get(e.id), val = p && p._input ? p._input.value.trim() : n.text;
    editing = null;
    if (commit && val) {
      const changed = e.isNew || val !== e.orig; n.text = val; render(); if (refocus) focusPill(e.id); if (changed) emit();
    } else {
      if (e.isNew) { nodes = e.snap; reindex(); selected = M.byId.has(e.back) ? e.back : M.root.id; }
      render(); if (refocus) focusPill(selected);
    }
  }
  function requestDelete() {
    if (o.readOnly) return; const n = M.byId.get(selected); if (!n || n.parent === null) return; if (editing) finishEdit(true, false);
    if (!kidsOf(n.id).length) { doDelete(n.id); return; }
    ask = { id: n.id }; render(); const k = askBox.querySelector('.kit-mm-keep'); if (k) k.focus();
  }
  function doDelete(id) {
    const n = M.byId.get(id); if (!n || n.parent === null) return;
    const sibs = kidsOf(n.parent), i = sibs.indexOf(n), next = sibs[i + 1] || sibs[i - 1] || M.byId.get(n.parent), gone = descendants(id);
    nodes = nodes.filter(x => !gone.has(x.id)); reindex(); ask = null; selected = next.id; render(); focusPill(selected); emit();
  }

  // ---------------------------------------------------------------- moving
  const forbidden = (id, parentId) => descendants(id).has(parentId);
  function applyMove(id, parentId, index, placed) {
    const n = M.byId.get(id), np = M.byId.get(parentId);
    if (!n || !np || n.parent === null || forbidden(id, parentId)) return false;
    const old = n.parent;
    placeAt(n, parentId, index); if (old !== parentId) renumber(old); np.collapsed = false; reindex();
    announce('Moved ' + (n.text || 'Untitled') + ' under ' + (np.text || 'Untitled') + (placed ? ', position ' + (kidsOf(parentId).indexOf(n) + 1) + ' of ' + kidsOf(parentId).length : '') + '.');
    ask = null; selected = id; render(); focusPill(id); emit(); return true;
  }
  function moveTargets(id) {
    const n = M.byId.get(id), out = [], dset = descendants(id), cur = n.parent === null ? -1 : kidsOf(n.parent).indexOf(n);
    (function w(t) {
      if (!dset.has(t.id)) {
        const name = t.text || 'Untitled', own = kidsOf(t.id).filter(x => x.id !== id), depth = depthOf(t.id);
        if (!(t.id === n.parent && own.length === cur)) out.push({ label: 'Make child of ' + name, parent: t.id, index: own.length, depth, placed: false });
        if (t.parent !== null) {
          const sibs = kidsOf(t.parent).filter(x => x.id !== id), ti = sibs.indexOf(t);
          [['Move before ', ti], ['Move after ', ti + 1]].forEach(([lab, idx]) => { if (!(t.parent === n.parent && idx === cur)) out.push({ label: lab + name, parent: t.parent, index: idx, depth, placed: true }); });
        }
      }
      kidsOf(t.id).forEach(w);
    })(M.root);
    return out;
  }
  function openMenu(opener) {
    if (o.readOnly) return; const n = M.byId.get(selected); if (!n || n.parent === null) return;
    if (editing) finishEdit(true, false); closeMenu(false);
    const items = moveTargets(selected); if (!items.length) return;
    menu = el('div', 'kit-mm-menu'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Move ' + (n.text || 'Untitled') + ' to');
    items.forEach(it => {
      const b = el('button', 'kit-mm-item', it.label); b.type = 'button'; b.tabIndex = -1; b.setAttribute('role', 'menuitem'); b.style.setProperty('--d', it.depth);
      b.addEventListener('click', () => { const id = selected; closeMenu(false); applyMove(id, it.parent, it.index, it.placed); });
      menu.append(b);
    });
    menu.addEventListener('keydown', e => {
      const l = [...menu.querySelectorAll('.kit-mm-item')], i = l.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); l[(i + 1) % l.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); l[(i - 1 + l.length) % l.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); l[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); l[l.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(false);
    });
    menu.addEventListener('focusout', e => { if (menu && !menu.contains(e.relatedTarget)) closeMenu(false); });
    menu.style.top = (bar.offsetTop + bar.offsetHeight + 4) + 'px'; root.append(menu); menuOpener = opener;
    menu.querySelector('.kit-mm-item').focus();
  }
  function closeMenu(refocus) {
    if (!menu) return; const m = menu, op = menuOpener; menu = null; menuOpener = null; m.remove();
    if (refocus) { if (op && op.isConnected && !op.disabled) op.focus(); else focusPill(selected); }
  }

  // ---------------------------------------------------------------- keys
  function onKey(e) {
    if (e.target.closest('.kit-mm-input') || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = M.byId.get(selected); if (!n) return;
    const list = visibleList().map(x => x.n.id), i = list.indexOf(selected), ch = kidsOf(n.id), k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); if (i < list.length - 1) select(list[i + 1], { focus: true }); }
    else if (k === 'ArrowUp') { e.preventDefault(); if (i > 0) select(list[i - 1], { focus: true }); }
    else if (k === 'ArrowLeft') { e.preventDefault(); if (ch.length && !n.collapsed) setCollapsed(n.id, true); else if (n.parent !== null) select(n.parent, { focus: true }); }
    else if (k === 'ArrowRight') { e.preventDefault(); if (ch.length) { if (n.collapsed) setCollapsed(n.id, false); else select(ch[0].id, { focus: true }); } }
    else if (o.readOnly) return;
    else if (k === 'Enter') { e.preventDefault(); addSibling(); }
    else if (k === 'Tab' && !e.shiftKey) { e.preventDefault(); addChild(); }
    else if (k === 'F2') { e.preventDefault(); startEdit(selected); }
    else if (k === 'Delete') { e.preventDefault(); requestDelete(); }
    else if (k === 'm' || k === 'M') { e.preventDefault(); openMenu(null); }
  }

  // ---------------------------------------------------------------- pointer: drag a node, pan the empty space
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = e.target.closest('.kit-mm-node');
    if (!p) {
      if (e.pointerType === 'touch') return;
      pan = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop, pid: e.pointerId }; scroller.classList.add('kit-mm-panning');
      addEventListener('pointermove', onPan); addEventListener('pointerup', endPan); addEventListener('pointercancel', endPan); return;
    }
    if (e.target.closest('.kit-mm-tog, .kit-mm-input')) return;
    const id = p.dataset.id; select(id, { focus: true });
    if (o.readOnly || (!free() && M.byId.get(id).parent === null)) return;
    const r = p.getBoundingClientRect();
    press = { id, x: e.clientX, y: e.clientY, pid: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, started: false, target: null };
    addEventListener('pointermove', onMove, { passive: false }); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp); addEventListener('keydown', onDragKey, true);
  }
  function onPan(e) { if (!pan || e.pointerId !== pan.pid) return; scroller.scrollLeft = pan.sl - (e.clientX - pan.x); scroller.scrollTop = pan.st - (e.clientY - pan.y); }
  function endPan() { removeEventListener('pointermove', onPan); removeEventListener('pointerup', endPan); removeEventListener('pointercancel', endPan); pan = null; if (scroller) scroller.classList.remove('kit-mm-panning'); }
  function onMove(e) {
    if (!press || e.pointerId !== press.pid) return;
    if (!press.started) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG) return;
      press.started = true; closeMenu(false); root.classList.add('kit-mm-dragging');
      if (free()) {
        // Pin every shown node where it is, so nothing jumps; the dragged one moves with its subtree.
        visibleList().forEach(({ n }) => { const g = geom.get(n.id); n.x = g.x; n.y = g.y; });
        const ids = [...descendants(press.id)].filter(i => pills.has(i));
        press.ids = ids; press.from = new Map(ids.map(i => [i, { x: M.byId.get(i).x, y: M.byId.get(i).y }]));
        press.minX = Math.min(...ids.map(i => press.from.get(i).x)); press.minY = Math.min(...ids.map(i => press.from.get(i).y));
        ids.forEach(i => pills.get(i).classList.add('kit-mm-moving'));
      } else {
      const n = M.byId.get(press.id), p = pills.get(press.id);
      descendants(press.id).forEach(x => { const q = pills.get(x); if (q) q.classList.add('kit-mm-dim'); });
      ghost = el('div', 'kit-mm-ghost', n.text || 'Untitled'); ghost.style.maxWidth = p.offsetWidth + 'px'; root.append(ghost);
      }
    }
    e.preventDefault();
    if (free()) {
      const dx = Math.max(e.clientX - press.x, -press.minX), dy = Math.max(e.clientY - press.y, -press.minY);
      press.dx0 = dx; press.dy0 = dy;
      press.ids.forEach(i => { const f = press.from.get(i), g = geom.get(i); g.x = f.x + dx; g.y = f.y + dy; const q = pills.get(i); q.style.left = g.x + 'px'; q.style.top = g.y + 'px'; });
      drawLinks(); return;
    }
    ghost.style.left = (e.clientX - press.dx) + 'px'; ghost.style.top = (e.clientY - press.dy) + 'px';
    const r = canvas.getBoundingClientRect(); press.target = hit(e.clientX - r.left, e.clientY - r.top, press.id); showTarget(press.target);
  }
  function hit(x, y, id) {
    const dset = descendants(id);
    for (const [gid, g] of geom) if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return dset.has(gid) ? null : { kind: 'into', id: gid };
    const dn = M.byId.get(id); let best = null, bd = LINE_REACH + 1;
    geom.forEach((pg, pid) => {
      const p = M.byId.get(pid), ch = visKids(p); if (!ch.length || dset.has(pid)) return;
      const x1 = geom.get(ch[0].id).x, w = Math.max(...ch.map(c => geom.get(c.id).w));
      if (x < x1 - HGAP / 2 || x > x1 + w + 8) return;
      const ci = dn.parent === pid ? ch.indexOf(dn) : -1;
      for (let k = 0; k <= ch.length; k++) {
        if (ci >= 0 && (k === ci || k === ci + 1)) continue;
        const a = k > 0 ? geom.get(ch[k - 1].id) : null, b = k < ch.length ? geom.get(ch[k].id) : null;
        const ly = !a ? b.y - 4 : !b ? a.y + a.h + 4 : (a.y + a.h + b.y) / 2, dist = Math.abs(y - ly);
        if (dist < bd) { bd = dist; best = { kind: 'gap', parent: pid, y: ly, x1, x2: x1 + w, index: k - (ci >= 0 && ci < k ? 1 : 0) }; }
      }
    });
    return best;
  }
  function showTarget(t) {
    pills.forEach(p => p.classList.remove('kit-mm-into'));
    if (!t) { lineEl.hidden = true; return; }
    if (t.kind === 'into') { lineEl.hidden = true; pills.get(t.id).classList.add('kit-mm-into'); return; }
    lineEl.hidden = false; lineEl.style.left = (t.x1 - 4) + 'px'; lineEl.style.top = (t.y - 2) + 'px'; lineEl.style.width = (t.x2 - t.x1 + 8) + 'px';
  }
  function endPress() {
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); removeEventListener('keydown', onDragKey, true);
    if (ghost) { ghost.remove(); ghost = null; }
    if (root) root.classList.remove('kit-mm-dragging');
    pills.forEach(p => p.classList.remove('kit-mm-dim', 'kit-mm-into', 'kit-mm-moving')); if (lineEl) lineEl.hidden = true; press = null;
  }
  function onUp(e) {
    if (!press || e.pointerId !== press.pid) return;
    const p = press; endPress();
    if (free() && p.started) {
      if (e.type !== 'pointerup' || !(p.dx0 || p.dy0)) { render(); return; }
      descendants(p.id).forEach(i => { const n = M.byId.get(i); if (hasPos(n)) { n.x = Math.round(n.x + p.dx0); n.y = Math.round(n.y + p.dy0); } });
      announce('Moved ' + (M.byId.get(p.id).text || 'Untitled') + '.'); render(); emit(); return;
    }
    if (!p.started || e.type !== 'pointerup' || !p.target) return;
    if (p.target.kind === 'into') applyMove(p.id, p.target.id, kidsOf(p.target.id).filter(x => x.id !== p.id).length, false);
    else applyMove(p.id, p.target.parent, p.target.index, true);
  }
  function onDragKey(e) { if (e.key === 'Escape' && press) { e.preventDefault(); e.stopPropagation(); const was = press.started && free(); endPress(); if (was) render(); } }
  const onOutside = e => { if (menu && !menu.contains(e.target) && e.target !== menuOpener) closeMenu(false); };
  addEventListener('pointerdown', onOutside, true);

  function cleanup() { endPress(); endPan(); closeMenu(false); editing = null; ask = null; }
  const api = {
    update(next) {
      cleanup(); const err = validate(next);
      if (err) { showError(err); return; }
      load(next); if (!built) build(); render();
    },
    destroy() { cleanup(); removeEventListener('pointerdown', onOutside, true); root.replaceChildren(); root.classList.remove('kit-mm'); root.removeAttribute('data-ro'); built = false; },
  };
  const err0 = validate(o.data);
  if (err0) showError(err0); else { load(o.data); build(); render(); }
  return api;
}
Kit.mindmap = Object.freeze({ mount });
})();
/* /part:page.script.kit.mindmap */
