/**
 * ADP Claude host adapter (adp-host/1). Apache-2.0.
 * Wraps the claude.ai viewer's window.claude.use('db'|'user'|'comments') as an explicit
 * provider that behaves like the runtime's built-in Claude default. It maps Claude's own
 * comments.sendToClaude, artifact.publish and sample onto the host-neutral agent, publish and
 * ask handles; the kit's direct claude.use calls (store, save-status, tester) stay outside the
 * contract. See docs/claude-host-adapter.md for what is and is not supported.
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
        // agent, publish and ask are the host-neutral names for comments.sendToClaude, artifact.publish and sample; each is null when the viewer did not grant that capability.
        const agent = comments.then(c => c && typeof c.sendToClaude === 'function' && typeof c.canSendToClaude === 'function' ? Object.freeze({
          label: 'Claude', canSend: () => Promise.resolve(c.canSendToClaude()),
          send: async m => { const r = await c.sendToClaude(m && m.threadId ? {threadId: m.threadId, text: m.text} : {anchor: m && m.anchor, text: m && m.text}); return {threadId: (r && r.threadId) || (m && m.threadId) || '', delivery: 'accepted'}; },      // only what sendToClaude takes: requestId and turnId are for hosts that keep their own record
          anchorFor: el => Promise.resolve(c.anchorFor(el))}) : null);
        const publish = use('artifact').then(a => a && typeof a.publish === 'function' ? Object.freeze({files: (files, opts) => Promise.resolve(a.publish(files, opts))}) : null);
        const ask = use('sample').then(s => typeof s === 'function' ? (messages, opts) => s(messages, opts) : null);
        return Object.freeze({id: 'claude', db, user, comments: late, seedFiles: true, agent, publish, ask});
      }
    });
  }
  root.ADPClaudeHost = Object.freeze({create});
})(typeof window === 'undefined' ? globalThis : window);
