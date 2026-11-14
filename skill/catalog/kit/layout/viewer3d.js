/* part:page.script.kit.viewer3d */
/**
 * 3D viewer with parameters
 * Kit.viewer3d.mount(root, {params, view, fixed, legend, model, applyView}) shows your model beside an engineering sidebar. You write model(ctx), which builds three.js objects from the parameters with materials taken from the page's colour tokens, and returns the readouts to show with a pass or fail mark and its word. The view controls (an explode slider, layer checkboxes) call applyView without rebuilding. Materials are rebuilt when the theme changes. three.js loads from cdnjs as a pinned module; orbit, pan and zoom are the kit's own, with keyboard and button controls, so there is no import map and no second library. It renders on demand, so a still model costs nothing. Draft check: the source was a bespoke rack designer; its viewer, parameter and readout mechanics were kept and none of its geometry.
 *
 * API (small and stable):
 *   Kit.viewer3d.mount(root, {title, note, params, view, fixed, legend, model, applyView, home, hud, three}) -> Promise<{rebuild(), setParam(id, v), setView(id, v), resetCamera(), destroy()}>
 *     root      an element; give it a height (css --kit-v3-h, default 560px). Above 760px of its own width the sidebar sits to the right (310px), below it goes under the view.
 *     params    [{id, label, value, min, max, step, unit}]   number inputs, in the model's units; read back as ctx.p.<id> (a number; a blank or invalid field counts as 0)
 *     view      [{id, label, type: "range" | "check", value, min, max, step}]   view controls; read back as ctx.view.<id>; they call applyView, not model
 *     fixed     [[label, value]]   dimensions that do not change, shown as a list
 *     legend    [{label, token}]   swatches named by a colour token, e.g. {label: "printed part", token: "--accent"}
 *     model     (ctx) -> {group, parts, readouts}   called on mount, on every parameter input and on a theme change; the old group is disposed
 *                 ctx = {THREE, p, view, tok(name) -> THREE.Color, mat(tokenOrCss, extra) -> MeshStandardMaterial}
 *                 group     the THREE.Object3D to show (added to the scene)
 *                 parts     {name: Object3D}   handed back to applyView
 *                 readouts  [{k, v, ok}]   ok true or false gets a ✓ pass or ✕ fail mark with the word for screen readers; leave ok out for a plain figure
 *     applyView (ctx, built) -> void   move or hide parts from ctx.view (explode distance, layers); called after model() and on every view input
 *     home      {pos: [x, y, z], tgt: [x, y, z]}   the opening camera (default pos [0, 0, 300], tgt [0, 0, 0])
 *     hud       the hint line over the view (default "drag to orbit, wheel to zoom, right-drag or Shift-drag to pan, arrow keys, + and −")
 *     three     the module URL (default https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js)
 *   Keyboard: the view takes the focus; arrows orbit, + and − zoom, 0 resets the camera. The corner buttons do the same for touch. Rendering is on demand (no loop), so a still
 *   model costs nothing, and prefers-reduced-motion has nothing to stop.
 *   If the library or WebGL is unavailable the view says so, the controls stay, and model() is not called (it needs THREE).
 *
 * @id        layout.viewer3d
 * @kind      component
 * @group     Layouts
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A WebGL viewport beside a sidebar of view controls, number parameters, fixed dimensions and readouts that pass or fail; the model rebuilds on input.
 * @tags      3d, three.js, viewer, parametric, cad, readouts, explode, webgl
 * @requires  none
 * @files     kit/layout/viewer3d.css, kit/samples/layout.json
 * @provides  Kit.viewer3d.mount
 * @config    Kit.viewer3d.mount(root, opts) | title, note, params [{id, label, value, min, max, step, unit}], view [{id, label, type range|check, value}], fixed [[k, v]], legend [{label, token}], model(ctx), applyView(ctx, built), home, hud, three
 * @config    model(ctx) | ctx {THREE, p, view, tok(name), mat(token|css, extra)}; return {group, parts, readouts [{k, v, ok}]}
 * @config    network | the three.js module from cdnjs.cloudflare.com (0.160.0)
 * @tokens    --bg --panel --sunk --ink --ink-2 --rule --ok --danger --accent --f-ui --f-mono --seam? --kit-v3-h?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | index.html of a parametric 3D rack viewer | the viewport and sidebar grid, parameters rebuilt on input, readouts with pass/fail colour, the explode slider and layer toggles, and materials rebuilt when the colour scheme changes
 * @preview   {"render": "layout.viewer3d", "samples": ["kit/samples/layout.json#viewer3d"]}
 * @samples   viewer3d
 * @changed   Readouts carry a mark and a hidden word as well as a colour.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let seq = 0, threeP = null;
const loadThree = url => threeP && threeP.url === url ? threeP.p : (threeP = { url, p: import(/* webpackIgnore: true */ url) }).p;

