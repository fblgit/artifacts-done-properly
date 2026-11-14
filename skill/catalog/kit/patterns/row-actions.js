/* part:page.script.kit.row-actions */
/**
 * Row with main action and menu
 * Kit.rowActions.mount(root, {rows, main, menu}) draws rows with a state bead, a title, a state chip, the one main button chosen by a function of the row (Recover when blocked, Renew when due, Open when ready, else Details) and a kebab menu that holds the rest, without the main action. Kit.rowActions.menu(trigger, items) is the menu for any button: role=menu, ArrowUp and ArrowDown wrap, Home and End, Tab closes it, Escape closes it and returns focus to the button, a click outside closes it, only one menu is open at a time, it flips upward when there is no room, and danger items are tinted. Kit.rowActions.pills(host, actions) adds round action pills to a card that open their words on hover or focus; on touch screens and under 480px they are always shown.
 *
 * What it is: three pieces for acting on a row. The row: its one main button follows the row's state (Recover when blocked, Renew when due, Open when ready, else Details) and a menu button holds
 * the rest. The menu: a small popover that opens with the keyboard and the pointer, closes in every way a person expects, and tints dangerous items. The pills: round action buttons on a card that
 * open their words on hover or focus, and are always shown on touch screens and under 480px.
 *
 * The menu keeps: role=menu and role=menuitem, ArrowUp and ArrowDown wrap, Home and End, Tab closes it, Escape closes it and returns focus to the button that opened it, a click outside closes it,
 * and only one menu is open at a time. It opens upward when there is no room below.
 *
 * API (small and stable):
 *   Kit.rowActions.mount(root, {rows, main, menu, onAction, enum, label}) -> {update(rows), closeMenu(), destroy()}
 *     rows      [{id, title, sub, state, chips: [{text}]}]    state is a value of the Kit.vocab enum (default "state"); a silent or missing state draws no bead
 *     main      (row) -> {key, label, primary}   the one button, chosen by a function of the row's state
 *     menu      (row) -> [{key, label, icon, danger}]   the rest; an item with the main action's key is left out
 *     onAction  (key, row, event) after a button or a menu item is pressed
 *   Kit.rowActions.menu(trigger, items, {label, onPick, onOpen, onClose}) -> {open(), close(), isOpen(), el, destroy()}   a menu for any button; items [{key, label, icon, danger}]
 *   Kit.rowActions.pills(host, actions, {label, onPick, inline}) -> {el, destroy()}   host gets .kit-ra-host; actions [{key, label, icon, danger, primary}]; inline: true keeps them in the flow
 *   Kit.rowActions.icons -> {name: svg markup}   refresh eye link download lock alert trash more plus edit copy check; an icon is a name from this map or svg path markup (24 grid, stroke only)
 *
 * CSS classes: .kit-ra-row .kit-ra-menu .kit-ra-pills
 *
 * @id        pattern.row-actions
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A row whose one main button follows its state, a menu with the rest, and round action pills that open on hover or focus.
 * @tags      menu, row, actions, kebab, popover, quick actions, pills, keyboard
 * @requires  kit.vocab, kit.glaze-surfaces
 * @files     kit/patterns/row-actions.css, kit/samples/patterns.json
 * @provides  Kit.rowActions.mount, Kit.rowActions.menu, Kit.rowActions.pills, Kit.rowActions.icons
 * @config    Kit.rowActions.mount(root, {rows, main, menu, onAction, enum, label}) | main(row) -> {key, label, primary}; menu(row) -> [{key, label, icon, danger}]; rows [{id, title, sub, state, chips}]
 * @config    Kit.rowActions.menu(trigger, items, opts) and Kit.rowActions.pills(host, actions, opts) | the menu and the pills work without the rows
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --rule-2 --accent-ink --danger --f-mono --shadow? --rim? --seam? --danger-ink? --danger-soft? --glz-r-m?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console’s device row | the main action chosen from the row’s state, the menu without the main action, the keyboard handling
 * @source    Catalog harvest, 2026-10-25 | the same console’s quick actions | round pills labelled on hover or focus, always shown on touch
 * @preview   {"render": "pattern.row-actions", "samples": ["kit/samples/patterns.json#row-actions"]}
 * @changed   The main action and the menu are functions the board passes.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0, current = null, wired = false;
const ICONS = {
  refresh: '<path d="M20 11a8 8 0 00-14-4M4 13a8 8 0 0014 4M5 3v4h4M19 21v-4h-4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="4"/><path d="M8 10V8a4 4 0 018 0v2"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', copy: '<rect x="8" y="8" width="11" height="11" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
function ico(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'kit-ra-ico'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.innerHTML = ICONS[name] || name || ''; return s;
}
function wire() {
  if (wired) return; wired = true;
  document.addEventListener('mousedown', ev => { if (current && !current.wrap.contains(ev.target)) current.close(false); }, true);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && current) { ev.preventDefault(); ev.stopPropagation(); current.close(true); } }, true);
  window.addEventListener('scroll', () => { if (current) current.close(false); }, true);
}

function menu(trigger, items, o) {
  o = Object.assign({ label: 'More actions', onPick: null, onOpen: null, onClose: null }, o); wire();
  const id = 'kit-ra-m-' + (++uid), wrap = trigger.parentElement || trigger;
  const list = el('div', 'kit-ra-menu'); list.id = id; list.setAttribute('role', 'menu'); list.setAttribute('aria-label', o.label); list.hidden = true;
  trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', id);
  items.forEach(it => {
    const b = el('button', 'kit-ra-mi' + (it.danger ? ' kit-ra-danger' : '')); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.tabIndex = -1; b.dataset.key = it.key;
    if (it.icon) b.append(ico(it.icon)); b.append(el('span', null, it.label));
    b.addEventListener('click', ev => { api.close(false); if (o.onPick) o.onPick(it.key, ev); }); list.append(b);
  });
  wrap.classList.add('kit-ra-more'); wrap.append(list);
  const all = () => [...list.querySelectorAll('.kit-ra-mi')];
  function open() {
    if (current && current !== api) current.close(false);
    list.hidden = false; list.classList.remove('kit-ra-up'); trigger.setAttribute('aria-expanded', 'true'); current = api;
    const r = list.getBoundingClientRect(); if (r.bottom > innerHeight - 8 && trigger.getBoundingClientRect().top > r.height + 8) list.classList.add('kit-ra-up');
    const f = all()[0]; if (f) f.focus({ preventScroll: true }); if (o.onOpen) o.onOpen();
  }
  function close(focus) {
    if (list.hidden) return; list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (current === api) current = null;
    if (focus) trigger.focus(); if (o.onClose) o.onClose();
  }
  const api = { wrap, el: list, open, close, isOpen: () => !list.hidden, destroy() { close(false); list.remove(); trigger.removeEventListener('click', onTrig); trigger.removeEventListener('keydown', onTrigKey); } };
  const onTrig = ev => { ev.stopPropagation(); if (list.hidden) open(); else close(true); };
  const onTrigKey = ev => { if (ev.key === 'ArrowDown' && list.hidden) { ev.preventDefault(); open(); } };
  trigger.addEventListener('click', onTrig); trigger.addEventListener('keydown', onTrigKey);
  list.addEventListener('keydown', ev => {
    const a = all(), i = a.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); a[(i + 1) % a.length].focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); a[(i - 1 + a.length) % a.length].focus(); }
    else if (ev.key === 'Home') { ev.preventDefault(); a[0].focus(); } else if (ev.key === 'End') { ev.preventDefault(); a[a.length - 1].focus(); }
    else if (ev.key === 'Tab') close(false);
  });
  return api;
}

function pills(host, actions, o) {
  o = Object.assign({ label: 'Quick actions', onPick: null, inline: false }, o);
  host.classList.add('kit-ra-host');
  const box = el('div', 'kit-ra-pills' + (o.inline ? ' kit-ra-inline' : '')); box.setAttribute('role', 'group'); box.setAttribute('aria-label', o.label);
  actions.forEach(a => {
    const b = el('button', 'kit-ra-pill' + (a.danger ? ' kit-ra-danger' : '') + (a.primary ? ' kit-ra-primary' : '')); b.type = 'button'; b.title = a.label; b.setAttribute('aria-label', a.label);
    b.append(ico(a.icon), el('b', null, a.label)); b.addEventListener('click', ev => { if (o.onPick) o.onPick(a.key, ev); }); box.append(b);
  });
  host.append(box); return { el: box, destroy() { box.remove(); host.classList.remove('kit-ra-host'); } };
}

function mount(root, opts) {
  const o = Object.assign({ rows: [], main: null, menu: null, onAction: null, enum: 'state', label: 'Rows' }, opts); let rows = o.rows.slice(), menus = [];
  const V = () => window.Kit && window.Kit.vocab;
  root.classList.add('kit-ra'); root.replaceChildren();
  const ul = el('ul', 'kit-ra-rows'); ul.setAttribute('aria-label', o.label); root.append(ul);
  function paint() {
    menus.forEach(m => m.destroy()); menus = []; ul.replaceChildren();
    rows.forEach(r => {
      const li = el('li', 'kit-ra-row'); li.dataset.id = r.id;
      const v = V(), row = v && r.state != null ? v.get(o.enum, r.state) : null;
      if (row) { li.setAttribute('data-vo-tone', row.tone); const lead = el('span', 'kit-ra-lead'); const b = v.orb(o.enum, r.state, { size: 'md', label: row.word, unknown: 'skip' }); if (b) lead.append(b); li.append(lead); }
      const tx = el('span', 'kit-ra-tx'); tx.append(el('span', 'kit-ra-t', r.title)); if (r.sub) tx.append(el('span', 'kit-ra-s', r.sub));
      const meta = el('span', 'kit-ra-meta'); if (row && v) { const c = v.chip(o.enum, r.state, { unknown: 'skip' }); if (c) meta.append(c); }
      (r.chips || []).forEach(c => meta.append(el('span', 'kit-ra-chip', c.text)));
      const acts = el('span', 'kit-ra-acts'); const m = o.main ? o.main(r) : null;
      if (m) { const b = el('button', 'kit-btn kit-sm' + (m.primary ? ' kit-primary' : ''), m.label); b.type = 'button'; b.setAttribute('aria-label', m.label + ' ' + r.title); b.addEventListener('click', ev => { if (o.onAction) o.onAction(m.key, r, ev); }); acts.append(b); }
      const items = (o.menu ? o.menu(r) : []).filter(i => !m || i.key !== m.key);
      if (items.length) {
        const wrap = el('span', 'kit-ra-wrap'); const k = el('button', 'kit-btn kit-ghost kit-sm kit-icon kit-ra-kebab'); k.type = 'button'; k.setAttribute('aria-label', 'More for ' + r.title); k.title = 'More'; k.append(ico('more')); wrap.append(k); acts.append(wrap);
        menus.push(menu(k, items, { label: 'More for ' + r.title, onPick: (key, ev) => { if (o.onAction) o.onAction(key, r, ev); } }));
      }
      li.append(tx, meta, acts); ul.append(li);
    });
  }
  paint();
  return { update(next) { rows = next.slice(); paint(); }, closeMenu() { if (current) current.close(false); }, destroy() { menus.forEach(m => m.destroy()); root.replaceChildren(); root.classList.remove('kit-ra'); } };
}
Kit.rowActions = Object.freeze({ mount, menu, pills, icons: ICONS });
})();
/* /part:page.script.kit.row-actions */
