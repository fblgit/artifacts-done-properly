/* part:page.script.kit.md */
/* Kit component: Markdown (Kit.md)    kit version 0.1.0
   What it is: Markdown to sanitized HTML (marked + DOMPurify) with a plain-text fallback when either library is missing; styles in kit/md.css for a ".md" container.
   Needs from the board:
     config  Kit.md.create({forbidTags, forbidAttrs, gfm, externalLinks})
               forbidTags    tag names DOMPurify strips (default none beyond its own defaults)
               forbidAttrs   attribute names stripped (default none)
               gfm           pass gfm to marked (default true; the library default)
               externalLinks true: every link gets target=_blank rel="noopener noreferrer" (default false)
     globals window.marked and window.DOMPurify (cdnjs marked@12.0.2, dompurify@3.1.6)
     css     kit/md.css; custom properties --sunk --rule --ink-2
   Use: const mdToHtml = Kit.md.create(config); html`<div class="md" dangerouslySetInnerHTML=${{ __html: mdToHtml(text) }}></div>`
   db collections: none.
   Lifted from: Journey Whiteboard app.js (mdToHtml). The ADR Drafting Table's core.js version adds forbid lists and external links (now options here, off by default) and renders mermaid fences (not in the kit). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let hooked = false;
Kit.md = Object.freeze({
  create({ forbidTags, forbidAttrs, gfm, externalLinks = false } = {}) {
    if (externalLinks && !hooked && window.DOMPurify && window.DOMPurify.addHook) {
      hooked = true;
      window.DOMPurify.addHook('afterSanitizeAttributes', n => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
    }
    const pure = {}; if (forbidTags) pure.FORBID_TAGS = forbidTags; if (forbidAttrs) pure.FORBID_ATTR = forbidAttrs;
    const opts = gfm === undefined ? undefined : { gfm };
    return function mdToHtml(md) {
      try { return window.DOMPurify.sanitize(window.marked.parse(String(md || ''), opts), pure); }
      catch (_) { const d = document.createElement('div'); d.textContent = md || ''; return d.innerHTML; }
    };
  },
});
})();
/* /part:page.script.kit.md */
