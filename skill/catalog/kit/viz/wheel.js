/* part:page.script.kit.viz.wheel */
/**
 * Key wheel and mood plot
 * Kit.viz.KeyWheel draws the 24 Camelot keys on two rings; it can light one key and its three neighbours or tint each key by a count, and with onPick the keys are buttons moved with the arrow keys. Kit.viz.KeyChip is the label with the key's hue as a dot. Kit.viz.MoodPlot is a square plot of two 0 to 100 measures with quadrant guides, one dot per item and the active one ringed and named. Colour is derived from the key number and mixed into --panel at 12 to 38 per cent, so labels stay --ink in both themes; the active key adds a --seam ring so state is never colour alone.
 *
 * Config:
 * KeyWheel({size, active, counts, max, center, onPick, label, lightness, chroma})
 *   size       px (default 220); keys are named inside the ring from 140 px up, otherwise only the lit ones are
 *   active     "8A": lit with its neighbours (ignored when counts is set)
 *   counts     {"8A": 3, …}: tints each key by count / max (max defaults to the largest count) and prints the count
 *   center     text in the middle (e.g. the active key)
 *   onPick     (code) when set, keys are buttons: Tab to the wheel, arrows move (left and right around a ring, up and down between rings), Enter or Space picks
 * KeyChip({code, name, label})   code "8A", name "A minor"
 * MoodPlot({size, points: [{id, label, x, y}], active, xLabel, yLabel, onPick, label})   x and y are 0 to 100
 * Kit.viz.wheelUtil: {hue(code), neighbours(code), codes, fill(code, pct, opts)}
 *
 * @id        viz.wheel
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   The Camelot key wheel with neighbours or per-key counts, a key chip with its hue, and a 0 to 100 valence and arousal plot.
 * @tags      wheel, camelot, key, music, mood, valence, arousal, scatter, chip, harmonic mixing
 * @requires  viz.core
 * @files     kit/samples/viz.json
 * @provides  Kit.viz.KeyWheel, Kit.viz.KeyChip, Kit.viz.MoodPlot, Kit.viz.wheelUtil
 * @config    KeyWheel({size, active, counts, max, center, onPick, label, lightness, chroma}) | active "8A" lights it and its neighbours; counts {"8A": 3} tints by count
 * @config    KeyChip({code, name, label}) | code "8A", name "A minor"
 * @config    MoodPlot({size, points, active, xLabel, yLabel, onPick, label}) | points [{id, label, x, y}], x and y 0 to 100
 * @tokens    --panel --ink --ink-2 --rule --rule-2 --accent --f-ui --seam?
 * @globals   htm-preact
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | YouTuner Uplift, parts/base.js | the Camelot wheel (active and count modes), the Camelot chip with hue and lightness, and the valence/arousal plot
 * @preview   {"render": "viz.wheel", "samples": ["kit/samples/viz.json#wheel"]}
 * @samples   wheel
 * @changed   Fills are mixes of the key's hue into --panel, not fixed fills with a fixed ink, so labels pass 4.5:1 on porcelain and on tenmoku.
 */
