/**
 * ADP Claude host adapter (adp-host/1). Apache-2.0.
 * Wraps the claude.ai viewer's window.claude.use('db'|'user'|'comments') as an explicit
 * provider that behaves like the runtime's built-in Claude default. Claude-only surfaces
 * (artifact.publish, comments.sendToClaude, the kit's direct claude.use calls) stay outside
 * the contract. See docs/claude-host-adapter.md for what is and is not supported.
 */
(function (root) {
  'use strict';
  function create() {
    return Object.freeze({
      protocol: 'adp-host/1',
      async connect() {
        const claude = root.claude;
        // Explicit adapter, explicit failure: no static fallback, no other host.
        if (!claude || typeof claude.use !== 'function') throw new TypeError('Claude ADP host needs window.claude.use');
        const use = name => Promise.resolve().then(() => claude.use(name)).catch(() => null);
        const comments = use('comments');
        const [db, user] = await Promise.all([use('db'), use('user')]);
        // connect() must settle and comments can be slow: bind them late, as the built-in default does.
        // ADP.host.comments therefore reports the interface, not that the viewer granted it.
        const late = Object.freeze({customAnchors: callbacks => comments.then(c => {
          if (!c || typeof c.customAnchors !== 'function') throw Object.assign(new Error('comments unavailable'), {code: 'unavailable'});
          return c.customAnchors(callbacks);
        })});
        // user is passed through unchanged: canEdit stays the viewer's own answer (runtime requires literal true).
        return Object.freeze({id: 'claude', db, user, comments: late, seedFiles: true});
      }
    });
  }
  root.ADPClaudeHost = Object.freeze({create});
})(typeof window === 'undefined' ? globalThis : window);
