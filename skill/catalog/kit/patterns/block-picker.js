/* part:page.script.kit.block-picker */
/**
 * Block picker
 * Kit.blockPicker.open({titles, hashOf, quoteMax, root}) dims the page around one [data-part] block at a time with a ring and a tag that names it (the page's title for the part, else its heading, else its id; a repeated item adds its key), and puts a small bar at the bottom of the screen with the name, its place (3 of 9), Pick this block, Previous, Next and Cancel. Hover moves the ring and a click picks; on a touch screen the first tap moves the ring and Pick this block confirms. From the keyboard the arrows move, Home and End jump, Enter picks and Esc leaves; focus stays in the bar while it is open and goes back where it was after. Each move is announced. The promise resolves {id, label, hash, quote, el} (the quote is the block's text, whitespace collapsed, at most 600 characters) or null. Blocks inside [data-uncommentable] or [data-assist-ui] are never offered, so the panel cannot pick itself. The assist engine's pick() opens it when it is loaded and binds the shortcut itself; on a page without the engine, bind({shortcut: 'Mod+Shift+K', onPick}) adds the key (ignored while typing). At 390 px the bar spans the screen above the safe area and its buttons go full width. It reads nothing and writes nothing.
 *
 * The way a person points at one block of the page before saying what they want about it. Opening it dims the page around one [data-part] block at a time, names it on a
 * tag beside it, and puts a small bar at the bottom of the screen: the block's name and place (block 3 of 9), Previous, Next, Pick this block and Cancel. Hover moves the lens; a click
 * picks the block under the pointer (on a touch screen the first tap moves the lens and Pick this block confirms). From the keyboard: arrows move, Home and End jump, Enter picks, Esc
 * leaves; focus sits in the bar and returns where it was. Each move is announced. The pick is {id, label, hash, quote, el}: the part id (with :key for a repeated item), its title,
 * its content hash when the page knows it, and its text, whitespace collapsed and cut at quoteMax characters.
 * Kit.assist's engine.pick() opens this when it is loaded and binds the shortcut itself; bind() is for a page without the engine (do not use both, or the key fires twice).
 *
 * API:
 *   Kit.blockPicker.open(opts) -> Promise<{id, label, hash, quote, el} | null>   null when the person leaves; a second open() while one is open returns the same promise
 *     titles     {partId: title} (ADP.page's titles)          hashOf(el) -> hash ('' when unknown; default el.dataset.hash)
 *     root       where to look for blocks (default document)  skip  selector of blocks never offered (default "[data-uncommentable], [data-assist-ui]")
 *     quoteMax   characters of quote (default 600)            start  element or part id to open on (default: the block holding focus, else the first one on screen)
 *     words      {title, of, prev, next, pick, cancel, none, keys}   the bar's words
 *   Kit.blockPicker.bind({shortcut: "Mod+Shift+K", onPick(pick), open: opts}) -> {unbind()}   a global key that opens the picker (ignored while typing in a field)
 *   Kit.blockPicker.isOpen() -> bool;   Kit.blockPicker.close() leaves with null
 *
 * @id        pattern.block-picker
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   Point at one block of the page before saying what you want about it: the page dims around one [data-part] block at a time, a bar names it, and Enter, a click or Pick this block returns its id, title, hash and text.
 * @tags      block, picker, select, quote, shortcut, keyboard, assist, claude, data-part, scope
 * @requires  kit.tokens, kit.dom
 * @files     kit/patterns/block-picker.css, kit/samples/patterns.json
 * @provides  Kit.blockPicker.open, Kit.blockPicker.bind, Kit.blockPicker.isOpen, Kit.blockPicker.close, Kit.blockPicker.keyLabel, Kit.blockPicker.matches
 * @config    Kit.blockPicker.open(opts) | titles {part id: title}, hashOf(el) -> hash, root (default document), skip (selector never offered), quoteMax (default 600), start (element or part id), words {title, of, prev, next, pick, cancel, none, keys}; resolves {id, label, hash, quote, el} or null
 * @config    Kit.blockPicker.bind(opts) | shortcut (default Mod+Shift+K), onPick(pick), open (the options for open); returns {unbind}. Not on a page that runs the assist engine, which binds the key itself
 * @tokens    --panel --ink --ink-2 --rule --accent --accent-ink? --f-ui --f-mono --seam? --shadow?
 * @globals   none
 * @db        none
 * @source    Catalog batch 16, 2026-10-26 | the runtime's comment mode | the crosshair over [data-part], titles from the page, the part:key anchor
 * @source    Catalog batch 16, 2026-10-26 | a drafting board's request lane | what it lacked: a block quote and a shortcut to point at a block
 * @preview   {"render": "pattern.block-picker", "samples": ["kit/samples/patterns.json#block-picker"]}
 * @changed   One block at a time with a ring and a dimmed page, instead of a crosshair over every block.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = Kit.dom.el;
const WORDS = { title: 'Pick a block', of: 'of', prev: 'Previous', next: 'Next', pick: 'Pick this block', cancel: 'Cancel', none: 'This page has no blocks to pick.', keys: 'Arrows move, Enter picks, Esc leaves' };
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => !window.matchMedia || matchMedia('(pointer: fine)').matches;
let cur = null;

function idOf(b) { return b.dataset.part + (b.dataset.partKey ? ':' + b.dataset.partKey : ''); }
function labelOf(b, titles) {
  const t = (titles && titles[b.dataset.part]) || b.dataset.title || b.getAttribute('aria-label') || ((b.querySelector('h1,h2,h3,h4,legend,caption') || {}).textContent || '').trim() || b.dataset.part;
  return (t + (b.dataset.partKey ? ', ' + b.dataset.partKey : '')).replace(/\s+/g, ' ').slice(0, 120);
}
function quoteOf(b, max) { const s = String(b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; }
function onScreen(b) { const r = b.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }

function open(opts) {
  if (cur) return cur.promise;
  const o = Object.assign({ root: document, skip: '[data-uncommentable], [data-assist-ui]', quoteMax: 600 }, opts);
  const w = Object.assign({}, WORDS, o.words);
  const blocks = Array.from(o.root.querySelectorAll('[data-part]')).filter(b => !b.closest(o.skip) && b.getClientRects().length);
  const back = document.activeElement;
  let done, i = 0;
  const promise = new Promise(r => { done = r; });
  const lens = el('div', 'kit-bp-lens'); lens.setAttribute('aria-hidden', 'true');
  const tag = el('div', 'kit-bp-tag'); tag.setAttribute('aria-hidden', 'true');
  const bar = el('div', 'kit-bp-bar'); bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', w.title); bar.setAttribute('data-assist-ui', '');
  const head = el('p', 'kit-bp-head'); const name = el('b', 'kit-bp-name'); const pos = el('span', 'kit-bp-pos');
  head.append(el('span', 'kit-bp-ttl', w.title), name, pos);
  const live = el('p', 'kit-bp-live'); live.setAttribute('aria-live', 'polite');
  const keys = el('p', 'kit-bp-keys', w.keys);
  const row = el('div', 'kit-bp-row');
  const btn = (t, cls, fn) => { const b = el('button', 'kit-bp-btn ' + cls, t); b.type = 'button'; b.addEventListener('click', fn); row.append(b); return b; };
  const bPrev = btn(w.prev, 'ghost', () => move(-1)), bNext = btn(w.next, 'ghost', () => move(1));
  const bPick = btn(w.pick, 'go', () => pick()); btn(w.cancel, 'ghost', () => finish(null));
  bar.append(head, row, keys, live);
  document.documentElement.classList.add('kit-bp-on');
  document.body.append(lens, tag, bar);

  function place() {
    const b = blocks[i]; if (!b) return;
    const r = b.getBoundingClientRect();
    Object.assign(lens.style, { top: r.top - 4 + 'px', left: r.left - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    const tt = Math.max(4, r.top - 30); Object.assign(tag.style, { top: (tt + 28 > innerHeight ? 4 : tt) + 'px', left: Math.max(4, Math.min(r.left, innerWidth - 240)) + 'px' });
  }
  function show(n, say) {
    if (!blocks.length) return;
    i = (n + blocks.length) % blocks.length;
    const b = blocks[i], lab = labelOf(b, o.titles);
    tag.textContent = lab; name.textContent = lab; pos.textContent = (i + 1) + ' ' + w.of + ' ' + blocks.length;
    blocks.forEach(x => x.classList.toggle('kit-bp-cur', x === b));
    if (!onScreen(b) || b.getBoundingClientRect().top < 0) b.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    place(); if (say) live.textContent = lab + ', ' + pos.textContent;
  }
  function move(d) { show(i + d, true); }
  function pick(b) {
    b = b || blocks[i]; if (!b) return finish(null);
    let hash = ''; try { hash = (o.hashOf ? o.hashOf(b) : b.dataset.hash) || ''; } catch (_) { hash = ''; }
    finish({ id: idOf(b), label: labelOf(b, o.titles), hash, quote: quoteOf(b, o.quoteMax), el: b });
  }
  function finish(v) {
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointermove', onMove, true); document.removeEventListener('click', onClick, true);
    removeEventListener('scroll', place, true); removeEventListener('resize', place);
    blocks.forEach(x => x.classList.remove('kit-bp-cur')); document.documentElement.classList.remove('kit-bp-on');
    lens.remove(); tag.remove(); bar.remove(); cur = null;
    if (back && back.focus && document.contains(back)) back.focus();
    done(v);
  }
  const blockAt = t => { const b = t && t.closest && !t.closest('.kit-bp-bar') ? t.closest('[data-part]') : null; return b && blocks.includes(b) ? b : null; };
  function onMove(e) { const b = blockAt(e.target); if (b && b !== blocks[i]) show(blocks.indexOf(b), false); }
  function onClick(e) {
    const b = blockAt(e.target); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (fine() || b === blocks[i]) pick(b); else show(blocks.indexOf(b), true);
  }
  function onKey(e) {
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); return; }
    if (k === 'Tab') { const f = Array.from(row.children), a = f.indexOf(document.activeElement); if (a < 0 || (e.shiftKey && a === 0) || (!e.shiftKey && a === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); } return; }
    const m = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[k];
    if (m) { e.preventDefault(); move(m); return; }
    if (k === 'Home' || k === 'End') { e.preventDefault(); show(k === 'Home' ? 0 : blocks.length - 1, true); return; }
    if (k === 'Enter' && !(document.activeElement && row.contains(document.activeElement))) { e.preventDefault(); pick(); }
  }
  if (!blocks.length) { name.textContent = w.none; bPrev.hidden = bNext.hidden = bPick.hidden = true; lens.hidden = tag.hidden = true; }
  else {
    const s = typeof o.start === 'string' ? blocks.findIndex(b => idOf(b) === o.start || b.dataset.part === o.start) : o.start ? blocks.indexOf(o.start.closest ? o.start.closest('[data-part]') : o.start) : -1;
    const f = back && back.closest ? blocks.indexOf(back.closest('[data-part]')) : -1;
    show(s >= 0 ? s : f >= 0 ? f : Math.max(0, blocks.findIndex(onScreen)), false);
    live.textContent = w.title + ': ' + name.textContent + ', ' + pos.textContent + '. ' + w.keys;
  }
  document.addEventListener('keydown', onKey, true); document.addEventListener('pointermove', onMove, true); document.addEventListener('click', onClick, true);
  addEventListener('scroll', place, true); addEventListener('resize', place);
  (blocks.length ? bPick : row.lastChild).focus({ preventScroll: true });
  cur = { promise, close: () => finish(null) };
  return promise;
}

function matches(e, sc) {
  const parts = String(sc || 'Mod+Shift+K').toLowerCase().split('+'), key = parts.pop();
  const mod = parts.includes('mod'), mac = /mac|iphone|ipad/i.test(navigator.platform || '');
  return e.key && e.key.toLowerCase() === key && !!e.shiftKey === parts.includes('shift') && !!e.altKey === parts.includes('alt')
    && (mod ? (mac ? e.metaKey : e.ctrlKey) : (!!e.ctrlKey === parts.includes('ctrl') && !!e.metaKey === parts.includes('meta')));
}
function bind(b) {
  const o = Object.assign({ shortcut: 'Mod+Shift+K' }, b);
  const h = e => {
    if (!matches(e, o.shortcut) || cur) return;
    e.preventDefault(); open(o.open || {}).then(p => { if (p && o.onPick) o.onPick(p); });
  };
  document.addEventListener('keydown', h);
  return { unbind: () => document.removeEventListener('keydown', h) };
}
function keyLabel(sc) { const mac = /mac|iphone|ipad/i.test(navigator.platform || ''); return String(sc || 'Mod+Shift+K').split('+').map(p => p.toLowerCase() === 'mod' ? (mac ? '⌘' : 'Ctrl') : p.toLowerCase() === 'shift' && mac ? '⇧' : p.length === 1 ? p.toUpperCase() : p).join(mac ? '' : '+'); }

Kit.blockPicker = Object.freeze({ open, bind, matches, keyLabel, isOpen: () => !!cur, close: () => { if (cur) cur.close(); } });
})();
/* /part:page.script.kit.block-picker */
