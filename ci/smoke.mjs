// Manual UI smoke test for the Preact islands — the layer the hermetic unit
// suite (ci/run-tests.mjs / tests.html) does NOT cover.
//
//   node ci/smoke.mjs
//
// NOT wired into `npm test` on purpose: it drives the real app, which fetches
// Preact from a CDN and Pokémon/move data from the live PokeAPI, so it needs
// network and is inherently slower/flakier than the unit suite. Run it by hand
// before merging island changes. Exits non-zero if any check fails.
//
// What it checks (the behaviours most easily broken by island refactors):
//   - the calculator boots and the sample matchup populates both cards
//   - Tailwind doubles the displayed Speed (reads STATE.modifiers, not the DOM)
//   - the optimizer re-renders when the mode changes (memo isn't stale)
//   - the National Dex lazy-loads rows on scroll, monotonically (persistent
//     IntersectionObserver — no stuck placeholders, no re-loading)
//   - a stat-sort force-loads the full roster instead of a partial one
//   - the shared detail modal opens on both the Pokédex and the Attackdex
//   - no console errors beyond the known PokeAPI 404s for cosmetic forms
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = process.env.SMOKE_PORT || '8799';
const BASE = `http://localhost:${PORT}/index.html`;

// PokeAPI returns 404 for some cosmetic forms' pre-evolution move lists; the app
// catches and logs these. They're pre-existing data gaps, not regressions.
const KNOWN_NOISE = /pre-evolution moves|Failed to load resource|Not Found|basculegion|gourgeist/i;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// --- start a static server for the repo root ---
const server = spawn('python3', ['-m', 'http.server', PORT], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
});
const teardown = () => {
  try {
    server.kill();
  } catch {}
};
process.on('exit', teardown);

