// Pokédex page (Preact) — the sortable/searchable species table mounted into the
// existing #page-pokedex container. Reads the reactive DexStore and re-renders on
// notifyDex(); all data + loading logic lives in dex-store.js. Row click opens the
// shared vanilla detail modal. (Lazy National-Dex loading is restored in 2b.)
import { html, useRef } from './preact.js';
import { useSubscription, useLazyRowLoader } from './reactive.js';
import { STATE } from '../state.js';
import { bst, sortDex, filterDex } from '../data/dex.js';
import { REGULATIONS } from '../data/regulations.js';
import { getTypeBgClass, TYPE_SHORT } from '../ui/render.js';
import {
  DexStore,
  subscribeDex,
  dexStatusText,
  setDexSort,
  setDexDraft,
  commitDexFilter,
  removeDexFilter,
  clearDexFilters,
  toggleDexPin,
  handleDexRowClick,
  loadDexDetails,
} from './dex-store.js';

// Column track shared by the header + every row: name, type, abilities, 6 stats,
// BST, and a trailing pin button.
const GRID_COLS =
  'grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px_34px]';
const ROW_GRID = `grid ${GRID_COLS} items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs`;

function PinButton({ row, pinned }) {
  // stopPropagation so pinning doesn't also open the row's detail modal.
  return html`
    <button
      onClick=${(e) => {
        e.stopPropagation();
        toggleDexPin(row.apiName);
      }}
      class=${`justify-self-center transition leading-none ${pinned ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-300'}`}
      title=${pinned ? 'Unpin' : 'Pin to top'} aria-label=${pinned ? `Unpin ${row.name}` : `Pin ${row.name}`} aria-pressed=${pinned ? 'true' : 'false'}>
      <i class="fa-solid fa-thumbtack text-[11px]"></i>
    </button>`;
}

function PlaceholderRow({ row, pinned }) {
  // Lazy placeholder; data-api lets 2b's observer know what to fetch. Clicking a
  // not-yet-loaded row still opens the modal (it fetches on demand), matching the
  // old delegated-click behavior.
  return html`
    <div class=${`${ROW_GRID} cursor-pointer ${pinned ? 'bg-amber-950/10' : ''}`} data-api=${row.apiName}
      onClick=${() => handleDexRowClick(row.apiName)}>
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div>
        <span class="font-bold text-slate-300 truncate">${row.name}</span>
      </div>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-slate-600 text-[10px]">loading…</span>
      ${['–', '–', '–', '–', '–', '–', '–'].map((d) => html`<span class="text-right font-mono text-slate-600">${d}</span>`)}
      <${PinButton} row=${row} pinned=${pinned} />
    </div>`;
}

function DexRow({ row, pinned }) {
  const d = row.details;
  if (!d) return html`<${PlaceholderRow} row=${row} pinned=${pinned} />`;

  const s = d.baseStats;
  const cell = (v) => html`<span class="text-right font-mono text-slate-300">${v}</span>`;
  return html`
    <div class=${`${ROW_GRID} hover:bg-slate-800/40 transition cursor-pointer ${pinned ? 'bg-amber-950/10' : ''}`} data-api=${row.apiName}
      onClick=${() => handleDexRowClick(row.apiName)}>
      <div class="flex items-center gap-2 min-w-0">
        <img src=${d.sprite || ''} alt="" loading="lazy" class="w-8 h-8 object-contain shrink-0" />
        <span class="font-bold text-slate-100 truncate">${row.name}</span>
      </div>
      <div class="flex flex-wrap gap-1">
        ${d.types.map((t) => html`<span class=${`text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white`} title=${t}>${TYPE_SHORT[t] || t}</span>`)}
      </div>
      <span class="text-slate-400 text-[10px] leading-tight">${d.abilities.map((a) => a.name).join(', ')}</span>
      ${cell(s.hp)}${cell(s.atk)}${cell(s.def)}${cell(s.spa)}${cell(s.spd)}${cell(s.spe)}
      <span class="text-right font-mono font-bold text-amber-400">${bst(s)}</span>
      <${PinButton} row=${row} pinned=${pinned} />
    </div>`;
}

const SORT_COLS = [
  { key: 'name', label: 'Pokémon', align: 'text-left' },
  { key: 'hp', label: 'HP', align: 'text-right' },
  { key: 'atk', label: 'Atk', align: 'text-right' },
  { key: 'def', label: 'Def', align: 'text-right' },
  { key: 'spa', label: 'SpA', align: 'text-right' },
  { key: 'spd', label: 'SpD', align: 'text-right' },
  { key: 'spe', label: 'Spe', align: 'text-right' },
  { key: 'bst', label: 'BST', align: 'text-right' },
];

function SortButton({ col }) {
  const active = DexStore.sortKey === col.key;
  const arrow = active ? (DexStore.sortDir === 'desc' ? '▼' : '▲') : '';
  return html`
    <button class=${`dex-sort ${col.align} hover:text-white transition ${active ? 'text-amber-400' : ''}`}
      onClick=${() => setDexSort(col.key)}>
      ${col.label} <span class="dex-arrow">${arrow}</span>
    </button>`;
}

function RegulationBadge() {
  const reg = REGULATIONS[STATE.format];
  if (reg) {
    return html`<span class="text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-green-950 text-green-400 border border-green-900/50">${reg.label}</span>`;
  }
  return html`<span class="text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-slate-800/60 text-slate-400 border border-slate-700/30">National Dex</span>`;
}

export function DexView() {
  useSubscription(subscribeDex);

  // Committed chips plus the live draft (so typing previews before Enter).
  const draft = DexStore.draft.trim();
  const terms = draft ? [...DexStore.filters, draft] : DexStore.filters;

  // Pinned species are hoisted above the (filtered) rest and shown regardless of
  // the search; the rest excludes them so they never appear twice. Each group is
  // sorted independently by the active column.
  const pinnedSet = new Set(DexStore.pinned);
  const isPinned = (row) => pinnedSet.has(row.apiName);
  const pinnedRows = sortDex(DexStore.roster.filter(isPinned), DexStore.sortKey, DexStore.sortDir);
  const rest = sortDex(
    filterDex(
      DexStore.roster.filter((r) => !isPinned(r)),
      terms
    ),
    DexStore.sortKey,
    DexStore.sortDir
  );
  const statusText =
    DexStore.loading && DexStore.roster.length === 0 ? 'loading roster…' : dexStatusText();

  // Lazy National-Dex loading: fetch placeholder rows as they scroll into view.
  // (Regulation rosters eager-load, so allLoaded short-circuits the observer.)
  const rowsRef = useRef(null);
  useLazyRowLoader(rowsRef, DexStore, loadDexDetails);

  return html`
    <section class="bg-slate-950/20 border border-slate-800/80 rounded-3xl p-5 lg:p-5 flex flex-col gap-4">

      <!-- Title + Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
        <h2 class="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-book text-xs"></i> Pokédex
          <${RegulationBadge} />
          <span class="text-[10px] font-bold text-slate-500 normal-case tracking-normal">${statusText}</span>
        </h2>
        <div class="flex flex-col items-stretch gap-2 w-full sm:w-72">
          <div class="relative w-full">
            <input type="text" placeholder="Search name, type, ability, move… (Enter to add)"
              value=${DexStore.draft}
              onInput=${(e) => setDexDraft(e.target.value)}
              onKeyDown=${(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDexFilter();
                }
              }}
              class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-8 text-xs text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition" />
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
            ${
              DexStore.draft &&
              html`
              <button onClick=${() => setDexDraft('')}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition leading-none" aria-label="Clear input">
                <i class="fa-solid fa-xmark text-sm"></i>
              </button>`
            }
          </div>
          ${
            DexStore.filters.length > 0 &&
            html`
            <div class="flex flex-wrap items-center gap-1.5">
              ${DexStore.filters.map(
                (term, i) => html`
                <span key=${term} class="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-900/50 rounded-lg pl-2 pr-1 py-0.5">
                  ${term}
                  <button onClick=${() => removeDexFilter(i)}
                    class="text-amber-500/70 hover:text-white transition leading-none px-0.5" aria-label=${`Remove ${term}`}>
                    <i class="fa-solid fa-xmark text-[11px]"></i>
                  </button>
                </span>`
              )}
              ${
                DexStore.filters.length > 1 &&
                html`
                <button onClick=${clearDexFilters}
                  class="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 hover:text-white transition px-1">
                  Clear all
                </button>`
              }
            </div>`
          }
        </div>
      </div>

      <!-- Scrollable table -->
      <div class="overflow-x-auto">
        <div class="min-w-[894px]">
          <!-- Header row -->
          <div class=${`grid ${GRID_COLS} items-center gap-2 px-3 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-700`}>
            <${SortButton} col=${SORT_COLS[0]} />
            <span class="text-left">Type</span>
            <span class="text-left">Abilities</span>
            ${SORT_COLS.slice(1).map((col) => html`<${SortButton} col=${col} />`)}
            <span class="justify-self-center"><i class="fa-solid fa-thumbtack text-[9px]"></i></span>
          </div>
          <!-- Data rows: pinned first, then the filtered rest -->
          <div class="flex flex-col" ref=${rowsRef}>
            ${pinnedRows.map((row) => html`<${DexRow} key=${`pin-${row.apiName}`} row=${row} pinned=${true} />`)}
            ${pinnedRows.length > 0 && rest.length > 0 && html`<div class="border-b-2 border-amber-900/30"></div>`}
            ${rest.map((row) => html`<${DexRow} key=${row.apiName} row=${row} pinned=${false} />`)}
            ${
              pinnedRows.length === 0 &&
              rest.length === 0 &&
              html`
              <div class="px-3 py-8 text-center text-xs text-slate-500">No Pokémon match ${terms.map((t, i) => html`${i > 0 ? ' + ' : ''}“${t}”`)}.</div>`
            }
          </div>
        </div>
      </div>

    </section>`;
}
