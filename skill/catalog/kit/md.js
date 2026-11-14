/* part:page.script.kit.md */
/**
 * Markdown
 * Kit.md.create(options) returns mdToHtml(text). Options strip extra tags or attributes, turn gfm off, or open every link in a new tab. When either library is missing it returns escaped text, so a page never renders raw HTML from data.
 *
 * config  Kit.md.create({forbidTags, forbidAttrs, gfm, externalLinks})
 *           forbidTags    tag names DOMPurify strips (default none beyond its own defaults)
 *           forbidAttrs   attribute names stripped (default none)
 *           gfm           pass gfm to marked (default true; the library default)
 *           externalLinks true: every link gets target=_blank rel="noopener noreferrer" (default false)
 * globals window.marked and window.DOMPurify (cdnjs marked@12.0.2, dompurify@3.1.6)
 * Use: const mdToHtml = Kit.md.create(config); html`<div class="md" dangerouslySetInnerHTML=${{ __html: mdToHtml(text) }}></div>`
 *
 * @id        kit.md
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Markdown to sanitized HTML with marked and DOMPurify, a plain-text fallback, and styles for a .md container.
 * @tags      markdown, md, sanitize, dompurify, marked, rich text
 * @requires  none
 * @files     kit/md.css, kit/samples/md.json
 * @provides  Kit.md.create
 * @config    Kit.md.create({forbidTags, forbidAttrs, gfm, externalLinks}) | all optional
 * @config    container | render into an element with class md
 * @tokens    --sunk --rule --ink-2
 * @globals   marked, dompurify
 * @db        none
 * @source    Journey Whiteboard | app.js | mdToHtml
 * @source    ADR Drafting Table | core.js | forbid lists and external links (mermaid fences not taken)
 * @preview   {"render": "kit.md", "samples": ["kit/samples/md.json"]}
 */
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
