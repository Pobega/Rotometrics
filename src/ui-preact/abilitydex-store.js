// Abilitydex page store — DOM-free ability-roster + loading logic for the Preact
// AbilitydexView. Mirrors attackdex-store.js (own subscribe/notify set so loaders
// re-render the view) but for abilities: the only filter controls are free-text
// search and a "VGC only" toggle. Row click opens the shared detail modal
// ("Pokémon with …"), reusing the same cross-nav-to-Pokédex flow as the Attackdex.
import { STATE, CACHE } from '../state.js';
import {
  fetchAbilityDetails,
  fetchPokemonDetails,
  initAllAbilitiesList,
  formatDisplayName,
  legalSetForFormat,
} from '../api/pokeapi.js';
import { isHiddenForm, isFormatLegal } from '../data/dex.js';
import { REGULATIONS } from '../data/regulations.js';
import { getTypeBgClass } from '../ui/render.js';
import { openDetailModal, closeDetailModal, refreshDetailModalBody } from './DetailModal.js';
import { html } from './preact.js';
import { createEmitter } from './reactive.js';
import { makeChipFilter } from './chip-filter.js';
import { makeSuggester } from './suggestions.js';
import { runPool } from './load-pool.js';

// Shared, reactive Abilitydex state. AbilitydexView reads these directly and
// re-renders on notifyAbd().
export const AbdStore = {
  roster: [], // [{ apiName, name, details|null }]
  byName: {}, // apiName -> row (same object refs as roster)
  filters: [], // committed search terms (the chips); ANDed together
  draft: '', // uncommitted input text (live-previewed before Enter)
  built: false,
  allLoaded: false, // every roster row has details loaded
  loading: false,
};

// Own emitter, independent of the calculator + other dex stores.
const { subscribe: subscribeAbd, notify: notifyAbd } = createEmitter();
export { subscribeAbd, notifyAbd };

// Callbacks wired by initAbilitydexStore (cross-nav to the Pokédex + its details).
let _onPokemonClick = null;
let _getPokemonDetails = null;
// Set by jumpToAbilitydexAbility so openAbilitydexPage knows not to clear the
// query that was just placed by a cross-nav jump.
let _preserveQuery = false;

export function initAbilitydexStore({ onPokemonClick = null, getPokemonDetails = null } = {}) {
  _onPokemonClick = onPokemonClick;
  _getPokemonDetails = getPokemonDetails;
}

// Build the roster once from the loaded ability-name cache.
function buildAbilitiesRoster() {
  const entries = (CACHE.allAbilities || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  AbdStore.roster = entries.map((e) => ({ apiName: e.apiName, name: e.name, details: null }));
  AbdStore.byName = {};
  AbdStore.roster.forEach((r) => {
    AbdStore.byName[r.apiName] = r;
  });
  AbdStore.built = true;
  AbdStore.allLoaded = false;
}

export function abilitydexStatusText() {
  const total = AbdStore.roster.length;
  const loaded = AbdStore.roster.filter((r) => r.details).length;
  if (loaded < total) return `${total} abilities · loaded ${loaded}/${total}…`;
  return `${total} abilities`;
}

// Concurrency-limited loader. Resolves once every requested name is fetched.
export async function loadAbilityDetails(apiNames, { rerenderEachBatch = true } = {}) {
  const queue = apiNames.filter((n) => AbdStore.byName[n] && !AbdStore.byName[n].details);
  if (queue.length === 0) return;
  AbdStore.loading = true;

  await runPool(
    queue,
    async (apiName) => {
      try {
        const details = await fetchAbilityDetails(apiName);
        const row = AbdStore.byName[apiName];
        if (row) row.details = details;
      } catch (err) {
        console.error(`Abilitydex: failed to load ${apiName}`, err);
      }
    },
    { batchEvery: rerenderEachBatch ? 24 : 0, onProgress: notifyAbd }
  );

  AbdStore.loading = false;
  AbdStore.allLoaded = AbdStore.roster.every((r) => r.details);
  notifyAbd();
}

// Ensure every roster row has details. Needed before any search/filter that reads
// an ability's effect text, since rows are otherwise lazy-loaded as they scroll
// into view. Must not bail when a partial (lazy) load is mid-flight — it waits
// that out, then loads whatever's still missing.
async function ensureAllLoaded() {
  if (AbdStore.allLoaded) return;
  while (AbdStore.loading) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (AbdStore.allLoaded) return;
  }
  await loadAbilityDetails(AbdStore.roster.map((r) => r.apiName));
}

// --- Mutators (chip-filter state via the shared factory) ---

// Chip-filter state (committed chips + live draft) uses the shared factory so the
// Abilitydex behaves identically to the Pokédex / Attackdex. The onActivate hook
// force-loads every ability's details the first time a term becomes active, since
// effect-text and holder search read them — and even a VGC-keyword chip benefits,
// filling the desc column for the narrowed list (it's a no-op once loaded).
const abdChip = makeChipFilter(AbdStore, notifyAbd, { onActivate: ensureAllLoaded });
export const setAbdDraft = abdChip.setDraft;
export const commitAbdFilter = abdChip.commit;
export const commitAbdValue = abdChip.commitValue;
export const removeAbdFilter = abdChip.remove;
export const clearAbdFilters = abdChip.clear;
// Backs the Offensive / Defensive preset buttons: each toggles its keyword chip.
export const toggleAbdTag = abdChip.toggle;

