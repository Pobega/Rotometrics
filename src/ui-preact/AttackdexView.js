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

// Mobile (<sm) card: the same move data stacked vertically so it never needs the
// horizontal scroller the grid table does. Name + spread + type/category badges on
// top, Power/Prio chips, then the effect text (mirrors DexView's DexCard).
function MoveCard({ row }) {
  const d = row.details;
  const chip = (label, value, valueClass = 'text-slate-100') => html`
    <div class="flex flex-col items-center rounded bg-slate-900/60 py-1">
      <span class="text-[8px] font-bold uppercase tracking-wider text-slate-500">${label}</span>
      <span class=${`font-mono text-xs ${valueClass}`}>${value}</span>
    </div>`;

  if (!d) {
    return html`
      <div class=${`flex flex-col gap-2 rounded-xl border border-slate-800/70 p-3 cursor-pointer bg-slate-900/20`}
        data-api=${row.apiName} onClick=${() => handleAttackdexRowClick(row.apiName)}>
        <span class="font-bold text-slate-300 text-sm truncate">${row.name}</span>
        <span class="text-[10px] text-slate-600">loading…</span>
      </div>`;
  }

  const cat = getCategoryBadge(d.category);
  const power = d.power ? d.power : '—';
  const prio = d.priority > 0 ? `+${d.priority}` : `${d.priority ?? 0}`;
  const kind = spreadKind(d);
  const spread =
    kind === 'ally'
      ? html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-rose-950/50 text-rose-400 border border-rose-900/40" title="Spread move — also hits your own ally">Spread+Ally</span>`
      : kind === 'opponents'
        ? html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-amber-950/50 text-amber-400 border border-amber-900/40" title="Spread move — hits both opponents">Spread</span>`
        : '';

  return html`
    <div class=${`flex flex-col gap-2 rounded-xl border border-slate-800/70 p-3 cursor-pointer bg-slate-900/20`}
      data-api=${row.apiName} onClick=${() => handleAttackdexRowClick(row.apiName)}>
      <div class="flex items-center gap-2">
        <span class="font-bold text-slate-100 text-sm flex-1 min-w-0 truncate flex items-center gap-1.5">${row.name}${spread}</span>
        <span class=${`text-[8px] px-1.5 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(d.type)} text-white`} title=${d.type}>${d.type}</span>
        <span class=${`text-[8px] px-1.5 py-0.5 font-black uppercase rounded ${cat.cls}`}>${cat.label}</span>
      </div>
      <div class="grid grid-cols-2 gap-1">
        ${chip('Power', power, 'font-bold text-amber-400')}
        ${chip('Priority', prio)}
      </div>
      <div class="text-[10px] text-slate-400 leading-tight">${d.desc || '—'}</div>
    </div>`;
}

const SORT_COLS = [
  { key: 'name', label: 'Move' },
  { key: 'power', label: 'Power' },
  { key: 'priority', label: 'Prio' },
];

// Mobile (<sm) sort control — the desktop sort lives in the grid header, hidden on
// phones. A select over the sortable columns plus a direction toggle (mirrors
// DexView; Attackdex has no view toggle, so this sits on its own row).
function MobileSortControl() {
  const desc = AdxStore.sortDir === 'desc';
  return html`
    <div class="sm:hidden flex items-center gap-1.5">
      <select
        class="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-700 px-2 py-2 text-xs text-slate-200"
        value=${AdxStore.sortKey}
        onChange=${(e) => setAdxSort(e.target.value)}
        aria-label="Sort by">
        ${SORT_COLS.map((c) => html`<option value=${c.key}>Sort: ${c.label}</option>`)}
      </select>
      <button
        onClick=${() => setAdxSort(AdxStore.sortKey)}
        class="shrink-0 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:text-white transition"
        title=${desc ? 'Descending — tap for ascending' : 'Ascending — tap for descending'}
        aria-label=${desc ? 'Sort descending, tap for ascending' : 'Sort ascending, tap for descending'}>
        ${desc ? '▼' : '▲'}
      </button>
    </div>`;
}

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

      <!-- Mobile-only sort control (desktop sorts via the grid header). -->
      <${MobileSortControl} />

      <!-- Rows: grid table on sm+, stacked cards on mobile. Both live under the
           same ref so the lazy-row observer tracks whichever layout is visible. -->
      <div ref=${rowsRef}>
        <!-- Desktop: horizontally-scrollable grid table -->
        <div class="hidden sm:block overflow-x-auto">
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
            <div class="flex flex-col">
              ${sorted.map((row) => html`<${MoveRow} key=${row.apiName} row=${row} />`)}
            </div>
          </div>
        </div>

        <!-- Mobile: stacked cards (no horizontal scroll) -->
        <div class="sm:hidden flex flex-col gap-2">
          ${sorted.map((row) => html`<${MoveCard} key=${`card-${row.apiName}`} row=${row} />`)}
        </div>

        ${
          sorted.length === 0 &&
          html`<div class="px-3 py-8 text-center text-xs text-slate-500">No moves match ${terms.map((t, i) => html`${i > 0 ? ' + ' : ''}“${t}”`)}.</div>`
        }
      </div>

    </section>`;
}
