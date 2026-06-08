// Pokédex page store — DOM-free data + loading logic for the Preact DexView,
// lifted almost verbatim from the old vanilla src/ui/dex-page.js. Holds its own
// state (roster, sort, query, load flags) and its own subscribe/notify set
// (separate from the calculator store in store.js) so the concurrency-limited
// loaders trigger a DexView re-render instead of calling a renderDex() that
// touches the DOM. The row-click detail modal is the shared Preact DetailModal.
import { STATE, CACHE } from '../state.js';
import { isHiddenForm, isFormatLegal } from '../data/dex.js';
import { REGULATIONS } from '../data/regulations.js';
import { fetchPokemonDetails, fetchMoveDetails, formatDisplayName, initPokemonList, initChampionsRoster, legalSetForFormat } from '../api/pokeapi.js';
import { getTypeBgClass, getCategoryBadge, TYPE_SHORT } from '../ui/render.js';
import { getTypeEffectiveness } from '../engine/stats.js';
import { openDetailModal, closeDetailModal, refreshDetailModalBody } from './DetailModal.js';
import { spreadKind } from '../data/moves.js';
import { html } from './preact.js';
import { createEmitter } from './reactive.js';
import { runPool } from './load-pool.js';

// Shared, reactive Pokédex state. DexView reads these fields directly and
// re-renders on notifyDex(). Same shape/semantics as the old vanilla DexPage.
export const DexStore = {
  roster: [],          // [{ apiName, name, details|null }]
  byName: {},          // apiName -> row (same object refs as roster)
  sortKey: 'bst',
  sortDir: 'desc',
  filters: [],         // committed search terms (the chips); ANDed together
  draft: '',           // uncommitted input text (live-previewed before Enter)
  pinned: [],          // apiNames pinned to the top, in pin order; shown regardless of filter
  builtForFormat: null,
  allLoaded: false,    // every roster row has details loaded
  loading: false,
};

// Own emitter, independent of the calculator store.
const { subscribe: subscribeDex, notify: notifyDex } = createEmitter();
export { subscribeDex, notifyDex };

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
  // Pins are per-roster: a pinned species may not be legal in the new format, so
  // drop any pin that isn't in the freshly built roster.
  DexStore.pinned = DexStore.pinned.filter(n => DexStore.byName[n]);
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

  await runPool(queue, async (apiName) => {
    try {
      const details = await fetchPokemonDetails(apiName);
      const row = DexStore.byName[apiName];
      if (row) row.details = details;
    } catch (err) {
      console.error(`Pokédex: failed to load ${apiName}`, err);
    }
  }, { batchEvery: rerenderEachBatch ? 24 : 0, onProgress: notifyDex });

  DexStore.loading = false;
  DexStore.allLoaded = DexStore.roster.every(r => r.details);
  notifyDex();
}

// Ensure every roster row has details (used before stat-sort / ability-search in
// the National Dex where rows are otherwise lazy-loaded).
export async function ensureDexFullyLoaded() {
  if (DexStore.allLoaded) return;
  // A lazy batch may be in flight (only the rows scrolled into view). Wait it
  // out rather than bailing, or a sort/search fired mid-load would silently run
  // over a partially-loaded roster. (Mirrors attackdex-store's ensureAllLoaded.)
  while (DexStore.loading) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (DexStore.allLoaded) return;
  }
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

// True when any search term is active (a committed chip or the live draft), so
// the view depends on every row's loaded details (type/ability/move search).
function hasActiveTerm() {
  return DexStore.filters.length > 0 || DexStore.draft.trim() !== '';
}

// Update the live (uncommitted) draft text. Type/ability/move search needs every
// row's details; in the lazy National Dex, load them all the first time a term
// becomes active.
export async function setDexDraft(text) {
  DexStore.draft = text;
  notifyDex();
  if (hasActiveTerm() && !DexStore.allLoaded) {
    await ensureDexFullyLoaded();
  }
}

