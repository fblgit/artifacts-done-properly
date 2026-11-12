/* part:page.script.kit.viz.flow */
/* Kit visualization: flow diagram (Kit.flow)    kit version 0.1.0
   What it is: a left-to-right flow built from HTML, not an image: columns of nodes with an arrow between each pair of columns. One node in a column is a pipeline step, several stacked in a column
   are a fan-out (one source feeding sinks) or a fan-in. It runs as rows on a wide box and folds into one column with down arrows when the box is narrower than 560 px (a container query, so it
   follows the box and not the window). Kinds tell what a node is without colour: a source has a filled head, a sink a heavy border, a human step a double border and the word "Person", a
   blocked path a dashed border and a cross. A link between columns can be "blocked" (a cross in place of the arrowhead). Steps can be numbered when the order is the point.
   API: Kit.flow.mount(box, {stages, numbered, label, caption}) -> {update(patch), destroy()}
     stages    [ [node, …] | {nodes: [node, …], link: "ok" | "blocked" | "none", linkLabel} , … ]   the link belongs to the gap before that column
     node      {id, title, text, kind: "step" | "source" | "sink" | "human" | "blocked", tag: {text, tone}, dashed}   tone: ok warn danger accent muted; the tag shows a mark (check, bang, cross) and its words
   Needs from the board:
     css     kit/viz/flow.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --ok --warn --danger --f-ui --f-mono, optional --seam
     globals none
   db collections: none.
   Lifted from: four reports' flows (a source feeding stages and sinks in a grid, a row of layer boxes joined by arrows, an inline-SVG pipeline with arrowheads, a strip with human steps).
   Changed: one component for all four, in HTML so the text wraps and selects, with the arrows drawn in css. The SVG variant with markers is Kit.topology's links. */
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
