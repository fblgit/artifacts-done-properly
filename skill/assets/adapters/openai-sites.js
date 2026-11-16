/** ADP Sites HTTP document transport. Apache-2.0. Not an OpenAI SDK.
 * Uses authenticated same-origin requests and polling, never browser storage.
 * Pair with the Sites Worker; server authorization is authoritative.
 */
(function (root) {
  'use strict';
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  function create(options = {}) {
    const endpoint = options.endpoint;
    if (typeof endpoint !== 'string' || !/^\/api\/adp\/[A-Za-z0-9_-]+$/.test(endpoint)) {
      throw new TypeError('Sites endpoint must be /api/adp/<artifact-id>');
    }
    const interval = options.pollIntervalMs === undefined ? 2000 : options.pollIntervalMs;
    if (!Number.isInteger(interval) || interval < 1000) throw new TypeError('Polling interval must be at least 1000ms');
    function path(value) {
      if (typeof value !== 'string' || !value || value.length > 512 || value.split('/').some(s => !/^[A-Za-z0-9_.~:@+-]+$/.test(s) || s === '.' || s === '..')) {
        throw new TypeError('Invalid document or collection path');
      }
      return value;
    }
    let identity = null, connection;
    async function request(operation, body) {
      const response = await root.fetch(endpoint + '/' + operation, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
        redirect: 'error', cache: 'no-store',
        headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}),
          ...(identity === null ? {} : {'x-adp-user': identity})},
        ...(body === undefined ? {} : {body: JSON.stringify(body)})
      });
      if (!response.ok) {
        const error = new Error('ADP Sites request failed (' + response.status + ')');
        error.code = 'sites-' + response.status;
        error.status = response.status;
        throw error;
      }
      return response.json();
    }
    function documentSnapshot(id, record) {
      if (!record || typeof record.exists !== 'boolean' || !Number.isInteger(record.revision) || record.revision < 0) throw new TypeError('Invalid document response');
      if (record.exists && (record.data === null || typeof record.data !== 'object' || Array.isArray(record.data))) throw new TypeError('Invalid document data');
      const data = record.exists ? copy(record.data) : undefined;
      return Object.freeze({id, exists: record.exists, revision: record.revision, data: () => copy(data)});
    }
    // Serialized poll scheduling prevents an older response overtaking a newer one.
    function subscribe(read, next, error) {
      if (typeof next !== 'function') throw new TypeError('Snapshot callback required');
      let active = true, timer;
      async function poll() {
        try {
          const snapshot = await read();
          if (active) next(snapshot);
        } catch (failure) {
          if (active && typeof error === 'function') error(failure);
        } finally {
          if (active) timer = root.setTimeout(poll, interval);
        }
      }
      void poll();
      return () => { active = false; root.clearTimeout(timer); };
    }
    function doc(value) {
      value = path(value);
      if(value.split('/').length % 2 !== 0)throw new TypeError('Document path needs an even number of segments');
      const id = value.split('/').pop();
      async function get() { return documentSnapshot(id, await request('read', {path: value})); }
      async function write(mode, data, options = {}) {
        const payload = {path: value, mode};
        if (mode !== 'delete') {
          if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Document data must be an object');
          payload.data = copy(data);
        }
        if (options.expectedRevision !== undefined) {
          if (!Number.isInteger(options.expectedRevision) || options.expectedRevision < 0) throw new TypeError('Invalid expected revision');
          payload.expectedRevision = options.expectedRevision;
        }
        return request('write', payload);
      }
      return Object.freeze({id, get, set: (data, options) => write('set', data, options),
        update: (data, options) => write('update', data, options), delete: options => write('delete', undefined, options),
        collection: name => {
          if (typeof name !== 'string' || name.includes('/')) throw new TypeError('Invalid collection ID');
          return query(value + '/' + path(name));
        },
        onSnapshot: (next, error) => subscribe(get, next, error)});
    }
    function query(value, filters = [], ordering = [], count) {
      value = path(value);
      if(value.split('/').length % 2 !== 1)throw new TypeError('Collection path needs an odd number of segments');
      async function get() {
        const response = await request('query', {path: value, where: filters, orderBy: ordering,
          ...(count === undefined ? {} : {limit: count})});
        if (!response || !Array.isArray(response.docs)) throw new TypeError('Invalid query response');
        const ids = new Set();
        const docs = response.docs.map(record => {
          if (typeof record.id !== 'string' || record.id.includes('/') || ids.has(record.id)) throw new TypeError('Invalid query document ID');
          path(record.id); ids.add(record.id);
          return documentSnapshot(record.id, {...record, exists: true});
        });
        return Object.freeze({docs: Object.freeze(docs), docChanges: () => docs.map(d => ({type: 'added', doc: d}))});
      }
      function onSnapshot(next, error) {
        let previous = new Map();
        return subscribe(async () => {
          const result = await get(), current = new Map(result.docs.map(d => [d.id, d])), changes = [];
          result.docs.forEach(d => {
            const old = previous.get(d.id);
            if (!old) changes.push({type: 'added', doc: d});
            else if (old.revision !== d.revision || JSON.stringify(old.data()) !== JSON.stringify(d.data())) changes.push({type: 'modified', doc: d});
          });
          previous.forEach((d, id) => { if (!current.has(id)) changes.push({type: 'removed', doc: d}); });
          previous = current;
          return Object.freeze({docs: result.docs, docChanges: () => changes.map(c => ({...c}))});
        }, next, error);
      }
      return Object.freeze({get, onSnapshot,
        async add(data) {
          // A fresh ID still uses an absence guard: collisions never overwrite a record.
          const ref = doc(value + '/' + root.crypto.randomUUID());
          await ref.set(data, {expectedRevision: 0});
          return ref;
        },
        doc: id => { if (typeof id !== 'string' || id.includes('/')) throw new TypeError('Invalid document ID'); return doc(value + '/' + path(id)); },
        where(field, operator, operand) {
          if (typeof field !== 'string' || !field || operator !== '==') throw new TypeError('Only equality filters are supported');
          return query(value, [...filters, [field, operator, copy(operand)]], ordering, count);
        },
        orderBy(field, direction = 'asc') {
          if (typeof field !== 'string' || !field || !['asc', 'desc'].includes(direction)) throw new TypeError('Invalid ordering');
          return query(value, filters, [...ordering, [field, direction]], count);
        },
        limit(n) {
          if (!Number.isInteger(n) || n < 1 || n > 1000) throw new TypeError('Limit must be 1..1000');
          return query(value, filters, ordering, n);
        }
      });
    }
    return Object.freeze({connect() {
      if (connection) return connection;
      connection = (async () => {
      const session = await request('session');
      if (!session || typeof session.id !== 'string' || typeof session.canEdit !== 'boolean' || (session.canEdit && !session.id.trim())) throw new TypeError('Invalid Sites identity');
      const id = session.id, canEdit = session.canEdit;
      const isOwner = session.isOwner === true;
      identity = id;
      return Object.freeze({db: Object.freeze({doc, collection: value => query(value)}),
        user: Object.freeze({
          id: async () => id,
          canEdit: async () => canEdit,
          isOwner: async () => isOwner,
          can: async permission => permission === 'data.write' && canEdit,
          // Sites does not disclose profile fields here; never infer cross-host identity.
          me: async () => ({id,name:'',avatarUrl:'',color:'',email:null,isOwner,canEdit})
        }), comments: null});
      })();
      return connection;
    }});
  }
  root.ADPOpenAISites = Object.freeze({create});
})(typeof window === 'undefined' ? globalThis : window);
