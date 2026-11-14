/* part:page.script.previews.b14 */
/* Live previews of batch 14 (the configuration layer and its views): the settings page, the integrity check, version compare, the playground and the namespaces view.
   Each mounts the entry's own published file on its own published sample (invented content). A width switch narrows the frame to 390 px, so the components' container queries
   show their phone layout in place. Nothing leaves the page. */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const STYLE = `
.pv14-frame { min-width: 0; color: var(--ink); font-family: var(--f-ui); display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.pv14-frame > * { min-width: 0; }
.pv14-mount { min-width: 0; }
.pv14-frame.phone .pv14-mount { max-width: 390px; }
.pv14-bar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; min-width: 0; }
.pv14-lab { display: inline-flex; align-items: center; gap: 8px; font: 600 13px/1.2 var(--f-ui); color: var(--ink-2); }
.pv14-log { margin: 0; padding: 7px 10px; border-radius: 8px; background: var(--sunk); font: 13px/1.45 var(--f-ui); color: var(--ink-2); overflow-wrap: anywhere; }
.pv14-log b { color: var(--ink); }
`;
if (!document.querySelector('style[data-pv="b14"]')) { const st = document.createElement('style'); st.dataset.pv = 'b14'; st.textContent = STYLE; document.head.append(st); }
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps || []);
  return ref;
}
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${String(k)} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Lab = ({ text, children }) => html`<span class="pv14-lab">${text}${children}</span>`;
const Width = ({ v, set }) => html`<${Seg} label="Frame width" value=${v} set=${set} items=${[['full', 'Full width'], ['phone', '390 px']]}/>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;

// ---------------------------------------------------------------- pattern.settings
// A registry in the shape of ADP.config over the sample: all/get/set/reset/on and doc, validating like the runtime does for enum and url.
function memoryConfig(sample) {
  const reg = JSON.parse(JSON.stringify(sample.all)), subs = [], doc = { changed: {} };
  Object.keys(reg).forEach(g => Object.keys(reg[g]).forEach(n => { reg[g][n].group = g; reg[g][n].name = n; if (reg[g][n].changed) doc.changed[g + '.' + n] = reg[g][n].changed; }));
  const find = k => { const [g, n] = k.split('.'); return reg[g] && reg[g][n]; };
  const fire = () => subs.slice().forEach(f => f('', '*'));
  return {
    all: () => JSON.parse(JSON.stringify(reg)), get: k => { const d = find(k); return d ? d.value : undefined; }, get doc() { return doc; },
    set(k, v) {
      const d = find(k); if (!d) return Promise.reject(new Error('Unknown setting ' + k));
      if (d.type === 'url' && v && !String(v).startsWith('https://')) return Promise.reject(new Error(k + ' needs an https:// address or empty'));
      if (d.type === 'enum' && !(d.options || []).includes(v)) return Promise.reject(new Error(k + ' needs one of ' + d.options.join(', ')));
      d.value = v; d.changed = doc.changed[k] = { by: sample.user.id, at: new Date().toISOString() }; fire(); return Promise.resolve();
    },
    reset() { Object.keys(reg).forEach(g => Object.keys(reg[g]).forEach(n => { reg[g][n].value = reg[g][n].default; reg[g][n].changed = null; })); doc.changed = {}; fire(); return Promise.resolve(); },
    on: (k, f) => { subs.push(f); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; },
  };
}
P['pattern.settings'] = ({ samples }) => {
  const d = first(samples, 'settings'); const h = useRef(null); const [editor, setEditor] = useState(true); const [w, setW] = useState('full'); const [last, setLast] = useState('');
  const ref = useMount(el => {
    const cfg = memoryConfig(d), user = { canEdit: true, id: d.user.id };
    h.current = K().settings.mount(el, { config: cfg, user, download: (name, text) => setLast('<b>' + name + '</b>, ' + text.length + ' characters, not saved anywhere'), onChange: (k, v) => setLast('<b>' + k + '</b> = ' + JSON.stringify(v).replace(/</g, '&lt;')) });
    h.current.user = user; return h.current;
  }, []);
  useEffect(() => { if (h.current) { h.current.user.canEdit = editor; h.current.update(); } }, [editor]);
  return html`<div class=${'pv14-frame' + (w === 'phone' ? ' phone' : '')}>
    <div class="pv14-bar"><${Width} v=${w} set=${setW}/><${Lab} text="Viewer is"><${Seg} label="Viewer role" value=${editor} set=${setEditor} items=${[[true, 'An editor'], [false, 'A viewer']]}/><//></div>
    <div class="pv14-mount" ref=${ref}></div>
    <p class="pv14-log" dangerouslySetInnerHTML=${{ __html: last ? 'Last change: ' + last : 'Change a row: it saves at once and offers Undo for ten seconds. Links refuse anything but an https:// address. A gold diamond marks a value that differs from its default.' }}></p>
    <${Note}>The registry is the sample's, held in memory; on a page it is ADP.config and the switches live in config/current.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.integrity
