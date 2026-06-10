// Attackdex page (Preact) — the sortable/searchable/filterable move table mounted
// into the existing #page-attackdex container. Reads the reactive AdxStore and
// re-renders on notifyAdx(); all data + loading logic lives in attackdex-store.js.
// Row click opens the shared vanilla detail modal ("Who learns …"). Lazy rows via
// an IntersectionObserver, mirroring DexView.
import { html, useRef } from './preact.js';
import { useSubscription, useLazyRowLoader } from './reactive.js';
import { SearchChips } from './SearchChips.js';
import { RegulationBadge } from './RegulationBadge.js';
import { STATE } from '../state.js';
import { legalNameFilterForFormat } from '../api/pokeapi.js';
import { sortMoves, filterMoves, spreadKind } from '../data/moves.js';
import { getTypeBgClass, getCategoryBadge } from '../ui/render.js';
import {
  AdxStore,
  subscribeAdx,
  attackdexStatusText,
  setAdxSort,
  setAdxDraft,
  commitAdxFilter,
  commitAdxValue,
  removeAdxFilter,
  clearAdxFilters,
  adxSuggest,
  handleAttackdexRowClick,
  loadMoveDetails,
} from './attackdex-store.js';

const ROW_GRID =
  'grid grid-cols-[minmax(140px,1.4fr)_72px_72px_48px_40px_minmax(220px,2.8fr)] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs';

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

  const cat = getCategoryBadge(d.category);
  const power = d.power ? d.power : '—';
  // Priority: show a signed value so +1 (Quick Attack) and -6 (Whirlwind) read
  // at a glance; 0 (the common case) is dimmed so the non-zero rows stand out.
  const prio = d.priority > 0 ? `+${d.priority}` : `${d.priority ?? 0}`;
  const prioCls = d.priority ? 'text-slate-300' : 'text-slate-600';
  // Two flavours of spread: foes-only ('Spread') vs also-hits-your-ally
  // ('Spread+Ally'), which is the decision that matters in VGC doubles.
  const kind = spreadKind(d);
  const spread =
    kind === 'ally'
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
      <span class=${`text-left font-mono ${prioCls}`}>${prio}</span>
      <span class="text-slate-400 text-[10px] leading-tight line-clamp-2">${d.desc || '—'}</span>
    </div>`;
}

const SORT_COLS = [
  { key: 'name', label: 'Move' },
  { key: 'power', label: 'Power' },
  { key: 'priority', label: 'Prio' },
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
  useSubscription(subscribeAdx);

  // Committed chips plus the live draft (so typing previews before Enter).
  const draft = AdxStore.draft.trim();
  const terms = draft ? [...AdxStore.filters, draft] : AdxStore.filters;
  // Always-on regulation gate: under a regulation, keep only moves with a legal
  // learner. Null in National Dex view (no gate). The store force-loads every row's
  // details under a regulation so the gate sees complete learner lists.
  const regGate = legalNameFilterForFormat(STATE.format);
  const filtered = filterMoves(AdxStore.roster, terms, regGate);
  const sorted = sortMoves(filtered, AdxStore.sortKey, AdxStore.sortDir);
  const statusText =
    AdxStore.loading && AdxStore.roster.length === 0 ? 'loading moves…' : attackdexStatusText();

  // Lazy loading: fetch placeholder rows as they scroll into view (mirrors DexView).
  const rowsRef = useRef(null);
  useLazyRowLoader(rowsRef, AdxStore, loadMoveDetails);

  return html`
    <section class="bg-slate-950/20 border border-slate-800/80 rounded-3xl p-5 lg:p-5 flex flex-col gap-4">

      <!-- Title + Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
        <h2 class="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-burst text-xs"></i> Attackdex
          <${RegulationBadge} />
          <span class="text-[10px] font-bold text-slate-500 normal-case tracking-normal">${statusText}</span>
        </h2>
        <${SearchChips}
          draft=${AdxStore.draft}
          filters=${AdxStore.filters}
          placeholder="Search name, type, category, spread, learner… (Enter to add)"
          onDraft=${setAdxDraft}
          onCommit=${commitAdxFilter}
          onRemove=${removeAdxFilter}
          onClear=${clearAdxFilters}
          suggest=${adxSuggest}
          onPick=${commitAdxValue} />
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
            ${
              sorted.length
                ? sorted.map((row) => html`<${MoveRow} key=${row.apiName} row=${row} />`)
                : html`<div class="px-3 py-8 text-center text-xs text-slate-500">No moves match ${terms.map((t, i) => html`${i > 0 ? ' + ' : ''}“${t}”`)}.</div>`
            }
          </div>
        </div>
      </div>

    </section>`;
}
