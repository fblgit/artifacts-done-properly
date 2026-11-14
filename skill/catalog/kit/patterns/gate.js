/* part:page.script.kit.gate */
/**
 * Approval gate
 * Kit.gate.mount(box, {gates, look, onVerdict}) draws a card per request: who asks, the action and the tool, a risk pill (low, medium, high) and an Irreversible mark when the change cannot be undone, a preview in which lines starting with + or - read as a diff with the mark in a gutter (not only a colour), the verdict so far and its buttons. Reject opens a reason box that the asker reads; an empty reason is refused with a line that says so, and a draft survives a redraw (kit.keep-state). A verdict can be withdrawn. A locked gate has no buttons and says why. A gate can carry a refusal (what was refused, for which field, what is allowed now). Four looks dress the same gate: plain, console (terminal header, monospaced preview), ticket (perforated edge and a tear-off stub that names the risk) and two-key (the buttons read Arm and Abort); only css changes, never the words or the keyboard path. onVerdict receives {state, reason}; a rejected promise puts the gate back. Risk and verdict words come from the vocabulary table.
 *
 * A request to allow an action, shown so the person can decide without opening anything else. It says who asks and for which action, how risky it is and whether it can be
 * undone, shows a preview of the change (lines that start with + or - read as a diff, with the mark in the line, not only a colour), and offers Approve, or Reject with a reason the
 * asker will read, or Withdraw once a verdict is in. A gate can be locked (the work already started), and can carry a refusal (what was refused, for which field, what is allowed now).
 * Four dressings of the same gate, switched by the look option or setLook(): plain (a card), console (a terminal header over a monospaced preview), ticket (a perforated edge with a
 * tear-off stub that names the risk) and two-key (the buttons read Arm and Abort and sit as two keys). The dressing is only css; the words, the order and the keyboard path do not change.
 * Risk and verdict words come from the vocabulary table (kit/vocab.js). This file adds the enums "gate-risk" and "gate-verdict" only when the page has not defined them.
 * A rejection needs a reason; an empty one is refused with a line that says so. A draft reason survives a redraw (kit.keep-state).
 *
 * API:
 *   Kit.gate.mount(box, opts) -> {update(gates), setLook(look), verdicts(), destroy()}
 *     gates      [{id, action, by, tool, risk: "low"|"medium"|"high", reversible, preview, verdict: null | {state: "approved"|"rejected", by, at, reason}, locked: false | "why", refusal: {code, field, allowed: [text], message}}]
 *     look       "plain" (default) | "console" | "ticket" | "two-key"        me  the name that reads as "you" (default "You")
 *     canWrite   false shows the verdict only, with no buttons (default true)
 *     onVerdict  (id, {state: "approved"|"rejected"|"withdrawn", reason}) => Promise|void; a rejected promise puts the gate back and says it was not saved
 *     timeZone   for the clock text (default: the viewer's)      now  ISO string or Date stamped on a verdict (default: the clock)
 * Methods of what Kit.gate.mount returns: update(gates), setLook(look), verdicts()
 *
 * @id        pattern.gate
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A request to allow an action: who asks and for what, its risk and reversibility, a preview of the change, then Approve, Reject with a reason the asker reads, or Withdraw.
 * @tags      approval, gate, permission, sign-off, risk, diff, reject, reason, ticket, console
 * @requires  kit.tokens, kit.vocab, kit.keep-state
 * @files     kit/patterns/gate.css, kit/samples/patterns.json
 * @provides  Kit.gate.mount, Kit.gate.looks
 * @config    Kit.gate.mount(box, opts) | gates [{id, action, by, tool, risk, reversible, preview, verdict {state, by, at, reason} | null, locked, refusal {code, field, allowed, message}}], look plain | console | ticket | two-key, me, canWrite, onVerdict(id, {state, reason}), now, timeZone; returns {update, setLook, verdicts, destroy}
 * @config    onVerdict | optional: where a board writes the verdict (for example to its tasks collection); the pattern keeps the verdict in memory either way
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono --ok --danger --warn --accent-ink? --log-bg? --log-ink? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's approval gate | risk, reversibility, the preview, approve, reject with a reason, withdraw
 * @source    Catalog harvest, 2026-10-25 | an earlier board's console, war-room and journal dressings | arm and abort, the two-key panel, the ticket with a tear-off stub, the preview as a diff
 * @source    Catalog harvest, 2026-10-25 | a component family's permission card and refusal callout | who asked and for which tool; code, field, what is allowed now and the message
 * @preview   {"render": "pattern.gate", "samples": ["kit/samples/patterns.json#gate"]}
 * @changed   One gate with four css dressings; the source had one rewrite of the markup per board.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DEFAULTS = {
  'gate-risk': {
    low: { word: 'Low risk', short: 'low', glyph: 'check', tone: 'success', motion: 'none' },
    medium: { word: 'Medium risk', short: 'medium', glyph: 'info', tone: 'attention', motion: 'none' },
    high: { word: 'High risk', short: 'high', glyph: 'stop', tone: 'danger', motion: 'none' },
  },
  'gate-verdict': {
    pending: { word: 'Needs your approval', short: 'pending', glyph: 'hand', tone: 'attention', motion: 'turn' },
    approved: { word: 'Approved', short: 'approved', glyph: 'check', tone: 'success', motion: 'none' },
    rejected: { word: 'Rejected', short: 'rejected', glyph: 'cross', tone: 'danger', motion: 'none' },
    locked: { word: 'Locked', short: 'locked', glyph: 'pause', tone: 'ended', motion: 'none' },
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(DEFAULTS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }
const LOOKS = ['plain', 'console', 'ticket', 'two-key'];

function mount(box, opts) {
  ensure();
  const o = Object.assign({ gates: [], look: 'plain', me: 'You', canWrite: true }, opts);
  let gates = o.gates.map(g => Object.assign({}, g)), look = LOOKS.includes(o.look) ? o.look : 'plain';
  const rejecting = new Set(), errors = new Map();
  const stamp = () => o.now ? new Date(o.now).toISOString() : new Date().toISOString();
  const fmt = iso => { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }); } catch (_) { return String(iso); } };
  box.classList.add('kit-gt'); box.replaceChildren(); box.dataset.look = look;
  const live = el('p', 'kit-gt-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  const list = el('div', 'kit-gt-list'); box.append(live, list);

  function diff(text) {
    const pre = el('pre', 'kit-gt-pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', 'Preview of the change');
    String(text).split('\n').forEach(l => {
      const k = l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : 'ctx';
      const row = el('span', 'kit-gt-ln'); row.dataset.k = k; row.append(el('i', null, k === 'add' ? '+' : k === 'del' ? '−' : k === 'hunk' ? '@' : ' '), el('span', null, k === 'add' || k === 'del' ? l.slice(1) : l)); pre.append(row);
    });
    return pre;
  }
  function stateOf(g) { return g.verdict ? g.verdict.state : g.locked ? 'locked' : 'pending'; }
  function gateEl(g) {
    const st = stateOf(g), row = V().get('gate-verdict', st), risk = ['low', 'medium', 'high'].includes(g.risk) ? g.risk : 'medium';
    const art = el('article', 'kit-gt-gate'); art.dataset.risk = risk; art.dataset.state = st; art.setAttribute('data-vo-tone', row ? row.tone : 'neutral'); art.setAttribute('aria-label', 'Approval gate: ' + g.action);
    const stub = el('div', 'kit-gt-stub'); stub.setAttribute('aria-hidden', 'true'); stub.append(el('b', null, risk), el('span', null, g.reversible === false ? 'no way back' : 'can be undone'));
    const main = el('div', 'kit-gt-main');
    const head = el('header', 'kit-gt-head'); head.append(el('b', 'kit-gt-title', 'Approval gate'));
    const rp = V().pill('gate-risk', risk, { unknown: 'flag' }); if (rp) head.append(rp);
    if (g.reversible === false) { const c = el('span', 'kit-gt-irr'); c.append(V().glyph('stop'), document.createTextNode('Cannot be undone')); head.append(c); }
    main.append(head);
    const who = el('p', 'kit-gt-who'); if (g.by) who.append(el('b', null, g.by), document.createTextNode(' asks to ')); who.append(el('span', 'kit-gt-act', g.action)); if (g.tool) { who.append(document.createTextNode(' using '), el('code', null, g.tool)); } main.append(who);
    if (g.refusal) {
      const r = g.refusal, rf = el('div', 'kit-gt-ref'); rf.setAttribute('role', 'alert');
      const h = el('p', 'kit-gt-refh'); h.append(el('b', null, 'Refused'), el('span', null, r.word || r.code || '')); if (r.field) h.append(el('code', null, r.field)); rf.append(h);
      if (r.allowed && r.allowed.length) { const a = el('p', 'kit-gt-refa'); a.append(el('span', 'kit-gt-k', 'Allowed now')); r.allowed.forEach(x => a.append(el('code', null, x))); rf.append(a); }
      if (r.message) rf.append(el('p', 'kit-gt-refm', r.message)); main.append(rf);
    }
    if (g.preview) {
      const w = el('div', 'kit-gt-prev'); w.append(el('div', 'kit-gt-term', 'Preview · exactly this runs'), diff(g.preview)); main.append(w);
    }
    const vd = el('div', 'kit-gt-verdict'); const vp = V().pill('gate-verdict', st, { unknown: 'flag' }); if (vp) vd.append(vp);
    if (g.verdict) {
      const by = g.verdict.by === o.me ? 'you' : g.verdict.by; vd.append(el('span', 'kit-gt-vwho', 'by ' + (by || 'someone')));
      if (g.verdict.at) { const t = el('time', null, fmt(g.verdict.at)); t.dateTime = g.verdict.at; vd.append(t); }
    }
    if (g.locked) { if (g.verdict) { const lp = V().pill('gate-verdict', 'locked', { unknown: 'flag' }); if (lp) vd.append(lp); } vd.append(el('span', 'kit-gt-vwho', typeof g.locked === 'string' ? g.locked : 'The work has already started.')); }
    main.append(vd);
    if (g.verdict && g.verdict.state === 'rejected' && g.verdict.reason) { const rs = el('p', 'kit-gt-reason'); rs.append(el('b', null, 'Reason' + (g.by ? ' sent to ' + g.by : '') + ': '), document.createTextNode(g.verdict.reason)); main.append(rs); }
    if (o.canWrite && !g.locked) main.append(controls(g, st));
    art.append(main, stub); return art;
  }
  function btn(text, cls, fn, aria) { const b = el('button', 'kit-gt-btn ' + cls, text); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', fn); return b; }
  function controls(g, st) {
    const c = el('div', 'kit-gt-ctl'), two = look === 'two-key';
    if (rejecting.has(g.id)) {
      const id = 'kit-gt-why-' + g.id; const f = el('div', 'kit-gt-why'); const lab = el('label', null, 'Why reject? ' + (g.by || 'The asker') + ' reads this'); lab.htmlFor = id;
      const ta = el('textarea'); ta.id = id; ta.rows = 2; ta.maxLength = 600; ta.setAttribute('data-keep', id);
      if (errors.has(g.id)) { ta.setAttribute('aria-invalid', 'true'); }
      const row = el('div', 'kit-gt-row');
      row.append(btn('Confirm reject', 'rej', () => { const t = ta.value.trim(); if (!t) { errors.set(g.id, 'Write the reason first. It is sent to the asker.'); redraw(); const n = list.querySelector('#' + id); if (n) n.focus(); return; } rejecting.delete(g.id); errors.delete(g.id); verdict(g, { state: 'rejected', reason: t }); }),
        btn('Cancel', 'ghost', () => { rejecting.delete(g.id); errors.delete(g.id); redraw(); }));
      f.append(lab, ta); if (errors.has(g.id)) f.append(el('p', 'kit-gt-err', errors.get(g.id))); f.append(row); c.append(f); return c;
    }
    if (g.verdict) { c.append(btn('Withdraw my ' + (g.verdict.state === 'approved' ? 'approval' : 'rejection'), 'ghost', () => verdict(g, { state: 'withdrawn' }))); return c; }
    c.append(btn(two ? 'Arm' : 'Approve', 'ok', () => verdict(g, { state: 'approved' }), two ? 'Arm: approve ' + g.action : null),
      btn(two ? 'Abort' : 'Reject…', 'rej', () => { rejecting.add(g.id); redraw(); const n = list.querySelector('#kit-gt-why-' + g.id); if (n) n.focus(); }, two ? 'Abort: reject ' + g.action : null));
    return c;
  }
  function verdict(g, v) {
    const prev = g.verdict;
    g.verdict = v.state === 'withdrawn' ? null : { state: v.state, by: o.me, at: stamp(), reason: v.reason };
    live.textContent = (v.state === 'approved' ? 'Approved: ' : v.state === 'rejected' ? 'Rejected: ' : 'Verdict withdrawn: ') + g.action; redraw();
    if (o.onVerdict) Promise.resolve().then(() => o.onVerdict(g.id, { state: v.state, reason: v.reason })).catch(() => { g.verdict = prev; live.textContent = 'Not saved. The gate is back as it was.'; redraw(); });
  }
  function draw() {
    list.textContent = '';
    if (!gates.length) { list.append(el('p', 'kit-gt-empty', 'Nothing waits for approval. A request to allow an action shows up here with its risk and a preview.')); return; }
    gates.forEach(g => list.append(gateEl(g)));
  }
  const redraw = Kit.keepState && Kit.keepState.wrap ? Kit.keepState.wrap(box, draw) : draw;
  redraw();
  return {
    update(gs) { gates = gs.map(g => Object.assign({}, g)); redraw(); },
    setLook(l) { if (!LOOKS.includes(l)) return; look = l; box.dataset.look = l; redraw(); },
    verdicts: () => gates.map(g => ({ id: g.id, verdict: g.verdict })),
    destroy() { box.replaceChildren(); box.classList.remove('kit-gt'); delete box.dataset.look; },
  };
}
Kit.gate = Object.freeze({ mount, looks: LOOKS.slice() });
})();
/* /part:page.script.kit.gate */
