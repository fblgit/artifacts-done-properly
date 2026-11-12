/* part:page.script.kit.capability-picker */
/**
 * Capability picker
 * Kit.capabilityPicker.mount(root, {capabilities}) draws a switch for each capability in groups, each with a line saying what it needs. Turning one on switches on its prerequisites, drawn as included (dashed, locked while something that needs them is on). A sentence under the switches states the order, prerequisites first ("Runs, in order: Build the pages, then Check the links, then Publish the site."), and turns to a warning when the groups cannot be mixed (an option) or when capabilities need each other. A preset fills the switches; changing one by hand sets the preset back to Custom. closure(capabilities, keys) is a pure depth-first function with a cycle guard and is exported for tests. steps({capabilities, keys, done, na}) draws the progress of one target through the same capabilities as chips (done, or not yet) with a count.
 *
 * API (small and stable):
 *   Kit.capabilityPicker.mount(root, {capabilities, groups, presets, exclusive, value, label, onChange}) -> picker
 *     capabilities  {key: {title, group, needs: [key], note}}   the order of the keys is the tie-break for the run order
 *     groups        {key: label}   headings (default: the group key)           presets  {key: {label, keys: [key]}}
 *     exclusive     true: the closure may not span more than one group (default false)
 *     value         [key] switched on at the start                              onChange  ({chosen, included, order, groups, valid, problem}) after each change
 *   picker.get() -> the same state;  picker.set([key]);  picker.destroy()
 *   Kit.capabilityPicker.closure(capabilities, keys) -> {order, included, cycles, unknown}
 *     order     every key that will run, prerequisites first (depth first, in the order of the capabilities); included = order minus the chosen keys
 *     cycles    [[key, ...]] groups of keys that need each other (they are left out of order and named in the sentence); unknown = keys no capability has
 *     The function is pure and has a cycle guard.
 *   Kit.capabilityPicker.steps({capabilities, keys, done, na, label}) -> Element   the progress chips of one target: keys is the target's capabilities, done the finished ones, na the ones that
 *     do not apply (left out); it says "3 of 5 steps"
 *
 * CSS classes: .kit-cp .kit-cp-row
 *
 * @id        pattern.capability-picker
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A switch per capability that says what it needs; turning one on includes its prerequisites, and a sentence states the order it will run; kinds that cannot mix say so.
 * @tags      capability, switch, prerequisites, dependencies, preset, order, onboarding, steps
 * @requires  kit.vocab, kit.glaze-surfaces
 * @provides  Kit.capabilityPicker.mount, Kit.capabilityPicker.closure, Kit.capabilityPicker.steps
 * @config    Kit.capabilityPicker.mount(root, {capabilities, groups, presets, exclusive, value, label, onChange}) | capabilities {key: {title, group, needs: [key], note}}; presets {key: {label, keys}}; onChange({chosen, included, order, groups, valid, problem})
 * @config    Kit.capabilityPicker.steps({capabilities, keys, done, na, label}) | needs Kit.vocab for the chips
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --ink-3 --rule-2 --ok --warn --danger --f-mono --rim? --pool? --seam?
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;

function closure(caps, keys) {
  const known = Object.keys(caps), rank = k => known.indexOf(k), order = [], done = new Set(), stack = [], cycles = [], unknown = [];
  function visit(k) {
    if (done.has(k)) return;
    if (!caps[k]) { if (!unknown.includes(k)) unknown.push(k); return; }
    const at = stack.indexOf(k);
    if (at >= 0) { const c = stack.slice(at); if (!cycles.some(x => x.length === c.length && c.every(y => x.includes(y)))) cycles.push(c); return; }
    stack.push(k); (caps[k].needs || []).slice().sort((a, b) => rank(a) - rank(b)).forEach(visit); stack.pop();
    if (!cycles.some(c => c.includes(k))) { done.add(k); order.push(k); } else done.add(k);
  }
  keys.slice().sort((a, b) => rank(a) - rank(b)).forEach(visit);
  return { order, included: order.filter(k => !keys.includes(k)), cycles, unknown };
}

function steps(o) {
  const V = window.Kit && window.Kit.vocab, caps = o.capabilities, keys = (o.keys || []).filter(k => !(o.na || []).includes(k)), done = o.done || [];
  const box = el('div', 'kit-cp-steps'); box.setAttribute('role', 'list'); box.setAttribute('aria-label', o.label || 'Steps');
  const n = keys.filter(k => done.includes(k)).length; box.dataset.done = String(n); box.dataset.total = String(keys.length);
  keys.forEach(k => {
    const ok = done.includes(k), li = el('span', 'kit-cp-step'); li.setAttribute('role', 'listitem');
    const c = V && V.chip('state', ok ? 'done' : 'queued', { unknown: 'skip' });
    const t = (caps[k] && caps[k].title) || k; li.dataset.done = String(ok); li.title = t + (ok ? ', done' : ', not yet');
    if (c) { li.append(c); const lab = el('span', 'kit-cp-sl', t); li.append(lab); } else li.append(el('span', 'kit-cp-sl', (ok ? 'Done: ' : 'Not yet: ') + t));
    box.append(li);
  });
  const wrap = el('div', 'kit-cp-stepwrap'); wrap.append(box, el('span', 'kit-cp-count', n + ' of ' + keys.length + ' steps')); return wrap;
}

function mount(root, opts) {
  const o = Object.assign({ capabilities: {}, groups: {}, presets: {}, exclusive: false, value: [], label: 'Capabilities', onChange: null }, opts);
  const caps = o.capabilities, id = 'kit-cp-' + (++uid), chosen = new Set(o.value), sw = {}, rowEl = {}, noteEl = {};
  root.classList.add('kit-cp'); root.replaceChildren();
  const groupKeys = []; Object.keys(caps).forEach(k => { const g = caps[k].group || ''; if (!groupKeys.includes(g)) groupKeys.push(g); });
  const presetSel = el('select', 'kit-select'); presetSel.id = id + '-p';
  const presetKeys = Object.keys(o.presets);
  const pwrap = el('label', 'kit-field'); pwrap.htmlFor = presetSel.id; pwrap.append(el('span', null, 'Preset'), presetSel);
  presetSel.append(Object.assign(el('option', null, 'Custom'), { value: '' })); presetKeys.forEach(k => presetSel.append(Object.assign(el('option', null, o.presets[k].label || k), { value: k })));
  const grid = el('div', 'kit-cp-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', o.label);
  const plan = el('p', 'kit-cp-plan'); plan.setAttribute('role', 'status'); plan.setAttribute('aria-live', 'polite');
  groupKeys.forEach(g => {
    const col = el('div', 'kit-cp-col'); const h = el('h4', 'kit-cp-gh', o.groups[g] || g); h.id = id + '-g-' + g; col.append(h);
    const ul = el('ul', 'kit-cp-list'); ul.setAttribute('aria-labelledby', h.id);
    Object.keys(caps).filter(k => (caps[k].group || '') === g).forEach(k => {
      const c = caps[k], li = el('li', 'kit-cp-row'); const b = el('button', 'kit-switch'); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', 'false'); b.id = id + '-s-' + k; b.setAttribute('aria-labelledby', id + '-t-' + k); b.setAttribute('aria-describedby', id + '-n-' + k);
      const tx = el('span', 'kit-cp-tx'); const t = el('span', 'kit-cp-t', c.title); t.id = id + '-t-' + k;
      const n = el('span', 'kit-cp-n'); n.id = id + '-n-' + k; tx.append(t, n); li.append(b, tx);
      b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true') return; if (chosen.has(k)) chosen.delete(k); else chosen.add(k); presetSel.value = ''; paint(true); });
      sw[k] = b; rowEl[k] = li; noteEl[k] = n; ul.append(li);
    });
    col.append(ul); grid.append(col);
  });
  root.append(...(presetKeys.length ? [pwrap] : []), grid, plan);
  presetSel.addEventListener('change', () => { if (presetSel.value) { chosen.clear(); o.presets[presetSel.value].keys.forEach(k => chosen.add(k)); paint(true); } });

  function state() {
    const cl = closure(caps, [...chosen]), groups = [...new Set(cl.order.map(k => caps[k].group || ''))];
    let valid = true, problem = '';
    if (cl.cycles.length) { valid = false; problem = 'These need each other, so they cannot run: ' + cl.cycles[0].map(k => caps[k].title).join(', ') + '.'; }
    else if (o.exclusive && groups.length > 1) { valid = false; problem = 'Pick ' + groups.map(g => (o.groups[g] || g).toLowerCase()).join(' or ') + ' capabilities, not both.'; }
    return { chosen: [...chosen], included: cl.included, order: cl.order, groups, valid, problem, cycles: cl.cycles };
  }
  function paint(fire) {
    const s = state(), inc = new Set(s.included), need = k => (caps[k].needs || []).map(n => (caps[n] || {}).title || n);
    Object.keys(caps).forEach(k => {
      const on = chosen.has(k) || inc.has(k), locked = inc.has(k) && !chosen.has(k);
      const dependants = s.order.filter(d => d !== k && (caps[d].needs || []).includes(k));
      const lock = on && dependants.length > 0 && !chosen.has(k) ? true : false;
      sw[k].setAttribute('aria-checked', String(on));
      sw[k].setAttribute('aria-disabled', String(lock)); rowEl[k].classList.toggle('kit-cp-inc', locked); rowEl[k].classList.toggle('kit-cp-lock', lock);
      noteEl[k].textContent = locked ? 'Included because ' + dependants.map(d => caps[d].title).join(' and ') + ' needs it' : (caps[k].note ? caps[k].note + '. ' : '') + (need(k).length ? 'Needs ' + need(k).join(', ') : 'No prerequisites');
    });
    plan.className = 'kit-cp-plan ' + (!s.order.length ? 'kit-cp-idle' : s.valid ? 'kit-cp-ok' : 'kit-cp-bad');
    plan.textContent = !s.order.length ? 'Nothing picked yet.' : !s.valid ? s.problem : 'Runs, in order: ' + s.order.map(k => caps[k].title).join(', then ') + '.';
    if (fire && o.onChange) o.onChange(s);
  }
  paint(false);
  return { get: state, set(keys) { chosen.clear(); (keys || []).forEach(k => chosen.add(k)); presetSel.value = ''; paint(false); }, destroy() { root.replaceChildren(); root.classList.remove('kit-cp'); } };
}
Kit.capabilityPicker = Object.freeze({ mount, closure, steps });
})();
/* /part:page.script.kit.capability-picker */
