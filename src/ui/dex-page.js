// Pokédex stats-browser page: a self-contained second view (toggled via the
// nav) that lists every legal species with types, abilities, and base stats,
// with lazy-loading, client-side sort, and search. Holds its own DexPage state
// and queries its own DOM nodes (dexDom), so it stays decoupled from the
// calculator controller in app.js.
import { STATE, CACHE } from '../state.js';
import { bst, sortDex, filterDex, isHiddenForm, isRegulationMALegal } from '../data/dex.js';
import { fetchPokemonDetails, fetchMoveDetails, formatDisplayName, initPokemonList, initChampionsLegalList } from '../api/pokeapi.js';
import { getTypeBgClass, setSearchPlaceholders, escapeHtml } from './render.js';
import { spreadKind } from '../data/moves.js';
import { registerPage } from './page-nav.js';
import { openDetailModal, closeDetailModal, refreshDetailModalBody } from './detail-modal.js';

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
    pagePokedex: document.getElementById('page-pokedex'),
    navPokedex: document.getElementById('nav-pokedex'),
    search: document.getElementById('dex-search'),
    searchClear: document.getElementById('dex-search-clear'),
    rows: document.getElementById('dex-rows'),
    status: document.getElementById('dex-status'),
    header: document.getElementById('dex-header'),
    regBadge: document.getElementById('dex-regulation-badge')
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

