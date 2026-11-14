/* part:page.script.kit.next-steps */
/**
 * Next steps with prompt builder
 * Kit.nextSteps.mount(root, {items, state, onChange}) draws a checklist where Done marks what is finished and Pick marks what Claude should do next. Steps move with Up and Down (focus stays on the button), take a note, and the owner can add steps of their own. The picked, unfinished steps build one text in a read-only box with a Copy button: a prompt for Claude by default ("proceed with: 1) a (ref) [note: n]; 2) b"), or any command or message through build(picked, {items, state}). With collapsible it becomes a details strip that counts what is pending. The whole state is one object handed to onChange, so a board saves it with kit.save-status or one db doc.
 *
 * What it is: a checklist of next steps where the owner ticks Done on what is finished and Pick on what Claude should do next, reorders with Up and Down,
 * adds a note to a step and adds steps of their own. The picked, unfinished steps build one text (a prompt for Claude by default, or any command or message
 * through build()), shown in a read-only box with a Copy button. It can sit inside a collapsible strip that counts what is pending. Plain DOM, no framework.
 *
 * API (small and stable):
 *   Kit.nextSteps.mount(root, opts) -> {setState(state), state(), text(), destroy()}
 *     items       [{id, title, sub, ref}]    the board's own steps; ref is a short pointer the default text adds in brackets, e.g. "workstream 4"
 *     state       {done: {id: true}, picked: {id: true}, notes: {id: text}, order: [id], extras: [{id, title}]}    start empty; the board keeps what onChange gives it
 *     onChange(state)   called after every change with the whole state: hand it to Kit.saveStatus.persist, or write it to one db doc
 *     build(picked, ctx) -> string    picked is [{id, title, sub, ref, note}] in order; ctx {items, state}; default "proceed with: 1) a (ref) [note: n]; 2) b"
 *     lead        the default text's first words (default "proceed with: ");  emptyText  shown when nothing is picked
 *     allowAdd    show the "Add your own step" line (default true);  collapsible  wrap in a details strip with a pending count (default false);  open  its initial state
 *     title, headingLevel (2-6, default 2), words  texts that replace the defaults
 *   setState(state) is for a live subscription: it replaces the state and redraws.
 *
 * caps none. To keep the state across visits give onChange a writer (kit.save-status keeps it in the db doc or the browser).
 *
 * @id        pattern.next-steps
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Checklist of next steps that builds a copyable prompt (or a command) from the picked ones; reorder, notes, own steps, collapsible strip.
 * @tags      next steps, checklist, prompt, builder, copy, reorder, notes, command, strip
 * @requires  kit.copy
 * @files     kit/patterns/next-steps.css, kit/samples/patterns.json
 * @provides  Kit.nextSteps.mount
 * @config    Kit.nextSteps.mount(root, {items, state, onChange, build, lead, allowAdd, collapsible, title, words}) | items [{id, title, sub, ref}]; state {done, picked, notes, order, extras}; onChange(state) after every change
 * @config    build(picked, ctx) | returns the text; the default builds the prompt, a command builder returns a command from ctx.items and the picks
 * @config    Kit.copy | the Copy button uses Kit.copy.text; without it the text is selected
 * @tokens    --bg --panel --sunk --ink --ink-2 --ink-3 --rule --accent --accent-ink --f-ui --f-mono --f-display? --seam?
 * @globals   none
 * @db        note None of its own. The board stores the state object that onChange hands it, for example in one doc (board/state) through kit.save-status, which keeps it in the db when the capability is there and in the browser when it is not.
 * @source    Catalog harvest, 2026-10-25 | a session board's index.html | next-steps list with done and pick ticks, arrows, notes, own steps and the prompt box
 * @source    Catalog harvest, 2026-10-25 | a proposal page's index.html | the collapsible next-steps strip with a pending count
 * @source    Catalog harvest, 2026-10-25 | a share manifest's index.html | folder picks that build a copy command with an exclude per unpicked folder
 * @preview   {"render": "pattern.next-steps", "samples": ["kit/samples/patterns.json#next-steps"]}
 * @changed   The text is built by a function the board can replace, which covers the prompt and the command variants with one component.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k]; if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'value' || k === 'open') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}
const WORDS = {
  title: 'Next steps', pending: n => n ? '(' + n + ' pending)' : '(none pending)', progress: (d, t) => d + ' of ' + t + ' done',
  done: 'Done', pick: 'Pick', up: 'Up', down: 'Down', remove: 'Remove', note: 'Note', noteFor: n => 'Note for step ' + n,
  moveUp: t => 'Move up: ' + t, moveDown: t => 'Move down: ' + t, removeStep: t => 'Remove: ' + t,
  addLabel: 'Add your own step', addPlaceholder: 'Add your own step', add: 'Add', own: 'Added by you',
  empty: 'Pick one or more open steps to build the text.', copy: 'Copy for Claude', copied: 'Copied.', selected: 'Selected. Press Ctrl+C or Cmd+C to copy it.', failed: 'Select the text and copy it.',
  textLabel: 'Text built from the picked steps',
};
let seq = 0;
const fit = (t, min) => { if (!t.isConnected || !t.offsetWidth) return; t.style.height = 'auto'; t.style.height = Math.max(min || 0, t.scrollHeight + 2) + 'px'; };
const clone = s => ({ done: Object.assign({}, s.done), picked: Object.assign({}, s.picked), notes: Object.assign({}, s.notes), order: (s.order || []).slice(), extras: (s.extras || []).map(x => Object.assign({}, x)) });

Kit.nextSteps = Object.freeze({
  mount(root, o) {
    const W = Object.assign({}, WORDS, o.words), id0 = 'kn' + (++seq) + '-', lvl = Math.min(6, Math.max(2, o.headingLevel || 2));
    let S = clone(o.state || {});
    const lead = o.lead != null ? o.lead : 'proceed with: ';
    const items = () => {
      const all = (o.items || []).map(i => Object.assign({}, i)).concat(S.extras.map(x => ({ id: x.id, title: x.title, sub: W.own, own: true })));
      const pos = {}; S.order.forEach((id, i) => { pos[id] = i; }); const base = {}; all.forEach((it, i) => { base[it.id] = i; });
      return all.sort((a, b) => { const pa = pos[a.id], pb = pos[b.id]; if (pa === undefined && pb === undefined) return base[a.id] - base[b.id]; if (pa === undefined) return 1; if (pb === undefined) return -1; return pa - pb; });
    };
    const picked = () => items().filter(i => S.picked[i.id] && !S.done[i.id]).map(i => Object.assign({}, i, { note: (S.notes[i.id] || '').trim().replace(/\s+/g, ' ') }));
    const text = () => {
      const sel = picked(); if (!sel.length) return '';
      if (o.build) return o.build(sel, { items: items(), state: clone(S) });
      return lead + sel.map((i, n) => (n + 1) + ') ' + i.title + (i.ref ? ' (' + i.ref + ')' : '') + (i.note ? ' [note: ' + i.note + ']' : '')).join('; ');
    };
    const changed = () => { if (o.onChange) o.onChange(clone(S)); };

    const ul = h('ul', { class: 'kit-n-list' });
    const prog = h('p', { class: 'kit-n-prog' });
    const addIn = h('input', { type: 'text', id: id0 + 'add', 'aria-label': W.addLabel, placeholder: W.addPlaceholder, maxlength: 200 });
    const add = () => { const v = addIn.value.trim(); if (!v) return; const id = 'x' + Date.now().toString(36) + Math.floor(Math.random() * 36 ** 3).toString(36); S.extras.push({ id, title: v }); S.picked[id] = true; addIn.value = ''; changed(); draw(); addIn.focus(); };
    addIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const addRow = h('div', { class: 'kit-n-add', hidden: o.allowAdd === false }, addIn, h('button', { type: 'button', class: 'kit-n-btn', text: W.add, onclick: add }));
    const out = h('textarea', { id: id0 + 'text', class: 'kit-n-out', readonly: '', rows: 4, 'aria-label': W.textLabel });
    const say = h('span', { class: 'kit-n-say', role: 'status', 'aria-live': 'polite' });
    const copyBtn = h('button', { type: 'button', class: 'kit-n-btn pri', text: W.copy, onclick: () => {
      const t = text(); if (!t) return;
      if (!(Kit.copy && Kit.copy.text)) { out.focus(); out.select(); say.textContent = W.selected; return; }
      Kit.copy.text(t, { select: out }).then(st => { say.textContent = st === 'copied' ? W.copied : st === 'selected' ? W.selected : W.failed; });
    } });
    const title = h('h' + lvl, { class: 'kit-n-title', text: o.title || W.title });
    const pend = h('span', { class: 'kit-n-pend' });
    const body = h('div', { class: 'kit-n-body' }, prog, ul, addRow, h('div', { class: 'kit-n-copy' }, copyBtn, say), out);
    let shell;
    if (o.collapsible) { const d = h('details', { class: 'kit-n kit-n-strip', open: o.open !== false }, h('summary', null, h('span', { class: 'kit-n-title', text: o.title || W.title }), pend), body); shell = d; }
    else shell = h('section', { class: 'kit-n', 'aria-label': o.title || W.title }, h('div', { class: 'kit-n-head' }, title), body);
    root.classList.add('kit-n-root'); root.replaceChildren(shell);
    if (o.collapsible) shell.addEventListener('toggle', () => { ul.querySelectorAll('textarea').forEach(t => fit(t, 36)); fit(out, 84); });

    function paintText() { const t = text(); out.value = t || W.empty; copyBtn.disabled = !t; say.textContent = ''; fit(out, 84); }
    function draw(focus) {
      const its = items(), nDone = its.filter(i => S.done[i.id]).length;
      prog.textContent = W.progress(nDone, its.length); pend.textContent = ' ' + W.pending(its.length - nDone);
      ul.replaceChildren(...its.map((it, i) => {
        const n = id0 + it.id;
        return h('li', { class: 'kit-n-item', 'data-id': it.id, 'data-done': S.done[it.id] ? '1' : '0' },
          h('span', { class: 'kit-n-num', text: String(i + 1) }),
          h('div', { class: 'kit-n-t' }, h('span', { class: 'kit-n-tt', text: it.title }), it.sub ? h('small', { text: it.sub }) : null),
          h('div', { class: 'kit-n-chk' },
            h('label', null, h('input', { type: 'checkbox', 'data-a': 'done', id: n + '-d', checked: !!S.done[it.id] }), W.done),
            h('label', null, h('input', { type: 'checkbox', 'data-a': 'pick', id: n + '-p', checked: !!S.picked[it.id] }), W.pick)),
          h('div', { class: 'kit-n-mv' },
            h('button', { type: 'button', class: 'kit-n-btn sm', 'data-a': 'up', 'aria-label': W.moveUp(it.title), disabled: i === 0, text: '↑ ' + W.up }),
            h('button', { type: 'button', class: 'kit-n-btn sm', 'data-a': 'down', 'aria-label': W.moveDown(it.title), disabled: i === its.length - 1, text: '↓ ' + W.down }),
            it.own ? h('button', { type: 'button', class: 'kit-n-btn sm', 'data-a': 'del', 'aria-label': W.removeStep(it.title), text: W.remove }) : null),
          h('textarea', { 'data-a': 'note', id: n + '-n', rows: 1, 'aria-label': W.noteFor(i + 1), placeholder: W.note, value: S.notes[it.id] || '' }));
      }));
      paintText(); ul.querySelectorAll('textarea').forEach(t => fit(t, 36));
      if (focus) { const b = ul.querySelector('[data-id="' + focus.id + '"] [data-a="' + focus.a + '"]'); if (b && !b.disabled) b.focus(); else { const alt = ul.querySelector('[data-id="' + focus.id + '"] [data-a]'); if (alt) alt.focus(); } }
    }
    ul.addEventListener('change', e => {
      const li = e.target.closest('.kit-n-item'); if (!li) return; const id = li.dataset.id, a = e.target.dataset.a;
      if (a === 'done') { if (e.target.checked) S.done[id] = true; else delete S.done[id]; }
      else if (a === 'pick') { if (e.target.checked) S.picked[id] = true; else delete S.picked[id]; }
      else return;
      changed(); draw({ id, a });
    });
    ul.addEventListener('input', e => {
      if (e.target.dataset.a !== 'note') return; const id = e.target.closest('.kit-n-item').dataset.id, v = e.target.value;
      if (v) S.notes[id] = v; else delete S.notes[id];
      fit(e.target, 36); changed(); paintText();
    });
    ul.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return; const id = b.closest('.kit-n-item').dataset.id, a = b.dataset.a;
      const ids = items().map(i => i.id), i = ids.indexOf(id);
      if (a === 'up' && i > 0) { ids.splice(i - 1, 0, ids.splice(i, 1)[0]); S.order = ids; }
      else if (a === 'down' && i < ids.length - 1) { ids.splice(i + 1, 0, ids.splice(i, 1)[0]); S.order = ids; }
      else if (a === 'del') { S.extras = S.extras.filter(x => x.id !== id); S.order = S.order.filter(x => x !== id); delete S.done[id]; delete S.picked[id]; delete S.notes[id]; }
      else return;
      changed(); draw({ id, a });
    });
    draw();
    return { setState(s) { S = clone(s || {}); draw(); }, state: () => clone(S), text, destroy() { root.replaceChildren(); root.classList.remove('kit-n-root'); } };
  },
});
})();
/* /part:page.script.kit.next-steps */
