/* part:page.script.kit.patterns.decisions-ack */
/**
 * Decision cards with an acknowledgement
 * Kit.decisionsAck.render(box, {cards, look}) draws each decision with its answer, who answered and when (UTC with a Z), the line that was sent to the agent, and an acknowledgement block: who read it, when, and what they said. Three looks share the facts: stamp (a ruled box tilted one degree with the word Read), line (a terminal line, reader> ACK, in mono) and note (a sticky note with a tape strip; when the agent asks back it says "asks back" and the edge is dashed). setLook switches at run time. Kit.decisionsAck.block builds only the block, and attach adds it to the cards Kit.decisions already drew. pattern.decisions is unchanged.
 *
 * What a decision card shows after it is answered. The answer, who answered and when; the prompt line that went to the agent; and an acknowledgement block that says who read the answer,
 * when, and what they said back. The block has three looks: "stamp" (a rubber stamp: a ruled box with the word Read and the reader), "line" (a terminal line: reader> ACK, the time, the text) and "note"
 * (a sticky note; when the agent asks back it says "asks" and has a dashed edge). The look changes the paper, never the facts: reader, time and words are text in every look.
 * Plain DOM; every text is set with textContent. Times are written in UTC with a Z so the card reads the same for every viewer.
 *
 * API:
 *   Kit.decisionsAck.render(box, {cards, look, headingLevel, words, timeZone}) -> {setLook(look), update(cards), destroy()}
 *     cards   [{id, question, why, answer, answeredBy, answeredAt, prompt, ack}]   ack: {by, at, text, asks} | null (no block until the agent has read it)
 *               answer  the label of the answer given (a string)        prompt  the line sent to the agent, shown as "Sent to the agent"
 *               ack.asks  true when the agent asks back instead of confirming: the note says "asks", the stamp says "Question", the line says ASK
 *     look    "stamp" (default) | "line" | "note"        words  texts that replace the defaults       timeZone  default "UTC"
 *   Kit.decisionsAck.block(ack, {look, words, timeZone}) -> Element    only the acknowledgement block, to append to a card Kit.decisions already drew
 *   Kit.decisionsAck.attach(root, acks, {look, ...})    appends a block to each .kit-d[data-d="<id>"] under root for which acks[id] exists; returns {detach()}
 *
 * CSS classes: .kit-da
 *
 * @id        pattern.decisions-ack
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   An upgrade of pattern.decisions: what an answered card shows, the answer and who gave it, the prompt line, and an acknowledgement as a rubber stamp, a terminal line or a sticky note that can ask back.
 * @tags      decision, acknowledgement, ack, stamp, sticky note, terminal, answered, read receipt, prompt
 * @requires  kit.tokens
 * @provides  Kit.decisionsAck.render, Kit.decisionsAck.block, Kit.decisionsAck.attach
 * @config    Kit.decisionsAck.render(box, opts) | cards [{id, question, why, answer, answeredBy, answeredAt, prompt, ack: {by, at, text, asks}}], look stamp | line | note, headingLevel, words, timeZone; returns {setLook, update, destroy}
 * @config    Kit.decisionsAck.attach(root, acks, opts) | adds a block to each .kit-d[data-d] card of Kit.decisions; returns {detach()}
 * @tokens    --bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --f-ui --f-mono --f-display --warn --ok? --seam?
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const WORDS = { you: 'Your answer', sent: 'Sent to the agent', read: 'Read', asks: 'Question', says: 'says', askSays: 'asks back', ack: 'ACK', ask: 'ASK', by: 'by', open: 'Not decided yet', unread: 'Not read yet' };
const pad = n => String(n).padStart(2, '0');
function stamp(iso, tz) {
  const d = new Date(iso); if (!isFinite(d)) return null;
  const f = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz || 'UTC' }).format(d);
  const t = tz && tz !== 'UTC' ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d) : pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + 'Z';
  return { day: f, clock: t, iso: d.toISOString(), text: f + ', ' + t };
}
function time(iso, tz) { const s = stamp(iso, tz); if (!s) return null; const t = el('time', 'kit-da-time', s.text); t.dateTime = s.iso; return t; }
function block(ack, o) {
  o = o || {}; const W = Object.assign({}, WORDS, o.words), look = ['stamp', 'line', 'note'].includes(o.look) ? o.look : 'stamp', asks = !!(ack && ack.asks);
  const b = el('div', 'kit-da-ack'); b.dataset.look = look; if (asks) b.dataset.asks = ''; b.setAttribute('role', 'group');
  const who = ack && ack.by != null ? String(ack.by) : '';
  b.setAttribute('aria-label', (asks ? W.asks : W.read) + (who ? ' ' + W.by + ' ' + who : ''));
  const t = ack && ack.at ? time(ack.at, o.timeZone) : null;
  if (look === 'stamp') {
    const s = el('span', 'kit-da-stamp'); s.append(el('b', null, asks ? W.asks : W.read)); if (who) s.append(el('span', null, W.by + ' ' + who)); if (t) s.append(t); b.append(s);
  } else if (look === 'line') {
    const s = el('span', 'kit-da-prompt-line'); s.append(el('span', 'kit-da-pr', who.toLowerCase() + '>'), el('b', 'kit-da-ak', asks ? W.ask : W.ack)); if (t) s.append(t); b.append(s);
  } else {
    const s = el('span', 'kit-da-hand'); s.textContent = (who || 'The agent') + ' ' + (asks ? W.askSays : W.says); b.append(s); if (t) b.append(t);
  }
  if (ack && ack.text) b.append(el('p', 'kit-da-text', ack.text));
  return b;
}
function card(c, o) {
  const W = Object.assign({}, WORDS, o.words), lvl = Math.min(6, Math.max(2, o.headingLevel || 3));
  const a = el('article', 'kit-da'); a.dataset.d = c.id; a.dataset.state = c.answer ? (c.ack ? (c.ack.asks ? 'asked' : 'read') : 'sent') : 'open';
  a.append(el('h' + lvl, 'kit-da-q', c.question)); if (c.why) a.append(el('p', 'kit-da-why', c.why));
  if (c.answer) {
    const r = el('div', 'kit-da-answer'); r.append(el('span', 'kit-da-k', W.you), el('b', 'kit-da-ans', c.answer));
    const meta = []; if (c.answeredBy) meta.push(el('span', 'kit-da-meta', W.by + ' ' + c.answeredBy)); const t = c.answeredAt ? time(c.answeredAt, o.timeZone) : null; if (t) meta.push(t);
    meta.forEach(m => r.append(m)); a.append(r);
    if (c.prompt) { const p = el('p', 'kit-da-prompt'); p.append(el('span', 'kit-da-k', W.sent), el('code', null, c.prompt)); a.append(p); }
    a.append(c.ack ? block(c.ack, o) : el('p', 'kit-da-unread', W.unread));
  } else a.append(el('p', 'kit-da-unread', W.open));
  return a;
}
function render(box, o) {
  o = Object.assign({ look: 'stamp' }, o); let cards = o.cards || [];
  const root = el('div', 'kit-da-list'); box.replaceChildren(root);
  const draw = () => root.replaceChildren(...cards.map(c => card(c, o)));
  draw();
  return { setLook(l) { o.look = l; draw(); }, update(c) { cards = c; draw(); }, destroy() { box.replaceChildren(); } };
}
function attach(root, acks, o) {
  const added = [];
  root.querySelectorAll('.kit-d[data-d]').forEach(c => { const a = acks[c.dataset.d]; if (!a) return; const b = block(a, o); c.append(b); added.push(b); });
  return { detach() { added.forEach(b => b.remove()); } };
}
Kit.decisionsAck = Object.freeze({ render, block, attach });
})();
/* /part:page.script.kit.patterns.decisions-ack */
