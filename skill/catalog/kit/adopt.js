/* part:page.script.kit.adopt */
/**
 * Adopt engine
 * The rules of adopting an artifact as kits, with no view: the candidate states and the moves between them, a layered layout of the dependency graph, which candidate owns a DOM element, a summary of counts, a check of a .adp pack and a download.
 *
 * A candidate is a record from `adp.py extract` (docs/adopt.md): {id, name, state, files [{path, sha256, bytes}], provides, needs, needed_by, classes, similar, ...}. The page keeps the person's decisions
 * (state, notes) beside it in the db; this file only knows what a decision means.
 *
 * API:
 *   Kit.adopt.STATES                      ['detected', 'selected', 'working', 'preview', 'ready', 'discarded']
 *   Kit.adopt.MOVES                       {state: [{to, label}]}: what a person may do from each state
 *   Kit.adopt.can(from, to) -> boolean    Kit.adopt.label(state) -> the word    Kit.adopt.tone(state) -> ok | warn | accent | muted | ''
 *   Kit.adopt.merge(candidates, overlay)  -> candidates with {state, notes} from overlay {id: {state, notes, classes?, ids?, at}}; a state that is not in STATES is ignored;
 *                                          classes and ids in the overlay (what a person assigned by clicking in the preview) are added to the candidate's own
 *   Kit.adopt.counts(candidates)          -> {state: n, all: n}
 *   Kit.adopt.layout(candidates, {colW, rowH, nodeW, nodeH, pad, width}) -> {nodes [{id, x, y, w, h, layer}], edges [{from, to}], width, height}
 *                                          layer 0 holds candidates that need nothing; an edge runs from what is needed to what needs it;
 *                                          width (pixels available) spreads the columns across it and widens the nodes
 *   Kit.adopt.ADOPTED / adopted(state)    the states that count as adopting: selected, working, preview, ready
 *   Kit.adopt.closure(candidates)         -> {on: {id: true}, required: {id: [adopted ids that need it]}, conflicts: [id]}: what adopting asks for;
 *                                          a conflict is needed by an adopted candidate and discarded
 *   Kit.adopt.edgeKind(edge, byId, closure) -> 'on' | 'conflict' | 'off' | '': how an edge of the layout reads
 *   Kit.adopt.index(candidates)           -> {classes: {class: id}, ids: {dom id: id}}
 *   Kit.adopt.ownerOf(el, index)          -> {id, via, value} for the nearest element at or above el whose class or id a candidate owns, else {id: null}
 *   Kit.adopt.verifyPack(pack)            -> Promise<[problem]> ([] when every file's sha256 and size match; needs crypto.subtle)
 *   Kit.adopt.download(name, text, type)  saves text as a file in the browser
 *
 * @id        kit.adopt
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.3.0
 * @updated   2026-11-15
 * @summary   The adopt flow without a view: candidate states and moves, what adopting requires of the rest, a layered graph layout, which candidate owns a DOM element, counts, a .adp pack check and a download.
 * @tags      adopt, extract, candidates, state machine, graph, layout, pack, adp
 * @requires  none
 * @files     none
 * @provides  Kit.adopt.STATES, Kit.adopt.ADOPTED, Kit.adopt.MOVES, Kit.adopt.can, Kit.adopt.adopted, Kit.adopt.label, Kit.adopt.tone, Kit.adopt.merge, Kit.adopt.counts, Kit.adopt.layout, Kit.adopt.closure, Kit.adopt.edgeKind, Kit.adopt.index, Kit.adopt.ownerOf, Kit.adopt.verifyPack, Kit.adopt.download
 * @config    Kit.adopt.layout(candidates, opts) | colW, rowH, nodeW, nodeH, pad, width (pixels; width fills the space given)
 * @tokens    none
 * @globals   none
 * @db        none
 * @source    Adopt workbench, 2026-11-15 | docs/adopt.md | the states and the owner-by-class rule of the adopt flow
 * @changed   merge adds the classes and ids a person assigned to a candidate; closure and edgeKind say what adopting requires of other candidates; layout takes the width available.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const STATES = ['detected', 'selected', 'working', 'preview', 'ready', 'discarded'];
const MOVES = {
  detected:  [{ to: 'selected', label: 'Select' }, { to: 'discarded', label: 'Discard' }],
  selected:  [{ to: 'working', label: 'Work on it' }, { to: 'discarded', label: 'Discard' }],
  working:   [{ to: 'preview', label: 'Show preview' }, { to: 'discarded', label: 'Discard' }],
  preview:   [{ to: 'ready', label: 'Mark ready' }, { to: 'working', label: 'Keep working' }, { to: 'discarded', label: 'Discard' }],
  ready:     [{ to: 'working', label: 'Reopen' }],
  discarded: [{ to: 'detected', label: 'Restore' }],
};
const WORD = { detected: 'Detected', selected: 'Selected', working: 'Working', preview: 'Preview', ready: 'Ready', discarded: 'Discarded' };
const TONE = { detected: '', selected: 'accent', working: 'warn', preview: 'accent', ready: 'ok', discarded: 'muted' };

const can = (from, to) => (MOVES[from] || []).some(m => m.to === to);
const label = s => WORD[s] || String(s);
const tone = s => (s in TONE ? TONE[s] : '');

function merge(cands, overlay) {
  overlay = overlay || {};
  return (cands || []).map(c => {
    const o = overlay[c.id] || {};
    const more = (a, b) => (Array.isArray(b) && b.length ? (a || []).concat(b.filter(x => (a || []).indexOf(x) < 0)) : a);      // what the person assigned in the preview adds to what the analysis found
    return Object.assign({}, c, { state: STATES.indexOf(o.state) >= 0 ? o.state : (c.state || 'detected'), notes: o.notes || c.notes || '', classes: more(c.classes, o.classes), ids: more(c.ids, o.ids) });
  });
}

function counts(cands) {
  const n = { all: 0 }; STATES.forEach(s => { n[s] = 0; });
  (cands || []).forEach(c => { n.all++; if (c.state in n) n[c.state]++; });
  return n;
}

/* Layer = the longest chain of needs below a candidate; a cycle is cut where it is found, so the layout always ends. */
function layout(cands, opts) {
  const o = Object.assign({ colW: 220, rowH: 76, nodeW: 180, nodeH: 54, pad: 16, width: 0 }, opts), by = {}, depth = {}, busy = {};
  (cands || []).forEach(c => { by[c.id] = c; });
  const d = id => {
    if (id in depth) return depth[id];
    if (busy[id]) return 0;
    busy[id] = true;
    const needs = ((by[id] && by[id].needs) || []).filter(n => by[n]);
    depth[id] = needs.length ? 1 + Math.max.apply(null, needs.map(d)) : 0;
    busy[id] = false;
    return depth[id];
  };
  const layers = [];
  (cands || []).forEach(c => { const l = d(c.id); (layers[l] = layers[l] || []).push(c); });
  if (o.width && layers.length > 1) {      // fill the width given: the columns spread, and the nodes grow with them up to 300 px
    const room = o.width - 2 * o.pad, gaps = layers.length - 1;
    o.nodeW = Math.min(300, Math.max(o.nodeW, Math.floor(0.78 * (room - o.nodeW) / gaps)));      // the node width first, then the columns that leave the last node inside the width
    o.colW = Math.max(o.colW, Math.floor((room - o.nodeW) / gaps));
  }
  const nodes = [];
  layers.forEach((col, l) => (col || []).sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).forEach((c, i) => nodes.push({ id: c.id, layer: l, x: o.pad + l * o.colW, y: o.pad + i * o.rowH, w: o.nodeW, h: o.nodeH })));
  const edges = [];
  (cands || []).forEach(c => (c.needs || []).forEach(n => { if (by[n]) edges.push({ from: n, to: c.id }); }));
  const rows = Math.max.apply(null, [1].concat(layers.map(l => (l || []).length)));
  return { nodes, edges, width: o.pad * 2 + Math.max(layers.length, 1) * o.colW - (o.colW - o.nodeW), height: o.pad * 2 + rows * o.rowH - (o.rowH - o.nodeH) };
}

