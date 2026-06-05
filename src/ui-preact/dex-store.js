// Pokédex page store — DOM-free data + loading logic for the Preact DexView,
// lifted almost verbatim from the old vanilla src/ui/dex-page.js. Holds its own
// state (roster, sort, query, load flags) and its own subscribe/notify set
// (separate from the calculator store in store.js) so the concurrency-limited
// loaders trigger a DexView re-render instead of calling a renderDex() that
// touches the DOM. The row-click detail modal stays the shared vanilla one.
import { STATE, CACHE } from '../state.js';
import { isHiddenForm, isFormatLegal } from '../data/dex.js';
import { REGULATIONS } from '../data/regulations.js';
import { fetchPokemonDetails, fetchMoveDetails, formatDisplayName, initPokemonList, initChampionsRoster, legalSetForFormat } from '../api/pokeapi.js';
import { setSearchPlaceholders, getTypeBgClass, escapeHtml } from '../ui/render.js';
import { openDetailModal, closeDetailModal, refreshDetailModalBody } from '../ui/detail-modal.js';
import { spreadKind } from '../data/moves.js';

// Shared, reactive Pokédex state. DexView reads these fields directly and
// re-renders on notifyDex(). Same shape/semantics as the old vanilla DexPage.
export const DexStore = {
  roster: [],          // [{ apiName, name, details|null }]
  byName: {},          // apiName -> row (same object refs as roster)
  sortKey: 'bst',
  sortDir: 'desc',
  query: '',
  builtForFormat: null,
  allLoaded: false,    // every roster row has details loaded
  loading: false,
};

