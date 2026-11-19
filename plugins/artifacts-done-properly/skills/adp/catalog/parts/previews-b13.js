/* part:page.script.previews.b13 */
/* Live previews of batch 13 (the upgrades and the lifecycle board template): steps with owners, the record dialog, the refusal callout, decision cards with an acknowledgement, the reference reader,
   the phased time rail, the skin switch and the lifecycle board page. Each mounts the entry's own published file on its own published sample (invented content). Nothing leaves the page.
   An upgrade shows the entry it extends beside it where that helps. */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const STYLE = `
.pv13-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; position: relative; isolation: isolate; display: grid; gap: 14px; }
.pv13-h { margin: 0; font: 600 12px/1.2 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
.pv13-bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; min-width: 0; }
.pv13-ro { margin: 0; font: 13px/1.4 var(--f-mono); color: var(--ink-2); }
.pv13-btn { min-height: 36px; padding: 0 16px; border: 1px solid var(--rule); border-radius: 999px; background: var(--panel); color: var(--ink); font: 600 13.5px/1 var(--f-ui); cursor: pointer; }
.pv13-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.pv13-btn:focus-visible { outline: 3px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv13-scroll { height: 480px; overflow: auto; border: 1px solid var(--rule); border-radius: 12px; background: var(--bg); position: relative; min-width: 0; }
.pv13-scroll:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv13-dlg { position: relative; min-height: 640px; border: 1px dashed var(--rule); border-radius: 12px; background: var(--bg); overflow: hidden; }
.pv13-dlg .kit-rd { padding: 12px; }
.pv13-dlg-bg { padding: 18px; display: grid; gap: 6px; color: var(--ink-2); font: 14px/1.5 var(--f-ui); }
.pv13-dl { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 16px; font: 15px/1.5 var(--f-ui); }
.pv13-dl dt { font: 600 12px/1.8 var(--f-mono); color: var(--ink-2); }
.pv13-dl dd { margin: 0; }
.pv13-ev { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.pv13-ev li { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: 10px; font: 14.5px/1.5 var(--f-ui); }
.pv13-ev b { font: 600 12.5px/1.8 var(--f-mono); color: var(--ink-2); }
.pv13-form { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--rule); border-radius: 12px; background: var(--sunk); }
.pv13-form textarea { width: 100%; box-sizing: border-box; min-height: 74px; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); color: var(--ink); font: 14.5px/1.5 var(--f-ui); }
.pv13-form textarea:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv13-form label { font: 600 12px/1.3 var(--f-mono); color: var(--ink-2); }
.pv13-opts { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.pv13-opts label { display: flex; gap: 8px; align-items: center; font: 14.5px/1.4 var(--f-ui); color: var(--ink); }
.pv13-twin { display: grid; gap: 18px; min-width: 0; }
.pv13-skin { padding: 16px; border-radius: 12px; border: 1px solid var(--rule); background: var(--bg); color: var(--ink); font-family: var(--f-ui); display: grid; gap: 14px; min-width: 0; }
.pv13-skin h3 { margin: 0; font: 600 1.5rem/1.2 var(--f-display); }
.pv13-skin p { margin: 0; color: var(--ink-2); font: 15px/1.5 var(--f-ui); max-width: 60ch; }
.pv13-rows { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.pv13-rows li { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 10px; background: var(--panel); font: 14.5px/1.4 var(--f-ui); }
.pv13-rows b { flex: 1 1 8rem; } .pv13-rows span { color: var(--ink-2); font: 13px var(--f-mono); }
.pv13-log { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; font: 12.5px/1.5 var(--f-mono); color: var(--ink-2); }
.pv13-eb { position: relative; min-width: 0; }
.pv13-eb .pv13-scroll { height: 560px; }
.pv13-eb .kit-eb { padding-inline: 18px; }
`;
if (!document.querySelector('style[data-pv="b13"]')) { const st = document.createElement('style'); st.dataset.pv = 'b13'; st.textContent = STYLE; document.head.append(st); }
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps);
  return ref;
}
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const frameStyle = (theme, dark) => theme ? Object.entries(Object.assign({}, theme.light, dark ? theme.dark : {})).map(([k, v]) => k + ':' + v).join(';') + ';color-scheme:' + (dark ? 'dark' : 'light') : '';
const fragment = (text, sel) => { const d = new DOMParser().parseFromString(String(text || ''), 'text/html'); const n = d.querySelector(sel); return n ? n.outerHTML : ''; };

