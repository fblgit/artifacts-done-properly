/**
 * ADP OpenAI host bridge adapter. Apache-2.0.
 * This is an ADP integration contract, NOT a native OpenAI browser SDK.
 * A trusted integrator supplies the transport and enforces authorization on
 * its server. See docs/openai-host-adapter.md for supported and missing pieces.
 */
(function (root) {
  'use strict';
  const profiles = new Set(['sites', 'codex-preview']);
  const object = value => value !== null && typeof value === 'object';
  function create(options) {
    if (!object(options) || !profiles.has(options.profile)) {
      throw new TypeError('OpenAI ADP profile must be sites or codex-preview');
    }
    const bridge = options.bridge;
    if (!object(bridge) || typeof bridge.connect !== 'function') {
      throw new TypeError('OpenAI ADP requires an explicit bridge.connect');
    }
    const profile = options.profile;
    const seedFiles = options.seedFiles === true;
    return Object.freeze({
      protocol: 'adp-host/1',
      async connect() {
        // No window.openai/claude probing, host fallback, or credential handling.
        const session = await bridge.connect();
        if (!object(session)) throw new TypeError('OpenAI ADP bridge returned no session');
        const db = session.db;
        if (db != null && (!object(db) || typeof db.doc !== 'function' || typeof db.collection !== 'function')) {
          throw new TypeError('OpenAI ADP db must implement the ADP document/query/snapshot profile');
        }
        const identity = session.user;
        if (identity != null && (!object(identity) || typeof identity.canEdit !== 'function' || typeof identity.id !== 'function')) {
          throw new TypeError('OpenAI ADP user requires id() and canEdit()');
        }
        const comments = session.comments;
        if (comments != null && (!object(comments) || typeof comments.customAnchors !== 'function')) {
          throw new TypeError('OpenAI ADP comments requires customAnchors()');
        }
        // The bridge must scope identity to its host. Never coerce objects/truthy strings
        // into permissions. Backend authorization remains mandatory.
        const user = Object.freeze({
          async id() {
            if (!identity) return '';
            const value = await identity.id();
            return typeof value === 'string' ? value : '';
          },
          async canEdit() {
            if (!identity) return false;
            const id = await identity.id();
            return typeof id === 'string' && id.trim().length > 0 && await identity.canEdit() === true;
          }
        });
        return Object.freeze({id: 'openai-' + profile, db: db || null, user,
          comments: comments || null,
          // Native Page visualizations cannot fetch seed packs. Sites/preview
          // may opt in only when the integrator packaged same-origin files.
          seedFiles});
      }
    });
  }
  root.ADPOpenAIHost = Object.freeze({create});
})(typeof window === 'undefined' ? globalThis : window);
