/* part:page.script.kit.job-tray */
/**
 * Jobs tray
 * Kit.jobTray.mount(root, {adapter}) draws a tray whose head is a sentence ("1 job running, 1 waiting for you") over a pile of small state beads, and opens upward into capsules. A capsule has a state bead and word, the time it has run, a progress wave while it runs, the last log line, small pills for what it holds, and a log that follows the end unless the reader scrolled up. A job that waits for the person goes first in its own colour with a hollow ring that turns slowly, and opens the tray. A quiet job says how long it has been quiet and that it is still working. A finished job gets Continue, Try again, its own actions and Dismiss. The transport is an adapter ({start, poll(id, since), resume}), so a board brings its own server; a job that the service no longer knows is marked lost. Options: one job at a time, a corner dock, a tab-title prefix. Timers stop while the page is hidden and the wave and ring stop under reduced motion. The state beads and tones come from the vocabulary.
 *
 * Work in progress as capsules in a tray. The head says it in one sentence ("1 job running, 1 waiting for you") over a pile of small state beads, and opens upward into the capsules.
 * A capsule is a job: its state bead and word, how long it has run, a progress wave while it runs, the last log line, small pills for what it holds, and a log that follows the end unless the
 * person scrolled up. A job that waits for the person goes to the top in its own colour with a hollow ring that turns slowly, and opens the tray; it is never buried. A job that stays quiet for
 * 8 s says "no new output for 8 s, still working". A finished job gets its buttons (Continue, Try again, the job's own actions, Dismiss). The tab title takes a prefix while a job waits or runs.
 * The transport is an adapter, so a board brings its own server (or a scripted one, as the preview does). Timers stop while the page is hidden.
 *
 * API (small and stable):
 *   Kit.jobTray.mount(root, {adapter, single, label, dock, titlePrefix, quietAfter, pollMs, enum, states, words, actions, onContinue, onEvent, open, emptyText}) -> tray
 *     adapter     {start(kind, params) -> Promise<view>, poll(id, since) -> Promise<view | null>, resume?() -> Promise<[view]>}
 *                 a poll that rejects with {lost: true} or returns null marks the job lost
 *     view        {id, title, kind, status, banner, log, next, startedAt, endedAt, now, leases, result}
 *                   status   running | paused | done | failed        (a running job with a banner is waiting for you; paused is a job that ended waiting for you)
 *                   banner   what a running job waits on (text)     log   [line] new since the last poll; a line is a string or {text, tone: ok | bad | wait | dim}
 *                   next     the cursor to poll with next            startedAt, endedAt, now   milliseconds; now (the server clock) corrects clock skew
 *                   leases   [string]  what it holds, drawn as pills result  {waiting: text, actions: [{label, primary, kind, params}]}
 *     single      true: one job at a time; starting another is refused with a sentence and a "Show job" button (default false)
 *     dock        "inline" (default; the board places the root) | "corner" (fixed to the bottom right of the viewport; full width under 480px)
 *     titlePrefix true (default) sets "Waiting for you: " / "Running: " / "Done: " / "Failed: " on document.title
 *     enum, states  the Kit.vocab enum of the beads (default "state") and the map {running, waiting, paused, done, failed, lost} to its values
 *     words       overrides for the state words        actions  (job) -> [{label, primary, danger, run(job)}] added to a finished job
 *     onContinue  (job) for the Continue button; the default starts the same kind again with the params it reported
 *     onEvent     (name, job) for started | update | finished
 *   tray.start(kind, params, {title}) -> Promise<job>   resolves when the job ends; null when refused
 *   tray.attach(view) / tray.reveal(id) / tray.open(bool) / tray.jobs() / tray.clearDone() / tray.destroy() / tray.el
 *
 * CSS classes: .kit-jt .kit-jt-job .kit-jt-wait .kit-jt-wave
 *
 * @id        pattern.job-tray
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Work in progress as capsules in a tray: running, waiting for you, done, failed; the log follows the end, waiting jobs come first, and the head says it in a sentence.
 * @tags      jobs, tray, progress, log, capsule, waiting for you, queue, status
 * @requires  kit.vocab, kit.glaze-surfaces
 * @provides  Kit.jobTray.mount
 * @config    Kit.jobTray.mount(root, {adapter, single, dock, label, titlePrefix, quietAfter, pollMs, enum, states, words, actions, onContinue, onEvent}) | adapter {start(kind, params) -> view, poll(id, since) -> view | null, resume?()}; view {id, title, kind, status: running | paused | done | failed, banner, log, next, startedAt, endedAt, now, leases, result}
 * @config    Kit.vocab | beads come from a vocabulary enum (default "state": running, waiting, done, failed, ended); load kit/vocab.js and kit/vocab.css first
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --ink-3 --rule-2 --ok --warn --danger --f-mono --log-bg? --log-ink? --shadow? --rim? --pool? --seam?
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;
const WORDS = { running: 'Running', waiting: 'Waiting for you', paused: 'Stopped, waiting for you', done: 'Done', failed: 'Failed', lost: 'Lost track of it' };
const STATES = { running: 'running', waiting: 'waiting', paused: 'waiting', done: 'done', failed: 'failed', lost: 'ended' };
const TONE = { running: 'active', waiting: 'attention', paused: 'attention', done: 'success', failed: 'danger', lost: 'ended' };
const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + ' s'; if (s < 3600) return Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; return Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min'; };
const reduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function mount(root, opts) {
  const o = Object.assign({ adapter: null, single: false, label: 'Jobs', dock: 'inline', titlePrefix: true, quietAfter: 8, pollMs: 1000, enum: 'state', states: {}, words: {}, actions: null, onContinue: null, onEvent: null, open: false,
    emptyText: 'Nothing has run yet. A job you start shows here, with its log.' }, opts);
  const A = o.adapter, S = Object.assign({}, STATES, o.states), W = Object.assign({}, WORDS, o.words);
  const id = 'kit-jt-' + (++uid), jobs = new Map(); const baseTitle = document.title; let ticker = null, hidden = !!document.hidden, destroyed = false;
  root.classList.add('kit-jt'); if (o.dock === 'corner') root.classList.add('kit-jt-corner'); root.setAttribute('data-tray', ''); root.setAttribute('role', 'region'); root.setAttribute('aria-label', o.label); root.replaceChildren();
  const pile = el('span', 'kit-jt-pile'); pile.setAttribute('aria-hidden', 'true');
  const sum = el('span', 'kit-jt-sum'); sum.setAttribute('aria-live', 'polite');
  const chev = el('span', 'kit-jt-chev'); chev.setAttribute('aria-hidden', 'true');
  const head = el('button', 'kit-jt-head'); head.type = 'button'; head.setAttribute('aria-expanded', 'false'); head.setAttribute('aria-controls', id + '-b');
  head.append(pile, sum, chev); head.addEventListener('click', () => setOpen(!root.classList.contains('kit-jt-open')));
  const notice = el('div', 'kit-jt-notice'); notice.hidden = true; notice.setAttribute('role', 'status');
  const list = el('div', 'kit-jt-list'); const empty = el('p', 'kit-jt-empty', o.emptyText);
  const clear = el('button', 'kit-btn kit-ghost kit-sm', 'Clear done'); clear.type = 'button'; clear.addEventListener('click', () => clearDone());
  const foot = el('div', 'kit-jt-foot'); foot.append(el('span', 'kit-jt-rule', o.single ? 'One job at a time' : ''), clear);
  const body = el('div', 'kit-jt-body'); body.id = id + '-b'; body.append(notice, list, empty, foot);
  root.append(head, body);

  const V = () => window.Kit && window.Kit.vocab;
  const bead = (state, size) => { const v = V(); const n = v && v.orb(o.enum, S[state], { size, label: W[state], unknown: 'skip' }); if (n) return n; const f = el('span', 'kit-orb kit-md'); return f; };
  function setOpen(on) { root.classList.toggle('kit-jt-open', !!on); head.setAttribute('aria-expanded', String(!!on)); }
  const stateOf = v => v.status === 'running' ? (v.banner ? 'waiting' : 'running') : v.status === 'paused' ? 'paused' : v.status === 'done' ? 'done' : v.status === 'failed' ? 'failed' : 'lost';
  const now = rec => Date.now() + (rec.skew || 0);
  const emit = (name, rec) => { if (o.onEvent) { try { o.onEvent(name, pub(rec)); } catch (e) { /* the board's handler */ } } };
  const pub = rec => ({ id: rec.id, title: rec.view.title, kind: rec.view.kind, status: stateOf(rec.view), result: rec.view.result, lines: rec.lines.length });

  function build(rec) {
    const v = rec.view, lid = id + '-' + rec.id + '-log', ui = rec.ui = {};
    ui.bead = el('span', 'kit-jt-bead'); ui.title = el('div', 'kit-jt-t', v.title || v.kind || 'Job'); ui.state = el('div', 'kit-jt-s'); ui.time = el('span', 'kit-jt-time');
    ui.toggle = el('button', 'kit-jt-tg'); ui.toggle.type = 'button'; ui.toggle.setAttribute('aria-expanded', 'false'); ui.toggle.setAttribute('aria-controls', lid); ui.toggle.setAttribute('aria-label', 'Show the log'); ui.toggle.title = 'Show the log';
    ui.toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'; ui.toggle.addEventListener('click', () => setLog(rec, ui.log.hidden));
    ui.waitT = el('p', 'kit-jt-wt'); ui.wait = el('div', 'kit-jt-wait'); ui.wait.setAttribute('role', 'status'); ui.wait.hidden = true; const ring = el('span', 'kit-jt-ring'); ring.setAttribute('aria-hidden', 'true'); ui.wait.append(ring, ui.waitT);
    ui.wave = el('div', 'kit-jt-wave'); ui.wave.setAttribute('aria-hidden', 'true'); ui.wave.append(el('i'));
    ui.last = el('div', 'kit-jt-last'); ui.last.setAttribute('aria-hidden', 'true'); ui.meta = el('div', 'kit-jt-meta'); ui.meta.hidden = true;
    ui.log = el('pre', 'kit-jt-log'); ui.log.id = lid; ui.log.hidden = true; ui.log.tabIndex = 0; ui.log.setAttribute('aria-label', 'Log of ' + (v.title || 'the job'));
    ui.actions = el('div', 'kit-jt-acts'); ui.actions.hidden = true;
    const top = el('div', 'kit-jt-top'); const mid = el('div', 'kit-jt-mid'); mid.append(ui.title, ui.state); top.append(ui.bead, mid, ui.time, ui.toggle);
    ui.el = el('article', 'kit-jt-job'); ui.el.setAttribute('aria-label', v.title || 'Job'); ui.el.append(top, ui.wait, ui.wave, ui.last, ui.meta, ui.log, ui.actions);
  }
  function setLog(rec, show) {
    const ui = rec.ui; ui.log.hidden = !show; ui.toggle.setAttribute('aria-expanded', String(show));
    const l = show ? 'Hide the log' : 'Show the log'; ui.toggle.setAttribute('aria-label', l); ui.toggle.title = l; ui.el.classList.toggle('kit-jt-logopen', show);
    if (show) ui.log.scrollTop = ui.log.scrollHeight;
  }
  function appendLog(rec, lines) {
    const pre = rec.ui.log, stick = pre.hidden || pre.scrollHeight - pre.scrollTop - pre.clientHeight < 32, frag = document.createDocumentFragment();
    lines.forEach(l => { const t = typeof l === 'string' ? { text: l } : l; const s = el('span', t.tone ? 'kit-jt-l-' + t.tone : '', t.text + '\n'); frag.append(s); });
    pre.append(frag); if (stick) pre.scrollTop = pre.scrollHeight;
  }
  function render(rec) {
    const v = rec.view, ui = rec.ui, st = stateOf(v);
    ui.el.dataset.state = st; ui.el.setAttribute('data-vo-tone', TONE[st]);
    if (ui.stKey !== st) { ui.stKey = st; const b = bead(st, 'lg'); ui.bead.replaceChildren(b); }
    const t = now(rec), end = v.endedAt || t;
    ui.time.textContent = st === 'lost' ? '' : fmt((st === 'running' || st === 'waiting' ? t : end) - (v.startedAt || t));
    let s = W[st];
    if (st === 'running' && rec.fails > 2) s = 'No answer from the service, trying again';
    else if (st === 'running' && Date.now() - rec.lastOut > o.quietAfter * 1000) s += ', no new output for ' + fmt(Date.now() - rec.lastOut) + ', still working';
    if (ui.state.textContent !== s) ui.state.textContent = s;
    const wt = st === 'waiting' ? v.banner : st === 'paused' ? ((v.result || {}).waiting || 'This job needs you before it can go on.') : '';
    ui.wait.hidden = !wt; if (ui.waitT.textContent !== wt) ui.waitT.textContent = wt;
    ui.wave.hidden = st !== 'running' && st !== 'waiting';
    const last = st === 'running' ? (rec.last || 'Starting') : ''; ui.last.hidden = !last; if (ui.last.textContent !== last) ui.last.textContent = last;
    ui.toggle.hidden = !rec.lines.length && st !== 'running';
    const leases = Array.isArray(v.leases) ? v.leases : []; ui.meta.hidden = !leases.length;
    if (leases.length && ui.meta.childElementCount !== leases.length) ui.meta.replaceChildren(...leases.map(l => { const p = el('span', 'kit-jt-lease', String(l)); return p; }));
    if (rec.done && !ui.actionsBuilt) { ui.actionsBuilt = true; buildActions(rec); }
    summarize();
  }
  function actionsFor(rec) {
    const v = rec.view, r = v.result || {}, st = stateOf(v), out = [];
    if (st === 'paused') out.push({ label: 'Continue', primary: true, run: () => cont(rec) });
    if (st === 'failed') out.push({ label: 'Try again', primary: true, run: () => retry(rec) });
    (r.actions || []).forEach(a => { if (a && a.label && a.kind) out.push({ label: a.label, primary: !!a.primary, run: () => start(a.kind, a.params || {}, { title: a.label }) }); });
    if (typeof o.actions === 'function') { try { out.push(...(o.actions(pub(rec)) || [])); } catch (e) { /* the board's list */ } }
    return out;
  }
  function buildActions(rec) {
    const ui = rec.ui, btns = actionsFor(rec).map(a => { const b = el('button', 'kit-btn kit-sm' + (a.primary ? ' kit-primary' : a.danger ? ' kit-danger' : ''), a.label); b.type = 'button';
      b.addEventListener('click', () => { try { a.run(pub(rec)); } catch (e) { /* the board's action */ } }); return b; });
    const dm = el('button', 'kit-btn kit-ghost kit-sm kit-jt-dismiss', 'Dismiss'); dm.type = 'button'; dm.addEventListener('click', () => drop(rec));
    ui.actions.replaceChildren(...btns, dm); ui.actions.hidden = false;
  }
  const cont = rec => { if (o.onContinue) return o.onContinue(pub(rec)); const r = rec.view.result || {}; return start(rec.view.kind, Object.assign({}, rec.origin.params, r.params), { title: rec.view.title }); };
  const retry = rec => start(rec.view.kind || rec.origin.kind, rec.origin.params, { title: rec.view.title });
  function drop(rec) { if (!rec.done) return; rec.ui.el.remove(); jobs.delete(rec.id); summarize(); }
  function clearDone() { [...jobs.values()].forEach(r => { if (r.done && stateOf(r.view) !== 'paused') drop(r); }); }

  function attach(view, origin) {
    let rec = jobs.get(view.id); if (rec) return rec;
    rec = { id: view.id, view: Object.assign({}, view, { log: undefined }), origin: origin || {}, since: view.next || 0, lines: [], last: '', skew: view.now ? view.now - Date.now() : 0, lastOut: Date.now(), fails: 0, done: false, busy: false };
    rec.promise = new Promise(res => { rec.resolve = res; }); build(rec); jobs.set(rec.id, rec); list.prepend(rec.ui.el);
    if (view.log && view.log.length) ingest(rec, view.log);
    if (stateOf(rec.view) === 'lost' || rec.view.status === 'done' || rec.view.status === 'failed' || rec.view.status === 'paused') { render(rec); finish(rec); return rec; }
    render(rec); schedule(rec); tick(); return rec;
  }
  function ingest(rec, lines) {
    rec.lines.push(...lines); appendLog(rec, lines); const l = lines[lines.length - 1]; rec.last = typeof l === 'string' ? l : (l && l.text) || ''; rec.lastOut = Date.now();
  }
  function schedule(rec) { clearInterval(rec.timer); if (rec.done || hidden) return; rec.timer = setInterval(() => poll(rec), o.pollMs); }
  async function poll(rec) {
    if (rec.busy || rec.done) return; rec.busy = true;
    try {
      const v = await A.poll(rec.id, rec.since);
      if (!v) { rec.view = Object.assign({}, rec.view, { status: 'lost' }); rec.lost = true; return finish(rec); }
      update(rec, v);
    } catch (e) {
      if (e && e.lost) { rec.view = Object.assign({}, rec.view, { status: 'lost' }); rec.lost = true; finish(rec); } else { rec.fails += 1; render(rec); }
    } finally { rec.busy = false; }
  }
  function update(rec, v) {
    if (destroyed) return;
    const before = rec.view, lines = v.log || [], changed = lines.length > 0 || v.banner !== before.banner || v.status !== before.status;
    rec.fails = 0; if (v.next != null) rec.since = v.next; if (v.now) rec.skew = v.now - Date.now();
    if (lines.length) ingest(rec, lines);
    rec.view = Object.assign({}, before, v, { log: undefined });
    if (v.banner && !before.banner) setOpen(true);
    render(rec);
    if (v.status !== 'running') finish(rec); else if (changed) emit('update', rec);
  }
  function finish(rec) {
    if (rec.done) return; rec.done = true; clearInterval(rec.timer);
    const v = rec.view, st = stateOf(v);
    if (st !== 'lost') {
      const secs = fmt((v.endedAt || now(rec)) - (v.startedAt || now(rec)));
      const fin = { done: { text: 'Finished, ' + secs, tone: 'ok' }, failed: { text: 'Failed after ' + secs, tone: 'bad' }, paused: { text: 'Waiting for you, after ' + secs, tone: 'wait' } }[st];
      if (fin) appendLog(rec, [fin]);
    }
    if (st === 'failed') setLog(rec, true);
    render(rec);
    if (st === 'paused' || st === 'failed') setOpen(true);
    emit('finished', rec); rec.resolve(pub(rec)); tick();
  }

  function summarize() {
    const recs = [...jobs.values()], n = { run: 0, wait: 0, failed: 0, done: 0 };
    recs.forEach(r => { const s = stateOf(r.view); if (s === 'running') n.run++; else if (s === 'waiting' || s === 'paused') n.wait++; else if (s === 'failed') n.failed++; else if (s === 'done') n.done++; });
    const jb = k => k === 1 ? '1 job' : k + ' jobs'; let text;
    if (n.run && n.wait) text = n.run + ' running, ' + n.wait + ' waiting for you';
    else if (n.wait) text = jb(n.wait) + ' waiting for you'; else if (n.run) text = jb(n.run) + ' running';
    else if (n.failed) text = n.failed === 1 ? '1 job failed' : n.failed + ' jobs failed'; else if (n.done) text = n.done === 1 ? '1 job done' : n.done + ' jobs done'; else text = 'No jobs';
    if (sum.textContent !== text) sum.textContent = text;
    head.setAttribute('data-vo-tone', n.wait ? 'attention' : n.run ? 'active' : n.failed ? 'danger' : n.done ? 'success' : 'neutral');
    const key = recs.slice(-6).map(r => stateOf(r.view)).join(',');
    if (pile.dataset.key !== key) { pile.dataset.key = key; pile.replaceChildren(...recs.slice(-6).reverse().map(r => bead(stateOf(r.view), 'sm'))); if (!recs.length) pile.replaceChildren(bead('lost', 'sm')); }
    empty.hidden = recs.length > 0; clear.disabled = !recs.some(r => r.done && stateOf(r.view) !== 'paused');
    root.classList.toggle('kit-jt-idle', recs.length === 0);
    if (o.titlePrefix) {
      const fresh = recs.filter(r => r.done && !r.origin.resumed).pop(), fs = fresh && stateOf(fresh.view);
      const pre = n.wait ? 'Waiting for you: ' : n.run ? 'Running: ' : fs === 'done' ? 'Done: ' : fs === 'failed' ? 'Failed: ' : '';
      if (document.title !== pre + baseTitle) document.title = pre + baseTitle;
    }
  }
  function tick() {
    const any = [...jobs.values()].some(r => !r.done);
    if (any && !ticker && !hidden) ticker = setInterval(() => { jobs.forEach(r => { if (!r.done) render(r); }); }, 1000);
    if ((!any || hidden) && ticker) { clearInterval(ticker); ticker = null; }
  }
  function onVis() {
    hidden = !!document.hidden;
    jobs.forEach(r => { if (!r.done) { if (hidden) clearInterval(r.timer); else { schedule(r); poll(r); } } }); tick();
  }
  document.addEventListener('visibilitychange', onVis);

  async function start(kind, params, so) {
    if (destroyed) return null;
    if (o.single) {
      const run = [...jobs.values()].find(r => !r.done);
      if (run) {
        notice.replaceChildren(el('span', null, ((so && so.title) ? so.title + ' did not start. ' : '') + run.view.title + ' is still running, and one job runs at a time. Start it again when that one ends.'));
        const sh = el('button', 'kit-btn kit-sm', 'Show job'); sh.type = 'button'; sh.addEventListener('click', () => { notice.hidden = true; reveal(run.id); }); notice.append(sh); notice.hidden = false; setOpen(true); return null;
      }
    }
    notice.hidden = true;
    let v; try { v = await A.start(kind, params || {}); } catch (e) { notice.replaceChildren(el('span', null, ((so && so.title) || 'The job') + ' did not start: ' + (e && e.message || 'no answer') + '.')); notice.hidden = false; setOpen(true); return null; }
    if (so && so.title && !v.title) v = Object.assign({}, v, { title: so.title });
    const rec = attach(v, { kind, params: params || {} }); setOpen(true); emit('started', rec); return rec.promise;
  }
  function reveal(jid) {
    const rec = jobs.get(jid); if (!rec) return; setOpen(true);
    rec.ui.el.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    rec.ui.el.classList.remove('kit-jt-flash'); void rec.ui.el.offsetWidth; rec.ui.el.classList.add('kit-jt-flash');
  }
  summarize(); setOpen(o.open);
  if (A && A.resume) A.resume().then(vs => (vs || []).forEach(v => attach(v, { resumed: true }))).catch(() => {});
  return {
    el: root, start, attach: v => attach(v, {}), reveal, open: setOpen, clearDone,
    jobs: () => [...jobs.values()].map(pub),
    destroy() {
      destroyed = true; document.removeEventListener('visibilitychange', onVis); clearInterval(ticker); jobs.forEach(r => clearInterval(r.timer)); jobs.clear();
      if (o.titlePrefix) document.title = baseTitle; root.replaceChildren(); root.classList.remove('kit-jt', 'kit-jt-open', 'kit-jt-corner', 'kit-jt-idle'); root.removeAttribute('data-tray');
    },
  };
}
Kit.jobTray = Object.freeze({ mount });
})();
/* /part:page.script.kit.job-tray */
