/* part:page.script.kit.claude-lane */
/* Kit component: Claude lane (Kit.claudeLane)    kit version 0.1.1
   What it is: sends a request to the Claude Code session that has the artifact open (comments.sendToClaude, anchored to an element), with a queued
   fallback when nobody listens (the request doc stays on the board and the next session picks it up); the request lifecycle
   (queue, ack, pending, done) read off the doc; the listener check (polled every 30 s); and the UI: ListenHint, ReqLine (one request card),
   ReqList (requests about one record), QueueStrip (counts per step).
   Needs from the board:
     config  Kit.claudeLane.create({store, db, chrome, collection, presenceSlot, presenceKey, who, steps, hints, workingState, ackStates, doneStatus,
                                    recordField, textMax, words, footer, onList, onAnswered})
               collection     db collection of requests (default "requests"); the state slot has the same name
               presenceSlot   state slot of presence docs (default "presence"); presenceKey the doc id the Claude session keeps fresh (default "claude-code")
               who            display name of the session (default "Claude Code")
               steps          ordered step names (default ["queue","ack","pending","done"]); hints {step: text}; css classes derive from the step names
               workingState   request.state value that means "being worked on" (default "working"), ackStates values that mean acknowledged (default ["ack","seen"]), doneStatus request.status value for answered (default "done")
               recordField    field on the request that names the record it is about (default "itemId")
               textMax        clip for the request text (default 3000)
               words          {delivered, queued, listening, writersOnly, checking, none, stuck} texts
               footer(ctx)    hook (function): text appended to the delivered message; ctx {text, rid, recordId, anchor}; default "— request <rid>"
               onList()       hook: what the QueueStrip click does (open the board's list of requests)
               onAnswered(id, request)  hook returning a toast action {label, fn} when a request turns done (optional)
     state   S.listen (null | "available" | other), S.answered (count), S.<collection>, S.<presenceSlot>
     css     kit/claude-lane.css; custom properties --rule --panel --accent --accent-soft --ok --warn --sunk --ink --ink-2 --danger; classes .faint and .dot from kit/chrome.css
     caps    C.comments (comments capability, full form): canSendToClaude, anchorFor, sendToClaude. Without it requests queue.
   Request doc written: {text, <recordField>, status: "open", delivered, author, created}; then {delivered, why, sentAt}. The session writes back
   state "ack" + ackBy, state "working" + progress[{at,text}], status "done" + response.
   db collections: writes and reads <collection>; reads <presenceSlot>/<presenceKey> through the board's subscription.
   Lifted from: Journey Whiteboard app.js (sendToCode, answerArrived, reqState, REQ_STEPS, pollListen, ListenHint, ReqLine, QueueStrip, ReqList); the ADR Drafting Table's data.js has the same lane with more states (ping, refresh) that stay board code. */
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
    //   state "ack" (+ ackBy, ackAt) as soon as any session has it; state "working" with progress[{at, text}] while it works;
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
      const s = S;
      const pr = s[presenceSlot][presenceKey];
      const fresh = pr && pr.at && now() - pr.at < 5 * 60000;
      const on = s.listen === 'available';
      return html`<div class="listen ${on ? 'on' : ''}"><span class="dot ${on ? 'on' : 'off'}"></span>
        <span>${on ? W.listening : s.listen === 'writers_only' ? W.writersOnly : s.listen == null ? W.checking : W.none}${pr && pr.at ? html` · <span class="faint">${fresh ? 'busy with: ' + clip(pr.doing || 'something', 60) : 'last seen ' + ago(pr.at)}</span>` : ''}</span></div>`;
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
