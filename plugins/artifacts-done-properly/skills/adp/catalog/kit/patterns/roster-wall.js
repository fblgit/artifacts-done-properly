/* part:page.script.kit.roster-wall */
/**
 * Roster, presence and claims
 * Kit.rosterWall.mount(box, {actors, claims, now, onSend, remember, drawerHost}) draws one list three ways. The wall has a card per actor with its name and role, a state pill and an activity pill from kit.vocab, the resources it holds, how many messages wait for it, and a last-seen beat that says Live or Stale in words with the time. The Team view is a table of the same list; the Claims view is a table of what is held with when it runs out (Held, Expired or Released, in words). A filter by state shows a count per state. Pressing a name opens a side drawer (kit.drawer) with the actor's items, its holds and, when onSend is given, a line to write to it; a half-typed message survives a redraw (kit.keep-state) when update() brings new data. The view and filter are remembered in this browser under your key. State words come from the vocabulary table: the file adds the enums actor-state and actor-activity only if the page has not defined them.
 *
 * What it is: the people and agents working on something, drawn three ways from one list. A wall of cards (name and role, a state pill and an activity pill from kit.vocab, the
 * resources each one holds, how many messages wait for it, and a last-seen beat that says Live or Stale in words), a team table, and a claims table with expiry. A filter by state
 * counts what it hides. A card opens a side drawer (kit.drawer) with the actor's items and, when the page can send, a line to write to them; that draft survives a redraw
 * (kit.keep-state). The view and filter are remembered in this browser when you give a key.
 *
 * Every state word, glyph and tone comes from the vocabulary table (kit/vocab.js). This file adds two small enums only when the page has not defined them: "actor-state" and
 * "actor-activity"; define your own with Kit.vocab.define({...}) before mount and pass their names as stateEnum / activityEnum.
 *
 * API:
 *   Kit.rosterWall.mount(box, opts) -> {update(actors, claims), setView(v), setFilter(state|null), open(name), destroy()}
 *     actors     [{name, role, state, activity, holds: [{name, kind}], queued, lastSeen (ISO), items: [{id, title, state}]}]
 *     claims     [{resource, holder, until (ISO), state}]    state: "held" | "released"; the claims table lists what was held, with expiry against now
 *     now        ISO string or Date the page treats as now (default: the clock); liveMin the minutes a last-seen counts as Live (default 5)
 *     view       "wall" (default) | "team" | "claims"      filter  a state value or null
 *     stateEnum  vocabulary enum of the actor's state (default "actor-state")      activityEnum  (default "actor-activity")      itemEnum  (default "state")
 *     remember   a localStorage key for the view and filter (guarded; the page works without it)
 *     onSend     (name, text) => Promise|void; set it and the drawer shows a send line      onOpen  (name) after a drawer opens
 *     drawerHost an element (position: relative) to confine the drawer to; default the page
 *     timeZone   for the clock text (default: the viewer's; the preview passes "UTC")
 * Methods of what Kit.rosterWall.mount returns: update(actors, claims), setView, setFilter, open(name)
 *
 * @id        pattern.roster
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A wall of cards, one per person or agent (state and activity pills, what it holds, a queue count, a Live or Stale last-seen), a team table, and a claims table with expiry.
 * @tags      roster, presence, members, team, claims, last seen, live, stale, wall, drawer
 * @requires  kit.tokens, kit.vocab, kit.drawer, kit.keep-state
 * @files     kit/patterns/roster-wall.css, kit/samples/patterns.json
 * @provides  Kit.rosterWall.mount
 * @config    Kit.rosterWall.mount(box, opts) | actors [{name, role, state, activity, holds [{name, kind}], queued, lastSeen, items [{id, title, state}]}], claims [{resource, holder, until, state}], now, liveMin, view wall | team | claims, filter, stateEnum, activityEnum, itemEnum, remember, onSend(name, text), onOpen, drawerHost, timeZone; returns {update, setView, setFilter, open, destroy}
 * @config    Kit.vocab.define({...}) | optional: your own actor-state and actor-activity tables (word, short, glyph, tone, motion per value); the file supplies small defaults when they are missing
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono --ok --danger --accent-ink? --rim? --pool? --glz-r-l? --glz-sh-1? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's member wall and roster | the member card (state, activity, holds, queue count, last seen) and the roster's send line
 * @source    Catalog harvest, 2026-10-25 | an earlier board's team and status pass | the live and stale beat
 * @source    Catalog harvest, 2026-10-25 | a task page's team table and claims table | the claims table with expiry
 * @preview   {"render": "pattern.roster", "samples": ["kit/samples/patterns.json#roster-wall"]}
 * @samples   roster-wall
 * @changed   Rebuilt as plain DOM over kit.vocab: no state is a hub value, and a state the table does not know is flagged, not hidden.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DEFAULTS = {
  'actor-state': {
    working: { word: 'Working', short: 'working', glyph: 'pulse', tone: 'active', motion: 'breathe' },
    waiting: { word: 'Waiting for an answer', short: 'waiting', glyph: 'hand', tone: 'attention', motion: 'turn' },
    idle: { word: 'Idle', short: 'idle', glyph: 'ring', tone: 'neutral', motion: 'none' },
    away: { word: 'Away', short: 'away', glyph: 'moon', tone: 'ended', motion: 'none' },
    failing: { word: 'Failing', short: 'failing', glyph: 'cross', tone: 'danger', motion: 'none' },
  },
  'actor-activity': {
    building: { word: 'Building', short: 'build', glyph: 'play', tone: 'active', motion: 'none' },
    reviewing: { word: 'Reviewing', short: 'review', glyph: 'eye', tone: 'review', motion: 'none' },
    writing: { word: 'Writing', short: 'write', glyph: 'reply', tone: 'info', motion: 'none' },
    reading: { word: 'Reading', short: 'read', glyph: 'eye', tone: 'neutral', motion: 'none' },
    none: null,
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(DEFAULTS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }

const span = (a, b) => Math.round((a - b) / 60000);   // minutes from b to a
function words(min) { const m = Math.abs(min); return m < 1 ? 'under a minute' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'; }
function mount(box, opts) {
  ensure();
  const o = Object.assign({ actors: [], claims: [], view: 'wall', filter: null, stateEnum: 'actor-state', activityEnum: 'actor-activity', itemEnum: 'state', liveMin: 5 }, opts);
  let actors = o.actors.slice(), claims = (o.claims || []).slice(), view = o.view, filter = o.filter, handle = null, openName = null;
  const sk = o.remember ? 'kit-rw:' + o.remember : null;
  if (sk) { try { const m = JSON.parse(localStorage.getItem(sk) || 'null'); if (m) { if (['wall', 'team', 'claims'].includes(m.view)) view = m.view; if (m.filter === null || typeof m.filter === 'string') filter = m.filter; } } catch (_) {} }
  const save = () => { if (sk) { try { localStorage.setItem(sk, JSON.stringify({ view, filter })); } catch (_) {} } };
  const nowMs = () => o.now ? new Date(o.now).getTime() : Date.now();
  const clock = iso => { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }); } catch (_) { return String(iso); } };
  box.classList.add('kit-rw'); box.replaceChildren();
  const bar = el('div', 'kit-rw-bar'), views = el('div', 'kit-rw-views'), filt = el('div', 'kit-rw-filter');
  views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'View'); filt.setAttribute('role', 'group'); filt.setAttribute('aria-label', 'Filter by state');
  const status = el('p', 'kit-rw-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const body = el('div', 'kit-rw-body');
  bar.append(views, filt); box.append(bar, status, body);

  function seen(a) {
    const s = el('span', 'kit-rw-seen');
    if (!a.lastSeen) { s.append(el('b', null, 'Never seen')); return s; }
    const min = span(nowMs(), new Date(a.lastSeen).getTime()), live = min <= o.liveMin;
    s.dataset.live = live ? 'true' : 'false';
    const t = el('time', null, words(min) + ' ago'); t.dateTime = a.lastSeen; t.title = clock(a.lastSeen);
    s.append(el('b', null, live ? 'Live' : 'Stale'), t); return s;
  }
  const pill = (en, v) => V().pill(en, v, { unknown: 'flag' });
  const heldBy = n => claims.filter(c => c.holder === n && c.state === 'held');

  function card(a) {
    const li = el('li', 'kit-rw-card'); const row = V().get(o.stateEnum, a.state); li.setAttribute('data-vo-tone', row ? row.tone : 'neutral');
    const head = el('div', 'kit-rw-head'), nm = el('button', 'kit-rw-name', a.name); nm.type = 'button'; nm.setAttribute('aria-haspopup', 'dialog'); nm.setAttribute('aria-label', 'Open ' + a.name);
    nm.addEventListener('click', () => openDrawer(a.name, nm));
    head.append(nm, el('span', 'kit-rw-role', a.role || ''));
    const pills = el('div', 'kit-rw-pills'); [pill(o.stateEnum, a.state), a.activity != null ? pill(o.activityEnum, a.activity) : null].forEach(p => p && pills.append(p));
    li.append(head, pills);
    const holds = a.holds || [];
    if (holds.length) { const h = el('div', 'kit-rw-holds'); h.append(el('span', 'kit-rw-lab', 'Holds')); const ul = el('ul'); holds.forEach(x => { const i = el('li'); if (x.kind) i.append(el('i', null, x.kind)); i.append(el('code', null, x.name)); ul.append(i); }); h.append(ul); li.append(h); }
    const foot = el('div', 'kit-rw-foot');
    if (a.queued > 0) foot.append(el('span', 'kit-rw-queued', a.queued + (a.queued === 1 ? ' message waiting' : ' messages waiting')));
    foot.append(seen(a)); li.append(foot); return li;
  }
  function counts() { const m = {}; actors.forEach(a => { m[a.state] = (m[a.state] || 0) + 1; }); return m; }
  const shown = () => filter == null ? actors : actors.filter(a => a.state === filter);
  function table(cols, rows, label) {
    const w = el('div', 'kit-rw-tw'); w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', label);
    const t = el('table', 'kit-rw-table'), th = el('thead'), tr = el('tr'); cols.forEach(c => { const h = el('th', null, c); h.scope = 'col'; tr.append(h); }); th.append(tr);
    const tb = el('tbody'); rows.forEach(r => { const x = el('tr'); r.forEach(c => { const d = el('td'); if (c instanceof Node) d.append(c); else d.textContent = c == null ? '' : String(c); x.append(d); }); tb.append(x); });
    t.append(th, tb); w.append(t); return w;
  }
  function draw() {
    views.textContent = ''; filt.textContent = '';
    [['wall', 'Wall'], ['team', 'Team'], ['claims', 'Claims']].forEach(([k, l]) => { const b = el('button', 'kit-rw-btn', l); b.type = 'button'; b.setAttribute('aria-pressed', String(view === k)); b.addEventListener('click', () => api.setView(k)); views.append(b); });
    if (view !== 'claims') {
      const c = counts(), all = el('button', 'kit-rw-btn', 'All ' + actors.length); all.type = 'button'; all.setAttribute('aria-pressed', String(filter == null)); all.addEventListener('click', () => api.setFilter(null)); filt.append(all);
      V().values(o.stateEnum).forEach(v => {
        if (!c[v] && filter !== v) return; const m = V().chip(o.stateEnum, v, { unknown: 'skip' }); if (!m) return;
        const b = el('button', 'kit-rw-btn kit-rw-fb'); b.type = 'button'; b.setAttribute('aria-pressed', String(filter === v)); b.append(m, el('b', null, String(c[v] || 0))); b.addEventListener('click', () => api.setFilter(filter === v ? null : v)); filt.append(b);
      });
    }
    filt.hidden = view === 'claims';
    body.textContent = '';
    if (view === 'claims') {
      status.textContent = claims.length + (claims.length === 1 ? ' claim' : ' claims');
      if (!claims.length) { body.append(el('p', 'kit-rw-empty', 'Nothing is claimed. A claim appears here with its holder and when it runs out.')); return; }
      const rows = claims.map(c => {
        const min = span(new Date(c.until).getTime(), nowMs()), over = c.state !== 'held' ? 'Released' : min < 0 ? 'Expired' : 'Held';
        const s = el('span', 'kit-rw-exp'); s.dataset.state = over.toLowerCase(); s.append(el('b', null, over));
        const t = el('time', null, c.state !== 'held' ? 'ended ' + clock(c.until) : min < 0 ? words(min) + ' ago' : 'in ' + words(min)); t.dateTime = c.until; t.title = clock(c.until); s.append(t);
        return [el('code', null, c.resource), c.holder, s];
      });
      body.append(table(['Resource', 'Holder', 'Expiry'], rows, 'Claims and when they expire')); return;
    }
    const list = shown();
    const fr = filter == null ? null : V().get(o.stateEnum, filter);
    status.textContent = filter == null ? actors.length + (actors.length === 1 ? ' person' : ' people') : list.length + ' of ' + actors.length + ' shown, state ' + (fr ? fr.short : filter);
    if (!list.length) { body.append(el('p', 'kit-rw-empty', actors.length ? 'No one is in this state. Choose All to see everyone.' : 'No one has joined yet. Each person who joins gets a card here.')); return; }
    if (view === 'team') {
      body.append(table(['Name', 'Role', 'State', 'Activity', 'Last seen'], list.map(a => {
        const n = el('button', 'kit-rw-name', a.name); n.type = 'button'; n.addEventListener('click', () => openDrawer(a.name, n));
        return [n, a.role || '', pill(o.stateEnum, a.state), a.activity != null ? pill(o.activityEnum, a.activity) : '', seen(a)];
      }), 'Team')); return;
    }
    const ul = el('ul', 'kit-rw-grid'); list.forEach(a => ul.append(card(a))); body.append(ul);
  }
  const redraw = (Kit.keepState && Kit.keepState.wrap) ? Kit.keepState.wrap(box, draw) : draw;

  function drawerBody(a) {
    const b = el('div', 'kit-rw-dr');
    const top = el('div', 'kit-rw-pills'); [pill(o.stateEnum, a.state), a.activity != null ? pill(o.activityEnum, a.activity) : null].forEach(p => p && top.append(p));
    b.append(el('p', 'kit-rw-drsub', (a.role || 'Member') + ' · ' + (a.lastSeen ? 'last seen ' + words(span(nowMs(), new Date(a.lastSeen).getTime())) + ' ago' : 'never seen')), top);
    const items = a.items || [];
    const sec = el('section', 'kit-rw-sec'); sec.append(el('h3', null, 'Working on ' + items.length));
    if (!items.length) sec.append(el('p', 'kit-rw-empty', 'No items yet.'));
    else { const ul = el('ul', 'kit-rw-items'); items.forEach(i => { const li = el('li'); li.append(el('code', null, i.id), el('span', null, i.title)); const c = V().chip(o.itemEnum, i.state, { unknown: 'flag' }); if (c) li.append(c); ul.append(li); }); sec.append(ul); }
    b.append(sec);
    const hs = a.holds || [], hc = heldBy(a.name).filter(c => !hs.some(x => (x.kind ? x.kind + ' ' : '') + x.name === c.resource));
    if (hs.length || hc.length) { const s2 = el('section', 'kit-rw-sec'); s2.append(el('h3', null, 'Holds')); const ul = el('ul', 'kit-rw-items'); hs.forEach(x => { const li = el('li'); li.append(el('code', null, x.name), el('span', null, x.kind || '')); ul.append(li); }); hc.forEach(c => { const li = el('li'); li.append(el('code', null, c.resource), el('span', null, 'until ' + clock(c.until))); ul.append(li); }); s2.append(ul); b.append(s2); }
    if (typeof o.onSend === 'function') {
      const f = el('form', 'kit-rw-send'); const id = 'kit-rw-msg-' + a.name.replace(/\W+/g, '-').toLowerCase();
      const lab = el('label', null, 'Message to ' + a.name); lab.htmlFor = id;
      const ta = el('textarea'); ta.id = id; ta.rows = 3; ta.setAttribute('data-keep', id); ta.placeholder = 'Write a line for ' + a.name;
      const row = el('div', 'kit-rw-sendrow'), go = el('button', 'kit-rw-go', 'Send'); go.type = 'submit'; const note = el('span', 'kit-rw-sent'); note.setAttribute('role', 'status'); row.append(go, note);
      f.addEventListener('submit', e => {
        e.preventDefault(); const t = ta.value.trim(); if (!t) { note.textContent = 'Write something first.'; return; } go.disabled = true;
        Promise.resolve(o.onSend(a.name, t)).then(() => { ta.value = ''; ta.defaultValue = ''; note.textContent = 'Sent to ' + a.name + '.'; }, () => { note.textContent = 'Not sent. Try again.'; }).finally(() => { go.disabled = false; });
      });
      f.append(lab, ta, row); b.append(f);
    }
    return b;
  }
  function openDrawer(name, opener) {
    const a = actors.find(x => x.name === name); if (!a || !Kit.drawer) return;
    openName = name;
    handle = Kit.drawer.open({ title: a.name, body: drawerBody(a), host: o.drawerHost || undefined, opener, onClose: () => { if (openName === name) { openName = null; handle = null; } } });
    if (o.onOpen) o.onOpen(name);
  }
  function redrawDrawer() {
    if (!handle || !handle.isOpen() || openName == null) return; const a = actors.find(x => x.name === openName); if (!a) { handle.close(); return; }
    const put = () => handle.setBody(drawerBody(a)); (Kit.keepState ? Kit.keepState.wrap(handle.el, put) : put)();
  }
  const api = {
    update(a, c) { if (a) actors = a.slice(); if (c) claims = c.slice(); redraw(); redrawDrawer(); },
    setView(v) { if (!['wall', 'team', 'claims'].includes(v)) return; view = v; save(); redraw(); },
    setFilter(f) { filter = f; save(); redraw(); },
    open(name) { openDrawer(name); },
    destroy() { if (handle && handle.isOpen()) handle.close(); box.replaceChildren(); box.classList.remove('kit-rw'); },
  };
  redraw(); return api;
}
Kit.rosterWall = Object.freeze({ mount });
})();
/* /part:page.script.kit.roster-wall */
