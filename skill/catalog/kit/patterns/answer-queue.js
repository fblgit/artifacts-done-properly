/* part:page.script.kit.answer-queue */
/* Kit pattern: answer a run of items (Kit.answerQueue)    kit version 0.1.0
   What it is: a dialog for one item at a time, with tabs (the answer, the details, the history). The item's state leads the dialog as a crown. When you answer, the dialog moves on to the next
   item that is still waiting on you and says which; when none is left it closes and a toast says everyone is caught up. So a run of decisions never goes back to the list in between. A
   "Next waiting" button skips ahead without answering. Plain DOM over a native <dialog> (focus is trapped and Escape closes, by the browser); every text is set with textContent.
   API (small and stable):
     Kit.answerQueue.mount({items, isWaiting, stateEnum, answeredState, tabs, onAnswer, onDelete, onChange, host, caughtUp, label}) -> queue
       items          [{id, title, state, note, choices: [{id, label}], choice, reply, fields: [[label, value]], history: [{at, text}], phase}]
       isWaiting      (item) -> boolean   what counts as waiting on you (default: item.state === "waiting")
       stateEnum      the Kit.vocab enum of item.state (default "state"); answeredState is the value set on an answered item (default "review"; give one your enum has)
       tabs           extra or replacement tabs: [{id, label, render(item, panel, queue), when(item)}]; the built-in answer, details and history tabs are used when this is left out
       onAnswer       (item, {choice, reply}) -> void | Promise   run before the queue moves on; a rejection keeps the dialog on the item and shows the error text in it
       onDelete       (item) -> void | Promise   when given, the answer tab has a two-step "Delete" button
       onChange       (items) after an item changes
       host           the element the dialog and the toast are added to (default document.body); give the element that carries your theme tokens when they are not on :root
       caughtUp       the toast text when no item waits any more (default "All caught up: nothing else waits on you.")
     queue.open(id)  queue.close()  queue.next()  queue.waiting() -> [items]  queue.update(items)  queue.dialog -> the <dialog>  queue.destroy()
     Kit.answerQueue.armed(button, onConfirm, {label, ms}) -> void     makes a button a two-step control: the first click turns it into a "Confirm" button for ms (default 3000), the second runs onConfirm
     The order the run follows is the order of items, starting after the item just answered and wrapping round.
   Needs from the board:
     css     kit/patterns/answer-queue.css; custom properties --bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --danger --shadow --f-ui --f-display --f-mono, optional --seam
     kit     kit/tabs.js and kit/tabs.css (the dialog's tabs), kit/vocab.js and kit/vocab.css (the crown's state pill)
     globals HTMLDialogElement (showModal); without it the dialog opens as a plain box
   db collections: none (onAnswer is where the page writes).
   Lifted from: an earlier board's card dialog (the state crown, the answer, record and history tabs, advancing to the next card that waits on you, the all-caught-up toast and the two-step delete). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;

function armed(btn, onConfirm, o) {
  o = Object.assign({ label: 'Confirm', ms: 3000 }, o);
  let t = 0, orig = null;
  const reset = () => { if (orig == null) return; btn.textContent = orig; orig = null; btn.classList.remove('kit-aq-armed'); btn.removeAttribute('data-armed'); clearTimeout(t); };
  btn.addEventListener('click', e => {
    if (orig == null) { e.preventDefault(); orig = btn.textContent; btn.textContent = o.label; btn.classList.add('kit-aq-armed'); btn.dataset.armed = '1'; t = setTimeout(reset, o.ms); return; }
    reset(); onConfirm(e);
  });
  btn.addEventListener('blur', () => { if (orig != null) setTimeout(reset, 150); });
}

function mount(opts) {
  const o = Object.assign({ items: [], stateEnum: 'state', answeredState: 'review', label: 'Items waiting on you', caughtUp: 'All caught up: nothing else waits on you.', host: document.body, isWaiting: it => it.state === 'waiting' }, opts);
  const n = ++uid;
  const dlg = el('dialog', 'kit-aq'); dlg.setAttribute('aria-labelledby', 'kit-aq-t' + n);
  const inner = el('div', 'kit-aq-in'); dlg.append(inner); o.host.append(dlg);
  let items = o.items.slice(), curId = null, advMsg = '', tabsApi = null, toastT = 0, toastEl = null, err = '', busy = false;
  const find = id => items.find(i => i.id === id);
  const waiting = () => items.filter(o.isWaiting);
  function nextAfter(id) {
    const q = waiting(), i = q.findIndex(t => t.id === id);
    if (i >= 0) return (q.slice(i + 1).concat(q.slice(0, i)))[0] || null;
    const at = items.findIndex(t => t.id === id), after = items.slice(at + 1).concat(items.slice(0, Math.max(at, 0))); return after.find(o.isWaiting) || null;
  }
  function toast(text) {
    if (!toastEl) { toastEl = el('div', 'kit-aq-toast'); toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); o.host.append(toastEl); }
    toastEl.textContent = text; toastEl.classList.add('kit-aq-on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl && toastEl.classList.remove('kit-aq-on'), 4200);
  }
  function stateRow(v) { const g = Kit.vocab && Kit.vocab.get && Kit.vocab.get(o.stateEnum, v); return g || { word: String(v), tone: 'neutral' }; }

  function answerPanel(it, panel, q) {
    const form = el('form', 'kit-aq-form'); form.noValidate = true;
    if (it.note) form.append(el('p', 'kit-aq-note', it.note));
    let pick = it.choice || null;
    if ((it.choices || []).length) {
      const fs = el('fieldset', 'kit-aq-choices'); fs.append(el('legend', null, 'Your choice'));
      it.choices.forEach(c => {
        const lab = el('label', 'kit-aq-choice'), r = el('input'); r.type = 'radio'; r.name = 'kit-aq-c' + n; r.value = c.id; r.checked = pick === c.id;
        r.addEventListener('change', () => { pick = c.id; }); lab.append(r, el('span', null, c.label)); fs.append(lab);
      });
      form.append(fs);
    }
    const tid = 'kit-aq-r' + n, lab = el('label', 'kit-aq-rl', 'Reply (optional)'); lab.htmlFor = tid;
    const ta = el('textarea', 'kit-aq-ta'); ta.id = tid; ta.rows = 3; ta.value = it.reply || '';
    const msg = el('p', 'kit-aq-err'); msg.setAttribute('role', 'alert'); msg.textContent = err; msg.hidden = !err;
    const row = el('div', 'kit-aq-actions'), send = el('button', 'kit-aq-send', 'Send answer'); send.type = 'submit';
    row.append(send);
    if (o.onDelete) { const del = el('button', 'kit-aq-del', 'Delete'); del.type = 'button'; armed(del, () => { const nx = nextAfter(it.id); Promise.resolve(o.onDelete(it)).then(() => { items = items.filter(x => x.id !== it.id); if (o.onChange) o.onChange(items.slice()); advance(it.id, nx, false); }, e => { err = (e && e.message) || 'Could not delete.'; draw(); }); }, { label: 'Confirm delete' }); row.append(del); }
    form.append(lab, ta, msg, row);
    form.addEventListener('submit', e => {
      e.preventDefault(); if (busy) return; busy = true; send.disabled = true; err = '';
      if ((it.choices || []).length && !pick && !ta.value.trim()) { err = 'Choose an option or write a reply first.'; busy = false; draw(); return; }
      const nxt = nextAfter(it.id), was = o.isWaiting(it);
      Promise.resolve(o.onAnswer ? o.onAnswer(it, { choice: pick, reply: ta.value.trim() }) : null).then(() => {
        it.choice = pick; it.reply = ta.value.trim(); it.history = (it.history || []).concat([{ at: 'now', text: pick ? 'chose ' + ((it.choices || []).find(c => c.id === pick) || {}).label : 'replied' }]);
        it.state = o.answeredState; busy = false; if (o.onChange) o.onChange(items.slice()); advance(it.id, was ? nxt : null, true);
      }, e2 => { busy = false; err = (e2 && e2.message) || 'The answer was not saved. Try again.'; draw(); });
    });
    panel.append(form);
  }
  function advance(fromId, nxt, answered) {
    if (curId !== fromId) return;
    if (nxt && find(nxt.id)) { const it = find(fromId); advMsg = (it ? (answered ? 'Answered ' : 'Removed ') + it.id + '. ' : '') + 'Next on your list: ' + nxt.id + ' · ' + nxt.title; curId = nxt.id; draw(); const h = inner.querySelector('.kit-aq-title'); if (h) h.focus(); }
    else { close(); toast(o.caughtUp); }
  }
  function detailsPanel(it, panel) {
    const dl = el('dl', 'kit-aq-facts'); (it.fields || []).forEach(([k, v]) => { dl.append(el('dt', null, k), el('dd', null, String(v))); }); panel.append(dl);
  }
  function historyPanel(it, panel) {
    const ol = el('ol', 'kit-aq-hist'); (it.history || []).forEach(h => { const li = el('li'); if (h.at) li.append(el('time', null, h.at), document.createTextNode(' ')); li.append(document.createTextNode(h.text)); ol.append(li); }); panel.append(ol);
  }
  function tabList(it) {
    if (o.tabs) return o.tabs.filter(t => !t.when || t.when(it));
    const t = [{ id: 'answer', label: 'Answer', render: answerPanel }];
    if ((it.fields || []).length) t.push({ id: 'details', label: 'Details', render: detailsPanel });
    if ((it.history || []).length) t.push({ id: 'history', label: 'History', render: historyPanel });
    return t;
  }
  function draw() {
    const it = find(curId); if (!it) return;
    if (tabsApi) { tabsApi.destroy(); tabsApi = null; }
    inner.textContent = '';
    const r = stateRow(it.state), crown = el('header', 'kit-aq-crown'); crown.setAttribute('data-vo-tone', r.tone);
    const top = el('div', 'kit-aq-top'); top.append(el('span', 'kit-aq-id', it.id));
    const pill = Kit.vocab && Kit.vocab.pill ? Kit.vocab.pill(o.stateEnum, it.state) : null; top.append(pill || el('span', 'kit-aq-sw', r.word));
    const x = el('button', 'kit-aq-x', 'Close'); x.type = 'button'; x.addEventListener('click', close); top.append(x);
    const h = el('h2', 'kit-aq-title', it.title); h.id = 'kit-aq-t' + n; h.tabIndex = -1;
    crown.append(top, h);
    const meta = el('div', 'kit-aq-meta'); if (it.phase) meta.append(el('span', 'kit-aq-tag', it.phase));
    const rest = waiting().filter(t => t.id !== it.id);
    if (o.isWaiting(it) && rest.length) { const nb = el('button', 'kit-aq-next'); nb.type = 'button'; nb.append(document.createTextNode('Next waiting '), el('b', null, String(rest.length))); nb.addEventListener('click', () => { const nx = nextAfter(it.id); if (nx) { advMsg = ''; curId = nx.id; draw(); const t = inner.querySelector('.kit-aq-title'); if (t) t.focus(); } }); meta.append(nb); }
    if (meta.children.length) crown.append(meta);
    inner.append(crown);
    if (advMsg) { const a = el('p', 'kit-aq-adv', advMsg); a.setAttribute('role', 'status'); inner.append(a); advMsg = ''; }
    const set = el('div', 'kit-tabs'), list = tabList(it);
    list.forEach(t => { const p = el('section'); p.dataset.tabPanel = t.id; t.render(it, p, api); set.append(p); });
    inner.append(set);
    if (Kit.tabs && list.length > 1) tabsApi = Kit.tabs.mount(set, { tabs: list.map(t => ({ id: t.id, label: t.label })), label: 'About ' + it.id, hash: false });
    else if (list.length) set.querySelectorAll('[data-tab-panel]').forEach(p => { p.hidden = false; });
  }
  function open(id) {
    if (!find(id)) return; curId = id; advMsg = ''; err = ''; draw();
    if (!dlg.open) { try { dlg.showModal(); } catch (_) { dlg.setAttribute('open', ''); } }
    const h = inner.querySelector('.kit-aq-title'); if (h) h.focus();
  }
  function close() { if (dlg.open) dlg.close(); else dlg.removeAttribute('open'); curId = null; if (tabsApi) { tabsApi.destroy(); tabsApi = null; } inner.textContent = ''; }
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  dlg.addEventListener('cancel', () => { curId = null; });
  const api = {
    dialog: dlg, open, close,
    next() { const q = waiting(); if (q[0]) open(q[0].id); },
    waiting, update(next) { items = next.slice(); if (curId && !find(curId)) close(); else if (curId) draw(); },
    destroy() { close(); dlg.remove(); if (toastEl) toastEl.remove(); },
  };
  return api;
}
Kit.answerQueue = Object.freeze({ mount, armed });
})();
/* /part:page.script.kit.answer-queue */
