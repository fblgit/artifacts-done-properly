// J3 catalog tour: kind tab, an entry with its live preview, three themes, search. Usage: node j3-catalog-road.mjs OUT_DIR BASE_URL
// Records OUT_DIR/*.webm from the catalog served by `adp.py dev serve`; make.sh encodes it.
import { chromium } from 'playwright';

const [out, base] = process.argv.slice(2);
const browser = await chromium.launch();
const size = { width: 1280, height: 1000 };      // tall enough to show an entry's live preview without scrolling
const ctx = await browser.newContext({ viewport: size, colorScheme: 'dark', recordVideo: { dir: out, size } });
const page = await ctx.newPage();
const pause = ms => page.waitForTimeout(ms);

await page.goto(base);
await pause(2500);
await page.getByRole('button', { name: /^Visualizations/ }).click();
await pause(1200);
await page.getByText('Pebble map', { exact: true }).first().click();
await page.waitForFunction(() => !/Loading the theme/.test(document.body.innerText), null, { timeout: 30000 });
await pause(3000);
for (const theme of ['Glaze', 'Console', 'Blueprint']) {
  await page.getByRole('button', { name: theme, exact: true }).first().click();
  await pause(2500);
}
await page.getByPlaceholder(/Search/).click();
await page.keyboard.type('timeline', { delay: 90 });
await pause(2500);

await ctx.close();
await browser.close();
