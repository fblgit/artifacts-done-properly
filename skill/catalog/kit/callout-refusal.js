/* part:page.script.kit.callout-refusal */
/* Kit component: refusal callout builder (Kit.refusal)    kit version 0.1.0    EXTENDS kit.callout (a new file beside callout.css)
   What it is: a callout for an action the system refused: the word for the code, the field that was refused, what is allowed now, and the system's own message. Plain DOM; every text is set
   with textContent. The code's words come from the caller (never from a table of this file), so a board uses its own wording.
   API:
     Kit.refusal.make({code, tone, field, allowed, message, label, none}) -> Element (aside.kit-callout.kit-refusal, role="alert")
       code     the words for what happened ("Not while a review is open")
       tone     "warn" (default) | "danger" | "pending"
       field    the field or input that was refused, shown in mono
       allowed  [string]   what would be accepted now; an empty list shows `none`
       message  the system's own sentence          label  the kicker word (default "Refused")        none  the word for an empty allowed list (default "Nothing is allowed right now")
   Needs from the board: kit/callout.css, kit/callout-refusal.css and the tokens callout.css reads.
   db collections: none.
   Lifted from: a component family's refusal callout (the code by its vocabulary, the field, the allowed values, the message). Changed: the code is text the caller passes, not a hub enum, and the tone is the kit's. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function make(o) {
  o = o || {};
  const a = el('aside', 'kit-callout kit-refusal'); a.dataset.tone = o.tone || 'warn'; a.setAttribute('role', 'alert');
  const k = el('p', 'kit-callout-k'); k.append(document.createTextNode(o.label || 'Refused'));
  if (o.code != null) k.append(el('b', 'kit-refusal-code', o.code));
  if (o.field != null) k.append(el('code', 'kit-refusal-field', o.field));
  a.append(k);
  const allowed = Array.isArray(o.allowed) ? o.allowed : null;
  if (allowed) {
    const dl = el('dl', 'kit-refusal-dl'); dl.append(el('dt', null, 'Allowed now'));
    const dd = el('dd');
    if (allowed.length) { const ul = el('ul', 'kit-refusal-allowed'); allowed.forEach(v => { const li = el('li'); li.append(el('code', null, v)); ul.append(li); }); dd.append(ul); }
    else dd.append(el('span', 'kit-refusal-none', o.none || 'Nothing is allowed right now'));
    dl.append(dd); a.append(dl);
  }
  if (o.message != null) a.append(el('p', 'kit-refusal-msg', o.message));
  return a;
}
Kit.refusal = Object.freeze({ make });
})();
/* /part:page.script.kit.callout-refusal */