P['pattern.integrity'] = ({ samples }) => {
  const d = first(samples, 'integrity'); const [w, setW] = useState('full');
  const ref = useMount(el => K().integrity.mount(el, Object.assign({}, d, { fetchFile: p => new Promise(res => setTimeout(() => res(d.live ? d.live[p] : null), 160)) })), [d]);
  return html`<div class=${'pv14-frame' + (w === 'phone' ? ' phone' : '')}>
    <div class="pv14-bar"><${Width} v=${w} set=${setW}/></div>
    <div class="pv14-mount" ref=${ref}></div>
    <${Note}>An invented artifact. Run the check: one file was edited after the record and one is gone. Every state has a mark and a word, so colour never carries it alone. Press a hash to copy it.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.version-compare
P['viz.version-compare'] = ({ samples }) => {
  const d = first(samples, 'version-compare'); const [picked, setPicked] = useState(''); const [w, setW] = useState('full');
  const ref = useMount(el => K().versionCompare.mount(el, { changes: d.changes, manifests: d.manifests, content: d.content, from: d.from, to: d.to, label: 'Compare two versions', onPart: id => setPicked(id) }), []);
  return html`<div class=${'pv14-frame' + (w === 'phone' ? ' phone' : '')}>
    <div class="pv14-bar"><${Width} v=${w} set=${setW}/></div>
    <div class="pv14-mount" ref=${ref}></div>
    <p class="pv14-log">${picked ? html`You pressed <b>${picked}</b>; a board would open that part.` : 'Press a part id: a board would open that part.'}</p>
    <${Note}>Versions 3 and 5 have manifests, so that pair is compared from them; any other pair walks the change docs. Open Show text on a changed part for its line diff.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.playground
P['pattern.playground'] = ({ samples, entries }) => {
  const d = first(samples, 'playground');
  const [cat, setCat] = useState(null);
  // the index no longer carries an entry's preview block (its samples and what it uses): each comes from the header of the entry's main file
  useEffect(() => {
    let off = false; const F = window.CatalogFiles;
    Promise.all(entries.map(e => F.main(e) ? F.header(F.main(e)).then(h => Object.assign({}, e, { preview: h.preview || null }), () => e) : e))
      .then(list => { if (!off) setCat(list); });        // an entry whose header cannot be read stays as the index has it
    return () => { off = true; };
  }, []);
  // the part's files come through the catalog's loader (CatalogFiles); a full url, such as a theme's fonts, is linked as it is
  const links = useRef({});
  const load = (u, kind) => {
    if (/^(https?:)?\/\//.test(u)) return links.current[u] = links.current[u] || new Promise((res, rej) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.onload = () => res(); l.onerror = () => rej(new Error('could not load ' + u)); document.head.append(l); });
    return kind === 'json' ? window.CatalogFiles.json(u) : window.CatalogFiles.load(u);
  };
  const ref = useMount(el => cat ? K().playground.mount(el, { catalog: cat, base: d.base, themes: d.themes, entry: d.entry, load }) : null, [!!cat]);
  return html`<div class="pv14-frame">
    ${!cat ? html`<p class="pv14-log">Reading what each entry loads first.</p>` : null}
    <div class="pv14-mount" ref=${ref}></div>
    <${Note}>The whole catalog is the picker. Theme, mode and width change the inner stage only; the sample is yours to edit, and Apply re-renders it.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.namespaces
P['pattern.namespaces'] = ({ samples }) => {
  const d = first(samples, 'namespaces'); const [role, setRole] = useState('editor'); const [locked, setLocked] = useState(true); const [w, setW] = useState('full');
  const ref = useMount(el => K().namespaces.mount(el, Object.assign({}, d, { user: { canEdit: role === 'editor' }, locks: locked ? d.locks : [] })), [role, locked]);
  return html`<div class=${'pv14-frame' + (w === 'phone' ? ' phone' : '')}>
    <div class="pv14-bar"><${Width} v=${w} set=${setW}/>
      <${Lab} text="Viewing as"><${Seg} label="Viewing as" value=${role} set=${setRole} items=${[['editor', 'Editor'], ['viewer', 'Viewer']]}/><//>
      <${Lab} text="Locks"><${Seg} label="Locks" value=${locked ? 'on' : 'off'} set=${v => setLocked(v === 'on')} items=${[['on', 'Two locked'], ['off', 'None']]}/><//></div>
    <div class="pv14-mount" ref=${ref}></div>
    <${Note}>Read-only. The rules and locks are the sample's; on a page they come from the adp:db-rules meta tag and parts.locked.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b14 */
