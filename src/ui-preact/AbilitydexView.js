// Abilitydex page (Preact) — the searchable/filterable ability table mounted into
// the persistent #page-abilitydex container. Reads the reactive AbdStore and
// re-renders on notifyAbd(); all data + loading logic lives in abilitydex-store.js.
// Row click opens the shared detail modal ("Pokémon with …"). Lazy rows via an
// IntersectionObserver, mirroring AttackdexView.
import { html, useRef } from './preact.js';
import { useSubscription, useLazyRowLoader } from './reactive.js';
import { SearchChips } from './SearchChips.js';
import { RegulationBadge } from './RegulationBadge.js';
import { STATE } from '../state.js';
import { legalNameFilterForFormat } from '../api/pokeapi.js';
import { sortAbilities, filterAbilities, abilityTag } from '../data/abilities.js';
import {
  AbdStore,
  subscribeAbd,
  abilitydexStatusText,
  setAbdDraft,
  commitAbdFilter,
  commitAbdValue,
  removeAbdFilter,
  clearAbdFilters,
  toggleAbdTag,
  abdSuggest,
  handleAbilitydexRowClick,
  loadAbilityDetails,
} from './abilitydex-store.js';

const ROW_GRID =
  'grid grid-cols-[minmax(160px,1.6fr)_56px_minmax(240px,3fr)] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs';

// Small Offensive/Defensive marker for the curated VGC abilities (blank otherwise).
function TagBadge({ apiName }) {
  const tag = abilityTag(apiName);
  if (tag === 'off')
    return html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-amber-950/50 text-amber-400 border border-amber-900/40" title="VGC-relevant offensive ability">Off</span>`;
  if (tag === 'def')
    return html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-sky-950/50 text-sky-400 border border-sky-900/40" title="VGC-relevant defensive ability">Def</span>`;
  return html`<span class="text-slate-600 text-[10px]">—</span>`;
}

function PlaceholderRow({ row }) {
  // Lazy placeholder; data-api lets the observer know what to fetch. Clicking a
  // not-yet-loaded row still opens the modal (it fetches on demand).
  return html`
    <div class=${`${ROW_GRID} cursor-pointer`} data-api=${row.apiName}
      onClick=${() => handleAbilitydexRowClick(row.apiName)}>
      <span class="font-bold text-slate-300 truncate">${row.name}</span>
      <span><${TagBadge} apiName=${row.apiName} /></span>
      <span class="text-slate-600 text-[10px]">loading…</span>
    </div>`;
}

function AbilityRow({ row }) {
  const d = row.details;
  if (!d) return html`<${PlaceholderRow} row=${row} />`;

  return html`
    <div class=${`${ROW_GRID} hover:bg-slate-800/40 transition cursor-pointer`} data-api=${row.apiName}
      onClick=${() => handleAbilitydexRowClick(row.apiName)}>
      <span class="font-bold text-slate-100 truncate">${row.name}</span>
      <span><${TagBadge} apiName=${row.apiName} /></span>
      <span class="text-slate-400 text-[10px] leading-tight line-clamp-2">${d.desc || '—'}</span>
    </div>`;
}

// Mobile (<sm) card: name + tag badge on top, effect text below. Abilitydex is
// only 3 columns, but the effect column still forces ~520px of horizontal scroll;
// the card lets it wrap instead (mirrors DexView's DexCard).
function AbilityCard({ row }) {
  const d = row.details;
  return html`
    <div class=${`flex flex-col gap-2 rounded-xl border border-slate-800/70 p-3 cursor-pointer bg-slate-900/20`}
      data-api=${row.apiName} onClick=${() => handleAbilitydexRowClick(row.apiName)}>
      <div class="flex items-center gap-2">
        <span class=${`font-bold text-sm flex-1 min-w-0 truncate ${d ? 'text-slate-100' : 'text-slate-300'}`}>${row.name}</span>
        <${TagBadge} apiName=${row.apiName} />
      </div>
      <div class="text-[10px] text-slate-400 leading-tight">${d ? d.desc || '—' : 'loading…'}</div>
    </div>`;
}

