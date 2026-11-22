/* part:page.script.kit.margin-notes */
/**
 * Clause with margin notes
 * Kit.marginNotes.mount(box, {sections}) lays a document out as numbered sections and clauses (1.1, 1.2, 2.1). Each clause reads in the column; beside it sit its state (a glyph and a word), owner, the answer given and who read it. A clause that waits on someone has a change bar; a clause with history carries a footnote number and a 'Revision history' disclosure that lists the entries. The footnotes number across the whole document. The box answers its own width: below about 40rem the margin drops under the clause as a ruled note. Made for the Manuscript theme, whose small caps, 36rem measure and red pen it reads (--label-caps, --measure, --seam), and fine under any other: the preview shows it on the stage's theme and under Manuscript.
 * Since 0.2 a clause can also carry review notes: several per clause, each with a severity, pinned to the exact words it is about (those words are highlighted in the clause), with a suggested replacement one click away. The kit never edits the text: it reports the reader's choice through onAction and the page decides, then calls update().
 *
 * API (small and stable):
 *   Kit.marginNotes.mount(box, {sections, label, stateEnum, words, bar, severity, onAction}) -> {update(opts), destroy()}
 *     sections  [{id, no, title, intro, clauses: [{id, no, title, text, state, owner, answer, ack, history, notes}]}]
 *               answer  {label, text, at}     what was decided, with a label such as "Option b" and when
 *               ack     {by, at}              who read and accepted it
 *               history [{at, text}]          revisions, oldest first; they number as footnotes across the whole document
 *               notes   [{id, severity, title, body, quote, suggestion, state}]   review notes (0.2)
 *                       severity "high" | "medium" | "low"; quote is words of the clause text, highlighted where first found;
 *                       suggestion replaces exactly the quote ("" or absent: the reader is asked for new wording);
 *                       state "open" (default) | "dismissed" | "applied"
 *     stateEnum the Kit.vocab enum the states come from (default "state"); words {state: "Settled"} replaces a state's word in the margin only
 *     bar       the tones that get a change bar (default ["attention", "review", "danger"]); an open high or medium note also sets the bar
 *     severity  words for the severities (default {high: "Must fix", medium: "Should fix", low: "Worth a look"})
 *     onAction  ({clause, note, action}) with action "apply" (take the suggestion), "fill" (write new wording), "dismiss" (not a problem)
 *               or "reopen" (offered on a dismissed note only); without onAction the notes show no buttons
 *   Numbers are made from position (section number, then clause number); give a section or clause a number of its own with no
 *   (a clause with no "" shows none). A clause without a state shows no state line. A quote not found in the text still shows its
 *   note, without a highlight and without the suggestion button.
 * Made for the Manuscript theme (small caps labels, --measure, red pen for what is open) and fine under any other: it reads --label-caps, --label-case, --measure, --radius and --seam when the theme has them.
 *
 * @id        layout.margin-notes
 * @kind      component
 * @group     Layouts
 * @status    new
 * @version   0.2.0
 * @updated   2026-11-21
 * @summary   Numbered clauses with an aside in the margin for state, owner, answer and acknowledgement, history as footnotes, and review notes pinned to the words they are about.
 * @tags      clause, margin, aside, footnote, numbered, document, spec, history, change bar, manuscript, review, annotation, suggestion, contract, comment
 * @requires  kit.tokens, kit.vocab
 * @files     kit/layout/margin-notes.css, kit/samples/layout.json
 * @provides  Kit.marginNotes.mount
 * @config    Kit.marginNotes.mount(box, {sections, label, stateEnum, words, bar, severity, onAction}) | sections [{id, no, title, intro, clauses: [{id, no, title, text, state, owner, answer: {label, text, at}, ack: {by, at}, history: [{at, text}], notes: [{id, severity, title, body, quote, suggestion, state}]}]}]; returns {update(opts), destroy()}
 * @config    onAction({clause, note, action}) | action "apply", "fill", "dismiss" or "reopen"; the kit changes nothing itself
 * @config    theme | optional tokens from theme.manuscript: --label-caps, --label-case, --measure, --seam; each has a fallback
 * @tokens    --ink --ink-2 --rule --rule-2 --accent --f-ui --f-display? --f-mono --seam? --measure? --label-caps? --label-case? --danger? --warn? --sunk?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's manuscript skin | numbered clauses, the margin aside for state, owner, answer and acknowledgement, history as footnotes, change bars for what waits on someone
 * @source    Catalog harvest, 2026-11-21 | an agreement review board | review notes pinned to quoted words, with a suggested fix, on a draft agreement
 * @preview   {"render": "layout.margin-notes", "samples": ["kit/samples/layout.json#margin-notes"], "uses": ["kit.vocab"]}
 * @samples   margin-notes
 * @changed   0.2.0: review notes on a clause (severity, quoted words highlighted, a suggestion, onAction); section and clause numbers as printed with no; the state line is left out when a clause has no state. Everything 0.1 takes still works.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const rowOf = (en, v) => { const g = Kit.vocab && Kit.vocab.get && Kit.vocab.get(en, v); return g || { word: String(v == null ? '' : v), tone: 'neutral', glyph: 'dot' }; };
const label = (cls, txt) => el('span', 'kit-mn-l ' + cls, txt);
const SEVERITY = { high: 'Must fix', medium: 'Should fix', low: 'Worth a look' };
const isOpen = n => !n.state || n.state === 'open';

// where each note's quote first appears in the text, without overlaps (earlier notes win)
function spans(text, notes) {
  const taken = [];
  notes.forEach((n, i) => {
    if (!n.quote || !isOpen(n)) return;
    let at = text.indexOf(n.quote);
    while (at >= 0 && taken.some(s => at < s.end && at + n.quote.length > s.start)) at = text.indexOf(n.quote, at + 1);
    if (at >= 0) taken.push({ start: at, end: at + n.quote.length, i });
  });
  return taken.sort((a, b) => a.start - b.start);
}

function mount(box, opts) {
  const o = Object.assign({ sections: [], label: 'Document', stateEnum: 'state', words: {}, bar: ['attention', 'review', 'danger'], severity: {}, onAction: null }, opts);
  box.classList.add('kit-mn');
  let uid = 0;
  function clauseText(c, notes, marks) {
    const p = el('p', 'kit-mn-text'), text = c.text || '', found = spans(text, notes);
    let pos = 0;
    found.forEach(s => {
      if (s.start > pos) p.append(document.createTextNode(text.slice(pos, s.start)));
      const m = el('mark', 'kit-mn-q', text.slice(s.start, s.end)); m.dataset.sev = notes[s.i].severity || 'low';
      marks[s.i] = m; p.append(m); pos = s.end;
    });
    if (pos < text.length) p.append(document.createTextNode(text.slice(pos)));
    return p;
  }
  function note(c, n, mark) {
    const sev = n.severity || 'low', open = isOpen(n), words = Object.assign({}, SEVERITY, o.severity);
    const d = el('div', 'kit-mn-note'); d.dataset.sev = sev; if (!open) d.classList.add('kit-mn-note-closed');
    const head = el('p', 'kit-mn-nh'); head.append(label('kit-mn-sev', open ? words[sev] || sev : n.state === 'applied' ? 'Changed' : 'Not a problem'), el('b', null, n.title || ''));
    d.append(head);
    if (open && n.body) d.append(el('p', 'kit-mn-nb', n.body));
    if (open && n.quote && !mark) d.append(el('p', 'kit-mn-nq', 'About “' + n.quote + '” (not found in the text)'));
    if (o.onAction) {
      const acts = el('div', 'kit-mn-acts');
      const btn = (txt, action, pri) => { const b = el('button', 'kit-mn-btn' + (pri ? ' kit-mn-pri' : ''), txt); b.type = 'button'; b.onclick = () => o.onAction({ clause: c, note: n, action }); acts.append(b); };
      if (!open) { if (n.state === 'dismissed') btn('Reopen', 'reopen'); }
      else {
        if (n.suggestion && mark) { if (n.suggestion.length > 32) { const q = el('p', 'kit-mn-sug'); q.append(el('span', 'kit-mn-l', 'Suggested'), el('q', null, n.suggestion)); d.append(q); btn('Use this wording', 'apply', true); } else btn('Change to “' + n.suggestion + '”', 'apply', true); }
        else btn('Suggest new wording', 'fill', !n.suggestion);
        btn('Not a problem', 'dismiss');
      }
      d.append(acts);
    }
    if (mark) {
      const id = 'kit-mn-q-' + (++uid); mark.id = id; d.setAttribute('aria-describedby', id);
      const on = v => () => mark.classList.toggle('kit-mn-q-on', v);
      d.addEventListener('mouseenter', on(true)); d.addEventListener('mouseleave', on(false));
      d.addEventListener('focusin', on(true)); d.addEventListener('focusout', on(false));
    }
    return d;
  }
  function clause(c, si, ci, fn, sno) {
    const notes = c.notes || [], hasState = c.state != null && c.state !== '';
    const r = rowOf(o.stateEnum, c.state), no = c.no != null ? c.no : sno + '.' + (ci + 1), id = 'kit-mn-' + (c.id || no || 's' + si + 'c' + ci).replace(/[^A-Za-z0-9_-]/g, '-');
    const a = el('article', 'kit-mn-clause'); if (hasState) a.setAttribute('data-vo-tone', r.tone); a.dataset.state = c.state || ''; a.setAttribute('aria-labelledby', id);
    const urgent = notes.find(n => isOpen(n) && (n.severity === 'high' || n.severity === 'medium'));
    if ((hasState && o.bar.includes(r.tone)) || urgent) a.classList.add('kit-mn-bar');
    if (urgent) a.dataset.sev = notes.some(n => isOpen(n) && n.severity === 'high') ? 'high' : 'medium';
    const body = el('div', 'kit-mn-body');
    const h = el('h3', 'kit-mn-h'); h.id = id; if (no) h.append(el('span', 'kit-mn-no', no)); if (c.title) h.append(el('span', 'kit-mn-t', c.title));
    const hist = c.history || [];
    if (hist.length) { fn.n += 1; const s = el('sup', 'kit-mn-ref', String(fn.n)); s.setAttribute('aria-hidden', 'true'); h.append(s); }
    const marks = [];
    body.append(h); if (c.text) body.append(clauseText(c, notes, marks));
    if (hist.length) {
      const d = el('details', 'kit-mn-fn'), sm = el('summary'); sm.append(el('span', 'kit-mn-fnn', String(fn.n)), document.createTextNode('Revision history '), el('span', 'kit-mn-fnc', hist.length + (hist.length === 1 ? ' entry' : ' entries')));
      const ol = el('ol'); hist.forEach(x => { const li = el('li'); if (x.at) li.append(el('time', null, x.at), document.createTextNode(' ')); li.append(document.createTextNode(x.text)); ol.append(li); }); d.append(sm, ol); body.append(d);
    }
    const m = el('aside', 'kit-mn-margin'); m.setAttribute('aria-label', 'Margin notes: ' + (c.title || no || 'clause'));
    if (hasState) { const st = el('p', 'kit-mn-state'); if (Kit.vocab && Kit.vocab.glyph && r.glyph) st.append(Kit.vocab.glyph(r.glyph)); st.append(el('span', null, o.words[c.state] || r.word)); m.append(st); }
    if (c.owner) { const p = el('p', 'kit-mn-own'); p.append(label('kit-mn-lab', 'Owner'), document.createTextNode(' ' + c.owner)); m.append(p); }
    if (c.answer) {
      const d = el('div', 'kit-mn-ans'); d.append(label('kit-mn-lab', 'Answer' + (c.answer.at ? ' · ' + c.answer.at : '')));
      const p = el('p'); if (c.answer.label) p.append(el('b', null, c.answer.label + ' ')); if (c.answer.text) p.append(el('q', null, c.answer.text)); d.append(p); m.append(d);
    }
    if (c.ack) { const p = el('p', 'kit-mn-ack'); p.append(label('kit-mn-lab', 'Read'), document.createTextNode(' ' + c.ack.by + (c.ack.at ? ', ' + c.ack.at : ''))); m.append(p); }
    notes.forEach((n, i) => m.append(note(c, n, marks[i])));
    if (!m.childNodes.length) m.classList.add('kit-mn-margin-empty');
    a.append(body, m); return a;
  }
  function draw() {
    box.textContent = ''; box.setAttribute('role', 'region'); box.setAttribute('aria-label', o.label); const fn = { n: 0 }; uid = 0;
    o.sections.forEach((s, si) => {
      const sno = s.no != null ? s.no : String(si + 1);
      const sec = el('section', 'kit-mn-sec'), hid = 'kit-mn-s-' + String(s.id || si).replace(/[^A-Za-z0-9_-]/g, '-');
      if (s.title) { sec.setAttribute('aria-labelledby', hid); const h = el('h2', 'kit-mn-sh'); h.id = hid; if (sno) h.append(el('span', 'kit-mn-sn', sno)); h.append(el('span', null, s.title)); sec.append(h); }
      if (s.intro) sec.append(el('p', 'kit-mn-intro', s.intro));
      (s.clauses || []).forEach((c, ci) => sec.append(clause(c, si, ci, fn, sno)));
      box.append(sec);
    });
  }
  draw();
  return { update(next) { Object.assign(o, next); draw(); }, destroy() { box.textContent = ''; box.classList.remove('kit-mn'); box.removeAttribute('role'); box.removeAttribute('aria-label'); } };
}
Kit.marginNotes = Object.freeze({ mount });
})();
/* /part:page.script.kit.margin-notes */
