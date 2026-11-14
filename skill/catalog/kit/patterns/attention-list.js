/* part:page.script.kit.attention-list */
/**
 * Needs you list
 * Kit.attentionList.mount(root, {items}) draws a headline sentence, a lede, and a card of rows ranked waiting for you, then failed, then coming up. Each row has a state bead, a title, a line of detail and one button. The headline takes its colour from the worst item and its words from a sentence function (the default says "All quiet.", "One thing needs you." or "3 things need you." and counts what waits, what failed and what is coming up). With no items the card shows a calm "Nothing needs you." state. After a redraw the keyboard focus stays on the same item’s button. The list is of actions, not observations: a finding with no button belongs in a findings list. rank() and sentence() are exported as pure functions.
 *
 * One sentence that says how things are, then the things that need a person, worst first, each with the one button that deals with it. When nothing needs anyone, a calm
 * empty state says so. The heading takes its tone from the worst item. The list is of actions, not observations: a finding with no button belongs in a findings list. After a redraw the
 * focus stays on the same item's button.
 *
 * API (small and stable):
 *   Kit.attentionList.mount(root, {items, sentence, lede, rank, heading, level, emptyTitle, emptyText, label, enum, onAction}) -> {update(items), items(), destroy()}
 *     items     [{id, tone, title, sub, action: {label, primary}}]   tone: wait | bad | warn | info (or any value of your enum)
 *     sentence  (items) -> [headline, lede] to replace the default (default: "All quiet." / "One thing needs you." / "3 things need you." with a lede that counts waiting, failed and coming up)
 *     lede      the line under an empty list's headline
 *     rank      the tone order, worst first (default ["wait", "bad", "warn", "info"]); items of one tone keep the order they came in
 *     heading   the card title above the rows (default "Needs you"); level the headline's heading level (default 2)
 *     enum      the Kit.vocab enum for the leading bead; defined here (attention: wait, bad, warn, info) when the board has not defined its own
 *     onAction  (item, event) when a row's button is pressed
 *   Kit.attentionList.rank(items, order) -> [items]    the pure ordering;  Kit.attentionList.sentence(items) -> [headline, lede]
 *
 * CSS classes: .kit-al .kit-al-row
 *
 * @id        pattern.attention-list
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   One sentence saying how things are, then the things that need a person, worst first, each with the one button that deals with it; or a calm empty state.
 * @tags      attention, needs you, inbox, to do, actions, empty state, sentence
 * @requires  kit.vocab, kit.glaze-surfaces
 * @files     kit/patterns/attention-list.css, kit/samples/patterns.json
 * @provides  Kit.attentionList.mount, Kit.attentionList.rank, Kit.attentionList.sentence
 * @config    Kit.attentionList.mount(root, {items, sentence, lede, rank, heading, level, emptyTitle, emptyText, enum, onAction}) | items [{id, tone: wait | bad | warn | info, title, sub, action: {label, primary}}]; update(items) redraws
 * @config    Kit.vocab | the enum "attention" is defined here when the board has not defined its own
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --rule-2 --ok --warn --danger --f-mono --f-display? --wait? --rim? --pool? --glz-r-l? --glz-r-m? --ok-ink? --ok-soft?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console’s opening page | the needs-you list ranked waiting, failed, soon; the sentence builder; the heading that takes the worst tone; focus restored by button
 * @preview   {"render": "pattern.attention-list", "samples": ["kit/samples/patterns.json#attention-list"]}
 * @changed   Items are config; the console built them from its own data.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;
const ENUM = {
  wait: { word: 'Waiting for you', short: 'wait', glyph: 'hand', tone: 'attention', motion: 'turn' },
  bad: { word: 'Needs a fix', short: 'fix', glyph: 'cross', tone: 'danger', motion: 'none' },
  warn: { word: 'Coming up', short: 'soon', glyph: 'hourglass', tone: 'review', motion: 'none' },
  info: { word: 'For your information', short: 'info', glyph: 'info', tone: 'info', motion: 'none' },
};
const TONE = { wait: 'attention', bad: 'danger', warn: 'review', info: 'info' };
const ORDER = ['wait', 'bad', 'warn', 'info'];

function rank(items, order) {
  const o = order || ORDER, at = t => { const i = o.indexOf(t); return i < 0 ? o.length : i; };
  return items.map((x, i) => [x, i]).sort((a, b) => at(a[0].tone) - at(b[0].tone) || a[1] - b[1]).map(p => p[0]);
}
function sentence(items) {
  if (!items.length) return ['All quiet.', 'Nothing needs you.'];
  const c = t => items.filter(x => x.tone === t).length, bits = [];
  if (c('wait')) bits.push(c('wait') + ' waiting for you');
  if (c('bad')) bits.push(c('bad') + ' failed');
  if (c('warn')) bits.push(c('warn') + ' coming up');
  return [items.length === 1 ? 'One thing needs you.' : items.length + ' things need you.', bits.length ? bits.join(', ') + '.' : ''];
}

function mount(root, opts) {
  const o = Object.assign({ items: [], sentence: null, lede: 'Nothing needs you right now. This list looks again by itself.', rank: ORDER, heading: 'Needs you', level: 2, emptyTitle: 'Nothing needs you.', emptyText: null, label: 'Things that need you', enum: 'attention', onAction: null }, opts);
  const id = 'kit-al-' + (++uid); let items = o.items.slice();
  const V = () => window.Kit && window.Kit.vocab;
  if (V() && o.enum === 'attention' && V().get('attention', 'wait') === undefined) V().define({ attention: ENUM });
  root.classList.add('kit-al'); root.replaceChildren();
  function paint() {
    const act = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
    const keep = act && act.dataset ? act.dataset.alId : null;
    const list = rank(items, o.rank), parts = (o.sentence || sentence)(list), head = parts[0], lede = parts[1];
    const worst = list.length ? list[0].tone : 'ok';
    const hd = el('div', 'kit-al-head'); hd.dataset.tone = worst;
    const h = el('h' + o.level, 'kit-al-title', head); h.id = id + '-h'; hd.append(h);
    const ledeText = list.length ? lede : (o.emptyText || o.lede); if (ledeText) hd.append(el('p', 'kit-al-lede', ledeText));
    const card = el('section', 'kit-al-card'); card.setAttribute('aria-label', o.label);
    const top = el('div', 'kit-al-top'); top.append(el('h3', 'kit-al-h', o.heading));
    if (list.length) top.append(el('span', 'kit-al-count', String(list.length)));
    card.append(top);
    if (!list.length) {
      const e = el('div', 'kit-al-empty'); e.setAttribute('role', 'status');
      const m = el('span', 'kit-al-ok'); m.setAttribute('aria-hidden', 'true'); m.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      e.append(m, el('b', null, o.emptyTitle), el('span', null, o.lede)); card.append(e);
    } else {
      const ul = el('ul', 'kit-al-rows');
      list.forEach(it => {
        const li = el('li', 'kit-al-row'); li.dataset.tone = it.tone; li.setAttribute('data-vo-tone', TONE[it.tone] || 'neutral');
        const lead = el('span', 'kit-al-lead'); const v = V(); const row = v && v.get(o.enum, it.tone);
        const b = v && v.orb(o.enum, it.tone, { size: 'md', label: row && row.word, unknown: 'skip' }); if (b) lead.append(b);
        const tx = el('span', 'kit-al-tx'); tx.append(el('span', 'kit-al-t', it.title)); if (it.sub) tx.append(el('span', 'kit-al-s', it.sub));
        li.append(lead, tx);
        if (it.action) {
          const btn = el('button', 'kit-btn kit-sm' + (it.action.primary ? ' kit-primary' : ''), it.action.label); btn.type = 'button'; btn.dataset.alId = it.id;
          btn.setAttribute('aria-label', it.action.label + ': ' + it.title);
          btn.addEventListener('click', ev => { if (o.onAction) o.onAction(it, ev); }); li.append(btn);
        }
        ul.append(li);
      });
      card.append(ul);
    }
    root.replaceChildren(hd, card);
    if (keep) { const b = [...root.querySelectorAll('button')].find(x => x.dataset.alId === keep); if (b) b.focus({ preventScroll: true }); }
  }
  paint();
  return { update(next) { items = next.slice(); paint(); }, items: () => items.slice(), destroy() { root.replaceChildren(); root.classList.remove('kit-al'); } };
}
Kit.attentionList = Object.freeze({ mount, rank, sentence });
})();
/* /part:page.script.kit.attention-list */
