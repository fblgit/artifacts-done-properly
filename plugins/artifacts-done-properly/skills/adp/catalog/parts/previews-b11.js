/* part:page.script.previews.b11 */
/* Live previews of batch 11 (patterns for work in flight): the roster, the lease and waiter graph, the event log, the card history, the structured report cards, the approval gate, the work card
   with stamps and the status columns. Each mounts the entry's own published file on its own published sample (invented content, a fixed clock and UTC times). Nothing leaves the page: a send, a
   verdict or a move calls a handler that only reports here what it was given. */
(function () {
'use strict';
const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const STYLE = `
.pv11-frame { position: relative; min-width: 0; padding: 14px; border-radius: 12px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); isolation: isolate; }
.pv11-frame.phone { max-width: 390px; }
.pv11-stack { display: grid; gap: 12px; min-width: 0; }
.pv11-row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; min-width: 0; }
.pv11-lab { font: 600 12px/1.2 var(--f-mono); letter-spacing: .04em; color: var(--ink-2); }
.pv11-note { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-2); max-width: 78ch; }
.pv11-out { margin: 0; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 10px; background: var(--sunk); font: 12.5px/1.5 var(--f-mono); color: var(--ink); overflow-wrap: anywhere; }
.pv11-host { position: relative; min-height: 560px; overflow: hidden; border-radius: 12px; }
.pv11-btn { min-height: 34px; padding: 0 14px; border: 1px solid var(--rule); border-radius: 999px; background: var(--panel); color: var(--ink); font: 600 13px var(--f-ui); cursor: pointer; }
.pv11-btn:hover { background: var(--sunk); } .pv11-btn[aria-pressed="true"] { border-color: var(--seam, var(--accent)); box-shadow: inset 0 0 0 1px var(--seam, var(--accent)); }
.pv11-btn:focus-visible { outline: 3px solid var(--seam, var(--accent)); outline-offset: 2px; }
`;
if (!document.querySelector('style[data-pv="b11"]')) { const st = document.createElement('style'); st.dataset.pv = 'b11'; st.textContent = STYLE; document.head.append(st); }
function useFonts(theme) {
  useEffect(() => {
    const u = theme && theme.fonts; if (!u || document.querySelector('link[data-pv-fonts="' + u + '"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.dataset.pvFonts = u; document.head.append(l);
  }, [theme && theme.fonts]);
}
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; ref.current.textContent = ''; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps);
  return ref;
}
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Width = ({ v, set }) => html`<${Seg} label="Width" value=${v} set=${set} items=${[['full', 'Full width'], ['phone', 'Phone, 390 px']]}/>`;

// ---------------------------------------------------------------- pattern.roster
P['pattern.roster'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'roster-wall'); const [w, setW] = useState('full'); const [sent, setSent] = useState('');
  const host = useRef(null);
  const ref = useMount(el => K().rosterWall.mount(el, { actors: d.actors, claims: d.claims, now: d.now, timeZone: 'UTC', remember: 'catalog-preview-roster', drawerHost: host.current,
    onSend: (name, text) => new Promise(res => setTimeout(() => { setSent(name + ': ' + text); res(); }, 250)) }), [w]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv11-frame pv11-host' + (w === 'phone' ? ' phone' : '')} ref=${host} key=${w}><div ref=${ref}></div></div>
    <p class="pv11-note">Six invented crew members. Choose a name to open the drawer, write a line and send: the page only shows here what would be sent. The view and the filter are remembered in this browser under one key. Times are UTC and the clock is fixed at Thursday 10:30, so Live and Stale do not drift.</p>
    ${sent ? html`<p class="pv11-out" role="status">Would send to ${sent}</p>` : null}
  </div>`;
};

// ---------------------------------------------------------------- viz.lease-graph
P['viz.lease-graph'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'lease-graph'); const [later, setLater] = useState(false); const [w, setW] = useState('full');
  const now = later ? '2026-10-22T11:00:00Z' : d.now;
  const ref = useMount(el => K().leaseGraph.mount(el, { holds: d.holds, waits: d.waits, denials: d.denials, now, timeZone: 'UTC' }), [later, w]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/><${Seg} label="Clock" value=${later ? 'later' : 'now'} set=${k => setLater(k === 'later')} items=${[['now', 'Thursday 10:30'], ['later', 'Thursday 11:00']]}/></div>
    <div class=${'pv11-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w + now}></div></div>
    <p class="pv11-note">Three held resources. The branch has two people waiting for its release (the holder's own wait is left out), the environment turned away two requests, and the document request stands alone because nothing holds it now. Move the clock to 11:00 and the environment lease shows as expired, in words. Everything is invented.</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.event-log
P['pattern.event-log'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'event-log'); const [w, setW] = useState('full'); const [fold, setFold] = useState(true); const ref = useRef(null); const api = useRef(null);
  const m = useMount(el => { const h = K().eventLog.mount(el, { events: d.events, timeZone: 'UTC', fold, remember: 'catalog-preview-event-log' }); api.current = h; return h; }, [w, fold]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/><${Seg} label="Repeats" value=${fold ? 'fold' : 'flat'} set=${k => setFold(k === 'fold')} items=${[['fold', 'Fold repeats'], ['flat', 'Show every move']]}/></div>
    <div class=${'pv11-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${m} key=${w + fold}></div></div>
    <p class="pv11-note">Forty invented moves over six days, newest first. The three newest days start open; press a day to fold it, a row to fill the panel, then step with Newer and Older. A run of the same actor doing the same thing folds into one row with a count. In your page, put the top bar's height in --kit-topbar-h and the panel sticks beneath it. Times are UTC.</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.card-history
P['pattern.card-history'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'card-history'); const [w, setW] = useState('full');
  const ref = useMount(el => K().cardHistory.mount(el, { moves: d.moves, turns: d.turns, me: d.me, timeZone: 'UTC' }), [w]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv11-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <p class="pv11-note">One invented record: eleven moves over two days and three turns, the last still unanswered. Press a node on the track to jump to its move. "You" is Tobias in this sample. Times are UTC.</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.report-cards
P['pattern.report-cards'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'report-cards'); const [w, setW] = useState('full');
  const ref = useMount(el => K().reportCards.mount(el, { reports: d.reports, labels: d.labels, timeZone: 'UTC' }), [w]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv11-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <p class="pv11-note">One report of each of the nine kinds, from an invented build. All share one head; each shows only its own fields in a fixed order. The done card shows a test strip drawn to scale (pass, fail, skip, each with a glyph and a word), the table of where the work differs from the ask, and what was not checked.</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.gate
P['pattern.gate'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'gate'); const [look, setLook] = useState('plain'); const [w, setW] = useState('full'); const [last, setLast] = useState(''); const api = useRef(null);
  const ref = useMount(el => { const h = K().gate.mount(el, { gates: d.gates, look, me: d.me, now: d.now, timeZone: 'UTC', onVerdict: (id, v) => setLast(id + ' ' + v.state + (v.reason ? ': ' + v.reason : '')) }); api.current = h; return h; }, [w]);
  useEffect(() => { if (api.current) api.current.setLook(look); }, [look]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/><${Seg} label="Look" value=${look} set=${setLook} items=${[['plain', 'Plain'], ['console', 'Console'], ['ticket', 'Ticket'], ['two-key', 'Two keys']]}/></div>
    <div class=${'pv11-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <p class="pv11-note">Four invented gates: a low-risk edit, a medium one, an approved publish that is now locked, and a deletion that was rejected with a reason and then refused. Approve the first, reject the second (a reason is required), or withdraw a verdict. The four looks change only the dressing. Nothing is saved; the line below shows what a board's onVerdict would receive.</p>
    ${last ? html`<p class="pv11-out" role="status">onVerdict(${last})</p>` : null}
  </div>`;
};

// ---------------------------------------------------------------- pattern.work-card
P['pattern.work-card'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'work-card'); const [w, setW] = useState('full'); const [open, setOpen] = useState('');
  const ref = useMount(el => K().workCard.mount(el, { items: d.items, timeZone: 'UTC', onOpen: it => setOpen(it.id + ' ' + it.title) }), [w]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv11-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <p class="pv11-note">Four invented items: running with a question open and a polished title over the title as filed; waiting on a review with changes asked; ended onto a commit with an answer that was read; and one whose provenance badge says Stale because the record moved after the card was written (shown v5, record v8).</p>
    ${open ? html`<p class="pv11-out" role="status">onOpen(${open})</p>` : null}
  </div>`;
};

// ---------------------------------------------------------------- pattern.status-columns
const OWNERS = ['Mara', 'Priya', 'Tobias', 'Ines'];
P['pattern.status-columns'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'status-columns'); const [w, setW] = useState('full'); const [who, setWho] = useState('all'); const [moved, setMoved] = useState(''); const api = useRef(null);
  useMemo(() => { K().vocab.define(d.vocab); return true; }, [d]);
  const ref = useMount(el => { const h = K().statusColumns.mount(el, { cards: d.cards, groups: d.groups, limits: d.limits, stateEnum: 'lane', remember: 'catalog-preview-status-columns', label: 'Work by state',
    onMove: (c, to, reason) => setMoved(c.id + ' to ' + to + ' because ' + reason) }); api.current = h; return h; }, [w]);
  useEffect(() => { if (api.current) api.current.filter(who === 'all' ? null : c => c.owner === who); }, [who, w]);
  return html`<div class="pv11-stack">
    <div class="pv11-row"><${Width} v=${w} set=${setW}/><${Seg} label="Show cards of" value=${who} set=${setWho} items=${[['all', 'Everyone']].concat(OWNERS.map(o => [o, o]))}/></div>
    <div class=${'pv11-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <p class="pv11-note">Twelve invented cards in six states. The column that waits for a person is the widest, and Running shows over its limit of 3. Choose one person and the columns with nothing to show fold to rails; press a rail to open it. Hover or focus a card for a glimpse. Drag a card, or use its Move menu: the form asks for a reason before anything changes. Group by Owner swaps the columns.</p>
    ${moved ? html`<p class="pv11-out" role="status">onMove(${moved})</p>` : null}
  </div>`;
};
})();
/* /part:page.script.previews.b11 */
