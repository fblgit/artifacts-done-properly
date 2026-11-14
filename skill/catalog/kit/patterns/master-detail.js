/* part:page.script.kit.master-detail */
/**
 * Master-detail with filters
 * Kit.masterDetail.mount(root, {items, renderDetail, groups, filters, search, selected, label, narrow, onSelect}) renders a grouped listbox (arrow keys, Home and End move and select) with a search box and toggle chips that narrow together, and a detail pane filled by your renderDetail(item). The stack switches by the component's own width (default 760 px), so it also holds inside a narrow pane; then the list becomes a select above the detail. A status line counts the visible records.
 *
 * What it is: a filterable, searchable list of records on the left and the selected record on the right. The list is a listbox in groups (arrow keys move and select, Home and End jump),
 * the filters are toggle chips that narrow together, and the detail pane is whatever your renderDetail returns. When the component itself is narrower than 760px
 * (a phone, or a narrow pane) the list turns into a select above the detail, so the layout follows its own width and not the viewport.
 *
 * Plain DOM; list text is set with textContent. Your renderDetail returns a Node (or a string, shown as text).
 *
 * API:
 *   Kit.masterDetail.mount(root, {items, renderDetail, groups, filters, search, selected, label, narrow, emptyList, emptyDetail, onSelect})
 *       -> {select(id), update(items), state(), destroy()}
 *     items         [{id, name, group, sub, chips: [{label, tone}], keys}]   keys is extra search text; group is the heading in the list
 *     renderDetail  (item) => Node | string
 *     groups        the order of the group headings (default: first seen)
 *     filters       [{id, label, test(item) -> boolean}]   each chip is on or off; chips that are on all apply
 *     search        {placeholder, label}   matches name, sub, group and keys; all words must appear
 *     selected      the first selected id (default: the first visible item)
 *     narrow        the width in px under which the list becomes a select (default 760)
 *     onSelect      (item) after a selection
 *
 * @id        pattern.master-detail
 * @kind      component
 * @group     Layouts
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A filterable, searchable list on the left and the selected record on the right; the list becomes a select when the component is narrow.
 * @tags      layout, master detail, list, detail, filter, search, listbox, split view, phone, inspector
 * @requires  none
 * @files     kit/patterns/master-detail.css, kit/samples/patterns.json
 * @provides  Kit.masterDetail.mount
 * @config    Kit.masterDetail.mount(root, opts) | items [{id, name, group, sub, chips [{label, tone}], keys}], renderDetail(item) -> Node, groups, filters [{id, label, test}], search {placeholder, label}, selected, label, narrow, emptyList, emptyDetail, onSelect
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --accent-ink --ok --warn --danger --f-ui --f-mono --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 1 artifact's index.html | a runbook's cluster browser: the filter-button list, the search box, the detail pane and the select that replaces the list on a phone
 * @preview   {"render": "pattern.master-detail", "samples": ["kit/samples/patterns.json#master-detail"]}
 * @changed   The list is a listbox with roving focus and arrow keys; the source was a column of buttons.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fold = s => String(s == null ? '' : s).toLowerCase();

function mount(root, opts) {
  const o = Object.assign({ items: [], renderDetail: () => '', groups: null, filters: [], search: null, selected: null, label: 'Records', narrow: 760, emptyList: 'No record matches. Clear the search or a filter.', emptyDetail: 'Pick a record to see it here.', onSelect: null }, opts);
  const id = 'kit-md-' + (++uid);
  let items = o.items.slice();
  const st = { sel: o.selected, q: '', on: {} };
  root.classList.add('kit-md'); root.replaceChildren();
  const side = el('div', 'kit-md-side'); const tools = el('div', 'kit-md-tools');
  let input = null;
  if (o.search) {
    const s = Object.assign({ placeholder: 'Search', label: 'Search the list' }, o.search);
    input = el('input', 'kit-md-q'); input.type = 'search'; input.id = id + '-q'; input.placeholder = s.placeholder; input.autocomplete = 'off'; input.setAttribute('aria-label', s.label);
    input.addEventListener('input', () => { st.q = input.value; paint(); }); tools.append(input);
  }
  const fbtns = o.filters.map(f => { const b = el('button', 'kit-md-chip', f.label); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => { st.on[f.id] = !st.on[f.id]; paint(); }); return b; });
  if (fbtns.length) { const g = el('div', 'kit-md-chips'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Filters'); g.append(...fbtns); tools.append(g); }
  const count = el('p', 'kit-md-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const pick = el('select', 'kit-md-pick'); pick.id = id + '-pick'; pick.setAttribute('aria-label', o.label); pick.addEventListener('change', () => select(pick.value));
  const list = el('div', 'kit-md-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', o.label);
  side.append(tools, count, pick, list);
  const pane = el('div', 'kit-md-pane'); pane.tabIndex = -1; pane.setAttribute('role', 'region'); pane.setAttribute('aria-label', 'Selected record');
  root.append(side, pane);

  const visible = () => items.filter(it => {
    if (o.filters.some(f => st.on[f.id] && !f.test(it))) return false;
    if (st.q.trim()) { const hay = fold([it.name, it.sub, it.group, it.keys].join(' ')); if (!st.q.trim().toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false; }
    return true;
  });
  function detail() {
    const it = items.find(x => x.id === st.sel); pane.replaceChildren();
    if (!it) { pane.append(el('p', 'kit-md-empty', o.emptyDetail)); return; }
    const d = o.renderDetail(it); pane.append(d instanceof Node ? d : document.createTextNode(String(d)));
  }
  function paint() {
    const vis = visible();
    if (!vis.some(x => x.id === st.sel)) st.sel = vis[0] ? vis[0].id : null;
    fbtns.forEach((b, i) => b.setAttribute('aria-pressed', String(!!st.on[o.filters[i].id])));
    count.textContent = vis.length + ' of ' + items.length + (items.length === 1 ? ' record' : ' records');
    list.replaceChildren(); pick.replaceChildren();
    if (!vis.length) list.append(el('p', 'kit-md-none', o.emptyList));
    const order = o.groups || [...new Set(items.map(x => x.group || ''))];
    order.forEach((gname, gi) => {
      const gl = vis.filter(x => (x.group || '') === gname); if (!gl.length) return;
      const grp = el('div', 'kit-md-grp'); grp.setAttribute('role', 'group');
      if (gname) { const h = el('span', 'kit-md-gh', gname); h.id = id + '-g' + gi; grp.setAttribute('aria-labelledby', h.id); grp.append(h); }
      const og = document.createElement('optgroup'); og.label = gname || o.label;
      gl.forEach(it => {
        const b = el('button', 'kit-md-item'); b.type = 'button'; b.setAttribute('role', 'option'); b.dataset.id = it.id;
        b.setAttribute('aria-selected', String(it.id === st.sel)); b.tabIndex = it.id === st.sel ? 0 : -1;
        b.append(el('span', 'kit-md-nm', it.name));
        if (it.sub) b.append(el('span', 'kit-md-sub', it.sub));
        if (it.chips && it.chips.length) { const cs = el('span', 'kit-md-cs'); it.chips.forEach(c => { const s = el('span', 'kit-md-c', c.label); if (c.tone) s.dataset.tone = c.tone; cs.append(s); }); b.append(cs); }
        grp.append(b);
        const op = document.createElement('option'); op.value = it.id; op.textContent = it.name; op.selected = it.id === st.sel; og.append(op);
      });
      list.append(grp); pick.append(og);
    });
    detail();
  }
  function select(sid, focus) {
    const it = items.find(x => x.id === sid); if (!it) return;
    st.sel = sid; paint();
    if (focus) { const b = list.querySelector('[data-id="' + CSS.escape(sid) + '"]'); if (b) b.focus(); }
    if (o.onSelect) o.onSelect(it);
  }
  list.addEventListener('click', e => { const b = e.target.closest('.kit-md-item'); if (b) select(b.dataset.id, true); });
  list.addEventListener('keydown', e => {
    const bs = [...list.querySelectorAll('.kit-md-item')], i = bs.indexOf(document.activeElement); if (i < 0) return;
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : null;
    if (to == null) return; e.preventDefault(); const t = bs[Math.max(0, Math.min(bs.length - 1, to))]; if (t) select(t.dataset.id, true);
  });
  const fit = () => root.classList.toggle('narrow', root.clientWidth > 0 && root.clientWidth < o.narrow);
  const ro = window.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe(root);
  fit(); paint();
  return {
    select: sid => select(sid, false),
    update(next) { items = (next || []).slice(); paint(); },
    state: () => ({ selected: st.sel, q: st.q, filters: Object.assign({}, st.on) }),
    destroy() { if (ro) ro.disconnect(); root.replaceChildren(); root.classList.remove('kit-md', 'narrow'); },
  };
}
Kit.masterDetail = Object.freeze({ mount });
})();
/* /part:page.script.kit.master-detail */
