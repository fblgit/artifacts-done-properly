/* part:page.script.kit.facet-batch */
/**
 * Upgrade: facets with a batch bar
 * An upgrade of pattern.count-filters as new files; count-filters.js and .css are unchanged and still load (the tiles and chips borrow their look). Kit.facetBatch.mount(root, cfg) draws facets from data: the first facet as big count tiles with digit keycaps (press 1 to 9 to switch, 0 to clear), the others as chips. Each chip’s count is worked out with every filter on except its own group, a chip with nothing behind it is disabled unless it is pressed, and a facet takes more than one chip. A search box keeps its caret because it is never redrawn. Group-by makes ordered buckets (expiry bands, say) and a sort orders each. Rows are selectable (Shift extends the range) and a bar at the foot says "3 selected" with Select all shown, the actions and Clear; an action is a cancelable kit-fb-action event the board handles. focus(ids, label) lets another view push in a "show only these" set, with a bar that says so. The default row shows a Kit.seal mini ring and the state pill. matches() and grouped() are pure and exported for tests.
 *
 * The count tiles of count-filters grown into a way to work through a list. Chips whose count says what pressing them gives: each count is worked out with every filter on except its own
 * group, a chip with nothing behind it is disabled (unless it is pressed), and a facet takes more than one chip. Digit keys switch the first facet. A search box that keeps its caret, a group-by with
 * ordered buckets (expiry bands, say), a sort, rows you can select (Shift extends the range), and a bar that acts on the selection: "3 selected", Select all shown, the actions, Clear. Another view
 * can push in a "show only these" set, and a bar says so and lets go of it. The list shows rows with a Kit.seal mini ring when the record has a time left.
 *
 * API (small and stable):
 *   Kit.facetBatch.mount(root, cfg) -> fb
 *     cfg    records            [{id, title, sub, state, left, life, ...your fields}]       id  field name or function (default "id")
 *            facets             [{key, label, field, multi, tiles, allLabel, options: [{value, label, tone, lte, gte, test}]}]
 *                                 an option matches a record when record[field] equals its value (or an array holds it), or when record[field] is <= lte and >= gte, or test(record) is true.
 *                                 tiles: true draws the facet as big count tiles with digit keycaps (the first facet is tiles by default; multi false; allLabel adds an "All" tile)
 *            search             {placeholder, label, fields: [name]} or {text(record)}      omit for no search box
 *            groups, group      [{key, label, field | by(record), bands: [{label, lte}], order: [label], none}] and the key shown first. bands: the first band whose lte holds, in order; the last may have no lte
 *            sorts, sort        [{key, label, field, dir: "asc" | "desc", cmp(a, b)}] and the key used first; a missing value sorts last
 *            row                (record, {selected}) -> Node   replaces the default row
 *            actions            [{key, label, icon, danger}]   the batch bar's buttons
 *            stateEnum          Kit.vocab enum of record.state (default "state")       digitKeys  false turns the digit keys off       label  the region's name
 *            onAction           ({action, ids}) -> false to cancel. The same is sent as a cancelable "kit-fb-action" CustomEvent on root; the board does the work and then calls update()
 *   fb.state() -> {f, q, group, sort, only, selected}      fb.set({f: {key: [values]}, q, group, sort})     fb.focus(ids, label) / fb.clearFocus()   the "show only these" set
 *   fb.select(ids) / fb.selection() / fb.clearSelection()  fb.shown() -> [records] in the order drawn      fb.update(records)       fb.destroy()
 *   Kit.facetBatch.matches(cfg, st, record, skipFacetKey) -> boolean   the pure filter; st = {f: {key: Set}, q, only: Set | null}
 *   Kit.facetBatch.grouped(cfg, list, groupKey, sortKey) -> [{key, items}]   the pure grouping and ordering
 *
 * CSS classes: .kit-fb .kit-fb-bar
 *
 * @id        pattern.facet-batch
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Count chips whose counts say what pressing them gives, digit keys that switch the filter, a group-by and sort bar, selectable rows and a bar that acts on the selection.
 * @tags      facets, filter, counts, batch, selection, group by, sort, keyboard, upgrade
 * @requires  pattern.count-filters, viz.seal, kit.vocab, kit.glaze-surfaces
 * @files     kit/patterns/facet-batch.css, kit/samples/patterns.json
 * @provides  Kit.facetBatch.mount, Kit.facetBatch.matches, Kit.facetBatch.grouped
 * @extends   pattern.count-filters
 * @config    Kit.facetBatch.mount(root, {records, facets, search, groups, group, sorts, sort, row, actions, stateEnum, digitKeys, onAction}) | facets [{key, label, field, tiles, allLabel, options: [{value, label, tone, lte, gte, test}]}]; groups [{key, label, field | by, bands, order, none}]; sorts [{key, label, field, dir | cmp}]
 * @config    extends | pattern.count-filters: a new file; count-filters.js and .css load first and stay as they are
 * @config    Kit.seal, Kit.vocab | the default row draws Kit.seal.mini and a state pill; pass row() to draw your own
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --accent-ink --f-mono --shadow? --rim? --seam? --accent-soft? --glz-r-m?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console’s inventory page | chips with live counts that skip their own group, group-by with ordered bands, sort, selectable rows with a batch bar, the show-only bar, the search box that keeps its caret
 * @source    Catalog harvest, 2026-10-25 | an earlier board’s console skin | the digit keys with keycap chips
 * @preview   {"render": "pattern.facet-batch", "samples": ["kit/samples/patterns.json#facet-batch"]}
 * @changed   Facets, groups and sorts are data, and the filter and the grouping are pure, exported functions.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;
const idOf = (cfg, r) => typeof cfg.id === 'function' ? cfg.id(r) : r[cfg.id || 'id'];
const asArr = v => Array.isArray(v) ? v : [v];

function optionTest(f, opt, r) {
  if (typeof opt.test === 'function') return !!opt.test(r);
  const v = r[f.field];
  if (opt.lte != null || opt.gte != null) return typeof v === 'number' && (opt.lte == null || v <= opt.lte) && (opt.gte == null || v >= opt.gte);
  return Array.isArray(v) ? v.includes(opt.value) : v === opt.value;
}
function textOf(cfg, r) {
  const s = cfg.search || {};
  if (typeof s.text === 'function') return String(s.text(r));
  return (s.fields || ['title', 'sub']).map(k => r[k] == null ? '' : String(r[k])).join(' ');
}
function matches(cfg, st, r, skip) {
  if (st.only && !st.only.has(idOf(cfg, r))) return false;
  if (st.q && !textOf(cfg, r).toLowerCase().includes(st.q.toLowerCase())) return false;
  for (const f of cfg.facets || []) {
    if (f.key === skip) continue;
    const on = st.f[f.key]; if (!on || !on.size) continue;
    if (![...on].some(v => { const opt = f.options.find(x => x.value === v); return opt && optionTest(f, opt, r); })) return false;
  }
  return true;
}
function bucketOf(g, r) {
  if (typeof g.by === 'function') return g.by(r);
  const v = r[g.field];
  if (g.bands) { if (v == null) return g.none || 'Not known'; const b = g.bands.find(x => x.lte == null || v <= x.lte); return b ? b.label : (g.none || 'Not known'); }
  return v == null ? (g.none || 'Not known') : String(v);
}
function compare(cfg, sKey) {
  const s = (cfg.sorts || []).find(x => x.key === sKey); if (!s) return () => 0;
  if (typeof s.cmp === 'function') return s.cmp;
  const dir = s.dir === 'desc' ? -1 : 1;
  return (a, b) => { const x = a[s.field], y = b[s.field]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; };
}
function grouped(cfg, list, gKey, sKey) {
  const g = (cfg.groups || []).find(x => x.key === gKey), cmp = compare(cfg, sKey);
  if (!g) return [{ key: '', items: list.slice().sort(cmp) }];
  const m = new Map(); list.forEach(r => { const k = bucketOf(g, r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  const order = g.order || (g.bands ? g.bands.map(b => b.label).concat(g.none ? [g.none] : []) : null);
  let keys = [...m.keys()];
  if (order) keys.sort((a, b) => { const i = order.indexOf(a), j = order.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
  else keys.sort((a, b) => m.get(b).length - m.get(a).length || a.localeCompare(b));
  return keys.map(k => ({ key: k, items: m.get(k).slice().sort(cmp) }));
}

function mount(root, cfg) {
  const o = Object.assign({ records: [], facets: [], search: null, groups: [], sorts: [], actions: [], stateEnum: 'state', digitKeys: true, label: 'Records', row: null, onAction: null }, cfg);
  const id = 'kit-fb-' + (++uid); let records = o.records.slice(), lastIdx = -1, destroyed = false;
  const st = { f: {}, q: '', group: o.group || (o.groups[0] && o.groups[0].key) || '', sort: o.sort || (o.sorts[0] && o.sorts[0].key) || '', only: null, onlyLabel: '', sel: new Set() };
  o.facets.forEach((f, i) => { st.f[f.key] = new Set(); if (i === 0 && f.tiles == null) f.tiles = true; if (f.tiles && f.multi == null) f.multi = false; if (f.multi == null) f.multi = true; });
  root.classList.add('kit-cf', 'kit-fb'); root.replaceChildren();
  const tilesBox = el('div', 'kit-fb-facets'), strip = el('div', 'kit-cf-strip'), onlyBar = el('div', 'kit-fb-only'), summary = el('p', 'kit-fb-sum'), listBox = el('div', 'kit-fb-list'), bar = el('div', 'kit-fb-bar');
  summary.setAttribute('aria-live', 'polite'); onlyBar.hidden = true; bar.hidden = true; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Batch actions'); listBox.setAttribute('role', 'list'); listBox.setAttribute('aria-label', o.label);
  const live = el('div', 'kit-fb-sr'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');

  let input = null;
  if (o.search) {
    const s = Object.assign({ placeholder: 'Search', label: 'Search' }, o.search);
    input = el('input', 'kit-cf-q'); input.type = 'search'; input.id = id + '-q'; input.placeholder = s.placeholder; input.autocomplete = 'off'; input.setAttribute('aria-label', s.label);
    input.addEventListener('input', () => { st.q = input.value.trim(); st.only = null; refresh(); }); strip.append(input);
  }
  let seg = null, sortSel = null;
  if (o.groups.length > 1) {
    seg = el('span', 'kit-seg kit-fb-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Group by');
    o.groups.forEach(g => { const b = el('button', null, g.label); b.type = 'button'; b.dataset.id = g.key; b.addEventListener('click', () => { st.group = g.key; refresh(); }); seg.append(b); });
    const l = el('span', 'kit-fb-l', 'Group by'); const w = el('span', 'kit-fb-ctl'); w.append(l, seg); strip.append(w);
  }
  if (o.sorts.length > 1) {
    sortSel = el('select', 'kit-select kit-fb-sort'); sortSel.id = id + '-s'; sortSel.setAttribute('aria-label', 'Sort by');
    o.sorts.forEach(s => { const op = el('option', null, s.label); op.value = s.key; sortSel.append(op); });
    sortSel.addEventListener('change', () => { st.sort = sortSel.value; refresh(); });
    const l = el('label', 'kit-fb-l', 'Sort by'); l.htmlFor = sortSel.id; const w = el('span', 'kit-fb-ctl'); w.append(l, sortSel); strip.append(w);
  }
  root.append(tilesBox, strip, onlyBar, summary, listBox, bar, live);

  const visible = () => records.filter(r => matches(o, st, r));
  const count = (f, opt) => records.filter(r => matches(o, st, r, f.key) && optionTest(f, opt, r)).length;
  function toggle(f, v) {
    const s = st.f[f.key]; st.only = null;
    if (f.multi) { if (s.has(v)) s.delete(v); else s.add(v); } else { const had = s.has(v); s.clear(); if (!had) s.add(v); }
    refresh();
  }
  function paintFacets() {
    const act = document.activeElement && tilesBox.contains(document.activeElement) ? document.activeElement : null, keep = act && act.dataset.fk ? act.dataset.fk + '\u0000' + act.dataset.v : null;
    tilesBox.replaceChildren();
    o.facets.forEach((f, fi) => {
      if (f.tiles) {
        const box = el('div', 'kit-cf-tiles'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', f.label);
        if (f.allLabel) {
          const b = el('button', 'kit-cf-tile kit-fb-tile'); b.type = 'button'; b.dataset.fk = f.key; b.dataset.v = ''; b.setAttribute('aria-pressed', String(!st.f[f.key].size));
          const top = el('span', 'kit-cf-top'); top.append(el('span', 'kit-cf-count', String(records.filter(r => matches(o, st, r, f.key)).length)), el('span', 'kit-cf-check')); top.lastChild.setAttribute('aria-hidden', 'true');
          b.append(top, el('span', 'kit-cf-label', f.allLabel)); b.addEventListener('click', () => { st.f[f.key].clear(); st.only = null; refresh(); }); box.append(b);
        }
        f.options.forEach((opt, i) => {
          const n = count(f, opt), on = st.f[f.key].has(opt.value), b = el('button', 'kit-cf-tile kit-fb-tile'); b.type = 'button'; b.dataset.fk = f.key; b.dataset.v = opt.value; if (opt.tone) b.dataset.tone = opt.tone;
          b.setAttribute('aria-pressed', String(on)); b.disabled = !n && !on;
          const top = el('span', 'kit-cf-top'); top.append(el('span', 'kit-cf-count', String(n)), el('span', 'kit-cf-check')); top.lastChild.setAttribute('aria-hidden', 'true');
          const lab = el('span', 'kit-cf-label', opt.label); if (o.digitKeys && fi === 0 && i < 9) { const k = el('kbd', 'kit-fb-key', String(i + 1)); k.setAttribute('aria-hidden', 'true'); lab.append(' ', k); b.setAttribute('aria-keyshortcuts', String(i + 1)); }
          b.append(top, lab); b.setAttribute('aria-label', opt.label + ', ' + n); b.addEventListener('click', () => toggle(f, opt.value)); box.append(b);
        });
        tilesBox.append(box);
      } else {
        const g = el('div', 'kit-fb-group'); g.setAttribute('role', 'group'); const lab = el('span', 'kit-cf-lbl', f.label); lab.id = id + '-f-' + f.key; g.setAttribute('aria-labelledby', lab.id); g.append(lab);
        f.options.forEach(opt => {
          const n = count(f, opt), on = st.f[f.key].has(opt.value), b = el('button', 'kit-cf-chip kit-fb-chip'); b.type = 'button'; b.dataset.fk = f.key; b.dataset.v = opt.value; b.setAttribute('aria-pressed', String(on)); b.disabled = !n && !on;
          if (opt.tone) b.dataset.tone = opt.tone;
          b.append(el('span', null, opt.label), el('em', null, String(n))); b.setAttribute('aria-label', opt.label + ', ' + n); b.addEventListener('click', () => toggle(f, opt.value)); g.append(b);
        });
        tilesBox.append(g);
      }
    });
    if (keep) { const [k, v] = keep.split('\u0000'); const b = [...tilesBox.querySelectorAll('button')].find(x => x.dataset.fk === k && x.dataset.v === v && !x.disabled); if (b) b.focus({ preventScroll: true }); }
  }
  function defaultRow(r, ctx) {
    const row = el('div', 'kit-fb-row'); row.setAttribute('role', 'listitem'); row.dataset.id = idOf(o, r); if (ctx.selected) row.classList.add('kit-fb-sel');
    const V = window.Kit.vocab, S = window.Kit.seal, tone = V && r.state != null ? V.get(o.stateEnum, r.state) : null; if (tone) row.setAttribute('data-vo-tone', tone.tone);
    const main = el('span', 'kit-fb-main');
    if (S && r.left !== undefined) { const m = el('span', 'kit-fb-mini'); m.append(S.mini({ id: String(idOf(o, r)), label: r.title, left: r.left, life: r.life, total: r.total }, { size: 40 })); main.append(m); }
    const tx = el('span', 'kit-fb-tx'); tx.append(el('span', 'kit-fb-t', r.title)); if (r.sub) tx.append(el('span', 'kit-fb-s', r.sub));
    main.append(tx); row.append(main);
    const meta = el('span', 'kit-fb-meta');
    if (V && r.state != null) { const c = V.pill(o.stateEnum, r.state, { unknown: 'skip' }); if (c) meta.append(c); }
    if (S && r.left !== undefined) meta.append(el('span', 'kit-fb-left', S.text({ left: r.left, life: r.life, total: r.total, state: r.lifeState })));
    row.append(meta); return row;
  }
  function paintList(shown) {
    const act = document.activeElement && listBox.contains(document.activeElement) ? document.activeElement : null, keep = act && act.dataset.pick ? act.dataset.pick : null;
    listBox.replaceChildren(); const flat = [];
    if (!shown.length) {
      const e = el('div', 'kit-empty'); e.append(el('b', null, 'Nothing matches'), el('span', null, 'Loosen a filter or clear the search.'));
      const c = el('button', 'kit-btn kit-sm', 'Clear the filters'); c.type = 'button'; c.addEventListener('click', clearFilters); e.append(c); listBox.append(e);
    }
    grouped(o, shown, st.group, st.sort).forEach(g => {
      const sec = el('section', 'kit-fb-chapter'); if (g.key) { const h = el('h4', 'kit-fb-ch', g.key + ', ' + g.items.length); sec.append(h); }
      g.items.forEach(r => {
        const rid = String(idOf(o, r)), selected = st.sel.has(rid), wrap = el('div', 'kit-fb-wrap');
        const tick = el('button', 'kit-fb-tick'); tick.type = 'button'; tick.setAttribute('role', 'checkbox'); tick.setAttribute('aria-checked', String(selected)); tick.setAttribute('aria-label', 'Select ' + (r.title || rid)); tick.dataset.pick = rid;
        tick.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; const at = flat.length; flat.push(rid);
        tick.addEventListener('click', ev => {
          if (ev.shiftKey && lastIdx >= 0) { const [a, b] = [Math.min(lastIdx, at), Math.max(lastIdx, at)]; flat.slice(a, b + 1).forEach(x => st.sel.add(x)); }
          else if (st.sel.has(rid)) st.sel.delete(rid); else st.sel.add(rid);
          lastIdx = at; refresh(true);
        });
        wrap.append(tick, o.row ? o.row(r, { selected }) : defaultRow(r, { selected })); wrap.classList.toggle('kit-fb-sel', selected); sec.append(wrap);
      });
      listBox.append(sec);
    });
    shownIds = flat;
    if (keep) { const b = [...listBox.querySelectorAll('.kit-fb-tick')].find(x => x.dataset.pick === keep); if (b) b.focus({ preventScroll: true }); }
  }
  let shownIds = [];
  function paintBar(shown) {
    const n = st.sel.size; bar.hidden = !n; bar.replaceChildren(); if (!n) return;
    bar.append(el('span', 'kit-fb-bc', n + ' selected'));
    const all = el('button', 'kit-btn kit-ghost kit-sm', 'Select all shown'); all.type = 'button'; all.addEventListener('click', () => { shown.forEach(r => st.sel.add(String(idOf(o, r)))); refresh(true); }); bar.append(all);
    const acts = el('span', 'kit-fb-acts'); o.actions.forEach(a => { const b = el('button', 'kit-btn kit-sm' + (a.danger ? ' kit-danger' : ''), a.label); b.type = 'button'; b.addEventListener('click', () => fire(a.key)); acts.append(b); }); bar.append(acts);
    const cl = el('button', 'kit-btn kit-ghost kit-sm', 'Clear'); cl.type = 'button'; cl.setAttribute('aria-label', 'Clear selection'); cl.addEventListener('click', () => { st.sel.clear(); refresh(true); }); bar.append(cl);
  }
  function fire(action) {
    const ids = [...st.sel], detail = { action, ids }, ev = new CustomEvent('kit-fb-action', { detail, cancelable: true, bubbles: true });
    const ok = root.dispatchEvent(ev); if (!ok) return false;
    if (o.onAction && o.onAction(detail) === false) return false; return true;
  }
  function paintMeta(shown) {
    const g = o.groups.find(x => x.key === st.group), s = o.sorts.find(x => x.key === st.sort);
    summary.textContent = shown.length + ' of ' + records.length + ' records' + (g ? ', grouped by ' + g.label.toLowerCase() : '') + (s ? ', sorted by ' + s.label.toLowerCase() : '') + '.';
    onlyBar.hidden = !st.only; onlyBar.replaceChildren();
    if (st.only) { onlyBar.append(el('span', null, st.onlyLabel || 'Showing ' + st.only.size + ' records you picked.')); const b = el('button', 'kit-btn kit-sm', 'Show everything'); b.type = 'button'; b.addEventListener('click', () => api.clearFocus()); onlyBar.append(b); }
    if (seg) [...seg.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === st.group))); if (sortSel) sortSel.value = st.sort;
  }
  function refresh(keepFacets) {
    const shown = visible(); for (const x of [...st.sel]) if (!records.some(r => String(idOf(o, r)) === x)) st.sel.delete(x);
    paintFacets(); paintMeta(shown); paintList(shown); paintBar(shown);
    live.textContent = shown.length + ' shown' + (st.sel.size ? ', ' + st.sel.size + ' selected' : '');
  }
  function clearFilters() { Object.keys(st.f).forEach(k => st.f[k].clear()); st.q = ''; st.only = null; if (input) input.value = ''; refresh(); }
  const onKey = ev => {
    if (!o.digitKeys || destroyed || ev.ctrlKey || ev.metaKey || ev.altKey || !root.isConnected) return;
    const t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!(root.contains(document.activeElement) || document.activeElement === document.body)) return;
    const f = o.facets[0]; if (!f || ev.key.length !== 1 || ev.key < '0' || ev.key > '9') return;
    if (ev.key === '0') { st.f[f.key].clear(); st.only = null; refresh(); return; }
    const opt = f.options[Number(ev.key) - 1]; if (opt) { ev.preventDefault(); if (!(records.filter(r => matches(o, st, r, f.key) && optionTest(f, opt, r)).length === 0 && !st.f[f.key].has(opt.value))) toggle(f, opt.value); }
  };
  document.addEventListener('keydown', onKey);
  const api = {
    state: () => ({ f: Object.fromEntries(Object.entries(st.f).map(([k, v]) => [k, [...v]])), q: st.q, group: st.group, sort: st.sort, only: st.only ? [...st.only] : null, selected: [...st.sel] }),
    set(p) { if (p.f) Object.keys(p.f).forEach(k => { if (st.f[k]) st.f[k] = new Set(asArr(p.f[k]).filter(v => v !== '' && v != null)); }); if (p.q != null) { st.q = p.q; if (input) input.value = p.q; } if (p.group) st.group = p.group; if (p.sort) st.sort = p.sort; refresh(); },
    focus(ids, label) { st.only = new Set(ids); st.onlyLabel = label || ''; st.q = ''; if (input) input.value = ''; Object.keys(st.f).forEach(k => st.f[k].clear()); refresh(); },
    clearFocus() { st.only = null; st.onlyLabel = ''; refresh(); },
    select(ids) { ids.forEach(x => st.sel.add(String(x))); refresh(); }, selection: () => [...st.sel], clearSelection() { st.sel.clear(); refresh(); },
    shown: () => visible(), update(next) { records = next.slice(); refresh(); },
    destroy() { destroyed = true; document.removeEventListener('keydown', onKey); root.replaceChildren(); root.classList.remove('kit-cf', 'kit-fb'); },
  };
  refresh(); return api;
}
Kit.facetBatch = Object.freeze({ mount, matches, grouped });
})();
/* /part:page.script.kit.facet-batch */
