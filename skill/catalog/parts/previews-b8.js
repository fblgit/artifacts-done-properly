/* part:page.script.previews.b8 */
/* Live previews of batch 8 (the nine skin themes): one renderer, registered for each theme entry.
   It shows what a bare palette cannot: the sheet (texture on the ground only), corners, rules, type roles, label style, density, the five meanings on their tints, and every text pair's contrast, computed live from the theme's own json.
   The generic swatch and type sections come from the catalog's own theme renderer (P.theme). Nothing is stored; nothing leaves the page. */
(function () {
'use strict';
const { html, useEffect } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
function useFonts(theme) {
  useEffect(() => {
    const u = theme && theme.fonts; if (!u || document.querySelector('link[data-pv-fonts="' + u + '"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.dataset.pvFonts = u; document.head.append(l);
  }, [theme && theme.fonts]);
}
const STYLE = `
.pv8-ground { padding: 18px; border-radius: var(--radius-lg, 8px); border: var(--edge-w, 1px) solid var(--outline, var(--rule)); background-color: var(--bg); background-image: var(--bg-image, none); background-size: var(--bg-size, auto); min-width: 0; }
.pv8-sheet { display: grid; gap: 14px; padding: calc(var(--pad, 12px) + 8px); background: var(--panel); color: var(--ink); border: var(--edge-w, 1px) solid var(--outline, var(--rule)); border-radius: var(--radius-lg, 8px); box-shadow: var(--shadow); font: var(--text-size, 15px)/var(--leading, 1.5) var(--f-ui); min-width: 0; }
.pv8-sheet h3 { margin: 0; font: 700 clamp(22px, 3.4vw, 30px)/1.12 var(--f-display); text-transform: var(--head-case, none); text-wrap: balance; }
.pv8-lede { margin: 0; max-width: var(--measure, 65ch); color: var(--ink-2); }
.pv8-label { font: 600 11px/1.3 var(--f-mono); letter-spacing: .1em; text-transform: var(--label-case, none); font-variant-caps: var(--label-caps, normal); color: var(--ink-2); }
html .pv8-sheet .pv8-label.sc { font-family: var(--f-ui); font-size: 14px; letter-spacing: .06em; }
.pv8-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pv8-btn { font: 600 var(--text-size, 14px)/1 var(--f-ui); padding: var(--pad, 10px) calc(var(--pad, 10px) + 6px); border-radius: var(--radius, 6px); border: var(--edge-w, 1px) solid var(--outline, var(--rule)); background: var(--panel); color: var(--ink); cursor: pointer; text-transform: var(--head-case, none); }
.pv8-btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.pv8-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pv8-st { font: 600 12px/1 var(--f-mono); letter-spacing: .04em; padding: 5px 9px; border-radius: var(--radius, 6px); text-transform: var(--label-case, none); font-variant-caps: var(--label-caps, normal); }
.pv8-st i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: currentColor; margin-right: 6px; }
.pv8-tbl { overflow-x: auto; border: 1px solid var(--rule-2); border-radius: var(--radius, 6px); }
.pv8-tbl table { border-collapse: collapse; width: 100%; font-size: calc(var(--text-size, 15px) - 1px); }
.pv8-tbl th, .pv8-tbl td { padding: calc(var(--pad, 12px) - 3px) var(--pad, 12px); text-align: left; border-bottom: 1px solid var(--rule-2); white-space: nowrap; }
.pv8-tbl th { background: var(--sunk); font: 600 11px/1.3 var(--f-mono); letter-spacing: .08em; text-transform: var(--label-case, none); font-variant-caps: var(--label-caps, normal); color: var(--ink-2); border-bottom: var(--edge-w, 1px) solid var(--outline, var(--rule)); }
.pv8-tbl tr:last-child td { border-bottom: 0; }
.pv8-tbl td.num { font-family: var(--f-mono); font-variant-numeric: tabular-nums; text-align: right; }
.pv8-note { padding: 10px 12px; border-left: calc(var(--edge-w, 1px) + 2px) solid var(--seam); background: var(--sunk); border-radius: 0 var(--radius, 6px) var(--radius, 6px) 0; color: var(--ink); }
.pv8-note b { color: var(--ink); font-family: var(--f-display); }
.pv8-hand { font: 500 20px/1.2 var(--f-hand); color: var(--ink-2); margin: 0; }
.pv8-tex { height: 54px; border-radius: var(--radius, 6px); border: 1px solid var(--rule-2); background-color: var(--bg); background-image: var(--bg-image, none); background-size: var(--bg-size, auto); display: grid; place-items: center; font: 12px var(--f-mono); color: var(--ink-2); }
.pv8-tex span { background: var(--panel); padding: 3px 8px; border-radius: var(--radius, 6px); }
.pv8-ratios { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: 6px 14px; }
.pv8-ratios li { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; color: var(--ink-2); flex-wrap: wrap; }
.pv8-ratios code { font: 12px var(--f-mono); color: var(--ink); }
.pv8-fit { font: 600 12px var(--f-mono); padding: 1px 6px; border-radius: 4px; background: var(--ok-soft); color: var(--ok); }
.pv8-fit.miss { background: var(--danger-soft); color: var(--danger); }
.pv8-vs { margin: 0; font-size: 13px; color: var(--ink-2); max-width: 70ch; }
.pv8-vs b { color: var(--ink); }
.pv8-stack { display: grid; gap: 22px; min-width: 0; }
.pv8-h { margin: 0 0 8px; font: 600 12px var(--f-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
@media (prefers-reduced-motion: no-preference) { .pv8-btn { transition: background-color .15s, border-color .15s; } }
`;
if (!document.querySelector('style[data-pv="b8"]')) { const st = document.createElement('style'); st.dataset.pv = 'b8'; st.textContent = STYLE; document.head.append(st); }

const hexOk = h => /^#[0-9a-f]{6}$/i.test(h || '');
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function lum(rgb) { const c = rgb.map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const ratio = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const MEANS = [['ok', 'Done'], ['info', 'In review'], ['warn', 'Waiting'], ['danger', 'Blocked'], ['wait', 'Question']];

// how this theme differs from the one it is easiest to confuse with
const VS = {
  'theme.kanban': ['Long page', 'Kanban is the dense, tool-like one: 14px on 1.45, 5 and 8px corners, a syntax-purple second colour, a dark terminal ground. Long page is for reading.'],
  'theme.longpage': ['Kanban', 'Long page is the reading one: 15px on 1.6 in a 68ch measure, 10 and 14px corners, a stamp-red second colour, states as soft tints. Kanban is for working cards.'],
};

function Contrast({ m }) {
  const pairs = [['--ink', '--panel'], ['--ink-2', '--panel'], ['--ink-3', '--sunk'], ['--ink-3', '--bg'], ['--accent', '--panel'], ['--accent-ink', '--accent'], ['--ink', '--accent-soft'], ['--seam', '--panel', 3]]
    .concat(MEANS.map(([k]) => ['--' + k, '--' + k + '-soft']), MEANS.map(([k]) => ['--' + k, '--panel']));
  const ok = pairs.filter(([a, b]) => hexOk(m[a]) && hexOk(m[b]));
  return html`<ul class="pv8-ratios">${ok.map(([a, b, need]) => { const r = ratio(m[a], m[b]); const n = need || 4.5;
    return html`<li key=${a + b}><span class=${'pv8-fit' + (r >= n ? '' : ' miss')}>${r.toFixed(1)}:1</span><code>${a}</code> on <code>${b}</code></li>`; })}</ul>`;
}

function ThemeB8(props) {
  const { e, theme: t, dark } = props;
  useFonts(t);
  if (!t) return html`<div class="stage-load">The theme’s data file did not load.</div>`;
  const m = Object.assign({}, t.light, dark ? t.dark : {});
  const vs = VS[e.id];
  const sc = (m['--label-caps'] || 'normal') !== 'normal';
  return html`<div class="pv8-stack">
    <section>
      <h4 class="pv8-h">The sheet</h4>
      <div class="pv8-ground">
        <div class="pv8-sheet">
          <span class=${'pv8-label' + (sc ? ' sc' : '')}>Review 14 · open items</span>
          <h3>Decisions waiting on you</h3>
          <p class="pv8-lede">Three items need a verdict before the release branch is cut. The rest is recorded and needs nothing from you.</p>
          <div class="pv8-row">${MEANS.map(([k, w]) => html`<span key=${k} class="pv8-st" style=${'background:var(--' + k + '-soft);color:var(--' + k + ')'}><i></i>${w}</span>`)}</div>
          <div class="pv8-row"><button type="button" class="pv8-btn primary">Approve</button><button type="button" class="pv8-btn">Send back</button><button type="button" class="pv8-btn">Open the log</button></div>
          <aside class="pv8-note"><b>Note</b> The seam is this theme’s second voice: a mark, the current item, the one rule that matters.</aside>
          <div class="pv8-tbl" tabindex="0" role="region" aria-label="Sample table"><table><thead><tr><th scope="col">Item</th><th scope="col">Owner</th><th scope="col" class="num">Days</th></tr></thead>
            <tbody><tr><td>Rollout plan</td><td>Ines</td><td class="num">4</td></tr><tr><td>Cost model</td><td>Marek</td><td class="num">11</td></tr><tr><td>Vendor review</td><td>Dana</td><td class="num">2</td></tr></tbody></table></div>
          <p class="pv8-hand">A margin note in the theme’s note face.</p>
        </div>
      </div>
      <p class="pv8-vs" style="margin-top:8px">Corners <b>${m['--radius']} / ${m['--radius-lg']}</b>, edge <b>${m['--edge-w']}</b>, text <b>${m['--text-size']}</b> on <b>${m['--leading']}</b>, measure <b>${m['--measure']}</b>, padding <b>${m['--pad']}</b>.</p>
      ${vs ? html`<p class="pv8-vs"><b>Next to ${vs[0]}.</b> ${vs[1]}</p>` : ''}
    </section>
    <section>
      <h4 class="pv8-h">Texture and optional tokens</h4>
      <div class="pv8-tex"><span>${m['--bg-image'] && m['--bg-image'] !== 'none' ? '--bg-image on the ground' : 'no texture: the ground is flat'}</span></div>
      <p class="pv8-vs" style="margin-top:8px">${['--glow', '--scan', '--stripe', '--glow-a', '--glow-b', '--code-bg', '--radius-wobble'].filter(k => m[k]).map(k => k + ' = ' + m[k].slice(0, 40)).join(' · ') || 'This theme has no optional tokens beyond the shared set.'}</p>
    </section>
    <section><h4 class="pv8-h">Text contrast, ${dark ? 'night' : 'day'}</h4><${Contrast} m=${m}/><p class="pv8-vs" style="margin-top:6px">4.5:1 is the bar for text; --seam is a mark, so 3:1.</p></section>
    ${P.theme ? html`<${P.theme} ...${props}/>` : ''}
  </div>`;
}
['blueprint', 'console', 'journal', 'kanban', 'longpage', 'manuscript', 'notebook', 'warroom', 'classic'].forEach(n => { P['theme.' + n] = ThemeB8; });
})();
/* /part:page.script.previews.b8 */
