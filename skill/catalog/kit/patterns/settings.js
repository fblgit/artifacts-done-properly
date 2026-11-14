/* part:page.script.kit.settings */
/**
 * Settings page
 * Kit.settings.mount(root, {config, user, groups, labels, onChange, download}) draws the registry of ADP.config (or any object with all, get, set, reset and on) as one panel per group, its heading in the display face with a count, and one row per switch divided by hairlines. A summary line opens the page: how many settings, how many differ from their defaults, and whether editing is open or paused and by whom. Each row has its label and key (edit.locked in the mono face), the help, and a meta line: the layer that enforces it with a page or database glyph (Enforced by the page, Enforced by the database rule, from level), Changed by who and when, and, when the value differs from its default, the default itself beside a gold diamond on the label, so the word says it and not the colour. Controls by type: a switch for bool (a button with role switch and the word On or Off), a row of segments for an enum of up to four short options (native radios, so arrow keys move) and a select for longer ones, an input for text and url (url in the mono face) that saves on change or Enter, a textarea with one item per line and an item count for list, and a datetime-local input kept as an ISO string for datetime. A row saves at once through config.set and says Saved with a check, or the rejection with a cross, in its own status line; Undo restores the previous value for ten seconds. Without user.canEdit every control is disabled and the summary says so. While edit.locked is on, the other rows refuse a change from the keyboard as well as the runtime's dimming, and say why; the edit.locked switch and the until and reason fields carry data-adp-unlock instead of data-adp-edit, so a freeze can be lifted from this page. The footer has Export config.json (the values that differ from their defaults, to opts.download or an object-URL link) and Reset all to defaults (off while nothing differs; a second press within five seconds confirms, no confirm dialog). Rows redraw when config.on('*') fires and leave a field alone while it has focus. It does not edit the registry, show the db rules or list namespaces. The layout follows its container, not the window: under about 34rem the control drops under the label and nothing scrolls sideways; every control is a button, a labelled input, a select, a textarea or a radio, with a visible focus ring.
 *
 * What it is: the generic settings page of docs/config.md. It draws the switch registry of ADP.config as one panel per group and one row per switch, divided by hairlines.
 *
 * A summary line opens the page: how many settings, how many differ from their defaults, and whether editing is open or paused (and by whom). Each group heading carries its count.
 *
 * A row: the label; the help; a meta line with the layer that enforces it (a page or database glyph and "Enforced by the page" / "Enforced by the database rule", from level),
 * "Changed by X, date" and, when the value differs from its default, the default itself beside a seam mark on the row's edge (the word "Default" says it, not the colour).
 *
 * Controls by type: bool a switch with the word On or Off; enum a row of segments (native radios, arrow keys move) when it has at most four short options, else a select;
 * text and url an input saved on change or Enter (url in the mono face); list a textarea with one item per line and an item count; datetime a datetime-local input kept as ISO.
 *
 * Each row saves at once through config.set and says "Saved" (a check) or the rejection (a cross) in its own role="status" line, with Undo for ten seconds.
 *
 * Without user.canEdit every control is disabled and the summary says so. While edit.locked is on, a row's keyboard path is refused too, with a line that says why; the edit.locked
 * switch and its reason and until fields carry data-adp-unlock instead of data-adp-edit, so the freeze can be lifted from this page. A row redraws when config.on('*') fires and
 * leaves a field alone while it has focus. Footer: Export (config.json of the values that differ from their defaults) and Reset all to defaults (a second press within five seconds
 * confirms; no confirm()).
 *
 * API:
 *   Kit.settings.mount(root, opts) -> {update(), destroy()}
 *     config    an object with all/get/set/reset/on (default window.ADP.config)      user      {canEdit, id} (default window.ADP.user)
 *     groups    ["edit", "board", ...] order and filter of group names (default: every group, in registry order)      labels  {group: "Heading"} (defaults for the core groups)
 *     onChange  (key, value, previous) after a save      download  (filename, text) => void, else an object-URL link is clicked      timeZone  for "Changed by" dates (default: the viewer's)
 * Methods of what Kit.settings.mount returns: update(), destroy()
 *
 * @id        pattern.settings
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   The generic settings page of the config switches: one panel per group, one row per switch with the right control, the help, the layer that enforces it, who changed it and the default when it differs, saved at once with an Undo.
 * @tags      settings, config, switches, freeze, preferences, admin, registry, undo, export
 * @requires  kit.tokens, kit.dom
 * @files     kit/patterns/settings.css, kit/samples/patterns.json
 * @provides  Kit.settings.mount
 * @config    Kit.settings.mount(root, opts) | config {all, get, set, reset, on} (default window.ADP.config), user {canEdit} (default ADP.user), groups [names] to order or filter, labels {group: heading}, onChange(key, value, previous), download(filename, text), timeZone; returns {update, destroy}
 * @config    ADP.config.all() / get / set / reset / on('*') | read the registry and the values, save one switch, reset all, redraw on a change
 * @config    data-adp-edit / data-adp-unlock | every control carries data-adp-edit except edit.locked, edit.until and edit.reason, which carry data-adp-unlock
 * @tokens    --bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --ok --danger --f-ui --f-mono --warn? --seam? --f-display? --radius? --shadow?
 * @globals   none
 * @db        reads config/current / writes config/current / note Only through ADP.config; the component never touches the db. A write also appends changes/d-<ms> in the runtime, unless log.data-changes is off.
 * @source    Catalog batch 14, 2026-10-26 | docs/config.md and the ADP.config registry in adp.js | the all() shape, the two enforcement layers, the freeze and the unlock exception
 * @source    Catalog batch 14, 2026-10-26 | the board template's switch rows | label, help, who changed it and when
 * @preview   {"render": "pattern.settings", "samples": ["kit/samples/patterns.json#settings"]}
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = Kit.dom.el;
const BASE = 'kit-settings-', UNLOCK = ['edit.locked', 'edit.until', 'edit.reason'];
const GROUPS = { edit: 'Editing', parts: 'Parts', comments: 'Comments', panel: 'Panels', playground: 'Playground', look: 'Look', links: 'Links', log: 'Logging', board: 'Board' };
const ICONS = {
  page: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/><path d="M9.5 12.5h5M9.5 16h5"/>',
  db: '<ellipse cx="12" cy="6" rx="6.5" ry="2.5"/><path d="M5.5 6v12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6"/><path d="M5.5 12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5"/>',
  check: '<polyline points="5 12.5 10 17.5 19 7"/>',
  cross: '<path d="M7 7l10 10M17 7L7 17"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  open: '<circle cx="12" cy="12" r="6.5"/>',
};
const icon = name => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', BASE + 'i'); s.innerHTML = ICONS[name] || ''; return s;
};
const pad = n => String(n).padStart(2, '0');
const toLocal = iso => { const d = new Date(iso); return !iso || isNaN(d) ? '' : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fromLocal = s => { const d = new Date(s); return s && !isNaN(d) ? d.toISOString() : ''; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
let uid = 0;

function mount(root, opts) {
  const o = Object.assign({}, opts), cfg = () => o.config || (window.ADP && window.ADP.config), usr = () => o.user || (window.ADP && window.ADP.user) || {};
  const rows = new Map(), heads = new Map(); let sig = '', off = null, resetTimer = 0, dead = false;
  const labels = Object.assign({}, GROUPS, o.labels);
  const when = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }); };
  const canEdit = () => !!usr().canEdit;
  const shown = (d, v) => {
    if (d.type === 'bool') return v ? 'On' : 'Off';
    if (d.type === 'list') return v && v.length ? v.join(', ') : 'none';
    if (d.type === 'datetime') return v ? when(v) : 'not set';
    return v === '' || v == null ? 'empty' : String(v);
  };

  const box = el('div', BASE + 'root');
  const sum = el('div', BASE + 'sum'), sumText = el('p', BASE + 'sumt'), state = el('p', BASE + 'state'), note = el('p', BASE + 'note');
  sum.append(state, sumText, note);
  const body = el('div', BASE + 'body'), foot = el('div', BASE + 'foot');
  const fst = el('p', BASE + 'fst'); fst.setAttribute('role', 'status');
  const reset = el('button', BASE + 'btn ' + BASE + 'reset', 'Reset all to defaults'), exp = el('button', BASE + 'btn', 'Export config.json');
  reset.type = exp.type = 'button'; reset.setAttribute('data-adp-edit', '');
  foot.append(exp, fst, reset); box.append(sum, body, foot); root.replaceChildren(box);

  const registry = () => { const all = cfg().all(), names = o.groups || Object.keys(all); return names.filter(g => all[g]).map(g => [g, all[g]]); };
  function say(row, text, kind, undo) {
    clearTimeout(row.timer); row.st.replaceChildren(); row.line.dataset.kind = kind || '';
    if (text) { if (kind) row.st.append(icon(kind === 'ok' ? 'check' : 'cross')); row.st.append(el('span', null, text)); }
    row.undo.hidden = !undo;
    if (undo) row.timer = setTimeout(() => { row.st.replaceChildren(); row.undo.hidden = true; row.line.dataset.kind = ''; }, 10000);
  }
  async function save(row, value, back) {
    const c = cfg(), prev = c.get(row.key);
    if (same(prev, value)) return;
    if (c.get('edit.locked') && !UNLOCK.includes(row.key)) { say(row, 'Editing is paused, so this was not saved.', 'err'); return back(); }
    row.prev = prev;
    try { await c.set(row.key, value); } catch (e) { say(row, (e && e.message) || 'Not saved.', 'err'); return back(); }
    if (dead) return;
    say(row, 'Saved', 'ok', true); if (o.onChange) o.onChange(row.key, value, prev);
  }
  async function undo(row) {
    try { await cfg().set(row.key, row.prev); say(row, 'Restored', 'ok'); if (o.onChange) o.onChange(row.key, row.prev, undefined); }
    catch (e) { say(row, (e && e.message) || 'Not restored.', 'err'); }
  }

  function control(row, d, labId) {
    const id = BASE + 'c' + (++uid), gate = UNLOCK.includes(row.key) ? 'data-adp-unlock' : 'data-adp-edit';
    const opts2 = d.options || [];
    let c, write, inputs = null;
    if (d.type === 'bool') {
      c = el('button', BASE + 'sw'); c.type = 'button'; c.setAttribute('role', 'switch');
      const w = el('span', BASE + 'word'); c.append(el('span', BASE + 'track'), w);
      write = v => { c.setAttribute('aria-checked', v ? 'true' : 'false'); w.textContent = v ? 'On' : 'Off'; };
      c.addEventListener('click', () => { const v = c.getAttribute('aria-checked') !== 'true'; write(v); save(row, v, row.sync); });
    } else if (d.type === 'enum' && opts2.length && opts2.length <= 4 && opts2.every(x => String(x).length <= 14)) {
      c = el('div', BASE + 'seg'); c.setAttribute('role', 'radiogroup'); c.setAttribute('aria-labelledby', labId); inputs = [];
      opts2.forEach((x, i) => {
        const l = el('label', BASE + 'opt'), r = el('input'); r.type = 'radio'; r.name = id; r.value = x; r.id = id + '-' + i; r.setAttribute(gate, '');
        l.append(r, el('span', null, String(x))); c.append(l); inputs.push(r);
        r.addEventListener('change', () => { if (r.checked) save(row, x, row.sync); });
      });
      write = v => inputs.forEach(r => { r.checked = r.value === String(v); });
    } else if (d.type === 'enum') {
      c = el('select', BASE + 'in'); opts2.forEach(x => c.append(new Option(x, x)));
      write = v => { c.value = v; }; c.addEventListener('change', () => save(row, c.value, row.sync));
    } else if (d.type === 'list') {
      c = el('textarea', BASE + 'in ' + BASE + 'mono'); c.rows = 3; c.spellcheck = false; c.placeholder = 'One item per line';
      write = v => { c.value = (v || []).join('\n'); };
      c.addEventListener('change', () => save(row, c.value.split('\n').map(s => s.trim()).filter(Boolean), row.sync));
    } else if (d.type === 'datetime') {
      c = el('input', BASE + 'in'); c.type = 'datetime-local'; write = v => { c.value = toLocal(v); };
      c.addEventListener('change', () => save(row, fromLocal(c.value), row.sync));
    } else {
      c = el('input', BASE + 'in' + (d.type === 'url' ? ' ' + BASE + 'mono' : '')); c.type = d.type === 'url' ? 'url' : 'text'; c.autocomplete = 'off'; c.spellcheck = d.type !== 'url';
      if (d.type === 'url') c.placeholder = 'https://';
      write = v => { c.value = v == null ? '' : v; }; c.addEventListener('change', () => save(row, c.value.trim(), row.sync));
    }
    c.id = id; c.setAttribute(gate, ''); row.write = write; row.inputs = inputs || [c]; row.sync = () => write(cfg().get(row.key)); return c;
  }
  function build() {
    rows.clear(); heads.clear(); body.replaceChildren();
    registry().forEach(([g, defs]) => {
      const sec = el('section', BASE + 'group'), hd = el('div', BASE + 'gh'), h = el('h3', BASE + 'h', labels[g] || g.charAt(0).toUpperCase() + g.slice(1));
      const cnt = el('span', BASE + 'gn'), ul = el('ul', BASE + 'rows');
      h.id = BASE + 'g' + (++uid); sec.setAttribute('aria-labelledby', h.id); hd.append(h, cnt); sec.append(hd, ul); heads.set(g, cnt);
      Object.keys(defs).forEach(n => {
        const d = defs[n], key = g + '.' + n, li = el('li', BASE + 'row'), row = { key, d, g, n, li, timer: 0 };
        const labId = BASE + 'l' + (++uid);
        row.ctl = control(row, d, labId);
        const lab = el(d.type === 'enum' && row.ctl.getAttribute('role') === 'radiogroup' ? 'span' : 'label', BASE + 'label', d.label || n); lab.id = labId;
        if (lab.tagName === 'LABEL') lab.htmlFor = row.ctl.id;
        const keyEl = el('code', BASE + 'key', key);
        const text = el('div', BASE + 'text'); text.append(lab, keyEl);
        const help = el('p', BASE + 'help', d.help || ''); help.id = row.ctl.id + 'h'; row.ctl.setAttribute('aria-describedby', help.id);
        row.meta = el('p', BASE + 'meta');
        row.st = el('span', BASE + 'st'); row.st.setAttribute('role', 'status');
        row.undo = el('button', BASE + 'btn ' + BASE + 'undo', 'Undo'); row.undo.type = 'button'; row.undo.hidden = true;
        row.undo.setAttribute(UNLOCK.includes(key) ? 'data-adp-unlock' : 'data-adp-edit', '');
        row.undo.addEventListener('click', () => undo(row));
        row.line = el('div', BASE + 'line'); row.line.append(row.st, row.undo);
        const ctlBox = el('div', BASE + 'ctl'); ctlBox.dataset.type = d.type; ctlBox.append(row.ctl);
        if (d.type === 'list') { row.count = el('span', BASE + 'count'); ctlBox.append(row.count); }
        li.dataset.type = d.type; li.append(text, ctlBox); if (d.help) li.append(help); li.append(row.meta, row.line);
        ul.append(li); rows.set(key, row);
      });
      body.append(sec);
    });
    if (!rows.size) body.append(el('p', BASE + 'empty', 'No settings are defined yet. A component adds its own with ADP.config.define.'));
  }
  function refresh() {
    const c = cfg(), ed = canEdit(), all = c.all(), locked = !!c.get('edit.locked');
    let changedN = 0; const perGroup = {};
    rows.forEach(row => {
      const d = (all[row.g] || {})[row.n] || row.d, focus = row.li.contains(document.activeElement);
      if (!focus || !ed) row.write(d.value);
      row.inputs.forEach(x => { x.disabled = !ed; }); row.undo.disabled = !ed;
      const differs = !same(d.value, d.default); if (differs) changedN++;
      const pg = perGroup[row.g] = perGroup[row.g] || { n: 0, ch: 0 }; pg.n++; if (differs) pg.ch++;
      row.li.dataset.differs = differs ? 'true' : 'false';
      row.li.dataset.held = locked && !UNLOCK.includes(row.key) ? 'true' : 'false';
      if (row.count) { const k = (d.value || []).length; row.count.textContent = k ? plural(k, 'item', 'items') : 'No items'; }
      row.meta.replaceChildren();
      const layer = el('span', BASE + 'layer'); layer.dataset.level = d.level === 'db' ? 'db' : 'page';
      layer.append(icon(d.level === 'db' ? 'db' : 'page'), el('span', null, d.level === 'db' ? 'Enforced by the database rule' : 'Enforced by the page'));
      row.meta.append(layer);
      if (d.changed) row.meta.append(el('span', BASE + 'who', 'Changed by ' + (d.changed.by || 'someone') + (when(d.changed.at) ? ', ' + when(d.changed.at) : '')));
      if (differs) { const df = el('span', BASE + 'def'); df.append(el('span', BASE + 'defk', 'Default'), el('span', null, shown(d, d.default))); row.meta.append(df); }
    });
    heads.forEach((cnt, g) => { const p = perGroup[g] || { n: 0, ch: 0 }; cnt.textContent = plural(p.n, 'setting', 'settings') + (p.ch ? ', ' + p.ch + ' changed' : ''); });
    sumText.textContent = plural(rows.size, 'setting', 'settings') + ' in ' + plural(heads.size, 'group', 'groups') + '. ' +
      (changedN ? plural(changedN, 'differs', 'differ') + ' from ' + (changedN === 1 ? 'its default' : 'their defaults') + '.' : 'All are at their defaults.');
    state.replaceChildren(); state.dataset.locked = locked ? 'true' : 'false';
    const lockDoc = c.doc && c.doc.changed && c.doc.changed['edit.locked'];
    state.append(icon(locked ? 'pause' : 'open'), el('span', null, locked ? 'Editing is paused' + (lockDoc && lockDoc.by ? ' by ' + lockDoc.by : '') : 'Editing is open'));
    note.textContent = ed ? '' : 'You can read these. Only an editor can change them.'; note.hidden = ed;
    reset.disabled = !ed || !changedN; exp.disabled = false;
  }
  function update() {
    if (dead) return;
    const s = JSON.stringify(registry().map(([g, d]) => [g, Object.keys(d).map(n => [n, d[n].type, d[n].label, d[n].options])]));
    if (s !== sig) { sig = s; build(); }
    refresh();
  }

  reset.addEventListener('click', async () => {
    if (!reset.dataset.armed) {
      reset.dataset.armed = '1'; reset.textContent = 'Press again to reset everything'; fst.textContent = 'This returns every setting to its default.';
      resetTimer = setTimeout(() => { disarm(); fst.textContent = ''; }, 5000); return;
    }
    disarm();
    try { await cfg().reset(); fst.textContent = 'Every setting is back to its default.'; } catch (e) { fst.textContent = (e && e.message) || 'Not reset.'; }
  });
  function disarm() { clearTimeout(resetTimer); delete reset.dataset.armed; reset.textContent = 'Reset all to defaults'; }
  exp.addEventListener('click', () => {
    const values = {}; rows.forEach(r => { const v = cfg().get(r.key); if (!same(v, r.d.default)) values[r.key] = v; });
    const text = JSON.stringify({ values }, null, 2) + '\n';
    if (o.download) o.download('config.json', text);
    else { const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = 'config.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
    fst.textContent = 'Exported config.json with ' + plural(Object.keys(values).length, 'value', 'values') + '.';
  });

  let queued = false;
  const later = () => { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; update(); }); };
  update();
  const c0 = cfg(); if (c0 && c0.on) off = c0.on('*', later);
  return { update, destroy() { dead = true; clearTimeout(resetTimer); rows.forEach(r => clearTimeout(r.timer)); if (off) off(); root.replaceChildren(); } };
}
Kit.settings = Object.freeze({ mount });
})();
/* /part:page.script.kit.settings */
