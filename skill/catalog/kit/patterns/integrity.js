/* part:page.script.kit.integrity */
/**
 * Integrity check
 * Kit.integrity.mount(root, {manifest, parts, changes, checks, config, now, fetchFile}) reads what the board hands it and opens with a verdict: an orb and the word in the display face (Sound, Needs a record, Changed files, Stale holds or Broken, chosen by severity) and one sentence with the counts, the panel tinted by the verdict's tone. When fetchFile is given, Run the check sits beside the verdict with a progress bar: it fetches each live file, hashes it with crypto.subtle and announces its progress through a status line. Below, the four checks share one panel, strung on a seam like a checklist, each with an orb, its title, a pill and a one-line verdict. Files lists every path in manifest/current as an aligned row: the recorded hash, the live one (or not checked), and a state that reads matches, changed (a publish nobody recorded) or missing. Changes compares the last publish in changes/ with the manifest version and counts the data changes since. Holds lists parts with a holder as active or stale, with who and until when. Self-check shows checks/latest: the missing and unmarked parts, overflow and errors, and frozen with a glyph when the page is locked. It writes nothing. Hashes show their first 12 characters, carry the whole one in a title and copy when pressed. Every state has a glyph and a word, never colour alone. The layout follows its container: under about 44rem the file rows stack with a label on each hash and paths wrap anywhere; every control is a button reachable by keyboard.
 *
 * The page view that says whether an ADP artifact's live files, its database records and its holds agree. A verdict at the top (an orb, the word in the display face:
 * Sound, Needs a record, Changed files, Stale holds or Broken, chosen by severity, and one sentence with the counts; the Run button and its progress bar sit beside it) over four
 * checks on one panel, strung on a seam like a checklist: each has an orb, its title, a pill and a one-line verdict, then its detail. Files (the sha256 each file was recorded with, and, after Run,
 * the live one, so a publish nobody recorded reads "changed since the record" and an unreachable file reads "missing"), Changes (is the last publish in changes/ the one manifest/current names,
 * and how many data changes came since), Holds (parts held by someone: active, or stale once hold_until has passed) and Self-check (checks/latest, and "frozen" when the page is locked).
 * Hashes show their first 12 characters with the whole one in a title; pressing one copies it. Paths wrap anywhere. Nothing is written: the pattern only reads what it is given.
 *
 * API:
 *   Kit.integrity.mount(root, opts) -> {update(data), run(), destroy()}
 *     manifest  the manifest/current doc {version, page_hash, files: {path: sha256 or its first 12}, parts, at, by}      parts   the parts/<id> docs (array, or {id: doc}); a doc with a holder is a hold
 *     changes   the changes/ docs (array or map)      checks  the checks/latest doc {ok, missing, unmarked, overflow_x, errors, locked, at}      config  the config/current doc (edit.locked also reads as frozen)
 *     files     optional {path: live sha256} already known, shown before any Run      now  ISO string or Date, the clock for holds (default: the clock)
 *     fetchFile (path) => Promise of the live text of a published file; without it there is no Run button      onVerdict (verdict, counts) => void, called after each draw
 *   run() fetches every file one after another, hashes the text with crypto.subtle (SHA-256) and compares by the recorded length; progress is announced through role="status". It returns a promise.
 * db collections read (by the board, then passed in): manifest/current, changes, parts, checks/latest, config/current. None written.
 *
 * @id        pattern.integrity
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   A page view that says whether an artifact's live files, its database records and its holds agree: a verdict with a Run button, then files, changes, holds and the self-check on one seam.
 * @tags      integrity, manifest, hash, files, holds, changes, self-check, verdict, audit
 * @requires  kit.tokens, kit.vocab, kit.dom
 * @provides  Kit.integrity.mount
 * @config    Kit.integrity.mount(root, opts) | manifest (the manifest/current doc), parts (parts docs, array or map), changes (changes docs), checks (checks/latest), config (config/current), files {path: live sha256} optional, now ISO string, fetchFile(path) => Promise of the live text, onVerdict(key, counts); returns {update, run, destroy}
 * @config    fetchFile | optional: without it the Files section shows recorded hashes only and there is no Run button
 * @tokens    --bg --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --ok --warn --danger --f-ui --f-mono --seam? --f-display? --radius? --shadow?
 * @globals   none
 * @db        reads manifest/current; changes; parts; checks/latest; config/current / The board reads these docs and passes them in as plain objects; the pattern never touches the db.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = Kit.dom.el;
const DEFAULTS = {
  'integrity-verdict': {
    sound: { word: 'Sound', short: 'sound', glyph: 'check', tone: 'success', motion: 'none' },
    record: { word: 'Needs a record', short: 'record', glyph: 'hand', tone: 'attention', motion: 'none' },
    changed: { word: 'Changed files', short: 'changed', glyph: 'diamond', tone: 'attention', motion: 'none' },
    stale: { word: 'Stale holds', short: 'stale', glyph: 'hourglass', tone: 'attention', motion: 'none' },
    broken: { word: 'Broken', short: 'broken', glyph: 'stop', tone: 'danger', motion: 'none' },
  },
  'integrity-state': {
    ok: { word: 'Matches', short: 'matches', glyph: 'check', tone: 'success', motion: 'none' },
    changed: { word: 'Changed since the record', short: 'changed', glyph: 'diamond', tone: 'attention', motion: 'none' },
    missing: { word: 'Missing', short: 'missing', glyph: 'cross', tone: 'danger', motion: 'none' },
    pending: { word: 'Not checked yet', short: 'unchecked', glyph: 'ring', tone: 'neutral', motion: 'none' },
    recorded: { word: 'Recorded', short: 'recorded', glyph: 'check', tone: 'success', motion: 'none' },
    unrecorded: { word: 'Unrecorded publish', short: 'unrecorded', glyph: 'hand', tone: 'attention', motion: 'none' },
    active: { word: 'Active', short: 'active', glyph: 'pause', tone: 'active', motion: 'none' },
    stale: { word: 'Stale', short: 'stale', glyph: 'hourglass', tone: 'attention', motion: 'none' },
    frozen: { word: 'Frozen', short: 'frozen', glyph: 'moon', tone: 'ended', motion: 'none' },
    broken: { word: 'Failing', short: 'failing', glyph: 'stop', tone: 'danger', motion: 'none' },
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(DEFAULTS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }
const arr = x => Array.isArray(x) ? x : x && typeof x === 'object' ? Object.entries(x).map(([id, d]) => Object.assign({ id }, d)) : [];
const when = iso => { const s = String(iso || ''); return /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) ? s.slice(0, 10) + ' ' + s.slice(11, 16) + (/Z$/.test(s) ? ' UTC' : '') : s; };
const span = ms => { const m = Math.round(Math.abs(ms) / 60000); return m < 90 ? m + ' min' : Math.round(m / 60) + ' h'; };
async function sha(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

function mount(root, opts) {
  ensure();
  let o = Object.assign({}, opts), live = {}, running = false, said = '', done = 0;
  Object.entries(o.files || {}).forEach(([p, h]) => { live[p] = { hash: h }; });
  root.classList.add('kit-ig'); root.replaceChildren();
  const status = el('p', 'kit-ig-live'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const body = el('div', 'kit-ig-body'); root.append(body, status);
  const say = t => { said = t; status.textContent = t; };
  const clock = () => o.now ? new Date(o.now).getTime() : Date.now();
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function hashEl(h, label) {
    const b = el('button', 'kit-ig-hash', String(h).slice(0, 12)); b.type = 'button'; b.title = h; b.setAttribute('aria-label', 'Copy ' + (label ? label + ' ' : '') + 'hash ' + String(h).slice(0, 12));
    b.addEventListener('click', () => { const ok = () => say('Copied ' + String(h).slice(0, 12)); try { navigator.clipboard.writeText(h).then(ok, () => say('Could not copy')); } catch (_) { say('Could not copy'); } });
    return b;
  }
  const pill = (en, v) => V().pill(en, v, { unknown: 'flag' });
  const orb = (en, v, size) => V().orb(en, v, { size, unknown: 'flag' });
  function check(title, state, line, extra) {
    const s = el('section', 'kit-ig-sec'); s.dataset.state = state; const id = 'kit-ig-' + title.toLowerCase().replace(/\W+/g, '-') + '-' + uid; s.setAttribute('aria-labelledby', id);
    const knot = el('div', 'kit-ig-knot'); const ob = orb('integrity-state', state, 'md'); if (ob) { ob.setAttribute('aria-hidden', 'true'); knot.append(ob); }
    const main = el('div', 'kit-ig-main'), hd = el('div', 'kit-ig-sh'), h = el('h3', 'kit-ig-h', title); h.id = id; hd.append(h); const p = pill('integrity-state', state); if (p) hd.append(p);
    main.append(hd, el('p', 'kit-ig-line', line)); if (extra) main.append(extra);
    s.append(knot, main); return s;
  }
  function analyse() {
    const man = o.manifest || {}, recFiles = man.files || {}, paths = Object.keys(recFiles).sort();
    const rows = paths.map(p => {
      const rec = String(recFiles[p]), l = live[p]; let st = 'pending';
      if (l) st = l.error ? 'missing' : String(l.hash).startsWith(rec) || rec.startsWith(String(l.hash)) ? 'ok' : 'changed';
      return { path: p, rec, live: l && l.hash, st, error: l && l.error };
    });
    const ch = arr(o.changes).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const pubs = ch.filter(c => c.version !== '' && c.version != null), lastPub = pubs[pubs.length - 1];
    const dataSince = ch.filter(c => (c.version === '' || c.version == null) && (!lastPub || String(c.at) > String(lastPub.at)));
    const rec = !!lastPub && man.version != null && String(lastPub.version) === String(man.version);
    const holds = arr(o.parts).filter(d => d.holder).map(d => { const t = d.hold_until ? new Date(d.hold_until).getTime() : NaN; return Object.assign({}, d, { stale: !isNaN(t) && t <= clock(), left: t - clock() }); });
    const ck = o.checks || null, frozen = !!(ck && ck.locked) || !!(o.config && o.config.values && o.config.values['edit.locked']);
    const bad = ck ? [].concat(ck.missing || [], ck.unmarked || [], ck.errors || []).length + (ck.overflow_x ? 1 : 0) : 0;
    return { man, rows, ch, lastPub, dataSince, rec, holds, ck, frozen, bad, nChanged: rows.filter(r => r.st === 'changed').length, nMissing: rows.filter(r => r.st === 'missing').length, nStale: holds.filter(h => h.stale).length };
  }
  function draw() {
    const a = analyse(), hadFocus = document.activeElement && document.activeElement.classList.contains('kit-ig-run'); body.textContent = '';
    const key = a.bad || (a.ck && a.ck.ok === false) || a.nMissing ? 'broken' : a.nChanged ? 'changed' : !a.rec ? 'record' : a.nStale ? 'stale' : 'sound';
    const counts = { files: a.rows.length, changed: a.nChanged, missing: a.nMissing, unrecorded: a.rec ? 0 : 1, dataSince: a.dataSince.length, holds: a.holds.length, stale: a.nStale, problems: a.bad, frozen: a.frozen };
    const checked = a.rows.filter(r => r.st !== 'pending').length;

    // verdict
    const top = el('section', 'kit-ig-top'); top.dataset.verdict = key; top.setAttribute('aria-label', 'Verdict');
    const vo = orb('integrity-verdict', key, 'lg'); if (vo) { vo.setAttribute('aria-hidden', 'true'); top.append(vo); }
    const vt = el('div', 'kit-ig-vt'), row = V().get('integrity-verdict', key);
    const vh = el('h2', 'kit-ig-verdict', row ? row.word : key); vt.append(vh);
    const parts = [plural(a.rows.length, 'file', 'files') + (checked === a.rows.length && a.rows.length ? ' checked' : checked ? ', ' + checked + ' checked' : ', not checked live yet') + (a.nChanged ? ', ' + a.nChanged + ' changed' : '') + (a.nMissing ? ', ' + a.nMissing + ' missing' : ''),
      a.rec ? 'the last publish is recorded' : 'the last publish is not recorded',
      plural(a.holds.length, 'hold', 'holds') + (a.nStale ? ' (' + a.nStale + ' stale)' : ''),
      a.ck ? (a.bad ? plural(a.bad, 'self-check problem', 'self-check problems') : a.ck.ok === false ? 'the self-check fails' : 'the self-check passes') : 'no self-check yet'];
    const sent = parts.join('; ') + '.'; vt.append(el('p', 'kit-ig-sum', sent.charAt(0).toUpperCase() + sent.slice(1)));
    if (a.frozen) { const f = el('p', 'kit-ig-frozen'); const fp = pill('integrity-state', 'frozen'); if (fp) f.append(fp); f.append(el('span', null, 'Editing is paused: the artifact is frozen.')); vt.append(f); }
    top.append(vt);
    if (o.fetchFile) {
      const act = el('div', 'kit-ig-act');
      const b = el('button', 'kit-ig-run', running ? 'Checking ' + done + ' of ' + a.rows.length : checked ? 'Run again' : 'Run the check'); b.type = 'button'; if (running) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => { run(); }); act.append(b);
      if (running || checked) { const bar = el('div', 'kit-ig-bar'); bar.setAttribute('aria-hidden', 'true'); const fill = el('span'); fill.style.width = (a.rows.length ? Math.round(100 * (running ? done : checked) / a.rows.length) : 0) + '%'; bar.append(fill); act.append(bar); }
      top.append(act);
    }
    body.append(top);

    const sheet = el('div', 'kit-ig-sheet');
    // files
    const ul = el('ul', 'kit-ig-files'); ul.setAttribute('aria-label', 'Files');
    if (a.rows.length) { const hd = el('li', 'kit-ig-fh'); hd.setAttribute('aria-hidden', 'true'); ['Path', 'Recorded', 'Live', 'State'].forEach(t => hd.append(el('span', null, t))); ul.append(hd); }
    a.rows.forEach(r => {
      const li = el('li', 'kit-ig-file'); li.dataset.state = r.st;
      li.append(el('code', 'kit-ig-path', r.path));
      const rc = el('span', 'kit-ig-cell'); rc.append(el('span', 'kit-ig-k', 'recorded'), hashEl(r.rec, 'recorded'));
      const lc = el('span', 'kit-ig-cell'); lc.append(el('span', 'kit-ig-k', 'live'));
      if (r.live) lc.append(hashEl(r.live, 'live')); else lc.append(el('span', 'kit-ig-dash', r.error ? r.error : 'not checked'));
      const sc = el('span', 'kit-ig-cell kit-ig-stc'); const p = V().pill('integrity-state', r.st, { short: true, unknown: 'flag' }); if (p) sc.append(p);
      li.append(rc, lc, sc); ul.append(li);
    });
    const fLine = !a.rows.length ? 'The manifest lists no files.' : a.nMissing ? a.nMissing + ' of ' + a.rows.length + ' files could not be fetched.' : a.nChanged ? a.nChanged + ' of ' + a.rows.length + ' files changed since the record: a publish nobody recorded.' : checked === a.rows.length ? 'All ' + a.rows.length + ' files match the record.' : checked ? checked + ' of ' + a.rows.length + ' files checked; the rest not yet.' : o.fetchFile ? 'Not checked against the live files yet. Run the check to fetch and hash them.' : 'Recorded hashes only. No way to fetch the live files here.';
    sheet.append(check('Files', a.nMissing ? 'missing' : a.nChanged ? 'changed' : a.rows.length && checked === a.rows.length ? 'ok' : 'pending', fLine, a.rows.length ? ul : null));

    // changes
    const m = a.man, lp = a.lastPub, dl = el('dl', 'kit-ig-facts');
    const fact = (k, v) => { const d = el('div'); d.append(el('dt', null, k)); const dd = el('dd'); if (typeof v === 'string') dd.textContent = v; else dd.append(...v); d.append(dd); dl.append(d); };
    fact('Manifest', m.version != null ? (m.page_hash ? [document.createTextNode('version ' + m.version + ', page '), hashEl(m.page_hash, 'page')] : 'version ' + m.version) : 'no version');
    fact('Last recorded publish', lp ? 'version ' + lp.version + ', ' + when(lp.at) + (lp.by ? ' by ' + lp.by : '') + (lp.summary ? ': ' + lp.summary : '') : 'none in changes/');
    fact('Data changes since', String(a.dataSince.length));
    sheet.append(check('Changes', a.rec ? 'recorded' : 'unrecorded', a.rec ? 'The last change matches the manifest. ' + plural(a.dataSince.length, 'data change', 'data changes') + ' since.' : 'The manifest is newer than the last change. Record the publish.', dl));

    // holds
    const hl = el('ul', 'kit-ig-list');
    a.holds.forEach(h => { const li = el('li', 'kit-ig-item'); li.dataset.state = h.stale ? 'stale' : 'active'; const r = el('div', 'kit-ig-row'); r.append(el('code', 'kit-ig-path', h.id), pill('integrity-state', h.stale ? 'stale' : 'active'));
      li.append(r, el('p', 'kit-ig-sub', h.holder + (h.hold_until ? (h.stale ? ' held it until ' : ' holds it until ') + when(h.hold_until) + (isNaN(h.left) ? '' : h.stale ? ', expired ' + span(h.left) + ' ago' : ', ' + span(h.left) + ' left') : ', no expiry recorded'))); hl.append(li); });
    sheet.append(check('Holds', a.nStale ? 'stale' : 'active', !a.holds.length ? 'No part is held.' : a.nStale ? a.nStale + ' of ' + a.holds.length + ' holds expired and were not cleared.' : plural(a.holds.length, 'active hold', 'active holds') + ', none expired.', a.holds.length ? hl : null));

    // self-check
    const ck = a.ck; let sl = null;
    if (ck && (a.bad || ck.overflow_x)) { sl = el('ul', 'kit-ig-list'); [['Missing parts', ck.missing], ['Unmarked parts', ck.unmarked], ['Errors', ck.errors]].forEach(([k, v]) => { if (v && v.length) { const li = el('li', 'kit-ig-item'); li.dataset.state = 'broken'; const r = el('div', 'kit-ig-row'); r.append(el('span', 'kit-ig-k', k)); v.forEach(x => r.append(el('code', 'kit-ig-path', typeof x === 'string' ? x : JSON.stringify(x)))); li.append(r); sl.append(li); } });
      if (ck.overflow_x) { const li = el('li', 'kit-ig-item'); li.dataset.state = 'broken'; const r = el('div', 'kit-ig-row'); r.append(el('span', 'kit-ig-k', 'Overflow'), el('code', 'kit-ig-path', ck.overflow_x + ' px sideways at ' + (ck.width || '?') + ' px wide')); li.append(r); sl.append(li); } }
    const when2 = ck && ck.at ? ' Checked ' + when(ck.at) + (ck.view ? ' in view ' + ck.view : '') + '.' : '';
    sheet.append(check('Self-check', !ck ? 'pending' : a.bad || ck.ok === false ? 'broken' : 'ok', !ck ? 'No self-check has been recorded.' : a.bad || ck.ok === false ? 'The page failed its own check.' + when2 : 'The page passed its own check.' + when2, sl));
    body.append(sheet);
    if (o.onVerdict) o.onVerdict(key, counts);
    if (said) status.textContent = said;
    if (hadFocus) { const b = body.querySelector('.kit-ig-run'); if (b) b.focus(); }
  }
  async function run() {
    if (!o.fetchFile || running) return; running = true; done = 0; const paths = Object.keys((o.manifest || {}).files || {}).sort(); live = {}; say('Checking ' + paths.length + ' files'); draw();
    for (let i = 0; i < paths.length; i++) {
      try { const t = await o.fetchFile(paths[i]); if (t == null) throw new Error('not found'); live[paths[i]] = { hash: await sha(String(t)) }; } catch (e) { live[paths[i]] = { error: 'not fetched' }; }
      done = i + 1; say('Checked ' + (i + 1) + ' of ' + paths.length); draw();
    }
    running = false; const a = analyse(); say('Checked ' + paths.length + ' files: ' + a.nChanged + ' changed, ' + a.nMissing + ' missing'); draw();
  }
  const uid = ++seq;
  draw();
  return {
    update(d) { o = Object.assign({}, o, d); if (d && d.files) Object.entries(d.files).forEach(([p, h]) => { live[p] = { hash: h }; }); draw(); },
    run,
    destroy() { root.replaceChildren(); root.classList.remove('kit-ig'); },
  };
}
let seq = 0;
Kit.integrity = Object.freeze({ mount });
})();
/* /part:page.script.kit.integrity */
