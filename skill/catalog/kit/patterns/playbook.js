/* part:page.script.kit.patterns.playbook */
/**
 * Playbook tabs and pipeline
 * Two layouts for a procedure people run, both on Kit.tabs: a playbook set (tabs of numbered steps that end in a copyable command block) and a pipeline (a row of numbered stages joined by a line, one open at a time, with Gate and Risky stages marked in words). Arrow keys, Home and End come from Kit.tabs; the copy button falls back to selecting the text where the frame refuses the clipboard.
 *
 * What it is: two ways to lay out a procedure that people run. A playbook set is tabs of playbooks (deploy, roll back, rotate a key), each a numbered list whose steps end in a copyable command.
 *
 * A pipeline is one row of numbered stages (edit, validate, apply, confirm); one stage is open at a time and the arrow keys walk the row. Both sit on Kit.tabs, so the keys, the
 * roving tabindex and the optional #anchor come for free. Plain DOM; every string is set with textContent.
 *
 * API (small and stable):
 *   Kit.playbook.render(box, {playbooks, label, hash, initial}) -> {tabs, copy, destroy()}
 *     playbooks  [{id, title, count, steps: [{title, body, cmd, label}]}]   id is a bare token; cmd is the text to copy (one command or several lines)
 *     label      the tablist's aria-label (default "Playbooks");  hash false (default here) leaves the page's #anchor alone
 *   Kit.playbook.pipeline(box, {steps, label, hash, initial}) -> {tabs, destroy()}
 *     steps      [{id, title, sub, kind: "gate" | "risk", heading, body, bullets: [...]}]   kind rings the number and puts the word Gate or Risky in the open panel
 *
 * CSS classes: .kit-playbook .kit-pipe
 *
 * @id        pattern.playbook
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Tabs of playbooks, each a numbered list of copyable commands; and a pipeline stepper whose open stage shows its detail.
 * @tags      playbook, runbook, tabs, commands, copy, pipeline, stepper, procedure
 * @requires  kit.tabs, kit.copy, pattern.steps
 * @files     kit/patterns/playbook.css, kit/samples/patterns.json
 * @provides  Kit.playbook.render, Kit.playbook.pipeline
 * @config    Kit.playbook.render(box, opts) | playbooks [{id, title, count, steps: [{title, body, cmd, label}]}], label, hash (default false), initial
 * @config    Kit.playbook.pipeline(box, opts) | steps [{id, title, sub, kind: gate|risk, heading, body, bullets}], label, hash, initial
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono --f-display --warn --accent-ink --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 1 artifact's index.html | playbook tabs with a numbered, copyable command per step, and a pipeline stepper with a tab panel
 * @preview   {"render": "pattern.playbook", "samples": ["kit/samples/patterns.json#playbook"]}
 * @changed   Built on Kit.tabs and Kit.copy instead of its own handlers, so the keyboard, the roving tabindex and the clipboard fallback are the kit's.
 */
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
