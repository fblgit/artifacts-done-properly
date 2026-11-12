/* part:page.script.kit.patterns.scenarios */
/* Kit pattern: scenario matrix (Kit.scenarios)    kit version 0.1.0
   What it is: what happens in each scenario under each configuration, with a verdict word per cell and a response column. The same table also holds a happy-path and error-path ledger: the
   columns are yours (3 voters / 5 voters, or Happy path / Error path), and a cell with no text is just a verdict ("to test"). Built on Kit.table, so it scrolls sideways inside its own frame.
   Plain DOM; every string is set with textContent.
   API (small and stable):
     Kit.scenarios.render(box, {columns, rows, scenarioLabel, responseLabel, caption, note, label, legend}) -> {update(rows), table}
       columns        [{id, label}]                         one per configuration (or per path)
       row            {name, flag, cells: {<column id>: {verdict, tone, text}}, response, pick}   tone ok | warn | danger | muted; flag is a small tag on the row's name; pick (true, or a word for a tag) highlights the row
       scenarioLabel  header of the first column (default "Scenario");  responseLabel  header of the last, or null for no response column (default "Response")
       legend         [{verdict, tone, means}] adds a line under the table that spells the verdict words out
   Needs from the board:
     css     kit/table.css, kit/patterns/scenarios.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent-soft --ok --warn --danger --f-ui --f-mono, optional --seam
     globals Kit.table (kit/table.js)
   db collections: none.
   Lifted from: four documents' tables (a failure matrix by cluster size, a scenario by configuration verdict table, a happy and error path ledger, a reality table). Draft status in the plan: judged from the source and kept. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function verdictCell(c) {
  const f = document.createDocumentFragment(); if (!c) return f;
  if (c.verdict) { const v = el('span', 'kit-sv', c.verdict); if (c.tone) v.dataset.tone = c.tone; f.append(v); }
  if (c.text) f.append(el('span', 'kit-sv-t', c.text));
  return f;
}
function render(box, opts) {
  if (!Kit.table) throw new Error('Kit.scenarios needs Kit.table (kit/table.js) loaded first');
  const o = Object.assign({ scenarioLabel: 'Scenario', responseLabel: 'Response' }, opts);
  box.classList.add('kit-scen');
  const frame = el('div'); const columns = [{ key: 'name', label: o.scenarioLabel, cell: r => { const f = document.createDocumentFragment(); f.append(document.createTextNode(r.name)); if (r.flag) f.append(el('span', 'kit-sv-flag', r.flag)); return wrap(f); } }];
  function wrap(f) { const s = el('span'); s.append(f); return s; }
  (o.columns || []).forEach(c => columns.push({ key: c.id, label: c.label, cell: r => wrap(verdictCell((r.cells || {})[c.id])) }));
  if (o.responseLabel) columns.push({ key: 'response', label: o.responseLabel, cls: 'kit-sv-resp', cell: r => r.response || '' });
  const h = Kit.table.render(frame, { columns, rows: o.rows || [], caption: o.caption, note: o.note, label: o.label || o.caption || 'Scenarios', highlight: r => r.pick || false });
  // the first column is a row header
  const fix = () => frame.querySelectorAll('tbody tr:not(.kit-group)').forEach(tr => { const td = tr.firstElementChild; if (td && td.tagName === 'TD') { const th = el('th'); th.scope = 'row'; while (td.firstChild) th.append(td.firstChild); tr.replaceChild(th, td); } });
  fix(); box.replaceChildren(frame);
  if (o.legend && o.legend.length) {
    const lg = el('p', 'kit-scen-legend');
    o.legend.forEach(l => { const s = el('span'); const v = el('span', 'kit-sv', l.verdict); if (l.tone) v.dataset.tone = l.tone; s.append(v, document.createTextNode(l.means)); lg.append(s); });
    box.append(lg);
  }
  return { table: h.table, update(rows) { h.update(rows); fix(); } };
}
Kit.scenarios = Object.freeze({ render });
})();
/* /part:page.script.kit.patterns.scenarios */
