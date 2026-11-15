// A terminal scene as a recording: types each command, then shows its captured output line by line. The commands are run for real by the
// caller (see j1-setup.mjs); this only draws them. record(steps, outDir) -> webm in outDir.
// steps: [{say: "# a comment line"} | {cmd: "command line", out: "its captured output"}]
import { chromium } from 'playwright';

const PAGE = `<style>
html,body{margin:0;background:#1e1e2e}
pre{margin:0;padding:28px 30px;font:20px/1.5 ui-monospace,Menlo,monospace;color:#cdd6f4;white-space:pre-wrap;overflow-wrap:anywhere}
.p{color:#a6e3a1}.c{color:#7f849c}.cur{background:#cdd6f4;color:#1e1e2e}
</style><pre id="t"></pre>`;

export async function record(steps, out, { width = 1200, height = 640, type = 45, line = 70 } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, recordVideo: { dir: out, size: { width, height } } });
  const page = await ctx.newPage();
  await page.setContent(PAGE);
  await page.evaluate(async ({ steps, type, line }) => {
    const t = document.getElementById('t'), sleep = ms => new Promise(r => setTimeout(r, ms));
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let done = '', cur = '';
    const draw = (typed, cursor) => { t.innerHTML = done + typed + (cursor ? '<span class="cur"> </span>' : ''); window.scrollTo(0, document.body.scrollHeight); };
    await sleep(700);
    for (const s of steps) {
      if (s.say !== undefined) { done += '<span class="c">' + esc(s.say) + '</span>\n'; draw('', true); await sleep(900); continue; }
      cur = '<span class="p">$ </span>'; draw(cur, true);
      for (const ch of s.cmd) { cur += esc(ch); draw(cur, true); await sleep(type); }
      await sleep(400); done += cur + '\n'; draw('', false);
      for (const l of s.out.replace(/\n+$/, '').split('\n')) { done += esc(l) + '\n'; draw('', false); await sleep(line); }
      done += '\n'; draw('', true); await sleep(1500);
    }
    await sleep(1500);
  }, { steps, type, line });
  await ctx.close();
  await browser.close();
}
