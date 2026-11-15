/* part:page.script.kit.secret-input */
/**
 * Write-only secret field
 * Kit.secretInput.mount(root, {onSubmit}) draws a form with a name field (and a list of suggestions), a state line that says whether the name is new or would replace one, a Generate instead switch, a masked value, a note and a button that says Store or Replace. The value is a password input with an eye toggle, or a masked text area for a multi-line key (masked in CSS, with a blur where the browser lacks text-security). Shape hints are data ({endsWith, hex: 48, what}) and are checked as you type without ever showing the value. On submit the value is read into a local, the inputs and the eye are cleared, and only then does onSubmit run; the value is not kept in a state object, an event, an attribute or a log. Autocomplete, spellcheck and autocapitalize are off. Replacing is the board’s to confirm: onSubmit receives replace: true. openDrawer() puts the form in kit.drawer.
 *
 * What it is: a form for putting a value in without ever showing what is stored. A name field with suggestions; a masked value (one line with an eye toggle, or several lines masked in CSS); a
 * "generate instead" switch that greys the value and lets the board make one; a hint for the shape the name expects, checked as you type ("48 hex characters", "17 of 48"); a note; and a button
 * that says Store, or Replace when the name already exists. When it sends, the field is empty.
 *
 * The rules it keeps: the value is read once into a local, the inputs and the visible state are cleared first, and only then does onSubmit run. The value is never put in a state object, an event
 * detail, a data attribute or a log, and never in storage. The inputs have autocomplete, spellcheck and autocapitalize off. The eye re-masks on send, on clear and when the page is hidden.
 *
 * API (small and stable):
 *   Kit.secretInput.mount(root, {names, shapes, exists, generateOnly, multiline, onSubmit, nameRule, labels}) -> {focus(), clear(), setName(name), destroy(), form}
 *     names         [string | {name, note}]   suggestions for the name field
 *     shapes        [{startsWith, endsWith, equals, what, hex, length: [min, max], multiline}]   the first shape whose name rule matches gives the hint and the check; `hex: 48` wants 48 hex characters
 *     exists        (name) -> null | {exists, detail}   what the board knows about the name; exists:true turns Store into Replace and is passed on as `replace`
 *     generateOnly  (name) -> boolean   a name whose value is only ever generated: the switch is on and locked
 *     multiline     (name) -> boolean   or set `multiline` on a shape
 *     onSubmit      ({name, value, note, generate, replace}) -> Promise   value is "" when generate is on. Resolve to report success; reject to show the message. The board decides what a Replace asks for
 *                   (the preview asks for a typed word with Kit.confirm)
 *     nameRule      (name) -> "" | problem   default: lower-case letters, digits and . _ @ / -, no empty part, no part starting with . or -
 *     labels        {store, replace, name, value, generate, note}   the words
 *   Kit.secretInput.openDrawer({title, lede, host, opener, modal, focus, ...mountOptions}) -> {drawer, input}   the same form inside Kit.drawer, with Store and Cancel in the foot
 *   Kit.secretInput.check(shape, value) -> {ok, got, want}   the pure shape check;  Kit.secretInput.shapeFor(shapes, name) -> shape | null
 *
 * CSS classes: .kit-si-form
 *
 * @id        pattern.secret-input
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A form for putting a value in without ever showing what is stored: masked single or multi-line input with an eye toggle, a generate-instead switch, shape hints and a cleared field after sending.
 * @tags      secret, password, form, write-only, masked, input, generate, drawer
 * @requires  kit.drawer, kit.glaze-surfaces
 * @files     kit/patterns/secret-input.css, kit/samples/patterns.json
 * @provides  Kit.secretInput.mount, Kit.secretInput.openDrawer, Kit.secretInput.check, Kit.secretInput.shapeFor, Kit.secretInput.nameProblem
 * @config    Kit.secretInput.mount(root, {names, shapes, exists, generateOnly, multiline, onSubmit, nameRule, labels}) | onSubmit({name, value, note, generate, replace}) -> Promise; shapes [{startsWith | endsWith | equals, what, hex | length, multiline}]
 * @config    Kit.secretInput.openDrawer({title, lede, host, opener, focus, ...mountOptions}) | the same form in kit.drawer with Store and Cancel in the foot
 * @tokens    --sunk --ink --ink-2 --rule --f-ui --danger --ok --danger-soft? --ok-soft?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console’s deposit drawer | the name field with a list, the masked value with an eye, the generate switch, the shape hints and checks, the multi-line masked key, clearing the value before sending
 * @preview   {"render": "pattern.secret-input", "samples": ["kit/samples/patterns.json#secret-input"], "uses": ["pattern.confirm-sheet"]}
 * @samples   secret-input
 * @changed   Shapes are data and the check has no patterns in it.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6a8.6 8.6 0 011.4-.1c6 0 9.5 6.1 9.5 6.1a16 16 0 01-3.2 3.8M6.5 7.2A15.6 15.6 0 002.5 12S6 18.5 12 18.5a8.4 8.4 0 004.2-1.1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
const SEP = '._@/-';
const isLower = c => c >= 'a' && c <= 'z', isDigit = c => c >= '0' && c <= '9', isHex = c => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');

function nameProblem(name) {
  if (!name) return 'Type a name, or pick one from the list.';
  for (const c of name) if (!(isLower(c) || isDigit(c) || SEP.includes(c))) return 'Lower-case letters, digits and . _ @ / - only.';
  if (!(isLower(name[0]) || isDigit(name[0]))) return 'Start with a letter or a digit.';
  if (name.includes('..')) return 'No two dots in a row.';
  const parts = name.split('/'); if (parts.some(p => !p || p[0] === '.' || p[0] === '-')) return 'No empty part, and no part starting with . or -.';
  if ('.-'.includes(name[name.length - 1])) return 'Do not end with . or -.';
  return '';
}
function shapeFor(shapes, name) {
  return (shapes || []).find(s => (s.equals != null && s.equals === name) || (s.startsWith != null && name.startsWith(s.startsWith)) || (s.endsWith != null && name.endsWith(s.endsWith))) || null;
}
function check(shape, value) {
  if (!shape) return { ok: true };
  const v = String(value);
  if (shape.hex) return { ok: v.length === shape.hex && [...v].every(isHex), got: v.length, want: shape.hex };
  if (shape.length) return { ok: v.length >= shape.length[0] && v.length <= shape.length[1], got: v.length, want: shape.length[0] + ' to ' + shape.length[1] };
  return { ok: true };
}

function mount(root, opts) {
  const o = Object.assign({ names: [], shapes: [], exists: null, generateOnly: null, multiline: null, onSubmit: null, nameRule: nameProblem, labels: {} }, opts);
  const L = Object.assign({ store: 'Store', replace: 'Replace', name: 'Name', value: 'Value', generate: 'Generate instead', note: 'Note' }, o.labels);
  const id = 'kit-si-' + (++uid); let gen = false, showing = false, ml = false, destroyed = false;
  root.classList.add('kit-si'); root.replaceChildren();
  const off = { autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' };
  const setOff = e => { Object.keys(off).forEach(k => e.setAttribute(k, off[k])); e.setAttribute('data-1p-ignore', ''); e.setAttribute('data-lpignore', 'true'); return e; };
  const form = el('form', 'kit-si-form'); form.id = id; form.noValidate = true; form.setAttribute('autocomplete', 'off');
  const field = (lab, inp, hint) => { const f = el('label', 'kit-field'); f.htmlFor = inp.id; f.append(el('span', null, lab), inp); if (hint) f.append(hint); return f; };

  const nameIn = setOff(el('input', 'kit-input kit-mono')); nameIn.id = id + '-n'; nameIn.type = 'text'; nameIn.setAttribute('list', id + '-l'); nameIn.setAttribute('aria-describedby', id + '-nh');
  const dl = el('datalist'); dl.id = id + '-l'; o.names.forEach(n => { const op = el('option'); op.value = typeof n === 'string' ? n : n.name; if (n.note) op.label = n.note; dl.append(op); });
  const nameHint = el('small'); nameHint.id = id + '-nh';
  const state = el('div', 'kit-si-state'); state.setAttribute('role', 'status');

  const genSw = el('button', 'kit-switch'); genSw.type = 'button'; genSw.setAttribute('role', 'switch'); genSw.setAttribute('aria-checked', 'false'); genSw.setAttribute('aria-labelledby', id + '-gl');
  const genText = el('small'); const genRow = el('div', 'kit-si-gen'); const gt = el('div', 'kit-si-gt'); const gl = el('span', 'kit-si-gl', L.generate); gl.id = id + '-gl'; gt.append(gl, genText); genRow.append(genSw, gt);

  const valIn = setOff(el('input', 'kit-input kit-mono')); valIn.id = id + '-v'; valIn.type = 'password'; valIn.setAttribute('autocomplete', 'new-password'); valIn.setAttribute('aria-describedby', id + '-vh');
  const valArea = setOff(el('textarea', 'kit-area kit-mono kit-si-mask')); valArea.id = id + '-va'; valArea.rows = 5; valArea.hidden = true; valArea.setAttribute('aria-describedby', id + '-vh');
  const eye = el('button', 'kit-btn kit-icon kit-sm kit-si-eye'); eye.type = 'button'; eye.setAttribute('aria-pressed', 'false');
  const vrow = el('div', 'kit-si-vrow'); vrow.append(valIn, valArea, eye);
  const shapeHint = el('small'); shapeHint.id = id + '-vh'; shapeHint.setAttribute('aria-live', 'polite');
  const valueField = el('div', 'kit-field kit-si-value'); const vlab = el('label', null, L.value); vlab.htmlFor = valIn.id; const vSpan = el('span'); vSpan.append(vlab); valueField.append(vSpan, vrow, shapeHint);
  const noteIn = setOff(el('input', 'kit-input')); noteIn.id = id + '-note'; noteIn.type = 'text'; noteIn.maxLength = 300;
  const err = el('p', 'kit-si-err'); err.setAttribute('role', 'alert'); err.hidden = true;
  const submit = el('button', 'kit-btn kit-primary', L.store); submit.type = 'submit';
  const sub = el('div', 'kit-btn-row'); sub.append(submit);
  form.append(field(L.name, nameIn, nameHint), dl, state, genRow, valueField, field(L.note, noteIn), err, sub);
  root.append(form);

  const valueEl = () => (valArea.hidden ? valIn : valArea);
  const fail = t => { err.textContent = t; err.hidden = !t; };
  function setShow(on) {
    showing = on; valIn.type = on ? 'text' : 'password'; valArea.classList.toggle('kit-si-mask', !on); eye.setAttribute('aria-pressed', String(on));
    const l = on ? 'Hide the value' : 'Show the value'; eye.setAttribute('aria-label', l); eye.title = l; eye.innerHTML = on ? EYE_OFF : EYE;
  }
  function clearValue() { valIn.value = ''; valArea.value = ''; setShow(false); paintShape(); }
  function setGen(on, locked) {
    gen = on; genSw.setAttribute('aria-checked', String(on)); genSw.disabled = !!locked; genRow.classList.toggle('kit-si-locked', !!locked);
    valueField.classList.toggle('kit-si-off', on); valIn.disabled = on; valArea.disabled = on; eye.disabled = on; if (on) clearValue(); fail('');
    genText.textContent = locked ? 'This name only ever gets a generated value.' : 'A random value is made for you. You never see it and never type it.';
  }
  function paintShape() {
    const name = nameIn.value.trim(), sh = shapeFor(o.shapes, name), v = valueEl().value;
    if (gen) { shapeHint.textContent = ''; return; }
    if (!sh) { shapeHint.textContent = ml ? 'Paste it whole, lines and all.' : 'Anything. A trailing newline is dropped.'; return; }
    const what = sh.what || (sh.hex ? sh.hex + ' hex characters' : sh.length ? sh.length[0] + ' to ' + sh.length[1] + ' characters' : 'a value of this shape');
    const c = check(sh, v);
    shapeHint.textContent = 'Expected: ' + what + '.' + (v && c.got != null ? (c.ok ? ' That fits.' : ' You have ' + c.got + '.') : '');
  }
  function paintName() {
    const name = nameIn.value.trim(), bad = name ? o.nameRule(name) : '';
    nameHint.className = bad ? 'kit-err' : ''; nameHint.textContent = bad || 'A group and a name, like studio/api-key-shop. The list has what is already there.';
    const info = name && !bad && o.exists ? o.exists(name) : null, replace = !!(info && info.exists);
    state.dataset.tone = !name || bad ? 'idle' : replace ? 'bad' : 'ok';
    state.textContent = !name || bad ? 'A new name is stored as it is. A name that exists is replaced only after you confirm.' : replace ? 'This name exists. Replacing it changes what is stored. ' + (info.detail || '') : 'A new name. Nothing is replaced.';
    const lock = !!(name && o.generateOnly && o.generateOnly(name)); if (lock && !gen) setGen(true, true); else if (!lock && genSw.disabled) setGen(false, false); else genSw.disabled = lock;
    const sh = shapeFor(o.shapes, name), wantMl = !!(name && ((o.multiline && o.multiline(name)) || (sh && sh.multiline)));
    if (wantMl !== !valArea.hidden) { clearValue(); valIn.hidden = wantMl; valArea.hidden = !wantMl; ml = wantMl; vlab.htmlFor = (wantMl ? valArea : valIn).id; eye.hidden = wantMl; }
    submit.textContent = replace ? L.replace : L.store; submit.dataset.replace = String(replace); paintShape(); return replace;
  }
  genSw.addEventListener('click', () => setGen(!gen, false));
  eye.addEventListener('click', () => setShow(!showing));
  nameIn.addEventListener('input', paintName); valIn.addEventListener('input', paintShape); valArea.addEventListener('input', paintShape);
  const onVis = () => { if (document.hidden) setShow(false); }; document.addEventListener('visibilitychange', onVis);
  form.addEventListener('submit', async ev => {
    ev.preventDefault(); const name = nameIn.value.trim(), bad = o.nameRule(name);
    if (bad) { fail(bad); nameIn.focus(); return; }
    const replace = paintName(), sh = shapeFor(o.shapes, name), ve = valueEl();
    if (!gen) {
      if (!ve.value.trim()) { fail('Type or paste the value, or switch ' + L.generate.toLowerCase() + ' on.'); ve.focus(); return; }
      const c = check(sh, ve.value); if (!c.ok) { fail('That does not fit: expected ' + (sh.what || c.want) + '. Nothing was sent.'); ve.focus(); return; }
    }
    fail('');
    let v = gen ? '' : ve.value, note = noteIn.value.trim();
    while (v.endsWith('\n') || v.endsWith('\r')) v = v.slice(0, -1);
    clearValue();
    submit.disabled = true; submit.classList.add('kit-loading');
    try { await o.onSubmit({ name, value: v, note, generate: gen, replace }); v = null; state.dataset.tone = 'ok'; state.textContent = (replace ? 'Replaced ' : 'Stored ') + name + '. The field is empty and nothing is kept on this page.'; noteIn.value = ''; }
    catch (e) { v = null; fail((e && e.message ? e.message : 'It was not stored') + '. The field is empty: enter the value again.'); }
    finally { v = null; submit.disabled = false; submit.classList.remove('kit-loading'); }
  });
  setShow(false); setGen(false, false); paintName();
  return {
    form, focus: () => nameIn.focus(), setName(n) { nameIn.value = n; paintName(); },
    clear() { clearValue(); noteIn.value = ''; fail(''); }, destroy() { destroyed = true; document.removeEventListener('visibilitychange', onVis); clearValue(); root.replaceChildren(); root.classList.remove('kit-si'); },
  };
}
function openDrawer(opts) {
  const o = Object.assign({ title: 'Store a secret', lede: 'The value goes in and is never shown again.' }, opts);
  const body = document.createElement('div'); body.className = 'kit-si-body';
  const lede = el('p', 'kit-si-lede', o.lede); const box = document.createElement('div'); body.append(lede, box);
  const input = mount(box, o);
  const cancel = el('button', 'kit-btn kit-ghost', 'Cancel'); cancel.type = 'button';
  const go = el('button', 'kit-btn kit-primary', 'Store'); go.type = 'button'; go.addEventListener('click', () => input.form.requestSubmit());
  const obs = new MutationObserver(() => { const s = input.form.querySelector('button[type="submit"]'); if (s) go.textContent = s.textContent; }); obs.observe(input.form, { childList: true, subtree: true, characterData: true, attributes: true });
  const drawer = Kit.drawer.open({ title: o.title, body, foot: [cancel, go], modal: !!o.modal, host: o.host, opener: o.opener, focus: o.focus, onClose: () => { obs.disconnect(); input.destroy(); } });
  cancel.addEventListener('click', () => drawer.close()); input.form.querySelector('button[type="submit"]').hidden = true;
  return { drawer, input };
}
Kit.secretInput = Object.freeze({ mount, openDrawer, check, shapeFor, nameProblem });
})();
/* /part:page.script.kit.secret-input */