const ADOPTED = ['selected', 'working', 'preview', 'ready'];
const adopted = s => ADOPTED.indexOf(s) >= 0;

/* What adopting asks for: every candidate an adopted one needs, directly or through others, and is not adopted itself, is required; one that is
   discarded as well is a conflict (the adopted candidate would be packed without what it needs). {on: ids adopted or required, required: {id: [adopted ids that need it]}, conflicts: [id]} */
function closure(cands) {
  const by = {}; (cands || []).forEach(c => { by[c.id] = c; });
  const req = {}, on = {};
  (cands || []).forEach(c => {
    if (!adopted(c.state)) return;
    on[c.id] = true; const seen = {}, stack = (c.needs || []).slice();
    while (stack.length) {
      const n = stack.pop(); if (seen[n] || !by[n]) continue; seen[n] = true; on[n] = true;
      if (!adopted(by[n].state)) (req[n] = req[n] || []).push(c.id);
      (by[n].needs || []).forEach(m => stack.push(m));
    }
  });
  const conflicts = Object.keys(req).filter(id => by[id].state === 'discarded');
  return { on, required: req, conflicts };
}

/* How an edge (from what is needed to what needs it) reads: 'on' (part of an adopted path), 'conflict' (needed but discarded), 'off' (an end is discarded), or ''. */
function edgeKind(e, by, cl) {
  const a = by[e.from], b = by[e.to]; if (!a || !b) return '';
  if (cl.on[e.to] && cl.on[e.from]) return a.state === 'discarded' ? 'conflict' : 'on';
  if (a.state === 'discarded' || b.state === 'discarded') return 'off';
  return '';
}

function index(cands) {
  const classes = {}, ids = {};
  (cands || []).forEach(c => {
    (c.classes || []).forEach(k => { if (!(k in classes)) classes[k] = c.id; });
    (c.ids || []).forEach(k => { if (!(k in ids)) ids[k] = c.id; });
  });
  return { classes, ids };
}

function ownerOf(el, idx) {
  idx = idx || { classes: {}, ids: {} };
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (e.id && idx.ids[e.id]) return { id: idx.ids[e.id], via: 'id', value: e.id };
    const cl = e.classList ? Array.prototype.slice.call(e.classList) : [];
    for (let i = 0; i < cl.length; i++) if (idx.classes[cl[i]]) return { id: idx.classes[cl[i]], via: 'class', value: cl[i] };
  }
  return { id: null };
}

async function verifyPack(pack) {
  const bad = [], enc = new TextEncoder();
  if (!pack || pack.schema !== 'adp-pack/1') return ['not an adp-pack/1 file'];
  if (!(window.crypto && crypto.subtle)) return ['this browser cannot hash files'];
  for (const f of pack.files || []) {
    const b = enc.encode(f.text || ''), h = Array.prototype.map.call(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), x => x.toString(16).padStart(2, '0')).join('');
    if (h !== f.sha256) bad.push('sha256 mismatch ' + f.path);
    if (b.length !== f.bytes) bad.push('size mismatch ' + f.path);
  }
  return bad;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

Kit.adopt = { STATES, ADOPTED, MOVES, can, adopted, label, tone, merge, counts, layout, closure, edgeKind, index, ownerOf, verifyPack, download };
})();
/* /part:page.script.kit.adopt */
