// Pokédex stats-browser page: a self-contained second view (toggled via the
// nav) that lists every legal species with types, abilities, and base stats,
// with lazy-loading, client-side sort, and search. Holds its own DexPage state
// and queries its own DOM nodes (dexDom), so it stays decoupled from the
// calculator controller in app.js.
import { STATE, CACHE } from '../state.js';
import { bst, sortDex, filterDex, isHiddenForm, isRegulationMALegal } from '../data/dex.js';
import { fetchPokemonDetails, initPokemonList, initChampionsLegalList } from '../api/pokeapi.js';
import { getTypeBgClass, setSearchPlaceholders } from './render.js';

const DexPage = {
  roster: [],          // [{ apiName, name, details|null }]
  byName: {},          // apiName -> row (same object refs as roster)
  sortKey: 'bst',
  sortDir: 'desc',
  query: '',
  builtForFormat: null,
  allLoaded: false,    // every roster row has details loaded
  loading: false,
  observer: null,
  dom: null
};

function dexDom() {
  if (DexPage.dom) return DexPage.dom;
  DexPage.dom = {
    pageCalculator: document.getElementById('page-calculator'),
    pagePokedex: document.getElementById('page-pokedex'),
    navCalculator: document.getElementById('nav-calculator'),
    navPokedex: document.getElementById('nav-pokedex'),
    search: document.getElementById('dex-search'),
    rows: document.getElementById('dex-rows'),
    status: document.getElementById('dex-status'),
    header: document.getElementById('dex-header'),
    regBadge: document.getElementById('dex-regulation-badge'),
    mobileOverlay: document.getElementById('mobile-floating-overlay'),
    desktopResultsBar: document.getElementById('results-hud')
  };
  return DexPage.dom;
}