async function mount(root, o) {
  const opt = Object.assign({ params: [], view: [], fixed: [], legend: [], hud: 'Drag to orbit, wheel to zoom, right-drag or Shift-drag to pan. Arrow keys, + and −.', home: { pos: [0, 0, 300], tgt: [0, 0, 0] }, three: THREE_URL }, o);
  const n = ++seq, pid = x => 'kv3-' + n + '-' + x;
  root.classList.add('kit-v3');
  const stage = el('div', 'kit-v3-view'); stage.tabIndex = 0; stage.setAttribute('role', 'application');
  stage.setAttribute('aria-label', (opt.title || '3D model') + '. Arrow keys orbit, plus and minus zoom, zero resets.');
  const hud = el('p', 'kit-v3-hud', opt.hud);
  const tools = el('div', 'kit-v3-tools');
  const tool = (txt, label, fn) => { const b = el('button', null, txt); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', fn); tools.append(b); return b; };
  const fail = el('p', 'kit-v3-fail', 'Loading the 3D view…'); fail.setAttribute('role', 'status');
  stage.append(fail, hud, tools);
  const side = el('aside', 'kit-v3-side'); side.setAttribute('aria-label', 'Parameters and readouts');
  const head = el('div', 'kit-v3-head');
  if (opt.title) head.append(el('h2', 'kit-v3-title', opt.title));
  if (opt.note) head.append(el('p', 'kit-v3-note', opt.note));
  side.append(head);

  const section = (title, node) => { const s = el('section', 'kit-v3-sec'); s.append(el('h3', null, title), node); side.append(s); return s; };
  const view = {}, p = {};
  const viewBox = el('div', 'kit-v3-ctl');
  for (const v of opt.view) {
    view[v.id] = v.value;
    const row = el('div', 'kit-v3-row'); const lab = el('label', null, v.label); lab.htmlFor = pid('v-' + v.id);
    const inp = el('input'); inp.id = pid('v-' + v.id);
    if (v.type === 'check') { inp.type = 'checkbox'; inp.checked = !!v.value; inp.addEventListener('input', () => { view[v.id] = inp.checked; applyView(); }); }
    else { inp.type = 'range'; inp.min = v.min != null ? v.min : 0; inp.max = v.max != null ? v.max : 1; inp.step = v.step || .01; inp.value = v.value != null ? v.value : 0; inp.addEventListener('input', () => { view[v.id] = parseFloat(inp.value); applyView(); }); }
    row.append(lab, inp); viewBox.append(row);
  }
  if (opt.view.length) section('View', viewBox);
  const parBox = el('div', 'kit-v3-ctl'); const parInputs = {};
  for (const q of opt.params) {
    p[q.id] = q.value;
    const row = el('div', 'kit-v3-row'); const lab = el('label', null, q.label); lab.htmlFor = pid('p-' + q.id);
    const inp = el('input', 'kit-v3-num'); inp.id = pid('p-' + q.id); inp.type = 'number'; inp.value = q.value; inp.inputMode = 'decimal';
    if (q.min != null) inp.min = q.min; if (q.max != null) inp.max = q.max; inp.step = q.step || 1;
    if (q.unit) inp.setAttribute('aria-label', q.label + ' (' + q.unit + ')');
    inp.addEventListener('input', () => { p[q.id] = parseFloat(inp.value) || 0; schedule(); });
    parInputs[q.id] = inp; row.append(lab, inp); parBox.append(row);
  }
  if (opt.params.length) section('Parameters' + (opt.params.some(q => q.unit) ? ' (' + [...new Set(opt.params.map(q => q.unit).filter(Boolean))].join(', ') + ')' : ''), parBox);
  if (opt.fixed.length) { const dl = el('dl', 'kit-v3-dl'); for (const [k, v] of opt.fixed) dl.append(el('dt', null, k), el('dd', null, v)); section('Fixed dimensions', dl); }
  const outDl = el('dl', 'kit-v3-dl'); outDl.setAttribute('aria-live', 'polite'); section('Readouts', outDl);
  if (opt.legend.length) { const lg = el('div', 'kit-v3-legend'); for (const l of opt.legend) { const s = el('span', null, l.label); s.style.setProperty('--c', 'var(' + l.token + ')'); lg.append(s); } side.append(lg); }
  root.append(stage, side);

  // ---- three
  let THREE;
  try { THREE = await loadThree(opt.three); }
  catch (e) { fail.textContent = 'The 3D library could not be loaded, so the model is not drawn.'; THREE = null; }
  let renderer = null, scene, camera, built = null, raf = 0, alive = true, dirty = true;
  const target = { x: 0, y: 0, z: 0 }; const orbit = { r: 300, th: 0, ph: Math.PI / 2 };
  const probe = el('i'); probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden'; root.append(probe);
  const cv = document.createElement('canvas'); const g2 = cv.getContext('2d', { willReadFrequently: true });
  const cssRgb = c => { probe.style.color = c; g2.clearRect(0, 0, 1, 1); g2.fillStyle = '#000'; g2.fillStyle = getComputedStyle(probe).color; g2.fillRect(0, 0, 1, 1); const d = g2.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const rgb = name => cssRgb('var(' + name + ')');
  const toColor = a => new THREE.Color().setRGB(a[0] / 255, a[1] / 255, a[2] / 255, THREE.SRGBColorSpace);
  const tok = name => toColor(rgb(name));
  const mat = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: String(c).startsWith('--') ? tok(c) : toColor(cssRgb(c)), roughness: .7, metalness: .05 }, extra));
  const ctx = () => ({ THREE, p, view, tok, mat });

  function place() {
    const sp = Math.sin(orbit.ph), cp = Math.cos(orbit.ph);
    camera.position.set(target.x + orbit.r * sp * Math.sin(orbit.th), target.y + orbit.r * cp, target.z + orbit.r * sp * Math.cos(orbit.th));
    camera.lookAt(target.x, target.y, target.z); dirty = true; draw();
  }
  function setHome() {
    const [px, py, pz] = opt.home.pos, [tx, ty, tz] = opt.home.tgt;
    target.x = tx; target.y = ty; target.z = tz;
    const dx = px - tx, dy = py - ty, dz = pz - tz;
    orbit.r = Math.hypot(dx, dy, dz) || 300; orbit.ph = Math.acos(Math.max(-1, Math.min(1, dy / orbit.r))); orbit.th = Math.atan2(dx, dz);
    if (camera) place();
  }
  function draw() { if (raf || !renderer) return; raf = requestAnimationFrame(() => { raf = 0; if (!alive || !dirty) return; dirty = false; renderer.render(scene, camera); }); }
  function size() { root.toggleAttribute('data-narrow', root.clientWidth < 760); if (!renderer) return; const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; draw(); }
  function dispose(obj) { obj.traverse(c => { if (c.geometry) c.geometry.dispose(); const m = c.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); }); }

  if (THREE) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = 'kit-v3-canvas'; renderer.domElement.setAttribute('aria-hidden', 'true');
      stage.prepend(renderer.domElement); fail.hidden = true;
    } catch (e) { renderer = null; fail.hidden = false; fail.textContent = 'This browser cannot draw WebGL, so the model is not shown.'; }
  }
  if (renderer) {
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x60656a, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-120, 200, 180); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, .6); fill.position.set(150, -50, -200); scene.add(fill);
    setHome();
  }

  function renderReadouts(list) {
    outDl.replaceChildren();
    for (const r of list || []) {
      const dd = el('dd'); if (r.ok != null) dd.className = r.ok ? 'ok' : 'bad';
      if (r.ok != null) { const m = el('span', 'kit-v3-mk', r.ok ? '✓' : '✕'); m.setAttribute('aria-hidden', 'true'); const w = el('span', 'kit-v3-sr', r.ok ? 'pass: ' : 'fail: '); dd.append(m, w); }
      dd.append(document.createTextNode(String(r.v)));
      outDl.append(el('dt', null, r.k), dd);
    }
  }
  function applyView() { if (built && opt.applyView) opt.applyView(ctx(), built); dirty = true; draw(); }
  function rebuild() {
    if (!renderer) return;
    if (built && built.group && scene) { scene.remove(built.group); dispose(built.group); }
    built = opt.model(ctx());
    if (scene && built.group) scene.add(built.group);
    renderReadouts(built.readouts); applyView();
  }
  let pend = 0; function schedule() { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; if (alive) rebuild(); }); }

  // ---- orbit, pan, zoom
  const pts = new Map(); let last = null;
  const onDown = e => { stage.focus({ preventScroll: true }); pts.set(e.pointerId, e); last = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; try { stage.setPointerCapture(e.pointerId); } catch (_) {} };
  const onMove = e => {
    if (!pts.has(e.pointerId) || !last || !renderer) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; last.x = e.clientX; last.y = e.clientY;
    if (last.pan) {
      const k = orbit.r * Math.tan(camera.fov * Math.PI / 360) * 2 / Math.max(1, stage.clientHeight);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      target.x += (-dx * right.x + dy * up.x) * k; target.y += (-dx * right.y + dy * up.y) * k; target.z += (-dx * right.z + dy * up.z) * k;
    } else { orbit.th -= dx * .008; orbit.ph = Math.max(.05, Math.min(Math.PI - .05, orbit.ph - dy * .008)); }
    place();
  };
  const onUp = e => { pts.delete(e.pointerId); if (!pts.size) last = null; };
  const zoom = f => { orbit.r = Math.max(30, Math.min(2000, orbit.r * f)); place(); };
  const onWheel = e => { if (!renderer) return; e.preventDefault(); zoom(Math.exp(e.deltaY * .0012)); };
  const onKey = e => {
    if (!renderer || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key; let used = true;
    if (k === 'ArrowLeft') orbit.th += .12; else if (k === 'ArrowRight') orbit.th -= .12;
    else if (k === 'ArrowUp') orbit.ph = Math.max(.05, orbit.ph - .1); else if (k === 'ArrowDown') orbit.ph = Math.min(Math.PI - .05, orbit.ph + .1);
    else if (k === '+' || k === '=') { zoom(.85); return e.preventDefault(); } else if (k === '-' || k === '_') { zoom(1.18); return e.preventDefault(); }
    else if (k === '0' || k === 'Home') { setHome(); return e.preventDefault(); } else used = false;
    if (used) { e.preventDefault(); place(); }
  };
  tool('+', 'Zoom in', () => zoom(.85)); tool('−', 'Zoom out', () => zoom(1.18)); tool('⟲', 'Reset the camera', () => setHome());
  stage.addEventListener('pointerdown', onDown); stage.addEventListener('pointermove', onMove); stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('wheel', onWheel, { passive: false }); stage.addEventListener('keydown', onKey); stage.addEventListener('contextmenu', e => e.preventDefault());

  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) { ro.observe(stage); ro.observe(root); }
  const redo = () => { if (alive) schedule(); };
  const mm = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null; if (mm) mm.addEventListener('change', redo);
  const mo = new MutationObserver(redo); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  rebuild(); size();
  return {
    rebuild, resetCamera: setHome,
    setParam(id, v) { if (parInputs[id]) { parInputs[id].value = v; p[id] = parseFloat(v) || 0; schedule(); } },
    setView(id, v) { const i = document.getElementById(pid('v-' + id)); if (!i) return; if (i.type === 'checkbox') i.checked = !!v; else i.value = v; view[id] = i.type === 'checkbox' ? !!v : parseFloat(v); applyView(); },
    destroy() { alive = false; if (ro) ro.disconnect(); mo.disconnect(); if (mm) mm.removeEventListener('change', redo); if (built && built.group) dispose(built.group); if (renderer) renderer.dispose(); stage.remove(); side.remove(); probe.remove(); root.classList.remove('kit-v3'); },
    get THREE() { return THREE; }, get webgl() { return !!renderer; },
  };
}

Kit.viewer3d = Object.freeze({ mount });
})();
/* /part:page.script.kit.viewer3d */