(function () {
'use strict';
const Kit = window.Kit;
const { html, } = window.htmPreact;
const { useRef } = window.htmPreact;
const { cx } = Kit.viz.util;

const num = c => parseInt(c, 10);
const hue = c => { const n = num(c); return isNaN(n) ? 0 : ((n - 1) * 30 + 25) % 360; };
const wrap = x => ((x + 11) % 12) + 1;
const neighbours = c => { const n = num(c), l = String(c).slice(-1); return [wrap(n - 1) + l, wrap(n + 1) + l, n + (l === 'A' ? 'B' : 'A')]; };
const codes = (() => { const out = []; for (const l of ['B', 'A']) for (let n = 1; n <= 12; n++) out.push(n + l); return out; })();
const fill = (code, pct, o) => {
  const l = (o && o.lightness) || .72, c = (o && o.chroma) || .12;
  return 'color-mix(in srgb, oklch(' + (/B$/.test(code) ? l + .05 : l) + ' ' + c + ' ' + hue(code) + ') ' + pct + '%, var(--panel))';
};
const P = (cx0, cy0, r, a) => [cx0 + r * Math.sin(a * Math.PI / 180), cy0 - r * Math.cos(a * Math.PI / 180)];
function arc(c, r0, r1, a0, a1) {
  const [x1, y1] = P(c, c, r1, a0), [x2, y2] = P(c, c, r1, a1), [x3, y3] = P(c, c, r0, a1), [x4, y4] = P(c, c, r0, a0);
  const f = v => v.toFixed(2);
  return 'M' + f(x1) + ' ' + f(y1) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + f(x2) + ' ' + f(y2) + 'L' + f(x3) + ' ' + f(y3) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + f(x4) + ' ' + f(y4) + 'Z';
}

function KeyWheel({ size = 220, active, counts, max, center, onPick, label, lightness, chroma }) {
  const c = size / 2, rO = c - 2, rM = rO * .68, rI = rO * .38;
  const nb = !counts && active ? neighbours(active) : [];
  const top = counts ? (max || Math.max(1, ...Object.values(counts))) : 1;
  const ref = useRef(null);
  const o = { lightness, chroma };
  const fs = size >= 140 ? 9.5 : 8.5;
  const move = (e, code) => {
    const n = num(code), l = code.slice(-1); let to = null;
    if (e.key === 'ArrowRight') to = wrap(n + 1) + l; else if (e.key === 'ArrowLeft') to = wrap(n - 1) + l;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') to = n + (l === 'A' ? 'B' : 'A');
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(code); return; }
    if (to && ref.current) { e.preventDefault(); const t = ref.current.querySelector('[data-code="' + to + '"]'); if (t) t.focus(); }
  };
  const tabStop = active || '1A';
  const sum = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const aria = (label || 'Key wheel') + (counts ? ', ' + sum + ' in all' : active ? ', ' + active + ' lit with its neighbours ' + neighbours(active).join(', ') : '');
  return html`<svg ref=${ref} viewBox=${'0 0 ' + size + ' ' + size} width=${size} height=${size} style="max-width:100%;height:auto;display:block;font-family:var(--f-ui)"
      role=${onPick ? 'group' : 'img'} aria-label=${aria}>
    ${codes.map(code => {
      const L = code.slice(-1), n = num(code), a = (n % 12) * 30;
      const r0 = L === 'B' ? rM : rI, r1 = L === 'B' ? rO : rM;
      const v = counts ? (counts[code] || 0) : 0;
      const pct = counts ? (v ? 10 + 28 * v / top : 6) : code === active ? 38 : nb.includes(code) ? 28 : 12;
      const lit = !counts && (code === active || nb.includes(code));
      const rr = (r0 + r1) / 2, [tx, ty] = P(c, c, rr, a);
      const showName = counts ? !!v : (lit || size >= 140);
      const name = counts ? (v ? String(v) : '') : (showName ? code : '');
      const props = onPick ? { tabIndex: code === tabStop ? 0 : -1, role: 'button', 'data-code': code, 'aria-label': code + (counts ? ', ' + v : ''), 'aria-pressed': code === active ? 'true' : 'false',
        onClick: () => onPick(code), onKeyDown: e => move(e, code), style: 'cursor:pointer;fill:' + fill(code, pct, o) } : { style: 'fill:' + fill(code, pct, o) };
      return html`<g key=${code}>
        <path d=${arc(c, r0 + .6, r1 - .6, a - 14.4, a + 14.4)} ...${props}
          stroke=${code === active && !counts ? 'var(--seam, var(--accent))' : 'var(--panel)'} stroke-width=${code === active && !counts ? 2.5 : 0.6}><title>${code}${counts ? ': ' + v : ''}</title></path>
        ${name ? html`<text x=${tx.toFixed(1)} y=${(ty + 3.5).toFixed(1)} text-anchor="middle" font-size=${fs} font-weight=${code === active ? 700 : 500}
          fill=${lit || counts ? 'var(--ink)' : 'var(--ink-2)'} style="pointer-events:none">${name}</text>` : ''}
      </g>`;
    })}
    <circle cx=${c} cy=${c} r=${rI - 2} fill="var(--panel)" stroke="var(--rule-2)"/>
    ${center ? html`<text x=${c} y=${c + 5} text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${center}</text>` : ''}
  </svg>`;
}

function KeyChip({ code, name, label }) {
  if (!code || code === '–') return html`<span class="kv-chip kv-t-muted">–</span>`;
  return html`<span class="kv-chip" style="color:var(--ink)" title=${label || (code + (name ? ' ' + name : ''))}>
    <i aria-hidden="true" style=${'display:inline-block;width:10px;height:10px;border-radius:50%;flex:none;background:' + fill(code, 90) + ';box-shadow:0 0 0 1px var(--rule)'}></i>
    <b>${code}</b>${name ? html` <span style="color:var(--ink-2)">${name}</span>` : ''}</span>`;
}

function MoodPlot({ size = 220, points, active, xLabel = 'Valence', yLabel = 'Arousal', onPick, label }) {
  const list = points || [];
  const padL = 26, padT = 8, padB = 20, padR = 8;
  const w = size - padL - padR, h = size - padT - padB;
  const X = v => padL + Math.max(0, Math.min(100, v)) / 100 * w, Y = v => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * h;
  const aria = (label || 'Mood plot') + ': ' + list.map(p => p.label + ' ' + xLabel.toLowerCase() + ' ' + p.x + ', ' + yLabel.toLowerCase() + ' ' + p.y).join('; ');
  return html`<svg viewBox=${'0 0 ' + size + ' ' + size} width=${size} height=${size} style="max-width:100%;height:auto;display:block;font-family:var(--f-ui)" role="img" aria-label=${aria}>
    <rect x=${padL} y=${padT} width=${w} height=${h} fill="none" stroke="var(--rule)"/>
    <line x1=${padL + w / 2} x2=${padL + w / 2} y1=${padT} y2=${padT + h} stroke="var(--rule)" stroke-dasharray="2 3"/>
    <line x1=${padL} x2=${padL + w} y1=${padT + h / 2} y2=${padT + h / 2} stroke="var(--rule)" stroke-dasharray="2 3"/>
    <text x=${padL} y=${size - 5} font-size="10" fill="var(--ink-2)">0</text>
    <text x=${padL + w} y=${size - 5} font-size="10" fill="var(--ink-2)" text-anchor="end">${xLabel} 100</text>
    <text x="10" y=${padT + h} font-size="10" fill="var(--ink-2)" transform=${'rotate(-90 10 ' + (padT + h) + ')'}>${yLabel} 0 to 100</text>
    ${list.map(p => {
      const on = p.id === active, x = X(p.x), y = Y(p.y);
      const left = x > padL + w * .6;
      const pr = onPick ? { tabIndex: 0, role: 'button', 'aria-label': p.label, 'aria-pressed': on ? 'true' : 'false', onClick: () => onPick(p.id), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p.id); } }, style: 'cursor:pointer' } : {};
      return html`<g key=${p.id} ...${pr}>
        <circle cx=${x} cy=${y} r=${on ? 7 : 5} fill=${on ? 'var(--accent)' : 'var(--ink-2)'} stroke=${on ? 'var(--seam, var(--accent))' : 'var(--panel)'} stroke-width=${on ? 2.5 : 1.5}><title>${p.label}: ${p.x} / ${p.y}</title></circle>
        <text x=${left ? x - 10 : x + 10} y=${y + 3.5} font-size="10.5" font-weight=${on ? 700 : 500} fill="var(--ink)" text-anchor=${left ? 'end' : 'start'} style="paint-order:stroke;stroke:var(--panel);stroke-width:3px">${p.label}</text>
      </g>`;
    })}
  </svg>`;
}

Kit.viz.wheelUtil = Object.freeze({ hue, neighbours, codes: codes.slice(), fill });
Object.assign(Kit.viz, { KeyWheel, KeyChip, MoodPlot });
})();
/* /part:page.script.kit.viz.wheel */
