/* part:page.script.kit.canvas */
/* Kit component: canvas (Kit.canvas)    kit version 0.1.1
   What it is: a free drawing surface on SVG plus an HTML layer: select/move/resize/marquee, hand and pinch/wheel zoom, pen, highlighter, eraser,
   rectangle/ellipse/diamond, line and arrow that attach to shapes, text, sticky notes, "ref" cards (a board record shown on the canvas), selection toolbar,
   undo/redo history (150 ops), keyboard shortcuts, and the canvas manager bar (select, new, rename, duplicate, clear, delete).
   Geometry (bboxOf, endsOf, edgePoint, hitTest, nearPath, pathD, arrowHead) and the history are plain functions inside the factory.
   Needs from the board:
     config  Kit.canvas.create({store, db, chrome, colors, tints, part, scopeSlot, words, applySnap, renderRef, openRef})
               colors     pen colour names, e.g. ["ink","blue"]; each needs a custom property --c-<name>
               tints      sticky tint names; each needs a class .tint-<name> (background) in the board css
               part       "<part id>": the manager root renders data-part and data-comment-target (omit for none)
               scopeSlot  state slot holding the current scope id, used for the remembered canvas key (default "scopeId")
               words      {onboardTitle, onboardText, onboardButton, barNote, empty} copy
               applySnap(name, snap)  hook: apply a collection snapshot to state (the els subscription calls it)
               renderRef(e, ctx)      hook: returns the card for an element of type "ref" (e.refKind, e.refId); ctx {pos, er, measure, s}; without it refs render nothing
               openRef(e)             hook: what opening a ref does
     state   S.canvases, S.els, S.canvasId, S.tool, S.color, S.tint, S.sw, S.fill (defaults: Kit.canvas.slots(config)), S.modal, S.canWrite
     css     kit/canvas.css; custom properties --canvas --dot --panel --rule --rule-2 --sunk --accent --accent-soft --accent-ink --ink --ink-2 --shadow --sticky-ink --f-ui --f-hand --f-mono --f-display --c-<colour>; classes .tint-<name> (board) and .onboard (kit/canvas.css)
     db collections: reads and writes "canvases" {name, order, created, author} and "els" {canvasId, type, x, y, w, h, x2, y2, fromId, toId, pts, sw, hl, color, tint, fill, font, fs, text, refKind, refId, z, author, created}
   Returns {CanvasView, Board, ensureCanvas, openCanvas, closeCanvas, sendToCanvas, undo, redo}.
   Lifted from: Journey Whiteboard app.js (canvas geometry, history, CanvasView, Board, Editor). The ADR Drafting Table's parts/canvas.js is newer but is another renderer
   (a real <canvas>, pen/marker types, no refs, rect/ellipse edge points); it is not drop-in for this data, so it is not taken: it stays a sibling for a later kit file. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const { html } = window.htmPreact;
const { now, clip, nul, sortEntries, isTyping } = Kit.util;

Kit.canvas = Object.freeze({
  slots({ colors = ['ink'], tints = ['yellow'] } = {}) { return { tool: 'select', color: colors[0], tint: tints[0], sw: 3, fill: 'none', canvases: {}, els: {}, canvasId: null }; },
  create(cfg) {
    const { store, db, chrome, colors: COLORS = ['ink'], tints: TINTS = ['yellow'], part, scopeSlot = 'scopeId' } = cfg;
    const { useState, useEffect, useRef, useLayoutEffect } = window.htmPreact;
    const { S, set, emit, useS, ls } = store;
    const { col, put, upd, del, newId, localSet, localPatch, writeOne, subErr } = db;
    const { toast, openModal, step } = chrome;
    const I = Kit.icons;
    const onSnap = (name, snap) => cfg.applySnap(name, snap);
    const W = {
      onboardTitle: 'Canvases',
      onboardText: 'A canvas is a free surface: draw, write and diagram. Make as many as you need.',
      onboardButton: 'Create the first canvas',
      barNote: '',
      empty: 'Empty canvas. Pick a tool on the left, or double-click to write.',
      ...(cfg.words || {}),
    };
    const partAttrs = part ? { 'data-part': part, 'data-comment-target': '' } : {};

        let elsUnsub = null;
        function closeCanvas() { if (elsUnsub) { elsUnsub(); elsUnsub = null; } }
        function openCanvas(cid) {
          closeCanvas();
          S.els = {}; S.canvasId = cid; ls.set('canvas:' + S[scopeSlot], cid); emit();
          if (!cid) return;
          elsUnsub = col('els').where('canvasId', '==', cid).onSnapshot(s => onSnap('els', s), subErr);
        }
    function ensureCanvas(name) {
      const first = sortEntries(S.canvases)[0];
      if (first) return first[0];
      const id = newId('canvases'); const doc = { name: name || 'Main', order: now(), created: now(), author: S.me };
      localSet('canvases', id, doc); put('canvases', id, doc); return id;
    }
    function sendToCanvas(refKind, refId, cid) {
      const target = cid || (S.canvasId && S.canvases[S.canvasId] ? S.canvasId : ensureCanvas());
      const v = ls.get('view:' + target, { x: 80, y: 40, k: 1 });
      const cx = (-v.x + 420) / v.k + (Math.random() * 60 - 30), cy = (-v.y + 220) / v.k + (Math.random() * 60 - 30);
      const id = newId('els');
      const doc = { canvasId: target, type: 'ref', refKind, refId, x: Math.round(cx), y: Math.round(cy), w: 250, h: 0, z: now(), author: S.me, created: now() };
      if (target === S.canvasId) localSet('els', id, doc);
      put('els', id, doc);
      toast(`Sent to canvas “${(S.canvases[target] || {}).name || 'Main'}”.`);
    }

    // ------------------------------------------------------------ geometry
    const BOXY = ['rect', 'ellipse', 'diamond', 'text', 'sticky', 'ref'];
    const LINEY = ['line', 'arrow'];
    const H = { undo: [], redo: [] };
    const measured = {};
    function bboxOf(e, map) {
      if (LINEY.includes(e.type)) { const [a, b] = endsOf(e, map); return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
      const h = ['text', 'ref', 'sticky'].includes(e.type) ? Math.max(e.h || 0, measured[e.id] || 0, 24) : (e.h || 0);
      return { x: e.x, y: e.y, w: e.w || 0, h };
    }
    const center = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    function edgePoint(b, to) {
      const c = center(b); const dx = to.x - c.x, dy = to.y - c.y; if (!dx && !dy) return c;
      const tx = dx ? (b.w / 2 + 6) / Math.abs(dx) : Infinity, ty = dy ? (b.h / 2 + 6) / Math.abs(dy) : Infinity;
      const t = Math.min(tx, ty, 1); return { x: c.x + dx * t, y: c.y + dy * t };
    }
    function endsOf(e, map) {
      const A = e.fromId && map[e.fromId] && BOXY.includes(map[e.fromId].type) ? map[e.fromId] : null;
      const B = e.toId && map[e.toId] && BOXY.includes(map[e.toId].type) ? map[e.toId] : null;
      const ba = A && bboxOf(A, map), bb = B && bboxOf(B, map);
      let a = { x: e.x, y: e.y }, b = { x: e.x2, y: e.y2 };
      if (ba) a = edgePoint(ba, bb ? center(bb) : b);
      if (bb) b = edgePoint(bb, ba ? center(ba) : a);
      return [a, b];
    }
    function distSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y; const l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); }
    function nearPath(e, p, tol) {
      if (p.x < e.x - tol || p.y < e.y - tol || p.x > e.x + (e.w || 0) + tol || p.y > e.y + (e.h || 0) + tol) return false;
      const q = e.pts || []; if (q.length < 4) return Math.hypot(p.x - e.x - (q[0] || 0), p.y - e.y - (q[1] || 0)) <= tol;
      for (let i = 0; i < q.length - 2; i += 2) if (distSeg(p, { x: e.x + q[i], y: e.y + q[i + 1] }, { x: e.x + q[i + 2], y: e.y + q[i + 3] }) <= tol) return true;
      return false;
    }
    function hitTest(p, list, map, k, exclude) {
      const tol = 7 / k;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i]; if (exclude && exclude(e)) continue;
        if (e.type === 'path') { if (nearPath(e, p, tol + (e.sw || 3) / 2 + (e.hl ? 6 : 0))) return e; }
        else if (LINEY.includes(e.type)) { const [a, b] = endsOf(e, map); if (distSeg(p, a, b) <= tol + (e.sw || 2)) return e; }
        else { const b = bboxOf(e, map); if (p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol) return e; }
      }
      return null;
    }
    function pathD(e) {
      const q = e.pts || []; const X = i => e.x + q[i], Y = i => e.y + q[i + 1];
      if (q.length < 4) return `M${X(0)} ${Y(0)} l0.01 0.01`;
      let d = `M${X(0)} ${Y(0)}`;
      for (let i = 2; i < q.length - 2; i += 2) d += ` Q${X(i)} ${Y(i)} ${(X(i) + X(i + 2)) / 2} ${(Y(i) + Y(i + 2)) / 2}`;
      return d + ` L${X(q.length - 2)} ${Y(q.length - 2)}`;
    }
    function arrowHead(a, b, sw) {
      const s = 9 + sw * 2.2; const dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; const ux = dx / l, uy = dy / l;
      return `${b.x},${b.y} ${b.x - ux * s - uy * s * 0.5},${b.y - uy * s + ux * s * 0.5} ${b.x - ux * s + uy * s * 0.5},${b.y - uy * s - ux * s * 0.5}`;
    }
    const fillOf = e => e.fill === 'tint' ? `color-mix(in srgb, var(--c-${e.color || 'ink'}) 14%, transparent)` : e.fill === 'solid' ? `var(--c-${e.color || 'ink'})` : 'none';

    // ------------------------------------------------------------ canvas writes with history
    function record(op) { H.undo.push(op); if (H.undo.length > 150) H.undo.shift(); H.redo = []; }
    function createEls(docs, rec = true) { for (const d of docs) { localSet('els', d.id, d.data); put('els', d.id, d.data); } if (rec) record({ t: 'create', els: docs }); }
    function deleteEls(ids, rec = true) {
      const docs = ids.map(id => ({ id, data: S.els[id] })).filter(d => d.data);
      for (const d of docs) { delete S.els[d.id]; delete measured[d.id]; del('els', d.id); }
      emit(); if (rec && docs.length) record({ t: 'delete', els: docs });
    }
    function updateEls(ch, rec = true) { for (const c of ch) { localPatch('els', c.id, c.after); upd('els', c.id, nul(c.after)); } if (rec && ch.length) record({ t: 'update', ch }); }
    function undo() {
      const op = H.undo.pop(); if (!op) return;
      if (op.t === 'create') deleteEls(op.els.map(d => d.id), false);
      else if (op.t === 'delete') createEls(op.els, false);
      else updateEls(op.ch.map(c => ({ id: c.id, after: c.before })), false);
      H.redo.push(op); emit();
    }
    function redo() {
      const op = H.redo.pop(); if (!op) return;
      if (op.t === 'create') createEls(op.els, false);
      else if (op.t === 'delete') deleteEls(op.els.map(d => d.id), false);
      else updateEls(op.ch.map(c => ({ id: c.id, after: c.after })), false);
      H.undo.push(op); emit();
    }

    // ------------------------------------------------------------ canvas view
    const TOOLS = [
      ['select', 'Select and move (V)', 'v'], ['hand', 'Pan (H, or hold Space)', 'h'], null,
      ['pen', 'Pen (P)', 'p'], ['marker', 'Highlighter (M)', 'm'], ['eraser', 'Eraser (E)', 'e'], null,
      ['rect', 'Rectangle (R)', 'r'], ['ellipse', 'Ellipse (O)', 'o'], ['diamond', 'Diamond (D)', 'd'], ['line', 'Line (L)', 'l'], ['arrow', 'Arrow (A): start or end on a shape to connect it', 'a'], null,
      ['text', 'Text (T)', 't'], ['sticky', 'Sticky note (N)', 'n'],
    ];
    function CanvasView() {
      const s = useS();
      const canvases = sortEntries(s.canvases);
      const cid = s.canvasId && s.canvases[s.canvasId] ? s.canvasId : canvases[0] && canvases[0][0];
      useEffect(() => { if (cid && cid !== S.canvasId) openCanvas(cid); }, [cid]);
      useEffect(() => { H.undo = []; H.redo = []; }, [cid]);
      if (!canvases.length) return html`<div class="onboard"><h1>${W.onboardTitle}</h1><p class="muted">${W.onboardText}</p>${s.canWrite ? html`<div><button class="btn primary" type="button" onClick=${() => openCanvas(ensureCanvas('Main'))}>${W.onboardButton}</button></div>` : ''}</div>`;
      const cur = s.canvases[cid] || {};
      const rename = () => openModal({ title: 'Rename canvas', fields: [{ id: 'name', label: 'Name', value: cur.name }], ok: 'Save', onOk: v => { localPatch('canvases', cid, { name: clip(v.name, 80) }); upd('canvases', cid, { name: clip(v.name, 80) }); } });
      const add = () => openModal({ title: 'New canvas', fields: [{ id: 'name', label: 'Name', value: '' }], ok: 'Create', onOk: v => { const id = newId('canvases'); const d = { name: clip(v.name.trim() || 'Untitled', 80), order: now(), created: now(), author: S.me }; localSet('canvases', id, d); put('canvases', id, d); openCanvas(id); } });
      const dup = () => openModal({ title: 'Duplicate canvas', fields: [{ id: 'name', label: 'Name', value: cur.name + ' (copy)' }], ok: 'Duplicate', onOk: async v => {
        const nid = newId('canvases'); await put('canvases', nid, { name: clip(v.name, 80), order: now(), created: now(), author: S.me });
        const src = Object.entries(S.els); const map = {}; for (const [id] of src) map[id] = newId('els');
        await step('Duplicating', src.length, async tick => { let i = 0; for (const [id, e] of src) { const d = { ...e, canvasId: nid, fromId: e.fromId ? map[e.fromId] || null : null, toId: e.toId ? map[e.toId] || null : null }; await writeOne(() => col('els').doc(map[id]).set(nul(d))); tick(++i); } });
        openCanvas(nid);
      } });
      const clear = () => openModal({ title: 'Clear this canvas?', body: 'Removes everything drawn on it. You can undo this until you leave the canvas.', danger: true, ok: 'Clear canvas', onOk: () => deleteEls(Object.keys(S.els)) });
      const remove = () => openModal({ title: 'Delete this canvas?', body: `Deletes “${cur.name}” and everything on it. This cannot be undone.`, danger: true, ok: 'Delete canvas', onOk: async () => {
        const ids = Object.keys(S.els); await step('Deleting', ids.length, async tick => { let i = 0; for (const id of ids) { await writeOne(() => col('els').doc(id).delete()); tick(++i); } });
        delete S.canvases[cid]; del('canvases', cid); const next = sortEntries(S.canvases)[0]; openCanvas(next ? next[0] : null);
      } });
      return html`<div class="cv" ...${partAttrs}>
        <div class="cv-bar">
          <label class="label" for="cvsel">Canvas</label>
          <select id="cvsel" class="select" value=${cid} onChange=${e => openCanvas(e.target.value)}>${canvases.map(([id, c]) => html`<option value=${id}>${c.name}</option>`)}</select>
          ${s.canWrite && html`<button class="btn sm" type="button" onClick=${add}>+ New</button>
          <button class="btn ghost sm" type="button" onClick=${rename}>Rename</button>
          <button class="btn ghost sm" type="button" onClick=${dup}>Duplicate</button>
          <button class="btn ghost sm" type="button" onClick=${clear}>Clear</button>
          <button class="btn ghost sm danger" type="button" disabled=${canvases.length < 2} onClick=${remove}>Delete</button>`}
          <span class="spacer"></span>
          <span class="faint" style="font-size:12px">${W.barNote}</span>
        </div>
        <${Board} key=${cid} cid=${cid}/>
      </div>`;
    }
    function Board({ cid }) {
      const s = useS();
      const wrap = useRef(null);
      const [view, setView] = useState(() => ls.get('view:' + cid, { x: 80, y: 40, k: 1 }));
      const [sel, setSel] = useState([]);
      const [draft, setDraft] = useState(null);
      const [preview, setPreview] = useState(null);
      const [marquee, setMarquee] = useState(null);
      const [editing, setEditing] = useState(null);
      const [erasing, setErasing] = useState([]);
      const [panning, setPanning] = useState(false);
      const g = useRef({});
      const ptrs = useRef(new Map());
      const spaceDown = useRef(false);
      const R = useRef({}); // latest values for listeners
      useEffect(() => { const t = setTimeout(() => ls.set('view:' + cid, view), 250); return () => clearTimeout(t); }, [view]);

      const list = Object.entries(s.els).map(([id, e]) => ({ id, ...e, ...((draft && draft[id]) || {}) })).sort((a, b) => (a.z || 0) - (b.z || 0));
      const map = {}; for (const e of list) map[e.id] = e;
      const selected = sel.filter(id => map[id]);
      R.current = { view, sel: selected, list, map, editing };

      const toWorld = (cx, cy) => { const r = wrap.current.getBoundingClientRect(); const v = R.current.view; return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }; };
      const base = () => ({ canvasId: cid, color: S.color, sw: S.sw, z: now(), author: S.me, created: now() });
      const setTool = t => set({ tool: t });
      const zoomAt = (k, cx, cy) => setView(v => { const nk = Math.min(4, Math.max(0.15, k)); const r = wrap.current.getBoundingClientRect(); const px = cx - r.left, py = cy - r.top; const wx = (px - v.x) / v.k, wy = (py - v.y) / v.k; return { k: nk, x: px - wx * nk, y: py - wy * nk }; });
      const fit = () => {
        const L = R.current.list; const r = wrap.current.getBoundingClientRect();
        if (!L.length) { setView({ x: 80, y: 40, k: 1 }); return; }
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const e of L) { const b = bboxOf(e, R.current.map); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
        const k = Math.min(2, Math.max(0.15, Math.min((r.width - 120) / (x2 - x1 || 1), (r.height - 120) / (y2 - y1 || 1))));
        setView({ k, x: (r.width - (x2 - x1) * k) / 2 - x1 * k, y: (r.height - (y2 - y1) * k) / 2 - y1 * k });
      };

      // keyboard
      useEffect(() => {
        const down = e => {
          if (isTyping(e.target) || S.modal) return;
          const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
          if (e.key === ' ' && !spaceDown.current) { spaceDown.current = true; e.preventDefault(); return; }
          if (mod && k === 'z') { e.preventDefault(); if (!S.canWrite) return; e.shiftKey ? redo() : undo(); return; }
          if (mod && k === 'y') { e.preventDefault(); if (S.canWrite) redo(); return; }
          if (mod && k === 'a') { e.preventDefault(); setSel(R.current.list.map(x => x.id)); return; }
          if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
          if (mod) return;
          if ((e.key === 'Delete' || e.key === 'Backspace') && R.current.sel.length && S.canWrite) { e.preventDefault(); deleteEls(R.current.sel); setSel([]); return; }
          if (e.key === 'Escape') { setSel([]); g.current = {}; setPreview(null); setMarquee(null); return; }
          if (e.key === 'Enter' && R.current.sel.length === 1) { const el = R.current.map[R.current.sel[0]]; if (el && el.type === 'ref') openRef(el); else if (el && el.type !== 'path' && !LINEY.includes(el.type)) setEditing(el.id); e.preventDefault(); return; }
          if (e.key === '+' || e.key === '=') { const r = wrap.current.getBoundingClientRect(); zoomAt(R.current.view.k * 1.2, r.left + r.width / 2, r.top + r.height / 2); return; }
          if (e.key === '-') { const r = wrap.current.getBoundingClientRect(); zoomAt(R.current.view.k / 1.2, r.left + r.width / 2, r.top + r.height / 2); return; }
          if (e.shiftKey && e.key === '!') { fit(); return; }
          if (e.shiftKey && (e.key === ')' || e.key === '0')) { const r = wrap.current.getBoundingClientRect(); zoomAt(1, r.left + r.width / 2, r.top + r.height / 2); return; }
          const t = TOOLS.find(x => x && x[2] === k); if (t && (S.canWrite || ['select', 'hand'].includes(t[0]))) setTool(t[0]);
        };
        const up = e => { if (e.key === ' ') spaceDown.current = false; };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
      }, [cid]);

      const openRef = el => { if (cfg.openRef) cfg.openRef(el); };
      function duplicate() {
        const ids = R.current.sel; if (!ids.length || !S.canWrite) return;
        const idm = {}; for (const id of ids) idm[id] = newId('els');
        const docs = ids.map(id => { const e = S.els[id]; const d = { ...e, x: e.x + 24, y: e.y + 24, z: now(), created: now(), author: S.me }; if (LINEY.includes(e.type)) { d.x2 = e.x2 + 24; d.y2 = e.y2 + 24; d.fromId = e.fromId && idm[e.fromId] || null; d.toId = e.toId && idm[e.toId] || null; } return { id: idm[id], data: d }; });
        createEls(docs); setSel(docs.map(d => d.id));
      }
      const commitText = (id, value) => {
        setEditing(null);
        const e = S.els[id]; if (!e) return;
        if (e.type === 'text' && !value.trim()) { deleteEls([id]); return; }
        if (value !== (e.text || '')) updateEls([{ id, before: { text: e.text || '' }, after: { text: value } }]);
      };

      // pointer handling
      const onDown = e => {
        if (R.current.editing) return;
        if (e.target.closest && e.target.closest('.toolrail, .selbar, .zoom, .ed')) return;
        wrap.current.setPointerCapture(e.pointerId); wrap.current.focus({ preventScroll: true });
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.current.size === 2) {
          const [a, b] = [...ptrs.current.values()];
          setDraft(null); setPreview(null); setMarquee(null);
          g.current = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...R.current.view } };
          return;
        }
        if (ptrs.current.size > 2) return;
        const p = toWorld(e.clientX, e.clientY);
        const v = R.current.view; const L = R.current.list; const M = R.current.map;
        let tool = (spaceDown.current || e.button === 1) ? 'hand' : S.tool;
        if (!S.canWrite && tool !== 'hand') tool = 'select';
        if (tool === 'hand') { g.current = { mode: 'pan', c0: { x: e.clientX, y: e.clientY }, v0: { ...v } }; setPanning(true); return; }
        if (tool === 'select') {
          const one = R.current.sel.length === 1 && M[R.current.sel[0]];
          if (one && S.canWrite) {
            const hs = 9 / v.k;
            if (LINEY.includes(one.type)) {
              const [a, b] = endsOf(one, M);
              if (Math.hypot(p.x - a.x, p.y - a.y) <= hs) { g.current = { mode: 'end', id: one.id, which: 'a', orig: S.els[one.id] }; return; }
              if (Math.hypot(p.x - b.x, p.y - b.y) <= hs) { g.current = { mode: 'end', id: one.id, which: 'b', orig: S.els[one.id] }; return; }
            } else if (one.type !== 'path') {
              const b = bboxOf(one, M);
              if (Math.abs(p.x - (b.x + b.w)) <= hs && Math.abs(p.y - (b.y + b.h)) <= hs) { g.current = { mode: 'resize', id: one.id, orig: S.els[one.id], b0: b, p0: p }; return; }
            }
          }
          const hit = hitTest(p, L, M, v.k);
          if (hit) {
            let ns = R.current.sel;
            if (e.shiftKey) ns = ns.includes(hit.id) ? ns.filter(x => x !== hit.id) : [...ns, hit.id];
            else if (!ns.includes(hit.id)) ns = [hit.id];
            setSel(ns);
            if (!S.canWrite) { if (hit.type === 'ref' && e.detail >= 2) openRef(hit); return; }
            g.current = { mode: 'move', ids: ns, p0: p, orig: Object.fromEntries(ns.map(id => [id, S.els[id]])), moved: false };
          } else {
            if (!e.shiftKey) setSel([]);
            g.current = { mode: 'marquee', p0: p, base: e.shiftKey ? R.current.sel : [] }; setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
          }
          return;
        }
        if (tool === 'pen' || tool === 'marker') { g.current = { mode: 'draw', hl: tool === 'marker', pts: [p.x, p.y] }; setPreview({ type: 'path', x: 0, y: 0, pts: [p.x, p.y], color: S.color, sw: tool === 'marker' ? 16 : S.sw, hl: tool === 'marker' }); return; }
        if (tool === 'eraser') { g.current = { mode: 'erase', ids: new Set() }; const h = hitTest(p, L, M, v.k); if (h) { g.current.ids.add(h.id); setErasing([h.id]); } return; }
        if (['rect', 'ellipse', 'diamond'].includes(tool)) { g.current = { mode: 'shape', type: tool, p0: p }; setPreview({ type: tool, x: p.x, y: p.y, w: 0, h: 0, color: S.color, sw: S.sw, fill: S.fill }); return; }
        if (LINEY.includes(tool)) { const h = hitTest(p, L, M, v.k, x => !BOXY.includes(x.type)); g.current = { mode: 'line', type: tool, p0: p, fromId: h ? h.id : null }; setPreview({ type: tool, x: p.x, y: p.y, x2: p.x, y2: p.y, fromId: h ? h.id : null, color: S.color, sw: Math.max(2, S.sw) }); return; }
        if (tool === 'text' || tool === 'sticky') { g.current = { mode: 'place', type: tool, p0: p }; return; }
      };
      const onMove = e => {
        if (!ptrs.current.has(e.pointerId)) return;
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const G = g.current; if (!G.mode) return;
        if (G.mode === 'pinch') {
          const [a, b] = [...ptrs.current.values()]; if (!b) return;
          const d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const r = wrap.current.getBoundingClientRect(); const v0 = G.v0;
          const k = Math.min(4, Math.max(0.15, v0.k * d / (G.d0 || 1)));
          const wx = (G.c0.x - r.left - v0.x) / v0.k, wy = (G.c0.y - r.top - v0.y) / v0.k;
          setView({ k, x: c.x - r.left - wx * k, y: c.y - r.top - wy * k }); return;
        }
        if (G.mode === 'pan') { setView({ ...G.v0, x: G.v0.x + e.clientX - G.c0.x, y: G.v0.y + e.clientY - G.c0.y }); return; }
        const p = toWorld(e.clientX, e.clientY); const v = R.current.view;
        if (G.mode === 'move') {
          const dx = p.x - G.p0.x, dy = p.y - G.p0.y; if (!G.moved && Math.hypot(dx, dy) * v.k < 3) return; G.moved = true;
          const d = {}; for (const id of G.ids) { const o = G.orig[id]; if (!o) continue; d[id] = { x: o.x + dx, y: o.y + dy }; if (LINEY.includes(o.type)) { d[id].x2 = o.x2 + dx; d[id].y2 = o.y2 + dy; } }
          setDraft(d); return;
        }
        if (G.mode === 'marquee') {
          const m = { x: Math.min(p.x, G.p0.x), y: Math.min(p.y, G.p0.y), w: Math.abs(p.x - G.p0.x), h: Math.abs(p.y - G.p0.y) }; setMarquee(m);
          const inside = R.current.list.filter(x => { const b = bboxOf(x, R.current.map); return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h; }).map(x => x.id);
          setSel([...new Set([...G.base, ...inside])]); return;
        }
        if (G.mode === 'resize') {
          const o = G.orig; const w = Math.max(30, G.b0.w + p.x - G.p0.x), h = Math.max(24, G.b0.h + p.y - G.p0.y);
          setDraft({ [G.id]: o.type === 'text' || o.type === 'ref' ? { w } : { w, h } }); return;
        }
        if (G.mode === 'end') { setDraft({ [G.id]: G.which === 'a' ? { x: p.x, y: p.y, fromId: null } : { x2: p.x, y2: p.y, toId: null } }); return; }
        if (G.mode === 'draw') { const q = G.pts; const lx = q[q.length - 2], ly = q[q.length - 1]; if (Math.hypot(p.x - lx, p.y - ly) * v.k < 2) return; q.push(p.x, p.y); setPreview(pv => ({ ...pv, pts: q.slice() })); return; }
        if (G.mode === 'erase') { const h = hitTest(p, R.current.list, R.current.map, v.k); if (h && !G.ids.has(h.id)) { G.ids.add(h.id); setErasing([...G.ids]); } return; }
        if (G.mode === 'shape') { setPreview(pv => ({ ...pv, x: Math.min(p.x, G.p0.x), y: Math.min(p.y, G.p0.y), w: Math.abs(p.x - G.p0.x), h: Math.abs(p.y - G.p0.y) })); return; }
        if (G.mode === 'line') { setPreview(pv => ({ ...pv, x2: p.x, y2: p.y })); return; }
      };
      const onUp = e => {
        ptrs.current.delete(e.pointerId);
        const G = g.current; if (!G.mode) return;
        if (G.mode === 'pinch') { if (ptrs.current.size === 0) g.current = {}; return; }
        g.current = {};
        const cancelled = e.type === 'pointercancel';
        const p = toWorld(e.clientX, e.clientY); const v = R.current.view;
        if (G.mode === 'pan') { setPanning(false); return; }
        if (G.mode === 'move') {
          setDraft(null);
          if (!G.moved || cancelled) { if (!G.moved && e.detail >= 2) { const el = R.current.map[G.ids[G.ids.length - 1]]; if (el && el.type === 'ref') openRef(el); } return; }
          const dx = p.x - G.p0.x, dy = p.y - G.p0.y;
          updateEls(G.ids.filter(id => G.orig[id]).map(id => { const o = G.orig[id]; const before = { x: o.x, y: o.y }, after = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }; if (LINEY.includes(o.type)) { before.x2 = o.x2; before.y2 = o.y2; after.x2 = Math.round(o.x2 + dx); after.y2 = Math.round(o.y2 + dy); } return { id, before, after }; }));
          return;
        }
        if (G.mode === 'marquee') { setMarquee(null); return; }
        if (G.mode === 'resize') { const d = draft && draft[G.id]; setDraft(null); if (d && !cancelled) { const before = {}; for (const k in d) before[k] = G.orig[k] ?? null; updateEls([{ id: G.id, before, after: Object.fromEntries(Object.entries(d).map(([k, x]) => [k, Math.round(x)])) }]); } return; }
        if (G.mode === 'end') {
          setDraft(null); if (cancelled) return;
          const o = G.orig; const h = hitTest(p, R.current.list, R.current.map, v.k, x => !BOXY.includes(x.type) || x.id === o.id);
          const after = G.which === 'a' ? { x: Math.round(p.x), y: Math.round(p.y), fromId: h ? h.id : null } : { x2: Math.round(p.x), y2: Math.round(p.y), toId: h ? h.id : null };
          const before = {}; for (const k in after) before[k] = o[k] ?? null;
          updateEls([{ id: o.id, before, after }]); return;
        }
        if (G.mode === 'draw') {
          setPreview(null); if (cancelled) return;
          const q = G.pts; let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (let i = 0; i < q.length; i += 2) { x1 = Math.min(x1, q[i]); y1 = Math.min(y1, q[i + 1]); x2 = Math.max(x2, q[i]); y2 = Math.max(y2, q[i + 1]); }
          const pts = q.map((n, i) => Math.round((n - (i % 2 ? y1 : x1)) * 10) / 10);
          createEls([{ id: newId('els'), data: { ...base(), type: 'path', x: Math.round(x1 * 10) / 10, y: Math.round(y1 * 10) / 10, w: x2 - x1, h: y2 - y1, pts, sw: G.hl ? 16 : S.sw, hl: G.hl } }]);
          return;
        }
        if (G.mode === 'erase') { setErasing([]); if (!cancelled && G.ids.size) { deleteEls([...G.ids]); setSel([]); } return; }
        if (G.mode === 'shape') {
          setPreview(null); if (cancelled) return;
          let x = Math.min(p.x, G.p0.x), y = Math.min(p.y, G.p0.y), w = Math.abs(p.x - G.p0.x), h = Math.abs(p.y - G.p0.y);
          if (w * v.k < 6 && h * v.k < 6) { w = 160; h = 100; x = G.p0.x - 80; y = G.p0.y - 50; }
          const id = newId('els'); createEls([{ id, data: { ...base(), type: G.type, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), fill: S.fill, text: '' } }]);
          setSel([id]); setTool('select'); return;
        }
        if (G.mode === 'line') {
          setPreview(null); if (cancelled) return;
          if (Math.hypot(p.x - G.p0.x, p.y - G.p0.y) * v.k < 8) return;
          const h = hitTest(p, R.current.list, R.current.map, v.k, x => !BOXY.includes(x.type) || x.id === G.fromId);
          const id = newId('els'); createEls([{ id, data: { ...base(), type: G.type, x: Math.round(G.p0.x), y: Math.round(G.p0.y), x2: Math.round(p.x), y2: Math.round(p.y), fromId: G.fromId, toId: h ? h.id : null, sw: Math.max(2, S.sw) } }]);
          setSel([id]); return;
        }
        if (G.mode === 'place' && !cancelled) {
          const id = newId('els');
          const data = G.type === 'sticky' ? { ...base(), type: 'sticky', tint: S.tint, x: Math.round(G.p0.x - 100), y: Math.round(G.p0.y - 70), w: 200, h: 140, text: '' } : { ...base(), type: 'text', x: Math.round(G.p0.x), y: Math.round(G.p0.y - 14), w: 280, h: 0, fs: 20, font: 'sans', text: '' };
          createEls([{ id, data }]); setSel([id]); setEditing(id); setTool('select');
        }
      };
      const onWheel = e => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) zoomAt(R.current.view.k * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
        else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      };
      const onDbl = e => {
        if (!S.canWrite) return;
        const p = toWorld(e.clientX, e.clientY); const h = hitTest(p, R.current.list, R.current.map, R.current.view.k);
        if (h && h.type === 'ref') { openRef(h); return; }
        if (h && h.type !== 'path' && !LINEY.includes(h.type)) { setSel([h.id]); setEditing(h.id); return; }
        if (!h && S.tool === 'select') { const id = newId('els'); createEls([{ id, data: { ...base(), type: 'text', x: Math.round(p.x), y: Math.round(p.y - 14), w: 280, h: 0, fs: 20, font: 'sans', text: '' } }]); setSel([id]); setEditing(id); }
      };
      useEffect(() => { const w = wrap.current; if (!w) return; w.addEventListener('wheel', onWheel, { passive: false }); return () => w.removeEventListener('wheel', onWheel); }, []);

      // selection toolbar actions
      const selEls = selected.map(id => map[id]).filter(Boolean);
      const applyToSel = (fn) => { const ch = []; for (const e of selEls) { const after = fn(e); if (!after) continue; const before = {}; for (const k in after) before[k] = S.els[e.id][k] ?? null; ch.push({ id: e.id, before, after }); } updateEls(ch); };
      const setColor = c => { set({ color: c }); if (selEls.length) applyToSel(e => e.type === 'sticky' || e.type === 'ref' ? null : { color: c }); };
      const setTint = t => { set({ tint: t }); if (selEls.length) applyToSel(e => e.type === 'sticky' ? { tint: t } : null); };
      const setFill = f => { set({ fill: f }); if (selEls.length) applyToSel(e => ['rect', 'ellipse', 'diamond'].includes(e.type) ? { fill: f } : null); };
      const setSw = w => { set({ sw: w }); if (selEls.length) applyToSel(e => ['path', 'rect', 'ellipse', 'diamond', 'line', 'arrow'].includes(e.type) && !e.hl ? { sw: w } : null); };
      const setFont = f => applyToSel(e => e.type === 'text' ? { font: f } : null);
      const setFs = d => applyToSel(e => e.type === 'text' ? { fs: Math.max(10, Math.min(96, (e.fs || 20) + d)) } : null);
      const front = () => { let z = now(); applyToSel(() => ({ z: z++ })); };
      const back = () => { let z = Math.min(0, ...list.map(x => x.z || 0)) - selEls.length - 1; applyToSel(() => ({ z: z++ })); };

      const v = view;
      const T = `translate(${v.x} ${v.y}) scale(${v.k})`;
      const shapeEl = e => {
        const st = `stroke:var(--c-${e.color || 'ink'});fill:${fillOf(e)}`; const sw = e.sw || 2; const cls = erasing.includes(e.id) ? 'el erasing' : '';
        if (e.type === 'rect') return html`<rect key=${e.id} class=${cls} x=${e.x} y=${e.y} width=${Math.max(1, e.w)} height=${Math.max(1, e.h)} rx="8" style=${st} stroke-width=${sw}/>`;
        if (e.type === 'ellipse') return html`<ellipse key=${e.id} class=${cls} cx=${e.x + e.w / 2} cy=${e.y + e.h / 2} rx=${Math.max(1, e.w / 2)} ry=${Math.max(1, e.h / 2)} style=${st} stroke-width=${sw}/>`;
        if (e.type === 'diamond') return html`<polygon key=${e.id} class=${cls} points=${`${e.x + e.w / 2},${e.y} ${e.x + e.w},${e.y + e.h / 2} ${e.x + e.w / 2},${e.y + e.h} ${e.x},${e.y + e.h / 2}`} style=${st} stroke-width=${sw} stroke-linejoin="round"/>`;
        if (LINEY.includes(e.type)) { const [a, b] = endsOf(e, map); return html`<g key=${e.id} class=${cls}><line x1=${a.x} y1=${a.y} x2=${b.x} y2=${b.y} style=${`stroke:var(--c-${e.color || 'ink'})`} stroke-width=${sw} stroke-linecap="round"/>${e.type === 'arrow' ? html`<polygon points=${arrowHead(a, b, sw)} style=${`fill:var(--c-${e.color || 'ink'})`}/>` : ''}</g>`; }
        return null;
      };
      const inkEl = e => html`<path key=${e.id} class=${erasing.includes(e.id) ? 'el erasing' : ''} d=${pathD(e)} fill="none" style=${`stroke:var(--c-${e.color || 'ink'})`} stroke-width=${e.sw || 3} stroke-linecap="round" stroke-linejoin="round" opacity=${e.hl ? 0.32 : 1}/>`;
      const htmlEl = e => {
        if (editing === e.id) return null;
        const er = erasing.includes(e.id) ? ' erasing' : '';
        const pos = `left:${e.x}px;top:${e.y}px;width:${e.w}px;`;
        const measure = node => { if (node) { const h = node.offsetHeight; if (h) measured[e.id] = h; } };
        if (e.type === 'text') return html`<div key=${e.id} ref=${measure} class=${'el el-text f-' + (e.font || 'sans') + er} style=${pos + `font-size:${e.fs || 20}px;color:var(--c-${e.color || 'ink'})`}>${e.text || ' '}</div>`;
        if (e.type === 'sticky') return html`<div key=${e.id} ref=${measure} class=${'el el-sticky tint-' + (e.tint || 'yellow') + er} style=${pos + `min-height:${e.h || 140}px`}>${e.text}</div>`;
        if (['rect', 'ellipse', 'diamond'].includes(e.type)) return e.text ? html`<div key=${e.id} class=${'el el-label' + er} style=${pos + `height:${e.h}px;color:var(--c-${e.color === 'ink' ? 'ink' : e.color || 'ink'})`}>${e.text}</div>` : null;
        if (e.type === 'ref') return cfg.renderRef ? cfg.renderRef(e, { pos, er, measure, s }) : null;
        return null;
      };
      const ed = editing && map[editing];
      const edBox = ed && bboxOf(ed, map);
      const selBoxes = selEls.map(e => ({ e, b: bboxOf(e, map) }));
      const hsz = 9 / v.k;
      const curTool = spaceDown.current ? 'hand' : s.tool;
      const kinds = new Set(selEls.map(e => e.type));
      const hasShape = [...kinds].some(t => ['rect', 'ellipse', 'diamond'].includes(t));
      const hasStroke = [...kinds].some(t => ['path', 'rect', 'ellipse', 'diamond', 'line', 'arrow'].includes(t));
      return html`<div class=${`surface t-${curTool} ${panning ? 'panning' : ''}`} ref=${wrap} tabIndex="0" aria-label="Canvas. Use the tool bar or keyboard shortcuts to draw."
          style=${`background-image:radial-gradient(var(--dot) ${Math.max(0.8, v.k)}px, transparent 0);background-size:${24 * v.k}px ${24 * v.k}px;background-position:${v.x}px ${v.y}px`}
          onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp} onDblClick=${onDbl} onContextMenu=${e => e.preventDefault()}>
        <svg class="layer" aria-hidden="true"><g transform=${T}>${list.filter(e => ['rect', 'ellipse', 'diamond', 'line', 'arrow'].includes(e.type)).map(shapeEl)}${preview && preview.type !== 'path' ? shapeEl({ ...preview, id: '_pv' }) : ''}</g></svg>
        <div class="layer html" style=${`transform:translate(${v.x}px,${v.y}px) scale(${v.k})`}>
          ${list.filter(e => ['text', 'sticky', 'ref', 'rect', 'ellipse', 'diamond'].includes(e.type)).map(htmlEl)}
          ${ed && html`<${Editor} key=${ed.id} e=${ed} box=${edBox} onDone=${val => commitText(ed.id, val)}/>`}
        </div>
        <svg class="layer" aria-hidden="true"><g transform=${T}>
          ${list.filter(e => e.type === 'path').map(inkEl)}
          ${preview && preview.type === 'path' ? html`<path d=${pathD({ ...preview, x: 0, y: 0 })} fill="none" style=${`stroke:var(--c-${preview.color})`} stroke-width=${preview.sw} stroke-linecap="round" stroke-linejoin="round" opacity=${preview.hl ? 0.32 : 1}/>` : ''}
          ${selBoxes.map(({ e, b }) => LINEY.includes(e.type) ? (() => { const [a, c] = endsOf(e, map); return html`<g key=${'s' + e.id}><circle cx=${a.x} cy=${a.y} r=${hsz * 0.7} style="fill:var(--panel);stroke:var(--accent)" stroke-width=${1.5 / v.k}/><circle cx=${c.x} cy=${c.y} r=${hsz * 0.7} style="fill:var(--panel);stroke:var(--accent)" stroke-width=${1.5 / v.k}/></g>`; })()
            : html`<g key=${'s' + e.id}><rect x=${b.x - 4 / v.k} y=${b.y - 4 / v.k} width=${b.w + 8 / v.k} height=${b.h + 8 / v.k} fill="none" style="stroke:var(--accent)" stroke-width=${1.5 / v.k} stroke-dasharray=${`${5 / v.k} ${4 / v.k}`} rx=${4 / v.k}/>${selBoxes.length === 1 && e.type !== 'path' && s.canWrite ? html`<rect x=${b.x + b.w - hsz / 2} y=${b.y + b.h - hsz / 2} width=${hsz} height=${hsz} rx=${2 / v.k} style="fill:var(--panel);stroke:var(--accent)" stroke-width=${1.5 / v.k}/>` : ''}</g>`)}
          ${marquee && html`<rect x=${marquee.x} y=${marquee.y} width=${marquee.w} height=${marquee.h} style="fill:var(--accent-soft);stroke:var(--accent)" fill-opacity="0.35" stroke-width=${1 / v.k}/>`}
        </g></svg>

        ${s.canWrite ? html`<div class="toolrail" role="toolbar" aria-label="Tools">
          ${TOOLS.map(t => t ? html`<button type="button" title=${t[1]} aria-label=${t[1]} aria-pressed=${s.tool === t[0]} onClick=${() => setTool(t[0])}>${I[t[0]]}</button>` : html`<hr/>`)}
          <hr/>
          <div class="swatches" role="group" aria-label="Colour">${COLORS.map(c => html`<button type="button" class="sw" title=${c} aria-label=${'Colour ' + c} aria-pressed=${s.color === c} style=${`background:var(--c-${c})`} onClick=${() => setColor(c)}></button>`)}</div>
          ${s.tool === 'sticky' && html`<div class="swatches" role="group" aria-label="Sticky colour">${TINTS.map(t => html`<button type="button" class=${'sw tint-' + t} title=${t} aria-label=${'Sticky ' + t} aria-pressed=${s.tint === t} onClick=${() => setTint(t)}></button>`)}</div>`}
          <hr/>
          <button type="button" title="Undo (Ctrl/⌘ Z)" aria-label="Undo" disabled=${!H.undo.length} onClick=${undo}>${I.undo}</button>
          <button type="button" title="Redo (Ctrl/⌘ Shift Z)" aria-label="Redo" disabled=${!H.redo.length} onClick=${redo}>${I.redo}</button>
        </div>` : ''}

        ${selEls.length > 0 && s.canWrite && html`<div class="selbar" role="toolbar" aria-label="Selection">
          <span class="n">${selEls.length} selected</span>
          ${[...kinds].some(t => !['sticky', 'ref'].includes(t)) && COLORS.map(c => html`<button type="button" class="sw" aria-label=${'Colour ' + c} style=${`background:var(--c-${c})`} onClick=${() => setColor(c)}></button>`)}
          ${kinds.has('sticky') && TINTS.map(t => html`<button type="button" class=${'sw tint-' + t} aria-label=${'Sticky ' + t} onClick=${() => setTint(t)}></button>`)}
          ${hasStroke && html`<select class="select" style="width:auto;padding:2px 6px" aria-label="Stroke width" value=${String(s.sw)} onChange=${e => setSw(Number(e.target.value))}>${[[2, 'Thin'], [3, 'Medium'], [5, 'Bold'], [8, 'Heavy']].map(([w, l]) => html`<option value=${w}>${l}</option>`)}</select>`}
          ${hasShape && html`<select class="select" style="width:auto;padding:2px 6px" aria-label="Fill" value=${s.fill} onChange=${e => setFill(e.target.value)}><option value="none">No fill</option><option value="tint">Tint</option><option value="solid">Solid</option></select>`}
          ${kinds.has('text') && html`<select class="select" style="width:auto;padding:2px 6px" aria-label="Font" onChange=${e => setFont(e.target.value)}><option value="">Font…</option><option value="sans">Sans</option><option value="display">Heading</option><option value="hand">Hand</option><option value="mono">Mono</option></select><button class="btn ghost sm" type="button" aria-label="Smaller text" onClick=${() => setFs(-2)}>A−</button><button class="btn ghost sm" type="button" aria-label="Larger text" onClick=${() => setFs(2)}>A+</button>`}
          ${selEls.length === 1 && selEls[0].type === 'ref' && html`<button class="btn ghost sm" type="button" onClick=${() => openRef(selEls[0])}>Open</button>`}
          <button class="btn ghost sm" type="button" title="Bring to front" onClick=${front}>Front</button>
          <button class="btn ghost sm" type="button" title="Send to back" onClick=${back}>Back</button>
          <button class="btn ghost sm" type="button" title="Duplicate (Ctrl/⌘ D)" onClick=${duplicate}>Duplicate</button>
          <button class="btn ghost sm danger" type="button" title="Delete (Del)" onClick=${() => { deleteEls(selected); setSel([]); }}>Delete</button>
        </div>`}

        <div class="zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick=${() => { const r = wrap.current.getBoundingClientRect(); zoomAt(v.k / 1.2, r.left + r.width / 2, r.top + r.height / 2); }}>−</button>
          <button type="button" title="Reset to 100% (Shift 0)" onClick=${() => { const r = wrap.current.getBoundingClientRect(); zoomAt(1, r.left + r.width / 2, r.top + r.height / 2); }}>${Math.round(v.k * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick=${() => { const r = wrap.current.getBoundingClientRect(); zoomAt(v.k * 1.2, r.left + r.width / 2, r.top + r.height / 2); }}>+</button>
          <button type="button" title="Fit everything (Shift 1)" onClick=${fit}>Fit</button>
        </div>
        ${!list.length && html`<div class="hint">${W.empty}</div>`}
      </div>`;
    }
    function Editor({ e, box, onDone }) {
      const [v, setV] = useState(e.text || '');
      const ref = useRef(null);
      const done = useRef(false);
      useEffect(() => { const t = ref.current; if (t) { t.focus(); t.select(); } }, []);
      useLayoutEffect(() => { const t = ref.current; if (t && (e.type === 'text' || e.type === 'sticky')) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 4, e.type === 'sticky' ? (e.h || 140) : 36) + 'px'; } }, [v]);
      const finish = () => { if (done.current) return; done.current = true; onDone(v); };
      const shape = ['rect', 'ellipse', 'diamond'].includes(e.type);
      const st = `left:${box.x}px;top:${box.y}px;width:${Math.max(box.w, 120)}px;` + (shape ? `height:${box.h}px;text-align:center;` : '') + (e.type === 'text' ? `font-size:${e.fs || 20}px;` : e.type === 'sticky' ? 'font-size:17px;' : '');
      return html`<textarea ref=${ref} class=${'ed' + (e.type === 'sticky' ? ' on-sticky tint-' + (e.tint || 'yellow') : '')} style=${st} value=${v} aria-label="Edit text"
        onInput=${x => setV(x.target.value)} onBlur=${finish} onPointerDown=${x => x.stopPropagation()}
        onKeyDown=${x => { x.stopPropagation(); if (x.key === 'Escape' || (x.key === 'Enter' && (x.metaKey || x.ctrlKey))) { x.preventDefault(); finish(); } }}></textarea>`;
    }
    return { CanvasView, Board, ensureCanvas, openCanvas, closeCanvas, sendToCanvas, undo, redo };
  },
});
})();
/* /part:page.script.kit.canvas */
