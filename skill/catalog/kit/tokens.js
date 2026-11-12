/* part:page.script.kit.tokens */
/**
 * Theme tokens contract
 * Kit css never defines a palette; the board does. Kit.tokens.contract(part) lists the names a kit file reads, check(parts) reports the ones the page leaves undefined, themeCss({light, dark}) writes :root, the guarded prefers-color-scheme block and :root[data-theme="dark"], and read(names) resolves properties for code that paints (canvas, svg), dropping its cache when the theme changes. The names are the Journey Whiteboard’s; a shared vocabulary is an open question for the owner.
 *
 * What it is: the theme contract between the kit and a board. The kit css files read named custom properties and never define a palette; the board defines them
 * (light on :root, dark under prefers-color-scheme guarded by :root:not([data-theme="light"]) and again under :root[data-theme="dark"]).
 * This file helps with that: themeCss() writes those three blocks from two maps (so a board can keep its palette as data), contract() lists the properties each kit
 * file consumes, check() reports the ones the page does not define, read() resolves properties for code that paints (canvas, svg) and drops its cache when the theme changes.
 * Which names a shared palette should use is an open question (the names here are the Journey Whiteboard's); nothing in the kit renames a board's tokens.
 *
 * @id        kit.tokens
 * @group     Board kit
 * @status    new
 * @version   0.1.1
 * @updated   2026-10-24
 * @summary   The contract between kit css and a board’s palette: which custom properties each kit file reads, a check for missing ones, and the three theme blocks written from two maps.
 * @tags      tokens, theme, palette, custom properties, dark mode, contract, css
 * @requires  none
 * @provides  Kit.tokens.contract, Kit.tokens.check, Kit.tokens.themeCss, Kit.tokens.read, Kit.tokens.onTheme
 * @config    themeCss({light, dark}) | {"--name": "value"} maps
 * @config    check([part, …]) | the kit parts in use: chrome, claude-lane, canvas, md
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const CONTRACT = {
  chrome: ['--panel', '--ink', '--ink-2', '--ink-3', '--rule', '--rule-2', '--sunk', '--accent', '--accent-ink', '--accent-soft', '--danger', '--ok', '--warn', '--shadow', '--f-ui', '--f-mono', '--f-display'],
  'claude-lane': ['--panel', '--rule', '--accent', '--accent-soft', '--ok', '--warn', '--sunk', '--ink', '--ink-2', '--danger'],
  canvas: ['--canvas', '--dot', '--panel', '--rule', '--rule-2', '--sunk', '--accent', '--accent-soft', '--accent-ink', '--ink', '--ink-2', '--shadow', '--sticky-ink', '--f-ui', '--f-hand', '--f-mono', '--f-display'],
  md: ['--sunk', '--rule', '--ink-2'],
  'glaze-surfaces': ['--panel', '--sunk', '--ink', '--ink-2', '--ink-3', '--accent', '--accent-ink', '--f-ui', '--f-mono', '--sunk-2', '--shade', '--rim', '--pool', '--well', '--scrim', '--hi', '--lo', '--glyph-drop', '--edge', '--edge-gold', '--lac-rim', '--danger-edge', '--on-accent', '--gold', '--seam-0', '--seam-1', '--seam-2', '--seam-3', '--seam-4', '--ok-bead', '--warn-bead', '--danger-bead', '--info-bead', '--wait-bead', '--ok-ink', '--warn-ink', '--danger-ink', '--info-ink', '--wait-ink', '--on-state', '--pebble-hi', '--speck-opacity', '--speck-invert', '--log-bg', '--log-ink', '--log-ok', '--log-warn', '--log-bad', '--log-dim', '--identity', '--identity-soft', '--identity-ink', '--kind-1', '--kind-2', '--kind-3', '--kind-4', '--glz-r-s', '--glz-r-m', '--glz-r-l', '--glz-r-xl', '--glz-sh-1', '--glz-sh-2'],
};
const block = (sel, map) => sel + ' { ' + Object.entries(map).map(([k, v]) => k + ': ' + v + ';').join(' ') + ' }';
let cache = null; const watchers = [];
function drop() { cache = null; watchers.forEach(f => { try { f(); } catch (_) {} }); }
if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drop); } catch (_) {} }
new MutationObserver(drop).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
Kit.tokens = Object.freeze({
  contract: (part) => part ? (CONTRACT[part] || []).slice() : Object.fromEntries(Object.entries(CONTRACT).map(([k, v]) => [k, v.slice()])),
  themeCss({ light = {}, dark = {} }) {
    const darkMap = Object.assign({}, dark, { 'color-scheme': 'dark' });
    return [block(':root', Object.assign({ 'color-scheme': 'light' }, light)),
      '@media (prefers-color-scheme: dark) { ' + block(':root:not([data-theme="light"])', darkMap) + ' }',
      block(':root[data-theme="dark"]', darkMap)].join('\n');
  },
  check(parts) {
    const cs = getComputedStyle(document.documentElement), missing = [];
    for (const p of parts || Object.keys(CONTRACT)) for (const n of CONTRACT[p] || []) if (!cs.getPropertyValue(n).trim()) missing.push(p + ': ' + n);
    return missing;
  },
  read(names, fallback = '#888') {
    if (!cache) { const cs = getComputedStyle(document.documentElement); cache = {}; }
    const out = {}; for (const n of names) { if (!(n in cache)) cache[n] = getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fallback; out[n] = cache[n]; }
    return out;
  },
  onTheme(fn) { watchers.push(fn); },
});
})();
/* /part:page.script.kit.tokens */
