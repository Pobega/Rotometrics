// Drives tests.html in headless Chromium and exits non-zero on any red case.

import { chromium } from 'playwright';

const URL = 'http://localhost:8765/tests.html';
const TIMEOUT_MS = 15000;

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('pageerror', err => console.error('[page error]', err.message));
page.on('console', msg => {
  if (msg.type() === 'error') console.error('[console]', msg.text());
});

await page.goto(URL);
await page.waitForSelector('#summary.pass, #summary.fail', { timeout: TIMEOUT_MS });

const summary = (await page.textContent('#summary')).trim();
console.log(summary);

const failedCases = await page.$$eval('.case.fail', els =>
  els.map(el => el.textContent.trim().replace(/\s+/g, ' '))
);

if (failedCases.length) {
  console.error('\nFailed cases:');
  for (const c of failedCases) console.error(' -', c);
}

await browser.close();
process.exit(failedCases.length > 0 ? 1 : 0);
