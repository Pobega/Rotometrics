// Attackdex page (Preact) — the sortable/searchable/filterable move table mounted
// into the existing #page-attackdex container. Reads the reactive AdxStore and
// re-renders on notifyAdx(); all data + loading logic lives in attackdex-store.js.
// Row click opens the shared vanilla detail modal ("Who learns …"). Lazy rows via
// an IntersectionObserver, mirroring DexView.
import { html, useState, useEffect, useLayoutEffect, useRef } from './preact.js';
import { sortMoves, filterMoves, spreadKind } from '../data/moves.js';
import { getTypeBgClass } from '../ui/render.js';
import {
  AdxStore, subscribeAdx, attackdexStatusText,
  setAdxSort, setAdxQuery, clearAdxQuery, setAdxType, setAdxCategory, toggleAdxSpread,
  handleAttackdexRowClick, loadMoveDetails,
} from './attackdex-store.js';

function useAdxStore() {
  const [, force] = useState(0);
  useLayoutEffect(() => subscribeAdx(() => force((n) => n + 1)), []);
}

const TYPES = ['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting',
  'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon',
  'Dark', 'Steel', 'Fairy'];

const CATEGORY_BADGE = {
  physical: { label: 'Physical', cls: 'bg-red-950/50 text-red-400 border border-red-900/40' },
  special:  { label: 'Special',  cls: 'bg-blue-950/50 text-blue-400 border border-blue-900/40' },
  status:   { label: 'Status',   cls: 'bg-slate-800/60 text-slate-400 border border-slate-700/40' }
};

const ROW_GRID = 'grid grid-cols-[minmax(140px,1.4fr)_72px_72px_48px_40px_minmax(220px,2.8fr)] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs';

function PlaceholderRow({ row }) {
  // Lazy placeholder; data-api lets the observer know what to fetch. Clicking a
  // not-yet-loaded row still opens the modal (it fetches on demand).
  return html`
    <div class=${`${ROW_GRID} cursor-pointer`} data-api=${row.apiName}
      onClick=${() => handleAttackdexRowClick(row.apiName)}>
      <span class="font-bold text-slate-300 truncate">${row.name}</span>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-slate-600 text-[10px]">loading…</span>
    </div>`;
}

function MoveRow({ row }) {
  const d = row.details;
  if (!d) return html`<${PlaceholderRow} row=${row} />`;

  const cat = CATEGORY_BADGE[d.category] || CATEGORY_BADGE.status;
  const power = d.power ? d.power : '—';
  const pp = (d.pp === null || d.pp === undefined) ? '—' : d.pp;
  // Two flavours of spread: foes-only ('Spread') vs also-hits-your-ally
  // ('Spread+Ally'), which is the decision that matters in VGC doubles.
  const kind = spreadKind(d);
  const spread = kind === 'ally'
    ? html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-rose-950/50 text-rose-400 border border-rose-900/40" title="Spread move — also hits your own ally">Spread+Ally</span>`
    : kind === 'opponents'
      ? html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-amber-950/50 text-amber-400 border border-amber-900/40" title="Spread move — hits both opponents">Spread</span>`
      : '';

  return html`
    <div class=${`${ROW_GRID} hover:bg-slate-800/40 transition cursor-pointer`} data-api=${row.apiName}
      onClick=${() => handleAttackdexRowClick(row.apiName)}>
      <span class="font-bold text-slate-100 truncate flex items-center gap-1.5">${row.name}${spread}</span>
      <span><span class=${`text-[8px] px-1.5 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(d.type)} text-white`} title=${d.type}>${d.type}</span></span>
      <span><span class=${`text-[8px] px-1.5 py-0.5 font-black uppercase rounded ${cat.cls}`}>${cat.label}</span></span>
      <span class="text-left font-mono font-bold text-amber-400">${power}</span>
      <span class="text-left font-mono text-slate-300">${pp}</span>
      <span class="text-slate-400 text-[10px] leading-tight line-clamp-2">${d.desc || '—'}</span>
    </div>`;
}

const SORT_COLS = [
  { key: 'name', label: 'Move' },
  { key: 'power', label: 'Power' },
  { key: 'pp', label: 'PP' },
];

function SortButton({ col }) {
  const active = AdxStore.sortKey === col.key;
  const arrow = active ? (AdxStore.sortDir === 'desc' ? '▼' : '▲') : '';
  return html`
    <button class=${`attackdex-sort uppercase text-left hover:text-white transition ${active ? 'text-amber-400' : ''}`}
      onClick=${() => setAdxSort(col.key)}>
      ${col.label} <span class="attackdex-arrow">${arrow}</span>
    </button>`;
}