export function AbilitydexView() {
  useSubscription(subscribeAbd);

  // Committed chips plus the live draft (so typing previews before Enter).
  const draft = AbdStore.draft.trim();
  const terms = draft ? [...AbdStore.filters, draft] : AbdStore.filters;
  // Always-on regulation gate: under a regulation, keep only abilities with a legal
  // holder. Null in National Dex view (no gate). The store force-loads every row's
  // details under a regulation so the gate sees complete holder lists.
  const regGate = legalNameFilterForFormat(STATE.format);
  const filtered = filterAbilities(AbdStore.roster, terms, regGate);
  const sorted = sortAbilities(filtered, 'asc');
  const statusText =
    AbdStore.loading && AbdStore.roster.length === 0
      ? 'loading abilities…'
      : abilitydexStatusText();

  // Lazy loading: fetch placeholder rows as they scroll into view.
  const rowsRef = useRef(null);
  useLazyRowLoader(rowsRef, AbdStore, loadAbilityDetails);

  // Offensive / Defensive presets: each toggles its keyword chip, and lights up
  // (with the amber/sky accent echoing the row Tag badges) while that chip is on.
  const offOn = AbdStore.filters.includes('offensive');
  const defOn = AbdStore.filters.includes('defensive');
  // Styled to match the Pokédex view toggle: a segmented pill (shared border via
  // the wrapper) with py-2 + leading-4 so it lines up with the search input. The
  // amber (Offensive) / sky (Defensive) active accents are kept since they echo the
  // row Tag badges.
  const tagBtnCls = (on, accent) =>
    `text-[10px] leading-4 font-extrabold uppercase tracking-wider py-2 px-3 transition ${on ? accent : 'text-slate-400 hover:text-slate-200'}`;

  return html`
    <section class="bg-slate-950/20 border border-slate-800/80 rounded-3xl p-5 lg:p-5 flex flex-col gap-4">

      <!-- Title + Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
        <h2 class="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-atom text-xs"></i> Abilitydex
          <${RegulationBadge} />
          <span class="text-[10px] font-bold text-slate-500 normal-case tracking-normal">${statusText}</span>
        </h2>
        <div class="flex flex-wrap items-start gap-2 w-full sm:w-auto">
          <div class="inline-flex self-start rounded-xl border border-slate-700 overflow-hidden shrink-0">
            <button type="button" aria-pressed=${offOn ? 'true' : 'false'}
              class=${tagBtnCls(offOn, 'bg-amber-500/20 text-amber-300')}
              onClick=${() => toggleAbdTag('offensive')}>
              Offensive
            </button>
            <button type="button" aria-pressed=${defOn ? 'true' : 'false'}
              class=${`border-l border-slate-700 ${tagBtnCls(defOn, 'bg-sky-500/20 text-sky-300')}`}
              onClick=${() => toggleAbdTag('defensive')}>
              Defensive
            </button>
          </div>
          <${SearchChips}
            draft=${AbdStore.draft}
            filters=${AbdStore.filters}
            placeholder="Search ability, effect, Pokémon… (Enter to add)"
            onDraft=${setAbdDraft}
            onCommit=${commitAbdFilter}
            onRemove=${removeAbdFilter}
            onClear=${clearAbdFilters}
            suggest=${abdSuggest}
            onPick=${commitAbdValue}
            hideChips=${['offensive', 'defensive']} />
        </div>
      </div>

      <!-- Rows: grid table on sm+, stacked cards on mobile. Both live under the
           same ref so the lazy-row observer tracks whichever layout is visible. -->
      <div ref=${rowsRef}>
        <!-- Desktop: horizontally-scrollable grid table -->
        <div class="hidden sm:block overflow-x-auto">
          <div class="min-w-[520px]">
            <!-- Header row -->
            <div class="grid grid-cols-[minmax(160px,1.6fr)_56px_minmax(240px,3fr)] items-center gap-2 px-3 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <span class="text-left">Ability</span>
              <span class="text-left">Tag</span>
              <span class="text-left">Effect</span>
            </div>
            <!-- Data rows -->
            <div class="flex flex-col">
              ${sorted.map((row) => html`<${AbilityRow} key=${row.apiName} row=${row} />`)}
            </div>
          </div>
        </div>

        <!-- Mobile: stacked cards (no horizontal scroll) -->
        <div class="sm:hidden flex flex-col gap-2">
          ${sorted.map((row) => html`<${AbilityCard} key=${`card-${row.apiName}`} row=${row} />`)}
        </div>

        ${
          sorted.length === 0 &&
          html`<div class="px-3 py-8 text-center text-xs text-slate-500">No abilities match ${terms.map((t, i) => html`${i > 0 ? ' + ' : ''}“${t}”`)}.</div>`
        }
      </div>

    </section>`;
}
