/* part:page.script.kit.ledger */
/**
 * Settled ledger
 * Kit.ledger.mount(box, {groups, rows, filters, label, expandable, onToggle}) builds groups of native details rows: a reference number, a tone tag, a date, the title and a closing note in the summary; blocks of detail inside. Filter chips (All first) show how many rows each would keep, a group with no visible row hides and a status line says "Showing 5 of 8 items". A detail block with tone warn is boxed, for the question that waits for the reader. The same rows carry a dated progress list (date, what was done, who checked it) and onToggle lets a board scroll to the card a row links to.
 *
 * A dated or numbered ledger of settled items, in groups, with filter chips that show their counts and a row that opens to its detail (outcome, the call that was made, the
 * answer that settled it). Each row is a native details element, so it opens with the keyboard and prints open. A group with no visible row hides; a status line says "Showing 5 of 8".
 * Plain DOM; every text is set with textContent unless a detail body is a Node.
 *
 * API:
 *   Kit.ledger.mount(box, {groups, rows, filters, label, expandable, onToggle}) -> {setFilter(id), expandAll(), collapseAll(), update(groups), state(), destroy()}
 *     groups    [{id, title, range, rows: [row]}]   or pass rows for one group without a heading
 *     row       {id, n, tag: {label, tone}, title, when, mark, detail: [{label, body, tone}], open}
 *                 n      the number or reference at the start of the row
 *                 tag    a status word with a tone (ok warn danger accent muted)
 *                 when   a date or time, shown in mono
 *                 mark   a short closing note on the right ("approved 22 Oct"); on a phone it moves under the title
 *                 detail blocks under the row: body is a string, an array of strings (a list) or a Node; tone "warn" boxes the block (an answer that needs the reader)
 *     filters   [{id, label, test(row) -> boolean}]   an "All" chip comes first; every chip shows how many rows it matches
 *     onToggle  (row, open) when a row opens or closes (a board can scroll to the card it links to)
 *
 * @id        pattern.ledger
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Grouped, dated ledger of settled items with filter chips that show counts and rows that open to outcome, call and answer.
 * @tags      ledger, log, decisions, history, filter, details, dated, progress, settled
 * @requires  none
 * @files     kit/patterns/ledger.css, kit/samples/patterns.json
 * @provides  Kit.ledger.mount
 * @config    Kit.ledger.mount(box, opts) | groups [{id, title, range, rows}] or rows, filters [{id, label, test}], label, expandable, onToggle(row, open); row {id, n, tag {label, tone}, title, when, mark, detail [{label, body, tone}], open}
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --ok --warn --danger --f-ui --f-mono --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 3 artifacts' index.html | a decisions board's grouped settled ledger with filters and row detail, a dated progress table, and a work board's push ledger that links to its cards
 * @preview   {"render": "pattern.ledger", "samples": ["kit/samples/patterns.json#ledger"]}
 * @changed   Rows are native details, so they open from the keyboard and print open.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function body(b) {
  if (b instanceof Node) return b;
  if (Array.isArray(b)) { const ul = el('ul'); b.forEach(x => ul.append(el('li', null, x))); return ul; }
  return el('div', null, b == null ? '' : String(b));
}
function mount(box, opts) {
  const o = Object.assign({ groups: null, rows: [], filters: [], label: 'Settled items', expandable: true, onToggle: null }, opts);
  const id = 'kit-lg-' + (++uid);
  let groups = (o.groups || [{ id: 'all', title: '', rows: o.rows }]).map(g => Object.assign({}, g));
  const st = { filter: 'all' };
  const fl = [{ id: 'all', label: 'All', test: () => true }].concat(o.filters);
  box.classList.add('kit-lg'); box.replaceChildren();
  const bar = el('div', 'kit-lg-bar');
  const chips = el('div', 'kit-lg-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Show');
  const btns = fl.map(f => { const b = el('button', 'kit-lg-chip'); b.type = 'button'; b.dataset.f = f.id; b.append(el('span', null, f.label), el('span', 'kit-lg-n', '0')); b.addEventListener('click', () => setFilter(f.id)); chips.append(b); return b; });
  bar.append(chips);
  if (o.expandable) {
    const ex = el('span', 'kit-lg-ex');
    [['Open all', () => expand(true)], ['Close all', () => expand(false)]].forEach(([t, fn]) => { const b = el('button', 'kit-lg-link', t); b.type = 'button'; b.addEventListener('click', fn); ex.append(b); });
    bar.append(ex);
  }
  const count = el('p', 'kit-lg-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const list = el('div', 'kit-lg-groups'); list.setAttribute('role', 'region'); list.setAttribute('aria-label', o.label);
  box.append(bar, count, list);

  const rowEls = [];
  function build() {
    list.replaceChildren(); rowEls.length = 0;
    groups.forEach((g, gi) => {
      const sec = el('section', 'kit-lg-g'); const ul = el('ul', 'kit-lg-list');
      if (g.title) { const h = el('h3', 'kit-lg-h', g.title); h.id = id + '-g' + gi; if (g.range) h.append(' ', el('span', 'kit-lg-range', g.range)); sec.setAttribute('aria-labelledby', h.id); sec.append(h); }
      g.rows.forEach(r => {
        const li = el('li', 'kit-lg-row'); const d = el('details'); if (r.open) d.open = true;
        const s = el('summary');
        if (r.n != null) s.append(el('span', 'kit-lg-num', String(r.n)));
        if (r.tag) { const t = el('span', 'kit-lg-tag', r.tag.label); if (r.tag.tone) t.dataset.tone = r.tag.tone; s.append(t); }
        if (r.when) s.append(el('span', 'kit-lg-when', r.when));
        s.append(el('span', 'kit-lg-title', r.title));
        if (r.mark) s.append(el('span', 'kit-lg-mark', r.mark));
        d.append(s);
        if (r.detail && r.detail.length) {
          const dt = el('div', 'kit-lg-detail');
          r.detail.forEach(b => { const kv = el('div', 'kit-lg-kv'); if (b.tone) kv.dataset.tone = b.tone; kv.append(el('span', 'kit-lg-k', b.label), body(b.body)); dt.append(kv); });
          d.append(dt);
        }
        d.addEventListener('toggle', () => { if (o.onToggle) o.onToggle(r, d.open); });
        li.append(d); ul.append(li); rowEls.push({ r, li, d });
      });
      sec.append(ul); list.append(sec);
    });
  }
  function paint() {
    const f = fl.find(x => x.id === st.filter) || fl[0]; let total = 0, shown = 0;
    btns.forEach((b, i) => { const n = rowEls.filter(x => fl[i].test(x.r)).length; b.lastChild.textContent = String(n); b.setAttribute('aria-pressed', String(fl[i].id === st.filter)); });
    rowEls.forEach(x => { const on = f.test(x.r); x.li.hidden = !on; total++; if (on) shown++; });
    list.querySelectorAll('.kit-lg-g').forEach(sec => { sec.hidden = ![...sec.querySelectorAll('.kit-lg-row')].some(li => !li.hidden); });
    count.textContent = shown === total ? 'Showing all ' + total + (total === 1 ? ' item' : ' items') : 'Showing ' + shown + ' of ' + total + ' items';
  }
  function setFilter(fid) { st.filter = fid; paint(); }
  function expand(on) { rowEls.forEach(x => { if (!x.li.hidden) x.d.open = on; }); }
  build(); paint();
  return {
    setFilter, expandAll: () => expand(true), collapseAll: () => expand(false),
    update(next) { groups = next.map(g => Object.assign({}, g)); build(); paint(); },
    state: () => ({ filter: st.filter, open: rowEls.filter(x => x.d.open).map(x => x.r.id) }),
    destroy() { box.replaceChildren(); box.classList.remove('kit-lg'); },
  };
}
Kit.ledger = Object.freeze({ mount });
})();
/* /part:page.script.kit.ledger */
