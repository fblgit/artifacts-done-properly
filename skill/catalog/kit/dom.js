/* part:page.script.kit.dom */
/**
 * DOM helpers
 * Kit.dom.el(tag, cls, txt) makes an HTML element with an optional class name and text; Kit.dom.sv(tag, attrs, cls, txt) makes an SVG element with attributes, an optional class and text. Kit scripts that draw take this entry as a requirement instead of carrying their own copy; load kit/dom.js before them. It draws nothing, needs no tokens and no db, and takes no setup.
 *
 * API:
 *   Kit.dom.el(tag, cls, txt) -> Element     createElement(tag); cls sets className when given; txt sets textContent when not null
 *   Kit.dom.sv(tag, attrs, cls, txt) -> SVGElement   createElementNS(svg, tag); cls sets the class attribute; attrs {name: value} are set as attributes; txt sets textContent when not null
 *
 * @id        kit.dom
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-13
 * @summary   el and sv, the two element builders the kit scripts share: one for HTML, one for SVG.
 * @tags      dom, helper, el, svg, element, builder
 * @requires  none
 * @provides  Kit.dom.el, Kit.dom.sv
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs, cls, txt) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
Kit.dom = { el, sv };
})();
/* /part:page.script.kit.dom */
