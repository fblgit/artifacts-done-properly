/* part:page.script.kit.presence */
/**
 * Session presence
 * Kit.presence.mount(box, {engine, artifactUrl}) reads engine.presence() and draws one line: a bead, a word (a session is watching, a session is working, no session is watching) and a sentence (which session, when it was last seen, what it is doing). Ping calls engine.ping(); while it waits a count shows the seconds, and the result says the session answered in 1.1 s or that no answer came (the engine waits 90 seconds). When nobody watches or a ping times out, the nudge says to open Claude Code and tell it watch the artifact <link>, with a Copy button; when the clipboard refuses, the line is selected so it can be copied by hand. It says requests wait in the queue only while sending is available, and that Ask now needs no session when the page can ask. compact: true keeps the line for a panel header and puts the nudge behind How to start one. Without an engine, pass presence and onPing. The state is never colour alone; the ping's start and end are announced. At 390 px the buttons drop under the line.
 *
 * What it is: one line that says whether a Claude Code session is watching this artifact (watching, busy with what, or nobody), when one was last seen, and a Ping button that
 * proves it: the session answers pong, the line says how fast, and a count shows the wait meanwhile. When nobody watches, or a ping gets no answer, the nudge says what to do:
 * start an agent session (the host names it: Claude Code on Claude) and tell it "watch the artifact <link>", with a Copy button (and the text selectable when the clipboard refuses). Requests still queue meanwhile,
 * and the nudge says so. The state is a bead, a word and a sentence, never colour alone; the ping's start and end are announced. The compact form (for a panel header) keeps the
 * line and hides the nudge behind "How to start one". Below 40rem the Ping button drops under the line.
 *
 * API:
 *   Kit.presence.mount(box, opts) -> {update(presence), ping(), destroy()}
 *     engine        a Kit.assist engine: follows engine.presence() and pings with engine.ping(); without it, pass presence and onPing
 *     presence      {watching, native, busy, sessions: [{session, at, doing}]}       onPing() -> Promise<"pong"|"timeout">  (static form)
 *     artifactUrl   the artifact's claude.ai link, written into the nudge (default: the words "this artifact's link")
 *     compact       true: the line only, the nudge behind a button        canPing  false hides Ping (default true)
 *     ask           true says that Ask now still works without a session    queued  false drops the line that requests wait in the queue (with an engine: shown only while sending is available)   now  ISO or Date (default the clock)
 *     words         {watching, busy, away, ping, pinging, pong, timeout, native, nudgeTitle, nudge, queued, askStill, copy, copied, how}
 * Methods of what Kit.presence.mount returns: update(presence), ping()
 *
 * @id        pattern.presence
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.1
 * @updated   2026-11-14
 * @summary   Whether an agent session is watching the artifact, a Ping that proves it with the time it took, and the nudge that says how to start one: tell Claude Code to watch the artifact, with a Copy button.
 * @tags      presence, session, claude code, ping, nudge, watching, online, assist
 * @requires  kit.tokens, kit.vocab, kit.dom
 * @files     kit/patterns/presence.css, kit/samples/patterns.json
 * @provides  Kit.presence.mount
 * @config    Kit.presence.mount(box, opts) | engine (live) or presence {watching, busy, sessions [{session, at, doing}]} and onPing() -> 'pong' | 'timeout'; artifactUrl, compact, canPing, ask, queued, now, words; returns {update, ping, destroy}
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink? --warn --f-ui --f-mono --seam?
 * @globals   none
 * @db        note none directly; with an engine, the engine reads presence/<session> and sends the ping request
 * @source    Catalog batch 16, 2026-10-26 | a drafting board's session line, Ping button and panel | watching within five minutes, busy with what, the ping states and its 90 s timeout
 * @source    Catalog batch 16, 2026-10-26 | the same board's nudge | the copyable watch the artifact line
 * @preview   {"render": "pattern.presence", "samples": ["kit/samples/patterns.json#presence"]}
 * @samples   presence
 * @changed   One view with a compact form for a panel header.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = Kit.dom.el;
let seq = 0;
const ENUM = { 'assist-presence': {
  watching: { word: 'A session is watching', short: 'watching', glyph: 'eye', tone: 'success', motion: 'none' },
  busy: { word: 'A session is working', short: 'busy', glyph: 'pulse', tone: 'active', motion: 'breathe' },
  away: { word: 'No session is watching', short: 'away', glyph: 'moon', tone: 'ended', motion: 'none' },
} };
function ensure() { const t = {}; for (const [v, r] of Object.entries(ENUM['assist-presence'])) if (V().get('assist-presence', v) === undefined) (t['assist-presence'] = t['assist-presence'] || {})[v] = r; if (t['assist-presence']) V().define(t); }
const ms = t => t == null ? NaN : typeof t === 'number' ? t : Date.parse(t);
const ago = (t, now) => { const s = Math.round((now - ms(t)) / 1000); return !isFinite(s) ? '' : s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };

function mount(box, opts) {
  ensure();
  const o = Object.assign({ canPing: true, compact: false }, opts);
  const w = Object.assign({ ping: 'Ping', pinging: 'Asking the session', pong: 'The session answered', timeout: 'No answer came from a session.', native: 'It is woken when you send a request.', nudgeTitle: 'Start a session to work on this page',
    nudge: 'Open {where} on your computer and tell it:', queued: 'Requests you send now wait in the queue and are picked up when a session starts watching.',
    askStill: 'Ask now still answers straight away; it needs no session.', copy: 'Copy', copied: 'Copied. Paste it into {where}.', how: 'How to start one', link: "this artifact's link" }, o.words);
  const now = () => o.now ? ms(o.now) : Date.now();
  const uid = 'kit-pr-' + (++seq);
  let pres = o.presence || { watching: false, busy: false, sessions: [] }, ping = { s: 'idle', t0: 0, took: 0 }, open = !o.compact, off = null, tick = null;
  box.classList.add('kit-pr'); box.replaceChildren(); box.setAttribute('data-assist-ui', '');
  const live = el('p', 'kit-pr-live'); live.setAttribute('role', 'status');
  const wrap = el('div', 'kit-pr-in'); box.append(wrap, live);
  const stateOf = () => pres.busy ? 'busy' : pres.watching ? 'watching' : 'away';
  function sub() {
    const ss = (pres.sessions || []).slice().sort((a, b) => ms(b.at) - ms(a.at)), s = ss[0];
    if (pres.native) return w.native;      // the platform says a session watches; no fresh presence doc names it
    if (!s) return 'None has been seen on this artifact yet.';
    const name = s.session || 'a session', when = ago(s.at, now());
    const more = ss.length > 1 ? ' (+' + (ss.length - 1) + ' more)' : '';
    if (pres.busy && s.doing) return name + ': ' + s.doing + more;
    return (pres.watching ? name + ', seen ' + when : 'Last seen ' + when + ' (' + name + ')') + more;
  }
  const where = () => o.engine && o.engine.agentWhere ? o.engine.agentWhere() : 'your agent', fill = t => String(t).replace(/\{where\}/g, where());
  function nudge() {
    const n = el('div', 'kit-pr-nudge'); n.id = uid + '-n';
    n.append(el('p', 'kit-pr-nt', w.nudgeTitle), el('p', null, fill(w.nudge)));
    const line = 'watch the artifact ' + (o.artifactUrl || '<' + w.link + '>');
    const r = el('div', 'kit-pr-cmd'); const code = el('code', null, line); code.tabIndex = 0; code.setAttribute('aria-label', 'Say to ' + where() + ': ' + line);
    const b = el('button', 'kit-pr-btn ghost', w.copy); b.type = 'button';
    b.addEventListener('click', () => {
      const sel = () => { const rg = document.createRange(); rg.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); live.textContent = 'Selected. Copy it with Ctrl or ⌘ + C.'; };
      try { navigator.clipboard.writeText(line).then(() => { live.textContent = fill(w.copied); b.textContent = 'Copied'; setTimeout(() => { b.textContent = w.copy; }, 2000); }, sel); } catch (_) { sel(); }
    });
    r.append(code, b); n.append(r);
    if (o.engine ? o.engine.can().send === 'available' : o.queued !== false) n.append(el('p', 'kit-pr-sm', w.queued));
    if (o.ask) n.append(el('p', 'kit-pr-sm', w.askStill));
    return n;
  }
  function draw() {
    wrap.textContent = ''; const st = stateOf(); box.dataset.state = st; box.dataset.compact = o.compact ? 'true' : 'false';
    const line = el('div', 'kit-pr-line'), orb = V().orb('assist-presence', st, { size: 'md' });
    const txt = el('p', 'kit-pr-txt'); txt.append(el('b', null, (V().get('assist-presence', st) || {}).word || st), el('span', 'kit-pr-sub', sub()));
    if (orb) line.append(orb); line.append(txt);
    const acts = el('div', 'kit-pr-acts');
    if (o.canPing && (o.engine || o.onPing)) {
      const b = el('button', 'kit-pr-btn', ping.s === 'waiting' ? w.pinging + '…' : w.ping); b.type = 'button'; b.disabled = ping.s === 'waiting';
      b.setAttribute('aria-describedby', uid + '-pd'); b.addEventListener('click', doPing); acts.append(b);
    }
    const showN = st === 'away' || ping.s === 'timeout';
    if (o.compact && showN) { const t = el('button', 'kit-pr-btn ghost', w.how); t.type = 'button'; t.setAttribute('aria-expanded', String(open)); t.setAttribute('aria-controls', uid + '-n'); t.addEventListener('click', () => { open = !open; draw(); }); acts.append(t); }
    line.append(acts); wrap.append(line);
    const pd = el('p', 'kit-pr-ping'); pd.id = uid + '-pd'; pd.dataset.s = ping.s;
    if (ping.s === 'waiting') pd.textContent = w.pinging + ', ' + Math.round((Date.now() - ping.t0) / 1000) + ' s';
    else if (ping.s === 'pong') pd.textContent = w.pong + ' in ' + (ping.took / 1000).toFixed(1) + ' s.';
    else if (ping.s === 'timeout') pd.textContent = w.timeout;
    else if (ping.s === 'error') pd.textContent = 'The ping was not sent (' + ping.code + ').';
    if (ping.s !== 'idle') wrap.append(pd);
    if (showN && open) wrap.append(nudge());
  }
  function doPing() {
    if (ping.s === 'waiting') return;
    ping = { s: 'waiting', t0: Date.now(), took: 0 }; live.textContent = w.pinging + '.'; draw();
    clearInterval(tick); tick = setInterval(() => { const n = wrap.querySelector('.kit-pr-ping'); if (n && ping.s === 'waiting') n.textContent = w.pinging + ', ' + Math.round((Date.now() - ping.t0) / 1000) + ' s'; }, 1000);
    const p = o.engine ? o.engine.ping() : o.onPing();
    return Promise.resolve(p).then(r => {
      clearInterval(tick); ping = r === 'pong' ? { s: 'pong', took: Date.now() - ping.t0 } : { s: 'timeout' };
      if (ping.s === 'timeout') open = true;
      live.textContent = ping.s === 'pong' ? w.pong + '.' : w.timeout; draw(); return r;
    }, e => { clearInterval(tick); ping = { s: 'error', code: (e && (e.code || e.message)) || 'error' }; live.textContent = 'The ping was not sent.'; draw(); });
  }
  if (o.engine) { const h = o.engine.presence(); off = h.on(p => { pres = p || pres; draw(); }); if (h.get()) pres = h.get(); }
  draw();
  const t2 = setInterval(() => { if (!document.hidden && ping.s !== 'waiting') draw(); }, 30000);
  return { update(p) { if (p) pres = p; draw(); }, ping: doPing, destroy() { clearInterval(tick); clearInterval(t2); if (off) off(); box.replaceChildren(); box.classList.remove('kit-pr'); } };
}
Kit.presence = Object.freeze({ mount });
})();
/* /part:page.script.kit.presence */