function updateDexClearBtn() {
  const { search, searchClear } = dexDom();
  if (searchClear) searchClear.classList.toggle('hidden', !search.value);
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
  const apiName = escapeHtml(row.apiName);
  const name = escapeHtml(row.name);
  if (!d) {
    // Lazy placeholder; carries data-api so the observer knows what to fetch.
    return `<div class="dex-row grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs" data-api="${apiName}">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div>
        <span class="font-bold text-slate-300 truncate">${name}</span>
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

  const types = d.types.map(t => {
    const type = escapeHtml(t);
    return `<span class="text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white" title="${type}">${escapeHtml(TYPE_SHORT[t] || t)}</span>`;
  }).join(' ');
  const abilities = escapeHtml(d.abilities.map(a => a.name).join(', '));
  const s = d.baseStats;
  const total = bst(s);
  const cell = (v) => `<span class="text-right font-mono text-slate-300">${v}</span>`;

  return `<div class="dex-row grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs hover:bg-slate-800/40 transition cursor-pointer" data-api="${apiName}">
    <div class="flex items-center gap-2 min-w-0">
      <img src="${escapeHtml(d.sprite || '')}" alt="" loading="lazy" class="w-8 h-8 object-contain shrink-0">
      <span class="font-bold text-slate-100 truncate">${name}</span>
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

// Build + render the dex the first time it's shown (or after a format change).
async function openDexPage() {
  if (!_preserveQuery) {
    DexPage.query = '';
    const dom = dexDom();
    if (dom.search) dom.search.value = '';
  }
  _preserveQuery = false;
  updateDexClearBtn();

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

// Look up already-loaded Pokémon details by apiName (used by attackdex-page via
// app.js to enrich the "who learns" list without a circular import).
export function getPokemonDetails(apiName) {
  return DexPage.byName[apiName]?.details ?? null;
}

// Narrow the Pokédex to a single Pokémon by name (called when jumping from the
// Attackdex "learned by" modal). Sets the search field + re-renders.
export function jumpToDexPokemon(apiName) {
  const dom = dexDom();
  const displayName = DexPage.byName[apiName]?.name || formatDisplayName(apiName);
  _preserveQuery = true;
  DexPage.query = displayName;
  if (dom.search) dom.search.value = displayName;
  updateDexClearBtn();
  // Only render if roster is built; otherwise openDexPage (triggered by
  // showPage) will render with the query already set.
  if (DexPage.roster.length > 0) renderDex();
}

// Module-level holders for callbacks wired in initDexPage.
let _onMoveClick = null;
let _getMoveDetails = null;
// Set by jumpToDexPokemon so openDexPage knows not to clear the query that
// was just placed by a cross-nav jump.
let _preserveQuery = false;

const MOVE_CAT_CLS = {
  physical: 'bg-red-950/50 text-red-400 border border-red-900/40',
  special:  'bg-blue-950/50 text-blue-400 border border-blue-900/40',
  status:   'bg-slate-800/60 text-slate-400 border border-slate-700/40'
};

function buildMoveItem(move, md, onClick) {
  const name = escapeHtml(move.name);
  if (!md) {
    return { html: `<span class="font-bold text-slate-500 flex-1 truncate animate-pulse">${name}</span>`, onClick };
  }
  const type = escapeHtml(md.type);
  const typeBadge = `<div class="w-14 shrink-0"><span class="text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(md.type)} text-white">${type}</span></div>`;
  const catCls = MOVE_CAT_CLS[md.category] || MOVE_CAT_CLS.status;
  const catLabel = md.category ? md.category.charAt(0).toUpperCase() + md.category.slice(1) : '—';
  const catBadge = `<div class="w-16 shrink-0"><span class="text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${catCls}">${catLabel}</span></div>`;
  const power = md.power
    ? `<span class="font-mono text-amber-400 w-7 text-right shrink-0 text-[11px]">${md.power}</span>`
    : `<span class="font-mono text-slate-600 w-7 text-right shrink-0 text-[11px]">—</span>`;
  const kind = spreadKind(md);
  const spreadBadge = kind === 'ally'
    ? `<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-rose-950/50 text-rose-400 border border-rose-900/40" title="Also hits your ally">Spread+Ally</span>`
    : kind === 'opponents'
      ? `<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-amber-950/50 text-amber-400 border border-amber-900/40" title="Hits both opponents">Spread</span>`
      : '';
  return { html: `<span class="font-bold text-slate-100 flex-1 flex items-center gap-1.5 min-w-0"><span class="truncate">${name}</span>${spreadBadge}</span>${typeBadge}${catBadge}${power}`, onClick };
}

async function handleDexRowClick(apiName) {
  const row = DexPage.byName[apiName];
  if (!row) return;

  if (!row.details) {
    openDetailModal({ title: row.name, subtitle: 'Loading…', items: [] });
    try {
      const details = await fetchPokemonDetails(apiName);
      row.details = details;
      renderDex();
    } catch (err) {
      console.error(`Pokédex detail modal: failed to load ${apiName}`, err);
      return;
    }
  }

  const details = row.details;
  const seen = new Set();
  const moves = details.moves.filter(m => {
    if (seen.has(m.apiName)) return false;
    seen.add(m.apiName);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Local cache for details fetched during this modal session.
  const localCache = new Map();
  const getDetails = (m) => localCache.get(m.apiName) || (_getMoveDetails && _getMoveDetails(m.apiName));
  const makeOnClick = (m) => () => { closeDetailModal(); if (_onMoveClick) _onMoveClick(m.apiName); };
  const buildItems = () => moves.map(m => buildMoveItem(m, getDetails(m), makeOnClick(m)));

  openDetailModal({
    title: `${details.name}'s Moves`,
    subtitle: `${moves.length} moves`,
    items: buildItems()
  });

  // Fetch details for moves not yet cached anywhere.
  const toFetch = moves.filter(m => !getDetails(m));
  if (toFetch.length === 0) return;

  const CONCURRENCY = 8;
  let cursor = 0;
  let sinceRefresh = 0;

  async function worker() {
    while (cursor < toFetch.length) {
      const move = toFetch[cursor++];
      try {
        const md = await fetchMoveDetails(move.apiName);
        localCache.set(move.apiName, md);
        if (++sinceRefresh >= CONCURRENCY) {
          sinceRefresh = 0;
          refreshDetailModalBody(buildItems());
        }
      } catch (err) {
        console.error(`Failed to load move ${move.apiName}`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  refreshDetailModalBody(buildItems());
}

export function onDexFormatChange() {
  const dom = dexDom();
  if (!dom.pagePokedex) return;
  DexPage.builtForFormat = null; // force rebuild on next open
  if (!dom.pagePokedex.classList.contains('hidden')) {
    openDexPage();
  }
}

export function initDexPage({ onMoveClick = null, getMoveDetails = null } = {}) {
  _onMoveClick = onMoveClick;
  _getMoveDetails = getMoveDetails;
  const dom = dexDom();
  if (!dom.navPokedex) return;

  registerPage('pokedex', {
    navBtn: dom.navPokedex,
    pageEl: dom.pagePokedex,
    onShow: openDexPage
  });

  dom.rows.addEventListener('click', e => {
    const row = e.target.closest('.dex-row[data-api]');
    if (!row) return;
    handleDexRowClick(row.getAttribute('data-api'));
  });

  if (dom.searchClear) {
    dom.searchClear.addEventListener('click', () => {
      dom.search.value = '';
      DexPage.query = '';
      updateDexClearBtn();
      renderDex();
      dom.search.focus();
    });
  }

  let searchTimer = null;
  dom.search.addEventListener('input', (e) => {
    DexPage.query = e.target.value;
    updateDexClearBtn();
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
