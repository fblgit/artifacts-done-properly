/* part:page.script.kit.lease-graph */
/**
 * Lease and waiter graph
 * Kit.leaseGraph.mount(box, {holds, waits, denials, now}) draws a nested list. Each held resource ({kind, name}) is a node with its state, kind, holder and when the lease runs out; a lease past its time that was never released reads Expired, with how long ago. The people waiting for its release list under it with where each wait came from (the holder's own wait is left out). Each denied request hangs under the resource that caused it, joined by a line, with who asked, who held it and until when; a denial whose resource nothing holds now stands alone and says so. It is a list on purpose, so it reads in a screen reader and prints; the order and the words carry the meaning. State words come from the vocabulary table: the file adds lease-state, lease-kind and wait-origin only if the page has not defined them.
 *
 * API:
 *   Kit.leaseGraph.mount(box, opts) -> {update(data), destroy()}
 *     holds    [{resource: {kind, name}, holder, until (ISO), state: "held" | "released"}]
 *     waits    [{actor, resource: {kind, name}, origin}]        the waiters on a resource's release; the holder's own wait is left out
 *     denials  [{asker, resource: {kind, name}, because: {holder, until}, at}]
 *     now      ISO string or Date taken as now (default: the clock)      timeZone  for the clock text (default: the viewer's)
 *     stateEnum "lease-state"   kindEnum "lease-kind"   originEnum "wait-origin"
 *
 * The board hands over its claims, subscriptions and denials as three lists.
 *
 * @id        viz.lease-graph
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Who holds each exclusive resource, who waits for its release, and, nested under it, each request that was turned away because of it.
 * @tags      lease, lock, claim, waiters, denied, resource, holder, expiry, graph
 * @requires  kit.tokens, kit.vocab
 * @files     kit/viz/lease-graph.css, kit/samples/lease-graph.json
 * @provides  Kit.leaseGraph.mount
 * @config    Kit.leaseGraph.mount(box, opts) | holds [{resource {kind, name}, holder, until, state}], waits [{actor, resource, origin}], denials [{asker, resource, because {holder, until}, at}], now, timeZone, stateEnum, kindEnum, originEnum; returns {update, destroy}
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --f-ui --f-mono --rim? --pool? --glz-r-l? --glz-sh-1? --warn
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's claim graph and claim row | a held claim, the members subscribed to its release and the denials of the same key nested under it
 * @preview   {"render": "viz.lease-graph", "samples": ["kit/samples/lease-graph.json"]}
 * @changed   Resources are {kind, name} pairs the page supplies, not the source's typed keys.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DEFAULTS = {
  'lease-state': {
    held: { word: 'Held', short: 'held', glyph: 'play', tone: 'active', motion: 'none' },
    expired: { word: 'Expired, not released', short: 'expired', glyph: 'hourglass', tone: 'danger', motion: 'none' },
    released: { word: 'Released', short: 'released', glyph: 'ring', tone: 'ended', motion: 'none' },
    denied: { word: 'Denied', short: 'denied', glyph: 'stop', tone: 'attention', motion: 'none' },
  },
  'lease-kind': {
    branch: { word: 'Branch', short: 'branch', glyph: 'diamond', tone: 'neutral', motion: 'none' },
    env: { word: 'Environment', short: 'env', glyph: 'pulse', tone: 'neutral', motion: 'none' },
    doc: { word: 'Document', short: 'doc', glyph: 'reply', tone: 'neutral', motion: 'none' },
    cache: { word: 'Cache', short: 'cache', glyph: 'ring', tone: 'neutral', motion: 'none' },
  },
  'wait-origin': {
    asked: { word: 'Asked to be told', short: 'asked', glyph: 'hand', tone: 'neutral', motion: 'none' },
    standing: { word: 'Standing request', short: 'standing', glyph: 'eye', tone: 'neutral', motion: 'none' },
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(DEFAULTS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }
const same = (a, b) => a && b && a.kind === b.kind && a.name === b.name;
const mins = (a, b) => Math.round((a - b) / 60000);
function words(min) { const m = Math.abs(min); return m < 1 ? 'under a minute' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'; }

function mount(box, opts) {
  ensure();
  const o = Object.assign({ holds: [], waits: [], denials: [], stateEnum: 'lease-state', kindEnum: 'lease-kind', originEnum: 'wait-origin' }, opts);
  let data = { holds: o.holds, waits: o.waits, denials: o.denials };
  const nowMs = () => o.now ? new Date(o.now).getTime() : Date.now();
  const clock = iso => { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }); } catch (_) { return String(iso); } };
  box.classList.add('kit-ls'); box.replaceChildren();
  const sum = el('p', 'kit-ls-sum'); sum.setAttribute('role', 'status'); const list = el('ul', 'kit-ls-list'); list.setAttribute('aria-label', 'Held resources, their waiters and denied requests');
  box.append(sum, list);

  function resource(r) {
    const s = el('span', 'kit-ls-res'); const k = V().chip(o.kindEnum, r.kind, { unknown: 'flag' }); if (k) s.append(k); s.append(el('code', null, r.name)); return s;
  }
  function until(iso, held) {
    const t = el('time', null, clock(iso)); t.dateTime = iso;
    const m = mins(new Date(iso).getTime(), nowMs()); const note = held ? (m >= 0 ? ' (in ' + words(m) + ')' : ' (' + words(m) + ' ago)') : '';
    const s = el('span', 'kit-ls-until'); s.append(t, document.createTextNode(note)); return s;
  }
  function field(label, value) { const f = el('span', 'kit-ls-f'); f.append(el('span', 'kit-ls-k', label)); f.append(value instanceof Node ? value : el('span', 'kit-ls-v', value)); return f; }
  function stateOf(h) { return h.state === 'released' ? 'released' : new Date(h.until).getTime() < nowMs() ? 'expired' : 'held'; }
  function waiters(res, holder) {
    const w = data.waits.filter(x => same(x.resource, res) && x.actor !== holder); if (!w.length) return null;
    const box2 = el('div', 'kit-ls-wait'); box2.append(el('span', 'kit-ls-k', 'Waiting for the release'));
    const ul = el('ul'); w.forEach(x => { const li = el('li'); li.append(el('b', null, x.actor)); const c = x.origin ? V().chip(o.originEnum, x.origin, { unknown: 'flag' }) : null; if (c) li.append(c); ul.append(li); }); box2.append(ul); return box2;
  }
  function denial(d, holdsNow) {
    const li = el('li', 'kit-ls-edge'), a = el('article', 'kit-ls-card kit-ls-denial');
    const head = el('header', 'kit-ls-head'); const p = V().pill(o.stateEnum, 'denied', { unknown: 'flag' }); if (p) head.append(p); head.append(resource(d.resource)); a.append(head);
    const who = el('div', 'kit-ls-who'); who.append(field('Asked by', d.asker)); if (d.because && d.because.holder) { who.append(field('Held by', d.because.holder)); if (d.because.until) who.append(field('Until', until(d.because.until, true))); }
    if (d.at) who.append(field('Asked at', until(d.at, false)));
    a.append(who);
    if (!holdsNow) a.append(el('p', 'kit-ls-note', 'Nothing holds this resource now. The request can be asked again.'));
    li.append(a); return li;
  }
  function draw() {
    list.textContent = '';
    const placed = new Set(); let held = 0, waiting = 0, denied = 0;
    data.holds.forEach((h, i) => {
      const li = el('li', 'kit-ls-node'), a = el('article', 'kit-ls-card'); const st = stateOf(h); const row = V().get(o.stateEnum, st); a.setAttribute('data-vo-tone', row ? row.tone : 'neutral');
      const head = el('header', 'kit-ls-head'), p = V().pill(o.stateEnum, st, { unknown: 'flag' }); if (p) head.append(p); head.append(resource(h.resource)); a.append(head);
      const who = el('div', 'kit-ls-who'); who.append(field('Holder', h.holder)); who.append(field(st === 'released' ? 'Ended' : 'Until', until(h.until, st !== 'released'))); a.append(who);
      const w = waiters(h.resource, h.holder); if (w) { a.append(w); waiting += w.querySelectorAll('li').length; }
      li.append(a);
      const mine = data.denials.filter(d => same(d.resource, h.resource));
      if (mine.length) { const ul = el('ul', 'kit-ls-denials'); ul.setAttribute('aria-label', 'Denied because of ' + h.resource.name); mine.forEach(d => { placed.add(d); ul.append(denial(d, true)); }); li.append(ul); denied += mine.length; }
      if (st === 'held') held++;
      list.append(li);
    });
    data.denials.filter(d => !placed.has(d)).forEach(d => { const li = el('li', 'kit-ls-node'); li.append(denial(d, false).firstChild); list.append(li); denied++; });
    sum.textContent = held + ' held, ' + waiting + ' waiting, ' + denied + ' denied';
    if (!list.children.length) { const e = el('li', 'kit-ls-empty', 'Nothing is leased. A held resource appears here with its holder, its waiters and any request it turned away.'); list.append(e); }
  }
  draw();
  return { update(d) { data = Object.assign({ holds: [], waits: [], denials: [] }, d); draw(); }, destroy() { box.replaceChildren(); box.classList.remove('kit-ls'); } };
}
Kit.leaseGraph = Object.freeze({ mount });
})();
/* /part:page.script.kit.lease-graph */
