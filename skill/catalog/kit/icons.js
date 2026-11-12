/* part:page.script.kit.iconset */
/* Kit component: icon map (Kit.iconset)    kit version 0.1.0    extends kit/chrome.js
   What it is: a second inline-SVG icon set for everyday interface glyphs (transport, search, check, alert, keyboard, list, home, link and more), as one map of path data that
   comes out as a string, an element or a ready preact vnode in three variants: line (stroke only), fill (closed shapes filled) and duo (closed shapes tinted, outline on top).
   Kit.icons, which kit/chrome.js freezes, keeps the canvas tools and is not changed; Kit.iconset sits beside it, and iconset.get() tries its own map first and
   falls back to Kit.icons when it has the name, so a board can ask one place. Icons use currentColor only: they take the colour of the text around them.
   API (small and stable):
     Kit.iconset.svg(name, {variant, size, label, stroke, cls}) -> string   variant "line" (default) | "fill" | "duo"; size px (default 16); label makes it an image for assistive tech, otherwise aria-hidden
     Kit.iconset.el(name, opts) -> SVGElement         the same, built with DOM
     Kit.iconset.get(name, opts) -> string | vnode    own icon as a string; a chrome icon as the vnode chrome already holds; null when neither knows the name
     Kit.iconset.html(name, opts) -> vnode            for htm/preact: a span holding the svg (needs window.htmPreact)
     Kit.iconset.names -> [string]                    every name, in the order of the map
     Kit.iconset.register({name: "<path data markup>"}) -> void   add or replace icons (24 × 24 grid, no fill or stroke attributes on the paths); a board's own glyphs go here
   Needs from the board:
     css     none (the svg carries its own size, fill and stroke); the colour is the text colour around it
     globals window.htmPreact for html() only; kit/chrome.js for the get() fallback only
   db collections: none.
   Lifted from: the YouTuner Uplift page's inline icon map (P, ic, icFill, ic2): its 24-grid paths, kept without the video-site mark. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const MAP = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  prev: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  next: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  spark: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  grid: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  keyboard: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  disc: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
const NAMES = Object.keys(MAP);
function inner(name, variant) {
  const d = MAP[name]; if (d == null) return null;
  if (variant === 'fill') return '<g fill="currentColor">' + d + '</g>';
  if (variant === 'duo') return '<g fill="currentColor" fill-opacity=".18">' + d + '</g>';
  return d;
}
function svg(name, o) {
  const opt = Object.assign({ variant: 'line', size: 16, stroke: 1.75 }, o);
  const body = inner(name, opt.variant); if (body == null) return '';
  const a11y = opt.label ? ' role="img" aria-label="' + String(opt.label).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';') + '"' : ' aria-hidden="true"';
  // the fill group paints the shapes; the stroke is on the svg, so every variant keeps its outline
  return '<svg class="kit-ic' + (opt.cls ? ' ' + opt.cls : '') + '" width="' + opt.size + '" height="' + opt.size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + opt.stroke + '" stroke-linecap="round" stroke-linejoin="round" focusable="false"' + a11y + '>' + body + '</svg>';
}
function el(name, o) {
  const t = document.createElement('template'); t.innerHTML = svg(name, o).trim(); return t.content.firstChild;
}
function get(name, o) {
  if (MAP[name] != null) return svg(name, o);
  return (Kit.icons && Kit.icons[name]) || null;
}
function html(name, o) {
  const { html: h } = window.htmPreact;
  const s = svg(name, o);
  return h`<span class="kit-ic-wrap" style="display:inline-flex;line-height:0" dangerouslySetInnerHTML=${{ __html: s }}></span>`;
}
function register(map) { for (const [k, v] of Object.entries(map || {})) { if (MAP[k] == null) NAMES.push(k); MAP[k] = String(v); } }
Kit.iconset = Object.freeze({ svg, el, get, html, register, names: NAMES });
})();
/* /part:page.script.kit.iconset */
