// Attackdex page store — DOM-free move-roster + loading logic for the Preact
// AttackdexView, lifted from the old vanilla src/ui/attackdex-page.js. Mirrors
// dex-store.js (own subscribe/notify set so loaders re-render the view) but adds
// the move-specific filter controls (type / category / spread). Row click opens
// the shared vanilla detail modal (converted to Preact in 3b).
import { STATE, CACHE } from '../state.js';
import { sortMoves, filterMoves, spreadKind } from '../data/moves.js';
import { fetchMoveDetails, fetchPokemonDetails, initAllMovesList, formatDisplayName, legalSetForFormat } from '../api/pokeapi.js';
import { isHiddenForm, isFormatLegal } from '../data/dex.js';
import { REGULATIONS } from '../data/regulations.js';
import { getTypeBgClass } from '../ui/render.js';
import { openDetailModal, closeDetailModal, refreshDetailModalBody } from './DetailModal.js';
import { html } from './preact.js';
import { createEmitter } from './reactive.js';
import { runPool } from './load-pool.js';

// Shared, reactive Attackdex state. AttackdexView reads these directly and
// re-renders on notifyAdx(). Same shape/semantics as the old vanilla AttackdexPage.
export const AdxStore = {
  roster: [],          // [{ apiName, name, details|null }]
  byName: {},          // apiName -> row (same object refs as roster)
  sortKey: 'name',     // 'name' | 'power' | 'pp'
  sortDir: 'asc',
  query: '',
  filterType: '',      // '' = all, else a type display name (e.g. 'Fire')
  filterCategory: '',  // '' = all, else 'physical' | 'special' | 'status'
  filterSpread: false, // true = only multi-target (spread) moves
  built: false,
  allLoaded: false,    // every roster row has details loaded
  loading: false,
};

// Own emitter, independent of the calculator + dex stores.
const { subscribe: subscribeAdx, notify: notifyAdx } = createEmitter();
export { subscribeAdx, notifyAdx };

// Callbacks wired by initAttackdexStore (cross-nav to the Pokédex + its details).
let _onPokemonClick = null;
let _getPokemonDetails = null;
// Set by jumpToAttackdexMove so openAttackdexPage knows not to clear the query
// that was just placed by a cross-nav jump.
let _preserveQuery = false;

export function initAttackdexStore({ onPokemonClick = null, getPokemonDetails = null } = {}) {
  _onPokemonClick = onPokemonClick;
  _getPokemonDetails = getPokemonDetails;
}

// Build the roster once from the loaded move-name cache.
function buildMovesRoster() {
  const entries = (CACHE.allMoves || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  AdxStore.roster = entries.map(e => ({ apiName: e.apiName, name: e.name, details: null }));
  AdxStore.byName = {};
  AdxStore.roster.forEach(r => { AdxStore.byName[r.apiName] = r; });
  AdxStore.built = true;
  AdxStore.allLoaded = false;
}

export function attackdexStatusText() {
  const total = AdxStore.roster.length;
  const loaded = AdxStore.roster.filter(r => r.details).length;
  if (loaded < total) return `${total} moves · loaded ${loaded}/${total}…`;
  return `${total} moves`;
}

// Concurrency-limited loader. Resolves once every requested name is fetched.
export async function loadMoveDetails(apiNames, { rerenderEachBatch = true } = {}) {
  const queue = apiNames.filter(n => AdxStore.byName[n] && !AdxStore.byName[n].details);
  if (queue.length === 0) return;
  AdxStore.loading = true;

  await runPool(queue, async (apiName) => {
    try {
      const details = await fetchMoveDetails(apiName);
      const row = AdxStore.byName[apiName];
      if (row) row.details = details;
    } catch (err) {
      console.error(`Attackdex: failed to load ${apiName}`, err);
    }
  }, { batchEvery: rerenderEachBatch ? 24 : 0, onProgress: notifyAdx });

  AdxStore.loading = false;
  AdxStore.allLoaded = AdxStore.roster.every(r => r.details);
  notifyAdx();
}

// Ensure every roster row has details. Needed before any search/filter/sort that
// reads a move attribute (type, category, power, PP, description), since rows are
// otherwise lazy-loaded as they scroll into view. Crucially this must not bail
// when a partial (lazy) load is mid-flight — it waits that out, then loads
// whatever's still missing — otherwise a filter fired while the observer is busy
// would leave most rows permanently unloaded.
async function ensureAllLoaded() {
  if (AdxStore.allLoaded) return;
  while (AdxStore.loading) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (AdxStore.allLoaded) return;
  }
  await loadMoveDetails(AdxStore.roster.map(r => r.apiName));
}

// True when the current view depends on loaded move details (anything other than
// the default name-only browse).
function needsFullLoad() {
  return !!(AdxStore.query.trim()
    || AdxStore.filterType
    || AdxStore.filterCategory
    || AdxStore.filterSpread
    || AdxStore.sortKey !== 'name');
}

// --- Mutators (notify, and force-load details when the new view needs them) ---

export async function setAdxSort(key) {
  if (AdxStore.sortKey === key) {
    AdxStore.sortDir = AdxStore.sortDir === 'desc' ? 'asc' : 'desc';
  } else {
    AdxStore.sortKey = key;
    AdxStore.sortDir = key === 'name' ? 'asc' : 'desc';
  }
  notifyAdx(); // reflect arrow immediately
  if (key !== 'name' && !AdxStore.allLoaded) {
    await ensureAllLoaded();
  }
}

