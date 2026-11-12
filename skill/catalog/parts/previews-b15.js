/* part:page.script.previews.b15 */
/* Live previews of batch 15 (the file tree journey): the file browser with the record shelf and the file map around it, then each companion alone. Every preview mounts the entry's own
   published files on kit/samples/file-browser.json (an invented artifact). What a component asks the page to do is listed under "Calls to the page"; nothing leaves the preview. */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const STYLE = `
.pv15-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; display: grid; gap: 16px; }
.pv15-h { margin: 0; font: 600 14px/1.3 var(--f-ui); color: var(--ink); }
.pv15-sub { margin: 2px 0 0; font-size: 13px; line-height: 1.45; color: var(--ink-2); max-width: 70ch; }
.pv15-sec { display: grid; gap: 10px; min-width: 0; }
.pv15-calls { margin: 0; padding: 10px 12px; list-style: none; display: grid; gap: 4px; border: 1px dashed var(--rule); border-radius: 10px; background: var(--panel); min-width: 0; }
.pv15-calls li { font: 12.5px/1.45 var(--f-mono); color: var(--ink); overflow-wrap: anywhere; }
.pv15-calls li.pv15-none { font-family: var(--f-ui); color: var(--ink-2); }
.pv15-bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; min-width: 0; }
.pv15-lbl { font-size: 13px; font-weight: 600; color: var(--ink-2); }
`;
if (!document.getElementById('pv15-style')) { const st = document.createElement('style'); st.id = 'pv15-style'; st.textContent = STYLE; document.head.append(st); }
function useMount(fn, deps) {
  const ref = useRef(null), h = useRef(null);
  useEffect(() => { if (!ref.current) return; h.current = fn(ref.current); return () => { if (h.current && h.current.destroy) h.current.destroy(); h.current = null; }; }, deps);
  return [ref, h];
}
function useCalls() {
  const [calls, setCalls] = useState([]);
  const add = (name, arg) => setCalls(c => [name + '(' + JSON.stringify(arg) + ')'].concat(c).slice(0, 4));
  return [calls, add];
}
const Calls = ({ calls }) => html`<div class="pv15-sec"><p class="pv15-h" id="pv15-calls-h">Calls to the page</p>
  <ul class="pv15-calls" aria-labelledby="pv15-calls-h" aria-live="polite">${calls.length ? calls.map((c, i) => html`<li key=${c + i}>${c}</li>`) : html`<li class="pv15-none">None yet. Press Open file, Compare, a related view or a record card; the newest call shows first.</li>`}</ul></div>`;
const VIEWS = [{ id: 'compare', label: 'Version compare' }, { id: 'integrity', label: 'Integrity check' }];

// ================================================================ layout.file-browser: the journey
P['layout.file-browser'] = ({ samples }) => {
  const d = first(samples, 'file-browser'); const [calls, call] = useCalls();
  const map = useRef(null), fb = useRef(null), shelf = useRef(null);
  const [sRef] = useMount(el => (shelf.current = K().recordShelf.mount(el, { manifest: d.manifest, changes: d.changes, parts: d.parts, threads: d.threads, content: d.content, checks: d.checks, now: d.now, current: 'files',
    onOpen: k => { call('onOpen', k); if (k === 'files' && fb.current) { const t = document.querySelector('.pv15-journey .kit-fb-tree [tabindex="0"]'); if (t) t.focus(); } } })), [d]);
  const [mRef] = useMount(el => (map.current = K().fileMap.mount(el, { manifest: d.manifest, sizes: d.sizes, parts: d.parts, changes: d.changes, threads: d.threads, since: d.since, now: d.now, selected: d.selected,
    label: 'Where the bytes are', onSelect: p => { if (fb.current) fb.current.select(p); } })), [d]);
  const [fRef] = useMount(el => (fb.current = K().fileBrowser.mount(el, { manifest: d.manifest, sizes: d.sizes, parts: d.parts, changes: d.changes, manifests: d.manifests, threads: d.threads, content: d.content,
    since: d.since, now: d.now, selected: d.selected, views: VIEWS,
    onSelect: p => { if (map.current) map.current.select(p); }, onSince: v => { if (map.current) map.current.setSince(v); },
    onOpen: p => call('onOpen', p), onCompare: x => call('onCompare', x), onPart: (id, p) => call('onPart', { id, path: p }), onView: (id, x) => call('onView', Object.assign({ id }, x)) })), [d]);
  return html`<div class="pv15-frame pv15-journey">
    <div class="pv15-sec"><div><p class="pv15-h">The record</p><p class="pv15-sub">What the database says beside the files. Each card opens the view that shows it.</p></div><div ref=${sRef}></div></div>
    <div class="pv15-sec"><div ref=${mRef}></div></div>
    <div class="pv15-sec"><div><p class="pv15-h">The files</p><p class="pv15-sub">Pick a file on the map or in the tree; the two follow each other. Try the filter with <code>tides</code>, or mark changes after another version.</p></div><div ref=${fRef}></div></div>
    <${Calls} calls=${calls}/>
  </div>`;
};

