/* part:page.script.kit.view-registry */
/**
 * View registry and layout board
 * Declare data kinds with Kit.views.kind (the fields of a row, typed), register views for a kind with Kit.views.register, then Kit.views.mount(box, {layout, rows}) draws the layout. A block names a kind, a main view, alternative views and the options its main view takes (a filter, columns). Before anything is drawn the layout is validated: an unknown kind, an unregistered view, options on a view that does not take them, a filter on a field the rows lack, a filter on text, or a column the view does not draw is a typed refusal (UNKNOWN_KIND, UNREGISTERED_VIEW, OPTIONS_OUTSIDE_VIEW, UNKNOWN_FIELD, PATH_INTO_CONTENT, INVALID_FIELD, BAD_VALUE, UNKNOWN_COLUMN) and the refusal is drawn instead of a half page. Filters select by enum, number or flag only, never by text. Blocks with alternatives get a switch whose choice is remembered per viewer; board.on(fn) tells a separate switcher when a view changes, and Kit.views.alternatives(block) lists what to offer. The API is documented in the file header.
 *
 * What it is: a page drawn from a layout document instead of from code. The layout lists regions of blocks; each block names a data kind, a registered view of that kind, optional alternative
 * views the viewer can switch between (the choice is remembered per viewer), and the options that view takes (a filter, columns). Everything is checked against the registry before anything is drawn:
 * an unknown kind, an unregistered view, options on the wrong view, a filter on a field the rows do not have, a filter on text, or a column the view does not draw is a typed refusal with a code,
 * never a silent blank. Filters select by enum, number or flag only, never by text. Plain DOM; every text is set with textContent.
 *
 * THE API (small and stable; a view switcher or a layout editor builds on exactly these)
 *   Kit.views.kind(id, {label, fields})              declare a data kind and the shape of its rows
 *       fields  {name: {type: "enum", values: [...]} | {type: "integer"} | {type: "bool"} | {type: "string"} | {type: "content"} | {type: "message", fields: {...}}}
 *               enum, integer and bool can be filtered on; string and content cannot (content is free text that must never decide anything); message nests (reach it with a dotted path, "owner.team")
 *   Kit.views.register({kind, name, label, form, options, columns, render})   register a view of a kind; the same kind and name replaces; returns the view (frozen)
 *       label    the word on the switcher (default name)      form     a free tag for the shape ("lanes", "table", "feed") that a switcher can show as an icon
 *       options  the one options arm this view takes in a layout block ("table", "lanes", "cards" ...), or null when it takes none
 *       columns  the field paths a "columns" option may name (for a table-like view)
 *       render   (box, ctx) -> {update(ctx), destroy()} | void     ctx = {rows, options, block, kind}; rows are already filtered; without render the block draws a designed "no renderer yet" empty state
 *   Kit.views.get(kind, name) -> view | null      Kit.views.list(kind?) -> [view]      Kit.views.kinds() -> [{id, label, fields}]      Kit.views.arms() -> [arm names a block may carry]
 *   Kit.views.alternatives(block) -> [view names]      the block's main view first, then each of block.view.views not already named: what a switcher offers
 *   Kit.views.validate(layout) -> [{block, code, view?, arm?, field?}]      [] when the layout is sound
 *       codes: UNKNOWN_KIND, UNREGISTERED_VIEW, OPTIONS_OUTSIDE_VIEW, UNKNOWN_FIELD, PATH_INTO_CONTENT, INVALID_FIELD (the filter's last field is text, a list or a message), BAD_VALUE, UNKNOWN_COLUMN
 *       field is the path inside the layout, "regions[0].blocks[1].view.table.filter[0].field"
 *   Kit.views.describe(problem) -> one plain sentence for a person
 *   Kit.views.checkFilter(kind, filter) -> [{code, field}]      filter = [{field, op: "eq" | "ne" | "in" | "gte" | "lte", value}]  ("in" takes an array, "gte" and "lte" only an integer field)
 *   Kit.views.filter(kind, rows, filter) -> rows      applies a sound filter (throws Kit.views.Refused with .problems when it is not)
 *   Kit.views.mount(box, {layout, rows, storageKey, label, onRefuse, onSwitch}) -> board
 *       layout   {regions: [{id, shape, columns, blocks: [{id, title, view: {data, view, views: [alts], <arm>: {filter, columns}}}]}]}
 *                shape: "row" (blocks side by side), "columns" or "stack" (one under another), "grid" (region.columns across, default 2)
 *       rows     {kind: [row, ...]}                   storageKey  prefix of the localStorage key that remembers each block's chosen view (none: not remembered)
 *       onRefuse (problems) when the layout is refused; the box then shows the refusal and draws nothing else      onSwitch (blockId, viewName) after a viewer switches
 *       board    {setRows(kind, rows), chosen(blockId) -> name, choose(blockId, name) -> boolean, on(fn) -> off, problems, destroy()}
 *                on(fn): fn(blockId, viewName) after every switch, by a viewer or by choose(); this is the hook a separate switcher uses
 *   Options in a block belong to its main view; an alternative view is drawn with no options.
 *
 * localStorage is used only when storageKey is given; every read and write is guarded.
 *
 * @id        kit.view-registry
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A page drawn from a layout document: regions of blocks, each bound to a data kind and a registered view, with alternative views the viewer can switch between and a validator that refuses what it cannot draw.
 * @tags      layout, registry, views, validator, board, regions, blocks, alternatives, filter, refusal, data-first
 * @requires  kit.tokens
 * @files     kit/view-registry.css, kit/samples/view-registry.json
 * @provides  Kit.views.kind, Kit.views.register, Kit.views.get, Kit.views.list, Kit.views.alternatives, Kit.views.validate, Kit.views.describe, Kit.views.checkFilter, Kit.views.filter, Kit.views.mount, Kit.views.kinds, Kit.views.arms, Kit.views.Refused, Kit.views.ARMS, Kit.views.OPS
 * @config    Kit.views.kind(id, {label, fields}) | fields {name: {type: enum | integer | bool | string | content | message, values, fields}}
 * @config    Kit.views.register({kind, name, label, form, options, columns, render}) | render(box, {rows, options, block, kind}) returns {update(ctx), destroy()}
 * @config    Kit.views.mount(box, {layout, rows, storageKey, label, onRefuse, onSwitch}) | layout {regions: [{id, shape, columns, blocks: [{id, title, view: {data, view, views, <arm>: {filter, columns}}}]}]}; returns {setRows(kind, rows), chosen(id), choose(id, name), on(fn), problems, destroy()}
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2? --accent --accent-ink --danger --f-ui --f-display? --f-mono --seam? --radius-lg?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's Board page | regions and blocks drawn from a layout, and the per-viewer alternative-view switcher
 * @source    Catalog harvest, 2026-10-25 | a component family's view registry and layout validator | the registry by kind and name, and the typed refusals
 * @source    Catalog harvest, 2026-10-25 | a component family's typed filter check | filters over enums, numbers and flags, never text
 * @preview   {"render": "kit.view-registry", "samples": ["kit/samples/view-registry.json"], "uses": ["kit.vocab"]}
 * @changed   Rebuilt without the hub: no protobuf kinds, gateway or skin loader. Kinds and their row shapes are declared by the page, and the refusal codes are plain names.
 * @changed   The switcher and the validator are exposed (alternatives, on, validate, describe) so a separate switcher or layout editor can read the same registry.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const ARMS = ['lanes', 'table', 'timeline', 'graph', 'tree', 'matrix', 'calendar', 'chart', 'feed', 'sequence', 'waterfall', 'list', 'cards', 'stepper'];
const OPS = ['eq', 'ne', 'in', 'gte', 'lte'];
const kinds = Object.create(null), byKind = Object.create(null);
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};

function kind(id, spec) { kinds[id] = Object.freeze({ id, label: (spec && spec.label) || id, fields: (spec && spec.fields) || {} }); return kinds[id]; }
function register(v) {
  if (!v || !v.kind || !v.name) throw new Error('Kit.views.register needs a kind and a name');
  const view = Object.freeze({ kind: v.kind, name: v.name, label: v.label || v.name, form: v.form || '', options: v.options || null, columns: (v.columns || []).slice(), render: typeof v.render === 'function' ? v.render : null });
  (byKind[v.kind] = byKind[v.kind] || Object.create(null))[v.name] = view; return view;
}
const get = (k, n) => (own(byKind, k) && own(byKind[k], n)) ? byKind[k][n] : null;
const list = k => k ? Object.values(byKind[k] || {}) : Object.values(byKind).flatMap(m => Object.values(m));
const arms = () => [...new Set(ARMS.concat(list().map(v => v.options).filter(Boolean)))];
const alternatives = b => { const r = (b && b.view) || {}; return [r.view].concat(r.views || []).filter((n, i, a) => n && a.indexOf(n) === i); };

// walk a dotted path through a kind's fields: {field} | {code}
function resolve(kindId, path) {
  let fields = kinds[kindId] ? kinds[kindId].fields : null, f = null; const names = String(path).split('.');
  for (let i = 0; i < names.length; i++) {
    if (!fields || !own(fields, names[i])) return { code: 'UNKNOWN_FIELD' };
    f = fields[names[i]];
    if (i < names.length - 1) { if (f.type !== 'message') return { code: 'UNKNOWN_FIELD' }; fields = f.fields; }
  }
  if (f.type === 'content') return { code: 'PATH_INTO_CONTENT' };
  if (!['enum', 'integer', 'bool'].includes(f.type)) return { code: 'INVALID_FIELD' };
  return { field: f };
}
function checkFilter(kindId, filter) {
  const out = []; (filter || []).forEach((p, i) => {
    const at = '[' + i + '].field', r = resolve(kindId, p && p.field);
    if (r.code) { out.push({ code: r.code, field: at }); return; }
    const t = r.field.type, vals = p.op === 'in' ? p.value : [p.value];
    if (!OPS.includes(p.op) || ((p.op === 'gte' || p.op === 'lte') && t !== 'integer') || (p.op === 'in' && !Array.isArray(p.value))) { out.push({ code: 'BAD_VALUE', field: '[' + i + '].op' }); return; }
    const bad = vals.some(v => t === 'enum' ? !r.field.values.includes(v) : t === 'integer' ? !Number.isInteger(v) : typeof v !== 'boolean');
    if (bad) out.push({ code: 'BAD_VALUE', field: '[' + i + '].value' });
  });
  return out;
}
const pick = (row, path) => String(path).split('.').reduce((a, k) => (a == null ? undefined : a[k]), row);
function Refused(problems) { const e = new Error('Filter refused: ' + problems.map(p => p.code).join(', ')); e.name = 'Refused'; e.problems = problems; return e; }
function filter(kindId, rows, f) {
  const bad = checkFilter(kindId, f); if (bad.length) throw Refused(bad);
  return rows.filter(row => (f || []).every(p => {
    const v = pick(row, p.field);
    return p.op === 'eq' ? v === p.value : p.op === 'ne' ? v !== p.value : p.op === 'in' ? p.value.includes(v) : p.op === 'gte' ? v >= p.value : v <= p.value;
  }));
}
function validate(layout) {
  const out = [];
  ((layout && layout.regions) || []).forEach((region, ri) => (region.blocks || []).forEach((b, bi) => {
    const ref = b.view || {}, at = 'regions[' + ri + '].blocks[' + bi + '].view.';
    if (!own(kinds, ref.data)) { out.push({ block: b.id, code: 'UNKNOWN_KIND' }); return; }
    const main = get(ref.data, ref.view);
    if (!main) out.push({ block: b.id, code: 'UNREGISTERED_VIEW', view: ref.view });
    (ref.views || []).forEach(a => { if (!get(ref.data, a)) out.push({ block: b.id, code: 'UNREGISTERED_VIEW', view: a }); });
    arms().forEach(arm => {
      if (!own(ref, arm)) return;
      if (main && main.options !== arm) out.push({ block: b.id, code: 'OPTIONS_OUTSIDE_VIEW', arm });
      const op = ref[arm] || {};
      checkFilter(ref.data, op.filter).forEach(p => out.push({ block: b.id, code: p.code, arm, field: at + arm + '.filter' + p.field }));
      (op.columns || []).forEach((c, i) => { if (!main || main.options !== arm || !main.columns.includes(c)) out.push({ block: b.id, code: 'UNKNOWN_COLUMN', arm, field: at + arm + '.columns[' + i + ']' }); });
    });
  }));
  return out;
}
const WORDS = {
  UNKNOWN_KIND: p => 'Block ' + p.block + ' names a kind of data that is not declared.',
  UNREGISTERED_VIEW: p => 'Block ' + p.block + ' asks for the view "' + p.view + '", which is not registered for its kind.',
  OPTIONS_OUTSIDE_VIEW: p => 'Block ' + p.block + ' carries ' + p.arm + ' options, but its main view does not take them.',
  UNKNOWN_FIELD: p => 'Block ' + p.block + ' filters on a field its rows do not have (' + p.field + ').',
  PATH_INTO_CONTENT: p => 'Block ' + p.block + ' filters on free text (' + p.field + '). A filter may use an enum, a number or a flag only.',
  INVALID_FIELD: p => 'Block ' + p.block + ' filters on a field that is not an enum, a number or a flag (' + p.field + ').',
  BAD_VALUE: p => 'Block ' + p.block + ' has a filter value the field cannot hold (' + p.field + ').',
  UNKNOWN_COLUMN: p => 'Block ' + p.block + ' asks for a column the view does not draw (' + p.field + ').',
};
const describe = p => (WORDS[p.code] ? WORDS[p.code](p) : p.code + ' in block ' + p.block);

function mount(box, o) {
  o = Object.assign({ rows: {}, label: 'Board' }, o);
  const problems = validate(o.layout);
  box.textContent = ''; box.classList.add('kit-vw');
  if (problems.length) {
    const r = el('section', 'kit-vw-refuse'); r.setAttribute('role', 'alert');
    r.append(el('h3', null, 'This layout was refused'), el('p', null, problems.length + (problems.length === 1 ? ' problem' : ' problems') + ' found before anything was drawn.'));
    const ul = el('ul'); problems.forEach(p => { const li = el('li'); li.append(el('code', null, p.code), el('span', null, describe(p))); ul.append(li); });
    r.append(ul); box.append(r); if (o.onRefuse) o.onRefuse(problems);
    return { problems, setRows() {}, chosen: () => null, choose: () => false, on: () => () => {}, destroy() { box.textContent = ''; box.classList.remove('kit-vw'); } };
  }
  const blocks = new Map(), listeners = []; let rows = Object.assign({}, o.rows);
  const key = id => o.storageKey ? o.storageKey + ':' + id : null;
  function drawBlock(bs) {
    const { block: b, body } = bs, ref = b.view, v = get(ref.data, bs.name);
    if (bs.inst && bs.inst.destroy) bs.inst.destroy(); bs.inst = null; body.textContent = '';
    const arm = v && v.options && bs.name === ref.view ? (ref[v.options] || {}) : {};
    let data = rows[ref.data] || [];
    try { data = arm.filter ? filter(ref.data, data, arm.filter) : data; } catch (_) { data = []; }
    if (!v || !v.render) { const e = el('div', 'kit-vw-empty'); e.append(el('b', null, 'No renderer for this view yet.'), el('span', null, 'The view "' + bs.name + '" is registered but nothing draws it.')); body.append(e); return; }
    bs.ctx = { rows: data, options: arm, block: b, kind: ref.data };
    bs.inst = v.render(body, bs.ctx) || null;
  }
  function choose(id, name, fromViewer) {
    const bs = blocks.get(id); if (!bs || !alternatives(bs.block).includes(name) || bs.name === name) return !!bs && bs.name === name;
    bs.name = name; if (key(id)) ls.set(key(id), name);
    bs.btns.forEach((b, n) => b.setAttribute('aria-pressed', String(n === name))); drawBlock(bs);
    listeners.slice().forEach(f => f(id, name)); if (fromViewer && o.onSwitch) o.onSwitch(id, name); return true;
  }
  ((o.layout && o.layout.regions) || []).forEach(region => {
    const r = el('div', 'kit-vw-region kit-vw-' + (region.shape || 'stack')); if (region.id) r.dataset.region = region.id;
    if (region.shape === 'grid') r.style.setProperty('--kit-vw-cols', String(region.columns || 2));
    r.style.setProperty('--kit-vw-n', String((region.blocks || []).length));
    (region.blocks || []).forEach(b => {
      const sec = el('section', 'kit-vw-block'), hid = 'kit-vw-' + b.id + '-h'; sec.setAttribute('aria-labelledby', hid);
      const head = el('div', 'kit-vw-head'), h = el('h3', 'kit-vw-title', b.title || b.id); h.id = hid; head.append(h);
      const alts = alternatives(b), stored = key(b.id) ? ls.get(key(b.id)) : null;
      const bs = { block: b, name: alts.includes(stored) ? stored : b.view.view, btns: new Map(), inst: null, body: el('div', 'kit-vw-body') };
      if (alts.length > 1) {
        const sw = el('div', 'kit-vw-sw'); sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'View of ' + (b.title || b.id));
        alts.forEach(n => { const v = get(b.view.data, n), btn = el('button', 'kit-vw-opt', v.label); btn.type = 'button'; btn.setAttribute('aria-pressed', String(n === bs.name)); btn.addEventListener('click', () => choose(b.id, n, true)); sw.append(btn); bs.btns.set(n, btn); });
        head.append(sw);
      }
      sec.append(head, bs.body); r.append(sec); blocks.set(b.id, bs); drawBlock(bs);
    });
    box.append(r);
  });
  return {
    problems, chosen: id => (blocks.get(id) || {}).name || null,
    choose: (id, name) => choose(id, name, false),
    on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    setRows(k, next) { rows[k] = next; blocks.forEach(bs => { if (bs.block.view.data === k) { if (bs.inst && bs.inst.update) { drawCtx(bs); } else drawBlock(bs); } }); },
    destroy() { blocks.forEach(bs => { if (bs.inst && bs.inst.destroy) bs.inst.destroy(); }); box.textContent = ''; box.classList.remove('kit-vw'); },
  };
  function drawCtx(bs) {
    const ref = bs.block.view, v = get(ref.data, bs.name), arm = v && v.options && bs.name === ref.view ? (ref[v.options] || {}) : {};
    let data = rows[ref.data] || []; try { data = arm.filter ? filter(ref.data, data, arm.filter) : data; } catch (_) { data = []; }
    bs.ctx = { rows: data, options: arm, block: bs.block, kind: ref.data }; bs.inst.update(bs.ctx);
  }
}
Kit.views = Object.freeze({ kind, register, get, list, kinds: () => Object.values(kinds), arms, alternatives, validate, describe, checkFilter, filter, mount, Refused, ARMS: ARMS.slice(), OPS: OPS.slice() });
})();
/* /part:page.script.kit.view-registry */
