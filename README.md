# Rotometrics

VGC damage calculator and SP (stat) spread optimizer for the Pokémon Champions
ruleset. Pure client-side — no build step, no bundler. ES modules + the Tailwind
and Preact CDNs, served as static files.

## Running locally

ES modules don't load over `file://`, so you need an HTTP server:

```sh
python3 -m http.server 8765
```

Then open <http://localhost:8765/>.

## Tests

The damage engine has a golden-case suite (25 cases) you can open in a browser:

```
http://localhost:8765/tests.html
```

For headless/CI runs (drives `tests.html` in Chromium via Playwright):

```sh
npm test
```

## Project layout

```
index.html          Page shell + CDN importmap (Tailwind, Preact, htm)
app.js              Entry point: wiring, initialization, page registration
tests.html          In-browser golden-case test runner for the damage engine
champions_dex.json  Champions-format species roster

src/
  state.js          Shared STATE + CACHE singletons
  engine/           Pure calc core (no DOM)
    damage.js         Damage roll formula
    optimize.js       EV/nature survival + offensive optimizers
    stats.js          Stat calculation
    abilities.js      Ability hooks into the damage pipeline
  data/             Static data + rules
    constants.js, dex.js, moves.js, move-tags.js,
    regulations.js, matchup-text.js
  api/              PokeAPI fetching + local cache
    pokeapi.js, cache.js
  ui/               Vanilla UI helpers (page nav, rendering)
    page-nav.js, render.js, result-summary.js
  ui-preact/        Preact + htm islands (see Preact migration below)
    AttackerCard.js, DefenderCard.js, CenterPanel/OptimizerPanel.js,
    ResultsHUD.js, HeaderControls.js, DexView.js, AttackdexView.js,
    store.js, reactive.js, ...

ci/
  run-tests.mjs     Headless test driver
  smoke.mjs         Smoke check (npm run smoke)
```

## Where to add things

- **New ability** — add its damage-pipeline hook in `src/engine/abilities.js`
  and register it in the ability helper lists in `src/data/constants.js`.
- **Damage formula change** — `src/engine/damage.js`; add/adjust a golden case
  in `tests.html` to lock the expected rolls.
- **Species / move data** — `src/data/dex.js`, `src/data/moves.js`,
  `champions_dex.json`. Fetched details come through `src/api/pokeapi.js`.
- **Format / regulation rules** — `src/data/regulations.js`.

## Notes

- The UI is mid-migration to buildless Preact + htm, page by page. Newer panels
  live in `src/ui-preact/`; some vanilla code in `src/ui/` remains. Both styles
  coexist by design.
- `app.js` and `index.html` carry a `?v=…` cache-buster on the script tag; bump
  it when shipping changes if a stale GitHub Pages cache bites you.
- A few PokeAPI 404/CORS console warnings during data fetches are expected and
  handled — they don't indicate a broken page.

## License

[Apache License 2.0](LICENSE).
