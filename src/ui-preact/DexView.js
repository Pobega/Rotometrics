// Pokédex page (Preact) — the sortable/searchable species table mounted into the
// existing #page-pokedex container. Reads the reactive DexStore and re-renders on
// notifyDex(); all data + loading logic lives in dex-store.js. Row click opens the
// shared vanilla detail modal. (Lazy National-Dex loading is restored in 2b.)
import { html, useState, useLayoutEffect } from './preact.js';
import { STATE } from '../state.js';
import { bst, sortDex, filterDex } from '../data/dex.js';
import { REGULATIONS } from '../data/regulations.js';
import { getTypeBgClass } from '../ui/render.js';
import {
  DexStore, subscribeDex, dexStatusText,
  setDexSort, setDexQuery, clearDexQuery, handleDexRowClick,
} from './dex-store.js';

// Re-render-on-DexStore-change hook (mirrors useStore for the calculator store).
function useDexStore() {
  const [, force] = useState(0);
  useLayoutEffect(() => subscribeDex(() => force((n) => n + 1)), []);
}

const TYPE_SHORT = {
  Normal: 'NOR', Fire: 'FIR', Water: 'WAT', Grass: 'GRA', Electric: 'ELE',
  Ice: 'ICE', Fighting: 'FIG', Poison: 'POI', Ground: 'GRD', Flying: 'FLY',
  Psychic: 'PSY', Bug: 'BUG', Rock: 'ROC', Ghost: 'GHO', Dragon: 'DRA',
  Dark: 'DRK', Steel: 'STE', Fairy: 'FAI'
};

const ROW_GRID = 'grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs';

function PlaceholderRow({ row }) {
  // Lazy placeholder; data-api lets 2b's observer know what to fetch. Clicking a
  // not-yet-loaded row still opens the modal (it fetches on demand), matching the
  // old delegated-click behavior.
  return html`
    <div class=${`${ROW_GRID} cursor-pointer`} data-api=${row.apiName}
      onClick=${() => handleDexRowClick(row.apiName)}>
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div>
        <span class="font-bold text-slate-300 truncate">${row.name}</span>
      </div>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-slate-600 text-[10px]">loading…</span>
      ${['–', '–', '–', '–', '–', '–', '–'].map((d) => html`<span class="text-right font-mono text-slate-600">${d}</span>`)}
    </div>`;
}

function DexRow({ row }) {
  const d = row.details;
  if (!d) return html`<${PlaceholderRow} row=${row} />`;

  const s = d.baseStats;
  const cell = (v) => html`<span class="text-right font-mono text-slate-300">${v}</span>`;
  return html`
    <div class=${`${ROW_GRID} hover:bg-slate-800/40 transition cursor-pointer`} data-api=${row.apiName}
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
  useDexStore();

  const filtered = filterDex(DexStore.roster, DexStore.query);
  const sorted = sortDex(filtered, DexStore.sortKey, DexStore.sortDir);
  const statusText = DexStore.loading && DexStore.roster.length === 0 ? 'loading roster…' : dexStatusText();

  return html`
    <section class="bg-slate-950/20 border border-slate-800/80 rounded-3xl p-5 lg:p-5 flex flex-col gap-4">

      <!-- Title + Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
        <h2 class="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-book text-xs"></i> Pokédex
          <${RegulationBadge} />
          <span class="text-[10px] font-bold text-slate-500 normal-case tracking-normal">${statusText}</span>
        </h2>
        <div class="relative w-full sm:w-72">
          <input type="text" placeholder="Search name or ability…"
            value=${DexStore.query}
            onInput=${(e) => setDexQuery(e.target.value)}
            class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-8 text-xs text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition" />
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
          ${DexStore.query && html`
            <button onClick=${clearDexQuery}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition leading-none" aria-label="Clear search">
              <i class="fa-solid fa-xmark text-sm"></i>
            </button>`}
        </div>
      </div>

      <!-- Scrollable table -->
      <div class="overflow-x-auto">
        <div class="min-w-[860px]">
          <!-- Header row -->
          <div class="grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-700">
            <${SortButton} col=${SORT_COLS[0]} />
            <span class="text-left">Type</span>
            <span class="text-left">Abilities</span>
            ${SORT_COLS.slice(1).map((col) => html`<${SortButton} col=${col} />`)}
          </div>
          <!-- Data rows -->
          <div class="flex flex-col">
            ${sorted.length
              ? sorted.map((row) => html`<${DexRow} key=${row.apiName} row=${row} />`)
              : html`<div class="px-3 py-8 text-center text-xs text-slate-500">No Pokémon match “${DexStore.query}”.</div>`}
          </div>
        </div>
      </div>

    </section>`;
}