// Autocomplete: an ability is filtered by its own name or a holder Pokémon, so
// suggest from those two kinds. No move kind (abilities can't be filtered by a
// move) and no type kind (abilities are typeless).
export const abdSuggest = makeSuggester(['ability', 'pokemon'], { onReady: notifyAbd });

// Build + render the Abilitydex the first time it's shown.
export async function openAbilitydexPage() {
  if (!_preserveQuery) {
    AbdStore.filters = [];
    AbdStore.draft = '';
  }
  _preserveQuery = false;

  if (AbdStore.built && AbdStore.roster.length > 0) {
    notifyAbd();
    return;
  }

  AbdStore.loading = true;
  notifyAbd(); // show "loading abilities…"
  try {
    if (!CACHE.allAbilities || CACHE.allAbilities.length === 0) {
      await initAllAbilitiesList();
    }
    buildAbilitiesRoster();
  } catch (err) {
    console.error('Abilitydex: failed to load ability roster', err);
    return;
  } finally {
    AbdStore.loading = false;
    notifyAbd();
  }
}

// Narrow the Abilitydex to a single ability by name (called when jumping from
// elsewhere). Sets the filter chip + re-renders.
export function jumpToAbilitydexAbility(apiName) {
  const displayName = AbdStore.byName[apiName]?.name || formatDisplayName(apiName);
  _preserveQuery = true;
  AbdStore.filters = [displayName];
  AbdStore.draft = '';
  if (AbdStore.built) notifyAbd();
}

// --- Row-click detail modal (reuses the shared Preact detail modal) ---

const HOLDER_CAP = 150;

function buildPokemonItem(n, pd, onClick) {
  const name = formatDisplayName(n);
  if (!pd) {
    return {
      node: html`<div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div><span class="font-bold text-slate-500 flex-1 truncate">${name}</span>`,
      onClick,
    };
  }
  return {
    node: html`
      <img src=${pd.sprite || ''} alt="" loading="lazy" class="w-8 h-8 object-contain shrink-0" />
      <span class="font-bold text-slate-100 flex-1 truncate min-w-0">${name}</span>
      <div class="flex gap-1 shrink-0">
        ${pd.types.map((t) => html`<span class=${`text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white`}>${t}</span>`)}
      </div>`,
    onClick,
  };
}

export async function handleAbilitydexRowClick(apiName) {
  const row = AbdStore.byName[apiName];
  if (!row) return;

  if (!row.details) {
    openDetailModal({ title: row.name, subtitle: 'Loading…', items: [] });
    try {
      const details = await fetchAbilityDetails(apiName);
      row.details = details;
      notifyAbd();
    } catch (err) {
      console.error(`Abilitydex detail modal: failed to load ${apiName}`, err);
      return;
    }
  }

  const details = row.details;
  let holders = (details.pokemon || []).filter((n) => !isHiddenForm(n));
  const legal = legalSetForFormat(STATE.format);
  if (legal) {
    holders = holders.filter((n) => isFormatLegal(n, legal));
  }
  holders.sort((a, b) => a.localeCompare(b));

  const capped = holders.length > HOLDER_CAP;
  const visible = capped ? holders.slice(0, HOLDER_CAP) : holders;
  const formatLabel = REGULATIONS[STATE.format]?.label ?? 'National Dex';

  const localCache = new Map();
  const getDetails = (n) => localCache.get(n) || (_getPokemonDetails && _getPokemonDetails(n));
  const makeOnClick = (n) => () => {
    closeDetailModal();
    if (_onPokemonClick) _onPokemonClick(n);
  };

  const buildItems = () => {
    const items = visible.map((n) => buildPokemonItem(n, getDetails(n), makeOnClick(n)));
    if (capped) {
      items.push({
        label: `…and ${holders.length - HOLDER_CAP} more — switch to Regulation M-A to narrow the list`,
        onClick: null,
      });
    }
    return items;
  };

  const session = openDetailModal({
    title: `Pokémon with ${details.name}`,
    subtitle: `${holders.length} Pokémon · ${formatLabel}`,
    items: buildItems(),
  });

  // Fetch details for Pokémon not yet in any cache.
  const toFetch = visible.filter((n) => !getDetails(n));
  if (toFetch.length === 0) return;

  await runPool(
    toFetch,
    async (n) => {
      try {
        const pd = await fetchPokemonDetails(n);
        localCache.set(n, pd);
      } catch (err) {
        console.error(`Failed to load Pokémon ${n}`, err);
      }
    },
    { batchEvery: 8, onProgress: () => refreshDetailModalBody(buildItems(), session) }
  );
  refreshDetailModalBody(buildItems(), session);
}
