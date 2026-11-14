/* part:page.script.kit.viz.flow */
/**
 * Flow diagrams
 * Kit.flow.mount builds a left-to-right flow in HTML: columns of nodes with an arrow between each pair. One node in a column is a pipeline step; several stacked are a fan-out or a fan-in. It folds into one column with down arrows when its box is narrower than 560 px (a container query). Kinds read without colour: a source has a filled head, a sink a heavy border, a person step a double border and the word Person, a blocked path a dashed border and a cross. A link between columns can be blocked, drawn dashed with a cross for an arrowhead. Steps can be numbered when the order is the point. The inline SVG variant with arrow markers is covered by Kit.topology's links.
 *
 * API: Kit.flow.mount(box, {stages, numbered, label, caption}) -> {update(patch), destroy()}
 *   stages    [ [node, …] | {nodes: [node, …], link: "ok" | "blocked" | "none", linkLabel} , … ]   the link belongs to the gap before that column
 *   node      {title, text, kind: "step" | "source" | "sink" | "human" | "blocked", tag: {text, tone}, dashed}   tone: ok warn danger accent muted; the tag shows a mark (check, bang, cross) and its words
 *
 * @id        viz.flow
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Columns of nodes joined by arrows: a source feeding sinks, a pipeline, a human step, a blocked path.
 * @tags      flow, pipeline, diagram, steps, arrows, human in the loop, blocked, fan-out
 * @requires  none
 * @files     kit/viz/flow.css, kit/samples/flow.json
 * @provides  Kit.flow.mount
 * @config    Kit.flow.mount(box, opts) | stages [[node] | {nodes, link: ok | blocked | none, linkLabel}], numbered, label, caption; node {title, text, kind: step | source | sink | human | blocked, tag {text, tone}, dashed}
 * @tokens    --panel --sunk --ink --ink-2 --rule --f-ui --f-mono --accent --accent-ink --accent-soft --ok --warn --danger
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | four reports' index.html | a source-to-sinks grid flow, a row of layer boxes joined by arrows, an inline-SVG pipeline with arrowheads, a strip with human steps
 * @preview   {"render": "viz.flow", "samples": ["kit/samples/flow.json"]}
 * @changed   One component for the four forms, in HTML so the text wraps and can be selected; arrows are drawn in css.
 * @changed   Node kinds and blocked links read without colour: outlines, a word and a cross.
 * @changed   Folds to one column by container width, not window width.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const MARK = { ok: '✓', warn: '!', danger: '✕', accent: '•', muted: '–' };
const WORD = { human: 'Person', blocked: 'Blocked' };

function mount(box, opts) {
  const o = Object.assign({ stages: [], numbered: false }, opts);
  box.replaceChildren(); const root = el('div', 'kit-flow'); root.setAttribute('role', 'group'); if (o.label) root.setAttribute('aria-label', o.label); box.append(root);
  function draw() {
    root.replaceChildren(); const row = el('ol', 'kit-flow-row');
    o.stages.forEach((st, si) => {
      const stage = Array.isArray(st) ? { nodes: st } : st, link = stage.link || 'ok';
      if (si > 0 && link !== 'none') {
        const l = el('li', 'kit-flow-link is-' + link); l.setAttribute('aria-hidden', 'true'); l.append(el('span', 'kit-flow-ar'));
        if (stage.linkLabel) l.append(el('span', 'kit-flow-ll', stage.linkLabel)); row.append(l);
      }
      const li = el('li', 'kit-flow-stage'); li.setAttribute('aria-label', (o.numbered ? 'Step ' + (si + 1) : 'Stage ' + (si + 1)) + (stage.link === 'blocked' ? ', reached through a blocked link' : ''));
      stage.nodes.forEach(n => {
        const k = n.kind || 'step', d = el('div', 'kit-flow-node is-' + k + (n.dashed ? ' is-dashed' : ''));
        const head = el('div', 'kit-flow-head'); if (o.numbered) head.append(el('span', 'kit-flow-no', String(si + 1)));
        head.append(el('b', null, n.title));
        if (n.tag) { const t = n.tag.tone && MARK[n.tag.tone] ? n.tag.tone : 'muted'; const g = el('span', 'kit-flow-tag kit-flow-t-' + t); g.append(el('i', null, MARK[t]), document.createTextNode(n.tag.text)); head.append(g); }
        else if (WORD[k]) { const g = el('span', 'kit-flow-tag kit-flow-t-' + (k === 'blocked' ? 'danger' : 'accent')); g.append(el('i', null, k === 'blocked' ? '✕' : '•'), document.createTextNode(WORD[k])); head.append(g); }
        d.append(head); if (n.text) d.append(el('p', null, n.text)); li.append(d);
      });
      row.append(li);
    });
    root.append(row); if (o.caption) root.append(el('p', 'kit-flow-cap', o.caption));
  }
  draw();
  return { update(p) { Object.assign(o, p); draw(); }, destroy() { root.remove(); } };
}
Kit.flow = Object.freeze({ mount });
})();
/* /part:page.script.kit.viz.flow */
