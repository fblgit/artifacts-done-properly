/* part:page.script.kit.margin-notes */
/* Kit layout: clause with margin notes (Kit.marginNotes)    kit version 0.1.0
   What it is: a document laid out as numbered sections and clauses (1.1, 1.2, 2.1 ...). Each clause reads in the column; beside it, in the margin, sit its state, owner, the answer given
   and who has acknowledged it. A clause that waits on someone has a change bar. A clause's history is kept as numbered footnotes under it. On a narrow box the margin drops under the
   clause as a ruled note. Plain DOM; every text is set with textContent.
   API (small and stable):
     Kit.marginNotes.mount(box, {sections, label, stateEnum, words, bar}) -> {update(opts), destroy()}
       sections  [{id, title, intro, clauses: [{id, title, text, state, owner, answer, ack, history}]}]
                 answer  {label, text, at}     what was decided, with a label such as "Option b" and when
                 ack     {by, at}              who read and accepted it
                 history [{at, text}]          revisions, oldest first; they number as footnotes across the whole document
       stateEnum the Kit.vocab enum the states come from (default "state"); words {state: "Settled"} replaces a state's word in the margin only
       bar       the tones that get a change bar (default ["attention", "review", "danger"])
     Numbers are made from position (section number, then clause number); give a clause a number of its own with clause.no.
   Made for the Manuscript theme (small caps labels, --measure, red pen for what is open) and fine under any other: it reads --label-caps, --label-case, --measure, --radius and --seam when the theme has them.
   Needs from the board:
     css     kit/layout/margin-notes.css; custom properties --bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --f-ui --f-display --f-mono, optional --seam --measure --label-caps --label-case --radius
     kit     kit/vocab.js and kit/vocab.css (state word, glyph and tone), kit.tokens
   db collections: none.
   Lifted from: an earlier board's manuscript skin (numbered clauses, the margin aside for state, owner, answer and acknowledgement, history as footnotes, change bars). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const rowOf = (en, v) => { const g = Kit.vocab && Kit.vocab.get && Kit.vocab.get(en, v); return g || { word: String(v == null ? '' : v), tone: 'neutral', glyph: 'dot' }; };
const label = (cls, txt) => el('span', 'kit-mn-l ' + cls, txt);

function mount(box, opts) {
  const o = Object.assign({ sections: [], label: 'Document', stateEnum: 'state', words: {}, bar: ['attention', 'review', 'danger'] }, opts);
  box.classList.add('kit-mn');
  function clause(c, si, ci, fn) {
    const r = rowOf(o.stateEnum, c.state), no = c.no || (si + 1) + '.' + (ci + 1), id = 'kit-mn-' + (c.id || no).replace(/[^A-Za-z0-9_-]/g, '-');
    const a = el('article', 'kit-mn-clause'); a.setAttribute('data-vo-tone', r.tone); a.dataset.state = c.state || ''; a.setAttribute('aria-labelledby', id);
    if (o.bar.includes(r.tone)) a.classList.add('kit-mn-bar');
    const body = el('div', 'kit-mn-body');
    const h = el('h3', 'kit-mn-h'); h.id = id; h.append(el('span', 'kit-mn-no', no), el('span', 'kit-mn-t', c.title));
    const hist = c.history || [];
    if (hist.length) { fn.n += 1; const s = el('sup', 'kit-mn-ref', String(fn.n)); s.setAttribute('aria-hidden', 'true'); h.append(s); }
    body.append(h); if (c.text) body.append(el('p', 'kit-mn-text', c.text));
    if (hist.length) {
      const d = el('details', 'kit-mn-fn'), sm = el('summary'); sm.append(el('span', 'kit-mn-fnn', String(fn.n)), document.createTextNode('Revision history '), el('span', 'kit-mn-fnc', hist.length + (hist.length === 1 ? ' entry' : ' entries')));
      const ol = el('ol'); hist.forEach(x => { const li = el('li'); if (x.at) li.append(el('time', null, x.at), document.createTextNode(' ')); li.append(document.createTextNode(x.text)); ol.append(li); }); d.append(sm, ol); body.append(d);
    }
    const m = el('aside', 'kit-mn-margin'); m.setAttribute('aria-label', 'Margin notes: ' + c.title);
    const st = el('p', 'kit-mn-state'); if (Kit.vocab && Kit.vocab.glyph && r.glyph) st.append(Kit.vocab.glyph(r.glyph)); st.append(el('span', null, o.words[c.state] || r.word)); m.append(st);
    if (c.owner) { const p = el('p', 'kit-mn-own'); p.append(label('kit-mn-lab', 'Owner'), document.createTextNode(' ' + c.owner)); m.append(p); }
    if (c.answer) {
      const d = el('div', 'kit-mn-ans'); d.append(label('kit-mn-lab', 'Answer' + (c.answer.at ? ' · ' + c.answer.at : '')));
      const p = el('p'); if (c.answer.label) p.append(el('b', null, c.answer.label + ' ')); if (c.answer.text) p.append(el('q', null, c.answer.text)); d.append(p); m.append(d);
    }
    if (c.ack) { const p = el('p', 'kit-mn-ack'); p.append(label('kit-mn-lab', 'Read'), document.createTextNode(' ' + c.ack.by + (c.ack.at ? ', ' + c.ack.at : ''))); m.append(p); }
    a.append(body, m); return a;
  }
  function draw() {
    box.textContent = ''; box.setAttribute('role', 'region'); box.setAttribute('aria-label', o.label); const fn = { n: 0 };
    o.sections.forEach((s, si) => {
      const sec = el('section', 'kit-mn-sec'), hid = 'kit-mn-s-' + (s.id || si); sec.setAttribute('aria-labelledby', hid);
      const h = el('h2', 'kit-mn-sh'); h.id = hid; h.append(el('span', 'kit-mn-sn', String(si + 1)), el('span', null, s.title)); sec.append(h);
      if (s.intro) sec.append(el('p', 'kit-mn-intro', s.intro));
      (s.clauses || []).forEach((c, ci) => sec.append(clause(c, si, ci, fn)));
      box.append(sec);
    });
  }
  draw();
  return { update(next) { Object.assign(o, next); draw(); }, destroy() { box.textContent = ''; box.classList.remove('kit-mn'); box.removeAttribute('role'); box.removeAttribute('aria-label'); } };
}
Kit.marginNotes = Object.freeze({ mount });
})();
/* /part:page.script.kit.margin-notes */
