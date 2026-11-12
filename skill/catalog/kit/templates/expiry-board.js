/* part:page.script.kit.templates.expiry-board */
/* Kit template script: lifecycle board wiring (Kit.expiryBoard)    kit version 0.1.0    belongs to kit/templates/expiry-board.html.txt (the page) and expiry-board.css
   What it is: the wiring that makes the pieces one page. One list of records and one tiny store (the records, a "lit" set, an "only" filter and the selected record). Every view reads the store and
   writes to it by its own callbacks; no view calls another view. An action (renew, check, revoke) is never done in a view: it leaves as a cancelable "eb:action" event on the document, and the page
   decides what it means. The page copy in expiry-board.html.txt shows a handler.
     Overview   dial meters (five tiles counted from the records), the runway (what ends when, by kind), the five nearest seals
     Trust      the trust tree (who signed what); lighting a chain, picking a runway bubble or a facet lights the same records here
     Inventory  facet buttons (kind, state), the bubble pictures (clusters or lanes) and a lens line
     Drawer     one kit.drawer, opened for a seal, a bubble, a medallion or a runway pick of one record
   API:
     Kit.expiryBoard.mount(root, {items, lanes, authorities, kinds, groups, actions, drawerHost, hash, label, onAction}) -> {store, select(id), setOnly(spec), light(ids), destroy()}
       items        [{id, label, sub, kind, authority, group, subject, state, left (days, null when it has ended), life (0 to 1)}]   state is a value of the "life" enum viz.seal defines
       lanes        [{key, label}]  the kinds, in order (also the bubble groups and the dial segments)
       authorities  [{id, name, parent, ...}] and kinds {key: {label, short, plural, mark, authority, limits}} and groups [{id, label}]: what viz.trust-tree takes
       actions      [{key, label, icon, danger}] default renew, check, revoke       onAction(key, item, event)  called after the event when nobody cancels it
       drawerHost   a positioned element to open the drawer inside (default the page)       hash  true (default) lets the tabs write the page's #anchor       label  the page's name for assistive tech
     root must contain the elements the template defines: [data-eb="dials|runway|picked|seals|tree|facets|bubbles|status|tabs"].
   Needs from the board: viz.dial-meter, viz.runway, viz.seal, viz.trust-tree, viz.bubbles, kit.drawer, kit.tabs, kit.vocab, kit.tooltip and their css (the template page lists the links in order).
   db collections: none.
   Lifted from: a network-ops console's certificates page (an overview of meters, runway and nearest seals, a trust tab and an inventory tab, one drawer for details; the records reach the views as a map and
   the actions travel as an event). Changed: the pieces are the kit's, the records are data, the store is 20 lines, and the filter is two facet rows in this file: pattern.facet-batch draws its own record list and reports no change to a store, so it does not fit here. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const LIVE = ['ok', 'soon', 'urgent'], OVER = ['expired', 'revoked', 'ended', 'replaced'];
const ACTIONS = [{ key: 'renew', label: 'Renew', icon: 'refresh' }, { key: 'check', label: 'Check', icon: 'pulse' }, { key: 'revoke', label: 'Revoke', icon: 'ban', danger: true }];

function makeStore(init) {
  let s = init; const subs = new Set();
  return { get: () => s, set(p) { s = Object.assign({}, s, p); subs.forEach(f => f(s, p)); }, sub(f) { subs.add(f); return () => subs.delete(f); } };
}
const has = (set, v) => !set || set.size === 0 || set.has(v);
const pass = (it, only) => !only || (has(only.kind, it.kind) && has(only.state, it.state));
const word = (state) => { const r = Kit.vocab && Kit.vocab.get('life', state); return r && r.word ? r.word : state; };

function mount(root, o) {
  o = Object.assign({ actions: ACTIONS, hash: true }, o); const items = o.items || [], byId = new Map(items.map(i => [i.id, i]));
  const q = k => root.querySelector('[data-eb="' + k + '"]');
  const st = makeStore({ lit: null, only: null, sel: null });
  const handles = []; let drawer = null, lastOpener = null;
  const emit = (key, item, ev) => {
    const e = new CustomEvent('eb:action', { cancelable: true, detail: { key, id: item.id, item } });
    if (document.dispatchEvent(e) && o.onAction) o.onAction(key, item, ev);
  };
  const actionsOf = it => (OVER.includes(it.state) ? o.actions.filter(a => !a.danger && a.key !== 'check') : o.actions);

  // ---- the drawer
  function openDrawer(id, opener, node) {
    const it = byId.get(id) || null; lastOpener = opener || lastOpener;
    const body = el('div', 'kit-eb-detail');
    if (node) body.append(node);
    if (it) {
      const head = el('div', 'kit-eb-dh'); const pill = Kit.vocab && Kit.vocab.pill('life', it.state); if (pill) head.append(pill);
      head.append(el('span', 'kit-eb-dleft', Kit.seal ? Kit.seal.text(it) : ''));
      const dl = el('dl', 'kit-eb-facts'); const kind = (o.kinds || {})[it.kind], auth = (o.authorities || []).find(a => a.id === it.authority);
      [['Kind', kind ? kind.short : it.kind], ['Signed by', auth ? auth.name : it.authority], ['For', it.sub], ['Left', it.left == null ? 'Ended' : it.left + ' days']].forEach(([k, v]) => { if (v == null) return; dl.append(el('dt', null, k), el('dd', null, String(v))); });
      body.prepend(head, dl);
    }
    const foot = el('div', 'kit-eb-df');
    if (it) actionsOf(it).forEach(a => { const b = el('button', 'kit-eb-btn' + (a.danger ? ' is-danger' : ''), a.label); b.type = 'button'; b.addEventListener('click', () => emit(a.key, it, null)); foot.append(b); });
    drawer = Kit.drawer.open({ title: it ? it.label : 'Details', body, foot: foot.childNodes.length ? foot : null, host: o.drawerHost, opener: lastOpener,
      onClose: () => { drawer = null; st.set({ sel: null }); if (tree) tree.pin(null); } });
  }
  function select(id, opener, node) { st.set({ sel: id }); openDrawer(id, opener, node); if (tree) tree.pin(byId.has(id) || (o.authorities || []).some(a => a.id === id) ? id : null); }

  // ---- overview: dials
  const dialsBox = q('dials'), dials = [];
  function drawDials() {
    if (!dialsBox) return; dials.splice(0).forEach(d => d.destroy()); dialsBox.replaceChildren();
    const live = items.filter(i => LIVE.includes(i.state)), soon = items.filter(i => i.state === 'soon' || i.state === 'urgent'), over = items.filter(i => OVER.includes(i.state));
    const next = live.filter(i => i.left != null).sort((a, b) => a.left - b.left)[0];
    const lanes = o.lanes || [];
    const segs = lanes.map((l, i) => ({ v: items.filter(x => x.kind === l.key).length, kind: i + 1, label: l.label.toLowerCase() })).filter(s => s.v);
    const tiles = [
      { title: 'In use', value: String(live.length), unit: 'of ' + items.length, frac: items.length ? live.length / items.length : 0, tone: 'ok', caption: over.length + ' have already ended' },
      { title: 'By kind', value: String(items.length), unit: 'in all', tone: 'idle', segments: segs, caption: 'Signed by ' + new Set(items.map(i => i.authority)).size + ' authorities' },
      { title: 'Ending soon', value: String(soon.length), unit: 'within 60 days', frac: items.length ? soon.length / items.length : 0, tone: soon.length ? 'warn' : 'ok', caption: next ? next.label + ' ends first, in ' + next.left + ' days' : 'Nothing is ending',
        actions: [{ key: 'show', label: 'Show them', icon: 'eye' }] },
      { title: 'Already over', value: String(over.length), unit: 'ended', frac: items.length ? over.length / items.length : 0, tone: over.length ? 'bad' : 'ok', caption: 'Still listed until you remove them', actions: [{ key: 'showOver', label: 'Show them', icon: 'eye' }] },
      { title: 'Next to end', value: next ? String(next.left) : '-', unit: 'days', tone: next && next.state === 'urgent' ? 'bad' : next && next.state === 'soon' ? 'warn' : 'ok', caption: next ? next.label : 'No end date ahead' },
    ];
    tiles.forEach(t => {
      const d = Kit.dialMeter.make(Object.assign({}, t, { onAction(k) {
        if (k === 'show') { setOnly({ state: ['soon', 'urgent'] }); goto('inventory'); }
        if (k === 'showOver') { setOnly({ state: OVER }); goto('inventory'); }
      } }));
      dials.push(d); dialsBox.append(d.el);
    });
  }

  // ---- overview: runway and the nearest seals
  const runBox = q('runway'), pickBox = q('picked'), sealBox = q('seals'); let runway = null;
  function drawRunway() {
    if (!runBox) return; if (runway) runway.destroy(); runBox.replaceChildren();
    runway = Kit.runway.mount(runBox, { items: items.filter(i => pass(i, st.get().only)).filter(i => i.left != null).map(i => ({ id: i.id, lane: i.kind, daysLeft: i.left, state: i.state, label: i.label })), lanes: o.lanes, label: 'When things end, by kind', host: o.drawerHost,
      onPick(ids, info) { st.set({ lit: ids }); drawPicked(ids, info); } });
  }
  function drawPicked(ids, info) {
    if (!pickBox) return; pickBox.replaceChildren(); if (!ids || !ids.length) return;
    pickBox.append(el('span', 'kit-eb-k', ids.length + (ids.length === 1 ? ' ends' : ' end') + ' in this bubble'));
    ids.slice(0, 8).forEach(id => { const it = byId.get(id); if (!it) return; const b = el('button', 'kit-eb-chip', it.label); b.type = 'button'; b.addEventListener('click', () => select(id, b)); pickBox.append(b); });
    const c = el('button', 'kit-eb-chip is-quiet', 'Clear'); c.type = 'button'; c.addEventListener('click', () => { st.set({ lit: null }); if (runway) runway.select([]); pickBox.replaceChildren(); }); pickBox.append(c);
  }
  function drawSeals() {
    if (!sealBox) return; sealBox.replaceChildren();
    items.filter(i => LIVE.includes(i.state) && i.left != null && pass(i, st.get().only)).sort((a, b) => a.left - b.left).slice(0, 5).forEach(i => {
      sealBox.append(Kit.seal.make({ id: i.id, label: i.label, left: i.left, life: i.life, state: i.state }, { size: 104, actions: o.actions, onAction(k, item) { emit(k, byId.get(item.id), null); }, onOpen(item, ev) { select(item.id, ev && ev.currentTarget); } }));
    });
    if (!sealBox.childNodes.length) sealBox.append(el('p', 'kit-eb-empty', 'Nothing in this filter is about to end.'));
  }

  // ---- trust tree
  let tree = null; const treeBox = q('tree');
  function drawTree() {
    if (!treeBox) return;
    const leaves = items.map(i => ({ id: i.id, authority: i.authority, kind: i.kind, label: i.label, state: i.state, life: i.life, left: Kit.seal ? Kit.seal.text(i) : '', subject: i.subject, group: i.group }));
    tree = Kit.trustTree.mount(treeBox, { authorities: o.authorities, leaves, kinds: o.kinds, groups: o.groups, sections: ['tree', 'passes', 'limits'], label: 'Who signed what', host: o.drawerHost,
      onOpen(id, opener) { select(id, opener, tree.detailEl(id, { onAction(k) { const it = byId.get(id); if (it) emit(k, it, null); } })); } });
    handles.push(tree);
  }

  // ---- inventory: facets and bubbles
  const facBox = q('facets'), bubBox = q('bubbles'); let bubbles = null, layout = 'clusters';
  function drawFacets() {
    if (!facBox) return; facBox.replaceChildren(); const only = st.get().only || {};
    const rows = [['kind', 'Kind', (o.lanes || []).map(l => [l.key, l.label]), i => i.kind], ['state', 'State', ['ok', 'soon', 'urgent', 'expired', 'revoked', 'ended'].map(s => [s, word(s)]), i => i.state]];
    rows.forEach(([key, label, opts, get]) => {
      const g = el('div', 'kit-eb-facet'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); g.append(el('span', 'kit-eb-k', label));
      opts.forEach(([v, text]) => {
        const ids = items.filter(i => get(i) === v).map(i => i.id); if (!ids.length) return;
        const on = !!(only[key] && only[key].has && only[key].has(v)); const b = el('button', 'kit-eb-chip', text + ' '); b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.append(el('b', null, String(ids.length)));
        b.addEventListener('click', () => toggle(key, v));
        const lightOn = () => st.set({ lit: ids }), lightOff = () => st.set({ lit: null });
        b.addEventListener('pointerenter', lightOn); b.addEventListener('pointerleave', lightOff); b.addEventListener('focus', lightOn); b.addEventListener('blur', lightOff);
        g.append(b);
      });
      facBox.append(g);
    });
    const n = items.filter(i => pass(i, st.get().only)).length; const tail = el('div', 'kit-eb-facet');
    tail.append(el('span', 'kit-eb-count', n + ' of ' + items.length + ' shown'));
    if (st.get().only) { const c = el('button', 'kit-eb-chip is-quiet', 'Clear filters'); c.type = 'button'; c.addEventListener('click', () => setOnly(null)); tail.append(c); }
    facBox.append(tail);
  }
  function toggle(key, v) {
    const only = Object.assign({ kind: new Set(), state: new Set() }, st.get().only); const s = new Set(only[key] || []); if (s.has(v)) s.delete(v); else s.add(v); only[key] = s;
    setOnly(only.kind.size || only.state.size ? only : null, true);
  }
  function setOnly(spec, raw) {
    let only = null;
    if (spec) { only = raw ? spec : { kind: new Set(spec.kind || []), state: new Set(spec.state || []) }; if (!only.kind.size && !only.state.size) only = null; }
    st.set({ only });
  }
  function drawBubbles() {
    if (!bubBox) return; if (bubbles) bubbles.destroy(); bubBox.replaceChildren();
    bubbles = Kit.bubbles.mount(bubBox, { records: items.map(i => ({ id: i.id, group: i.kind, value: Math.max(0, i.left || 0), state: i.state, glyph: (o.kinds && o.kinds[i.kind] && o.kinds[i.kind].glyph) || 'dot', label: i.label, sub: i.sub })),
      groups: o.lanes, layout, label: 'Every record, by kind', host: o.drawerHost,
      scale: { name: 'square-root', f: Math.sqrt, ticks: [[30, '30 days'], [90, '3 months'], [365, '1 year'], [730, '2 years'], [1825, '5 years']], nowLabel: 'now' },
      onPick(rec) { select(rec.id, null); }, onAction(k, rec) { const it = byId.get(rec.id); if (it) emit(k, it, null); } });
    handles.push(bubbles);
  }
  const layoutBox = q('layout');
  function drawLayout() {
    if (!layoutBox) return; layoutBox.replaceChildren(); layoutBox.setAttribute('role', 'group'); layoutBox.setAttribute('aria-label', 'Picture');
    [['clusters', 'Clusters'], ['lanes', 'Lanes']].forEach(([k, l]) => { const b = el('button', 'kit-eb-chip', l); b.type = 'button'; b.setAttribute('aria-pressed', String(layout === k)); b.addEventListener('click', () => { layout = k; if (bubbles) bubbles.setLayout(k); drawLayout(); }); layoutBox.append(b); });
  }

  // ---- the store drives the views
  const statusBox = q('status');
  function say() {
    if (!statusBox) return; const s = st.get(); const n = items.filter(i => pass(i, s.only)).length;
    statusBox.textContent = (s.only ? 'Showing ' + n + ' of ' + items.length + '.' : '') + (s.lit && s.lit.length ? ' ' + s.lit.length + ' lit.' : '');
  }
  const off = st.sub((s, p) => {
    if ('only' in p) { drawFacets(); drawRunway(); drawSeals(); if (bubbles) bubbles.setFilter(s.only ? (r => pass(byId.get(r.id), s.only)) : null); }
    if ('lit' in p) {
      if (tree) { if (s.lit && s.lit.length) tree.light({ ids: s.lit }); else tree.clear(); }
      if (bubbles && !s.sel) bubbles.select(s.lit && s.lit.length === 1 ? s.lit[0] : null);
    }
    if ('sel' in p && bubbles) bubbles.select(s.sel && byId.has(s.sel) ? s.sel : null);
    say();
  });

  // ---- tabs
  const tabsEl = q('tabs'); let tabs = null;
  function goto(id) { if (tabs) tabs.select(id); }
  if (tabsEl) tabs = Kit.tabs.mount(tabsEl, { hash: o.hash, label: o.label || 'Certificates', initial: 'overview' });

  drawDials(); drawRunway(); drawSeals(); drawTree(); drawFacets(); drawLayout(); drawBubbles(); say();
  return {
    store: st, select: id => select(id, null), setOnly, light: ids => st.set({ lit: ids }),
    destroy() { off(); dials.forEach(d => d.destroy()); if (runway) runway.destroy(); handles.forEach(h => h.destroy && h.destroy()); if (drawer) drawer.close(); if (tabs) tabs.destroy(); },
  };
}
Kit.expiryBoard = Object.freeze({ mount });
})();
/* /part:page.script.kit.templates.expiry-board */