export async function setAdxQuery(query) {
  AdxStore.query = query;
  notifyAdx();
  // Description search needs every row's details; load them on first query.
  if (query.trim() && !AdxStore.allLoaded) {
    await ensureAllLoaded();
  }
}

export function clearAdxQuery() {
  AdxStore.query = '';
  notifyAdx();
}

// Filters read attributes the lazy browse hasn't fetched yet — full-load first.
async function applyFilterChange() {
  notifyAdx(); // reflect control state immediately
  if (needsFullLoad() && !AdxStore.allLoaded) {
    await ensureAllLoaded();
  }
  notifyAdx();
}

export function setAdxType(type) { AdxStore.filterType = type; return applyFilterChange(); }
export function setAdxCategory(cat) { AdxStore.filterCategory = cat; return applyFilterChange(); }
export function toggleAdxSpread() { AdxStore.filterSpread = !AdxStore.filterSpread; return applyFilterChange(); }

// Build + render the Attackdex the first time it's shown.
export async function openAttackdexPage() {
  if (!_preserveQuery) {
    AdxStore.query = '';
  }
  _preserveQuery = false;

  if (AdxStore.built && AdxStore.roster.length > 0) {
    notifyAdx();
    return;
  }

  AdxStore.loading = true;
  notifyAdx(); // show "loading moves…"
  try {
    if (!CACHE.allMoves || CACHE.allMoves.length === 0) {
      await initAllMovesList();
    }
    buildMovesRoster();
  } catch (err) {
    // Leave AdxStore.built unset so reopening retries; clear the flag in finally
    // so the page isn't wedged on "loading moves…" after a network failure.
    console.error('Attackdex: failed to load move roster', err);
    return;
  } finally {
    AdxStore.loading = false;
    notifyAdx();
  }
}

// Look up already-loaded move details by apiName (used by dex-store via app.js).
export function getMoveDetails(apiName) {
  return AdxStore.byName[apiName]?.details ?? null;
}

// Narrow the Attackdex to a single move by name (called when jumping from the
// Pokédex learnset modal). Sets the query + re-renders.
export function jumpToAttackdexMove(apiName) {
  const displayName = AdxStore.byName[apiName]?.name || formatDisplayName(apiName);
  _preserveQuery = true;
  AdxStore.query = displayName;
  // Only notify if already built; otherwise openAttackdexPage (triggered by
  // showPage) will render with the query already set.
  if (AdxStore.built) notifyAdx();
}

// --- Row-click detail modal (reuses the shared vanilla detail-modal.js) ---

const LEARNER_CAP = 150;

function buildPokemonItem(n, pd, onClick) {
  const name = formatDisplayName(n);
  if (!pd) {
    return {
      node: html`<div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div><span class="font-bold text-slate-500 flex-1 truncate">${name}</span>`,
      onClick
    };
  }
  return {
    node: html`
      <img src=${pd.sprite || ''} alt="" loading="lazy" class="w-8 h-8 object-contain shrink-0" />
      <span class="font-bold text-slate-100 flex-1 truncate min-w-0">${name}</span>
      <div class="flex gap-1 shrink-0">
        ${pd.types.map((t) => html`<span class=${`text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white`}>${t}</span>`)}
      </div>`,
    onClick
  };
}

export async function handleAttackdexRowClick(apiName) {
  const row = AdxStore.byName[apiName];
  if (!row) return;

  if (!row.details) {
    openDetailModal({ title: row.name, subtitle: 'Loading…', items: [] });
    try {
      const details = await fetchMoveDetails(apiName);
      row.details = details;
      notifyAdx();
    } catch (err) {
      console.error(`Attackdex detail modal: failed to load ${apiName}`, err);
      return;
    }
  }

  const details = row.details;
  let learners = (details.learnedBy || []).filter(n => !isHiddenForm(n));
  const legal = legalSetForFormat(STATE.format);
  if (legal) {
    learners = learners.filter(n => isFormatLegal(n, legal));
  }
  learners.sort((a, b) => a.localeCompare(b));

  const capped = learners.length > LEARNER_CAP;
  const visible = capped ? learners.slice(0, LEARNER_CAP) : learners;
  const formatLabel = REGULATIONS[STATE.format]?.label ?? 'National Dex';

  const localCache = new Map();
  const getDetails = (n) => localCache.get(n) || (_getPokemonDetails && _getPokemonDetails(n));
  const makeOnClick = (n) => () => { closeDetailModal(); if (_onPokemonClick) _onPokemonClick(n); };

  const buildItems = () => {
    const items = visible.map(n => buildPokemonItem(n, getDetails(n), makeOnClick(n)));
    if (capped) {
      items.push({ label: `…and ${learners.length - LEARNER_CAP} more — switch to Regulation M-A to narrow the list`, onClick: null });
    }
    return items;
  };

  const session = openDetailModal({
    title: `Who learns ${details.name}`,
    subtitle: `${learners.length} Pokémon · ${formatLabel}`,
    items: buildItems()
  });

  // Fetch details for Pokémon not yet in any cache.
  const toFetch = visible.filter(n => !getDetails(n));
  if (toFetch.length === 0) return;

  await runPool(toFetch, async (n) => {
    try {
      const pd = await fetchPokemonDetails(n);
      localCache.set(n, pd);
    } catch (err) {
      console.error(`Failed to load Pokémon ${n}`, err);
    }
  }, { batchEvery: 8, onProgress: () => refreshDetailModalBody(buildItems(), session) });
  refreshDetailModalBody(buildItems(), session);
}