// ---------------------------------------------------------------- pattern.steps-owners
P['pattern.steps-owners'] = ({ samples }) => {
  const d = first(samples, 'steps-owners'); const h = useRef(null); const [cur, setCur] = useState(d.current);
  const ref = useMount(el => { h.current = K().stepsOwners.render(el, d); return h.current; }, []);
  useEffect(() => { if (h.current) h.current.setCurrent(cur); }, [cur]);
  return html`<div class="pv13-frame">
    <div class="pv13-bar"><span class="pv13-h">Current step</span><${Seg} label="Current step" value=${cur} set=${setCur} items=${d.steps.map(s => [s.id, s.id])}/></div>
    <div ref=${ref}></div>
    <p class="pv13-ro">Each owner keeps one tone and one shape on every card. Steps before the current one say Passed. The rail scrolls sideways inside its box and stacks under 640px.</p>
  </div>`;
};

// ---------------------------------------------------------------- kit.record-dialog
function openRecord(host, d, opener) {
  const tabs = d.tabs.map(t => ({ id: t.id, label: t.label, count: t.count, render(p) {
    if (t.id === 'overview') { const dl = mk('dl', 'pv13-dl'); t.facts.forEach(([k, v]) => { dl.append(mk('dt', null, k), mk('dd', null, v)); }); p.append(dl, mk('p', null, t.text)); }
    else if (t.id === 'history') { const ul = mk('ul', 'pv13-ev'); t.events.forEach(([w, x]) => { const li = mk('li'); li.append(mk('b', null, w), mk('span', null, x)); ul.append(li); }); p.append(ul); }
    else {
      const cols = mk('div', 'kit-rd-cols'); const left = mk('div'); left.append(mk('h3', null, t.question), mk('p', null, t.why));
      const side = mk('form', 'pv13-form kit-rd-side'); side.addEventListener('submit', e => e.preventDefault());
      const ul = mk('ul', 'pv13-opts'); t.options.forEach((o, i) => { const li = mk('li'); const lab = mk('label'); const r = mk('input'); r.type = 'radio'; r.name = 'pv13-opt'; r.id = 'pv13-o' + i; lab.htmlFor = r.id; lab.append(r, document.createTextNode(o)); li.append(lab); ul.append(li); });
      const ta = mk('textarea'); ta.id = 'pv13-note'; const lb = mk('label', null, 'A note for the volunteer'); lb.htmlFor = ta.id;
      const go = mk('button', 'pv13-btn primary', 'Send answer'); go.type = 'submit';
      side.append(ul, lb, ta, go); cols.append(left, side); p.append(cols);
    }
  } }));
  return K().recordDialog.open({ title: d.title, id: d.id, crumbs: d.crumbs, tags: d.tags, tabs, host, opener, label: 'Repair cafe booking', selected: 'overview' });
}
P['kit.record-dialog'] = ({ samples }) => {
  const d = first(samples, 'record-dialog'); const host = useRef(null); const dlg = useRef(null); const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!host.current || !open) return; const h = openRecord(host.current, d, null); dlg.current = h;
    const poll = setInterval(() => { if (!h.isOpen()) { clearInterval(poll); setOpen(false); } }, 250);
    return () => { clearInterval(poll); if (h.isOpen()) h.close(); };
  }, [open]);
  return html`<div class="pv13-frame">
    <div class="pv13-bar"><button type="button" class="pv13-btn primary" onClick=${() => setOpen(true)} disabled=${open}>Open the record</button><span class="pv13-ro">Escape or the close button shuts it. From 900px the Answer tab has two columns.</span></div>
    <div class="pv13-dlg" ref=${host}><div class="pv13-dlg-bg">${open ? '' : 'The dialog is closed. Open the record to see it again.'}</div></div>
  </div>`;
};