// Own listener set, independent of the calculator store.
const listeners = new Set();
export function subscribeDex(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notifyDex() { listeners.forEach((l) => l()); }

// Callbacks wired by initDexStore (cross-nav to the Attackdex + its move cache).
let _onMoveClick = null;
let _getMoveDetails = null;
// Set by jumpToDexPokemon so openDexPage knows not to clear the query that was
// just placed by a cross-nav jump.
let _preserveQuery = false;

export function initDexStore({ onMoveClick = null, getMoveDetails = null } = {}) {
  _onMoveClick = onMoveClick;
  _getMoveDetails = getMoveDetails;
}

// Build the roster for the current STATE.format from the already-loaded caches.
function buildDexRoster() {
  // Drop non-battle / cosmetic forms from every view (ride modes, Gmax/Totem,
  // cosplay Pikachu, cosmetic duplicates, redundant Minior colors).
  let entries = (CACHE.pokemonList || [])
    .filter(p => !isHiddenForm(p.apiName))
    .map(p => ({ apiName: p.apiName, name: p.name }));
  // Under a regulation, keep only legal varieties — using the same predicate and
  // legal set the calculator's search uses so the two views stay in sync.
  const legal = legalSetForFormat(STATE.format);
  if (legal) {
    entries = entries.filter(p => isFormatLegal(p.apiName, legal));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  DexStore.roster = entries.map(e => ({ apiName: e.apiName, name: e.name, details: null }));
  DexStore.byName = {};
  DexStore.roster.forEach(r => { DexStore.byName[r.apiName] = r; });
  DexStore.builtForFormat = STATE.format;
  DexStore.allLoaded = false;
}

export function dexStatusText() {
  const total = DexStore.roster.length;
  const loaded = DexStore.roster.filter(r => r.details).length;
  if (loaded < total) return `${total} species · loaded ${loaded}/${total}…`;
  return `${total} species`;
}

// Concurrency-limited loader. Resolves once every requested name is fetched.
export async function loadDexDetails(apiNames, { rerenderEachBatch = true } = {}) {
  const queue = apiNames.filter(n => DexStore.byName[n] && !DexStore.byName[n].details);
  if (queue.length === 0) return;
  DexStore.loading = true;

  const CONCURRENCY = 8;
  const RENDER_EVERY = 24; // re-notify periodically, not on every fetch
  let cursor = 0;
  let sinceRender = 0;

  async function worker() {
    while (cursor < queue.length) {
      const apiName = queue[cursor++];
      try {
        const details = await fetchPokemonDetails(apiName);
        const row = DexStore.byName[apiName];
        if (row) row.details = details;
      } catch (err) {
        console.error(`Pokédex: failed to load ${apiName}`, err);
      }
      if (rerenderEachBatch && ++sinceRender >= RENDER_EVERY) {
        sinceRender = 0;
        notifyDex();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  DexStore.loading = false;
  DexStore.allLoaded = DexStore.roster.every(r => r.details);
  notifyDex();
}

// Ensure every roster row has details (used before stat-sort / ability-search in
// the National Dex where rows are otherwise lazy-loaded).
export async function ensureDexFullyLoaded() {
  if (DexStore.allLoaded || DexStore.loading) return;
  await loadDexDetails(DexStore.roster.map(r => r.apiName));
}

// Toggle/select the sort column. Stat sorts need every row loaded; kick off a
// full load (notifying as it streams in) when sorting by a stat in lazy mode.
export async function setDexSort(key) {
  if (DexStore.sortKey === key) {
    DexStore.sortDir = DexStore.sortDir === 'desc' ? 'asc' : 'desc';
  } else {
    DexStore.sortKey = key;
    DexStore.sortDir = key === 'name' ? 'asc' : 'desc';
  }
  notifyDex(); // reflect arrow immediately
  if (key !== 'name' && !DexStore.allLoaded) {
    await ensureDexFullyLoaded();
  }
}

// Update the search query. Ability search needs every row's details; in the lazy
// National Dex, load them all the first time the user types a non-empty query.
export async function setDexQuery(query) {
  DexStore.query = query;
  notifyDex();
  if (query.trim() && !DexStore.allLoaded) {
    await ensureDexFullyLoaded();
  }
}

export function clearDexQuery() {
  DexStore.query = '';
  notifyDex();
}

// Build + render the dex the first time it's shown (or after a format change).
export async function openDexPage() {
  if (!_preserveQuery) {
    DexStore.query = '';
  }
  _preserveQuery = false;

  if (DexStore.builtForFormat === STATE.format && DexStore.roster.length > 0) {
    notifyDex();
    return;
  }

  // The roster is sourced from the background caches — make sure they're ready.
  // Both caches are needed under a regulation: the Champions roster seeds base
  // species while the full variety list supplies their Mega and regional forms.
  notifyDex(); // show "loading roster…" via dexStatusText / loading flag
  DexStore.loading = true;
  const pending = [];
  if (REGULATIONS[STATE.format]) pending.push(initChampionsRoster());
  if (!CACHE.pokemonList || CACHE.pokemonList.length === 0) {
    pending.push(initPokemonList().then(setSearchPlaceholders));
  }
  if (pending.length) await Promise.all(pending);

  buildDexRoster();
  DexStore.loading = false;
  notifyDex();
  // A regulation roster is bounded — eager-load everything so sort/search work
  // instantly. The National Dex also eager-loads in 2a (lazy observer is 2b).
  loadDexDetails(DexStore.roster.map(r => r.apiName));
}

// Look up already-loaded Pokémon details by apiName (used by attackdex-page via
// app.js to enrich the "who learns" list without a circular import).
export function getPokemonDetails(apiName) {
  return DexStore.byName[apiName]?.details ?? null;
}

// Narrow the Pokédex to a single Pokémon by name (called when jumping from the
// Attackdex "learned by" modal). Sets the query + re-renders.
export function jumpToDexPokemon(apiName) {
  const displayName = DexStore.byName[apiName]?.name || formatDisplayName(apiName);
  _preserveQuery = true;
  DexStore.query = displayName;
  // Only notify if roster is built; otherwise openDexPage (triggered by
  // showPage) will render with the query already set.
  if (DexStore.roster.length > 0) notifyDex();
}

export function onDexFormatChange() {
  const pageEl = document.getElementById('page-pokedex');
  if (!pageEl) return;
  DexStore.builtForFormat = null; // force rebuild on next open
  if (!pageEl.classList.contains('hidden')) {
    openDexPage();
  }
}

// --- Row-click detail modal (reuses the shared vanilla detail-modal.js) ---

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

export async function handleDexRowClick(apiName) {
  const row = DexStore.byName[apiName];
  if (!row) return;

  if (!row.details) {
    openDetailModal({ title: row.name, subtitle: 'Loading…', items: [] });
    try {
      const details = await fetchPokemonDetails(apiName);
      row.details = details;
      notifyDex();
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
