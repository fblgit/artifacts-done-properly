/* The adopter page in a real Chromium against `adp.py dev serve` (the local stand-in for claude.ai's database and sessions): select, adopt, refresh, stored previews,
   the build-a-preview button, and the element picker. Prints one JSON object; tests/test_adopt_e2e.py asserts it.
   Usage: node e2e_adopt.js PLAYWRIGHT_DIR URL STATE_DIR   (PLAYWRIGHT_DIR holds node_modules/playwright; STATE_DIR is the served folder, whose .adp-dev/db is read back) */
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(process.argv[2], 'node_modules', 'playwright'));
const URL = process.argv[3], DB = path.join(process.argv[4], '.adp-dev', 'db') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readDb = f => { try { return JSON.parse(fs.readFileSync(DB + f, 'utf8')); } catch (e) { return null; } };
(async () => {
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1600, height: 1200 } })).newPage(), out = {}, errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const info = () => page.evaluate(() => {
    const nodes = Array.prototype.slice.call(document.querySelectorAll('.kit-ab-node')), snap = document.querySelector('.kit-ai-snap');
    return { nodes: nodes.length, states: Object.fromEntries(nodes.filter(n => n.dataset.state !== 'detected').map(n => [n.dataset.id, n.dataset.state])), pressed: (nodes.find(n => n.getAttribute('aria-pressed') === 'true') || { dataset: {} }).dataset.id || null,
      status: (document.querySelector('.kit-ab-status') || {}).textContent, head: snap && !snap.hidden ? snap.querySelector('.kit-ai-snap-h').textContent : null, pv: !!document.querySelector('.kit-ai-pv-frame'),
      btn: (document.querySelector('.kit-ai-snap .kit-ai-btn') || {}).textContent, lit: document.querySelectorAll('.kit-ab-edge.on').length, off: document.querySelectorAll('.kit-ab-edge.off').length,
      overflow: (() => { const m = document.querySelector('.kit-ab-map'); return m ? m.scrollWidth - m.clientWidth : -1; })(), note: (document.querySelector('.ad-note') || {}).textContent }; });
  const btn = t => page.locator('.kit-ab-btn', { hasText: new RegExp('^' + t + '$') });
  const open = async () => { await page.waitForSelector('.kit-ab-node', { timeout: 30000 }); await sleep(2500); };
  /* refresh with the Adopt tab already open: the runtime has not connected to the database when the page mounts, which is what silently disabled everything */
  await page.goto(URL + '#adopt'); await open(); out.first = await info();
  await page.click('.kit-ab-node[data-id="c.wheel"]'); await sleep(2500); out.stored = await info();                 // a preview already in the database
  await btn('Select').click(); await sleep(800); await page.click('.kit-ab-node[data-id="c.dial"]'); await sleep(1200); await btn('Discard').click(); await sleep(800);
  await page.click('.kit-ab-node[data-id="c.wheel"]'); await sleep(2500); out.decided = await info();
  const st = readDb('ns~shared~adopt.json'); out.server = { state: st && st.state ? st.state.data.items.map(x => [x.id, x.state]) : null, view: st && st.view ? st.view.data.selected : null };
  await page.reload(); await open(); out.reloaded = await info();
  /* no preview for c.dial: the button must send a request that reaches the server and the watching session */
  await page.click('.kit-ab-node[data-id="c.dial"]'); await sleep(2500); out.noPreview = await info();
  await page.locator('.kit-ai-snap .kit-ai-btn').click(); await sleep(3000); out.afterBuild = await info();
  const reqs = readDb('requests.json') || {}; out.requests = Object.values(reqs).map(r => ({ scope: r.data.scope && r.data.scope.id, label: r.data.scope && r.data.scope.label, status: r.data.status, mentions: /ns\/shared\/previews\/c\.dial/.test(r.data.text || '') }));
  out.delivered = fs.existsSync(path.join(process.argv[4], '.adp-dev', 'inbox', 'done')) ? fs.readdirSync(path.join(process.argv[4], '.adp-dev', 'inbox', 'done')).length : 0;
  /* the picker: an SVG block the artifact draws, owned by c.dial; and a plain block nobody owns */
  await page.click('.kit-ai-btn:has-text("Pick an element")'); const fr = page.frameLocator('.kit-ai-frame'); await fr.locator('.dial-thumb').first().hover(); await sleep(200);
  out.hoverOwned = await page.evaluate(() => document.querySelector('.kit-ai-say').textContent);
  await fr.locator('.dial-thumb').first().click(); await sleep(600); out.pickedOwned = Object.assign(await info(), { pickerOn: await page.evaluate(() => document.querySelector('.kit-ai-btn').getAttribute('aria-pressed')) });
  await page.click('.kit-ai-btn:has-text("Pick an element")'); await fr.locator('p.plain').first().click(); await sleep(600);
  out.pickedUnowned = Object.assign(await info(), { assign: await page.locator('.kit-ai-assign').count(), pickerOn: await page.evaluate(() => document.querySelector('.kit-ai-btn').getAttribute('aria-pressed')) });
  await page.locator('.kit-ai-assign select').selectOption('c.wheel'); await page.locator('.kit-ai-assign .kit-ai-btn').click(); await sleep(1500);
  const st2 = readDb('ns~shared~adopt.json'); out.assigned = st2 && st2.state ? (st2.state.data.items.find(x => x.id === 'c.wheel') || {}).classes : null;
  await page.reload(); await open(); await page.click('.kit-ai-btn:has-text("Pick an element")'); await page.frameLocator('.kit-ai-frame').locator('p.plain').first().click(); await sleep(800);
  out.afterAssignAndReload = await info(); out.errors = errors.slice(0, 8);
  console.log(JSON.stringify(out)); await browser.close(); process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e && e.stack || e) })); process.exit(1); });