// ---------------------------------------------------------------- kit.callout-refusal
P['kit.callout-refusal'] = ({ samples }) => {
  const d = first(samples, 'callout-refusal');
  const ref = useMount(el => {
    el.replaceChildren(); const plain = mk('aside', 'kit-callout'); plain.dataset.tone = 'note'; plain.append(mk('p', 'kit-callout-k', 'Note'), mk('p', null, 'A plain callout, for comparison: a kicker and a line.'));
    el.append(plain); d.refusals.forEach(r => el.append(K().refusal.make(r)));
    return { destroy() { el.replaceChildren(); } };
  }, []);
  return html`<div class="pv13-frame"><div ref=${ref} style="display:grid;gap:12px"></div><p class="pv13-ro">The kicker says Refused and names the code. The list says what is allowed now, so the reader knows the next move.</p></div>`;
};

// ---------------------------------------------------------------- pattern.decisions-ack
P['pattern.decisions-ack'] = ({ samples }) => {
  const d = first(samples, 'decisions-ack'); const [look, setLook] = useState('stamp'); const h = useRef(null);
  const ref = useMount(el => { h.current = K().decisionsAck.render(el, { cards: d.cards, look }); return h.current; }, []);
  useEffect(() => { if (h.current) h.current.setLook(look); }, [look]);
  const box2 = useMount(el => {
    el.replaceChildren(); const card = d.cards[0]; const rec = { [card.id]: { question: card.question, answer: 'cone6', label: card.answer, answeredBy: card.answeredBy, answeredAt: card.answeredAt } };
    K().decisions.mount(el, { decisions: [{ id: card.id, order: 1, question: card.question, why: card.why, options: [{ key: 'cone6', label: card.answer }] }], records: rec, canWrite: false });
    const a = K().decisionsAck.attach(el, { [card.id]: card.ack }, { look: 'line' });
    return { destroy() { a.detach(); el.replaceChildren(); } };
  }, []);
  return html`<div class="pv13-frame">
    <div class="pv13-bar"><span class="pv13-h">Look</span><${Seg} label="Acknowledgement look" value=${look} set=${setLook} items=${[['stamp', 'Rubber stamp'], ['line', 'Terminal line'], ['note', 'Sticky note']]}/></div>
    <div ref=${ref}></div>
    <p class="pv13-h">On a card Kit.decisions drew</p>
    <div ref=${box2}></div>
  </div>`;
};

// ---------------------------------------------------------------- pattern.disclosure-reader
P['pattern.disclosure-reader'] = ({ samples }) => {
  const d = first(samples, 'disclosure-reader'); const sc = useRef(null); const [state, setState] = useState('');
  const ref = useMount(el => {
    K().disclosure.render(el, { items: d.items, variant: 'card', bar: true, printOpen: false });
    const h = K().disclosureReader.mount(el, { tiles: d.tiles, scroller: sc.current, onFilter: (q, n, m) => setState(q ? n + ' of ' + m + ' shown' : '') });
    return { destroy() { h.destroy(); el.replaceChildren(); } };
  }, []);
  return html`<div class="pv13-frame">
    <div class="pv13-scroll" ref=${sc} tabindex="0" aria-label="Handbook reader preview" style="padding:14px"><div ref=${ref}></div></div>
    <p class="pv13-ro">Type "kiln" or "sieve" in the filter. The index follows the section in view; scroll the frame or press a name.${state ? ' ' + state + '.' : ''}</p>
  </div>`;
};

