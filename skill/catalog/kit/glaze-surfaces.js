/* part:page.script.kit.glaze-surfaces */
/**
 * Glaze surfaces
 * Shape and light for the Glaze look, all from tokens: kit-orb (a breathing bead, a hollow ring for waiting), kit-chip, kit-btn (primary lacquer, ghost, danger, small, icon, loading), kit-field with kit-input, kit-select and kit-area, kit-switch, kit-seg, kit-card, kit-facts, kit-row, kit-ava and kit-empty. A state is a cascade: put kit-is-ok, kit-is-warn, kit-is-bad, kit-is-info, kit-is-wait or kit-is-idle on any part or ancestor. Kit.glaze adds the three things CSS cannot: the svg defs for the gold and pebble gradients and the fleck filter, the switch and segmented-control wiring, and a button's busy state. The fleck layer is opt in. Without theme.glaze-depth every part falls back to a flat look from the contract tokens. Motion is short, answers an action, and stops under prefers-reduced-motion.
 *
 * API (small and stable):
 *   Kit.glaze.defs(host?) -> {gold, pebble, speckle}   once per page: adds a hidden svg (to host or document.body) with a gold gradient (#kit-g-gold), a pebble gradient (#kit-g-pebble;
 *                                                      fill/stroke="url(#kit-g-gold)") and the fleck filter (#kit-speckle). Colours come from --seam-0..4 and --pebble-hi (css variables). Safe to call twice.
 *   Kit.glaze.speck(parent, {fixed}) -> Element        adds a .kit-speck layer to parent (positioned) and runs defs()
 *   Kit.glaze.tone(el, "ok"|"warn"|"bad"|"info"|"wait"|"idle"|null)   sets the kit-is-* class on el (null clears)
 *   Kit.glaze.switchOf(btn, {checked, onChange(bool)}) -> {get(), set(bool), destroy()}   a button.kit-switch as role=switch
 *   Kit.glaze.segOf(box, {value, onChange(id)})        -> {get(), set(id), destroy()}   buttons with data-id inside .kit-seg; one pressed; arrow keys move
 *   Kit.glaze.busy(btn, on, {label})                   toggles kit-loading, aria-busy and aria-disabled on a button; label (optional) replaces its text while busy
 *
 * The optional tokens are the ones theme.glaze-depth sets.
 * Also provides (not globals): the classes .kit-orb .kit-chip .kit-btn .kit-field .kit-switch .kit-seg .kit-card .kit-row .kit-ava .kit-empty.
 *
 * @id        kit.glaze-surfaces
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Porcelain-made parts in CSS: glossy beads, lacquer buttons, sunken fields, a switch, soft rows, lit cards with a pooled foot, an avatar disc and the kiln fleck layer.
 * @tags      glaze, button, orb, chip, switch, segmented, card, row, avatar, empty state, porcelain, fleck
 * @requires  theme.glaze-depth, kit.tokens
 * @files     kit/glaze-surfaces.css, kit/samples/glaze-surfaces.json
 * @provides  Kit.glaze.defs, Kit.glaze.speck, Kit.glaze.tone, Kit.glaze.switchOf, Kit.glaze.segOf, Kit.glaze.busy
 * @config    classes | kit-orb, kit-chip, kit-btn, kit-input, kit-switch, kit-seg, kit-card, kit-facts, kit-row, kit-ava, kit-empty; the state on the part or an ancestor: kit-is-ok | warn | bad | info | wait | idle
 * @config    Kit.glaze.defs(host?) | writes the gold and pebble gradients and the fleck filter into a hidden svg; call once before using kit-speck or url(#kit-g-gold)
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --accent-soft --ok --warn --danger --f-ui --f-mono --danger-bead? --danger-edge? --danger-ink? --danger-soft? --edge? --edge-gold? --f-display? --glyph-drop? --glz-r-l? --glz-r-m? --glz-sh-1? --glz-sh-2? --gold? --hi? --info? --info-bead? --info-ink? --info-soft? --lac-rim? --lo? --ok-bead? --ok-ink? --ok-soft? --on-accent? --on-state? --pebble-hi? --pool? --rim? --seam? --shade? --speck-invert? --speck-opacity? --sunk-2? --wait? --wait-bead? --wait-ink? --wait-soft? --warn-bead? --warn-ink? --warn-soft? --seam-<n>?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's Glaze design system | orb, chip, button, forms, switch, segmented control, card, facts, row, avatar, empty state, the kiln flecks, the gold and pebble gradients
 * @source    Catalog harvest, 2026-10-25 | the same console's controls add-on | button and form edges, the loading button
 * @preview   {"render": "kit.glaze-surfaces", "samples": ["kit/samples/glaze-surfaces.json"]}
 * @changed   Re-prefixed to kit-, scoped by the kit's token contract instead of a skin attribute; every depth token has a fallback built from the contract tokens.
 * @changed   The chip text is the -ink of its meaning on the -soft tint (not the bead), so it reads at 4.5:1.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const TONES = { ok: 'kit-is-ok', warn: 'kit-is-warn', bad: 'kit-is-bad', info: 'kit-is-info', wait: 'kit-is-wait', idle: 'kit-is-idle' };
let defsEl = null;

function defs(host) {
  if (defsEl && defsEl.isConnected) return { gold: 'kit-g-gold', pebble: 'kit-g-pebble', speckle: 'kit-speckle' };
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  const stops = [0, 1, 2, 3, 4].map(i => '<stop offset="' + (i * 25) + '%" style="stop-color:var(--seam-' + i + ',var(--seam,currentColor))"/>').join('');
  s.innerHTML = '<defs>'
    + '<linearGradient id="kit-g-gold" x1="0" y1="0" x2="1" y2="1">' + stops + '</linearGradient>'
    + '<radialGradient id="kit-g-pebble" cx="34%" cy="26%" r="80%"><stop offset="0%" style="stop-color:var(--pebble-hi,var(--panel))"/><stop offset="55%" style="stop-color:var(--panel)"/><stop offset="100%" style="stop-color:var(--sunk)"/></radialGradient>'
    + '<filter id="kit-speckle" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="n"/>'
    + '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 -6.4"/></filter></defs>';
  (host || document.body).appendChild(s); defsEl = s;
  return { gold: 'kit-g-gold', pebble: 'kit-g-pebble', speckle: 'kit-speckle' };
}
function speck(parent, o) {
  defs(); const d = document.createElement('div'); d.className = 'kit-speck' + (o && o.fixed ? ' kit-fixed' : ''); d.setAttribute('aria-hidden', 'true');
  parent.insertBefore(d, parent.firstChild); return d;
}
function tone(el, t) { Object.values(TONES).forEach(c => el.classList.remove(c)); if (t && TONES[t]) el.classList.add(TONES[t]); return el; }

function switchOf(btn, o) {
  o = o || {}; btn.classList.add('kit-switch'); btn.setAttribute('role', 'switch'); if (!btn.hasAttribute('type')) btn.type = 'button';
  const set = (v, quiet) => { btn.setAttribute('aria-checked', v ? 'true' : 'false'); if (!quiet && o.onChange) o.onChange(!!v); };
  const get = () => btn.getAttribute('aria-checked') === 'true';
  const click = () => set(!get());
  btn.addEventListener('click', click); set(!!o.checked, true);
  return { get, set: v => set(v, true), destroy() { btn.removeEventListener('click', click); } };
}
function segOf(box, o) {
  o = o || {}; const btns = () => [...box.querySelectorAll('button[data-id]')];
  box.classList.add('kit-seg'); box.setAttribute('role', 'group');
  const set = (id, quiet) => { btns().forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false')); if (!quiet && o.onChange) o.onChange(id); };
  const get = () => { const b = btns().find(x => x.getAttribute('aria-pressed') === 'true'); return b ? b.dataset.id : null; };
  const click = e => { const b = e.target.closest('button[data-id]'); if (b && box.contains(b)) set(b.dataset.id); };
  const key = e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const l = btns(), i = l.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = l[(i + (e.key === 'ArrowRight' ? 1 : l.length - 1)) % l.length]; n.focus(); set(n.dataset.id);
  };
  box.addEventListener('click', click); box.addEventListener('keydown', key); set(o.value != null ? o.value : (btns()[0] || {}).dataset && btns()[0].dataset.id, true);
  return { get, set: id => set(id, true), destroy() { box.removeEventListener('click', click); box.removeEventListener('keydown', key); } };
}
function busy(btn, on, o) {
  if (on) { if (o && o.label != null && btn.dataset.kitIdle == null) { btn.dataset.kitIdle = btn.textContent; btn.textContent = o.label; } }
  else if (btn.dataset.kitIdle != null) { btn.textContent = btn.dataset.kitIdle; delete btn.dataset.kitIdle; }
  btn.classList.toggle('kit-loading', !!on); btn.setAttribute('aria-busy', on ? 'true' : 'false'); btn.setAttribute('aria-disabled', on ? 'true' : 'false');
}
Kit.glaze = Object.freeze({ defs, speck, tone, switchOf, segOf, busy });
})();
/* /part:page.script.kit.glaze-surfaces */
