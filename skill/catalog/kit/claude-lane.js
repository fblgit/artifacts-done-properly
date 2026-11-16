/* part:page.script.kit.claude-lane */
/**
 * Claude lane
 * Claude-only: it calls comments.sendToClaude itself; a page that must also run on another host uses pattern.assist, which sends through the host's agent handle. sendRequest(text, anchorEl, recordId) writes the request doc first, then delivers it through comments.sendToClaude when a session listens; otherwise the doc waits for the next session. The session writes back working with progress lines and done with a response, and the lane paints each step. ListenHint says whether a session is listening, QueueStrip counts requests per step, ReqList shows the requests about one record.
 *
 * What it is: sends a request to the Claude Code session that has the artifact open (comments.sendToClaude, anchored to an element), with a queued
 * fallback when nobody listens (the request doc stays on the board and the next session picks it up); the request lifecycle
 * (queue, ack, pending, done) read off the doc; the listener check (polled every 30 s); and the UI: ListenHint, ReqLine (one request card),
 * ReqList (requests about one record), QueueStrip (counts per step).
 * config  Kit.claudeLane.create({store, db, chrome, collection, presenceSlot, presenceKey, who, steps, hints, workingState, ackStates, doneStatus,
 *                                recordField, textMax, words, footer, onList, onAnswered})
 *           collection     db collection of requests (default "requests"); the state slot has the same name
 *           presenceSlot   state slot of presence docs (default "presence"); presenceKey the presence doc id it reads (default "claude-code"; else the freshest presence doc)
 *           who            display name of the session (default "Claude Code")
 *           steps          ordered step names (default ["queue","ack","pending","done"]); hints {step: text}; css classes derive from the step names
 *           workingState   request.state value that means "being worked on" (default "working"), ackStates values that mean acknowledged (default ["ack","seen"]), doneStatus request.status value for answered (default "done")
 *           recordField    field on the request that names the record it is about (default "itemId")
 *           textMax        clip for the request text (default 3000)
 *           words          {delivered, queued, listening, writersOnly, checking, none, stuck} texts
 *           footer(ctx)    hook (function): text appended to the delivered message; ctx {text, rid, recordId, anchor}; default "— request <rid>"
 *           onList()       hook: what the QueueStrip click does (open the board's list of requests)
 *           onAnswered(id, request)  hook returning a toast action {label, fn} when a request turns done (optional)
 * state   S.listen (null | "available" | other), S.answered (count), S.<collection>, S.<presenceSlot>
 * Request doc written: {text, <recordField>, status: "open", delivered, author, created}; then {delivered, why, sentAt}. The session writes back
 * state "working" + progress[{text}] on long work, status "done" + response.
 *
 * @id        kit.claude-lane
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.3
 * @updated   2026-11-14
 * @summary   Sends a request to the Claude Code session that has the page open, queues it on the board when nobody listens, and shows each request’s answer state: queued, acknowledged, working, answered.
 * @tags      claude, claude code, requests, queue, answer states, stepper, comments, sendtoclaude, presence
 * @requires  kit.store, kit.chrome
 * @files     kit/claude-lane.css, kit/samples/kit.json
 * @provides  Kit.claudeLane.create
 * @config    Kit.claudeLane.create({store, db, chrome, collection, presenceSlot, presenceKey, who, steps, hints, …}) | every name has a default: collection "requests", steps queue/ack/pending/done, who "Claude Code"
 * @config    workingState, ackStates, doneStatus, recordField | which request fields mean which step (defaults working; ack, seen; done; itemId)
 * @config    hooks | footer(ctx) for the delivered text; onList() for the strip; onAnswered(id, r) for a toast action
 * @config    capability | comments in the full form (canSendToClaude, anchorFor, sendToClaude); without it requests queue
 * @tokens    --panel --rule --accent --accent-soft --ok --warn --sunk --ink --ink-2 --f-mono
 * @globals   htm-preact
 * @db        reads requests (or the configured collection); presence/claude-code / writes requests: {text, itemId, status, delivered, author, created}, then {delivered, why, sentAt} / note The Claude Code session writes state working with progress[{text}] on long work, and status done with response.
 * @source    Journey Whiteboard | app.js | sendToCode, answerArrived, reqState, REQ_STEPS, pollListen, ListenHint, ReqLine, QueueStrip, ReqList
 * @source    ADR Drafting Table | data.js | the same lane with ping and refresh states, which stay board code
 * @preview   {"render": "kit.claude-lane", "samples": ["kit/samples/kit.json#claude-lane"]}
 * @samples   claude-lane
 * @changed   0.1.3: the header asks a session for working on long work and done; no ack names or times.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const { html } = window.htmPreact;
const { now, clip, ago, sortEntries } = Kit.util;

Kit.claudeLane = Object.freeze({
  create({ store, db, chrome, collection = 'requests', presenceSlot = 'presence', presenceKey = 'claude-code', who = 'Claude Code',
    steps = ['queue', 'ack', 'pending', 'done'],
    hints = { queue: 'waiting for a Claude Code session to acknowledge it', ack: 'acknowledged: the work will show up here', pending: 'being worked on', done: 'answered' },
    workingState = 'working', ackStates = ['ack', 'seen'], doneStatus = 'done', recordField = 'itemId', textMax = 3000, words = {}, footer, onList, onAnswered }) {
    const { S, set, emit } = store;
    const { C, newId, put, upd, localSet, localPatch } = db;
    const { toast } = chrome;
    const W = {
      delivered: 'Delivered to Claude Code. Its progress shows under your request here.',
      queued: 'Queued on the board. No Claude Code session is listening right now; the next one that opens this board picks it up.',
      listening: 'A Claude Code session is listening',
      writersOnly: 'Only editors can send to Claude Code',
      checking: 'Checking for a Claude Code session…',
      none: 'No Claude Code session is listening: requests queue on the board',
      stuck: 'Delivered, not acknowledged yet: no session has taken it. It stays queued; nothing is lost.',
      ...words,
    };
    const [QUEUE, ACK, PENDING, DONE] = steps;
    const STEPS = steps, HINT = hints;

    async function sendRequest(text, anchorEl, recordId) {
      const rid = newId(collection);
      const doc = { text: clip(text, textMax), [recordField]: recordId || null, status: 'open', delivered: false, author: S.me, created: now() };
      localSet(collection, rid, doc); put(collection, rid, doc);
      let delivered = false, why = '';
      try {
        if (C.comments && C.comments.sendToClaude && C.comments.canSendToClaude) {
          const st = await C.comments.canSendToClaude();
          if (S.listen !== st) set({ listen: st });
          if (st === 'available' && anchorEl && anchorEl.isConnected) {
            const anchor = await C.comments.anchorFor(anchorEl);
            const tail = footer ? footer({ text, rid, recordId, anchor }) : `— request ${rid}`;
            await C.comments.sendToClaude({ anchor, text: `${clip(text, textMax)}\n\n${tail}` });
            delivered = true;
          } else why = st;
        } else why = 'off';
      } catch (e) { why = (e && e.code) || 'error'; }
      updateRequest(rid, { delivered, why, sentAt: now() });
      toast(delivered ? W.delivered : W.queued);
      return rid;
    }
    // The progress protocol, written on the request doc by the session:
    //   state "ack" as soon as any session has it; state "working" with progress[{text}] while it works;
    //   status "done" with response (and changed[]: the ids it touched). "seen" is read as "ack".
    function answerArrived(id, r) {
      S.answered = (S.answered || 0) + 1;
      toast(`${who} answered: ` + clip(r.response || r.text, 140), '', onAnswered ? onAnswered(id, r) : undefined);
    }
    function reqState(r) {
      if (r.status === doneStatus) return DONE;
      if (r.state === workingState) return PENDING;
      if (ackStates.includes(r.state)) return ACK;
      return QUEUE;
    }
    let listenTimer = 0;
    async function pollListen() {
      clearTimeout(listenTimer);
      try { if (C.comments && C.comments.canSendToClaude) { const st = await C.comments.canSendToClaude(); if (S.listen !== st) set({ listen: st }); } } catch (_) {}
      listenTimer = setTimeout(pollListen, 30000);
    }
    function updateRequest(id, data) { localPatch(collection, id, data); upd(collection, id, Kit.util.nul(data)); }

    // whether a session is listening right now, and when one was last seen
    function ListenHint() {
      const s = S, ms = t => typeof t === 'number' ? t : Date.parse(t) || 0;      // adp.py requests writes presence/<--by> with an ISO at
      const all = s[presenceSlot] || {}, pr = all[presenceKey] || Object.values(all).sort((a, b) => ms(b.at) - ms(a.at))[0];
      const fresh = pr && pr.at && now() - ms(pr.at) < 5 * 60000;
      const on = s.listen === 'available';
      return html`<div class="listen ${on ? 'on' : ''}"><span class="dot ${on ? 'on' : 'off'}"></span>
        <span>${on ? W.listening : s.listen === 'writers_only' ? W.writersOnly : s.listen == null ? W.checking : W.none}${pr && pr.at ? html` · <span class="faint">${fresh ? 'busy with: ' + clip(pr.doing || 'something', 60) : 'last seen ' + ago(ms(pr.at))}</span>` : ''}</span></div>`;
    }
    // one request, with where it is in queued → delivered → picked up → working → answered
    function ReqLine({ id, r, compact }) {
      const st = reqState(r); const at = STEPS.indexOf(st);
      const last = (r.progress || []).slice(-1)[0];
      const stuck = st === QUEUE && r.delivered && r.sentAt && now() - r.sentAt > 3 * 60000;
      return html`<div class="req ${st}" key=${id}>
        <div class="req-steps" aria-label=${'Status: ' + st} title=${HINT[st]}>${STEPS.map((x, i) => html`<span class=${'rs ' + (i < at ? 'past' : i === at ? 'now' : '')} title=${x}></span>`)}<b>${st}</b>${r.ackBy && st !== QUEUE ? html`<span class="faint">by ${r.ackBy}</span>` : ''}${st === QUEUE ? html`<span class="faint">${r.delivered ? 'delivered' : 'not delivered yet'}</span>` : ''}<span class="faint" style="margin-left:auto">${ago(r.created || now())}</span></div>
        ${!compact && html`<div class="req-text">${clip(r.text, 200)}</div>`}
        ${st !== DONE && last ? html`<div class="req-prog"><span class="spin"></span> ${last.text}</div>` : ''}
        ${stuck ? html`<div class="faint" style="font-size:12px">${W.stuck}</div>` : ''}
        ${r.response ? html`<div class="req-resp"><b>${who + ':'}</b> ${r.response}</div>` : ''}
      </div>`;
    }
    // always-visible counts of requests in this scope
    function QueueStrip() {
      const s = S; const n = Object.fromEntries(STEPS.map(k => [k, 0]));
      for (const r of Object.values(s[collection])) n[reqState(r)]++;
      if (!Object.keys(s[collection]).length) return null;
      return html`<button type="button" class="qstrip" title=${'Requests to ' + who + ': open the list'} onClick=${() => onList && onList()}>
        ${STEPS.map(k => html`<span class=${'q q-' + k + (n[k] ? ' has' : '')}><b>${n[k]}</b> ${k}</span>`)}</button>`;
    }
    function ReqList({ recordId, max = 3 }) {
      const list = sortEntries(S[collection]).filter(([, r]) => r[recordField] === recordId).reverse().slice(0, max);
      if (!list.length) return null;
      return html`<div class="reqs">${list.map(([id, r]) => html`<${ReqLine} id=${id} r=${r}/>`)}</div>`;
    }
    return { sendRequest, answerArrived, reqState, updateRequest, pollListen, ListenHint, ReqLine, QueueStrip, ReqList, STEPS, HINT, isDone: r => r.status === doneStatus };
  },
});
})();
/* /part:page.script.kit.claude-lane */
