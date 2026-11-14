/* part:page.script.kit.decisions */
/**
 * Owner decision cards
 * Kit.decisions.mount(root, {decisions, records, db}) draws one card per decision: the question, why it blocks something, a button per option and a "Something else" line. One tap records the answer to the db; the card then shows the answer with its date and a Change answer button. A status line under a recorded card says where Claude is with it: waiting for Claude to pick it up, has it, working on it, answered, with four pips and the words. The board forwards the answer to Claude from afterRecord (for example with kit.claude-lane) and Claude's progress arrives on the same doc. Focus returns to the right control after every redraw. A read-only viewer sees the recorded answers and "Not decided yet" in place of buttons.
 *
 * The decisions an owner owes, one card each: the question, why it blocks something, a button per option and a "Something else" line.
 * One tap records the answer, the card then shows the answer with its date and a Change answer button, and a status line says where Claude is with it
 * (waiting, has it, working, answered). Plain DOM, no framework. For a register of many decisions use kit.table; for questions with notes and a bar, pattern.questions.
 *
 * API (small and stable):
 *   Kit.decisions.mount(root, opts) -> {setRecords(map), records(), destroy()}
 *     decisions   [{id, order, question, why, options: [{key, label}], allowOther}]    allowOther defaults to true
 *     records     {decisionId: {question, order, answer, label, answeredBy, answeredAt, claude: {step, text}}}   what is already recorded
 *     collection  db collection the records are written to (default "decisions"); one doc per decision, id = decision id
 *     db          the object Kit.db.create returns (uses db.put); or save(id, doc) -> Promise, which wins when both are given
 *     who         the viewer's id, stored as answeredBy;  canWrite  false shows "Waiting on the owner" instead of buttons (default true when a save target exists)
 *     afterRecord(decision, doc, cardEl)   hook after a save: where a board sends the answer to Claude, e.g. Kit.claudeLane's lane.sendRequest(text, cardEl, decision.id)
 *     claude(decision, record) -> {step, text} | null   where Claude is with it; default reads record.claude. step is queue, ack, pending or done.
 *     headingLevel  2-6 (default 3);  words  texts that replace the defaults
 *   setRecords(map) is for the board's live subscription: it replaces the records and redraws the cards that are not being edited.
 * Doc written: {question, order, answer, label, answeredBy, answeredAt}. The Claude session writes {claude: {step, text}} on the same doc, or the board reads it from its request docs.
 *
 * @id        pattern.decisions
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Decision cards where one tap records the owner's answer and a status line shows where Claude is with it.
 * @tags      decisions, owner, record, answer, buttons, claude, status, ask claude, db
 * @requires  none
 * @files     kit/patterns/decisions.css, kit/samples/decisions.json
 * @provides  Kit.decisions.mount
 * @config    Kit.decisions.mount(root, {decisions, records, collection, db \| save, who, canWrite}) | decisions [{id, order, question, why, options [{key, label}], allowOther}]; records is what is already recorded
 * @config    afterRecord(decision, doc, cardEl) | where the board sends the answer to Claude; with kit.claude-lane that is lane.sendRequest(text, cardEl, decision.id)
 * @config    claude(decision, record) | optional: returns {step, text} for the status line; the default reads record.claude. step is queue, ack, pending or done
 * @config    setRecords(map) | from the board's live subscription to the collection
 * @tokens    --bg --panel --ink --ink-2 --ink-3 --rule --accent --accent-ink --accent-soft --ok --warn --f-ui --f-mono --f-display? --seam?
 * @globals   none
 * @db        reads decisions (or the configured collection), through the board's own snapshot, handed to setRecords / writes decisions/<decision id>: {question, order, answer, label, answeredBy, answeredAt} / note A real artifact declares the db capability, and the comments capability (ask Claude) when afterRecord forwards the answer. The Claude session writes {claude: {step, text}} on the same doc. kit.claude-lane is the optional way to forward and track the request; this file does not call it, so it is not required.
 * @source    Catalog harvest, 2026-10-25 | a proposal page's index.html | owner decision cards: record, change answer, something else, focus kept across redraws, live read of the collection
 * @source    Catalog harvest, 2026-10-25 | a register page's index.html | the open, sent and done pills of a decision register
 * @preview   {"render": "pattern.decisions", "samples": ["kit/samples/decisions.json"]}
 * @changed   A status line for Claude's side (four steps, in words) is new; the source recorded the answer and stopped.
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
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'value') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}
const when = iso => { try { return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }); } catch (_) { return ''; } };
const STEPS = ['queue', 'ack', 'pending', 'done'];
const WORDS = {
  open: n => n + ' waiting on you', recorded: n => n + ' recorded', allDone: 'All decisions are recorded.',
  other: 'Something else', otherPlaceholder: 'Your answer, in a line', otherRecord: 'Record answer', elseIs: l => 'Something else: ' + l,
  recorded1: d => 'Recorded ' + d, change: 'Change answer', keep: 'Keep current answer', recording: 'Recording…',
  waiting: 'Not decided yet. Only an editor of this page can record it.',
  refused: 'Not recorded. Only an editor of this page can record decisions.', failed: 'Not recorded. Try again.',
  announce: l => 'Recorded: ' + l,
  steps: { queue: 'Waiting for Claude to pick it up', ack: 'Claude has it', pending: 'Claude is working on it', done: 'Claude answered' },
};
let seq = 0;

Kit.decisions = Object.freeze({
  mount(root, o) {
    const W = Object.assign({}, WORDS, o.words), WS = Object.assign({}, WORDS.steps, (o.words || {}).steps), id0 = 'kd' + (++seq) + '-';
    const D = (o.decisions || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)), coll = o.collection || 'decisions', lvl = Math.min(6, Math.max(2, o.headingLevel || 3));
    const target = o.save || (o.db && o.db.put ? (id, doc) => o.db.put(coll, id, doc) : null);
    let canWrite = o.canWrite !== false, recs = Object.assign({}, o.records), focusAfter = null;
    const editing = {}, pending = {}, msgs = {}, otherOpen = {};
    const head = h('p', { class: 'kit-d-sum' }), live = h('p', { class: 'kit-d-sr', role: 'status', 'aria-live': 'polite' });
    const list = h('div', { class: 'kit-d-list' });
    root.classList.add('kit-d-root'); root.replaceChildren(head, list, live);

    async function record(d, answer, label) {
      const a = recs[d.id] || {};
      if (a.answer === answer && a.label === label) { editing[d.id] = false; focusAfter = 'change:' + d.id; draw(); return; }
      pending[d.id] = true; msgs[d.id] = ''; draw();
      const doc = { question: d.question, order: d.order || 0, answer, label, answeredBy: o.who || null, answeredAt: new Date().toISOString() };
      try {
        if (!target) throw Object.assign(new Error('no save target'), { code: 'none' });
        await target(d.id, doc);
        recs[d.id] = doc; editing[d.id] = false; otherOpen[d.id] = false; focusAfter = 'change:' + d.id; live.textContent = W.announce(label);
        pending[d.id] = false; draw();
        if (o.afterRecord) { const el = list.querySelector('[data-d="' + d.id + '"]'); try { o.afterRecord(d, doc, el); } catch (_) {} }
        return;
      } catch (e) {
        if (e && (e.code === 'invalid_argument' || e.code === 'permission_denied' || e.code === 'not_granted')) { canWrite = false; msgs[d.id] = W.refused; }
        else msgs[d.id] = W.failed;
        focusAfter = 'opt:' + d.id;
      }
      pending[d.id] = false; draw();
    }

    function claudeLine(d) {
      const c = o.claude ? o.claude(d, recs[d.id]) : (recs[d.id] || {}).claude; if (!c || !c.step) return null;
      const at = STEPS.indexOf(c.step);
      return h('div', { class: 'kit-d-claude', 'data-step': c.step },
        h('span', { class: 'kit-d-pips', 'aria-hidden': 'true' }, STEPS.map((s, i) => h('i', { class: i < at ? 'past' : i === at ? 'now' : '' }))),
        h('b', { text: WS[c.step] || c.step }), c.text ? h('span', { class: 'kit-d-resp', text: c.text }) : null);
    }
    function card(d) {
      const a = recs[d.id] || {}, n = id0 + d.id, busy = !!pending[d.id];
      const kids = [h('div', { class: 'kit-d-q' }, h('h' + lvl, { id: n + '-q', class: 'kit-d-title', text: d.question })), d.why ? h('p', { class: 'kit-d-why', text: d.why }) : null];
      if (a.answer && !editing[d.id]) {
        kids.push(h('div', { class: 'kit-d-done' }, h('span', { class: 'kit-d-ans', text: a.label || a.answer }), a.answeredAt ? h('span', { class: 'kit-d-meta', text: W.recorded1(when(a.answeredAt)) }) : null,
          canWrite ? h('button', { type: 'button', class: 'kit-d-btn ghost', 'data-focus': 'change:' + d.id, text: W.change, onclick: () => { editing[d.id] = true; focusAfter = 'opt:' + d.id; draw(); } }) : null));
      } else if (!canWrite) {
        kids.push(h('p', { class: 'kit-d-meta', text: W.waiting }));
      } else {
        const isOther = a.answer === 'other', box = h('div', { class: 'kit-d-other', hidden: !otherOpen[d.id] && !isOther });
        const input = h('input', { type: 'text', maxlength: 300, placeholder: W.otherPlaceholder, 'aria-label': 'Your answer', value: isOther ? a.label : '' });
        const go = () => { const v = input.value.trim(); if (v) record(d, 'other', v); else input.focus(); };
        const otherBtn = h('button', { type: 'button', class: 'kit-d-btn', disabled: busy, 'aria-pressed': isOther ? 'true' : 'false', 'aria-expanded': box.hidden ? 'false' : 'true', text: isOther ? W.elseIs(a.label) : W.other });
        const close = () => { box.hidden = true; otherOpen[d.id] = false; otherBtn.setAttribute('aria-expanded', 'false'); otherBtn.focus(); };
        otherBtn.addEventListener('click', () => { if (box.hidden) { box.hidden = false; otherOpen[d.id] = true; otherBtn.setAttribute('aria-expanded', 'true'); input.focus(); } else close(); });
        input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } if (ev.key === 'Escape') close(); });
        box.append(input, h('button', { type: 'button', class: 'kit-d-btn pri', text: W.otherRecord, onclick: go }));
        const opts = h('div', { class: 'kit-d-opts', role: 'group', 'aria-labelledby': n + '-q' }, (d.options || []).map((p, i) =>
          h('button', { type: 'button', class: 'kit-d-btn', disabled: busy, 'aria-pressed': a.answer === p.key ? 'true' : 'false', 'data-focus': i === 0 ? 'opt:' + d.id : null, text: p.label, onclick: () => record(d, p.key, p.label) })));
        if (d.allowOther !== false) opts.append(otherBtn);
        if (editing[d.id] && a.answer) opts.append(h('button', { type: 'button', class: 'kit-d-btn ghost', text: W.keep, onclick: () => { editing[d.id] = false; focusAfter = 'change:' + d.id; draw(); } }));
        kids.push(opts, box);
      }
      if (busy) kids.push(h('p', { class: 'kit-d-meta', text: W.recording }));
      if (msgs[d.id]) kids.push(h('p', { class: 'kit-d-msg', role: 'alert', text: msgs[d.id] }));
      const cl = a.answer ? claudeLine(d) : null; if (cl) kids.push(cl);
      return h('article', { class: 'kit-d', 'data-d': d.id, 'data-state': busy ? 'pending' : a.answer ? 'recorded' : 'open', 'aria-busy': busy ? 'true' : null }, kids);
    }
    function draw() {
      const typing = document.activeElement && root.contains(document.activeElement) && document.activeElement.matches('input[type=text]') ? document.activeElement : null;
      const keep = typing ? { v: typing.value, s: typing.selectionStart } : null;
      const ae = document.activeElement, again = !focusAfter && ae && list.contains(ae) && ae.dataset && ae.dataset.focus ? ae.dataset.focus : null;
      list.replaceChildren(...D.map(card));
      if (keep) { const i = list.querySelector('input[type=text]:not([hidden])'); if (i && !i.value) { i.value = keep.v; i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch (_) {} } }
      if (again) focusAfter = again;
      if (focusAfter) { const t = list.querySelector('[data-focus="' + focusAfter + '"]'); focusAfter = null; if (t) t.focus(); }
      const open = D.filter(d => !(recs[d.id] || {}).answer).length;
      head.textContent = open ? W.open(open) + (D.length - open ? ', ' + W.recorded(D.length - open) : '') : W.allDone;
      head.dataset.open = open;
    }
    function setRecords(map) { recs = Object.assign({}, map); draw(); }
    draw();
    return { setRecords, records: () => Object.assign({}, recs), destroy() { root.replaceChildren(); root.classList.remove('kit-d-root'); } };
  },
});
})();
/* /part:page.script.kit.decisions */