export function AttackdexView() {
  useAdxStore();

  const filtered = filterMoves(AdxStore.roster, {
    query: AdxStore.query,
    type: AdxStore.filterType,
    category: AdxStore.filterCategory,
    spread: AdxStore.filterSpread,
  });
  const sorted = sortMoves(filtered, AdxStore.sortKey, AdxStore.sortDir);
  const statusText = AdxStore.loading && AdxStore.roster.length === 0 ? 'loading moves…' : attackdexStatusText();

  // Lazy loading: fetch placeholder rows as they scroll into view (mirrors
  // DexView). Recreate + disconnect the observer each render.
  const rowsRef = useRef(null);
  useEffect(() => {
    const container = rowsRef.current;
    if (!container || AdxStore.allLoaded) return;

    const observer = new IntersectionObserver((entries) => {
      const toLoad = [];
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const apiName = entry.target.getAttribute('data-api');
        const r = AdxStore.byName[apiName];
        if (r && !r.details) toLoad.push(apiName);
        observer.unobserve(entry.target);
      });
      if (toLoad.length) loadMoveDetails(toLoad);
    }, { rootMargin: '200px' });

    container.querySelectorAll('[data-api]').forEach((el) => {
      const r = AdxStore.byName[el.getAttribute('data-api')];
      if (r && !r.details) observer.observe(el);
    });

    return () => observer.disconnect();
  });

  const spreadOn = AdxStore.filterSpread;
  const spreadCls = spreadOn
    ? 'shrink-0 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-xl transition bg-amber-950/40 text-amber-400 border border-amber-900/50'
    : 'shrink-0 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-xl transition bg-slate-900 text-slate-400 border border-slate-700 hover:text-white';
  const selCls = 'bg-transparent text-[11px] font-bold text-slate-200 focus:outline-none cursor-pointer';

  return html`
    <section class="bg-slate-950/20 border border-slate-800/80 rounded-3xl p-5 lg:p-5 flex flex-col gap-4">

      <!-- Title + Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
        <h2 class="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-burst text-xs"></i> Attackdex
          <span class="text-[10px] font-bold text-slate-500 normal-case tracking-normal">${statusText}</span>
        </h2>
        <div class="relative w-full sm:w-72">
          <input type="text" placeholder="Search name or effect (e.g. burn)…"
            value=${AdxStore.query}
            onInput=${(e) => setAdxQuery(e.target.value)}
            class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-8 text-xs text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition" />
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
          ${AdxStore.query && html`
            <button onClick=${clearAdxQuery}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition leading-none" aria-label="Clear search">
              <i class="fa-solid fa-xmark text-sm"></i>
            </button>`}
        </div>
      </div>

      <!-- Filters: Type, Category, Spread -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
          <span class="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Type</span>
          <select class=${selCls} value=${AdxStore.filterType} onChange=${(e) => setAdxType(e.target.value)}>
            <option value="" class="bg-slate-800">All</option>
            ${TYPES.map((t) => html`<option value=${t} class="bg-slate-800">${t}</option>`)}
          </select>
        </div>
        <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
          <span class="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Category</span>
          <select class=${selCls} value=${AdxStore.filterCategory} onChange=${(e) => setAdxCategory(e.target.value)}>
            <option value="" class="bg-slate-800">All</option>
            <option value="physical" class="bg-slate-800">Physical</option>
            <option value="special" class="bg-slate-800">Special</option>
            <option value="status" class="bg-slate-800">Status</option>
          </select>
        </div>
        <button type="button" aria-pressed=${spreadOn ? 'true' : 'false'} class=${spreadCls}
          onClick=${toggleAdxSpread}>
          Spread only
        </button>
      </div>

      <!-- Scrollable table -->
      <div class="overflow-x-auto">
        <div class="min-w-[720px]">
          <!-- Header row -->
          <div class="grid grid-cols-[minmax(140px,1.4fr)_72px_72px_48px_40px_minmax(220px,2.8fr)] items-center gap-2 px-3 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-700">
            <${SortButton} col=${SORT_COLS[0]} />
            <span class="text-left">Type</span>
            <span class="text-left">Category</span>
            <${SortButton} col=${SORT_COLS[1]} />
            <${SortButton} col=${SORT_COLS[2]} />
            <span class="text-left">Effect</span>
          </div>
          <!-- Data rows -->
          <div class="flex flex-col" ref=${rowsRef}>
            ${sorted.length
              ? sorted.map((row) => html`<${MoveRow} key=${row.apiName} row=${row} />`)
              : html`<div class="px-3 py-8 text-center text-xs text-slate-500">No moves match your filters.</div>`}
          </div>
        </div>
      </div>

    </section>`;
}
