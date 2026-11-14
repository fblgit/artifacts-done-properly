/* part:page.script.kit.request-card */
/**
 * Request card
 * Kit.requestCard.mount(box, {engine, rid}) follows one request through the assist engine (engine.thread and engine.reply); mount(box, {request, thread, onReply}) draws the same card from data. The header says what kind of request it is (task, fix, design note) with a glyph, which block it is about (a button that shows the block when onReveal is given) and when it was sent. The track is four stations on one seam: queued, seen, working, done; passed segments fill in the seam colour, the current station has its bead and its word in bold, and the word sits under every bead, so the state never rides on colour. A request queued for more than three minutes says it is still queued and that nothing failed. Below: the conversation in order (the person's words, Claude's answer in Markdown when kit.md and its libraries are loaded, plain paragraphs otherwise, then every reply), the block as it was sent, the session's progress lines with their times (open while it works), and the blocks it changed. Once Claude has answered, a reply box appears; Ctrl or Cmd + Enter sends, the reply reopens the request, and a draft survives a redraw. When sending is not available to the viewer it says so instead. Changes of state are announced. At 390 px the header wraps and the track keeps its four stations.
 *
 * What it is: one request to Claude as the person who sent it follows it: what kind it is (task, fix, design note), which block it is about (a button that shows the block),
 * when it was sent, then a four-station track (queued, seen, working, done) drawn as one seam that fills as the session moves it, with the station's word under each bead so the
 * state never rides on colour. A request queued for more than three minutes says it is stuck and why that is not a failure. Below: the conversation (the person's words, Claude's
 * answer in Markdown, then every reply in order), the session's progress lines with their times, the blocks it changed (buttons), and a reply box once Claude has answered.
 *
 * A reply reopens the request; Ctrl/⌘+Enter sends it; a draft survives a redraw. Changes of state are announced. Below 40rem the header wraps and the track keeps its four stations.
 *
 * Data: either an engine and a request id (live: engine.thread(rid) and engine.reply), or the data itself (request + thread) for a page or a preview without the engine.
 *
 * API:
 *   Kit.requestCard.mount(box, opts) -> {update(data), destroy()}      update({request, thread}) for the static form
 *     engine     a Kit.assist engine; with rid the card follows engine.thread(rid) and replies through engine.reply(rid, text)
 *     rid        the request id                 request  {id, lane, scope: {id, label}, text, by, at, status, state, ackBy, progress, response, changed}  (static form)
 *     thread     {text, response, turns: [{by, at, text}]}  (static form; default from request)
 *     me         the viewer's uid (their words read "You")    names  {uid: name}    claude  the name of the session side (default "Claude")
 *     onReveal(partId)   what the block buttons do (scroll to the block); without it they are plain text
 *     onReply(rid, text) -> Promise   the static form's reply (without engine or onReply there is no reply box)
 *     canReply   false hides the reply box (default true)     markdown(text) -> html   default Kit.md when it and its libraries are loaded, else plain paragraphs
 *     now        ISO or Date for "x min ago" and stuck (default the clock)     words  {lanes: {lane: word}, states: {state: word}, reply, replyHint, stuck, waitAnswer, noSend}
 * Methods of what Kit.requestCard.mount returns: update({request, thread})
 *
 * @id        pattern.request-card
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.1
 * @updated   2026-11-14
 * @summary   One request to Claude as its sender follows it: kind, block, a four-station track from queued to done, the conversation with Claude's answer, progress lines, the blocks it changed, and a reply box.
 * @tags      request, task, claude, progress, track, thread, reply, conversation, assist, status
 * @requires  kit.tokens, kit.vocab, kit.keep-state, kit.dom
 * @files     kit/patterns/request-card.css, kit/samples/patterns.json
 * @provides  Kit.requestCard.mount, Kit.requestCard.state, Kit.requestCard.steps, Kit.requestCard.vocab
 * @related   pattern.assist, pattern.assist-panel, pattern.answer-queue, pattern.questions
 * @optional  pattern.assist, kit.md
 * @config    Kit.requestCard.mount(box, opts) | engine and rid (live), or request {id, lane, scope, text, quote, by, at, status, state, ackBy, progress, response, changed, version} and thread {text, response, turns} (static); me, names {uid: name}, titles, onReveal(partId), onReply(rid, text) for the static form, canReply, markdown(text), now, words; returns {update, destroy}
 * @config    engine | optional: a Kit.assist engine (pattern.assist); the card reads engine.thread(rid) and writes only through engine.reply
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink? --warn --f-ui --f-mono --seam?
 * @globals   none
 * @db        note none directly; with an engine, the engine reads requests/<rid> and its turns and writes the reply
 * @source    Catalog batch 16, 2026-10-26 | a drafting board's request card | the lane eyebrow, the state pill, the four-segment track, the thread, the progress log, the changed chips, the reply box
 * @preview   {"render": "pattern.request-card", "samples": ["kit/samples/patterns.json#request-card"]}
 * @changed   The track is one seam with a word under every station; the source coloured four segments.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = Kit.dom.el;
const STEPS = ['queue', 'ack', 'working', 'done'];
const ENUMS = {
  'assist-state': {
    queue: { word: 'Queued', short: 'queued', glyph: 'ring', tone: 'neutral', motion: 'none' },
    ack: { word: 'Seen', short: 'seen', glyph: 'eye', tone: 'info', motion: 'none' },
    working: { word: 'Working', short: 'working', glyph: 'pulse', tone: 'active', motion: 'breathe' },
    done: { word: 'Done', short: 'done', glyph: 'check', tone: 'success', motion: 'none' },
    stuck: { word: 'Still queued', short: 'stuck', glyph: 'hourglass', tone: 'attention', motion: 'none' },
  },
  'assist-lane': {
    ask: { word: 'Question', short: 'ask', glyph: 'question', tone: 'info', motion: 'none' },
    task: { word: 'Task', short: 'task', glyph: 'play', tone: 'active', motion: 'none' },
    fix: { word: 'Fix', short: 'fix', glyph: 'stop', tone: 'danger', motion: 'none' },
    design: { word: 'Design note', short: 'design', glyph: 'diamond', tone: 'review', motion: 'none' },
    ping: { word: 'Ping', short: 'ping', glyph: 'pulse', tone: 'neutral', motion: 'none' },
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(ENUMS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }
const stateOf = r => r.status === 'done' ? 'done' : r.state === 'working' ? 'working' : (r.state === 'ack' || r.state === 'seen') ? 'ack' : 'queue';
const ms = t => t == null ? NaN : typeof t === 'number' ? t : Date.parse(t);
function ago(t, now) {
  const s = Math.round((now - ms(t)) / 1000); if (!isFinite(s)) return '';
  return s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago';
}
const iso = t => { const n = ms(t); return isFinite(n) ? new Date(n).toISOString() : ''; };
const clock = t => { const n = ms(t); return isFinite(n) ? new Date(n).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''; };

function mount(box, opts) {
  ensure();
  const o = Object.assign({ claude: 'Claude', canReply: true }, opts); o.names = o.names || {}; o.words = o.words || {};
  const w = Object.assign({ reply: 'Reply', replyHint: 'Ctrl or ⌘ + Enter sends. Your reply reopens the request.', stuck: 'Queued for more than three minutes. Nothing failed: it waits for a session to pick it up.',
    waitAnswer: 'You can reply once Claude answers.', noSend: 'A reply goes to a session, and sending is not available to you here.', progress: 'Progress', changed: 'Changed', show: 'Show block' }, o.words);
  const md = o.markdown || (Kit.md && window.marked && window.DOMPurify ? Kit.md.create({ externalLinks: true }) : null);
  const now = () => o.now ? ms(o.now) : Date.now();
  let req = null, th = null, last = null, sending = false, err = '', off = null;
  box.classList.add('kit-rc-box'); box.replaceChildren();
  const live = el('p', 'kit-rc-live'); live.setAttribute('role', 'status');
  const card = el('article', 'kit-rc'); box.append(card, live);
  const who = by => by === 'claude' ? o.claude : by && by === (o.me || (o.engine && o.engine.me && o.engine.me())) ? 'You' : ((o.names || {})[by] || by || 'Someone');
  const rid = () => (req && req.id) || o.rid || '';
  const partBtn = (id, text) => {
    if (!o.onReveal) { const s = el('span', 'kit-rc-part', text || id); return s; }
    const b = el('button', 'kit-rc-part', text || id); b.type = 'button'; b.setAttribute('aria-label', w.show + ': ' + (text || id)); b.addEventListener('click', () => o.onReveal(id)); return b;
  };
  function body(text, isMd) {
    const d = el('div', 'kit-rc-body' + (isMd && md ? ' md' : ''));
    if (isMd && md) d.innerHTML = md(text); else String(text || '').split(/\n{2,}/).forEach(p => d.append(el('p', null, p)));
    return d;
  }
  function track(st, stuck) {
    const ol = el('ol', 'kit-rc-track'); ol.setAttribute('aria-label', 'Progress of this request');
    const at = STEPS.indexOf(st);
    STEPS.forEach((s, k) => {
      const li = el('li', 'kit-rc-st'); li.dataset.on = k < at ? 'past' : k === at ? 'now' : 'next';
      const key = k === at && stuck ? 'stuck' : s, row = V().get('assist-state', key);
      if (k <= at) { const orb = V().orb('assist-state', key, { size: 'sm' }); if (orb) { if (k < at) orb.removeAttribute('data-vo-motion'); li.append(orb); } }
      else li.append(el('span', 'kit-rc-hole'));
      li.append(el('span', 'kit-rc-w', (o.words.states && o.words.states[key]) || (row ? row.word : s)));
      if (k === at) li.setAttribute('aria-current', 'step');
      ol.append(li);
    });
    return ol;
  }
  function draw() {
    card.textContent = '';
    if (!req) { card.append(el('p', 'kit-rc-empty', 'Loading the request…')); return; }
    const st = (th && th.state) || stateOf(req), q = st === 'queue' && (th && 'stuck' in th ? th.stuck : now() - ms(req.at) > 180000);
    card.dataset.state = q ? 'stuck' : st; card.dataset.lane = req.lane || 'task';
    card.setAttribute('aria-label', 'Request: ' + String(req.text || '').slice(0, 80));
    const head = el('header', 'kit-rc-head');
    const lp = V().pill('assist-lane', req.lane || 'task', { unknown: 'flag' });
    if (lp && o.words.lanes && o.words.lanes[req.lane]) lp.querySelector('.kit-vo-w').textContent = o.words.lanes[req.lane];
    if (lp) head.append(lp);
    if (req.scope && req.scope.id) { const sc = el('span', 'kit-rc-scope'); sc.append(el('span', 'kit-rc-k', 'About'), partBtn(req.scope.id, req.scope.label)); head.append(sc); }
    if (req.at) { const t = el('time', 'kit-rc-at', ago(req.at, now())); t.dateTime = iso(req.at); t.title = new Date(ms(req.at)).toLocaleString(); head.append(t); }
    card.append(head, track(st, q));
    if (q) { const n = el('p', 'kit-rc-stuck'); n.append(V().glyph('hourglass'), document.createTextNode(w.stuck)); card.append(n); }
    if (st === 'ack' && req.ackBy) card.append(el('p', 'kit-rc-ack', 'Seen by ' + req.ackBy + (req.ackAt ? ', ' + ago(req.ackAt, now()) : '') + '.'));
    const turns = [];
    const t0 = th || req;
    if (t0.text) turns.push({ by: req.by, at: req.at, text: t0.text });
    if (t0.response) turns.push({ by: 'claude', at: req.doneAt, text: t0.response });
    ((th && th.turns) || req.turns || []).forEach(t => turns.push(t));
    if (turns.length) {
      const ol = el('ol', 'kit-rc-thread'); ol.setAttribute('aria-label', 'Conversation');
      turns.forEach(t => {
        const li = el('li', 'kit-rc-turn'); li.dataset.by = t.by === 'claude' ? 'claude' : 'person';
        const m = el('p', 'kit-rc-who'); m.append(el('b', null, who(t.by))); if (t.at) { const tt = el('time', null, clock(t.at)); tt.dateTime = iso(t.at); m.append(tt); }
        li.append(m, body(t.text, t.by === 'claude')); ol.append(li);
      });
      card.append(ol);
    }
    if (req.quote) { const d = el('details', 'kit-rc-quote'); d.dataset.keep = 'q-' + rid(); d.append(el('summary', null, 'The block as it was sent'), el('blockquote', null, req.quote)); card.append(d); }
    const pr = req.progress || [];
    if (pr.length && st !== 'queue') {
      const d = el('details', 'kit-rc-prog'); d.dataset.keep = 'p-' + rid(); if (st === 'working') d.open = true;
      d.append(el('summary', null, w.progress + ' (' + pr.length + ')'));
      const ol = el('ol'); pr.slice(-6).forEach((p, k, a) => { const li = el('li'); const tt = el('time', null, clock(p.at)); tt.dateTime = iso(p.at); li.append(tt, el('span', null, p.text)); if (st === 'working' && k === a.length - 1) li.dataset.now = 'true'; ol.append(li); });
      d.append(ol); card.append(d);
    }
    if (req.changed && req.changed.length) { const c = el('p', 'kit-rc-changed'); c.append(el('span', 'kit-rc-k', w.changed)); req.changed.forEach(id => c.append(partBtn(id, (o.titles && o.titles[id]) || id))); if (req.version) c.append(el('code', null, req.version)); card.append(c); }
    const can = o.canReply && req.lane !== 'ping' && (o.engine || o.onReply);
    const sendable = !o.engine || !o.engine.can || o.engine.can().send === 'available';
    if (can && st === 'done' && sendable) card.append(replyBox());
    else if (can && st === 'done') card.append(el('p', 'kit-rc-hint', w.noSend));
    else if (can) card.append(el('p', 'kit-rc-hint', w.waitAnswer));
    const sig = (q ? 'stuck' : st) + '|' + turns.length;
    if (last && last !== sig) live.textContent = 'Request ' + ((V().get('assist-state', q ? 'stuck' : st) || {}).word || st) + (turns.length > last.split('|')[1] ? ', new message' : '') + '.';
    last = sig;
  }
  function replyBox() {
    const f = el('form', 'kit-rc-reply'); const id = 'kit-rc-r-' + (rid() || 'x');
    const lab = el('label', null, w.reply + ' to ' + o.claude); lab.htmlFor = id;
    const ta = el('textarea'); ta.id = id; ta.rows = 2; ta.maxLength = 3000; ta.dataset.keep = id; ta.setAttribute('data-adp-edit', ''); ta.setAttribute('aria-describedby', id + '-h');
    const row = el('div', 'kit-rc-row'); const h = el('p', 'kit-rc-hint', err || w.replyHint); h.id = id + '-h'; if (err) h.dataset.err = 'true';
    const b = el('button', 'kit-rc-btn', sending ? 'Sending…' : w.reply); b.type = 'submit'; b.disabled = sending; b.setAttribute('data-adp-edit', '');
    row.append(h, b); f.append(lab, ta, row);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit ? f.requestSubmit() : send(ta); } });
    f.addEventListener('submit', e => { e.preventDefault(); send(ta); });
    return f;
  }
  function send(ta) {
    const text = ta.value.trim(); if (!text || sending) { if (!text) { err = 'Write the reply first.'; redraw(); } return; }
    sending = true; err = ''; redraw();
    const p = o.engine ? o.engine.reply(rid(), text) : o.onReply(rid(), text);
    Promise.resolve(p).then(() => { sending = false; if (redraw.clear) redraw.clear('kit-rc-r-' + rid()); const n = card.querySelector('textarea'); if (n) n.value = ''; live.textContent = 'Reply sent. The request is open again.'; redraw(); },
      e => { sending = false; err = 'Not sent (' + ((e && (e.code || e.message)) || 'error') + '). Your words are still here.'; redraw(); });
  }
  const redraw = Kit.keepState && Kit.keepState.wrap ? Kit.keepState.wrap(box, draw) : draw;
  function take(t) { th = t; if (t && t.req) req = t.req; redraw(); }
  if (o.engine && o.rid) { const h = o.engine.thread(o.rid); off = h.on(take); take(h.get()); }
  else { req = o.request || null; th = o.thread || null; redraw(); }
  const tick = setInterval(() => { if (req && !document.hidden && stateOf(req) !== 'done') redraw(); }, 30000);
  return {
    update(d) { if (d && d.request) req = d.request; if (d && 'thread' in d) th = d.thread; redraw(); },
    destroy() { clearInterval(tick); if (off) off(); box.replaceChildren(); box.classList.remove('kit-rc-box'); },
  };
}
Kit.requestCard = Object.freeze({ mount, vocab: ensure, state: stateOf, steps: STEPS.slice() });
})();
/* /part:page.script.kit.request-card */
