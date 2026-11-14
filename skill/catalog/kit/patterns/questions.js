/* part:page.script.kit.questions */
/**
 * Question cards with sticky answer bar
 * Kit.questions.mount(root, {questions, answers, db}) draws one card per question: the question, why it matters, a few facts, radio options (one marked Recommended), a note and its own state in words (not answered, picked and not submitted, submitted with a time). The sticky bar counts the submitted answers with a meter, takes every recommendation at once, submits every picked answer, and copies the answers as text for a page that cannot save. A "Something else" option needs a note before it can be submitted. A saved answer can carry Claude's reply and a history, which the card shows under it. Live updates come in through setAnswers, which never overwrites a card the owner is editing.
 *
 * What it is: the owner's open questions as cards. Each card has the question, why it matters, a few facts, options with an optional recommendation,
 * a note, and its own state (not answered, picked and not submitted, submitted with a time). A sticky bar counts the submitted answers, takes every
 * recommendation at once, submits every picked answer, and copies the answers as text for a page that cannot save. Plain DOM, no framework.
 *
 * API (small and stable):
 *   Kit.questions.mount(root, opts) -> {setAnswers(map), answers(), refresh(), destroy()}
 *     questions   [{id, title, why, facts: [text], options: [{id, label, detail}], recommended: optionId, reason, allowOther}]
 *                 allowOther adds a "Something else" option that needs a note before it can be submitted
 *     answers     {questionId: {q, choice, label, note, at, claude, log: [{at, by, what}]}}   answers already saved (claude is Claude's reply, shown under the card)
 *     collection  db collection the answers are written to (default "answers"); one doc per question, id = question id
 *     db          the object Kit.db.create returns (uses db.put); or save(id, doc) -> Promise, which wins when both are given
 *     canWrite    false when the viewer may read but not write (Submit stays off, Copy my answers still works); default true when a save target exists
 *     headingLevel  2-6, the level of each card's heading (default 3);  words  texts that replace the defaults
 *     onSubmit(doc)  hook after a save;  onState(text)  hook for the bar's status line
 *   setAnswers(map) is for the board's live subscription: it replaces the saved answers and keeps any card the owner is editing.
 *
 * Doc written: {q, choice, label, note, at}. Claude may add {claude, log} on the same doc; the card shows them.
 *
 * caps db (optional): the collection above, in the board's db. Without it the cards still work and the answers can be copied.
 *
 * @id        pattern.questions
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Owner questions with options and a recommendation, a sticky bar counting answers, take-all, submit-all and a copy fallback.
 * @tags      questions, answers, owner input, options, recommendation, sticky bar, submit, decisions, db
 * @requires  kit.copy
 * @files     kit/patterns/questions.css, kit/samples/patterns.json
 * @provides  Kit.questions.mount
 * @config    Kit.questions.mount(root, {questions, answers, collection, db \| save, canWrite}) | questions [{id, title, why, facts, options [{id, label, detail}], recommended, reason, allowOther}]; answers is what is already saved; db is the object Kit.db.create returns, or save(id, doc) -> Promise
 * @config    hooks | onSubmit(doc) after a save, onState(text) for the status line; setAnswers(map) from the board's live subscription
 * @config    Kit.copy | Copy my answers uses Kit.copy.text; without it the answers appear in a box to copy by hand
 * @tokens    --bg --panel --sunk --ink --ink-2 --ink-3 --rule --accent --accent-ink --accent-soft --ok --warn --f-ui --f-mono --f-display? --kit-topbar-h? --seam?
 * @globals   none
 * @db        reads answers (or the configured collection), through the board's own snapshot, handed to setAnswers / writes answers/<question id>: {q, choice, label, note, at} / note A real artifact declares the db capability. Claude may add {claude, claudeAt, log: [{at, by, what}]} to the same doc and the card shows it. With no db the cards still work and the answers copy out as text.
 * @source    Catalog harvest, 2026-10-25 | a decisions board's index.html | question cards with options, a recommendation, a note, and the sticky answer bar with take-all, submit-all and copy
 * @source    Catalog harvest, 2026-10-25 | a task list's index.html | option cards with a reply box, Claude's note on the answer and a history
 * @preview   {"render": "pattern.questions", "samples": ["kit/samples/patterns.json#questions"]}
 * @samples   questions
 * @changed   Written as one mount call over plain data, not as page markup; the question list is data the board supplies.
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
const when = iso => { try { return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
const WORDS = {
  count: (n, t) => n + ' of ' + t + ' submitted',
  none: 'Not answered', picked: 'Picked, not submitted', sent: t => 'Submitted ' + t,
  recommended: 'Recommended', recommendation: 'Recommendation',
  noteLabel: 'Note (optional)', noteOther: 'Your answer', other: 'Something else', otherDetail: 'Write it in the note below.',
  take: 'Use the recommendation', takeAll: 'Take all recommendations', submit: 'Submit', submitAll: 'Submit all picked', copy: 'Copy my answers',
  claude: 'Claude', history: n => 'History (' + n + ')', you: 'You',
  ready: 'Pick an answer on each question, then submit.',
  needNote: t => 'Write your own answer in the note for "' + t + '", then submit.',
  saving: 'Saving…', saved: 'Saved. Claude reads the answers from here.',
  readOnly: 'You can read these answers but not save them. Use Copy my answers and paste them to Claude.',
  nowhere: 'This page has nowhere to save. Use Copy my answers and paste them to Claude.',
  failed: 'Could not save. Check the connection and submit again.',
  tookN: n => 'Picked the recommendation on ' + n + ' unanswered question' + (n > 1 ? 's' : '') + '. Read them, then submit all picked.',
  tookNone: 'Every question already has an answer or a pick.',
  copied: 'Copied. Paste it to Claude.', copyBy: 'Copy this text and paste it to Claude:', noAnswer: '(no answer)',
};
let seq = 0;

Kit.questions = Object.freeze({
  mount(root, o) {
    const W = Object.assign({}, WORDS, o.words), id0 = 'kq' + (++seq) + '-';
    const Q = o.questions || [], total = Q.length, coll = o.collection || 'answers', lvl = Math.min(6, Math.max(2, o.headingLevel || 3));
    const target = o.save || (o.db && o.db.put ? (id, doc) => o.db.put(coll, id, doc) : null);
    let writable = !!target && o.canWrite !== false, saved = {};
    const cards = {};
    const optsOf = q => (q.options || []).concat(q.allowOther ? [{ id: 'other', label: W.other, detail: W.otherDetail }] : []);
    const labelOf = (q, c) => { const x = optsOf(q).find(p => p.id === c); return x ? x.label : c; };

    const state = h('p', { class: 'kit-q-state-line', role: 'status', 'aria-live': 'polite' });
    const count = h('b', { class: 'kit-q-count' });
    const meter = h('div', { class: 'kit-q-meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-label': 'Submitted answers' }, h('i'));
    const takeAll = h('button', { type: 'button', class: 'kit-q-btn', text: W.takeAll, onclick: onTakeAll });
    const sendAll = h('button', { type: 'button', class: 'kit-q-btn pri', text: W.submitAll, onclick: onSendAll });
    const copyBtn = h('button', { type: 'button', class: 'kit-q-btn', text: W.copy, onclick: onCopy });
    const bar = h('div', { class: 'kit-q-bar' }, count, meter, h('div', { class: 'kit-q-bar-act' }, takeAll, sendAll, copyBtn), state);
    const list = h('div', { class: 'kit-q-list' });
    root.classList.add('kit-q-root'); root.replaceChildren(bar, list);

    function say(t) { state.textContent = t; if (o.onState) o.onState(t); }
    const pick = q => { const r = cards[q.id].el.querySelector('input:checked'); return r ? r.value : null; };
    const noteOf = q => cards[q.id].ta.value.trim();
    const isDirty = q => { const c = pick(q), s = saved[q.id]; return !!c && (!s || s.choice !== c || (s.note || '') !== noteOf(q)); };

    Q.forEach(q => {
      const n = id0 + q.id, ta = h('textarea', { id: n + '-note', rows: 2, 'aria-label': W.noteLabel, placeholder: W.noteLabel });
      const rec = (q.options || []).find(p => p.id === q.recommended);
      const radios = optsOf(q).map(p => h('label', { class: 'kit-q-opt' },
        h('input', { type: 'radio', name: n, value: p.id }),
        h('span', { class: 'kit-q-ob' }, h('span', { class: 'kit-q-ol' }, p.label, p.id === q.recommended ? h('span', { class: 'kit-q-rc', text: W.recommended }) : null), p.detail ? h('span', { class: 'kit-q-od', text: p.detail }) : null)));
      const stateEl = h('span', { class: 'kit-q-st' });
      const take = h('button', { type: 'button', class: 'kit-q-btn', text: W.take, hidden: !rec, onclick: () => { const r = cards[q.id].el.querySelector('input[value="' + q.recommended + '"]'); if (r) { r.checked = true; paint(q); tally(); } } });
      const send = h('button', { type: 'button', class: 'kit-q-btn pri', text: W.submit, onclick: () => submit(q) });
      const extra = h('div', { class: 'kit-q-extra' });
      const el = h('section', { class: 'kit-q', 'data-q': q.id, 'aria-labelledby': n + '-h' },
        h('header', { class: 'kit-q-head' }, h('h' + lvl, { id: n + '-h', class: 'kit-q-title', text: q.title }), stateEl),
        q.why ? h('p', { class: 'kit-q-why', text: q.why }) : null,
        (q.facts || []).length ? h('ul', { class: 'kit-q-facts' }, q.facts.map(f => h('li', { text: f }))) : null,
        h('fieldset', { class: 'kit-q-opts' }, h('legend', { class: 'kit-q-sr', text: q.title }), radios),
        rec && q.reason ? h('p', { class: 'kit-q-rec' }, h('b', { text: W.recommendation + ': ' + rec.label + '. ' }), q.reason) : null,
        ta,
        h('div', { class: 'kit-q-act' }, take, send), extra);
      el.addEventListener('change', () => { paint(q); tally(); });
      ta.addEventListener('input', () => { paint(q); tally(); });
      cards[q.id] = { el, ta, stateEl, take, send, extra };
      list.append(el);
    });

    function paintExtra(q) {
      const s = saved[q.id], ex = cards[q.id].extra; ex.replaceChildren();
      if (s && s.claude) ex.append(h('div', { class: 'kit-q-claude' }, h('b', { text: W.claude }), s.claudeAt ? ' · ' + when(s.claudeAt) : '', h('p', { text: s.claude })));
      if (s && Array.isArray(s.log) && s.log.length) ex.append(h('details', { class: 'kit-q-hist' }, h('summary', { text: W.history(s.log.length) }),
        h('ol', null, s.log.slice().reverse().map(e => h('li', null, when(e.at) + ' · ', h('b', { text: e.by === 'claude' ? W.claude : W.you }), ' · ' + e.what)))));
    }
    function paint(q) {
      const c = cards[q.id], s = saved[q.id], dirty = isDirty(q);
      c.el.dataset.state = dirty ? 'dirty' : s ? 'saved' : 'open';
      c.stateEl.textContent = dirty ? W.picked : s ? W.sent(when(s.at)) : W.none;
      c.send.disabled = !(dirty && writable); c.take.disabled = false;
      c.el.querySelectorAll('.kit-q-opt').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
    }
    function tally() {
      const n = Q.filter(q => saved[q.id]).length;
      count.textContent = W.count(n, total); meter.setAttribute('aria-valuenow', n); meter.firstChild.style.width = total ? (n / total * 100) + '%' : '0%';
      sendAll.disabled = !(Q.some(isDirty) && writable);
      takeAll.disabled = !Q.some(q => !saved[q.id] && !pick(q) && q.recommended);
    }
    function refresh() { Q.forEach(q => { paint(q); paintExtra(q); }); tally(); }

    async function submit(q) {
      const choice = pick(q), note = noteOf(q); if (!choice || !target) return false;
      if (choice === 'other' && !note) { say(W.needNote(q.title)); cards[q.id].ta.focus(); return false; }
      const doc = { q: q.id, choice, label: labelOf(q, choice), note, at: new Date().toISOString() };
      say(W.saving);
      try {
        await target(q.id, doc);
        saved[q.id] = Object.assign({}, saved[q.id] && { claude: saved[q.id].claude, claudeAt: saved[q.id].claudeAt, log: saved[q.id].log }, doc);
        cards[q.id].ta.value = note; refresh(); say(W.saved); if (o.onSubmit) o.onSubmit(doc); return true;
      } catch (e) {
        if (e && (e.code === 'permission_denied' || e.code === 'not_granted' || e.code === 'invalid_argument')) { writable = false; refresh(); say(W.readOnly); }
        else say(W.failed);
        return false;
      }
    }
    function onTakeAll() {
      let k = 0;
      Q.forEach(q => { if (!saved[q.id] && !pick(q) && q.recommended) { const r = cards[q.id].el.querySelector('input[value="' + q.recommended + '"]'); if (r) { r.checked = true; k++; } } });
      refresh(); say(k ? W.tookN(k) : W.tookNone);
    }
    async function onSendAll() { for (const q of Q.filter(isDirty)) await submit(q); }
    function asText() {
      return Q.map(q => { const c = pick(q), n = noteOf(q); return q.title + ': ' + (c ? labelOf(q, c) : W.noAnswer) + (n ? ' - ' + n : ''); }).join('\n');
    }
    function onCopy() {
      const text = asText();
      const ta = h('textarea', { class: 'kit-q-copyta', rows: 6, readonly: '', 'aria-label': 'Your answers' }); ta.value = text;
      if (!(Kit.copy && Kit.copy.text)) { state.replaceChildren(W.copyBy, ta); ta.select(); return; }
      state.replaceChildren(ta); ta.hidden = false;
      Kit.copy.text(text, { select: ta }).then(st => { if (st === 'copied') { ta.remove(); say(W.copied); } else { state.replaceChildren(W.copyBy, ta); ta.select(); } });
    }

    function setAnswers(map) {
      saved = Object.assign({}, map);
      Q.forEach(q => {
        const s = saved[q.id], c = cards[q.id]; if (!s || c.el.dataset.state === 'dirty') return;
        const r = c.el.querySelector('input[value="' + s.choice + '"]'); if (r) r.checked = true;
        if (document.activeElement !== c.ta) c.ta.value = s.note || '';
      });
      refresh();
    }
    setAnswers(o.answers || {});
    say(!target ? W.nowhere : !writable ? W.readOnly : W.ready);
    return { setAnswers, answers: () => Object.assign({}, saved), refresh, say, destroy() { root.replaceChildren(); root.classList.remove('kit-q-root'); } };
  },
});
})();
/* /part:page.script.kit.questions */
