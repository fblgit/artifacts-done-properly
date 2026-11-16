/** Sites-owned anchored feedback over ADP requests/turns. Apache-2.0.
 * Saving queues a durable request; it does not claim agent delivery.
 */
(function (root) {
  'use strict';
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
    return value;
  }
  const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function create({db, user}) {
    const request = id => {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new TypeError('Invalid request ID');
      return db.doc('requests/' + id);
    };
    async function editor() {
      const by = await user.id();
      if (!by || await user.canEdit() !== true) throw new Error('Read-only feedback');
      return by;
    }
    function text(value) {
      if (typeof value !== 'string' || !value.trim() || value.length > 16000) throw new TypeError('Enter feedback (up to 16000 characters)');
      return value.trim();
    }
    async function save(ref, data, expectedRevision) {
      try {
        const ack = await ref.set(data, {expectedRevision});
        const readback = await ref.get();
        if (!readback.exists || readback.revision !== ack.revision || !equal(readback.data(),data)) {
          throw new Error('Save unconfirmed');
        }
        return readback;
      }
      catch (error) {
        if (!error.status || error.status >= 500) {
          error.message = 'Save outcome unknown; inspect the stored request before retrying';
          error.inspect = async () => {
            const observed = await ref.get();
            return observed.exists && observed.revision === expectedRevision + 1 && equal(observed.data(),data);
          };
        }
        throw error;
      }
    }
    function workLabel(data) {
      const work = data.execution;
      if (!work) return data.status === 'done' ? 'Completed' : 'Queued for an agent';
      if (work.state === 'done') return 'Completed by ' + work.actor;
      if (work.state === 'blocked') return 'Blocked: ' + (work.reason || 'agent needs input');
      if (Date.parse(work.leaseUntil) <= Date.now()) return 'Waiting for agent recovery';
      return 'Working · ' + work.actor;
    }
    const api = {
      async requestPublication(id) {
        const by = await editor();
        request(id); // Reuse the same safe document-ID validation.
        const ref = db.doc('incoming/' + id), before = await ref.get();
        if (!before.exists) throw new Error('Proposal no longer exists');
        const data = before.data();
        if (data.status !== 'merged' || data.conflict) throw new Error('Resolve proposal conflicts before requesting publication');
        const input = Object.fromEntries(['files','parts','base'].map(k => [k,data[k] ?? null]));
        const digest = await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(input))));
        const inputHash = 'sha256:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
        if (data.publishRequest?.inputHash === inputHash && data.execution?.state !== 'blocked') return id;
        const execution = data.execution?.state === 'blocked' ? {...data.execution,state:'queued',leaseUntil:new Date().toISOString(),reason:''} : null;
        await save(ref,{...data,publishRequest:{by,at:new Date().toISOString(),inputHash},execution},before.revision);
        return id;
      },
      async create(anchor, message, options = {}) {
        const by = await editor();
        if (typeof anchor !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]*(?::[^\s]{1,200})?$/.test(anchor)) throw new TypeError('Invalid part anchor');
        const id = 'r-' + root.crypto.randomUUID(), part = anchor.split(':')[0];
        const manifest = await db.doc('manifest/current').get();
        const hash = manifest.exists ? manifest.data().parts?.[part] : null;
        const scope = {kind:'part',id:part,label:options.label || part};
        if (typeof hash === 'string') scope.hash = hash;
        try { await save(request(id), {lane:'task',scope,project:'',text:text(message),quote:'',by,
          at:new Date().toISOString(),status:'open',state:null,ackBy:'',ackAt:'',progress:[],
          response:'',doneAt:'',changed:[],version:'',estimate:null,actual:null,
          anchor,kind:'comment',resolved:false,delivery:'queued'}, 0); }
        catch (error) { error.requestId = id; throw error; }
        return id;
      },
      async reply(id, message) {
        const by = await editor(), ref = request(id), before = await ref.get();
        if (!before.exists) throw new Error('Request no longer exists');
        const turns = ref.collection('turns'), rows = await turns.get();
        const next = Math.max(0, ...rows.docs.map(d => /^\d+$/.test(d.id) ? Number(d.id) : 0)) + 1;
        const tid = String(next).padStart(4, '0');
        const turn = {by,at:new Date().toISOString(),text:text(message)};
        await save(turns.doc(tid), turn, 0);
        try {
          await save(ref, {...before.data(),status:'open',state:null,resolved:false,delivery:'queued',execution:null,workGeneration:(before.data().workGeneration || 0)+1}, before.revision);
        } catch (error) {
          const partial = new Error('Reply saved as turn ' + tid + '; reopening request unconfirmed: ' + error.message);
          partial.inspect = async () => {
            const observed = await turns.doc(tid).get();
            return observed.exists && equal(observed.data(),turn);
          };
          partial.recoveryMessage = 'Reply is stored; request reopening remains unconfirmed. No duplicate reply was sent.';
          throw partial;
        }
        return tid;
      },
      async resolve(id, resolved) {
        await editor();
        const ref = request(id), before = await ref.get();
        if (!before.exists) throw new Error('Request no longer exists');
        // Thread resolution is distinct from an agent completing the request.
        await save(ref, {...before.data(),resolved:resolved === true}, before.revision);
      },
      async customAnchors(callbacks) {
        const document = root.document;
        if (!document?.body) throw new Error('Anchored comments require a document');
        const element = (tag, label) => {
          const node = document.createElement(tag);
          if (label) node.textContent = label;
          return node;
        };
        const toggle = element('button', 'Comments'), panel = element('aside'), heading = element('h2', 'Artifact comments');
        toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
        panel.setAttribute('aria-label', 'Artifact comments'); panel.hidden = true;
        panel.style.cssText = 'position:fixed;right:16px;top:70px;bottom:16px;width:min(360px,calc(100vw - 32px));overflow:auto;z-index:10000;padding:20px;background:var(--panel,#151d28);color:var(--ink,#ecf2fa);border:1px solid var(--rule,#50647a);border-radius:12px';
        toggle.style.cssText = 'position:fixed;right:16px;top:16px;z-index:10001';
        const choose = element('button', 'Choose a part'), list = element('div'), transcript = element('div');
        const label = element('label', 'Feedback or reply'), draft = element('textarea');
        draft.id = 'adp-sites-feedback'; label.htmlFor = draft.id; draft.maxLength = 16000;
        draft.style.cssText = 'display:block;width:100%;min-height:100px;box-sizing:border-box';
        const send = element('button', 'Save feedback'), resolve = element('button', 'Resolve thread'), inspect = element('button', 'Inspect saved request');
        inspect.hidden = true;
        const status = element('p', 'Saved feedback is queued here; agent delivery is not automatic.');
        status.setAttribute('role', 'status');
        panel.append(heading,choose,list,transcript,label,draft,send,resolve,inspect,status);
        document.body.append(toggle,panel);
        let mode = false, selected = null, anchor = null, anchorLabel = '', busy = false, generation = 0, uncertain = null;
        let threadSignature = '', currentThreads = [], disconnected = false;
        const pins = new Map();
        const canEdit = await user.canEdit() === true;
        send.disabled = !canEdit; resolve.disabled = !canEdit; choose.disabled = !canEdit;
        function setMode(value) {
          mode = value; panel.hidden = !mode; toggle.setAttribute('aria-expanded', String(mode));
          callbacks.mode?.(mode);
          if (mode) callbacks.threads?.(currentThreads.filter(t => !t.resolved));
          if (!mode) { pins.forEach(p => p.remove()); pins.clear(); }
        }
        async function show(id) {
          const version = ++generation;
          selected = id; anchor = null; setMode(true);
          const record = await request(id).get(), turns = await request(id).collection('turns').get();
          if (version !== generation) return;
          transcript.replaceChildren();
          if (!record.exists) throw new Error('Request no longer exists');
          const data = record.data();
          transcript.append(element('p', data.text));
          transcript.append(element('p',workLabel(data)));
          if (data.progress?.length) transcript.append(element('p',data.progress.at(-1).text));
          if (data.response) transcript.append(element('p', data.response));
          turns.docs.sort((a,b) => a.id.localeCompare(b.id)).forEach(t => transcript.append(element('p', t.data().text)));
          resolve.textContent = data.resolved ? 'Reopen thread' : 'Resolve thread';
          resolve.dataset.resolved = String(data.resolved === true);
          send.textContent = 'Save reply';
          callbacks.reveal?.(id);
        }
        const report = error => { status.textContent = error.message + '. Draft retained.'; };
        toggle.onclick = () => setMode(!mode);
        choose.onclick = () => { setMode(true); selected = null; status.textContent = 'Choose a named part on the page.'; };
        send.onclick = async () => {
          if (busy || !canEdit || uncertain) return;
          busy = true; send.disabled = true;
          try {
            if (selected) await api.reply(selected, draft.value);
            else if (anchor) selected = await api.create(anchor, draft.value, {label:anchorLabel});
            else throw new Error('Choose a part first');
            draft.value = ''; await show(selected);
            status.textContent = 'Saved and read back. Queued for an agent; delivery is not confirmed.';
          } catch (error) {
            if (error.inspect) { uncertain = error; inspect.hidden = false; }
            report(error);
          }
          finally { busy = false; send.disabled = !canEdit || !!uncertain; }
        };
        inspect.onclick = async () => {
          if (!uncertain) return;
          try {
            if (!await uncertain.inspect()) throw new Error('Stored state does not confirm this save; reconcile it before retrying');
            if (uncertain.requestId) selected = uncertain.requestId;
            draft.value = ''; await show(selected);
            const message = uncertain.recoveryMessage || 'Recovered by authoritative readback; saved data matches. No write was retried.';
            uncertain = null; inspect.hidden = true; send.disabled = !canEdit;
            status.textContent = message;
          } catch (error) { report(error); }
        };
        resolve.onclick = async () => {
          if (!selected || busy || !canEdit) return;
          try { await api.resolve(selected, resolve.dataset.resolved !== 'true'); await show(selected); }
          catch (error) { report(error); }
        };
        const stop = db.collection('requests').onSnapshot(snapshot => {
          if (disconnected) {
            disconnected = false;
            if (!uncertain && !busy) status.textContent = 'Comments reconnected; stored threads are current.';
          }
          const threads = snapshot.docs.map(d => ({...d.data(),id:d.id,workLabel:workLabel(d.data())})).filter(d => d.anchor || d.scope?.kind === 'part');
          const signature = JSON.stringify(threads);
          // Stable nodes preserve focus while unchanged polls still report recovery.
          if (signature === threadSignature) return;
          threadSignature = signature;
          threads.forEach(thread => { thread.anchor ||= thread.scope.id; });
          currentThreads = threads;
          list.replaceChildren();
          threads.forEach(thread => {
            const button = element('button', (thread.resolved ? '✓ ' : '') + thread.anchor + ': ' + String(thread.text || '').slice(0,60));
            button.onclick = () => show(thread.id).catch(report); list.append(button);
          });
          callbacks.threads?.(threads.filter(t => !t.resolved));
          if (mode && selected && !busy) void show(selected).catch(report);
        }, error => { disconnected = true; status.textContent = 'Comments unavailable: ' + error.message; });
        return {
          async compose(value, target, options = {}) {
            anchor = value; anchorLabel = options.label || value; selected = null; setMode(true);
            transcript.replaceChildren(element('p', 'Part: ' + (options.label || value)));
            send.textContent = 'Save feedback'; status.textContent = 'Feedback stays attached to this part.';
            callbacks.composing?.(value); draft.focus();
          },
          placed(positions) {
            pins.forEach((pin,id) => { if (!mode || !positions[id]) { pin.remove(); pins.delete(id); } });
            if (!mode) return;
            Object.entries(positions).forEach(([id,position]) => {
              let pin = pins.get(id);
              if (!pin) { pin = element('button','●'); pin.setAttribute('aria-label','Open comment '+id); pin.onclick=()=>show(id).catch(report); pins.set(id,pin); document.body.append(pin); }
              pin.style.cssText = 'position:absolute;z-index:9998;left:'+position.x+'px;top:'+position.y+'px';
            });
          },
          destroy() { stop(); pins.forEach(p=>p.remove()); panel.remove(); toggle.remove(); callbacks.mode?.(false); }
        };
      }
    };
    api.agent = Object.freeze({
      label: 'Codex',
      async canSend() {
        if (!await user.id()) return 'off';
        return await user.canEdit() === true ? 'queued' : 'writers_only';
      },
      async anchorFor(el) {
        const part = el?.closest?.('[data-part]');
        if (el?.closest?.('[data-uncommentable]')) throw new Error('This part does not accept feedback');
        const key = el?.closest?.('[data-part-key]');
        return part ? part.dataset.part + (key && part.contains(key) ? ':' + key.dataset.partKey : '') : 'page';
      },
      async send(message = {}) {
        await editor();
        let id = message.requestId || message.threadId;
        async function observed(ref) {
          try { return await ref.get(); }
          catch (error) {
            if (!error.status || error.status >= 500) error.notificationUnknown = true;
            throw error;
          }
        }
        try {
          if (message.requestId) {
            // Shared kit already persisted the request/turn: never duplicate it.
            const ref = request(id), before = await observed(ref);
            if (!before.exists) throw new Error('Request no longer exists');
            if (message.turnId) {
              if (!/^[0-9]+$/.test(message.turnId)) throw new TypeError('Invalid reply turn ID');
              if (!(await observed(ref.collection('turns').doc(message.turnId))).exists) throw new Error('Reply is not stored');
            }
            if (before.data().status !== 'open') throw new Error('Only open requests can be queued');
            await save(ref, {...before.data(),delivery:'queued'}, before.revision);
          } else if (id) await api.reply(id, message.text);
          else id = await api.create(message.anchor, message.text);
          return {threadId:id,delivery:'queued'};
        } catch (error) {
          id ||= error.requestId;
          if (!id || (typeof error.inspect !== 'function' && !error.notificationUnknown)) throw error;
          // Reconcile the original ID; an unknown outcome must not create a retry.
          try {
            if (!error.recoveryMessage && typeof error.inspect === 'function' && await error.inspect()) return {threadId:id,delivery:'queued'};
          } catch (_) { /* The original outcome remains unknown. */ }
          return {threadId:id,delivery:'unknown'};
        }
      }
    });
    return Object.freeze(api);
  }
  root.ADPOpenAISitesComments = Object.freeze({create});
})(typeof window === 'undefined' ? globalThis : window);
