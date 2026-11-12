/* part:page.script.kit.confirm-sheet */
/* Kit pattern: confirm sheet by risk (Kit.confirm)    kit version 0.1.0
   What it is: a dialog for a change that has consequences. It tells the plan in order with each step's before and after, what the change needs and what it holds while it runs, and how to undo it.
   The risk sets the tone, the words and the weight: routine, consequential, destructive (a typed word seals it), bulk (many items folded into one line). A change that needs hands (a PIN, a touch on
   a hardware key) goes on to a waiting step in the same sheet. When the change starts, the sheet can fly into a tray. A failed or finished change has a result sheet. Kit.chrome's openModal is the
   form dialog; this is the risk workflow, so both stay.
   API (small and stable):
     Kit.confirm.open(spec) -> Promise<{confirmed, typed?, pin?}>   one sheet at a time; opening another resolves the first as not confirmed
       spec   kind        routine | consequential | destructive | bulk (or a key you added with define); default routine
              title, lede strings        kicker (overrides the kind's)        tone  ok | warn | bad | info | wait (overrides the kind's)
              steps       [{label, from, to, why, mono}]   what will change, in order; from and to draw as a before chip, an arrow and an after chip
              bulk        {label, items: [{name, from, to, tone}]}   one folded line ("12 recipes retire") that opens to the list
              needs       [{kind, label, detail, missing}]   what it takes; kind is a glyph: key | pin | lock | node | any word (draws a dot). missing marks it in the danger tone
              holds       [string]   what it holds while it runs ("kiln 2"): one sentence says nothing else can use them
              undo        string, or {none: true, text}   how to take it back, or that it cannot be
              last        string   when it last ran
              word, wordLabel   the word to type to unlock the confirm button; the stamp fills as the letters match
              plan        {ms}     the plan is still loading: a skeleton shows and Apply stays off until ms have passed (or call plan.done())
              hands       {pin, touch, serial, title, lede, pinLabel, demo, touch()}   the waiting step after confirm. pin asks for 6 or more digits first; touch() returns a promise that ends the wait
              confirmLabel, cancelLabel, trayTitle, toast (false turns off the hand-off line)
     Kit.confirm.result(spec) -> Promise<{action}>   spec.view "failed": {title, lede, what: {title, detail, code}, todo: [string], undo, holds, retryLabel} -> action log | close | retry
                                                     spec.view "success": {title, lede, steps, undo, last, undoLabel} -> action undo | close
     Kit.confirm.define({kind: {kicker, tone, glyph, confirmLabel}})   add or replace a risk preset
     Kit.confirm.close()   cancel whatever is open
     Options on the spec: host (a positioned element; the sheet then sits inside it instead of over the page), tray (a selector for the hand-off target, default "[data-tray]").
   Keeps: focus trap and focus back to the opener, Escape and a click on the scrim cancel (not while locked), role=dialog with aria-labelledby, a polite live region ("The plan is ready",
   "Sealed"). The fly into the tray runs only when a tray exists and motion is allowed. The PIN field is a password input, never logged, cleared once read; it is only returned when hands.pin is set.
   Needs from the board:
     css     kit/patterns/confirm-sheet.css; custom properties --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --ok --warn --danger --f-ui --f-display --f-mono, optional --scrim
             --shadow, and, from kit.glaze-surfaces, the buttons and fields; the Glaze depth tokens when present (flat without them)
     kit     kit/glaze-surfaces.css (kit-btn, kit-input, kit-orb, kit-field, the kit-is-* tones); no script of the kit is called
     globals none
   db collections: none.
   Lifted from: a network-ops console's confirm sheet (the plan with before and after chips, the needs and holds, the undo line, the typed-word seal with a stamp, the waiting-for-hands step, the
   fly into the jobs tray, the failed and finished sheets). Changed: the presets are a table you extend, the project's own words and icons are gone, and the sheet can sit inside a host element. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const reduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const wait = ms => new Promise(r => setTimeout(r, reduce() ? Math.min(ms, 60) : ms));
let uid = 0;

const ICONS = {
  key: '<rect x="8" y="3" width="8" height="11" rx="3"/><circle cx="12" cy="8.5" r="1.6"/><path d="M12 14v7"/>',
  pin: '<rect x="4" y="9" width="16" height="11" rx="4"/><path d="M8 9V7a4 4 0 018 0v2M9 14.5h.01M12 14.5h.01M15 14.5h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="4"/><path d="M8 10V8a4 4 0 018 0v2"/>',
  node: '<rect x="3" y="4" width="18" height="7" rx="3.5"/><rect x="3" y="13" width="18" height="7" rx="3.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 8h-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  seal: '<circle cx="12" cy="12" r="7"/><path d="M9 12.2l2 2 4-4.4M8.5 18.5L7 22l5-2 5 2-1.5-3.5"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.6 2.6L16 9.6"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
  bad: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  wait: '<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-2.6 0-4-1.4-5.4-3.6L4 13.5a1.5 1.5 0 012.5-1.6L8 14"/>',
};
const KINDS = {
  routine: { kicker: 'Routine', tone: 'info', glyph: 'info', confirmLabel: 'Apply' },
  consequential: { kicker: 'Changes something that is in use', tone: 'warn', glyph: 'warn', confirmLabel: 'Apply' },
  destructive: { kicker: 'Cannot be taken back', tone: 'bad', glyph: 'bad', confirmLabel: 'Apply' },
  bulk: { kicker: 'Many at once', tone: 'warn', glyph: 'warn', confirmLabel: 'Apply to all' },
  wait: { kicker: 'Waiting for you', tone: 'wait', glyph: 'wait' },
  failed: { kicker: 'It did not finish', tone: 'bad', glyph: 'bad' },
  success: { kicker: 'Done', tone: 'ok', glyph: 'ok' },
};
const define = t => { Object.keys(t || {}).forEach(k => { KINDS[k] = Object.assign({}, KINDS[k], t[k]); }); };

function svg(name, cls) {
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.setAttribute('class', 'kit-cs-g' + (cls ? ' ' + cls : '')); s.innerHTML = ICONS[name] || ICONS.info; return s;
}
function h(tag, attrs) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
  for (let i = 2; i < arguments.length; i++) [].concat(arguments[i]).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const focusables = root => [...root.querySelectorAll(FOCUSABLE)].filter(e => !e.hidden && e.getClientRects().length);

let layer = null;
function mount(sheet, spec) {
  if (layer) layer.finish(null, true);
  const host = spec.host || document.body, inHost = !!spec.host;
  const scrim = h('div', { class: 'kit-cs-scrim' + (inHost ? ' kit-cs-in' : '') }, sheet);
  const prev = document.activeElement;
  const L = { scrim, sheet, locked: false, done: false, resolve: null, nullValue: null, cancel: null };
  L.onKey = ev => {
    if (ev.key === 'Escape') { if (!L.locked) { ev.preventDefault(); ev.stopPropagation(); L.cancel && L.cancel(); } return; }
    if (ev.key !== 'Tab') return;
    const f = focusables(sheet);
    if (!f.length) { ev.preventDefault(); sheet.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    else if (!sheet.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
  };
  scrim.addEventListener('mousedown', ev => { if (ev.target === scrim && !L.locked) L.cancel && L.cancel(); });
  document.addEventListener('keydown', L.onKey, true);
  host.append(scrim);
  L.finish = (value, instant) => {
    if (L.done) return; L.done = true;
    document.removeEventListener('keydown', L.onKey, true);
    const end = () => { scrim.remove(); if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true }); };
    if (layer === L) layer = null;
    if (instant || reduce()) end(); else { scrim.classList.add('kit-cs-leaving'); setTimeout(end, 220); }
    L.resolve && L.resolve(value == null ? L.nullValue : value);
  };
  layer = L; return L;
}

function head(kindKey, spec, onClose) {
  const k = KINDS[kindKey] || KINDS.routine, tone = spec.tone || k.tone;
  const med = h('div', { class: 'kit-cs-med' }, svg(spec.glyph || k.glyph || tone));
  return h('div', { class: 'kit-cs-head' }, med,
    h('div', { class: 'kit-cs-hw' },
      h('div', { class: 'kit-cs-kicker', text: spec.kicker || k.kicker || '' }),
      h('h2', { class: 'kit-cs-title', id: spec.__id + '-t', text: spec.title }),
      spec.lede ? h('p', { class: 'kit-cs-lede', text: spec.lede }) : null),
    onClose ? h('button', { class: 'kit-cs-x', type: 'button', 'aria-label': 'Close', onclick: onClose }, svg('x')) : null);
}
function deltaChips(s) {
  const d = h('div', { class: 'kit-cs-delta' });
  if (s.from != null) d.append(h('span', { class: 'kit-cs-chip kit-cs-from' + (s.mono ? ' kit-cs-mono' : ''), text: s.from }));
  if (s.from != null && s.to != null) d.append(h('span', { class: 'kit-cs-arrow', 'aria-label': 'becomes' }, '→'));
  if (s.to != null) d.append(h('span', { class: 'kit-cs-chip kit-cs-to' + (s.mono ? ' kit-cs-mono' : ''), text: s.to }));
  return d;
}
function steps(list) {
  return h('ol', { class: 'kit-cs-steps' }, list.map(s => h('li', { class: 'kit-cs-step' }, h('span', { class: 'kit-cs-bead', 'aria-hidden': 'true' }),
    h('div', null, h('div', { class: 'kit-cs-what' + (s.mono ? ' kit-cs-mono' : ''), text: s.label }), s.why ? h('div', { class: 'kit-cs-why', text: s.why }) : null, (s.from != null || s.to != null) ? deltaChips(s) : null))));
}
function bulk(b, id) {
  const list = h('div', { class: 'kit-cs-bulk-list', id: id + '-bl', hidden: true }, b.items.map(it => h('div', { class: 'kit-cs-bulk-row' }, h('span', { class: 'kit-cs-nm', text: it.name }),
    it.from ? h('span', { class: 'kit-cs-chip kit-cs-plain', text: it.from + ' to ' + it.to }) : null)));
  const btn = h('button', { type: 'button', class: 'kit-cs-bulk-b', 'aria-expanded': 'false', 'aria-controls': id + '-bl', onclick: () => {
    const open = list.hidden; list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } },
    h('span', { class: 'kit-cs-n', text: String(b.items.length) }), h('span', { class: 'kit-cs-bl', text: b.label }), h('small', { text: 'Show the list' }), svg('chev', 'kit-cs-chev'));
  return h('div', { class: 'kit-cs-bulk' }, btn, list);
}
function needsBlock(spec) {
  const bits = [];
  if (spec.needs && spec.needs.length) bits.push(h('div', { class: 'kit-cs-needline' }, h('span', { class: 'kit-cs-lead', text: 'Needs' }),
    spec.needs.map(n => h('span', { class: 'kit-cs-tok' + (n.missing ? ' kit-cs-missing' : '') }, ICONS[n.kind] ? svg(n.kind) : h('i', { class: 'kit-cs-dot', 'aria-hidden': 'true' }), n.label, n.missing ? h('small', { text: 'missing' }) : (n.detail ? h('small', { text: n.detail }) : null)))));
  if (spec.holds && spec.holds.length) {
    const l = spec.holds, list = l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0];
    bits.push(h('p', { class: 'kit-cs-holds', text: 'While it runs it holds ' + list + ', so nothing else can use ' + (l.length > 1 ? 'them' : 'it') + '.' }));
  }
  return bits.length ? h('div', { class: 'kit-cs-twocol' }, bits) : null;
}
function undoLine(u) {
  if (!u) return null;
  if (u.none) return h('div', { class: 'kit-cs-undo kit-cs-none' }, h('span', null, h('b', { text: 'No way back. ' }), u.text || ''));
  return h('div', { class: 'kit-cs-undo' }, svg('undo'), h('span', null, h('b', { text: 'To undo: ' }), typeof u === 'string' ? u : u.text));
}

function open(spec) {
  spec = Object.assign({}, spec);
  return new Promise(resolve => {
    const kindKey = KINDS[spec.kind] ? spec.kind : 'routine', K = KINDS[kindKey];
    const tone = spec.tone || K.tone;
    const id = spec.__id = 'kit-cs-' + (++uid);
    const needsHands = !!(spec.hands && (spec.hands.pin || spec.hands.touch));
    let planned = !spec.plan, sealed = !spec.word, typed = '', phase = 'ready';
    const sheet = h('div', { class: 'kit-cs kit-is-' + tone, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t', tabindex: '-1' });
    const body = h('div', { class: 'kit-cs-body' });
    const live = h('div', { class: 'kit-cs-sr', role: 'status', 'aria-live': 'polite' });
    const foot = h('div', { class: 'kit-cs-foot' });
    const handoff = h('div', { class: 'kit-cs-handoff', 'aria-hidden': 'true' }, h('span', { class: 'kit-orb kit-run kit-is-info' }), h('span', { text: 'Running in the tray' }));
    const L = mount(sheet, spec); L.resolve = resolve; L.nullValue = { confirmed: false };
    const cancel = h('button', { class: 'kit-btn kit-ghost', type: 'button', text: spec.cancelLabel || 'Not now', onclick: () => L.finish({ confirmed: false }) });
    const go = h('button', { class: 'kit-btn ' + (kindKey === 'destructive' ? 'kit-danger' : 'kit-primary'), type: 'button', text: spec.confirmLabel || K.confirmLabel || 'Apply', onclick: () => confirmNow() });
    const hint = h('span', { class: 'kit-cs-grow' });
    foot.append(hint, cancel, go);
    L.cancel = () => { if (phase === 'ready' || phase === 'hands') L.finish({ confirmed: false }); };
    function gate() {
      const ok = planned && sealed && phase === 'ready';
      go.disabled = !ok; go.setAttribute('aria-disabled', String(!ok));
      if (!planned) go.title = 'Waiting for the plan'; else if (!sealed) go.title = 'Type the word to unlock'; else go.removeAttribute('title');
    }
    const planBox = h('div', { class: 'kit-cs-planbox' });
    function fillPlan() {
      planBox.replaceChildren();
      if (!(spec.steps && spec.steps.length) && !spec.bulk) return;
      planBox.append(h('div', null, h('div', { class: 'kit-cs-h', text: spec.bulk ? 'What happens' : 'What will change, in order' }),
        spec.steps && spec.steps.length ? steps(spec.steps) : null, spec.bulk ? bulk(spec.bulk, id) : null));
    }
    function fillSkeleton() {
      planBox.replaceChildren(h('div', { class: 'kit-cs-plan', 'aria-busy': 'true' },
        h('div', { class: 'kit-cs-planline' }, h('span', { class: 'kit-orb kit-run kit-is-info' }), 'Reading the current state to plan the change'),
        h('div', { class: 'kit-cs-sk kit-cs-w1' }), h('div', { class: 'kit-cs-sk kit-cs-w2' }), h('div', { class: 'kit-cs-sk kit-cs-w3' })));
    }
    function buildSeal() {
      const C = 2 * Math.PI * 34;
      const ring = document.createElementNS(NS, 'svg'); ring.setAttribute('class', 'kit-cs-ring'); ring.setAttribute('viewBox', '0 0 72 72'); ring.setAttribute('aria-hidden', 'true');
      ring.innerHTML = '<circle class="kit-cs-tr" cx="36" cy="36" r="34"/><circle class="kit-cs-ar" cx="36" cy="36" r="34" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/>';
      const arc = ring.querySelector('.kit-cs-ar');
      const stamp = h('div', { class: 'kit-cs-stamp' }, ring, svg('seal'));
      const input = h('input', { class: 'kit-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', id: id + '-w', 'aria-describedby': id + '-wh' });
      const letters = h('div', { class: 'kit-cs-letters', id: id + '-wh', 'aria-label': 'Word to type: ' + spec.word }, Array.from(spec.word).map(c => h('i', { text: c })));
      const box = h('div', { class: 'kit-cs-seal' }, stamp, h('label', { class: 'kit-field', for: id + '-w' }, h('span', { text: spec.wordLabel || 'Type the word to seal it' }), input, letters));
      input.addEventListener('input', () => {
        typed = input.value; const w = spec.word; let good = 0;
        while (good < typed.length && good < w.length && typed[good] === w[good]) good++;
        [...letters.children].forEach((i, n) => { i.className = n < good ? 'kit-cs-on' : (n < typed.length ? 'kit-cs-off' : ''); });
        arc.setAttribute('stroke-dashoffset', (C * (1 - good / w.length)).toFixed(1));
        sealed = typed === w; box.classList.toggle('kit-cs-set', sealed);
        live.textContent = sealed ? 'Sealed. You can confirm now.' : ''; gate();
      });
      box.stamp = stamp; box.input = input; return box;
    }
    body.append(planBox);
    const sealEl = spec.word ? buildSeal() : null;
    body.append.apply(body, [sealEl, needsBlock(spec), undoLine(spec.undo), spec.last ? h('div', { class: 'kit-cs-last' }, svg('clock'), spec.last) : null, live].filter(Boolean));
    sheet.append(head(kindKey, spec, () => L.finish({ confirmed: false })), body, foot, handoff);
    if (planned) fillPlan(); else {
      fillSkeleton();
      const ready = () => { if (L.done || planned) return; planned = true; fillPlan(); live.textContent = 'The plan is ready.'; gate(); };
      spec.plan.done = ready; wait(spec.plan.ms || 1500).then(ready);
    }
    gate();
    (sealEl ? sealEl.input : go.disabled ? sheet : go).focus({ preventScroll: true });
    sheet.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || ev.isComposing) return;
      const t = ev.target; if (t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA') return;
      if (phase === 'ready' && !go.disabled) { ev.preventDefault(); confirmNow(); }
    });
    async function confirmNow() {
      if (go.disabled || phase !== 'ready') return;
      if (sealEl) { sealEl.stamp.classList.add('kit-cs-pressed'); await wait(380); }
      if (L.done) return;
      if (needsHands) return hands();
      return flyAway({ confirmed: true, typed });
    }
    function hands() {
      phase = 'hands'; const hs = spec.hands;
      sheet.className = 'kit-cs kit-is-wait';
      sheet.querySelector('.kit-cs-kicker').textContent = KINDS.wait.kicker;
      sheet.querySelector('.kit-cs-title').textContent = hs.title || 'Waiting for you';
      const lede = sheet.querySelector('.kit-cs-lede'); if (lede) lede.textContent = hs.lede || '';
      const med = sheet.querySelector('.kit-cs-med'); med.replaceChildren(svg('wait'));
      const wrap = h('div', { class: 'kit-cs-ringwrap' });
      wrap.innerHTML = '<svg class="kit-cs-wr" viewBox="0 0 132 132" aria-hidden="true"><circle class="kit-cs-wt" cx="66" cy="66" r="60"/><circle class="kit-cs-wd" cx="66" cy="66" r="60"/></svg>';
      wrap.append(h('div', { class: 'kit-cs-key' }, svg('key')));
      const keyName = hs.serial ? 'key ' + hs.serial : 'the key';
      const msg = h('h3', { text: hs.pin ? (hs.pinLabel || 'Enter the PIN') : 'Touch the key' });
      const sub = h('p', { text: hs.pin ? 'Then touch the key when it blinks.' + (hs.serial ? ' Key ' + hs.serial + '.' : '') : 'The light on ' + keyName + ' is blinking.' });
      const area = h('div', { class: 'kit-cs-hand' }, wrap, msg, sub);
      const goOn = h('button', { class: 'kit-btn kit-primary', type: 'button', text: 'Continue' });
      const stop = h('button', { class: 'kit-btn kit-ghost', type: 'button', text: 'Stop waiting', onclick: () => L.finish({ confirmed: false }) });
      const none = h('span', { class: 'kit-cs-grow', text: 'Nothing has been signed yet.' });
      let pinInput = null, pin;
      const finishTouch = async () => {
        wrap.classList.remove('kit-cs-live'); wrap.classList.add('kit-cs-fin'); msg.textContent = 'Touched. Thank you.'; sub.textContent = '';
        sheet.querySelector('.kit-cs-med').replaceChildren(svg('ok')); sheet.className = 'kit-cs kit-is-ok'; await wait(650);
        flyAway({ confirmed: true, typed, pin });
      };
      const startWait = () => {
        if (pinInput) { pin = pinInput.value; pinInput.value = ''; pinInput.parentElement.hidden = true; }
        wrap.classList.add('kit-cs-live'); goOn.hidden = true; msg.textContent = 'Touch the key'; sub.textContent = 'The light on ' + keyName + ' is blinking.';
        live.textContent = 'Touch the key now.';
        Promise.resolve(typeof hs.touch === 'function' ? hs.touch() : wait(3200)).then(() => { if (!L.done) finishTouch(); });
        foot.replaceChildren(none, stop); stop.focus();
      };
      if (hs.pin) {
        pinInput = h('input', { class: 'kit-input', type: 'password', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', 'aria-label': hs.pinLabel || 'PIN', maxlength: '8', id: id + '-pin' });
        area.insertBefore(h('div', { class: 'kit-cs-pinbox' }, pinInput), sub.nextSibling);
        if (hs.demo) area.append(h('p', { class: 'kit-cs-demo', text: hs.demo }));
        goOn.disabled = true;
        pinInput.addEventListener('input', () => { goOn.disabled = pinInput.value.length < 6; });
        pinInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); if (!goOn.disabled) startWait(); } });
        goOn.addEventListener('click', startWait);
        foot.replaceChildren(h('span', { class: 'kit-cs-grow', text: 'The PIN stays in this window.' }), stop, goOn);
      } else foot.replaceChildren(none, stop);
      body.replaceChildren(area, live);
      if (pinInput) pinInput.focus(); else startWait();
    }
    async function flyAway(res) {
      phase = 'handoff'; L.locked = true; sheet.classList.add('kit-cs-handing'); handoff.setAttribute('aria-hidden', 'false');
      live.textContent = (spec.trayTitle || 'The job') + ' is running in the tray.'; await wait(750);
      const tray = document.querySelector(spec.tray || '[data-tray]');
      if (tray && !reduce()) {
        const a = sheet.getBoundingClientRect(), b = tray.getBoundingClientRect();
        const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
        sheet.classList.add('kit-cs-fly'); sheet.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.06)'; await wait(620);
        tray.classList.remove('kit-cs-catch'); void tray.offsetWidth; tray.classList.add('kit-cs-catch');
      } else { sheet.classList.add('kit-cs-away'); await wait(230); }
      L.finish(res, true);
    }
  });
}

function result(spec) {
  spec = Object.assign({}, spec);
  return new Promise(resolve => {
    const view = spec.view === 'failed' ? 'failed' : 'success', tone = KINDS[view].tone, id = spec.__id = 'kit-cs-' + (++uid);
    const sheet = h('div', { class: 'kit-cs kit-is-' + tone, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t', tabindex: '-1' });
    const body = h('div', { class: 'kit-cs-body' }), foot = h('div', { class: 'kit-cs-foot' });
    const L = mount(sheet, spec); L.resolve = resolve; L.nullValue = { action: 'close' };
    const act = a => () => L.finish({ action: a }); L.cancel = act('close');
    const btn = (label, cls, a) => h('button', { class: 'kit-btn ' + cls, type: 'button', text: label, onclick: act(a) });
    if (view === 'failed') {
      const w = spec.what || {};
      body.append(h('div', { class: 'kit-cs-whatbox' }, h('b', { text: w.title }), w.detail ? h('span', { text: w.detail }) : null, w.code ? h('code', { text: w.code }) : null),
        spec.todo && spec.todo.length ? h('div', null, h('div', { class: 'kit-cs-h', text: 'What to do' }), h('ol', { class: 'kit-cs-todo' }, spec.todo.map(t => h('li', { text: t })))) : null,
        undoLine(spec.undo),
        spec.holds && spec.holds.length ? h('div', null, h('div', { class: 'kit-cs-h', text: 'Still held' }), h('div', { class: 'kit-cs-tokens' }, spec.holds.map(l => h('span', { class: 'kit-cs-tok', text: l })))) : null);
      foot.append(btn('Open the log', 'kit-ghost', 'log'), btn('Close', 'kit-ghost', 'close'), btn(spec.retryLabel || 'Try again', 'kit-primary', 'retry'));
    } else {
      body.append(h('div', null, h('div', { class: 'kit-cs-h', text: 'What changed' }), steps(spec.steps || [])), undoLine(spec.undo), spec.last ? h('div', { class: 'kit-cs-last' }, svg('clock'), spec.last) : null);
      if (spec.undo) foot.append(h('button', { class: 'kit-btn', type: 'button', onclick: act('undo') }, svg('undo'), h('span', { text: spec.undoLabel || 'Undo' })));
      foot.append(btn('Done', 'kit-primary', 'close'));
    }
    sheet.append(head(view, spec, act('close')), body, foot);
    (foot.querySelector('.kit-primary') || sheet).focus({ preventScroll: true });
  });
}

Kit.confirm = Object.freeze({ open, result, define, close() { if (layer) layer.finish(null); }, kinds: () => Object.keys(KINDS) });
})();
/* /part:page.script.kit.confirm-sheet */