// Build the roster for the current STATE.format from the already-loaded caches.
function buildDexRoster() {
  // Drop non-battle / cosmetic forms from every view (ride modes, Gmax/Totem,
  // cosplay Pikachu, cosmetic duplicates, redundant Minior colors).
  let entries = (CACHE.pokemonList || [])
    .filter(p => !isHiddenForm(p.apiName))
    .map(p => ({ apiName: p.apiName, name: p.name }));
  // M-A: keep only legal varieties, using the same predicate the calculator's
  // search uses so the two views stay in sync.
  if (STATE.format === 'regulation_ma') {
    entries = entries.filter(p => isRegulationMALegal(p.apiName, CACHE.championsLegalList));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  DexPage.roster = entries.map(e => ({ apiName: e.apiName, name: e.name, details: null }));
  DexPage.byName = {};
  DexPage.roster.forEach(r => { DexPage.byName[r.apiName] = r; });
  DexPage.builtForFormat = STATE.format;
  DexPage.allLoaded = false;
}

// Badge next to the "Pokédex" title showing the active regulation, styled to
// match the per-Pokémon legality tags (green for M-A, slate for National Dex).
function updateDexRegulationBadge() {
  const { regBadge } = dexDom();
  if (!regBadge) return;
  if (STATE.format === 'regulation_ma') {
    regBadge.textContent = 'Regulation M-A';
    regBadge.className = 'text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-green-950 text-green-400 border border-green-900/50';
  } else {
    regBadge.textContent = 'National Dex';
    regBadge.className = 'text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-slate-800/60 text-slate-400 border border-slate-700/30';
  }
}

function dexStatusText() {
  const total = DexPage.roster.length;
  const loaded = DexPage.roster.filter(r => r.details).length;
  if (loaded < total) return `${total} species · loaded ${loaded}/${total}…`;
  return `${total} species`;
}

// Concurrency-limited loader. Resolves once every requested name is fetched.
async function loadDexDetails(apiNames, { rerenderEachBatch = true } = {}) {
  const queue = apiNames.filter(n => DexPage.byName[n] && !DexPage.byName[n].details);
  if (queue.length === 0) return;
  DexPage.loading = true;

  const CONCURRENCY = 8;
  const RENDER_EVERY = 24; // rebuild the table periodically, not on every fetch
  let cursor = 0;
  let sinceRender = 0;

  async function worker() {
    while (cursor < queue.length) {
      const apiName = queue[cursor++];
      try {
        const details = await fetchPokemonDetails(apiName);
        const row = DexPage.byName[apiName];
        if (row) row.details = details;
      } catch (err) {
        console.error(`Pokédex: failed to load ${apiName}`, err);
      }
      if (rerenderEachBatch && ++sinceRender >= RENDER_EVERY) {
        sinceRender = 0;
        renderDex();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  DexPage.loading = false;
  DexPage.allLoaded = DexPage.roster.every(r => r.details);
  renderDex();
}

// Ensure every roster row has details (used before stat-sort / ability-search in
// the National Dex where rows are otherwise lazy-loaded).
async function ensureDexFullyLoaded() {
  if (DexPage.allLoaded || DexPage.loading) return;
  await loadDexDetails(DexPage.roster.map(r => r.apiName));
}

const TYPE_SHORT = {
  Normal: 'NOR', Fire: 'FIR', Water: 'WAT', Grass: 'GRA', Electric: 'ELE',
  Ice: 'ICE', Fighting: 'FIG', Poison: 'POI', Ground: 'GRD', Flying: 'FLY',
  Psychic: 'PSY', Bug: 'BUG', Rock: 'ROC', Ghost: 'GHO', Dragon: 'DRA',
  Dark: 'DRK', Steel: 'STE', Fairy: 'FAI'
};

function dexRowHTML(row) {
  const d = row.details;
  if (!d) {
    // Lazy placeholder; carries data-api so the observer knows what to fetch.
    return `<div class="dex-row grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs" data-api="${row.apiName}">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div>
        <span class="font-bold text-slate-300 truncate">${row.name}</span>
      </div>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-slate-600 text-[10px]">loading…</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
    </div>`;
  }

  const types = d.types.map(t =>
    `<span class="text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white" title="${t}">${TYPE_SHORT[t] || t}</span>`
  ).join(' ');
  const abilities = d.abilities.map(a => a.name).join(', ');
  const s = d.baseStats;
  const total = bst(s);
  const cell = (v) => `<span class="text-right font-mono text-slate-300">${v}</span>`;

  return `<div class="dex-row grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs hover:bg-slate-800/40 transition" data-api="${row.apiName}">
    <div class="flex items-center gap-2 min-w-0">
      <img src="${d.sprite || ''}" alt="" loading="lazy" class="w-8 h-8 object-contain shrink-0">
      <span class="font-bold text-slate-100 truncate">${row.name}</span>
    </div>
    <div class="flex flex-wrap gap-1">${types}</div>
    <span class="text-slate-400 text-[10px] leading-tight">${abilities}</span>
    ${cell(s.hp)}${cell(s.atk)}${cell(s.def)}${cell(s.spa)}${cell(s.spd)}${cell(s.spe)}
    <span class="text-right font-mono font-bold text-amber-400">${total}</span>
  </div>`;
}

function updateDexSortIndicators() {
  const { header } = dexDom();
  if (!header) return;
  header.querySelectorAll('.dex-sort').forEach(btn => {
    const arrow = btn.querySelector('.dex-arrow');
    const active = btn.dataset.sortKey === DexPage.sortKey;
    btn.classList.toggle('text-amber-400', active);
    if (arrow) arrow.textContent = active ? (DexPage.sortDir === 'desc' ? '▼' : '▲') : '';
  });
}

function renderDex() {
  const { rows, status } = dexDom();
  if (!rows) return;

  const filtered = filterDex(DexPage.roster, DexPage.query);
  const sorted = sortDex(filtered, DexPage.sortKey, DexPage.sortDir);

  rows.innerHTML = sorted.length
    ? sorted.map(dexRowHTML).join('')
    : `<div class="px-3 py-8 text-center text-xs text-slate-500">No Pokémon match “${DexPage.query}”.</div>`;

  if (status) status.textContent = dexStatusText();
  updateDexRegulationBadge();
  updateDexSortIndicators();
  observeLazyDexRows();
}

// In National Dex mode, fetch details for placeholder rows as they scroll in.
function observeLazyDexRows() {
  const { rows } = dexDom();
  if (!rows) return;
  if (DexPage.observer) DexPage.observer.disconnect();
  if (DexPage.allLoaded) return;

  DexPage.observer = new IntersectionObserver((entries) => {
    const toLoad = [];
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const apiName = entry.target.getAttribute('data-api');
      const row = DexPage.byName[apiName];
      if (row && !row.details) toLoad.push(apiName);
      DexPage.observer.unobserve(entry.target);
    });
    if (toLoad.length) loadDexDetails(toLoad, { rerenderEachBatch: true });
  }, { rootMargin: '200px' });

  rows.querySelectorAll('.dex-row[data-api]').forEach(el => {
    const apiName = el.getAttribute('data-api');
    const row = DexPage.byName[apiName];
    if (row && !row.details) DexPage.observer.observe(el);
  });
}

function showPage(page) {
  const dom = dexDom();
  const activeCls = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition bg-amber-950/40 text-amber-400 shadow";
  const idleCls = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition text-slate-400 hover:text-white";

  if (page === 'pokedex') {
    dom.pageCalculator.classList.add('hidden');
    dom.pagePokedex.classList.remove('hidden');
    dom.navPokedex.className = activeCls;
    dom.navCalculator.className = idleCls;
    // The damage-results views (mobile bottom overlay + desktop pinned HUD)
    // belong to the calculator; hide them so they don't float over the Pokédex.
    if (dom.mobileOverlay) dom.mobileOverlay.classList.add('hidden');
    // Bar's base is `hidden lg:block`; use important `!hidden` so removing it
    // later restores the responsive default instead of revealing it on mobile.
    if (dom.desktopResultsBar) dom.desktopResultsBar.classList.add('!hidden');
    openDexPage();
  } else {
    dom.pagePokedex.classList.add('hidden');
    dom.pageCalculator.classList.remove('hidden');
    dom.navCalculator.className = activeCls;
    dom.navPokedex.className = idleCls;
    if (dom.mobileOverlay) dom.mobileOverlay.classList.remove('hidden');
    if (dom.desktopResultsBar) dom.desktopResultsBar.classList.remove('!hidden');
  }
}

// Build + render the dex the first time it's shown (or after a format change).
async function openDexPage() {
  if (DexPage.builtForFormat === STATE.format && DexPage.roster.length > 0) {
    renderDex();
    return;
  }

  // The roster is sourced from the background caches — make sure they're ready.
  // Both caches are needed even for M-A: the legal list seeds base species while
  // the full variety list supplies their Mega and regional forms.
  const { status } = dexDom();
  if (status) status.textContent = 'loading roster…';
  const pending = [];
  if (STATE.format === 'regulation_ma') pending.push(initChampionsLegalList());
  if (!CACHE.pokemonList || CACHE.pokemonList.length === 0) {
    pending.push(initPokemonList().then(setSearchPlaceholders));
  }
  if (pending.length) await Promise.all(pending);

  buildDexRoster();
  renderDex();
  // M-A is bounded — eager-load everything so sort/search work instantly.
  if (STATE.format === 'regulation_ma') {
    loadDexDetails(DexPage.roster.map(r => r.apiName));
  }
}

export function onDexFormatChange() {
  const dom = dexDom();
  if (!dom.pagePokedex) return;
  DexPage.builtForFormat = null; // force rebuild on next open
  if (!dom.pagePokedex.classList.contains('hidden')) {
    openDexPage();
  }
}

export function initDexPage() {
  const dom = dexDom();
  if (!dom.navPokedex) return;

  dom.navPokedex.addEventListener('click', () => showPage('pokedex'));
  dom.navCalculator.addEventListener('click', () => showPage('calculator'));

  let searchTimer = null;
  dom.search.addEventListener('input', (e) => {
    DexPage.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      // Ability search needs every row's details; in the lazy National Dex,
      // load them all the first time the user types a non-empty query.
      if (DexPage.query.trim() && !DexPage.allLoaded) {
        await ensureDexFullyLoaded();
      }
      renderDex();
    }, 180);
  });

  dom.header.querySelectorAll('.dex-sort').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.sortKey;
      if (DexPage.sortKey === key) {
        DexPage.sortDir = DexPage.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        DexPage.sortKey = key;
        DexPage.sortDir = key === 'name' ? 'asc' : 'desc';
      }
      // Stat sorting needs every row's stats loaded.
      if (key !== 'name' && !DexPage.allLoaded) {
        renderDex(); // reflect arrow immediately
        await ensureDexFullyLoaded();
      }
      renderDex();
    });
  });
}
