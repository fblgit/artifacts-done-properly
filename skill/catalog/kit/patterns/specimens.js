/* part:page.script.kit.specimens */
/* Kit pattern: states specimen sheet (Kit.specimens)    kit version 0.1.0
   What it is: every state of one component laid out side by side (default, hover, focus, busy, disabled, done, loading, empty, missing), and a switch that repaints
   the whole sheet in another skin. A reviewer sees all the states at once instead of provoking each one. Plain DOM, no framework.
   The sheet cannot make a real :hover or :focus, so the component styles its states twice: once as :hover / :focus-visible, once as [data-state="hover"] / [data-state="focus"].
   Each specimen cell carries data-state="<its state>" and the component reads it.
   API (small and stable):
     Kit.specimens.mount(host, {title, skins, skin, groups, replay, label, onSkin}) -> {setSkin(id), skin(), replayMotion(), destroy()}
       skins   [{id, label, vars: {"--s-bg": "#…", …}}]   a skin is a map of custom properties, applied to the sheet only (the page's own theme is untouched). One skin: no switch.
       skin    the id to open on (default the first)
       groups  [{title, layout: "rows" | "grid", cols, items: [{label, caption, state, render(cell, {skin}) | html | node}]}]
                 rows  a label column beside each specimen;  grid  captioned cells in cols columns (default 3; one column when narrow)
                 html  is trusted markup you wrote;  render  may return a node to append
       replay  true adds a "Replay motion" button; it restarts every element marked data-fx (class "fx" removed, reflow, added), so a one-shot animation can be watched again
       label   the aria-label of the skin switch (default "Skin")
       onSkin  (id) after the skin changes
     Helpers in the css: .kit-spec-skel (a skeleton bar), .kit-spec-empty (an empty-state box with a dashed edge), both in the sheet's own colours.
   The sheet reads --s-bg --s-panel --s-ink --s-ink-2 --s-line --s-radius from the active skin and falls back to the page's --panel --sunk --ink --ink-2 --rule.
   Needs from the board:
     css     kit/patterns/specimens.css; custom properties --panel --sunk --ink --ink-2 --rule --f-ui --f-mono --f-display, optional --seam
     globals none
   db collections: none.
   Lifted from: the YouTuner Uplift page (its states sheet for rows, pads and toasts, the loading/empty/missing cells, and the two-skin direction switch). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let seq = 0;

function mount(host, o) {
  const opt = Object.assign({ label: 'Skin', cols: 3 }, o);
  const skins = opt.skins || [];
  let cur = (skins.find(s => s.id === opt.skin) || skins[0] || {}).id || null;
  const sheet = el('section', 'kit-spec');
  const bar = el('header', 'kit-spec-bar');
  if (opt.title) bar.append(el('h3', 'kit-spec-title', opt.title));
  const ctrl = el('div', 'kit-spec-ctrl');
  const seg = el('span', 'kit-spec-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', opt.label);
  const btns = skins.map(s => { const b = el('button', null, s.label); b.type = 'button'; b.dataset.skin = s.id; seg.append(b); return b; });
  if (skins.length > 1) ctrl.append(seg);
  let replayBtn = null;
  if (opt.replay) { replayBtn = el('button', 'kit-spec-btn', 'Replay motion'); replayBtn.type = 'button'; ctrl.append(replayBtn); }
  if (ctrl.childNodes.length) bar.append(ctrl);
  sheet.append(bar);

  for (const g of opt.groups || []) {
    const sec = el('section', 'kit-spec-sec'); const hid = 'ks' + (++seq);
    if (g.title) { const h = el('h4', null, g.title); h.id = hid; sec.append(h); sec.setAttribute('aria-labelledby', hid); }
    const body = el('div', g.layout === 'grid' ? 'kit-spec-grid' : 'kit-spec-rows');
    if (g.layout === 'grid') body.style.setProperty('--kit-spec-cols', g.cols || opt.cols);
    for (const it of g.items || []) {
      const cell = el('div', g.layout === 'grid' ? 'kit-spec-cell' : 'kit-spec-row');
      if (it.state) cell.dataset.state = it.state;
      const lab = el('div', g.layout === 'grid' ? 'kit-spec-cap' : 'kit-spec-lab', it.label || '');
      const holder = el('div', 'kit-spec-body'); if (it.state) holder.dataset.state = it.state;
      if (it.html != null) holder.innerHTML = it.html;
      if (it.render) { const r = it.render(holder, { skin: cur, state: it.state }); if (r && r.nodeType) holder.append(r); }
      if (g.layout === 'grid') cell.append(holder, lab); else cell.append(lab, holder);
      if (it.caption) { const c = el('p', 'kit-spec-note', it.caption); (g.layout === 'grid' ? cell : holder).append(c); }
      body.append(cell);
    }
    sec.append(body); sheet.append(sec);
  }
  host.append(sheet);

  let applied = [];
  function setSkin(id) {
    const s = skins.find(x => x.id === id); if (!s && skins.length) return false;
    if (s) { applied.forEach(k => sheet.style.removeProperty(k)); applied = Object.keys(s.vars || {});
      for (const [k, v] of Object.entries(s.vars || {})) sheet.style.setProperty(k, v); }
    cur = id; sheet.dataset.skin = id || '';
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.skin === id)));
    if (opt.onSkin) opt.onSkin(id);
    return true;
  }
  function replayMotion() {
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    sheet.querySelectorAll('[data-fx]').forEach(n => { n.classList.remove('fx'); if (!reduced) void n.offsetWidth; n.classList.add('fx'); });
  }
  const onClick = e => { const b = e.target.closest('button'); if (!b) return; if (b === replayBtn) replayMotion(); else if (b.dataset.skin) setSkin(b.dataset.skin); };
  sheet.addEventListener('click', onClick);
  if (cur) setSkin(cur);
  return { setSkin, skin: () => cur, replayMotion, destroy() { sheet.removeEventListener('click', onClick); sheet.remove(); }, el: sheet };
}

Kit.specimens = Object.freeze({ mount });
})();
/* /part:page.script.kit.specimens */
