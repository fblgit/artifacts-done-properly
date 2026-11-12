/* part:page.script.kit.dom */
/* Kit helper: DOM builders (Kit.dom)    kit version 0.1.0
   What it is: the two element builders the kit scripts each used to carry a copy of, now one: el for HTML, sv for SVG. Load it before any script that says so; it draws nothing itself.
   API:
     Kit.dom.el(tag, cls, txt) -> Element     createElement(tag); cls sets className when given; txt sets textContent when not null
     Kit.dom.sv(tag, attrs, cls, txt) -> SVGElement   createElementNS(svg, tag); cls sets the class attribute; attrs {name: value} are set as attributes; txt sets textContent when not null
   Needs from the board:
     css     none; no tokens
     globals none
   db collections: none. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
Kit.dom = { el, sv };
})();
/* /part:page.script.kit.dom */
