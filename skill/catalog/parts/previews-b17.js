/* part:page.script.previews.b17 */
/* Live preview of batch 17 (the mind map). It mounts the entry's own published file on its own published sample (invented content). The page here plays the host: it keeps the data in memory, and
   every change the map reports is only counted and shown; nothing is saved anywhere. */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const STYLE = `
.pv17-frame { min-width: 0; color: var(--ink); font-family: var(--f-ui); display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.pv17-frame > * { min-width: 0; }
.pv17-frame.phone .pv17-mount { max-width: 390px; }
.pv17-bar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; min-width: 0; }
.pv17-log { margin: 0; padding: 7px 10px; border-radius: 8px; background: var(--sunk); font: 13px/1.45 var(--f-ui); color: var(--ink-2); overflow-wrap: anywhere; }
.pv17-log b { color: var(--ink); }
`;
if (!document.querySelector('style[data-pv="b17"]')) { const st = document.createElement('style'); st.dataset.pv = 'b17'; st.textContent = STYLE; document.head.append(st); }
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps || []);
  return ref;
}
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${String(k)} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;

// ---------------------------------------------------------------- pattern.mindmap
P['pattern.mindmap'] = ({ samples }) => {
  const d = first(samples, 'mindmap'); const [w, setW] = useState('full'); const [ro, setRo] = useState(false); const [last, setLast] = useState(''); const api = useRef(null); const host = useRef(d.data);
  const ref = useMount(el => {
    api.current = K().mindmap.mount(el, { data: host.current, readOnly: ro, label: d.label, onChange: next => { host.current = next; setLast(next.nodes.length + ' nodes, the root is ' + next.nodes[0].text); } });
    return api.current;
  }, [w, ro]);
  return html`<div class=${'pv17-frame' + (w === 'phone' ? ' phone' : '')}>
    <div class="pv17-bar">
      <${Seg} label="Frame width" value=${w} set=${setW} items=${[['full', 'Full width'], ['phone', '390 px']]}/>
      <${Seg} label="Mode" value=${ro} set=${setRo} items=${[[false, 'Editable'], [true, 'Read only']]}/>
      <span class="c-seg"><button type="button" onClick=${() => { host.current = d.data; setLast(''); if (api.current) api.current.update(d.data); }}>Back to the sample</button></span>
    </div>
    <div class="pv17-mount" ref=${ref}></div>
    <p class="pv17-log" role="status">${last ? html`<b>onChange</b> ${last}` : 'Select a node and press Tab for a child or Enter for a sibling; drag a node onto another, or onto the line between two; or press M for the Move to menu. Every change the map reports shows here.'}</p>
    <${Note}>Fifteen invented nodes. The map keeps no data of its own: it reports the whole next data after each change and the page decides what to do with it.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b17 */
