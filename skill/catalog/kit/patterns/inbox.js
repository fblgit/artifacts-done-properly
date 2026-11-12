/* part:page.script.kit.inbox */
/**
 * Inbox card
 * Kit.inbox.mount(root, {db, user, artifact, config, url}) lists incoming/<pid> proposals whose status is new, merged or held, newest first, and classifies every new one on open with ADP.classify (base: the live record with the proposal's from-hashes; live: manifest/current; incoming: its to-hashes), recording merged or held with the classes and a changes/d-<ms> data change. A proposal whose base version is no longer live is classified against the live record, not refused. Per proposal: the summary, who, when and the status (merged reads 'merged, not yet published'); each part opens to a line diff of its live html against the proposed html; each held item shows the base, live and proposed hashes and both versions, and editors pick Keep live or Take the proposal, which is written on the proposal as a decision. The files it will publish are listed with their ifMatch. Apply is off until every held item is picked; presses within the debounce window fold into one artifact.publish files-form call with an ifMatch per file; after {shas} it writes manifest/current (the new hashes, the next seq and the version), parts/<id>, content/<id>, changes/<seq> with from and to hashes, and sets the proposal applied. On a conflict it names the files that moved (expected and actual sha), records the conflict and leaves the proposal held. Decline asks for a reason inline and records it. The presence line says who is watching when a presence/* doc is fresher than assist.presence-minutes, else offers the handoff 'watch the artifact <url>' with the open request ids and a copy button. Without the artifact capability the inbox is read-only and says why; without a db it says so; nothing is published on load.
 *
 * The page end of the loop (docs/assist.md, contracts 3 and 5). It lists the proposals in incoming/ (status new, merged or held, newest first), classifies each new one
 * on open with ADP.classify against manifest/current and records merged or held, and draws per proposal: the summary, who and when, the status; each part as before and after
 * (a line diff of its html as text); each held item with both versions and, for editors, a pick (keep live, take the proposal) recorded on the proposal; the files it will publish
 * with their ifMatch (content null: the file is removed, with its reason); a part with kind content is copy whose content/<id> doc moves (its file rides along). Apply (editors) makes one debounced files-form publish with an ifMatch per file; after {shas} it writes manifest/current, parts/<id>, content/<id>,
 * changes/<seq> and sets the proposal applied; on conflict it names the files that moved and leaves the proposal held. Decline asks for a reason and records it.
 * A presence line says whether an agent is watching (a presence/* doc fresher than assist.presence-minutes, or comments.canSendToClaude() answering available); else it offers
 * the handoff to copy. After Apply, a publish conflict, a hold on open or Decline it wakes the watching sessions with comments.sendToClaude (docs/assist.md: the comment is only
 * the wake-up, the proposal doc is the record; the trailer line is "· adp proposal {<pid>} · applied <version> | held | declined"); the thread id is kept on the proposal as
 * wake.thread and later events reply into it. Without a listening session the data change stands and the next export finds it. Nothing is published on load.
 *
 * API:
 *   Kit.inbox.mount(root, opts) -> {update(), destroy()}
 *     db        the db handle (default ADP.db)      user  {canEdit, id} (default ADP.user)      artifact  the artifact capability handle, or a promise of it (default claude.use('artifact'))
 *     config    ADP.config (assist.presence-minutes)      url   the artifact's claude.ai url for the handoff line (optional; the line says "this artifact" without it)
 *     comments  the comments capability handle, or a promise of it (default claude.use('comments')); without sendToClaude on it, no wake-up is sent
 *     classify  (base, live, incoming) => classes (default ADP.classify)      debounce  ms Apply waits for a second press to fold into one call (default 600)
 * The proposal's live_files {path: sha256} is the live listing the agent exported; Apply records it, so a record-only proposal (no files) still trues manifest.files.
 *
 * @id        pattern.inbox
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   The page end of the loop: the proposals in incoming/, classified on open, each part as before and after, held items with both versions and a recorded pick, Apply through the files form with an ifMatch per file, Decline with a reason, and who is watching.
 * @tags      inbox, proposal, loop, apply, conflict, classify, merge, publish, presence
 * @requires  kit.tokens, kit.dom
 * @provides  Kit.inbox.mount
 * @config    Kit.inbox.mount(root, opts) | db (default ADP.db), user {canEdit, id} (default ADP.user), artifact handle or promise (default claude.use('artifact')), config (assist.presence-minutes), url for the handoff, classify (default ADP.classify), debounce ms; returns {update, destroy}
 * @config    ADP.classify(base, live, incoming) | contract 4 of docs/architecture.md, in adp.js
 * @tokens    --bg --panel --sunk --ink --ink-2 --ink-3 --rule --accent --accent-ink --ok --warn --danger --f-ui --f-mono --radius?
 * @globals   none
 * @db        reads incoming; manifest/current; content; presence; requests / writes incoming; manifest/current; parts; content; changes / Writes only for editors and only on Apply, Decline, a pick or the classification of a new proposal; incoming sits under the root rule.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = Kit.dom.el;
const B = 'kit-inbox-', OPEN = ['new', 'merged', 'held'];
const s12 = h => (typeof h === 'string' && h ? h.slice(0, 12) : null);
const when = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
async function sha(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const data = s => (s && s.exists ? s.data() || {} : null);
const gone = f => f.content === null && !f.sha256;          // a file the proposal removes (contract 3: content null, a reason)

/* line diff of two texts: [[' '|'-'|'+', line]] by longest common subsequence, capped so a huge part stays cheap */
function diff(a, b) {
  const x = String(a || '').split('\n'), y = String(b || '').split('\n');
  if (x.length * y.length > 160000) return x.map(l => ['-', l]).concat(y.map(l => ['+', l]));
  const n = x.length, m = y.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (x[i] === y[j]) { out.push([' ', x[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', x[i++]]); else out.push(['+', y[j++]]); }
  while (i < n) out.push(['-', x[i++]]); while (j < m) out.push(['+', y[j++]]);
  return out;
}
function diffView(a, b) {
  const pre = el('pre', B + 'diff');
  diff(a, b).forEach(([k, l]) => { const s = el('span', B + (k === '+' ? 'add' : k === '-' ? 'del' : 'same'), k + ' ' + l + '\n'); pre.append(s); });
  return pre;
}

function mount(root, opts) {
  const o = Object.assign({ debounce: 600 }, opts);
  const db = () => o.db || (window.ADP && window.ADP.db);
  const usr = () => o.user || (window.ADP && window.ADP.user) || {};
  const classify = (...a) => (o.classify || window.ADP.classify)(...a);
  const canEdit = () => !!usr().canEdit, by = () => usr().id || 'page';
  let props = [], man = null, presence = [], requests = [], art = null, artWhy = 'checking…', dead = false, busy = {}, timers = {}, notes = {}, cm = null, canSend = '';
  const offs = [];
  const box = el('section', B + 'root'); box.setAttribute('aria-label', 'Incoming proposals'); root.replaceChildren(box);

  Promise.resolve(o.artifact !== undefined ? o.artifact : (window.claude && typeof claude.use === 'function' ? claude.use('artifact') : null))
    .then(a => { art = a && typeof a.publish === 'function' ? a : null; artWhy = art ? '' : 'Apply needs the artifact capability, which this page does not declare.'; draw(); },
      e => { art = null; artWhy = 'The artifact capability is unavailable here (' + (e && e.code || e) + ').'; draw(); });

  Promise.resolve(o.comments !== undefined ? o.comments : (window.claude && typeof claude.use === 'function' ? claude.use('comments') : null))
    .then(c => { cm = c && typeof c.sendToClaude === 'function' && typeof c.canSendToClaude === 'function' ? c : null; askCanSend(); }, () => { cm = null; });
  const askCanSend = () => {       // re-checked every 30 s, as pattern.assist does: watching sessions are learned asynchronously
    if (!cm || dead) return;
    cm.canSendToClaude().then(v => { if (v !== canSend) { canSend = v; draw(); } }, () => { canSend = ''; });
    timers.canSend = setTimeout(askCanSend, 30000);
  };

  const D = db();
  if (!D) { box.append(el('p', B + 'muted', 'The inbox needs the database.')); return { update() {}, destroy() {} }; }
  const watch = (q, fn) => { try { offs.push(q.onSnapshot(fn, () => {})); } catch (e) { q.get().then(fn, () => {}); } };
  watch(D.collection('incoming'), snap => {
    props = snap.docs.filter(d => d.exists).map(d => Object.assign({ pid: d.id }, d.data())).filter(p => OPEN.includes(p.status || 'new'))
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    classifyNew(); draw();
  });
  watch(D.doc('manifest/current'), s => { const d = data(s); man = d && d.data && !d.parts ? d.data : d; classifyNew(); draw(); });
  watch(D.collection('presence'), snap => { presence = snap.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())); draw(); });
  watch(D.collection('requests'), snap => { requests = snap.docs.filter(d => d.exists && !['done', 'closed'].includes((d.data() || {}).status)).map(d => d.id); draw(); });

  const dataChange = (summary, extra) => D.doc('changes/d-' + Date.now()).set(Object.assign({ version: '', at: new Date().toISOString(), by: by(), summary, parts: [], threads: [], data: [{ doc: 'incoming' }] }, extra)).catch(() => {});
  /* the comment is only the wake-up (docs/assist.md): the proposal doc is the record; a watching session exports and acks on it. Without a listening session the data change stands and the next export finds it. */
  async function wake(p, line, status) {
    if (!cm) return;
    try {
      if ((await cm.canSendToClaude()) !== 'available') return;
      const text = line + '\n\nProposal incoming/' + p.pid + ' on this artifact was decided on the page. Export this artifact, then adp.py ack DIR --proposal ' + p.pid + '; reply here with the version your record shows and resolve the thread.\n· adp proposal {' + p.pid + '} · ' + status;
      const prev = p.wake && p.wake.thread;
      const r = await cm.sendToClaude(prev ? { threadId: prev, text } : { anchor: await cm.anchorFor(box), text });
      if (r && r.threadId && r.threadId !== prev) await D.doc('incoming/' + p.pid).update({ wake: { thread: r.threadId, at: new Date().toISOString() } }).catch(() => {});
    } catch (e) {}
  }
  const contentOf = async id => { try { const d = data(await D.doc('content/' + id).get()); if (d && typeof d.html === 'string') return d.html; } catch (e) {} const c = window.ADP_CONTENT || {}; return c[id] ? c[id].html : ''; };

  /* the three manifests of contract 4: live is the record; base is the live record with the proposal's from-hashes over the ids it names; incoming has its to-hashes */
  async function manifests(p) {
    const live = { parts: Object.assign({}, man && man.parts), files: {}, parents: Object.assign({}, man && man.parents), requires: man && man.requires };
    Object.entries((man && man.files) || {}).forEach(([k, v]) => { live.files[k] = s12(v); });
    const base = { parts: Object.assign({}, live.parts), files: Object.assign({}, live.files) }, inc = { parts: Object.assign({}, live.parts), files: Object.assign({}, live.files), retired: {} };
    (p.parts || []).forEach(x => {
      if (x.kind === 'content') return;                      // copy rides with its file; the content/<id> doc is written on Apply
      if (x.from == null) delete base.parts[x.id]; else base.parts[x.id] = x.from;
      if (x.retired) { delete inc.parts[x.id]; if (x.reason) inc.retired[x.id] = x.reason; } else inc.parts[x.id] = x.to;
    });
    for (const f of p.files || []) {
      if (f.ifMatch == null) delete base.files[f.path]; else base.files[f.path] = s12(f.ifMatch);
      if (gone(f)) { delete inc.files[f.path]; if (f.reason) inc.retired[f.path] = f.reason; continue; }
      inc.files[f.path] = typeof f.content === 'string' ? s12(await sha(f.content)) : s12(f.sha256) || 'chunked';
    }
    return { base, live, inc };
  }
  async function classifyNew() {
    if (!man || !canEdit()) return;
    for (const p of props.filter(p => (p.status || 'new') === 'new' && !busy[p.pid])) {
      busy[p.pid] = 'classifying';
      try {
        const m = await manifests(p), c = classify(m.base, m.live, m.inc), st = c.held.length ? 'held' : 'merged';
        await D.doc('incoming/' + p.pid).update({ status: st, classified: c });
        await dataChange('Proposal ' + p.pid + (st === 'held' ? ' held on ' + c.held.map(h => h.id).join(', ') : ' merged'));
        if (st === 'held') wake(p, 'Proposal ' + p.pid + ' is held on ' + c.held.map(h => h.id).join(', ') + '; both versions are on the card.', 'held');
      } catch (e) { notes[p.pid] = 'Could not classify: ' + (e && (e.code || e.message) || e); }
      delete busy[p.pid]; draw();
    }
  }

  async function fileContent(p, f) {
    if (typeof f.content === 'string') return f.content;
    const snap = await D.collection('incoming/' + p.pid + '/chunks').get();
    return snap.docs.map(d => d.data() || {}).filter(c => c.path === f.path).sort((a, b) => a.n - b.n).map(c => c.content).join('');
  }
  function apply(p) {      // presses within the debounce window fold into one publish
    clearTimeout(timers[p.pid]); notes[p.pid] = 'Applying…'; draw();
    timers[p.pid] = setTimeout(() => applyNow(p), o.debounce);
  }
  async function applyNow(p) {
    if (busy[p.pid]) return; busy[p.pid] = 'applying';
    const picks = p.picks || {}, skip = new Set(Object.keys(picks).filter(k => picks[k].take === 'live'));
    const parts = (p.parts || []).filter(x => !skip.has(x.id)), files = (p.files || []).filter(f => !skip.has(f.path));
    try {
      let res = { version: '', shas: {} };
      if (files.length) {
        const req = {};
        for (const f of files) req[f.path] = gone(f) ? (f.ifMatch ? { delete: true, ifMatch: f.ifMatch } : null)
          : { content: await fileContent(p, f), contentType: f.contentType || 'text/plain', ifMatch: f.ifMatch == null ? null : f.ifMatch };
        res = await art.publish(req);
      }
      const at = new Date().toISOString(), cur = data(await D.doc('manifest/current').get()) || {}, m = cur.data && !cur.parts ? cur.data : cur;
      const ch = await D.collection('changes').get();          // the next record number follows the numbered changes, zero-padded like adp.py record
      const n = Math.max(Number(m.seq) || 0, ...ch.docs.map(d => /^\d+$/.test(d.id) ? Number(d.id) : 0)) + 1, seq = String(n).padStart(6, '0');
      const mp = Object.assign({}, m.parts), mf = Object.assign({}, m.files), mc = Object.assign({}, m.content);
      parts.forEach(x => { if (x.kind === 'content') mc[x.id] = x.to; else if (x.retired) delete mp[x.id]; else mp[x.id] = x.to; });
      Object.entries(p.live_files || {}).forEach(([k, v]) => { mf[k] = s12(v); });   // what the agent saw live at propose time: the record follows it
      Object.entries(res.shas || {}).forEach(([k, v]) => { if (v) mf[k] = s12(v); else delete mf[k]; });
      for (const x of parts) {
        if (x.id.startsWith('_rest:')) continue;   // the text outside a file's parts is a pseudo-part: it lives in manifest.parts alone, never as a record (seed writes none either; its id carries the path's slashes)
        if (x.kind === 'content') { await D.doc('content/' + x.id).set({ html: x.html || '', at, by: by() }); continue; }
        if (x.retired) { await D.doc('content/' + x.id).delete().catch(() => {}); continue; }
        const pd = data(await D.doc('parts/' + x.id).get()) || {};                     // the record keeps its fields; only the hash moves
        await D.doc('parts/' + x.id).set(Object.assign({}, pd, { id: x.id, hash: x.to, at, by: by() }));   // code parts have no copy doc; copy comes as kind content
      }
      await D.doc('changes/' + seq).set({ version: res.version || '', at, by: by(), summary: p.summary || 'Proposal ' + p.pid,
        parts: parts.map(x => ({ id: x.id, from: x.from, to: x.retired ? null : x.to })), files: files.map(f => ({ path: f.path, from: f.ifMatch || null, to: (res.shas || {})[f.path] || null })), threads: p.threads || [] });
      // the manifest goes last, as adp.py seed writes it: a write that fails before it leaves the records behind the manifest, never the manifest ahead of the records
      await D.doc('manifest/current').set(Object.assign({}, m, { parts: mp, files: mf, content: mc, seq: n, version: res.version || m.version || '', at, by: by() }));
      await D.doc('incoming/' + p.pid).update({ status: 'applied', applied: { version: res.version || '', at } });
      await dataChange('Proposal ' + p.pid + ' applied as version ' + (res.version || '(records only)'));
      notes[p.pid] = '';
      wake(p, 'Proposal ' + p.pid + ' applied as version ' + (res.version || '(records only)') + '.', 'applied ' + (res.version || 'records'));
    } catch (e) {
      if (e && e.code === 'conflict') {
        const moved = (e.paths || []).map(x => ({ path: x.path, expected: x.expected, actual: x.actual }));
        notes[p.pid] = 'Not published: ' + (moved.length ? moved.map(x => x.path).join(', ') + ' moved since the proposal' : 'a newer version is live') + '.';
        await D.doc('incoming/' + p.pid).update({ status: 'held', conflict: { live: e.live || '', paths: moved, at: new Date().toISOString() } }).catch(() => {});
        await dataChange('Proposal ' + p.pid + ' held: publish conflict on ' + (moved.map(x => x.path).join(', ') || 'the version'));
        wake(p, 'Proposal ' + p.pid + ' held: publish conflict on ' + (moved.map(x => x.path).join(', ') || 'the version') + '. Export again and propose on the live files.', 'held');
      } else notes[p.pid] = 'Not applied: ' + (e && (e.message || e.code) || e);
    }
    delete busy[p.pid]; draw();
  }
  async function pick(p, id, take) {
    const picks = Object.assign({}, p.picks); picks[id] = { take, by: by(), at: new Date().toISOString() };
    await D.doc('incoming/' + p.pid).update({ picks });
    await dataChange('Proposal ' + p.pid + ': ' + id + (take === 'live' ? ' keeps the live version' : ' takes the proposal'));
  }
  async function decline(p, reason) {
    await D.doc('incoming/' + p.pid).update({ status: 'declined', decided: { by: by(), at: new Date().toISOString(), reason } });
    await dataChange('Proposal ' + p.pid + ' declined: ' + reason);
    wake(p, 'Proposal ' + p.pid + ' declined: ' + reason, 'declined');
  }

  function presenceLine() {
    const cfg = o.config || (window.ADP && window.ADP.config), mins = Number(cfg && cfg.get && cfg.get('assist.presence-minutes')) || 10, now = Date.now();
    const fresh = presence.filter(x => now - Date.parse(x.last_seen || x.at || 0) < mins * 60000);
    const line = el('div', B + 'presence');
    if (fresh.length) { line.append(el('span', B + 'dot ' + B + 'on'), el('span', null, (fresh[0].name || fresh[0].id) + ' is watching')); return line; }
    if (canSend === 'available') { line.append(el('span', B + 'dot ' + B + 'on'), el('span', null, 'A Claude session is listening: it is woken when a proposal is decided here.')); return line; }
    const handoff = 'watch the artifact ' + (o.url || '(this artifact\'s link)') + (requests.length ? ' — open requests: ' + requests.join(', ') : '');
    const b = el('button', B + 'btn', 'Copy the handoff'); b.type = 'button';
    b.addEventListener('click', () => { (navigator.clipboard ? navigator.clipboard.writeText(handoff) : Promise.reject()).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Select and copy below'; }); });
    const code = el('code', B + 'handoff', handoff);
    line.append(el('span', B + 'dot'), el('span', null, 'Nobody is watching. Paste this into any session:'), code, b);
    return line;
  }

  function card(p) {
    const c = el('article', B + 'card'), st = p.status || 'new'; c.dataset.status = st;
    const h = el('header', B + 'h');
    h.append(el('b', null, p.summary || p.pid), el('span', B + 'pill', st === 'merged' ? 'merged, not yet published' : st), el('span', B + 'meta', [p.by, when(p.at), p.pid].filter(Boolean).join(' · ')));
    c.append(h);
    const held = ((p.classified || {}).held || []), heldIds = new Set(held.map(x => x.id)), picks = p.picks || {};
    if (held.length) {
      const hs = el('div', B + 'held'); hs.append(el('h4', null, 'Held: both versions'));
      held.forEach(x => {
        const row = el('div', B + 'hrow'), part = (p.parts || []).find(y => y.id === x.id);
        row.append(el('code', null, x.id), el('span', B + 'meta', 'base ' + (x.base || '—') + ' · live ' + (x.live || '—') + ' · proposal ' + (x.incoming || '—')));
        if (part) { const d = el('div', B + 'diffbox'); contentOf(x.id).then(live => d.replaceChildren(diffView(live, part.html))); row.append(d); }
        const chosen = picks[x.id];
        if (chosen) row.append(el('p', B + 'meta', 'Picked: ' + (chosen.take === 'live' ? 'keep live' : 'take the proposal') + ' · ' + chosen.by + ' · ' + when(chosen.at)));
        if (canEdit()) ['live', 'incoming'].forEach(t => { const b = el('button', B + 'btn', t === 'live' ? 'Keep live' : 'Take the proposal'); b.type = 'button'; b.setAttribute('aria-pressed', String(!!chosen && chosen.take === t)); b.addEventListener('click', () => pick(p, x.id, t)); row.append(b); });
        hs.append(row);
      });
      c.append(hs);
    }
    (p.parts || []).filter(x => !heldIds.has(x.id)).forEach(x => {
      const d = el('details', B + 'part'), s = el('summary'); s.append(el('code', null, x.id), el('span', B + 'meta', (x.from || 'new') + ' → ' + (x.retired ? 'retired' : x.to)));
      d.append(s); d.addEventListener('toggle', () => { if (d.open && d.childNodes.length < 2) contentOf(x.id).then(live => d.append(diffView(live, x.retired ? '' : x.html))); }, { once: true });
      c.append(d);
    });
    if ((p.files || []).length) {
      const ul = el('ul', B + 'files');
      p.files.forEach(f => { const li = el('li'); li.append(el('code', null, f.path), el('span', B + 'meta', (gone(f) ? 'removed' + (f.reason ? ': ' + f.reason : '') + ' · ' : '') + 'ifMatch ' + (f.ifMatch ? f.ifMatch.slice(0, 12) : 'none (new file)'))); ul.append(li); });
      c.append(ul);
    }
    if (p.conflict) c.append(el('p', B + 'warn', 'Last Apply met a conflict: ' + ((p.conflict.paths || []).map(x => x.path + ' (expected ' + s12(x.expected) + ', now ' + s12(x.actual) + ')').join(', ') || 'a newer version') + '. Export again and propose on the live files.'));
    if (notes[p.pid]) { const n = el('p', B + 'note', notes[p.pid]); n.setAttribute('role', 'status'); c.append(n); }
    if (canEdit()) {
      const act = el('div', B + 'act'), unpicked = held.filter(x => !picks[x.id]).length;
      const ap = el('button', B + 'btn ' + B + 'primary', 'Apply'); ap.type = 'button';
      ap.disabled = !art || !!busy[p.pid] || st === 'new' || !!unpicked || !!p.conflict;
      const why = !art ? artWhy : busy[p.pid] ? '' : st === 'new' ? 'Classifying the proposal against the live record…' : unpicked ? 'Pick Keep live or Take the proposal for every held part first.' : p.conflict ? 'The files moved under this proposal; the agent must export and propose again.' : '';
      ap.title = why;
      ap.addEventListener('click', () => apply(p));
      const dc = el('button', B + 'btn', 'Decline'); dc.type = 'button';
      dc.addEventListener('click', () => {
        const f = el('form', B + 'decline'), inp = el('input'); inp.required = true; inp.placeholder = 'Why (the agent reads this)'; inp.setAttribute('aria-label', 'Reason for declining');
        const ok = el('button', B + 'btn', 'Decline with this reason'); ok.type = 'submit';
        f.append(inp, ok); f.addEventListener('submit', e => { e.preventDefault(); if (inp.value.trim()) decline(p, inp.value.trim()); });
        dc.replaceWith(f); inp.focus();
      });
      act.append(ap, dc); if (why) act.append(el('span', B + 'meta', why)); c.append(act);
    }
    return c;
  }

  function draw() {
    if (dead) return;
    const head = el('div', B + 'top'); head.append(el('h3', null, 'Incoming'), el('span', B + 'meta', props.length ? props.length + ' open' : 'nothing open'));
    const list = el('div', B + 'list');
    if (!props.length) list.append(el('p', B + 'muted', 'No proposals. An agent proposes with adp.py propose; it lands here to apply or decline.'));
    props.forEach(p => list.append(card(p)));
    if (!canEdit()) list.append(el('p', B + 'muted', 'Read only: you cannot edit this artifact. Apply and Decline need an editor (admin) of it: the owner, or a session the owner shared it with as an editor.'));
    box.replaceChildren(head, presenceLine(), list);
  }
  draw();
  return { update: draw, destroy() { dead = true; offs.forEach(f => { try { typeof f === 'function' && f(); } catch (e) {} }); Object.values(timers).forEach(clearTimeout); root.replaceChildren(); } };
}
Kit.inbox = Object.freeze({ mount });
})();
/* /part:page.script.kit.inbox */
