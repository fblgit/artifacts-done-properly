/* part:page.script.kit.card-history */
/**
 * Card history
 * Kit.cardHistory.mount(box, {moves, turns, me}) draws three parts. A track along the top has a node wherever the state changed (a long record keeps the first, the last and an even spread of up to six between); a node is a button that scrolls to its move and flashes it. Under it the conversation shows each turn as three short lines, the ask, the answer ("chose X", a quoted reply, "approved the gate", or No answer) and the reply, each with an avatar of initials. Last come the moves grouped by day, the day in the left column and one line a move. A line of tags above says how many moves and turns, over how long, and when the last one was. States come from the vocabulary table (the built-in state enum, or your own).
 *
 * One record's story in three parts. A track along the top with a node wherever the state changed (a long track keeps the first, the last and an even spread of up to six
 * between; a node jumps to its row below), then the conversation as turns (each turn is an ask, the answer and the reply, three short lines), then the moves grouped by day with the
 * day in the left column and one line per move. A line of tags above says how many moves and turns there are, over how long, and when the last one was.
 * Every state word, glyph and tone comes from the vocabulary table (kit/vocab.js); the built-in enum "state" does for most records, pass stateEnum for your own. A node is a glyph and
 * a word, never colour alone.
 *
 * API:
 *   Kit.cardHistory.mount(box, opts) -> {update(data), jump(index), destroy()}
 *     moves      [{at (ISO), by, what, state}]      any order; shown newest first, the track runs oldest to newest
 *     turns      [{n, ask: {by, text}, answer: {choice, reply, approval, at}, reply: {by, text}}]   answer may be null (shown as No answer)
 *     me         the name that reads as "You" (default none: names are shown as given)
 *     stateEnum  vocabulary enum of a move's state (default "state")       timeZone  for days and clock times (default: the viewer's; the preview passes "UTC")
 *     maxNodes   most nodes on the track (default 8)
 *
 * @id        pattern.card-history
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   One record's story: a track with a node where its state changed, the turns as ask, answer and reply, then moves grouped by day.
 * @tags      history, activity, turns, conversation, journey, track, moves, record
 * @requires  kit.tokens, kit.vocab
 * @provides  Kit.cardHistory.mount
 * @config    Kit.cardHistory.mount(box, opts) | moves [{at, by, what, state}], turns [{n, ask {by, text}, answer {by, choice, reply, approval, at} | null, reply {by, text}}], me, stateEnum, timeZone, maxNodes; returns {update, jump, destroy}
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;

function mount(box, opts) {
  const o = Object.assign({ moves: [], turns: [], stateEnum: 'state', maxNodes: 8 }, opts);
  const id = 'kit-ch' + (++uid) + '-';
  let data = { moves: o.moves, turns: o.turns };
  const fmt = (iso, opt) => { try { return new Date(iso).toLocaleString(undefined, Object.assign({ timeZone: o.timeZone }, opt)); } catch (_) { return String(iso); } };
  const dayOf = iso => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const hm = iso => fmt(iso, { hour: '2-digit', minute: '2-digit' });
  const who = n => (o.me && n === o.me) ? 'You' : n;
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  box.classList.add('kit-hi'); box.replaceChildren();

  function line(by, text, when, cls) {
    const l = el('div', 'kit-hi-l ' + (cls || '')), av = el('span', 'kit-hi-av', initials(who(by))); av.setAttribute('aria-hidden', 'true');
    const b = el('div', 'kit-hi-b'), h = el('div', 'kit-hi-h'); h.append(el('b', null, who(by))); if (when) { const t = el('time', null, when); h.append(t); }
    b.append(h); if (text instanceof Node) b.append(text); else b.append(el('p', null, text)); l.append(av, b); return l;
  }
  function draw() {
    box.textContent = '';
    const moves = data.moves.filter(m => m && m.at).slice().sort((a, b) => b.at < a.at ? -1 : b.at > a.at ? 1 : 0), turns = (data.turns || []).filter(Boolean);
    if (!moves.length && !turns.length) { box.append(el('p', 'kit-hi-empty', 'No history yet. Every move and turn on this record will be listed here.')); return; }
    const asc = moves.slice().reverse().map((m, i) => ({ m, i }));
    // 1. the track
    const ms = asc.length > 1 ? new Date(asc[asc.length - 1].m.at) - new Date(asc[0].m.at) : 0;
    const dur = ms >= 864e5 ? Math.round(ms / 864e5) + (Math.round(ms / 864e5) === 1 ? ' day' : ' days') : ms >= 36e5 ? Math.round(ms / 36e5) + ' h' : ms >= 6e4 ? Math.round(ms / 6e4) + ' min' : '';
    const tags = el('ul', 'kit-hi-tags'); const tag = t => tags.append(el('li', null, t));
    if (moves.length) tag(moves.length + (moves.length === 1 ? ' move' : ' moves'));
    if (turns.length) tag(turns.length + (turns.length === 1 ? ' turn' : ' turns'));
    if (dur) tag('over ' + dur);
    if (moves.length) tag('last ' + dayOf(moves[0].at) + ', ' + hm(moves[0].at));
    box.append(tags);
    let nodes = asc.filter((x, k) => k === 0 || k === asc.length - 1 || x.m.state !== asc[k - 1].m.state);
    if (nodes.length > o.maxNodes) { const mid = nodes.slice(1, -1), step = Math.ceil(mid.length / (o.maxNodes - 2)); nodes = [nodes[0], ...mid.filter((_, k) => k % step === 0).slice(0, o.maxNodes - 2), nodes[nodes.length - 1]]; }
    if (nodes.length) {
      const ol = el('ol', 'kit-hi-track'); ol.style.setProperty('--n', nodes.length); ol.setAttribute('aria-label', 'Where the record changed state');
      nodes.forEach(x => {
        const li = el('li'), r = V().get(o.stateEnum, x.m.state); li.setAttribute('data-vo-tone', r ? r.tone : 'neutral');
        const b = el('button', 'kit-hi-node'); b.type = 'button'; b.setAttribute('data-keep', 'hi-node-' + x.i);
        const orb = V().orb(o.stateEnum, x.m.state, { size: 'md', unknown: 'flag' }); if (orb) b.append(orb);
        const t = el('time', null, fmt(x.m.at, { day: 'numeric', month: 'short' })); t.dateTime = x.m.at;
        b.append(el('span', 'kit-hi-nl', r ? r.short : String(x.m.state)), t); b.setAttribute('aria-label', (r ? r.word : x.m.state) + ', ' + fmt(x.m.at, { day: 'numeric', month: 'short' }) + '. Jump to this move');
        b.addEventListener('click', () => jump(moves.length - 1 - x.i)); li.append(b); ol.append(li);
      });
      box.append(ol);
    }
    // 2. the conversation
    if (turns.length) {
      const sec = el('section', 'kit-hi-sec'); const h = el('h3', null, 'Conversation'); h.append(el('span', 'kit-hi-cnt', String(turns.length))); sec.append(h);
      turns.forEach((t, k) => {
        const a = t.answer, n = Number(t.n) || k + 1, card = el('div', 'kit-hi-turn'); card.append(el('span', 'kit-hi-tn', 'Turn ' + n));
        const ls = el('div', 'kit-hi-ls');
        if (t.ask) ls.append(line(t.ask.by, t.ask.text, '', 'c'));
        if (a) {
          const p = el('p'); const parts = [];
          if (a.choice) { const b = el('b', null, a.choice); parts.push(['chose ', b]); }
          if (a.reply) parts.push([null, el('q', null, a.reply)]);
          if (a.approval) parts.push([a.approval + ' the gate', null]);
          parts.forEach((x, j) => { if (j) p.append(document.createTextNode(' · ')); if (x[0]) p.append(document.createTextNode(x[0])); if (x[1]) p.append(x[1]); });
          ls.append(line(a.by || o.me || 'You', parts.length ? p : el('p', 'kit-hi-mute', 'No answer'), a.at ? fmt(a.at, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '', 'y'));
        } else ls.append(line(o.me || 'You', el('p', 'kit-hi-mute', 'No answer'), '', 'y'));
        if (t.reply) ls.append(line(t.reply.by, t.reply.text, '', 'c'));
        card.append(ls); sec.append(card);
      });
      box.append(sec);
    }
    // 3. the moves by day
    if (moves.length) {
      const sec = el('section', 'kit-hi-sec'); const h = el('h3', null, 'Moves'); h.append(el('span', 'kit-hi-cnt', String(moves.length))); sec.append(h);
      const groups = []; moves.forEach((m, k) => { const d = dayOf(m.at), g = groups[groups.length - 1]; if (g && g.d === d) g.r.push({ m, k }); else groups.push({ d, r: [{ m, k }] }); });
      const wrap = el('div', 'kit-hi-moves');
      groups.forEach(g => {
        const row = el('div', 'kit-hi-day'); row.append(el('span', 'kit-hi-d', g.d)); const ol = el('ol');
        g.r.forEach(({ m, k }) => {
          const li = el('li'); li.id = id + 'm' + k; li.tabIndex = -1; const r = V().get(o.stateEnum, m.state); li.setAttribute('data-vo-tone', r ? r.tone : 'neutral');
          const c = V().chip(o.stateEnum, m.state, { unknown: 'flag' }); if (c) li.append(c);
          li.append(el('b', null, who(m.by)), el('span', 'kit-hi-t', m.what)); const t = el('time', null, hm(m.at)); t.dateTime = m.at; li.append(t); ol.append(li);
        });
        row.append(ol); wrap.append(row);
      });
      sec.append(wrap); box.append(sec);
    }
  }
  function jump(k) {
    const li = box.querySelector('#' + id + 'm' + k); if (!li) return;
    li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); li.focus({ preventScroll: true });
    li.classList.remove('kit-hi-flash'); void li.offsetWidth; li.classList.add('kit-hi-flash');
  }
  draw();
  return { update(d) { data = Object.assign({ moves: [], turns: [] }, d); draw(); }, jump, destroy() { box.replaceChildren(); box.classList.remove('kit-hi'); } };
}
Kit.cardHistory = Object.freeze({ mount });
})();
/* /part:page.script.kit.card-history */
