/* part:page.script.kit.record-shelf */
/* Kit pattern: record shelf (Kit.recordShelf)    kit version 0.1.0
   What it is: the ADP records that sit beside an artifact's files, one card each, so a reader can tell at a glance what the database says and go to the view that shows it: the manifest
   (version, page hash, who recorded it and when), changes/ (versions recorded, the latest summary, data changes since), parts/ (how many, held, stale holds), threads/ (open, being worked
   on, done), content/ (how many parts keep their copy in the database) and checks/latest (the page's own self-check). Each card names its collection as the db does, gives one figure and one
   line, and carries a state with a glyph and a word when something needs a person: a stale hold, open comments, a failed check. A card is a button when onOpen is given; the current one is
   marked. Cards whose records are not passed in say so instead of showing zero.
   API:
     Kit.recordShelf.mount(root, opts) -> {update(data), setCurrent(name), destroy()}
       manifest  manifest/current {version, page_hash, files, parts, at, by}        changes  the changes/ docs (array or {id: doc})     parts  the parts/<id> docs ({id: doc} or array)
       threads   the threads/ docs {id: {part, status, holder}}        content  the content/ docs {part id: doc} or a list of ids        checks  checks/latest {ok, missing, unmarked, overflow_x, errors, at, width}
       now       ISO or Date for holds (default: the clock)     timeZone  for dates (default "UTC")     current  the name of the card to mark ("files", "changes", "parts", "threads", "content", "checks")
       onOpen(name)   makes each card a button that names the view it opens     label  the region's name (default "Records beside the files")
   Needs from the board:
     css     kit/patterns/record-shelf.css; custom properties --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --ok --warn --danger --f-ui --f-mono, optional --f-display --seam --radius
     kit     kit.tokens
     globals none
   db collections: none read here; the board reads manifest/current, changes, parts, threads, content and checks/latest and passes them in.
   Lifted from: the canonical ArtifactData layout of the artifact-dataplane skill (its collections and their fields) and the What changed panel of the reference page.
   Changed: one card per collection with a state in words, instead of a list of the latest changes only. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const el = Kit.dom.el;
const G = {
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  stop: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  none: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>',
};
function glyph(name) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.setAttribute('class', 'kit-rs-g'); s.innerHTML = G[name]; return s; }
const list = x => Array.isArray(x) ? x : x ? Object.keys(x).map(k => Object.assign({ id: k }, x[k])) : null;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
const grouped = h => String(h || '').slice(0, 12).replace(/(.{4})(?=.)/g, '$1 ');

function cards(o, fmt) {
  const now = o.now ? new Date(o.now).getTime() : Date.now();
  const out = [];
  const m = o.manifest;
  out.push(m ? { k: 'files', path: 'manifest/current', fig: m.version || (m.schema || 'adp'), unit: m.version ? 'recorded' : '',
    line: plural(Object.keys(m.files || {}).length, 'file') + ', ' + plural(Object.keys(m.parts || {}).filter(p => p.indexOf('_rest') !== 0).length, 'part') + '. Page hash ' + grouped(m.page_hash) + (m.at ? ', ' + fmt(m.at) : '') + (m.by ? ' by ' + m.by : '') + '.',
    view: 'Open the files' } : { k: 'files', path: 'manifest/current', missing: 'No manifest passed in. Until the first publish is recorded there is nothing to list.', view: 'Open the files' });
  const ch = list(o.changes);
  if (ch) {
    const v = ch.filter(c => c.version).sort((a, b) => String(a.at).localeCompare(String(b.at))), last = v[v.length - 1];
    const dataSince = ch.filter(c => !c.version && (!last || String(c.at) > String(last.at))).length, data = ch.filter(c => !c.version).length;
    out.push({ k: 'changes', path: 'changes/', fig: String(v.length), unit: v.length === 1 ? 'version' : 'versions',
      line: last ? 'Latest ' + last.version + ', ' + fmt(last.at) + ': ' + (last.summary || 'no summary') + (data ? ' ' + plural(data, 'data change') + (dataSince ? ', ' + dataSince + ' since' : '') + '.' : '') : 'Nothing recorded yet.',
      state: dataSince ? { g: 'warn', t: plural(dataSince, 'data change') + ' after the latest publish', tone: 'note' } : null, view: 'Open the history' });
  } else out.push({ k: 'changes', path: 'changes/', missing: 'Not passed in.', view: 'Open the history' });
  const pa = list(o.parts);
  if (pa) {
    let held = 0, stale = 0; pa.forEach(d => { if (d.holder) { const t = d.hold_until ? new Date(d.hold_until).getTime() : Infinity; if (t > now) held++; else stale++; } });
    out.push({ k: 'parts', path: 'parts/', fig: String(pa.length), unit: pa.length === 1 ? 'part' : 'parts',
      line: held || stale ? (held ? plural(held, 'part') + ' held' : 'None held') + (stale ? ', ' + plural(stale, 'stale hold') : '') + '. A held part is hands off until it is released.' : 'Nobody holds a part. Hold before you edit.',
      state: stale ? { g: 'stop', t: plural(stale, 'hold') + ' ran out', tone: 'bad' } : held ? { g: 'warn', t: held + ' held', tone: 'note' } : { g: 'ok', t: 'All free', tone: 'good' }, view: 'Open the parts' });
  } else out.push({ k: 'parts', path: 'parts/', missing: 'Not passed in.', view: 'Open the parts' });
  const th = list(o.threads);
  if (th) {
    const c = { open: 0, working: 0, done: 0 }; th.forEach(t => { c[t.status in c ? t.status : 'open']++; });
    out.push({ k: 'threads', path: 'threads/', fig: String(c.open + c.working), unit: 'open',
      line: plural(c.open, 'comment') + ' waiting, ' + c.working + ' being worked on, ' + c.done + ' done.',
      state: c.open ? { g: 'warn', t: plural(c.open, 'comment') + ' waiting', tone: 'note' } : { g: 'ok', t: 'None waiting', tone: 'good' }, view: 'Open the comments' });
  } else out.push({ k: 'threads', path: 'threads/', missing: 'Not passed in.', view: 'Open the comments' });
  const co = Array.isArray(o.content) ? o.content : o.content ? Object.keys(o.content) : null;
  out.push(co ? { k: 'content', path: 'content/', fig: String(co.length), unit: co.length === 1 ? 'doc' : 'docs',
    line: co.length ? 'Copy for ' + plural(co.length, 'part') + ' lives in the database: a wording fix is one write, with no republish.' : 'No copy in the database; the words are in the files.', view: 'Open the copy' }
    : { k: 'content', path: 'content/', missing: 'Not passed in.', view: 'Open the copy' });
  const k = o.checks;
  if (k) {
    const probs = (k.missing || []).length + (k.unmarked || []).length + (k.errors || []).length + (k.overflow_x ? 1 : 0);
    const bits = [];
    if ((k.missing || []).length) bits.push(plural(k.missing.length, 'part') + ' missing'); if ((k.unmarked || []).length) bits.push(k.unmarked.length + ' unmarked'); if ((k.errors || []).length) bits.push(plural(k.errors.length, 'script error')); if (k.overflow_x) bits.push('scrolls sideways');
    out.push({ k: 'checks', path: 'checks/latest', fig: k.ok && !probs ? 'Sound' : String(probs), unit: k.ok && !probs ? '' : probs === 1 ? 'problem' : 'problems',
      line: (k.at ? 'Checked ' + fmt(k.at) : 'Checked') + (k.width ? ' at ' + k.width + ' px' : '') + (k.view ? ' on ' + k.view : '') + '. ' + (bits.length ? bits.join(', ') + '.' : 'Every part drawn, nothing unmarked, no errors.'),
      state: k.ok && !probs ? { g: 'ok', t: 'Passed', tone: 'good' } : { g: 'stop', t: 'Needs a look', tone: 'bad' }, view: 'Open the check' });
  } else out.push({ k: 'checks', path: 'checks/latest', missing: 'No self-check yet. It is written the first time an editor opens the page.', view: 'Open the check' });
  return out;
}

function mount(root, opts) {
  let o = Object.assign({ label: 'Records beside the files', timeZone: 'UTC' }, opts);
  root.textContent = ''; root.classList.add('kit-rs');
  const fmt = iso => { try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }).format(new Date(iso)); } catch (_) { return String(iso); } };
  const wrap = el('section', 'kit-rs-wrap'); wrap.setAttribute('aria-label', o.label);
  const ul = el('ul', 'kit-rs-list'); wrap.append(ul); root.append(wrap);
  function draw() {
    ul.textContent = '';
    cards(o, fmt).forEach(c => {
      const li = el('li', 'kit-rs-it'), card = el(o.onOpen ? 'button' : 'div', 'kit-rs-card' + (c.missing ? ' kit-rs-miss' : ''));
      if (o.onOpen) { card.type = 'button'; card.addEventListener('click', () => { o.current = c.k; mark(); o.onOpen(c.k); }); }
      card.dataset.k = c.k;
      const top = el('span', 'kit-rs-path', c.path);
      card.append(top);
      if (c.missing) { const s = el('span', 'kit-rs-st kit-rs-st-none'); s.append(glyph('none'), el('span', null, 'Not read')); card.append(s, el('span', 'kit-rs-line', c.missing)); }
      else {
        const f = el('span', 'kit-rs-fig'); f.append(el('span', 'kit-rs-num', c.fig)); if (c.unit) f.append(el('span', 'kit-rs-unit', c.unit)); card.append(f);
        if (c.state) { const s = el('span', 'kit-rs-st kit-rs-st-' + c.state.tone); s.append(glyph(c.state.g), el('span', null, c.state.t)); card.append(s); }
        card.append(el('span', 'kit-rs-line', c.line));
      }
      if (o.onOpen) card.append(el('span', 'kit-rs-go', c.view));
      li.append(card); ul.append(li);
    });
    mark();
  }
  function mark() { [...ul.querySelectorAll('.kit-rs-card')].forEach(c => { if (c.dataset.k === o.current) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); }); }
  draw();
  return {
    update(data) { o = Object.assign({}, o, data || {}); draw(); },
    setCurrent(k) { o.current = k; mark(); },
    destroy() { root.textContent = ''; root.classList.remove('kit-rs'); },
  };
}
Kit.recordShelf = Object.freeze({ mount });
})();
/* /part:page.script.kit.record-shelf */
