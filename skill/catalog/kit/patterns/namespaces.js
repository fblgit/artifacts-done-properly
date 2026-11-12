/* part:page.script.kit.namespaces */
/* Kit pattern: namespaces (Kit.namespaces)    kit version 0.1.0
   What it is: a read-only account of who can write where on an ADP artifact. Two sections.
   Data, "Who can write where": one row per db rule, longest path first. Each row has the path (the root reads "everything else", a {self} segment reads "each viewer's own"), a sentence
   ("Everyone reads; admins and up write.") and a ladder over the four levels of the db capability, lowest first: viewers, people who can interact, admins, the owner. The ladder is cut
   into runs: "read and write" (solid, with a pen), "read only" (tinted, with an eye) and "no access" (an outline with a dash), each spanning the levels it covers, so it says it in
   words and marks, not in colour alone. At the row's end, what you can do there: "You write" or "You read". The "you" verdict follows user.canEdit: an editor counts as interact
   (writes interact-level paths and below, a footnote says so); a viewer writes nothing; admin and owner paths are never marked as yours.
   Parts, "Locked parts": each prefix in parts.locked with a lock, how many parts it covers, and those part ids with their titles (whole-segment prefix match, as in docs/config.md); then
   the parts left open, counted, with their ids in a disclosure. A change of parts.locked is announced through role="status". Nothing here writes: rules change by republish, locks on
   the settings page.
   API:
     Kit.namespaces.mount(root, opts) -> {update(data), destroy()}
       rules   [{path, read, write}]; default: the JSON of <meta name="adp:db-rules"> (a list, or {rules: [...]})
       locks   [prefix]; default ADP.config.get('parts.locked'), re-read on ADP.config.on('parts.locked')
       user    {canEdit}; default ADP.user (read at each draw; the runtime fills it once the page is ready)
       parts   [part id]; default every [data-part] on the page       titles  {part id: title}       label  the region's accessible name (default "Namespaces")
     Kit.namespaces.levels -> ["view", "interact", "admin", "owner"]
   Needs from the board:
     css     kit/patterns/namespaces.css; custom properties --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --f-ui --f-mono,
             optional --accent-soft --seam --f-display --radius
     globals none (the glyphs are this file's own); window.ADP is optional
   db collections: config/current, read through ADP.config; no writes.
   Lifted from: the settings page's read-only list of the namespaces it finds and its lock badges. Changed: one component for both, with the parts a lock covers listed under it. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = Kit.dom.el;
const LEVELS = {
  view: { n: 0, word: 'viewers', head: 'Viewers', short: 'View' },
  interact: { n: 1, word: 'people who can interact', head: 'Can interact', short: 'Interact' },
  admin: { n: 2, word: 'admins', head: 'Admins', short: 'Admin' },
  owner: { n: 3, word: 'the owner', head: 'Owner', short: 'Owner' },
};
const ORDER = Object.keys(LEVELS);
const ICONS = {
  pen: '<path d="M4.5 19.5l1-4L16 5a2 2 0 0 1 3 3L8.5 18.5z"/><path d="M14 7l3 3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  dash: '<path d="M8 12h8"/>',
};
const icon = (name, cls) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'kit-ns-i' + (cls ? ' ' + cls : '')); s.innerHTML = ICONS[name] || ''; return s;
};
const segs = p => String(p || '').split('/').filter(Boolean);
const readMeta = () => {
  const m = document.querySelector('meta[name="adp:db-rules"]');
  try { const j = JSON.parse(m ? m.getAttribute('content') : ''); return Array.isArray(j) ? j : (j && j.rules) || []; } catch (e) { return []; }
};
const covers = (prefix, id) => id === prefix || id.indexOf(prefix + '.') === 0;
const lvl = v => LEVELS[v] ? LEVELS[v].n : -1;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function who(v, verb) {
  const l = LEVELS[v];
  if (!l) return 'it is not said who ' + verb + ' (' + String(v == null ? 'not set' : v) + ')';
  if (l.n === 0) return 'everyone ' + verb + 's';
  if (l.n === LEVELS.owner.n) return 'only the owner ' + verb + 's';
  return l.word + ' and up ' + verb;
}
function sentence(r) {
  const rd = lvl(r.read), wr = lvl(r.write);
  if (rd >= 0 && rd === wr) return cap(who(r.read, 'read')) + ' and write' + (rd === 0 || rd === LEVELS.owner.n ? 's' : '') + '.';
  return cap(who(r.read, 'read')) + '; ' + who(r.write, 'write') + '.';
}
function mount(root, opts) {
  opts = opts || {};
  let data = Object.assign({}, opts), off = null, live = null, lastLocks = null, dead = false, openParts = false;
  const box = el('section', 'kit-ns'); box.setAttribute('aria-label', opts.label || 'Namespaces');
  root.append(box);
  const cfg = () => window.ADP && window.ADP.config;
  const locks = () => { if (Array.isArray(data.locks)) return data.locks; try { const v = cfg() && cfg().get('parts.locked'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const user = () => data.user || (window.ADP && window.ADP.user) || {};
  const canWrite = lv => { const l = LEVELS[lv]; return !!l && !!user().canEdit && l.n <= LEVELS.interact.n; };
  const canRead = lv => { const l = LEVELS[lv]; return !!l && l.n <= (user().canEdit ? LEVELS.interact.n : LEVELS.view.n); };

  function ladder(r) {
    const ol = el('ol', 'kit-ns-lad'); ol.setAttribute('aria-label', 'Levels, lowest first');
    const rd = lvl(r.read), wr = lvl(r.write), runs = [];
    ORDER.forEach(k => {
      const n = LEVELS[k].n, st = wr >= 0 && n >= wr ? 'write' : rd >= 0 && n >= rd ? 'read' : 'none', last = runs[runs.length - 1];
      if (last && last.st === st) last.to = k; else runs.push({ st, from: k, to: k });
    });
    runs.forEach(x => {
      const li = el('li', 'kit-ns-rung'), span = LEVELS[x.to].n - LEVELS[x.from].n + 1; li.dataset.st = x.st; li.style.gridColumn = 'span ' + span;
      li.append(el('span', 'kit-ns-sr', (x.from === x.to ? LEVELS[x.from].head : LEVELS[x.from].head + ' to ' + LEVELS[x.to].head.toLowerCase()) + ': '));
      li.append(icon(x.st === 'write' ? 'pen' : x.st === 'read' ? 'eye' : 'dash'), el('span', 'kit-ns-rw', x.st === 'none' ? 'no access' : x.st === 'write' ? 'read and write' : 'read only'));
      ol.append(li);
    });
    return ol;
  }
  function dataSection() {
    const rules = (Array.isArray(data.rules) ? data.rules : readMeta()).slice().sort((a, b) => segs(b.path).length - segs(a.path).length);
    const s = el('section', 'kit-ns-sec'), h = el('h3', 'kit-ns-h', 'Who can write where'); h.id = 'kit-ns-h-data-' + uid; s.setAttribute('aria-labelledby', h.id);
    const hd = el('div', 'kit-ns-shd'); hd.append(h, el('span', 'kit-ns-cnt', rules.length + (rules.length === 1 ? ' rule' : ' rules'))); s.append(hd);
    if (!rules.length) { s.append(el('p', 'kit-ns-empty', 'This page declares no db rules, so the defaults of the host apply.')); }
    else {
      const panel = el('div', 'kit-ns-panel');
      const scale = el('div', 'kit-ns-scale'); scale.setAttribute('aria-hidden', 'true');
      scale.append(el('span', 'kit-ns-scale-p', 'Path'));
      const heads = el('span', 'kit-ns-heads'); ORDER.forEach(k => { const x = el('span', null); x.append(el('span', 'kit-ns-long', LEVELS[k].head), el('span', 'kit-ns-short', LEVELS[k].short)); heads.append(x); });
      scale.append(heads, el('span', 'kit-ns-scale-y', 'You'));
      const ul = el('ul', 'kit-ns-rows'); ul.setAttribute('aria-labelledby', h.id);
      rules.forEach(r => {
        const li = el('li', 'kit-ns-row'), p = el('div', 'kit-ns-path'), ps = segs(r.path), self = ps.indexOf('{self}') >= 0;
        const code = el('code', null, ps.length ? ps.filter(x => x !== '{self}').join('/') : '/');
        p.append(code);
        if (!ps.length) p.append(el('span', 'kit-ns-note', 'everything else'));
        else if (self) p.append(el('span', 'kit-ns-note', "each viewer's own"));
        p.append(el('p', 'kit-ns-says', sentence(r)));
        const me = el('div', 'kit-ns-me'), w = canWrite(r.write), rd = canRead(r.read);
        me.dataset.can = w ? 'write' : rd ? 'read' : 'none';
        me.append(icon(w ? 'pen' : rd ? 'eye' : 'dash'), el('span', null, w ? 'You write' : rd ? 'You read' : 'Not you'));
        li.append(p, ladder(r), me); ul.append(li);
      });
      panel.append(scale, ul); s.append(panel);
    }
    s.append(el('p', 'kit-ns-foot', 'Changing a rule is a republish. "You" follows what this runtime reports: an editor counts as interact, so writes interact-level paths and below; a viewer writes nothing; admin and owner paths are never marked as yours.'));
    return s;
  }
  function partsSection() {
    const ids = Array.isArray(data.parts) ? data.parts : Array.from(document.querySelectorAll('[data-part]')).map(n => n.getAttribute('data-part')).filter(Boolean);
    const titles = data.titles || {}, ls = locks(), taken = {};
    const s = el('section', 'kit-ns-sec'), h = el('h3', 'kit-ns-h', 'Locked parts'); h.id = 'kit-ns-h-parts-' + uid; s.setAttribute('aria-labelledby', h.id);
    const hd = el('div', 'kit-ns-shd'); const cnt = el('span', 'kit-ns-cnt'); hd.append(h, cnt); s.append(hd);
    if (!ls.length) s.append(el('p', 'kit-ns-empty', 'No part is locked. Every part can be changed by whoever may publish.'));
    else {
      const ul = el('ul', 'kit-ns-locks');
      ls.forEach(pre => {
        const li = el('li', 'kit-ns-lock'), top = el('p', 'kit-ns-seal');
        const hit = ids.filter(id => covers(pre, id)); hit.forEach(id => { taken[id] = 1; });
        top.append(icon('lock', 'kit-ns-lk'), el('code', null, pre), el('span', 'kit-ns-sr', ' is locked; '), el('span', 'kit-ns-cov', hit.length ? 'covers ' + hit.length + (hit.length === 1 ? ' part' : ' parts') : 'covers no part on this page'));
        li.append(top);
        if (hit.length) { const pl = el('ul', 'kit-ns-ids'); hit.forEach(id => { const pi = el('li'); pi.append(el('code', null, id)); if (titles[id]) pi.append(el('span', 'kit-ns-t', titles[id])); pl.append(pi); }); li.append(pl); }
        ul.append(li);
      });
      s.append(ul);
    }
    const open = ids.filter(id => !taken[id]);
    cnt.textContent = ls.length + (ls.length === 1 ? ' lock' : ' locks') + ', ' + open.length + ' of ' + ids.length + ' parts open';
    if (open.length) {
      const d = el('details', 'kit-ns-open'); d.open = openParts; d.addEventListener('toggle', () => { openParts = d.open; });
      d.append(el('summary', null, open.length + (open.length === 1 ? ' part is open' : ' parts are open')));
      const pl = el('ul', 'kit-ns-ids'); open.forEach(id => { const pi = el('li'); pi.append(el('code', null, id)); if (titles[id]) pi.append(el('span', 'kit-ns-t', titles[id])); pl.append(pi); });
      d.append(pl); s.append(d);
    }
    s.append(el('p', 'kit-ns-foot', 'Locks are set on the settings page; adp.py refuses changes to a locked part without --unlock.'));
    return s;
  }
  function draw() {
    if (dead) return;
    box.textContent = '';
    live = el('p', 'kit-ns-live'); live.setAttribute('role', 'status');
    box.append(dataSection(), partsSection(), live);
    const key = JSON.stringify(locks());
    if (lastLocks !== null && key !== lastLocks) live.textContent = 'Locked parts changed: ' + locks().length + (locks().length === 1 ? ' lock.' : ' locks.');
    lastLocks = key;
  }
  const uid = String(++seq);
  draw();
  if (!Array.isArray(opts.locks) && cfg() && cfg().on) { try { off = cfg().on('parts.locked', draw); } catch (e) {} }
  if (cfg() && cfg().ready && !opts.user) { Promise.resolve(cfg().ready).then(draw, () => {}); }   // user.canEdit is filled once the runtime is ready
  return {
    update(d) { data = Object.assign({}, data, d || {}); draw(); },
    destroy() { dead = true; if (off) off(); box.remove(); },
  };
}
let seq = 0;
Kit.namespaces = { mount, levels: ORDER.slice() };
})();
/* /part:page.script.kit.namespaces */