// ================================================================ pattern.file-map
P['pattern.file-map'] = ({ samples }) => {
  const d = first(samples, 'file-browser'); const [picked, setPicked] = useState(d.selected);
  const vs = d.changes.filter(c => c.version).map(c => c.version); const [since, setSince] = useState(d.since);
  const [ref, h] = useMount(el => K().fileMap.mount(el, { manifest: d.manifest, sizes: d.sizes, parts: d.parts, changes: d.changes, threads: d.threads, since: d.since, now: d.now, selected: d.selected, onSelect: setPicked }), [d]);
  useEffect(() => { if (h.current) h.current.setSince(since); }, [since]);
  return html`<div class="pv15-frame">
    <div class="pv15-bar"><span class="pv15-lbl" id="pv15-fm-s">Mark changes after</span>
      <span class="c-seg" role="group" aria-labelledby="pv15-fm-s">${[['', 'The start']].concat(vs.slice(0, -1).map(v => [v, v])).map(([v, l]) => html`<button type="button" key=${l} aria-pressed=${since === v} onClick=${() => setSince(v)}>${l}</button>`)}</span></div>
    <div ref=${ref}></div>
    <p class="pv15-sub" role="status">onSelect: <code>${picked || 'nothing yet'}</code>. Arrow keys move to the nearest tile in that direction.</p>
  </div>`;
};

// ================================================================ pattern.record-shelf
P['pattern.record-shelf'] = ({ samples }) => {
  const d = first(samples, 'file-browser'); const [calls, call] = useCalls(); const [all, setAll] = useState(true);
  const [ref, h] = useMount(el => K().recordShelf.mount(el, { manifest: d.manifest, changes: d.changes, parts: d.parts, threads: d.threads, content: d.content, checks: d.checks, now: d.now, current: 'files', onOpen: k => call('onOpen', k) }), [d]);
  useEffect(() => { if (h.current) h.current.update(all ? { changes: d.changes, parts: d.parts, threads: d.threads, content: d.content, checks: d.checks } : { changes: null, parts: null, threads: null, content: null, checks: null }); }, [all]);
  return html`<div class="pv15-frame">
    <div class="pv15-bar"><span class="pv15-lbl" id="pv15-rs-r">The board read</span>
      <span class="c-seg" role="group" aria-labelledby="pv15-rs-r">${[[true, 'Every collection'], [false, 'Only the manifest']].map(([k, l]) => html`<button type="button" key=${l} aria-pressed=${all === k} onClick=${() => setAll(k)}>${l}</button>`)}</span></div>
    <div ref=${ref}></div>
    <${Calls} calls=${calls}/>
  </div>`;
};
})();
/* /part:page.script.previews.b15 */
