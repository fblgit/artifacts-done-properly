/* part:page.script.kit.callout-refusal */
/**
 * Refusal callout
 * Kit.refusal.make({code, tone, field, allowed, message}) returns a callout (role alert) whose kicker says Refused and names the code in words, with the refused field in mono, a short "Allowed now" list of what would be accepted instead, and the system's message under it. With nothing allowed it says so in words. The words of the code come from the caller, so a board uses its own. The tone is warn, danger or pending. It is kit.callout with a new file; callout.css is unchanged and loads first.
 *
 * API:
 *   Kit.refusal.make({code, tone, field, allowed, message, label, none}) -> Element (aside.kit-callout.kit-refusal, role="alert")
 *     code     the words for what happened ("Not while a review is open")
 *     tone     "warn" (default) | "danger" | "pending"
 *     field    the field or input that was refused, shown in mono
 *     allowed  [string]   what would be accepted now; an empty list shows `none`
 *     message  the system's own sentence          label  the kicker word (default "Refused")        none  the word for an empty allowed list (default "Nothing is allowed right now")
 *
 * Plain DOM; every text is set with textContent.
 * Also provides (not a global): the class .kit-refusal, on the aside beside .kit-callout.
 * The tone colour is --tone, which kit/callout.css (kit.callout, loaded first) sets on .kit-callout[data-tone]; callout-refusal.css reads --tone and none of --accent, --warn or --danger itself.
 *
 * @id        kit.callout-refusal
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   An upgrade of kit.callout: an error that names the code, the field refused, what is allowed now and the system's own message.
 * @tags      refusal, error, callout, allowed, validation, denied, alert
 * @requires  kit.callout
 * @files     kit/callout-refusal.css, kit/samples/callout-refusal.json
 * @provides  Kit.refusal.make
 * @extends   kit.callout
 * @config    Kit.refusal.make(opts) | code, tone warn | danger | pending, field, allowed [string], message, label, none; returns the aside element
 * @config    markup | aside.kit-callout.kit-refusal[data-tone] > p.kit-callout-k (b.kit-refusal-code, code.kit-refusal-field) + dl.kit-refusal-dl + p.kit-refusal-msg
 * @tokens    --panel --ink --ink-2 --rule --f-ui --f-mono
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's refusal callout | the code by its vocabulary, the field, the allowed values, the message
 * @preview   {"render": "kit.callout-refusal", "samples": ["kit/samples/callout-refusal.json"]}
 * @changed   Extends kit.callout as new files; callout.css is unchanged.
 */
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
