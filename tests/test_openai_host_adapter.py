"""Bridge-contract tests only; these do not exercise a live OpenAI host."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("node"), "node required for browser adapter contract")
class OpenAIHostAdapter(unittest.TestCase):
    def test_bridge_contract(self):
        script = r'''
const assert = require('node:assert/strict');
require('./plugins/artifacts-done-properly/skills/adp/assets/adapters/openai.js');
const create = globalThis.ADPOpenAIHost.create;
(async () => {
  assert.throws(() => create({profile:'spaces', bridge:{connect(){}}}), /profile/);
  assert.throws(() => create({profile:'sites'}), /explicit bridge/);
  const make = (session, extra={}) => create({profile:'sites', bridge:{connect:async()=>session}, ...extra});
  const guest = await make({}).connect();
  assert.equal(guest.id, 'openai-sites');
  assert.equal(guest.db, null);
  assert.equal(guest.comments, null);
  assert.equal(guest.seedFiles, false);
  assert.equal(await guest.user.id(), '');
  assert.equal(await guest.user.canEdit(), false);
  for (const value of ['true', 1, {}, false]) {
    const s = await make({user:{id:async()=>'site:subject', canEdit:async()=>value}}).connect();
    assert.equal(await s.user.canEdit(), false);
  }
  for (const id of ['', ' ', {}, 42]) {
    const s = await make({user:{id:async()=>id, canEdit:async()=>true}}).connect();
    assert.equal(await s.user.canEdit(), false);
  }
  const db = {doc(){}, collection(){}};
  const comments = {customAnchors(){}};
  const editor = await make({db, comments, user:{id:async()=>'site:subject',canEdit:async()=>true}}, {seedFiles:true}).connect();
  assert.equal(editor.db, db);
  assert.equal(editor.comments, comments);
  assert.equal(await editor.user.canEdit(), true);
  assert.equal(editor.seedFiles, true);
  assert.equal(Object.isFrozen(editor), true);
  for (const broken of [null, {db:{}}, {user:{}}, {comments:{}}]) {
    await assert.rejects(make(broken).connect(), TypeError);
  }
  const cause = new Error('transport failed');
  await assert.rejects(create({profile:'sites',bridge:{connect:async()=>{throw cause;}}}).connect(), e=>e===cause);
  const options = {profile:'sites',seedFiles:false,bridge:{connect:async()=>({})}};
  const captured = create(options);
  options.profile = 'codex-preview'; options.seedFiles = true;
  assert.equal((await captured.connect()).id,'openai-sites');
  assert.equal((await captured.connect()).seedFiles,false);
  const stateful = {name:'actor',id(){return this.name;},canEdit(){return this.name === 'actor';}};
  assert.equal(await (await make({user:stateful}).connect()).user.canEdit(),true);
  const brokenIdentity = await make({user:{id:async()=>{throw cause;},canEdit:async()=>true}}).connect();
  await assert.rejects(brokenIdentity.user.canEdit(),e=>e===cause);
  const preview = await make({}, {profile:'codex-preview',seedFiles:'true'}).connect();
  assert.equal(preview.id,'openai-codex-preview');
  assert.equal(preview.seedFiles,false);
  // Runtime refuses an anonymous writer even if a bridge suggests edit rights.
  const denied = await make({user:{id:async()=>'',canEdit:async()=>true}}).connect();
  assert.equal(await denied.user.canEdit(),false);
})().catch(error => { console.error(error); process.exitCode = 1; });
'''
        result = subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