// ---------------------------------------------------------------- viz.timeline-phased
P['viz.timeline-phased'] = ({ samples }) => {
  const d = first(samples, 'timeline-phased'); const [zone, setZone] = useState('UTC'); const [pick, setPick] = useState('');
  const ref = useMount(el => K().timelinePhased.mount(el, { phases: d.phases, timeZone: zone, label: 'The firing, by phase', onPick: e => setPick(e.id + ': ' + e.title) }), [zone]);
  const lg = useMount(el => K().timelinePhased.log(el, d.log), []);
  return html`<div class="pv13-frame">
    <div class="pv13-bar"><span class="pv13-h">Clock</span><${Seg} label="Time zone" value=${zone} set=${setZone} items=${[['UTC', 'UTC (Z)'], ['Europe/Lisbon', 'Lisbon'], ['Asia/Tokyo', 'Tokyo']]}/></div>
    <div ref=${ref}></div>
    <p class="pv13-ro">${pick ? 'You pressed ' + pick + '.' : 'F5 pings: its dot pulses and its card says Needs you.'}</p>
    <p class="pv13-h">A time-first table, drawn as a log</p>
    <div ref=${lg}></div>
  </div>`;
};

// ---------------------------------------------------------------- kit.skins
P['kit.skins'] = ({ samples }) => {
  const d = first(samples, 'skins'); const frame = useRef(null); const sel = useRef(null); const [lines, setLines] = useState([]);
  useEffect(() => {
    if (!frame.current || !sel.current) return;
    const h = K().skins.init({ skins: d.skins, skin: d.default, key: d.key, target: frame.current });
    h.render(sel.current);
    const off = h.on(x => setLines(l => [x.skin + ' / ' + x.mode + ' (' + x.resolved + ') from ' + x.source].concat(l).slice(0, 4)));
    return () => { off(); h.destroy(); };
  }, []);
  return html`<div class="pv13-frame">
    <div ref=${frame} class="pv13-skin" data-skin-demo>
      <div ref=${sel}></div>
      <h3>${d.page.title}</h3>
      <p>${d.page.lead}</p>
      <ul class="pv13-rows">${d.page.rows.map(r => html`<li key=${r.name}><b>${r.name}</b><span>${r.when}</span><span>${r.state}</span></li>`)}</ul>
    </div>
    <p class="pv13-h">Event log (kit:skin)</p>
    <ul class="pv13-log" aria-live="polite">${lines.length ? lines.map((l, i) => html`<li key=${i}>${l}</li>`) : html`<li>Pick a skin or a mode.</li>`}</ul>
    <p class="pv13-ro">The choice is kept in this browser. Open the catalog in a second tab and pick a skin there: this one follows.</p>
  </div>`;
};

// ---------------------------------------------------------------- template.expiry-board
P['template.expiry-board'] = ({ samples, theme, dark }) => {
  const text = samples['kit/templates/expiry-board.html.txt']; const data = first(samples, 'expiry-board');
  const [w, setW] = useState('full'); const host = useRef(null); const wrap = useRef(null);
  useEffect(() => {
    if (!host.current || !wrap.current) return; host.current.innerHTML = fragment(text, '#expiry-board');
    const h = K().expiryBoard.mount(host.current.querySelector('#expiry-board'), Object.assign({}, data, { hash: false, drawerHost: wrap.current }));
    const on = e => { e.preventDefault(); const s = host.current && host.current.querySelector('[data-eb="status"]'); if (s) s.textContent = e.detail.key + ' asked for ' + e.detail.item.label + '. The page decides what that does.'; };
    document.addEventListener('eb:action', on);
    return () => { document.removeEventListener('eb:action', on); h.destroy(); };
  }, [text, w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><span class="c-seg" role="group" aria-label="Frame width">${[['full', 'Full width'], ['phone', '390 px']].map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${w === k} onClick=${() => setW(k)}>${l}</button>`)}</span></div>
    <div class="pv13-eb" ref=${wrap} key=${w} style=${frameStyle(theme, dark) + ';background:var(--bg)' + (w === 'phone' ? ';max-width:390px' : '')}>
      <div class="pv13-scroll" tabindex="0" aria-label="Lifecycle board preview"><div ref=${host}></div></div>
    </div>
    <p class="pv-sim"><b>Preview</b> Thirty invented records of a made-up company. Pick a runway bubble, press Show them on a dial, or press a seal: the same records light up in the tree and the bubbles, and one drawer opens.</p>
  </div>`;
};
})();
/* /part:page.script.previews.b13 */