// Lock the current draft in as a chip (on Enter). Skips blanks and duplicates.
export async function commitDexFilter() {
  const term = DexStore.draft.trim();
  DexStore.draft = '';
  if (term && !DexStore.filters.some((f) => f.toLowerCase() === term.toLowerCase())) {
    DexStore.filters = [...DexStore.filters, term];
  }
  notifyDex();
  if (hasActiveTerm() && !DexStore.allLoaded) {
    await ensureDexFullyLoaded();
  }
}

export function removeDexFilter(index) {
  DexStore.filters = DexStore.filters.filter((_, i) => i !== index);
  notifyDex();
}

export function clearDexFilters() {
  DexStore.filters = [];
  DexStore.draft = '';
  notifyDex();
}

// Pin / unpin a species. Pinned rows are hoisted to the top of the table and
// stay visible regardless of the active search, so the user can stack up a few
// Pokémon (search one, pin it, search the next) and compare their stats. In the
// lazy National Dex a just-pinned row may not have its details yet — load them
// so the pinned row shows real stats instead of a placeholder.
export function toggleDexPin(apiName) {
  if (DexStore.pinned.includes(apiName)) {
    DexStore.pinned = DexStore.pinned.filter(n => n !== apiName);
  } else {
    DexStore.pinned = [...DexStore.pinned, apiName];
    const row = DexStore.byName[apiName];
    if (row && !row.details) loadDexDetails([apiName]);
  }
  notifyDex();
}

