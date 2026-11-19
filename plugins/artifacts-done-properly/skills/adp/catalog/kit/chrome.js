/* part:page.script.kit.chrome */
/**
 * Chrome primitives
 * The pieces every board repeats. openModal({title, body, fields, ok, danger, onOk}) renders a form dialog whose onOk may return false to stay open; fields are text, textarea, checkbox or checklist. toast(text, kind, action) shows one message, step(label, total, fn) shows a busy bar while fn reports progress. Kit.icons is the inline SVG set the canvas and boards share.
 *
 * What it is: modal dialog with a field list, toast with an optional action, busy overlay with a progress bar, armed (click twice) button,
 * auto-growing text field, outside-click/Escape hook, kind and status chips, and one inline SVG icon set (canvas tools, close, down, grip, undo, redo, chat).
 * config  Kit.chrome.create({store, kinds, parts})
 *           store  the object returned by Kit.store.create
 *           kinds  {kind: {label}}   labels for KindChip (omit for none)
 *           parts  {modal: "<part id>"}   when set, the dialog scrim renders data-part and data-comment-target
 * state   S.modal, S.toast, S.busy (slots read and written by the components)
 * Modal fields: {id, label, type: text (default) | textarea | checkbox | checklist, value, rows, list, options, disabled}; openModal({title, body, fields, ok, noCancel, danger, onOk(values)}) where onOk may return false to stay open.
 *
 * @id        kit.chrome
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.2
 * @updated   2026-10-24
 * @summary   Dialog with a field list, toast with an action, busy overlay with progress, click-twice button, auto-growing text field, outside-click hook, chips and one icon set.
 * @tags      modal, dialog, toast, busy, progress, icons, form, chrome, ui
 * @requires  kit.store
 * @files     kit/chrome.css, kit/samples/kit.json
 * @provides  Kit.icons, Kit.chrome.create
 * @config    Kit.chrome.create({store, kinds, parts}) | store from Kit.store.create; kinds {kind: {label}}; parts {modal: part id} puts data-part on the dialog scrim
 * @config    state slots | S.modal, S.toast, S.busy
 * @config    openModal(m) | {title, body, fields: [{id, label, type, value, rows, options}], ok, noCancel, danger, onOk(values)}
 * @tokens    --panel --ink --ink-2 --ink-3 --rule --rule-2 --sunk --accent --accent-ink --accent-soft --danger --ok --shadow --f-mono --f-display
 * @globals   htm-preact
 * @db        none
 * @source    Journey Whiteboard | app.js | Modal, Toast, Busy, ArmedButton, AutoText, useOutside, KindChip, StatusChip, I
 * @source    ADR Drafting Table | uishared.js, modals.js | the same shapes (focus restore and stacked toasts not taken)
 * @preview   {"render": "kit.chrome", "samples": ["kit/samples/kit.json#chrome"]}
 * @samples   chrome
 * @changed   0.1.2: .btn, .input, .select and .textarea take the page font (font-family: inherit); native buttons and fields otherwise draw in the system font.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const { html } = window.htmPreact;

// ---------------------------------------------------------------- icons
const icons = {
  select: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3l14 8-6 2-3 6z"/></svg>`,
  hand: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11V4a1.5 1.5 0 013 0v7M14 11V5.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3 14a1.5 1.5 0 012.5-1.6L8 15"/></svg>`,
  pen: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-5L16 4l4 4L9 19z M14 6l4 4"/></svg>`,
  marker: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l-3 3h-3v-1l3-3M9 15l9-9-3-3-9 9 3 3z"/><path d="M14 20h7" stroke-width="3" opacity=".5"/></svg>`,
  eraser: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20h12M5 15l9-9 5 5-8 8H8z M10 10l5 5"/></svg>`,
  rect: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>`,
  ellipse: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="8.5" ry="6.5"/></svg>`,
  diamond: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l9 9-9 9-9-9z"/></svg>`,
  line: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19L19 5"/></svg>`,
  arrow: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L19 5M10 5h9v9"/></svg>`,
  text: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>`,
  sticky: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 4h16v10l-6 6H4z M14 20v-6h6"/></svg>`,
  chat: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>`,
  close: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  down: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  grip: html`<svg viewBox="0 0 16 16" width="12" height="16" fill="currentColor"><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>`,
  undo: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>`,
  redo: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>`,
};
Kit.icons = Object.freeze(icons);

// ---------------------------------------------------------------- chrome
Kit.chrome = Object.freeze({
  create({ store, kinds = {}, parts = {} }) {
    const { useState, useEffect, useRef, useLayoutEffect } = window.htmPreact;
    const { S, set, useS } = store;
    const I = Kit.icons;
    const partAttrs = id => id ? { 'data-part': id, 'data-comment-target': '' } : {};

    let toastTimer = 0;
    function toast(text, kind, action) { clearTimeout(toastTimer); set({ toast: { text, kind, action } }); toastTimer = setTimeout(() => set({ toast: null }), action ? 9000 : 5200); }
    function openModal(m) { set({ modal: m }); }
    async function step(label, total, fn) {
      set({ busy: { label, done: 0, total } });
      try { await fn(n => set({ busy: { label, done: n, total } })); }
      finally { set({ busy: null }); }
    }

    function KindChip({ kind, code }) { return html`<span class="chip k k-${kind}">${code ? code + ' · ' : ''}${(kinds[kind] || {}).label || kind}</span>`; }
    function StatusChip({ s }) { return html`<span class="chip st-${s}">${s}</span>`; }
    function ArmedButton({ label, armedLabel, onConfirm, cls, disabled }) {
      const [armed, setArmed] = useState(false);
      useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
      return html`<button type="button" class="btn sm danger ${armed ? 'armed' : ''} ${cls || ''}" disabled=${disabled} onClick=${() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>${armed ? (armedLabel || 'Click again to confirm') : label}</button>`;
    }
    function AutoText({ value, onCommit, cls, placeholder, rows, disabled, mono }) {
      const [v, setV] = useState(value || '');
      const focused = useRef(false);
      const ref = useRef(null);
      useEffect(() => { if (!focused.current) setV(value || ''); }, [value]);
      useLayoutEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; } }, [v]);
      return html`<textarea ref=${ref} class=${cls || 'textarea'} rows=${rows || 2} placeholder=${placeholder || ''} disabled=${disabled} style=${mono ? 'font-family:var(--f-mono)' : ''}
        value=${v} onFocus=${() => { focused.current = true; }} onInput=${e => setV(e.target.value)}
        onBlur=${() => { focused.current = false; if (v !== (value || '')) onCommit(v); }}
        onKeyDown=${e => { if (e.key === 'Enter' && (cls || '').includes('title-input')) { e.preventDefault(); e.target.blur(); } }}></textarea>`;
    }
    function useOutside(ref, onOut, on) {
      useEffect(() => {
        if (!on) return;
        const f = e => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
        const k = e => { if (e.key === 'Escape') onOut(); };
        document.addEventListener('pointerdown', f, true); document.addEventListener('keydown', k);
        return () => { document.removeEventListener('pointerdown', f, true); document.removeEventListener('keydown', k); };
      }, [on]);
    }
    function Modal() {
      const s = useS();
      const m = s.modal;
      const [vals, setVals] = useState({});
      const [working, setWorking] = useState(false);
      useEffect(() => { if (m) { setVals(Object.fromEntries((m.fields || []).map(f => [f.id, f.value ?? (f.type === 'checkbox' ? false : f.type === 'checklist' ? [] : '')]))); setWorking(false); } }, [m]);
      if (!m) return null;
      const close = () => set({ modal: null });
      const ok = async e => {
        e.preventDefault(); if (working) return;
        setWorking(true);
        try { const r = await m.onOk(vals); if (r === false) { setWorking(false); return; } close(); }
        catch (err) { setWorking(false); toast('That did not work: ' + ((err && err.message) || 'unknown error') + '.', 'warn'); }
      };
      const setV = (id, x) => setVals(o => ({ ...o, [id]: x }));
      return html`<div class="scrim" ...${partAttrs(parts.modal)} onPointerDown=${e => { if (e.target === e.currentTarget && !working) close(); }} onKeyDown=${e => { if (e.key === 'Escape' && !working) close(); }}>
        <form class="dialog" role="dialog" aria-modal="true" aria-label=${m.title} onSubmit=${ok}>
          <h2>${m.title}</h2>
          ${m.body && html`<p class="muted" style="margin:0">${m.body}</p>`}
          ${(m.fields || []).length ? html`<div class="fields">${m.fields.map((f, i) => {
            if (f.type === 'checkbox') return html`<label class="row" key=${f.id}><input type="checkbox" id=${'f-' + f.id} checked=${!!vals[f.id]} disabled=${f.disabled} onChange=${e => setV(f.id, e.target.checked)}/><span>${f.label}</span></label>`;
            if (f.type === 'checklist') return html`<div class="f" key=${f.id} style="display:grid;gap:5px"><span class="label">${f.label}</span><div class="checks">${f.options.length ? f.options.map(o => html`<label><input type="checkbox" checked=${(vals[f.id] || []).includes(o.value)} onChange=${e => setV(f.id, e.target.checked ? [...(vals[f.id] || []), o.value] : (vals[f.id] || []).filter(x => x !== o.value))}/><span>${o.label}</span></label>`) : html`<span class="faint">Nothing to pick yet.</span>`}</div></div>`;
            if (f.type === 'textarea') return html`<label class="f" key=${f.id}>${f.label && html`<span class="label">${f.label}</span>`}<textarea class="textarea" id=${'f-' + f.id} rows=${f.rows || 3} autoFocus=${i === 0} value=${vals[f.id] || ''} onInput=${e => setV(f.id, e.target.value)}></textarea></label>`;
            return html`<label class="f" key=${f.id}><span class="label">${f.label}</span><input class="input" id=${'f-' + f.id} list=${f.list ? 'dl-' + f.id : null} autoFocus=${i === 0} value=${vals[f.id] || ''} onInput=${e => setV(f.id, e.target.value)}/>${f.list && html`<datalist id=${'dl-' + f.id}>${f.list.map(x => html`<option value=${x}/>`)}</datalist>`}</label>`;
          })}</div>` : ''}
          <div class="row"><span class="spacer"></span>${!m.noCancel && html`<button class="btn" type="button" disabled=${working} onClick=${close}>Cancel</button>`}<button class="btn ${m.danger ? 'danger armed' : 'primary'}" type="submit" disabled=${working}>${working ? html`<span class="spin"></span>` : ''}${m.ok || 'OK'}</button></div>
        </form>
      </div>`;
    }
    function Toast() { const s = useS(); if (!s.toast) return null; const a = s.toast.action; return html`<div class=${'toast ' + (s.toast.kind || '')} role="status">${s.toast.text}${a ? html`<button class="btn sm" type="button" onClick=${() => { set({ toast: null }); a.fn(); }}>${a.label}</button>` : ''}<button class="btn ghost sm" style="color:inherit" type="button" aria-label="Dismiss" onClick=${() => set({ toast: null })}>${I.close}</button></div>`; }
    function Busy() { const s = useS(); if (!s.busy) return null; const b = s.busy; return html`<div class="busy" role="alertdialog" aria-label=${b.label}><div><b>${b.label}…</b><div class="bar"><i style=${`width:${b.total ? Math.round(b.done / b.total * 100) : 100}%`}></i></div><span class="faint mono">${b.done} / ${b.total}</span></div></div>`; }
    return { toast, openModal, step, KindChip, StatusChip, ArmedButton, AutoText, useOutside, Modal, Toast, Busy };
  },
});
})();
/* /part:page.script.kit.chrome */
