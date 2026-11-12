/* part:page.script.kit.patterns.playbook */
/* Kit pattern: playbook tabs and the pipeline stepper (Kit.playbook)    kit version 0.1.0
   What it is: two ways to lay out a procedure that people run. A playbook set is tabs of playbooks (deploy, roll back, rotate a key), each a numbered list whose steps end in a copyable command.
   A pipeline is one row of numbered stages (edit, validate, apply, confirm); one stage is open at a time and the arrow keys walk the row. Both sit on Kit.tabs, so the keys, the
   roving tabindex and the optional #anchor come for free. Plain DOM; every string is set with textContent.
   API (small and stable):
     Kit.playbook.render(box, {playbooks, label, hash, initial}) -> {tabs, copy, destroy()}
       playbooks  [{id, title, count, steps: [{title, body, cmd, label}]}]   id is a bare token; cmd is the text to copy (one command or several lines)
       label      the tablist's aria-label (default "Playbooks");  hash false (default here) leaves the page's #anchor alone
     Kit.playbook.pipeline(box, {steps, label, hash, initial}) -> {tabs, destroy()}
       steps      [{id, title, sub, kind: "gate" | "risk", heading, body, bullets: [...]}]   kind rings the number and puts the word Gate or Risky in the open panel
   Needs from the board:
     css     kit/tabs.css, kit/copy.css, kit/patterns/steps.css, kit/patterns/playbook.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --warn --accent --accent-ink --f-ui --f-mono --f-display, optional --seam
     globals Kit.tabs (kit/tabs.js), Kit.copy (kit/copy.js)
   db collections: none.
   Lifted from: a runbook's playbook tabs with copyable steps and its pipeline stepper with a tab panel (one document). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const need = n => { if (!Kit[n]) throw new Error('Kit.playbook needs Kit.' + n + ' (kit/' + n + '.js) loaded first'); };
function render(box, opts) {
  need('tabs'); need('copy');
  const o = Object.assign({ label: 'Playbooks', hash: false }, opts);
  const set = el('div', 'kit-tabs kit-playbook'); const list = el('div', 'kit-tabs-list'); list.setAttribute('role', 'tablist'); set.append(list);
  (o.playbooks || []).forEach(p => {
    const b = el('button', null, p.title); b.type = 'button'; b.dataset.tab = p.id;
    if (p.count != null) b.append(' ', el('span', 'kit-tab-n', String(p.count)));
    list.append(b);
    const panel = el('section'); panel.dataset.tabPanel = p.id;
    const ol = el('ol', 'kit-steps');
    (p.steps || []).forEach((s, i) => {
      const li = el('li', 'kit-step'); li.dataset.step = p.id + '-' + (i + 1);
      const body = el('div', 'kit-step-body'); li.append(body);
      body.append(el('h4', 'kit-step-t', s.title));
      if (s.body) body.append(el('p', null, s.body));
      if (s.cmd) body.append(Kit.copy.block({ code: s.cmd, label: s.label || 'Command' }));
      ol.append(li);
    });
    panel.append(ol); set.append(panel);
  });
  box.replaceChildren(set);
  const tabs = Kit.tabs.mount(set, { hash: o.hash, label: o.label, initial: o.initial });
  const copy = Kit.copy.mount(set);
  return { tabs, copy, destroy() { tabs.destroy(); copy.destroy(); } };
}
function pipeline(box, opts) {
  need('tabs');
  const o = Object.assign({ label: 'Stages', hash: false }, opts);
  const set = el('div', 'kit-tabs kit-pipe'); const list = el('div', 'kit-tabs-list'); list.setAttribute('role', 'tablist'); set.append(list);
  (o.steps || []).forEach((s, i) => {
    const id = s.id || 'stage-' + (i + 1);
    const b = el('button'); b.type = 'button'; b.dataset.tab = id; if (s.kind) b.dataset.kind = s.kind;
    b.append(el('b', null, s.title)); if (s.sub) b.append(el('small', null, s.sub));
    list.append(b);
    const panel = el('section', 'kit-pipe-body'); panel.dataset.tabPanel = id;
    if (s.kind) { const f = el('span', 'kit-pipe-flag', s.kind === 'gate' ? 'Gate: nothing below runs while this fails' : 'Risky: this stage can lock you out or change a live system'); f.dataset.kind = s.kind; panel.append(f); }
    panel.append(el('h3', null, s.heading || s.title));
    if (s.body) panel.append(el('p', null, s.body));
    if (s.bullets && s.bullets.length) { const ul = el('ul'); s.bullets.forEach(t => ul.append(el('li', null, t))); panel.append(ul); }
    set.append(panel);
  });
  box.replaceChildren(set);
  const tabs = Kit.tabs.mount(set, { hash: o.hash, label: o.label, initial: o.initial });
  return { tabs, destroy() { tabs.destroy(); } };
}
Kit.playbook = Object.freeze({ render, pipeline });
})();
/* /part:page.script.kit.patterns.playbook */