// Build + render the dex the first time it's shown (or after a format change).
export async function openDexPage() {
  if (!_preserveQuery) {
    DexStore.filters = [];
    DexStore.draft = '';
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
  try {
    const pending = [];
    if (REGULATIONS[STATE.format]) pending.push(initChampionsRoster());
    if (!CACHE.pokemonList || CACHE.pokemonList.length === 0) {
      pending.push(initPokemonList());
    }
    if (pending.length) await Promise.all(pending);
    buildDexRoster();
  } catch (err) {
    // Leave builtForFormat unset so reopening retries; clear the flag in finally
    // so the page isn't wedged on "loading roster…" after a network failure.
    console.error('Pokédex: failed to load roster', err);
    return;
  } finally {
    DexStore.loading = false;
    notifyDex();
  }
  // A regulation roster is bounded — eager-load everything so sort/search work
  // instantly. The National Dex (~1259 rows) stays lazy: DexView's observer
  // fetches placeholder rows as they scroll into view (ensureDexFullyLoaded
  // still force-loads all when a stat-sort or ability-search needs it).
  if (REGULATIONS[STATE.format]) {
    loadDexDetails(DexStore.roster.map(r => r.apiName));
  }
}

// Look up already-loaded Pokémon details by apiName (used by attackdex-store via
// app.js to enrich the "who learns" list without a circular import).
export function getPokemonDetails(apiName) {
  return DexStore.byName[apiName]?.details ?? null;
}

// Narrow the Pokédex to a single Pokémon by name (called when jumping from the
// Attackdex "learned by" modal). Sets the query + re-renders.
export function jumpToDexPokemon(apiName) {
  const displayName = DexStore.byName[apiName]?.name || formatDisplayName(apiName);
  _preserveQuery = true;
  DexStore.filters = [displayName];
  DexStore.draft = '';
  // Only notify if roster is built; otherwise openDexPage (triggered by
  // showPage) will render with the filter already set.
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

// --- Type matchup summary (header of the row-click modal) ---

const ALL_TYPES = [
  'Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

// Sections in display order (most resistant → most weak). Neutral (1×) is omitted
// per the design; immunities get their own section above the 4× resist tier.
const MATCHUP_SECTIONS = [
  { mult: 0,    label: 'Immune',    tone: 'text-sky-400' },
  { mult: 0.25, label: '4× Resist', tone: 'text-emerald-400' },
  { mult: 0.5,  label: '2× Resist', tone: 'text-emerald-400' },
  { mult: 2,    label: '2× Weak',   tone: 'text-red-400' },
  { mult: 4,    label: '4× Weak',   tone: 'text-red-400' },
];

// Build the matchup header: for each attacking type, how the Pokémon takes it.
// Returns null when the Pokémon is neutral to everything (no section to show).
function buildTypeMatchup(types) {
  const byMult = new Map();
  for (const t of ALL_TYPES) {
    const mult = getTypeEffectiveness(t, types);
    if (mult === 1) continue;
    if (!byMult.has(mult)) byMult.set(mult, []);
    byMult.get(mult).push(t);
  }
  const sections = MATCHUP_SECTIONS
    .map(s => ({ ...s, types: byMult.get(s.mult) || [] }))
    .filter(s => s.types.length);
  if (sections.length === 0) return null;

  // One column per tier, laid out as a single non-wrapping row separated by
  // vertical dividers: a tone-coloured label on top with the tier's type badges
  // beneath. Columns share the width evenly (flex-1) and never overflow onto a
  // second row — min-w-0 lets a crowded tier wrap its own badges instead.
  return html`
    <div class="flex gap-2 pb-3 border-b border-slate-700">
      ${sections.map((s, i) => html`
        <div class=${`flex flex-col gap-1 flex-1 min-w-0 ${i > 0 ? 'pl-2 border-l border-slate-800/70' : ''}`}>
          <span class=${`text-[9px] font-black uppercase tracking-wider ${s.tone}`}>${s.label}</span>
          <div class="flex flex-wrap gap-1">
            ${s.types.map(t => html`<span class=${`text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white`} title=${t}>${TYPE_SHORT[t] || t}</span>`)}
          </div>
        </div>`)}
    </div>`;
}

// --- Row-click detail modal (reuses the shared vanilla detail-modal.js) ---

function buildMoveItem(move, md, onClick) {
  if (!md) {
    return { node: html`<span class="font-bold text-slate-500 flex-1 truncate animate-pulse">${move.name}</span>`, onClick };
  }
  const cat = getCategoryBadge(md.category);
  const catCls = cat.cls;
  const catLabel = cat.label;
  const kind = spreadKind(md);
  const spreadBadge = kind === 'ally'
    ? html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-rose-950/50 text-rose-400 border border-rose-900/40" title="Also hits your ally">Spread+Ally</span>`
    : kind === 'opponents'
      ? html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-amber-950/50 text-amber-400 border border-amber-900/40" title="Hits both opponents">Spread</span>`
      : '';
  return {
    node: html`
      <span class="font-bold text-slate-100 flex-1 flex items-center gap-1.5 min-w-0"><span class="truncate">${move.name}</span>${spreadBadge}</span>
      <div class="w-14 shrink-0"><span class=${`text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(md.type)} text-white`}>${md.type}</span></div>
      <div class="w-16 shrink-0"><span class=${`text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${catCls}`}>${catLabel}</span></div>
      ${md.power
        ? html`<span class="font-mono text-amber-400 w-7 text-right shrink-0 text-[11px]">${md.power}</span>`
        : html`<span class="font-mono text-slate-600 w-7 text-right shrink-0 text-[11px]">—</span>`}`,
    onClick,
  };
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

  const session = openDetailModal({
    title: details.name,
    subtitle: html`
      <span class="flex items-center flex-wrap gap-1.5">
        ${details.types.map(t => html`<span class=${`text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white`}>${t}</span>`)}
        <span class="text-slate-500">${moves.length} moves</span>
      </span>`,
    image: details.sprite || '',
    header: buildTypeMatchup(details.types),
    items: buildItems()
  });

  // Fetch details for moves not yet cached anywhere.
  const toFetch = moves.filter(m => !getDetails(m));
  if (toFetch.length === 0) return;

  await runPool(toFetch, async (move) => {
    try {
      const md = await fetchMoveDetails(move.apiName);
      localCache.set(move.apiName, md);
    } catch (err) {
      console.error(`Failed to load move ${move.apiName}`, err);
    }
  }, { batchEvery: 8, onProgress: () => refreshDetailModalBody(buildItems(), session) });
  refreshDetailModalBody(buildItems(), session);
}
