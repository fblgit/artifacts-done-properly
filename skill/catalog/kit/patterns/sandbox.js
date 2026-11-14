/* part:page.script.kit.sandbox */
/**
 * Live check sandbox
 * Two benches with one look. Kit.sandbox.detect(root, {detectors, examples}) is a text box that runs every detector on each keystroke and lists each with what it found, so a person can paste a line and see which rules would fire; example buttons fill the box; the summary line is announced politely. Kit.sandbox.regexDetector builds a detector from a pattern string, with a capture group, a minimum Shannon entropy and a digit requirement; Kit.sandbox.entropy is the helper. Kit.sandbox.probe(root, {probes}) runs async checks side by side, each with a timeout, and fills a table with Works, Failed or No answer, the detail and the milliseconds, then calls onDone(results) so a board can write the run to its db. Nothing leaves the page unless a probe's run() sends it.
 *
 * What it is: two small test benches that share one look. detect() is a text box that runs a list of detectors on every keystroke and lists each one
 * with what it found, so a person can paste a line and see which rules would fire; example buttons fill the box. probe() runs a list of async checks
 * side by side, each with a timeout, and fills a result table (Works, Failed, No answer) with the detail and the milliseconds each took. Nothing leaves
 * the page: detectors are functions, and a probe does only what the board's run() does. Plain DOM, no framework.
 *
 * API (small and stable):
 *   Kit.sandbox.detect(root, opts) -> {run(), setText(text), destroy()}
 *     detectors  [{id, label, test(text) -> null | {match, note}}]    Kit.sandbox.regexDetector makes one from a pattern string
 *     examples   [{id, label, text}]    buttons that fill the box;  text  the first content;  label  the box's accessible name;  note  a line under the box
 *     maxMatch   characters of a match to show (default 48);  onRun(hits)  hook after each run, hits is [{id, label, match, note}]
 *   Kit.sandbox.probe(root, opts) -> {run(), results(), destroy()}
 *     probes     [{id, what, target, run(target) -> Promise<string>}]    the string is the detail on success; a rejection's message is the detail on failure
 *     timeout    ms before a probe counts as No answer (default 6000);  autorun  run once on mount (default true);  onDone(results)  hook with {id: {status, detail, ms}}
 *     words      texts that replace the defaults
 *   Kit.sandbox.regexDetector({id, label, pattern, flags, group, minEntropy, needDigit}) -> detector    group is the capture group to report (default 0);
 *     minEntropy and needDigit make a hit only when the reported text has that many bits of Shannon entropy per character, or a digit
 *   Kit.sandbox.entropy(text) -> bits per character
 *
 * caps none. A probe that reports to Claude writes onDone(results) to the board's db (a "runs" collection, one doc per run); that write is the board's.
 *
 * @id        pattern.sandbox
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A text box that runs detectors live and lists hits; a probe table that runs async checks with timeouts and timings.
 * @tags      sandbox, detector, test, probe, table, timeout, entropy, live, check
 * @requires  none
 * @files     kit/patterns/sandbox.css, kit/samples/patterns.json
 * @provides  Kit.sandbox.detect, Kit.sandbox.probe, Kit.sandbox.regexDetector, Kit.sandbox.entropy
 * @config    Kit.sandbox.detect(root, {detectors, examples, text, label, note, maxMatch, onRun}) | detectors [{id, label, test(text) -> null | {match, note}}]
 * @config    Kit.sandbox.probe(root, {probes, timeout, autorun, onDone}) | probes [{id, what, target, run(target) -> Promise<string>}]; onDone(results) with {id: {status, detail, ms}}
 * @config    Kit.sandbox.regexDetector({id, label, pattern, flags, group, minEntropy, needDigit}) | makes a detector from a pattern string
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --rule --accent --accent-ink --ok --danger --f-ui --f-mono --seam?
 * @globals   none
 * @db        note None of its own. A probe page that reports to Claude writes onDone(results) to its own db collection (for example runs), which needs the db capability.
 * @source    Catalog harvest, 2026-10-25 | a share-readiness sheet's index.html | the live detector box: paste a line, see which rules fire, with entropy for the generic key rule
 * @source    Catalog harvest, 2026-10-25 | a network probe page's index.html | the probe table: parallel tests, a timeout, results with detail
 * @preview   {"render": "pattern.sandbox", "samples": ["kit/samples/patterns.json#sandbox"]}
 * @samples   sandbox
 * @changed   Kept after review: two sources of the same shape (named checks, a state, a detail), so one component serves both.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k]; if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (k === 'disabled' || k === 'hidden' || k === 'value') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}
const WORDS = {
  boxLabel: 'Text to test', hits: (n, t) => n + ' of ' + t + ' detectors found something', none: 'Nothing found.', found: 'Found', clear: 'No match', examples: 'Examples',
  head: ['Check', 'Result', 'Detail', 'Time'], working: 'Running', works: 'Works', failed: 'Failed', timedOut: 'No answer', run: 'Run again', running: 'Running…',
  done: (ok, t, ms) => ok + ' of ' + t + ' work. Finished in ' + ms + ' ms.', noAnswer: s => 'No answer in ' + s + ' s',
};
function entropy(s) {
  s = String(s); if (!s.length) return 0; const f = {}; for (const c of s) f[c] = (f[c] || 0) + 1;
  let e = 0; for (const c in f) { const p = f[c] / s.length; e -= p * Math.log2(p); } return e;
}
function regexDetector(d) {
  const re = new RegExp(d.pattern, d.flags || '');
  return { id: d.id, label: d.label, group: d.group, test(text) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m;
    while ((m = g.exec(text))) {
      const v = m[d.group || 0]; if (v == null) { if (m[0] === '') g.lastIndex++; continue; }
      const e = entropy(v);
      if (d.needDigit && !/\d/.test(v)) continue;
      if (d.minEntropy && e < d.minEntropy) continue;
      return { match: v, note: d.minEntropy ? 'entropy ' + e.toFixed(2) : '' };
    }
    return null;
  } };
}
let seq = 0;

Kit.sandbox = Object.freeze({
  entropy, regexDetector,
  detect(root, o) {
    const W = Object.assign({}, WORDS, o.words), D = o.detectors || [], max = o.maxMatch || 48, id0 = 'ksb' + (++seq);
    const ta = h('textarea', { id: id0 + '-in', class: 'kit-sb-in', rows: 5, spellcheck: 'false', 'aria-label': o.label || W.boxLabel, 'aria-describedby': id0 + '-sum' });
    ta.value = o.text || '';
    const sum = h('p', { id: id0 + '-sum', class: 'kit-sb-sum', role: 'status', 'aria-live': 'polite' });
    const out = h('ul', { class: 'kit-sb-dets' });
    const left = h('div', { class: 'kit-sb-left' }, ta,
      (o.examples || []).length ? h('div', { class: 'kit-sb-ex', role: 'group', 'aria-label': W.examples }, o.examples.map(x => h('button', { type: 'button', class: 'kit-sb-btn', text: x.label, onclick: () => { ta.value = x.text; run(); ta.focus(); } }))) : null,
      o.note ? h('p', { class: 'kit-sb-note', text: o.note }) : null);
    root.classList.add('kit-sb'); root.replaceChildren(left, h('div', { class: 'kit-sb-right' }, sum, out));
    let timer = 0;
    function run() {
      const t = ta.value, hits = [];
      out.replaceChildren(...D.map(d => {
        let r = null; try { r = d.test(t); } catch (_) {}
        if (r) hits.push({ id: d.id, label: d.label, match: r.match, note: r.note });
        const m = r ? String(r.match) : '';
        return h('li', { class: 'kit-sb-det', 'data-hit': r ? '1' : '0' }, h('i', { class: 'kit-sb-dot', 'aria-hidden': 'true' }), h('span', { class: 'kit-sb-name', text: d.label }),
          r ? h('span', { class: 'kit-sb-m' }, m.length > max ? m.slice(0, max - 1) + '…' : m, r.note ? h('span', { class: 'kit-sb-e', text: r.note }) : null) : null,
          h('span', { class: 'kit-sb-sr', text: r ? W.found : W.clear }));
      }));
      sum.textContent = hits.length ? W.hits(hits.length, D.length) : W.none;
      if (o.onRun) o.onRun(hits);
    }
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    run();
    return { run, setText(t) { ta.value = t; run(); }, destroy() { clearTimeout(timer); root.replaceChildren(); root.classList.remove('kit-sb'); } };
  },
  probe(root, o) {
    const W = Object.assign({}, WORDS, o.words), P = o.probes || [], timeout = o.timeout || 6000;
    let res = {}, dead = false, running = false;
    const body = h('tbody'), sum = h('p', { class: 'kit-sb-sum', role: 'status', 'aria-live': 'polite' });
    const btn = h('button', { type: 'button', class: 'kit-sb-btn pri', text: W.run, onclick: () => run() });
    root.classList.add('kit-sb-probe');
    root.replaceChildren(h('div', { class: 'kit-sb-bar' }, btn, sum),
      h('div', { class: 'kit-sb-wrap', tabindex: 0, role: 'region', 'aria-label': 'Probe results' }, h('table', { class: 'kit-sb-tbl' }, h('thead', null, h('tr', null, W.head.map(x => h('th', { scope: 'col', text: x })))), body)));
    const label = s => s === 'pass' ? W.works : s === 'fail' ? W.failed : s === 'late' ? W.timedOut : W.working;
    const mark = s => s === 'pass' ? '✓' : s === 'wait' ? '…' : '✕';
    function draw() {
      body.replaceChildren(...P.map(p => {
        const r = res[p.id] || { status: 'wait', detail: '', ms: null };
        return h('tr', { 'data-status': r.status }, h('td', { class: 'kit-sb-what' }, p.what, p.target ? h('small', { text: p.target }) : null),
          h('td', { class: 'kit-sb-res' }, h('span', { 'aria-hidden': 'true', text: mark(r.status) + ' ' }), label(r.status)), h('td', { class: 'kit-sb-detail', text: r.detail }),
          h('td', { class: 'kit-sb-ms', text: r.ms == null ? '' : r.ms + ' ms' }));
      }));
    }
    function one(p) {
      const t0 = performance.now(); let to;
      const late = new Promise((_, rej) => { to = setTimeout(() => rej(Object.assign(new Error(W.noAnswer(Math.round(timeout / 100) / 10)), { late: true })), timeout); });
      return Promise.race([Promise.resolve().then(() => p.run(p.target)), late]).then(
        d => { res[p.id] = { status: 'pass', detail: String(d == null ? '' : d), ms: Math.round(performance.now() - t0) }; },
        e => { res[p.id] = { status: e && e.late ? 'late' : 'fail', detail: (e && e.message) || String(e), ms: Math.round(performance.now() - t0) }; }
      ).finally(() => { clearTimeout(to); if (!dead) draw(); });
    }
    async function run() {
      if (running) return; running = true; btn.disabled = true; res = {}; sum.textContent = W.running; draw();
      const t0 = performance.now(); await Promise.all(P.map(one)); if (dead) return;
      const ok = P.filter(p => res[p.id].status === 'pass').length;
      sum.textContent = W.done(ok, P.length, Math.round(performance.now() - t0)); btn.disabled = false; running = false;
      if (o.onDone) o.onDone(JSON.parse(JSON.stringify(res)));
    }
    draw(); if (o.autorun !== false) run();
    return { run, results: () => JSON.parse(JSON.stringify(res)), destroy() { dead = true; root.replaceChildren(); root.classList.remove('kit-sb-probe'); } };
  },
});
})();
/* /part:page.script.kit.sandbox */
