/* part:page.script.kit.assist-panel */
/**
 * Assist panel
 * Kit.assistPanel.mount(box, {engine, titles, onReveal, artifactUrl}) builds over the assist engine only. At the top, the presence line (compact). The composer: what kind of request, as radio buttons with one line on what each does (Ask now answers here and changes nothing; Task, Fix and Design note go to a Claude Code session), which block it is about (Pick a block or the shortcut, then the block's name, id and quoted text with Change and Clear; without a block it is about the whole page), the words, and Send, whose label says where it goes. Ctrl or Cmd + Enter sends. When a way is not available the composer says why in words (only editors can send, no session is listening, sending is off, Ask now is not available) and keeps the draft, which also survives a reload; with neither way, Copy for Claude puts the block and the words on the clipboard. The feed shows the requests as request cards, newest first (all, or open only), so an answer stays in view when it lands, or the conversation, where Claude's answer streams in as it is written, earlier conversations can be continued, and a question can be sent on to a session as a task. Start the engine with onPick: p => panel.setScope(p, true) so the shortcut fills the composer. Everything is reachable from the keyboard in reading order, and sends, answers and errors are announced. At 390 px the kinds sit two by two and the buttons go full width.
 *
 * The page's lane to Claude in one panel. At the top, whether a Claude Code session is watching (Kit.presence, compact, when loaded). Then the composer: what kind of
 * request (Ask now, Task, Fix, Design note: radio buttons with one line on what each does), which block it is about (Pick a block, or the shortcut; the block's name, id and
 * quoted text, Change and Clear), the words, and Send, whose label says where it goes (Ask now answers here; the others go to a session). Ctrl/⌘+Enter sends. When a way is
 * not available the composer says why in words and keeps the draft; with neither way it offers Copy, so the block and the words still reach Claude by hand. Then the feed:
 * the requests with their cards (Kit.requestCard; all, newest first, or open only) or the current conversation, where an answer streams in as it is written and can be sent on to a session.
 * Everything is reachable from the keyboard in reading order; sends, answers and errors are announced. Below 40rem the lanes wrap two by two and the buttons go full width.
 * Built over the Kit.assist engine only: it never touches the db.
 *
 * API:
 *   Kit.assistPanel.mount(box, opts) -> {setScope(pick | null, focus), pick(), focus(), show("requests"|"conversation"), destroy()}
 *     engine      a Kit.assist engine (required): can, delivery, agentLabel, pick, send, ask, requests, messages (when present), presence, thread, reply, ping
 *     lanes       which lanes to offer (default the "assist.lanes" switch, else ask, task, fix, design); "assist.ask-now" false drops ask
 *     project     filters the request list                  titles  {partId: title} for block names
 *     onReveal(partId)   scroll to a block (block buttons on cards)     artifactUrl  for the nudge     me, names  as Kit.requestCard
 *     shortcut    the picker's key, shown in the hint (default the "assist.shortcut" switch, else Mod+Shift+K); the engine binds it: start it with onPick: p => panel.setScope(p, true)
 *     words       {title, lanes: {lane: word}, help: {lane: text}, send: {lane: text}, ...}
 * Methods of what Kit.assistPanel.mount returns: setScope(pick, focus), pick(), show(view), focus()
 *
 * @id        pattern.assist-panel
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   The page's lane to Claude in one panel: whether a session watches, a composer (kind, block, words) that sends to a session or asks Claude at once, and the feed of request cards or the current conversation.
 * @tags      assist, claude, composer, chat, ask, task, fix, design, panel, requests, conversation, presence
 * @requires  kit.tokens, kit.vocab, kit.keep-state, pattern.assist, pattern.block-picker, pattern.request-card, pattern.presence, kit.dom
 * @files     kit/patterns/assist-panel.css, kit/samples/patterns.json
 * @provides  Kit.assistPanel.mount
 * @related   pattern.assist, pattern.request-card, pattern.answer-queue, pattern.questions
 * @config    Kit.assistPanel.mount(box, opts) | engine (a Kit.assist engine, required), lanes, project, titles, onReveal(partId), artifactUrl, me, names, shortcut, words {title, kind, lanes, help, send}; returns {setScope, pick, show, focus, destroy}
 * @config    Kit.assist.start({..., onPick}) | onPick: p => panel.setScope(p, true), so the shortcut fills the composer and moves focus to the words
 * @config    ADP.config | optional: assist.lanes, assist.ask-now and assist.shortcut are read when the runtime is present
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink? --accent-soft --warn --f-ui --f-mono --seam? --f-display?
 * @globals   none
 * @db        note none directly; the engine writes requests/, conversations/ and their changes/ entries
 * @source    Catalog batch 16, 2026-10-26 | a drafting board's bottom composer | the mode switch, the kept draft, the byte count, Ctrl+Enter, the reason line
 * @source    Catalog batch 16, 2026-10-26 | the same board's Claude pane | open or all requests, the session line and Ping above them
 * @preview   {"render": "pattern.assist-panel", "samples": ["kit/samples/patterns.json#assist-panel"]}
 * @samples   assist-panel
 * @changed   Ask now (an immediate answer) and the session lanes share one composer; the source had a separate bar per lane.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = Kit.dom.el;
const cfg = (k, d) => { try { const v = window.ADP && ADP.config && ADP.config.get(k); return v == null ? d : v; } catch (_) { return d; } };
const LANES = { ask: 'Ask now', task: 'Task', fix: 'Fix', design: 'Design note' };
const HELP = { ask: '{agent} answers here straight away. Nothing on the page changes.', task: 'A {agent} session does it, publishes and says what changed.',
  fix: 'Say what is wrong here. A session fixes it and tells you what it did.', design: 'Say how this should look or read. A session changes the design.' };
const SEND = { ask: 'Ask now', task: 'Send to a session', fix: 'Send the fix', design: 'Send the note' };
const WHY = { writers_only: 'Only people who can edit this artifact can send to a session.', no_session: 'No {agent} session is listening, so the request cannot be sent yet. Start one (see above), then send.',
  off: 'Sending to a session is turned off for this artifact.', none: 'This page cannot reach a session.', ask: 'Ask now is not available on this page.' };
const store = { get(k) { try { return sessionStorage.getItem(k) || ''; } catch (_) { return ''; } }, set(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (_) {} } };
let seq = 0;

function mount(box, opts) {
  if (Kit.requestCard && Kit.vocab) Kit.requestCard.vocab();
  const o = Object.assign({ words: {} }, opts), E = o.engine, w = o.words, id = 'kit-ap-' + (++seq);
  let lanes = (o.lanes || (E.lanes ? E.lanes() : cfg('assist.lanes', Object.keys(LANES)))).filter(l => l !== 'ping');
  if (cfg('assist.ask-now', true) === false) lanes = lanes.filter(l => l !== 'ask');
  const A = () => E.agentLabel ? E.agentLabel() : 'Agent', fill = s => String(s).replace(/\{agent\}/g, A());
  const word = (t, l) => fill((w[t] && w[t][l]) || ({ lanes: LANES, help: HELP, send: SEND })[t][l] || l);
  const keyName = Kit.blockPicker && Kit.blockPicker.keyLabel ? Kit.blockPicker.keyLabel(o.shortcut || cfg('assist.shortcut', 'Mod+Shift+K')) : 'Ctrl+Shift+K';
  const draftKey = 'kit-ap:draft:' + (o.project || '');
  let lane = lanes.includes(store.get(draftKey + ':lane')) ? store.get(draftKey + ':lane') : lanes[0] || 'task';
  let scope = null, quote = '', busy = false, view = 'requests', openOnly = false, cid = null, msgs = [], stream = null, offs = [], cards = new Map();
  box.classList.add('kit-ap'); box.setAttribute('data-assist-ui', ''); box.replaceChildren();
  const live = el('p', 'kit-ap-live'); live.setAttribute('role', 'status');
  const head = el('header', 'kit-ap-head'); head.append(el('h2', 'kit-ap-ttl', w.title || 'Work with ' + A()));
  const pres = el('div', 'kit-ap-pres'); head.append(pres);
  // composer
  const form = el('form', 'kit-ap-form'); form.setAttribute('aria-label', 'Write to ' + A());
  const fs = el('fieldset', 'kit-ap-lanes'); fs.append(el('legend', null, w.kind || 'What do you want?'));
  const laneRow = el('div', 'kit-ap-lrow'); fs.append(laneRow);
  const help = el('p', 'kit-ap-help'); help.id = id + '-help'; fs.append(help);
  lanes.forEach(l => {
    const lab = el('label', 'kit-ap-lane'); const r = el('input'); r.type = 'radio'; r.name = id + '-lane'; r.value = l; r.id = id + '-l-' + l; r.setAttribute('data-adp-edit', '');
    r.addEventListener('change', () => { lane = l; store.set(draftKey + ':lane', l); syncLane(); });
    const g = Kit.vocab && Kit.vocab.get('assist-lane', l) ? Kit.vocab.glyph(Kit.vocab.get('assist-lane', l).glyph) : null;
    lab.append(r); if (g) lab.append(g); lab.append(el('span', null, word('lanes', l))); laneRow.append(lab);
  });
  const sc = el('div', 'kit-ap-scope'); sc.setAttribute('aria-live', 'polite');
  const ta = el('textarea', 'kit-ap-ta'); ta.id = id + '-text'; ta.rows = 3; ta.maxLength = 3000; ta.setAttribute('data-adp-edit', ''); ta.value = store.get(draftKey);
  const tl = el('label', 'kit-ap-tl', 'Your words'); tl.htmlFor = ta.id; ta.setAttribute('aria-describedby', id + '-help ' + id + '-why');
  const foot = el('div', 'kit-ap-foot'); const why = el('p', 'kit-ap-why'); why.id = id + '-why'; const count = el('span', 'kit-ap-count');
  const send = el('button', 'kit-ap-send'); send.type = 'submit'; send.setAttribute('data-adp-edit', '');
  const copy = el('button', 'kit-ap-copy', 'Copy for ' + A()); copy.type = 'button'; copy.hidden = true;
  const acts = el('div', 'kit-ap-acts'); acts.append(count, copy, send); foot.append(why, acts);
  form.append(fs, sc, tl, ta, foot);
  // feed
  const feed = el('section', 'kit-ap-feed'); feed.setAttribute('aria-label', 'Requests and answers');
  const tabs = el('div', 'kit-ap-tabs'); const tReq = el('button', 'kit-ap-tab'), tCon = el('button', 'kit-ap-tab', 'Conversation');
  const tFil = el('button', 'kit-ap-fil'); [tReq, tCon, tFil].forEach(b => { b.type = 'button'; tabs.append(b); });
  const list = el('ol', 'kit-ap-list'); const conv = el('div', 'kit-ap-conv');
  feed.append(tabs, list, conv);
  box.append(head, form, feed, live);
  if (Kit.presence) offs.push(Kit.presence.mount(pres, { engine: E, compact: true, artifactUrl: o.artifactUrl, ask: E.can().ask }).destroy);

  function syncLane() {
    Array.from(laneRow.querySelectorAll('input')).forEach(r => { r.checked = r.value === lane; });
    help.textContent = word('help', lane); tl.textContent = lane === 'ask' ? 'Your question' : 'What should the session do?';
    ta.placeholder = scope ? 'About “' + scope.label + '”' : 'About the whole page, or pick a block first';
    syncCan();
  }
  function syncCan() {
    const c = E.can(), go = c.send === 'available' || c.send === 'queued', ok = lane === 'ask' ? c.ask : go, none = !c.ask && !go && c.send !== 'no_session';
    send.textContent = busy ? (lane === 'ask' ? 'Asking…' : 'Sending…') : word('send', lane);
    send.disabled = busy; send.setAttribute('aria-disabled', String(!ok));
    why.textContent = ok ? 'Ctrl or ⌘ + Enter sends.' : lane === 'ask' ? WHY.ask : fill(WHY[c.send] || WHY.none);
    why.dataset.blocked = ok ? 'false' : 'true'; copy.hidden = !none;
    count.textContent = ta.value.length ? ta.value.length + ' / 3000' : '';
  }
  function drawScope() {
    sc.textContent = '';
    if (!scope) {
      const b = el('button', 'kit-ap-pick', 'Pick a block'); b.type = 'button'; b.setAttribute('aria-keyshortcuts', (o.shortcut || cfg('assist.shortcut', 'Mod+Shift+K')).replace(/^Mod/, /mac/i.test(navigator.platform || '') ? 'Meta' : 'Control')); b.addEventListener('click', pick);
      const k = el('span', 'kit-ap-k'); k.append(document.createTextNode('or press '), el('kbd', null, keyName), document.createTextNode('. Without one, it is about the whole page.'));
      sc.append(b, k); return;
    }
    const chip = el('div', 'kit-ap-chip'); const nm = el('p', 'kit-ap-about'); nm.append(el('span', 'kit-ap-k', 'About'), el('b', null, scope.label), el('code', null, scope.id));
    const b1 = el('button', 'kit-ap-mini', 'Change'); b1.type = 'button'; b1.setAttribute('aria-label', 'Change the block'); b1.addEventListener('click', pick);
    const b2 = el('button', 'kit-ap-mini', 'Clear'); b2.type = 'button'; b2.setAttribute('aria-label', 'Clear the block, ask about the whole page'); b2.addEventListener('click', () => { setScope(null); ta.focus(); });
    nm.append(b1, b2); chip.append(nm);
    if (quote) chip.append(el('blockquote', 'kit-ap-quote', quote));
    sc.append(chip);
  }
  function setScope(p, focus) { scope = p ? { kind: 'part', id: p.id, label: p.label || p.id, hash: p.hash || '' } : null; quote = p ? p.quote || '' : ''; drawScope(); syncLane(); if (p && focus) { live.textContent = 'Picked: ' + scope.label + '.'; ta.focus(); } }
  function pick() {
    const f = E.pick ? E.pick() : Kit.blockPicker ? Kit.blockPicker.open({ titles: o.titles }) : Promise.resolve(null);
    return Promise.resolve(f).then(p => { if (p) { setScope(p); live.textContent = 'Picked: ' + p.label + '.'; } ta.focus(); return p; });
  }
  function fail(e) { const c = (e && (e.code || e.message)) || 'error'; why.textContent = 'Not sent: ' + (WHY[c] ? fill(WHY[c]) : c) + ' Your words are still here.'; why.dataset.blocked = 'true'; live.textContent = why.textContent; }
  function submit() {
    const text = ta.value.trim(); syncCan(); if (busy) return;
    if (send.getAttribute('aria-disabled') === 'true') { live.textContent = why.textContent; return; }
    if (!text) { why.textContent = 'Write what you want first.'; why.dataset.blocked = 'true'; ta.focus(); return; }
    busy = true; syncCan();
    const done = () => { busy = false; ta.value = ''; store.set(draftKey, ''); syncCan(); };
    if (lane === 'ask') {
      show('conversation'); msgs.push({ role: 'user', by: o.me, text }); stream = ''; drawConv();
      E.ask(cid, text, { scope, quote, onText: t => { stream = t; drawStream(); } }).then(r => { cid = r.cid; follow(); stream = null; if (!E.messages) msgs.push({ role: 'assistant', text: r.text }); done(); drawConv(); live.textContent = A() + ' answered.'; },
        e => { msgs.pop(); stream = null; busy = false; drawConv(); syncCan(); fail(e); });
    } else {
      E.send({ lane, scope, text, quote }).then(rid => { done(); show('requests'); live.textContent = E.delivery && E.delivery(rid) === 'unknown' ? word('lanes', lane) + ' saved. Delivery to ' + (E.agentLabel ? E.agentLabel() : 'the session') + ' is not confirmed; the request stays in the list.' : word('lanes', lane) + ' sent. It waits in the queue until a session picks it up.'; flash(rid); }, e => { busy = false; syncCan(); fail(e); });
    }
  }
  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
  ta.addEventListener('input', () => { store.set(draftKey, ta.value); count.textContent = ta.value.length ? ta.value.length + ' / 3000' : ''; });
  copy.addEventListener('click', () => {
    const t = (scope ? 'About "' + scope.label + '" (' + scope.id + ')\n' : '') + (quote ? '> ' + quote + '\n\n' : '') + ta.value.trim();
    try { navigator.clipboard.writeText(t).then(() => { live.textContent = 'Copied. Paste it into ' + A() + '.'; }, () => { ta.select(); live.textContent = 'Select and copy it by hand.'; }); } catch (_) { ta.select(); }
  });
  // feed
  let reqOff = null, reqs = [];
  function subReqs() { if (reqOff) reqOff(); const h = E.requests({ project: o.project, open: openOnly }); reqOff = h.on(r => { reqs = r || []; drawReqs(); }); reqs = h.get() || []; drawReqs(); }
  function drawReqs() {
    const open = reqs.filter(r => r.status !== 'done').length;
    tReq.textContent = 'Requests' + (open ? ' (' + open + ' open)' : '');
    const keep = new Set(reqs.map(r => r.id));
    for (const [rid, c] of cards) if (!keep.has(rid)) { c.h.destroy(); c.li.remove(); cards.delete(rid); }
    if (!reqs.length) { list.replaceChildren(el('li', 'kit-ap-empty', openOnly ? 'No open requests. Pick a block, say what you want and send it.' : 'Nothing has been sent from this page yet.')); return; }
    const em = list.querySelector('.kit-ap-empty'); if (em) em.remove();
    reqs.forEach((r, k) => {
      let c = cards.get(r.id);
      if (!c) { const li = el('li', 'kit-ap-item'); li.dataset.rid = r.id; const div = el('div'); li.append(div);
        const h = Kit.requestCard ? Kit.requestCard.mount(div, { engine: E, rid: r.id, claude: A(), me: o.me, names: o.names, titles: o.titles, onReveal: o.onReveal }) : (div.textContent = r.text, { destroy() {} });
        c = { li, h }; cards.set(r.id, c); }
      if (list.children[k] !== c.li) list.insertBefore(c.li, list.children[k] || null);
    });
  }
  function flash(rid) { const c = cards.get(rid); if (c) { c.li.dataset.flash = 'true'; setTimeout(() => { delete c.li.dataset.flash; }, 1600); } }
  let msgOff = null;
  function follow() { if (!E.messages || !cid) return; if (msgOff) msgOff(); const h = E.messages(cid); msgOff = h.on(m => { msgs = m || []; drawConv(); }); msgs = h.get() || msgs; }
  function drawStream() { const s = conv.querySelector('[data-stream]'); if (s) s.lastChild.textContent = stream || '…'; else drawConv(); }
  function drawConv() {
    conv.textContent = '';
    if (!msgs.length && stream == null) {
      conv.append(el('p', 'kit-ap-empty', E.can().ask ? 'Choose Ask now, write a question and ' + A() + ' answers here. A conversation is kept with the page.' : WHY.ask));
      const cs = E.conversations ? (E.conversations({ project: o.project }).get() || []).slice(0, 5) : [];
      if (cs.length) { const ul = el('ul', 'kit-ap-convs'); ul.setAttribute('aria-label', 'Earlier conversations');
        cs.forEach(c => { const li = el('li'); const b = el('button', 'kit-ap-mini', 'Continue: ' + (c.title || 'a conversation')); b.type = 'button';
          b.addEventListener('click', () => { cid = c.id; if (c.scope && c.scope.id) setScope(c.scope); follow(); drawConv(); ta.focus(); }); li.append(b); ul.append(li); });
        conv.append(ul); }
      return;
    }
    const ol = el('ol', 'kit-ap-msgs'); ol.setAttribute('aria-label', 'Conversation');
    const md = Kit.md && window.marked && window.DOMPurify ? Kit.md.create({ externalLinks: true }) : null;
    msgs.forEach(m => { const li = el('li', 'kit-ap-msg'); li.dataset.role = m.role; li.append(el('b', null, m.role === 'assistant' ? A() : 'You'));
      const b = el('div', 'kit-ap-mb' + (md && m.role === 'assistant' ? ' md' : '')); if (md && m.role === 'assistant') b.innerHTML = md(m.text); else b.textContent = m.text; li.append(b); ol.append(li); });
    if (stream != null) { const li = el('li', 'kit-ap-msg'); li.dataset.role = 'assistant'; li.dataset.stream = 'true'; li.setAttribute('aria-busy', 'true'); li.append(el('b', null, A() + ', writing'), el('div', 'kit-ap-mb', stream || '…')); ol.append(li); }
    conv.append(ol);
    const row = el('div', 'kit-ap-crow');
    const last = msgs.filter(m => m.role === 'user').pop();
    if (last && stream == null && ['available', 'queued'].includes(E.can().send)) { const b = el('button', 'kit-ap-mini', 'Send this to a session'); b.type = 'button';
      b.addEventListener('click', () => E.send({ lane: 'task', scope, text: last.text, quote }).then(rid => { show('requests'); flash(rid); live.textContent = 'Sent to a session as a task.'; }, fail)); row.append(b); }
    const n = el('button', 'kit-ap-mini', 'New conversation'); n.type = 'button'; n.addEventListener('click', () => { cid = null; msgs = []; if (msgOff) msgOff(); msgOff = null; drawConv(); ta.focus(); }); row.append(n);
    conv.append(row);
  }
  function show(v) {
    view = v; tReq.setAttribute('aria-pressed', String(v === 'requests')); tCon.setAttribute('aria-pressed', String(v === 'conversation'));
    list.hidden = tFil.hidden = v !== 'requests'; conv.hidden = v !== 'conversation';
    tFil.textContent = openOnly ? 'Show all' : 'Show open only'; if (v === 'conversation') drawConv();
  }
  tReq.addEventListener('click', () => show('requests')); tCon.addEventListener('click', () => show('conversation'));
  tFil.addEventListener('click', () => { openOnly = !openOnly; show('requests'); subReqs(); });
  if (E.watch) offs.push(E.watch(syncCan));
  if (E.onPick) offs.push(E.onPick(p => { if (p) { setScope(p); ta.focus(); } }));
  const t = setInterval(syncCan, 30000);
  drawScope(); syncLane(); subReqs(); show('requests');
  return {
    setScope, pick, show, focus: () => ta.focus(),
    destroy() { clearInterval(t); offs.forEach(f => { try { f(); } catch (_) {} }); if (reqOff) reqOff(); if (msgOff) msgOff(); cards.forEach(c => c.h.destroy()); box.replaceChildren(); box.classList.remove('kit-ap'); },
  };
}
Kit.assistPanel = Object.freeze({ mount });
})();
/* /part:page.script.kit.assist-panel */
