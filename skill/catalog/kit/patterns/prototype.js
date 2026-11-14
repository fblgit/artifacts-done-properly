/* part:page.script.kit.prototype */
/**
 * Prototype stage
 * Kit.proto.stage(host, opts) lays your mock-up out at its real pixel size and scales it to the width of its host. Click it and it takes the keys: you pass onKey (or build it with Kit.proto.keymap, which understands "j", "Shift+L", "Enter" and "1-9"), you re-render on every change, and say() puts the result in a polite live region. Numbered markers (Kit.proto.pin) sit on the mock-up and a legend names them; Kit.proto.keysTable lists every key with the marker it matches, when it works, what it does and where the feedback shows, tinting the keys you added. The mock-up is inert so its own buttons never take the focus; the stage does, with a visible ring and a badge that says the keys are live.
 *
 * What it is: an app mock-up shown at its real size and scaled down to fit, that takes the keyboard once you click it; numbered markers on the mock-up that a legend
 * explains; and a table of every key with where its feedback shows. Plain DOM, no framework. The mock-up is yours: stage() gives it a frame of fixed pixel size and
 * calls your render(frame, api) whenever state changes.
 *
 * API (small and stable):
 *   Kit.proto.stage(host, {width, height, auto, caption, sub, label, render, onKey, pins, legend, live, idle, maxScale, inert, extra}) -> {el, frame, render(), fit(), setPins(on), setSize(w, h), say(text), destroy()}
 *     host      the element to fill; the stage never grows wider than it
 *     width, height   the app's size in px (the frame is laid out at this size, then scaled by min(maxScale, host width / width)); auto: true measures the height from the content
 *     render    (frame, api) -> void   fill frame (innerHTML or DOM); called once and again on every api.render()
 *     onKey     (event, api) -> true when the key was used   (the stage then calls preventDefault); Tab, Shift+Tab and keys with Ctrl, Meta or Alt are never offered
 *     pins      true shows the numbered markers (.kit-pin elements you put in the frame); setPins(false) hides them
 *     legend    [[marker, text]]   a line under the stage naming each marker
 *     live, idle   the badge words while the stage has focus and while it does not (defaults "Keys live. Nothing leaves this page." and "Click to try the keys")
 *     inert     true (default): the mock-up's own buttons and links are not clickable or tabbable; the stage takes the focus and the keys
 *     extra     a node or an array of nodes for the bar above the stage (a segmented control, a width switch)
 *     say(text) puts a sentence in the stage's polite live region (and in the badge), for a screen reader and for a sighted user
 *   Kit.proto.keymap([{keys, when, run}]) -> onKey handler
 *     keys  one or more specs: "j", "ArrowDown", "Shift+L", "1-9" (any digit; run gets the digit as its third argument), "Enter"; Shift counts only when the spec says Shift+
 *     when  (state) -> bool   optional gate;  run  (state, event, key) -> void   the binding. The handler receives the state you pass as keymap(bindings, () => state).
 *   Kit.proto.pin(n, {x, y, label}) -> element   a marker placed in frame pixels (x, y are its centre); append it to the frame in render()
 *   Kit.proto.legend(host, [[marker, text]])    the legend line on its own
 *   Kit.proto.keysTable(host, {groups, label, caption}) -> {table}   groups [{name, source, keys: [{n, chords, when, does, shows, added}]}]
 *     chords  alternatives, each a list of caps: [["j"], ["ArrowDown"]] or [["Shift", "L"]]; n is the marker number it matches; added: true tints the row and tags it "new"
 *
 * @id        pattern.prototype
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   An app mock-up at its real size, scaled to fit, that takes the keyboard when clicked; numbered markers, a legend and a table of every key.
 * @tags      prototype, mock-up, keyboard, shortcuts, markers, scale, keys table, stage
 * @requires  kit.table
 * @files     kit/patterns/prototype.css, kit/samples/patterns.json
 * @provides  Kit.proto.stage, Kit.proto.keymap, Kit.proto.pin, Kit.proto.legend, Kit.proto.keysTable
 * @config    Kit.proto.stage(host, opts) | width, height (or auto), caption, sub, label, render(frame, api), onKey(event, api), pins, legend, live, idle, maxScale, inert, extra
 * @config    Kit.proto.keymap(bindings, getState) | [{keys, when, run}] -> onKey handler; specs "j", "ArrowDown", "Shift+L", "1-9"
 * @config    Kit.proto.pin(n, {x, y, label}) | a marker to append to a positioned element of the mock-up
 * @config    Kit.proto.keysTable(host, {groups, caption, label}) | groups [{name, source, keys: [{n, chords, when, does, shows, added}]}]
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --shadow --f-ui --f-mono --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | YouTuner Uplift, parts and styles | the scaled 1:1 stage, the keyboard-driven triage prototype, the numbered shortcut markers with their legend and the keys inventory table
 * @preview   {"render": "pattern.prototype", "samples": ["kit/samples/patterns.json#prototype"]}
 * @samples   prototype
 * @changed   Markers are --ink on --panel with a --seam ring, not a fixed amber, so they read on any mock-up in both themes.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let seq = 0;

function legend(host, items) {
  const box = el('div', 'kit-proto-legend');
  for (const [n, t] of items || []) { const s = el('span'); s.append(el('span', 'kit-pinref', n), document.createTextNode(t)); box.append(s); }
  if (host) host.append(box);
  return box;
}

function pin(n, o) {
  const p = el('span', 'kit-pin', n);
  const x = o && o.x, y = o && o.y;
  if (x != null) p.style.left = x + 'px';
  if (y != null) p.style.top = y + 'px';
  if (o && o.label) p.setAttribute('aria-label', o.label);
  else p.setAttribute('aria-hidden', 'true');
  return p;
}

function stage(host, opts) {
  const o = Object.assign({ pins: true, maxScale: 1, inert: true, live: 'Keys live. Nothing leaves this page.', idle: 'Click to try the keys', label: 'Prototype' }, opts);
  const id = 'kp' + (++seq);
  let w = o.width, h = o.height;
  const fig = el('figure', 'kit-stage-wrap');
  const bar = el('figcaption', 'kit-stage-bar');
  const lab = el('div', 'kit-stage-lab');
  if (o.caption) lab.append(el('b', null, o.caption));
  if (o.sub) lab.append(el('span', 'kit-stage-sub', o.sub));
  bar.append(lab);
  if (o.extra) { const x = el('div', 'kit-stage-extra'); x.append(...[].concat(o.extra)); bar.append(x); }
  const st = el('div', 'kit-stage');
  st.tabIndex = o.onKey ? 0 : -1;
  st.setAttribute('role', 'group');
  st.setAttribute('aria-label', o.label + (o.onKey ? '. Click it, then use its keys.' : ''));
  const scaler = el('div', 'kit-scaler');
  const frame = el('div', 'kit-frame');
  if (o.inert) frame.inert = true;
  frame.dataset.pins = o.pins ? 'on' : 'off';
  scaler.append(frame); st.append(scaler);
  const live = el('span', 'kit-stage-live', o.live); live.setAttribute('aria-hidden', 'true');
  const idle = el('span', 'kit-stage-idle', o.idle); idle.setAttribute('aria-hidden', 'true');
  if (o.onKey) st.append(live, idle);
  const say = el('p', 'kit-sr'); say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite'); say.id = id + '-say';
  fig.append(bar, st, say);
  if (o.legend) legend(fig, o.legend);
  host.append(fig);

  const api = { el: fig, stage: st, frame, destroy };
  function fit() {
    const room = (host.clientWidth || fig.clientWidth || w);
    let hh = h;
    if (o.auto) { scaler.style.height = 'auto'; hh = frame.scrollHeight || h || 0; }
    const s = Math.min(o.maxScale, room / w);
    scaler.style.width = w + 'px'; scaler.style.height = hh + 'px';
    scaler.style.transform = 'scale(' + s + ')';
    st.style.width = Math.round(w * s) + 'px'; st.style.height = Math.round(hh * s) + 'px';
    st.dataset.scale = s.toFixed(3);
    if (o.onFit) o.onFit(s);
  }
  function render() { if (o.render) o.render(frame, api); if (o.auto) fit(); }
  api.render = render; api.fit = fit;
  api.setPins = on => { frame.dataset.pins = on ? 'on' : 'off'; };
  api.setSize = (nw, nh) => { w = nw; h = nh; fit(); };
  api.say = text => { say.textContent = ''; setTimeout(() => { say.textContent = text; }, 30); live.textContent = text || o.live; };

  const onKey = e => {
    if (!o.onKey || e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (o.onKey(e, api)) e.preventDefault();
  };
  const onBlur = () => { live.textContent = o.live; };
  st.addEventListener('keydown', onKey); st.addEventListener('blur', onBlur);
  const ro = window.ResizeObserver ? new ResizeObserver(() => fit()) : null;
  if (ro) ro.observe(host); else addEventListener('resize', fit);
  render(); fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  function destroy() { if (ro) ro.disconnect(); else removeEventListener('resize', fit); st.removeEventListener('keydown', onKey); fig.remove(); }
  return api;
}

// "Shift+L", "j", "1-9"
function parse(spec) {
  const parts = String(spec).split('+'); const key = parts.pop();
  return { shift: parts.includes('Shift'), key, digit: key === '1-9' };
}
function keymap(bindings, getState) {
  const rows = bindings.map(b => Object.assign({}, b, { specs: [].concat(b.keys).map(parse) }));
  // a match returns the key to hand to run (the digit for "1-9"), or null
  const match = (s, e) => {
    if (s.digit) { const m = /^Digit([1-9])$/.exec(e.code || ''); const d = m ? m[1] : (/^[1-9]$/.test(e.key) ? e.key : null); return d && e.shiftKey === s.shift ? d : null; }
    if (s.shift) return e.shiftKey && e.key.toLowerCase() === s.key.toLowerCase() ? e.key : null;
    if (s.key.length > 1 && e.shiftKey) return null;
    return e.key === s.key ? e.key : null;
  };
  return function (e) {
    const state = getState ? getState() : undefined;
    for (const b of rows) {
      for (const s of b.specs) {
        const k = match(s, e);
        if (k == null || (b.when && !b.when(state))) continue;
        b.run(state, e, k);
        return true;
      }
    }
    return false;
  };
}

function keysTable(host, o) {
  const box = el('div', 'kit-table-box kit-keys-box'); box.setAttribute('role', 'region'); box.tabIndex = 0;
  box.setAttribute('aria-label', o.label || o.caption || 'Keys');
  const t = el('table', 'kit-table kit-keys');
  if (o.caption) t.append(el('caption', null, o.caption));
  const head = el('thead'); const hr = el('tr');
  for (const c of ['No.', 'Keys', 'When', 'What it does', 'Where the feedback shows']) hr.append(el('th', null, c));
  head.append(hr); t.append(head);
  for (const g of o.groups || []) {
    const tb = el('tbody');
    const gr = el('tr', 'kit-group'); const gh = el('th', null, g.name); gh.colSpan = 5;
    if (g.source) gh.append(el('span', 'kit-group-n', g.source));
    gr.append(gh); tb.append(gr);
    for (const k of g.keys || []) {
      const r = el('tr', k.added ? 'kit-hl' : null);
      const n = el('td', 'kit-keys-n'); n.append(el('span', 'kit-pinref', k.n)); r.append(n);
      const caps = el('td'); const cc = el('div', 'kit-caps');
      (k.chords || []).forEach((chord, i) => {
        if (i) cc.append(el('i', 'kit-caps-or', 'or'));
        chord.forEach((c, j) => { if (j) cc.append(el('i', 'kit-caps-plus', '+')); cc.append(el('kbd', 'kit-key', c)); });
      });
      caps.append(cc); r.append(caps);
      r.append(el('td', 'kit-keys-when', k.when || ''));
      const d = el('td', null, k.does || ''); if (k.added) d.append(el('span', 'kit-tag', 'new')); r.append(d);
      r.append(el('td', 'kit-keys-shows', k.shows || ''));
      tb.append(r);
    }
    t.append(tb);
  }
  box.append(t); host.append(box);
  return { table: t, box };
}

Kit.proto = Object.freeze({ stage, keymap, pin, legend, keysTable });
})();
/* /part:page.script.kit.prototype */
