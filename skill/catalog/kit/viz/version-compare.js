/* part:page.script.kit.version-compare */
/**
 * Version compare
 * Kit.versionCompare.mount(root, {changes, manifests, content, from, to, onPart}) draws two selects (from and to version, each option naming the version, date, author and summary; the two latest by default). Under them a version line puts every version on a track in order (spaced evenly, not to a time scale): the chosen span is drawn heavy, the two ends are rings, and data changes are small diamonds between the versions they fall between. A tally follows (added, removed, changed and data changes, each a count with its mark and word); the same sentence goes to a role=status line for screen readers. Then one panel with four lists. A changed part shows its id, the first eight characters of its from and to hash, and every change between the two versions that touched it, with who and when. When manifests are given for both versions the comparison comes from them, the way adp.py diff does, and a note says so (and says when the change docs disagree); otherwise the change docs between the versions are walked. When the text of a part is known in both versions, a Show text disclosure draws a line diff with a + or - in a gutter and the words added and removed for screen readers, never colour alone. Data changes between the versions are listed last with their summaries and the docs they touched. It reads nothing itself: the board passes the records it read, and update(data) redraws. It does not write. The layout follows its container: under about 34rem the selects stack and the version line drops its dates; the diff scrolls inside its own box; every control is a select, a summary or a button, with a visible focus ring.
 *
 * API: Kit.versionCompare.mount(root, opts) -> {set(from, to), update(data), destroy()}
 *        changes     [{version, at, by, summary, parts: [{id, from, to}], threads, data}]   any order; sorted by at. A page's own data change has version "" and is never offered as a version
 *        manifests   optional {version: manifest}; manifest.parts is {partId: hash}
 *        content     optional {version: {partId: html}}
 *        from, to    initial versions (default: the two latest)     onPart(id)  makes each part id a button      label  the region's name
 *        timeZone    for dates (default UTC)       words  optional overrides: {added, removed, changed, data, from, to, show, hide}
 *      update(data) takes any of {changes, manifests, content} and redraws, keeping the choice when it still exists.
 *
 * Reads changes, manifest/current, content (the board passes what it read); writes none.
 *
 * @id        viz.version-compare
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   Two versions of an ADP artifact side by side: a version line, a tally, the parts added, removed and changed between them, who changed each and when, a line diff of the text, and the data changes in between.
 * @tags      versions, diff, changes, manifest, parts, hash, history, adp
 * @requires  kit.tokens, kit.dom
 * @provides  Kit.versionCompare.mount
 * @config    Kit.versionCompare.mount(root, opts) | changes [changes/<nnnnnn> docs: {version, at, by, summary, parts [{id, from, to}], threads, data}], manifests {version: manifest}, content {version: {partId: html}}, from, to, onPart(id), label, timeZone, words; returns {set, update, destroy}
 * @config    update(data) | any of {changes, manifests, content}; the choice of versions is kept when it still exists
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --ok --danger --f-ui --f-mono --ink-3? --seam? --f-display? --radius?
 * @globals   none
 * @db        reads changes; manifest/current; content / The board reads the docs and passes them in; the component never opens the db.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = Kit.dom.el;
const W = { added: 'Added', removed: 'Removed', changed: 'Changed', data: 'Data changes', from: 'From version', to: 'To version', show: 'Show text', hide: 'Hide text' };
const short = h => h ? String(h).slice(0, 8) : 'none';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function lineDiff(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 250000) return null;
  const t = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push(['ctx', a[i]]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) out.push(['del', a[i++]]); else out.push(['add', b[j++]]); }
  while (i < n) out.push(['del', a[i++]]); while (j < m) out.push(['add', b[j++]]);
  return out;
}
const lines = s => String(s).replace(/></g, '>\n<').split('\n');

function mount(root, opts) {
  const o = Object.assign({ changes: [], manifests: null, content: null, label: 'Compare versions' }, opts);
  const w = Object.assign({}, W, o.words);
  let changes = [], versions = [], from = null, to = null;
  const id = 'kit-vc-' + (++uid);
  root.classList.add('kit-vc'); root.replaceChildren();
  const region = el('section', 'kit-vc-box'); region.setAttribute('aria-label', o.label);
  const pick = el('div', 'kit-vc-pick');
  const mkSel = (key, text) => { const f = el('div', 'kit-vc-field'), l = el('label', null, text), s = el('select'); s.id = id + '-' + key; l.htmlFor = s.id; f.dataset.end = key; f.append(l, s); return [f, s]; };
  const [fFrom, selFrom] = mkSel('from', w.from), [fTo, selTo] = mkSel('to', w.to);
  const arrow = el('span', 'kit-vc-arrow', '→'); arrow.setAttribute('aria-hidden', 'true');
  pick.append(fFrom, arrow, fTo);
  const line = el('div', 'kit-vc-tl'); line.setAttribute('aria-hidden', 'true');
  const status = el('p', 'kit-vc-sr'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const tally = el('div', 'kit-vc-tally'); tally.setAttribute('aria-hidden', 'true');
  const note = el('p', 'kit-vc-note'), body = el('div', 'kit-vc-body');
  region.append(pick, line, tally, status, note, body); root.append(region);

  const fmt = iso => { try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone || 'UTC', timeZoneName: 'short' }); } catch (_) { return String(iso || ''); } };
  const dateOnly = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: o.timeZone || 'UTC' }); } catch (_) { return ''; } };

  function prepare() {
    changes = (o.changes || []).map((c, i) => ({ c, i })).sort((x, y) => String(x.c.at || '').localeCompare(String(y.c.at || '')) || x.i - y.i).map(x => x.c);
    const last = new Map();
    changes.forEach((c, i) => { if (c.version !== '' && c.version != null) last.set(String(c.version), i); });
    versions = [...last].sort((x, y) => x[1] - y[1]).map(([v, i]) => ({ v, idx: i, c: changes[i] }));
  }
  function fillSelects() {
    [selFrom, selTo].forEach(s => {
      s.replaceChildren();
      versions.forEach(x => { const op = el('option', null, 'Version ' + x.v + ', ' + dateOnly(x.c.at) + ', ' + (x.c.by || 'unknown') + (x.c.summary ? ': ' + x.c.summary : '')); op.value = x.v; s.append(op); });
    });
    const has = v => versions.some(x => x.v === String(v));
    const n = versions.length;
    if (!(from != null && has(from))) from = n ? versions[Math.max(0, n - 2)].v : null;
    if (!(to != null && has(to))) to = n ? versions[n - 1].v : null;
    if (from != null) selFrom.value = from; if (to != null) selTo.value = to;
    selFrom.disabled = selTo.disabled = !n;
  }
  function drawLine(lo, hi) {
    line.replaceChildren(); if (!versions.length) { line.hidden = true; return; } line.hidden = false;
    const n = versions.length, pos = i => n === 1 ? 50 : 4 + 92 * i / (n - 1);
    const track = el('span', 'kit-vc-track'); line.append(track);
    if (lo && hi && lo !== hi) { const a = versions.indexOf(lo), b = versions.indexOf(hi); const r = el('span', 'kit-vc-range'); r.style.left = pos(a) + '%'; r.style.width = (pos(b) - pos(a)) + '%'; line.append(r); }
    changes.forEach((c, i) => {
      if (!(c.data && c.data.length) || (c.parts && c.parts.length)) return;
      let k = 0; while (k < n && versions[k].idx < i) k++;
      if (k === 0 || k >= n) return;
      const before = versions.filter((x, j) => j === k - 1)[0], after = versions[k];
      const between = changes.slice(before.idx + 1, after.idx).filter(x => x.data && x.data.length && !(x.parts && x.parts.length));
      const at = between.indexOf(c) + 1, x = pos(k - 1) + (pos(k) - pos(k - 1)) * at / (between.length + 1);
      const d = el('span', 'kit-vc-dot'); d.style.left = x + '%'; d.dataset.in = lo && hi && i > lo.idx && i <= hi.idx ? 'true' : 'false'; line.append(d);
    });
    versions.forEach((v, i) => {
      const s = el('span', 'kit-vc-stop'); s.style.left = pos(i) + '%';
      s.dataset.end = v === lo ? 'from' : v === hi ? 'to' : lo && hi && v.idx > lo.idx && v.idx < hi.idx ? 'in' : 'out';
      s.append(el('b', null, v.v), el('small', null, dateOnly(v.c.at))); line.append(s);
    });
  }
  function walk(lo, hi) {
    const acc = new Map(), data = [];
    changes.forEach((c, i) => {
      if (i <= lo.idx || i > hi.idx) return;
      (c.parts || []).forEach(p => { const a = acc.get(p.id) || { id: p.id, from: p.from || '', to: '', by: [] }; a.to = p.to || ''; a.by.push({ by: c.by, at: c.at, version: c.version, summary: c.summary }); acc.set(p.id, a); });
      if (c.data && c.data.length) data.push(c);
    });
    return { acc, data };
  }
  function classify(acc, mf, mt) {
    const r = { added: [], removed: [], changed: [] };
    if (mf && mt) {
      const pf = mf.parts || {}, pt = mt.parts || {};
      Object.keys(pt).sort().forEach(k => { if (!(k in pf)) r.added.push({ id: k, from: '', to: pt[k] }); else if (pf[k] !== pt[k]) r.changed.push({ id: k, from: pf[k], to: pt[k] }); });
      Object.keys(pf).sort().forEach(k => { if (!(k in pt)) r.removed.push({ id: k, from: pf[k], to: '' }); });
    } else acc.forEach(a => { if (!a.from && !a.to) return; if (!a.from) r.added.push(a); else if (!a.to) r.removed.push(a); else if (a.from !== a.to) r.changed.push(a); });
    ['added', 'removed', 'changed'].forEach(k => { r[k] = r[k].map(x => Object.assign({ by: [] }, acc.get(x.id) || {}, x)).sort((p, q) => p.id.localeCompare(q.id)); });
    return r;
  }

  function partName(p) {
    if (!o.onPart) return el('code', 'kit-vc-id', p);
    const b = el('button', 'kit-vc-id kit-vc-link', p); b.type = 'button'; b.addEventListener('click', () => o.onPart(p)); return b;
  }
  function diffBox(partId) {
    const ct = o.content || {}, a = (ct[from] || {})[partId], b = (ct[to] || {})[partId];
    if (a == null || b == null) return null;
    const d = el('details', 'kit-vc-text'), sm = el('summary', null, w.show); d.append(sm);
    let built = false;
    d.addEventListener('toggle', () => {
      sm.textContent = d.open ? w.hide : w.show;
      if (!d.open || built) return; built = true;
      const rows = lineDiff(lines(a), lines(b));
      if (!rows) { d.append(el('p', 'kit-vc-note', 'The text is too long to compare line by line here.')); return; }
      if (!rows.some(r => r[0] !== 'ctx')) { d.append(el('p', 'kit-vc-note', 'The text is the same in both versions.')); return; }
      const keep = rows.map((r, i) => r[0] !== 'ctx' || rows.slice(Math.max(0, i - 2), i + 3).some(x => x[0] !== 'ctx'));
      const pre = el('pre', 'kit-vc-pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', 'Line changes in ' + partId);
      let skipped = 0;
      const flush = () => { if (skipped) { const g = el('span', 'kit-vc-ln'); g.dataset.k = 'gap'; g.append(el('i', null, ''), el('span', null, plural(skipped, 'unchanged line', 'unchanged lines'))); pre.append(g); skipped = 0; } };
      rows.forEach((r, i) => {
        if (!keep[i]) { skipped++; return; } flush();
        const row = el('span', 'kit-vc-ln'); row.dataset.k = r[0];
        const mark = el('i', null, r[0] === 'add' ? '+' : r[0] === 'del' ? '−' : ' '); mark.setAttribute('aria-hidden', 'true');
        row.append(mark); if (r[0] !== 'ctx') row.append(el('span', 'kit-vc-sr', r[0] === 'add' ? 'added: ' : 'removed: '));
        row.append(el('span', null, r[1])); pre.append(row);
      });
      flush(); d.append(pre);
    });
    return d;
  }
  const MARK = { added: '+', removed: '−', changed: '±', data: '◆' };
  function section(title, items, kind) {
    const s = el('section', 'kit-vc-sec'); s.dataset.kind = kind; const h = el('h3', null), hid = id + '-' + kind; h.id = hid; s.setAttribute('aria-labelledby', hid);
    const m = el('span', 'kit-vc-mk', MARK[kind]); m.setAttribute('aria-hidden', 'true');
    h.append(m, el('span', null, title), el('span', 'kit-vc-n', String(items.length))); s.append(h);
    if (!items.length) { s.append(el('p', 'kit-vc-none', 'None between these versions.')); return s; }
    const ul = el('ul', 'kit-vc-list');
    items.forEach(p => {
      const li = el('li', 'kit-vc-part'); li.dataset.kind = kind;
      const top = el('div', 'kit-vc-top'); top.append(partName(p.id));
      const hs = el('span', 'kit-vc-hash'); hs.setAttribute('aria-label', 'hash ' + short(p.from) + ' to ' + short(p.to));
      const cf = el('code', null, short(p.from)), ctt = el('code', null, short(p.to)); if (!p.from) cf.dataset.none = 'true'; if (!p.to) ctt.dataset.none = 'true';
      const ar = el('span', 'kit-vc-to', '→'); ar.setAttribute('aria-hidden', 'true'); hs.append(cf, ar, ctt); top.append(hs); li.append(top);
      if (p.by.length) { const wl = el('ul', 'kit-vc-who'); p.by.forEach(b => { const x = el('li'); x.append(el('b', null, b.by || 'unknown'), document.createTextNode(', ' + fmt(b.at) + (b.version !== '' && b.version != null ? ', version ' + b.version : '') + (b.summary ? ': ' + b.summary : ''))); wl.append(x); }); li.append(wl); }
      if (kind === 'changed') { const d = diffBox(p.id); if (d) li.append(d); }
      ul.append(li);
    });
    s.append(ul); return s;
  }
  function drawTally(r, data) {
    tally.replaceChildren();
    [['added', r.added.length, w.added], ['removed', r.removed.length, w.removed], ['changed', r.changed.length, w.changed], ['data', data.length, w.data]].forEach(([k, n, word]) => {
      const t = el('span', 'kit-vc-t'); t.dataset.kind = k; t.dataset.zero = n ? 'false' : 'true';
      t.append(el('span', 'kit-vc-mk', MARK[k]), el('b', null, String(n)), el('span', null, word.toLowerCase())); tally.append(t);
    });
  }

  function render() {
    body.replaceChildren(); note.textContent = ''; tally.replaceChildren();
    const lo0 = versions.find(x => x.v === String(from)), hi0 = versions.find(x => x.v === String(to));
    if (!lo0 || !hi0) { drawLine(null, null); status.textContent = 'There are no versions to compare yet.'; body.append(el('p', 'kit-vc-empty', 'There are no versions to compare yet. A version appears once a publish is recorded in changes/.')); return; }
    const swap = lo0.idx > hi0.idx, lo = swap ? hi0 : lo0, hi = swap ? lo0 : hi0;
    drawLine(lo, hi);
    if (lo === hi) { status.textContent = 'Version ' + lo.v + ' compared with itself: nothing between.'; body.append(el('p', 'kit-vc-empty', 'Version ' + lo.v + ' compared with itself: nothing between. Pick two different versions.')); return; }
    const { acc, data } = walk(lo, hi), mf = (o.manifests || {})[lo.v], mt = (o.manifests || {})[hi.v], useM = !!(mf && mt);
    const r = classify(acc, useM ? mf : null, useM ? mt : null);
    drawTally(r, data);
    status.textContent = plural(r.added.length, 'part', 'parts') + ' added, ' + r.removed.length + ' removed, ' + r.changed.length + ' changed, ' + plural(data.length, 'data change', 'data changes') + ' between version ' + lo.v + ' and version ' + hi.v + '.';
    let t = useM ? 'Compared from the saved manifests of both versions; who and when come from the change docs.' : 'Worked out by walking the change docs between the two versions; no manifest was given for both.';
    if (useM) { const w2 = classify(acc, null, null), key = x => x.added.concat(x.removed, x.changed).map(p => p.id).sort().join(); if (key(w2) !== key(r)) t += ' The change docs disagree on some parts: a publish may not have been recorded.'; }
    if (swap) t = 'The older version is always shown as the start. ' + t;
    note.textContent = t;
    const sheet = el('div', 'kit-vc-sheet');
    sheet.append(section(w.added, r.added, 'added'), section(w.removed, r.removed, 'removed'), section(w.changed, r.changed, 'changed'));
    const ds = el('section', 'kit-vc-sec'); ds.dataset.kind = 'data'; const h = el('h3', null); h.id = id + '-data'; ds.setAttribute('aria-labelledby', h.id);
    const m = el('span', 'kit-vc-mk', MARK.data); m.setAttribute('aria-hidden', 'true'); h.append(m, el('span', null, w.data), el('span', 'kit-vc-n', String(data.length))); ds.append(h);
    if (!data.length) ds.append(el('p', 'kit-vc-none', 'None between these versions.'));
    else { const ul = el('ul', 'kit-vc-list'); data.forEach(c => { const li = el('li', 'kit-vc-part'); li.dataset.kind = 'data'; const meta = el('p', 'kit-vc-meta'); meta.append(el('b', null, c.by || 'unknown'), document.createTextNode(', ' + fmt(c.at) + ', ')); (c.data || []).forEach((x, i) => { if (i) meta.append(document.createTextNode(' ')); meta.append(el('code', null, x.doc)); }); li.append(el('p', 'kit-vc-sum', c.summary || 'Data changed'), meta); ul.append(li); }); ds.append(ul); }
    sheet.append(ds); body.append(sheet);
  }

  const onSel = () => { from = selFrom.value; to = selTo.value; render(); };
  selFrom.addEventListener('change', onSel); selTo.addEventListener('change', onSel);
  prepare(); from = o.from != null ? String(o.from) : null; to = o.to != null ? String(o.to) : null; fillSelects(); render();
  return {
    set(f, t) { from = String(f); to = String(t); fillSelects(); render(); },
    update(d) { ['changes', 'manifests', 'content'].forEach(k => { if (d && k in d) o[k] = d[k]; }); prepare(); fillSelects(); render(); },
    destroy() { root.replaceChildren(); root.classList.remove('kit-vc'); },
  };
}
Kit.versionCompare = { mount };
})();
/* /part:page.script.kit.version-compare */