await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !KNOWN_NOISE.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(BASE, { waitUntil: 'load' });
  // The sample matchup loads async (CDN + PokeAPI), then the attacker card's
  // title fills in. Wait on that rather than a global, which isn't exposed.
  await page.waitForFunction(
    () => {
      const h = document.querySelector('#panel-attacker h3');
      return h && h.textContent.trim() && !/select a pokemon/i.test(h.textContent);
    },
    { timeout: 20000 }
  );

  // 1) Calculator booted + sample matchup populated both cards.
  const atkName =
    (await page
      .locator('#panel-attacker h3')
      .first()
      .textContent()
      .catch(() => '')) || '';
  const defName =
    (await page
      .locator('#panel-defender h3')
      .first()
      .textContent()
      .catch(() => '')) || '';
  check(
    'calc: attacker card populated',
    atkName && !/select a pokemon/i.test(atkName),
    `"${atkName}"`
  );
  check(
    'calc: defender card populated',
    defName && !/select a pokemon/i.test(defName),
    `"${defName}"`
  );

  // 2) Tailwind doubles the displayed attacker Speed.
  const readSpeed = () =>
    page.evaluate(() => {
      const spans = [...document.querySelectorAll('#panel-attacker span')];
      const lbl = spans.find((s) => s.textContent.trim() === 'Speed');
      if (!lbl) return null;
      const num = lbl.parentElement.querySelector('span.font-black, span.text-xs');
      return num ? Number(num.textContent.trim()) : null;
    });
  const setTailwind = (on) =>
    page.evaluate((want) => {
      const inp = [...document.querySelectorAll('#panel-center input[type=checkbox]')].find((i) =>
        /atk tailwind/i.test(i.closest('label')?.textContent || i.parentElement?.textContent || '')
      );
      if (!inp) return false;
      if (inp.checked !== want) inp.click();
      return true;
    }, on);
  const speed0 = await readSpeed();
  const tw = await setTailwind(true);
  await page.waitForTimeout(300);
  const speed1 = await readSpeed();
  check(
    'fix: Tailwind doubles displayed Speed',
    tw && speed0 && speed1 === speed0 * 2,
    `${speed0} -> ${speed1}`
  );
  await setTailwind(false); // restore
  await page.waitForTimeout(150);

  // 3) Optimizer re-renders on a mode change (memo not stale).
  const centerText = () =>
    page.evaluate(() =>
      (document.querySelector('#panel-center')?.textContent || '').replace(/\s+/g, ' ').trim()
    );
  const clickMode = (re) =>
    page.evaluate((src) => {
      const b = [...document.querySelectorAll('#panel-center button')].find((x) =>
        new RegExp(src, 'i').test(x.textContent)
      );
      if (b) {
        b.click();
        return true;
      }
      return false;
    }, re);
  const c0 = await centerText();
  await clickMode('survival');
  await page.waitForTimeout(400);
  const c1 = await centerText();
  await clickMode('attacking');
  await page.waitForTimeout(400);
  const c2 = await centerText();
  check(
    'fix: optimizer cards change on mode switch',
    c0 !== c1 && c1 !== c2,
    `changed both ways: ${c0 !== c1 && c1 !== c2}`
  );

  // 4) National Dex lazy-loads monotonically on scroll.
  await page.evaluate(() => {
    const s = document.querySelectorAll('select')[0];
    if (s) {
      s.value = 'all';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,a')].find((x) =>
      /pok[eé]dex/i.test(x.textContent)
    );
    if (b) b.click();
  });
  await page.waitForTimeout(1500);
  const dexLoaded = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('#page-pokedex [data-api]')];
      let loaded = 0;
      rows.forEach((r) => {
        if (!/loading|…/.test(r.textContent)) loaded++;
      });
      return { total: rows.length, loaded };
    });
  const traj = [(await dexLoaded()).loaded];
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), i / 6);
    await page.waitForTimeout(1200);
    traj.push((await dexLoaded()).loaded);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const dexEnd = await dexLoaded();
  const monotonic = traj.every((v, i) => i === 0 || v >= traj[i - 1]);
  check('fix: National Dex is the big roster', dexEnd.total > 600, `total=${dexEnd.total}`);
  check(
    'perf: lazy-load grows monotonically on scroll',
    traj[traj.length - 1] > traj[0] && monotonic,
    `traj=[${traj.join(',')}]`
  );

  // 5) Stat-sort force-loads the full roster (converges, no partial stall).
  await page.evaluate(() => {
    const h = [
      ...document.querySelectorAll('#page-pokedex button, #page-pokedex [class*=sort]'),
    ].find((b) => /spe|hp|atk|def/i.test(b.textContent));
    if (h) h.click();
  });
  let last = 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1500);
    last = (await dexLoaded()).loaded;
    if (last >= dexEnd.total) break;
  }
  const sorted = await dexLoaded();
  check(
    'fix: stat-sort force-loads full roster',
    sorted.total > 0 && sorted.loaded >= sorted.total * 0.95,
    `loaded ${sorted.loaded}/${sorted.total}`
  );

  // 6) Detail modal opens on the Pokédex.
  await page.evaluate(() => {
    const r = document.querySelector('#page-pokedex [data-api]');
    if (r) r.click();
  });
  await page.waitForTimeout(800);
  const dexModal = await page.evaluate(() => {
    const m = document.querySelector('#detail-modal-root');
    return !!m && m.textContent.trim().length > 0;
  });
  check('modal: Pokédex detail modal opens', dexModal);
  // The modal now leads with a type-matchup summary (at least one of the
  // resist/weak/immune sections shows unless the species is neutral to all 18).
  const matchup = await page.evaluate(() => {
    const m = document.querySelector('#detail-modal-root');
    return !!m && /(Resist|Weak|Immune)/.test(m.textContent);
  });
  check('modal: Pokédex modal shows type matchups', matchup);
  await page.keyboard.press('Escape').catch(() => {});

  // 7) Attackdex renders, lazy-loads, and its modal opens.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,a')].find((x) =>
      /attackdex/i.test(x.textContent)
    );
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  const adxRows = await page.evaluate(
    () => document.querySelectorAll('#page-attackdex [data-api]').length
  );
  check('attackdex: rows render', adxRows > 0, `rows=${adxRows}`);
  await page.evaluate(() => {
    const r = document.querySelector('#page-attackdex [data-api]');
    if (r) r.click();
  });
  await page.waitForTimeout(900);
  const adxModal = await page.evaluate(() => {
    const m = document.querySelector('#detail-modal-root');
    return !!m && /learns|Pok/i.test(m.textContent);
  });
  check('modal: Attackdex "who learns" modal opens', adxModal);

  // 8) No unexpected console errors.
  check('no unexpected console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
  teardown();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
